"""FastAPI application — main entry point for Undercurrent v2."""

from __future__ import annotations

import asyncio
import json
import logging
import uuid
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

# ── Paths ─────────────────────────────────────────────────────────────────

_BACKEND_DIR = Path(__file__).resolve().parent.parent
_PROJECT_ROOT = _BACKEND_DIR.parent
DATA_DIR = _PROJECT_ROOT / "data"
SNAPSHOTS_DIR = DATA_DIR / "snapshots"
TRENDS_DIR = DATA_DIR / "trends"
CONFIG_PATH = _PROJECT_ROOT / "config" / "projects.json"
MANIFEST_PATH = DATA_DIR / "manifest.json"


def _load_json(path: Path) -> dict | list | None:
    if not path.exists():
        return None
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def _save_json(path: Path, data) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


def _load_config() -> dict:
    data = _load_json(CONFIG_PATH)
    if not data:
        return {"projects": []}
    return data


def _find_project(project_id: str) -> dict:
    config = _load_config()
    for p in config.get("projects", []):
        if p["project_id"] == project_id:
            return p
    raise HTTPException(status_code=404, detail=f"Project '{project_id}' not found")


def _latest_week() -> str | None:
    manifest = _load_json(MANIFEST_PATH)
    if manifest:
        weeks = manifest.get("available_weeks", [])
        if weeks:
            return weeks[-1]
    # Fallback: scan filesystem
    if SNAPSHOTS_DIR.exists():
        dirs = sorted(d.name for d in SNAPSHOTS_DIR.iterdir() if d.is_dir())
        return dirs[-1] if dirs else None
    return None


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


# ── Health ─────────────────────────────────────────────────────────────────

@app.get("/api/health")
async def health():
    from .sentiment import is_model_loaded
    return {"status": "ok", "model_loaded": is_model_loaded()}


# ── Projects ───────────────────────────────────────────────────────────────

@app.get("/api/projects")
async def list_projects():
    """List all configured projects."""
    config = _load_config()
    return config.get("projects", [])


@app.get("/api/projects/{project_id}")
async def get_project(project_id: str):
    """Get a single project's configuration."""
    return _find_project(project_id)


# ── Brand Dashboard ───────────────────────────────────────────────────────

@app.get("/api/projects/{project_id}/brands/{brand_id}/dashboard")
async def get_brand_dashboard(
    project_id: str,
    brand_id: str,
    week: Optional[str] = Query(None, description="Snapshot date (YYYY-MM-DD)"),
):
    """Aggregated brand dashboard data across all subreddits for a given week."""
    project = _find_project(project_id)
    date = week or _latest_week()
    if not date:
        raise HTTPException(status_code=404, detail="No snapshot data available")

    # Verify brand exists in project
    brand_config = None
    for b in project["brands"]:
        if b["brand_id"] == brand_id:
            brand_config = b
            break
    if not brand_config:
        raise HTTPException(status_code=404, detail=f"Brand '{brand_id}' not found in project")

    week_subreddits = []
    for sub_config in project["subreddits"]:
        sub = sub_config["subreddit"]
        sub_dir = SNAPSHOTS_DIR / date / f"r_{sub}"
        brand_dir = sub_dir / "brands" / brand_id

        synthesis = _load_json(brand_dir / "synthesis.json")
        if not synthesis:
            continue

        deep_analysis = _load_json(brand_dir / "deep_analysis.json")
        community_profile = _load_json(
            sub_dir / "community" / "community_profile.json"
        )

        # Build deep analysis summary
        deep_summary = None
        if deep_analysis:
            deep_summary = {
                "sentiment_distribution": deep_analysis.get("sentiment_distribution", {}),
                "average_intensity": deep_analysis.get("average_intensity", 0),
                "top_themes": deep_analysis.get("top_themes", [])[:10],
                "mention_count": len(deep_analysis.get("analyzed_mentions", [])),
            }

        week_subreddits.append({
            "subreddit": sub,
            "synthesis": synthesis,
            "deep_analysis_summary": deep_summary,
            "community_profile": community_profile,
        })

    return {
        "brand_id": brand_id,
        "brand_name": brand_config["brand_name"],
        "is_competitor": brand_config.get("is_competitor", False),
        "snapshot_date": date,
        "week_subreddits": week_subreddits,
    }


# ── Trends ─────────────────────────────────────────────────────────────────

@app.get("/api/projects/{project_id}/brands/{brand_id}/trends")
async def get_brand_trends(
    project_id: str,
    brand_id: str,
    weeks: int = Query(12, description="Number of weeks to return"),
):
    """Cross-week trend data for a brand."""
    _find_project(project_id)  # Validate project exists

    trend_path = TRENDS_DIR / brand_id / "trend_data.json"
    data = _load_json(trend_path)
    if not data:
        return {
            "brand_id": brand_id,
            "generated_at": None,
            "score_history": [],
            "trajectory": None,
            "narrative_delta": "",
            "emerging_themes": [],
            "declining_themes": [],
            "inflection_points": [],
            "annotations": [],
        }

    # Trim score_history to requested weeks
    history = data.get("score_history", [])
    if len(history) > weeks:
        data["score_history"] = history[-weeks:]

    return data


