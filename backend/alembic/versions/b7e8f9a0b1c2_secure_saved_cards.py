"""Encrypt saved-card references and add immutable consent evidence.

Revision ID: b7e8f9a0b1c2
Revises: a6d7e8f9a0b1
"""

from alembic import op
import sqlalchemy as sa

from app.utils.payment_data_security import (
    decrypt_payment_reference,
    encrypt_payment_reference,
    payment_data_encryption_configured,
)


revision = "b7e8f9a0b1c2"
down_revision = "a6d7e8f9a0b1"
branch_labels = None
depends_on = None


def _rewrite_references(encrypt: bool) -> None:
    connection = op.get_bind()
    rows = connection.execute(
        sa.text(
            "SELECT id, square_card_id, square_customer_id FROM rentals "
            "WHERE square_card_id IS NOT NULL OR square_customer_id IS NOT NULL"
        )
    ).mappings()
    transform = encrypt_payment_reference if encrypt else decrypt_payment_reference
    for row in rows:
        connection.execute(
            sa.text(
                "UPDATE rentals SET square_card_id = :card_id, square_customer_id = :customer_id "
                "WHERE id = :rental_id"
            ),
            {
                "rental_id": row["id"],
                "card_id": transform(row["square_card_id"]),
                "customer_id": transform(row["square_customer_id"]),
            },
        )


def upgrade() -> None:
    if not payment_data_encryption_configured():
        raise RuntimeError(
            "Set PAYMENT_DATA_ENCRYPTION_KEYS to a Fernet key before running this migration"
        )

    op.alter_column("rentals", "square_card_id", existing_type=sa.String(), type_=sa.Text(), existing_nullable=True)
    op.alter_column("rentals", "square_customer_id", existing_type=sa.String(), type_=sa.Text(), existing_nullable=True)
    _rewrite_references(encrypt=True)

    # Some deployments run metadata.create_all before Alembic. Keep this
    # migration safe in both orders without weakening the data rewrite above.
    if not sa.inspect(op.get_bind()).has_table("rental_payment_authorizations"):
        op.create_table(
            "rental_payment_authorizations",
            sa.Column("id", sa.Integer(), nullable=False),
            sa.Column("rental_id", sa.Integer(), nullable=False),
            sa.Column("invoice_id", sa.Integer(), nullable=True),
            sa.Column("event_type", sa.String(length=32), nullable=False),
            sa.Column("consent_version", sa.String(length=40), nullable=False),
            sa.Column("consent_text", sa.Text(), nullable=False),
            sa.Column("billing_frequency", sa.String(length=32), nullable=True),
            sa.Column("agreement_revision", sa.Integer(), nullable=False),
            sa.Column("accepted_by_name", sa.String(length=200), nullable=False),
            sa.Column("accepted_by_user_id", sa.Integer(), nullable=True),
            sa.Column("channel", sa.String(length=24), nullable=False),
            sa.Column("ip_address", sa.String(length=120), nullable=True),
            sa.Column("user_agent", sa.Text(), nullable=True),
            sa.Column("card_brand", sa.String(length=40), nullable=True),
            sa.Column("card_last4", sa.String(length=4), nullable=True),
            sa.Column("card_exp_month", sa.Integer(), nullable=True),
            sa.Column("card_exp_year", sa.Integer(), nullable=True),
            sa.Column("provider_cleanup_pending", sa.Boolean(), nullable=False, server_default=sa.false()),
            sa.Column("provider_card_reference", sa.Text(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.ForeignKeyConstraint(["accepted_by_user_id"], ["users.id"], ondelete="SET NULL"),
            sa.ForeignKeyConstraint(["invoice_id"], ["invoices.id"], ondelete="SET NULL"),
            sa.ForeignKeyConstraint(["rental_id"], ["rentals.id"], ondelete="CASCADE"),
            sa.PrimaryKeyConstraint("id"),
        )
        op.create_index("ix_rental_payment_authorizations_rental_id", "rental_payment_authorizations", ["rental_id"])
        op.create_index("ix_rental_payment_authorizations_invoice_id", "rental_payment_authorizations", ["invoice_id"])
        op.create_index("ix_rental_payment_authorizations_event_type", "rental_payment_authorizations", ["event_type"])
        op.create_index("ix_rental_payment_authorizations_created_at", "rental_payment_authorizations", ["created_at"])
        op.create_index(
            "ix_rental_payment_auth_rental_created",
            "rental_payment_authorizations",
            ["rental_id", "created_at"],
        )


def downgrade() -> None:
    op.drop_table("rental_payment_authorizations")
    _rewrite_references(encrypt=False)
    op.alter_column("rentals", "square_customer_id", existing_type=sa.Text(), type_=sa.String(), existing_nullable=True)
    op.alter_column("rentals", "square_card_id", existing_type=sa.Text(), type_=sa.String(), existing_nullable=True)
