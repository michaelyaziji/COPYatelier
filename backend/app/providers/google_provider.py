"""Google Gemini provider implementation."""

from typing import AsyncIterator, Optional
import google.generativeai as genai

from .base import AIProvider, ProviderResponse


class GoogleProvider(AIProvider):
    """Google Gemini API provider."""

    def __init__(self, api_key: str):
        genai.configure(api_key=api_key)

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
    ) -> AsyncIterator[str]:
        """Stream response from Gemini."""

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

        response = await gemini_model.generate_content_async(
            user_prompt,
            stream=True
        )

        async for chunk in response:
            if chunk.text:
                yield chunk.text
