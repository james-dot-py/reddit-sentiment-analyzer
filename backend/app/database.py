"""SQLite database layer for Undercurrent user/project metadata.

Analysis results stay as JSON files on disk. This module manages:
- User accounts (synced from Clerk)
- Project configurations (brands, subreddits)
- Pipeline run history
"""

from __future__ import annotations

import json
import logging
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import aiosqlite

logger = logging.getLogger(__name__)

DB_PATH = Path(__file__).resolve().parent.parent.parent / "data" / "undercurrent.db"

# ── Connection helper ─────────────────────────────────────────────────────

@asynccontextmanager
async def get_db():
    """Async context manager yielding an aiosqlite connection with row_factory."""
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    async with aiosqlite.connect(str(DB_PATH)) as db:
        db.row_factory = aiosqlite.Row
        await db.execute("PRAGMA journal_mode=WAL")
        await db.execute("PRAGMA foreign_keys=ON")
        yield db


# ── Schema ────────────────────────────────────────────────────────────────

async def init_db():
    """Create tables if they don't exist. Called at FastAPI startup."""
    async with get_db() as db:
        await db.executescript("""
            CREATE TABLE IF NOT EXISTS users (
                id              INTEGER PRIMARY KEY AUTOINCREMENT,
                clerk_id        TEXT UNIQUE NOT NULL,
                email           TEXT NOT NULL,
                display_name    TEXT DEFAULT '',
                tier            TEXT DEFAULT 'free' CHECK(tier IN ('free', 'pro', 'enterprise')),
                created_at      TEXT DEFAULT (datetime('now'))
            );

            CREATE TABLE IF NOT EXISTS projects (
                id              INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id         INTEGER REFERENCES users(id) ON DELETE CASCADE,
                project_name    TEXT NOT NULL,
                project_slug    TEXT NOT NULL,
                category        TEXT DEFAULT 'other',
                is_demo         INTEGER DEFAULT 0,
                created_at      TEXT DEFAULT (datetime('now')),
                UNIQUE(user_id, project_slug)
            );

            CREATE TABLE IF NOT EXISTS brands (
                id              INTEGER PRIMARY KEY AUTOINCREMENT,
                project_id      INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
                brand_name      TEXT NOT NULL,
                brand_slug      TEXT NOT NULL,
                aliases_json    TEXT DEFAULT '[]',
                is_competitor   INTEGER DEFAULT 0,
                UNIQUE(project_id, brand_slug)
            );

            CREATE TABLE IF NOT EXISTS monitored_subs (
                id              INTEGER PRIMARY KEY AUTOINCREMENT,
                project_id      INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
                subreddit_name  TEXT NOT NULL,
                relevance       TEXT DEFAULT 'core',
                pull_config_json TEXT DEFAULT '{"post_limit":200,"comment_depth":3,"sort":"top","time_filter":"week"}',
                UNIQUE(project_id, subreddit_name)
            );

            CREATE TABLE IF NOT EXISTS pipeline_runs (
                id              INTEGER PRIMARY KEY AUTOINCREMENT,
                project_id      INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
                status          TEXT DEFAULT 'queued' CHECK(status IN ('queued','running','completed','failed')),
                snap_date       TEXT,
                started_at      TEXT,
                completed_at    TEXT,
                error_log       TEXT
            );
        """)
        await db.commit()
        logger.info("Database initialized at %s", DB_PATH)


# ── Users ─────────────────────────────────────────────────────────────────

async def upsert_user(clerk_id: str, email: str, display_name: str = "") -> dict:
    """Get or create a user by Clerk ID. Returns user dict."""
    async with get_db() as db:
        # Try to get existing user
        cursor = await db.execute(
            "SELECT * FROM users WHERE clerk_id = ?", (clerk_id,)
        )
        row = await cursor.fetchone()
        if row:
            # Update email/name if changed
            await db.execute(
                "UPDATE users SET email = ?, display_name = ? WHERE clerk_id = ?",
                (email, display_name or row["display_name"], clerk_id),
            )
            await db.commit()
            cursor = await db.execute(
                "SELECT * FROM users WHERE clerk_id = ?", (clerk_id,)
            )
            row = await cursor.fetchone()
            return dict(row)

        # Create new user
        await db.execute(
            "INSERT INTO users (clerk_id, email, display_name) VALUES (?, ?, ?)",
            (clerk_id, email, display_name),
        )
        await db.commit()
        cursor = await db.execute(
            "SELECT * FROM users WHERE clerk_id = ?", (clerk_id,)
        )
        row = await cursor.fetchone()
        return dict(row)


