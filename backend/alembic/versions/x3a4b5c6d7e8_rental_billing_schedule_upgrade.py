"""upgrade rental schedules, discounts, and item deposits

Revision ID: x3a4b5c6d7e8
Revises: w2f3a4b5c6d7
"""
from alembic import op
import sqlalchemy as sa


revision = "x3a4b5c6d7e8"
down_revision = "w2f3a4b5c6d7"
branch_labels = None
depends_on = None


def upgrade():
    # PostgreSQL enums require an explicit additive migration. Existing values
    # and rows remain untouched.
    op.execute("ALTER TYPE billingfrequency ADD VALUE IF NOT EXISTS 'CUSTOM'")

    op.add_column("rental_product_rates", sa.Column("daily_rate", sa.Numeric(10, 2), nullable=True))

    op.add_column("rentals", sa.Column("discount_application_mode", sa.String(), nullable=False, server_default="single_invoice"))
    op.add_column("rentals", sa.Column("discount_invoice_number", sa.Integer(), nullable=True))
    op.add_column("rentals", sa.Column("discount_continue", sa.Boolean(), nullable=False, server_default=sa.false()))
    op.add_column("rentals", sa.Column("discount_requires_card", sa.Boolean(), nullable=False, server_default=sa.false()))

    # Preserve the old "after N periods" behavior as invoice N+1.
    op.execute(
        """
        UPDATE rentals
           SET discount_invoice_number = discount_apply_after_periods + 1
         WHERE discount_type IS NOT NULL
           AND discount_apply_after_periods IS NOT NULL
        """
    )

    op.add_column("rental_items", sa.Column("security_deposit", sa.Numeric(10, 2), nullable=False, server_default="0"))
    op.add_column("rental_items", sa.Column("deposit_status", sa.String(), nullable=True))
    op.add_column("rental_items", sa.Column("deposit_settled_amount", sa.Numeric(10, 2), nullable=True))

    # A legacy agreement only had one aggregate deposit. Assign it to its first
    # item so the aggregate and every historical invoice remain exactly equal.
    op.execute(
        """
        UPDATE rental_items AS ri
           SET security_deposit = r.security_deposit / GREATEST(COALESCE(ri.quantity, 1), 1),
               deposit_status = r.deposit_status,
               deposit_settled_amount = r.deposit_settled_amount
          FROM rentals AS r
         WHERE ri.rental_id = r.id
           AND ri.id = (SELECT MIN(first_item.id) FROM rental_items AS first_item WHERE first_item.rental_id = r.id)
        """
    )


def downgrade():
    op.drop_column("rental_items", "deposit_settled_amount")
    op.drop_column("rental_items", "deposit_status")
    op.drop_column("rental_items", "security_deposit")
    op.drop_column("rentals", "discount_requires_card")
    op.drop_column("rentals", "discount_continue")
    op.drop_column("rentals", "discount_invoice_number")
    op.drop_column("rentals", "discount_application_mode")
    op.drop_column("rental_product_rates", "daily_rate")
    # CUSTOM is intentionally retained because PostgreSQL cannot safely remove
    # an enum value in-place during downgrade.
