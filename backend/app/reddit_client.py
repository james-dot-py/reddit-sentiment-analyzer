"""Reddit data fetching — OAuth API or public JSON fallback.

If REDDIT_CLIENT_ID and REDDIT_CLIENT_SECRET are set, uses the OAuth API
(oauth.reddit.com) for higher rate limits.  Otherwise, falls back to the
public JSON endpoints (www.reddit.com/…/.json) which require no credentials.

Features:
- Paginated listing fetches (top, hot, new, rising)
- Subreddit search (search.json) for brand-specific mention collection
- Full comment tree fetching with configurable depth
- Exponential backoff on 429 rate-limit responses
- Request counting for collection metrics
"""

from __future__ import annotations

import asyncio
import logging
import os
import random
import time
from dataclasses import dataclass, field
from typing import Optional

import httpx

from .models import RedditPost, RedditComment, SortMethod, TimeFilter

logger = logging.getLogger(__name__)

USER_AGENT = "SubRedditSentimentAnalyzer/1.0 (research tool)"
OAUTH_BASE_URL = "https://oauth.reddit.com"
PUBLIC_BASE_URL = "https://www.reddit.com"
RATE_LIMIT_OAUTH = 0.7   # ~60 req/min with OAuth
RATE_LIMIT_PUBLIC = 1.2   # ~30 req/min without auth (be conservative)

MAX_RETRIES = 5
INITIAL_BACKOFF = 2.0  # seconds


@dataclass
class RequestMetrics:
    """Tracks request counts and errors for a collection run."""
    requests: int = 0
    retries: int = 0
    errors: int = 0
    posts_fetched: int = 0
    comments_fetched: int = 0
    search_requests: int = 0
    start_time: float = field(default_factory=time.monotonic)

    @property
    def elapsed(self) -> float:
        return round(time.monotonic() - self.start_time, 1)

    def summary(self) -> dict:
        return {
            "requests": self.requests,
            "retries": self.retries,
            "errors": self.errors,
            "posts_fetched": self.posts_fetched,
            "comments_fetched": self.comments_fetched,
            "search_requests": self.search_requests,
            "elapsed_seconds": self.elapsed,
        }


def _parse_post(d: dict, subreddit: str) -> RedditPost:
    """Parse a Reddit post dict into a RedditPost model."""
    return RedditPost(
        id=d.get("id", ""),
        subreddit=subreddit,
        title=d.get("title", ""),
        selftext=d.get("selftext", ""),
        author=d.get("author", "[deleted]"),
        score=d.get("score", 0),
        upvote_ratio=d.get("upvote_ratio", 0.0),
        num_comments=d.get("num_comments", 0),
        created_utc=d.get("created_utc", 0),
        permalink=d.get("permalink", ""),
        url=d.get("url", ""),
    )


