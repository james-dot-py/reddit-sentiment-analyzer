"""Tribalism classification engine and concept search.

Classifies community topics as Sacred, Blasphemous, Controversial, or Neutral
based on sentiment statistics. Also provides multi-term concept search.
"""

from __future__ import annotations

import statistics
from collections import defaultdict
from typing import Optional

from .models import (
    CommentWithSentiment,
    ContextSnippet,
    NamedEntity,
    NgramEntry,
    PostWithSentiment,
    SentimentLabel,
    SentimentStats,
    TribalClass,
    TribalTopic,
)


# ── Topic grouping ────────────────────────────────────────────────────────


def build_topic_groups(
    posts: list[PostWithSentiment],
    comments: list[CommentWithSentiment],
    entities: list[NamedEntity],
    bigrams: list[NgramEntry],
    top_n: int = 20,
) -> list[dict]:
    """Build topic groups from NER entities and top bigrams.

    Combines two sources:
      1. NER entities filtered to ORG, PERSON, GPE, PRODUCT
      2. Top bigrams (often better topics than NER on Reddit text)

    Deduplicates overlapping topics and collects compound scores.
    """
    # Collect candidate topic strings (deduplicated, case-normalized)
    seen_lower: set[str] = set()
    candidates: list[str] = []

    # Source 1: NER entities (filtered to reliable types)
    reliable_labels = {"ORG", "PERSON", "GPE", "PRODUCT"}
    for ent in entities[:top_n]:
        if ent.label in reliable_labels and ent.count >= 2:
            key = ent.text.lower().strip()
            if key not in seen_lower and len(key) > 1:
                seen_lower.add(key)
                candidates.append(ent.text.strip())

    # Source 2: Top bigrams
    for bg in bigrams[:top_n]:
        key = bg.text.lower().strip()
        # Skip if already covered by an entity (substring match)
        if key in seen_lower:
            continue
        if any(key in s or s in key for s in seen_lower):
            continue
        if bg.count >= 3:
            seen_lower.add(key)
            candidates.append(bg.text.strip())

    # Cap total candidates
    candidates = candidates[:top_n]

    # Build text corpus for fast searching
    post_data = []
    for p in posts:
        text = f"{p.post.title} {p.post.selftext}".lower()
        post_data.append((text, p.sentiment.compound_score, p.post.title[:120]))

    comment_data = []
    for c in comments:
        text = c.comment.body.lower()
        comment_data.append((text, c.sentiment.compound_score, c.comment.body[:120]))

    # For each candidate topic, find mentions and collect scores
    groups: list[dict] = []
    for topic in candidates:
        topic_lower = topic.lower()
        scores: list[float] = []
        sample_texts: list[str] = []

        for text, score, snippet in post_data:
            if topic_lower in text:
                scores.append(score)
                if len(sample_texts) < 3:
                    sample_texts.append(snippet)

        for text, score, snippet in comment_data:
            if topic_lower in text:
                scores.append(score)
                if len(sample_texts) < 3:
                    sample_texts.append(snippet)

        if len(scores) >= 3:  # Minimum mentions to be meaningful
            groups.append({
                "topic": topic,
                "compound_scores": scores,
                "mention_count": len(scores),
                "sample_texts": sample_texts,
            })

    return groups


# ── Tribalism classification ──────────────────────────────────────────────


def classify_tribalism(topic_groups: list[dict]) -> list[TribalTopic]:
    """Classify topics as Sacred, Blasphemous, Controversial, or Neutral.

    Uses percentile-based classification when enough topics exist (>= 8),
    falls back to absolute thresholds for small topic sets.
    """
    if not topic_groups:
        return []

    # Compute stats per topic
    enriched = []
    for g in topic_groups:
        scores = g["compound_scores"]
        mean = statistics.mean(scores)
        std = statistics.stdev(scores) if len(scores) > 1 else 0.0
        enriched.append({
            **g,
            "mean_sentiment": round(mean, 4),
            "std_dev": round(std, 4),
            "consensus_score": round(1.0 / max(std, 0.05), 2),
        })

    # Classification
    if len(enriched) >= 8:
        # Percentile-based: top/bottom 15% by mean, top 15% by std
        sorted_by_mean = sorted(enriched, key=lambda x: x["mean_sentiment"])
        sorted_by_std = sorted(enriched, key=lambda x: x["std_dev"], reverse=True)

        n = len(enriched)
        cutoff = max(1, int(n * 0.15))

        blasphemous_set = {id(t) for t in sorted_by_mean[:cutoff]}
        sacred_set = {id(t) for t in sorted_by_mean[-cutoff:]}
        controversial_set = {id(t) for t in sorted_by_std[:cutoff]}

        for t in enriched:
            tid = id(t)
            if tid in controversial_set and t["std_dev"] > 0.2:
                t["tribal_class"] = TribalClass.controversial
            elif tid in sacred_set and t["mean_sentiment"] > 0.05:
                t["tribal_class"] = TribalClass.sacred
            elif tid in blasphemous_set and t["mean_sentiment"] < -0.05:
                t["tribal_class"] = TribalClass.blasphemous
            else:
                t["tribal_class"] = TribalClass.neutral
    else:
        # Absolute thresholds for small topic sets
        for t in enriched:
            if t["std_dev"] > 0.6:
                t["tribal_class"] = TribalClass.controversial
            elif t["mean_sentiment"] > 0.5 and t["std_dev"] < 0.3:
                t["tribal_class"] = TribalClass.sacred
            elif t["mean_sentiment"] < -0.5 and t["std_dev"] < 0.3:
                t["tribal_class"] = TribalClass.blasphemous
            else:
                t["tribal_class"] = TribalClass.neutral

    # Build TribalTopic objects
    results = []
    for t in enriched:
        results.append(TribalTopic(
            topic=t["topic"],
            tribal_class=t["tribal_class"],
            mean_sentiment=t["mean_sentiment"],
            std_dev=t["std_dev"],
            consensus_score=t["consensus_score"],
            mention_count=t["mention_count"],
            sample_texts=t["sample_texts"],
        ))

    # Sort: non-neutral first (most interesting), then by mention count
    class_order = {
        TribalClass.sacred: 0,
        TribalClass.blasphemous: 1,
        TribalClass.controversial: 2,
        TribalClass.neutral: 3,
    }
    results.sort(key=lambda t: (class_order.get(t.tribal_class, 9), -t.mention_count))

    return results


