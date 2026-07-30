"""sales inventory reservations

Revision ID: k0f1a2b3c4d5
Revises: j9e0f1a2b3c4
Create Date: 2026-07-30
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "k0f1a2b3c4d5"
down_revision: Union[str, Sequence[str], None] = "j9e0f1a2b3c4"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "sales_inventory_reservations",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "quotation_id",
            sa.Integer(),
            sa.ForeignKey("sales_quotations.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "invoice_id",
            sa.Integer(),
            sa.ForeignKey("invoices.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "part_id",
            sa.Integer(),
            sa.ForeignKey("inventory_parts.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column("quantity", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(), nullable=False, server_default="active"),
        sa.Column("released_at", sa.DateTime(), nullable=True),
        sa.Column("fulfilled_at", sa.DateTime(), nullable=True),
        sa.Column("release_reason", sa.String(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.CheckConstraint("quantity > 0", name="ck_sales_inventory_reservation_quantity_positive"),
        sa.CheckConstraint(
            "status IN ('active', 'released', 'fulfilled')",
            name="ck_sales_inventory_reservation_status",
        ),
        sa.UniqueConstraint(
            "quotation_id",
            "part_id",
            name="uq_sales_inventory_reservation_quote_part",
        ),
    )
    op.create_index(
        "ix_sales_inventory_reservations_id",
        "sales_inventory_reservations",
        ["id"],
    )
    op.create_index(
        "ix_sales_inventory_reservations_quotation_id",
        "sales_inventory_reservations",
        ["quotation_id"],
    )
    op.create_index(
        "ix_sales_inventory_reservations_invoice_id",
        "sales_inventory_reservations",
        ["invoice_id"],
    )
    op.create_index(
        "ix_sales_inventory_reservations_part_id",
        "sales_inventory_reservations",
        ["part_id"],
    )
    op.create_index(
        "ix_sales_inventory_reservations_status",
        "sales_inventory_reservations",
        ["status"],
    )
    op.create_index(
        "ix_sales_inventory_reservation_part_status",
        "sales_inventory_reservations",
        ["part_id", "status"],
    )
    op.create_index(
        "ix_sales_inventory_reservation_invoice_status",
        "sales_inventory_reservations",
        ["invoice_id", "status"],
    )
    # Preserve production continuity: reserve stock for existing unpaid Sales
    # invoices in invoice creation order, but never over-reserve a part.
    op.execute(
        """
        WITH demand AS (
            SELECT
                i.id AS invoice_id,
                i.sales_quotation_id AS quotation_id,
                li.part_id,
                SUM(li.quantity)::integer AS quantity,
                i.created_at
            FROM invoices AS i
            JOIN sales_quotations AS q
              ON q.id = i.sales_quotation_id
            JOIN sales_quotation_line_items AS li
              ON li.quotation_id = q.id
            WHERE i.invoice_type = 'SALES'
              AND i.status IN ('PENDING', 'PARTIALLY_PAID')
              AND li.item_kind = 'product'
              AND li.part_id IS NOT NULL
              AND (
                    q.quotation_type NOT IN ('choice_single', 'choice_multiple')
                    OR li.is_selected = TRUE
              )
            GROUP BY i.id, i.sales_quotation_id, li.part_id, i.created_at
        ),
        ranked AS (
            SELECT
                demand.*,
                SUM(demand.quantity) OVER (
                    PARTITION BY demand.part_id
                    ORDER BY demand.created_at, demand.invoice_id
                    ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
                ) AS cumulative_quantity
            FROM demand
        )
        INSERT INTO sales_inventory_reservations (
            quotation_id,
            invoice_id,
            part_id,
            quantity,
            status,
            created_at,
            updated_at
        )
        SELECT
            ranked.quotation_id,
            ranked.invoice_id,
            ranked.part_id,
            ranked.quantity,
            'active',
            NOW(),
            NOW()
        FROM ranked
        JOIN inventory_parts AS part
          ON part.id = ranked.part_id
        WHERE ranked.cumulative_quantity <= COALESCE(part.quantity_on_hand, 0)
        """
    )


def downgrade() -> None:
    op.drop_table("sales_inventory_reservations")
