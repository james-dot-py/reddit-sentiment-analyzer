"""Template-based summary generation from computed statistics."""

from __future__ import annotations

from .models import (
    SubredditSentimentSummary,
    NLPInsights,
    SentimentLabel,
    PostWithSentiment,
    CommentWithSentiment,
    TribalClass,
    TribalTopic,
)


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


def generate_summary(
    summaries: list[SubredditSentimentSummary],
    posts: list[PostWithSentiment],
    comments: list[CommentWithSentiment],
    insights: NLPInsights,
) -> str:
    """Generate a plain-English summary of the analysis results."""
    total_posts = sum(s.post_count for s in summaries)
    total_comments = sum(s.comment_count for s in summaries)
    subreddit_names = [s.subreddit for s in summaries]

    # ── Paragraph 1: Overview ──
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

    # Add distribution breakdown from first summary
    if summaries:
        s = summaries[0]
        stats = s.post_stats
        para1 += (
            f"Across all analyzed text, {_pct_fmt(stats.positive_pct)} was classified as positive, "
            f"{_pct_fmt(stats.neutral_pct)} as neutral, and {_pct_fmt(stats.negative_pct)} as negative."
        )

    # ── Paragraph 2: Key themes and entities ──
    para2_parts = []
    if insights.entities:
        top_entities = insights.entities[:5]
        entity_strs = [f"{e.text} ({e.label})" for e in top_entities]
        para2_parts.append(
            f"The most frequently mentioned entities include {', '.join(entity_strs)}."
        )

    if insights.bigrams:
        top_bigrams = [b.text for b in insights.bigrams[:5]]
        para2_parts.append(
            f"Common two-word phrases include \"{'\", \"'.join(top_bigrams)}\"."
        )

    stats = insights.text_stats
    para2_parts.append(
        f"Posts average {stats.avg_post_length:.0f} words in length, "
        f"with a vocabulary richness (type-token ratio) of {stats.vocabulary_richness:.3f} "
        f"and an estimated Flesch-Kincaid reading level of grade {stats.reading_level:.1f}."
    )

    para2 = " ".join(para2_parts)

    # ── Paragraph 3: Subreddit comparison or notable patterns ──
    para3 = ""
    if len(summaries) > 1:
        parts = []
        sorted_subs = sorted(summaries, key=lambda s: s.post_stats.mean, reverse=True)
        most_positive = sorted_subs[0]
        most_negative = sorted_subs[-1]
        parts.append(
            f"Among the subreddits compared, r/{most_positive.subreddit} had the most positive sentiment "
            f"(mean score: {most_positive.post_stats.mean:.3f}), while r/{most_negative.subreddit} "
            f"leaned most negative (mean score: {most_negative.post_stats.mean:.3f})."
        )
        para3 = " ".join(parts)
    else:
        # Highlight polarizing content
        if posts:
            most_pos = max(posts, key=lambda p: p.sentiment.compound_score)
            most_neg = min(posts, key=lambda p: p.sentiment.compound_score)
            para3 = (
                f"The most positive post (\"{most_pos.post.title[:80]}...\") "
                f"scored {most_pos.sentiment.compound_score:.3f}, while the most negative "
                f"(\"{most_neg.post.title[:80]}...\") scored {most_neg.sentiment.compound_score:.3f}. "
                f"This spread of {most_pos.sentiment.compound_score - most_neg.sentiment.compound_score:.3f} "
                f"indicates {'significant polarization' if most_pos.sentiment.compound_score - most_neg.sentiment.compound_score > 1.0 else 'moderate variation'} within the community."
            )

    paragraphs = [p for p in [para1, para2, para3] if p]
    return "\n\n".join(paragraphs)


def generate_tribal_narrative(
    topics: list[TribalTopic],
    ratioed_posts: list[PostWithSentiment],
) -> str:
    """Generate an editorial narrative about tribal findings."""
    if not topics:
        return "Not enough data to identify tribal patterns in this community."

    sacred = [t for t in topics if t.tribal_class == TribalClass.sacred]
    blasphemous = [t for t in topics if t.tribal_class == TribalClass.blasphemous]
    controversial = [t for t in topics if t.tribal_class == TribalClass.controversial]

    parts: list[str] = []

    if sacred:
        top = sacred[0]
        parts.append(
            f"This community's most sacred topic is **{top.topic}** — "
            f"mentioned {top.mention_count} times with near-universal approval "
            f"(mean sentiment: {top.mean_sentiment:+.3f})."
        )
        if len(sacred) > 1:
            others = ", ".join(f"**{t.topic}**" for t in sacred[1:3])
            parts.append(f"Other revered topics include {others}.")

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
            f"making it a genuine battleground."
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
                f"{len(non_neutral)} showed notable tribal patterns."
            )
        else:
            parts.append(
                f"Across {len(topics)} topics, sentiment is relatively uniform — "
                f"no strong tribal divisions emerged."
            )

    return " ".join(parts)
