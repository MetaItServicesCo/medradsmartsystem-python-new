"""Add durable payment receipt delivery outbox.

Revision ID: c8f9a0b1c2d3
Revises: b7e8f9a0b1c2
"""

from alembic import op
import sqlalchemy as sa


revision = "c8f9a0b1c2d3"
down_revision = "b7e8f9a0b1c2"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "payment_receipt_deliveries",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("invoice_id", sa.Integer(), nullable=False),
        sa.Column("payment_reference", sa.String(length=255), nullable=False),
        sa.Column("recipients", sa.JSON(), nullable=False),
        sa.Column("amount", sa.Numeric(precision=10, scale=2), nullable=False),
        sa.Column("payment_method", sa.String(length=64), nullable=True),
        sa.Column("card_brand", sa.String(length=40), nullable=True),
        sa.Column("card_last4", sa.String(length=4), nullable=True),
        sa.Column("status", sa.String(length=24), server_default="pending", nullable=False),
        sa.Column("attempt_count", sa.Integer(), server_default="0", nullable=False),
        sa.Column("next_attempt_at", sa.DateTime(), nullable=True),
        sa.Column("last_error", sa.Text(), nullable=True),
        sa.Column("sent_at", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["invoice_id"], ["invoices.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("invoice_id", "payment_reference", name="uq_receipt_invoice_payment"),
    )
    op.create_index("ix_payment_receipt_deliveries_id", "payment_receipt_deliveries", ["id"], unique=False)
    op.create_index("ix_payment_receipt_deliveries_invoice_id", "payment_receipt_deliveries", ["invoice_id"], unique=False)
    op.create_index("ix_payment_receipt_deliveries_status", "payment_receipt_deliveries", ["status"], unique=False)
    op.create_index("ix_payment_receipt_deliveries_next_attempt_at", "payment_receipt_deliveries", ["next_attempt_at"], unique=False)
    op.create_index("ix_receipt_delivery_due", "payment_receipt_deliveries", ["status", "next_attempt_at"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_receipt_delivery_due", table_name="payment_receipt_deliveries")
    op.drop_index("ix_payment_receipt_deliveries_next_attempt_at", table_name="payment_receipt_deliveries")
    op.drop_index("ix_payment_receipt_deliveries_status", table_name="payment_receipt_deliveries")
    op.drop_index("ix_payment_receipt_deliveries_invoice_id", table_name="payment_receipt_deliveries")
    op.drop_index("ix_payment_receipt_deliveries_id", table_name="payment_receipt_deliveries")
    op.drop_table("payment_receipt_deliveries")
