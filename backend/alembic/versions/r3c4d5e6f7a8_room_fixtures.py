"""Room fixtures — the serviceable things inside a space

Revision ID: r3c4d5e6f7a8
Revises: q2b3c4d5e6f7
Create Date: 2026-09-11

Until now a room could hold `equipment`, and creating one of those requires an
asset tag, make, model, serial number and a clinical modality — not a sensible
thing to ask of a duplex receptacle. So the founding use case, a socket in an
operating theatre failing and a ticket being raised against it, had nowhere to
live.

Separate from `equipment` on purpose: a hospital has a couple of thousand
pieces of plant and tens of thousands of fixtures. Merging them makes every
asset list, depreciation run and PM schedule mostly sockets.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "r3c4d5e6f7a8"
down_revision: Union[str, Sequence[str], None] = "q2b3c4d5e6f7"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "fixtures",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("facility_id", sa.Integer(), nullable=False),
        sa.Column("location_id", sa.Integer(), nullable=False),
        sa.Column("discipline_id", sa.Integer(), nullable=True),
        sa.Column("fixture_type", sa.String(length=48), nullable=False),
        sa.Column("code", sa.String(length=64), nullable=False),
        sa.Column("label", sa.String(length=255), nullable=True),
        sa.Column("manufacturer", sa.String(length=128), nullable=True),
        sa.Column("model", sa.String(length=128), nullable=True),
        sa.Column("serial_number", sa.String(length=128), nullable=True),
        # Typed per fixture type by the catalogue rather than as columns: a
        # receptacle's amperage and a diffuser's CFM have nothing in common,
        # and forty nullable columns would be worse than one document.
        sa.Column("spec", sa.JSON(), nullable=True),
        sa.Column("served_by_equipment_id", sa.Integer(), nullable=True),
        sa.Column("circuit_ref", sa.String(length=128), nullable=True),
        sa.Column("status", sa.String(length=16), nullable=False, server_default="working"),
        sa.Column("work_order_id", sa.Integer(), nullable=True),
        sa.Column("quantity", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("installed_on", sa.Date(), nullable=True),
        sa.Column("warranty_expires_on", sa.Date(), nullable=True),
        sa.Column("last_tested_on", sa.Date(), nullable=True),
        sa.Column("plan_x", sa.String(length=24), nullable=True),
        sa.Column("plan_y", sa.String(length=24), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("created_by_id", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(["facility_id"], ["facilities.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["location_id"], ["locations.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["discipline_id"], ["disciplines.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["served_by_equipment_id"], ["equipment.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["work_order_id"], ["service_requests.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["created_by_id"], ["users.id"], ondelete="SET NULL"),
        # Codes are unique inside a room, not globally: every theatre has an
        # SKT-01, and qualifying by room is how people refer to them out loud.
        sa.UniqueConstraint("location_id", "code", name="uq_fixtures_location_code"),
    )

    op.create_index("ix_fixtures_id", "fixtures", ["id"])
    op.create_index("ix_fixtures_facility_id", "fixtures", ["facility_id"])
    op.create_index("ix_fixtures_location_id", "fixtures", ["location_id"])
    op.create_index("ix_fixtures_discipline_id", "fixtures", ["discipline_id"])
    op.create_index("ix_fixtures_fixture_type", "fixtures", ["fixture_type"])
    op.create_index("ix_fixtures_serial_number", "fixtures", ["serial_number"])
    op.create_index("ix_fixtures_served_by_equipment_id", "fixtures", ["served_by_equipment_id"])
    op.create_index("ix_fixtures_status", "fixtures", ["status"])
    op.create_index("ix_fixtures_work_order_id", "fixtures", ["work_order_id"])
    op.create_index("ix_fixtures_facility_type", "fixtures", ["facility_id", "fixture_type"])
    op.create_index("ix_fixtures_facility_status", "fixtures", ["facility_id", "status"])
    op.create_index("ix_fixtures_location_type", "fixtures", ["location_id", "fixture_type"])
    op.create_index("ix_fixtures_discipline_status", "fixtures", ["discipline_id", "status"])


def downgrade() -> None:
    op.drop_table("fixtures")
