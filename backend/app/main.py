"""FastAPI application — main entry point."""

from __future__ import annotations

import asyncio
import csv
import io
import json
import logging
import os
import statistics
import uuid
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles

from .models import (
    AnalysisRequest,
    AnalysisResponse,
    CommentWithSentiment,
    ContextSnippet,
    CredentialsRequest,
    KeywordAnalysisRequest,
    KeywordAnalysisResponse,
    KeywordAnalysisResult,
    KeywordComparison,
    KeywordSentimentRequest,
    KeywordTimePoint,
    NLPInsights,
    PostWithSentiment,
    ProgressUpdate,
    SentimentLabel,
    SentimentStats,
    SubredditSentimentSummary,
    TimeSeriesPoint,
)
from .database import delete_analysis as db_delete_analysis
from .database import get_analysis as db_get_analysis
from .database import init_db, list_analyses as db_list_analyses, save_analysis as db_save_analysis
from .nlp_analysis import generate_wordcloud_image, run_full_nlp_analysis
from .reddit_client import reddit_client
from .sentiment import analyze_batch, preload_model
from .summarizer import generate_summary

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(
    title="SubReddit Sentiment Analyzer",
    version="1.0.0",
    description="Sentiment analysis for Reddit communities",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── In-memory storage for completed analyses ───────────────────────────────
_analyses: dict[str, AnalysisResponse] = {}
_analysis_posts: dict[str, list[PostWithSentiment]] = {}
_analysis_comments: dict[str, list[CommentWithSentiment]] = {}


# ── Startup ────────────────────────────────────────────────────────────────
@app.on_event("startup")
async def startup():
    logger.info("Starting up — initializing database...")
    await init_db()
    logger.info("Database initialized. Preloading sentiment model in background...")

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


# ── Credentials ────────────────────────────────────────────────────────────
@app.post("/api/credentials")
async def set_credentials(req: CredentialsRequest):
    reddit_client.set_credentials(req.client_id, req.client_secret)
    return {"status": "ok", "message": "Credentials saved. Will use OAuth for faster rate limits."}


# ── Analysis (SSE streaming) ──────────────────────────────────────────────

def _compute_sentiment_stats(scores: list[float], labels: list[SentimentLabel]) -> SentimentStats:
    if not scores:
        return SentimentStats(
            mean=0, median=0, std_dev=0,
            positive_pct=0, neutral_pct=0, negative_pct=0, total_count=0,
        )
    total = len(labels)
    return SentimentStats(
        mean=round(statistics.mean(scores), 4),
        median=round(statistics.median(scores), 4),
        std_dev=round(statistics.stdev(scores), 4) if len(scores) > 1 else 0,
        positive_pct=round(labels.count(SentimentLabel.positive) / total * 100, 1),
        neutral_pct=round(labels.count(SentimentLabel.neutral) / total * 100, 1),
        negative_pct=round(labels.count(SentimentLabel.negative) / total * 100, 1),
        total_count=total,
    )


def _build_time_series(
    posts: list[PostWithSentiment],
) -> list[TimeSeriesPoint]:
    """Group post sentiments by date and subreddit."""
    by_day_sub: dict[tuple[str, str], list[float]] = defaultdict(list)

    for p in posts:
        dt = datetime.fromtimestamp(p.post.created_utc, tz=timezone.utc)
        day_str = dt.strftime("%Y-%m-%d")
        by_day_sub[(day_str, p.post.subreddit)].append(p.sentiment.compound_score)

    points = []
    for (day, sub), scores in sorted(by_day_sub.items()):
        points.append(TimeSeriesPoint(
            date=day,
            avg_sentiment=round(statistics.mean(scores), 4),
            count=len(scores),
            subreddit=sub,
        ))
    return points


async def _run_analysis(req: AnalysisRequest):
    """Generator that yields SSE events during analysis."""
    analysis_id = str(uuid.uuid4())

    def sse_event(data: dict) -> str:
        return f"data: {json.dumps(data)}\n\n"

    yield sse_event({"stage": "started", "analysis_id": analysis_id, "progress": 0})

    # ── Stage 1: Fetch data ───────────────────────────────────────────
    all_posts = []
    all_comments = []

    for i, subreddit in enumerate(req.subreddits):
        yield sse_event({
            "stage": "fetching",
            "message": f"Fetching posts from r/{subreddit}...",
            "progress": (i / len(req.subreddits)) * 0.3,
        })

        try:
            posts, comments = await reddit_client.fetch_all(
                subreddit=subreddit,
                sort=req.sort,
                time_filter=req.time_filter,
                post_limit=req.post_limit,
                include_comments=req.include_comments,
                comment_depth=req.comment_depth,
            )
            all_posts.extend(posts)
            all_comments.extend(comments)

            yield sse_event({
                "stage": "fetching",
                "message": f"Fetched {len(posts)} posts and {len(comments)} comments from r/{subreddit}",
                "progress": ((i + 1) / len(req.subreddits)) * 0.3,
            })
        except ValueError as e:
            yield sse_event({"stage": "error", "message": str(e)})
            return
        except Exception as e:
            yield sse_event({"stage": "error", "message": f"Failed to fetch r/{subreddit}: {str(e)}"})
            return

    if not all_posts:
        yield sse_event({"stage": "error", "message": "No posts fetched. Check subreddit names."})
        return

    # ── Stage 2: Sentiment analysis ───────────────────────────────────
    yield sse_event({
        "stage": "analyzing",
        "message": f"Running sentiment analysis on {len(all_posts)} posts...",
        "progress": 0.3,
    })

    # Prepare texts: title + selftext for posts
    post_texts = [f"{p.title} {p.selftext}".strip() for p in all_posts]
    post_sentiments = await asyncio.get_event_loop().run_in_executor(
        None, analyze_batch, post_texts
    )

    posts_with_sentiment = []
    for post, sentiment in zip(all_posts, post_sentiments):
        if sentiment is not None:
            posts_with_sentiment.append(PostWithSentiment(post=post, sentiment=sentiment))

    yield sse_event({
        "stage": "analyzing",
        "message": f"Analyzed {len(posts_with_sentiment)} posts",
        "progress": 0.5,
    })

    comments_with_sentiment = []
    if all_comments:
        yield sse_event({
            "stage": "analyzing",
            "message": f"Analyzing {len(all_comments)} comments...",
            "progress": 0.5,
        })

        comment_texts = [c.body for c in all_comments]
        comment_sentiments = await asyncio.get_event_loop().run_in_executor(
            None, analyze_batch, comment_texts
        )

        for comment, sentiment in zip(all_comments, comment_sentiments):
            if sentiment is not None:
                comments_with_sentiment.append(
                    CommentWithSentiment(comment=comment, sentiment=sentiment)
                )

        yield sse_event({
            "stage": "analyzing",
            "message": f"Analyzed {len(comments_with_sentiment)} comments",
            "progress": 0.65,
        })

    # ── Stage 3: Aggregate stats ──────────────────────────────────────
    yield sse_event({
        "stage": "aggregating",
        "message": "Computing statistics...",
        "progress": 0.65,
    })

    subreddit_summaries = []
    for subreddit in req.subreddits:
        sub_posts = [p for p in posts_with_sentiment if p.post.subreddit == subreddit]
        sub_comments = [c for c in comments_with_sentiment if c.comment.subreddit == subreddit]

        post_scores = [p.sentiment.compound_score for p in sub_posts]
        post_labels = [p.sentiment.label for p in sub_posts]
        post_stats = _compute_sentiment_stats(post_scores, post_labels)

        comment_stats = None
        if sub_comments:
            comment_scores = [c.sentiment.compound_score for c in sub_comments]
            comment_labels = [c.sentiment.label for c in sub_comments]
            comment_stats = _compute_sentiment_stats(comment_scores, comment_labels)

        subreddit_summaries.append(SubredditSentimentSummary(
            subreddit=subreddit,
            post_stats=post_stats,
            comment_stats=comment_stats,
            post_count=len(sub_posts),
            comment_count=len(sub_comments),
        ))

    time_series = _build_time_series(posts_with_sentiment)

    # ── Stage 4: NLP analysis ─────────────────────────────────────────
    yield sse_event({
        "stage": "nlp",
        "message": "Running NLP analysis (entities, n-grams, statistics)...",
        "progress": 0.7,
    })

    nlp_post_texts = [f"{p.post.title} {p.post.selftext}" for p in posts_with_sentiment]
    nlp_comment_texts = [c.comment.body for c in comments_with_sentiment] if comments_with_sentiment else None

    nlp_insights = await asyncio.get_event_loop().run_in_executor(
        None, run_full_nlp_analysis, nlp_post_texts, nlp_comment_texts
    )

    yield sse_event({
        "stage": "nlp",
        "message": "NLP analysis complete",
        "progress": 0.85,
    })

    # ── Stage 5: Generate summary ─────────────────────────────────────
    yield sse_event({
        "stage": "summarizing",
        "message": "Generating summary...",
        "progress": 0.9,
    })

    summary_text = generate_summary(
        subreddit_summaries, posts_with_sentiment, comments_with_sentiment, nlp_insights
    )

    # ── Build final response ──────────────────────────────────────────
    sentiment_distribution = [p.sentiment.compound_score for p in posts_with_sentiment]
    if comments_with_sentiment:
        sentiment_distribution.extend(c.sentiment.compound_score for c in comments_with_sentiment)

    result = AnalysisResponse(
        analysis_id=analysis_id,
        subreddit_summaries=subreddit_summaries,
        posts=posts_with_sentiment,
        comments=comments_with_sentiment,
        time_series=time_series,
        nlp_insights=nlp_insights,
        summary_text=summary_text,
        sentiment_distribution=sentiment_distribution,
    )

    # Store for later retrieval
    _analyses[analysis_id] = result
    _analysis_posts[analysis_id] = posts_with_sentiment
    _analysis_comments[analysis_id] = comments_with_sentiment

    # Persist to SQLite
    try:
        all_scores = [p.sentiment.compound_score for p in posts_with_sentiment]
        overall_mean = statistics.mean(all_scores) if all_scores else 0
        await db_save_analysis(
            analysis_id=analysis_id,
            subreddits=list(req.subreddits),
            request_params=req.model_dump(),
            response_data=result.model_dump(),
            post_count=len(posts_with_sentiment),
            comment_count=len(comments_with_sentiment),
            overall_mean_sentiment=overall_mean,
        )
        logger.info(f"Analysis {analysis_id} saved to database")
    except Exception as e:
        logger.error(f"Failed to save analysis to database: {e}")

    yield sse_event({
        "stage": "complete",
        "message": "Analysis complete!",
        "progress": 1.0,
        "analysis_id": analysis_id,
    })

    # Yield full results as final event
    yield sse_event({
        "stage": "results",
        "data": result.model_dump(),
    })


@app.post("/api/analyze")
async def analyze(req: AnalysisRequest):
    """Start analysis and stream progress via SSE."""
    return StreamingResponse(
        _run_analysis(req),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


# ── Retrieve cached analysis ──────────────────────────────────────────────

@app.get("/api/analysis/{analysis_id}")
async def get_analysis(analysis_id: str):
    if analysis_id in _analyses:
        return _analyses[analysis_id]
    # Fall back to database
    db_data = await db_get_analysis(analysis_id)
    if db_data is not None:
        return db_data
    raise HTTPException(status_code=404, detail="Analysis not found")


# ── Keyword sentiment comparison ──────────────────────────────────────────

@app.post("/api/keyword-sentiment")
async def keyword_sentiment(req: KeywordSentimentRequest):
    if req.analysis_id not in _analyses:
        raise HTTPException(status_code=404, detail="Analysis not found")

    analysis = _analyses[req.analysis_id]
    keyword_lower = req.keyword.lower()

    with_kw_scores = []
    with_kw_labels = []
    without_kw_scores = []
    without_kw_labels = []

    for p in analysis.posts:
        text = f"{p.post.title} {p.post.selftext}".lower()
        if keyword_lower in text:
            with_kw_scores.append(p.sentiment.compound_score)
            with_kw_labels.append(p.sentiment.label)
        else:
            without_kw_scores.append(p.sentiment.compound_score)
            without_kw_labels.append(p.sentiment.label)

    for c in analysis.comments:
        text = c.comment.body.lower()
        if keyword_lower in text:
            with_kw_scores.append(c.sentiment.compound_score)
            with_kw_labels.append(c.sentiment.label)
        else:
            without_kw_scores.append(c.sentiment.compound_score)
            without_kw_labels.append(c.sentiment.label)

    return KeywordComparison(
        keyword=req.keyword,
        with_keyword=_compute_sentiment_stats(with_kw_scores, with_kw_labels),
        without_keyword=_compute_sentiment_stats(without_kw_scores, without_kw_labels),
    )


# ── Enriched keyword analysis ─────────────────────────────────────────────

def _extract_snippet(text: str, keyword: str, max_len: int = 200) -> str:
    """Extract a snippet of text around the keyword."""
    lower = text.lower()
    idx = lower.find(keyword.lower())
    if idx == -1:
        return text[:max_len]
    start = max(0, idx - 60)
    end = min(len(text), idx + len(keyword) + 60)
    snippet = text[start:end].strip()
    if start > 0:
        snippet = "..." + snippet
    if end < len(text):
        snippet = snippet + "..."
    return snippet


@app.post("/api/keyword-analysis")
async def keyword_analysis(req: KeywordAnalysisRequest):
    """Enriched keyword analysis: stats, top posts, snippets, timeline per keyword."""
    if req.analysis_id not in _analyses:
        raise HTTPException(status_code=404, detail="Analysis not found")

    analysis = _analyses[req.analysis_id]
    results = []

    # Compute baseline (all content) stats
    all_scores = [p.sentiment.compound_score for p in analysis.posts]
    all_labels = [p.sentiment.label for p in analysis.posts]
    for c in analysis.comments:
        all_scores.append(c.sentiment.compound_score)
        all_labels.append(c.sentiment.label)
    baseline_stats = _compute_sentiment_stats(all_scores, all_labels)

    for keyword in req.keywords:
        kw_lower = keyword.lower()

        matching_posts: list[PostWithSentiment] = []
        matching_scores: list[float] = []
        matching_labels: list[SentimentLabel] = []
        snippets: list[ContextSnippet] = []
        timeline_data: dict[str, list[float]] = defaultdict(list)

        # Search posts
        for p in analysis.posts:
            text = f"{p.post.title} {p.post.selftext}"
            if kw_lower in text.lower():
                matching_posts.append(p)
                matching_scores.append(p.sentiment.compound_score)
                matching_labels.append(p.sentiment.label)
                dt = datetime.fromtimestamp(p.post.created_utc, tz=timezone.utc)
                timeline_data[dt.strftime("%Y-%m-%d")].append(p.sentiment.compound_score)
                if len(snippets) < 8:
                    snippets.append(ContextSnippet(
                        text=_extract_snippet(text, keyword),
                        sentiment_score=p.sentiment.compound_score,
                        sentiment_label=p.sentiment.label.value,
                        source_type="post",
                        post_title=p.post.title[:100],
                        permalink=f"https://reddit.com{p.post.permalink}",
                    ))

        # Search comments
        for c in analysis.comments:
            if kw_lower in c.comment.body.lower():
                matching_scores.append(c.sentiment.compound_score)
                matching_labels.append(c.sentiment.label)
                dt = datetime.fromtimestamp(c.comment.created_utc, tz=timezone.utc)
                timeline_data[dt.strftime("%Y-%m-%d")].append(c.sentiment.compound_score)
                if len(snippets) < 8:
                    snippets.append(ContextSnippet(
                        text=_extract_snippet(c.comment.body, keyword),
                        sentiment_score=c.sentiment.compound_score,
                        sentiment_label=c.sentiment.label.value,
                        source_type="comment",
                    ))

        stats = _compute_sentiment_stats(matching_scores, matching_labels)

        # Top positive/negative posts
        sorted_posts = sorted(matching_posts, key=lambda p: p.sentiment.compound_score, reverse=True)
        top_positive = sorted_posts[:5]
        top_negative = sorted_posts[-5:][::-1] if len(sorted_posts) > 5 else []

        # Timeline
        timeline = [
            KeywordTimePoint(
                date=d,
                avg_sentiment=round(statistics.mean(scores), 4),
                mention_count=len(scores),
            )
            for d, scores in sorted(timeline_data.items())
        ]

        results.append(KeywordAnalysisResult(
            keyword=keyword,
            mention_count=len(matching_scores),
            stats=stats,
            baseline_stats=baseline_stats,
            top_positive=top_positive,
            top_negative=top_negative,
            timeline=timeline,
            snippets=snippets,
            distribution=matching_scores,
        ))

    return KeywordAnalysisResponse(analysis_id=req.analysis_id, results=results)


# ── Word cloud generation ─────────────────────────────────────────────────

@app.get("/api/analysis/{analysis_id}/wordcloud/{sentiment}")
async def get_wordcloud(
    analysis_id: str,
    sentiment: str,
    custom_stopwords: Optional[str] = Query(None, description="Comma-separated custom stop words"),
):
    if analysis_id not in _analyses:
        raise HTTPException(status_code=404, detail="Analysis not found")

    analysis = _analyses[analysis_id]

    try:
        target = SentimentLabel(sentiment)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid sentiment: use positive, negative, or neutral")

    texts = []
    for p in analysis.posts:
        if p.sentiment.label == target:
            texts.append(f"{p.post.title} {p.post.selftext}")
    for c in analysis.comments:
        if c.sentiment.label == target:
            texts.append(c.comment.body)

    if not texts:
        raise HTTPException(status_code=404, detail=f"No {sentiment} texts found")

    stopwords = custom_stopwords.split(",") if custom_stopwords else None
    image_b64 = await asyncio.get_event_loop().run_in_executor(
        None, generate_wordcloud_image, texts, 100, stopwords
    )

    return {"image": image_b64, "sentiment": sentiment, "text_count": len(texts)}


# ── Export CSV ─────────────────────────────────────────────────────────────

@app.get("/api/analysis/{analysis_id}/export/csv")
async def export_csv(analysis_id: str):
    if analysis_id not in _analyses:
        raise HTTPException(status_code=404, detail="Analysis not found")

    analysis = _analyses[analysis_id]
    output = io.StringIO()
    writer = csv.writer(output)

    # Posts sheet
    writer.writerow([
        "type", "subreddit", "id", "title", "text", "author", "score",
        "num_comments", "created_utc", "permalink",
        "sentiment_label", "sentiment_confidence", "compound_score",
    ])

    for p in analysis.posts:
        writer.writerow([
            "post", p.post.subreddit, p.post.id, p.post.title, p.post.selftext,
            p.post.author, p.post.score, p.post.num_comments, p.post.created_utc,
            f"https://reddit.com{p.post.permalink}",
            p.sentiment.label.value, p.sentiment.confidence, p.sentiment.compound_score,
        ])

    for c in analysis.comments:
        writer.writerow([
            "comment", c.comment.subreddit, c.comment.id, "", c.comment.body,
            c.comment.author, c.comment.score, "", c.comment.created_utc, "",
            c.sentiment.label.value, c.sentiment.confidence, c.sentiment.compound_score,
        ])

    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename=analysis_{analysis_id}.csv"},
    )


# ── Export PDF ─────────────────────────────────────────────────────────────

@app.get("/api/analysis/{analysis_id}/export/pdf")
async def export_pdf(analysis_id: str):
    if analysis_id not in _analyses:
        raise HTTPException(status_code=404, detail="Analysis not found")

    analysis = _analyses[analysis_id]

    def _generate_pdf() -> bytes:
        from reportlab.lib.pagesizes import letter
        from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
        from reportlab.lib.units import inch
        from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer

        buf = io.BytesIO()
        doc = SimpleDocTemplate(buf, pagesize=letter)
        styles = getSampleStyleSheet()

        title_style = ParagraphStyle("CustomTitle", parent=styles["Title"], fontSize=18)
        heading_style = ParagraphStyle("CustomHeading", parent=styles["Heading2"], fontSize=14)
        body_style = ParagraphStyle("CustomBody", parent=styles["BodyText"], fontSize=10, leading=14)

        story = []
        story.append(Paragraph("SubReddit Sentiment Analysis Report", title_style))
        story.append(Spacer(1, 0.3 * inch))

        # Subreddit summaries
        for s in analysis.subreddit_summaries:
            story.append(Paragraph(f"r/{s.subreddit}", heading_style))
            story.append(Paragraph(
                f"Posts analyzed: {s.post_count} | Comments: {s.comment_count}<br/>"
                f"Mean sentiment: {s.post_stats.mean:.3f} | "
                f"Positive: {s.post_stats.positive_pct:.1f}% | "
                f"Neutral: {s.post_stats.neutral_pct:.1f}% | "
                f"Negative: {s.post_stats.negative_pct:.1f}%",
                body_style,
            ))
            story.append(Spacer(1, 0.2 * inch))

        # Summary
        story.append(Paragraph("Summary", heading_style))
        for para in analysis.summary_text.split("\n\n"):
            story.append(Paragraph(para, body_style))
            story.append(Spacer(1, 0.1 * inch))

        # Top positive posts
        story.append(Paragraph("Most Positive Posts", heading_style))
        top_pos = sorted(analysis.posts, key=lambda p: p.sentiment.compound_score, reverse=True)[:10]
        for i, p in enumerate(top_pos, 1):
            story.append(Paragraph(
                f"{i}. [{p.sentiment.compound_score:.3f}] {p.post.title[:100]}",
                body_style,
            ))

        story.append(Spacer(1, 0.2 * inch))

        # Top negative posts
        story.append(Paragraph("Most Negative Posts", heading_style))
        top_neg = sorted(analysis.posts, key=lambda p: p.sentiment.compound_score)[:10]
        for i, p in enumerate(top_neg, 1):
            story.append(Paragraph(
                f"{i}. [{p.sentiment.compound_score:.3f}] {p.post.title[:100]}",
                body_style,
            ))

        doc.build(story)
        buf.seek(0)
        return buf.read()

    pdf_bytes = await asyncio.get_event_loop().run_in_executor(None, _generate_pdf)

    return StreamingResponse(
        iter([pdf_bytes]),
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename=analysis_{analysis_id}.pdf"},
    )


# ── History endpoints ────────────────────────────────────────────────────

@app.get("/api/analyses")
async def list_analyses():
    """List all saved analyses (metadata only)."""
    return await db_list_analyses()


@app.get("/api/analyses/{analysis_id}")
async def get_saved_analysis(analysis_id: str):
    """Retrieve full saved analysis data."""
    data = await db_get_analysis(analysis_id)
    if data is None:
        raise HTTPException(status_code=404, detail="Analysis not found")
    return data


@app.delete("/api/analyses/{analysis_id}")
async def delete_saved_analysis(analysis_id: str):
    """Delete a saved analysis."""
    deleted = await db_delete_analysis(analysis_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Analysis not found")
    # Also remove from in-memory cache if present
    _analyses.pop(analysis_id, None)
    _analysis_posts.pop(analysis_id, None)
    _analysis_comments.pop(analysis_id, None)
    return {"status": "ok"}


# ── Static file serving (production) ──────────────────────────────────────

FRONTEND_DIR = Path(__file__).resolve().parent.parent.parent / "frontend" / "dist"

if FRONTEND_DIR.exists():
    app.mount("/assets", StaticFiles(directory=str(FRONTEND_DIR / "assets")), name="static")

    @app.get("/{full_path:path}")
    async def serve_spa(request: Request, full_path: str):
        """Serve the SPA — return index.html for all non-API routes."""
        # Try to serve a static file first
        file_path = FRONTEND_DIR / full_path
        if file_path.is_file():
            return FileResponse(str(file_path))
        # Fall back to index.html for SPA routing
        return FileResponse(str(FRONTEND_DIR / "index.html"))
