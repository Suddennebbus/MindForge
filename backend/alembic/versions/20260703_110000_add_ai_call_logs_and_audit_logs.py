"""add ai_call_logs and audit_logs tables

Revision ID: 20260703_110000
Revises: 20260703_100000
Create Date: 2026-07-03 11:00:00

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = '20260703_110000'
down_revision: Union[str, None] = '20260703_100000'
branch_labels: Union[str, None] = None
depends_on: Union[str, None] = None


def upgrade() -> None:
    op.create_table(
        'ai_call_logs',
        sa.Column('id', sa.String(length=36), nullable=False),
        sa.Column('user_id', sa.String(length=36), nullable=False),
        sa.Column('operation_type', sa.String(length=20), nullable=False),
        sa.Column('llm_config_id', sa.String(length=36), nullable=True),
        sa.Column('input_tokens', sa.String(length=20), nullable=True),
        sa.Column('output_tokens', sa.String(length=20), nullable=True),
        sa.Column('cost_usd', sa.String(length=20), nullable=True),
        sa.Column('duration_ms', sa.String(length=20), nullable=True),
        sa.Column('status', sa.String(length=20), nullable=True),
        sa.Column('error_message', sa.Text(), nullable=True),
        sa.Column('metadata_json', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_ai_call_logs_user_id'), 'ai_call_logs', ['user_id'], unique=False)

    op.create_table(
        'audit_logs',
        sa.Column('id', sa.String(length=36), nullable=False),
        sa.Column('user_id', sa.String(length=36), nullable=False),
        sa.Column('action_type', sa.String(length=50), nullable=False),
        sa.Column('resource_type', sa.String(length=30), nullable=False),
        sa.Column('resource_id', sa.String(length=100), nullable=True),
        sa.Column('old_value', sa.JSON(), nullable=True),
        sa.Column('new_value', sa.JSON(), nullable=True),
        sa.Column('ip_address', sa.String(length=45), nullable=True),
        sa.Column('user_agent', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_audit_logs_user_id'), 'audit_logs', ['user_id'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_audit_logs_user_id'), table_name='audit_logs')
    op.drop_table('audit_logs')
    op.drop_index(op.f('ix_ai_call_logs_user_id'), table_name='ai_call_logs')
    op.drop_table('ai_call_logs')
