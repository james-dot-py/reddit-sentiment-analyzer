"""SQLite persistence for analysis history."""

from __future__ import annotations

import json
import os
from datetime import datetime, timezone

import aiosqlite

DB_PATH = os.environ.get(
    "DB_PATH",
    os.path.join(os.path.dirname(os.path.dirname(__file__)), "data", "analyses.db"),
)


async def init_db() -> None:
    """Create the analyses table if it doesn't exist."""
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute("""
            CREATE TABLE IF NOT EXISTS analyses (
                id TEXT PRIMARY KEY,
                title TEXT NOT NULL,
                subreddits TEXT NOT NULL,
                created_at TEXT NOT NULL,
                request_params TEXT NOT NULL,
                post_count INTEGER NOT NULL DEFAULT 0,
                comment_count INTEGER NOT NULL DEFAULT 0,
                overall_mean_sentiment REAL NOT NULL DEFAULT 0,
                response_data TEXT NOT NULL
            )
        """)
        await db.commit()


async def save_analysis(
    analysis_id: str,
    subreddits: list[str],
    request_params: dict,
    response_data: dict,
    post_count: int,
    comment_count: int,
    overall_mean_sentiment: float,
) -> None:
    """Save a completed analysis to the database."""
    now = datetime.now(timezone.utc)
    sub_str = ", ".join(f"r/{s}" for s in subreddits)
    title = f"{sub_str} - {now.strftime('%Y-%m-%d %H:%M')}"

    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(
            """
            INSERT OR REPLACE INTO analyses
                (id, title, subreddits, created_at, request_params,
                 post_count, comment_count, overall_mean_sentiment, response_data)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                analysis_id,
                title,
                json.dumps(subreddits),
                now.isoformat(),
                json.dumps(request_params),
                post_count,
                comment_count,
                round(overall_mean_sentiment, 4),
                json.dumps(response_data),
            ),
        )
        await db.commit()


async def list_analyses() -> list[dict]:
    """Return metadata for all saved analyses (without full response data)."""
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        cursor = await db.execute(
            """
            SELECT id, title, subreddits, created_at, request_params,
                   post_count, comment_count, overall_mean_sentiment
            FROM analyses
            ORDER BY created_at DESC
            """
        )
        rows = await cursor.fetchall()
        return [
            {
                "id": row["id"],
                "title": row["title"],
                "subreddits": json.loads(row["subreddits"]),
                "created_at": row["created_at"],
                "request_params": json.loads(row["request_params"]),
                "post_count": row["post_count"],
                "comment_count": row["comment_count"],
                "overall_mean_sentiment": row["overall_mean_sentiment"],
            }
            for row in rows
        ]


async def get_analysis(analysis_id: str) -> dict | None:
    """Retrieve full analysis data by ID."""
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        cursor = await db.execute(
            "SELECT response_data FROM analyses WHERE id = ?",
            (analysis_id,),
        )
        row = await cursor.fetchone()
        if row is None:
            return None
        return json.loads(row["response_data"])


async def delete_analysis(analysis_id: str) -> bool:
    """Delete an analysis by ID. Returns True if a row was deleted."""
    async with aiosqlite.connect(DB_PATH) as db:
        cursor = await db.execute(
            "DELETE FROM analyses WHERE id = ?",
            (analysis_id,),
        )
        await db.commit()
        return cursor.rowcount > 0
