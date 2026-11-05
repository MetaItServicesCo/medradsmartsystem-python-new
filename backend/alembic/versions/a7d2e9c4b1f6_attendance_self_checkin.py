"""Employees check themselves in, with where they were and why if by hand

Revision ID: a7d2e9c4b1f6
Revises: f1a4c8e2d6b9
Create Date: 2026-11-06

Every employee and technician marks their own attendance from a phone or the
web: a face check against their own enrolment, with the phone's location. If
the face check does not pass they mark it by hand with a note, which counts
but is flagged for HR with the photo taken. Each event keeps the location it
was marked at and the employee's own note, beside the HR remark that already
existed. Existing events are unchanged (the new columns are empty for them).
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "a7d2e9c4b1f6"
down_revision: Union[str, Sequence[str], None] = "f1a4c8e2d6b9"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("attendance_events") as batch:
        batch.add_column(sa.Column("latitude", sa.Float(), nullable=True))
        batch.add_column(sa.Column("longitude", sa.Float(), nullable=True))
        batch.add_column(sa.Column("location_accuracy_m", sa.Float(), nullable=True))
        batch.add_column(sa.Column("employee_note", sa.Text(), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("attendance_events") as batch:
        batch.drop_column("employee_note")
        batch.drop_column("location_accuracy_m")
        batch.drop_column("longitude")
        batch.drop_column("latitude")
