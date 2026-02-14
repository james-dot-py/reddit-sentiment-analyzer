#!/usr/bin/env python3
"""Fetch sample Reddit data for featured communities.

Standalone script — only requires `requests` (no ML dependencies).
Run from a residential IP (Reddit blocks cloud/datacenter IPs).

Usage:
    python scripts/fetch_samples.py              # fetch all
    python scripts/fetch_samples.py --subreddit askreddit  # fetch one
"""

from __future__ import annotations

import argparse
import json
import time
from datetime import datetime, timezone
from pathlib import Path

import requests

SAMPLES_DIR = Path(__file__).resolve().parent.parent / "backend" / "samples"
USER_AGENT = "SubRedditSentimentAnalyzer/1.0 (sample data fetcher)"

SUBREDDITS = [
    {"name": "AskReddit",          "limit": 200, "sort": "top", "time": "week",  "depth": 2, "description": "Broad Q&A — enormous topic variety and opinion diversity"},
    {"name": "politics",           "limit": 200, "sort": "top", "time": "week",  "depth": 2, "description": "Polarized political discourse and partisan sentiment"},
    {"name": "science",            "limit": 150, "sort": "top", "time": "month", "depth": 2, "description": "Academic register with factual, measured language"},
    {"name": "worldnews",          "limit": 200, "sort": "top", "time": "week",  "depth": 2, "description": "Geopolitical sentiment and international affairs"},
    {"name": "personalfinance",    "limit": 150, "sort": "top", "time": "month", "depth": 2, "description": "Financial advice with stress, relief, and gratitude"},
    {"name": "relationship_advice","limit": 150, "sort": "top", "time": "month", "depth": 2, "description": "High emotional valence — relationship dynamics"},
    {"name": "unpopularopinion",   "limit": 200, "sort": "top", "time": "week",  "depth": 2, "description": "Contrarian and argumentative discourse"},
    {"name": "technology",         "limit": 200, "sort": "top", "time": "week",  "depth": 2, "description": "Tech industry sentiment and innovation reactions"},
    {"name": "changemyview",       "limit": 150, "sort": "top", "time": "month", "depth": 2, "description": "Deliberative reasoning and persuasion patterns"},
    {"name": "TrueOffMyChest",     "limit": 150, "sort": "top", "time": "month", "depth": 2, "description": "Confessional, raw emotional expression"},
]

RATE_LIMIT = 2.0  # seconds between requests


def _get(url: str, params: dict | None = None, retries: int = 3) -> dict:
    """GET with rate limiting and retry on 429."""
    for attempt in range(retries):
        time.sleep(RATE_LIMIT)
        headers = {"User-Agent": USER_AGENT}
        resp = requests.get(url, params=params, headers=headers, timeout=30)
        if resp.status_code == 429:
            wait = int(resp.headers.get("Retry-After", 10))
            print(f"  Rate limited, waiting {wait}s...")
            time.sleep(wait)
            continue
        resp.raise_for_status()
        return resp.json()
    raise RuntimeError(f"Failed after {retries} retries: {url}")


def fetch_posts(subreddit: str, sort: str, time_filter: str, limit: int) -> list[dict]:
    """Fetch posts from Reddit's public JSON API."""
    posts = []
    after = None
    per_page = min(limit, 100)

    while len(posts) < limit:
        params = {"limit": per_page, "t": time_filter, "raw_json": 1}
        if after:
            params["after"] = after

        url = f"https://www.reddit.com/r/{subreddit}/{sort}.json"
        data = _get(url, params)

        children = data.get("data", {}).get("children", [])
        if not children:
            break

        for child in children:
            d = child["data"]
            posts.append({
                "id": d["id"],
                "subreddit": d.get("subreddit", subreddit),
                "title": d.get("title", ""),
                "selftext": d.get("selftext", ""),
                "author": d.get("author", "[deleted]"),
                "score": d.get("score", 0),
                "num_comments": d.get("num_comments", 0),
                "created_utc": d.get("created_utc", 0),
                "permalink": d.get("permalink", ""),
                "url": d.get("url", ""),
            })

        after = data["data"].get("after")
        if not after:
            break

    return posts[:limit]


