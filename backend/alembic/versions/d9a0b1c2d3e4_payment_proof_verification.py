"""Add private non-card payment proof verification.

Revision ID: d9a0b1c2d3e4
Revises: c8f9a0b1c2d3
"""

from alembic import op
import sqlalchemy as sa


revision = "d9a0b1c2d3e4"
down_revision = "c8f9a0b1c2d3"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "payment_proofs",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("invoice_id", sa.Integer(), nullable=True),
        sa.Column("service_quotation_id", sa.Integer(), nullable=True),
        sa.Column("submitted_by_id", sa.Integer(), nullable=False),
        sa.Column("payment_method", sa.String(length=40), nullable=False),
        sa.Column("claimed_amount", sa.Numeric(precision=10, scale=2), nullable=False),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("original_filename", sa.String(length=255), nullable=False),
        sa.Column("stored_filename", sa.String(length=255), nullable=False),
        sa.Column("storage_backend", sa.String(length=16), server_default="local", nullable=False),
        sa.Column("mime_type", sa.String(length=100), nullable=False),
        sa.Column("file_size", sa.Integer(), nullable=False),
        sa.Column("sha256", sa.String(length=64), nullable=False),
        sa.Column("status", sa.String(length=32), server_default="pending_verification", nullable=False),
        sa.Column("extraction_status", sa.String(length=24), server_default="queued", nullable=False),
        sa.Column("extraction_attempt_count", sa.Integer(), server_default="0", nullable=False),
        sa.Column("extraction_next_attempt_at", sa.DateTime(), nullable=True),
        sa.Column("extraction_started_at", sa.DateTime(), nullable=True),
        sa.Column("extraction_completed_at", sa.DateTime(), nullable=True),
        sa.Column("extraction_last_error", sa.Text(), nullable=True),
        sa.Column("ocr_provider", sa.String(length=40), nullable=True),
        sa.Column("ocr_text", sa.Text(), nullable=True),
        sa.Column("extracted_data", sa.JSON(), server_default=sa.text("'{}'::json"), nullable=False),
        sa.Column("extraction_confidence", sa.Numeric(precision=5, scale=4), nullable=True),
        sa.Column("mismatch_flags", sa.JSON(), server_default=sa.text("'[]'::json"), nullable=False),
        sa.Column("requires_manual_review", sa.Boolean(), server_default=sa.true(), nullable=False),
        sa.Column("reviewed_by_id", sa.Integer(), nullable=True),
        sa.Column("reviewed_at", sa.DateTime(), nullable=True),
        sa.Column("review_notes", sa.Text(), nullable=True),
        sa.Column("invoice_transaction_id", sa.Integer(), nullable=True),
        sa.Column("quotation_payment_id", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.CheckConstraint(
            "(invoice_id IS NOT NULL AND service_quotation_id IS NULL) OR "
            "(invoice_id IS NULL AND service_quotation_id IS NOT NULL)",
            name="ck_payment_proof_single_target",
        ),
        sa.ForeignKeyConstraint(["invoice_id"], ["invoices.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["service_quotation_id"], ["service_request_quotations.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["submitted_by_id"], ["users.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["reviewed_by_id"], ["users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["invoice_transaction_id"], ["invoice_transactions.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["quotation_payment_id"], ["quotation_payments.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("stored_filename"),
    )
    for column in ("id", "invoice_id", "service_quotation_id", "submitted_by_id", "payment_method", "sha256", "status", "storage_backend", "extraction_status", "extraction_next_attempt_at", "created_at"):
        op.create_index(f"ix_payment_proofs_{column}", "payment_proofs", [column], unique=False)
    op.create_index("ix_payment_proofs_review_queue", "payment_proofs", ["status", "created_at"], unique=False)
    op.create_index("ix_payment_proofs_extraction_queue", "payment_proofs", ["extraction_status", "extraction_next_attempt_at"], unique=False)
    op.create_index("ix_payment_proofs_invoice_created", "payment_proofs", ["invoice_id", "created_at"], unique=False)
    op.create_index("ix_payment_proofs_quotation_created", "payment_proofs", ["service_quotation_id", "created_at"], unique=False)


def downgrade() -> None:
    op.drop_table("payment_proofs")
