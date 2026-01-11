"""Anthropic Claude provider implementation."""

from typing import AsyncIterator, Callable, Optional
from anthropic import AsyncAnthropic

from .base import AIProvider, ProviderResponse, StreamingResult


class AnthropicProvider(AIProvider):
    """Anthropic Claude API provider."""

    def __init__(self, api_key: str):
        self.client = AsyncAnthropic(api_key=api_key)

    async def generate(
        self,
        system_prompt: str,
        user_prompt: str,
        model: str,
        temperature: float = 0.7,
        max_tokens: Optional[int] = None,
    ) -> ProviderResponse:
        """Generate response from Claude."""

        # Default max_tokens if not specified
        if max_tokens is None:
            max_tokens = 16000

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

    async def generate_stream(
        self,
        system_prompt: str,
        user_prompt: str,
        model: str,
        temperature: float = 0.7,
        max_tokens: Optional[int] = None,
    ) -> AsyncIterator[str]:
        """Stream response from Claude."""

        if max_tokens is None:
            max_tokens = 16000

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
