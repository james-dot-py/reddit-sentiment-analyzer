#!/usr/bin/env python3
"""One-off enriched fetch for r/XenogendersAndMore.

Combines multiple sort/time windows, dedupes posts by id, fetches deeper
comment trees, and overwrites backend/samples/xenogendersandmore.json.
"""

from __future__ import annotations

import json
import sys
from datetime import datetime, timezone
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

from scripts.fetch_samples import fetch_posts, fetch_comments

SUBREDDIT = "XenogendersAndMore"
OUT_PATH = PROJECT_ROOT / "backend" / "samples" / "xenogendersandmore.json"
DESCRIPTION = "Xenogender identity — neopronouns, microlabels, and queer self-expression"

PULLS = [
    ("top", "year", 500),
    ("top", "all", 300),
    ("hot", "week", 100),
    ("new", "week", 200),
]

COMMENT_TOP_N = 200      # fetch comments for top-N posts by score
COMMENT_DEPTH = 3


def main():
    print(f"Enriched fetch for r/{SUBREDDIT}")
    print(f"Pulls: {PULLS}\n")

    posts_by_id: dict[str, dict] = {}

    for sort, time_filter, limit in PULLS:
        print(f"--- {sort}/{time_filter} (limit {limit}) ---")
        try:
            posts = fetch_posts(SUBREDDIT, sort, time_filter, limit)
        except Exception as e:
            print(f"  ERROR: {e}")
            continue
        new_count = 0
        for p in posts:
            if p["id"] not in posts_by_id:
                posts_by_id[p["id"]] = p
                new_count += 1
        print(f"  Got {len(posts)} posts ({new_count} new). Total unique: {len(posts_by_id)}\n")

    posts = list(posts_by_id.values())
    print(f"=== {len(posts)} unique posts total ===\n")

    # Pick top-N by score for comment fetching
    sorted_posts = sorted(posts, key=lambda p: p.get("score", 0), reverse=True)
    comment_posts = sorted_posts[:COMMENT_TOP_N]
    print(f"Fetching comments for top {len(comment_posts)} posts (depth={COMMENT_DEPTH})...\n")

    all_comments = []
    for i, post in enumerate(comment_posts, 1):
        title_safe = post["title"][:60].encode("ascii", errors="replace").decode("ascii")
        try:
            comments = fetch_comments(SUBREDDIT, post["id"], depth=COMMENT_DEPTH)
        except Exception as e:
            print(f"  [{i}/{len(comment_posts)}] {title_safe} - ERROR: {e}")
            continue
        all_comments.extend(comments)
        if i % 20 == 0 or i == len(comment_posts):
            print(f"  [{i}/{len(comment_posts)}] running total: {len(all_comments)} comments")

    print(f"\n=== {len(all_comments)} comments total ===")

    result = {
        "subreddit": SUBREDDIT,
        "metadata": {
            "description": DESCRIPTION,
            "sort": "merged",
            "time_filter": "merged(year+all+week)",
            "post_limit": sum(p[2] for p in PULLS),
            "comment_depth": COMMENT_DEPTH,
            "fetched_at": datetime.now(timezone.utc).isoformat(),
            "post_count": len(posts),
            "comment_count": len(all_comments),
            "pulls": [{"sort": s, "time": t, "limit": l} for s, t, l in PULLS],
        },
        "posts": posts,
        "comments": all_comments,
    }

    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(OUT_PATH, "w", encoding="utf-8") as f:
        json.dump(result, f, ensure_ascii=False)
    size_kb = OUT_PATH.stat().st_size / 1024
    print(f"\nSaved to {OUT_PATH} ({size_kb:.0f} KB)")


if __name__ == "__main__":
    main()
