"""sales quotations

Revision ID: 4c8d2e7f9012
Revises: 2d9e7a1b6c45
Create Date: 2026-05-29 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "4c8d2e7f9012"
down_revision: Union[str, Sequence[str], None] = "2d9e7a1b6c45"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _table_exists(table_name: str) -> bool:
    return sa.inspect(op.get_bind()).has_table(table_name)


def _column_exists(table_name: str, column_name: str) -> bool:
    if not _table_exists(table_name):
        return False
    return any(column["name"] == column_name for column in sa.inspect(op.get_bind()).get_columns(table_name))


def _fk_exists(table_name: str, constraint_name: str) -> bool:
    if not _table_exists(table_name):
        return False
    return any(fk["name"] == constraint_name for fk in sa.inspect(op.get_bind()).get_foreign_keys(table_name))


def upgrade() -> None:
    if not _table_exists("sales_quotations"):
        op.create_table(
            "sales_quotations",
            sa.Column("id", sa.Integer(), nullable=False),
            sa.Column("quotation_number", sa.String(), nullable=False),
            sa.Column("work_order", sa.String(), nullable=False),
            sa.Column("facility_id", sa.Integer(), nullable=True),
            sa.Column("created_by_id", sa.Integer(), nullable=False),
            sa.Column("converted_invoice_id", sa.Integer(), nullable=True),
            sa.Column("customer_name", sa.String(), nullable=False),
            sa.Column("customer_email", sa.String(), nullable=True),
            sa.Column("customer_phone", sa.String(), nullable=True),
            sa.Column("customer_address", sa.Text(), nullable=True),
            sa.Column("quotation_type", sa.String(), nullable=False, server_default="standard"),
            sa.Column("status", sa.String(), nullable=False, server_default="pending"),
            sa.Column("paid_status", sa.String(), nullable=False, server_default="unpaid"),
            sa.Column("requested_date", sa.Date(), nullable=True),
            sa.Column("notes", sa.Text(), nullable=True),
            sa.Column("subtotal", sa.Numeric(10, 2), nullable=False, server_default="0"),
            sa.Column("tax_amount", sa.Numeric(10, 2), nullable=False, server_default="0"),
            sa.Column("discount_amount", sa.Numeric(10, 2), nullable=False, server_default="0"),
            sa.Column("total_amount", sa.Numeric(10, 2), nullable=False, server_default="0"),
            sa.Column("history", sa.JSON(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=True),
            sa.Column("updated_at", sa.DateTime(), nullable=True),
            sa.ForeignKeyConstraint(["facility_id"], ["facilities.id"]),
            sa.ForeignKeyConstraint(["created_by_id"], ["users.id"]),
            sa.ForeignKeyConstraint(["converted_invoice_id"], ["invoices.id"]),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint("quotation_number"),
            sa.UniqueConstraint("work_order"),
        )
    if _table_exists("sales_quotations"):
        op.execute(sa.text("CREATE INDEX IF NOT EXISTS ix_sales_quotations_quotation_number ON sales_quotations (quotation_number)"))
        op.execute(sa.text("CREATE INDEX IF NOT EXISTS ix_sales_quotations_work_order ON sales_quotations (work_order)"))
        op.execute(sa.text("CREATE INDEX IF NOT EXISTS ix_sales_quotations_facility_id ON sales_quotations (facility_id)"))
        op.execute(sa.text("CREATE INDEX IF NOT EXISTS ix_sales_quotations_status ON sales_quotations (status)"))
        op.execute(sa.text("CREATE INDEX IF NOT EXISTS ix_sales_quotations_paid_status ON sales_quotations (paid_status)"))

    if not _table_exists("sales_quotation_line_items"):
        op.create_table(
            "sales_quotation_line_items",
            sa.Column("id", sa.Integer(), nullable=False),
            sa.Column("quotation_id", sa.Integer(), nullable=False),
            sa.Column("part_id", sa.Integer(), nullable=False),
            sa.Column("description", sa.Text(), nullable=False),
            sa.Column("quantity", sa.Integer(), nullable=False, server_default="1"),
            sa.Column("unit_price", sa.Numeric(10, 2), nullable=False, server_default="0"),
            sa.Column("total", sa.Numeric(10, 2), nullable=False, server_default="0"),
            sa.Column("created_at", sa.DateTime(), nullable=True),
            sa.ForeignKeyConstraint(["part_id"], ["inventory_parts.id"]),
            sa.ForeignKeyConstraint(["quotation_id"], ["sales_quotations.id"], ondelete="CASCADE"),
            sa.PrimaryKeyConstraint("id"),
        )
    if _table_exists("sales_quotation_line_items"):
        op.execute(sa.text("CREATE INDEX IF NOT EXISTS ix_sales_quotation_line_items_quotation_id ON sales_quotation_line_items (quotation_id)"))
        op.execute(sa.text("CREATE INDEX IF NOT EXISTS ix_sales_quotation_line_items_part_id ON sales_quotation_line_items (part_id)"))

    if _table_exists("invoices") and not _column_exists("invoices", "sales_quotation_id"):
        op.add_column("invoices", sa.Column("sales_quotation_id", sa.Integer(), nullable=True))
    if _table_exists("invoices") and _column_exists("invoices", "sales_quotation_id"):
        op.execute(sa.text("CREATE INDEX IF NOT EXISTS ix_invoices_sales_quotation_id ON invoices (sales_quotation_id)"))
        if not _fk_exists("invoices", "fk_invoices_sales_quotation_id_sales_quotations"):
            op.create_foreign_key(
                "fk_invoices_sales_quotation_id_sales_quotations",
                "invoices",
                "sales_quotations",
                ["sales_quotation_id"],
                ["id"],
            )


def downgrade() -> None:
    if _table_exists("invoices"):
        if _fk_exists("invoices", "fk_invoices_sales_quotation_id_sales_quotations"):
            op.drop_constraint("fk_invoices_sales_quotation_id_sales_quotations", "invoices", type_="foreignkey")
        if _column_exists("invoices", "sales_quotation_id"):
            op.drop_column("invoices", "sales_quotation_id")
    if _table_exists("sales_quotation_line_items"):
        op.drop_table("sales_quotation_line_items")
    if _table_exists("sales_quotations"):
        op.drop_table("sales_quotations")
