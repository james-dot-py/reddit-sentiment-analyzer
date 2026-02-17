"""Summary generation — Gemini-powered with template fallback."""

from __future__ import annotations

import logging
import os
from typing import Optional

from .models import (
    SubredditSentimentSummary,
    NLPInsights,
    SentimentLabel,
    PostWithSentiment,
    CommentWithSentiment,
    TribalClass,
    TribalTopic,
)

logger = logging.getLogger(__name__)

# ── Gemini configuration ─────────────────────────────────────────────────

GEMINI_SYSTEM_PROMPT = """\
You are the editorial voice of a data-journalism tool that decodes online communities.

Your job: take structured analysis data about a Reddit community and write a rich,
insightful synthesis that reveals what this community celebrates, rejects, and
disagrees on.

Voice & tone:
- Sophisticated but approachable — think sharp data journalism for a curious general audience
- Smart, slightly playful, never academic or dry
- No buzzwords, no filler, no "it's important to note" or "in conclusion"
- Focus on MEANING and INTERPRETATION — skip raw stat dumps, post counts, and entity lists
- Surface NON-OBVIOUS insights — don't just restate the data; interpret it
- Connect value patterns to broader human behavior when you can
- Bold claims are fine if the data supports them

Structure:
- Open with 3-5 bullet points (using `- `) highlighting the most interesting interpretive
  takeaways. These should be genuine insights, not raw statistics. Think: "This community
  rallies hardest around X despite being broadly negative" not "37% positive, 63% negative."
- Follow with 2-3 paragraphs of flowing editorial prose that goes deeper into the patterns,
  connections, and surprises in the data.

Length: ~250-400 words total (bullets + prose).

Use **bold** for topic names and key phrases.
Do NOT start with "This community" — find a more compelling opening.
"""


def _build_gemini_prompt(
    subreddit_names: list[str],
    summaries: list[SubredditSentimentSummary],
    posts: list[PostWithSentiment],
    comments: list[CommentWithSentiment],
    insights: NLPInsights,
    tribal_topics: Optional[list[TribalTopic]] = None,
    ratioed_count: int = 0,
) -> str:
    """Build the user prompt with structured data for Gemini."""
    sub_str = ", ".join(f"r/{s}" for s in subreddit_names)
    total_posts = sum(s.post_count for s in summaries)
    total_comments = sum(s.comment_count for s in summaries)

    overall_scores = [p.sentiment.compound_score for p in posts]
    overall_mean = sum(overall_scores) / max(len(overall_scores), 1)

    lines = [
        f"Community: {sub_str}",
        f"Dataset: {total_posts} posts, {total_comments} comments",
        f"Overall sentiment: mean={overall_mean:.3f}",
        "",
    ]

    # Per-subreddit stats
    for s in summaries:
        lines.append(f"r/{s.subreddit}: posts={s.post_count}, comments={s.comment_count}, "
                      f"mean_sentiment={s.post_stats.mean:.3f}, "
                      f"positive={s.post_stats.positive_pct:.1f}%, "
                      f"neutral={s.post_stats.neutral_pct:.1f}%, "
                      f"negative={s.post_stats.negative_pct:.1f}%")

    # Top entities
    if insights.entities:
        top = insights.entities[:8]
        lines.append("")
        lines.append("Top entities: " + ", ".join(f"{e.text} ({e.label}, {e.count}x)" for e in top))

    # Top bigrams
    if insights.bigrams:
        top = insights.bigrams[:8]
        lines.append("Top phrases: " + ", ".join(f'"{b.text}" ({b.count}x)' for b in top))

    # Text stats
    stats = insights.text_stats
    lines.append(f"Avg post length: {stats.avg_post_length:.0f} words, "
                 f"reading level: grade {stats.reading_level:.1f}, "
                 f"vocabulary richness: {stats.vocabulary_richness:.3f}")

    # Tribal analysis
    if tribal_topics:
        sacred = [t for t in tribal_topics if t.tribal_class == TribalClass.sacred]
        blasphemous = [t for t in tribal_topics if t.tribal_class == TribalClass.blasphemous]
        controversial = [t for t in tribal_topics if t.tribal_class == TribalClass.controversial]

        if sacred:
            lines.append("")
            lines.append("CELEBRATED topics (high positive consensus):")
            for t in sacred[:5]:
                lines.append(f"  - {t.topic}: mean={t.mean_sentiment:+.3f}, "
                             f"mentions={t.mention_count}, std={t.std_dev:.3f}")

        if blasphemous:
            lines.append("REJECTED topics (high negative consensus):")
            for t in blasphemous[:5]:
                lines.append(f"  - {t.topic}: mean={t.mean_sentiment:+.3f}, "
                             f"mentions={t.mention_count}, std={t.std_dev:.3f}")

        if controversial:
            lines.append("DIVISIVE topics (high disagreement):")
            for t in controversial[:5]:
                lines.append(f"  - {t.topic}: mean={t.mean_sentiment:+.3f}, "
                             f"mentions={t.mention_count}, std={t.std_dev:.3f}")

        if ratioed_count:
            lines.append(f"\n{ratioed_count} ratioed posts (poster vs community sentiment mismatch)")

    # Sample post titles by tribal class
    if tribal_topics:
        for cls_name, cls_val in [("Celebrated", TribalClass.sacred), ("Rejected", TribalClass.blasphemous)]:
            cls_topics = [t for t in tribal_topics if t.tribal_class == cls_val]
            if cls_topics and cls_topics[0].sample_texts:
                lines.append(f"\nSample {cls_name} content:")
                for txt in cls_topics[0].sample_texts[:3]:
                    lines.append(f'  "{txt[:120]}"')

    return "\n".join(lines)


