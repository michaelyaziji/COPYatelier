"""Agent configuration models."""

from enum import Enum
from typing import Optional
from pydantic import BaseModel, ConfigDict, Field


class ProviderType(str, Enum):
    """Supported AI providers."""
    ANTHROPIC = "anthropic"
    GOOGLE = "google"
    OPENAI = "openai"
    PERPLEXITY = "perplexity"


class ModelType(str, Enum):
    """Supported AI models across providers."""
    # Anthropic
    CLAUDE_OPUS_4 = "claude-opus-4-5-20251101"
    CLAUDE_SONNET_4 = "claude-sonnet-4-5-20250929"
    CLAUDE_SONNET_4_THINKING = "claude-sonnet-4-thinking-20250514"
    CLAUDE_HAIKU = "claude-3-5-haiku-20241022"

    # Google
    GEMINI_2_5_PRO = "gemini-2.5-pro"
    GEMINI_2_5_FLASH = "gemini-2.5-flash"
    GEMINI_2_0_FLASH = "gemini-2.0-flash"

    # OpenAI
    GPT_4O = "gpt-4o"
    GPT_4O_MINI = "gpt-4o-mini"
    O1 = "o1"
    O1_MINI = "o1-mini"
    O3_MINI = "o3-mini"

    # Perplexity (with web search)
    SONAR = "sonar"
    SONAR_PRO = "sonar-pro"
    SONAR_REASONING = "sonar-reasoning"


class EvaluationCriterion(BaseModel):
    """A single evaluation criterion with description."""
    name: str = Field(..., description="Criterion name, e.g., 'Argumentation clarity'")
    description: str = Field(..., description="What this criterion measures")
    weight: float = Field(default=1.0, ge=0, le=1, description="Weight for overall score calculation")


class AgentConfig(BaseModel):
    """Configuration for a single AI agent."""

    agent_id: str = Field(..., description="Unique identifier for this agent")
    display_name: str = Field(..., description="Human-readable name, e.g., 'Cambridge Editor'")
    provider: ProviderType = Field(..., description="AI provider")
    model: ModelType = Field(..., description="Specific model to use")
    role_description: str = Field(..., description="System prompt defining the agent's persona and approach")
    evaluation_criteria: list[EvaluationCriterion] = Field(
        default_factory=list,
        description="Rubric for this agent's self-evaluation"
    )
    is_active: bool = Field(default=True, description="Whether this agent participates in the current session")
    phase: int = Field(default=1, description="Workflow phase: 1=Writer, 2=Editors, 3=Synthesizer")

    model_config = ConfigDict(use_enum_values=True)
