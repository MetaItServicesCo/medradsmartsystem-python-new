"""facility tiers and parts inventory

Revision ID: f42a9d3160b7
Revises: 03659694904d
Create Date: 2026-05-08 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "f42a9d3160b7"
down_revision: Union[str, Sequence[str], None] = "03659694904d"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _table_exists(table_name: str) -> bool:
    return sa.inspect(op.get_bind()).has_table(table_name)


def _column_exists(table_name: str, column_name: str) -> bool:
    if not _table_exists(table_name):
        return False
    return any(column["name"] == column_name for column in sa.inspect(op.get_bind()).get_columns(table_name))


def _index_exists(table_name: str, index_name: str) -> bool:
    if not _table_exists(table_name):
        return False
    return any(index["name"] == index_name for index in sa.inspect(op.get_bind()).get_indexes(table_name))


def _add_column_if_missing(table_name: str, column: sa.Column) -> None:
    if not _column_exists(table_name, column.name):
        op.add_column(table_name, column)


def _create_index_if_missing(index_name: str, table_name: str, columns: list[str]) -> None:
    if _table_exists(table_name) and all(_column_exists(table_name, column) for column in columns) and not _index_exists(table_name, index_name):
        op.create_index(index_name, table_name, columns, unique=False)


def upgrade() -> None:
    if not _table_exists("facility_tiers"):
        op.create_table(
            "facility_tiers",
            sa.Column("id", sa.Integer(), nullable=False),
            sa.Column("facility_id", sa.Integer(), nullable=False),
            sa.Column("tier_id", sa.Integer(), nullable=False),
            sa.Column("usage_context", sa.String(), nullable=True),
            sa.Column("assigned_at", sa.DateTime(), nullable=True),
            sa.ForeignKeyConstraint(["facility_id"], ["facilities.id"], ondelete="CASCADE"),
            sa.ForeignKeyConstraint(["tier_id"], ["tiers.id"], ondelete="CASCADE"),
            sa.PrimaryKeyConstraint("id"),
        )
    else:
        _add_column_if_missing("facility_tiers", sa.Column("usage_context", sa.String(), nullable=True))
        _add_column_if_missing("facility_tiers", sa.Column("assigned_at", sa.DateTime(), nullable=True))

    _create_index_if_missing("ix_facility_tiers_id", "facility_tiers", ["id"])
    _create_index_if_missing("ix_facility_tiers_facility_id", "facility_tiers", ["facility_id"])
    _create_index_if_missing("ix_facility_tiers_tier_id", "facility_tiers", ["tier_id"])

    if not _table_exists("inventory_parts"):
        op.create_table(
            "inventory_parts",
            sa.Column("id", sa.Integer(), nullable=False),
            sa.Column("facility_id", sa.Integer(), nullable=False),
            sa.Column("tier_id", sa.Integer(), nullable=True),
            sa.Column("part_number", sa.String(), nullable=False),
            sa.Column("part_type", sa.String(), nullable=False),
            sa.Column("description", sa.Text(), nullable=False),
            sa.Column("make", sa.String(), nullable=True),
            sa.Column("model", sa.String(), nullable=True),
            sa.Column("unit_price", sa.Numeric(10, 2), nullable=False),
            sa.Column("condition", sa.String(), nullable=False),
            sa.Column("supplier_name", sa.String(), nullable=True),
            sa.Column("supplier_contact", sa.String(), nullable=True),
            sa.Column("supplier_email", sa.String(), nullable=True),
            sa.Column("supplier_phone", sa.String(), nullable=True),
            sa.Column("technical_specs", sa.JSON(), nullable=True),
            sa.Column("batch_number", sa.String(), nullable=True),
            sa.Column("expiry_date", sa.Date(), nullable=True),
            sa.Column("serial_number", sa.String(), nullable=True),
            sa.Column("is_critical", sa.Boolean(), nullable=True),
            sa.Column("quantity_on_hand", sa.Integer(), nullable=False),
            sa.Column("reorder_level", sa.Integer(), nullable=False),
            sa.Column("location", sa.String(), nullable=True),
            sa.Column("status", sa.String(), nullable=False),
            sa.Column("created_at", sa.DateTime(), nullable=True),
            sa.Column("updated_at", sa.DateTime(), nullable=True),
            sa.ForeignKeyConstraint(["facility_id"], ["facilities.id"]),
            sa.ForeignKeyConstraint(["tier_id"], ["tiers.id"]),
            sa.PrimaryKeyConstraint("id"),
        )
    else:
        _add_column_if_missing("inventory_parts", sa.Column("tier_id", sa.Integer(), nullable=True))
        _add_column_if_missing("inventory_parts", sa.Column("supplier_contact", sa.String(), nullable=True))
        _add_column_if_missing("inventory_parts", sa.Column("supplier_email", sa.String(), nullable=True))
        _add_column_if_missing("inventory_parts", sa.Column("supplier_phone", sa.String(), nullable=True))
        _add_column_if_missing("inventory_parts", sa.Column("technical_specs", sa.JSON(), nullable=True))
        _add_column_if_missing("inventory_parts", sa.Column("batch_number", sa.String(), nullable=True))
        _add_column_if_missing("inventory_parts", sa.Column("expiry_date", sa.Date(), nullable=True))
        _add_column_if_missing("inventory_parts", sa.Column("serial_number", sa.String(), nullable=True))
        _add_column_if_missing("inventory_parts", sa.Column("is_critical", sa.Boolean(), nullable=True))
        _add_column_if_missing("inventory_parts", sa.Column("location", sa.String(), nullable=True))
        _add_column_if_missing("inventory_parts", sa.Column("updated_at", sa.DateTime(), nullable=True))

    _create_index_if_missing("ix_inventory_parts_id", "inventory_parts", ["id"])
    _create_index_if_missing("ix_inventory_parts_facility_id", "inventory_parts", ["facility_id"])
    _create_index_if_missing("ix_inventory_parts_tier_id", "inventory_parts", ["tier_id"])
    _create_index_if_missing("ix_inventory_parts_part_number", "inventory_parts", ["part_number"])
    _create_index_if_missing("ix_inventory_parts_part_type", "inventory_parts", ["part_type"])
    _create_index_if_missing("ix_inventory_parts_batch_number", "inventory_parts", ["batch_number"])
    _create_index_if_missing("ix_inventory_parts_expiry_date", "inventory_parts", ["expiry_date"])
    _create_index_if_missing("ix_inventory_parts_serial_number", "inventory_parts", ["serial_number"])

    if not _table_exists("inventory_transactions"):
        op.create_table(
            "inventory_transactions",
            sa.Column("id", sa.Integer(), nullable=False),
            sa.Column("part_id", sa.Integer(), nullable=False),
            sa.Column("facility_id", sa.Integer(), nullable=False),
            sa.Column("transaction_type", sa.String(), nullable=False),
            sa.Column("quantity", sa.Integer(), nullable=False),
            sa.Column("unit_cost", sa.Numeric(10, 2), nullable=True),
            sa.Column("balance_after", sa.Integer(), nullable=False),
            sa.Column("from_facility_id", sa.Integer(), nullable=True),
            sa.Column("to_facility_id", sa.Integer(), nullable=True),
            sa.Column("authorization_reference", sa.String(), nullable=True),
            sa.Column("authorization_details", sa.Text(), nullable=True),
            sa.Column("notes", sa.Text(), nullable=True),
            sa.Column("created_by_id", sa.Integer(), nullable=False),
            sa.Column("created_at", sa.DateTime(), nullable=True),
            sa.ForeignKeyConstraint(["created_by_id"], ["users.id"]),
            sa.ForeignKeyConstraint(["facility_id"], ["facilities.id"]),
            sa.ForeignKeyConstraint(["from_facility_id"], ["facilities.id"]),
            sa.ForeignKeyConstraint(["part_id"], ["inventory_parts.id"], ondelete="CASCADE"),
            sa.ForeignKeyConstraint(["to_facility_id"], ["facilities.id"]),
            sa.PrimaryKeyConstraint("id"),
        )

    _create_index_if_missing("ix_inventory_transactions_id", "inventory_transactions", ["id"])
    _create_index_if_missing("ix_inventory_transactions_part_id", "inventory_transactions", ["part_id"])
    _create_index_if_missing("ix_inventory_transactions_facility_id", "inventory_transactions", ["facility_id"])
    _create_index_if_missing("ix_inventory_transactions_transaction_type", "inventory_transactions", ["transaction_type"])
    _create_index_if_missing("ix_inventory_transactions_created_at", "inventory_transactions", ["created_at"])


def downgrade() -> None:
    if _table_exists("inventory_transactions"):
        op.drop_table("inventory_transactions")
    if _table_exists("inventory_parts"):
        op.drop_table("inventory_parts")
    if _table_exists("facility_tiers"):
        op.drop_table("facility_tiers")