class RedditClient:
    """Fetches Reddit data via OAuth API or public JSON endpoints."""

    def __init__(self):
        self._oauth_token: Optional[str] = None
        self._oauth_expires: float = 0
        self._client_id: str = os.environ.get("REDDIT_CLIENT_ID", "")
        self._client_secret: str = os.environ.get("REDDIT_CLIENT_SECRET", "")
        self._proxy_url: Optional[str] = os.environ.get("REDDIT_PROXY_URL")
        self._cache: dict[str, tuple[float, object]] = {}
        self._cache_ttl = 300  # 5 minutes
        self.metrics = RequestMetrics()

        if self.has_credentials:
            logger.info("Reddit OAuth credentials found — using authenticated API")
        else:
            logger.info(
                "No Reddit API credentials — using public JSON endpoints "
                "(slower rate limit, no auth required)"
            )

    def reset_metrics(self):
        """Reset request metrics for a new collection run."""
        self.metrics = RequestMetrics()

    @property
    def has_credentials(self) -> bool:
        return bool(self._client_id and self._client_secret)

    @property
    def _use_oauth(self) -> bool:
        return self.has_credentials

    @property
    def _rate_limit_delay(self) -> float:
        return RATE_LIMIT_OAUTH if self._use_oauth else RATE_LIMIT_PUBLIC

    @property
    def _is_authenticated(self) -> bool:
        return self._oauth_token is not None and time.time() < self._oauth_expires

    def _headers(self) -> dict[str, str]:
        headers = {"User-Agent": USER_AGENT}
        if self._use_oauth and self._is_authenticated:
            headers["Authorization"] = f"Bearer {self._oauth_token}"
        return headers

    async def _authenticate(self) -> None:
        """Obtain OAuth token using client credentials (app-only auth)."""
        if not self.has_credentials:
            raise RuntimeError(
                "Reddit API credentials not configured. "
                "Set REDDIT_CLIENT_ID and REDDIT_CLIENT_SECRET environment variables."
            )
        proxy_kwargs = {"proxy": self._proxy_url} if self._proxy_url else {}
        async with httpx.AsyncClient(**proxy_kwargs) as client:
            resp = await client.post(
                "https://www.reddit.com/api/v1/access_token",
                data={"grant_type": "client_credentials"},
                auth=(self._client_id, self._client_secret),
                headers={"User-Agent": USER_AGENT},
            )
            resp.raise_for_status()
            data = resp.json()
            self._oauth_token = data["access_token"]
            self._oauth_expires = time.time() + data.get("expires_in", 3600) - 60
            logger.info("Reddit OAuth authentication successful")

    def _get_cache(self, key: str):
        if key in self._cache:
            ts, val = self._cache[key]
            if time.time() - ts < self._cache_ttl:
                return val
            del self._cache[key]
        return None

    def _set_cache(self, key: str, value):
        self._cache[key] = (time.time(), value)

    async def _get_json(self, url: str, params: dict | None = None) -> dict:
        """Make a rate-limited GET request with exponential backoff on 429s."""
        cache_key = f"{url}:{params}"
        cached = self._get_cache(cache_key)
        if cached is not None:
            return cached

        if self._use_oauth and not self._is_authenticated:
            await self._authenticate()

        proxy_kwargs = {"proxy": self._proxy_url} if self._proxy_url else {}
        backoff = INITIAL_BACKOFF

        for attempt in range(MAX_RETRIES + 1):
            try:
                self.metrics.requests += 1
                async with httpx.AsyncClient(
                    timeout=30, follow_redirects=True, **proxy_kwargs
                ) as client:
                    resp = await client.get(
                        url, params=params, headers=self._headers()
                    )

                    if resp.status_code == 429:
                        if attempt < MAX_RETRIES:
                            # Jittered exponential backoff
                            wait = backoff + random.uniform(0, backoff * 0.5)
                            logger.warning(
                                f"Rate limited (429). Retry {attempt + 1}/{MAX_RETRIES} "
                                f"after {wait:.1f}s"
                            )
                            self.metrics.retries += 1
                            await asyncio.sleep(wait)
                            backoff *= 2
                            continue
                        else:
                            logger.error("Rate limited — max retries exhausted")
                            self.metrics.errors += 1
                            resp.raise_for_status()

                    resp.raise_for_status()
                    data = resp.json()
                    self._set_cache(cache_key, data)
                    return data

            except httpx.HTTPStatusError:
                raise
            except httpx.HTTPError as e:
                if attempt < MAX_RETRIES:
                    wait = backoff + random.uniform(0, 1)
                    logger.warning(
                        f"HTTP error: {e}. Retry {attempt + 1}/{MAX_RETRIES} "
                        f"after {wait:.1f}s"
                    )
                    self.metrics.retries += 1
                    await asyncio.sleep(wait)
                    backoff *= 2
                    continue
                self.metrics.errors += 1
                raise

        # Should not reach here, but just in case
        raise RuntimeError("Exhausted retries in _get_json")

    # ── URL builders ─────────────────────────────────────────────────────

    def _build_listing_url(self, subreddit: str, sort: SortMethod) -> str:
        """Build the listing URL for either OAuth or public mode."""
        if self._use_oauth:
            return f"{OAUTH_BASE_URL}/r/{subreddit}/{sort.value}"
        return f"{PUBLIC_BASE_URL}/r/{subreddit}/{sort.value}.json"

    def _build_search_url(self, subreddit: str) -> str:
        """Build the search URL for a subreddit."""
        if self._use_oauth:
            return f"{OAUTH_BASE_URL}/r/{subreddit}/search"
        return f"{PUBLIC_BASE_URL}/r/{subreddit}/search.json"

    def _build_global_search_url(self) -> str:
        """Build the /r/all search URL for subreddit discovery."""
        if self._use_oauth:
            return f"{OAUTH_BASE_URL}/search"
        return f"{PUBLIC_BASE_URL}/search.json"

    def _build_comments_url(self, subreddit: str, post_id: str) -> str:
        """Build the comments URL for either OAuth or public mode."""
        if self._use_oauth:
            return f"{OAUTH_BASE_URL}/r/{subreddit}/comments/{post_id}"
        return f"{PUBLIC_BASE_URL}/r/{subreddit}/comments/{post_id}.json"

    # ── Listing fetch ────────────────────────────────────────────────────

    async def fetch_posts(
        self,
        subreddit: str,
        sort: SortMethod = SortMethod.hot,
        time_filter: TimeFilter = TimeFilter.week,
        limit: int = 25,
        progress_callback=None,
    ) -> list[RedditPost]:
        """Fetch posts from a subreddit with pagination."""
        posts: list[RedditPost] = []
        after: Optional[str] = None
        fetched = 0
        batch_size = min(limit, 100)

        while fetched < limit:
            this_batch = min(batch_size, limit - fetched)
            url = self._build_listing_url(subreddit, sort)

            params: dict = {"limit": this_batch, "raw_json": 1}
            if sort in (SortMethod.top,):
                params["t"] = time_filter.value
            if after:
                params["after"] = after

            try:
                data = await self._get_json(url, params)
            except httpx.HTTPStatusError as e:
                if e.response.status_code == 404:
                    logger.error(f"Subreddit r/{subreddit} not found")
                    raise ValueError(f"Subreddit r/{subreddit} not found")
                raise
            except httpx.HTTPError as e:
                logger.error(f"HTTP error fetching r/{subreddit}: {e}")
                raise

            listing = data.get("data", {})
            children = listing.get("children", [])

            if not children:
                break

            for child in children:
                d = child.get("data", {})
                posts.append(_parse_post(d, subreddit))

            fetched += len(children)
            after = listing.get("after")

            if progress_callback:
                await progress_callback(fetched, limit, subreddit)

            if not after or len(children) < this_batch:
                break

            await asyncio.sleep(self._rate_limit_delay)

        result = posts[:limit]
        self.metrics.posts_fetched += len(result)
        return result

    # ── Search fetch ─────────────────────────────────────────────────────

    async def fetch_search(
        self,
        subreddit: str,
        query: str,
        sort: str = "relevance",
        time_filter: TimeFilter = TimeFilter.week,
        limit: int = 100,
    ) -> list[RedditPost]:
        """Search a subreddit for posts matching a query.

        Args:
            subreddit: Subreddit name (without r/)
            query: Search query string (brand name, aliases, etc.)
            sort: Sort order — "relevance", "new", "hot", "top", "comments"
            time_filter: Time window to search within
            limit: Maximum posts to return (paginated in batches of 100)

        Returns:
            List of RedditPost objects from search results.
        """
        posts: list[RedditPost] = []
        after: Optional[str] = None
        fetched = 0
        batch_size = min(limit, 100)

        while fetched < limit:
            this_batch = min(batch_size, limit - fetched)
            url = self._build_search_url(subreddit)

            params: dict = {
                "q": query,
                "restrict_sr": "true",
                "sort": sort,
                "t": time_filter.value,
                "limit": this_batch,
                "raw_json": 1,
                "type": "link",
            }
            if after:
                params["after"] = after

            try:
                self.metrics.search_requests += 1
                data = await self._get_json(url, params)
            except httpx.HTTPStatusError as e:
                if e.response.status_code == 404:
                    logger.warning(f"Search failed for r/{subreddit} — sub not found")
                    return posts
                logger.warning(
                    f"Search error r/{subreddit} q={query!r}: {e.response.status_code}"
                )
                return posts
            except httpx.HTTPError as e:
                logger.warning(f"Search HTTP error r/{subreddit} q={query!r}: {e}")
                return posts

            listing = data.get("data", {})
            children = listing.get("children", [])

            if not children:
                break

            for child in children:
                d = child.get("data", {})
                posts.append(_parse_post(d, d.get("subreddit", subreddit)))

            fetched += len(children)
            after = listing.get("after")

            if not after or len(children) < this_batch:
                break

            await asyncio.sleep(self._rate_limit_delay)

        result = posts[:limit]
        self.metrics.posts_fetched += len(result)
        return result

    async def discover_subreddits(
        self,
        query: str,
        time_filter: TimeFilter = TimeFilter.month,
        limit: int = 250,
    ) -> dict[str, int]:
        """Search /r/all for a brand name to discover which subreddits discuss it.

        Returns:
            Dict mapping subreddit names to mention counts, sorted descending.
        """
        posts = await self.fetch_search(
            subreddit="all",
            query=query,
            sort="relevance",
            time_filter=time_filter,
            limit=limit,
        )

        sub_counts: dict[str, int] = {}
        for post in posts:
            sub = post.subreddit
            sub_counts[sub] = sub_counts.get(sub, 0) + 1

        # Sort by count descending
        return dict(sorted(sub_counts.items(), key=lambda x: -x[1]))

    # ── Comment fetch ────────────────────────────────────────────────────

    async def fetch_comments(
        self,
        subreddit: str,
        post_id: str,
        depth: int = 1,
    ) -> list[RedditComment]:
        """Fetch comments for a specific post."""
        url = self._build_comments_url(subreddit, post_id)
        params = {"limit": 200, "depth": depth, "raw_json": 1}

        try:
            data = await self._get_json(url, params)
        except Exception as e:
            logger.warning(f"Failed to fetch comments for post {post_id}: {e}")
            return []

        comments: list[RedditComment] = []
        if isinstance(data, list) and len(data) > 1:
            self._extract_comments(data[1], post_id, subreddit, comments, depth)

        self.metrics.comments_fetched += len(comments)
        return comments

    def _extract_comments(
        self,
        listing: dict,
        post_id: str,
        subreddit: str,
        comments: list[RedditComment],
        max_depth: int,
        current_depth: int = 0,
    ):
        """Recursively extract comments from Reddit's nested structure."""
        if current_depth >= max_depth:
            return

        children = listing.get("data", {}).get("children", [])
        for child in children:
            if child.get("kind") != "t1":
                continue
            d = child.get("data", {})
            body = d.get("body", "")
            if body and body != "[deleted]" and body != "[removed]":
                comments.append(RedditComment(
                    id=d.get("id", ""),
                    post_id=post_id,
                    subreddit=subreddit,
                    body=body,
                    author=d.get("author", "[deleted]"),
                    score=d.get("score", 0),
                    created_utc=d.get("created_utc", 0),
                ))
            replies = d.get("replies")
            if isinstance(replies, dict):
                self._extract_comments(
                    replies, post_id, subreddit, comments, max_depth, current_depth + 1
                )

    # ── Combined fetch (legacy compat) ───────────────────────────────────

    async def fetch_all(
        self,
        subreddit: str,
        sort: SortMethod,
        time_filter: TimeFilter,
        post_limit: int,
        include_comments: bool,
        comment_depth: int,
        progress_callback=None,
    ) -> tuple[list[RedditPost], list[RedditComment]]:
        """Fetch posts and optionally comments for a subreddit."""
        posts = await self.fetch_posts(
            subreddit, sort, time_filter, post_limit, progress_callback
        )

        comments: list[RedditComment] = []
        if include_comments and posts:
            for i, post in enumerate(posts):
                post_comments = await self.fetch_comments(subreddit, post.id, comment_depth)
                comments.extend(post_comments)

                if progress_callback:
                    await progress_callback(
                        i + 1, len(posts), subreddit, stage="comments"
                    )

                await asyncio.sleep(self._rate_limit_delay)

        return posts, comments


# Singleton instance
reddit_client = RedditClient()
