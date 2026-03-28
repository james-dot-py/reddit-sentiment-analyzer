"""FastAPI application — main entry point for Undercurrent v2."""

from __future__ import annotations

import asyncio
import json
import logging
import uuid
from pathlib import Path
from typing import Optional

from fastapi import Depends, FastAPI, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from .auth import get_current_user, optional_user
from .database import (
    add_brand,
    add_subreddit,
    create_project,
    delete_project,
    init_db,
    list_user_projects,
    remove_brand,
    remove_subreddit,
    seed_demo_projects,
    update_project,
)
from .sentiment import preload_model
from .tiers import get_tier_limits

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


def _build_evidence_posts(
    llm_evidence: list[dict],
    classification: dict | None,
    raw_data: dict | None,
    subreddit: str,
) -> list[dict]:
    """Build evidence posts from real data instead of trusting LLM output.

    The LLM often hallucinates URLs and engagement metrics for evidence posts.
    This function cross-references classification mentions with raw Reddit data
    to produce accurate evidence posts with real URLs, upvotes, and comment counts.
    """
    if not raw_data or not classification:
        return llm_evidence  # Fallback to LLM data if we have nothing better

    # Build a lookup of raw posts by ID
    raw_posts: dict[str, dict] = {}
    for post in raw_data.get("posts", []):
        post_id = post.get("id", "")
        if post_id:
            raw_posts[post_id] = post

    # Get the LLM's "why_notable" explanations keyed by a fuzzy title match
    llm_explanations: dict[str, str] = {}
    for ev in llm_evidence:
        title_lower = ev.get("post_title", "").lower().strip()
        if title_lower:
            llm_explanations[title_lower] = ev.get("why_notable", "")

    # Find posts mentioned in classification that reference this brand
    mentioned_post_ids: set[str] = set()
    mention_upvotes: dict[str, int] = {}  # post_id -> max upvotes from mentions
    for mention in classification.get("mentions", []):
        source_id = mention.get("source_id", "")
        source_url = mention.get("source_url", "")
        parent_url = mention.get("parent_post_url", "")

        # Extract post ID from various formats
        post_id = None
        if source_id.startswith("post:"):
            post_id = source_id.replace("post:", "")
        elif source_id.startswith("comment:"):
            # For comments, look up the parent post URL
            if parent_url:
                for raw_id, raw_post in raw_posts.items():
                    if raw_id in parent_url or raw_post.get("permalink", "") in parent_url:
                        post_id = raw_id
                        break

        if not post_id:
            # Try to extract from source_url
            for raw_id in raw_posts:
                if raw_id in source_url or raw_id in (parent_url or ""):
                    post_id = raw_id
                    break

        if post_id and post_id in raw_posts:
            mentioned_post_ids.add(post_id)
            upv = mention.get("upvotes", 0)
            if mention.get("parent_post_upvotes"):
                upv = max(upv, mention["parent_post_upvotes"])
            mention_upvotes[post_id] = max(
                mention_upvotes.get(post_id, 0), upv,
            )

    # Build evidence posts from real data
    evidence_posts: list[dict] = []

    # Prioritize posts that were actually mentioned in classification
    for post_id in mentioned_post_ids:
        raw_post = raw_posts.get(post_id)
        if not raw_post:
            continue

        title = raw_post.get("title", "")
        permalink = raw_post.get("permalink", "")
        url = f"https://www.reddit.com{permalink}" if permalink else raw_post.get("url", "")

        # Try to find a matching LLM explanation
        why_notable = ""
        title_lower = title.lower().strip()
        for llm_title, explanation in llm_explanations.items():
            # Fuzzy match: check if significant words overlap
            if (llm_title in title_lower or title_lower in llm_title
                    or _title_similarity(llm_title, title_lower) > 0.4):
                why_notable = explanation
                break

        if not why_notable:
            why_notable = f"Brand mentioned in r/{subreddit} discussion"

        evidence_posts.append({
            "post_url": url,
            "post_title": title,
            "upvotes": raw_post.get("score", 0),
            "comment_count": raw_post.get("num_comments", 0),
            "why_notable": why_notable,
            "subreddit": subreddit,
        })

    # Sort by upvotes (engagement), take top 5
    evidence_posts.sort(key=lambda p: p["upvotes"], reverse=True)

    # If we got fewer than 3, supplement with top raw posts that mention the brand
    if len(evidence_posts) < 3:
        existing_urls = {p["post_url"] for p in evidence_posts}
        for post in sorted(
            raw_data.get("posts", []),
            key=lambda p: p.get("score", 0),
            reverse=True,
        ):
            permalink = post.get("permalink", "")
            url = f"https://www.reddit.com{permalink}" if permalink else ""
            if url in existing_urls:
                continue
            # Only add if we have some reason to believe it's brand-related
            post_id = post.get("id", "")
            if post_id in mentioned_post_ids:
                continue  # Already handled
            # Skip — only include posts confirmed in classification
            break

    return evidence_posts[:5]


