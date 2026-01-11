"""Add subscriptions table for Stripe integration.

Revision ID: 006
Revises: 005
Create Date: 2025-01-11

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '006'
down_revision: Union[str, None] = '005'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Create subscriptions table
    op.create_table(
        'subscriptions',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('user_id', sa.String(100), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False, unique=True),
        # Stripe IDs
        sa.Column('stripe_customer_id', sa.String(255), nullable=True, unique=True),
        sa.Column('stripe_subscription_id', sa.String(255), nullable=True, unique=True),
        # Subscription details
        sa.Column('tier', sa.String(50), nullable=False, server_default='free'),  # free, starter, pro
        sa.Column('status', sa.String(50), nullable=False, server_default='active'),  # active, canceled, past_due, incomplete
        # Period tracking
        sa.Column('current_period_start', sa.DateTime(timezone=True), nullable=True),
        sa.Column('current_period_end', sa.DateTime(timezone=True), nullable=True),
        sa.Column('cancel_at_period_end', sa.Boolean, nullable=False, server_default='0'),
        # Timestamps
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )

    # Create indexes
    op.create_index('idx_subscriptions_user', 'subscriptions', ['user_id'])
    op.create_index('idx_subscriptions_stripe_customer', 'subscriptions', ['stripe_customer_id'])
    op.create_index('idx_subscriptions_stripe_subscription', 'subscriptions', ['stripe_subscription_id'])
    op.create_index('idx_subscriptions_tier', 'subscriptions', ['tier'])

    # Add tier to credit_balances to track which tier the user belongs to
    op.add_column('credit_balances', sa.Column('tier', sa.String(50), nullable=False, server_default='free'))
    op.add_column('credit_balances', sa.Column('tier_credits', sa.Integer, nullable=False, server_default='20'))  # Total credits for current tier


def downgrade() -> None:
    # Remove tier columns from credit_balances
    op.drop_column('credit_balances', 'tier_credits')
    op.drop_column('credit_balances', 'tier')

    # Drop subscriptions table
    op.drop_index('idx_subscriptions_tier', 'subscriptions')
    op.drop_index('idx_subscriptions_stripe_subscription', 'subscriptions')
    op.drop_index('idx_subscriptions_stripe_customer', 'subscriptions')
    op.drop_index('idx_subscriptions_user', 'subscriptions')
    op.drop_table('subscriptions')
