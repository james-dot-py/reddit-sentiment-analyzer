"""Anthropic Claude–powered narrative summary for the top intelligence section.

Used in place of the Gemini summarizer for selected subreddits where we want a
richer, more interpretive synthesis. Only generates ``summary_text`` (the top
narrative); tribal narrative and template fallbacks remain in ``summarizer.py``.
"""

from __future__ import annotations

import logging
import os
from typing import Optional

from .models import (
    CommentWithSentiment,
    NLPInsights,
    PostWithSentiment,
    SubredditSentimentSummary,
    TribalClass,
    TribalTopic,
)

logger = logging.getLogger(__name__)

ANTHROPIC_MODEL = "claude-sonnet-4-5"

ANTHROPIC_SYSTEM_PROMPT = """\
You are the editorial voice of a data-journalism tool that decodes online communities.

Your job: take structured analysis data about a Reddit community and write a rich,
insightful synthesis that reveals what this community celebrates, rejects, and
disagrees on. Treat the data like a primary source — interpret it, don't recite it.

Voice & tone:
- Sophisticated but approachable — sharp data journalism for a curious general audience
- Specific, observant, slightly playful; never academic, dry, or sanitized
- No hedging, no filler, no "it's important to note", no "in conclusion"
- No buzzwords, no vague descriptors ("vibrant community", "diverse voices")
- Surface NON-OBVIOUS insights — the reader should learn something they could not
  have inferred from a stat dashboard
- Connect community patterns to broader human behavior or subcultural context when
  the data supports it
- Be willing to make pointed claims if the numbers back them up
- Treat the subject community with curiosity and respect; describe what it values
  on its own terms before noting tensions or contradictions

Structure (this is mandatory):
1. Open with 3-5 bullet points using `- ` that capture the most interesting
   interpretive takeaways. Each bullet should be a real insight, not a restated
   statistic. Bad: "The community is 30% positive and 22% negative." Good:
   "Affirmation outweighs venting roughly 2:1, but the loudest single topic is
   pure spite."
2. Follow with 2-3 paragraphs of flowing editorial prose that goes deeper into the
   patterns, contradictions, and surprises in the data. Reference specific topic
   names, post themes, and numbers — but weave them into argument, don't list them.

Length: ~280-420 words total (bullets + prose).

Formatting rules:
- Use **bold** for community-specific topic names, slang, and key phrases.
- Do NOT use markdown headers, numbered lists, or sub-bullets.
- Do NOT start with "This community" — find a more specific opening.
- Do not name the LLM, the analyst, or the methodology. Stay inside the lens.
"""


