"""Bulk invoices

Revision ID: b2c7e4a9f1d3
Revises: a3c8e1f5b7d2
Create Date: 2026-11-24

Several invoices, of one or more facilities, sent and paid as one. The bulk
invoice has its own number (INV-BULK-000001), link and payment record; an
invoice in it is paid through it. Adds:

- bulk_invoices and bulk_invoice_payments;
- invoices.bulk_invoice_id: the bulk invoice an invoice is paid through;
- payment_proofs.bulk_invoice_id: an ACH, MBMTS ACH or cheque payment reported
  for a whole bulk invoice, checked in the same review queue (a proof still
  has exactly one target);
- payment_operations.bulk_invoice_id: a bulk invoice's card charge, with the
  same one-at-a-time guard an invoice's card charge has.

Nothing that exists changes: every column is new and empty, and every existing
proof keeps its one target.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "b2c7e4a9f1d3"
down_revision: Union[str, Sequence[str], None] = "a3c8e1f5b7d2"
branch_labels = None
depends_on = None

PROOF_TARGET = "ck_payment_proof_single_target"
PROOF_TARGET_BEFORE = (
    "(invoice_id IS NOT NULL AND service_quotation_id IS NULL) OR "
    "(invoice_id IS NULL AND service_quotation_id IS NOT NULL)"
)
PROOF_TARGET_AFTER = (
    "(invoice_id IS NOT NULL AND service_quotation_id IS NULL AND bulk_invoice_id IS NULL) OR "
    "(invoice_id IS NULL AND service_quotation_id IS NOT NULL AND bulk_invoice_id IS NULL) OR "
    "(invoice_id IS NULL AND service_quotation_id IS NULL AND bulk_invoice_id IS NOT NULL)"
)
ACTIVE_BULK_OPERATION = "uq_payment_operations_active_bulk_invoice"
ACTIVE_WHERE = "bulk_invoice_id IS NOT NULL AND status IN ('processing', 'unknown')"


def _tables() -> set[str]:
    return set(sa.inspect(op.get_bind()).get_table_names())


def _columns(table: str) -> set[str]:
    return {item["name"] for item in sa.inspect(op.get_bind()).get_columns(table)}


def _indexes(table: str) -> set[str]:
    return {item["name"] for item in sa.inspect(op.get_bind()).get_indexes(table)}


def upgrade() -> None:
    tables = _tables()
    if "bulk_invoices" not in tables:
        op.create_table(
            "bulk_invoices",
            sa.Column("id", sa.Integer(), nullable=False),
            sa.Column("bulk_number", sa.String(length=40), nullable=False),
            sa.Column("status", sa.String(length=24), nullable=False, server_default="draft"),
            sa.Column("bill_to_facility_id", sa.Integer(), nullable=True),
            sa.Column("bill_to_name", sa.String(length=200), nullable=False),
            sa.Column("bill_to_email", sa.String(length=320), nullable=True),
            sa.Column("bill_to_address", sa.Text(), nullable=True),
            sa.Column("note", sa.Text(), nullable=True),
            sa.Column("total_amount", sa.Numeric(12, 2), nullable=False, server_default="0"),
            sa.Column("amount_paid", sa.Numeric(12, 2), nullable=False, server_default="0"),
            sa.Column("card_fee_amount", sa.Numeric(12, 2), nullable=False, server_default="0"),
            sa.Column("settled_amounts", sa.JSON(), nullable=True),
            sa.Column("settlement_error", sa.Text(), nullable=True),
            sa.Column("public_link_nonce", sa.String(length=64), nullable=True),
            sa.Column("public_link_hash", sa.String(length=64), nullable=True),
            sa.Column("public_link_expires_at", sa.DateTime(), nullable=True),
            sa.Column("public_link_sent_at", sa.DateTime(), nullable=True),
            sa.Column("public_link_email", sa.String(length=320), nullable=True),
            sa.Column("issue_date", sa.Date(), nullable=True),
            sa.Column("created_by_id", sa.Integer(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.Column("updated_at", sa.DateTime(), nullable=False),
            sa.Column("paid_at", sa.DateTime(), nullable=True),
            sa.Column("cancelled_at", sa.DateTime(), nullable=True),
            sa.ForeignKeyConstraint(["bill_to_facility_id"], ["facilities.id"], ondelete="SET NULL"),
            sa.ForeignKeyConstraint(["created_by_id"], ["users.id"], ondelete="SET NULL"),
            sa.PrimaryKeyConstraint("id"),
        )
        op.create_index("ix_bulk_invoices_id", "bulk_invoices", ["id"])
        op.create_index("ix_bulk_invoices_bulk_number", "bulk_invoices", ["bulk_number"], unique=True)
        op.create_index("ix_bulk_invoices_status", "bulk_invoices", ["status"])
        op.create_index("ix_bulk_invoices_bill_to_facility_id", "bulk_invoices", ["bill_to_facility_id"])
        op.create_index("ix_bulk_invoices_public_link_hash", "bulk_invoices", ["public_link_hash"], unique=True)

    if "bulk_invoice_payments" not in tables:
        op.create_table(
            "bulk_invoice_payments",
            sa.Column("id", sa.Integer(), nullable=False),
            sa.Column("bulk_invoice_id", sa.Integer(), nullable=False),
            sa.Column("amount", sa.Numeric(12, 2), nullable=False),
            sa.Column("card_fee_amount", sa.Numeric(12, 2), nullable=False, server_default="0"),
            sa.Column("payment_method", sa.String(length=40), nullable=False),
            sa.Column("reference_number", sa.String(length=255), nullable=True),
            sa.Column("payer_name", sa.String(length=200), nullable=True),
            sa.Column("notes", sa.Text(), nullable=True),
            sa.Column("card_brand", sa.String(length=40), nullable=True),
            sa.Column("card_last4", sa.String(length=4), nullable=True),
            sa.Column("payment_proof_id", sa.Integer(), nullable=True),
            sa.Column("created_by_id", sa.Integer(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.ForeignKeyConstraint(["bulk_invoice_id"], ["bulk_invoices.id"], ondelete="CASCADE"),
            sa.ForeignKeyConstraint(["payment_proof_id"], ["payment_proofs.id"], ondelete="SET NULL"),
            sa.ForeignKeyConstraint(["created_by_id"], ["users.id"], ondelete="SET NULL"),
            sa.PrimaryKeyConstraint("id"),
        )
        op.create_index("ix_bulk_invoice_payments_id", "bulk_invoice_payments", ["id"])
        op.create_index("ix_bulk_invoice_payments_bulk_invoice_id", "bulk_invoice_payments", ["bulk_invoice_id"])
        op.create_index("ix_bulk_invoice_payments_reference_number", "bulk_invoice_payments", ["reference_number"])
        op.create_index("ix_bulk_invoice_payments_created_at", "bulk_invoice_payments", ["created_at"])

    if "bulk_invoice_id" not in _columns("invoices"):
        op.add_column("invoices", sa.Column("bulk_invoice_id", sa.Integer(), nullable=True))
        op.create_foreign_key(
            "fk_invoices_bulk_invoice_id", "invoices", "bulk_invoices",
            ["bulk_invoice_id"], ["id"], ondelete="SET NULL",
        )
        op.create_index("ix_invoices_bulk_invoice_id", "invoices", ["bulk_invoice_id"])

    if "bulk_invoice_id" not in _columns("payment_proofs"):
        op.add_column("payment_proofs", sa.Column("bulk_invoice_id", sa.Integer(), nullable=True))
        op.create_foreign_key(
            "fk_payment_proofs_bulk_invoice_id", "payment_proofs", "bulk_invoices",
            ["bulk_invoice_id"], ["id"], ondelete="CASCADE",
        )
        op.create_index("ix_payment_proofs_bulk_invoice_id", "payment_proofs", ["bulk_invoice_id"])
        # Still exactly one target: an invoice, a service quotation, or a bulk invoice.
        with op.batch_alter_table("payment_proofs") as batch:
            batch.drop_constraint(PROOF_TARGET, type_="check")
            batch.create_check_constraint(PROOF_TARGET, PROOF_TARGET_AFTER)

    if "bulk_invoice_id" not in _columns("payment_operations"):
        op.add_column("payment_operations", sa.Column("bulk_invoice_id", sa.Integer(), nullable=True))
        op.create_foreign_key(
            "fk_payment_operations_bulk_invoice_id", "payment_operations", "bulk_invoices",
            ["bulk_invoice_id"], ["id"], ondelete="CASCADE",
        )
        op.create_index("ix_payment_operations_bulk_invoice_id", "payment_operations", ["bulk_invoice_id"])
    if ACTIVE_BULK_OPERATION not in _indexes("payment_operations"):
        # One card charge of a bulk invoice at a time, as for an invoice.
        op.create_index(
            ACTIVE_BULK_OPERATION, "payment_operations", ["bulk_invoice_id"], unique=True,
            postgresql_where=sa.text(ACTIVE_WHERE), sqlite_where=sa.text(ACTIVE_WHERE),
        )


def downgrade() -> None:
    bind = op.get_bind()
    if "bulk_invoices" in _tables():
        count = bind.execute(sa.text("SELECT COUNT(*) FROM bulk_invoices")).scalar()
        if count:
            raise RuntimeError(
                f"{count} bulk invoice(s) exist; their records and payments would be lost. Not downgrading."
            )
    if ACTIVE_BULK_OPERATION in _indexes("payment_operations"):
        op.drop_index(ACTIVE_BULK_OPERATION, table_name="payment_operations")
    if "bulk_invoice_id" in _columns("payment_operations"):
        op.drop_index("ix_payment_operations_bulk_invoice_id", table_name="payment_operations")
        op.drop_constraint("fk_payment_operations_bulk_invoice_id", "payment_operations", type_="foreignkey")
        op.drop_column("payment_operations", "bulk_invoice_id")
    if "bulk_invoice_id" in _columns("payment_proofs"):
        with op.batch_alter_table("payment_proofs") as batch:
            batch.drop_constraint(PROOF_TARGET, type_="check")
            batch.create_check_constraint(PROOF_TARGET, PROOF_TARGET_BEFORE)
        op.drop_index("ix_payment_proofs_bulk_invoice_id", table_name="payment_proofs")
        op.drop_constraint("fk_payment_proofs_bulk_invoice_id", "payment_proofs", type_="foreignkey")
        op.drop_column("payment_proofs", "bulk_invoice_id")
    if "bulk_invoice_id" in _columns("invoices"):
        op.drop_index("ix_invoices_bulk_invoice_id", table_name="invoices")
        op.drop_constraint("fk_invoices_bulk_invoice_id", "invoices", type_="foreignkey")
        op.drop_column("invoices", "bulk_invoice_id")
    tables = _tables()
    if "bulk_invoice_payments" in tables:
        op.drop_table("bulk_invoice_payments")
    if "bulk_invoices" in tables:
        op.drop_table("bulk_invoices")
