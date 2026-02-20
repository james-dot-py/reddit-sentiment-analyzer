#!/usr/bin/env python3
"""Weekly scraper — fetches top/week data for all configured subreddits and
saves raw data + full AnalysisResponse + metadata to
``backend/data/snapshots/{YYYY-MM-DD}/{subreddit}/``.

Usage:
    python scripts/weekly_scrape.py                          # all subreddits
    python scripts/weekly_scrape.py --subreddit vegan        # one subreddit
    python scripts/weekly_scrape.py --date 2026-02-16        # override date
    python scripts/weekly_scrape.py --dry-run                # print plan, no fetch
"""

from __future__ import annotations

import argparse
import asyncio
import json
import statistics
import sys
import time
from collections import defaultdict
from datetime import date, datetime, timezone
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

from dotenv import load_dotenv
load_dotenv(PROJECT_ROOT / ".env")

from backend.app.models import (
    AnalysisResponse,
    CommentWithSentiment,
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
from backend.app.reddit_client import RedditClient
from backend.app.sentiment import analyze_batch, preload_model
from backend.app.summarizer import generate_summary, generate_tribal_narrative
from backend.app.tribal_logic import build_topic_groups, classify_tribalism, classify_ratioed_posts
from backend.app.models import SortMethod, TimeFilter

SUBREDDITS_JSON = PROJECT_ROOT / "scripts" / "subreddits.json"
SNAPSHOTS_DIR = PROJECT_ROOT / "backend" / "data" / "snapshots"

INTER_SUBREDDIT_DELAY = 2  # seconds between subreddits


# ── Pipeline helpers (mirrors precompute_analyses.py) ─────────────────────

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


def run_pipeline(
    subreddit: str,
    posts: list[RedditPost],
    comments: list[RedditComment],
    analysis_id: str,
) -> AnalysisResponse:
    """Run the full sentiment + NLP + tribal + summary pipeline on fetched data."""
    print(f"    Sentiment analysis ({len(posts)} posts)...")
    post_texts = [f"{p.title} {p.selftext}".strip() for p in posts]
    post_sentiments = analyze_batch(post_texts)
    posts_with_sentiment = [
        PostWithSentiment(post=p, sentiment=s)
        for p, s in zip(posts, post_sentiments)
        if s is not None
    ]

    comments_with_sentiment: list[CommentWithSentiment] = []
    if comments:
        print(f"    Sentiment analysis ({len(comments)} comments)...")
        comment_texts = [c.body for c in comments]
        comment_sentiments = analyze_batch(comment_texts)
        comments_with_sentiment = [
            CommentWithSentiment(comment=c, sentiment=s)
            for c, s in zip(comments, comment_sentiments)
            if s is not None
        ]

    # Aggregate stats
    post_scores = [p.sentiment.compound_score for p in posts_with_sentiment]
    post_labels = [p.sentiment.label for p in posts_with_sentiment]
    post_stats = _compute_sentiment_stats(post_scores, post_labels)

    comment_stats = None
    if comments_with_sentiment:
        c_scores = [c.sentiment.compound_score for c in comments_with_sentiment]
        c_labels = [c.sentiment.label for c in comments_with_sentiment]
        comment_stats = _compute_sentiment_stats(c_scores, c_labels)

    subreddit_summaries = [SubredditSentimentSummary(
        subreddit=subreddit,
        post_stats=post_stats,
        comment_stats=comment_stats,
        post_count=len(posts_with_sentiment),
        comment_count=len(comments_with_sentiment),
    )]
    time_series = _build_time_series(posts_with_sentiment)

    # NLP
    print("    NLP analysis (entities, n-grams, statistics)...")
    nlp_post_texts = [f"{p.post.title} {p.post.selftext}" for p in posts_with_sentiment]
    nlp_comment_texts = [c.comment.body for c in comments_with_sentiment] if comments_with_sentiment else None
    nlp_insights = run_full_nlp_analysis(nlp_post_texts, nlp_comment_texts)

    # Tribal
    print("    Tribal classification...")
    topic_groups = build_topic_groups(
        posts_with_sentiment, comments_with_sentiment,
        nlp_insights.entities, nlp_insights.bigrams,
    )
    tribal_topics = classify_tribalism(topic_groups)
    ratioed_posts = classify_ratioed_posts(posts_with_sentiment, comments_with_sentiment)
    tribal_narrative = generate_tribal_narrative(tribal_topics, ratioed_posts)
    tribal_analysis = TribalAnalysis(
        topics=tribal_topics, ratioed_posts=ratioed_posts, narrative=tribal_narrative,
    )

    # Summary
    print("    Generating summary...")
    summary_text = generate_summary(
        subreddit_summaries, posts_with_sentiment, comments_with_sentiment, nlp_insights,
        tribal_topics=tribal_topics, ratioed_count=len(ratioed_posts),
    )

    sentiment_distribution = [p.sentiment.compound_score for p in posts_with_sentiment]
    if comments_with_sentiment:
        sentiment_distribution.extend(c.sentiment.compound_score for c in comments_with_sentiment)

    return AnalysisResponse(
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


# ── Async fetch ────────────────────────────────────────────────────────────

async def fetch_subreddit(
    client: RedditClient,
    name: str,
    limit: int,
    depth: int,
) -> tuple[list[RedditPost], list[RedditComment]]:
    """Fetch top/week posts and comments for top-50 posts."""
    print(f"    Fetching {limit} posts (top/week)...")
    posts = await client.fetch_posts(
        subreddit=name,
        sort=SortMethod.top,
        time_filter=TimeFilter.week,
        limit=limit,
    )
    print(f"    Fetched {len(posts)} posts. Fetching comments for top 50...")
    comments: list[RedditComment] = []
    for post in posts[:50]:
        post_comments = await client.fetch_comments(name, post.id, depth=depth)
        comments.extend(post_comments)
        await asyncio.sleep(0.7)  # rate limit
    print(f"    Fetched {len(comments)} comments total.")
    return posts, comments


# ── Main ──────────────────────────────────────────────────────────────────

async def scrape_all(
    subreddit_configs: list[dict],
    snap_date: str,
    dry_run: bool,
) -> None:
    if dry_run:
        print(f"\nDry run — would scrape {len(subreddit_configs)} subreddits for {snap_date}:\n")
        for cfg in subreddit_configs:
            print(f"  r/{cfg['name']:20}  limit={cfg['limit']}  depth={cfg['depth']}")
        return

    preload_model()
    client = RedditClient()

    results: list[dict] = []

    for i, cfg in enumerate(subreddit_configs):
        name = cfg["name"]
        description = cfg.get("description", "")
        limit = cfg.get("limit", 200)
        depth = cfg.get("depth", 2)

        print(f"\n[{i+1}/{len(subreddit_configs)}] r/{name}")
        t0 = time.monotonic()

        try:
            posts, comments = await fetch_subreddit(client, name, limit, depth)

            snap_dir = SNAPSHOTS_DIR / snap_date / name.lower()
            snap_dir.mkdir(parents=True, exist_ok=True)

            # raw_data.json
            raw = {
                "subreddit": name,
                "posts": [p.model_dump() for p in posts],
                "comments": [c.model_dump() for c in comments],
            }
            with open(snap_dir / "raw_data.json", "w", encoding="utf-8") as f:
                json.dump(raw, f, ensure_ascii=False)

            # Run pipeline
            analysis_id = f"snapshot_{name.lower()}_{snap_date}"
            result = run_pipeline(name, posts, comments, analysis_id)

            # analysis.json
            with open(snap_dir / "analysis.json", "w", encoding="utf-8") as f:
                json.dump(result.model_dump(), f, ensure_ascii=False)

            duration = round(time.monotonic() - t0, 1)

            # metadata.json
            meta = {
                "date": snap_date,
                "subreddit": name,
                "description": description,
                "post_count": len(posts),
                "comment_count": len(comments),
                "fetched_at": datetime.now(timezone.utc).isoformat(),
                "scrape_duration_seconds": duration,
            }
            with open(snap_dir / "metadata.json", "w", encoding="utf-8") as f:
                json.dump(meta, f, ensure_ascii=False, indent=2)

            print(f"    Saved to {snap_dir}  ({duration}s)")
            results.append({"subreddit": name, "status": "ok", "posts": len(posts), "comments": len(comments), "duration": duration})

        except Exception as e:
            duration = round(time.monotonic() - t0, 1)
            print(f"    ERROR: {e}")
            results.append({"subreddit": name, "status": "error", "error": str(e), "duration": duration})

        if i < len(subreddit_configs) - 1:
            print(f"    Waiting {INTER_SUBREDDIT_DELAY}s before next subreddit...")
            await asyncio.sleep(INTER_SUBREDDIT_DELAY)

    # Summary table
    print(f"\n{'─'*60}")
    print(f"{'Subreddit':<20} {'Status':<8} {'Posts':>6} {'Comments':>9} {'Time':>7}")
    print(f"{'─'*60}")
    for r in results:
        if r["status"] == "ok":
            print(f"  r/{r['subreddit']:<18} {'ok':<8} {r['posts']:>6} {r['comments']:>9} {r['duration']:>6.1f}s")
        else:
            print(f"  r/{r['subreddit']:<18} {'ERROR':<8}  {r.get('error', '')}")
    print(f"{'─'*60}")
    ok = sum(1 for r in results if r["status"] == "ok")
    print(f"  {ok}/{len(results)} subreddits succeeded. Snapshots at: {SNAPSHOTS_DIR / snap_date}")


def main():
    parser = argparse.ArgumentParser(description="Weekly Reddit scraper for Undercurrent snapshots")
    parser.add_argument("--subreddit", type=str, help="Scrape a single subreddit (case-insensitive)")
    parser.add_argument("--date", type=str, default=date.today().isoformat(), help="Snapshot date (YYYY-MM-DD)")
    parser.add_argument("--dry-run", action="store_true", help="Print plan without fetching")
    args = parser.parse_args()

    with open(SUBREDDITS_JSON, encoding="utf-8") as f:
        all_configs: list[dict] = json.load(f)

    if args.subreddit:
        target = args.subreddit.lower()
        configs = [c for c in all_configs if c["name"].lower() == target]
        if not configs:
            names = [c["name"] for c in all_configs]
            print(f"Subreddit '{args.subreddit}' not found in subreddits.json. Available: {names}")
            raise SystemExit(1)
    else:
        configs = all_configs

    asyncio.run(scrape_all(configs, args.date, args.dry_run))


if __name__ == "__main__":
    main()
