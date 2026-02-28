#!/usr/bin/env python3
"""Weekly brand intelligence pipeline.

Orchestrates the full pipeline: Reddit data pull → local NLP → community
profile → brand classification → deep analysis → synthesis → trends → manifest.

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
load_dotenv(PROJECT_ROOT / ".env")

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

logger = logging.getLogger(__name__)

CONFIG_PATH = PROJECT_ROOT / "config" / "projects.json"
DATA_DIR = PROJECT_ROOT / "data"
SNAPSHOTS_DIR = DATA_DIR / "snapshots"
TRENDS_DIR = DATA_DIR / "trends"


# ── Reddit data fetching ──────────────────────────────────────────────────

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
    for post in posts[:50]:  # Comments for top 50 posts
        post_comments = await client.fetch_comments(
            subreddit, post.id, depth=comment_depth,
        )
        comments.extend(post_comments)
        await asyncio.sleep(0.7)  # Rate limit

    print(f"    Got {len(comments)} comments.")

    return {
        "subreddit": subreddit,
        "posts": [p.model_dump() for p in posts],
        "comments": [c.model_dump() for c in comments],
    }


# ── Pipeline orchestration ────────────────────────────────────────────────

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
        print(f"{'='*60}")

        for sub_config in subreddits:
            subreddit = sub_config["subreddit"]
            pull_config = sub_config.get("pull_config", {})
            sub_dir = SNAPSHOTS_DIR / snap_date / f"r_{subreddit}"
            community_dir = sub_dir / "community"
            community_dir.mkdir(parents=True, exist_ok=True)

            print(f"\n  r/{subreddit}")
            print(f"  {'─'*40}")

            # ── Step 1: Fetch raw data ──────────────────────────────
            raw_data_path = sub_dir / "raw_data.json"
            raw_data = None

            if skip_scrape:
                raw_data = load_json(raw_data_path)
                if raw_data:
                    print(f"    Using existing raw data ({len(raw_data.get('posts', []))} posts)")
                else:
                    print(f"    No existing raw data found, fetching...")

            if raw_data is None:
                try:
                    raw_data = await fetch_subreddit_data(
                        reddit_client, subreddit, pull_config,
                    )
                    save_atomic(raw_data_path, raw_data)

                    # Save metadata
                    metadata = {
                        "date": snap_date,
                        "subreddit": subreddit,
                        "post_count": len(raw_data.get("posts", [])),
                        "comment_count": len(raw_data.get("comments", [])),
                        "fetched_at": now_iso(),
                    }
                    save_atomic(sub_dir / "metadata.json", metadata)
                except Exception as e:
                    msg = f"Scrape error r/{subreddit}: {e}"
                    print(f"    ERROR: {msg}")
                    pipeline_errors.append({
                        "stage": "scrape", "subreddit": subreddit,
                        "error": str(e), "timestamp": now_iso(),
                    })
                    continue

            # ── Step 2: Community profile ────────────────────────────
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

            # ── Step 3: Per-brand LLM analysis ──────────────────────
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
                    print(f"      → {mention_count} mentions found")

                    # Stage 3: Deep Analysis (Sonnet)
                    print(f"      Stage 3: Deep analysis...")
                    deep_analysis = analyze_mentions_deeply(
                        claude_client, classification, brand,
                        subreddit, snap_date, brand_dir,
                        community_profile=community_profile,
                    )
                    analyzed_count = len(deep_analysis.get("analyzed_mentions", []))
                    print(f"      → {analyzed_count} mentions analyzed")

                    # Stage 4: Synthesis + Score
                    print(f"      Stage 4: Synthesis...")
                    synthesis = synthesize_brand(
                        claude_client, deep_analysis, classification,
                        brand, subreddit, snap_date, brand_dir,
                        community_profile=community_profile,
                    )
                    score = synthesis.get("undercurrent_score", 0)
                    status = synthesis.get("status_tag", "?")
                    print(f"      → Score: {score} ({status})")

                    # Emergency community profile refresh
                    prior = _get_prior_week_score(
                        brand_id, subreddit, snap_date, SNAPSHOTS_DIR,
                    )
                    if prior is not None and abs(score - prior) > 10:
                        print(f"      ⚠ Score change >{10} — refreshing community profile")
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

        # ── Step 4: Cross-week trends per brand ─────────────────────
        print(f"\n  Trend analysis")
        print(f"  {'─'*40}")
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
                    print(f"    → trajectory: {result.get('trajectory', '?')}")
                else:
                    print(f"    → skipped (insufficient data)")
            except Exception as e:
                print(f"    ERROR: {e}")
                pipeline_errors.append({
                    "stage": "trends", "brand_id": brand_id,
                    "error": str(e), "timestamp": now_iso(),
                })

    # ── Step 5: Generate manifest ─────────────────────────────────────
    print(f"\n  Generating manifest...")
    manifest = generate_manifest(config, SNAPSHOTS_DIR, TRENDS_DIR)
    save_atomic(DATA_DIR / "manifest.json", manifest)

    # ── Step 6: Save errors if any ────────────────────────────────────
    if pipeline_errors:
        save_atomic(DATA_DIR / "pipeline_errors.json", pipeline_errors)

    # ── Summary ───────────────────────────────────────────────────────
    duration = round(time.monotonic() - t_start, 1)
    print(f"\n{'='*60}")
    print(f"Pipeline complete in {duration}s")
    print(cost_tracker.summary())
    if pipeline_errors:
        print(f"Errors: {len(pipeline_errors)}")
    print(f"{'='*60}")


# ── Manifest generation ───────────────────────────────────────────────────

def generate_manifest(
    config: dict,
    snapshots_dir: Path,
    trends_dir: Path,
) -> dict:
    """Generate data/manifest.json — the index used by API endpoints."""
    # Find all available weeks
    available_weeks = sorted(
        [d.name for d in snapshots_dir.iterdir() if d.is_dir()]
    ) if snapshots_dir.exists() else []

    projects = {}
    for project in config.get("projects", []):
        project_id = project["project_id"]
        brands_manifest = {}
        subreddits_manifest = {}

        for brand in project["brands"]:
            brand_id = brand["brand_id"]
            weeks_available = []
            latest_score = None
            latest_status = None

            for week in available_weeks:
                # Check if any subreddit has synthesis for this brand
                for sub_config in project["subreddits"]:
                    sub = sub_config["subreddit"]
                    synth_path = (
                        snapshots_dir / week / f"r_{sub}"
                        / "brands" / brand_id / "synthesis.json"
                    )
                    if synth_path.exists():
                        if week not in weeks_available:
                            weeks_available.append(week)
                        # Track latest
                        data = load_json(synth_path)
                        if data:
                            latest_score = data.get("undercurrent_score", 0)
                            latest_status = data.get("status_tag", "stable")

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


# ── Helpers ───────────────────────────────────────────────────────────────

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
    print(f"\nDry run — pipeline plan for {snap_date}:\n")
    for project in projects:
        print(f"  Project: {project['project_name']}")
        for sub in project["subreddits"]:
            print(f"    r/{sub['subreddit']} (limit={sub['pull_config']['post_limit']})")
        for brand in project["brands"]:
            role = "competitor" if brand.get("is_competitor") else "primary"
            print(f"    Brand: {brand['brand_name']} ({role})")
        print()


# ── CLI entry point ───────────────────────────────────────────────────────

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
