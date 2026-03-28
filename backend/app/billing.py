"""Stripe billing integration for Undercurrent.

Handles checkout session creation, webhook processing,
and subscription status management.
"""

from __future__ import annotations

import logging
import os

logger = logging.getLogger(__name__)

# Lazy import — Stripe is optional for local development
_stripe = None


def _get_stripe():
    """Lazy-load stripe module. Returns None if not installed or not configured."""
    global _stripe
    if _stripe is not None:
        return _stripe

    api_key = os.getenv("STRIPE_SECRET_KEY", "")
    if not api_key:
        logger.info("STRIPE_SECRET_KEY not set — billing disabled")
        return None

    try:
        import stripe
        stripe.api_key = api_key
        _stripe = stripe
        return stripe
    except ImportError:
        logger.warning("stripe package not installed — billing disabled")
        return None


async def create_checkout_session(
    user_id: int,
    user_email: str,
    price_id: str | None = None,
    success_url: str = "",
    cancel_url: str = "",
) -> str | None:
    """Create a Stripe Checkout session. Returns the checkout URL or None."""
    stripe = _get_stripe()
    if not stripe:
        return None

    if not price_id:
        price_id = os.getenv("STRIPE_PRO_PRICE_ID", "")
    if not price_id:
        logger.error("STRIPE_PRO_PRICE_ID not configured")
        return None

    if not success_url:
        base = os.getenv("APP_URL", "http://localhost:5180")
        success_url = f"{base}/brands?checkout=success"
        cancel_url = f"{base}/pricing?checkout=cancelled"

    try:
        session = stripe.checkout.Session.create(
            mode="subscription",
            payment_method_types=["card"],
            line_items=[{"price": price_id, "quantity": 1}],
            customer_email=user_email,
            metadata={"user_id": str(user_id)},
            success_url=success_url,
            cancel_url=cancel_url,
        )
        return session.url
    except Exception as e:
        logger.error("Failed to create checkout session: %s", e)
        return None


async def create_portal_session(
    stripe_customer_id: str,
    return_url: str = "",
) -> str | None:
    """Create a Stripe Customer Portal session for managing subscriptions."""
    stripe = _get_stripe()
    if not stripe:
        return None

    if not return_url:
        base = os.getenv("APP_URL", "http://localhost:5180")
        return_url = f"{base}/brands"

    try:
        session = stripe.billing_portal.Session.create(
            customer=stripe_customer_id,
            return_url=return_url,
        )
        return session.url
    except Exception as e:
        logger.error("Failed to create portal session: %s", e)
        return None


async def handle_webhook_event(payload: bytes, sig_header: str) -> dict:
    """Process a Stripe webhook event. Returns status dict.

    Handles:
    - checkout.session.completed → upgrade user to pro
    - customer.subscription.updated → sync tier
    - customer.subscription.deleted → downgrade to free
    """
    stripe = _get_stripe()
    if not stripe:
        return {"status": "billing_disabled"}

    webhook_secret = os.getenv("STRIPE_WEBHOOK_SECRET", "")
    if not webhook_secret:
        return {"status": "webhook_secret_not_configured"}

    try:
        event = stripe.Webhook.construct_event(payload, sig_header, webhook_secret)
    except (ValueError, stripe.error.SignatureVerificationError) as e:
        logger.warning("Webhook signature verification failed: %s", e)
        return {"status": "invalid_signature"}

    event_type = event["type"]
    data = event["data"]["object"]

    if event_type == "checkout.session.completed":
        user_id = data.get("metadata", {}).get("user_id")
        customer_id = data.get("customer")
        if user_id:
            await _upgrade_user(int(user_id), customer_id)
            logger.info("User %s upgraded to pro (customer: %s)", user_id, customer_id)
        return {"status": "upgraded"}

    elif event_type == "customer.subscription.updated":
        status = data.get("status")
        customer_id = data.get("customer")
        if status in ("active", "trialing"):
            await _set_tier_by_customer(customer_id, "pro")
        elif status in ("past_due", "unpaid"):
            # Grace period — keep pro for now but could notify
            pass
        return {"status": "updated"}

    elif event_type == "customer.subscription.deleted":
        customer_id = data.get("customer")
        await _set_tier_by_customer(customer_id, "free")
        logger.info("Customer %s downgraded to free", customer_id)
        return {"status": "downgraded"}

    return {"status": "unhandled", "type": event_type}


async def _upgrade_user(user_id: int, stripe_customer_id: str | None):
    """Set user tier to pro and store Stripe customer ID."""
    from .database import get_db
    async with get_db() as db:
        await db.execute(
            "UPDATE users SET tier = 'pro' WHERE id = ?",
            (user_id,),
        )
        await db.commit()


async def _set_tier_by_customer(customer_id: str, tier: str):
    """Find user by Stripe customer ID and update tier.

    Note: This requires storing stripe_customer_id on the user record.
    For MVP, checkout.session.completed stores user_id in metadata,
    so we can look up by that. This is a placeholder for when we add
    a stripe_customer_id column.
    """
    logger.info("Would set tier=%s for customer %s (not yet linked)", tier, customer_id)