async def get_user_by_clerk_id(clerk_id: str) -> dict | None:
    async with get_db() as db:
        cursor = await db.execute(
            "SELECT * FROM users WHERE clerk_id = ?", (clerk_id,)
        )
        row = await cursor.fetchone()
        return dict(row) if row else None


# ── Projects ──────────────────────────────────────────────────────────────

def _slugify(name: str) -> str:
    """Convert a name to a URL-safe slug."""
    import re
    slug = name.lower().strip()
    slug = re.sub(r"[^a-z0-9]+", "-", slug)
    slug = slug.strip("-")
    return slug or "project"


async def create_project(
    user_id: int,
    project_name: str,
    category: str = "other",
    brands: list[dict] | None = None,
    subreddits: list[str] | None = None,
) -> dict:
    """Create a project with brands and subreddits in one call."""
    project_slug = _slugify(project_name)

    async with get_db() as db:
        # Ensure unique slug for this user
        cursor = await db.execute(
            "SELECT COUNT(*) FROM projects WHERE user_id = ? AND project_slug LIKE ?",
            (user_id, f"{project_slug}%"),
        )
        count = (await cursor.fetchone())[0]
        if count > 0:
            project_slug = f"{project_slug}-{count + 1}"

        cursor = await db.execute(
            "INSERT INTO projects (user_id, project_name, project_slug, category) VALUES (?, ?, ?, ?)",
            (user_id, project_name, project_slug, category),
        )
        project_id = cursor.lastrowid

        # Add brands
        if brands:
            for b in brands:
                brand_slug = _slugify(b["brand_name"])
                aliases = b.get("aliases", [])
                await db.execute(
                    "INSERT INTO brands (project_id, brand_name, brand_slug, aliases_json, is_competitor) VALUES (?, ?, ?, ?, ?)",
                    (project_id, b["brand_name"], brand_slug, json.dumps(aliases), int(b.get("is_competitor", False))),
                )

        # Add subreddits
        if subreddits:
            for sub in subreddits:
                await db.execute(
                    "INSERT INTO monitored_subs (project_id, subreddit_name) VALUES (?, ?)",
                    (project_id, sub),
                )

        await db.commit()

    return await get_project(project_id)


async def get_project(project_id: int) -> dict | None:
    """Get a project with its brands and subreddits."""
    async with get_db() as db:
        cursor = await db.execute("SELECT * FROM projects WHERE id = ?", (project_id,))
        proj = await cursor.fetchone()
        if not proj:
            return None

        cursor = await db.execute(
            "SELECT * FROM brands WHERE project_id = ?", (project_id,)
        )
        brands = [dict(r) for r in await cursor.fetchall()]

        cursor = await db.execute(
            "SELECT * FROM monitored_subs WHERE project_id = ?", (project_id,)
        )
        subs = [dict(r) for r in await cursor.fetchall()]

    return {
        **dict(proj),
        "brands": brands,
        "monitored_subs": subs,
    }


async def list_user_projects(user_id: int) -> list[dict]:
    """List all projects for a user (including demo projects)."""
    async with get_db() as db:
        cursor = await db.execute(
            "SELECT * FROM projects WHERE user_id = ? OR is_demo = 1 ORDER BY is_demo DESC, created_at DESC",
            (user_id,),
        )
        projects = []
        for row in await cursor.fetchall():
            proj = dict(row)
            pid = proj["id"]

            c = await db.execute("SELECT * FROM brands WHERE project_id = ?", (pid,))
            proj["brands"] = [dict(r) for r in await c.fetchall()]

            c = await db.execute("SELECT * FROM monitored_subs WHERE project_id = ?", (pid,))
            proj["monitored_subs"] = [dict(r) for r in await c.fetchall()]

            projects.append(proj)

    return projects


