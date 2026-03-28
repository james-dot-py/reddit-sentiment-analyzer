#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Weekly brand intelligence pipeline.

Orchestrates the full pipeline: Reddit data pull ->local NLP ->community
profile ->brand classification ->deep analysis ->synthesis ->trends ->manifest.

Collection strategy (recall-over-precision):
  1. Fetch top/week listing for each subreddit (existing broad context)
  2. For each brand × subreddit: search by brand name + aliases (both
     relevance and new sorts) to catch the long tail of organic mentions
  3. Deduplicate all posts by Reddit fullname ID (t3_)
  4. For brand-matching search posts: fetch FULL comment trees
  5. For top listing posts: fetch comments on top 50 (as before)
  6. Track post metadata (score, upvote_ratio, num_comments) for temporal signals

The pipeline is idempotent and resumable -- checkpoint files track progress
so a crash mid-run can pick up where it left off.

Usage:
    python scripts/weekly_pipeline.py                          # all projects
    python scripts/weekly_pipeline.py --project demo-skincare  # one project
    python scripts/weekly_pipeline.py --date 2026-02-27        # override date
    python scripts/weekly_pipeline.py --dry-run                # print plan only
    python scripts/weekly_pipeline.py --skip-scrape            # reuse existing raw data
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

from backend.app.claude_client import ClaudeClient, CostTracker
from backend.app.reddit_client import RedditClient
from backend.app.models import RedditPost, RedditComment, SortMethod, TimeFilter
from backend.app.pipeline.stage2_classification import classify_brand_mentions
from backend.app.pipeline.stage3_deep_analysis import analyze_mentions_deeply
from backend.app.pipeline.stage4_synthesis import synthesize_brand
from backend.app.pipeline.stage5_trends import analyze_trends, load_prior_syntheses
from backend.app.pipeline.community_profile import (
    generate_community_profile,
    needs_profile_update,
)
from backend.app.pipeline.utils import load_json, save_atomic, now_iso

logger = logging.getLogger(__name__)

CONFIG_PATH = PROJECT_ROOT / "config" / "projects.json"
DATA_DIR = PROJECT_ROOT / "data"
SNAPSHOTS_DIR = DATA_DIR / "snapshots"
TRENDS_DIR = DATA_DIR / "trends"

INTER_SUBREDDIT_DELAY = 2  # seconds between subreddits


# -- Post deduplication ---------------------------------------------------

def dedup_posts(
    posts: list[RedditPost],
) -> list[RedditPost]:
    """Deduplicate posts by ID. When a post appears from multiple sources,
    keep the version with the most metadata (highest score wins as a proxy
    for 'most recent fetch'). Preserves source tag from first discovery."""
    seen: dict[str, RedditPost] = {}
    for post in posts:
        if post.id not in seen:
            seen[post.id] = post
        else:
            existing = seen[post.id]
            # Upsert: update metadata if the new version has fresher data
            if post.score > existing.score or post.num_comments > existing.num_comments:
                # Keep the original source tag (how we first found it)
                post.source = existing.source
                seen[post.id] = post
    return list(seen.values())


def dedup_comments(comments: list[RedditComment]) -> list[RedditComment]:
    """Deduplicate comments by ID."""
    seen: dict[str, RedditComment] = {}
    for comment in comments:
        if comment.id not in seen:
            seen[comment.id] = comment
        else:
            existing = seen[comment.id]
            if comment.score > existing.score:
                seen[comment.id] = comment
    return list(seen.values())


# -- Search query builder -------------------------------------------------

