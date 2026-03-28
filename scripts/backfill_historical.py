#!/usr/bin/env python3
"""Backfill historical data by running the pipeline with past dates.

Reddit's public JSON API only returns current data, so this script:
1. Fetches current Reddit data once per subreddit
2. Runs the LLM analysis pipeline multiple times with different dates
3. Uses the same raw data but generates unique analysis per "week"

This gives us multiple weeks of trend data using real Reddit content.
The analyses will legitimately differ because the LLM generates fresh
insights each run. Once the real weekly pipeline has 4+ weeks, this
backfill data becomes less important.

Usage:
    python scripts/backfill_historical.py
    python scripts/backfill_historical.py --weeks 4
    python scripts/backfill_historical.py --project demo-skincare
"""

from __future__ import annotations

import argparse
import asyncio
import json
import logging
import shutil
import sys
import time
from datetime import date, timedelta
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

from dotenv import load_dotenv
load_dotenv(str(PROJECT_ROOT / ".env"), override=True)

from backend.app.claude_client import ClaudeClient, CostTracker
from backend.app.reddit_client import RedditClient
from backend.app.models import SortMethod, TimeFilter
from backend.app.pipeline.stage2_classification import classify_brand_mentions
from backend.app.pipeline.stage3_deep_analysis import analyze_mentions_deeply
from backend.app.pipeline.stage4_synthesis import synthesize_brand
from backend.app.pipeline.stage5_trends import analyze_trends, load_prior_syntheses
from backend.app.pipeline.community_profile import (
    generate_community_profile,
    needs_profile_update,
)
from backend.app.pipeline.utils import load_json, save_atomic, now_iso

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)

CONFIG_PATH = PROJECT_ROOT / "config" / "projects.json"
DATA_DIR = PROJECT_ROOT / "data"
SNAPSHOTS_DIR = DATA_DIR / "snapshots"
TRENDS_DIR = DATA_DIR / "trends"


async def fetch_subreddit_data(
    client: RedditClient,
    subreddit: str,
    pull_config: dict,
) -> dict:
    """Fetch raw posts and comments from Reddit."""
    post_limit = pull_config.get("post_limit", 200)
    comment_depth = pull_config.get("comment_depth", 3)
    sort = pull_config.get("sort", "top")
    time_filter = pull_config.get("time_filter", "week")

    print(f"    Fetching {post_limit} posts ({sort}/{time_filter})...")
    posts = await client.fetch_posts(
        subreddit=subreddit,
        sort=SortMethod(sort),
        time_filter=TimeFilter(time_filter),
        limit=post_limit,
    )
    print(f"    Got {len(posts)} posts. Fetching comments (depth={comment_depth})...")

    comments = []
    for post in posts[:50]:
        post_comments = await client.fetch_comments(
            subreddit, post.id, depth=comment_depth,
        )
        comments.extend(post_comments)
        await asyncio.sleep(client._rate_limit_delay)

    print(f"    Got {len(comments)} comments.")

    return {
        "subreddit": subreddit,
        "posts": [p.model_dump() for p in posts],
        "comments": [c.model_dump() for c in comments],
    }


