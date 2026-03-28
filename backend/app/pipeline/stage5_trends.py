"""Stage 5: Cross-week trend analysis.

Compares current week's synthesis with prior weeks to detect
trajectory changes, emerging/declining themes, and inflection points.
Only runs when >= 2 weeks of data exist.
"""

from __future__ import annotations

import logging
from pathlib import Path

from ..claude_client import ClaudeClient
from .schemas import TREND_ANALYSIS_SCHEMA
from .utils import save_atomic, load_json, now_iso

logger = logging.getLogger(__name__)

DATA_DIR = Path("data")


def analyze_trends(
    client: ClaudeClient,
    brand: dict,
    current_synthesis: dict,
    prior_syntheses: list[dict],
    output_dir: Path,
) -> dict | None:
    """Run Stage 5 trend analysis for a brand across all weeks.

    Args:
        client: Claude API client
        brand: Brand config dict
        current_synthesis: This week's Stage 4 output
        prior_syntheses: List of prior weeks' synthesis dicts (oldest first)
        output_dir: Directory for trend_data.json (data/trends/{brand_id}/)

    Returns the trend data dict, or None if insufficient data.
    """
    brand_id = brand["brand_id"]
    brand_name = brand["brand_name"]

    # Need at least 2 weeks (current + 1 prior)
    all_syntheses = prior_syntheses + [current_synthesis]
    if len(all_syntheses) < 2:
        logger.info(f"  Stage 5 skip (< 2 weeks): {brand_id}")
        return None

    output_path = output_dir / "trend_data.json"

    # Build score history with EWMA smoothing
    score_history = []
    for s in all_syntheses:
        score_history.append({
            "date": s.get("snapshot_date", ""),
            "score": s.get("undercurrent_score", 0),
            "status": s.get("status_tag", "stable"),
        })

    # Apply exponential weighted moving average for smoothed scores
    _apply_smoothing(score_history)

    # Build themes history for the LLM
    themes_by_week = []
    for s in all_syntheses:
        date = s.get("snapshot_date", "?")
        narrative = s.get("narrative_summary", "")
        score = s.get("undercurrent_score", 0)
        status = s.get("status_tag", "stable")
        alignment = s.get("community_alignment", {})
        themes_by_week.append(
            f"Week {date} (score: {score}, status: {status}):\n"
            f"  Narrative: {narrative[:500]}\n"
            f"  Aligned values: {', '.join(alignment.get('aligned_values', []))}\n"
            f"  Friction points: {', '.join(alignment.get('friction_points', []))}\n"
        )

    system_prompt = (
        f"You are analyzing multi-week trends for {brand_name} across Reddit.\n\n"
        f"Score history ({len(score_history)} weeks):\n"
        + "\n".join(
            f"  {h['date']}: score={h['score']}, status={h['status']}"
            for h in score_history
        )
        + "\n\n"
        f"Analyze the trajectory and identify:\n"
        f"1. trajectory: overall direction (improving, stable, declining, volatile)\n"
        f"2. narrative_delta: 1-2 sentences on the single most important shift "
        f"this week. Name the score change, theme, or sentiment shift. No preamble. "
        f"This content appears in a dashboard UI where space is limited. "
        f"Conciseness is critical.\n"
        f"3. emerging_themes: new themes gaining momentum (with first_seen date "
        f"and growth_rate)\n"
        f"4. declining_themes: themes losing momentum (with peak date and trend)\n"
        f"5. inflection_points: significant shifts in perception (with dates "
        f"and descriptions)\n\n"
        f"Be specific about what drives changes. Reference actual score movements."
    )

    user_content = "Weekly synthesis data:\n\n" + "\n---\n".join(themes_by_week)

    try:
        result = client.analyze(
            system=system_prompt,
            user_content=user_content,
            output_schema=TREND_ANALYSIS_SCHEMA,
            max_tokens=4096,
            stage=f"stage5_trends_{brand_id}",
        )
    except Exception as e:
        logger.error(f"  Stage 5 error for {brand_id}: {e}")
        return None

    # Load existing annotations (user-provided markers)
    existing_trend = load_json(output_path)
    annotations = []
    if existing_trend:
        annotations = existing_trend.get("annotations", [])

    trend_data = {
        "brand_id": brand_id,
        "generated_at": now_iso(),
        "score_history": score_history,
        "trajectory": result.get("trajectory", "stable"),
        "narrative_delta": result.get("narrative_delta", ""),
        "emerging_themes": result.get("emerging_themes", []),
        "declining_themes": result.get("declining_themes", []),
        "inflection_points": result.get("inflection_points", []),
        "annotations": annotations,
    }

    save_atomic(output_path, trend_data)
    logger.info(
        f"  Stage 5 done: {brand_id} — "
        f"trajectory={result.get('trajectory', '?')}, "
        f"{len(score_history)} weeks"
    )
    return trend_data