def build_search_queries(brand: dict) -> list[str]:
    """Build search query strings for a brand.

    Generates queries from the brand name and aliases. Each alias is
    double-quoted for exact matching. Short aliases (≤2 chars like 'TO')
    are skipped to avoid noise.

    Returns a list of query strings to run (usually 1-2).
    """
    terms = []
    brand_name = brand["brand_name"]
    aliases = brand.get("aliases", [])

    # Primary brand name always included
    terms.append(f'"{brand_name}"')

    # Add aliases that are distinct from the brand name and long enough
    for alias in aliases:
        alias_clean = alias.strip()
        if len(alias_clean) <= 2:
            continue  # Skip very short aliases (too noisy)
        if alias_clean.lower() == brand_name.lower():
            continue  # Skip duplicates
        terms.append(f'"{alias_clean}"')

    # Combine into OR queries, batching if needed
    # Reddit search supports OR operator
    # Keep queries under ~200 chars to avoid URL issues
    queries = []
    current = []
    current_len = 0

    for term in terms:
        if current_len + len(term) + 4 > 180 and current:  # 4 for " OR "
            queries.append(" OR ".join(current))
            current = []
            current_len = 0
        current.append(term)
        current_len += len(term) + 4

    if current:
        queries.append(" OR ".join(current))

    return queries


# -- Poll data merging ----------------------------------------------------

POLLS_DIR = DATA_DIR / "polls"


def load_poll_posts(subreddit: str, snap_date: str) -> list[RedditPost]:
    """Load all poll data for a subreddit from this week's polls.

    Scans data/polls/{date}/{hour}/r_{subreddit}/poll_data.json for all
    dates in the current week window, merges and deduplicates.
    """
    poll_posts: list[RedditPost] = []

    if not POLLS_DIR.exists():
        return poll_posts

    # Scan all date directories (polls may span multiple days)
    for date_dir in POLLS_DIR.iterdir():
        if not date_dir.is_dir():
            continue
        # Only include polls from the last 7 days
        if date_dir.name > snap_date:
            continue

        for hour_dir in date_dir.iterdir():
            if not hour_dir.is_dir():
                continue
            poll_path = hour_dir / f"r_{subreddit}" / "poll_data.json"
            data = load_json(poll_path)
            if not data:
                continue

            for post_data in data.get("posts", []):
                try:
                    poll_posts.append(RedditPost(**post_data))
                except Exception:
                    continue  # Skip malformed entries

    return poll_posts


# -- Enhanced Reddit data fetching ----------------------------------------

