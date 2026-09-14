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

from typing import Sequence

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


CRITICALITY_RANK = {"low": 0, "standard": 1, "high": 2, "critical": 3}


def derived_criticality(
    db: Session, *, location_id: int | None, served_location_ids: Sequence[int] = (),
) -> str | None:
    """The most critical of where an asset sits and everything it serves.

    Served spaces count with everything inside them: an air handler serving a
    floor that holds four operating rooms is as critical as those rooms, even
    though the edge is drawn to the floor and the handler sits in a plant room.
    """
    found: list[str] = []
    if location_id is not None:
        row = db.query(Location.criticality).filter(Location.id == location_id).first()
        if row and row[0]:
            found.append(row[0])
    for served in db.query(Location).filter(Location.id.in_(list(served_location_ids))).all():
        found.extend(
            c for (c,) in db.query(Location.criticality)
            .filter(location_tree.subtree_filter(served), Location.is_active.is_(True))
            .distinct() if c
        )
    ranked = [c for c in found if c in CRITICALITY_RANK]
    return max(ranked, key=CRITICALITY_RANK.__getitem__) if ranked else None


def inherit_criticality(
    db: Session, *, location_id: int | None, explicit: str | None,
    served_location_ids: Sequence[int] = (),
) -> str | None:
    """Take the criticality of where the asset is and what it serves, unless set.

    Overridable on purpose: a standby generator in an unremarkable yard is
    critical because of what depends on it, not because of where it sits, and
    somebody may know better than either.
    """
    if explicit:
        return explicit
    return derived_criticality(db, location_id=location_id, served_location_ids=served_location_ids)


def served_location_ids(db: Session, equipment_id: int) -> list[int]:
    from app.models.asset_link import AssetServesLocation
    return [lid for (lid,) in db.query(AssetServesLocation.location_id)
            .filter(AssetServesLocation.equipment_id == equipment_id)]


def rederive_if_inherited(
    db: Session, asset, *, before_location_id: int | None, before_served: Sequence[int],
) -> None:
    """Follow a move or a change in what it serves, unless criticality was set by hand.

    There is no flag recording whether a criticality was typed or inherited, so
    this compares: if the asset still carries exactly what its old placement
    would have given it, it was inherited, and it follows the new placement. A
    value somebody chose is left alone.
    """
    before = derived_criticality(db, location_id=before_location_id,
                                 served_location_ids=before_served)
    if asset.criticality == before:
        asset.criticality = derived_criticality(
            db, location_id=asset.location_id,
            served_location_ids=served_location_ids(db, asset.id),
        )
