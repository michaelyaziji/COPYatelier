"""Security middleware and utilities."""

import logging
import time
from typing import Callable

from fastapi import Request, Response
from slowapi import Limiter
from slowapi.util import get_remote_address
from starlette.middleware.base import BaseHTTPMiddleware

logger = logging.getLogger(__name__)


def get_user_or_ip(request: Request) -> str:
    """
    Get rate limit key from user ID (if authenticated) or IP address.

    Authenticated users are rate-limited by user ID for consistent limits
    across different IP addresses. Unauthenticated requests use IP.
    """
    # Check if user is authenticated (set by auth middleware)
    user_id = getattr(request.state, "user_id", None)
    if user_id:
        return f"user:{user_id}"
    return get_remote_address(request)


# Global rate limiter instance
limiter = Limiter(key_func=get_user_or_ip)


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    """
    Middleware that adds security headers to all responses.

    Headers added:
    - X-Content-Type-Options: nosniff - Prevents MIME type sniffing
    - X-Frame-Options: DENY - Prevents clickjacking
    - X-XSS-Protection: 1; mode=block - Legacy XSS protection
    - Referrer-Policy: strict-origin-when-cross-origin - Controls referrer info
    - Content-Security-Policy: default-src 'self' - Basic CSP for API
    """

    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        response = await call_next(request)

        # Add security headers
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["X-XSS-Protection"] = "1; mode=block"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"

        # CSP for API responses - relatively permissive since we're an API
        response.headers["Content-Security-Policy"] = "default-src 'self'"

        return response


class RequestLoggingMiddleware(BaseHTTPMiddleware):
    """
    Middleware that logs all incoming requests for audit purposes.

    Logs:
    - Timestamp
    - Method and path
    - User ID (if authenticated)
    - Response status code
    - Request duration

    Note: Does NOT log request/response bodies to avoid sensitive data exposure.
    """

    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        start_time = time.time()

        # Get user ID if available (from auth middleware)
        user_id = getattr(request.state, "user_id", None)

        # Process request
        response = await call_next(request)

        # Calculate duration
        duration_ms = (time.time() - start_time) * 1000

        # Log request (excluding sensitive paths like auth)
        path = request.url.path

        # Skip logging for health checks and static files to reduce noise
        if path not in ["/health", "/", "/favicon.ico"]:
            log_data = {
                "method": request.method,
                "path": path,
                "status_code": response.status_code,
                "duration_ms": round(duration_ms, 2),
                "client_ip": self._get_client_ip(request),
            }

            if user_id:
                log_data["user_id"] = user_id

            # Log at appropriate level based on status
            if response.status_code >= 500:
                logger.error(f"Request: {log_data}")
            elif response.status_code >= 400:
                logger.warning(f"Request: {log_data}")
            else:
                logger.info(f"Request: {log_data}")

        return response

    def _get_client_ip(self, request: Request) -> str:
        """Extract client IP, handling proxy headers."""
        # Check for forwarded headers (from reverse proxy)
        forwarded = request.headers.get("X-Forwarded-For")
        if forwarded:
            # Take the first IP in the chain (original client)
            return forwarded.split(",")[0].strip()

        real_ip = request.headers.get("X-Real-IP")
        if real_ip:
            return real_ip

        # Fall back to direct client
        if request.client:
            return request.client.host

        return "unknown"


# Maximum file size for uploads (10MB)
MAX_FILE_SIZE_MB = 10
MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024

# Maximum title length
MAX_TITLE_LENGTH = 200

# Maximum request body size (50MB)
MAX_REQUEST_BODY_MB = 50
MAX_REQUEST_BODY_BYTES = MAX_REQUEST_BODY_MB * 1024 * 1024
