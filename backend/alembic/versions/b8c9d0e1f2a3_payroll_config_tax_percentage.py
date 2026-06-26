"""Add tax_percentage to hr_payroll_configs

Revision ID: b8c9d0e1f2a3
Revises: a7b8c9d0e1f2
Create Date: 2026-06-26
"""
from alembic import op
import sqlalchemy as sa

revision = "b8c9d0e1f2a3"
down_revision = "a7b8c9d0e1f2"
branch_labels = None
depends_on = None


def _col_exists(table: str, col: str) -> bool:
    from sqlalchemy import inspect
    cols = [c["name"] for c in inspect(op.get_bind()).get_columns(table)]
    return col in cols


def upgrade():
    if not _col_exists("hr_payroll_configs", "tax_percentage"):
        op.add_column(
            "hr_payroll_configs",
            sa.Column("tax_percentage", sa.Float(), nullable=False, server_default="0"),
        )


def downgrade():
    op.drop_column("hr_payroll_configs", "tax_percentage")