# ── Ratioed post detection ────────────────────────────────────────────────


def classify_ratioed_posts(
    posts: list[PostWithSentiment],
    comments: list[CommentWithSentiment],
    threshold: float = 0.5,
) -> list[PostWithSentiment]:
    """Find posts where the poster's sentiment diverges from comment consensus.

    A post is "ratioed" when post_sentiment - avg_comment_sentiment > threshold.
    Returns only ratioed posts. Returns empty list if no comments exist.
    """
    if not comments:
        return []

    # Group comments by post_id
    comments_by_post: dict[str, list[float]] = defaultdict(list)
    for c in comments:
        comments_by_post[c.comment.post_id].append(c.sentiment.compound_score)

    ratioed: list[PostWithSentiment] = []
    for p in posts:
        post_comments = comments_by_post.get(p.post.id)
        if not post_comments:
            continue
        avg_comment = statistics.mean(post_comments)
        delta = p.sentiment.compound_score - avg_comment
        if delta > threshold:
            ratioed.append(p)

    return ratioed


# ── Concept search ────────────────────────────────────────────────────────


def concept_search(
    posts: list[PostWithSentiment],
    comments: list[CommentWithSentiment],
    query: str,
) -> dict:
    """Multi-term concept search across posts and comments.

    Splits query on commas. Matches if ANY term appears (case-insensitive).
    Returns matching items, stats, snippets, and a TribalTopic for map overlay.
    """
    terms = [t.strip().lower() for t in query.split(",") if t.strip()]
    if not terms:
        return {
            "query": query,
            "terms": [],
            "matching_post_count": 0,
            "matching_comment_count": 0,
            "stats": None,
            "topic": None,
            "snippets": [],
        }

    matching_posts: list[PostWithSentiment] = []
    matching_comments: list[CommentWithSentiment] = []
    scores: list[float] = []
    labels: list[SentimentLabel] = []
    snippets: list[ContextSnippet] = []

    for p in posts:
        text = f"{p.post.title} {p.post.selftext}".lower()
        if any(term in text for term in terms):
            matching_posts.append(p)
            scores.append(p.sentiment.compound_score)
            labels.append(p.sentiment.label)
            if len(snippets) < 5:
                snippets.append(ContextSnippet(
                    text=p.post.title[:150],
                    sentiment_score=p.sentiment.compound_score,
                    sentiment_label=p.sentiment.label.value,
                    source_type="post",
                    post_title=p.post.title[:100],
                    permalink=f"https://reddit.com{p.post.permalink}",
                ))

    for c in comments:
        if any(term in c.comment.body.lower() for term in terms):
            matching_comments.append(c)
            scores.append(c.sentiment.compound_score)
            labels.append(c.sentiment.label)
            if len(snippets) < 5:
                snippets.append(ContextSnippet(
                    text=c.comment.body[:150],
                    sentiment_score=c.sentiment.compound_score,
                    sentiment_label=c.sentiment.label.value,
                    source_type="comment",
                ))

    # Compute stats
    stats: Optional[SentimentStats] = None
    topic: Optional[TribalTopic] = None

    if scores:
        total = len(labels)
        mean = statistics.mean(scores)
        std = statistics.stdev(scores) if len(scores) > 1 else 0.0

        stats = SentimentStats(
            mean=round(mean, 4),
            median=round(statistics.median(scores), 4),
            std_dev=round(std, 4),
            positive_pct=round(labels.count(SentimentLabel.positive) / total * 100, 1),
            neutral_pct=round(labels.count(SentimentLabel.neutral) / total * 100, 1),
            negative_pct=round(labels.count(SentimentLabel.negative) / total * 100, 1),
            total_count=total,
        )

        # Classify the concept as a TribalTopic for map overlay
        if std > 0.6:
            cls = TribalClass.controversial
        elif mean > 0.5 and std < 0.3:
            cls = TribalClass.sacred
        elif mean < -0.5 and std < 0.3:
            cls = TribalClass.blasphemous
        else:
            cls = TribalClass.neutral

        topic = TribalTopic(
            topic=query,
            tribal_class=cls,
            mean_sentiment=round(mean, 4),
            std_dev=round(std, 4),
            consensus_score=round(1.0 / max(std, 0.05), 2),
            mention_count=len(scores),
            sample_texts=[s.text for s in snippets[:3]],
        )

    return {
        "query": query,
        "terms": terms,
        "matching_post_count": len(matching_posts),
        "matching_comment_count": len(matching_comments),
        "stats": stats,
        "topic": topic,
        "snippets": snippets,
    }
