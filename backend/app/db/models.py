"""SQLAlchemy database models."""

import uuid
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import (
    Column,
    String,
    Text,
    Integer,
    Float,
    Boolean,
    DateTime,
    ForeignKey,
    JSON,
    Index,
)
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import relationship

from .database import Base


def generate_uuid() -> str:
    """Generate a UUID string."""
    return str(uuid.uuid4())


def utc_now() -> datetime:
    """Get current UTC timestamp."""
    return datetime.now(timezone.utc)


class UserModel(Base):
    """
    Database model for authenticated users.

    Users are synced from the auth provider (Clerk) on first authentication.
    The ID comes directly from Clerk's user ID.
    """

    __tablename__ = "users"

    # Primary key - use Clerk's user ID directly (string format)
    id = Column(String(100), primary_key=True)

    # User info from Clerk
    email = Column(String(255), nullable=False, unique=True, index=True)
    display_name = Column(String(200), nullable=True)

    # Admin flag
    is_admin = Column(Boolean, nullable=False, default=False)

    # Timestamps
    created_at = Column(DateTime(timezone=True), default=utc_now, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=utc_now, onupdate=utc_now, nullable=False)

    # Relationships
    sessions = relationship(
        "SessionModel",
        back_populates="user",
        cascade="all, delete-orphan",
    )

    # Relationships
    profile = relationship(
        "UserProfileModel",
        back_populates="user",
        uselist=False,
        cascade="all, delete-orphan",
    )
    projects = relationship(
        "ProjectModel",
        back_populates="user",
        cascade="all, delete-orphan",
    )
    credit_balance = relationship(
        "CreditBalanceModel",
        back_populates="user",
        uselist=False,
        cascade="all, delete-orphan",
    )
    credit_transactions = relationship(
        "CreditTransactionModel",
        back_populates="user",
        cascade="all, delete-orphan",
        order_by="desc(CreditTransactionModel.created_at)",
    )
    subscription = relationship(
        "SubscriptionModel",
        back_populates="user",
        uselist=False,
        cascade="all, delete-orphan",
    )

    def __repr__(self) -> str:
        return f"<User(id={self.id}, email={self.email})>"


class UserProfileModel(Base):
    """
    Database model for user profiles and preferences.

    Stores user settings, preferences, and customization options.
    One-to-one relationship with UserModel.
    """

    __tablename__ = "user_profiles"

    # Primary key
    id = Column(String(36), primary_key=True, default=generate_uuid)

    # User association (one-to-one)
    user_id = Column(
        String(100),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
        index=True,
    )

    # Profile settings
    timezone = Column(String(50), default="UTC")

    # Preferences stored as JSON
    # Structure: {
    #   "default_provider": "anthropic",
    #   "default_model": "claude-sonnet-4-5-20250929",
    #   "default_max_rounds": 5,
    #   "show_evaluation_details": true,
    #   "theme": "light"
    # }
    preferences = Column(JSON, default=dict)

    # Timestamps
    created_at = Column(DateTime(timezone=True), default=utc_now, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=utc_now, onupdate=utc_now, nullable=False)

    # Relationships
    user = relationship("UserModel", back_populates="profile")

    def __repr__(self) -> str:
        return f"<UserProfile(id={self.id}, user_id={self.user_id})>"


