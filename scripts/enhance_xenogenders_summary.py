#!/usr/bin/env python3
"""Regenerate the top narrative ``summary_text`` for r/XenogendersAndMore using
Anthropic Claude Sonnet, replacing the Gemini-generated text in
``backend/samples/xenogendersandmore.analysis.json``.

This is intentionally scoped to a single subreddit: only the xenogendersandmore
analysis file is touched, and only its ``summary_text`` field is rewritten.
Tribal narrative, NLP insights, sentiment distributions, and every other field
remain unchanged.

Usage:
    python scripts/enhance_xenogenders_summary.py
    python scripts/enhance_xenogenders_summary.py --dry-run
    python scripts/enhance_xenogenders_summary.py --print-prompt
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

try:
    from dotenv import load_dotenv
    load_dotenv(PROJECT_ROOT / ".env")
except ImportError:
    pass

from backend.app.anthropic_summarizer import (
    ANTHROPIC_SYSTEM_PROMPT,
    build_user_prompt,
    generate_anthropic_summary,
)
from backend.app.models import AnalysisResponse

TARGET_FILE = PROJECT_ROOT / "backend" / "samples" / "xenogendersandmore.analysis.json"


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dry-run", action="store_true", help="Generate but do not save.")
    parser.add_argument(
        "--print-prompt",
        action="store_true",
        help="Print the system + user prompts and exit (no API call).",
    )
    args = parser.parse_args()

    if not TARGET_FILE.exists():
        print(f"ERROR: missing analysis file at {TARGET_FILE}", file=sys.stderr)
        return 1

    with open(TARGET_FILE, encoding="utf-8") as f:
        data = json.load(f)

    result = AnalysisResponse(**data)

    if args.print_prompt:
        prompt = build_user_prompt(
            result.subreddit_summaries,
            result.posts,
            result.comments,
            result.nlp_insights,
            tribal_topics=result.tribal_analysis.topics if result.tribal_analysis else None,
            ratioed_count=len(result.tribal_analysis.ratioed_posts) if result.tribal_analysis else 0,
        )
        print("=== SYSTEM ===")
        print(ANTHROPIC_SYSTEM_PROMPT)
        print("\n=== USER ===")
        print(prompt)
        return 0

    print(f"Regenerating summary_text for {TARGET_FILE.name}...")
    print(f"  before: {len(result.summary_text)} chars — {result.summary_text[:90]!r}")

    new_summary = generate_anthropic_summary(
        result.subreddit_summaries,
        result.posts,
        result.comments,
        result.nlp_insights,
        tribal_topics=result.tribal_analysis.topics if result.tribal_analysis else None,
        ratioed_count=len(result.tribal_analysis.ratioed_posts) if result.tribal_analysis else 0,
    )

    if not new_summary:
        print(
            "ERROR: Anthropic call returned no text. "
            "Set ANTHROPIC_API_KEY and `pip install anthropic`.",
            file=sys.stderr,
        )
        return 2

    print(f"  after:  {len(new_summary)} chars — {new_summary[:90]!r}")

    if args.dry_run:
        print("\n--- generated summary ---")
        print(new_summary)
        print("\n(dry run — file not modified)")
        return 0

    data["summary_text"] = new_summary
    with open(TARGET_FILE, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False)

    print(f"  saved to {TARGET_FILE}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
