"""equipment registration fields

Revision ID: b75d2c0e4c91
Revises: a4f2e8c1d903
Create Date: 2026-05-13 02:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "b75d2c0e4c91"
down_revision: Union[str, Sequence[str], None] = "a4f2e8c1d903"
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


def _fk_for_columns_exists(table_name: str, column_names: list[str], referred_table: str) -> bool:
    if not _table_exists(table_name):
        return False
    expected_columns = set(column_names)
    for fk in sa.inspect(op.get_bind()).get_foreign_keys(table_name):
        if set(fk.get("constrained_columns") or []) == expected_columns and fk.get("referred_table") == referred_table:
            return True
    return False


def _add_column_if_missing(table_name: str, column: sa.Column) -> None:
    if _table_exists(table_name) and not _column_exists(table_name, column.name):
        op.add_column(table_name, column)


def upgrade() -> None:
    if not _table_exists("equipment"):
        return

    columns = [
        sa.Column("inspection_form_id", sa.Integer(), nullable=True),
        sa.Column("default_picture_url", sa.Text(), nullable=True),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("risk_priority", sa.String(), nullable=True),
        sa.Column("risk_name", sa.String(), nullable=True),
        sa.Column("location", sa.String(), nullable=True),
        sa.Column("inventory_date", sa.Date(), nullable=True),
        sa.Column("acquisition_authorized_by", sa.String(), nullable=True),
        sa.Column("department", sa.String(), nullable=True),
        sa.Column("po_no", sa.String(), nullable=True),
        sa.Column("requester_first_name", sa.String(), nullable=True),
        sa.Column("requester_last_name", sa.String(), nullable=True),
        sa.Column("requester_phone", sa.String(), nullable=True),
        sa.Column("requester_fax", sa.String(), nullable=True),
        sa.Column("requester_mailing_address", sa.Text(), nullable=True),
        sa.Column("requester_email", sa.String(), nullable=True),
        sa.Column("owning_department", sa.String(), nullable=True),
        sa.Column("acquisition_method", sa.String(), nullable=True),
        sa.Column("acquired_company_name", sa.String(), nullable=True),
        sa.Column("acquired_account_number", sa.String(), nullable=True),
        sa.Column("acquired_sales_person", sa.String(), nullable=True),
        sa.Column("acquired_phone", sa.String(), nullable=True),
        sa.Column("acquired_email", sa.String(), nullable=True),
        sa.Column("acquired_mailing_address", sa.Text(), nullable=True),
        sa.Column("cost", sa.Numeric(10, 2), nullable=True),
        sa.Column("acquisition_date", sa.Date(), nullable=True),
        sa.Column("capital_equipment", sa.String(), nullable=True),
        sa.Column("warranty_duration", sa.String(), nullable=True),
        sa.Column("parts_duration", sa.String(), nullable=True),
        sa.Column("labor_duration", sa.String(), nullable=True),
        sa.Column("coverage_start_date", sa.Date(), nullable=True),
        sa.Column("coverage_type", sa.String(), nullable=True),
        sa.Column("part_warranty_end_date", sa.Date(), nullable=True),
        sa.Column("labor_warranty_end_date", sa.Date(), nullable=True),
        sa.Column("pm_scheduling", sa.String(), nullable=True),
        sa.Column("installation_date", sa.Date(), nullable=True),
        sa.Column("last_pm_date", sa.Date(), nullable=True),
        sa.Column("next_generated_pm_date", sa.Date(), nullable=True),
    ]
    for column in columns:
        _add_column_if_missing("equipment", column)

    if (
        _table_exists("inspection_forms")
        and _column_exists("equipment", "inspection_form_id")
        and not _fk_exists("equipment", "fk_equipment_inspection_form_id_inspection_forms")
        and not _fk_for_columns_exists("equipment", ["inspection_form_id"], "inspection_forms")
    ):
        op.create_foreign_key(
            "fk_equipment_inspection_form_id_inspection_forms",
            "equipment",
            "inspection_forms",
            ["inspection_form_id"],
            ["id"],
        )


def downgrade() -> None:
    if not _table_exists("equipment"):
        return
    if _fk_exists("equipment", "fk_equipment_inspection_form_id_inspection_forms"):
        op.drop_constraint("fk_equipment_inspection_form_id_inspection_forms", "equipment", type_="foreignkey")
    for column_name in [
        "next_generated_pm_date", "last_pm_date", "installation_date", "pm_scheduling",
        "labor_warranty_end_date", "part_warranty_end_date", "coverage_type", "coverage_start_date",
        "labor_duration", "parts_duration", "warranty_duration", "capital_equipment",
        "acquisition_date", "cost", "acquired_mailing_address", "acquired_email", "acquired_phone",
        "acquired_sales_person", "acquired_account_number", "acquired_company_name",
        "acquisition_method", "owning_department", "requester_email", "requester_mailing_address",
        "requester_fax", "requester_phone", "requester_last_name", "requester_first_name",
        "po_no", "department", "acquisition_authorized_by", "inventory_date", "location",
        "risk_name", "risk_priority", "description", "default_picture_url", "inspection_form_id",
    ]:
        if _column_exists("equipment", column_name):
            op.drop_column("equipment", column_name)
