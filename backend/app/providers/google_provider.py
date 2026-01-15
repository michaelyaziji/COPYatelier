"""Google Gemini provider implementation."""

import asyncio
import logging
from typing import AsyncIterator, Callable, Optional
import google.generativeai as genai
from google.api_core import exceptions as google_exceptions

from .base import AIProvider, ProviderResponse, StreamingResult

logger = logging.getLogger(__name__)

# Retry configuration
MAX_RETRIES = 3
BASE_DELAY = 2  # seconds
MAX_DELAY = 10  # seconds


class GoogleProvider(AIProvider):
    """Google Gemini API provider with automatic retry on overload."""

    def __init__(self, api_key: str):
        genai.configure(api_key=api_key)

    def _is_retryable_error(self, error: Exception) -> bool:
        """Check if an error is retryable (overload, rate limit, etc.)."""
        # Google-specific exceptions
        if isinstance(error, (
            google_exceptions.ResourceExhausted,
            google_exceptions.ServiceUnavailable,
            google_exceptions.DeadlineExceeded,
        )):
            return True
        error_str = str(error).lower()
        if 'rate_limit' in error_str or 'overloaded' in error_str or 'quota' in error_str:
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
        """Generate response from Gemini."""

        generation_config = {
            "temperature": temperature,
        }
        if max_tokens:
            generation_config["max_output_tokens"] = max_tokens

        # Gemini uses system_instruction parameter for system prompts
        gemini_model = genai.GenerativeModel(
            model_name=model,
            generation_config=generation_config,
            system_instruction=system_prompt,
        )

        response = await gemini_model.generate_content_async(user_prompt)

        usage = {}
        if hasattr(response, "usage_metadata"):
            usage = {
                "prompt_tokens": response.usage_metadata.prompt_token_count,
                "output_tokens": response.usage_metadata.candidates_token_count,
                "total_tokens": response.usage_metadata.total_token_count,
            }

        return ProviderResponse(
            content=response.text,
            model=model,
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
        """Stream response from Gemini with automatic retry on overload."""

        generation_config = {
            "temperature": temperature,
        }
        if max_tokens:
            generation_config["max_output_tokens"] = max_tokens

        gemini_model = genai.GenerativeModel(
            model_name=model,
            generation_config=generation_config,
            system_instruction=system_prompt,
        )

        last_error = None

        for attempt in range(MAX_RETRIES):
            try:
                response = await gemini_model.generate_content_async(
                    user_prompt,
                    stream=True
                )

                async for chunk in response:
                    if chunk.text:
                        yield chunk.text
                # Success
                return
            except Exception as e:
                last_error = e

                if not self._is_retryable_error(e):
                    raise

                if attempt < MAX_RETRIES - 1:
                    delay = min(BASE_DELAY * (2 ** attempt), MAX_DELAY)
                    reason = "Service temporarily overloaded"
                    if "quota" in str(e).lower():
                        reason = "Quota limit reached"

                    # Notify caller about retry
                    if on_retry:
                        on_retry(attempt + 1, MAX_RETRIES, reason)

                    logger.warning(
                        f"Gemini stream ({model}): Retryable error (attempt {attempt + 1}/{MAX_RETRIES}), "
                        f"retrying in {delay}s: {e}"
                    )
                    await asyncio.sleep(delay)
                else:
                    logger.error(
                        f"Gemini stream ({model}): All {MAX_RETRIES} retry attempts failed"
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
        Stream response from Gemini and capture accurate token usage.

        Gemini provides usage metadata after the stream completes.
        """
        generation_config = {
            "temperature": temperature,
        }
        if max_tokens:
            generation_config["max_output_tokens"] = max_tokens

        gemini_model = genai.GenerativeModel(
            model_name=model,
            generation_config=generation_config,
            system_instruction=system_prompt,
        )

        content = ""
        input_tokens = 0
        output_tokens = 0

        response = await gemini_model.generate_content_async(
            user_prompt,
            stream=True
        )

        async for chunk in response:
            if chunk.text:
                content += chunk.text
                if on_token:
                    on_token(chunk.text)

        # Get usage metadata from the response after streaming completes
        # Note: For Gemini streaming, usage_metadata may be on the last chunk or response
        if hasattr(response, "usage_metadata") and response.usage_metadata:
            input_tokens = response.usage_metadata.prompt_token_count or 0
            output_tokens = response.usage_metadata.candidates_token_count or 0
        else:
            # Fallback to estimation if metadata not available
            input_tokens = (len(system_prompt) + len(user_prompt)) // 4
            output_tokens = len(content) // 4

        return StreamingResult(
            content=content,
            input_tokens=input_tokens,
            output_tokens=output_tokens,
        )
