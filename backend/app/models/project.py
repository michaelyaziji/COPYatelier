"""Pydantic models for project management."""

from datetime import datetime
from typing import Optional, List
from pydantic import BaseModel, Field


class ProjectCreate(BaseModel):
    """Request model for creating a project."""

    name: str = Field(
        ...,
        min_length=1,
        max_length=200,
        description="Project name",
    )
    description: Optional[str] = Field(
        default=None,
        description="Project description",
    )
    default_agent_config: Optional[List[dict]] = Field(
        default=None,
        description="Default agent configuration for new sessions in this project",
    )


class ProjectUpdate(BaseModel):
    """Request model for updating a project."""

    name: Optional[str] = Field(
        default=None,
        min_length=1,
        max_length=200,
        description="Project name",
    )
    description: Optional[str] = Field(
        default=None,
        description="Project description",
    )
    default_agent_config: Optional[List[dict]] = Field(
        default=None,
        description="Default agent configuration for new sessions",
    )


class ProjectResponse(BaseModel):
    """Response model for a project."""

    id: str
    user_id: str
    name: str
    description: Optional[str]
    default_agent_config: Optional[List[dict]]
    archived_at: Optional[datetime]
    created_at: datetime
    updated_at: datetime
    session_count: int = Field(default=0, description="Number of sessions in this project")


class ProjectListResponse(BaseModel):
    """Response model for listing projects."""

    projects: List[ProjectResponse]
    total: int


class MoveSessionRequest(BaseModel):
    """Request model for moving a session to a different project."""

    project_id: Optional[str] = Field(
        default=None,
        description="Target project ID (null to remove from project)",
    )