# ── Annotations ────────────────────────────────────────────────────────────

@app.get("/api/projects/{project_id}/brands/{brand_id}/trends/annotations")
async def list_annotations(project_id: str, brand_id: str):
    """List manual annotations for a brand's trend timeline."""
    _find_project(project_id)

    trend_path = TRENDS_DIR / brand_id / "trend_data.json"
    data = _load_json(trend_path)
    annotations = data.get("annotations", []) if data else []
    return {"annotations": annotations}


@app.post("/api/projects/{project_id}/brands/{brand_id}/trends/annotations")
async def add_annotation(project_id: str, brand_id: str, request: Request):
    """Add a manual annotation to a brand's trend timeline."""
    _find_project(project_id)

    body = await request.json()
    date = body.get("date", "")
    label = body.get("label", "")
    if not date or not label:
        raise HTTPException(status_code=400, detail="date and label are required")

    trend_path = TRENDS_DIR / brand_id / "trend_data.json"
    data = _load_json(trend_path)
    if not data:
        data = {"brand_id": brand_id, "annotations": []}

    annotation = {
        "annotation_id": str(uuid.uuid4())[:8],
        "date": date,
        "label": label,
        "type": "manual",
        "added_by": "user",
    }
    data.setdefault("annotations", []).append(annotation)
    _save_json(trend_path, data)

    return annotation


@app.delete("/api/projects/{project_id}/brands/{brand_id}/trends/annotations/{annotation_id}")
async def delete_annotation(
    project_id: str, brand_id: str, annotation_id: str,
):
    """Remove a manual annotation."""
    _find_project(project_id)

    trend_path = TRENDS_DIR / brand_id / "trend_data.json"
    data = _load_json(trend_path)
    if not data:
        raise HTTPException(status_code=404, detail="No trend data found")

    annotations = data.get("annotations", [])
    original_len = len(annotations)
    data["annotations"] = [
        a for a in annotations if a.get("annotation_id") != annotation_id
    ]
    if len(data["annotations"]) == original_len:
        raise HTTPException(status_code=404, detail="Annotation not found")

    _save_json(trend_path, data)
    return {"status": "deleted"}


# ── Community Profile ──────────────────────────────────────────────────────

@app.get("/api/projects/{project_id}/subreddits/{subreddit}/community-profile")
async def get_community_profile(project_id: str, subreddit: str):
    """Get the latest community profile for a subreddit."""
    _find_project(project_id)

    # Find latest week with a profile
    latest = _latest_week()
    if latest:
        profile_path = (
            SNAPSHOTS_DIR / latest / f"r_{subreddit}"
            / "community" / "community_profile.json"
        )
        data = _load_json(profile_path)
        if data:
            return data

    # Search backwards for any profile
    if SNAPSHOTS_DIR.exists():
        for date_dir in sorted(SNAPSHOTS_DIR.iterdir(), reverse=True):
            if not date_dir.is_dir():
                continue
            profile_path = (
                date_dir / f"r_{subreddit}"
                / "community" / "community_profile.json"
            )
            data = _load_json(profile_path)
            if data:
                return data

    raise HTTPException(status_code=404, detail="Community profile not found")


# ── Available Weeks & Pipeline Status ──────────────────────────────────────

@app.get("/api/snapshots/available-weeks")
async def available_weeks():
    """List all snapshot weeks with data."""
    manifest = _load_json(MANIFEST_PATH)
    if manifest:
        return {"available_weeks": manifest.get("available_weeks", [])}

    # Fallback: scan filesystem
    weeks = []
    if SNAPSHOTS_DIR.exists():
        weeks = sorted(d.name for d in SNAPSHOTS_DIR.iterdir() if d.is_dir())
    return {"available_weeks": weeks}


@app.get("/api/pipeline/status")
async def pipeline_status():
    """Get pipeline run status from manifest."""
    manifest = _load_json(MANIFEST_PATH)
    if not manifest:
        return {
            "last_updated": None,
            "last_pipeline_status": "never_run",
            "available_weeks": [],
        }
    return {
        "last_updated": manifest.get("last_updated"),
        "last_pipeline_status": manifest.get("last_pipeline_status", "unknown"),
        "available_weeks": manifest.get("available_weeks", []),
    }


@app.get("/api/snapshots/latest")
async def latest_snapshot():
    """Return the most recent snapshot date."""
    date = _latest_week()
    return {"date": date}


# ── Static file serving (production) ──────────────────────────────────────

FRONTEND_DIR = _PROJECT_ROOT / "frontend" / "dist"

if FRONTEND_DIR.exists():
    app.mount("/assets", StaticFiles(directory=str(FRONTEND_DIR / "assets")), name="static")

    @app.get("/{full_path:path}")
    async def serve_spa(request: Request, full_path: str):
        """Serve the SPA — return index.html for all non-API routes."""
        file_path = FRONTEND_DIR / full_path
        if file_path.is_file():
            return FileResponse(str(file_path))
        return FileResponse(str(FRONTEND_DIR / "index.html"))
