#!/usr/bin/env python3
"""Re-run NLP + tribal analysis on existing pre-computed results.

This script updates the n-gram, entity, text-stats, tribal, and summary
stages WITHOUT re-running sentiment analysis (which requires the
HuggingFace model).  Use this after changing stop-word lists.

Usage:
    python scripts/recompute_nlp.py            # all samples
    python scripts/recompute_nlp.py --subreddit askreddit
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

from backend.app.models import (
    AnalysisResponse,
    CommentWithSentiment,
    PostWithSentiment,
    TribalAnalysis,
)
from backend.app.nlp_analysis import run_full_nlp_analysis
from backend.app.summarizer import generate_summary, generate_tribal_narrative
from backend.app.tribal_logic import build_topic_groups, classify_tribalism, classify_ratioed_posts

SAMPLES_DIR = PROJECT_ROOT / "backend" / "samples"


def reprocess(analysis_path: Path) -> None:
    print(f"\n{'='*60}")
    print(f"Reprocessing {analysis_path.name}")
    print(f"{'='*60}")

    with open(analysis_path, "r", encoding="utf-8") as f:
        data = json.load(f)

    result = AnalysisResponse(**data)

    posts = result.posts
    comments = result.comments or []

    # Rebuild text lists from existing data
    nlp_post_texts = [f"{p.post.title} {p.post.selftext}" for p in posts]
    nlp_comment_texts = [c.comment.body for c in comments] if comments else None

    # Re-run NLP analysis (entities, n-grams, text stats)
    print("  Running NLP analysis with updated stop words...")
    nlp_insights = run_full_nlp_analysis(nlp_post_texts, nlp_comment_texts)
    result.nlp_insights = nlp_insights

    print(f"  Top bigrams: {[b.text for b in nlp_insights.bigrams[:5]]}")
    print(f"  Top trigrams: {[t.text for t in nlp_insights.trigrams[:5]]}")

    # Re-run tribal analysis (depends on bigrams)
    print("  Re-classifying tribal patterns...")
    topic_groups = build_topic_groups(
        posts, comments, nlp_insights.entities, nlp_insights.bigrams,
    )
    tribal_topics = classify_tribalism(topic_groups)
    ratioed_posts = classify_ratioed_posts(posts, comments)
    tribal_narrative = generate_tribal_narrative(tribal_topics, ratioed_posts)

    result.tribal_analysis = TribalAnalysis(
        topics=tribal_topics,
        ratioed_posts=ratioed_posts,
        narrative=tribal_narrative,
    )
    print(f"  Found {len(tribal_topics)} tribal topics")

    # Re-generate summary (uses bigrams, entities, tribal data)
    print("  Regenerating summary...")
    result.summary_text = generate_summary(
        result.subreddit_summaries, posts, comments, nlp_insights,
        tribal_topics=tribal_topics, ratioed_count=len(ratioed_posts),
    )

    # Save
    with open(analysis_path, "w", encoding="utf-8") as f:
        json.dump(result.model_dump(), f, ensure_ascii=False)

    size_mb = analysis_path.stat().st_size / (1024 * 1024)
    print(f"  Saved {analysis_path.name} ({size_mb:.1f} MB)")


def main():
    parser = argparse.ArgumentParser(description="Re-run NLP + tribal analysis on existing results")
    parser.add_argument("--subreddit", type=str, help="Process a single subreddit")
    args = parser.parse_args()

    if args.subreddit:
        path = SAMPLES_DIR / f"{args.subreddit.lower()}.analysis.json"
        if not path.exists():
            print(f"Analysis not found: {path}")
            raise SystemExit(1)
        reprocess(path)
    else:
        paths = sorted(SAMPLES_DIR.glob("*.analysis.json"))
        print(f"Reprocessing {len(paths)} analysis files...")
        for path in paths:
            try:
                reprocess(path)
            except Exception as e:
                print(f"  ERROR: {e}")
                import traceback
                traceback.print_exc()

    print("\nDone!")


if __name__ == "__main__":
    main()
