"""add must_change_password to users

Revision ID: 20260812_100000
Revises: 20260703_130000
Create Date: 2026-08-12 10:00:00

"""
from alembic import op
import sqlalchemy as sa


revision = "20260812_100000"
down_revision = "20260703_130000"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column(
            "must_change_password",
            sa.Boolean(),
            server_default=sa.false(),
            nullable=False,
        ),
    )


def downgrade() -> None:
    op.drop_column("users", "must_change_password")
