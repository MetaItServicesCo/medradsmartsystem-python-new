"""The register of what is inside each room, and reporting faults against it."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.db.base import get_db
from app.models.discipline import Discipline
from app.models.fixture import FIXTURE_STATUSES, Fixture, FixtureStatus
from app.models.location import Location
from app.models.user import User
from app.schemas.fixture import (
    FixtureBulkCreate, FixtureCreate, FixtureListResponse, FixtureResponse,
    FixtureTypeSummary, FixtureUpdate, ReportFaultRequest, ReportFaultResponse,
)
from app.services import fixture as fixture_service
from app.services import fixture_catalog
from app.core.deps import get_current_user
from app.utils.facility_access import (
    require_facility_access, scope_query_to_user_facilities,
)
from app.utils.permissions import require_module_permission

router = APIRouter()

MODULE = "locations"


def _decorate(db: Session, row: Fixture) -> FixtureResponse:
    entry = fixture_catalog.BY_TYPE.get(row.fixture_type, {})
    payload = FixtureResponse.model_validate(row)
    payload.summary = fixture_catalog.describe(row.fixture_type, row.spec)
    discipline_code = entry.get("discipline")
    if discipline_code is None and row.discipline_id is not None:
        # A custom type has no catalogue entry, so its trade comes from the
        # fixture itself — otherwise it lands under "Building" in every list.
        found = db.query(Discipline.code).filter(Discipline.id == row.discipline_id).first()
        discipline_code = found[0] if found else None
    payload.discipline_code = discipline_code
    payload.type_label = entry.get("label") or row.fixture_type.replace("_", " ").capitalize()
    return payload


def _location_or_404(db: Session, location_id: int, user: User) -> Location:
    location = db.get(Location, location_id)
    if location is None:
        raise HTTPException(status_code=404, detail="Location not found")
    require_facility_access(db, user, location.facility_id)
    return location


def _fixture_or_404(db: Session, fixture_id: int, user: User) -> Fixture:
    row = db.get(Fixture, fixture_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Fixture not found")
    require_facility_access(db, user, row.facility_id)
    return row


@router.get("/catalog")
def get_catalog(db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    """Every fixture type, its trade, and the spec fields it asks for.

    Served rather than duplicated in the browser so a site that re-routes a
    trade changes one thing.
    """
    ids = {code: pk for code, pk in db.query(Discipline.code, Discipline.id).all()}
    return {
        "types": fixture_catalog.catalog_payload(ids),
        "statuses": [{"value": s, "label": s.replace("_", " ").title()}
                     for s in FIXTURE_STATUSES],
    }


@router.get("/", response_model=FixtureListResponse)
def list_fixtures(
    location_id: int | None = None,
    facility_id: int | None = None,
    fixture_type: str | None = None,
    discipline_id: int | None = None,
    status_filter: str | None = Query(default=None, alias="status"),
    include_inactive: bool = False,
    skip: int = 0,
    limit: int = Query(default=200, le=1000),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    require_module_permission(current_user, MODULE, "index")

    query = db.query(Fixture)
    if location_id is not None:
        query = query.filter(Fixture.location_id == location_id)
    if facility_id is not None:
        require_facility_access(db, current_user, facility_id)
        query = query.filter(Fixture.facility_id == facility_id)
    query = scope_query_to_user_facilities(query, Fixture.facility_id, db, current_user)
    if fixture_type:
        query = query.filter(Fixture.fixture_type == fixture_type)
    if discipline_id is not None:
        query = query.filter(Fixture.discipline_id == discipline_id)
    if status_filter:
        query = query.filter(Fixture.status == status_filter)
    if not include_inactive:
        query = query.filter(Fixture.is_active.is_(True))

    total = query.count()
    rows = query.order_by(Fixture.fixture_type, Fixture.code).offset(skip).limit(limit).all()
    return FixtureListResponse(items=[_decorate(db, r) for r in rows], total=total)


@router.get("/summary/{location_id}", response_model=list[FixtureTypeSummary])
def summarise(
    location_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """What is in this room, one line per type — the room panel's headline."""
    require_module_permission(current_user, MODULE, "index")
    _location_or_404(db, location_id, current_user)
    return fixture_service.summarise_location(db, location_id)