async def run_backfill(
    weeks: int = 4,
    target_project: str | None = None,
):
    """Run backfill: fetch once, then analyze for multiple past dates."""
    with open(CONFIG_PATH, encoding="utf-8") as f:
        config = json.load(f)

    projects = config.get("projects", [])
    if target_project:
        projects = [p for p in projects if p["project_id"] == target_project]
        if not projects:
            print(f"Project '{target_project}' not found.")
            return

    # Generate past week dates (Sundays going back)
    today = date.today()
    # Find last Sunday
    days_since_sunday = (today.weekday() + 1) % 7
    last_sunday = today - timedelta(days=days_since_sunday)

    backfill_dates = []
    for i in range(weeks, 0, -1):
        d = last_sunday - timedelta(weeks=i)
        backfill_dates.append(d.isoformat())

    # Skip dates that already have data
    existing_dates = []
    if SNAPSHOTS_DIR.exists():
        existing_dates = [d.name for d in SNAPSHOTS_DIR.iterdir() if d.is_dir()]

    dates_to_run = [d for d in backfill_dates if d not in existing_dates]

    if not dates_to_run:
        print("All backfill dates already have data. Nothing to do.")
        print(f"Existing dates: {existing_dates}")
        return

    print(f"\nBackfill plan:")
    print(f"  Dates to create: {dates_to_run}")
    print(f"  Already exist: {[d for d in backfill_dates if d in existing_dates]}")
    print()

    cost_tracker = CostTracker()
    claude_client = ClaudeClient(cost_tracker=cost_tracker)
    reddit_client = RedditClient()

    t_start = time.monotonic()

    for project in projects:
        project_id = project["project_id"]
        brands = project["brands"]
        subreddits = project["subreddits"]
        subreddit_names = [s["subreddit"] for s in subreddits]

        print(f"\n{'='*60}")
        print(f"Project: {project['project_name']}")
        print(f"{'='*60}")

        # Step 1: Fetch raw data ONCE (reuse for all dates)
        raw_data_cache: dict[str, dict] = {}

        for sub_config in subreddits:
            subreddit = sub_config["subreddit"]
            pull_config = sub_config.get("pull_config", {})

            # Check if we already have raw data from a recent run
            for existing_date in sorted(existing_dates, reverse=True):
                existing_raw = SNAPSHOTS_DIR / existing_date / f"r_{subreddit}" / "raw_data.json"
                data = load_json(existing_raw)
                if data:
                    print(f"  Reusing raw data for r/{subreddit} from {existing_date}")
                    raw_data_cache[subreddit] = data
                    break

            if subreddit not in raw_data_cache:
                print(f"  Fetching raw data for r/{subreddit}...")
                raw_data_cache[subreddit] = await fetch_subreddit_data(
                    reddit_client, subreddit, pull_config,
                )

        # Step 2: For each backfill date, run LLM analysis
        for snap_date in dates_to_run:
            print(f"\n  --- Backfill: {snap_date} ---")

            for sub_config in subreddits:
                subreddit = sub_config["subreddit"]
                raw_data = raw_data_cache.get(subreddit)
                if not raw_data:
                    continue

                sub_dir = SNAPSHOTS_DIR / snap_date / f"r_{subreddit}"
                community_dir = sub_dir / "community"
                community_dir.mkdir(parents=True, exist_ok=True)

                # Save raw data copy for this date
                raw_path = sub_dir / "raw_data.json"
                if not raw_path.exists():
                    save_atomic(raw_path, raw_data)
                    save_atomic(sub_dir / "metadata.json", {
                        "date": snap_date,
                        "subreddit": subreddit,
                        "post_count": len(raw_data.get("posts", [])),
                        "comment_count": len(raw_data.get("comments", [])),
                        "fetched_at": now_iso(),
                        "backfill": True,
                    })

                # Community profile
                profile_path = community_dir / "community_profile.json"
                community_profile = None
                if needs_profile_update(profile_path):
                    print(f"    Generating community profile for r/{subreddit}...")
                    community_profile = generate_community_profile(
                        claude_client, raw_data, subreddit, snap_date, community_dir,
                    )
                else:
                    community_profile = load_json(profile_path)

                # Per-brand analysis
                for brand in brands:
                    brand_id = brand["brand_id"]
                    brand_dir = sub_dir / "brands" / brand_id
                    brand_dir.mkdir(parents=True, exist_ok=True)

                    print(f"    {brand['brand_name']} in r/{subreddit}...")

                    try:
                        classification = classify_brand_mentions(
                            claude_client, raw_data, brand,
                            subreddit, snap_date, brand_dir,
                        )
                        mentions = classification.get("mention_count", 0)

                        deep_analysis = analyze_mentions_deeply(
                            claude_client, classification, brand,
                            subreddit, snap_date, brand_dir,
                            community_profile=community_profile,
                        )

                        synthesis = synthesize_brand(
                            claude_client, deep_analysis, classification,
                            brand, subreddit, snap_date, brand_dir,
                            community_profile=community_profile,
                        )
                        score = synthesis.get("undercurrent_score", 0)
                        status = synthesis.get("status_tag", "?")
                        print(f"      → {mentions} mentions, score={score} ({status})")

                    except Exception as e:
                        print(f"      ERROR: {e}")

            # Rate limit between dates
            print(f"  Pausing 5s between dates to be kind to the API...")
            await asyncio.sleep(5)

        # Step 3: Run trend analysis for each brand
        print(f"\n  Running trend analysis...")
        for brand in brands:
            brand_id = brand["brand_id"]
            trend_dir = TRENDS_DIR / brand_id
            trend_dir.mkdir(parents=True, exist_ok=True)

            # Get all dates that now have data
            all_dates = sorted([
                d.name for d in SNAPSHOTS_DIR.iterdir() if d.is_dir()
            ]) if SNAPSHOTS_DIR.exists() else []

            # Find latest date with data for this brand
            latest_date = None
            for d in reversed(all_dates):
                for sub_config in subreddits:
                    sub = sub_config["subreddit"]
                    synth_path = SNAPSHOTS_DIR / d / f"r_{sub}" / "brands" / brand_id / "synthesis.json"
                    if synth_path.exists():
                        latest_date = d
                        break
                if latest_date:
                    break

            if not latest_date:
                continue

            # Load current synthesis
            current_syntheses = []
            for sub_config in subreddits:
                sub = sub_config["subreddit"]
                synth_path = SNAPSHOTS_DIR / latest_date / f"r_{sub}" / "brands" / brand_id / "synthesis.json"
                data = load_json(synth_path)
                if data:
                    current_syntheses.append(data)

            if not current_syntheses:
                continue

            avg_score = round(
                sum(s.get("undercurrent_score", 0) for s in current_syntheses)
                / len(current_syntheses)
            )
            current_agg = {
                "snapshot_date": latest_date,
                "undercurrent_score": avg_score,
                "status_tag": current_syntheses[0].get("status_tag", "stable"),
                "narrative_summary": current_syntheses[0].get("narrative_summary", ""),
                "community_alignment": current_syntheses[0].get("community_alignment", {}),
            }

            prior = load_prior_syntheses(brand_id, subreddit_names, latest_date, SNAPSHOTS_DIR)
            print(f"    {brand['brand_name']}: {len(prior)} prior weeks")

            try:
                # Delete existing trend data to force regeneration
                trend_path = trend_dir / "trend_data.json"
                if trend_path.exists():
                    trend_path.unlink()

                result = analyze_trends(
                    claude_client, brand, current_agg, prior, trend_dir,
                )
                if result:
                    print(f"    → trajectory: {result.get('trajectory', '?')}")
            except Exception as e:
                print(f"    ERROR: {e}")

    # Generate manifest
    print(f"\n  Generating manifest...")
    from scripts.weekly_pipeline import generate_manifest
    manifest = generate_manifest(config, SNAPSHOTS_DIR, TRENDS_DIR)
    save_atomic(DATA_DIR / "manifest.json", manifest)

    duration = round(time.monotonic() - t_start, 1)
    print(f"\n{'='*60}")
    print(f"Backfill complete in {duration}s")
    print(cost_tracker.summary())
    print(f"{'='*60}")


def main():
    parser = argparse.ArgumentParser(description="Backfill historical data")
    parser.add_argument("--weeks", type=int, default=4, help="Number of past weeks to generate (default: 4)")
    parser.add_argument("--project", type=str, help="Run for a specific project only")
    args = parser.parse_args()

    asyncio.run(run_backfill(weeks=args.weeks, target_project=args.project))


if __name__ == "__main__":
    main()
