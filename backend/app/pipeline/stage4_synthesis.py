"""Stage 4: Narrative synthesis and Undercurrent Score computation.

Combines computed numerical components (sentiment_mix, intensity) with
LLM-assessed components (trajectory, community_alignment) to produce
the composite Undercurrent Score and rich narrative.

Stage 4a: Compute numerical score components in code
Stage 4b: LLM synthesis (narrative + trajectory + community_alignment)
Stage 4c: Compute final composite score in code
"""

from __future__ import annotations

import logging
from pathlib import Path

from ..claude_client import ClaudeClient
from .schemas import SYNTHESIS_LLM_SCHEMA
from .utils import save_atomic, load_json

logger = logging.getLogger(__name__)

# Score component weights
WEIGHT_SENTIMENT_MIX = 0.40
WEIGHT_INTENSITY = 0.20
WEIGHT_TRAJECTORY = 0.15
WEIGHT_COMMUNITY_ALIGNMENT = 0.25


def synthesize_brand(
    client: ClaudeClient,
    deep_analysis: dict,
    classification: dict,
    brand: dict,
    subreddit: str,
    snapshot_date: str,
    output_dir: Path,
    community_profile: dict | None = None,
) -> dict:
    """Run Stage 4 synthesis for a single brand × subreddit.

    Returns the synthesis data dict and saves to synthesis.json.
    """
    output_path = output_dir / "synthesis.json"

    existing = load_json(output_path)
    if existing is not None:
        logger.info(f"  Stage 4 skip (exists): {brand['brand_id']} in r/{subreddit}")
        return existing

    brand_id = brand["brand_id"]
    brand_name = brand["brand_name"]

    analyzed = deep_analysis.get("analyzed_mentions", [])
    if not analyzed:
        empty = _empty_synthesis(brand_id, snapshot_date, subreddit)
        save_atomic(output_path, empty)
        return empty

    # ── Stage 4a: Compute numerical components ─────────────────────────
    sentiment_mix = _compute_sentiment_mix(deep_analysis, classification)
    intensity = _compute_intensity(deep_analysis)

    # ── Stage 4b: LLM synthesis ────────────────────────────────────────
    community_ctx = ""
    if community_profile:
        values = community_profile.get("values_celebrated", [])
        frictions = community_profile.get("friction_points", [])
        tone = community_profile.get("dominant_tone", "")
        if values or frictions:
            community_ctx = (
                f"\nCommunity profile for r/{subreddit}:\n"
                f"- Values celebrated: {', '.join(values[:5])}\n"
                f"- Friction points: {', '.join(frictions[:5])}\n"
                f"- Dominant tone: {tone}\n"
            )

    # Build a summary of analyzed mentions for the LLM
    mention_summaries = []
    for m in analyzed[:30]:  # Cap at 30 for context window
        mention_summaries.append(
            f"- [{m.get('sentiment', 'neutral')}] (intensity: {m.get('intensity', 5)}) "
            f"{m.get('context_summary', '')}"
        )

    themes_summary = ""
    for t in deep_analysis.get("top_themes", [])[:10]:
        themes_summary += (
            f"- {t['theme']}: {t.get('count', 0)} mentions, "
            f"avg sentiment {t.get('avg_sentiment', 0)}\n"
        )

    dist = deep_analysis.get("sentiment_distribution", {})
    avg_intensity = deep_analysis.get("average_intensity", 5)

    # Key evidence posts from classification (top upvoted mentions)
    top_mentions = sorted(
        classification.get("mentions", []),
        key=lambda m: m.get("upvotes", 0),
        reverse=True,
    )[:10]

    evidence_ctx = ""
    for m in top_mentions:
        url = m.get("source_url", "")
        title = m.get("parent_post_title", m.get("text_excerpt", "")[:80])
        upvotes = m.get("upvotes", 0)
        evidence_ctx += f"- [{upvotes} upvotes] {title} — {url}\n"

    system_prompt = (
        f"You are synthesizing a brand intelligence report for {brand_name} "
        f"in r/{subreddit}.\n"
        f"{community_ctx}\n"
        f"Pre-computed metrics:\n"
        f"- Sentiment mix score: {sentiment_mix}/100 "
        f"(distribution: {dist.get('positive', 0):.0%} pos, "
        f"{dist.get('neutral', 0):.0%} neutral, "
        f"{dist.get('negative', 0):.0%} neg, "
        f"{dist.get('mixed', 0):.0%} mixed)\n"
        f"- Intensity score: {intensity}/100 "
        f"(avg intensity: {avg_intensity}/10)\n"
        f"- Total relevant mentions: {len(analyzed)}\n\n"
        f"Top themes:\n{themes_summary}\n"
        f"Top evidence posts:\n{evidence_ctx}\n"
        f"Mention summaries:\n" + "\n".join(mention_summaries) + "\n\n"
        f"Generate:\n"
        f"1. narrative_summary: 2-3 paragraph rich narrative about this brand's "
        f"standing in this community. Be specific and insightful.\n"
        f"2. trajectory: 0-100 score for the brand's trajectory direction "
        f"(70-100 = improving, 50-69 = stable/slightly positive, "
        f"30-49 = stable/slightly negative, 0-29 = declining)\n"
        f"3. community_alignment_score: 0-100 for how well the brand aligns "
        f"with this community's values "
        f"(80-100 = strong alignment, 60-79 = mostly aligned, "
        f"40-59 = mixed, 20-39 = poor, 0-19 = severe misalignment)\n"
        f"4. status_tag: overall status assessment\n"
        f"5. aligned_values: list of brand attributes that resonate\n"
        f"6. friction_points: list of areas of conflict\n"
        f"7. key_evidence_posts: 3-5 most notable posts with explanations"
    )

    try:
        llm_result = client.analyze(
            system=system_prompt,
            user_content=(
                f"Synthesize the brand intelligence report for {brand_name} "
                f"in r/{subreddit} for the week of {snapshot_date}."
            ),
            output_schema=SYNTHESIS_LLM_SCHEMA,
            max_tokens=4096,
            stage=f"stage4_synthesis_{brand_id}",
        )
    except Exception as e:
        logger.error(f"  Stage 4 LLM error for {brand_id}: {e}")
        empty = _empty_synthesis(brand_id, snapshot_date, subreddit)
        save_atomic(output_path, empty)
        return empty

    # ── Stage 4c: Compute final composite score ────────────────────────
    trajectory = max(0, min(100, llm_result.get("trajectory", 50)))
    community_alignment = max(0, min(100, llm_result.get("community_alignment_score", 50)))

    composite_score = round(
        sentiment_mix * WEIGHT_SENTIMENT_MIX
        + intensity * WEIGHT_INTENSITY
        + trajectory * WEIGHT_TRAJECTORY
        + community_alignment * WEIGHT_COMMUNITY_ALIGNMENT
    )
    composite_score = max(0, min(100, composite_score))

    synthesis = {
        "brand_id": brand_id,
        "snapshot_date": snapshot_date,
        "subreddit": subreddit,
        "undercurrent_score": composite_score,
        "score_components": {
            "sentiment_mix": sentiment_mix,
            "intensity": intensity,
            "trajectory": trajectory,
            "community_alignment": community_alignment,
        },
        "status_tag": llm_result.get("status_tag", "stable"),
        "narrative_summary": llm_result.get("narrative_summary", ""),
        "community_alignment": {
            "aligned_values": llm_result.get("aligned_values", []),
            "friction_points": llm_result.get("friction_points", []),
        },
        "key_evidence_posts": llm_result.get("key_evidence_posts", []),
    }

    save_atomic(output_path, synthesis)
    logger.info(
        f"  Stage 4 done: {brand_id} in r/{subreddit} — "
        f"score={composite_score} ({llm_result.get('status_tag', '?')})"
    )
    return synthesis


