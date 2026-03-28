"""Tier definitions and limit checking for Undercurrent freemium model."""

from __future__ import annotations

TIERS = {
    "free": {
        "max_brands": 1,         # primary brands (competitors don't count)
        "max_subreddits": 2,
        "max_competitors": 0,
        "view_modes": ["briefing"],
        "history_weeks": 1,      # current week only
        "export_enabled": False,
        "competitive_context": False,
        "email_alerts": False,
        "api_access": False,
    },
    "pro": {
        "max_brands": 3,
        "max_subreddits": 5,
        "max_competitors": 2,
        "view_modes": ["briefing", "deep-dive"],
        "history_weeks": 52,
        "export_enabled": True,
        "competitive_context": True,
        "email_alerts": True,
        "api_access": False,
    },
    "enterprise": {
        "max_brands": -1,        # unlimited
        "max_subreddits": -1,
        "max_competitors": -1,
        "view_modes": ["briefing", "deep-dive"],
        "history_weeks": -1,     # unlimited
        "export_enabled": True,
        "competitive_context": True,
        "email_alerts": True,
        "api_access": True,
    },
}


def get_tier_limits(tier: str) -> dict:
    """Get limits for a tier. Defaults to free if unknown."""
    return TIERS.get(tier, TIERS["free"])


def check_limit(tier: str, resource: str, current_count: int) -> tuple[bool, str]:
    """Check if a resource limit would be exceeded.

    Returns (allowed, message). If allowed is False, message explains why.
    """
    limits = get_tier_limits(tier)

    limit_map = {
        "brands": "max_brands",
        "subreddits": "max_subreddits",
        "competitors": "max_competitors",
    }

    key = limit_map.get(resource)
    if not key or key not in limits:
        return True, ""

    max_allowed = limits[key]
    if max_allowed == -1:  # unlimited
        return True, ""

    if current_count >= max_allowed:
        return False, (
            f"Free tier allows {max_allowed} {resource}. "
            f"Upgrade to Pro for more."
        )

    return True, ""


def can_use_feature(tier: str, feature: str) -> bool:
    """Check if a tier has access to a feature."""
    limits = get_tier_limits(tier)
    return bool(limits.get(feature, False))
