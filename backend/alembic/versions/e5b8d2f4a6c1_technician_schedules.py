"""Calendar: technician schedules

Revision ID: e5b8d2f4a6c1
Revises: d4a7c1e9f2b3
Create Date: 2026-11-10

A calendar event can be a technician schedule: tagged with one or more
technicians, and seen by them, by its creator and by every Admin and Super
Admin. New columns with defaults and a new table only. Existing events become
"not a schedule, not all day, no location", which is what they are, so
personal and workspace events work exactly as before.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "e5b8d2f4a6c1"
down_revision: Union[str, Sequence[str], None] = "d4a7c1e9f2b3"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("calendar_events", sa.Column("is_schedule", sa.Boolean(), nullable=False, server_default=sa.text("false")))
    op.add_column("calendar_events", sa.Column("all_day", sa.Boolean(), nullable=False, server_default=sa.text("false")))
    op.add_column("calendar_events", sa.Column("location", sa.String(length=200), nullable=True))
    op.create_index("ix_calendar_events_is_schedule", "calendar_events", ["is_schedule"])
    op.create_table(
        "calendar_event_technicians",
        sa.Column("event_id", sa.Integer(), sa.ForeignKey("calendar_events.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), primary_key=True),
    )
    op.create_index("ix_calendar_event_technicians_user_id", "calendar_event_technicians", ["user_id"])


def downgrade() -> None:
    op.drop_index("ix_calendar_event_technicians_user_id", table_name="calendar_event_technicians")
    op.drop_table("calendar_event_technicians")
    op.drop_index("ix_calendar_events_is_schedule", table_name="calendar_events")
    op.drop_column("calendar_events", "location")
    op.drop_column("calendar_events", "all_day")
    op.drop_column("calendar_events", "is_schedule")
