"""Where a self check-in or check-out was made, as an address

Revision ID: c9d4e2f7a3b1
Revises: b3e8f1a5c7d2
Create Date: 2026-11-06

The position of a self check-in is already kept (latitude, longitude). This
adds the address it resolves to, looked up once after the mark is saved, so HR
reads "Gulshan-e-Iqbal, Karachi" rather than coordinates. One new nullable
column; nothing existing changes.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "c9d4e2f7a3b1"
down_revision: Union[str, Sequence[str], None] = "b3e8f1a5c7d2"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("attendance_events", sa.Column("location_place", sa.String(length=255), nullable=True))


def downgrade() -> None:
    op.drop_column("attendance_events", "location_place")
