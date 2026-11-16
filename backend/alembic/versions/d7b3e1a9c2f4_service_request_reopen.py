"""Reopening a completed service request

Revision ID: d7b3e1a9c2f4
Revises: c4e9a2f7b1d5
Create Date: 2026-11-17

One flag on a service request: an admin reopened it while it had an invoice,
so closing it again updates that invoice. False for every request that
exists; nothing else changes.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "d7b3e1a9c2f4"
down_revision: Union[str, Sequence[str], None] = "c4e9a2f7b1d5"
branch_labels = None
depends_on = None

TABLE = "service_requests"
COLUMN = "invoice_needs_revision"


def _has() -> bool:
    return COLUMN in {item["name"] for item in sa.inspect(op.get_bind()).get_columns(TABLE)}


def upgrade() -> None:
    if not _has():
        op.add_column(TABLE, sa.Column(COLUMN, sa.Boolean(), nullable=False, server_default=sa.false()))


def downgrade() -> None:
    if _has():
        op.drop_column(TABLE, COLUMN)
