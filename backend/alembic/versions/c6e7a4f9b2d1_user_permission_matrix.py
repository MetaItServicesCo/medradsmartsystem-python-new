"""user permission matrix

Revision ID: c6e7a4f9b2d1
Revises: b75d2c0e4c91
Create Date: 2026-05-13 03:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "c6e7a4f9b2d1"
down_revision: Union[str, Sequence[str], None] = "b75d2c0e4c91"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _table_exists(table_name: str) -> bool:
    return sa.inspect(op.get_bind()).has_table(table_name)


def _column_exists(table_name: str, column_name: str) -> bool:
    if not _table_exists(table_name):
        return False
    return any(column["name"] == column_name for column in sa.inspect(op.get_bind()).get_columns(table_name))


def upgrade() -> None:
    if _table_exists("users") and not _column_exists("users", "permissions"):
        op.add_column("users", sa.Column("permissions", sa.JSON(), nullable=True))


def downgrade() -> None:
    if _table_exists("users") and _column_exists("users", "permissions"):
        op.drop_column("users", "permissions")
