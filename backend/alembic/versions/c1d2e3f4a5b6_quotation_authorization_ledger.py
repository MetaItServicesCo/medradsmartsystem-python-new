"""quotation authorization lifecycle and ledger

Revision ID: c1d2e3f4a5b6
Revises: b0c1d2e3f4a5
Create Date: 2026-07-21
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "c1d2e3f4a5b6"
down_revision: Union[str, Sequence[str], None] = "b0c1d2e3f4a5"
branch_labels = None
depends_on = None


def _table_exists(bind, table_name: str) -> bool:
    return table_name in sa.inspect(bind).get_table_names()


def _column_names(bind, table_name: str) -> set[str]:
    return {column["name"] for column in sa.inspect(bind).get_columns(table_name)}


def upgrade() -> None:
    bind = op.get_bind()

    if not _table_exists(bind, "quotation_authorizations"):
        op.create_table(
            "quotation_authorizations",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("quotation_id", sa.Integer(), sa.ForeignKey("service_request_quotations.id", ondelete="CASCADE"), nullable=False),
            sa.Column("status", sa.String(), nullable=False, server_default="requested"),
            sa.Column("authorized_amount", sa.Numeric(10, 2), nullable=False),
            sa.Column("channel", sa.String(), nullable=True),
            sa.Column("requested_by_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
            sa.Column("authorized_by_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
            sa.Column("recorded_by_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
            sa.Column("authorized_by_name", sa.String(), nullable=True),
            sa.Column("authorized_by_role", sa.String(), nullable=True),
            sa.Column("confirmation_reference", sa.String(), nullable=True),
            sa.Column("notes", sa.Text(), nullable=True),
            sa.Column("requested_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
            sa.Column("decided_at", sa.DateTime(), nullable=True),
            sa.Column("invalidated_at", sa.DateTime(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        )
        op.create_index("ix_quotation_authorizations_id", "quotation_authorizations", ["id"])
        op.create_index("ix_quotation_authorizations_quotation_id", "quotation_authorizations", ["quotation_id"])

    if not _table_exists(bind, "quotation_ledger_entries"):
        op.create_table(
            "quotation_ledger_entries",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("quotation_id", sa.Integer(), sa.ForeignKey("service_request_quotations.id", ondelete="CASCADE"), nullable=False),
            sa.Column("event_type", sa.String(), nullable=False),
            sa.Column("actor_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
            sa.Column("actor_name", sa.String(), nullable=False),
            sa.Column("actor_role", sa.String(), nullable=False),
            sa.Column("channel", sa.String(), nullable=True),
            sa.Column("amount", sa.Numeric(10, 2), nullable=True),
            sa.Column("reference_number", sa.String(), nullable=True),
            sa.Column("details", sa.JSON(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        )
        op.create_index("ix_quotation_ledger_entries_id", "quotation_ledger_entries", ["id"])
        op.create_index("ix_quotation_ledger_entries_quotation_id", "quotation_ledger_entries", ["quotation_id"])
        op.create_index("ix_quotation_ledger_entries_event_type", "quotation_ledger_entries", ["event_type"])
        op.create_index("ix_quotation_ledger_entries_created_at", "quotation_ledger_entries", ["created_at"])

    payment_columns = _column_names(bind, "quotation_payments")
    if "authorization_id" not in payment_columns:
        op.add_column("quotation_payments", sa.Column("authorization_id", sa.Integer(), nullable=True))
        op.create_foreign_key(
            "fk_quotation_payments_authorization_id",
            "quotation_payments",
            "quotation_authorizations",
            ["authorization_id"],
            ["id"],
            ondelete="SET NULL",
        )
    if "payment_channel" not in payment_columns:
        op.add_column("quotation_payments", sa.Column("payment_channel", sa.String(), nullable=True))
    if "payer_role" not in payment_columns:
        op.add_column("quotation_payments", sa.Column("payer_role", sa.String(), nullable=True))


def downgrade() -> None:
    bind = op.get_bind()
    if _table_exists(bind, "quotation_payments"):
        columns = _column_names(bind, "quotation_payments")
        if "payer_role" in columns:
            op.drop_column("quotation_payments", "payer_role")
        if "payment_channel" in columns:
            op.drop_column("quotation_payments", "payment_channel")
        if "authorization_id" in columns:
            op.drop_constraint("fk_quotation_payments_authorization_id", "quotation_payments", type_="foreignkey")
            op.drop_column("quotation_payments", "authorization_id")
    if _table_exists(bind, "quotation_ledger_entries"):
        op.drop_table("quotation_ledger_entries")
    if _table_exists(bind, "quotation_authorizations"):
        op.drop_table("quotation_authorizations")
