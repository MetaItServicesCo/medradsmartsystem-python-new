"""inspection inventory workflow

Revision ID: 91e77c5ab2da
Revises: f42a9d3160b7
Create Date: 2026-05-13 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "91e77c5ab2da"
down_revision: Union[str, Sequence[str], None] = "f42a9d3160b7"
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


def upgrade() -> None:
    if not _table_exists("inspections"):
        return

    bind = op.get_bind()
    _add_column_if_missing("inspections", sa.Column("inventory_part_id", sa.Integer(), nullable=True))
    _add_column_if_missing("inspections", sa.Column("inspection_scope", sa.String(), nullable=True))
    _add_column_if_missing("inspections", sa.Column("inspection_frequency", sa.String(), nullable=True))
    _add_column_if_missing("inspections", sa.Column("compliance_requirement", sa.String(), nullable=True))
    _add_column_if_missing("inspections", sa.Column("criticality", sa.String(), nullable=True))
    _add_column_if_missing("inspections", sa.Column("quotation_notes", sa.Text(), nullable=True))

    try:
        op.alter_column("inspections", "equipment_id", existing_type=sa.Integer(), nullable=True)
    except Exception:
        bind.execute(sa.text("ALTER TABLE inspections ALTER COLUMN equipment_id DROP NOT NULL"))

    if _column_exists("inspections", "inventory_part_id"):
        op.execute(sa.text("CREATE INDEX IF NOT EXISTS ix_inspections_inventory_part_id ON inspections (inventory_part_id)"))

    if (
        _table_exists("inventory_parts")
        and _column_exists("inspections", "inventory_part_id")
        and not _fk_exists("inspections", "fk_inspections_inventory_part_id_inventory_parts")
    ):
        op.create_foreign_key(
            "fk_inspections_inventory_part_id_inventory_parts",
            "inspections",
            "inventory_parts",
            ["inventory_part_id"],
            ["id"],
        )


def downgrade() -> None:
    if not _table_exists("inspections"):
        return

    if _fk_exists("inspections", "fk_inspections_inventory_part_id_inventory_parts"):
        op.drop_constraint("fk_inspections_inventory_part_id_inventory_parts", "inspections", type_="foreignkey")
    if _index_exists("ix_inspections_inventory_part_id", "inspections"):
        op.drop_index("ix_inspections_inventory_part_id", table_name="inspections")
    if _column_exists("inspections", "quotation_notes"):
        op.drop_column("inspections", "quotation_notes")
    if _column_exists("inspections", "criticality"):
        op.drop_column("inspections", "criticality")
    if _column_exists("inspections", "compliance_requirement"):
        op.drop_column("inspections", "compliance_requirement")
    if _column_exists("inspections", "inspection_frequency"):
        op.drop_column("inspections", "inspection_frequency")
    if _column_exists("inspections", "inspection_scope"):
        op.drop_column("inspections", "inspection_scope")
    if _column_exists("inspections", "inventory_part_id"):
        op.drop_column("inspections", "inventory_part_id")