async def fetch_subreddit_data(
    client: RedditClient,
    subreddit: str,
    pull_config: dict,
    brands: list[dict],
    checkpoint: dict | None = None,
) -> dict:
    """Fetch raw posts and comments using listing + search-based collection.

    Strategy:
      1. Fetch top/week listing (broad context, catches popular posts)
      2. For each brand: search by name + aliases, both relevance and new sorts
      3. Deduplicate all posts by ID
      4. Fetch full comment trees for search-matched posts (brand-relevant)
      5. Fetch top-50 comments for listing posts (context)

    Args:
        client: RedditClient instance
        subreddit: Subreddit name
        pull_config: Config dict with post_limit, comment_depth, etc.
        brands: List of brand dicts with brand_name, aliases
        checkpoint: Optional checkpoint dict for resumability

    Returns:
        Dict with posts, comments, and collection_metrics.
    """
    post_limit = pull_config.get("post_limit", 200)
    comment_depth = pull_config.get("comment_depth", 3)
    sort = pull_config.get("sort", "top")
    time_filter_str = pull_config.get("time_filter", "week")
    time_filter = TimeFilter(time_filter_str)

    all_posts: list[RedditPost] = []
    all_comments: list[RedditComment] = []
    search_post_ids: set[str] = set()  # Track which posts came from search

    # Restore from checkpoint if available
    checkpoint = checkpoint or {}
    completed_steps = set(checkpoint.get("completed_steps", []))

    # -- Step 1: Listing fetch (top/week) -----------------------------
    step_key = "listing"
    if step_key not in completed_steps:
        print(f"    [listing] Fetching {post_limit} posts ({sort}/{time_filter_str})...")
        listing_posts = await client.fetch_posts(
            subreddit=subreddit,
            sort=SortMethod(sort),
            time_filter=time_filter,
            limit=post_limit,
        )
        for p in listing_posts:
            p.source = "listing"
        all_posts.extend(listing_posts)
        print(f"    [listing] Got {len(listing_posts)} posts.")
        completed_steps.add(step_key)
    else:
        print(f"    [listing] Skipped (checkpoint).")

    # -- Step 1b: Merge poll data ------------------------------------
    poll_posts = load_poll_posts(subreddit, checkpoint.get("snap_date", ""))
    if poll_posts:
        print(f"    [polls] Merging {len(poll_posts)} posts from poll data")
        all_posts.extend(poll_posts)

    # -- Step 2: Search-based collection per brand --------------------
    for brand in brands:
        brand_name = brand["brand_name"]
        queries = build_search_queries(brand)

        for query in queries:
            for search_sort in ("relevance", "new"):
                step_key = f"search_{brand['brand_id']}_{search_sort}_{query[:30]}"
                if step_key in completed_steps:
                    print(f"    [search] Skipped {brand_name} {search_sort} (checkpoint)")
                    continue

                print(f"    [search] {brand_name} sort={search_sort} q={query[:50]}...")
                search_posts = await client.fetch_search(
                    subreddit=subreddit,
                    query=query,
                    sort=search_sort,
                    time_filter=time_filter,
                    limit=100,
                )
                for p in search_posts:
                    p.source = f"search_{search_sort}"
                    search_post_ids.add(p.id)

                all_posts.extend(search_posts)
                print(f"    [search] Got {len(search_posts)} posts.")
                completed_steps.add(step_key)

                await asyncio.sleep(client._rate_limit_delay)

    # -- Step 3: Deduplicate ------------------------------------------
    pre_dedup = len(all_posts)
    all_posts = dedup_posts(all_posts)
    post_dedup_delta = pre_dedup - len(all_posts)
    print(f"    [dedup] {pre_dedup} ->{len(all_posts)} posts ({post_dedup_delta} duplicates removed)")

    # -- Step 4: Comment fetching -------------------------------------
    # Brand-relevant posts (from search): fetch FULL comment tree
    # Listing-only posts: fetch comments on top 50 by score
    step_key = "comments"
    if step_key not in completed_steps:
        # Separate search-matched posts from listing-only
        search_matched = [p for p in all_posts if p.id in search_post_ids]
        listing_only = [p for p in all_posts if p.id not in search_post_ids]

        # Full comment trees for ALL search-matched posts
        if search_matched:
            print(f"    [comments] Full trees for {len(search_matched)} search-matched posts (depth={comment_depth})...")
            for i, post in enumerate(search_matched):
                post_comments = await client.fetch_comments(
                    subreddit, post.id, depth=comment_depth,
                )
                all_comments.extend(post_comments)
                await asyncio.sleep(client._rate_limit_delay)
                if (i + 1) % 20 == 0:
                    print(f"    [comments] ... {i + 1}/{len(search_matched)} search posts done")

        # Top-50 listing posts by score (for broader context)
        listing_sorted = sorted(listing_only, key=lambda p: p.score, reverse=True)
        listing_to_fetch = listing_sorted[:50]
        if listing_to_fetch:
            print(f"    [comments] Top {len(listing_to_fetch)} listing posts (depth={comment_depth})...")
            for i, post in enumerate(listing_to_fetch):
                post_comments = await client.fetch_comments(
                    subreddit, post.id, depth=comment_depth,
                )
                all_comments.extend(post_comments)
                await asyncio.sleep(client._rate_limit_delay)
                if (i + 1) % 20 == 0:
                    print(f"    [comments] ... {i + 1}/{len(listing_to_fetch)} listing posts done")

        completed_steps.add(step_key)
    else:
        print(f"    [comments] Skipped (checkpoint).")

    # Deduplicate comments
    pre_dedup_comments = len(all_comments)
    all_comments = dedup_comments(all_comments)
    print(f"    [dedup] {pre_dedup_comments} ->{len(all_comments)} comments")

    # -- Collection metrics -------------------------------------------
    source_counts = {}
    for p in all_posts:
        source_counts[p.source] = source_counts.get(p.source, 0) + 1

    collection_metrics = {
        "total_posts": len(all_posts),
        "total_comments": len(all_comments),
        "posts_by_source": source_counts,
        "posts_from_search": len([p for p in all_posts if p.id in search_post_ids]),
        "posts_from_listing_only": len([p for p in all_posts if p.id not in search_post_ids]),
        "duplicates_removed": post_dedup_delta,
        "search_queries_run": len([s for s in completed_steps if s.startswith("search_")]),
        "request_metrics": client.metrics.summary(),
    }

    print(f"    [metrics] {collection_metrics['total_posts']} posts "
          f"({collection_metrics['posts_from_search']} from search, "
          f"{collection_metrics['posts_from_listing_only']} listing-only), "
          f"{collection_metrics['total_comments']} comments")

    return {
        "subreddit": subreddit,
        "posts": [p.model_dump() for p in all_posts],
        "comments": [c.model_dump() for c in all_comments],
        "collection_metrics": collection_metrics,
    }


