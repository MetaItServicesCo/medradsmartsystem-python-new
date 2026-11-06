"""Service invoices: the work done on them, and a link to view and pay

Revision ID: d4a7c1e9f2b3
Revises: c9d4e2f7a3b1
Create Date: 2026-11-06

New nullable columns only, used by service invoices. Nothing existing changes:
sales, rental and inspection invoices leave them empty, and an older service
invoice shows its work order as it stands because it has no saved copy.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "d4a7c1e9f2b3"
down_revision: Union[str, Sequence[str], None] = "c9d4e2f7a3b1"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("invoices", sa.Column("service_work_entries", sa.JSON(), nullable=True))
    op.add_column("invoices", sa.Column("public_link_nonce", sa.String(length=64), nullable=True))
    op.add_column("invoices", sa.Column("public_link_hash", sa.String(length=64), nullable=True))
    op.add_column("invoices", sa.Column("public_link_expires_at", sa.DateTime(), nullable=True))
    op.add_column("invoices", sa.Column("public_link_sent_at", sa.DateTime(), nullable=True))
    op.add_column("invoices", sa.Column("public_link_email", sa.String(length=320), nullable=True))
    op.create_index("ix_invoices_public_link_hash", "invoices", ["public_link_hash"], unique=True)


def downgrade() -> None:
    op.drop_index("ix_invoices_public_link_hash", table_name="invoices")
    op.drop_column("invoices", "public_link_email")
    op.drop_column("invoices", "public_link_sent_at")
    op.drop_column("invoices", "public_link_expires_at")
    op.drop_column("invoices", "public_link_hash")
    op.drop_column("invoices", "public_link_nonce")
    op.drop_column("invoices", "service_work_entries")
