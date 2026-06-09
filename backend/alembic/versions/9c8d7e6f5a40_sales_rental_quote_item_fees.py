"""sales rental quote item fees

Revision ID: 9c8d7e6f5a40
Revises: 7b9c1d2e3f40
Create Date: 2026-06-09 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "9c8d7e6f5a40"
down_revision: Union[str, Sequence[str], None] = "7b9c1d2e3f40"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _table_exists(table_name: str) -> bool:
    return sa.inspect(op.get_bind()).has_table(table_name)


def _column_exists(table_name: str, column_name: str) -> bool:
    if not _table_exists(table_name):
        return False
    return column_name in {column["name"] for column in sa.inspect(op.get_bind()).get_columns(table_name)}


def _add_column_if_missing(table_name: str, column: sa.Column) -> None:
    if _table_exists(table_name) and not _column_exists(table_name, column.name):
        op.add_column(table_name, column)


def upgrade() -> None:
    _add_column_if_missing("sales_quotation_line_items", sa.Column("shipping_fee", sa.Numeric(10, 2), nullable=False, server_default="0"))
    _add_column_if_missing("sales_quotation_line_items", sa.Column("setup_fee", sa.Numeric(10, 2), nullable=False, server_default="0"))
    _add_column_if_missing("sales_quotation_line_items", sa.Column("condition", sa.String(), nullable=True))

    _add_column_if_missing("rentals", sa.Column("quantity", sa.Integer(), nullable=False, server_default="1"))
    _add_column_if_missing("rentals", sa.Column("shipping_fee", sa.Numeric(10, 2), nullable=False, server_default="0"))
    _add_column_if_missing("rentals", sa.Column("setup_fee", sa.Numeric(10, 2), nullable=False, server_default="0"))
    _add_column_if_missing("rentals", sa.Column("item_condition", sa.String(), nullable=True))


def downgrade() -> None:
    for table_name, column_name in [
        ("rentals", "item_condition"),
        ("rentals", "setup_fee"),
        ("rentals", "shipping_fee"),
        ("rentals", "quantity"),
        ("sales_quotation_line_items", "condition"),
        ("sales_quotation_line_items", "setup_fee"),
        ("sales_quotation_line_items", "shipping_fee"),
    ]:
        if _column_exists(table_name, column_name):
            op.drop_column(table_name, column_name)
