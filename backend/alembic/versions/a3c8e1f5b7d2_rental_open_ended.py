"""Rental agreements kept open until returned

Revision ID: a3c8e1f5b7d2
Revises: f2a7c9d4e1b3
Create Date: 2026-11-21

An agreement can be kept open: its committed periods become the minimum term,
and it is billed one period at a time until every item is returned. Every
existing agreement is a fixed term and stays one (false).
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "a3c8e1f5b7d2"
down_revision: Union[str, Sequence[str], None] = "f2a7c9d4e1b3"
branch_labels = None
depends_on = None

TABLE = "rentals"
COLUMN = "open_ended"


def _has() -> bool:
    return COLUMN in {item["name"] for item in sa.inspect(op.get_bind()).get_columns(TABLE)}


def upgrade() -> None:
    if not _has():
        op.add_column(TABLE, sa.Column(COLUMN, sa.Boolean(), nullable=False, server_default=sa.false()))


def downgrade() -> None:
    if _has():
        with op.batch_alter_table(TABLE) as batch:
            batch.drop_column(COLUMN)