class ProjectModel(Base):
    """
    Database model for projects.

    Projects allow users to organize sessions into groups.
    Each project belongs to a user and can contain multiple sessions.
    """

    __tablename__ = "projects"

    # Primary key
    id = Column(String(36), primary_key=True, default=generate_uuid)

    # User association
    user_id = Column(
        String(100),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    # Project info
    name = Column(String(200), nullable=False)
    description = Column(Text, nullable=True)

    # Default configuration for new sessions in this project
    default_agent_config = Column(JSON, nullable=True)

    # Archive status (soft delete)
    archived_at = Column(DateTime(timezone=True), nullable=True)

    # Timestamps
    created_at = Column(DateTime(timezone=True), default=utc_now, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=utc_now, onupdate=utc_now, nullable=False)

    # Relationships
    user = relationship("UserModel", back_populates="projects")
    sessions = relationship(
        "SessionModel",
        back_populates="project",
        cascade="all, delete-orphan",
    )

    def __repr__(self) -> str:
        return f"<Project(id={self.id}, name={self.name})>"


class SessionModel(Base):
    """
    Database model for orchestration sessions.

    Maps to the in-memory SessionState and SessionConfig.
    """

    __tablename__ = "sessions"

    # Primary key - use string UUID for SQLite compatibility
    id = Column(String(36), primary_key=True, default=generate_uuid)

    # User association (required for multi-tenant access)
    user_id = Column(
        String(100),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=True,  # Temporarily nullable for backward compatibility
        index=True,
    )

    # Project association (optional)
    project_id = Column(
        String(36),
        ForeignKey("projects.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    # Session metadata
    title = Column(String(200), nullable=False, default="Untitled Session")
    starred = Column(Boolean, default=False, nullable=False)
    status = Column(
        String(20),
        nullable=False,
        default="draft",
        index=True,
    )  # draft, running, paused, completed, failed

    # Content
    initial_prompt = Column(Text, nullable=False)
    working_document = Column(Text, nullable=True)
    reference_documents = Column(JSON, default=dict)  # {filename: content}
    reference_instructions = Column(Text, nullable=True)

    # Agent configuration snapshot
    agent_config = Column(JSON, nullable=False)  # List[AgentConfig] as dicts

    # Termination configuration
    termination_config = Column(JSON, nullable=False)  # TerminationCondition as dict

    # Runtime state
    current_round = Column(Integer, default=0)
    termination_reason = Column(String(200), nullable=True)

    # Credit tracking
    total_credits_used = Column(Integer, default=0, nullable=True)

    # Timestamps
    created_at = Column(DateTime(timezone=True), default=utc_now, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=utc_now, onupdate=utc_now, nullable=False)
    completed_at = Column(DateTime(timezone=True), nullable=True)

    # Relationships
    user = relationship("UserModel", back_populates="sessions")
    project = relationship("ProjectModel", back_populates="sessions")
    exchange_turns = relationship(
        "ExchangeTurnModel",
        back_populates="session",
        cascade="all, delete-orphan",
        order_by="ExchangeTurnModel.turn_number",
    )
    document_versions = relationship(
        "DocumentVersionModel",
        back_populates="session",
        cascade="all, delete-orphan",
        order_by="DocumentVersionModel.version_number",
    )

    # Indexes
    __table_args__ = (
        Index("idx_sessions_user_status", "user_id", "status"),
        Index("idx_sessions_created", "created_at"),
        Index("idx_sessions_project", "project_id"),
    )

    def __repr__(self) -> str:
        return f"<Session(id={self.id}, title={self.title}, status={self.status})>"


class ExchangeTurnModel(Base):
    """
    Database model for exchange turns (agent outputs).

    Maps to the in-memory ExchangeTurn.
    """

    __tablename__ = "exchange_turns"

    # Primary key
    id = Column(String(36), primary_key=True, default=generate_uuid)

    # Session association
    session_id = Column(
        String(36),
        ForeignKey("sessions.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    # Turn identification
    turn_number = Column(Integer, nullable=False)
    round_number = Column(Integer, nullable=False)
    phase = Column(Integer, nullable=False, default=2)  # 1=Writer, 2=Editor, 3=Synthesizer

    # Agent info
    agent_id = Column(String(100), nullable=False)
    agent_name = Column(String(200), nullable=False)

    # Content
    output = Column(Text, nullable=False)
    raw_response = Column(Text, nullable=True)  # Full response including JSON wrapper
    working_document = Column(Text, nullable=True)  # Document state after this turn

    # Evaluation
    evaluation = Column(JSON, nullable=True)  # Evaluation object as dict
    parse_error = Column(Text, nullable=True)

    # Token usage (for cost tracking)
    tokens_input = Column(Integer, nullable=True)
    tokens_output = Column(Integer, nullable=True)
    credits_used = Column(Integer, nullable=True)

    # Timestamps
    started_at = Column(DateTime(timezone=True), nullable=True)
    completed_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), default=utc_now, nullable=False)

    # Relationships
    session = relationship("SessionModel", back_populates="exchange_turns")

    # Indexes
    __table_args__ = (
        Index("idx_turns_session_round", "session_id", "round_number"),
        Index("idx_turns_session_turn", "session_id", "turn_number"),
    )

    def __repr__(self) -> str:
        return f"<ExchangeTurn(id={self.id}, session={self.session_id}, turn={self.turn_number})>"


class DocumentVersionModel(Base):
    """
    Database model for document version history.

    Tracks each version of the working document for diff viewing and rollback.
    """

    __tablename__ = "document_versions"

    # Primary key
    id = Column(String(36), primary_key=True, default=generate_uuid)

    # Session association
    session_id = Column(
        String(36),
        ForeignKey("sessions.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    # Version tracking
    version_number = Column(Integer, nullable=False)
    content = Column(Text, nullable=False)
    word_count = Column(Integer, nullable=True)

    # Attribution
    created_by = Column(String(100), nullable=False)  # agent_id or 'user'
    turn_id = Column(String(36), nullable=True)  # Reference to exchange turn that created this

    # Timestamps
    created_at = Column(DateTime(timezone=True), default=utc_now, nullable=False)

    # Relationships
    session = relationship("SessionModel", back_populates="document_versions")

    # Constraints
    __table_args__ = (
        Index("idx_versions_session", "session_id", "version_number", unique=True),
    )

    def __repr__(self) -> str:
        return f"<DocumentVersion(id={self.id}, session={self.session_id}, version={self.version_number})>"


class CreditBalanceModel(Base):
    """
    Database model for user credit balances.

    Tracks the current credit balance for each user.
    One-to-one relationship with UserModel.
    """

    __tablename__ = "credit_balances"

    # Primary key
    id = Column(String(36), primary_key=True, default=generate_uuid)

    # User association (one-to-one)
    user_id = Column(
        String(100),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
        index=True,
    )

    # Balance tracking
    balance = Column(Integer, nullable=False, default=0)
    lifetime_used = Column(Integer, nullable=False, default=0)

    # Tier tracking
    tier = Column(String(50), nullable=False, default="free")
    tier_credits = Column(Integer, nullable=False, default=20)  # Total credits for current tier

    # Grant tracking
    last_grant_at = Column(DateTime(timezone=True), nullable=True)

    # Timestamps
    created_at = Column(DateTime(timezone=True), default=utc_now, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=utc_now, onupdate=utc_now, nullable=False)

    # Relationships
    user = relationship("UserModel", back_populates="credit_balance")

    def __repr__(self) -> str:
        return f"<CreditBalance(user_id={self.user_id}, balance={self.balance})>"


class CreditTransactionModel(Base):
    """
    Database model for credit transactions.

    Records all credit changes (grants, usage, refunds, etc.).
    """

    __tablename__ = "credit_transactions"

    # Primary key
    id = Column(String(36), primary_key=True, default=generate_uuid)

    # User association
    user_id = Column(
        String(100),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    # Transaction details
    amount = Column(Integer, nullable=False)  # Positive = grant, negative = usage
    type = Column(String(50), nullable=False)  # initial_grant, subscription_grant, purchase, usage, refund, admin_grant
    description = Column(Text, nullable=True)

    # Related session (for usage transactions)
    session_id = Column(
        String(36),
        ForeignKey("sessions.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    # Stripe checkout session ID (for purchase idempotency)
    stripe_checkout_session_id = Column(String(100), nullable=True, unique=True, index=True)

    # Balance after this transaction
    balance_after = Column(Integer, nullable=False)

    # Timestamp
    created_at = Column(DateTime(timezone=True), default=utc_now, nullable=False)

    # Relationships
    user = relationship("UserModel", back_populates="credit_transactions")
    session = relationship("SessionModel")

    # Indexes
    __table_args__ = (
        Index("idx_credit_transactions_user", "user_id"),
        Index("idx_credit_transactions_session", "session_id"),
        Index("idx_credit_transactions_created", "created_at"),
    )

    def __repr__(self) -> str:
        return f"<CreditTransaction(id={self.id}, user_id={self.user_id}, amount={self.amount})>"


class SubscriptionModel(Base):
    """
    Database model for user subscriptions.

    Tracks Stripe subscription status and tier information.
    One-to-one relationship with UserModel.
    """

    __tablename__ = "subscriptions"

    # Primary key
    id = Column(String(36), primary_key=True, default=generate_uuid)

    # User association (one-to-one)
    user_id = Column(
        String(100),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
        index=True,
    )

    # Stripe IDs
    stripe_customer_id = Column(String(255), nullable=True, unique=True)
    stripe_subscription_id = Column(String(255), nullable=True, unique=True)

    # Subscription details
    tier = Column(String(50), nullable=False, default="free")  # free, starter, pro
    status = Column(String(50), nullable=False, default="active")  # active, canceled, past_due, incomplete

    # Period tracking
    current_period_start = Column(DateTime(timezone=True), nullable=True)
    current_period_end = Column(DateTime(timezone=True), nullable=True)
    cancel_at_period_end = Column(Boolean, nullable=False, default=False)

    # Timestamps
    created_at = Column(DateTime(timezone=True), default=utc_now, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=utc_now, onupdate=utc_now, nullable=False)

    # Relationships
    user = relationship("UserModel", back_populates="subscription")

    # Indexes
    __table_args__ = (
        Index("idx_subscriptions_stripe_customer", "stripe_customer_id"),
        Index("idx_subscriptions_stripe_subscription", "stripe_subscription_id"),
        Index("idx_subscriptions_tier", "tier"),
    )

    def __repr__(self) -> str:
        return f"<Subscription(id={self.id}, user_id={self.user_id}, tier={self.tier}, status={self.status})>"
