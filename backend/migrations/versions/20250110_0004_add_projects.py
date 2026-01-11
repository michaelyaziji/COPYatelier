"""Add projects table and project_id to sessions.

Revision ID: 004
Revises: 003
Create Date: 2025-01-10

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '004'
down_revision: Union[str, None] = '003'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Create projects table
    op.create_table(
        'projects',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('user_id', sa.String(100), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False),
        sa.Column('name', sa.String(200), nullable=False),
        sa.Column('description', sa.Text, nullable=True),
        sa.Column('default_agent_config', sa.JSON, nullable=True),
        sa.Column('archived_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )

    # Create index on user_id for faster lookups
    op.create_index('idx_projects_user', 'projects', ['user_id'])

    # Add project_id column to sessions table
    op.add_column('sessions', sa.Column('project_id', sa.String(36), nullable=True))

    # Create foreign key constraint
    op.create_foreign_key(
        'fk_sessions_project',
        'sessions',
        'projects',
        ['project_id'],
        ['id'],
        ondelete='SET NULL'
    )

    # Create index on project_id
    op.create_index('idx_sessions_project', 'sessions', ['project_id'])


def downgrade() -> None:
    # Drop foreign key and index from sessions
    op.drop_index('idx_sessions_project', 'sessions')
    op.drop_constraint('fk_sessions_project', 'sessions', type_='foreignkey')
    op.drop_column('sessions', 'project_id')

    # Drop projects table
    op.drop_index('idx_projects_user', 'projects')
    op.drop_table('projects')
