"""Authentication module for Clerk JWT verification.

This module handles:
1. JWT token verification from Clerk
2. User provisioning on first authentication
3. FastAPI dependency injection for protected routes
"""

import os
import logging
from typing import Optional
from dataclasses import dataclass

from dotenv import load_dotenv
load_dotenv()  # Load .env before reading environment variables

import jwt
from jwt import PyJWKClient, PyJWKClientError
from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..db.database import get_db
from ..db.models import UserModel

logger = logging.getLogger(__name__)

# Security scheme for OpenAPI docs
security = HTTPBearer(auto_error=False)

# Clerk configuration
CLERK_ISSUER = os.environ.get("CLERK_ISSUER", "")  # e.g., https://your-app.clerk.accounts.dev
CLERK_JWKS_URL = os.environ.get("CLERK_JWKS_URL", "")  # e.g., https://your-app.clerk.accounts.dev/.well-known/jwks.json

# Cache for JWKS client
_jwks_client: Optional[PyJWKClient] = None


def get_jwks_client() -> Optional[PyJWKClient]:
    """Get or create the JWKS client for Clerk."""
    global _jwks_client

    if _jwks_client is not None:
        return _jwks_client

    if not CLERK_JWKS_URL:
        logger.warning("CLERK_JWKS_URL not configured - authentication disabled")
        return None

    try:
        _jwks_client = PyJWKClient(CLERK_JWKS_URL, cache_keys=True)
        logger.info(f"Initialized JWKS client for {CLERK_JWKS_URL}")
        return _jwks_client
    except Exception as e:
        logger.error(f"Failed to initialize JWKS client: {e}")
        return None


@dataclass
class ClerkUser:
    """Represents an authenticated Clerk user."""
    id: str
    email: str
    display_name: Optional[str] = None


def verify_clerk_token(token: str) -> Optional[ClerkUser]:
    """
    Verify a Clerk JWT token and extract user information.

    Args:
        token: JWT token from Authorization header

    Returns:
        ClerkUser if valid, None otherwise
    """
    jwks_client = get_jwks_client()

    if not jwks_client:
        # Auth not configured - return None (will be handled by get_current_user)
        return None

    try:
        # Get the signing key from Clerk's JWKS
        signing_key = jwks_client.get_signing_key_from_jwt(token)

        # Verify and decode the token
        payload = jwt.decode(
            token,
            signing_key.key,
            algorithms=["RS256"],
            issuer=CLERK_ISSUER if CLERK_ISSUER else None,
            options={
                "verify_iss": bool(CLERK_ISSUER),
                "verify_aud": False,  # Clerk doesn't always include aud
            }
        )

        # Extract user info from Clerk's JWT claims
        user_id = payload.get("sub")
        email = payload.get("email") or payload.get("primary_email_address")

        # Try to get name from various Clerk claim locations
        display_name = None
        if "name" in payload:
            display_name = payload["name"]
        elif "first_name" in payload:
            first = payload.get("first_name", "")
            last = payload.get("last_name", "")
            display_name = f"{first} {last}".strip() or None

        if not user_id:
            logger.warning("JWT token missing 'sub' claim")
            return None

        return ClerkUser(
            id=user_id,
            email=email or f"{user_id}@clerk.user",  # Fallback if no email
            display_name=display_name,
        )

    except jwt.ExpiredSignatureError:
        logger.warning("JWT token has expired")
        return None
    except jwt.InvalidTokenError as e:
        logger.warning(f"Invalid JWT token: {e}")
        return None
    except PyJWKClientError as e:
        logger.error(f"JWKS client error: {e}")
        return None
    except Exception as e:
        logger.error(f"Unexpected error verifying token: {e}")
        return None


async def get_or_create_user(
    clerk_user: ClerkUser,
    db: AsyncSession,
) -> UserModel:
    """
    Get existing user or create new one from Clerk user info.

    Args:
        clerk_user: Verified Clerk user data
        db: Database session

    Returns:
        UserModel from database
    """
    # Check if user exists
    result = await db.execute(
        select(UserModel).where(UserModel.id == clerk_user.id)
    )
    user = result.scalar_one_or_none()

    if user:
        # Update user info if changed
        changed = False
        if clerk_user.email and user.email != clerk_user.email:
            user.email = clerk_user.email
            changed = True
        if clerk_user.display_name and user.display_name != clerk_user.display_name:
            user.display_name = clerk_user.display_name
            changed = True

        if changed:
            await db.commit()
            logger.info(f"Updated user {user.id}")

        return user

    # Create new user
    user = UserModel(
        id=clerk_user.id,
        email=clerk_user.email,
        display_name=clerk_user.display_name,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)

    logger.info(f"Created new user {user.id} ({user.email})")
    return user


async def get_current_user(
    request: Request,
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
    db: AsyncSession = Depends(get_db),
) -> UserModel:
    """
    FastAPI dependency to get the current authenticated user.

    Verifies the JWT token from Authorization header and returns the user.
    Creates user in database on first authentication.

    Args:
        request: FastAPI request object
        credentials: Bearer token from Authorization header
        db: Database session

    Returns:
        Authenticated UserModel

    Raises:
        HTTPException 401 if not authenticated
    """
    # Check if auth is configured
    if not CLERK_JWKS_URL:
        # Development mode: authentication disabled
        # Create/get a development user
        logger.warning("Authentication disabled - using development user")

        result = await db.execute(
            select(UserModel).where(UserModel.id == "dev_user")
        )
        dev_user = result.scalar_one_or_none()

        if not dev_user:
            dev_user = UserModel(
                id="dev_user",
                email="dev@example.com",
                display_name="Development User",
            )
            db.add(dev_user)
            await db.commit()
            await db.refresh(dev_user)

        return dev_user

    # Production mode: require valid token
    if not credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # Verify token
    clerk_user = verify_clerk_token(credentials.credentials)

    if not clerk_user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # Get or create database user
    user = await get_or_create_user(clerk_user, db)
    return user


async def get_optional_user(
    request: Request,
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
    db: AsyncSession = Depends(get_db),
) -> Optional[UserModel]:
    """
    FastAPI dependency for optional authentication.

    Returns user if authenticated, None otherwise.
    Useful for endpoints that work with or without auth.

    Args:
        request: FastAPI request object
        credentials: Bearer token from Authorization header
        db: Database session

    Returns:
        UserModel if authenticated, None otherwise
    """
    if not credentials:
        return None

    clerk_user = verify_clerk_token(credentials.credentials)

    if not clerk_user:
        return None

    return await get_or_create_user(clerk_user, db)


async def get_admin_user(
    user: UserModel = Depends(get_current_user),
) -> UserModel:
    """
    FastAPI dependency to get the current admin user.

    Requires the user to be authenticated AND have is_admin=True.
    Returns 403 Forbidden if user is not an admin.

    Args:
        user: Authenticated user from get_current_user

    Returns:
        UserModel with admin privileges

    Raises:
        HTTPException 403 if user is not an admin
    """
    if not user.is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required",
        )
    return user
