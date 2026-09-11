"""Tree integrity for the space register.

The materialised path on `Location` is only worth having if it is always right.
Every write that can change an ancestor chain goes through here — nothing else
is allowed to assign `path` or `depth`.

Three jobs:
  * validate that a parent/child pairing makes physical sense
  * keep `path` and `depth` correct, including for whole subtrees on a move
  * refuse the moves that would corrupt the tree (a node into its own subtree)
"""
from __future__ import annotations

from fastapi import HTTPException, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models.location import (
    HIGH_ACUITY_USES, Criticality, Location, LocationType, OccupancyStatus,
)


# Which parents each type may hang from. `None` means it may be a root, i.e.
# attached straight to the facility.
#
# Enforced here rather than as a database constraint so that a customer with an
# unusual building — a tunnel, a detached plant, a modular unit in a car park —
# is a one-line change here and not a migration on a live database in the
# middle of a survey.
_ALLOWED_PARENTS: dict[str, frozenset[str | None]] = {
    LocationType.BUILDING.value:  frozenset({None}),
    LocationType.FLOOR.value:     frozenset({LocationType.BUILDING.value}),
    LocationType.WING.value:      frozenset({LocationType.FLOOR.value, LocationType.BUILDING.value}),
    LocationType.ROOM.value:      frozenset({
        LocationType.FLOOR.value, LocationType.WING.value, LocationType.BUILDING.value,
    }),
    # A bed belongs to a room and nowhere else. This is the rule that keeps the
    # bed count meaningful: beds parked in corridors during a surge are a real
    # thing, and they are recorded as beds in a corridor *room*, not as beds
    # floating on a floor.
    LocationType.BED.value:       frozenset({LocationType.ROOM.value}),
    LocationType.SHAFT.value:     frozenset({LocationType.BUILDING.value, LocationType.FLOOR.value}),
    LocationType.RISER.value:     frozenset({LocationType.BUILDING.value, LocationType.FLOOR.value}),
    LocationType.MECH_ROOM.value: frozenset({
        LocationType.FLOOR.value, LocationType.WING.value, LocationType.BUILDING.value,
    }),
    LocationType.PLENUM.value:    frozenset({LocationType.FLOOR.value, LocationType.BUILDING.value}),
    LocationType.ROOF.value:      frozenset({LocationType.BUILDING.value}),
    LocationType.EXTERIOR.value:  frozenset({None, LocationType.BUILDING.value}),
}

# Types that can hold a floor plan drawing.
PLANNABLE_TYPES: frozenset[str] = frozenset({
    LocationType.FLOOR.value, LocationType.BUILDING.value, LocationType.ROOF.value,
})


def allowed_parent_types(location_type: str) -> frozenset[str | None]:
    return _ALLOWED_PARENTS.get(location_type, frozenset())


def validate_placement(location_type: str, parent: Location | None) -> None:
    """Refuse a nonsensical parent/child pairing with an error that explains
    itself, rather than letting a bed end up hanging off a building."""
    if location_type not in _ALLOWED_PARENTS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unknown location type '{location_type}'",
        )

    allowed = _ALLOWED_PARENTS[location_type]
    parent_type = parent.location_type if parent else None

    if parent_type not in allowed:
        readable = ", ".join(sorted(t for t in allowed if t)) or "nothing (it must be a root)"
        got = f"a {parent_type}" if parent_type else "no parent"
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"A {location_type} may sit under {readable}; got {got}.",
        )


def assert_same_facility(parent: Location | None, facility_id: int) -> None:
    """A subtree may not straddle two facilities. Facility is the tenancy and
    RBAC boundary, and a child inheriting a different one would be a quiet
    permission hole rather than a visible bug."""
    if parent is not None and parent.facility_id != facility_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="A location must belong to the same facility as its parent",
        )


def compute_path(parent: Location | None, own_id: int) -> tuple[str, int]:
    """The path and depth a node has under `parent`."""
    if parent is None:
        return f"/{own_id}/", 0
    return f"{parent.path}{own_id}/", parent.depth + 1


def assign_path(db: Session, location: Location, parent: Location | None) -> None:
    """Set path and depth on a freshly inserted row.

    Requires `location.id`, so callers flush before calling. The id is part of
    its own path — without it, two siblings share a prefix and a subtree query
    on one returns the other.
    """
    if location.id is None:
        raise ValueError("assign_path requires a flushed Location with an id")
    location.path, location.depth = compute_path(parent, location.id)


def subtree_filter(location: Location):
    """SQLAlchemy criterion matching this node and everything beneath it.

    The reason the path column exists. This is one indexed prefix match against
    `ix_locations_facility_path`, where the honest alternative is a recursive
    CTE executed on every picker, count and dashboard tile.
    """
    return Location.path.like(f"{location.path}%")


