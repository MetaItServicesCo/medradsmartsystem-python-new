"""sales payment authorization audit

Revision ID: j9e0f1a2b3c4
Revises: i8d9e0f1a2b3
Create Date: 2026-07-29
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "j9e0f1a2b3c4"
down_revision: Union[str, Sequence[str], None] = "i8d9e0f1a2b3"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "sales_payment_authorizations",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("invoice_id", sa.Integer(), sa.ForeignKey("invoices.id", ondelete="CASCADE"), nullable=False),
        sa.Column("quotation_id", sa.Integer(), sa.ForeignKey("sales_quotations.id", ondelete="CASCADE"), nullable=False),
        sa.Column("recipient_id", sa.Integer(), sa.ForeignKey("sales_quotation_recipients.id", ondelete="SET NULL"), nullable=True),
        sa.Column("requested_by_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("submitted_by_user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("status", sa.String(), nullable=False, server_default="requested"),
        sa.Column("amount", sa.Numeric(10, 2), nullable=False),
        sa.Column("currency", sa.String(), nullable=False, server_default="USD"),
        sa.Column("payment_method", sa.String(), nullable=False, server_default="credit_card"),
        sa.Column("channel", sa.String(), nullable=False, server_default="public_link"),
        sa.Column("submitted_by_name", sa.String(), nullable=True),
        sa.Column("submitted_by_email", sa.String(), nullable=True),
        sa.Column("cardholder_name", sa.String(), nullable=True),
        sa.Column("card_brand", sa.String(), nullable=True),
        sa.Column("card_last_four", sa.String(), nullable=True),
        sa.Column("card_expiration", sa.String(), nullable=True),
        sa.Column("authorization_reference", sa.String(), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("access_token_hash", sa.String(), nullable=False),
        sa.Column("token_expires_at", sa.DateTime(), nullable=False),
        sa.Column("requested_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("submitted_at", sa.DateTime(), nullable=True),
        sa.Column("processed_at", sa.DateTime(), nullable=True),
        sa.Column("ip_address", sa.String(), nullable=True),
        sa.Column("user_agent", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_sales_payment_authorizations_id", "sales_payment_authorizations", ["id"])
    op.create_index("ix_sales_payment_authorizations_invoice_id", "sales_payment_authorizations", ["invoice_id"])
    op.create_index("ix_sales_payment_authorizations_quotation_id", "sales_payment_authorizations", ["quotation_id"])
    op.create_index("ix_sales_payment_authorizations_status", "sales_payment_authorizations", ["status"])
    op.create_index("ix_sales_payment_authorizations_access_token_hash", "sales_payment_authorizations", ["access_token_hash"], unique=True)
    op.create_index("ix_sales_payment_authorizations_authorization_reference", "sales_payment_authorizations", ["authorization_reference"], unique=True)
    op.create_index("ix_sales_payment_auth_invoice_status", "sales_payment_authorizations", ["invoice_id", "status"])
    op.create_index("ix_sales_payment_auth_quotation_created", "sales_payment_authorizations", ["quotation_id", "created_at"])


def downgrade() -> None:
    op.drop_table("sales_payment_authorizations")
