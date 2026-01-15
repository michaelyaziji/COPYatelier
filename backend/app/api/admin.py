"""Admin API routes for dashboard and management."""

import logging
from typing import Optional

from fastapi import APIRouter, HTTPException, Depends, Query, Request
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from ..core.auth import get_admin_user
from ..core.security import limiter
from ..db.database import get_db
from ..db.repository import AdminRepository
from ..db.models import UserModel

router = APIRouter(prefix="/admin", tags=["admin"])
logger = logging.getLogger(__name__)


# ============ Request/Response Models ============


class GrantCreditsRequest(BaseModel):
    """Request body for granting credits."""
    amount: int
    reason: str


class SetAdminRequest(BaseModel):
    """Request body for setting admin status."""
    is_admin: bool


# ============ Dashboard Endpoints ============


@router.get("/stats")
@limiter.limit("60/minute")
async def get_dashboard_stats(
    request: Request,
    admin: UserModel = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """
    Get aggregated dashboard statistics.

    Returns user counts, revenue, usage, and health metrics.
    Admin access required.
    """
    repo = AdminRepository(db)
    stats = await repo.get_dashboard_stats()
    return stats


# ============ User Management Endpoints ============


@router.get("/users")
@limiter.limit("60/minute")
async def list_users(
    request: Request,
    limit: int = Query(default=50, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    tier: Optional[str] = Query(default=None),
    search: Optional[str] = Query(default=None),
    admin: UserModel = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """
    List all users with optional filters.

    Args:
        limit: Maximum number of results (1-500)
        offset: Number of results to skip
        tier: Filter by subscription tier (free, starter, pro)
        search: Search by email or display name

    Admin access required.
    """
    repo = AdminRepository(db)
    users = await repo.get_all_users(
        limit=limit,
        offset=offset,
        tier=tier,
        search=search,
    )
    total = await repo.get_user_count(tier=tier, search=search)

    return {
        "users": users,
        "total": total,
        "limit": limit,
        "offset": offset,
    }


@router.get("/users/{user_id}")
@limiter.limit("60/minute")
async def get_user_details(
    request: Request,
    user_id: str,
    admin: UserModel = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """
    Get detailed user information including recent activity.

    Returns user profile, subscription, credits, recent sessions,
    and recent transactions.

    Admin access required.
    """
    repo = AdminRepository(db)
    user_details = await repo.get_user_details(user_id)

    if not user_details:
        raise HTTPException(status_code=404, detail="User not found")

    return user_details


@router.post("/users/{user_id}/grant-credits")
@limiter.limit("30/minute")
async def grant_credits(
    request: Request,
    user_id: str,
    body: GrantCreditsRequest,
    admin: UserModel = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """
    Grant credits to a user.

    Creates an admin_grant transaction with audit trail.

    Admin access required.
    """
    if body.amount <= 0:
        raise HTTPException(status_code=400, detail="Amount must be positive")

    if not body.reason.strip():
        raise HTTPException(status_code=400, detail="Reason is required")

    repo = AdminRepository(db)
    transaction = await repo.admin_grant_credits(
        user_id=user_id,
        amount=body.amount,
        reason=body.reason.strip(),
        admin_id=admin.id,
    )

    if not transaction:
        raise HTTPException(status_code=404, detail="User not found")

    logger.info(f"Admin {admin.email} granted {body.amount} credits to user {user_id}")

    return {
        "status": "success",
        "transaction_id": transaction.id,
        "amount": body.amount,
        "new_balance": transaction.balance_after,
    }


@router.patch("/users/{user_id}/admin-status")
@limiter.limit("10/minute")
async def set_admin_status(
    request: Request,
    user_id: str,
    body: SetAdminRequest,
    admin: UserModel = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """
    Set or remove admin status for a user.

    Admin access required.
    """
    # Prevent removing own admin status
    if user_id == admin.id and not body.is_admin:
        raise HTTPException(
            status_code=400,
            detail="Cannot remove your own admin status"
        )

    repo = AdminRepository(db)
    user = await repo.set_admin_status(user_id, body.is_admin)

    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    action = "granted" if body.is_admin else "revoked"
    logger.info(f"Admin {admin.email} {action} admin status for user {user_id}")

    return {
        "status": "success",
        "user_id": user_id,
        "is_admin": body.is_admin,
    }


# ============ Analytics Endpoints ============


@router.get("/analytics/revenue")
@limiter.limit("60/minute")
async def revenue_analytics(
    request: Request,
    period: str = Query(default="month", regex="^(week|month|year)$"),
    admin: UserModel = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """
    Get revenue analytics.

    Args:
        period: Time period (week, month, year)

    Returns MRR breakdown by tier and credit purchase counts.

    Admin access required.
    """
    repo = AdminRepository(db)
    analytics = await repo.get_revenue_analytics(period)
    return analytics


@router.get("/analytics/usage")
@limiter.limit("60/minute")
async def usage_analytics(
    request: Request,
    period: str = Query(default="month", regex="^(week|month|year)$"),
    admin: UserModel = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """
    Get usage analytics.

    Args:
        period: Time period (week, month, year)

    Returns session counts, success rates, and credit usage.

    Admin access required.
    """
    repo = AdminRepository(db)
    analytics = await repo.get_usage_analytics(period)
    return analytics


# ============ Session Monitoring Endpoints ============


@router.get("/sessions")
@limiter.limit("60/minute")
async def list_all_sessions(
    request: Request,
    limit: int = Query(default=50, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    status: Optional[str] = Query(default=None),
    user_id: Optional[str] = Query(default=None),
    admin: UserModel = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """
    List all sessions across all users.

    Args:
        limit: Maximum number of results (1-500)
        offset: Number of results to skip
        status: Filter by status (draft, running, paused, completed, failed)
        user_id: Filter by user ID

    Admin access required.
    """
    repo = AdminRepository(db)
    sessions = await repo.get_all_sessions(
        limit=limit,
        offset=offset,
        status=status,
        user_id=user_id,
    )
    total = await repo.get_session_count(status=status, user_id=user_id)

    return {
        "sessions": sessions,
        "total": total,
        "limit": limit,
        "offset": offset,
    }


@router.get("/sessions/failed")
@limiter.limit("60/minute")
async def get_failed_sessions(
    request: Request,
    days: int = Query(default=7, ge=1, le=30),
    admin: UserModel = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """
    Get failed sessions from the last N days.

    Args:
        days: Number of days to look back (1-30)

    Admin access required.
    """
    repo = AdminRepository(db)
    sessions = await repo.get_failed_sessions(days)

    return {
        "sessions": sessions,
        "count": len(sessions),
        "days": days,
    }


@router.get("/sessions/{session_id}")
@limiter.limit("60/minute")
async def get_session_detail(
    request: Request,
    session_id: str,
    admin: UserModel = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """
    Get detailed session information including all turns with token usage.

    Returns session metadata, token usage summary, and per-turn breakdown
    showing input/output tokens and credits for each agent turn.

    Admin access required.
    """
    repo = AdminRepository(db)
    session_detail = await repo.get_session_detail(session_id)

    if not session_detail:
        raise HTTPException(status_code=404, detail="Session not found")

    return session_detail


@router.post("/sessions/{session_id}/force-reset")
@limiter.limit("30/minute")
async def force_reset_session(
    request: Request,
    session_id: str,
    admin: UserModel = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """
    Force reset a stuck session (admin only).

    This allows admins to reset sessions that appear stuck in "running" status
    for any user. Use this for sessions that have been running for hours
    without progress.

    Admin access required.
    """
    from ..db.repository import SessionRepository
    from .routes import active_sessions

    repo = SessionRepository(db)
    db_session = await repo.get(session_id)

    if not db_session:
        raise HTTPException(status_code=404, detail="Session not found")

    old_status = db_session.status

    # Remove from active sessions cache
    if session_id in active_sessions:
        del active_sessions[session_id]

    # Reset status to stopped (not draft, to preserve any work done)
    await repo.update_status(
        session_id,
        "stopped",
        termination_reason=f"Force reset by admin ({admin.email})"
    )

    logger.info(
        f"Admin {admin.email} force-reset session {session_id} "
        f"(was: {old_status}, owner: {db_session.user_id})"
    )

    return {
        "session_id": session_id,
        "previous_status": old_status,
        "new_status": "stopped",
        "message": "Session force-reset by admin.",
    }


@router.get("/sessions/stuck")
@limiter.limit("60/minute")
async def get_stuck_sessions(
    request: Request,
    hours: int = Query(default=2, ge=1, le=48),
    admin: UserModel = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """
    Get sessions that have been "running" for longer than expected.

    Args:
        hours: Consider sessions stuck if running longer than this (default: 2)

    Admin access required.
    """
    from datetime import datetime, timezone, timedelta
    from sqlalchemy import select, and_
    from ..db.models import SessionModel

    cutoff = datetime.now(timezone.utc) - timedelta(hours=hours)

    result = await db.execute(
        select(SessionModel)
        .where(
            and_(
                SessionModel.status == "running",
                SessionModel.updated_at < cutoff
            )
        )
        .order_by(SessionModel.updated_at.asc())
    )
    sessions = result.scalars().all()

    return {
        "sessions": [
            {
                "id": s.id,
                "user_id": s.user_id,
                "title": s.title,
                "status": s.status,
                "created_at": s.created_at.isoformat() if s.created_at else None,
                "updated_at": s.updated_at.isoformat() if s.updated_at else None,
                "hours_running": round((datetime.now(timezone.utc) - s.updated_at).total_seconds() / 3600, 1) if s.updated_at else None,
            }
            for s in sessions
        ],
        "count": len(sessions),
        "threshold_hours": hours,
    }


# ============ Transaction Endpoints ============


@router.get("/transactions")
@limiter.limit("60/minute")
async def list_transactions(
    request: Request,
    limit: int = Query(default=50, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    user_id: Optional[str] = Query(default=None),
    type: Optional[str] = Query(default=None, alias="transaction_type"),
    admin: UserModel = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """
    List all credit transactions.

    Args:
        limit: Maximum number of results (1-500)
        offset: Number of results to skip
        user_id: Filter by user ID
        transaction_type: Filter by type (usage, initial_grant, etc.)

    Admin access required.
    """
    repo = AdminRepository(db)
    transactions = await repo.get_all_transactions(
        limit=limit,
        offset=offset,
        user_id=user_id,
        transaction_type=type,
    )
    total = await repo.get_transaction_count(user_id=user_id, transaction_type=type)

    return {
        "transactions": transactions,
        "total": total,
        "limit": limit,
        "offset": offset,
    }
