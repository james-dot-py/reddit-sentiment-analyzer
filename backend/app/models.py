"""Pydantic models for request/response schemas."""

from __future__ import annotations

from enum import Enum
from typing import Optional

from pydantic import BaseModel, Field


# ── Enums ──────────────────────────────────────────────────────────────────

class SortMethod(str, Enum):
    hot = "hot"
    new = "new"
    rising = "rising"
    top = "top"


class TimeFilter(str, Enum):
    day = "day"
    week = "week"
    month = "month"
    year = "year"
    all = "all"


class SentimentLabel(str, Enum):
    positive = "positive"
    neutral = "neutral"
    negative = "negative"


# ── Reddit Data Models ─────────────────────────────────────────────────────

class RedditPost(BaseModel):
    id: str
    subreddit: str
    title: str
    selftext: str = ""
    author: str = "[deleted]"
    score: int = 0
    upvote_ratio: float = 0.0
    num_comments: int = 0
    created_utc: float = 0
    permalink: str = ""
    url: str = ""
    source: str = "listing"  # "listing", "search_relevance", "search_new", "poll_new"


class RedditComment(BaseModel):
    id: str
    post_id: str
    subreddit: str
    body: str
    author: str = "[deleted]"
    score: int = 0
    created_utc: float = 0


# ── Sentiment Results ──────────────────────────────────────────────────────

class SentimentResult(BaseModel):
    label: SentimentLabel
    confidence: float = Field(..., ge=0, le=1)
    compound_score: float = Field(..., ge=-1, le=1)
    scores: dict[str, float] = Field(default_factory=dict, description="Per-label probabilities")


class PostWithSentiment(BaseModel):
    post: RedditPost
    sentiment: SentimentResult


class CommentWithSentiment(BaseModel):
    comment: RedditComment
    sentiment: SentimentResult


# ── Aggregated Stats ───────────────────────────────────────────────────────

class SentimentStats(BaseModel):
    mean: float
    median: float
    std_dev: float
    positive_pct: float
    neutral_pct: float
    negative_pct: float
    total_count: int


class SubredditSentimentSummary(BaseModel):
    subreddit: str
    post_stats: SentimentStats
    comment_stats: Optional[SentimentStats] = None
    post_count: int
    comment_count: int


class TimeSeriesPoint(BaseModel):
    date: str
    avg_sentiment: float
    count: int
    subreddit: str


# ── NLP Models ─────────────────────────────────────────────────────────────

class NamedEntity(BaseModel):
    text: str
    label: str  # PERSON, ORG, GPE, etc.
    count: int


class NgramEntry(BaseModel):
    text: str
    count: int


class TextStatistics(BaseModel):
    avg_post_length: float
    avg_comment_length: Optional[float] = None
    vocabulary_richness: float
    reading_level: float
    total_words: int


class NLPInsights(BaseModel):
    entities: list[NamedEntity]
    bigrams: list[NgramEntry]
    trigrams: list[NgramEntry]
    text_stats: TextStatistics


# ── Legacy Analysis Response (for existing snapshot compat) ────────────────

class AnalysisResponse(BaseModel):
    analysis_id: str
    subreddit_summaries: list[SubredditSentimentSummary]
    posts: list[PostWithSentiment]
    comments: list[CommentWithSentiment]
    time_series: list[TimeSeriesPoint]
    nlp_insights: NLPInsights
    summary_text: str
    sentiment_distribution: list[float] = Field(
        default_factory=list, description="All compound scores for histogram"
    )
    tribal_analysis: Optional[dict] = None
