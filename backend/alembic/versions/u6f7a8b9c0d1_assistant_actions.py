"""Assistant actions awaiting confirmation

Revision ID: u6f7a8b9c0d1
Revises: t5e6f7a8b9c0
Create Date: 2026-09-16

The assistant prepares work orders, service bookings, inspection plans and
work order updates; a person confirms them. Each proposal is stored with the
exact details that will run, a fingerprint of them and an expiry.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "u6f7a8b9c0d1"
down_revision: Union[str, Sequence[str], None] = "t5e6f7a8b9c0"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "assistant_actions",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("facility_id", sa.Integer(), sa.ForeignKey("facilities.id", ondelete="SET NULL"), nullable=True),
        sa.Column("action_type", sa.String(length=48), nullable=False),
        sa.Column("payload", sa.JSON(), nullable=False),
        sa.Column("payload_hash", sa.String(length=64), nullable=False),
        sa.Column("card", sa.JSON(), nullable=False),
        sa.Column("status", sa.String(length=16), nullable=False),
        sa.Column("result", sa.JSON(), nullable=True),
        sa.Column("error", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("expires_at", sa.DateTime(), nullable=False),
        sa.Column("decided_at", sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_assistant_actions_user_id", "assistant_actions", ["user_id"])
    op.create_index("ix_assistant_actions_facility_id", "assistant_actions", ["facility_id"])
    op.create_index("ix_assistant_actions_status", "assistant_actions", ["status"])
    op.create_index("ix_assistant_actions_user_status", "assistant_actions", ["user_id", "status"])


def downgrade() -> None:
    op.drop_index("ix_assistant_actions_user_status", table_name="assistant_actions")
    op.drop_index("ix_assistant_actions_status", table_name="assistant_actions")
    op.drop_index("ix_assistant_actions_facility_id", table_name="assistant_actions")
    op.drop_index("ix_assistant_actions_user_id", table_name="assistant_actions")
    op.drop_table("assistant_actions")
