"""Add PCI-safe card metadata to invoice transactions.

Revision ID: f1c2d3e4f5a6
Revises: e0b1c2d3e4f5
"""

from alembic import op
import sqlalchemy as sa


revision = "f1c2d3e4f5a6"
down_revision = "e0b1c2d3e4f5"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("invoice_transactions", sa.Column("card_brand", sa.String(length=40), nullable=True))
    op.add_column("invoice_transactions", sa.Column("card_last4", sa.String(length=4), nullable=True))


def downgrade() -> None:
    op.drop_column("invoice_transactions", "card_last4")
    op.drop_column("invoice_transactions", "card_brand")
