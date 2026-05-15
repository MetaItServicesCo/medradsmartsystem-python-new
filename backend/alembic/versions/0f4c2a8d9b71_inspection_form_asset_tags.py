"""inspection form asset tags

Revision ID: 0f4c2a8d9b71
Revises: f1a2b3c4d5e6
Create Date: 2026-05-15 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0f4c2a8d9b71"
down_revision: Union[str, Sequence[str], None] = "f1a2b3c4d5e6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _table_exists(table_name: str) -> bool:
    return sa.inspect(op.get_bind()).has_table(table_name)


def _column_exists(table_name: str, column_name: str) -> bool:
    if not _table_exists(table_name):
        return False
    return any(column["name"] == column_name for column in sa.inspect(op.get_bind()).get_columns(table_name))


def _index_exists(table_name: str, index_name: str) -> bool:
    if not _table_exists(table_name):
        return False
    return any(index["name"] == index_name for index in sa.inspect(op.get_bind()).get_indexes(table_name))


def upgrade() -> None:
    if _table_exists("inspection_forms") and not _column_exists("inspection_forms", "modality_id"):
        op.add_column(
            "inspection_forms",
            sa.Column("modality_id", sa.Integer(), sa.ForeignKey("modalities.id"), nullable=True),
        )

    if _table_exists("inspection_forms") and not _index_exists("inspection_forms", "ix_inspection_forms_modality_id"):
        op.create_index("ix_inspection_forms_modality_id", "inspection_forms", ["modality_id"], unique=False)


def downgrade() -> None:
    if _table_exists("inspection_forms") and _index_exists("inspection_forms", "ix_inspection_forms_modality_id"):
        op.drop_index("ix_inspection_forms_modality_id", table_name="inspection_forms")
    if _table_exists("inspection_forms") and _column_exists("inspection_forms", "modality_id"):
        op.drop_column("inspection_forms", "modality_id")
