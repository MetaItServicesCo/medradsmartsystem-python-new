"""Add structured secondary recipients to rental agreements.

Revision ID: z5c6d7e8f9a0
Revises: y4b5c6d7e8f9
"""

from alembic import op
import sqlalchemy as sa


revision = "z5c6d7e8f9a0"
down_revision = "y4b5c6d7e8f9"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "rentals",
        sa.Column(
            "secondary_recipients",
            sa.JSON(),
            nullable=False,
            server_default=sa.text("'[]'::json"),
        ),
    )


def downgrade() -> None:
    op.drop_column("rentals", "secondary_recipients")
