"""The space register and its floor plans.

Two editors over one table. The register (tree and list) is for bulk work,
search, export and the spaces that are awkward to pin — risers, chases, roof
areas. The plan editor is for authoring from a drawing, which for a customer
with no existing room list is the primary way the data arrives at all.

They write the same rows, so they cannot drift.
"""
import os
import uuid
from typing import Any, List, Optional

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from app.core.deps import get_current_user
from app.db.base import get_db
from app.models.department import Department
from app.models.location import (
    LOCATION_TYPES, SPACE_USES, Criticality, normalise_space_use, ElectricalBranch, FloorPlan,
    Location, LocationType, OccupancyStatus, SpaceUse,
)
from app.models.space_status import SpaceStatus
from app.services import fixture as fixture_service
from app.services import room_assets
from app.utils.permissions import require_module_permission
from app.models.user import User
from app.schemas.location import (
    BulkImportIssue, BulkImportResult, BulkLocationImport, FloorPlan as FloorPlanSchema,
    FloorPlanCalibrate, FloorPlanListResponse, FloorPlanUpdate, Location as LocationSchema,
    LocationBreadcrumb, LocationCreate, LocationDetail, LocationListResponse, LocationMove,
    LocationNode, LocationTreeResponse, LocationUpdate, LocationWithStatus, PinBatch,
    QuickPin, RoomContentsFill, RoomContentsFillResult, TraceResult, TraceRoom,
)
from app.services import geometry, location_tree
from app.utils.facility_access import (
    get_user_facility_ids, is_facility_scoped_user, require_facility_access,
    scope_query_to_user_facilities,
)
from app.utils.upload_security import protected_upload_path

router = APIRouter()

UPLOAD_DIR = os.path.join(
    os.path.dirname(os.path.abspath(__file__)), "..", "..", "..", "..", "uploads", "floor_plans",
)

# Drawings are big. A life safety plan for a tower floor exported at print
# resolution runs to tens of megabytes, and the generic 10MB upload cap would
# reject exactly the files this feature exists to accept.
MAX_PLAN_BYTES = 60 * 1024 * 1024
ALLOWED_PLAN_TYPES = {
    "application/pdf", "image/png", "image/jpeg", "image/webp", "image/svg+xml",
}


def _location_or_404(db: Session, location_id: int, current_user: User) -> Location:
    location = db.query(Location).filter(Location.id == location_id).first()
    if location is None:
        raise HTTPException(status_code=404, detail="Location not found")
    require_facility_access(db, current_user, location.facility_id)
    return location


def _accessible_facility_ids(db: Session, current_user: User, facility_id: Optional[int]) -> List[int]:
    if facility_id is not None:
        require_facility_access(db, current_user, facility_id)
        return [facility_id]
    if is_facility_scoped_user(current_user):
        return list(get_user_facility_ids(db, current_user))
    from app.models.facility import Facility
    return [row.id for row in db.query(Facility.id).all()]


# ── Metadata ─────────────────────────────────────────────────────────────────

@router.get("/meta")
def location_metadata(current_user: User = Depends(get_current_user)) -> Any:
    """Vocabulary the frontend builds its pickers from.

    Served rather than hardcoded in the client so that adding a space use is one
    deploy, not two that have to land in the right order.
    """
    return {
        "location_types": [
            {
                "value": t,
                "label": t.replace("_", " ").title(),
                "allowed_parents": sorted(
                    p for p in location_tree.allowed_parent_types(t) if p
                ),
                "can_be_root": None in location_tree.allowed_parent_types(t),
                "can_hold_plan": t in location_tree.PLANNABLE_TYPES,
            }
            for t in LOCATION_TYPES
        ],
        "space_uses": [
            {"value": u, "label": u.replace("_", " ").title()} for u in SPACE_USES
        ],
        "criticalities": [
            {"value": c.value, "label": c.value.title()} for c in Criticality
        ],
        "electrical_branches": [
            {"value": b.value, "label": b.value.replace("_", " ").title()} for b in ElectricalBranch
        ],
        "occupancy_statuses": [
            {"value": o.value, "label": o.value.replace("_", " ").title()} for o in OccupancyStatus
        ],
    }


# ── Register: read ───────────────────────────────────────────────────────────

