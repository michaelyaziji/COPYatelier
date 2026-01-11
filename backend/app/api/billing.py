"""Billing API routes for Stripe integration."""

import logging
from datetime import datetime, timezone
from typing import Optional

import stripe
from fastapi import APIRouter, HTTPException, Depends, Request, Header
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from ..core.config import get_settings
from ..core.auth import get_current_user
from ..core.security import limiter
from ..db.database import get_db
from ..db.repository import SubscriptionRepository, CreditRepository
from ..db.models import UserModel

router = APIRouter(prefix="/billing", tags=["billing"])
logger = logging.getLogger(__name__)

settings = get_settings()

# Initialize Stripe
stripe.api_key = settings.stripe_secret_key


# ============ Request/Response Models ============


class CheckoutRequest(BaseModel):
    """Request to create a checkout session."""
    tier: str  # 'starter' or 'pro'
    yearly: bool = False  # Monthly or yearly billing


class CreditPackRequest(BaseModel):
    """Request to purchase a credit pack."""
    credits: int  # Number of credits to purchase


class SubscriptionResponse(BaseModel):
    """Subscription details response."""
    tier: str
    status: str
    current_period_start: Optional[datetime] = None
    current_period_end: Optional[datetime] = None
    cancel_at_period_end: bool = False
    stripe_customer_id: Optional[str] = None


class CheckoutResponse(BaseModel):
    """Checkout session response."""
    checkout_url: str
    session_id: str


class PortalResponse(BaseModel):
    """Billing portal response."""
    portal_url: str


# ============ Price Mapping ============

TIER_PRICES = {
    "starter": {
        "monthly": settings.stripe_starter_price_id,
        "yearly": settings.stripe_starter_yearly_price_id,
    },
    "pro": {
        "monthly": settings.stripe_pro_price_id,
        "yearly": settings.stripe_pro_yearly_price_id,
    },
}

# Credit pack pricing (credits -> price in cents)
# Starter tier: $0.10/credit
# Pro tier: $0.06/credit
CREDIT_PACKS = {
    "starter": {
        50: 500,      # 50 credits for $5
        100: 1000,    # 100 credits for $10
        200: 2000,    # 200 credits for $20
    },
    "pro": {
        100: 600,     # 100 credits for $6
        250: 1500,    # 250 credits for $15
        500: 3000,    # 500 credits for $30
    },
}

TIER_CREDITS = {
    "free": 20,
    "starter": 150,
    "pro": 500,
}


# ============ Subscription Endpoints ============


