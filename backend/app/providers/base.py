"""Base provider interface."""

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import AsyncIterator, Callable, Optional
from pydantic import BaseModel


class ProviderResponse(BaseModel):
    """Standardized response from AI providers."""
    content: str
    model: str
    usage: Optional[dict] = None  # Token usage stats, format varies by provider


@dataclass
class StreamingResult:
    """Result from streaming generation, including usage statistics."""
    content: str = ""
    input_tokens: int = 0
    output_tokens: int = 0


class AIProvider(ABC):
    """Abstract base class for AI provider integrations."""

    @abstractmethod
    async def generate(
        self,
        system_prompt: str,
        user_prompt: str,
        model: str,
        temperature: float = 0.7,
        max_tokens: Optional[int] = None,
    ) -> ProviderResponse:
        """
        Generate a response from the AI model.

        Args:
            system_prompt: System instructions defining the agent's role
            user_prompt: User task prompt
            model: Model identifier
            temperature: Sampling temperature (0-1)
            max_tokens: Maximum tokens to generate

        Returns:
            ProviderResponse with the generated content
        """
        pass

    @abstractmethod
    async def generate_stream(
        self,
        system_prompt: str,
        user_prompt: str,
        model: str,
        temperature: float = 0.7,
        max_tokens: Optional[int] = None,
        on_retry: Optional[Callable[[int, int, str], None]] = None,
    ) -> AsyncIterator[str]:
        """
        Stream response tokens from the AI model.

        Args:
            Same as generate()
            on_retry: Optional callback(attempt, max_attempts, reason) called before each retry

        Yields:
            Content chunks as they are generated
        """
        pass

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
        Stream response and capture usage statistics.

        Default implementation uses generate_stream() and estimates tokens.
        Subclasses should override this for accurate usage tracking.

        Args:
            system_prompt: System instructions defining the agent's role
            user_prompt: User task prompt
            model: Model identifier
            temperature: Sampling temperature (0-1)
            max_tokens: Maximum tokens to generate
            on_token: Optional callback for each token

        Returns:
            StreamingResult with content and usage statistics
        """
        content = ""
        async for token in self.generate_stream(
            system_prompt, user_prompt, model, temperature, max_tokens
        ):
            content += token
            if on_token:
                on_token(token)

        # Estimate tokens if provider doesn't support accurate tracking
        # Rule of thumb: ~4 chars per token for English text
        input_tokens = (len(system_prompt) + len(user_prompt)) // 4
        output_tokens = len(content) // 4

        return StreamingResult(
            content=content,
            input_tokens=input_tokens,
            output_tokens=output_tokens,
        )
