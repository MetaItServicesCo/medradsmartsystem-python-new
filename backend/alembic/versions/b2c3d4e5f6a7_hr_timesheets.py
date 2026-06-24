"""Add hr_timesheets table

Revision ID: b2c3d4e5f6a7
Revises: a1b2c3d4e5f6
Create Date: 2026-06-25
"""
from alembic import op
import sqlalchemy as sa

revision = "b2c3d4e5f6a7"
down_revision = "a1b2c3d4e5f6"
branch_labels = None
depends_on = None


def _table_exists(name: str) -> bool:
    from sqlalchemy import inspect
    return inspect(op.get_bind()).has_table(name)


def upgrade():
    if not _table_exists("hr_timesheets"):
        op.create_table(
            "hr_timesheets",
            sa.Column("id", sa.Integer(), nullable=False),
            sa.Column("user_id", sa.Integer(), nullable=False),
            sa.Column("work_date", sa.Date(), nullable=False),
            sa.Column("hours", sa.Float(), nullable=False, server_default="0"),
            sa.Column("project", sa.String(), nullable=True),
            sa.Column("description", sa.Text(), nullable=True),
            sa.Column("status", sa.String(), nullable=False, server_default="draft"),
            sa.Column("submitted_at", sa.DateTime(), nullable=True),
            sa.Column("reviewed_by_id", sa.Integer(), nullable=True),
            sa.Column("reviewed_at", sa.DateTime(), nullable=True),
            sa.Column("review_notes", sa.Text(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.Column("updated_at", sa.DateTime(), nullable=False),
            sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
            sa.ForeignKeyConstraint(["reviewed_by_id"], ["users.id"], ondelete="SET NULL"),
            sa.PrimaryKeyConstraint("id"),
        )
        op.create_index("ix_hr_timesheets_id", "hr_timesheets", ["id"])
        op.create_index("ix_hr_timesheets_user_id", "hr_timesheets", ["user_id"])
        op.create_index("ix_hr_timesheets_work_date", "hr_timesheets", ["work_date"])
        op.create_index("ix_hr_timesheets_status", "hr_timesheets", ["status"])


def downgrade():
    if _table_exists("hr_timesheets"):
        op.drop_table("hr_timesheets")
