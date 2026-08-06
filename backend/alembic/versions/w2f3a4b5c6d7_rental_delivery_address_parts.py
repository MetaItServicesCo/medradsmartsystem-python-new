"""add structured delivery address parts to rentals

Revision ID: w2f3a4b5c6d7
Revises: v1e2f3a4b5c6
"""
from alembic import op
import sqlalchemy as sa

revision = "w2f3a4b5c6d7"
down_revision = "v1e2f3a4b5c6"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("rentals", sa.Column("delivery_street", sa.String(), nullable=True))
    op.add_column("rentals", sa.Column("delivery_city", sa.String(), nullable=True))
    op.add_column("rentals", sa.Column("delivery_state", sa.String(), nullable=True))
    op.add_column("rentals", sa.Column("delivery_zip", sa.String(), nullable=True))


def downgrade():
    op.drop_column("rentals", "delivery_zip")
    op.drop_column("rentals", "delivery_state")
    op.drop_column("rentals", "delivery_city")
    op.drop_column("rentals", "delivery_street")
