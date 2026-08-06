"""add removal/pickup fee to rental items

Revision ID: v1e2f3a4b5c6
Revises: u0d1e2f3a4b5
"""
from alembic import op
import sqlalchemy as sa

revision = "v1e2f3a4b5c6"
down_revision = "u0d1e2f3a4b5"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        "rental_items",
        sa.Column("removal_fee", sa.Numeric(10, 2), nullable=False, server_default="0"),
    )


def downgrade():
    op.drop_column("rental_items", "removal_fee")
