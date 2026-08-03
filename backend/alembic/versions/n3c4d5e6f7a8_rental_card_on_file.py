"""rental card-on-file + auto-charge decline tracking

Revision ID: n3c4d5e6f7a8
Revises: m2b3c4d5e6f7
Create Date: 2026-08-04
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "n3c4d5e6f7a8"
down_revision: Union[str, Sequence[str], None] = "m2b3c4d5e6f7"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("rentals", sa.Column("square_card_id", sa.String(), nullable=True))
    op.add_column("rentals", sa.Column("square_customer_id", sa.String(), nullable=True))
    op.add_column("rentals", sa.Column("failed_charge_count", sa.Integer(), nullable=False, server_default="0"))


def downgrade() -> None:
    op.drop_column("rentals", "failed_charge_count")
    op.drop_column("rentals", "square_customer_id")
    op.drop_column("rentals", "square_card_id")
