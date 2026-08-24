"""Add scalable compound and substring-search indexes.

Revision ID: g2d3e4f5a6b7
Revises: f1c2d3e4f5a6
"""

from alembic import op


revision = "g2d3e4f5a6b7"
down_revision = "f1c2d3e4f5a6"
branch_labels = None
depends_on = None


COMPOUND_INDEXES = (
    "CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_facilities_status_created ON facilities (status, created_at DESC)",
    "CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_facilities_parent_created ON facilities (parent_facility_id, created_at DESC)",
    "CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_users_facility_role_active_created ON users (facility_id, role, is_active, created_at DESC)",
    "CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_users_role_active_created ON users (role, is_active, created_at DESC)",
    "CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_equipment_facility_status_created ON equipment (facility_id, status, created_at DESC)",
    "CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_equipment_facility_created ON equipment (facility_id, created_at DESC)",
    "CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_service_requests_facility_status_created ON service_requests (facility_id, status, created_at DESC)",
    "CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_service_requests_technician_status_created ON service_requests (assigned_technician_id, status, created_at DESC)",
    "CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_service_requests_requester_created ON service_requests (requester_id, created_at DESC)",
    "CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_service_requests_status_created ON service_requests (status, created_at DESC)",
    "CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_inventory_parts_type_updated ON inventory_parts (part_type, updated_at DESC)",
    "CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_inventory_parts_facility_updated ON inventory_parts (facility_id, updated_at DESC)",
)

SEARCH_INDEXES = (
    "CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_facilities_name_trgm ON facilities USING gin (name gin_trgm_ops)",
    "CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_users_full_name_trgm ON users USING gin (full_name gin_trgm_ops)",
    "CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_equipment_asset_tag_trgm ON equipment USING gin (asset_tag gin_trgm_ops)",
    "CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_equipment_serial_number_trgm ON equipment USING gin (serial_number gin_trgm_ops)",
    "CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_service_requests_request_number_trgm ON service_requests USING gin (request_number gin_trgm_ops)",
    "CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_inventory_parts_part_number_trgm ON inventory_parts USING gin (part_number gin_trgm_ops)",
    "CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_invoices_invoice_number_trgm ON invoices USING gin (invoice_number gin_trgm_ops)",
    "CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_sales_quotations_number_trgm ON sales_quotations USING gin (quotation_number gin_trgm_ops)",
    "CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_sales_quotations_work_order_trgm ON sales_quotations USING gin (work_order gin_trgm_ops)",
    "CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_rentals_number_trgm ON rentals USING gin (rental_number gin_trgm_ops)",
)


def upgrade() -> None:
    # CONCURRENTLY avoids blocking normal list writes while production indexes
    # are built. Alembic must leave its transaction for these statements.
    with op.get_context().autocommit_block():
        op.execute("CREATE EXTENSION IF NOT EXISTS pg_trgm")
        op.execute("CREATE EXTENSION IF NOT EXISTS pg_stat_statements")
        for statement in (*COMPOUND_INDEXES, *SEARCH_INDEXES):
            op.execute(statement)


def downgrade() -> None:
    names = (
        "ix_rentals_number_trgm",
        "ix_sales_quotations_work_order_trgm",
        "ix_sales_quotations_number_trgm",
        "ix_invoices_invoice_number_trgm",
        "ix_inventory_parts_part_number_trgm",
        "ix_service_requests_request_number_trgm",
        "ix_equipment_serial_number_trgm",
        "ix_equipment_asset_tag_trgm",
        "ix_users_full_name_trgm",
        "ix_facilities_name_trgm",
        "ix_inventory_parts_facility_updated",
        "ix_inventory_parts_type_updated",
        "ix_service_requests_status_created",
        "ix_service_requests_requester_created",
        "ix_service_requests_technician_status_created",
        "ix_service_requests_facility_status_created",
        "ix_equipment_facility_created",
        "ix_equipment_facility_status_created",
        "ix_users_role_active_created",
        "ix_users_facility_role_active_created",
        "ix_facilities_parent_created",
        "ix_facilities_status_created",
    )
    with op.get_context().autocommit_block():
        for name in names:
            op.execute(f"DROP INDEX CONCURRENTLY IF EXISTS {name}")
