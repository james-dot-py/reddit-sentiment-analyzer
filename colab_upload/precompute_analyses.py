#!/usr/bin/env python3
"""Pre-compute analysis results for sample datasets.

Runs the full NLP pipeline on each sample JSON and saves the complete
AnalysisResponse as {subreddit}.analysis.json — so the web app can
serve results instantly without running the pipeline at request time.

Usage:
    python scripts/precompute_analyses.py                        # all samples
    python scripts/precompute_analyses.py --subreddit askreddit  # one sample
"""

from __future__ import annotations

import argparse
import json
import statistics
import sys
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

# Add project root to sys.path so we can import backend modules
PROJECT_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

from backend.app.models import (
    AnalysisResponse,
    CommentWithSentiment,
    NLPInsights,
    PostWithSentiment,
    RedditComment,
    RedditPost,
    SentimentLabel,
    SentimentStats,
    SubredditSentimentSummary,
    TimeSeriesPoint,
    TribalAnalysis,
)
from backend.app.nlp_analysis import run_full_nlp_analysis
from backend.app.sentiment import analyze_batch, preload_model
from backend.app.summarizer import generate_summary, generate_tribal_narrative
from backend.app.tribal_logic import build_topic_groups, classify_tribalism, classify_ratioed_posts

SAMPLES_DIR = PROJECT_ROOT / "backend" / "samples"


def _compute_sentiment_stats(scores: list[float], labels: list[SentimentLabel]) -> SentimentStats:
    if not scores:
        return SentimentStats(
            mean=0, median=0, std_dev=0,
            positive_pct=0, neutral_pct=0, negative_pct=0, total_count=0,
        )
    total = len(labels)
    return SentimentStats(
        mean=round(statistics.mean(scores), 4),
        median=round(statistics.median(scores), 4),
        std_dev=round(statistics.stdev(scores), 4) if len(scores) > 1 else 0,
        positive_pct=round(labels.count(SentimentLabel.positive) / total * 100, 1),
        neutral_pct=round(labels.count(SentimentLabel.neutral) / total * 100, 1),
        negative_pct=round(labels.count(SentimentLabel.negative) / total * 100, 1),
        total_count=total,
    )


def _build_time_series(posts: list[PostWithSentiment]) -> list[TimeSeriesPoint]:
    by_day_sub: dict[tuple[str, str], list[float]] = defaultdict(list)
    for p in posts:
        dt = datetime.fromtimestamp(p.post.created_utc, tz=timezone.utc)
        day_str = dt.strftime("%Y-%m-%d")
        by_day_sub[(day_str, p.post.subreddit)].append(p.sentiment.compound_score)

    points = []
    for (day, sub), scores in sorted(by_day_sub.items()):
        points.append(TimeSeriesPoint(
            date=day,
            avg_sentiment=round(statistics.mean(scores), 4),
            count=len(scores),
            subreddit=sub,
        ))
    return points


