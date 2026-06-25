"""Add source column to hr_timesheets

Revision ID: f6a7b8c9d0e1
Revises: e5f6a7b8c9d0
Create Date: 2026-06-26
"""
from alembic import op
import sqlalchemy as sa

revision = "f6a7b8c9d0e1"
down_revision = "e5f6a7b8c9d0"
branch_labels = None
depends_on = None


def _col_exists(table: str, col: str) -> bool:
    from sqlalchemy import inspect
    cols = [c["name"] for c in inspect(op.get_bind()).get_columns(table)]
    return col in cols


def upgrade():
    if not _col_exists("hr_timesheets", "source"):
        op.add_column(
            "hr_timesheets",
            sa.Column("source", sa.String(20), nullable=False, server_default="attendance"),
        )
    if not _col_exists("hr_timesheets", "task_title"):
        op.add_column(
            "hr_timesheets",
            sa.Column("task_title", sa.String(255), nullable=True),
        )


def downgrade():
    op.drop_column("hr_timesheets", "task_title")
    op.drop_column("hr_timesheets", "source")
