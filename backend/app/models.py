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


# ── Request Models ─────────────────────────────────────────────────────────

class AnalysisRequest(BaseModel):
    subreddits: list[str] = Field(..., min_length=1, description="List of subreddit names")
    post_limit: int = Field(25, ge=1, le=1000)
    sort: SortMethod = SortMethod.hot
    time_filter: TimeFilter = TimeFilter.week
    include_comments: bool = False
    comment_depth: int = Field(1, ge=1, le=5)


class SampleAnalyzeRequest(BaseModel):
    subreddit: str = Field(..., description="Subreddit name matching a sample JSON file")


class SampleInfo(BaseModel):
    subreddit: str
    description: str
    post_count: int
    comment_count: int
    fetched_at: str
    sort: str
    time_filter: str
    cached: bool = False
    precomputed: bool = False


class KeywordSentimentRequest(BaseModel):
    keyword: str
    analysis_id: str


# ── Reddit Data Models ─────────────────────────────────────────────────────

class RedditPost(BaseModel):
    id: str
    subreddit: str
    title: str
    selftext: str = ""
    author: str = "[deleted]"
    score: int = 0
    num_comments: int = 0
    created_utc: float = 0
    permalink: str = ""
    url: str = ""


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


class KeywordComparison(BaseModel):
    keyword: str
    with_keyword: SentimentStats
    without_keyword: SentimentStats


class ContextSnippet(BaseModel):
    text: str
    sentiment_score: float
    sentiment_label: str
    source_type: str  # "post" or "comment"
    post_title: str = ""
    permalink: str = ""


class KeywordTimePoint(BaseModel):
    date: str
    avg_sentiment: float
    mention_count: int


class KeywordAnalysisResult(BaseModel):
    keyword: str
    mention_count: int
    stats: SentimentStats
    baseline_stats: SentimentStats
    top_positive: list[PostWithSentiment]
    top_negative: list[PostWithSentiment]
    timeline: list[KeywordTimePoint]
    snippets: list[ContextSnippet]
    distribution: list[float]


class KeywordAnalysisRequest(BaseModel):
    keywords: list[str] = Field(..., min_length=1, max_length=10)
    analysis_id: str


class KeywordAnalysisResponse(BaseModel):
    analysis_id: str
    results: list[KeywordAnalysisResult]


# ── Full Analysis Response ─────────────────────────────────────────────────

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


# ── Progress Updates (for SSE) ─────────────────────────────────────────────

class ProgressUpdate(BaseModel):
    stage: str  # "fetching", "analyzing", "nlp", "summarizing"
    message: str
    progress: float = Field(0, ge=0, le=1)  # 0-1
    partial_results: Optional[dict] = None
