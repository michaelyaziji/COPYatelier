"""OpenAI provider implementation."""

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


class OpenAIProvider(AIProvider):
    """OpenAI API provider with automatic retry on overload."""

    def __init__(self, api_key: str):
        self.client = AsyncOpenAI(api_key=api_key)

    def _is_retryable_error(self, error: Exception) -> bool:
        """Check if an error is retryable (overload, rate limit, etc.)."""
        if isinstance(error, APIStatusError):
            # Retry on 429 (rate limit), 503 (service unavailable), 500 (server error)
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
        """Generate response from OpenAI models."""

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
    ) -> AsyncIterator[str]:
        """Stream response from OpenAI models with automatic retry on overload."""

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
                    logger.warning(
                        f"OpenAI stream ({model}): Retryable error (attempt {attempt + 1}/{MAX_RETRIES}), "
                        f"retrying in {delay}s: {e}"
                    )
                    await asyncio.sleep(delay)
                else:
                    logger.error(
                        f"OpenAI stream ({model}): All {MAX_RETRIES} retry attempts failed"
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
        Stream response from OpenAI and capture accurate token usage.

        Uses stream_options to include usage stats in the final chunk.
        """
        kwargs = {
            "model": model,
            "temperature": temperature,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt}
            ],
            "stream": True,
            "stream_options": {"include_usage": True},
        }

        if max_tokens:
            kwargs["max_tokens"] = max_tokens

        stream = await self.client.chat.completions.create(**kwargs)

        content = ""
        input_tokens = 0
        output_tokens = 0

        async for chunk in stream:
            # Check for usage in the final chunk
            if chunk.usage:
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
