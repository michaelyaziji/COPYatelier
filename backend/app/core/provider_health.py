"""Provider health tracking based on recent API call success/failure rates."""

import asyncio
import logging
import time
from collections import deque
from dataclasses import dataclass, field
from enum import Enum
from threading import Lock
from typing import Optional

from ..models.agent import ProviderType

logger = logging.getLogger(__name__)


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
    MIN_CALLS_FOR_STATUS = 1  # Need at least 1 call to determine status
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


class HealthCheckService:
    """
    Background service that proactively pings AI providers to check their health.

    Uses the cheapest model from each provider to minimize costs:
    - Anthropic: claude-haiku-4-5-20250110
    - OpenAI: gpt-4o-mini
    - Google: gemini-2.0-flash
    """

    PING_INTERVAL = 60  # seconds
    PING_PROMPT = "Respond with only the word OK"

    # Cheapest models for health checks
    HEALTH_CHECK_MODELS = {
        ProviderType.ANTHROPIC: "claude-haiku-4-5-20250110",
        ProviderType.OPENAI: "gpt-4o-mini",
        ProviderType.GOOGLE: "gemini-2.0-flash",
    }

    def __init__(self):
        self._running = False
        self._task: Optional[asyncio.Task] = None
        self._providers: dict = {}

    async def start(self, settings) -> None:
        """Start the background health check service."""
        if self._running:
            return

        self._running = True
        self._init_providers(settings)

        # Run initial health check immediately
        await self._ping_all_providers()

        # Start background task
        self._task = asyncio.create_task(self._run_loop())
        logger.info("Health check service started (pinging every %d seconds)", self.PING_INTERVAL)

    async def stop(self) -> None:
        """Stop the background health check service."""
        self._running = False
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
        logger.info("Health check service stopped")

    def _init_providers(self, settings) -> None:
        """Initialize provider clients."""
        from ..providers import AnthropicProvider, OpenAIProvider, GoogleProvider

        if settings.anthropic_api_key:
            self._providers[ProviderType.ANTHROPIC] = AnthropicProvider(
                api_key=settings.anthropic_api_key
            )

        if settings.openai_api_key:
            self._providers[ProviderType.OPENAI] = OpenAIProvider(
                api_key=settings.openai_api_key
            )

        if settings.google_api_key:
            self._providers[ProviderType.GOOGLE] = GoogleProvider(
                api_key=settings.google_api_key
            )

    async def _run_loop(self) -> None:
        """Background loop that pings providers periodically."""
        while self._running:
            await asyncio.sleep(self.PING_INTERVAL)
            if self._running:
                await self._ping_all_providers()

    async def _ping_all_providers(self) -> None:
        """Ping all configured providers concurrently."""
        tasks = []
        for provider_type, provider in self._providers.items():
            tasks.append(self._ping_provider(provider_type, provider))

        if tasks:
            await asyncio.gather(*tasks, return_exceptions=True)

    async def _ping_provider(self, provider_type: ProviderType, provider) -> None:
        """Ping a single provider and record the result."""
        model = self.HEALTH_CHECK_MODELS[provider_type]

        try:
            response = await provider.generate(
                system_prompt="You are a health check responder.",
                user_prompt=self.PING_PROMPT,
                model=model,
                temperature=0,
                max_tokens=10,
            )

            # Success - record it
            health_tracker.record_success(provider_type)
            logger.debug("Health check OK: %s", provider_type.value)

        except Exception as e:
            error_str = str(e).lower()
            is_overload = 'overload' in error_str or 'rate' in error_str or '529' in error_str or '429' in error_str

            health_tracker.record_failure(provider_type, str(e), is_overload=is_overload)
            logger.warning("Health check FAILED for %s: %s", provider_type.value, e)


# Global service instance
health_check_service = HealthCheckService()
