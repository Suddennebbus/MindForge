"""add raw file wiki page links

Revision ID: 20260703_130000
Revises: 20260703_110000
Create Date: 2026-07-03 13:00:00

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
import uuid

# revision identifiers, used by Alembic.
revision: str = '20260703_130000'
down_revision: Union[str, None] = '20260703_110000'
branch_labels: Union[str, None] = None
depends_on: Union[str, None] = None


def upgrade() -> None:
    # The app uses Base.metadata.create_all() at startup, so the table may already exist.
    op.create_table(
        'raw_file_wiki_page_links',
        sa.Column('id', sa.String(length=36), primary_key=True),
        sa.Column('raw_file_id', sa.String(length=36), nullable=False),
        sa.Column('wiki_page_id', sa.String(length=36), nullable=False),
        sa.Column('created_at', sa.DateTime(), server_default=sa.func.now()),
        if_not_exists=True,
    )
    op.create_index('ix_raw_file_wiki_page_links_raw_file_id', 'raw_file_wiki_page_links', ['raw_file_id'], if_not_exists=True)
    op.create_index('ix_raw_file_wiki_page_links_wiki_page_id', 'raw_file_wiki_page_links', ['wiki_page_id'], if_not_exists=True)

    # Migrate existing entity_page_id links (only insert rows that don't already exist).
    connection = op.get_bind()
    existing_links = {
        (row[0], row[1])
        for row in connection.execute(
            sa.text("SELECT raw_file_id, wiki_page_id FROM raw_file_wiki_page_links")
        ).fetchall()
    }
    rows = connection.execute(
        sa.text("SELECT id, entity_page_id FROM raw_files WHERE entity_page_id IS NOT NULL")
    ).fetchall()
    for raw_id, page_id in rows:
        if (raw_id, page_id) not in existing_links:
            connection.execute(
                sa.text(
                    "INSERT INTO raw_file_wiki_page_links (id, raw_file_id, wiki_page_id) "
                    "VALUES (:id, :raw_id, :page_id)"
                ),
                {"id": str(uuid.uuid4()), "raw_id": raw_id, "page_id": page_id},
            )


def downgrade() -> None:
    op.drop_index('ix_raw_file_wiki_page_links_wiki_page_id', table_name='raw_file_wiki_page_links')
    op.drop_index('ix_raw_file_wiki_page_links_raw_file_id', table_name='raw_file_wiki_page_links')
    op.drop_table('raw_file_wiki_page_links')
