"""Fix FK cascade rules so users can be deleted without constraint errors

Revision ID: c9d0e1f2a3b4
Revises: b8c9d0e1f2a3
Create Date: 2026-06-26
"""
from alembic import op
import sqlalchemy as sa

revision = "c9d0e1f2a3b4"
down_revision = "b8c9d0e1f2a3"
branch_labels = None
depends_on = None


def _fk_exists(table: str, constraint: str) -> bool:
    from sqlalchemy import inspect, text
    bind = op.get_bind()
    result = bind.execute(text(
        "SELECT 1 FROM information_schema.table_constraints "
        "WHERE table_name = :t AND constraint_name = :c AND constraint_type = 'FOREIGN KEY'"
    ), {"t": table, "c": constraint})
    return result.fetchone() is not None


def _col_nullable(table: str, col: str) -> bool:
    from sqlalchemy import text
    bind = op.get_bind()
    result = bind.execute(text(
        "SELECT is_nullable FROM information_schema.columns "
        "WHERE table_name = :t AND column_name = :c"
    ), {"t": table, "c": col})
    row = result.fetchone()
    return row and row[0] == 'YES'


def _recreate_fk(table: str, col: str, ref: str, on_delete: str, old_name: str = None):
    """Drop old FK (if it exists) and create a new one with the desired on_delete rule."""
    from sqlalchemy import text
    bind = op.get_bind()

    # Find the constraint name if not provided
    if old_name:
        names = [old_name]
    else:
        # PostgreSQL auto-names FKs as tablename_colname_fkey
        names = [f"{table}_{col}_fkey"]

    for name in names:
        try:
            op.drop_constraint(name, table, type_="foreignkey")
        except Exception:
            pass  # already gone or named differently

    # Also try dropping by querying information_schema
    result = bind.execute(text(
        "SELECT tc.constraint_name FROM information_schema.table_constraints tc "
        "JOIN information_schema.key_column_usage kcu "
        "  ON tc.constraint_name = kcu.constraint_name AND tc.table_name = kcu.table_name "
        "WHERE tc.table_name = :t AND kcu.column_name = :c AND tc.constraint_type = 'FOREIGN KEY'"
    ), {"t": table, "c": col})
    for row in result:
        try:
            op.drop_constraint(row[0], table, type_="foreignkey")
        except Exception:
            pass

    ref_table, ref_col = ref.split(".")
    op.create_foreign_key(
        f"{table}_{col}_fkey_cascade",
        table, ref_table,
        [col], [ref_col],
        ondelete=on_delete,
    )


def upgrade():
    bind = op.get_bind()

    # ── audit_logs.changed_by_id → SET NULL ──────────────────────────────────
    _recreate_fk("audit_logs", "changed_by_id", "users.id", "SET NULL")

    # ── calendar_events.user_id → CASCADE ────────────────────────────────────
    _recreate_fk("calendar_events", "user_id", "users.id", "CASCADE")

    # ── inspection_batches.inspector_id → SET NULL ───────────────────────────
    _recreate_fk("inspection_batches", "inspector_id", "users.id", "SET NULL")

    # ── inspections.inspector_id → SET NULL ──────────────────────────────────
    _recreate_fk("inspections", "inspector_id", "users.id", "SET NULL")

    # ── inventory_transactions.created_by_id → SET NULL ──────────────────────
    # Must make nullable first
    if not _col_nullable("inventory_transactions", "created_by_id"):
        op.alter_column("inventory_transactions", "created_by_id", nullable=True)
    _recreate_fk("inventory_transactions", "created_by_id", "users.id", "SET NULL")

    # ── invoices.created_by_id → SET NULL ────────────────────────────────────
    _recreate_fk("invoices", "created_by_id", "users.id", "SET NULL")

    # ── notifications.actor_id → SET NULL ────────────────────────────────────
    _recreate_fk("notifications", "actor_id", "users.id", "SET NULL")

    # ── rentals.created_by_id → SET NULL ─────────────────────────────────────
    _recreate_fk("rentals", "created_by_id", "users.id", "SET NULL")

    # ── sales_quotations.created_by_id → SET NULL ────────────────────────────
    if not _col_nullable("sales_quotations", "created_by_id"):
        op.alter_column("sales_quotations", "created_by_id", nullable=True)
    _recreate_fk("sales_quotations", "created_by_id", "users.id", "SET NULL")

    # ── service_request_quotations.created_by_id → SET NULL ──────────────────
    if not _col_nullable("service_request_quotations", "created_by_id"):
        op.alter_column("service_request_quotations", "created_by_id", nullable=True)
    _recreate_fk("service_request_quotations", "created_by_id", "users.id", "SET NULL")

    # ── service_requests.requester_id → SET NULL ─────────────────────────────
    if not _col_nullable("service_requests", "requester_id"):
        op.alter_column("service_requests", "requester_id", nullable=True)
    _recreate_fk("service_requests", "requester_id", "users.id", "SET NULL")

    # ── service_requests.assigned_technician_id → SET NULL ───────────────────
    _recreate_fk("service_requests", "assigned_technician_id", "users.id", "SET NULL")


def downgrade():
    pass  # Not reversing cascade changes — too disruptive