# -- Pipeline orchestration ------------------------------------------------

async def run_pipeline(
    config: dict,
    snap_date: str,
    dry_run: bool = False,
    skip_scrape: bool = False,
    target_project: str | None = None,
) -> None:
    """Run the full weekly pipeline for all configured projects."""
    projects = config.get("projects", [])
    if target_project:
        projects = [p for p in projects if p["project_id"] == target_project]
        if not projects:
            print(f"Project '{target_project}' not found in config.")
            return

    if dry_run:
        _print_dry_run(projects, snap_date)
        return

    cost_tracker = CostTracker()
    claude_client = ClaudeClient(cost_tracker=cost_tracker)
    reddit_client = RedditClient()

    pipeline_errors: list[dict] = []
    t_start = time.monotonic()

    for project in projects:
        project_id = project["project_id"]
        brands = project["brands"]
        subreddits = project["subreddits"]
        subreddit_names = [s["subreddit"] for s in subreddits]

        print(f"\n{'='*60}")
        print(f"Project: {project['project_name']} ({project_id})")
        print(f"  Brands: {', '.join(b['brand_name'] for b in brands)}")
        print(f"  Subreddits: {', '.join(subreddit_names)}")
        print(f"  Search queries per sub: {sum(len(build_search_queries(b)) for b in brands)} "
              f"× 2 sorts = {sum(len(build_search_queries(b)) for b in brands) * 2}")
        print(f"{'='*60}")

        for sub_config in subreddits:
            subreddit = sub_config["subreddit"]
            pull_config = sub_config.get("pull_config", {})
            sub_dir = SNAPSHOTS_DIR / snap_date / f"r_{subreddit}"
            community_dir = sub_dir / "community"
            community_dir.mkdir(parents=True, exist_ok=True)

            print(f"\n  r/{subreddit}")
            print(f"  {'-'*40}")

            # -- Step 1: Fetch raw data ------------------------------
            raw_data_path = sub_dir / "raw_data.json"
            checkpoint_path = sub_dir / "checkpoint.json"
            raw_data = None

            if skip_scrape:
                raw_data = load_json(raw_data_path)
                if raw_data:
                    print(f"    Using existing raw data ({len(raw_data.get('posts', []))} posts)")
                else:
                    print(f"    No existing raw data found, fetching...")

            if raw_data is None:
                try:
                    # Load checkpoint for resumability
                    checkpoint = load_json(checkpoint_path)

                    raw_data = await fetch_subreddit_data(
                        reddit_client, subreddit, pull_config,
                        brands=brands,
                        checkpoint=checkpoint,
                    )
                    save_atomic(raw_data_path, raw_data)

                    # Save metadata
                    metadata = {
                        "date": snap_date,
                        "subreddit": subreddit,
                        "post_count": len(raw_data.get("posts", [])),
                        "comment_count": len(raw_data.get("comments", [])),
                        "collection_metrics": raw_data.get("collection_metrics", {}),
                        "fetched_at": now_iso(),
                    }
                    save_atomic(sub_dir / "metadata.json", metadata)

                    # Clear checkpoint on success
                    if checkpoint_path.exists():
                        checkpoint_path.unlink()

                except Exception as e:
                    msg = f"Scrape error r/{subreddit}: {e}"
                    print(f"    ERROR: {msg}")
                    logger.error(msg, exc_info=True)
                    pipeline_errors.append({
                        "stage": "scrape", "subreddit": subreddit,
                        "error": str(e), "timestamp": now_iso(),
                    })
                    continue

            # -- Step 2: Community profile ----------------------------
            profile_path = community_dir / "community_profile.json"
            community_profile = None
            if needs_profile_update(profile_path):
                print(f"    Generating community profile...")
                community_profile = generate_community_profile(
                    claude_client, raw_data, subreddit, snap_date, community_dir,
                )
            else:
                community_profile = load_json(profile_path)
                print(f"    Community profile up to date.")

            # -- Step 3: Per-brand LLM analysis ----------------------
            for brand in brands:
                brand_id = brand["brand_id"]
                brand_dir = sub_dir / "brands" / brand_id
                brand_dir.mkdir(parents=True, exist_ok=True)

                print(f"\n    Brand: {brand['brand_name']} ({brand_id})")

                try:
                    # Stage 2: Classification (Haiku)
                    print(f"      Stage 2: Classification...")
                    classification = classify_brand_mentions(
                        claude_client, raw_data, brand,
                        subreddit, snap_date, brand_dir,
                    )
                    mention_count = classification.get("mention_count", 0)
                    print(f"      ->{mention_count} mentions found")

                    # Stage 3: Deep Analysis (Sonnet)
                    print(f"      Stage 3: Deep analysis...")
                    deep_analysis = analyze_mentions_deeply(
                        claude_client, classification, brand,
                        subreddit, snap_date, brand_dir,
                        community_profile=community_profile,
                    )
                    analyzed_count = len(deep_analysis.get("analyzed_mentions", []))
                    print(f"      ->{analyzed_count} mentions analyzed")

                    # Stage 4: Synthesis + Score
                    print(f"      Stage 4: Synthesis...")
                    synthesis = synthesize_brand(
                        claude_client, deep_analysis, classification,
                        brand, subreddit, snap_date, brand_dir,
                        community_profile=community_profile,
                    )
                    score = synthesis.get("undercurrent_score", 0)
                    status = synthesis.get("status_tag", "?")
                    print(f"      ->Score: {score} ({status})")

                    # Emergency community profile refresh
                    prior = _get_prior_week_score(
                        brand_id, subreddit, snap_date, SNAPSHOTS_DIR,
                    )
                    if prior is not None and abs(score - prior) > 10:
                        print(f"      [!] Score change >{10} -- refreshing community profile")
                        generate_community_profile(
                            claude_client, raw_data, subreddit,
                            snap_date, community_dir, force=True,
                        )

                except Exception as e:
                    msg = f"Pipeline error {brand_id} in r/{subreddit}: {e}"
                    print(f"      ERROR: {msg}")
                    logger.error(msg, exc_info=True)
                    pipeline_errors.append({
                        "stage": "brand_analysis", "brand_id": brand_id,
                        "subreddit": subreddit, "error": str(e),
                        "timestamp": now_iso(),
                    })

        # -- Step 4: Cross-week trends per brand ---------------------
        print(f"\n  Trend analysis")
        print(f"  {'-'*40}")
        for brand in brands:
            brand_id = brand["brand_id"]
            trend_dir = TRENDS_DIR / brand_id
            trend_dir.mkdir(parents=True, exist_ok=True)

            # Aggregate current week's synthesis across subreddits
            current_syntheses = []
            for sub_config in subreddits:
                sub = sub_config["subreddit"]
                synth_path = (
                    SNAPSHOTS_DIR / snap_date / f"r_{sub}"
                    / "brands" / brand_id / "synthesis.json"
                )
                data = load_json(synth_path)
                if data:
                    current_syntheses.append(data)

            if not current_syntheses:
                print(f"    {brand['brand_name']}: no synthesis data, skipping trends")
                continue

            # Average current week across subreddits
            avg_score = round(
                sum(s.get("undercurrent_score", 0) for s in current_syntheses)
                / len(current_syntheses)
            )
            current_agg = {
                "snapshot_date": snap_date,
                "undercurrent_score": avg_score,
                "status_tag": current_syntheses[0].get("status_tag", "stable"),
                "narrative_summary": current_syntheses[0].get("narrative_summary", ""),
                "community_alignment": current_syntheses[0].get("community_alignment", {}),
            }

            prior = load_prior_syntheses(
                brand_id, subreddit_names, snap_date, SNAPSHOTS_DIR,
            )

            print(f"    {brand['brand_name']}: {len(prior)} prior weeks")
            try:
                result = analyze_trends(
                    claude_client, brand, current_agg, prior, trend_dir,
                )
                if result:
                    print(f"    ->trajectory: {result.get('trajectory', '?')}")
                else:
                    print(f"    ->skipped (insufficient data)")
            except Exception as e:
                print(f"    ERROR: {e}")
                pipeline_errors.append({
                    "stage": "trends", "brand_id": brand_id,
                    "error": str(e), "timestamp": now_iso(),
                })

    # -- Step 5: Generate manifest -------------------------------------
    print(f"\n  Generating manifest...")
    manifest = generate_manifest(config, SNAPSHOTS_DIR, TRENDS_DIR)
    save_atomic(DATA_DIR / "manifest.json", manifest)

    # -- Step 6: Save errors if any ------------------------------------
    if pipeline_errors:
        save_atomic(DATA_DIR / "pipeline_errors.json", pipeline_errors)

    # -- Step 7: Save collection run log -------------------------------
    run_log = {
        "date": snap_date,
        "completed_at": now_iso(),
        "duration_seconds": round(time.monotonic() - t_start, 1),
        "projects_run": len(projects),
        "errors": len(pipeline_errors),
        "request_metrics": reddit_client.metrics.summary(),
        "cost_summary": cost_tracker.summary(),
    }
    run_log_dir = DATA_DIR / "run_logs"
    run_log_dir.mkdir(parents=True, exist_ok=True)
    save_atomic(run_log_dir / f"run_{snap_date}.json", run_log)

    # -- Summary -------------------------------------------------------
    duration = round(time.monotonic() - t_start, 1)
    metrics = reddit_client.metrics
    print(f"\n{'='*60}")
    print(f"Pipeline complete in {duration}s")
    print(f"  Requests: {metrics.requests} ({metrics.retries} retries, {metrics.errors} errors)")
    print(f"  Posts: {metrics.posts_fetched} | Comments: {metrics.comments_fetched}")
    print(f"  Search requests: {metrics.search_requests}")
    print(cost_tracker.summary())
    if pipeline_errors:
        print(f"  Errors: {len(pipeline_errors)}")
    print(f"{'='*60}")


