"""Provider health tracking based on recent API call success/failure rates."""

import time
from collections import deque
from dataclasses import dataclass, field
from enum import Enum
from threading import Lock
from typing import Optional

from ..models.agent import ProviderType


class HealthStatus(str, Enum):
    """Provider health status levels."""
    HEALTHY = "healthy"      # Green - working normally
    DEGRADED = "degraded"    # Yellow - experiencing issues
    UNHEALTHY = "unhealthy"  # Red - down or overloaded
    UNKNOWN = "unknown"      # Gray - no recent data


@dataclass
class ProviderHealth:
    """Health status for a single provider."""
    status: HealthStatus
    success_rate: float  # 0.0 to 1.0
    recent_calls: int
    last_error: Optional[str] = None
    last_error_time: Optional[float] = None


@dataclass
class CallRecord:
    """Record of a single API call."""
    timestamp: float
    success: bool
    error_message: Optional[str] = None
    is_overload: bool = False


class ProviderHealthTracker:
    """
    Tracks health of AI providers based on recent API call outcomes.

    Uses a sliding window of recent calls to calculate success rates
    and determine health status.
    """

    # Configuration
    WINDOW_SECONDS = 300  # 5 minute window
    MIN_CALLS_FOR_STATUS = 3  # Need at least 3 calls to determine status
    DEGRADED_THRESHOLD = 0.7  # Below 70% success = degraded
    UNHEALTHY_THRESHOLD = 0.3  # Below 30% success = unhealthy

    _instance: Optional['ProviderHealthTracker'] = None
    _lock = Lock()

    def __new__(cls):
        """Singleton pattern for global health tracking."""
        if cls._instance is None:
            with cls._lock:
                if cls._instance is None:
                    cls._instance = super().__new__(cls)
                    cls._instance._initialized = False
        return cls._instance

    def __init__(self):
        if self._initialized:
            return

        self._calls: dict[ProviderType, deque[CallRecord]] = {
            ProviderType.ANTHROPIC: deque(maxlen=100),
            ProviderType.OPENAI: deque(maxlen=100),
            ProviderType.GOOGLE: deque(maxlen=100),
        }
        self._last_errors: dict[ProviderType, tuple[str, float]] = {}
        self._initialized = True

    def record_success(self, provider: ProviderType) -> None:
        """Record a successful API call."""
        self._calls[provider].append(CallRecord(
            timestamp=time.time(),
            success=True,
        ))

    def record_failure(
        self,
        provider: ProviderType,
        error_message: str,
        is_overload: bool = False
    ) -> None:
        """Record a failed API call."""
        now = time.time()
        self._calls[provider].append(CallRecord(
            timestamp=now,
            success=False,
            error_message=error_message,
            is_overload=is_overload,
        ))
        self._last_errors[provider] = (error_message, now)

    def get_health(self, provider: ProviderType) -> ProviderHealth:
        """Get current health status for a provider."""
        now = time.time()
        cutoff = now - self.WINDOW_SECONDS

        # Filter to recent calls only
        recent = [c for c in self._calls[provider] if c.timestamp > cutoff]

        if len(recent) < self.MIN_CALLS_FOR_STATUS:
            return ProviderHealth(
                status=HealthStatus.UNKNOWN,
                success_rate=1.0,
                recent_calls=len(recent),
            )

        successes = sum(1 for c in recent if c.success)
        success_rate = successes / len(recent)

        # Determine status based on success rate
        if success_rate >= self.DEGRADED_THRESHOLD:
            status = HealthStatus.HEALTHY
        elif success_rate >= self.UNHEALTHY_THRESHOLD:
            status = HealthStatus.DEGRADED
        else:
            status = HealthStatus.UNHEALTHY

        # Get last error info
        last_error = None
        last_error_time = None
        if provider in self._last_errors:
            last_error, last_error_time = self._last_errors[provider]

        return ProviderHealth(
            status=status,
            success_rate=success_rate,
            recent_calls=len(recent),
            last_error=last_error,
            last_error_time=last_error_time,
        )

    def get_all_health(self) -> dict[str, dict]:
        """Get health status for all providers."""
        return {
            provider.value: {
                "status": health.status.value,
                "success_rate": round(health.success_rate * 100, 1),
                "recent_calls": health.recent_calls,
                "last_error": health.last_error,
            }
            for provider, health in [
                (p, self.get_health(p)) for p in ProviderType
            ]
        }


# Global instance
health_tracker = ProviderHealthTracker()
