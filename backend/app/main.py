"""FastAPI application entry point."""

import logging
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded

from .api.routes import router
from .api.billing import router as billing_router, webhook_router
from .api.admin import router as admin_router
from .core.config import get_settings
from .core.security import SecurityHeadersMiddleware, RequestLoggingMiddleware, limiter
from .db.database import init_db, close_db

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan manager."""
    settings = get_settings()
    logger.info(f"Starting Atelier in {settings.environment} mode")

    # Validate API keys
    if not any([settings.anthropic_api_key, settings.google_api_key, settings.openai_api_key]):
        logger.warning("No AI provider API keys configured. Please set at least one in .env file.")

    # Initialize database (creates tables if using SQLite and they don't exist)
    # In production with PostgreSQL, use Alembic migrations instead
    use_auto_migrate = os.environ.get("AUTO_MIGRATE", "true").lower() == "true"
    if use_auto_migrate:
        logger.info("Initializing database...")
        await init_db()
        logger.info("Database initialized")

    yield

    # Cleanup
    logger.info("Shutting down Atelier")
    await close_db()


# Create FastAPI app
app = FastAPI(
    title="Atelier - Multi-Agent Writing Orchestrator",
    description="Configure multiple AI agents to collaboratively write and refine documents through structured feedback loops.",
    version="0.1.0",
    lifespan=lifespan,
)

# Add rate limiter state and exception handler
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# Add security middleware (before CORS)
app.add_middleware(RequestLoggingMiddleware)
app.add_middleware(SecurityHeadersMiddleware)

# Configure CORS using settings
settings = get_settings()
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=settings.cors_allow_credentials,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include API routes
app.include_router(router, prefix="/api/v1", tags=["orchestration"])
app.include_router(billing_router, prefix="/api/v1", tags=["billing"])
app.include_router(webhook_router, prefix="/api/v1", tags=["webhooks"])
app.include_router(admin_router, prefix="/api/v1", tags=["admin"])


@app.get("/")
async def root():
    """Root endpoint."""
    return {
        "name": "Atelier",
        "version": "0.1.0",
        "description": "Multi-Agent Writing Orchestrator",
        "docs": "/docs",
    }


@app.get("/health")
async def health():
    """Health check endpoint."""
    settings = get_settings()

    providers_available = {
        "anthropic": bool(settings.anthropic_api_key),
        "google": bool(settings.google_api_key),
        "openai": bool(settings.openai_api_key),
    }

    return {
        "status": "healthy",
        "providers": providers_available,
    }