def _title_similarity(a: str, b: str) -> float:
    """Simple word overlap similarity between two titles."""
    words_a = set(a.split())
    words_b = set(b.split())
    if not words_a or not words_b:
        return 0.0
    intersection = words_a & words_b
    return len(intersection) / min(len(words_a), len(words_b))


# ── Startup ────────────────────────────────────────────────────────────────

@app.on_event("startup")
async def startup():
    # Initialize database and seed demo data
    await init_db()
    await seed_demo_projects()

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
        classification = _load_json(brand_dir / "classification.json")
        community_profile = _load_json(
            sub_dir / "community" / "community_profile.json"
        )

        # Build evidence posts from classification + raw_data (don't trust LLM)
        raw_data = _load_json(sub_dir / "raw_data.json")
        evidence = _build_evidence_posts(
            synthesis.get("key_evidence_posts", []),
            classification,
            raw_data,
            sub,
        )
        # Add date metadata to evidence
        for ev in evidence:
            ev["post_date"] = date
        synthesis["key_evidence_posts"] = evidence

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


# ── Subreddit Snapshot (community-level analysis) ─────────────────────────

@app.get("/api/projects/{project_id}/subreddits/{subreddit}/snapshot")
async def get_subreddit_snapshot(
    project_id: str,
    subreddit: str,
    week: Optional[str] = Query(None, description="Snapshot date (YYYY-MM-DD)"),
):
    """Community-level analysis for a subreddit: word clouds, entities, n-grams, overall sentiment."""
    _find_project(project_id)
    date = week or _latest_week()
    if not date:
        raise HTTPException(status_code=404, detail="No snapshot data available")

    community_dir = SNAPSHOTS_DIR / date / f"r_{subreddit}" / "community"
    if not community_dir.exists():
        raise HTTPException(
            status_code=404,
            detail=f"No snapshot data for r/{subreddit} on {date}",
        )

    return {
        "subreddit": subreddit,
        "snapshot_date": date,
        "overall_sentiment": _load_json(community_dir / "overall_sentiment.json"),
        "word_cloud_data": _load_json(community_dir / "word_cloud_data.json"),
        "entities": _load_json(community_dir / "entities.json"),
        "ngrams": _load_json(community_dir / "ngrams.json"),
        "community_profile": _load_json(community_dir / "community_profile.json"),
    }


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


@app.get("/api/manifest")
async def get_manifest():
    """Return the full manifest for brand selection page."""
    data = _load_json(MANIFEST_PATH)
    if not data:
        return {"projects": {}}
    return data


# ── Authenticated endpoints (/api/me/*) ───────────────────────────────────

@app.get("/api/me")
async def get_me(user: dict = Depends(get_current_user)):
    """Return the current authenticated user, their projects, and tier limits."""
    projects = await list_user_projects(user["id"])
    tier = user.get("tier", "free")
    return {
        "user": {
            "id": user["id"],
            "email": user["email"],
            "display_name": user["display_name"],
            "tier": tier,
        },
        "tier_limits": get_tier_limits(tier),
        "projects": [_format_project(p) for p in projects],
    }


@app.get("/api/me/projects")
async def list_my_projects(user: dict = Depends(get_current_user)):
    """List the current user's projects (plus demo projects)."""
    projects = await list_user_projects(user["id"])
    return [_format_project(p) for p in projects]


@app.post("/api/me/projects")
async def create_my_project(request: Request, user: dict = Depends(get_current_user)):
    """Create a new project with brands and subreddits."""
    body = await request.json()

    project_name = body.get("project_name", "").strip()
    if not project_name:
        raise HTTPException(status_code=400, detail="project_name is required")

    category = body.get("category", "other")
    brands = body.get("brands", [])
    subreddits = body.get("subreddits", [])

    if not brands:
        raise HTTPException(status_code=400, detail="At least one brand is required")
    if not subreddits:
        raise HTTPException(status_code=400, detail="At least one subreddit is required")

    # Tier limits (free: 1 brand, 2 subs)
    tier = user.get("tier", "free")
    if tier == "free":
        if len([b for b in brands if not b.get("is_competitor")]) > 1:
            raise HTTPException(status_code=403, detail="Free tier allows 1 primary brand. Upgrade to Pro for more.")
        if len(subreddits) > 2:
            raise HTTPException(status_code=403, detail="Free tier allows 2 subreddits. Upgrade to Pro for more.")

    project = await create_project(
        user_id=user["id"],
        project_name=project_name,
        category=category,
        brands=brands,
        subreddits=subreddits,
    )

    return _format_project(project)


