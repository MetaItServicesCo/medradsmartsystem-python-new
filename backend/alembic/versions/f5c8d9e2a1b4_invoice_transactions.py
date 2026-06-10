"""invoice transactions

Revision ID: f5c8d9e2a1b4
Revises: e2f1a9b8c7d6
Create Date: 2026-06-10
"""

from alembic import op
import sqlalchemy as sa


revision = "f5c8d9e2a1b4"
down_revision = "e2f1a9b8c7d6"
branch_labels = None
depends_on = None


def _table_exists(bind, table_name: str) -> bool:
    inspector = sa.inspect(bind)
    return table_name in inspector.get_table_names()


def _index_exists(bind, table_name: str, index_name: str) -> bool:
    inspector = sa.inspect(bind)
    return any(index.get("name") == index_name for index in inspector.get_indexes(table_name))


def upgrade() -> None:
    bind = op.get_bind()
    if not _table_exists(bind, "invoice_transactions"):
        op.create_table(
            "invoice_transactions",
            sa.Column("id", sa.Integer(), nullable=False),
            sa.Column("invoice_id", sa.Integer(), nullable=False),
            sa.Column("facility_id", sa.Integer(), nullable=True),
            sa.Column("transaction_type", sa.String(), nullable=False),
            sa.Column("amount", sa.Numeric(10, 2), nullable=True),
            sa.Column("payment_method", sa.String(), nullable=True),
            sa.Column("reference_number", sa.String(), nullable=True),
            sa.Column("description", sa.Text(), nullable=True),
            sa.Column("created_by_id", sa.Integer(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=True),
            sa.ForeignKeyConstraint(["created_by_id"], ["users.id"]),
            sa.ForeignKeyConstraint(["facility_id"], ["facilities.id"]),
            sa.ForeignKeyConstraint(["invoice_id"], ["invoices.id"], ondelete="CASCADE"),
            sa.PrimaryKeyConstraint("id"),
        )

    for index_name, columns in [
        ("ix_invoice_transactions_id", ["id"]),
        ("ix_invoice_transactions_invoice_id", ["invoice_id"]),
        ("ix_invoice_transactions_facility_id", ["facility_id"]),
        ("ix_invoice_transactions_transaction_type", ["transaction_type"]),
        ("ix_invoice_transactions_reference_number", ["reference_number"]),
        ("ix_invoice_transactions_created_at", ["created_at"]),
    ]:
        if not _index_exists(bind, "invoice_transactions", index_name):
            op.create_index(index_name, "invoice_transactions", columns, unique=False)


def downgrade() -> None:
    bind = op.get_bind()
    if _table_exists(bind, "invoice_transactions"):
        for index_name in [
            "ix_invoice_transactions_created_at",
            "ix_invoice_transactions_reference_number",
            "ix_invoice_transactions_transaction_type",
            "ix_invoice_transactions_facility_id",
            "ix_invoice_transactions_invoice_id",
            "ix_invoice_transactions_id",
        ]:
            if _index_exists(bind, "invoice_transactions", index_name):
                op.drop_index(index_name, table_name="invoice_transactions")
        op.drop_table("invoice_transactions")
