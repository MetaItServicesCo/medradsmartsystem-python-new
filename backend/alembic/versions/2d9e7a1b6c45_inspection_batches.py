"""inspection batches

Revision ID: 2d9e7a1b6c45
Revises: 7a6b5c4d3e2f
Create Date: 2026-05-23 01:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = "2d9e7a1b6c45"
down_revision: Union[str, Sequence[str], None] = "7a6b5c4d3e2f"
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


def upgrade() -> None:
    if not _table_exists("inspection_batches"):
        op.create_table(
            "inspection_batches",
            sa.Column("id", sa.Integer(), nullable=False),
            sa.Column("batch_number", sa.String(), nullable=False),
            sa.Column("facility_id", sa.Integer(), nullable=False),
            sa.Column("inspector_id", sa.Integer(), nullable=True),
            sa.Column("form_template_id", sa.Integer(), nullable=False),
            sa.Column(
                "status",
                postgresql.ENUM("UPCOMING", "IN_PROGRESS", "COMPLETED", "OVERDUE", name="inspectionstatus", create_type=False),
                nullable=True,
            ),
            sa.Column("scheduled_date", sa.DateTime(), nullable=False),
            sa.Column("started_at", sa.DateTime(), nullable=True),
            sa.Column("completed_at", sa.DateTime(), nullable=True),
            sa.Column("inspection_frequency", sa.String(), nullable=True),
            sa.Column("inspection_scope", sa.String(), nullable=True),
            sa.Column("notes", sa.Text(), nullable=True),
            sa.Column("is_instant", sa.Boolean(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=True),
            sa.Column("updated_at", sa.DateTime(), nullable=True),
            sa.ForeignKeyConstraint(["facility_id"], ["facilities.id"]),
            sa.ForeignKeyConstraint(["form_template_id"], ["inspection_forms.id"]),
            sa.ForeignKeyConstraint(["inspector_id"], ["users.id"]),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint("batch_number"),
        )
    if _table_exists("inspection_batches"):
        op.execute(sa.text("CREATE INDEX IF NOT EXISTS ix_inspection_batches_batch_number ON inspection_batches (batch_number)"))
        op.execute(sa.text("CREATE INDEX IF NOT EXISTS ix_inspection_batches_facility_id ON inspection_batches (facility_id)"))
        op.execute(sa.text("CREATE INDEX IF NOT EXISTS ix_inspection_batches_status ON inspection_batches (status)"))

    if _table_exists("inspections") and not _column_exists("inspections", "batch_id"):
        op.add_column("inspections", sa.Column("batch_id", sa.Integer(), nullable=True))
    if _table_exists("inspections") and _column_exists("inspections", "batch_id"):
        op.execute(sa.text("CREATE INDEX IF NOT EXISTS ix_inspections_batch_id ON inspections (batch_id)"))
        if not _fk_exists("inspections", "fk_inspections_batch_id_inspection_batches"):
            op.create_foreign_key(
                "fk_inspections_batch_id_inspection_batches",
                "inspections",
                "inspection_batches",
                ["batch_id"],
                ["id"],
            )


def downgrade() -> None:
    if _table_exists("inspections"):
        if _fk_exists("inspections", "fk_inspections_batch_id_inspection_batches"):
            op.drop_constraint("fk_inspections_batch_id_inspection_batches", "inspections", type_="foreignkey")
        if _index_exists("inspections", "ix_inspections_batch_id"):
            op.drop_index("ix_inspections_batch_id", table_name="inspections")
        if _column_exists("inspections", "batch_id"):
            op.drop_column("inspections", "batch_id")
    if _table_exists("inspection_batches"):
        op.drop_table("inspection_batches")