def process_sample(sample_path: Path) -> None:
    """Run the full pipeline on one sample file and save the result."""
    print(f"\n{'='*60}")
    print(f"Processing {sample_path.name}")
    print(f"{'='*60}")

    with open(sample_path, "r", encoding="utf-8") as f:
        sample_data = json.load(f)

    subreddit = sample_data["subreddit"]
    analysis_id = f"sample_{subreddit.lower()}"

    all_posts = [RedditPost(**p) for p in sample_data["posts"]]
    all_comments = [RedditComment(**c) for c in sample_data["comments"]]

    print(f"  Loaded {len(all_posts)} posts, {len(all_comments)} comments")

    # Stage 1: Sentiment analysis on posts
    print(f"  Analyzing sentiment for {len(all_posts)} posts...")
    post_texts = [f"{p.title} {p.selftext}".strip() for p in all_posts]
    post_sentiments = analyze_batch(post_texts)

    posts_with_sentiment = []
    for post, sentiment in zip(all_posts, post_sentiments):
        if sentiment is not None:
            posts_with_sentiment.append(PostWithSentiment(post=post, sentiment=sentiment))

    print(f"  Analyzed {len(posts_with_sentiment)} posts")

    # Stage 2: Sentiment analysis on comments
    comments_with_sentiment = []
    if all_comments:
        print(f"  Analyzing sentiment for {len(all_comments)} comments...")
        comment_texts = [c.body for c in all_comments]
        comment_sentiments = analyze_batch(comment_texts)

        for comment, sentiment in zip(all_comments, comment_sentiments):
            if sentiment is not None:
                comments_with_sentiment.append(
                    CommentWithSentiment(comment=comment, sentiment=sentiment)
                )
        print(f"  Analyzed {len(comments_with_sentiment)} comments")

    # Stage 3: Aggregate stats
    print("  Computing statistics...")
    sub_posts = posts_with_sentiment
    sub_comments = comments_with_sentiment

    post_scores = [p.sentiment.compound_score for p in sub_posts]
    post_labels = [p.sentiment.label for p in sub_posts]
    post_stats = _compute_sentiment_stats(post_scores, post_labels)

    comment_stats = None
    if sub_comments:
        comment_scores = [c.sentiment.compound_score for c in sub_comments]
        comment_labels = [c.sentiment.label for c in sub_comments]
        comment_stats = _compute_sentiment_stats(comment_scores, comment_labels)

    subreddit_summaries = [SubredditSentimentSummary(
        subreddit=subreddit,
        post_stats=post_stats,
        comment_stats=comment_stats,
        post_count=len(sub_posts),
        comment_count=len(sub_comments),
    )]

    time_series = _build_time_series(posts_with_sentiment)

    # Stage 4: NLP analysis
    print("  Running NLP analysis (entities, n-grams, statistics)...")
    nlp_post_texts = [f"{p.post.title} {p.post.selftext}" for p in posts_with_sentiment]
    nlp_comment_texts = [c.comment.body for c in comments_with_sentiment] if comments_with_sentiment else None
    nlp_insights = run_full_nlp_analysis(nlp_post_texts, nlp_comment_texts)

    # Stage 4.5: Tribal analysis
    print("  Classifying tribal patterns...")
    topic_groups = build_topic_groups(
        posts_with_sentiment,
        comments_with_sentiment,
        nlp_insights.entities,
        nlp_insights.bigrams,
    )
    tribal_topics = classify_tribalism(topic_groups)
    ratioed_posts = classify_ratioed_posts(posts_with_sentiment, comments_with_sentiment)
    tribal_narrative = generate_tribal_narrative(tribal_topics, ratioed_posts)

    tribal_analysis = TribalAnalysis(
        topics=tribal_topics,
        ratioed_posts=ratioed_posts,
        narrative=tribal_narrative,
    )
    print(f"  Found {len(tribal_topics)} tribal topics")

    # Stage 5: Generate summary
    print("  Generating summary...")
    summary_text = generate_summary(
        subreddit_summaries, posts_with_sentiment, comments_with_sentiment, nlp_insights,
        tribal_topics=tribal_topics, ratioed_count=len(ratioed_posts),
    )

    # Build final response
    sentiment_distribution = [p.sentiment.compound_score for p in posts_with_sentiment]
    if comments_with_sentiment:
        sentiment_distribution.extend(c.sentiment.compound_score for c in comments_with_sentiment)

    result = AnalysisResponse(
        analysis_id=analysis_id,
        subreddit_summaries=subreddit_summaries,
        posts=posts_with_sentiment,
        comments=comments_with_sentiment,
        time_series=time_series,
        nlp_insights=nlp_insights,
        summary_text=summary_text,
        sentiment_distribution=sentiment_distribution,
        tribal_analysis=tribal_analysis,
    )

    # Save
    out_path = sample_path.with_suffix(".analysis.json")
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(result.model_dump(), f, ensure_ascii=False)

    size_mb = out_path.stat().st_size / (1024 * 1024)
    print(f"  Saved to {out_path.name} ({size_mb:.1f} MB)")


def main():
    parser = argparse.ArgumentParser(description="Pre-compute analysis for sample datasets")
    parser.add_argument("--subreddit", type=str, help="Process a single subreddit")
    args = parser.parse_args()

    # Preload the sentiment model once
    print("Preloading sentiment model...")
    preload_model()
    print("Model ready.\n")

    if args.subreddit:
        path = SAMPLES_DIR / f"{args.subreddit.lower()}.json"
        if not path.exists():
            print(f"Sample not found: {path}")
            available = [p.stem for p in SAMPLES_DIR.glob("*.json") if not p.name.endswith(".analysis.json")]
            print(f"Available: {', '.join(available)}")
            raise SystemExit(1)
        process_sample(path)
    else:
        paths = sorted(
            p for p in SAMPLES_DIR.glob("*.json")
            if not p.name.endswith(".analysis.json")
        )
        print(f"Processing {len(paths)} samples...")
        for path in paths:
            try:
                process_sample(path)
            except Exception as e:
                print(f"  ERROR processing {path.name}: {e}")

    print("\nDone!")
    for p in sorted(SAMPLES_DIR.glob("*.analysis.json")):
        size_mb = p.stat().st_size / (1024 * 1024)
        print(f"  {p.name} ({size_mb:.1f} MB)")


if __name__ == "__main__":
    main()