@router.get("/", response_model=LocationListResponse)
def list_locations(
    db: Session = Depends(get_db),
    facility_id: Optional[int] = Query(None),
    parent_id: Optional[int] = Query(None),
    location_type: Optional[str] = Query(None),
    space_use: Optional[str] = Query(None),
    criticality: Optional[str] = Query(None),
    under_location_id: Optional[int] = Query(None, description="Everything in this subtree"),
    q: Optional[str] = Query(None, description="Matches code or name"),
    is_provisional: Optional[bool] = Query(None),
    include_inactive: bool = Query(False),
    unplaced_only: bool = Query(False, description="No pin on any floor plan yet"),
    skip: int = 0,
    limit: int = Query(200, le=1000),
    current_user: User = Depends(get_current_user),
) -> Any:
    query = scope_query_to_user_facilities(
        db.query(Location), Location.facility_id, db, current_user,
    )

    if facility_id is not None:
        require_facility_access(db, current_user, facility_id)
        query = query.filter(Location.facility_id == facility_id)
    if parent_id is not None:
        query = query.filter(Location.parent_id == parent_id)
    if under_location_id is not None:
        anchor = _location_or_404(db, under_location_id, current_user)
        query = query.filter(location_tree.subtree_filter(anchor))
    if location_type:
        query = query.filter(Location.location_type == location_type)
    if space_use:
        query = query.filter(Location.space_use == space_use)
    if criticality:
        query = query.filter(Location.criticality == criticality)
    if is_provisional is not None:
        query = query.filter(Location.is_provisional.is_(is_provisional))
    if unplaced_only:
        query = query.filter(Location.floor_plan_id.is_(None))
    if not include_inactive:
        query = query.filter(Location.is_active.is_(True))
    if q:
        # Code first: it is what somebody types, and 'OR-3' should not be
        # outranked by a room whose description mentions an operating room.
        term = f"%{q.strip()}%"
        query = query.filter(or_(Location.code.ilike(term), Location.name.ilike(term)))

    total = query.count()
    items = (
        query.order_by(Location.path.asc(), Location.code.asc())
        .offset(skip).limit(limit).all()
    )
    return {"items": items, "total": total}


@router.get("/tree", response_model=LocationTreeResponse)
def location_tree_view(
    db: Session = Depends(get_db),
    facility_id: int = Query(...),
    root_id: Optional[int] = Query(None),
    max_depth: Optional[int] = Query(None, ge=0, le=10),
    include_inactive: bool = Query(False),
    current_user: User = Depends(get_current_user),
) -> Any:
    """The whole tree, nested, in one query.

    Assembled in memory from a flat ordered fetch rather than recursing per
    node. A hospital floor is a few thousand rows; that is one round trip and a
    dictionary, where lazy children would be a few thousand round trips.
    """
    require_facility_access(db, current_user, facility_id)

    query = db.query(Location).filter(Location.facility_id == facility_id)
    if not include_inactive:
        query = query.filter(Location.is_active.is_(True))

    if root_id is not None:
        anchor = _location_or_404(db, root_id, current_user)
        query = query.filter(location_tree.subtree_filter(anchor))
        base_depth = anchor.depth
    else:
        base_depth = 0

    if max_depth is not None:
        query = query.filter(Location.depth <= base_depth + max_depth)

    rows = query.order_by(Location.path.asc()).all()

    nodes: dict[int, LocationNode] = {}
    for row in rows:
        node = LocationNode.model_validate(row)
        node.children = []
        node.display_label = row.display_label
        nodes[row.id] = node

    roots: List[LocationNode] = []
    for row in rows:
        node = nodes[row.id]
        parent = nodes.get(row.parent_id) if row.parent_id else None
        if parent is not None:
            parent.children.append(node)
        else:
            # A node whose parent was filtered out by depth or inactivity is a
            # root of this view, not an orphan to be dropped.
            roots.append(node)

    return {"items": roots, "total": len(rows)}


@router.get("/board", response_model=List[LocationWithStatus])
def space_board(
    db: Session = Depends(get_db),
    facility_id: int = Query(...),
    under_location_id: Optional[int] = Query(None),
    space_use: Optional[str] = Query(None),
    only_unavailable: bool = Query(False),
    limit: int = Query(500, le=2000),
    current_user: User = Depends(get_current_user),
) -> Any:
    """Locations with their current availability, for the space board."""
    require_facility_access(db, current_user, facility_id)

    query = (
        db.query(Location, SpaceStatus)
        .outerjoin(SpaceStatus, SpaceStatus.location_id == Location.id)
        .filter(Location.facility_id == facility_id, Location.is_active.is_(True))
    )
    if under_location_id is not None:
        anchor = _location_or_404(db, under_location_id, current_user)
        query = query.filter(location_tree.subtree_filter(anchor))
    if space_use:
        query = query.filter(Location.space_use == space_use)
    if only_unavailable:
        query = query.filter(SpaceStatus.availability.in_(["out_of_service", "blocked"]))

    results = []
    for location, status in query.order_by(Location.path.asc()).limit(limit).all():
        payload = LocationWithStatus.model_validate(location)
        payload.display_label = location.display_label
        if status is not None:
            payload.availability = status.availability
            payload.oos_reason = status.oos_reason
            payload.status_since = status.since
            payload.work_order_id = status.work_order_id
        results.append(payload)
    return results


