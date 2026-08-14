"""add wiki_pages

Revision ID: 20260527124828
Revises:
Create Date: 2026-05-27 12:48:28

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = '20260527124828'
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'wiki_pages',
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('slug', sa.String(length=100), nullable=False),
        sa.Column('title', sa.String(length=255), nullable=False),
        sa.Column('type', sa.String(length=20), nullable=False),
        sa.Column('status', sa.String(length=20), nullable=True),
        sa.Column('tags', postgresql.ARRAY(sa.String(length=50)), nullable=True),
        sa.Column('summary', sa.Text(), nullable=True),
        sa.Column('source_paths', postgresql.ARRAY(sa.Text()), nullable=True),
        sa.Column('linked_slugs', postgresql.ARRAY(sa.String(length=100)), nullable=True),
        sa.Column('file_path', sa.String(length=500), nullable=False),
        sa.Column('created_by', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('updated_by', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.Column('updated_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['created_by'], ['users.id'], ),
        sa.ForeignKeyConstraint(['updated_by'], ['users.id'], ),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('slug')
    )
    op.create_index(op.f('ix_wiki_pages_slug'), 'wiki_pages', ['slug'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_wiki_pages_slug'), table_name='wiki_pages')
    op.drop_table('wiki_pages')
