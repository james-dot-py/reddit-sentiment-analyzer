#!/usr/bin/env python3
"""Twice-daily /new polling for tracked brands.

Runs at ~10am and ~10pm UTC. For each monitored subreddit, fetches /new
and searches for brand mentions. Deduplicates against existing data by
Reddit fullname ID, upserts metadata on re-encountered posts.

This catches time-sensitive conversations (product launches, PR crises,
viral complaints) within hours instead of waiting for the weekly snapshot.

Data is saved to data/polls/{YYYY-MM-DD}/{HH}/r_{subreddit}/poll_data.json
and merged into the weekly snapshot during the next pipeline run.

Usage:
    python scripts/poll_new.py                          # all projects
    python scripts/poll_new.py --project demo-skincare  # one project
    python scripts/poll_new.py --date 2026-03-24        # override date
    python scripts/poll_new.py --dry-run                # print plan only
"""

from __future__ import annotations

import argparse
import asyncio
import json
import logging
import sys
import time
from datetime import date, datetime, timezone
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

from dotenv import load_dotenv
load_dotenv(str(PROJECT_ROOT / ".env"), override=True)

from backend.app.reddit_client import RedditClient
from backend.app.models import RedditPost, RedditComment, SortMethod, TimeFilter
from backend.app.pipeline.utils import load_json, save_atomic, now_iso

logger = logging.getLogger(__name__)

CONFIG_PATH = PROJECT_ROOT / "config" / "projects.json"
DATA_DIR = PROJECT_ROOT / "data"
POLLS_DIR = DATA_DIR / "polls"

INTER_SUBREDDIT_DELAY = 2  # seconds between subreddits


def build_search_queries(brand: dict) -> list[str]:
    """Build search query strings for a brand (same logic as weekly_pipeline)."""
    terms = []
    brand_name = brand["brand_name"]
    aliases = brand.get("aliases", [])

    terms.append(f'"{brand_name}"')

    for alias in aliases:
        alias_clean = alias.strip()
        if len(alias_clean) <= 2:
            continue
        if alias_clean.lower() == brand_name.lower():
            continue
        terms.append(f'"{alias_clean}"')

    queries = []
    current = []
    current_len = 0

    for term in terms:
        if current_len + len(term) + 4 > 180 and current:
            queries.append(" OR ".join(current))
            current = []
            current_len = 0
        current.append(term)
        current_len += len(term) + 4

    if current:
        queries.append(" OR ".join(current))

    return queries


def dedup_posts(posts: list[RedditPost]) -> list[RedditPost]:
    """Deduplicate posts by ID, keeping freshest metadata."""
    seen: dict[str, RedditPost] = {}
    for post in posts:
        if post.id not in seen:
            seen[post.id] = post
        else:
            existing = seen[post.id]
            if post.score > existing.score or post.num_comments > existing.num_comments:
                post.source = existing.source
                seen[post.id] = post
    return list(seen.values())


def load_known_post_ids(polls_dir: Path, snap_date: str) -> set[str]:
    """Load post IDs from all polls for this date to track new vs. updated."""
    known_ids: set[str] = set()
    date_dir = polls_dir / snap_date
    if not date_dir.exists():
        return known_ids

    for hour_dir in date_dir.iterdir():
        if not hour_dir.is_dir():
            continue
        for sub_dir in hour_dir.iterdir():
            poll_path = sub_dir / "poll_data.json"
            data = load_json(poll_path)
            if data:
                for post in data.get("posts", []):
                    known_ids.add(post.get("id", ""))

    return known_ids


async def poll_subreddit(
    client: RedditClient,
    subreddit: str,
    brands: list[dict],
    known_ids: set[str],
) -> dict:
    """Poll /new for a subreddit and search for brand mentions.

    Returns dict with posts, comments, and poll metrics.
    """
    all_posts: list[RedditPost] = []

    # Step 1: Fetch /new (last 100 posts -- catches everything from last ~12 hours)
    print(f"    [/new] Fetching latest posts...")
    new_posts = await client.fetch_posts(
        subreddit=subreddit,
        sort=SortMethod.new,
        time_filter=TimeFilter.day,  # not used for /new but required
        limit=100,
    )
    for p in new_posts:
        p.source = "poll_new"
    all_posts.extend(new_posts)
    print(f"    [/new] Got {len(new_posts)} posts.")

    # Step 2: Search for each brand (new sort, last day)
    for brand in brands:
        brand_name = brand["brand_name"]
        queries = build_search_queries(brand)

        for query in queries:
            print(f"    [search] {brand_name} q={query[:50]}...")
            search_posts = await client.fetch_search(
                subreddit=subreddit,
                query=query,
                sort="new",
                time_filter=TimeFilter.day,
                limit=50,
            )
            for p in search_posts:
                p.source = "poll_search"
            all_posts.extend(search_posts)
            print(f"    [search] Got {len(search_posts)} posts.")
            await asyncio.sleep(client._rate_limit_delay)

    # Deduplicate
    pre_dedup = len(all_posts)
    all_posts = dedup_posts(all_posts)
    print(f"    [dedup] {pre_dedup} -> {len(all_posts)} posts")

    # Classify as new vs. updated
    new_count = sum(1 for p in all_posts if p.id not in known_ids)
    updated_count = len(all_posts) - new_count

    # Fetch comments for brand-matching search results only (light touch)
    comments: list[RedditComment] = []
    search_matched = [p for p in all_posts if p.source in ("poll_search",)]
    if search_matched:
        print(f"    [comments] Fetching comments for {len(search_matched)} search-matched posts...")
        for post in search_matched[:25]:  # Cap at 25 to keep polls fast
            post_comments = await client.fetch_comments(
                subreddit, post.id, depth=3,
            )
            comments.extend(post_comments)
            await asyncio.sleep(client._rate_limit_delay)

    return {
        "subreddit": subreddit,
        "posts": [p.model_dump() for p in all_posts],
        "comments": [c.model_dump() for c in comments],
        "poll_metrics": {
            "total_posts": len(all_posts),
            "new_posts": new_count,
            "updated_posts": updated_count,
            "comments_fetched": len(comments),
            "search_matched": len(search_matched),
        },
    }