def _compute_sentiment_mix(deep_analysis: dict, classification: dict) -> int:
    """Compute sentiment_mix (0-100) from deep analysis sentiment distribution.

    Formula: ((positive_ratio - negative_ratio + 1) / 2) * 100
    Weighted by upvotes when available.
    """
    mentions = deep_analysis.get("analyzed_mentions", [])
    if not mentions:
        return 50  # Neutral default

    # Build upvote lookup from classification
    upvote_lookup = {}
    for m in classification.get("mentions", []):
        upvote_lookup[m.get("source_id", "")] = max(m.get("upvotes", 1), 1)

    weighted_positive = 0.0
    weighted_negative = 0.0
    total_weight = 0.0

    for m in mentions:
        weight = upvote_lookup.get(m.get("mention_id", ""), 1)
        total_weight += weight
        sentiment = m.get("sentiment", "neutral")
        if sentiment == "positive":
            weighted_positive += weight
        elif sentiment == "negative":
            weighted_negative += weight
        elif sentiment == "mixed":
            weighted_positive += weight * 0.3
            weighted_negative += weight * 0.3

    if total_weight == 0:
        return 50

    pos_ratio = weighted_positive / total_weight
    neg_ratio = weighted_negative / total_weight
    score = ((pos_ratio - neg_ratio + 1) / 2) * 100
    return max(0, min(100, round(score)))


def _compute_intensity(deep_analysis: dict) -> int:
    """Compute intensity (0-100) from average intensity scores.

    Formula: (average_intensity / 10) * 100
    """
    avg = deep_analysis.get("average_intensity", 5)
    return max(0, min(100, round((avg / 10) * 100)))


def _empty_synthesis(brand_id: str, date: str, subreddit: str) -> dict:
    return {
        "brand_id": brand_id,
        "snapshot_date": date,
        "subreddit": subreddit,
        "undercurrent_score": 0,
        "score_components": {
            "sentiment_mix": 50,
            "intensity": 0,
            "trajectory": 50,
            "community_alignment": 50,
        },
        "status_tag": "stable",
        "narrative_summary": "",
        "community_alignment": {
            "aligned_values": [],
            "friction_points": [],
        },
        "key_evidence_posts": [],
    }
