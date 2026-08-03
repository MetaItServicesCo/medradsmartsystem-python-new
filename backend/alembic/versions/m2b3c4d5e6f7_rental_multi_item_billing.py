"""rental multi-item, product rate card, recurring billing + commitment discount

Revision ID: m2b3c4d5e6f7
Revises: l1a2b3c4d5e6
Create Date: 2026-08-04
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "m2b3c4d5e6f7"
down_revision: Union[str, Sequence[str], None] = "l1a2b3c4d5e6"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # 1) Extend the native billing-frequency enum. ADD VALUE must run outside the
    #    migration's transaction on older Postgres; the autocommit block handles it.
    with op.get_context().autocommit_block():
        op.execute("ALTER TYPE billingfrequency ADD VALUE IF NOT EXISTS 'BIWEEKLY'")
        op.execute("ALTER TYPE billingfrequency ADD VALUE IF NOT EXISTS 'QUARTERLY'")

    # 2) New agreement-level columns: recurring billing, auto-charge, commitment
    #    discount, deposit settlement.
    op.add_column("rentals", sa.Column("auto_charge", sa.Boolean(), nullable=False, server_default=sa.false()))
    op.add_column("rentals", sa.Column("payment_authorization_id", sa.Integer(), nullable=True))
    op.add_column("rentals", sa.Column("committed_periods", sa.Integer(), nullable=True))
    op.add_column("rentals", sa.Column("periods_billed", sa.Integer(), nullable=False, server_default="0"))
    op.add_column("rentals", sa.Column("next_bill_date", sa.Date(), nullable=True))
    op.add_column("rentals", sa.Column("discount_type", sa.String(), nullable=True))
    op.add_column("rentals", sa.Column("discount_value", sa.Numeric(10, 2), nullable=True))
    op.add_column("rentals", sa.Column("discount_apply_after_periods", sa.Integer(), nullable=True))
    op.add_column("rentals", sa.Column("deposit_status", sa.String(), nullable=True))
    op.add_column("rentals", sa.Column("deposit_settled_amount", sa.Numeric(10, 2), nullable=True))

    # 3) Relax legacy single-item NOT NULLs so item-based agreements can omit them.
    op.alter_column("rentals", "rental_rate", existing_type=sa.Numeric(10, 2), nullable=True)
    op.alter_column("rentals", "quantity", existing_type=sa.Integer(), nullable=True)
    op.alter_column("rentals", "shipping_fee", existing_type=sa.Numeric(10, 2), nullable=True)
    op.alter_column("rentals", "setup_fee", existing_type=sa.Numeric(10, 2), nullable=True)

    # 4) rental_items child table (multiple items + partial returns per agreement).
    op.create_table(
        "rental_items",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("rental_id", sa.Integer(), sa.ForeignKey("rentals.id", ondelete="CASCADE"), nullable=False),
        sa.Column("part_id", sa.Integer(), sa.ForeignKey("inventory_parts.id"), nullable=True),
        sa.Column("equipment_id", sa.Integer(), sa.ForeignKey("equipment.id"), nullable=True),
        sa.Column("part_number", sa.String(), nullable=True),
        sa.Column("part_description", sa.String(), nullable=True),
        sa.Column("quantity", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("rental_rate", sa.Numeric(10, 2), nullable=False, server_default="0"),
        sa.Column("item_condition", sa.String(), nullable=True),
        sa.Column("shipping_fee", sa.Numeric(10, 2), nullable=False, server_default="0"),
        sa.Column("setup_fee", sa.Numeric(10, 2), nullable=False, server_default="0"),
        sa.Column("initial_condition", sa.Text(), nullable=True),
        sa.Column("return_condition", sa.Text(), nullable=True),
        sa.Column("initial_meter_reading", sa.Text(), nullable=True),
        sa.Column("final_meter_reading", sa.Integer(), nullable=True),
        sa.Column("returned_at", sa.Date(), nullable=True),
        sa.Column("item_status", sa.String(), nullable=False, server_default="out"),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_rental_items_id", "rental_items", ["id"])
    op.create_index("ix_rental_items_rental_id", "rental_items", ["rental_id"])
    op.create_index("ix_rental_items_part_id", "rental_items", ["part_id"])

    # 5) rental_product_rates rate card (term-tiered pricing per rental product).
    op.create_table(
        "rental_product_rates",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("part_id", sa.Integer(), sa.ForeignKey("inventory_parts.id", ondelete="CASCADE"), nullable=False),
        sa.Column("weekly_rate", sa.Numeric(10, 2), nullable=True),
        sa.Column("biweekly_rate", sa.Numeric(10, 2), nullable=True),
        sa.Column("monthly_rate", sa.Numeric(10, 2), nullable=True),
        sa.Column("quarterly_rate", sa.Numeric(10, 2), nullable=True),
        sa.Column("default_deposit", sa.Numeric(10, 2), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_rental_product_rates_id", "rental_product_rates", ["id"])
    op.create_index("ix_rental_product_rates_part_id", "rental_product_rates", ["part_id"], unique=True)

    # 6) Backfill one rental_item per existing agreement from its legacy columns,
    #    so current data reads correctly under the new multi-item model.
    op.execute(
        """
        INSERT INTO rental_items (
            rental_id, part_id, equipment_id, part_number, part_description,
            quantity, rental_rate, item_condition, shipping_fee, setup_fee,
            initial_condition, return_condition, initial_meter_reading,
            final_meter_reading, returned_at, item_status, created_at
        )
        SELECT
            r.id, r.part_id, r.equipment_id, p.part_number, p.description,
            COALESCE(r.quantity, 1), COALESCE(r.rental_rate, 0), r.item_condition,
            COALESCE(r.shipping_fee, 0), COALESCE(r.setup_fee, 0),
            r.initial_condition, r.return_condition, r.initial_meter_reading,
            r.final_meter_reading, r.actual_return_date,
            CASE WHEN r.actual_return_date IS NOT NULL OR r.status::text = 'COMPLETED'
                 THEN 'returned' ELSE 'out' END,
            now()
        FROM rentals r
        LEFT JOIN inventory_parts p ON p.id = r.part_id
        """
    )


def downgrade() -> None:
    op.drop_index("ix_rental_product_rates_part_id", table_name="rental_product_rates")
    op.drop_index("ix_rental_product_rates_id", table_name="rental_product_rates")
    op.drop_table("rental_product_rates")

    op.drop_index("ix_rental_items_part_id", table_name="rental_items")
    op.drop_index("ix_rental_items_rental_id", table_name="rental_items")
    op.drop_index("ix_rental_items_id", table_name="rental_items")
    op.drop_table("rental_items")

    # Restore legacy NOT NULLs (best-effort; assumes no item-based rows created).
    op.alter_column("rentals", "setup_fee", existing_type=sa.Numeric(10, 2), nullable=False)
    op.alter_column("rentals", "shipping_fee", existing_type=sa.Numeric(10, 2), nullable=False)
    op.alter_column("rentals", "quantity", existing_type=sa.Integer(), nullable=False)
    op.alter_column("rentals", "rental_rate", existing_type=sa.Numeric(10, 2), nullable=False)

    for col in (
        "deposit_settled_amount", "deposit_status", "discount_apply_after_periods",
        "discount_value", "discount_type", "next_bill_date", "periods_billed",
        "committed_periods", "payment_authorization_id", "auto_charge",
    ):
        op.drop_column("rentals", col)

    # billingfrequency enum values (BIWEEKLY/QUARTERLY) are intentionally left in
    # place — Postgres cannot drop enum values, and leaving them is harmless.
