"""Pydantic models for credit system."""

from datetime import datetime
from enum import Enum
from typing import Optional
from pydantic import BaseModel, Field


class TransactionType(str, Enum):
    """Types of credit transactions."""
    INITIAL_GRANT = "initial_grant"  # New user signup
    SUBSCRIPTION_GRANT = "subscription_grant"  # Monthly refresh
    PURCHASE = "purchase"  # One-time credit purchase
    USAGE = "usage"  # Credit consumption
    REFUND = "refund"  # Refund for failed session
    ADMIN_GRANT = "admin_grant"  # Manual admin adjustment


class CreditBalance(BaseModel):
    """User's current credit balance."""
    user_id: str = Field(..., description="User ID")
    balance: int = Field(..., ge=0, description="Current credit balance")
    lifetime_used: int = Field(default=0, ge=0, description="Total credits ever used")
    tier: str = Field(default="free", description="User's subscription tier")
    tier_credits: int = Field(default=20, description="Monthly credits for user's tier")
    last_grant_at: Optional[datetime] = Field(default=None, description="Last credit grant timestamp")


class CreditTransaction(BaseModel):
    """A single credit transaction record."""
    id: str = Field(..., description="Transaction ID")
    user_id: str = Field(..., description="User ID")
    amount: int = Field(..., description="Credit amount (positive=grant, negative=usage)")
    type: TransactionType = Field(..., description="Transaction type")
    description: Optional[str] = Field(default=None, description="Human-readable description")
    session_id: Optional[str] = Field(default=None, description="Related session ID (for usage)")
    balance_after: int = Field(..., ge=0, description="Balance after this transaction")
    created_at: datetime = Field(..., description="Transaction timestamp")


class CreditEstimate(BaseModel):
    """Pre-session credit estimate."""
    estimated_credits: int = Field(..., ge=0, description="Estimated credits for the session")
    current_balance: int = Field(..., ge=0, description="User's current balance")
    has_sufficient_credits: bool = Field(..., description="Whether user can afford the session")
    agents: list[dict] = Field(default_factory=list, description="Agent cost breakdown")


class CreditEstimateRequest(BaseModel):
    """Request body for credit estimation."""
    agents: list[dict] = Field(..., description="Agent configurations")
    max_rounds: int = Field(..., ge=1, le=20, description="Maximum rounds")
    document_words: int = Field(default=0, ge=0, description="Working document word count")


class CreditUsageEvent(BaseModel):
    """Credit usage information for a single agent turn."""
    agent_id: str = Field(..., description="Agent ID")
    agent_name: str = Field(..., description="Agent display name")
    model: str = Field(..., description="Model used")
    input_tokens: int = Field(..., ge=0, description="Input tokens")
    output_tokens: int = Field(..., ge=0, description="Output tokens")
    credits_used: int = Field(..., ge=0, description="Credits consumed")
    balance_after: int = Field(..., ge=0, description="Balance after deduction")
