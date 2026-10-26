"""Room items are assets, not fixtures

Revision ID: t5e6f7a8b9c0
Revises: s4d5e6f7a8b9
Create Date: 2026-09-14

Chairs, tables, desks, cabinets, whiteboards, stretchers, displays and
projectors were briefly fixture types. They are assets: each has its own tag,
can be moved, repaired, written down and disposed of. Sockets, lights, gas
outlets and the rest remain fixtures, because they are part of the room.

`equipment.asset_type` records what kind of room item an asset is. Any of those
types already saved as fixtures are moved across, one asset per fixture, with a
new permanent tag, the same room and trade, and any work order raised against
the fixture now pointing at the asset.
"""
import re
from datetime import datetime
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "t5e6f7a8b9c0"
down_revision: Union[str, Sequence[str], None] = "s4d5e6f7a8b9"
branch_labels = None
depends_on = None

# Fixed here rather than read from the catalogue: the catalogue will change and
# this migration must keep meaning what it meant when it ran.
MOVED_TYPES = (
    "chair", "table", "desk", "cabinet", "whiteboard", "stretcher",
    "display_screen", "projector",
)


def _tag_prefix(facility_name: str) -> str:
    # Mirrors app.services.room_assets.tag_prefix at the time of writing.
    words = re.findall(r"[A-Za-z]+", facility_name or "")
    if len(words) >= 2:
        prefix = "".join(w[0] for w in words[:3])
    elif words:
        prefix = words[0][:3]
    else:
        prefix = "AST"
    return prefix.upper()


def upgrade() -> None:
    op.add_column("equipment", sa.Column("asset_type", sa.String(length=48), nullable=True))
    op.create_index("ix_equipment_asset_type", "equipment", ["asset_type"])

    bind = op.get_bind()
    moving = bind.execute(
        sa.text(
            "SELECT f.id, f.facility_id, f.location_id, f.discipline_id, f.fixture_type, "
            "f.manufacturer, f.model, f.serial_number, f.is_active, f.status, "
            "f.work_order_id, f.notes, fac.name AS facility_name, loc.criticality "
            "FROM fixtures f "
            "JOIN facilities fac ON fac.id = f.facility_id "
            "LEFT JOIN locations loc ON loc.id = f.location_id "
            "WHERE f.fixture_type IN :types ORDER BY f.id"
        ).bindparams(sa.bindparam("types", expanding=True)),
        {"types": list(MOVED_TYPES)},
    ).mappings().all()
    if not moving:
        return

    highest: dict[str, int] = {}

    def next_tag(facility_name: str) -> str:
        prefix = _tag_prefix(facility_name)
        if prefix not in highest:
            pattern = re.compile(rf"^{re.escape(prefix)}-(\d+)$")
            found = 0
            for (tag,) in bind.execute(
                sa.text("SELECT asset_tag FROM equipment WHERE asset_tag LIKE :p"),
                {"p": f"{prefix}-%"},
            ):
                match = pattern.match(tag or "")
                if match:
                    found = max(found, int(match.group(1)))
            highest[prefix] = found
        highest[prefix] += 1
        return f"{prefix}-{highest[prefix]:06d}"

    now = datetime.utcnow()
    moved_ids: list[int] = []
    for row in moving:
        in_room = row["is_active"] and row["status"] != "removed"
        # Enum values are stored by member name on PostgreSQL.
        status = "ACTIVE" if in_room else "INACTIVE"
        asset_id = bind.execute(
            sa.text(
                "INSERT INTO equipment (asset_tag, make, model, serial_number, facility_id, "
                "location_id, discipline_id, asset_type, criticality, description, status, "
                "created_at, updated_at) VALUES (:tag, :make, :model, :serial, :facility_id, "
                ":location_id, :discipline_id, :asset_type, :criticality, :description, "
                ":status, :now, :now) RETURNING id"
            ),
            {
                "tag": next_tag(row["facility_name"]),
                "make": row["manufacturer"] or "",
                "model": row["model"] or "",
                "serial": row["serial_number"] or "",
                "facility_id": row["facility_id"],
                "location_id": row["location_id"],
                "discipline_id": row["discipline_id"],
                "asset_type": row["fixture_type"],
                "criticality": row["criticality"],
                "description": row["notes"],
                "status": status,
                "now": now,
            },
        ).scalar_one()
        if row["work_order_id"]:
            bind.execute(
                sa.text("UPDATE service_requests SET equipment_id = :asset WHERE id = :wo "
                        "AND equipment_id IS NULL"),
                {"asset": asset_id, "wo": row["work_order_id"]},
            )
        moved_ids.append(row["id"])

    bind.execute(
        sa.text("DELETE FROM fixtures WHERE id IN :ids").bindparams(
            sa.bindparam("ids", expanding=True)),
        {"ids": moved_ids},
    )


def downgrade() -> None:
    # The moved items stay assets: turning twelve tagged, possibly costed and
    # serviced chairs back into fixtures would lose exactly what made them assets.
    op.drop_index("ix_equipment_asset_type", table_name="equipment")
    op.drop_column("equipment", "asset_type")
