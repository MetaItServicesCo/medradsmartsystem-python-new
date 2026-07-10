"""inspection batch invoices

Revision ID: e1f2a3b4c5d6
Revises: d0e1f2a3b4c5
Create Date: 2026-07-10
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "e1f2a3b4c5d6"
down_revision: Union[str, Sequence[str], None] = "d0e1f2a3b4c5"
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


def _fk_exists(table_name: str, constraint_name: str) -> bool:
    if not _table_exists(table_name):
        return False
    return any(fk["name"] == constraint_name for fk in sa.inspect(op.get_bind()).get_foreign_keys(table_name))


def upgrade() -> None:
    if _table_exists("invoices") and not _column_exists("invoices", "inspection_batch_id"):
        op.add_column("invoices", sa.Column("inspection_batch_id", sa.Integer(), nullable=True))
    if _table_exists("invoices") and _column_exists("invoices", "inspection_batch_id"):
        op.execute(sa.text("CREATE INDEX IF NOT EXISTS ix_invoices_inspection_batch_id ON invoices (inspection_batch_id)"))
        if _table_exists("inspection_batches") and not _fk_exists("invoices", "fk_invoices_inspection_batch_id_inspection_batches"):
            op.create_foreign_key(
                "fk_invoices_inspection_batch_id_inspection_batches",
                "invoices",
                "inspection_batches",
                ["inspection_batch_id"],
                ["id"],
            )


def downgrade() -> None:
    if not _table_exists("invoices"):
        return
    if _fk_exists("invoices", "fk_invoices_inspection_batch_id_inspection_batches"):
        op.drop_constraint("fk_invoices_inspection_batch_id_inspection_batches", "invoices", type_="foreignkey")
    if _index_exists("invoices", "ix_invoices_inspection_batch_id"):
        op.drop_index("ix_invoices_inspection_batch_id", table_name="invoices")
    if _column_exists("invoices", "inspection_batch_id"):
        op.drop_column("invoices", "inspection_batch_id")
