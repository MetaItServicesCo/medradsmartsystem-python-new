"""add indexed literal-substring search support for core lists

Revision ID: f5a6b7c8d9e0
Revises: e4f5a6b7c8d9
"""

from typing import Sequence, Union

from alembic import op


revision: str = "f5a6b7c8d9e0"
down_revision: Union[str, Sequence[str], None] = "e4f5a6b7c8d9"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


TRIGRAM_INDEXES: tuple[tuple[str, str, str], ...] = (
    ("ix_facilities_name_trgm", "facilities", "name"),
    ("ix_facilities_city_trgm", "facilities", "city"),
    ("ix_facilities_email_trgm", "facilities", "email"),
    ("ix_users_full_name_trgm", "users", "full_name"),
    ("ix_users_username_trgm", "users", "username"),
    ("ix_users_email_trgm", "users", "email"),
    ("ix_service_requests_number_trgm", "service_requests", "request_number"),
    ("ix_equipment_asset_tag_trgm", "equipment", "asset_tag"),
    ("ix_equipment_make_trgm", "equipment", "make"),
    ("ix_equipment_model_trgm", "equipment", "model"),
    ("ix_equipment_serial_trgm", "equipment", "serial_number"),
    ("ix_inspections_number_trgm", "inspections", "inspection_number"),
    ("ix_inspection_batches_number_trgm", "inspection_batches", "batch_number"),
    ("ix_inventory_parts_number_trgm", "inventory_parts", "part_number"),
    ("ix_inventory_parts_description_trgm", "inventory_parts", "description"),
    ("ix_inventory_parts_make_trgm", "inventory_parts", "make"),
    ("ix_inventory_parts_model_trgm", "inventory_parts", "model"),
    ("ix_inventory_parts_serial_trgm", "inventory_parts", "serial_number"),
    ("ix_sales_quotations_number_trgm", "sales_quotations", "quotation_number"),
    ("ix_sales_quotations_work_order_trgm", "sales_quotations", "work_order"),
    ("ix_rentals_number_trgm", "rentals", "rental_number"),
    ("ix_rentals_customer_name_trgm", "rentals", "customer_name"),
    ("ix_invoices_number_trgm", "invoices", "invoice_number"),
    ("ix_invoices_customer_name_trgm", "invoices", "customer_name"),
)

BTREE_INDEXES: tuple[tuple[str, str, str], ...] = (
    ("ix_user_facilities_facility_id", "user_facilities", "facility_id"),
    ("ix_user_facilities_user_id", "user_facilities", "user_id"),
    ("ix_equipment_facility_id", "equipment", "facility_id"),
    ("ix_inventory_parts_facility_id", "inventory_parts", "facility_id"),
    ("ix_service_requests_facility_id", "service_requests", "facility_id"),
    ("ix_service_requests_created_at", "service_requests", "created_at"),
    ("ix_sales_quotations_facility_id", "sales_quotations", "facility_id"),
    ("ix_rentals_part_id", "rentals", "part_id"),
)


def _quote(identifier: str) -> str:
    return f'"{identifier.replace(chr(34), chr(34) * 2)}"'


def upgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name != "postgresql":
        return

    op.execute("CREATE EXTENSION IF NOT EXISTS pg_trgm")
    # Production deployments must remain writable while these potentially
    # large indexes are built, so each index is created outside a transaction.
    with op.get_context().autocommit_block():
        for index_name, table_name, column_name in BTREE_INDEXES:
            op.execute(
                f"CREATE INDEX CONCURRENTLY IF NOT EXISTS {_quote(index_name)} "
                f"ON {_quote(table_name)} ({_quote(column_name)})"
            )
        for index_name, table_name, column_name in TRIGRAM_INDEXES:
            op.execute(
                f"CREATE INDEX CONCURRENTLY IF NOT EXISTS {_quote(index_name)} "
                f"ON {_quote(table_name)} USING gin "
                f"({_quote(column_name)} gin_trgm_ops)"
            )


def downgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name != "postgresql":
        return

    with op.get_context().autocommit_block():
        for index_name, _table_name, _column_name in reversed(TRIGRAM_INDEXES):
            op.execute(f"DROP INDEX CONCURRENTLY IF EXISTS {_quote(index_name)}")
        for index_name, _table_name, _column_name in reversed(BTREE_INDEXES):
            op.execute(f"DROP INDEX CONCURRENTLY IF EXISTS {_quote(index_name)}")
