"""rental customer-portal access token

Revision ID: p5e6f7a8b9c0
Revises: o4d5e6f7a8b9
Create Date: 2026-08-04
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "p5e6f7a8b9c0"
down_revision: Union[str, Sequence[str], None] = "o4d5e6f7a8b9"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("rentals", sa.Column("access_token_hash", sa.String(), nullable=True))
    op.add_column("rentals", sa.Column("token_expires_at", sa.DateTime(), nullable=True))
    op.add_column("rentals", sa.Column("portal_sent_at", sa.DateTime(), nullable=True))
    op.create_index("ix_rentals_access_token_hash", "rentals", ["access_token_hash"], unique=True)


def downgrade() -> None:
    op.drop_index("ix_rentals_access_token_hash", table_name="rentals")
    op.drop_column("rentals", "portal_sent_at")
    op.drop_column("rentals", "token_expires_at")
    op.drop_column("rentals", "access_token_hash")