async def delete_project(project_id: int, user_id: int) -> bool:
    """Delete a project if owned by user. Returns True if deleted."""
    async with get_db() as db:
        cursor = await db.execute(
            "DELETE FROM projects WHERE id = ? AND user_id = ? AND is_demo = 0",
            (project_id, user_id),
        )
        await db.commit()
        return cursor.rowcount > 0


async def update_project(project_id: int, user_id: int, **kwargs) -> dict | None:
    """Update project fields. Only updates provided kwargs."""
    allowed = {"project_name", "category"}
    updates = {k: v for k, v in kwargs.items() if k in allowed and v is not None}
    if not updates:
        return await get_project(project_id)

    async with get_db() as db:
        # Verify ownership
        cursor = await db.execute(
            "SELECT id FROM projects WHERE id = ? AND user_id = ? AND is_demo = 0",
            (project_id, user_id),
        )
        if not await cursor.fetchone():
            return None

        set_clause = ", ".join(f"{k} = ?" for k in updates)
        values = list(updates.values()) + [project_id]
        await db.execute(f"UPDATE projects SET {set_clause} WHERE id = ?", values)
        await db.commit()

    return await get_project(project_id)


# ── Brands ────────────────────────────────────────────────────────────────

async def add_brand(
    project_id: int, user_id: int, brand_name: str,
    aliases: list[str] | None = None, is_competitor: bool = False,
) -> dict | None:
    """Add a brand to a project. Returns the new brand or None if not authorized."""
    async with get_db() as db:
        cursor = await db.execute(
            "SELECT id FROM projects WHERE id = ? AND user_id = ? AND is_demo = 0",
            (project_id, user_id),
        )
        if not await cursor.fetchone():
            return None

        brand_slug = _slugify(brand_name)
        await db.execute(
            "INSERT INTO brands (project_id, brand_name, brand_slug, aliases_json, is_competitor) VALUES (?, ?, ?, ?, ?)",
            (project_id, brand_name, brand_slug, json.dumps(aliases or []), int(is_competitor)),
        )
        await db.commit()
        cursor = await db.execute(
            "SELECT * FROM brands WHERE project_id = ? AND brand_slug = ?",
            (project_id, brand_slug),
        )
        row = await cursor.fetchone()
        return dict(row) if row else None


async def remove_brand(brand_id: int, project_id: int, user_id: int) -> bool:
    """Remove a brand. Returns True if deleted."""
    async with get_db() as db:
        cursor = await db.execute(
            "SELECT p.id FROM projects p WHERE p.id = ? AND p.user_id = ? AND p.is_demo = 0",
            (project_id, user_id),
        )
        if not await cursor.fetchone():
            return False
        cursor = await db.execute(
            "DELETE FROM brands WHERE id = ? AND project_id = ?",
            (brand_id, project_id),
        )
        await db.commit()
        return cursor.rowcount > 0


# ── Subreddits ────────────────────────────────────────────────────────────

async def add_subreddit(project_id: int, user_id: int, subreddit_name: str) -> dict | None:
    """Add a monitored subreddit to a project."""
    async with get_db() as db:
        cursor = await db.execute(
            "SELECT id FROM projects WHERE id = ? AND user_id = ? AND is_demo = 0",
            (project_id, user_id),
        )
        if not await cursor.fetchone():
            return None

        await db.execute(
            "INSERT OR IGNORE INTO monitored_subs (project_id, subreddit_name) VALUES (?, ?)",
            (project_id, subreddit_name),
        )
        await db.commit()
        cursor = await db.execute(
            "SELECT * FROM monitored_subs WHERE project_id = ? AND subreddit_name = ?",
            (project_id, subreddit_name),
        )
        row = await cursor.fetchone()
        return dict(row) if row else None


