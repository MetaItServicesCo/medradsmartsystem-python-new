"""Add currency to hr_payroll_configs

Revision ID: a7b8c9d0e1f2
Revises: f6a7b8c9d0e1
Create Date: 2026-06-26
"""
from alembic import op
import sqlalchemy as sa

revision = "a7b8c9d0e1f2"
down_revision = "f6a7b8c9d0e1"
branch_labels = None
depends_on = None


def _col_exists(table: str, col: str) -> bool:
    from sqlalchemy import inspect
    cols = [c["name"] for c in inspect(op.get_bind()).get_columns(table)]
    return col in cols


def upgrade():
    if not _col_exists("hr_payroll_configs", "currency"):
        op.add_column(
            "hr_payroll_configs",
            sa.Column("currency", sa.String(3), nullable=False, server_default="USD"),
        )


def downgrade():
    op.drop_column("hr_payroll_configs", "currency")
