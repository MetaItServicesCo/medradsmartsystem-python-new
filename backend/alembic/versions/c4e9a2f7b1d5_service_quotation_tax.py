"""Sales tax on service quotations

Revision ID: c4e9a2f7b1d5
Revises: b8f3d1e6a2c4
Create Date: 2026-11-14

A quotation's tax rate and tax amount, both zero for every quotation that
exists: those stay exactly as issued, authorized and paid. No amount changes.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "c4e9a2f7b1d5"
down_revision: Union[str, Sequence[str], None] = "b8f3d1e6a2c4"
branch_labels = None
depends_on = None

TABLE = "service_request_quotations"
COLUMNS = (("tax_rate", sa.Numeric(5, 2)), ("tax_amount", sa.Numeric(10, 2)))


def _has(column: str) -> bool:
    return column in {item["name"] for item in sa.inspect(op.get_bind()).get_columns(TABLE)}


def upgrade() -> None:
    for column, kind in COLUMNS:
        if not _has(column):
            op.add_column(TABLE, sa.Column(column, kind, nullable=False, server_default="0"))


def downgrade() -> None:
    for column, _kind in COLUMNS:
        if _has(column):
            op.drop_column(TABLE, column)