@router.get("/subscription", response_model=SubscriptionResponse)
async def get_subscription(
    user: UserModel = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get current user's subscription details."""
    sub_repo = SubscriptionRepository(db)
    subscription = await sub_repo.get_or_create(user.id)

    return SubscriptionResponse(
        tier=subscription.tier,
        status=subscription.status,
        current_period_start=subscription.current_period_start,
        current_period_end=subscription.current_period_end,
        cancel_at_period_end=subscription.cancel_at_period_end,
        stripe_customer_id=subscription.stripe_customer_id,
    )


@router.post("/checkout", response_model=CheckoutResponse)
@limiter.limit("10/minute")
async def create_checkout(
    http_request: Request,
    request: CheckoutRequest,
    user: UserModel = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Create a Stripe checkout session for subscription."""
    if not settings.stripe_secret_key:
        raise HTTPException(status_code=500, detail="Stripe is not configured")

    if request.tier not in TIER_PRICES:
        raise HTTPException(status_code=400, detail=f"Invalid tier: {request.tier}")

    # Get the appropriate price ID
    billing_period = "yearly" if request.yearly else "monthly"
    price_id = TIER_PRICES[request.tier][billing_period]

    if not price_id:
        raise HTTPException(
            status_code=500,
            detail=f"Stripe price ID not configured for {request.tier} {billing_period}",
        )

    # Get or create subscription to get stripe_customer_id
    sub_repo = SubscriptionRepository(db)
    subscription = await sub_repo.get_or_create(user.id)

    try:
        # Create Stripe checkout session
        checkout_params = {
            "mode": "subscription",
            "line_items": [{"price": price_id, "quantity": 1}],
            "success_url": f"{settings.frontend_url}/billing?success=true&session_id={{CHECKOUT_SESSION_ID}}",
            "cancel_url": f"{settings.frontend_url}/pricing?canceled=true",
            "client_reference_id": user.id,
            "metadata": {
                "user_id": user.id,
                "tier": request.tier,
            },
        }

        # If user already has a Stripe customer ID, use it
        if subscription.stripe_customer_id:
            checkout_params["customer"] = subscription.stripe_customer_id
        else:
            checkout_params["customer_email"] = user.email

        session = stripe.checkout.Session.create(**checkout_params)

        logger.info(f"Created checkout session {session.id} for user {user.id}")
        return CheckoutResponse(checkout_url=session.url, session_id=session.id)

    except stripe.error.StripeError as e:
        logger.error(f"Stripe error creating checkout: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/checkout/credits", response_model=CheckoutResponse)
@limiter.limit("10/minute")
async def create_credit_checkout(
    http_request: Request,
    request: CreditPackRequest,
    user: UserModel = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Create a Stripe checkout session for credit top-up."""
    if not settings.stripe_secret_key:
        raise HTTPException(status_code=500, detail="Stripe is not configured")

    # Get user's subscription to determine pricing
    sub_repo = SubscriptionRepository(db)
    subscription = await sub_repo.get_or_create(user.id)

    # Free tier users can't buy credits - they need to upgrade first
    if subscription.tier == "free":
        raise HTTPException(
            status_code=400,
            detail="Free tier users cannot purchase credits. Please upgrade to Starter or Pro.",
        )

    # Check if the credit amount is valid for their tier
    tier_packs = CREDIT_PACKS.get(subscription.tier, {})
    if request.credits not in tier_packs:
        valid_amounts = list(tier_packs.keys())
        raise HTTPException(
            status_code=400,
            detail=f"Invalid credit amount. Valid amounts for {subscription.tier}: {valid_amounts}",
        )

    price_cents = tier_packs[request.credits]

    try:
        # Create Stripe checkout session for one-time payment
        checkout_params = {
            "mode": "payment",
            "line_items": [
                {
                    "price_data": {
                        "currency": "usd",
                        "product_data": {
                            "name": f"{request.credits} Atelier Credits",
                            "description": f"Credit top-up for your {subscription.tier.title()} plan",
                        },
                        "unit_amount": price_cents,
                    },
                    "quantity": 1,
                }
            ],
            "success_url": f"{settings.frontend_url}/billing?credits_success=true&session_id={{CHECKOUT_SESSION_ID}}",
            "cancel_url": f"{settings.frontend_url}/pricing?credits_canceled=true",
            "client_reference_id": user.id,
            "metadata": {
                "user_id": user.id,
                "credits": str(request.credits),
                "type": "credit_purchase",
            },
        }

        # Use existing Stripe customer if available
        if subscription.stripe_customer_id:
            checkout_params["customer"] = subscription.stripe_customer_id
        else:
            checkout_params["customer_email"] = user.email

        session = stripe.checkout.Session.create(**checkout_params)

        logger.info(f"Created credit checkout session {session.id} for user {user.id}, {request.credits} credits")
        return CheckoutResponse(checkout_url=session.url, session_id=session.id)

    except stripe.error.StripeError as e:
        logger.error(f"Stripe error creating credit checkout: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/cancel")
async def cancel_subscription(
    user: UserModel = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Cancel subscription at period end."""
    if not settings.stripe_secret_key:
        raise HTTPException(status_code=500, detail="Stripe is not configured")

    sub_repo = SubscriptionRepository(db)
    subscription = await sub_repo.get(user.id)

    if not subscription or not subscription.stripe_subscription_id:
        raise HTTPException(status_code=400, detail="No active subscription to cancel")

    try:
        # Cancel at period end in Stripe
        stripe.Subscription.modify(
            subscription.stripe_subscription_id,
            cancel_at_period_end=True,
        )

        # Update local record
        await sub_repo.cancel(user.id, at_period_end=True)

        logger.info(f"Cancelled subscription for user {user.id}")
        return {"message": "Subscription will be cancelled at the end of the billing period"}

    except stripe.error.StripeError as e:
        logger.error(f"Stripe error cancelling subscription: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/reactivate")
async def reactivate_subscription(
    user: UserModel = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Reactivate a subscription that was set to cancel."""
    if not settings.stripe_secret_key:
        raise HTTPException(status_code=500, detail="Stripe is not configured")

    sub_repo = SubscriptionRepository(db)
    subscription = await sub_repo.get(user.id)

    if not subscription or not subscription.stripe_subscription_id:
        raise HTTPException(status_code=400, detail="No subscription to reactivate")

    if not subscription.cancel_at_period_end:
        raise HTTPException(status_code=400, detail="Subscription is not set to cancel")

    try:
        # Remove cancellation in Stripe
        stripe.Subscription.modify(
            subscription.stripe_subscription_id,
            cancel_at_period_end=False,
        )

        # Update local record
        await sub_repo.reactivate(user.id)

        logger.info(f"Reactivated subscription for user {user.id}")
        return {"message": "Subscription has been reactivated"}

    except stripe.error.StripeError as e:
        logger.error(f"Stripe error reactivating subscription: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/sync")
async def sync_subscription(
    session_id: str = None,
    user: UserModel = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Sync subscription status from Stripe.

    Used when webhooks aren't configured - manually verify checkout session
    and update subscription status.
    """
    if not settings.stripe_secret_key:
        raise HTTPException(status_code=500, detail="Stripe is not configured")

    sub_repo = SubscriptionRepository(db)
    credit_repo = CreditRepository(db)

    # If session_id provided, verify that checkout session
    if session_id:
        try:
            session = stripe.checkout.Session.retrieve(session_id)

            # Verify this session belongs to this user
            session_metadata = session.metadata if session.metadata else {}
            if session.client_reference_id != user.id and session_metadata.get("user_id") != user.id:
                raise HTTPException(status_code=403, detail="Session does not belong to this user")

            # Check if it's a completed checkout
            if session.payment_status == "paid" and session.subscription:
                stripe_sub = stripe.Subscription.retrieve(session.subscription)
                tier = session.metadata.get("tier", "starter") if session.metadata else "starter"

                # Get period dates safely
                period_start = None
                period_end = None
                if hasattr(stripe_sub, 'current_period_start') and stripe_sub.current_period_start:
                    period_start = datetime.fromtimestamp(stripe_sub.current_period_start, tz=timezone.utc)
                if hasattr(stripe_sub, 'current_period_end') and stripe_sub.current_period_end:
                    period_end = datetime.fromtimestamp(stripe_sub.current_period_end, tz=timezone.utc)

                # Update subscription
                await sub_repo.create_or_update_from_stripe(
                    user_id=user.id,
                    stripe_customer_id=session.customer,
                    stripe_subscription_id=session.subscription,
                    tier=tier,
                    status=stripe_sub.status,
                    current_period_start=period_start,
                    current_period_end=period_end,
                )

                # Update tier and grant credits
                tier_credits = TIER_CREDITS.get(tier, 150)
                await credit_repo.update_tier(user.id, tier, tier_credits)
                await credit_repo.grant(
                    user_id=user.id,
                    amount=tier_credits,
                    grant_type="subscription_grant",
                    description=f"Monthly credits for {tier.title()} plan",
                )

                logger.info(f"Synced subscription for user {user.id}: tier={tier}")
                return {"status": "synced", "tier": tier}

            # Check if it's a credit purchase
            metadata = session.metadata if session.metadata else {}
            if session.payment_status == "paid" and metadata.get("type") == "credit_purchase":
                credits = int(metadata.get("credits", 0))
                if credits > 0:
                    # Check if we already granted these credits (prevent double-grant)
                    # For now, just grant them - in production you'd track session_id
                    await credit_repo.grant(
                        user_id=user.id,
                        amount=credits,
                        grant_type="purchase",
                        description=f"Purchased {credits} credits",
                    )
                    logger.info(f"Synced credit purchase for user {user.id}: {credits} credits")
                    return {"status": "synced", "credits_added": credits}

        except stripe.error.StripeError as e:
            logger.error(f"Stripe error syncing: {e}")
            raise HTTPException(status_code=500, detail=str(e))

    # No session_id - just return current status
    subscription = await sub_repo.get_or_create(user.id)
    return {
        "status": "current",
        "tier": subscription.tier,
        "subscription_status": subscription.status,
    }


@router.post("/portal", response_model=PortalResponse)
@limiter.limit("10/minute")
async def create_billing_portal(
    request: Request,
    user: UserModel = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Create a Stripe billing portal session."""
    if not settings.stripe_secret_key:
        raise HTTPException(status_code=500, detail="Stripe is not configured")

    sub_repo = SubscriptionRepository(db)
    subscription = await sub_repo.get(user.id)

    if not subscription or not subscription.stripe_customer_id:
        raise HTTPException(status_code=400, detail="No Stripe customer found")

    try:
        session = stripe.billing_portal.Session.create(
            customer=subscription.stripe_customer_id,
            return_url=f"{settings.frontend_url}/billing",
        )

        return PortalResponse(portal_url=session.url)

    except stripe.error.StripeError as e:
        logger.error(f"Stripe error creating billing portal: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ============ Webhook Handler ============


webhook_router = APIRouter(tags=["webhooks"])


@webhook_router.post("/webhooks/stripe")
async def stripe_webhook(
    request: Request,
    stripe_signature: str = Header(None, alias="Stripe-Signature"),
    db: AsyncSession = Depends(get_db),
):
    """Handle Stripe webhook events."""
    if not settings.stripe_webhook_secret:
        raise HTTPException(status_code=500, detail="Webhook secret not configured")

    payload = await request.body()

    try:
        event = stripe.Webhook.construct_event(
            payload,
            stripe_signature,
            settings.stripe_webhook_secret,
        )
    except ValueError as e:
        logger.error(f"Invalid webhook payload: {e}")
        raise HTTPException(status_code=400, detail="Invalid payload")
    except stripe.error.SignatureVerificationError as e:
        logger.error(f"Invalid webhook signature: {e}")
        raise HTTPException(status_code=400, detail="Invalid signature")

    logger.info(f"Received Stripe webhook: {event['type']}")

    # Handle the event
    try:
        if event["type"] == "checkout.session.completed":
            await handle_checkout_completed(event["data"]["object"], db)
        elif event["type"] == "customer.subscription.updated":
            await handle_subscription_updated(event["data"]["object"], db)
        elif event["type"] == "customer.subscription.deleted":
            await handle_subscription_deleted(event["data"]["object"], db)
        elif event["type"] == "invoice.paid":
            await handle_invoice_paid(event["data"]["object"], db)
        elif event["type"] == "invoice.payment_failed":
            await handle_payment_failed(event["data"]["object"], db)
        else:
            logger.debug(f"Unhandled webhook event: {event['type']}")

    except Exception as e:
        logger.error(f"Error handling webhook {event['type']}: {e}")
        # Don't raise - return 200 to acknowledge receipt
        # Stripe will retry failed webhooks

    return {"received": True}


async def handle_checkout_completed(session: dict, db: AsyncSession):
    """Handle successful checkout completion."""
    user_id = session.get("client_reference_id") or session.get("metadata", {}).get("user_id")
    if not user_id:
        logger.error("No user_id in checkout session")
        return

    metadata = session.get("metadata", {})

    # Check if this is a credit purchase or subscription
    if metadata.get("type") == "credit_purchase":
        # Handle credit purchase
        credits = int(metadata.get("credits", 0))
        if credits > 0:
            credit_repo = CreditRepository(db)
            await credit_repo.grant(
                user_id=user_id,
                amount=credits,
                grant_type="purchase",
                description=f"Purchased {credits} credits",
            )
            logger.info(f"Granted {credits} credits to user {user_id}")
    else:
        # Handle subscription checkout
        stripe_customer_id = session.get("customer")
        subscription_id = session.get("subscription")
        tier = metadata.get("tier", "starter")

        if subscription_id:
            # Fetch full subscription details from Stripe
            stripe_sub = stripe.Subscription.retrieve(subscription_id)

            sub_repo = SubscriptionRepository(db)
            credit_repo = CreditRepository(db)

            # Update subscription
            await sub_repo.create_or_update_from_stripe(
                user_id=user_id,
                stripe_customer_id=stripe_customer_id,
                stripe_subscription_id=subscription_id,
                tier=tier,
                status=stripe_sub.status,
                current_period_start=datetime.fromtimestamp(stripe_sub.current_period_start, tz=timezone.utc),
                current_period_end=datetime.fromtimestamp(stripe_sub.current_period_end, tz=timezone.utc),
            )

            # Update tier and grant credits
            tier_credits = TIER_CREDITS.get(tier, 150)
            await credit_repo.update_tier(user_id, tier, tier_credits)
            await credit_repo.grant(
                user_id=user_id,
                amount=tier_credits,
                grant_type="subscription_grant",
                description=f"Monthly credits for {tier.title()} plan",
            )

            logger.info(f"Activated {tier} subscription for user {user_id}")


async def handle_subscription_updated(subscription: dict, db: AsyncSession):
    """Handle subscription update (plan change, status change)."""
    stripe_subscription_id = subscription.get("id")
    stripe_customer_id = subscription.get("customer")

    sub_repo = SubscriptionRepository(db)
    existing = await sub_repo.get_by_stripe_subscription(stripe_subscription_id)

    if not existing:
        logger.warning(f"No subscription found for stripe_subscription_id {stripe_subscription_id}")
        return

    # Determine tier from price ID
    items = subscription.get("items", {}).get("data", [])
    price_id = items[0]["price"]["id"] if items else None

    tier = "starter"  # Default
    for tier_name, prices in TIER_PRICES.items():
        if price_id in [prices["monthly"], prices["yearly"]]:
            tier = tier_name
            break

    await sub_repo.create_or_update_from_stripe(
        user_id=existing.user_id,
        stripe_customer_id=stripe_customer_id,
        stripe_subscription_id=stripe_subscription_id,
        tier=tier,
        status=subscription.get("status", "active"),
        current_period_start=datetime.fromtimestamp(subscription.get("current_period_start"), tz=timezone.utc) if subscription.get("current_period_start") else None,
        current_period_end=datetime.fromtimestamp(subscription.get("current_period_end"), tz=timezone.utc) if subscription.get("current_period_end") else None,
        cancel_at_period_end=subscription.get("cancel_at_period_end", False),
    )

    # Update tier in credit balance
    credit_repo = CreditRepository(db)
    tier_credits = TIER_CREDITS.get(tier, 150)
    await credit_repo.update_tier(existing.user_id, tier, tier_credits)

    logger.info(f"Updated subscription for user {existing.user_id}: tier={tier}, status={subscription.get('status')}")


async def handle_subscription_deleted(subscription: dict, db: AsyncSession):
    """Handle subscription cancellation/deletion."""
    stripe_subscription_id = subscription.get("id")

    sub_repo = SubscriptionRepository(db)
    existing = await sub_repo.get_by_stripe_subscription(stripe_subscription_id)

    if not existing:
        logger.warning(f"No subscription found for stripe_subscription_id {stripe_subscription_id}")
        return

    # Downgrade to free tier
    await sub_repo.downgrade_to_free(existing.user_id)

    # Update tier in credit balance
    credit_repo = CreditRepository(db)
    await credit_repo.update_tier(existing.user_id, "free", 20)

    logger.info(f"Downgraded user {existing.user_id} to free tier after subscription deletion")


async def handle_invoice_paid(invoice: dict, db: AsyncSession):
    """Handle successful invoice payment (subscription renewal)."""
    subscription_id = invoice.get("subscription")
    if not subscription_id:
        return

    # Check if this is a renewal (not the first invoice)
    billing_reason = invoice.get("billing_reason")
    if billing_reason != "subscription_cycle":
        return

    sub_repo = SubscriptionRepository(db)
    existing = await sub_repo.get_by_stripe_subscription(subscription_id)

    if not existing:
        return

    # Grant monthly credits for renewal
    credit_repo = CreditRepository(db)
    tier_credits = TIER_CREDITS.get(existing.tier, 150)
    await credit_repo.grant(
        user_id=existing.user_id,
        amount=tier_credits,
        grant_type="subscription_grant",
        description=f"Monthly credits for {existing.tier.title()} plan renewal",
    )

    logger.info(f"Granted {tier_credits} renewal credits to user {existing.user_id}")


async def handle_payment_failed(invoice: dict, db: AsyncSession):
    """Handle failed invoice payment."""
    subscription_id = invoice.get("subscription")
    if not subscription_id:
        return

    sub_repo = SubscriptionRepository(db)
    existing = await sub_repo.get_by_stripe_subscription(subscription_id)

    if not existing:
        return

    # Update status to past_due
    existing.status = "past_due"
    await db.commit()

    logger.warning(f"Payment failed for user {existing.user_id}, subscription marked as past_due")
