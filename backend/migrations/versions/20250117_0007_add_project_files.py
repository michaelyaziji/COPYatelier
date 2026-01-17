"""Add project files table and instructions field to projects.

Revision ID: 007
Revises: 006
Create Date: 2025-01-17

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '007'
down_revision: Union[str, None] = '006'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Add instructions column to projects table
    op.add_column('projects', sa.Column('instructions', sa.Text, nullable=True))

    # Create project_files table
    op.create_table(
        'project_files',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('project_id', sa.String(36), sa.ForeignKey('projects.id', ondelete='CASCADE'), nullable=False),
        sa.Column('filename', sa.String(255), nullable=False),
        sa.Column('original_file_type', sa.String(50), nullable=False),
        sa.Column('description', sa.Text, nullable=True),
        sa.Column('content', sa.Text, nullable=False),
        sa.Column('char_count', sa.Integer, nullable=True),
        sa.Column('word_count', sa.Integer, nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )

    # Create index on project_id for faster lookups
    op.create_index('idx_project_files_project', 'project_files', ['project_id'])


def downgrade() -> None:
    # Drop project_files table and index
    op.drop_index('idx_project_files_project', 'project_files')
    op.drop_table('project_files')

    # Remove instructions column from projects
    op.drop_column('projects', 'instructions')
