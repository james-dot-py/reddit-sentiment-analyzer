"""Reddit data fetching — OAuth API or public JSON fallback.

If REDDIT_CLIENT_ID and REDDIT_CLIENT_SECRET are set, uses the OAuth API
(oauth.reddit.com) for higher rate limits.  Otherwise, falls back to the
public JSON endpoints (www.reddit.com/…/.json) which require no credentials.
"""

from __future__ import annotations

import asyncio
import logging
import os
import time
from typing import Optional

import httpx

from .models import RedditPost, RedditComment, SortMethod, TimeFilter

logger = logging.getLogger(__name__)

USER_AGENT = "SubRedditSentimentAnalyzer/1.0 (research tool)"
OAUTH_BASE_URL = "https://oauth.reddit.com"
PUBLIC_BASE_URL = "https://www.reddit.com"
RATE_LIMIT_OAUTH = 0.7   # ~60 req/min with OAuth
RATE_LIMIT_PUBLIC = 1.2   # ~30 req/min without auth (be conservative)


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

        if self.has_credentials:
            logger.info("Reddit OAuth credentials found — using authenticated API")
        else:
            logger.info(
                "No Reddit API credentials — using public JSON endpoints "
                "(slower rate limit, no auth required)"
            )

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
        """Make a rate-limited GET request and return JSON."""
        cache_key = f"{url}:{params}"
        cached = self._get_cache(cache_key)
        if cached is not None:
            return cached

        if self._use_oauth and not self._is_authenticated:
            await self._authenticate()

        proxy_kwargs = {"proxy": self._proxy_url} if self._proxy_url else {}
        async with httpx.AsyncClient(timeout=30, follow_redirects=True, **proxy_kwargs) as client:
            resp = await client.get(url, params=params, headers=self._headers())
            resp.raise_for_status()
            data = resp.json()
            self._set_cache(cache_key, data)
            return data

    def _build_listing_url(self, subreddit: str, sort: SortMethod) -> str:
        """Build the listing URL for either OAuth or public mode."""
        if self._use_oauth:
            return f"{OAUTH_BASE_URL}/r/{subreddit}/{sort.value}"
        return f"{PUBLIC_BASE_URL}/r/{subreddit}/{sort.value}.json"

    def _build_comments_url(self, subreddit: str, post_id: str) -> str:
        """Build the comments URL for either OAuth or public mode."""
        if self._use_oauth:
            return f"{OAUTH_BASE_URL}/r/{subreddit}/comments/{post_id}"
        return f"{PUBLIC_BASE_URL}/r/{subreddit}/comments/{post_id}.json"

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
            if sort == SortMethod.top:
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
                posts.append(RedditPost(
                    id=d.get("id", ""),
                    subreddit=subreddit,
                    title=d.get("title", ""),
                    selftext=d.get("selftext", ""),
                    author=d.get("author", "[deleted]"),
                    score=d.get("score", 0),
                    num_comments=d.get("num_comments", 0),
                    created_utc=d.get("created_utc", 0),
                    permalink=d.get("permalink", ""),
                    url=d.get("url", ""),
                ))

            fetched += len(children)
            after = listing.get("after")

            if progress_callback:
                await progress_callback(fetched, limit, subreddit)

            if not after or len(children) < this_batch:
                break

            await asyncio.sleep(self._rate_limit_delay)

        return posts[:limit]

    async def fetch_comments(
        self,
        subreddit: str,
        post_id: str,
        depth: int = 1,
    ) -> list[RedditComment]:
        """Fetch comments for a specific post."""
        url = self._build_comments_url(subreddit, post_id)
        params = {"limit": 100, "depth": depth, "raw_json": 1}

        try:
            data = await self._get_json(url, params)
        except Exception as e:
            logger.warning(f"Failed to fetch comments for post {post_id}: {e}")
            return []

        comments: list[RedditComment] = []
        if isinstance(data, list) and len(data) > 1:
            self._extract_comments(data[1], post_id, subreddit, comments, depth)

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