def load_prior_syntheses(
    brand_id: str,
    subreddits: list[str],
    current_date: str,
    snapshots_dir: Path,
    weeks: int = 12,
) -> list[dict]:
    """Load synthesis data from prior weeks for a brand.

    Aggregates scores across subreddits by averaging.
    Returns list sorted oldest-first.
    """
    import os

    if not snapshots_dir.exists():
        return []

    # Find all snapshot date directories
    date_dirs = sorted(
        [d.name for d in snapshots_dir.iterdir() if d.is_dir() and d.name != current_date],
    )

    # Take the most recent N weeks
    date_dirs = date_dirs[-weeks:]

    prior = []
    for date_str in date_dirs:
        scores = []
        narratives = []
        status_tags = []
        all_aligned = []
        all_friction = []

        for sub in subreddits:
            synth_path = (
                snapshots_dir / date_str / f"r_{sub}" / "brands"
                / brand_id / "synthesis.json"
            )
            data = load_json(synth_path)
            if data:
                scores.append(data.get("undercurrent_score", 0))
                narratives.append(data.get("narrative_summary", ""))
                status_tags.append(data.get("status_tag", "stable"))
                alignment = data.get("community_alignment", {})
                all_aligned.extend(alignment.get("aligned_values", []))
                all_friction.extend(alignment.get("friction_points", []))

        if scores:
            avg_score = round(sum(scores) / len(scores))
            # Pick most common status tag
            status = max(set(status_tags), key=status_tags.count) if status_tags else "stable"
            prior.append({
                "snapshot_date": date_str,
                "undercurrent_score": avg_score,
                "status_tag": status,
                "narrative_summary": narratives[0] if narratives else "",
                "community_alignment": {
                    "aligned_values": list(set(all_aligned))[:6],
                    "friction_points": list(set(all_friction))[:6],
                },
            })

    return prior


def _apply_smoothing(score_history: list[dict], alpha: float = 0.3) -> None:
    """Apply exponential weighted moving average (EWMA) smoothing in-place.

    Adds a 'smoothed_score' field to each entry. For weeks with very few
    mentions (data_quality.mention_count < 5), applies extra dampening
    by pulling toward 50 (neutral).

    Args:
        score_history: List of score dicts (modified in place)
        alpha: Smoothing factor (0-1). Higher = more responsive to recent data.
    """
    if not score_history:
        return

    # First point: smoothed = raw
    score_history[0]["smoothed_score"] = score_history[0]["score"]

    for i in range(1, len(score_history)):
        prev_smoothed = score_history[i - 1]["smoothed_score"]
        raw = score_history[i]["score"]

        # EWMA: smoothed = alpha * raw + (1 - alpha) * previous_smoothed
        smoothed = round(alpha * raw + (1 - alpha) * prev_smoothed)
        score_history[i]["smoothed_score"] = max(0, min(100, smoothed))