async def run_poll(
    config: dict,
    snap_date: str,
    dry_run: bool = False,
    target_project: str | None = None,
) -> None:
    """Run the twice-daily poll for all configured projects."""
    projects = config.get("projects", [])
    if target_project:
        projects = [p for p in projects if p["project_id"] == target_project]
        if not projects:
            print(f"Project '{target_project}' not found in config.")
            return

    hour_tag = datetime.now(timezone.utc).strftime("%H")

    if dry_run:
        print(f"\nDry run -- poll plan for {snap_date} {hour_tag}:00 UTC:\n")
        for project in projects:
            print(f"  Project: {project['project_name']}")
            for sub in project["subreddits"]:
                print(f"    r/{sub['subreddit']}: /new(100) + search per brand")
            for brand in project["brands"]:
                queries = build_search_queries(brand)
                print(f"    Brand: {brand['brand_name']} -> {queries}")
        return

    client = RedditClient()
    t_start = time.monotonic()
    errors: list[dict] = []

    # Load known post IDs for new vs. updated tracking
    known_ids = load_known_post_ids(POLLS_DIR, snap_date)
    print(f"Known post IDs from today's polls: {len(known_ids)}")

    for project in projects:
        project_id = project["project_id"]
        brands = project["brands"]
        subreddits = project["subreddits"]

        print(f"\n{'='*60}")
        print(f"Project: {project['project_name']} ({project_id})")
        print(f"{'='*60}")

        for sub_config in subreddits:
            subreddit = sub_config["subreddit"]
            poll_dir = POLLS_DIR / snap_date / hour_tag / f"r_{subreddit}"
            poll_dir.mkdir(parents=True, exist_ok=True)

            print(f"\n  r/{subreddit}")
            print(f"  {'-'*40}")

            try:
                poll_data = await poll_subreddit(
                    client, subreddit, brands, known_ids,
                )

                save_atomic(poll_dir / "poll_data.json", poll_data)

                # Update known IDs for subsequent subreddits
                for post in poll_data.get("posts", []):
                    known_ids.add(post.get("id", ""))

                metrics = poll_data["poll_metrics"]
                print(f"    Done: {metrics['total_posts']} posts "
                      f"({metrics['new_posts']} new, {metrics['updated_posts']} updated), "
                      f"{metrics['comments_fetched']} comments")

            except Exception as e:
                msg = f"Poll error r/{subreddit}: {e}"
                print(f"    ERROR: {msg}")
                logger.error(msg, exc_info=True)
                errors.append({
                    "subreddit": subreddit,
                    "error": str(e),
                    "timestamp": now_iso(),
                })

            await asyncio.sleep(INTER_SUBREDDIT_DELAY)

    # Save poll run log
    duration = round(time.monotonic() - t_start, 1)
    run_log = {
        "date": snap_date,
        "hour": hour_tag,
        "completed_at": now_iso(),
        "duration_seconds": duration,
        "request_metrics": client.metrics.summary(),
        "errors": len(errors),
    }
    run_log_dir = DATA_DIR / "run_logs"
    run_log_dir.mkdir(parents=True, exist_ok=True)
    save_atomic(run_log_dir / f"poll_{snap_date}_{hour_tag}.json", run_log)

    print(f"\n{'='*60}")
    print(f"Poll complete in {duration}s")
    metrics = client.metrics
    print(f"  Requests: {metrics.requests} ({metrics.retries} retries, {metrics.errors} errors)")
    print(f"  Posts: {metrics.posts_fetched} | Comments: {metrics.comments_fetched}")
    if errors:
        print(f"  Errors: {len(errors)}")
    print(f"{'='*60}")


def main():
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    )

    parser = argparse.ArgumentParser(
        description="Twice-daily /new poll for brand mentions",
    )
    parser.add_argument(
        "--project", type=str,
        help="Poll a single project by ID",
    )
    parser.add_argument(
        "--date", type=str, default=date.today().isoformat(),
        help="Date tag (YYYY-MM-DD), defaults to today",
    )
    parser.add_argument(
        "--dry-run", action="store_true",
        help="Print plan without fetching",
    )
    args = parser.parse_args()

    with open(CONFIG_PATH, encoding="utf-8") as f:
        config = json.load(f)

    asyncio.run(run_poll(
        config,
        snap_date=args.date,
        dry_run=args.dry_run,
        target_project=args.project,
    ))


if __name__ == "__main__":
    main()
