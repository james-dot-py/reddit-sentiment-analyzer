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
        f"1. narrative_headline: 1-2 sentences (max 40 words) capturing the "
        f"single most important takeaway. Lead with the insight, not preamble.\n"
        f"2. narrative_signals: 3-5 bullet points (10-20 words each) highlighting "
        f"specific signals — sentiment shifts, volume spikes, emerging themes, "
        f"anomalies. Reference actual numbers.\n"
        f"3. narrative_deep_dive: 2 short paragraphs (3-4 sentences each, "
        f"~50-75 words per paragraph). Connect the dots between the signals. "
        f"Explain *why* things are shifting and flag anything that warrants "
        f"attention.\n"
        f"4. trajectory: 0-100 score for the brand's trajectory direction "
        f"(70-100 = improving, 50-69 = stable/slightly positive, "
        f"30-49 = stable/slightly negative, 0-29 = declining)\n"
        f"5. community_alignment_score: 0-100 for how well the brand aligns "
        f"with this community's values "
        f"(80-100 = strong alignment, 60-79 = mostly aligned, "
        f"40-59 = mixed, 20-39 = poor, 0-19 = severe misalignment)\n"
        f"6. status_tag: overall status assessment\n"
        f"7. aligned_values: list of brand attributes that resonate\n"
        f"8. friction_points: list of areas of conflict\n"
        f"9. key_evidence_posts: 3-5 most notable posts. For 'why_notable', "
        f"write max 15 words — e.g. 'Loyal user switching to competitor "
        f"after 3 years'. No academic language. Include 'sentiment_label' "
        f"(positive/negative/neutral) reflecting overall post sentiment.\n\n"
        f"10. blunt_verdict: single sentence, MAXIMUM 15 words. Brutally honest, "
        f"no hedging, no metaphors. Example: 'Loyal users are defecting and "
        f"counterfeits are accelerating the exodus.'\n"
        f"11. findings: exactly 3-4 ranked findings (not more). For each:\n"
        f"  - severity: critical (immediate threat), elevated (emerging concern), "
        f"or monitor (worth watching)\n"
        f"  - category: product_issue, trust_issue, channel_risk, or trend_signal\n"
        f"  - text: max 25 words, specific and actionable. Must be DISTINCT from "
        f"the blunt_verdict — provide new information.\n"
        f"  - mention_count: approximate number of mentions supporting this finding\n"
        f"12. section_verdicts: one 'so what' sentence each (max 20 words), for:\n"
        f"  - theme_map: what the theme distribution means\n"
        f"  - competitive: positioning assessment\n"
        f"  - evidence: what the evidence pattern reveals\n"
        f"  - narrative: overall intelligence verdict\n"
        f"13. friction_point_details: enhanced version of friction_points (max 6). "
        f"Each: text (max 8 words), mention_count, trend (rising/stable/declining), "
        f"category (product/trust/channel)\n"
        f"14. aligned_value_details: same structure as friction_point_details (max 6)\n\n"
        f"IMPORTANT: narrative_deep_dive must NOT repeat the blunt_verdict or findings. "
        f"It should provide context, causation, and forward-looking assessment only. "
        f"Max 100 words total for narrative_deep_dive.\n\n"
        f"This content appears in a dashboard UI where space is limited. "
        f"Conciseness is critical."
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

    # ── Confidence assessment ───────────────────────────────────────────
    mention_count = len(analyzed)
    total_posts_scanned = len(classification.get("mentions", []))
    if mention_count >= 30:
        confidence_level = "high"
        confidence_note = f"Based on {mention_count} relevant mentions — statistically robust."
    elif mention_count >= 10:
        confidence_level = "moderate"
        confidence_note = f"Based on {mention_count} mentions — directionally reliable."
    else:
        confidence_level = "low"
        confidence_note = f"Based on {mention_count} mentions — interpret directionally."

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
        "data_quality": {
            "mention_count": mention_count,
            "total_posts_scanned": total_posts_scanned,
            "confidence_level": confidence_level,
            "confidence_note": confidence_note,
        },
        "status_tag": llm_result.get("status_tag", "stable"),
        "narrative_headline": llm_result.get("narrative_headline", ""),
        "narrative_signals": llm_result.get("narrative_signals", []),
        "narrative_deep_dive": llm_result.get("narrative_deep_dive", ""),
        "narrative_summary": (
            llm_result.get("narrative_headline", "") + "\n\n"
            + "\n".join(f"- {s}" for s in llm_result.get("narrative_signals", [])) + "\n\n"
            + llm_result.get("narrative_deep_dive", "")
        ),
        "community_alignment": {
            "aligned_values": llm_result.get("aligned_values", []),
            "friction_points": llm_result.get("friction_points", []),
        },
        "key_evidence_posts": [
            {**p, "subreddit": subreddit}
            for p in llm_result.get("key_evidence_posts", [])
        ],
        # v2 additions
        "blunt_verdict": llm_result.get("blunt_verdict", ""),
        "findings": llm_result.get("findings", []),
        "section_verdicts": llm_result.get("section_verdicts", {}),
        "friction_point_details": llm_result.get("friction_point_details", []),
        "aligned_value_details": llm_result.get("aligned_value_details", []),
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
        "narrative_headline": "",
        "narrative_signals": [],
        "narrative_deep_dive": "",
        "narrative_summary": "",
        "community_alignment": {
            "aligned_values": [],
            "friction_points": [],
        },
        "key_evidence_posts": [],
        "blunt_verdict": "",
        "findings": [],
        "section_verdicts": {},
        "friction_point_details": [],
        "aligned_value_details": [],
    }
