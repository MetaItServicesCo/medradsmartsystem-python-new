"""Card processing fee on invoices and quotation payments

Revision ID: b8f3d1e6a2c4
Revises: a7e2c9d4f1b3
Create Date: 2026-11-13

Two columns, both zero for everything that exists: the card processing fee an
invoice was charged when paid by card, and the same on a service quotation's
card payment. No existing amount changes.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "b8f3d1e6a2c4"
down_revision: Union[str, Sequence[str], None] = "a7e2c9d4f1b3"
branch_labels = None
depends_on = None

COLUMNS = (("invoices", "card_fee_amount"), ("quotation_payments", "card_fee_amount"))


def _has(table: str, column: str) -> bool:
    return column in {item["name"] for item in sa.inspect(op.get_bind()).get_columns(table)}


def upgrade() -> None:
    for table, column in COLUMNS:
        if not _has(table, column):
            op.add_column(table, sa.Column(column, sa.Numeric(10, 2), nullable=False, server_default="0"))


def downgrade() -> None:
    for table, column in COLUMNS:
        if _has(table, column):
            op.drop_column(table, column)
