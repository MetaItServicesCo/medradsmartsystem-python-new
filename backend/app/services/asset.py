"""Validation for where an asset sits and what contains it.

`Equipment` gained four foreign keys that cross facility boundaries if nothing
checks them — a location, a parent asset, a discipline and a service vendor.
The endpoint passes the whole payload through `model_dump()`, so without these
checks a caller can place a chiller in another hospital's plant room, or parent
an asset to itself.

Containment (`parent_equipment_id`) is deliberately separate from the service
edges in `asset_serves_asset`. A breaker is *in* a panel; a panel *feeds* a
receptacle. Conflating them makes both untraversable.
"""
from __future__ import annotations

from fastapi import HTTPException, status as http_status
from sqlalchemy.orm import Session

from app.models.discipline import Discipline
from app.models.equipment import Equipment
from app.models.location import Location
from app.models.vendor import Vendor
from app.services import location_tree

# Containment nests shallowly in practice — switchboard, panel, breaker — so the
# cap is a guardrail against a mis-parented loop, not a modelling limit.
_MAX_CONTAINMENT_DEPTH = 10


def validate_placement(
    db: Session,
    *,
    facility_id: int,
    location_id: int | None,
    parent_equipment_id: int | None,
    discipline_id: int | None,
    service_vendor_id: int | None,
    equipment_id: int | None = None,
) -> None:
    """Refuse cross-facility and self-referential placements.

    `equipment_id` is the row being edited, so an update can exclude itself from
    the cycle check. Omitted on create, where there is no row yet.
    """
    if location_id is not None:
        location = db.query(Location).filter(Location.id == location_id).first()
        if location is None:
            raise HTTPException(status_code=404, detail="Location not found")
        if location.facility_id != facility_id:
            raise HTTPException(
                status_code=http_status.HTTP_400_BAD_REQUEST,
                detail="That location belongs to a different facility",
            )
        if not location_tree.is_workable(location):
            raise HTTPException(
                status_code=http_status.HTTP_400_BAD_REQUEST,
                detail=f"Location {location.code} is decommissioned or inactive",
            )

    if parent_equipment_id is not None:
        if equipment_id is not None and parent_equipment_id == equipment_id:
            raise HTTPException(
                status_code=http_status.HTTP_400_BAD_REQUEST,
                detail="An asset cannot contain itself",
            )
        parent = db.query(Equipment).filter(Equipment.id == parent_equipment_id).first()
        if parent is None:
            raise HTTPException(status_code=404, detail="Parent equipment not found")
        if parent.facility_id != facility_id:
            raise HTTPException(
                status_code=http_status.HTTP_400_BAD_REQUEST,
                detail="The parent asset belongs to a different facility",
            )
        if equipment_id is not None:
            _assert_no_containment_cycle(db, equipment_id, parent_equipment_id)

    if discipline_id is not None:
        if not db.query(Discipline.id).filter(Discipline.id == discipline_id).first():
            raise HTTPException(status_code=404, detail="Discipline not found")

    if service_vendor_id is not None:
        if not db.query(Vendor.id).filter(Vendor.id == service_vendor_id).first():
            raise HTTPException(status_code=404, detail="Vendor not found")


def _assert_no_containment_cycle(db: Session, equipment_id: int, parent_id: int) -> None:
    """Walk up from the proposed parent; refuse if we arrive back at ourselves.

    Unlike `Location`, equipment carries no materialised path, so this is an
    actual walk. It is bounded and runs only on write, which is the rare
    operation — the alternative is a containment loop that makes an asset
    invisible in every tree that renders it.
    """
    seen: set[int] = set()
    current: int | None = parent_id

    for _ in range(_MAX_CONTAINMENT_DEPTH):
        if current is None:
            return
        if current == equipment_id:
            raise HTTPException(
                status_code=http_status.HTTP_400_BAD_REQUEST,
                detail="That would place the asset inside one of its own components",
            )
        if current in seen:
            # Pre-existing loop somewhere above. Not this edit's fault, but
            # adding to it would only make it worse.
            raise HTTPException(
                status_code=http_status.HTTP_409_CONFLICT,
                detail="The containment chain above that parent already loops; fix it first",
            )
        seen.add(current)
        row = db.query(Equipment.parent_equipment_id).filter(Equipment.id == current).first()
        current = row[0] if row else None

    raise HTTPException(
        status_code=http_status.HTTP_400_BAD_REQUEST,
        detail=f"Containment nests deeper than {_MAX_CONTAINMENT_DEPTH} levels",
    )


def inherit_criticality(db: Session, *, location_id: int | None, explicit: str | None) -> str | None:
    """Take the space's criticality when the asset does not state its own.

    Overridable on purpose: a standby generator in an unremarkable yard is
    critical because of what depends on it, not because of where it sits.
    """
    if explicit:
        return explicit
    if location_id is None:
        return None
    location = db.query(Location).filter(Location.id == location_id).first()
    return location.criticality if location else None
