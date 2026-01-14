"""Perplexity provider implementation using OpenAI-compatible API."""

import asyncio
import logging
from typing import AsyncIterator, Callable, Optional
from openai import AsyncOpenAI, APIStatusError

from .base import AIProvider, ProviderResponse, StreamingResult

logger = logging.getLogger(__name__)

# Retry configuration
MAX_RETRIES = 3
BASE_DELAY = 2  # seconds
MAX_DELAY = 10  # seconds

# Perplexity API base URL
PERPLEXITY_BASE_URL = "https://api.perplexity.ai"


class PerplexityProvider(AIProvider):
    """Perplexity API provider with web search capabilities."""

    def __init__(self, api_key: str):
        # Perplexity uses OpenAI-compatible API
        self.client = AsyncOpenAI(
            api_key=api_key,
            base_url=PERPLEXITY_BASE_URL,
        )

    def _is_retryable_error(self, error: Exception) -> bool:
        """Check if an error is retryable (overload, rate limit, etc.)."""
        if isinstance(error, APIStatusError):
            if error.status_code in (429, 500, 503):
                return True
        error_str = str(error).lower()
        if 'rate_limit' in error_str or 'overloaded' in error_str or 'server_error' in error_str:
            return True
        return False

    async def generate(
        self,
        system_prompt: str,
        user_prompt: str,
        model: str,
        temperature: float = 0.7,
        max_tokens: Optional[int] = None,
    ) -> ProviderResponse:
        """Generate response from Perplexity models."""

        kwargs = {
            "model": model,
            "temperature": temperature,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt}
            ]
        }

        if max_tokens:
            kwargs["max_tokens"] = max_tokens

        response = await self.client.chat.completions.create(**kwargs)

        content = response.choices[0].message.content or ""

        usage = {}
        if response.usage:
            usage = {
                "prompt_tokens": response.usage.prompt_tokens,
                "completion_tokens": response.usage.completion_tokens,
                "total_tokens": response.usage.total_tokens,
            }

        return ProviderResponse(
            content=content,
            model=response.model,
            usage=usage
        )

    async def generate_stream(
        self,
        system_prompt: str,
        user_prompt: str,
        model: str,
        temperature: float = 0.7,
        max_tokens: Optional[int] = None,
        on_retry: Optional[Callable[[int, int, str], None]] = None,
    ) -> AsyncIterator[str]:
        """Stream response from Perplexity models with automatic retry on overload."""

        kwargs = {
            "model": model,
            "temperature": temperature,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt}
            ],
            "stream": True
        }

        if max_tokens:
            kwargs["max_tokens"] = max_tokens

        last_error = None

        for attempt in range(MAX_RETRIES):
            try:
                stream = await self.client.chat.completions.create(**kwargs)

                async for chunk in stream:
                    if chunk.choices[0].delta.content:
                        yield chunk.choices[0].delta.content
                # Success
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
                        f"Perplexity stream ({model}): Retryable error (attempt {attempt + 1}/{MAX_RETRIES}), "
                        f"retrying in {delay}s: {e}"
                    )
                    await asyncio.sleep(delay)
                else:
                    logger.error(
                        f"Perplexity stream ({model}): All {MAX_RETRIES} retry attempts failed"
                    )

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
        Stream response from Perplexity and capture token usage.
        """
        kwargs = {
            "model": model,
            "temperature": temperature,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt}
            ],
            "stream": True,
        }

        if max_tokens:
            kwargs["max_tokens"] = max_tokens

        stream = await self.client.chat.completions.create(**kwargs)

        content = ""
        input_tokens = 0
        output_tokens = 0

        async for chunk in stream:
            # Check for usage in the final chunk
            if hasattr(chunk, 'usage') and chunk.usage:
                input_tokens = chunk.usage.prompt_tokens
                output_tokens = chunk.usage.completion_tokens

            # Stream content tokens
            if chunk.choices and chunk.choices[0].delta.content:
                token = chunk.choices[0].delta.content
                content += token
                if on_token:
                    on_token(token)

        return StreamingResult(
            content=content,
            input_tokens=input_tokens,
            output_tokens=output_tokens,
        )