@router.post("/bulk", response_model=FixtureListResponse, status_code=status.HTTP_201_CREATED)
def bulk_create(
    payload: FixtureBulkCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Add several identical fixtures at once.

    A room is inventoried by counting, not by filling in a form per socket.
    """
    require_module_permission(current_user, MODULE, "add")
    location = _location_or_404(db, payload.location_id, current_user)

    try:
        created = fixture_service.bulk_create(
            db,
            location=location,
            fixture_type=payload.fixture_type,
            count=payload.count,
            spec=payload.spec,
            label=payload.label,
            manufacturer=payload.manufacturer,
            model=payload.model,
            serial_numbers=payload.serial_numbers,
            circuit_ref=payload.circuit_ref,
            served_by_equipment_id=payload.served_by_equipment_id,
            created_by_id=current_user.id,
            discipline_code=payload.discipline_code,
            code_prefix=payload.code_prefix,
        )
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    db.commit()
    for row in created:
        db.refresh(row)
    return FixtureListResponse(items=[_decorate(db, r) for r in created], total=len(created))


@router.post("/", response_model=FixtureResponse, status_code=status.HTTP_201_CREATED)
def create_fixture(
    payload: FixtureCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    require_module_permission(current_user, MODULE, "add")
    location = _location_or_404(db, payload.location_id, current_user)

    try:
        created = fixture_service.bulk_create(
            db,
            location=location,
            fixture_type=payload.fixture_type,
            count=1,
            spec=payload.spec,
            label=payload.label,
            manufacturer=payload.manufacturer,
            model=payload.model,
            serial_numbers=[payload.serial_number] if payload.serial_number else None,
            circuit_ref=payload.circuit_ref,
            served_by_equipment_id=payload.served_by_equipment_id,
            created_by_id=current_user.id,
        )
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    row = created[0]
    if payload.code:
        row.code = payload.code
    db.commit()
    db.refresh(row)
    return _decorate(db, row)


@router.put("/{fixture_id}", response_model=FixtureResponse)
def update_fixture(
    fixture_id: int,
    payload: FixtureUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    require_module_permission(current_user, MODULE, "edit")
    row = _fixture_or_404(db, fixture_id, current_user)

    data = payload.model_dump(exclude_unset=True)
    if "status" in data and data["status"] not in FIXTURE_STATUSES:
        raise HTTPException(status_code=422, detail="Unknown status")
    # Clearing the fault clears the work order it points at; leaving a stale
    # reference makes the board say a working fixture has open work.
    if data.get("status") == FixtureStatus.WORKING.value:
        row.work_order_id = None
    for key, value in data.items():
        setattr(row, key, value)

    db.commit()
    db.refresh(row)
    return _decorate(db, row)


@router.delete("/{fixture_id}", status_code=status.HTTP_204_NO_CONTENT)
def deactivate_fixture(
    fixture_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Soft delete. The work-order history against it has to stay readable."""
    require_module_permission(current_user, MODULE, "delete")
    row = _fixture_or_404(db, fixture_id, current_user)
    row.is_active = False
    row.status = FixtureStatus.REMOVED.value
    db.commit()


@router.post("/{fixture_id}/report-fault", response_model=ReportFaultResponse,
             status_code=status.HTTP_201_CREATED)
def report_fault(
    fixture_id: int,
    payload: ReportFaultRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """One click from a broken socket to an assigned work order.

    Deliberately requires only "what is wrong with it": the room, the trade,
    the priority and the title are all already known, and every extra field is
    a reason for the person who found it to tell somebody verbally instead.
    """
    require_module_permission(current_user, "service-requests", "add")
    row = _fixture_or_404(db, fixture_id, current_user)

    request = fixture_service.report_fault(
        db,
        fixture=row,
        reported_by_id=current_user.id,
        description=payload.description,
        priority=payload.priority,
        takes_out_of_service=payload.takes_out_of_service,
    )
    db.commit()
    db.refresh(row)

    return ReportFaultResponse(
        work_order_id=request.id,
        request_number=request.request_number,
        fixture_id=row.id,
        fixture_status=row.status,
    )
