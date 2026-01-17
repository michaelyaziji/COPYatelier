"""Pydantic models for project management."""

from datetime import datetime
from typing import Optional, List
from pydantic import BaseModel, Field


# ============ Project Models ============

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
    instructions: Optional[str] = Field(
        default=None,
        description="Project-level instructions shared across all sessions (like Claude's Memory)",
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
    instructions: Optional[str] = Field(
        default=None,
        description="Project-level instructions shared across all sessions",
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
    instructions: Optional[str]
    default_agent_config: Optional[List[dict]]
    archived_at: Optional[datetime]
    created_at: datetime
    updated_at: datetime
    session_count: int = Field(default=0, description="Number of sessions in this project")
    file_count: int = Field(default=0, description="Number of files in this project")


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


# ============ Project File Models ============

class ProjectFileCreate(BaseModel):
    """Request model for creating a project file (used internally after parsing)."""

    filename: str = Field(..., min_length=1, max_length=255)
    content: str = Field(..., description="Extracted text content")
    original_file_type: str = Field(..., max_length=50)
    description: Optional[str] = Field(default=None)


class ProjectFileUpdate(BaseModel):
    """Request model for updating a project file's metadata."""

    filename: Optional[str] = Field(
        default=None,
        min_length=1,
        max_length=255,
        description="New filename",
    )
    description: Optional[str] = Field(
        default=None,
        description="File description",
    )


class ProjectFileListItem(BaseModel):
    """Response model for a project file in list view (without content)."""

    id: str
    project_id: str
    filename: str
    original_file_type: str
    description: Optional[str]
    char_count: Optional[int]
    word_count: Optional[int]
    created_at: datetime


class ProjectFileResponse(BaseModel):
    """Response model for a project file with full content."""

    id: str
    project_id: str
    filename: str
    original_file_type: str
    description: Optional[str]
    content: str
    char_count: Optional[int]
    word_count: Optional[int]
    created_at: datetime
    updated_at: datetime


class ProjectFileListResponse(BaseModel):
    """Response model for listing project files."""

    files: List[ProjectFileListItem]
    total: int
