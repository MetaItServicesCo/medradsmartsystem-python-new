"""test equipment module

Revision ID: d0e1f2a3b4c5
Revises: c9d0e1f2a3b4
Create Date: 2026-07-08
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "d0e1f2a3b4c5"
down_revision: Union[str, Sequence[str], None] = "c9d0e1f2a3b4"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "test_equipment",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("tem", sa.String(), nullable=False),
        sa.Column("mrf", sa.String(), nullable=True),
        sa.Column("model", sa.String(), nullable=True),
        sa.Column("serial_number", sa.String(), nullable=True),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("asset", sa.String(), nullable=True),
        sa.Column("technician_id", sa.Integer(), nullable=True),
        sa.Column("status", sa.String(), nullable=False, server_default="active"),
        sa.Column("image_url", sa.Text(), nullable=True),
        sa.Column("created_by_id", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.Column("updated_at", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(["created_by_id"], ["users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["technician_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_test_equipment_id"), "test_equipment", ["id"], unique=False)
    op.create_index(op.f("ix_test_equipment_tem"), "test_equipment", ["tem"], unique=False)
    op.create_index(op.f("ix_test_equipment_mrf"), "test_equipment", ["mrf"], unique=False)
    op.create_index(op.f("ix_test_equipment_model"), "test_equipment", ["model"], unique=False)
    op.create_index(op.f("ix_test_equipment_serial_number"), "test_equipment", ["serial_number"], unique=False)
    op.create_index(op.f("ix_test_equipment_asset"), "test_equipment", ["asset"], unique=False)
    op.create_index(op.f("ix_test_equipment_technician_id"), "test_equipment", ["technician_id"], unique=False)
    op.create_index(op.f("ix_test_equipment_status"), "test_equipment", ["status"], unique=False)
    op.create_index(op.f("ix_test_equipment_created_by_id"), "test_equipment", ["created_by_id"], unique=False)
    op.create_index(op.f("ix_test_equipment_created_at"), "test_equipment", ["created_at"], unique=False)
    op.create_index(op.f("ix_test_equipment_updated_at"), "test_equipment", ["updated_at"], unique=False)
    op.create_index("ix_test_equipment_status_updated", "test_equipment", ["status", "updated_at"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_test_equipment_status_updated", table_name="test_equipment")
    op.drop_index(op.f("ix_test_equipment_updated_at"), table_name="test_equipment")
    op.drop_index(op.f("ix_test_equipment_created_at"), table_name="test_equipment")
    op.drop_index(op.f("ix_test_equipment_created_by_id"), table_name="test_equipment")
    op.drop_index(op.f("ix_test_equipment_status"), table_name="test_equipment")
    op.drop_index(op.f("ix_test_equipment_technician_id"), table_name="test_equipment")
    op.drop_index(op.f("ix_test_equipment_asset"), table_name="test_equipment")
    op.drop_index(op.f("ix_test_equipment_serial_number"), table_name="test_equipment")
    op.drop_index(op.f("ix_test_equipment_model"), table_name="test_equipment")
    op.drop_index(op.f("ix_test_equipment_mrf"), table_name="test_equipment")
    op.drop_index(op.f("ix_test_equipment_tem"), table_name="test_equipment")
    op.drop_index(op.f("ix_test_equipment_id"), table_name="test_equipment")
    op.drop_table("test_equipment")
