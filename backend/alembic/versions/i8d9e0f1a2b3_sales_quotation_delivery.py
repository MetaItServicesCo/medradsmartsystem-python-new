"""sales quotation recipients, delivery, and acceptance

Revision ID: i8d9e0f1a2b3
Revises: h7c8d9e0f1a2
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "i8d9e0f1a2b3"
down_revision: Union[str, Sequence[str], None] = "h7c8d9e0f1a2"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("sales_quotations", sa.Column("sent_at", sa.DateTime(), nullable=True))
    op.add_column("sales_quotations", sa.Column("expires_at", sa.DateTime(), nullable=True))
    op.add_column(
        "sales_quotations",
        sa.Column("revision", sa.Integer(), server_default="1", nullable=False),
    )

    op.create_table(
        "sales_quotation_recipients",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("quotation_id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=True),
        sa.Column("recipient_type", sa.String(), server_default="additional", nullable=False),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("email", sa.String(), nullable=False),
        sa.Column("status", sa.String(), server_default="draft", nullable=False),
        sa.Column("access_token_hash", sa.String(), nullable=True),
        sa.Column("token_expires_at", sa.DateTime(), nullable=True),
        sa.Column("sent_at", sa.DateTime(), nullable=True),
        sa.Column("viewed_at", sa.DateTime(), nullable=True),
        sa.Column("accepted_at", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["quotation_id"], ["sales_quotations.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("access_token_hash"),
    )
    op.create_index("ix_sales_quotation_recipients_id", "sales_quotation_recipients", ["id"])
    op.create_index("ix_sales_quotation_recipients_quotation_id", "sales_quotation_recipients", ["quotation_id"])
    op.create_index("ix_sales_quotation_recipients_user_id", "sales_quotation_recipients", ["user_id"])
    op.create_index("ix_sales_quotation_recipients_status", "sales_quotation_recipients", ["status"])
    op.create_index("ix_sales_quotation_recipients_access_token_hash", "sales_quotation_recipients", ["access_token_hash"])
    op.create_index("ix_sales_quote_recipients_user_status", "sales_quotation_recipients", ["user_id", "status"])
    op.create_index("ix_sales_quote_recipients_quote_type", "sales_quotation_recipients", ["quotation_id", "recipient_type"])

    op.create_table(
        "sales_quotation_acceptances",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("quotation_id", sa.Integer(), nullable=False),
        sa.Column("recipient_id", sa.Integer(), nullable=True),
        sa.Column("accepted_by_user_id", sa.Integer(), nullable=True),
        sa.Column("accepted_by_name", sa.String(), nullable=False),
        sa.Column("signature_name", sa.String(), nullable=False),
        sa.Column("terms_accepted", sa.Boolean(), nullable=False),
        sa.Column("quotation_revision", sa.Integer(), nullable=False),
        sa.Column("selection_snapshot", sa.JSON(), nullable=False),
        sa.Column("pricing_snapshot", sa.JSON(), nullable=False),
        sa.Column("ip_address", sa.String(), nullable=True),
        sa.Column("user_agent", sa.Text(), nullable=True),
        sa.Column("accepted_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["accepted_by_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["quotation_id"], ["sales_quotations.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["recipient_id"], ["sales_quotation_recipients.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("quotation_id", name="uq_sales_quote_acceptance_quotation"),
    )
    op.create_index("ix_sales_quotation_acceptances_id", "sales_quotation_acceptances", ["id"])
    op.create_index("ix_sales_quotation_acceptances_quotation_id", "sales_quotation_acceptances", ["quotation_id"])
    op.create_index("ix_sales_quotation_acceptances_accepted_at", "sales_quotation_acceptances", ["accepted_at"])


def downgrade() -> None:
    op.drop_index("ix_sales_quotation_acceptances_accepted_at", table_name="sales_quotation_acceptances")
    op.drop_index("ix_sales_quotation_acceptances_quotation_id", table_name="sales_quotation_acceptances")
    op.drop_index("ix_sales_quotation_acceptances_id", table_name="sales_quotation_acceptances")
    op.drop_table("sales_quotation_acceptances")
    op.drop_index("ix_sales_quote_recipients_quote_type", table_name="sales_quotation_recipients")
    op.drop_index("ix_sales_quote_recipients_user_status", table_name="sales_quotation_recipients")
    op.drop_index("ix_sales_quotation_recipients_access_token_hash", table_name="sales_quotation_recipients")
    op.drop_index("ix_sales_quotation_recipients_status", table_name="sales_quotation_recipients")
    op.drop_index("ix_sales_quotation_recipients_user_id", table_name="sales_quotation_recipients")
    op.drop_index("ix_sales_quotation_recipients_quotation_id", table_name="sales_quotation_recipients")
    op.drop_index("ix_sales_quotation_recipients_id", table_name="sales_quotation_recipients")
    op.drop_table("sales_quotation_recipients")
    op.drop_column("sales_quotations", "revision")
    op.drop_column("sales_quotations", "expires_at")
    op.drop_column("sales_quotations", "sent_at")
