"""add plan slug topic gaps readings and file_path

Revision ID: 20260703_100000
Revises: 20260702_120000
Create Date: 2026-07-03 10:00:00

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
import re
import uuid

# revision identifiers, used by Alembic.
revision: str = '20260703_100000'
down_revision: Union[str, None] = '20260702120000'
branch_labels: Union[str, None] = None
depends_on: Union[str, None] = None


def _slugify(title: str) -> str:
    base = re.sub(r"[^\w一-鿿-]+", "-", title)
    base = re.sub(r"-+", "-", base).strip("-")
    return base.lower() or f"plan-{uuid.uuid4().hex[:8]}"


def upgrade() -> None:
    op.add_column('plans', sa.Column('slug', sa.String(length=100), nullable=True))
    op.add_column('plans', sa.Column('topic', sa.String(length=255), nullable=True))
    op.add_column('plans', sa.Column('knowledge_gaps', sa.JSON(), nullable=True))
    op.add_column('plans', sa.Column('suggested_readings', sa.JSON(), nullable=True))
    op.add_column('plans', sa.Column('file_path', sa.String(length=500), nullable=True))

    # Generate unique slugs for existing plans
    connection = op.get_bind()
    plans = connection.execute(sa.text("SELECT id, title FROM plans")).fetchall()
    seen = set()
    for plan_id, title in plans:
        base = _slugify(title or "plan")
        slug = base
        counter = 1
        while slug in seen:
            slug = f"{base}-{counter}"
            counter += 1
        seen.add(slug)
        connection.execute(
            sa.text("UPDATE plans SET slug = :slug WHERE id = :id"),
            {"slug": slug, "id": plan_id},
        )

    # SQLite does not support ALTER COLUMN; use batch alter for nullable->non-nullable
    with op.batch_alter_table('plans') as batch_op:
        batch_op.alter_column('slug', nullable=False)
        batch_op.create_unique_constraint('uq_plans_slug', ['slug'])


def downgrade() -> None:
    with op.batch_alter_table('plans') as batch_op:
        batch_op.drop_constraint('uq_plans_slug', type_='unique')
        batch_op.drop_column('file_path')
        batch_op.drop_column('suggested_readings')
        batch_op.drop_column('knowledge_gaps')
        batch_op.drop_column('topic')
        batch_op.drop_column('slug')
