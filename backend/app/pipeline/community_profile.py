"""Community profile generation for subreddits.

Generates a cultural profile of a subreddit by analyzing a broad sample
of top comments. Used to contextualize brand analysis in Stages 3-4.

Triggers:
  - First time a subreddit is analyzed
  - Monthly refresh (profile older than 30 days)
  - Emergency refresh: when any brand's score changes >10 points week-over-week
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from pathlib import Path

from ..claude_client import ClaudeClient
from .schemas import COMMUNITY_PROFILE_SCHEMA
from .utils import save_atomic, load_json, now_iso

logger = logging.getLogger(__name__)

PROFILE_MAX_AGE_DAYS = 30


def needs_profile_update(profile_path: Path) -> bool:
    """Check if community profile needs regeneration."""
    existing = load_json(profile_path)
    if existing is None:
        return True

    profile_date = existing.get("profile_date", "")
    if not profile_date:
        return True

    try:
        dt = datetime.fromisoformat(profile_date)
        age = (datetime.now(timezone.utc) - dt.replace(tzinfo=timezone.utc)).days
        return age >= PROFILE_MAX_AGE_DAYS
    except (ValueError, TypeError):
        return True


def generate_community_profile(
    client: ClaudeClient,
    raw_data: dict,
    subreddit: str,
    snapshot_date: str,
    output_dir: Path,
    force: bool = False,
) -> dict:
    """Generate or refresh a community profile for a subreddit.

    Analyzes top comments by upvotes to understand community values,
    friction points, tone, and opinion dynamics.

    Returns the profile dict and saves to community_profile.json.
    """
    output_path = output_dir / "community_profile.json"

    if not force and not needs_profile_update(output_path):
        existing = load_json(output_path)
        if existing is not None:
            logger.info(f"  Community profile skip (recent): r/{subreddit}")
            return existing

    # Gather top comments by upvotes (broad sample, not brand-specific)
    comments = raw_data.get("comments", [])
    posts = raw_data.get("posts", [])

    # Sort comments by score and take top ~100
    sorted_comments = sorted(
        [c for c in comments if c.get("body", "") not in ("[deleted]", "[removed]")],
        key=lambda c: c.get("score", 0),
        reverse=True,
    )[:100]

    # Also include top post titles for context
    sorted_posts = sorted(
        posts, key=lambda p: p.get("score", 0), reverse=True,
    )[:30]

    if not sorted_comments and not sorted_posts:
        empty = _empty_profile(subreddit, snapshot_date)
        save_atomic(output_path, empty)
        return empty

    # Build content sample for the LLM
    content_sample = f"Top posts from r/{subreddit} this week:\n\n"
    for p in sorted_posts:
        title = p.get("title", "")
        score = p.get("score", 0)
        content_sample += f"[{score} upvotes] {title}\n"

    content_sample += f"\n\nTop comments from r/{subreddit} this week:\n\n"
    for c in sorted_comments:
        body = c.get("body", "")[:300]
        score = c.get("score", 0)
        content_sample += f"[{score} upvotes] {body}\n\n"

    system_prompt = (
        f"You are analyzing the culture and values of the Reddit community "
        f"r/{subreddit}.\n\n"
        f"Based on the top posts and comments, determine:\n"
        f"1. values_celebrated: 4-6 specific values this community respects and upvotes\n"
        f"2. friction_points: 4-6 specific things this community rejects or criticizes\n"
        f"3. dominant_tone: one sentence describing the overall communication style\n"
        f"4. key_opinion_dynamics: how does consensus form in this community "
        f"(democratic, influencer-driven, evidence-based, expert-deference, etc.)\n\n"
        f"Be specific to r/{subreddit} — generic answers are not useful."
    )

    try:
        result = client.analyze(
            system=system_prompt,
            user_content=content_sample,
            output_schema=COMMUNITY_PROFILE_SCHEMA,
            max_tokens=2048,
            stage=f"community_profile_{subreddit}",
        )
    except Exception as e:
        logger.error(f"  Community profile error for r/{subreddit}: {e}")
        empty = _empty_profile(subreddit, snapshot_date)
        save_atomic(output_path, empty)
        return empty

    profile = {
        "subreddit": subreddit,
        "profile_date": datetime.now(timezone.utc).isoformat(),
        "snapshot_date": snapshot_date,
        "community_size_approx": "",  # Could be enriched via Reddit API
        "values_celebrated": result.get("values_celebrated", []),
        "friction_points": result.get("friction_points", []),
        "dominant_tone": result.get("dominant_tone", ""),
        "key_opinion_dynamics": result.get("key_opinion_dynamics", ""),
    }

    save_atomic(output_path, profile)
    logger.info(f"  Community profile done: r/{subreddit}")
    return profile


def _empty_profile(subreddit: str, date: str) -> dict:
    return {
        "subreddit": subreddit,
        "profile_date": datetime.now(timezone.utc).isoformat(),
        "snapshot_date": date,
        "community_size_approx": "",
        "values_celebrated": [],
        "friction_points": [],
        "dominant_tone": "",
        "key_opinion_dynamics": "",
    }
