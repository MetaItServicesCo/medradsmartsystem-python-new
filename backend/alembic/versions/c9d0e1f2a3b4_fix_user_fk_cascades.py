"""Fix FK cascade rules so users can be deleted without constraint errors

Revision ID: c9d0e1f2a3b4
Revises: b8c9d0e1f2a3
Create Date: 2026-06-26
"""
from alembic import op
from sqlalchemy import text

revision = "c9d0e1f2a3b4"
down_revision = "b8c9d0e1f2a3"
branch_labels = None
depends_on = None

# (table, column, ref_table, ref_col, on_delete, make_nullable)
FK_FIXES = [
    ("audit_logs",                  "changed_by_id",         "users", "id", "SET NULL", False),
    ("calendar_events",             "user_id",                "users", "id", "CASCADE",  False),
    ("inspection_batches",          "inspector_id",           "users", "id", "SET NULL", False),
    ("inspections",                 "inspector_id",           "users", "id", "SET NULL", False),
    ("inventory_transactions",      "created_by_id",          "users", "id", "SET NULL", True),
    ("invoices",                    "created_by_id",          "users", "id", "SET NULL", False),
    ("notifications",               "actor_id",               "users", "id", "SET NULL", False),
    ("rentals",                     "created_by_id",          "users", "id", "SET NULL", False),
    ("sales_quotations",            "created_by_id",          "users", "id", "SET NULL", True),
    ("service_request_quotations",  "created_by_id",          "users", "id", "SET NULL", True),
    ("service_requests",            "requester_id",           "users", "id", "SET NULL", True),
    ("service_requests",            "assigned_technician_id", "users", "id", "SET NULL", False),
]


def upgrade():
    bind = op.get_bind()

    for table, col, ref_table, ref_col, on_delete, make_nullable in FK_FIXES:
        # 1. Find all existing FK constraints for this column (raw SQL, never fails)
        result = bind.execute(text("""
            SELECT tc.constraint_name
            FROM information_schema.table_constraints  tc
            JOIN information_schema.key_column_usage   kcu
              ON tc.constraint_name = kcu.constraint_name
             AND tc.table_schema    = kcu.table_schema
            WHERE tc.table_schema    = 'public'
              AND tc.table_name      = :t
              AND kcu.column_name    = :c
              AND tc.constraint_type = 'FOREIGN KEY'
        """), {"t": table, "c": col})
        names = [row[0] for row in result]

        # 2. Drop every discovered constraint with IF EXISTS (never throws)
        for name in names:
            bind.execute(text(
                f'ALTER TABLE "{table}" DROP CONSTRAINT IF EXISTS "{name}"'
            ))

        # 3. Make the column nullable if required (safe to run even if already nullable)
        if make_nullable:
            bind.execute(text(
                f'ALTER TABLE "{table}" ALTER COLUMN "{col}" DROP NOT NULL'
            ))

        # 4. Add new FK with the desired ON DELETE rule
        new_name = f"{table}_{col}_fkey"
        bind.execute(text(
            f'ALTER TABLE "{table}" ADD CONSTRAINT "{new_name}" '
            f'FOREIGN KEY ("{col}") REFERENCES "{ref_table}"("{ref_col}") ON DELETE {on_delete}'
        ))


def downgrade():
    pass  # Cascade changes are not reversed
