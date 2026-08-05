"""link rental agreements to customer facilities and users

Revision ID: t9c0d1e2f3a4
Revises: s8b9c0d1e2f3
Create Date: 2026-08-06
"""

from alembic import op
import sqlalchemy as sa


revision = "t9c0d1e2f3a4"
down_revision = "s8b9c0d1e2f3"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("rentals", sa.Column("facility_id", sa.Integer(), nullable=True))
    op.add_column("rentals", sa.Column("customer_user_id", sa.Integer(), nullable=True))
    op.create_foreign_key(
        "fk_rentals_facility_id", "rentals", "facilities", ["facility_id"], ["id"], ondelete="SET NULL"
    )
    op.create_foreign_key(
        "fk_rentals_customer_user_id", "rentals", "users", ["customer_user_id"], ["id"], ondelete="SET NULL"
    )
    op.create_index("ix_rentals_facility_id", "rentals", ["facility_id"], unique=False)
    op.create_index("ix_rentals_customer_user_id", "rentals", ["customer_user_id"], unique=False)

    # Do not guess identity for legacy agreements from a product location,
    # invoice snapshot, customer name, or email. Those values are not reliable
    # customer identifiers. Existing rows keep their established legacy access
    # fallback; new/edited agreements can be linked explicitly and safely.


def downgrade() -> None:
    op.drop_index("ix_rentals_customer_user_id", table_name="rentals")
    op.drop_index("ix_rentals_facility_id", table_name="rentals")
    op.drop_constraint("fk_rentals_customer_user_id", "rentals", type_="foreignkey")
    op.drop_constraint("fk_rentals_facility_id", "rentals", type_="foreignkey")
    op.drop_column("rentals", "customer_user_id")
    op.drop_column("rentals", "facility_id")
