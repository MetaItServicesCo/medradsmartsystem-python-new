"""rental item labor fee (matches sales line fee structure)

Revision ID: o4d5e6f7a8b9
Revises: n3c4d5e6f7a8
Create Date: 2026-08-04
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "o4d5e6f7a8b9"
down_revision: Union[str, Sequence[str], None] = "n3c4d5e6f7a8"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("rental_items", sa.Column("labor_fee", sa.Numeric(10, 2), nullable=False, server_default="0"))


def downgrade() -> None:
    op.drop_column("rental_items", "labor_fee")
