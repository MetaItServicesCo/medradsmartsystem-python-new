"""service request intake fields and history

Revision ID: d3f2a1c9e8b4
Revises: c6e7a4f9b2d1
Create Date: 2026-05-13 04:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "d3f2a1c9e8b4"
down_revision: Union[str, Sequence[str], None] = "c6e7a4f9b2d1"
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
    if not _table_exists("service_requests"):
        return

    _add_column_if_missing("service_requests", sa.Column("service_required", sa.Text(), nullable=True))
    _add_column_if_missing("service_requests", sa.Column("preferred_datetime", sa.DateTime(), nullable=True))
    _add_column_if_missing("service_requests", sa.Column("requested_by_name", sa.String(), nullable=True))
    _add_column_if_missing("service_requests", sa.Column("reference_number", sa.String(), nullable=True))
    _add_column_if_missing("service_requests", sa.Column("request_image_url", sa.Text(), nullable=True))
    _add_column_if_missing("service_requests", sa.Column("history", sa.JSON(), nullable=True))


def downgrade() -> None:
    if not _table_exists("service_requests"):
        return
    for column_name in [
        "history",
        "request_image_url",
        "reference_number",
        "requested_by_name",
        "preferred_datetime",
        "service_required",
    ]:
        if _column_exists("service_requests", column_name):
            op.drop_column("service_requests", column_name)
