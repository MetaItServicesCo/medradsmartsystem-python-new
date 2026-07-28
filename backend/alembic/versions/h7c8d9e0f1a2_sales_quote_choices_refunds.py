"""sales quotation choices, trade-ins, and invoice refunds

Revision ID: h7c8d9e0f1a2
Revises: g6b7c8d9e0f1
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "h7c8d9e0f1a2"
down_revision: Union[str, Sequence[str], None] = "g6b7c8d9e0f1"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("sales_quotations", sa.Column("accepted_by_id", sa.Integer(), nullable=True))
    op.add_column("sales_quotations", sa.Column("selection_status", sa.String(), server_default="pending", nullable=False))
    op.add_column("sales_quotations", sa.Column("selection_channel", sa.String(), nullable=True))
    op.add_column("sales_quotations", sa.Column("selection_snapshot", sa.JSON(), nullable=True))
    op.add_column("sales_quotations", sa.Column("accepted_at", sa.DateTime(), nullable=True))
    op.create_foreign_key(
        "fk_sales_quotations_accepted_by_id_users",
        "sales_quotations", "users", ["accepted_by_id"], ["id"],
    )
    op.create_index("ix_sales_quotations_selection_status", "sales_quotations", ["selection_status"])

    op.alter_column("sales_quotation_line_items", "part_id", existing_type=sa.Integer(), nullable=True)
    op.add_column("sales_quotation_line_items", sa.Column("item_kind", sa.String(), server_default="product", nullable=False))
    op.add_column("sales_quotation_line_items", sa.Column("is_default", sa.Boolean(), server_default=sa.false(), nullable=False))
    op.add_column("sales_quotation_line_items", sa.Column("is_selected", sa.Boolean(), server_default=sa.false(), nullable=False))
    op.add_column("sales_quotation_line_items", sa.Column("item_metadata", sa.JSON(), nullable=True))
    op.create_index("ix_sales_quotation_line_items_item_kind", "sales_quotation_line_items", ["item_kind"])

    op.add_column("invoices", sa.Column("refunded_amount", sa.Numeric(10, 2), server_default="0", nullable=False))
    op.add_column("invoices", sa.Column("refund_status", sa.String(), server_default="none", nullable=False))

    # Existing quotations retain their original required-all behavior.
    op.execute(
        """
        UPDATE sales_quotation_line_items
        SET is_default = TRUE, is_selected = TRUE
        WHERE quotation_id IN (
            SELECT id FROM sales_quotations
            WHERE quotation_type NOT IN ('choice_single', 'choice_multiple')
        )
        """
    )


def downgrade() -> None:
    op.drop_column("invoices", "refund_status")
    op.drop_column("invoices", "refunded_amount")
    op.drop_index("ix_sales_quotation_line_items_item_kind", table_name="sales_quotation_line_items")
    op.drop_column("sales_quotation_line_items", "item_metadata")
    op.drop_column("sales_quotation_line_items", "is_selected")
    op.drop_column("sales_quotation_line_items", "is_default")
    op.drop_column("sales_quotation_line_items", "item_kind")
    op.execute("DELETE FROM sales_quotation_line_items WHERE part_id IS NULL")
    op.alter_column("sales_quotation_line_items", "part_id", existing_type=sa.Integer(), nullable=False)
    op.drop_index("ix_sales_quotations_selection_status", table_name="sales_quotations")
    op.drop_constraint("fk_sales_quotations_accepted_by_id_users", "sales_quotations", type_="foreignkey")
    op.drop_column("sales_quotations", "accepted_at")
    op.drop_column("sales_quotations", "selection_snapshot")
    op.drop_column("sales_quotations", "selection_channel")
    op.drop_column("sales_quotations", "selection_status")
    op.drop_column("sales_quotations", "accepted_by_id")