def descendants_query(db: Session, location: Location, *, include_self: bool = False):
    query = db.query(Location).filter(
        Location.facility_id == location.facility_id,
        subtree_filter(location),
    )
    if not include_self:
        query = query.filter(Location.id != location.id)
    return query


def ancestors_query(db: Session, location: Location):
    """Root-first chain above this node, read straight out of the path."""
    ids = [i for i in location.ancestor_ids if i != location.id]
    if not ids:
        return db.query(Location).filter(Location.id == -1)
    return db.query(Location).filter(Location.id.in_(ids)).order_by(Location.depth.asc())


def move(db: Session, location: Location, new_parent: Location | None) -> int:
    """Re-parent a node and rewrite its whole subtree's paths.

    Returns the number of descendant rows rewritten. Does not commit — the
    caller owns the transaction, because a move is usually one part of a larger
    edit and half a move is worse than none.
    """
    if new_parent is not None:
        # Checked before the type rules, because it is the more serious of the
        # two problems and the more useful thing to say. A node moved beneath
        # its own descendant detaches that whole branch and leaves it
        # circularly parented — invisible in every list view and unreachable
        # from any root. The materialised path makes this a string comparison
        # instead of a walk.
        if new_parent.id == location.id or new_parent.path.startswith(location.path):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="A location cannot be moved inside itself or one of its own descendants",
            )

    validate_placement(location.location_type, new_parent)
    assert_same_facility(new_parent, location.facility_id)

    old_path = location.path
    new_path, new_depth = compute_path(new_parent, location.id)
    depth_delta = new_depth - location.depth

    location.parent_id = new_parent.id if new_parent else None
    location.path = new_path
    location.depth = new_depth

    if old_path == new_path:
        return 0

    # One statement for the whole subtree. Loading and re-saving each row would
    # be correct and would also be an N-query move of a floor with 400 rooms.
    rewritten = (
        db.query(Location)
        .filter(
            Location.facility_id == location.facility_id,
            Location.path.like(f"{old_path}%"),
            Location.id != location.id,
        )
        .update(
            {
                Location.path: func.concat(
                    new_path, func.substr(Location.path, len(old_path) + 1),
                ),
                Location.depth: Location.depth + depth_delta,
            },
            synchronize_session=False,
        )
    )
    return rewritten


def ensure_unique_code(
    db: Session,
    *,
    facility_id: int,
    parent_id: int | None,
    code: str,
    exclude_id: int | None = None,
) -> None:
    """Codes must be unique among siblings.

    Enforced here rather than by a unique constraint because the constraint
    cannot cover roots: Postgres treats NULLs as distinct, so two buildings both
    coded 'A' with `parent_id IS NULL` would both be accepted. Doing it in one
    place for both cases is honest; a constraint that silently covers only some
    rows is not.
    """
    query = db.query(Location.id).filter(
        Location.facility_id == facility_id,
        Location.code == code,
    )
    query = query.filter(Location.parent_id.is_(None) if parent_id is None else Location.parent_id == parent_id)
    if exclude_id is not None:
        query = query.filter(Location.id != exclude_id)

    if db.query(query.exists()).scalar():
        where = "at the top level of this facility" if parent_id is None else "under this parent"
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"A location coded '{code}' already exists {where}.",
        )


def default_criticality(space_use: str | None) -> str:
    """Seed criticality from what the space is for.

    Somebody surveying four hundred rooms will not set this by hand, and a
    field left blank on an operating room is exactly the failure this whole
    design exists to prevent. Always overridable.
    """
    if space_use and space_use in HIGH_ACUITY_USES:
        return Criticality.CRITICAL.value
    if space_use in {"imaging", "laboratory", "pharmacy", "sterile_processing", "electrical", "mechanical", "data"}:
        return Criticality.HIGH.value
    if space_use in {"storage", "office", "public", "corridor"}:
        return Criticality.LOW.value
    return Criticality.STANDARD.value


def derive_volume_cuft(area_sqft, ceiling_height_ft):
    """Air changes per hour needs a volume. Where a surveyor gave area and
    height, computing it costs nothing; where they measured the volume of an
    odd-shaped space directly, their number wins and this is not called."""
    if area_sqft is None or ceiling_height_ft is None:
        return None
    return float(area_sqft) * float(ceiling_height_ft)


def recount_beds(db: Session, room: Location) -> int:
    """Refresh a room's denormalised bed count from its actual bed children."""
    count = (
        db.query(func.count(Location.id))
        .filter(
            Location.parent_id == room.id,
            Location.location_type == LocationType.BED.value,
            Location.is_active.is_(True),
        )
        .scalar()
    ) or 0
    room.bed_count = int(count)
    return room.bed_count


def is_workable(location: Location) -> bool:
    """Whether work may be filed against this space at all."""
    return location.is_active and location.occupancy_status != OccupancyStatus.DECOMMISSIONED.value
