"""Initial schema for sessions, exchange turns, and document versions.

Revision ID: 001
Revises:
Create Date: 2025-01-10

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '001'
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Create sessions table
    op.create_table(
        'sessions',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('user_id', sa.String(36), nullable=True, index=True),
        sa.Column('title', sa.String(200), nullable=False, server_default='Untitled Session'),
        sa.Column('status', sa.String(20), nullable=False, server_default='draft', index=True),
        sa.Column('initial_prompt', sa.Text, nullable=False),
        sa.Column('working_document', sa.Text, nullable=True),
        sa.Column('reference_documents', sa.JSON, nullable=True),
        sa.Column('reference_instructions', sa.Text, nullable=True),
        sa.Column('agent_config', sa.JSON, nullable=False),
        sa.Column('termination_config', sa.JSON, nullable=False),
        sa.Column('current_round', sa.Integer, server_default='0'),
        sa.Column('termination_reason', sa.String(200), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('completed_at', sa.DateTime(timezone=True), nullable=True),
    )

    # Create index for user_id + status
    op.create_index('idx_sessions_user_status', 'sessions', ['user_id', 'status'])
    op.create_index('idx_sessions_created', 'sessions', ['created_at'])

    # Create exchange_turns table
    op.create_table(
        'exchange_turns',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('session_id', sa.String(36), sa.ForeignKey('sessions.id', ondelete='CASCADE'), nullable=False, index=True),
        sa.Column('turn_number', sa.Integer, nullable=False),
        sa.Column('round_number', sa.Integer, nullable=False),
        sa.Column('phase', sa.Integer, nullable=False, server_default='2'),
        sa.Column('agent_id', sa.String(100), nullable=False),
        sa.Column('agent_name', sa.String(200), nullable=False),
        sa.Column('output', sa.Text, nullable=False),
        sa.Column('raw_response', sa.Text, nullable=True),
        sa.Column('working_document', sa.Text, nullable=True),
        sa.Column('evaluation', sa.JSON, nullable=True),
        sa.Column('parse_error', sa.Text, nullable=True),
        sa.Column('tokens_input', sa.Integer, nullable=True),
        sa.Column('tokens_output', sa.Integer, nullable=True),
        sa.Column('credits_used', sa.Integer, nullable=True),
        sa.Column('started_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('completed_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )

    # Create indexes for exchange_turns
    op.create_index('idx_turns_session_round', 'exchange_turns', ['session_id', 'round_number'])
    op.create_index('idx_turns_session_turn', 'exchange_turns', ['session_id', 'turn_number'])

    # Create document_versions table
    op.create_table(
        'document_versions',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('session_id', sa.String(36), sa.ForeignKey('sessions.id', ondelete='CASCADE'), nullable=False, index=True),
        sa.Column('version_number', sa.Integer, nullable=False),
        sa.Column('content', sa.Text, nullable=False),
        sa.Column('word_count', sa.Integer, nullable=True),
        sa.Column('created_by', sa.String(100), nullable=False),
        sa.Column('turn_id', sa.String(36), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )

    # Create unique index for session_id + version_number
    op.create_index('idx_versions_session', 'document_versions', ['session_id', 'version_number'], unique=True)


def downgrade() -> None:
    op.drop_table('document_versions')
    op.drop_table('exchange_turns')
    op.drop_table('sessions')
