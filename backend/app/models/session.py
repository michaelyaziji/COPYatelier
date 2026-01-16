"""Session configuration and orchestration models."""

from enum import Enum
from typing import Optional
from pydantic import BaseModel, ConfigDict, Field

from .agent import AgentConfig
from .exchange import ExchangeTurn


class OrchestrationFlow(str, Enum):
    """Type of orchestration flow."""
    SEQUENTIAL = "sequential"  # A → B → A → B...
    PARALLEL_CRITIQUE = "parallel_critique"  # One writer, N critics in parallel


class TerminationCondition(BaseModel):
    """Conditions for stopping orchestration."""
    max_rounds: int = Field(default=5, ge=1, description="Maximum number of rounds")
    score_threshold: Optional[float] = Field(
        None,
        ge=1,
        le=10,
        description="Stop early when the synthesizing editor's score reaches or exceeds this threshold"
    )


class SessionConfig(BaseModel):
    """Complete configuration for an orchestration session."""

    session_id: str = Field(..., description="Unique session identifier")
    title: str = Field(default="Untitled Session", description="User-provided session title")
    project_id: Optional[str] = Field(default=None, description="Project this session belongs to")

    # Agents
    agents: list[AgentConfig] = Field(..., min_length=1, max_length=5, description="1-5 configured agents")

    # Orchestration
    flow_type: OrchestrationFlow = Field(default=OrchestrationFlow.SEQUENTIAL)
    termination: TerminationCondition = Field(default_factory=TerminationCondition)
    initial_prompt: str = Field(..., description="Initial task prompt for the first agent")

    # Documents
    working_document: str = Field(default="", description="Initial content of the working document")
    reference_documents: dict[str, str] = Field(
        default_factory=dict,
        description="Reference materials: filename -> content (markdown)"
    )
    reference_instructions: str = Field(
        default="",
        description="User instructions explaining how to use the reference documents"
    )
    draft_treatment: Optional[str] = Field(
        default=None,
        description="How to treat the user's draft: 'light_polish', 'moderate_revision', or 'free_rewrite'"
    )

    model_config = ConfigDict(use_enum_values=True)


class SessionState(BaseModel):
    """Runtime state of an orchestration session."""

    config: SessionConfig = Field(..., description="Session configuration")
    exchange_history: list[ExchangeTurn] = Field(default_factory=list, description="Full history of turns")
    current_round: int = Field(default=0, description="Current round number")
    is_running: bool = Field(default=False, description="Whether orchestration is actively running")
    is_paused: bool = Field(default=False, description="Whether orchestration is paused")
    is_cancelled: bool = Field(default=False, description="Whether orchestration was cancelled by user")
    termination_reason: Optional[str] = Field(None, description="Reason for termination, if completed")
