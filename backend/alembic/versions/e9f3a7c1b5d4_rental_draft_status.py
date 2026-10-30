"""Rental agreements can be saved as drafts

Revision ID: e9f3a7c1b5d4
Revises: d8e2f6b0a4c3
Create Date: 2026-10-31

Adds DRAFT to the native rentalstatus enum. A draft reserves no stock, raises
no invoice and is never billed until staff activate it. Purely additive: no
existing rental changes.
"""
from typing import Sequence, Union

from alembic import op


revision: str = "e9f3a7c1b5d4"
down_revision: Union[str, Sequence[str], None] = "d8e2f6b0a4c3"
branch_labels = None
depends_on = None


def upgrade() -> None:
    if op.get_bind().dialect.name == "postgresql":
        # ADD VALUE must run outside the migration's transaction on older Postgres.
        with op.get_context().autocommit_block():
            op.execute("ALTER TYPE rentalstatus ADD VALUE IF NOT EXISTS 'DRAFT'")


def downgrade() -> None:
    # PostgreSQL enum values cannot be removed safely without rebuilding the type.
    pass
