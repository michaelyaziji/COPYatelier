"""Anthropic Claude provider implementation."""

import asyncio
import logging
from typing import AsyncIterator, Callable, Optional
from anthropic import AsyncAnthropic, APIStatusError

# Type alias for retry callback
RetryCallback = Optional[Callable[[int, int, str], None]]

from .base import AIProvider, ProviderResponse, StreamingResult

logger = logging.getLogger(__name__)

# Retry configuration
MAX_RETRIES = 3
BASE_DELAY = 2  # seconds
MAX_DELAY = 10  # seconds


class AnthropicProvider(AIProvider):
    """Anthropic Claude API provider with automatic retry on overload."""

    def __init__(self, api_key: str):
        self.client = AsyncAnthropic(api_key=api_key)

    def _is_retryable_error(self, error: Exception) -> bool:
        """Check if an error is retryable (overload, rate limit, etc.)."""
        if isinstance(error, APIStatusError):
            # Retry on 429 (rate limit), 503 (service unavailable), 529 (overloaded)
            if error.status_code in (429, 503, 529):
                return True
            # Also check error message for overload indicators
            error_str = str(error).lower()
            if 'overloaded' in error_str or 'rate_limit' in error_str:
                return True
        return False

    async def _retry_with_backoff(self, operation, operation_name: str):
        """Execute an operation with exponential backoff retry."""
        last_error = None

        for attempt in range(MAX_RETRIES):
            try:
                return await operation()
            except Exception as e:
                last_error = e

                if not self._is_retryable_error(e):
                    # Non-retryable error, raise immediately
                    raise

                if attempt < MAX_RETRIES - 1:
                    delay = min(BASE_DELAY * (2 ** attempt), MAX_DELAY)
                    logger.warning(
                        f"{operation_name}: Retryable error (attempt {attempt + 1}/{MAX_RETRIES}), "
                        f"retrying in {delay}s: {e}"
                    )
                    await asyncio.sleep(delay)
                else:
                    logger.error(
                        f"{operation_name}: All {MAX_RETRIES} retry attempts failed. Last error: {e}"
                    )

        # All retries exhausted
        raise last_error

    async def generate(
        self,
        system_prompt: str,
        user_prompt: str,
        model: str,
        temperature: float = 0.7,
        max_tokens: Optional[int] = None,
    ) -> ProviderResponse:
        """Generate response from Claude with automatic retry on overload."""

        # Default max_tokens if not specified
        if max_tokens is None:
            max_tokens = 16000

        async def _do_generate():
            response = await self.client.messages.create(
                model=model,
                max_tokens=max_tokens,
                temperature=temperature,
                system=system_prompt,
                messages=[
                    {"role": "user", "content": user_prompt}
                ]
            )

            content = ""
            for block in response.content:
                if hasattr(block, "text"):
                    content += block.text

            return ProviderResponse(
                content=content,
                model=response.model,
                usage={
                    "input_tokens": response.usage.input_tokens,
                    "output_tokens": response.usage.output_tokens,
                }
            )

        return await self._retry_with_backoff(_do_generate, f"Claude generate ({model})")

    async def generate_stream(
        self,
        system_prompt: str,
        user_prompt: str,
        model: str,
        temperature: float = 0.7,
        max_tokens: Optional[int] = None,
        on_retry: Optional[Callable[[int, int, str], None]] = None,
    ) -> AsyncIterator[str]:
        """Stream response from Claude with automatic retry on overload."""

        if max_tokens is None:
            max_tokens = 16000

        last_error = None

        for attempt in range(MAX_RETRIES):
            try:
                async with self.client.messages.stream(
                    model=model,
                    max_tokens=max_tokens,
                    temperature=temperature,
                    system=system_prompt,
                    messages=[
                        {"role": "user", "content": user_prompt}
                    ]
                ) as stream:
                    async for text in stream.text_stream:
                        yield text
                    # If we get here, streaming completed successfully
                    return
            except Exception as e:
                last_error = e

                if not self._is_retryable_error(e):
                    raise

                if attempt < MAX_RETRIES - 1:
                    delay = min(BASE_DELAY * (2 ** attempt), MAX_DELAY)
                    reason = "Service temporarily overloaded"
                    if "rate" in str(e).lower():
                        reason = "Rate limit reached"

                    # Notify caller about retry
                    if on_retry:
                        on_retry(attempt + 1, MAX_RETRIES, reason)

                    logger.warning(
                        f"Claude stream ({model}): Retryable error (attempt {attempt + 1}/{MAX_RETRIES}), "
                        f"retrying in {delay}s: {e}"
                    )
                    await asyncio.sleep(delay)
                else:
                    logger.error(
                        f"Claude stream ({model}): All {MAX_RETRIES} retry attempts failed"
                    )

        # All retries exhausted
        raise last_error

    async def generate_stream_with_usage(
        self,
        system_prompt: str,
        user_prompt: str,
        model: str,
        temperature: float = 0.7,
        max_tokens: Optional[int] = None,
        on_token: Optional[Callable[[str], None]] = None,
    ) -> StreamingResult:
        """
        Stream response from Claude and capture accurate token usage.

        Uses the Anthropic SDK's stream context manager to get final message
        with usage statistics after streaming completes.
        """
        if max_tokens is None:
            max_tokens = 16000

        content = ""

        async with self.client.messages.stream(
            model=model,
            max_tokens=max_tokens,
            temperature=temperature,
            system=system_prompt,
            messages=[
                {"role": "user", "content": user_prompt}
            ]
        ) as stream:
            async for text in stream.text_stream:
                content += text
                if on_token:
                    on_token(text)

            # Get final message with usage stats
            final_message = await stream.get_final_message()

        return StreamingResult(
            content=content,
            input_tokens=final_message.usage.input_tokens,
            output_tokens=final_message.usage.output_tokens,
        )
