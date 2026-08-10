"""Reusable rental discount packages.

Revision ID: y4b5c6d7e8f9
Revises: x3a4b5c6d7e8
"""

from alembic import op
import sqlalchemy as sa


revision = "y4b5c6d7e8f9"
down_revision = "x3a4b5c6d7e8"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "rental_discount_packages",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("name_key", sa.String(length=120), nullable=False),
        sa.Column("discount_type", sa.String(length=20), nullable=False),
        sa.Column("discount_value", sa.Numeric(10, 2), nullable=False),
        sa.Column("application_mode", sa.String(length=30), nullable=False, server_default="single_invoice"),
        sa.Column("invoice_number", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("continue_after", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("requires_saved_card", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("created_by_id", sa.Integer(), nullable=True),
        sa.Column("updated_by_id", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.ForeignKeyConstraint(["created_by_id"], ["users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["updated_by_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("name_key", name="uq_rental_discount_packages_name_key"),
    )
    op.create_index("ix_rental_discount_packages_id", "rental_discount_packages", ["id"])
    op.create_index("ix_rental_discount_packages_name_key", "rental_discount_packages", ["name_key"])
    op.create_index("ix_rental_discount_packages_is_active", "rental_discount_packages", ["is_active"])


def downgrade() -> None:
    op.drop_index("ix_rental_discount_packages_is_active", table_name="rental_discount_packages")
    op.drop_index("ix_rental_discount_packages_name_key", table_name="rental_discount_packages")
    op.drop_index("ix_rental_discount_packages_id", table_name="rental_discount_packages")
    op.drop_table("rental_discount_packages")
