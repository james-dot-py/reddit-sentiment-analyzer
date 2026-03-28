"""Clerk JWT authentication for FastAPI.

Verifies Clerk-issued JWTs using the JWKS endpoint and provides
FastAPI dependencies for protected routes.
"""

from __future__ import annotations

import logging
import os
import time
from typing import Any

import httpx
import jwt as pyjwt
from fastapi import HTTPException, Request

from .database import upsert_user

logger = logging.getLogger(__name__)

# ── JWKS caching ──────────────────────────────────────────────────────────

_jwks_cache: dict[str, Any] = {}
_jwks_fetched_at: float = 0
_JWKS_TTL = 3600  # Cache JWKS for 1 hour


def _get_clerk_domain() -> str:
    """Get Clerk domain from environment."""
    # Clerk publishable key contains the domain: pk_test_<base64>
    # But we also accept a direct CLERK_DOMAIN env var
    domain = os.getenv("CLERK_DOMAIN", "")
    if domain:
        return domain.rstrip("/")

    # Try to extract from CLERK_PUBLISHABLE_KEY is not straightforward,
    # so we require CLERK_DOMAIN or CLERK_JWKS_URL
    raise ValueError(
        "CLERK_DOMAIN environment variable is required "
        "(e.g., 'your-app.clerk.accounts.dev')"
    )


async def _fetch_jwks() -> dict[str, Any]:
    """Fetch and cache Clerk's JWKS."""
    global _jwks_cache, _jwks_fetched_at

    now = time.time()
    if _jwks_cache and (now - _jwks_fetched_at) < _JWKS_TTL:
        return _jwks_cache

    jwks_url = os.getenv("CLERK_JWKS_URL", "")
    if not jwks_url:
        domain = _get_clerk_domain()
        jwks_url = f"https://{domain}/.well-known/jwks.json"

    async with httpx.AsyncClient() as client:
        resp = await client.get(jwks_url, timeout=10)
        resp.raise_for_status()
        _jwks_cache = resp.json()
        _jwks_fetched_at = now
        logger.info("Fetched Clerk JWKS from %s", jwks_url)

    return _jwks_cache


async def verify_clerk_token(token: str) -> dict[str, Any]:
    """Verify a Clerk JWT and return its claims.

    Returns dict with at least: sub (clerk user id), email, name
    """
    jwks_data = await _fetch_jwks()

    # Get the signing key from JWKS
    try:
        unverified_header = pyjwt.get_unverified_header(token)
    except pyjwt.exceptions.DecodeError:
        raise HTTPException(status_code=401, detail="Invalid token format")

    kid = unverified_header.get("kid")
    if not kid:
        raise HTTPException(status_code=401, detail="Token missing key ID")

    # Find matching key in JWKS
    signing_key = None
    for key_data in jwks_data.get("keys", []):
        if key_data.get("kid") == kid:
            signing_key = pyjwt.algorithms.RSAAlgorithm.from_jwk(key_data)
            break

    if not signing_key:
        # Key not found — maybe JWKS rotated, refetch once
        global _jwks_fetched_at
        _jwks_fetched_at = 0
        jwks_data = await _fetch_jwks()
        for key_data in jwks_data.get("keys", []):
            if key_data.get("kid") == kid:
                signing_key = pyjwt.algorithms.RSAAlgorithm.from_jwk(key_data)
                break

    if not signing_key:
        raise HTTPException(status_code=401, detail="Unknown signing key")

    try:
        claims = pyjwt.decode(
            token,
            signing_key,
            algorithms=["RS256"],
            options={"verify_aud": False},  # Clerk doesn't always set audience
        )
    except pyjwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except pyjwt.InvalidTokenError as e:
        raise HTTPException(status_code=401, detail=f"Invalid token: {e}")

    return claims


def _extract_token(request: Request) -> str | None:
    """Extract Bearer token from Authorization header."""
    auth = request.headers.get("authorization", "")
    if auth.startswith("Bearer "):
        return auth[7:]
    return None


async def get_current_user(request: Request) -> dict:
    """FastAPI dependency: require auth, return user dict from DB.

    Extracts Clerk JWT from Authorization header, verifies it,
    and upserts the user in our database.
    """
    token = _extract_token(request)
    if not token:
        raise HTTPException(status_code=401, detail="Authentication required")

    claims = await verify_clerk_token(token)

    clerk_id = claims.get("sub", "")
    if not clerk_id:
        raise HTTPException(status_code=401, detail="Invalid token: missing subject")

    # Extract email — Clerk puts it in different places depending on config
    email = (
        claims.get("email", "")
        or claims.get("primary_email_address", "")
        or claims.get("email_addresses", [{}])[0].get("email_address", "")
        if isinstance(claims.get("email_addresses"), list) and claims.get("email_addresses")
        else claims.get("email", "")
    )

    name = claims.get("name", "") or claims.get("first_name", "")

    user = await upsert_user(clerk_id=clerk_id, email=email, display_name=name)
    return user


async def optional_user(request: Request) -> dict | None:
    """FastAPI dependency: return user if authenticated, None otherwise.

    Does not raise 401 — used for endpoints that work both ways.
    """
    token = _extract_token(request)
    if not token:
        return None

    try:
        return await get_current_user(request)
    except HTTPException:
        return None
