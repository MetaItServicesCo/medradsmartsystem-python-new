"""Add durable payment idempotency and webhook inbox records.

Revision ID: a6d7e8f9a0b1
Revises: z5c6d7e8f9a0
"""

from alembic import op
import sqlalchemy as sa


revision = "a6d7e8f9a0b1"
down_revision = "z5c6d7e8f9a0"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "payment_operations",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("idempotency_key", sa.String(length=255), nullable=False),
        sa.Column("request_fingerprint", sa.String(length=64), nullable=False),
        sa.Column("operation_type", sa.String(length=40), nullable=False),
        sa.Column("status", sa.String(length=24), nullable=False),
        sa.Column("invoice_id", sa.Integer(), nullable=True),
        sa.Column("quotation_id", sa.Integer(), nullable=True),
        sa.Column("provider", sa.String(length=32), nullable=True),
        sa.Column("provider_reference", sa.String(length=255), nullable=True),
        sa.Column("amount", sa.Numeric(precision=12, scale=2), nullable=False),
        sa.Column("currency", sa.String(length=3), nullable=False),
        sa.Column("response_data", sa.JSON(), nullable=True),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column("created_by_id", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.Column("completed_at", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(["created_by_id"], ["users.id"]),
        sa.ForeignKeyConstraint(["invoice_id"], ["invoices.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["quotation_id"], ["service_request_quotations.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("idempotency_key"),
        sa.UniqueConstraint("provider_reference"),
    )
    for column in ("idempotency_key", "operation_type", "status", "invoice_id", "quotation_id", "provider_reference"):
        op.create_index(f"ix_payment_operations_{column}", "payment_operations", [column])
    op.create_index(
        "uq_payment_operations_active_invoice",
        "payment_operations",
        ["invoice_id"],
        unique=True,
        postgresql_where=sa.text("invoice_id IS NOT NULL AND status IN ('processing', 'unknown')"),
    )
    op.create_index(
        "uq_payment_operations_active_quotation",
        "payment_operations",
        ["quotation_id"],
        unique=True,
        postgresql_where=sa.text("quotation_id IS NOT NULL AND status IN ('processing', 'unknown')"),
    )

    op.create_table(
        "payment_webhook_events",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("provider", sa.String(length=32), nullable=False),
        sa.Column("event_id", sa.String(length=255), nullable=False),
        sa.Column("event_type", sa.String(length=120), nullable=False),
        sa.Column("payload_hash", sa.String(length=64), nullable=False),
        sa.Column("status", sa.String(length=24), nullable=False),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column("received_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.Column("processed_at", sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("event_id"),
    )
    for column in ("event_id", "event_type", "status"):
        op.create_index(f"ix_payment_webhook_events_{column}", "payment_webhook_events", [column])


def downgrade() -> None:
    op.drop_table("payment_webhook_events")
    op.drop_table("payment_operations")
