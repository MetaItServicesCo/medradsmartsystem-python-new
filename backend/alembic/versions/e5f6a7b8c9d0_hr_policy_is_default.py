"""Add is_default to hr_attendance_policies

Revision ID: e5f6a7b8c9d0
Revises: d4e5f6a7b8c9
Create Date: 2026-06-26
"""
from alembic import op
import sqlalchemy as sa

revision = "e5f6a7b8c9d0"
down_revision = "d4e5f6a7b8c9"
branch_labels = None
depends_on = None


def _col_exists(table: str, col: str) -> bool:
    from sqlalchemy import inspect
    cols = [c["name"] for c in inspect(op.get_bind()).get_columns(table)]
    return col in cols


def upgrade():
    if not _col_exists("hr_attendance_policies", "is_default"):
        op.add_column(
            "hr_attendance_policies",
            sa.Column("is_default", sa.Boolean(), nullable=False, server_default="false"),
        )


def downgrade():
    op.drop_column("hr_attendance_policies", "is_default")
