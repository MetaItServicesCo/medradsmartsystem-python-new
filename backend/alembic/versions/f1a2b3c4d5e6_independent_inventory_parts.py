"""independent inventory parts

Revision ID: f1a2b3c4d5e6
Revises: e8f4c2d7a9b1
Create Date: 2026-05-13 06:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "f1a2b3c4d5e6"
down_revision: Union[str, Sequence[str], None] = "e8f4c2d7a9b1"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _table_exists(table_name: str) -> bool:
    return sa.inspect(op.get_bind()).has_table(table_name)


def _column_exists(table_name: str, column_name: str) -> bool:
    if not _table_exists(table_name):
        return False
    return any(column["name"] == column_name for column in sa.inspect(op.get_bind()).get_columns(table_name))


def upgrade() -> None:
    if _table_exists("inventory_parts") and _column_exists("inventory_parts", "facility_id"):
        op.alter_column("inventory_parts", "facility_id", existing_type=sa.Integer(), nullable=True)
    if _table_exists("inventory_transactions") and _column_exists("inventory_transactions", "facility_id"):
        op.alter_column("inventory_transactions", "facility_id", existing_type=sa.Integer(), nullable=True)


def downgrade() -> None:
    # Existing deployments may now contain independent parts, so keep downgrade non-destructive.
    pass
