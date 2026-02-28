"""Stage 2: Brand mention classification via Claude Haiku.

Scans all posts and comments to find and classify brand mentions.
Uses batching by token count (~3000 input tokens per Haiku call, max 50 items).
"""

from __future__ import annotations

import logging
from pathlib import Path
from typing import Any

from ..claude_client import ClaudeClient
from .schemas import CLASSIFICATION_MENTION_SCHEMA
from .utils import batch_by_tokens, save_atomic, load_json

logger = logging.getLogger(__name__)


def _build_comment_items(raw_data: dict) -> list[dict]:
    """Flatten posts and comments into items with id, text, metadata."""
    items = []

    for post in raw_data.get("posts", []):
        post_id = post.get("id", "")
        title = post.get("title", "")
        selftext = post.get("selftext", "")
        text = f"{title} {selftext}".strip()
        if text:
            items.append({
                "source_id": post_id,
                "source_type": "post",
                "text": text,
                "upvotes": post.get("score", 0),
                "permalink": post.get("permalink", ""),
                "title": title,
            })

    for comment in raw_data.get("comments", []):
        comment_id = comment.get("id", "")
        body = comment.get("body", "")
        if body and body not in ("[deleted]", "[removed]"):
            items.append({
                "source_id": comment_id,
                "source_type": "comment",
                "text": body,
                "upvotes": comment.get("score", 0),
                "post_id": comment.get("post_id", ""),
            })

    return items


def classify_brand_mentions(
    client: ClaudeClient,
    raw_data: dict,
    brand: dict,
    subreddit: str,
    snapshot_date: str,
    output_dir: Path,
) -> dict:
    """Run Stage 2 classification for a single brand in a single subreddit.

    Returns the classification data dict and saves to classification.json.
    """
    output_path = output_dir / "classification.json"

    # Idempotency: skip if output already exists
    existing = load_json(output_path)
    if existing is not None:
        logger.info(f"  Stage 2 skip (exists): {brand['brand_id']} in r/{subreddit}")
        return existing

    brand_id = brand["brand_id"]
    brand_name = brand["brand_name"]
    aliases = brand.get("aliases", [brand_name.lower()])
    aliases_str = ", ".join(f'"{a}"' for a in aliases)

    items = _build_comment_items(raw_data)
    if not items:
        empty_result = _empty_classification(brand_id, snapshot_date, subreddit, 0, 0)
        save_atomic(output_path, empty_result)
        return empty_result

    # Batch by token count
    batches = batch_by_tokens(items, text_key="text", target_tokens=3000, max_items=50)

    system_prompt = (
        f"You are analyzing Reddit content from r/{subreddit} to find mentions "
        f"of specific brands.\n\n"
        f"Brand to detect: {brand_name}\n"
        f"Aliases to match (case-insensitive): {aliases_str}\n\n"
        f"For each item that mentions this brand, return:\n"
        f"- source_id: the ID of the item\n"
        f"- brand_id: \"{brand_id}\"\n"
        f"- topic_cluster: one of product_quality, price_value, customer_service, "
        f"competitor_comparison, recommendation, complaint, ingredient_concern, "
        f"product_switch, general_mention\n"
        f"- relevance_score: 0-1 (0 = passing reference, 1 = detailed discussion)\n"
        f"- text_excerpt: the relevant sentence or phrase mentioning the brand\n\n"
        f"Return ONLY mentions of {brand_name}. If no items mention this brand, "
        f"return an empty mentions array."
    )

    all_mentions: list[dict] = []
    total_posts = len(raw_data.get("posts", []))
    total_comments = len(raw_data.get("comments", []))

    for i, batch in enumerate(batches):
        user_content = f"Batch {i + 1}/{len(batches)} — {len(batch)} items:\n\n"
        for item in batch:
            user_content += f"[{item['source_type']}:{item['source_id']}] {item['text'][:500]}\n\n"

        try:
            result = client.classify(
                system=system_prompt,
                user_content=user_content,
                output_schema=CLASSIFICATION_MENTION_SCHEMA,
                stage=f"stage2_classify_{brand_id}_batch{i+1}",
            )
            batch_mentions = result.get("mentions", [])
            all_mentions.extend(batch_mentions)
        except Exception as e:
            logger.error(f"  Stage 2 batch {i+1} error for {brand_id}: {e}")
            continue

    # Filter out low-relevance mentions
    filtered = [m for m in all_mentions if m.get("relevance_score", 0) >= 0.3]

    # Enrich mentions with source metadata
    item_lookup = {item["source_id"]: item for item in items}
    for mention in filtered:
        src = item_lookup.get(mention.get("source_id", ""), {})
        mention["source_type"] = src.get("source_type", "unknown")
        mention["source_url"] = _build_source_url(subreddit, src)
        mention["upvotes"] = src.get("upvotes", 0)
        if src.get("source_type") == "comment":
            # Find parent post for context
            parent_post = _find_parent_post(raw_data, src.get("post_id", ""))
            if parent_post:
                mention["parent_post_title"] = parent_post.get("title", "")
                mention["parent_post_url"] = f"https://reddit.com{parent_post.get('permalink', '')}"
                mention["parent_post_upvotes"] = parent_post.get("score", 0)

    # Build topic cluster summary
    topic_clusters: dict[str, int] = {}
    for m in filtered:
        cluster = m.get("topic_cluster", "general_mention")
        topic_clusters[cluster] = topic_clusters.get(cluster, 0) + 1

    classification = {
        "brand_id": brand_id,
        "snapshot_date": snapshot_date,
        "subreddit": subreddit,
        "total_posts_scanned": total_posts,
        "total_comments_scanned": total_comments,
        "mentions": filtered,
        "mention_count": len(filtered),
        "topic_clusters": topic_clusters,
    }

    save_atomic(output_path, classification)
    logger.info(
        f"  Stage 2 done: {brand_id} in r/{subreddit} — "
        f"{len(filtered)} mentions ({len(batches)} batches)"
    )
    return classification


def _empty_classification(
    brand_id: str, date: str, subreddit: str,
    posts: int, comments: int,
) -> dict:
    return {
        "brand_id": brand_id,
        "snapshot_date": date,
        "subreddit": subreddit,
        "total_posts_scanned": posts,
        "total_comments_scanned": comments,
        "mentions": [],
        "mention_count": 0,
        "topic_clusters": {},
    }


def _build_source_url(subreddit: str, item: dict) -> str:
    permalink = item.get("permalink", "")
    if permalink:
        return f"https://reddit.com{permalink}"
    return ""


def _find_parent_post(raw_data: dict, post_id: str) -> dict | None:
    for post in raw_data.get("posts", []):
        if post.get("id") == post_id:
            return post
    return None