def _call_gemini(system_prompt: str, user_prompt: str) -> Optional[str]:
    """Call Gemini API. Returns generated text or None on failure."""
    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        logger.info("GEMINI_API_KEY not set — falling back to template summary")
        return None

    try:
        import google.generativeai as genai
        genai.configure(api_key=api_key)
        model = genai.GenerativeModel(
            "gemini-2.0-flash",
            system_instruction=system_prompt,
        )
        response = model.generate_content(
            user_prompt,
            generation_config=genai.types.GenerationConfig(
                temperature=0.7,
                max_output_tokens=800,
            ),
        )
        text = response.text.strip()
        if text:
            return text
        logger.warning("Gemini returned empty response")
        return None
    except Exception as e:
        logger.error(f"Gemini API call failed: {e}")
        return None


# ── Public API ────────────────────────────────────────────────────────────


def generate_summary(
    summaries: list[SubredditSentimentSummary],
    posts: list[PostWithSentiment],
    comments: list[CommentWithSentiment],
    insights: NLPInsights,
    tribal_topics: Optional[list[TribalTopic]] = None,
    ratioed_count: int = 0,
) -> str:
    """Generate an editorial synthesis — Gemini if available, else template."""
    subreddit_names = [s.subreddit for s in summaries]

    # Try Gemini first
    user_prompt = _build_gemini_prompt(
        subreddit_names, summaries, posts, comments, insights,
        tribal_topics, ratioed_count,
    )
    gemini_result = _call_gemini(GEMINI_SYSTEM_PROMPT, user_prompt)
    if gemini_result:
        return gemini_result

    # Fallback: template-based summary
    return _template_summary(summaries, posts, comments, insights)


def generate_tribal_narrative(
    topics: list[TribalTopic],
    ratioed_posts: list[PostWithSentiment],
) -> str:
    """Generate tribal narrative — Gemini if available, else template."""
    if not topics:
        return "Not enough data to identify tribal patterns in this community."

    # Try Gemini
    gemini_result = _gemini_tribal_narrative(topics, ratioed_posts)
    if gemini_result:
        return gemini_result

    # Fallback: template
    return _template_tribal_narrative(topics, ratioed_posts)


# ── Gemini tribal narrative ──────────────────────────────────────────────

