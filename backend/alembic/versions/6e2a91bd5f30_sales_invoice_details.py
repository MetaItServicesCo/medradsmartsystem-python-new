"""sales invoice details

Revision ID: 6e2a91bd5f30
Revises: 4c8d2e7f9012
Create Date: 2026-05-30 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "6e2a91bd5f30"
down_revision: Union[str, Sequence[str], None] = "4c8d2e7f9012"
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
    for column in [
        sa.Column("worked_hours", sa.Numeric(10, 2), nullable=False, server_default="0"),
        sa.Column("setup_fee", sa.Numeric(10, 2), nullable=False, server_default="0"),
        sa.Column("service_fee", sa.Numeric(10, 2), nullable=False, server_default="0"),
        sa.Column("shipping_fee", sa.Numeric(10, 2), nullable=False, server_default="0"),
        sa.Column("application_fee", sa.Numeric(10, 2), nullable=False, server_default="0"),
        sa.Column("tax_rate", sa.Numeric(10, 2), nullable=False, server_default="0"),
        sa.Column("payment_method", sa.String(), nullable=True),
    ]:
        _add_column_if_missing("sales_quotations", column)

    _add_column_if_missing("invoices", sa.Column("payment_method", sa.String(), nullable=True))


def downgrade() -> None:
    for table_name, columns in {
        "sales_quotations": [
            "payment_method",
            "tax_rate",
            "application_fee",
            "shipping_fee",
            "service_fee",
            "setup_fee",
            "worked_hours",
        ],
        "invoices": ["payment_method"],
    }.items():
        if _table_exists(table_name):
            for column_name in columns:
                if _column_exists(table_name, column_name):
                    op.drop_column(table_name, column_name)
