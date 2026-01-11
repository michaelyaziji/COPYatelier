"""Exchange and evaluation models."""

from datetime import datetime
from typing import Optional
from pydantic import BaseModel, Field


class CriterionScore(BaseModel):
    """Score for a single evaluation criterion."""
    criterion: str = Field(..., description="Name of the criterion")
    score: float = Field(..., ge=1, le=10, description="Score from 1-10")
    justification: str = Field(default="", description="Brief explanation of the score")


class Evaluation(BaseModel):
    """Structured evaluation from an agent."""
    criteria_scores: list[CriterionScore] = Field(default_factory=list)
    overall_score: float = Field(..., ge=1, le=10, description="Overall score (average or weighted)")
    summary: str = Field(default="", description="Brief overall assessment")


class ExchangeTurn(BaseModel):
    """A single turn in the agent exchange."""
    turn_number: int = Field(..., description="Sequential turn number")
    round_number: int = Field(..., description="Round number (a round may have multiple turns in parallel mode)")
    agent_id: str = Field(..., description="ID of the agent that produced this turn")
    agent_name: str = Field(..., description="Display name of the agent")
    timestamp: datetime = Field(default_factory=datetime.utcnow)

    # Agent output
    output: str = Field(..., description="The agent's text output (revised draft or critique)")
    raw_response: str = Field(..., description="Full raw response from the AI model")

    # Evaluation
    evaluation: Optional[Evaluation] = Field(None, description="Structured evaluation, if successfully parsed")
    parse_error: Optional[str] = Field(None, description="Error message if evaluation parsing failed")

    # Document state
    working_document: str = Field(..., description="State of the working document after this turn")

    # Token usage and credits
    tokens_input: Optional[int] = Field(None, description="Number of input tokens used")
    tokens_output: Optional[int] = Field(None, description="Number of output tokens generated")
    credits_used: Optional[int] = Field(None, description="Credits consumed for this turn")