TRIBAL_SYSTEM_PROMPT = """\
You are decoding the value structure of an online community. Given classified topics
(Celebrated, Rejected, Divisive), write 1-2 paragraphs that reveal what this
community celebrates and what it rejects.

Voice: Sharp, insightful data journalism. No headers, no bullets, flowing prose.
Use **bold** for topic names. Reference specific numbers. Surface the non-obvious.
Keep it under 150 words — dense and punchy.
"""


def _gemini_tribal_narrative(
    topics: list[TribalTopic],
    ratioed_posts: list[PostWithSentiment],
) -> Optional[str]:
    """Generate tribal narrative via Gemini."""
    sacred = [t for t in topics if t.tribal_class == TribalClass.sacred]
    blasphemous = [t for t in topics if t.tribal_class == TribalClass.blasphemous]
    controversial = [t for t in topics if t.tribal_class == TribalClass.controversial]

    lines = [f"Total topics classified: {len(topics)}", ""]

    if sacred:
        lines.append("CELEBRATED (community approves):")
        for t in sacred[:5]:
            lines.append(f"  {t.topic}: sentiment={t.mean_sentiment:+.3f}, "
                         f"mentions={t.mention_count}, consensus={t.consensus_score:.1f}")

    if blasphemous:
        lines.append("REJECTED (community disapproves):")
        for t in blasphemous[:5]:
            lines.append(f"  {t.topic}: sentiment={t.mean_sentiment:+.3f}, "
                         f"mentions={t.mention_count}")

    if controversial:
        lines.append("DIVISIVE (community split):")
        for t in controversial[:5]:
            lines.append(f"  {t.topic}: sentiment={t.mean_sentiment:+.3f}, "
                         f"std_dev={t.std_dev:.3f}, mentions={t.mention_count}")

    if ratioed_posts:
        lines.append(f"\n{len(ratioed_posts)} posts where the community's response "
                     f"diverged from the poster's sentiment.")

    return _call_gemini(TRIBAL_SYSTEM_PROMPT, "\n".join(lines))


# ── Template fallbacks ───────────────────────────────────────────────────


def _sentiment_descriptor(mean: float) -> str:
    if mean > 0.3:
        return "strongly positive"
    elif mean > 0.1:
        return "moderately positive"
    elif mean > -0.1:
        return "relatively neutral"
    elif mean > -0.3:
        return "moderately negative"
    else:
        return "strongly negative"


def _pct_fmt(v: float) -> str:
    return f"{v:.1f}%"


