#!/usr/bin/env python3
"""Re-generate summary_text and tribal_analysis.narrative for existing
analysis JSON files without re-running the full pipeline.

Usage:
    python scripts/patch_summaries.py                        # all samples
    python scripts/patch_summaries.py --subreddit vegan      # one sample
    python scripts/patch_summaries.py --dry-run              # preview only
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

from dotenv import load_dotenv
load_dotenv(PROJECT_ROOT / ".env")

from backend.app.models import (
    AnalysisResponse,
    CommentWithSentiment,
    PostWithSentiment,
    TribalTopic,
)
from backend.app.summarizer import generate_summary, generate_tribal_narrative

SAMPLES_DIR = PROJECT_ROOT / "backend" / "samples"


def patch_file(path: Path, dry_run: bool) -> None:
    print(f"\n  {path.name}")

    with open(path, encoding="utf-8") as f:
        data = json.load(f)

    result = AnalysisResponse(**data)

    old_summary = result.summary_text
    old_narrative = result.tribal_analysis.narrative if result.tribal_analysis else ""

    print(f"    summary_text before:   {len(old_summary):>4} chars  {old_summary[:80]!r}")

    new_summary = generate_summary(
        result.subreddit_summaries,
        result.posts,
        result.comments,
        result.nlp_insights,
        tribal_topics=result.tribal_analysis.topics if result.tribal_analysis else None,
        ratioed_count=len(result.tribal_analysis.ratioed_posts) if result.tribal_analysis else 0,
    )

    new_narrative = old_narrative
    if result.tribal_analysis and result.tribal_analysis.topics:
        new_narrative = generate_tribal_narrative(
            result.tribal_analysis.topics,
            result.tribal_analysis.ratioed_posts,
        )

    print(f"    summary_text after:    {len(new_summary):>4} chars  {new_summary[:80]!r}")

    if dry_run:
        print("    (dry run — not saved)")
        return

    data["summary_text"] = new_summary
    if result.tribal_analysis:
        data["tribal_analysis"]["narrative"] = new_narrative

    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False)

    print("    Saved.")


def main():
    parser = argparse.ArgumentParser(description="Patch summary_text in analysis JSON files")
    parser.add_argument("--subreddit", type=str, help="Patch a single subreddit")
    parser.add_argument("--dry-run", action="store_true", help="Preview without saving")
    args = parser.parse_args()

    if args.subreddit:
        path = SAMPLES_DIR / f"{args.subreddit.lower()}.analysis.json"
        if not path.exists():
            print(f"Not found: {path}")
            raise SystemExit(1)
        paths = [path]
    else:
        paths = sorted(SAMPLES_DIR.glob("*.analysis.json"))

    print(f"Patching {len(paths)} file(s){'  (dry run)' if args.dry_run else ''}...")

    for path in paths:
        try:
            patch_file(path, args.dry_run)
        except Exception as e:
            print(f"    ERROR: {e}")

    print("\nDone.")


if __name__ == "__main__":
    main()
