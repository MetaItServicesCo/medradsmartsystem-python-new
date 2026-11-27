"""Leads

Revision ID: c4d9e2f7a1b3
Revises: b2c7e4a9f1d3
Create Date: 2026-11-27

The Leads module: people and businesses that may become customers. Adds one
new table, leads, linked only to the user who added each lead. Nothing that
exists changes.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "c4d9e2f7a1b3"
down_revision: Union[str, Sequence[str], None] = "b2c7e4a9f1d3"
branch_labels = None
depends_on = None


def upgrade() -> None:
    if "leads" in set(sa.inspect(op.get_bind()).get_table_names()):
        return
    op.create_table(
        "leads",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(length=200), nullable=False),
        sa.Column("company", sa.String(length=200), nullable=True),
        sa.Column("email", sa.String(length=320), nullable=True),
        sa.Column("phone", sa.String(length=40), nullable=True),
        sa.Column("source", sa.String(length=40), nullable=False),
        sa.Column("status", sa.String(length=24), nullable=False, server_default="new"),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_by_id", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["created_by_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_leads_id", "leads", ["id"])
    op.create_index("ix_leads_source", "leads", ["source"])
    op.create_index("ix_leads_status", "leads", ["status"])
    op.create_index("ix_leads_created_by_id", "leads", ["created_by_id"])
    op.create_index("ix_leads_created_at", "leads", ["created_at"])
    op.create_index("ix_leads_status_created", "leads", ["status", sa.text("created_at DESC")])


def downgrade() -> None:
    if "leads" not in set(sa.inspect(op.get_bind()).get_table_names()):
        return
    op.drop_index("ix_leads_status_created", table_name="leads")
    op.drop_index("ix_leads_created_at", table_name="leads")
    op.drop_index("ix_leads_created_by_id", table_name="leads")
    op.drop_index("ix_leads_status", table_name="leads")
    op.drop_index("ix_leads_source", table_name="leads")
    op.drop_index("ix_leads_id", table_name="leads")
    op.drop_table("leads")
