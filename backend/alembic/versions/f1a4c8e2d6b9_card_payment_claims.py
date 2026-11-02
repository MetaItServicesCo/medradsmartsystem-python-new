"""Card payments a customer reports are verified by staff before they count

Revision ID: f1a4c8e2d6b9
Revises: e9f3a7c1b5d4
Create Date: 2026-11-03

A facility user who says they paid by card no longer changes the invoice:
the claim waits in the payment-proof review queue, like an ACH or cheque
proof, until an Admin or Super Admin confirms the money arrived. A card
claim has no uploaded document, so the file columns become optional, and it
keeps the card brand and last four digits the customer gave. Existing proofs
are unchanged.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "f1a4c8e2d6b9"
down_revision: Union[str, Sequence[str], None] = "e9f3a7c1b5d4"
branch_labels = None
depends_on = None

FILE_COLUMNS = (
    ("original_filename", sa.String(length=255)),
    ("stored_filename", sa.String(length=255)),
    ("mime_type", sa.String(length=100)),
    ("file_size", sa.Integer()),
    ("sha256", sa.String(length=64)),
)


def upgrade() -> None:
    with op.batch_alter_table("payment_proofs") as batch:
        for name, kind in FILE_COLUMNS:
            batch.alter_column(name, existing_type=kind, nullable=True)
        batch.add_column(sa.Column("card_brand", sa.String(length=40), nullable=True))
        batch.add_column(sa.Column("card_last4", sa.String(length=4), nullable=True))


def downgrade() -> None:
    # Card claims have no file; they cannot satisfy the old NOT NULL columns.
    op.execute("DELETE FROM payment_proofs WHERE stored_filename IS NULL")
    with op.batch_alter_table("payment_proofs") as batch:
        batch.drop_column("card_last4")
        batch.drop_column("card_brand")
        for name, kind in FILE_COLUMNS:
            batch.alter_column(name, existing_type=kind, nullable=False)
