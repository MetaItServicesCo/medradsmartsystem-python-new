"""add inspection and billing list performance indexes

Revision ID: e4f5a6b7c8d9
Revises: e3f4a5b6c7d8
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "e4f5a6b7c8d9"
down_revision: Union[str, Sequence[str], None] = "e3f4a5b6c7d8"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


INDEXES: tuple[tuple[str, str, tuple[str, ...]], ...] = (
    (
        "ix_inspections_facility_status_created",
        "inspections",
        ("facility_id", "status", "created_at"),
    ),
    (
        "ix_inspections_status_scheduled_created",
        "inspections",
        ("status", "scheduled_date", "created_at"),
    ),
    (
        "ix_inspections_inspector_status_created",
        "inspections",
        ("inspector_id", "status", "created_at"),
    ),
    (
        "ix_inspection_batches_facility_status_created",
        "inspection_batches",
        ("facility_id", "status", "created_at"),
    ),
    (
        "ix_inspection_batches_status_scheduled_created",
        "inspection_batches",
        ("status", "scheduled_date", "created_at"),
    ),
    (
        "ix_invoices_type_created",
        "invoices",
        ("invoice_type", "created_at"),
    ),
    (
        "ix_invoices_facility_type_created",
        "invoices",
        ("facility_id", "invoice_type", "created_at"),
    ),
    (
        "ix_invoices_type_approval_created",
        "invoices",
        ("invoice_type", "billing_approval_status", "created_at"),
    ),
    (
        "ix_invoices_type_status_created",
        "invoices",
        ("invoice_type", "status", "created_at"),
    ),
)


def _existing_indexes(table_name: str) -> set[str]:
    inspector = sa.inspect(op.get_bind())
    if not inspector.has_table(table_name):
        return set()
    return {str(index["name"]) for index in inspector.get_indexes(table_name)}


def upgrade() -> None:
    indexes_by_table: dict[str, set[str]] = {}
    for index_name, table_name, columns in INDEXES:
        existing = indexes_by_table.setdefault(table_name, _existing_indexes(table_name))
        if index_name not in existing:
            op.create_index(index_name, table_name, list(columns), unique=False)
            existing.add(index_name)


def downgrade() -> None:
    indexes_by_table: dict[str, set[str]] = {}
    for index_name, table_name, _columns in reversed(INDEXES):
        existing = indexes_by_table.setdefault(table_name, _existing_indexes(table_name))
        if index_name in existing:
            op.drop_index(index_name, table_name=table_name)
            existing.remove(index_name)
