"""add plan generation payload

Revision ID: 20260702120000
Revises: 20260702110000
Create Date: 2026-07-02 12:00:00

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = '20260702120000'
down_revision: Union[str, None] = '20260702110000'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('plans', sa.Column('generation_payload_json', sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column('plans', 'generation_payload_json')
