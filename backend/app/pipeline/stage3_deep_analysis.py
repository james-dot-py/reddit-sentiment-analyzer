"""Stage 3: Deep sentiment and thematic analysis via Claude Sonnet.

Takes relevant mentions (relevance >= 0.5) from Stage 2 and performs
nuanced sentiment analysis with emotional granularity.
"""

from __future__ import annotations

import logging
from pathlib import Path

from ..claude_client import ClaudeClient
from .schemas import DEEP_ANALYSIS_SCHEMA
from .utils import batch_by_tokens, save_atomic, load_json

logger = logging.getLogger(__name__)


def analyze_mentions_deeply(
    client: ClaudeClient,
    classification: dict,
    brand: dict,
    subreddit: str,
    snapshot_date: str,
    output_dir: Path,
    community_profile: dict | None = None,
) -> dict:
    """Run Stage 3 deep analysis on filtered mentions.

    Returns the deep_analysis data dict and saves to deep_analysis.json.
    """
    output_path = output_dir / "deep_analysis.json"

    existing = load_json(output_path)
    if existing is not None:
        logger.info(f"  Stage 3 skip (exists): {brand['brand_id']} in r/{subreddit}")
        return existing

    brand_id = brand["brand_id"]
    brand_name = brand["brand_name"]

    # Only analyze mentions with relevance >= 0.5
    mentions = [
        m for m in classification.get("mentions", [])
        if m.get("relevance_score", 0) >= 0.5
    ]

    if not mentions:
        empty = _empty_deep_analysis(brand_id, snapshot_date, subreddit)
        save_atomic(output_path, empty)
        return empty

    # Build community values context
    community_ctx = ""
    if community_profile:
        values = community_profile.get("values_celebrated", [])
        frictions = community_profile.get("friction_points", [])
        if values or frictions:
            community_ctx = (
                f"\nThis community's values:\n"
                f"- Celebrates: {', '.join(values[:4])}\n"
                f"- Friction points: {', '.join(frictions[:4])}\n"
            )

    system_prompt = (
        f"You are performing deep sentiment analysis on Reddit mentions of "
        f"{brand_name} from r/{subreddit}.\n"
        f"{community_ctx}\n"
        f"For each mention, analyze:\n"
        f"1. sentiment: positive, negative, neutral, or mixed\n"
        f"2. sentiment_granular: specific emotional stance (e.g., "
        f"\"disappointed_loyal_customer\", \"enthusiastic_new_convert\", "
        f"\"sarcastic_criticism\", \"defensive_of_brand\")\n"
        f"3. emotion: dominant emotion (frustration, delight, indifference, "
        f"anger, humor, nostalgia, etc.)\n"
        f"4. intensity: 1-10 scale of how strongly the person feels\n"
        f"5. themes: what specific aspects are being discussed\n"
        f"6. context_summary: under 10 words — the key takeaway from this mention. "
        f"A fragment is fine — no need for a full sentence.\n\n"
        f"Be alert for sarcasm, irony, Reddit-specific humor, and context that "
        f"reverses surface-level sentiment.\n\n"
        f"Also identify the top recurring themes across all mentions, with counts "
        f"and average sentiment scores (-1 to 1 scale).\n"
        f"For each theme, also estimate a velocity score (-1.0 to 1.0) indicating "
        f"whether this theme is growing (+1), stable (0), or shrinking (-1) "
        f"compared to typical discussion patterns."
    )

    # Batch mentions for Sonnet: ~4000 tokens, max 20
    mention_items = [
        {
            "mention_id": m.get("source_id", f"m_{i}"),
            "text": m.get("text_excerpt", ""),
            "topic": m.get("topic_cluster", ""),
            "upvotes": m.get("upvotes", 0),
        }
        for i, m in enumerate(mentions)
    ]

    batches = batch_by_tokens(mention_items, text_key="text", target_tokens=4000, max_items=20)

    all_analyzed: list[dict] = []
    all_themes: dict[str, list[float]] = {}
    all_theme_velocities: dict[str, float] = {}

    for i, batch in enumerate(batches):
        user_content = f"Batch {i + 1}/{len(batches)} — {len(batch)} mentions:\n\n"
        for item in batch:
            user_content += (
                f"[{item['mention_id']}] (topic: {item['topic']}, "
                f"upvotes: {item['upvotes']})\n{item['text']}\n\n"
            )

        try:
            result = client.analyze(
                system=system_prompt,
                user_content=user_content,
                output_schema=DEEP_ANALYSIS_SCHEMA,
                stage=f"stage3_deep_{brand_id}_batch{i+1}",
            )
            batch_analyzed = result.get("analyzed_mentions", [])
            all_analyzed.extend(batch_analyzed)

            # Accumulate themes
            for theme in result.get("top_themes", []):
                name = theme.get("theme", "")
                score = theme.get("avg_sentiment_score", 0)
                if name:
                    all_themes.setdefault(name, []).append(score)
                    # Keep the latest velocity estimate for each theme
                    velocity = theme.get("velocity", 0.0)
                    if name not in all_theme_velocities:
                        all_theme_velocities[name] = velocity
        except Exception as e:
            logger.error(f"  Stage 3 batch {i+1} error for {brand_id}: {e}")
            continue

    # Compute aggregates
    sentiment_counts = {"positive": 0, "neutral": 0, "negative": 0, "mixed": 0}
    intensities = []
    for m in all_analyzed:
        s = m.get("sentiment", "neutral")
        sentiment_counts[s] = sentiment_counts.get(s, 0) + 1
        intensities.append(m.get("intensity", 5))

    total = max(len(all_analyzed), 1)
    sentiment_distribution = {
        k: round(v / total, 3) for k, v in sentiment_counts.items()
    }
    avg_intensity = round(sum(intensities) / max(len(intensities), 1), 1)

    # Merge themes across batches
    top_themes = []
    for theme_name, scores in sorted(all_themes.items(), key=lambda x: len(x[1]), reverse=True):
        top_themes.append({
            "theme": theme_name,
            "count": len(scores),
            "avg_sentiment": round(sum(scores) / max(len(scores), 1), 2),
            "velocity": all_theme_velocities.get(theme_name, 0.0),
        })

    deep_analysis = {
        "brand_id": brand_id,
        "snapshot_date": snapshot_date,
        "subreddit": subreddit,
        "analyzed_mentions": all_analyzed,
        "sentiment_distribution": sentiment_distribution,
        "average_intensity": avg_intensity,
        "top_themes": top_themes[:15],
    }

    save_atomic(output_path, deep_analysis)
    logger.info(
        f"  Stage 3 done: {brand_id} in r/{subreddit} — "
        f"{len(all_analyzed)} analyzed ({len(batches)} batches)"
    )
    return deep_analysis


def _empty_deep_analysis(brand_id: str, date: str, subreddit: str) -> dict:
    return {
        "brand_id": brand_id,
        "snapshot_date": date,
        "subreddit": subreddit,
        "analyzed_mentions": [],
        "sentiment_distribution": {"positive": 0, "neutral": 0, "negative": 0, "mixed": 0},
        "average_intensity": 0,
        "top_themes": [],
    }