def _build_user_prompt(
    subreddit_names: list[str],
    summaries: list[SubredditSentimentSummary],
    posts: list[PostWithSentiment],
    comments: list[CommentWithSentiment],
    insights: NLPInsights,
    tribal_topics: Optional[list[TribalTopic]] = None,
    ratioed_count: int = 0,
) -> str:
    sub_str = ", ".join(f"r/{s}" for s in subreddit_names)
    total_posts = sum(s.post_count for s in summaries)
    total_comments = sum(s.comment_count for s in summaries)

    overall_scores = [p.sentiment.compound_score for p in posts]
    overall_mean = sum(overall_scores) / max(len(overall_scores), 1)

    lines: list[str] = [
        f"Community: {sub_str}",
        f"Dataset: {total_posts} posts, {total_comments} comments",
        f"Overall sentiment (compound mean, range -1..1): {overall_mean:+.3f}",
        "",
    ]

    for s in summaries:
        lines.append(
            f"r/{s.subreddit} stats — posts={s.post_count}, comments={s.comment_count}, "
            f"post mean_sentiment={s.post_stats.mean:+.3f}, "
            f"positive={s.post_stats.positive_pct:.1f}%, "
            f"neutral={s.post_stats.neutral_pct:.1f}%, "
            f"negative={s.post_stats.negative_pct:.1f}%; "
            f"comment mean_sentiment={s.comment_stats.mean:+.3f}, "
            f"positive={s.comment_stats.positive_pct:.1f}%, "
            f"neutral={s.comment_stats.neutral_pct:.1f}%, "
            f"negative={s.comment_stats.negative_pct:.1f}%"
        )

    if insights.entities:
        top = insights.entities[:10]
        lines.append("")
        lines.append(
            "Top entities: "
            + ", ".join(f"{e.text} ({e.label}, {e.count}x)" for e in top)
        )

    if insights.bigrams:
        top = insights.bigrams[:10]
        lines.append(
            "Top bigrams: "
            + ", ".join(f'"{b.text}" ({b.count}x)' for b in top)
        )

    if getattr(insights, "trigrams", None):
        top = insights.trigrams[:6]
        if top:
            lines.append(
                "Top trigrams: "
                + ", ".join(f'"{b.text}" ({b.count}x)' for b in top)
            )

    stats = insights.text_stats
    lines.append(
        f"Text stats — avg post length: {stats.avg_post_length:.0f} words, "
        f"avg comment length: {stats.avg_comment_length:.0f} words, "
        f"vocabulary richness (TTR): {stats.vocabulary_richness:.3f}, "
        f"reading level: grade {stats.reading_level:.1f}"
    )

    if tribal_topics:
        sacred = [t for t in tribal_topics if t.tribal_class == TribalClass.sacred]
        blasphemous = [t for t in tribal_topics if t.tribal_class == TribalClass.blasphemous]
        controversial = [t for t in tribal_topics if t.tribal_class == TribalClass.controversial]
        neutral = [t for t in tribal_topics if t.tribal_class == TribalClass.neutral]

        if sacred:
            lines.append("")
            lines.append("CELEBRATED topics (high positive consensus):")
            for t in sacred[:6]:
                lines.append(
                    f"  - {t.topic}: sentiment={t.mean_sentiment:+.3f}, "
                    f"mentions={t.mention_count}, std={t.std_dev:.3f}"
                )

        if blasphemous:
            lines.append("REJECTED topics (high negative consensus):")
            for t in blasphemous[:6]:
                lines.append(
                    f"  - {t.topic}: sentiment={t.mean_sentiment:+.3f}, "
                    f"mentions={t.mention_count}, std={t.std_dev:.3f}"
                )

        if controversial:
            lines.append("DIVISIVE topics (high disagreement, std dev > 0.6):")
            for t in controversial[:6]:
                lines.append(
                    f"  - {t.topic}: sentiment={t.mean_sentiment:+.3f}, "
                    f"mentions={t.mention_count}, std={t.std_dev:.3f}"
                )

        if neutral:
            lines.append("Most-mentioned but tonally mixed topics:")
            for t in sorted(neutral, key=lambda x: -x.mention_count)[:6]:
                lines.append(
                    f"  - {t.topic}: sentiment={t.mean_sentiment:+.3f}, "
                    f"mentions={t.mention_count}, std={t.std_dev:.3f}"
                )

        if ratioed_count:
            lines.append(
                f"\n{ratioed_count} 'ratioed' posts where the community's sentiment "
                "diverged sharply from the OP's tone."
            )

    if tribal_topics:
        for cls_name, cls_val in [
            ("Celebrated", TribalClass.sacred),
            ("Rejected", TribalClass.blasphemous),
            ("Divisive", TribalClass.controversial),
        ]:
            cls_topics = [t for t in tribal_topics if t.tribal_class == cls_val]
            for t in cls_topics[:2]:
                if t.sample_texts:
                    lines.append(f"\nSample {cls_name} content under '{t.topic}':")
                    for txt in t.sample_texts[:3]:
                        lines.append(f'  - "{txt[:160]}"')

    if posts:
        ranked = sorted(posts, key=lambda p: p.post.score, reverse=True)[:12]
        lines.append("\nTop posts by upvotes (title — score, sentiment):")
        for p in ranked:
            lines.append(
                f'  - "{p.post.title[:140]}" — score={p.post.score}, '
                f'sentiment={p.sentiment.compound_score:+.2f}'
            )

        most_pos = max(posts, key=lambda p: p.sentiment.compound_score)
        most_neg = min(posts, key=lambda p: p.sentiment.compound_score)
        lines.append(
            f"\nMost positive post (score {most_pos.sentiment.compound_score:+.2f}): "
            f'"{most_pos.post.title[:160]}"'
        )
        lines.append(
            f"Most negative post (score {most_neg.sentiment.compound_score:+.2f}): "
            f'"{most_neg.post.title[:160]}"'
        )

    return "\n".join(lines)


def _call_anthropic(system_prompt: str, user_prompt: str) -> Optional[str]:
    """Call the Anthropic Messages API. Returns generated text or None on failure."""
    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        logger.info("ANTHROPIC_API_KEY not set — skipping Anthropic summary")
        return None

    try:
        import anthropic
    except ImportError:
        logger.error("anthropic package not installed; pip install anthropic")
        return None

    try:
        client = anthropic.Anthropic(api_key=api_key)
        response = client.messages.create(
            model=ANTHROPIC_MODEL,
            max_tokens=1500,
            temperature=0.6,
            system=system_prompt,
            messages=[{"role": "user", "content": user_prompt}],
        )
        text_parts = [block.text for block in response.content if getattr(block, "type", None) == "text"]
        text = "\n".join(text_parts).strip()
        if text:
            logger.info(
                f"Anthropic summary: {response.usage.input_tokens}in/"
                f"{response.usage.output_tokens}out tokens"
            )
            return text
        logger.warning("Anthropic returned empty response")
        return None
    except Exception as e:
        logger.error(f"Anthropic API call failed: {e}")
        return None


def generate_anthropic_summary(
    summaries: list[SubredditSentimentSummary],
    posts: list[PostWithSentiment],
    comments: list[CommentWithSentiment],
    insights: NLPInsights,
    tribal_topics: Optional[list[TribalTopic]] = None,
    ratioed_count: int = 0,
) -> Optional[str]:
    """Generate the top narrative summary via Claude Sonnet. Returns None on failure."""
    subreddit_names = [s.subreddit for s in summaries]
    user_prompt = _build_user_prompt(
        subreddit_names, summaries, posts, comments, insights,
        tribal_topics, ratioed_count,
    )
    return _call_anthropic(ANTHROPIC_SYSTEM_PROMPT, user_prompt)


def build_user_prompt(
    summaries: list[SubredditSentimentSummary],
    posts: list[PostWithSentiment],
    comments: list[CommentWithSentiment],
    insights: NLPInsights,
    tribal_topics: Optional[list[TribalTopic]] = None,
    ratioed_count: int = 0,
) -> str:
    """Public alias for the prompt builder, useful for offline generation."""
    subreddit_names = [s.subreddit for s in summaries]
    return _build_user_prompt(
        subreddit_names, summaries, posts, comments, insights,
        tribal_topics, ratioed_count,
    )