def _template_summary(
    summaries: list[SubredditSentimentSummary],
    posts: list[PostWithSentiment],
    comments: list[CommentWithSentiment],
    insights: NLPInsights,
) -> str:
    """Original template-based summary generation."""
    total_posts = sum(s.post_count for s in summaries)
    total_comments = sum(s.comment_count for s in summaries)
    subreddit_names = [s.subreddit for s in summaries]

    # Paragraph 1: Overview
    if len(subreddit_names) == 1:
        sub_str = f"r/{subreddit_names[0]}"
    else:
        sub_str = ", ".join(f"r/{s}" for s in subreddit_names[:-1]) + f" and r/{subreddit_names[-1]}"

    overall_scores = [p.sentiment.compound_score for p in posts]
    overall_mean = sum(overall_scores) / max(len(overall_scores), 1)
    desc = _sentiment_descriptor(overall_mean)

    para1 = (
        f"This analysis examined {total_posts} posts"
        + (f" and {total_comments} comments" if total_comments > 0 else "")
        + f" from {sub_str}. "
        f"The overall sentiment is {desc}, with a mean compound score of {overall_mean:.3f}. "
    )

    if summaries:
        s = summaries[0]
        stats = s.post_stats
        para1 += (
            f"Across all analyzed text, {_pct_fmt(stats.positive_pct)} was classified as positive, "
            f"{_pct_fmt(stats.neutral_pct)} as neutral, and {_pct_fmt(stats.negative_pct)} as negative."
        )

    # Paragraph 2: Key themes
    para2_parts = []
    if insights.entities:
        top_entities = insights.entities[:5]
        entity_strs = [f"{e.text} ({e.label})" for e in top_entities]
        para2_parts.append(
            f"The most frequently mentioned entities include {', '.join(entity_strs)}."
        )

    if insights.bigrams:
        top_bigrams = [b.text for b in insights.bigrams[:5]]
        joined = '", "'.join(top_bigrams)
        para2_parts.append(
            f'Common two-word phrases include "{joined}".'
        )

    stats = insights.text_stats
    para2_parts.append(
        f"Posts average {stats.avg_post_length:.0f} words in length, "
        f"with a vocabulary richness (type-token ratio) of {stats.vocabulary_richness:.3f} "
        f"and an estimated Flesch-Kincaid reading level of grade {stats.reading_level:.1f}."
    )

    para2 = " ".join(para2_parts)

    # Paragraph 3: Comparison or polarization
    para3 = ""
    if len(summaries) > 1:
        sorted_subs = sorted(summaries, key=lambda s: s.post_stats.mean, reverse=True)
        most_positive = sorted_subs[0]
        most_negative = sorted_subs[-1]
        para3 = (
            f"Among the subreddits compared, r/{most_positive.subreddit} had the most positive sentiment "
            f"(mean score: {most_positive.post_stats.mean:.3f}), while r/{most_negative.subreddit} "
            f"leaned most negative (mean score: {most_negative.post_stats.mean:.3f})."
        )
    else:
        if posts:
            most_pos = max(posts, key=lambda p: p.sentiment.compound_score)
            most_neg = min(posts, key=lambda p: p.sentiment.compound_score)
            spread = most_pos.sentiment.compound_score - most_neg.sentiment.compound_score
            para3 = (
                f"The most positive post (\"{most_pos.post.title[:80]}...\") "
                f"scored {most_pos.sentiment.compound_score:.3f}, while the most negative "
                f"(\"{most_neg.post.title[:80]}...\") scored {most_neg.sentiment.compound_score:.3f}. "
                f"This spread of {spread:.3f} "
                f"indicates {'significant polarization' if spread > 1.0 else 'moderate variation'} within the community."
            )

    paragraphs = [p for p in [para1, para2, para3] if p]
    return "\n\n".join(paragraphs)


def _template_tribal_narrative(
    topics: list[TribalTopic],
    ratioed_posts: list[PostWithSentiment],
) -> str:
    """Original template-based tribal narrative."""
    sacred = [t for t in topics if t.tribal_class == TribalClass.sacred]
    blasphemous = [t for t in topics if t.tribal_class == TribalClass.blasphemous]
    controversial = [t for t in topics if t.tribal_class == TribalClass.controversial]

    parts: list[str] = []

    if sacred:
        top = sacred[0]
        parts.append(
            f"This community's most celebrated topic is **{top.topic}** — "
            f"mentioned {top.mention_count} times with near-universal approval "
            f"(mean sentiment: {top.mean_sentiment:+.3f})."
        )
        if len(sacred) > 1:
            others = ", ".join(f"**{t.topic}**" for t in sacred[1:3])
            parts.append(f"Other positively received topics include {others}.")

    if blasphemous:
        top = blasphemous[0]
        parts.append(
            f"On the other end, **{top.topic}** draws unified disapproval "
            f"(mean: {top.mean_sentiment:+.3f} across {top.mention_count} mentions)."
        )

    if controversial:
        top = controversial[0]
        parts.append(
            f"The most divisive topic is **{top.topic}** — "
            f"opinions are fractured with a standard deviation of {top.std_dev:.3f}, "
            f"making it genuinely divisive."
        )

    if ratioed_posts:
        n = len(ratioed_posts)
        parts.append(
            f"{n} post{'s' if n != 1 else ''} showed a significant disconnect "
            f"between the poster's sentiment and the community's response."
        )

    if not parts:
        non_neutral = [t for t in topics if t.tribal_class != TribalClass.neutral]
        if non_neutral:
            parts.append(
                f"Among {len(topics)} identified topics, "
                f"{len(non_neutral)} showed notable value patterns."
            )
        else:
            parts.append(
                f"Across {len(topics)} topics, sentiment is relatively uniform — "
                f"no strong value divisions emerged."
            )

    return " ".join(parts)
