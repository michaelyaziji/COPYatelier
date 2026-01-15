"""Credit calculation and usage tracking logic."""

import math
from typing import Optional

# Base conversion rate: 1 credit = 10,000 tokens
BASE_TOKENS_PER_CREDIT = 10_000

# Model credit multipliers
# Higher values = more expensive models
MODEL_CREDIT_MULTIPLIERS = {
    # Anthropic
    "claude-opus-4-5-20251101": 5.0,
    "claude-sonnet-4-5-20250929": 1.0,
    "claude-sonnet-4-thinking-20250514": 1.5,
    "claude-3-5-haiku-20241022": 0.25,

    # Google
    "gemini-2.5-pro": 1.2,
    "gemini-2.5-flash": 0.4,
    "gemini-2.0-flash": 0.3,

    # OpenAI
    "gpt-4o": 1.0,
    "gpt-4o-mini": 0.25,
    "o1": 5.5,
    "o1-mini": 2.0,
    "o3-mini": 2.0,

    # Perplexity (includes web search)
    "sonar": 0.5,
    "sonar-pro": 1.5,
    "sonar-reasoning": 2.5,
}

# Tier monthly credit allocations
TIER_MONTHLY_CREDITS = {
    "free": 20,
    "starter": 150,
    "pro": 500,
    "enterprise": 2000,
}

# Default credits for new users
DEFAULT_INITIAL_CREDITS = TIER_MONTHLY_CREDITS["free"]


def calculate_credits(
    model: str,
    input_tokens: int,
    output_tokens: int,
) -> int:
    """
    Calculate credits consumed for a model invocation.

    Args:
        model: Model identifier string
        input_tokens: Number of input tokens used
        output_tokens: Number of output tokens generated

    Returns:
        Number of credits consumed (rounded up)
    """
    total_tokens = input_tokens + output_tokens
    base_credits = total_tokens / BASE_TOKENS_PER_CREDIT
    multiplier = MODEL_CREDIT_MULTIPLIERS.get(model, 1.0)
    return math.ceil(base_credits * multiplier)


def estimate_session_credits(
    agents: list[dict],
    max_rounds: int,
    document_words: int = 0,
) -> int:
    """
    Estimate total credits for a session before it starts.

    With optimized context (each role receives only what it needs):
    - Writer: current draft + Synthesizer directive (~400 base + document)
    - Editors: current draft only (~300 base + document)
    - Synthesizer: current draft + editor feedback (~300 base + document + feedback)

    Token usage is now O(n) linear with turns, not O(n²) with history accumulation.

    Args:
        agents: List of agent configs (dicts with 'model' key and 'phase' key)
        max_rounds: Maximum number of rounds configured
        document_words: Word count of the working document

    Returns:
        Estimated credits for the session
    """
    # Document tokens: ~1.5 tokens per word
    document_tokens = int(document_words * 1.5)

    # Count agents by phase for more accurate estimates
    num_editors = sum(1 for a in agents if a.get("phase", 2) == 2)

    total_estimate = 0

    for agent in agents:
        model = agent.get("model", "claude-sonnet-4-5-20250929")
        multiplier = MODEL_CREDIT_MULTIPLIERS.get(model, 1.0)
        phase = agent.get("phase", 2)

        # Estimate input tokens based on role
        if phase == 1:  # Writer
            # Task + refs + current doc + synthesizer directive + eval format
            base_overhead = 500
            input_tokens = base_overhead + document_tokens
        elif phase == 2:  # Editors
            # Current doc + instructions + eval format (minimal context)
            base_overhead = 300
            input_tokens = base_overhead + document_tokens
        else:  # Synthesizer
            # Current doc + all editor feedback + eval format
            base_overhead = 300
            editor_feedback_tokens = num_editors * 800  # ~800 tokens per editor
            input_tokens = base_overhead + document_tokens + editor_feedback_tokens

        # Output tokens: ~1000 for response + evaluation JSON
        output_tokens = 1000

        tokens_per_turn = input_tokens + output_tokens
        credits_per_turn = (tokens_per_turn / BASE_TOKENS_PER_CREDIT) * multiplier

        # Agent runs max_rounds times (plus final Writer pass)
        runs = max_rounds + 1 if phase == 1 else max_rounds
        total_estimate += credits_per_turn * runs

    return math.ceil(total_estimate)


def get_model_multiplier(model: str) -> float:
    """Get the credit multiplier for a model."""
    return MODEL_CREDIT_MULTIPLIERS.get(model, 1.0)


def get_tier_credits(tier: str) -> int:
    """Get the monthly credit allocation for a tier."""
    return TIER_MONTHLY_CREDITS.get(tier, TIER_MONTHLY_CREDITS["free"])