@router.get("/{id}", response_model=LocationDetail)
def get_location(
    id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Any:
    location = _location_or_404(db, id, current_user)

    detail = LocationDetail.model_validate(location)
    detail.display_label = location.display_label
    detail.breadcrumbs = [
        LocationBreadcrumb.model_validate(row)
        for row in location_tree.ancestors_query(db, location).all()
    ]
    detail.child_count = (
        db.query(func.count(Location.id)).filter(Location.parent_id == location.id).scalar() or 0
    )
    detail.descendant_count = (
        location_tree.descendants_query(db, location).with_entities(func.count(Location.id)).scalar() or 0
    )
    status = db.query(SpaceStatus).filter(SpaceStatus.location_id == location.id).first()
    detail.availability = status.availability if status else None
    return detail


@router.get("/{id}/descendants", response_model=LocationListResponse)
def list_descendants(
    id: int,
    db: Session = Depends(get_db),
    location_type: Optional[str] = Query(None),
    limit: int = Query(1000, le=5000),
    current_user: User = Depends(get_current_user),
) -> Any:
    location = _location_or_404(db, id, current_user)
    query = location_tree.descendants_query(db, location)
    if location_type:
        query = query.filter(Location.location_type == location_type)
    total = query.count()
    return {"items": query.order_by(Location.path.asc()).limit(limit).all(), "total": total}


# ── Register: write ──────────────────────────────────────────────────────────

@router.post("/", response_model=LocationSchema, status_code=201)
def create_location(
    payload: LocationCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Any:
    require_facility_access(db, current_user, payload.facility_id)

    parent = None
    if payload.parent_id is not None:
        parent = db.query(Location).filter(Location.id == payload.parent_id).first()
        if parent is None:
            raise HTTPException(status_code=404, detail="Parent location not found")

    location_tree.assert_same_facility(parent, payload.facility_id)
    location_tree.validate_placement(payload.location_type, parent)
    location_tree.ensure_unique_code(
        db, facility_id=payload.facility_id, parent_id=payload.parent_id, code=payload.code,
    )

    if payload.department_id is not None:
        department = db.query(Department).filter(Department.id == payload.department_id).first()
        if department is None or department.facility_id != payload.facility_id:
            raise HTTPException(status_code=400, detail="Department not found in this facility")

    data = payload.model_dump()
    data["criticality"] = payload.criticality or location_tree.default_criticality(payload.space_use)
    data["occupancy_status"] = payload.occupancy_status or OccupancyStatus.IN_SERVICE.value
    if data.get("volume_cuft") is None:
        data["volume_cuft"] = location_tree.derive_volume_cuft(
            payload.area_sqft, payload.ceiling_height_ft,
        )

    location = Location(**data, created_by_id=current_user.id)
    db.add(location)
    # The row's own id is part of its path, so it must exist before the path
    # can be computed. Flush, then assign, then commit as one transaction.
    db.flush()
    location_tree.assign_path(db, location, parent)

    if parent is not None and parent.location_type == LocationType.ROOM.value:
        location_tree.recount_beds(db, parent)

    db.commit()
    db.refresh(location)
    return location


@router.put("/{id}", response_model=LocationSchema)
def update_location(
    id: int,
    payload: LocationUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Any:
    location = _location_or_404(db, id, current_user)
    data = payload.model_dump(exclude_unset=True)

    if "code" in data and data["code"] != location.code:
        location_tree.ensure_unique_code(
            db,
            facility_id=location.facility_id,
            parent_id=location.parent_id,
            code=data["code"],
            exclude_id=location.id,
        )

    for field, value in data.items():
        setattr(location, field, value)

    # Recompute volume when either input moved and the caller did not supply a
    # volume of their own, so air-change checks stay honest after a remeasure.
    if ("area_sqft" in data or "ceiling_height_ft" in data) and "volume_cuft" not in data:
        location.volume_cuft = location_tree.derive_volume_cuft(
            location.area_sqft, location.ceiling_height_ft,
        )

    db.commit()
    db.refresh(location)
    return location


@router.post("/{id}/move", response_model=LocationSchema)
def move_location(
    id: int,
    payload: LocationMove,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Any:
    """Re-parent a node and rewrite its subtree's paths."""
    location = _location_or_404(db, id, current_user)

    new_parent = None
    if payload.new_parent_id is not None:
        new_parent = db.query(Location).filter(Location.id == payload.new_parent_id).first()
        if new_parent is None:
            raise HTTPException(status_code=404, detail="New parent not found")
        require_facility_access(db, current_user, new_parent.facility_id)

    location_tree.ensure_unique_code(
        db,
        facility_id=location.facility_id,
        parent_id=payload.new_parent_id,
        code=location.code,
        exclude_id=location.id,
    )

    old_parent_id = location.parent_id
    location_tree.move(db, location, new_parent)

    for room_id in filter(None, {old_parent_id, payload.new_parent_id}):
        room = db.query(Location).filter(Location.id == room_id).first()
        if room is not None and room.location_type == LocationType.ROOM.value:
            location_tree.recount_beds(db, room)

    db.commit()
    db.refresh(location)
    return location


@router.delete("/{id}")
def delete_location(
    id: int,
    db: Session = Depends(get_db),
    hard: bool = Query(False, description="Permanently remove, subtree included"),
    current_user: User = Depends(get_current_user),
) -> Any:
    """Deactivate by default; delete outright only when asked.

    A location with history behind it — work orders, downtime intervals,
    readings — is not safe to remove: the rows that reference it are the
    evidence a compliance report is built from. Deactivating takes it out of
    every picker and leaves that history intact, which is almost always what
    "delete this room" actually means.
    """
    location = _location_or_404(db, id, current_user)
    descendant_count = (
        location_tree.descendants_query(db, location)
        .with_entities(func.count(Location.id)).scalar() or 0
    )

    if hard:
        from app.models.service_request import ServiceRequest
        referenced = (
            db.query(func.count(ServiceRequest.id))
            .filter(ServiceRequest.location_id == location.id)
            .scalar() or 0
        )
        if referenced:
            raise HTTPException(
                status_code=409,
                detail=(
                    f"{referenced} work order(s) reference this location. "
                    "Deactivate it instead so the history stays readable."
                ),
            )
        db.delete(location)   # cascades down the subtree
        db.commit()
        return {"detail": "Location deleted", "descendants_removed": descendant_count}

    location.is_active = False
    beneath = [row.id for row in
               location_tree.descendants_query(db, location).with_entities(Location.id).all()]
    location_tree.descendants_query(db, location).update(
        {Location.is_active: False}, synchronize_session=False,
    )
    # What is inside goes with it. A removed room's chairs and sockets would
    # otherwise stay on every fixture list, faultable, in a room nobody can open.
    # Their status is left alone so the record of what state they were in stays.
    from app.models.fixture import Fixture
    fixtures_off = (
        db.query(Fixture)
        .filter(Fixture.location_id.in_([location.id, *beneath]), Fixture.is_active.is_(True))
        .update({Fixture.is_active: False}, synchronize_session=False)
    )
    assets_off = room_assets.take_out_of_rooms(db, [location.id, *beneath])
    db.commit()
    return {"detail": "Location deactivated", "descendants_deactivated": descendant_count,
            "fixtures_deactivated": fixtures_off, "assets_deactivated": assets_off}


@router.post("/fill-contents", response_model=RoomContentsFillResult)
def fill_contents(
    payload: RoomContentsFill,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Any:
    """Bring rooms that already exist up to what their room type contains.

    The building setup only creates rooms that are not there yet, so giving
    Conference rooms twelve chairs would otherwise reach none of the conference
    rooms already in the register. Fixtures and assets are topped up, never
    reduced: a room with fourteen chairs keeps fourteen. All or nothing.
    """
    if not payload.fixtures and not payload.assets:
        raise HTTPException(status_code=422, detail="Say what the rooms should contain")
    if payload.fixtures:
        require_module_permission(current_user, "locations", "add")
    if payload.assets:
        require_module_permission(current_user, "facility-inventory", "add")

    locations = db.query(Location).filter(Location.id.in_(payload.location_ids)).all()
    if len(locations) != len(set(payload.location_ids)):
        raise HTTPException(status_code=404, detail="Location not found")
    for facility_id in {loc.facility_id for loc in locations}:
        require_facility_access(db, current_user, facility_id)

    fixtures_created = assets_created = changed = 0
    try:
        for location in locations:
            before = fixtures_created + assets_created
            for item in payload.fixtures:
                fixtures_created += len(fixture_service.top_up(
                    db, location=location, fixture_type=item.fixture_type, count=item.count,
                    discipline_code=item.discipline_code, code_prefix=item.code_prefix,
                    created_by_id=current_user.id,
                ))
            for item in payload.assets:
                assets_created += len(room_assets.top_up(
                    db, location=location, asset_type=item.asset_type, count=item.count,
                    discipline_code=item.discipline_code,
                ))
            changed += 1 if fixtures_created + assets_created > before else 0
    except ValueError as exc:
        db.rollback()
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    db.commit()
    return RoomContentsFillResult(
        fixtures_created=fixtures_created, assets_created=assets_created, rooms_changed=changed,
    )


# ── Bulk import ──────────────────────────────────────────────────────────────

@router.post("/bulk-import", response_model=BulkImportResult)
def bulk_import(
    payload: BulkLocationImport,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Any:
    """Import a room register from a spreadsheet.

    Defaults to a dry run, and the caller has to ask for the real thing. A
    half-applied import on a space register is worse than a refused one,
    because nobody can tell which half landed.

    Rows reference their parent by code, not by id, because a spreadsheet built
    by a human contains door numbers and never database keys.
    """
    require_facility_access(db, current_user, payload.facility_id)

    issues: List[BulkImportIssue] = []
    created = updated = skipped = 0

    existing = {
        (row.parent_id, row.code): row
        for row in db.query(Location).filter(Location.facility_id == payload.facility_id).all()
    }
    by_code: dict[str, Location] = {}
    for row in db.query(Location).filter(Location.facility_id == payload.facility_id).all():
        by_code.setdefault(row.code, row)

    departments = {
        d.name.lower(): d
        for d in db.query(Department).filter(Department.facility_id == payload.facility_id).all()
    }

    # Two passes so that a row may name a parent defined further down the sheet.
    # Humans do not sort spreadsheets topologically and should not have to.
    pending: list[tuple[int, Any, Optional[Location]]] = []
    for index, row in enumerate(payload.rows):
        if row.location_type not in LOCATION_TYPES:
            issues.append(BulkImportIssue(
                row_index=index, code=row.code, severity="error",
                message=f"Unknown location type '{row.location_type}'",
            ))
            continue
        # A use the list does not have is kept, not dropped with a warning
        # nobody reads. It carries no rules; the listed ones do.
        row.space_use = normalise_space_use(row.space_use)
        pending.append((index, row, None))

    for index, row, _ in pending:
        parent = by_code.get(row.parent_code) if row.parent_code else None
        if row.parent_code and parent is None:
            issues.append(BulkImportIssue(
                row_index=index, code=row.code, severity="error",
                message=f"Parent '{row.parent_code}' not found in this facility",
            ))
            skipped += 1
            continue

        try:
            location_tree.validate_placement(row.location_type, parent)
        except HTTPException as exc:
            issues.append(BulkImportIssue(
                row_index=index, code=row.code, severity="error", message=str(exc.detail),
            ))
            skipped += 1
            continue

        key = (parent.id if parent else None, row.code)
        found = existing.get(key)

        if found is not None:
            updated += 1
            # A code that belonged to a removed space used to update that
            # hidden row and leave it hidden, so the import reported success
            # and nothing appeared. Listing it again means it is there again.
            if not found.is_active:
                issues.append(BulkImportIssue(
                    row_index=index, code=row.code, severity="warning",
                    message=(f"'{row.code}' had been removed and is restored. "
                             "Anything that was inside it stays removed."),
                ))
            if payload.dry_run:
                continue
            found.is_active = True
            found.name = row.name or found.name
            found.space_use = row.space_use or found.space_use
            found.criticality = row.criticality or found.criticality
            if row.area_sqft is not None:
                found.area_sqft = row.area_sqft
            if row.ceiling_height_ft is not None:
                found.ceiling_height_ft = row.ceiling_height_ft
            found.volume_cuft = location_tree.derive_volume_cuft(
                found.area_sqft, found.ceiling_height_ft,
            ) or found.volume_cuft
            if row.bed_count is not None:
                found.bed_count = row.bed_count
            if row.external_ref:
                found.external_ref = row.external_ref
            continue

        created += 1
        # A dry run does the insert too, and the rollback below undoes it.
        #
        # It used to skip here, which meant a row it had just validated was
        # never registered in by_code — so any row naming it as a parent was
        # reported as "Parent not found", even though the real import would
        # have created that parent a moment earlier. Every structure more than
        # one level deep failed its own dry run. A preview that runs different
        # code from the thing it previews will eventually disagree with it.
        department = departments.get((row.department_name or "").lower())
        location = Location(
            facility_id=payload.facility_id,
            parent_id=parent.id if parent else None,
            location_type=row.location_type,
            code=row.code.strip(),
            name=row.name,
            space_use=row.space_use,
            criticality=row.criticality or location_tree.default_criticality(row.space_use),
            department_id=department.id if department else None,
            area_sqft=row.area_sqft,
            ceiling_height_ft=row.ceiling_height_ft,
            volume_cuft=location_tree.derive_volume_cuft(row.area_sqft, row.ceiling_height_ft),
            bed_count=row.bed_count or 0,
            external_ref=row.external_ref,
            created_by_id=current_user.id,
        )
        db.add(location)
        db.flush()
        location_tree.assign_path(db, location, parent)
        existing[key] = location
        by_code.setdefault(location.code, location)

        # The room's contents, inside the same transaction as the room, so a
        # conference room never exists without its chairs or the reverse.
        # A dry run does this too and rolls it back, which is how a bad
        # fixture type is reported before anything is written.
        for item in row.fixtures or []:
            try:
                fixture_service.bulk_create(
                    db, location=location, fixture_type=item.fixture_type,
                    count=max(1, item.count), label=item.label, spec=item.spec,
                    discipline_code=item.discipline_code, code_prefix=item.code_prefix,
                    created_by_id=current_user.id,
                )
            except ValueError as exc:
                issues.append(BulkImportIssue(
                    row_index=index, code=row.code, severity="error",
                    message=f"{item.fixture_type}: {exc}",
                ))
        if row.assets:
            require_module_permission(current_user, "facility-inventory", "add")
        for item in row.assets or []:
            try:
                room_assets.create_in_room(
                    db, location=location, asset_type=item.asset_type,
                    count=item.count, discipline_code=item.discipline_code,
                )
            except ValueError as exc:
                issues.append(BulkImportIssue(
                    row_index=index, code=row.code, severity="error",
                    message=f"{item.asset_type}: {exc}",
                ))

    has_errors = any(issue.severity == "error" for issue in issues)
    if payload.dry_run or has_errors:
        # Errors abort the whole import even when the caller asked to commit.
        # Landing 300 of 400 rooms leaves a register nobody can trust.
        db.rollback()
    else:
        db.commit()

    return BulkImportResult(
        dry_run=payload.dry_run or has_errors,
        total_rows=len(payload.rows),
        created=created,
        updated=updated,
        skipped=skipped,
        issues=issues,
    )


# ── Floor plans ──────────────────────────────────────────────────────────────

@router.get("/{id}/floor-plans", response_model=FloorPlanListResponse)
def list_floor_plans(
    id: int,
    db: Session = Depends(get_db),
    include_superseded: bool = Query(False),
    current_user: User = Depends(get_current_user),
) -> Any:
    location = _location_or_404(db, id, current_user)
    query = db.query(FloorPlan).filter(FloorPlan.location_id == location.id)
    if not include_superseded:
        query = query.filter(FloorPlan.is_current.is_(True))
    items = query.order_by(FloorPlan.version.desc()).all()
    return {"items": items, "total": len(items)}


@router.post("/{id}/floor-plans", response_model=FloorPlanSchema, status_code=201)
async def upload_floor_plan(
    id: int,
    file: UploadFile = File(...),
    name: Optional[str] = Query(None),
    page_number: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Any:
    """Attach a drawing to a floor.

    Uploading again supersedes rather than replaces. Pins live on `Location`,
    so a new revision never destroys the survey behind it — the worst case is
    that the drawing shifted and somebody re-calibrates.
    """
    location = _location_or_404(db, id, current_user)

    if location.location_type not in location_tree.PLANNABLE_TYPES:
        raise HTTPException(
            status_code=400,
            detail=(
                f"A {location.location_type} cannot hold a floor plan. "
                f"Attach it to one of: {', '.join(sorted(location_tree.PLANNABLE_TYPES))}."
            ),
        )

    if file.content_type not in ALLOWED_PLAN_TYPES:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported drawing type '{file.content_type}'. Allowed: PDF, PNG, JPEG, WebP, SVG.",
        )

    content = await file.read()
    if len(content) > MAX_PLAN_BYTES:
        raise HTTPException(
            status_code=413,
            detail=f"Drawing exceeds the {MAX_PLAN_BYTES // (1024 * 1024)}MB limit",
        )

    os.makedirs(UPLOAD_DIR, exist_ok=True)
    extension = os.path.splitext(file.filename or "plan")[1]
    stored_name = f"{uuid.uuid4().hex}{extension}"
    with open(os.path.join(UPLOAD_DIR, stored_name), "wb") as handle:
        handle.write(content)

    previous = (
        db.query(FloorPlan)
        .filter(FloorPlan.location_id == location.id, FloorPlan.is_current.is_(True))
        .all()
    )
    for plan in previous:
        plan.is_current = False
    next_version = (
        db.query(func.coalesce(func.max(FloorPlan.version), 0))
        .filter(FloorPlan.location_id == location.id).scalar() or 0
    ) + 1

    plan = FloorPlan(
        facility_id=location.facility_id,
        location_id=location.id,
        name=name or file.filename or f"{location.code} plan",
        source_filename=file.filename,
        source_path=f"/uploads/floor_plans/{stored_name}",
        source_mime=file.content_type,
        page_number=page_number,
        image_path=f"/uploads/floor_plans/{stored_name}",
        version=next_version,
        is_current=True,
        uploaded_by_id=current_user.id,
    )
    db.add(plan)
    db.commit()
    db.refresh(plan)
    return plan


@router.get("/floor-plans/{plan_id}/file")
def download_floor_plan(
    plan_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Any:
    from fastapi.responses import FileResponse

    plan = db.query(FloorPlan).filter(FloorPlan.id == plan_id).first()
    if plan is None:
        raise HTTPException(status_code=404, detail="Floor plan not found")
    require_facility_access(db, current_user, plan.facility_id)

    try:
        path = protected_upload_path(
            UPLOAD_DIR, os.path.basename(plan.source_path or ""), "floor_plans",
        )
    except ValueError:
        raise HTTPException(status_code=404, detail="Floor plan file not found")

    if not os.path.isfile(path):
        raise HTTPException(status_code=404, detail="Floor plan file not found")
    return FileResponse(path, filename=plan.source_filename or os.path.basename(path))


@router.put("/floor-plans/{plan_id}", response_model=FloorPlanSchema)
def update_floor_plan(
    plan_id: int,
    payload: FloorPlanUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Any:
    plan = db.query(FloorPlan).filter(FloorPlan.id == plan_id).first()
    if plan is None:
        raise HTTPException(status_code=404, detail="Floor plan not found")
    require_facility_access(db, current_user, plan.facility_id)

    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(plan, field, value)
    db.commit()
    db.refresh(plan)
    return plan


@router.post("/floor-plans/{plan_id}/calibrate", response_model=FloorPlanSchema)
def calibrate_floor_plan(
    plan_id: int,
    payload: FloorPlanCalibrate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Any:
    """Set the drawing's scale from one measured line.

    After this, a traced room yields square feet, which yields cubic feet,
    which is what an air-changes-per-hour check needs. It is the step that turns
    a picture into a measuring instrument, and it takes about five seconds.
    """
    plan = db.query(FloorPlan).filter(FloorPlan.id == plan_id).first()
    if plan is None:
        raise HTTPException(status_code=404, detail="Floor plan not found")
    require_facility_access(db, current_user, plan.facility_id)

    plan.scale_ft_per_px = payload.real_feet / payload.pixel_distance
    db.commit()
    db.refresh(plan)
    return plan


@router.get("/floor-plans/{plan_id}/pins", response_model=List[LocationWithStatus])
def list_pins(
    plan_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Any:
    plan = db.query(FloorPlan).filter(FloorPlan.id == plan_id).first()
    if plan is None:
        raise HTTPException(status_code=404, detail="Floor plan not found")
    require_facility_access(db, current_user, plan.facility_id)

    rows = (
        db.query(Location, SpaceStatus)
        .outerjoin(SpaceStatus, SpaceStatus.location_id == Location.id)
        .filter(Location.floor_plan_id == plan.id, Location.is_active.is_(True))
        .all()
    )
    results = []
    for location, status in rows:
        payload = LocationWithStatus.model_validate(location)
        payload.display_label = location.display_label
        if status is not None:
            payload.availability = status.availability
            payload.oos_reason = status.oos_reason
            payload.status_since = status.since
        results.append(payload)
    return results


@router.post("/floor-plans/{plan_id}/pins")
def place_pins(
    plan_id: int,
    payload: PinBatch,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Any:
    """Place or move several pins at once.

    Batched because tracing a floor produces pins in bursts, and one request per
    pin would make a 400-room floor 400 round trips.
    """
    plan = db.query(FloorPlan).filter(FloorPlan.id == plan_id).first()
    if plan is None:
        raise HTTPException(status_code=404, detail="Floor plan not found")
    require_facility_access(db, current_user, plan.facility_id)

    ids = [pin.location_id for pin in payload.pins]
    rows = {
        row.id: row
        for row in db.query(Location).filter(
            Location.id.in_(ids), Location.facility_id == plan.facility_id,
        ).all()
    }

    placed = 0
    missing: List[int] = []
    for pin in payload.pins:
        location = rows.get(pin.location_id)
        if location is None:
            missing.append(pin.location_id)
            continue
        location.floor_plan_id = plan.id
        location.plan_x = pin.plan_x
        location.plan_y = pin.plan_y
        placed += 1

    db.commit()
    return {"placed": placed, "not_found": missing}


@router.post("/floor-plans/{plan_id}/quick-pin", response_model=LocationSchema, status_code=201)
def quick_pin(
    plan_id: int,
    payload: QuickPin,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Any:
    """Create a location and place it in one action — the tracing loop.

    Click the plan, type the door number, move on. Anything that puts a form
    between those two makes surveying a floor take a day instead of an hour,
    which for a customer with no room list is the difference between the
    project happening and not.
    """
    plan = db.query(FloorPlan).filter(FloorPlan.id == plan_id).first()
    if plan is None:
        raise HTTPException(status_code=404, detail="Floor plan not found")
    require_facility_access(db, current_user, plan.facility_id)

    parent = db.query(Location).filter(Location.id == plan.location_id).first()
    if parent is None:
        raise HTTPException(status_code=404, detail="The plan's location no longer exists")

    location_tree.validate_placement(payload.location_type, parent)
    location_tree.ensure_unique_code(
        db, facility_id=plan.facility_id, parent_id=parent.id, code=payload.code,
    )

    location = Location(
        facility_id=plan.facility_id,
        parent_id=parent.id,
        location_type=payload.location_type,
        code=payload.code.strip(),
        name=payload.name,
        space_use=payload.space_use,
        criticality=location_tree.default_criticality(payload.space_use),
        floor_plan_id=plan.id,
        plan_x=payload.plan_x,
        plan_y=payload.plan_y,
        created_by_id=current_user.id,
    )
    db.add(location)
    db.flush()
    location_tree.assign_path(db, location, parent)
    db.commit()
    db.refresh(location)
    return location


@router.post("/{id}/trace", response_model=TraceResult)
def trace_room(
    id: int,
    payload: TraceRoom,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Any:
    """Record a traced outline, and derive the room's area from it.

    A pin says where a room is; the outline says how big it is. Once the plan
    is calibrated, area falls out of the trace with no tape measure — and area
    times ceiling height is the volume an air-changes-per-hour check needs.
    Without this, somebody measures several thousand rooms by hand or the
    ventilation number cannot be computed at all.

    Area is derived here rather than sent by the client because the scale is the
    server's to know: a client-computed figure would quietly disagree the moment
    anybody re-calibrated the drawing.
    """
    location = _location_or_404(db, id, current_user)

    polygon = [{"x": vertex.x, "y": vertex.y} for vertex in payload.polygon]

    # A crossed outline makes the shoelace formula return the difference of its
    # two lobes rather than their sum — a plausible-looking number that is
    # simply wrong, and which would propagate into volume and then into an
    # air-change calculation that reads as compliant.
    if geometry.is_self_intersecting(polygon):
        raise HTTPException(
            status_code=400,
            detail=(
                "That outline crosses itself, so its area cannot be computed. "
                "Re-trace the room without the walls overlapping."
            ),
        )

    location.plan_polygon = polygon

    plan = (
        db.query(FloorPlan).filter(FloorPlan.id == location.floor_plan_id).first()
        if location.floor_plan_id else None
    )

    result = TraceResult(location_id=location.id)

    if payload.set_pin_to_centroid:
        centre = geometry.centroid(polygon)
        if centre is not None:
            location.plan_x, location.plan_y = centre
            result.plan_x, result.plan_y = centre

    if plan is None:
        result.message = "Outline saved. It is not attached to a floor plan, so no area was computed."
    elif not plan.scale_ft_per_px:
        # Stored, but not measurable yet. Saying so beats showing a blank field
        # that looks like a bug.
        result.message = "Outline saved. Calibrate the drawing's scale to get the area in square feet."
    else:
        scale = float(plan.scale_ft_per_px)
        area = geometry.area_sqft(
            polygon, scale_ft_per_px=scale, width_px=plan.width_px, height_px=plan.height_px,
        )
        perimeter = geometry.perimeter_ft(
            polygon, scale_ft_per_px=scale, width_px=plan.width_px, height_px=plan.height_px,
        )
        if area is None:
            result.message = "Outline saved. The drawing has no recorded pixel size, so no area was computed."
        else:
            location.area_sqft = area
            result.area_sqft = area
            result.perimeter_ft = perimeter
            volume = location_tree.derive_volume_cuft(area, location.ceiling_height_ft)
            if volume is not None:
                location.volume_cuft = volume
                result.volume_cuft = volume
            else:
                result.message = (
                    f"Area set to {area:,.0f} sq ft. Add a ceiling height to get the "
                    "volume an air-change check needs."
                )

    db.commit()
    return result
