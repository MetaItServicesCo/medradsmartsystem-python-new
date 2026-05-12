"""inventory equipment registration fields

Revision ID: a4f2e8c1d903
Revises: 91e77c5ab2da
Create Date: 2026-05-13 01:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "a4f2e8c1d903"
down_revision: Union[str, Sequence[str], None] = "91e77c5ab2da"
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


def _fk_exists(table_name: str, constraint_name: str) -> bool:
    if not _table_exists(table_name):
        return False
    return any(fk["name"] == constraint_name for fk in sa.inspect(op.get_bind()).get_foreign_keys(table_name))


def _add_column_if_missing(table_name: str, column: sa.Column) -> None:
    if _table_exists(table_name) and not _column_exists(table_name, column.name):
        op.add_column(table_name, column)


def _create_fk_if_missing(name: str, source: str, referent: str, local_cols: list[str], remote_cols: list[str]) -> None:
    if _table_exists(source) and _table_exists(referent) and not _fk_exists(source, name):
        op.create_foreign_key(name, source, referent, local_cols, remote_cols)


def upgrade() -> None:
    if not _table_exists("inventory_parts"):
        return

    columns = [
        sa.Column("modality_id", sa.Integer(), nullable=True),
        sa.Column("inspection_form_id", sa.Integer(), nullable=True),
        sa.Column("asset_tag", sa.String(), nullable=True),
        sa.Column("default_picture_url", sa.Text(), nullable=True),
        sa.Column("risk_priority", sa.String(), nullable=True),
        sa.Column("risk_name", sa.String(), nullable=True),
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
        _add_column_if_missing("inventory_parts", column)

    if _column_exists("inventory_parts", "asset_tag") and not _index_exists("ix_inventory_parts_asset_tag", "inventory_parts"):
        op.create_index("ix_inventory_parts_asset_tag", "inventory_parts", ["asset_tag"], unique=False)
    if _column_exists("inventory_parts", "modality_id") and not _index_exists("ix_inventory_parts_modality_id", "inventory_parts"):
        op.create_index("ix_inventory_parts_modality_id", "inventory_parts", ["modality_id"], unique=False)

    _create_fk_if_missing("fk_inventory_parts_modality_id_modalities", "inventory_parts", "modalities", ["modality_id"], ["id"])
    _create_fk_if_missing("fk_inventory_parts_inspection_form_id_inspection_forms", "inventory_parts", "inspection_forms", ["inspection_form_id"], ["id"])


def downgrade() -> None:
    if not _table_exists("inventory_parts"):
        return
    if _fk_exists("inventory_parts", "fk_inventory_parts_inspection_form_id_inspection_forms"):
        op.drop_constraint("fk_inventory_parts_inspection_form_id_inspection_forms", "inventory_parts", type_="foreignkey")
    if _fk_exists("inventory_parts", "fk_inventory_parts_modality_id_modalities"):
        op.drop_constraint("fk_inventory_parts_modality_id_modalities", "inventory_parts", type_="foreignkey")
    if _index_exists("ix_inventory_parts_modality_id", "inventory_parts"):
        op.drop_index("ix_inventory_parts_modality_id", table_name="inventory_parts")
    if _index_exists("ix_inventory_parts_asset_tag", "inventory_parts"):
        op.drop_index("ix_inventory_parts_asset_tag", table_name="inventory_parts")

    for column_name in [
        "next_generated_pm_date", "last_pm_date", "installation_date", "pm_scheduling",
        "labor_warranty_end_date", "part_warranty_end_date", "coverage_type", "coverage_start_date",
        "labor_duration", "parts_duration", "warranty_duration", "capital_equipment",
        "acquisition_date", "acquired_mailing_address", "acquired_email", "acquired_phone",
        "acquired_sales_person", "acquired_account_number", "acquired_company_name",
        "acquisition_method", "owning_department", "requester_email", "requester_mailing_address",
        "requester_fax", "requester_phone", "requester_last_name", "requester_first_name",
        "po_no", "department", "acquisition_authorized_by", "inventory_date", "risk_name",
        "risk_priority", "default_picture_url", "asset_tag", "inspection_form_id", "modality_id",
    ]:
        if _column_exists("inventory_parts", column_name):
            op.drop_column("inventory_parts", column_name)
