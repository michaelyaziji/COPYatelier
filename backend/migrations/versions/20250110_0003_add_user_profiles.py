"""Add user_profiles table for user settings and preferences.

Revision ID: 003
Revises: 002
Create Date: 2025-01-10

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '003'
down_revision: Union[str, None] = '002'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Create user_profiles table
    op.create_table(
        'user_profiles',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('user_id', sa.String(100), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False, unique=True),
        sa.Column('timezone', sa.String(50), default='UTC'),
        sa.Column('preferences', sa.JSON, default=dict),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )

    # Create index on user_id for faster lookups
    op.create_index('idx_user_profiles_user_id', 'user_profiles', ['user_id'], unique=True)


def downgrade() -> None:
    op.drop_index('idx_user_profiles_user_id', 'user_profiles')
    op.drop_table('user_profiles')
