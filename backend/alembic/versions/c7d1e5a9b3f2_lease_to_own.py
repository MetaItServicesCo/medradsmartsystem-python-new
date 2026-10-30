"""Lease-to-own agreements, their installments, and card consent evidence

Revision ID: c7d1e5a9b3f2
Revises: o0a1b2c3d4e5
Create Date: 2026-10-30

Purely additive: three new tables, and no change to any existing one.
Installment invoices are ordinary Sales invoices and point back from the
lease side, so the invoices table is not altered.

Created idempotently, as o0a1b2c3d4e5 is, because this database has at times
been built with create_all() and stamped rather than migrated through, and a
table can already exist at the revision that claims to create it.

Statuses are strings validated in code rather than database enums, so adding
a state later never needs an ALTER TYPE on a live table.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "c7d1e5a9b3f2"
down_revision: Union[str, Sequence[str], None] = "o0a1b2c3d4e5"
branch_labels = None
depends_on = None


def _tables() -> set[str]:
    return set(sa.inspect(op.get_bind()).get_table_names())


def upgrade() -> None:
    existing = _tables()

    if "lease_agreements" not in existing:
        op.create_table(
            "lease_agreements",
            sa.Column("id", sa.Integer(), nullable=False),
            sa.Column("agreement_number", sa.String(length=40), nullable=False),
            sa.Column("status", sa.String(length=20), nullable=False, server_default="draft"),
            sa.Column("revision", sa.Integer(), nullable=False, server_default="1"),
            sa.Column("facility_id", sa.Integer(), nullable=True),
            sa.Column("customer_user_id", sa.Integer(), nullable=True),
            sa.Column("customer_name", sa.String(), nullable=False),
            sa.Column("customer_email", sa.String(), nullable=False),
            sa.Column("customer_phone", sa.String(), nullable=True),
            sa.Column("customer_address", sa.Text(), nullable=True),
            sa.Column("part_id", sa.Integer(), nullable=True),
            sa.Column("quantity", sa.Integer(), nullable=False, server_default="1"),
            sa.Column("item_part_number", sa.String(), nullable=True),
            sa.Column("item_description", sa.Text(), nullable=False),
            sa.Column("unit_cash_price", sa.Numeric(12, 2), nullable=False),
            sa.Column("cash_price", sa.Numeric(12, 2), nullable=False),
            sa.Column("markup_percent", sa.Numeric(6, 2), nullable=False, server_default="0"),
            sa.Column("markup_amount", sa.Numeric(12, 2), nullable=False, server_default="0"),
            sa.Column("lease_price", sa.Numeric(12, 2), nullable=False),
            sa.Column("down_payment", sa.Numeric(12, 2), nullable=False, server_default="0"),
            sa.Column("down_payment_tax", sa.Numeric(12, 2), nullable=False, server_default="0"),
            sa.Column("tax_rate_percent", sa.Numeric(5, 2), nullable=False),
            sa.Column("installment_count", sa.Integer(), nullable=False),
            sa.Column("frequency", sa.String(length=20), nullable=False, server_default="monthly"),
            sa.Column("first_due_date", sa.Date(), nullable=False),
            sa.Column("regular_installment", sa.Numeric(12, 2), nullable=False),
            sa.Column("total_tax", sa.Numeric(12, 2), nullable=False),
            sa.Column("total_of_payments", sa.Numeric(12, 2), nullable=False),
            sa.Column("terms_snapshot", sa.JSON(), nullable=True),
            sa.Column("grace_days", sa.Integer(), nullable=False, server_default="5"),
            sa.Column("late_fee_amount", sa.Numeric(10, 2), nullable=False, server_default="0"),
            sa.Column("default_after_missed", sa.Integer(), nullable=False, server_default="3"),
            sa.Column("invoice_lead_days", sa.Integer(), nullable=False, server_default="7"),
            sa.Column("access_token_hash", sa.String(length=64), nullable=True),
            sa.Column("token_expires_at", sa.DateTime(), nullable=True),
            sa.Column("sent_at", sa.DateTime(), nullable=True),
            sa.Column("signed_at", sa.DateTime(), nullable=True),
            sa.Column("signed_by_name", sa.String(length=200), nullable=True),
            sa.Column("signed_terms_revision", sa.Integer(), nullable=True),
            sa.Column("signature_ip", sa.String(length=120), nullable=True),
            sa.Column("signature_user_agent", sa.Text(), nullable=True),
            sa.Column("down_payment_invoice_id", sa.Integer(), nullable=True),
            sa.Column("activated_at", sa.DateTime(), nullable=True),
            sa.Column("stock_committed", sa.Boolean(), nullable=False, server_default=sa.false()),
            sa.Column("stock_committed_at", sa.DateTime(), nullable=True),
            sa.Column("auto_charge", sa.Boolean(), nullable=False, server_default=sa.false()),
            sa.Column("square_customer_id", sa.Text(), nullable=True),
            sa.Column("square_card_id", sa.Text(), nullable=True),
            sa.Column("square_card_brand", sa.String(length=40), nullable=True),
            sa.Column("square_card_last4", sa.String(length=4), nullable=True),
            sa.Column("square_card_exp_month", sa.Integer(), nullable=True),
            sa.Column("square_card_exp_year", sa.Integer(), nullable=True),
            sa.Column("auto_charge_authorized_at", sa.DateTime(), nullable=True),
            sa.Column("card_cleanup_pending", sa.Boolean(), nullable=False, server_default=sa.false()),
            sa.Column("card_cleanup_reference", sa.Text(), nullable=True),
            sa.Column("failed_charge_count", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("buyout_invoice_id", sa.Integer(), nullable=True),
            sa.Column("buyout_quoted_total", sa.Numeric(12, 2), nullable=True),
            sa.Column("buyout_requested_at", sa.DateTime(), nullable=True),
            sa.Column("overpayment_amount", sa.Numeric(12, 2), nullable=False, server_default="0"),
            sa.Column("defaulted_at", sa.DateTime(), nullable=True),
            sa.Column("completed_at", sa.DateTime(), nullable=True),
            sa.Column("completion_method", sa.String(length=20), nullable=True),
            sa.Column("cancelled_at", sa.DateTime(), nullable=True),
            sa.Column("cancellation_reason", sa.Text(), nullable=True),
            sa.Column("stock_returned", sa.Boolean(), nullable=False, server_default=sa.false()),
            sa.Column("notes", sa.Text(), nullable=True),
            sa.Column("history", sa.JSON(), nullable=True),
            sa.Column("created_by_id", sa.Integer(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.Column("updated_at", sa.DateTime(), nullable=False),
            sa.ForeignKeyConstraint(["facility_id"], ["facilities.id"], ondelete="SET NULL"),
            sa.ForeignKeyConstraint(["customer_user_id"], ["users.id"], ondelete="SET NULL"),
            sa.ForeignKeyConstraint(["part_id"], ["inventory_parts.id"], ondelete="SET NULL"),
            sa.ForeignKeyConstraint(["down_payment_invoice_id"], ["invoices.id"], ondelete="SET NULL"),
            sa.ForeignKeyConstraint(["buyout_invoice_id"], ["invoices.id"], ondelete="SET NULL"),
            sa.ForeignKeyConstraint(["created_by_id"], ["users.id"], ondelete="SET NULL"),
            sa.PrimaryKeyConstraint("id"),
        )
        op.create_index("ix_lease_agreements_id", "lease_agreements", ["id"])
        op.create_index("ix_lease_agreements_agreement_number", "lease_agreements",
                        ["agreement_number"], unique=True)
        op.create_index("ix_lease_agreements_status", "lease_agreements", ["status"])
        op.create_index("ix_lease_agreements_facility_id", "lease_agreements", ["facility_id"])
        op.create_index("ix_lease_agreements_customer_user_id", "lease_agreements", ["customer_user_id"])
        op.create_index("ix_lease_agreements_part_id", "lease_agreements", ["part_id"])
        op.create_index("ix_lease_agreements_access_token_hash", "lease_agreements",
                        ["access_token_hash"], unique=True)
        op.create_index("ix_lease_agreements_status_created", "lease_agreements",
                        ["status", "created_at"])

    if "lease_installments" not in existing:
        op.create_table(
            "lease_installments",
            sa.Column("id", sa.Integer(), nullable=False),
            sa.Column("agreement_id", sa.Integer(), nullable=False),
            sa.Column("number", sa.Integer(), nullable=False),
            sa.Column("due_date", sa.Date(), nullable=False),
            sa.Column("principal", sa.Numeric(12, 2), nullable=False),
            sa.Column("markup", sa.Numeric(12, 2), nullable=False),
            sa.Column("amount", sa.Numeric(12, 2), nullable=False),
            sa.Column("tax", sa.Numeric(12, 2), nullable=False),
            sa.Column("total", sa.Numeric(12, 2), nullable=False),
            sa.Column("status", sa.String(length=20), nullable=False, server_default="scheduled"),
            sa.Column("invoice_id", sa.Integer(), nullable=True),
            sa.Column("late_fee_invoice_id", sa.Integer(), nullable=True),
            sa.Column("paid_at", sa.DateTime(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.Column("updated_at", sa.DateTime(), nullable=False),
            sa.ForeignKeyConstraint(["agreement_id"], ["lease_agreements.id"], ondelete="CASCADE"),
            sa.ForeignKeyConstraint(["invoice_id"], ["invoices.id"], ondelete="SET NULL"),
            sa.ForeignKeyConstraint(["late_fee_invoice_id"], ["invoices.id"], ondelete="SET NULL"),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint("agreement_id", "number", name="uq_lease_installment_number"),
            sa.UniqueConstraint("invoice_id"),
            sa.UniqueConstraint("late_fee_invoice_id"),
        )
        op.create_index("ix_lease_installments_id", "lease_installments", ["id"])
        op.create_index("ix_lease_installments_agreement_id", "lease_installments", ["agreement_id"])
        op.create_index("ix_lease_installments_due_date", "lease_installments", ["due_date"])
        op.create_index("ix_lease_installments_status_due", "lease_installments", ["status", "due_date"])

    if "lease_payment_authorizations" not in existing:
        op.create_table(
            "lease_payment_authorizations",
            sa.Column("id", sa.Integer(), nullable=False),
            sa.Column("agreement_id", sa.Integer(), nullable=False),
            sa.Column("event_type", sa.String(length=32), nullable=False),
            sa.Column("consent_version", sa.String(length=40), nullable=False),
            sa.Column("consent_text", sa.Text(), nullable=False),
            sa.Column("accepted_by_name", sa.String(length=200), nullable=False),
            sa.Column("channel", sa.String(length=24), nullable=False),
            sa.Column("ip_address", sa.String(length=120), nullable=True),
            sa.Column("user_agent", sa.Text(), nullable=True),
            sa.Column("card_brand", sa.String(length=40), nullable=True),
            sa.Column("card_last4", sa.String(length=4), nullable=True),
            sa.Column("card_exp_month", sa.Integer(), nullable=True),
            sa.Column("card_exp_year", sa.Integer(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.ForeignKeyConstraint(["agreement_id"], ["lease_agreements.id"], ondelete="CASCADE"),
            sa.PrimaryKeyConstraint("id"),
        )
        op.create_index("ix_lease_payment_authorizations_id", "lease_payment_authorizations", ["id"])
        op.create_index("ix_lease_payment_authorizations_agreement_id",
                        "lease_payment_authorizations", ["agreement_id"])
        op.create_index("ix_lease_payment_authorizations_event_type",
                        "lease_payment_authorizations", ["event_type"])


def downgrade() -> None:
    existing = _tables()
    # Children first. Nothing outside these three tables refers to them.
    for table in ("lease_payment_authorizations", "lease_installments", "lease_agreements"):
        if table in existing:
            op.drop_table(table)
