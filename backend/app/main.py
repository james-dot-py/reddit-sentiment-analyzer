"""FastAPI application — main entry point."""

from __future__ import annotations

import asyncio
import json
import logging
from pathlib import Path
from typing import Optional

from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from .sentiment import preload_model

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(
    title="Undercurrent",
    version="2.0.0",
    description="Longitudinal brand intelligence from Reddit",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

SNAPSHOTS_DIR = Path(__file__).resolve().parent.parent / "data" / "snapshots"


# ── Startup ────────────────────────────────────────────────────────────────
@app.on_event("startup")
async def startup():
    logger.info("Starting up — preloading sentiment model in background...")

    def _safe_preload():
        try:
            preload_model()
            logger.info("Sentiment model preloaded successfully")
        except Exception as e:
            logger.error(f"Model preload failed (will retry on first request): {e}")

    asyncio.get_event_loop().run_in_executor(None, _safe_preload)
    logger.info("Startup complete — server is ready to accept requests")


# ── Health check ───────────────────────────────────────────────────────────
@app.get("/api/health")
async def health():
    from .sentiment import is_model_loaded
    return {"status": "ok", "model_loaded": is_model_loaded()}


# ── Snapshot endpoints (legacy, will be extended in Phase 3) ───────────────

@app.get("/api/snapshots")
async def list_snapshots():
    """Index of all available snapshot weeks and subreddits."""
    weeks: list[str] = []
    by_subreddit: dict[str, list[str]] = {}

    if SNAPSHOTS_DIR.exists():
        for date_dir in sorted(SNAPSHOTS_DIR.iterdir(), reverse=True):
            if not date_dir.is_dir():
                continue
            date_str = date_dir.name
            has_any = False
            for sub_dir in sorted(date_dir.iterdir()):
                if not sub_dir.is_dir():
                    continue
                meta_path = sub_dir / "metadata.json"
                if not meta_path.exists():
                    continue
                sub_name = sub_dir.name
                has_any = True
                by_subreddit.setdefault(sub_name, [])
                by_subreddit[sub_name].append(date_str)
            if has_any and date_str not in weeks:
                weeks.append(date_str)

    return {"weeks": weeks, "by_subreddit": by_subreddit}


@app.get("/api/snapshots/latest")
async def latest_snapshot():
    """Return the most recent snapshot date."""
    if not SNAPSHOTS_DIR.exists():
        return {"date": None}
    date_dirs = sorted(
        (d for d in SNAPSHOTS_DIR.iterdir() if d.is_dir()),
        reverse=True,
    )
    for d in date_dirs:
        if any((d / sub / "metadata.json").exists() for sub in (d.iterdir() if d.is_dir() else [])):
            return {"date": d.name}
    return {"date": None}


@app.get("/api/snapshots/{date}/{subreddit}/metadata")
async def get_snapshot_metadata(date: str, subreddit: str):
    """Lightweight metadata for a single snapshot."""
    meta_path = SNAPSHOTS_DIR / date / subreddit.lower() / "metadata.json"
    if not meta_path.exists():
        raise HTTPException(status_code=404, detail="Snapshot not found")
    with open(meta_path, "r", encoding="utf-8") as f:
        return json.load(f)


@app.get("/api/snapshots/{date}/{subreddit}")
async def get_snapshot(date: str, subreddit: str):
    """Full snapshot data for a date/subreddit combination."""
    sub_lower = subreddit.lower()
    analysis_path = SNAPSHOTS_DIR / date / sub_lower / "analysis.json"
    if not analysis_path.exists():
        raise HTTPException(status_code=404, detail="Snapshot not found")

    with open(analysis_path, "r", encoding="utf-8") as f:
        return json.load(f)


# ── Static file serving (production) ──────────────────────────────────────

FRONTEND_DIR = Path(__file__).resolve().parent.parent.parent / "frontend" / "dist"

if FRONTEND_DIR.exists():
    app.mount("/assets", StaticFiles(directory=str(FRONTEND_DIR / "assets")), name="static")

    @app.get("/{full_path:path}")
    async def serve_spa(request: Request, full_path: str):
        """Serve the SPA — return index.html for all non-API routes."""
        file_path = FRONTEND_DIR / full_path
        if file_path.is_file():
            return FileResponse(str(file_path))
        return FileResponse(str(FRONTEND_DIR / "index.html"))