# -- Manifest generation ---------------------------------------------------

def generate_manifest(
    config: dict,
    snapshots_dir: Path,
    trends_dir: Path,
) -> dict:
    """Generate data/manifest.json -- the index used by API endpoints."""
    # Find all available weeks
    available_weeks = sorted(
        [d.name for d in snapshots_dir.iterdir() if d.is_dir()]
    ) if snapshots_dir.exists() else []

    projects = {}
    for project in config.get("projects", []):
        project_id = project["project_id"]
        brands_manifest = {}
        subreddits_manifest = {}

        # Status severity order (worst first) -- matches dashboard logic
        _status_order = [
            "crisis", "declining", "at_risk", "watch",
            "stable", "positive", "thriving",
        ]

        for brand in project["brands"]:
            brand_id = brand["brand_id"]
            weeks_available = []
            latest_score = None
            latest_status = None

            for week in available_weeks:
                # Collect scores across all subreddits for this week
                week_scores: list[int] = []
                week_statuses: list[str] = []

                for sub_config in project["subreddits"]:
                    sub = sub_config["subreddit"]
                    synth_path = (
                        snapshots_dir / week / f"r_{sub}"
                        / "brands" / brand_id / "synthesis.json"
                    )
                    if synth_path.exists():
                        data = load_json(synth_path)
                        if data:
                            week_scores.append(
                                data.get("undercurrent_score", 0)
                            )
                            week_statuses.append(
                                data.get("status_tag", "stable")
                            )

                if week_scores:
                    if week not in weeks_available:
                        weeks_available.append(week)
                    latest_score = int(
                        sum(week_scores) / len(week_scores) + 0.5
                    )
                    for s in _status_order:
                        if s in week_statuses:
                            latest_status = s
                            break
                    else:
                        latest_status = "stable"

            brands_manifest[brand_id] = {
                "brand_name": brand["brand_name"],
                "is_competitor": brand.get("is_competitor", False),
                "weeks_available": weeks_available,
                "latest_score": latest_score,
                "latest_status": latest_status,
            }

        for sub_config in project["subreddits"]:
            sub = sub_config["subreddit"]
            weeks_available = []
            profile_date = None

            for week in available_weeks:
                sub_dir = snapshots_dir / week / f"r_{sub}"
                if sub_dir.exists():
                    weeks_available.append(week)

                profile_path = sub_dir / "community" / "community_profile.json"
                profile = load_json(profile_path)
                if profile:
                    profile_date = profile.get("profile_date", "")

            subreddits_manifest[sub] = {
                "weeks_available": weeks_available,
                "community_profile_date": profile_date,
            }

        projects[project_id] = {
            "project_name": project["project_name"],
            "brands": brands_manifest,
            "subreddits": subreddits_manifest,
        }

    return {
        "last_updated": now_iso(),
        "last_pipeline_status": "complete",
        "available_weeks": available_weeks,
        "projects": projects,
    }


