"""Pydantic models for user management."""

from datetime import datetime
from typing import Optional, List, Any
from pydantic import BaseModel, ConfigDict, Field


class UserPreferences(BaseModel):
    """User preferences stored in the profile."""

    # Default AI settings
    default_provider: Optional[str] = Field(
        default=None,
        description="Default AI provider (anthropic, google, openai)",
    )
    default_model: Optional[str] = Field(
        default=None,
        description="Default model for new sessions",
    )
    default_max_rounds: int = Field(
        default=5,
        ge=1,
        le=20,
        description="Default maximum rounds for orchestration",
    )

    # UI preferences
    show_evaluation_details: bool = Field(
        default=True,
        description="Show detailed evaluation scores in the UI",
    )
    theme: str = Field(
        default="light",
        description="UI theme (light or dark)",
    )

    model_config = ConfigDict(extra="allow")  # Allow additional preferences to be stored


class UserProfileUpdate(BaseModel):
    """Request model for updating user profile."""

    display_name: Optional[str] = Field(
        default=None,
        max_length=200,
        description="User's display name",
    )
    timezone: Optional[str] = Field(
        default=None,
        max_length=50,
        description="User's timezone (e.g., 'America/New_York')",
    )


class UserPreferencesUpdate(BaseModel):
    """Request model for updating user preferences."""

    default_provider: Optional[str] = None
    default_model: Optional[str] = None
    default_max_rounds: Optional[int] = Field(default=None, ge=1, le=20)
    show_evaluation_details: Optional[bool] = None
    theme: Optional[str] = None

    model_config = ConfigDict(extra="allow")


class UserProfile(BaseModel):
    """Full user profile response."""

    id: str
    user_id: str
    timezone: str
    preferences: UserPreferences
    created_at: datetime
    updated_at: datetime


class UserResponse(BaseModel):
    """Full user response with profile."""

    id: str
    email: str
    display_name: Optional[str]
    created_at: datetime
    updated_at: datetime
    profile: Optional[UserProfile] = None


class UserDataExport(BaseModel):
    """Complete user data export for GDPR compliance."""

    user: dict
    profile: Optional[dict]
    sessions: List[dict]
    exchange_turns: List[dict]
    document_versions: List[dict]
    exported_at: datetime


class DeleteAccountRequest(BaseModel):
    """Request model for account deletion."""

    confirmation: str = Field(
        ...,
        description="Must be 'DELETE' to confirm account deletion",
    )