def fetch_comments(subreddit: str, post_id: str, depth: int = 2) -> list[dict]:
    """Fetch comments for a single post."""
    url = f"https://www.reddit.com/r/{subreddit}/comments/{post_id}.json"
    params = {"depth": depth, "limit": 50, "raw_json": 1}

    try:
        data = _get(url, params)
    except Exception as e:
        print(f"    Warning: failed to fetch comments for {post_id}: {e}")
        return []

    comments = []
    if len(data) < 2:
        return comments

    def _walk(children):
        for child in children:
            if child.get("kind") != "t1":
                continue
            d = child["data"]
            comments.append({
                "id": d["id"],
                "post_id": post_id,
                "subreddit": d.get("subreddit", subreddit),
                "body": d.get("body", ""),
                "author": d.get("author", "[deleted]"),
                "score": d.get("score", 0),
                "created_utc": d.get("created_utc", 0),
            })
            replies = d.get("replies")
            if isinstance(replies, dict):
                _walk(replies.get("data", {}).get("children", []))

    _walk(data[1].get("data", {}).get("children", []))
    return comments


def fetch_subreddit(config: dict) -> dict:
    """Fetch all data for one subreddit."""
    name = config["name"]
    print(f"\n{'='*60}")
    print(f"Fetching r/{name} — {config['limit']} posts, sort={config['sort']}, t={config['time']}")
    print(f"{'='*60}")

    posts = fetch_posts(name, config["sort"], config["time"], config["limit"])
    print(f"  Got {len(posts)} posts")

    all_comments = []
    # Fetch comments for top posts (by score)
    sorted_posts = sorted(posts, key=lambda p: p["score"], reverse=True)
    comment_posts = sorted_posts[:min(50, len(sorted_posts))]

    for i, post in enumerate(comment_posts):
        print(f"  Fetching comments for post {i+1}/{len(comment_posts)}: {post['title'][:60]}...")
        comments = fetch_comments(name, post["id"], depth=config["depth"])
        all_comments.extend(comments)
        print(f"    Got {len(comments)} comments")

    print(f"  Total: {len(posts)} posts, {len(all_comments)} comments")

    return {
        "subreddit": name,
        "metadata": {
            "description": config["description"],
            "sort": config["sort"],
            "time_filter": config["time"],
            "post_limit": config["limit"],
            "comment_depth": config["depth"],
            "fetched_at": datetime.now(timezone.utc).isoformat(),
            "post_count": len(posts),
            "comment_count": len(all_comments),
        },
        "posts": posts,
        "comments": all_comments,
    }


def _get_configs(subreddit: str | None) -> list[dict]:
    """Return configs to fetch — one if --subreddit given, else all."""
    if subreddit:
        name_lower = subreddit.lower()
        matches = [c for c in SUBREDDITS if c["name"].lower() == name_lower]
        if not matches:
            print(f"Unknown subreddit: {subreddit}")
            print(f"Available: {', '.join(c['name'] for c in SUBREDDITS)}")
            raise SystemExit(1)
        return matches
    return SUBREDDITS


def main():
    parser = argparse.ArgumentParser(description="Fetch sample Reddit data")
    parser.add_argument("--subreddit", type=str, help="Fetch a single subreddit by name")
    parser.add_argument("--all", action="store_true", help="Fetch all subreddits (default)")
    args = parser.parse_args()

    configs = _get_configs(args.subreddit)

    SAMPLES_DIR.mkdir(parents=True, exist_ok=True)

    print(f"Saving samples to: {SAMPLES_DIR}")
    print(f"Fetching {len(configs)} subreddit(s)...")

    for config in configs:
        try:
            result = fetch_subreddit(config)
            out_path = SAMPLES_DIR / f"{config['name'].lower()}.json"
            with open(out_path, "w", encoding="utf-8") as f:
                json.dump(result, f, ensure_ascii=False)
            print(f"  Saved to {out_path}")
        except Exception as e:
            print(f"  ERROR fetching r/{config['name']}: {e}")

    print(f"\nDone! Files in {SAMPLES_DIR}:")
    for p in sorted(SAMPLES_DIR.glob("*.json")):
        if p.name.endswith(".analysis.json"):
            continue
        size_kb = p.stat().st_size / 1024
        print(f"  {p.name} ({size_kb:.0f} KB)")


if __name__ == "__main__":
    main()
