"""rental billing schedule identity and payment retry ledger state

Revision ID: s8b9c0d1e2f3
Revises: r7a8b9c0d1e2
Create Date: 2026-08-05
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "s8b9c0d1e2f3"
down_revision: Union[str, Sequence[str], None] = "r7a8b9c0d1e2"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("invoices", sa.Column("rental_period_number", sa.Integer(), nullable=True))
    op.add_column("invoices", sa.Column("rental_period_start", sa.Date(), nullable=True))
    op.add_column("invoices", sa.Column("rental_period_end", sa.Date(), nullable=True))
    op.add_column("invoices", sa.Column("payment_attempt_count", sa.Integer(), nullable=False, server_default="0"))
    op.add_column("invoices", sa.Column("last_payment_attempt_at", sa.DateTime(), nullable=True))
    op.add_column("invoices", sa.Column("next_payment_retry_at", sa.DateTime(), nullable=True))

    # Safely identify the oldest invoice as period one for existing agreements.
    # Remaining legacy invoices stay nullable because their historical period
    # cannot be inferred reliably without changing financial records.
    op.execute(sa.text("""
        UPDATE invoices AS i
        SET rental_period_number = 1
        WHERE i.rental_id IS NOT NULL
          AND i.id = (
              SELECT MIN(first_i.id)
              FROM invoices AS first_i
              WHERE first_i.rental_id = i.rental_id
          )
    """))

    op.create_unique_constraint("uq_invoice_rental_period", "invoices", ["rental_id", "rental_period_number"])
    op.create_index("ix_invoices_next_payment_retry_at", "invoices", ["next_payment_retry_at"])


def downgrade() -> None:
    op.drop_index("ix_invoices_next_payment_retry_at", table_name="invoices")
    op.drop_constraint("uq_invoice_rental_period", "invoices", type_="unique")
    op.drop_column("invoices", "next_payment_retry_at")
    op.drop_column("invoices", "last_payment_attempt_at")
    op.drop_column("invoices", "payment_attempt_count")
    op.drop_column("invoices", "rental_period_end")
    op.drop_column("invoices", "rental_period_start")
    op.drop_column("invoices", "rental_period_number")
