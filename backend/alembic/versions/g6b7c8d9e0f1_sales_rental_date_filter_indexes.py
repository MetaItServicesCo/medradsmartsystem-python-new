"""add sales and rental date filter indexes

Revision ID: g6b7c8d9e0f1
Revises: f5a6b7c8d9e0
"""

from typing import Sequence, Union

from alembic import op


revision: str = "g6b7c8d9e0f1"
down_revision: Union[str, Sequence[str], None] = "f5a6b7c8d9e0"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


INDEXES: tuple[tuple[str, str, tuple[str, ...]], ...] = (
    (
        "ix_sales_quotations_status_requested_created",
        "sales_quotations",
        ("status", "requested_date", "created_at"),
    ),
    (
        "ix_rentals_status_start_created",
        "rentals",
        ("status", "start_date", "created_at"),
    ),
    (
        "ix_inventory_parts_type_status_inventory",
        "inventory_parts",
        ("part_type", "status", "inventory_date"),
    ),
    (
        "ix_invoices_type_issue",
        "invoices",
        ("invoice_type", "issue_date"),
    ),
)


def _quote(identifier: str) -> str:
    return f'"{identifier.replace(chr(34), chr(34) * 2)}"'


def upgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name != "postgresql":
        return

    with op.get_context().autocommit_block():
        for index_name, table_name, column_names in INDEXES:
            columns = ", ".join(_quote(column) for column in column_names)
            op.execute(
                f"CREATE INDEX CONCURRENTLY IF NOT EXISTS {_quote(index_name)} "
                f"ON {_quote(table_name)} ({columns})"
            )


def downgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name != "postgresql":
        return

    with op.get_context().autocommit_block():
        for index_name, _table_name, _column_names in reversed(INDEXES):
            op.execute(f"DROP INDEX CONCURRENTLY IF EXISTS {_quote(index_name)}")