# -- Helpers ---------------------------------------------------------------

def _get_prior_week_score(
    brand_id: str, subreddit: str, current_date: str, snapshots_dir: Path,
) -> int | None:
    """Get the most recent prior week's score for emergency detection."""
    if not snapshots_dir.exists():
        return None

    prior_dates = sorted(
        [d.name for d in snapshots_dir.iterdir()
         if d.is_dir() and d.name < current_date],
        reverse=True,
    )
    if not prior_dates:
        return None

    synth_path = (
        snapshots_dir / prior_dates[0] / f"r_{subreddit}"
        / "brands" / brand_id / "synthesis.json"
    )
    data = load_json(synth_path)
    if data:
        return data.get("undercurrent_score")
    return None


def _print_dry_run(projects: list[dict], snap_date: str) -> None:
    print(f"\nDry run -- pipeline plan for {snap_date}:\n")
    for project in projects:
        print(f"  Project: {project['project_name']}")
        for sub in project["subreddits"]:
            pc = sub.get("pull_config", {})
            print(f"    r/{sub['subreddit']} (limit={pc.get('post_limit', 200)})")
        for brand in project["brands"]:
            role = "competitor" if brand.get("is_competitor") else "primary"
            queries = build_search_queries(brand)
            print(f"    Brand: {brand['brand_name']} ({role})")
            for q in queries:
                print(f"      Search: {q}")
        print()

    # Estimate request count
    total_listing = sum(2 for p in projects for _ in p["subreddits"])  # 200 posts = 2 pages
    total_search = sum(
        len(build_search_queries(b)) * 2 * len(p["subreddits"])
        for p in projects for b in p["brands"]
    )
    total_comments = sum(len(p["subreddits"]) * 100 for p in projects)  # rough estimate
    print(f"  Estimated requests: ~{total_listing + total_search + total_comments}")
    print(f"  Estimated time at 1.2s/req: ~{(total_listing + total_search + total_comments) * 1.2 / 60:.0f} minutes")


# -- CLI entry point -------------------------------------------------------

def main():
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    )

    parser = argparse.ArgumentParser(
        description="Weekly brand intelligence pipeline",
    )
    parser.add_argument(
        "--project", type=str,
        help="Run a single project by ID (e.g., demo-skincare)",
    )
    parser.add_argument(
        "--date", type=str, default=date.today().isoformat(),
        help="Snapshot date (YYYY-MM-DD), defaults to today",
    )
    parser.add_argument(
        "--dry-run", action="store_true",
        help="Print plan without executing",
    )
    parser.add_argument(
        "--skip-scrape", action="store_true",
        help="Skip Reddit scraping, reuse existing raw data",
    )
    args = parser.parse_args()

    with open(CONFIG_PATH, encoding="utf-8") as f:
        config = json.load(f)

    asyncio.run(run_pipeline(
        config,
        snap_date=args.date,
        dry_run=args.dry_run,
        skip_scrape=args.skip_scrape,
        target_project=args.project,
    ))


if __name__ == "__main__":
    main()
