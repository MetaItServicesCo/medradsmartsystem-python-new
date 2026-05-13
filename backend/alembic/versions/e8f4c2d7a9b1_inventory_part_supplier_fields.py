"""inventory part supplier fields

Revision ID: e8f4c2d7a9b1
Revises: d3f2a1c9e8b4
Create Date: 2026-05-13 05:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "e8f4c2d7a9b1"
down_revision: Union[str, Sequence[str], None] = "d3f2a1c9e8b4"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _table_exists(table_name: str) -> bool:
    return sa.inspect(op.get_bind()).has_table(table_name)


def _column_exists(table_name: str, column_name: str) -> bool:
    if not _table_exists(table_name):
        return False
    return any(column["name"] == column_name for column in sa.inspect(op.get_bind()).get_columns(table_name))


def _add_column_if_missing(table_name: str, column: sa.Column) -> None:
    if _table_exists(table_name) and not _column_exists(table_name, column.name):
        op.add_column(table_name, column)


def upgrade() -> None:
    if not _table_exists("inventory_parts"):
        return
    _add_column_if_missing("inventory_parts", sa.Column("supplier_address", sa.Text(), nullable=True))
    _add_column_if_missing("inventory_parts", sa.Column("vendor_name", sa.String(), nullable=True))
    _add_column_if_missing("inventory_parts", sa.Column("purchase_location", sa.String(), nullable=True))
    _add_column_if_missing("inventory_parts", sa.Column("shipping_method", sa.String(), nullable=True))
    _add_column_if_missing("inventory_parts", sa.Column("warehouse_arrival_date", sa.Date(), nullable=True))


def downgrade() -> None:
    if not _table_exists("inventory_parts"):
        return
    for column_name in [
        "warehouse_arrival_date",
        "shipping_method",
        "purchase_location",
        "vendor_name",
        "supplier_address",
    ]:
        if _column_exists("inventory_parts", column_name):
            op.drop_column("inventory_parts", column_name)