@app.put("/api/me/projects/{project_id}")
async def update_my_project(
    project_id: int, request: Request, user: dict = Depends(get_current_user),
):
    """Update a project's configuration."""
    body = await request.json()
    result = await update_project(project_id, user["id"], **body)
    if not result:
        raise HTTPException(status_code=404, detail="Project not found or not authorized")
    return _format_project(result)


@app.delete("/api/me/projects/{project_id}")
async def delete_my_project(project_id: int, user: dict = Depends(get_current_user)):
    """Delete a project."""
    deleted = await delete_project(project_id, user["id"])
    if not deleted:
        raise HTTPException(status_code=404, detail="Project not found or not authorized")
    return {"status": "deleted"}


@app.post("/api/me/projects/{project_id}/brands")
async def add_my_brand(
    project_id: int, request: Request, user: dict = Depends(get_current_user),
):
    """Add a brand to a project."""
    body = await request.json()
    brand_name = body.get("brand_name", "").strip()
    if not brand_name:
        raise HTTPException(status_code=400, detail="brand_name is required")

    brand = await add_brand(
        project_id=project_id,
        user_id=user["id"],
        brand_name=brand_name,
        aliases=body.get("aliases", []),
        is_competitor=body.get("is_competitor", False),
    )
    if not brand:
        raise HTTPException(status_code=404, detail="Project not found or not authorized")
    return brand


@app.delete("/api/me/projects/{project_id}/brands/{brand_id}")
async def remove_my_brand(
    project_id: int, brand_id: int, user: dict = Depends(get_current_user),
):
    """Remove a brand from a project."""
    deleted = await remove_brand(brand_id, project_id, user["id"])
    if not deleted:
        raise HTTPException(status_code=404, detail="Brand not found or not authorized")
    return {"status": "deleted"}


@app.post("/api/me/projects/{project_id}/subreddits")
async def add_my_subreddit(
    project_id: int, request: Request, user: dict = Depends(get_current_user),
):
    """Add a monitored subreddit to a project."""
    body = await request.json()
    subreddit_name = body.get("subreddit_name", "").strip()
    if not subreddit_name:
        raise HTTPException(status_code=400, detail="subreddit_name is required")

    sub = await add_subreddit(project_id, user["id"], subreddit_name)
    if not sub:
        raise HTTPException(status_code=404, detail="Project not found or not authorized")
    return sub


@app.delete("/api/me/projects/{project_id}/subreddits/{sub_id}")
async def remove_my_subreddit(
    project_id: int, sub_id: int, user: dict = Depends(get_current_user),
):
    """Remove a monitored subreddit from a project."""
    deleted = await remove_subreddit(sub_id, project_id, user["id"])
    if not deleted:
        raise HTTPException(status_code=404, detail="Subreddit not found or not authorized")
    return {"status": "deleted"}


def _format_project(project: dict) -> dict:
    """Format a DB project dict into the API response shape."""
    import json as _json

    brands = []
    for b in project.get("brands", []):
        aliases = b.get("aliases_json", "[]")
        if isinstance(aliases, str):
            aliases = _json.loads(aliases)
        brands.append({
            "id": b["id"],
            "brand_id": b["brand_slug"],
            "brand_name": b["brand_name"],
            "aliases": aliases,
            "is_competitor": bool(b.get("is_competitor", False)),
        })

    subs = []
    for s in project.get("monitored_subs", []):
        pull_config = s.get("pull_config_json", "{}")
        if isinstance(pull_config, str):
            pull_config = _json.loads(pull_config)
        subs.append({
            "id": s["id"],
            "subreddit": s["subreddit_name"],
            "relevance": s.get("relevance", "core"),
            "pull_config": pull_config,
        })

    return {
        "id": project["id"],
        "project_id": project["project_slug"],
        "project_name": project["project_name"],
        "category": project.get("category", "other"),
        "is_demo": bool(project.get("is_demo", False)),
        "created_at": project.get("created_at", ""),
        "brands": brands,
        "subreddits": subs,
    }


# ── Billing (/api/billing/*) ───────────────────────────────────────────────

@app.post("/api/billing/checkout")
async def billing_checkout(request: Request, user: dict = Depends(get_current_user)):
    """Create a Stripe Checkout session for Pro upgrade."""
    from .billing import create_checkout_session

    body = await request.json()
    url = await create_checkout_session(
        user_id=user["id"],
        user_email=user["email"],
        price_id=body.get("price_id"),
        success_url=body.get("success_url", ""),
        cancel_url=body.get("cancel_url", ""),
    )
    if not url:
        raise HTTPException(status_code=503, detail="Billing is not configured")
    return {"checkout_url": url}


@app.post("/api/billing/webhook")
async def billing_webhook(request: Request):
    """Handle Stripe webhook events. No auth — verified by Stripe signature."""
    from .billing import handle_webhook_event

    payload = await request.body()
    sig = request.headers.get("stripe-signature", "")
    result = await handle_webhook_event(payload, sig)
    return result


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