async def remove_subreddit(sub_id: int, project_id: int, user_id: int) -> bool:
    """Remove a monitored subreddit."""
    async with get_db() as db:
        cursor = await db.execute(
            "SELECT id FROM projects WHERE id = ? AND user_id = ? AND is_demo = 0",
            (project_id, user_id),
        )
        if not await cursor.fetchone():
            return False
        cursor = await db.execute(
            "DELETE FROM monitored_subs WHERE id = ? AND project_id = ?",
            (sub_id, project_id),
        )
        await db.commit()
        return cursor.rowcount > 0


# ── Pipeline config bridge ────────────────────────────────────────────────

async def generate_pipeline_config(project_id: int) -> dict | None:
    """Generate a pipeline-compatible config dict for a single project.

    Returns a dict matching the shape of entries in config/projects.json.
    """
    project = await get_project(project_id)
    if not project:
        return None

    return {
        "project_id": project["project_slug"],
        "project_name": project["project_name"],
        "brands": [
            {
                "brand_id": b["brand_slug"],
                "brand_name": b["brand_name"],
                "aliases": json.loads(b["aliases_json"]) if isinstance(b["aliases_json"], str) else b["aliases_json"],
                "is_competitor": bool(b["is_competitor"]),
            }
            for b in project["brands"]
        ],
        "subreddits": [
            {
                "subreddit": s["subreddit_name"],
                "relevance": s["relevance"],
                "pull_config": json.loads(s["pull_config_json"]) if isinstance(s["pull_config_json"], str) else s["pull_config_json"],
            }
            for s in project["monitored_subs"]
        ],
    }


async def generate_all_pipeline_configs() -> dict:
    """Generate full pipeline config for all active projects."""
    async with get_db() as db:
        cursor = await db.execute("SELECT id FROM projects")
        rows = await cursor.fetchall()

    configs = []
    for row in rows:
        cfg = await generate_pipeline_config(row["id"])
        if cfg:
            configs.append(cfg)

    return {"projects": configs}


# ── Demo seeding ──────────────────────────────────────────────────────────

async def seed_demo_projects() -> None:
    """Seed demo projects from config/projects.json if they don't exist yet."""
    config_path = Path(__file__).resolve().parent.parent.parent / "config" / "projects.json"
    if not config_path.exists():
        logger.warning("No config/projects.json found — skipping demo seed")
        return

    async with get_db() as db:
        # Check if demo projects already exist
        cursor = await db.execute("SELECT COUNT(*) FROM projects WHERE is_demo = 1")
        count = (await cursor.fetchone())[0]
        if count > 0:
            logger.info("Demo projects already seeded (%d found)", count)
            return

    with open(config_path, "r", encoding="utf-8") as f:
        config = json.load(f)

    # Create a system user for demo projects
    system_user = await upsert_user(
        clerk_id="system-demo",
        email="demo@undercurrent.dev",
        display_name="Demo",
    )

    for proj in config.get("projects", []):
        async with get_db() as db:
            cursor = await db.execute(
                "INSERT INTO projects (user_id, project_name, project_slug, is_demo) VALUES (?, ?, ?, 1)",
                (system_user["id"], proj["project_name"], proj["project_id"]),
            )
            project_id = cursor.lastrowid

            for brand in proj.get("brands", []):
                await db.execute(
                    "INSERT INTO brands (project_id, brand_name, brand_slug, aliases_json, is_competitor) VALUES (?, ?, ?, ?, ?)",
                    (project_id, brand["brand_name"], brand["brand_id"],
                     json.dumps(brand.get("aliases", [])), int(brand.get("is_competitor", False))),
                )

            for sub in proj.get("subreddits", []):
                await db.execute(
                    "INSERT INTO monitored_subs (project_id, subreddit_name, relevance, pull_config_json) VALUES (?, ?, ?, ?)",
                    (project_id, sub["subreddit"], sub.get("relevance", "core"),
                     json.dumps(sub.get("pull_config", {}))),
                )

            await db.commit()
            logger.info("Seeded demo project: %s", proj["project_id"])
