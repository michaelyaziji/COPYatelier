"""Add credit system tables.

Revision ID: 005
Revises: 004
Create Date: 2025-01-11

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '005'
down_revision: Union[str, None] = '004'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Create credit_balances table
    op.create_table(
        'credit_balances',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('user_id', sa.String(100), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False, unique=True),
        sa.Column('balance', sa.Integer, nullable=False, server_default='0'),
        sa.Column('lifetime_used', sa.Integer, nullable=False, server_default='0'),
        sa.Column('last_grant_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )

    # Create index on user_id for faster lookups
    op.create_index('idx_credit_balances_user', 'credit_balances', ['user_id'])

    # Create credit_transactions table
    op.create_table(
        'credit_transactions',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('user_id', sa.String(100), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False),
        sa.Column('amount', sa.Integer, nullable=False),  # Positive = grant, negative = usage
        sa.Column('type', sa.String(50), nullable=False),  # initial_grant, subscription_grant, purchase, usage, refund, admin_grant
        sa.Column('description', sa.Text, nullable=True),
        sa.Column('session_id', sa.String(36), sa.ForeignKey('sessions.id', ondelete='SET NULL'), nullable=True),
        sa.Column('balance_after', sa.Integer, nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )

    # Create indexes for credit_transactions
    op.create_index('idx_credit_transactions_user', 'credit_transactions', ['user_id'])
    op.create_index('idx_credit_transactions_session', 'credit_transactions', ['session_id'])
    op.create_index('idx_credit_transactions_created', 'credit_transactions', ['created_at'])

    # Add total_credits_used column to sessions table
    op.add_column('sessions', sa.Column('total_credits_used', sa.Integer, nullable=True, server_default='0'))

    # Add starred column to sessions if it doesn't exist (it's used but might be missing)
    # Note: This was in the model but might not have been in a migration
    try:
        op.add_column('sessions', sa.Column('starred', sa.Boolean, nullable=False, server_default='0'))
    except Exception:
        pass  # Column might already exist


def downgrade() -> None:
    # Remove starred column from sessions
    try:
        op.drop_column('sessions', 'starred')
    except Exception:
        pass

    # Remove total_credits_used from sessions
    op.drop_column('sessions', 'total_credits_used')

    # Drop credit_transactions table
    op.drop_index('idx_credit_transactions_created', 'credit_transactions')
    op.drop_index('idx_credit_transactions_session', 'credit_transactions')
    op.drop_index('idx_credit_transactions_user', 'credit_transactions')
    op.drop_table('credit_transactions')

    # Drop credit_balances table
    op.drop_index('idx_credit_balances_user', 'credit_balances')
    op.drop_table('credit_balances')
