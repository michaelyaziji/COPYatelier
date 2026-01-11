"""Add users table for authentication.

Revision ID: 002
Revises: 001
Create Date: 2025-01-10

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '002'
down_revision: Union[str, None] = '001'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Create users table
    op.create_table(
        'users',
        sa.Column('id', sa.String(100), primary_key=True),
        sa.Column('email', sa.String(255), nullable=False, unique=True),
        sa.Column('display_name', sa.String(200), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )

    # Create index on email for faster lookups
    op.create_index('idx_users_email', 'users', ['email'])

    # Note: We don't add the foreign key constraint to sessions.user_id here
    # because existing sessions may have NULL user_id values.
    # The constraint is defined in the model but will be enforced at the
    # application level until all sessions have valid user_ids.


def downgrade() -> None:
    op.drop_index('idx_users_email', 'users')
    op.drop_table('users')
