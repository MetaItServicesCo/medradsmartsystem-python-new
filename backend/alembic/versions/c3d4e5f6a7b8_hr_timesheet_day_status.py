"""Add day_status, hours_worked, daily_wage_earned to hr_timesheets

Revision ID: c3d4e5f6a7b8
Revises: b2c3d4e5f6a7
Create Date: 2026-06-26
"""
from alembic import op
import sqlalchemy as sa

revision = "c3d4e5f6a7b8"
down_revision = "b2c3d4e5f6a7"
branch_labels = None
depends_on = None


def _col_exists(table: str, col: str) -> bool:
    from sqlalchemy import inspect
    cols = [c["name"] for c in inspect(op.get_bind()).get_columns(table)]
    return col in cols


def upgrade():
    if not _col_exists("hr_timesheets", "day_status"):
        op.add_column("hr_timesheets", sa.Column("day_status", sa.String(), nullable=True))
        op.create_index("ix_hr_timesheets_day_status", "hr_timesheets", ["day_status"])
    if not _col_exists("hr_timesheets", "hours_worked"):
        op.add_column("hr_timesheets", sa.Column("hours_worked", sa.Float(), nullable=True))
    if not _col_exists("hr_timesheets", "daily_wage_earned"):
        op.add_column("hr_timesheets", sa.Column("daily_wage_earned", sa.Float(), nullable=True))


def downgrade():
    op.drop_column("hr_timesheets", "daily_wage_earned")
    op.drop_column("hr_timesheets", "hours_worked")
    op.drop_index("ix_hr_timesheets_day_status", table_name="hr_timesheets")
    op.drop_column("hr_timesheets", "day_status")
