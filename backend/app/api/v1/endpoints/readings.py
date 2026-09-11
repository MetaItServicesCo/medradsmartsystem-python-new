"""Measured values, and the spaces they gate.

The point of this module over a checklist field: a reading is a number with a
unit and a band, it trends, and going out of band is itself an event. An
isolation room that loses negative pressure cannot hold the patient it was
built for — that is a facilities fact with an immediate clinical consequence,
and it is the clearest case for holding plant and clinical data together.

Two rules are enforced here and nowhere else:

  * every reading carries its own unit, copied at write time, so correcting a
    point's unit next year cannot reinterpret history
  * `in_spec` is evaluated against the band in force at that moment, for the
    same reason — a limit tightened in March must not turn February's
    compliant readings into violations
"""
from typing import Any, List, Optional
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.deps import get_current_user
from app.db.base import get_db
from app.models.equipment import Equipment
from app.models.location import Location
from app.models.reading import (
    UNIT_LABELS, Reading as ReadingModel, ReadingPoint, ReadingPointKind, convert_to,
)
from app.models.space_status import Availability, OutOfServiceReason, StatusSource
from app.models.user import User
from app.schemas.reading import (
    Reading as ReadingSchema, ReadingCreate, ReadingListResponse, ReadingMeta,
    ReadingPoint as ReadingPointSchema, ReadingPointCreate, ReadingPointListResponse,
    ReadingPointUpdate, ReadingPointWithState, ReadingResult, ReadingWithContext,
    UnitOption, unit_label,
)
from app.services import space_status as space_status_service
from app.utils.facility_access import (
    get_user_facility_ids, is_facility_scoped_user, require_facility_access,
    scope_query_to_user_facilities,
)

router = APIRouter()


def _point_or_404(db: Session, point_id: int, current_user: User) -> ReadingPoint:
    point = db.query(ReadingPoint).filter(ReadingPoint.id == point_id).first()
    if point is None:
        raise HTTPException(status_code=404, detail="Reading point not found")
    require_facility_access(db, current_user, point.facility_id)
    return point


def _decorate_point(db: Session, point: ReadingPoint) -> ReadingPointWithState:
    payload = ReadingPointWithState.model_validate(point)
    payload.unit_label = unit_label(point.unit)

    latest = (
        db.query(ReadingModel)
        .filter(ReadingModel.point_id == point.id)
        .order_by(ReadingModel.recorded_at.desc())
        .first()
    )
    if latest is not None:
        payload.last_value = latest.value
        payload.last_in_spec = latest.in_spec

    payload.is_overdue = bool(point.next_due_at and point.next_due_at < datetime.utcnow())

    if point.location_id:
        location = db.query(Location.code).filter(Location.id == point.location_id).first()
        payload.location_code = location[0] if location else None
    if point.equipment_id:
        equipment = db.query(Equipment.asset_tag).filter(Equipment.id == point.equipment_id).first()
        payload.equipment_tag = equipment[0] if equipment else None

    return payload


@router.get("/meta", response_model=ReadingMeta)
def reading_metadata(current_user: User = Depends(get_current_user)) -> Any:
    """Units and their display labels, served rather than hardcoded client-side
    so the two cannot drift."""
    return ReadingMeta(
        units=[UnitOption(value=value, label=label or value) for value, label in UNIT_LABELS.items()],
        kinds=[
            UnitOption(value=k.value, label=k.value.replace("_", " ").title())
            for k in ReadingPointKind
        ],
    )


# ── Points ───────────────────────────────────────────────────────────────────

@router.get("/points", response_model=ReadingPointListResponse)
def list_points(
    db: Session = Depends(get_db),
    facility_id: Optional[int] = Query(None),
    equipment_id: Optional[int] = Query(None),
    location_id: Optional[int] = Query(None),
    kind: Optional[str] = Query(None),
    overdue_only: bool = Query(False, description="The rounds worklist"),
    include_inactive: bool = Query(False),
    limit: int = Query(200, le=1000),
    current_user: User = Depends(get_current_user),
) -> Any:
    query = scope_query_to_user_facilities(
        db.query(ReadingPoint), ReadingPoint.facility_id, db, current_user,
    )
    if facility_id is not None:
        require_facility_access(db, current_user, facility_id)
        query = query.filter(ReadingPoint.facility_id == facility_id)
    if equipment_id is not None:
        query = query.filter(ReadingPoint.equipment_id == equipment_id)
    if location_id is not None:
        query = query.filter(ReadingPoint.location_id == location_id)
    if kind:
        query = query.filter(ReadingPoint.kind == kind)
    if overdue_only:
        query = query.filter(
            ReadingPoint.next_due_at.isnot(None),
            ReadingPoint.next_due_at < datetime.utcnow(),
        )
    if not include_inactive:
        query = query.filter(ReadingPoint.is_active.is_(True))

    total = query.count()
    rows = query.order_by(ReadingPoint.next_due_at.asc().nullslast()).limit(limit).all()
    return {"items": [_decorate_point(db, row) for row in rows], "total": total}


@router.post("/points", response_model=ReadingPointSchema, status_code=201)
def create_point(
    payload: ReadingPointCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Any:
    """Define a measurable and the band it must stay inside."""
    require_facility_access(db, current_user, payload.facility_id)

    if payload.equipment_id is None and payload.location_id is None:
        raise HTTPException(
            status_code=400,
            detail="A reading point must attach to equipment or a location",
        )

    if payload.equipment_id is not None:
        equipment = db.query(Equipment).filter(Equipment.id == payload.equipment_id).first()
        if equipment is None:
            raise HTTPException(status_code=404, detail="Equipment not found")
        if equipment.facility_id != payload.facility_id:
            raise HTTPException(status_code=400, detail="That equipment is in a different facility")

    if payload.location_id is not None:
        location = db.query(Location).filter(Location.id == payload.location_id).first()
        if location is None:
            raise HTTPException(status_code=404, detail="Location not found")
        if location.facility_id != payload.facility_id:
            raise HTTPException(status_code=400, detail="That location is in a different facility")

    if payload.min_spec is not None and payload.max_spec is not None:
        if payload.min_spec > payload.max_spec:
            raise HTTPException(status_code=400, detail="min_spec cannot exceed max_spec")

    if db.query(ReadingPoint.id).filter(
        ReadingPoint.facility_id == payload.facility_id, ReadingPoint.code == payload.code,
    ).first():
        raise HTTPException(status_code=409, detail=f"Point '{payload.code}' already exists here")

    point = ReadingPoint(**payload.model_dump())
    if point.frequency_days:
        point.next_due_at = datetime.utcnow() + timedelta(days=point.frequency_days)

    db.add(point)
    db.commit()
    db.refresh(point)
    return point


@router.put("/points/{point_id}", response_model=ReadingPointSchema)
def update_point(
    point_id: int,
    payload: ReadingPointUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Any:
    point = _point_or_404(db, point_id, current_user)
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(point, field, value)

    if point.min_spec is not None and point.max_spec is not None and point.min_spec > point.max_spec:
        raise HTTPException(status_code=400, detail="min_spec cannot exceed max_spec")

    db.commit()
    db.refresh(point)
    return point


@router.delete("/points/{point_id}")
def deactivate_point(
    point_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Any:
    """Always a deactivate. Readings are the evidence a compliance report is
    built from, and removing the point would take them with it."""
    point = _point_or_404(db, point_id, current_user)
    point.is_active = False
    db.commit()
    return {"detail": f"{point.name} deactivated"}


# ── Readings ─────────────────────────────────────────────────────────────────

@router.get("/points/{point_id}/readings", response_model=ReadingListResponse)
def list_readings(
    point_id: int,
    db: Session = Depends(get_db),
    since: Optional[datetime] = Query(None),
    out_of_spec_only: bool = Query(False),
    limit: int = Query(200, le=2000),
    current_user: User = Depends(get_current_user),
) -> Any:
    """The trend for one point, newest first."""
    point = _point_or_404(db, point_id, current_user)

    query = db.query(ReadingModel).filter(ReadingModel.point_id == point.id)
    if since is not None:
        query = query.filter(ReadingModel.recorded_at >= since)
    if out_of_spec_only:
        query = query.filter(ReadingModel.in_spec.is_(False))

    total = query.count()
    rows = query.order_by(ReadingModel.recorded_at.desc()).limit(limit).all()

    items = []
    for row in rows:
        payload = ReadingWithContext.model_validate(row)
        payload.unit_label = unit_label(row.unit)
        payload.point_code = point.code
        payload.point_name = point.name
        payload.min_spec = point.min_spec
        payload.max_spec = point.max_spec
        items.append(payload)
    return {"items": items, "total": total}


@router.post("/points/{point_id}/readings", response_model=ReadingResult, status_code=201)
def record_reading(
    point_id: int,
    payload: ReadingCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Any:
    """Record one measurement, and act on it if it is out of band.

    A reading in a foreign unit is converted and the original unit reported
    back, rather than being accepted at face value — the failure this prevents
    is a pascal reading entered against an inches-of-water-column point, where
    2.5 Pa (compliant) and 2.5 in. w.c. (wildly out) look identical on screen.
    An unconvertible pair is refused rather than guessed at.
    """
    point = _point_or_404(db, point_id, current_user)
    if not point.is_active:
        raise HTTPException(status_code=400, detail="That reading point is retired")

    value = float(payload.value)
    converted_from: Optional[str] = None

    if payload.unit and payload.unit != point.unit:
        converted = convert_to(value, payload.unit, point.unit)
        if converted is None:
            raise HTTPException(
                status_code=400,
                detail=(
                    f"Cannot convert {payload.unit} to {point.unit}. "
                    f"Record the value in {unit_label(point.unit)} instead."
                ),
            )
        converted_from = payload.unit
        value = converted

    in_spec = point.evaluate(value)
    recorded_at = payload.recorded_at or datetime.utcnow()

    reading = ReadingModel(
        point_id=point.id,
        facility_id=point.facility_id,
        value=value,
        # Copied from the point, not referenced through it: correcting the
        # point's unit later must not reinterpret this number.
        unit=point.unit,
        in_spec=in_spec,
        recorded_at=recorded_at,
        recorded_by_id=current_user.id,
        work_order_id=payload.work_order_id,
        inspection_id=payload.inspection_id,
        source=payload.source,
        notes=payload.notes,
    )
    db.add(reading)

    point.last_reading_at = recorded_at
    if point.frequency_days:
        point.next_due_at = recorded_at + timedelta(days=point.frequency_days)

    # An out-of-band reading on a gating point takes the space down. This is the
    # AIIR case: negative pressure fails, the room can no longer hold the
    # patient it was built for, and nobody should have to notice by hand.
    took_space_down = False
    message: Optional[str] = None

    if not in_spec and point.gates_space_availability and point.location_id:
        location = db.query(Location).filter(Location.id == point.location_id).first()
        if location is not None:
            band = _describe_band(point)
            space_status_service.set_status(
                db, location,
                availability=Availability.OUT_OF_SERVICE.value,
                oos_reason=OutOfServiceReason.ENVIRONMENTAL_OUT_OF_SPEC.value,
                source=StatusSource.ENVIRONMENTAL.value,
                changed_by_id=current_user.id,
                notes=f"{point.name} read {value:g} {unit_label(point.unit)}{band}",
                now=recorded_at,
            )
            took_space_down = True
            message = (
                f"{location.code} taken out of service — {point.name} is outside "
                f"{band.strip() or 'its band'}."
            )

    db.commit()
    db.refresh(reading)

    if message is None and not in_spec:
        message = f"Out of spec{_describe_band(point)}."

    return ReadingResult(
        reading=ReadingSchema.model_validate(reading),
        in_spec=in_spec,
        converted_from=converted_from,
        space_taken_out_of_service=took_space_down,
        message=message,
    )


def _describe_band(point: ReadingPoint) -> str:
    label = unit_label(point.unit)
    if point.min_spec is not None and point.max_spec is not None:
        return f" (band {point.min_spec:g}–{point.max_spec:g} {label})"
    if point.min_spec is not None:
        return f" (minimum {point.min_spec:g} {label})"
    if point.max_spec is not None:
        return f" (maximum {point.max_spec:g} {label})"
    return ""


@router.get("/exceptions", response_model=ReadingListResponse)
def out_of_spec_readings(
    db: Session = Depends(get_db),
    facility_id: Optional[int] = Query(None),
    days: int = Query(30, ge=1, le=365),
    limit: int = Query(200, le=1000),
    current_user: User = Depends(get_current_user),
) -> Any:
    """Every out-of-band reading in the window — the exception report a surveyor
    asks for, and the one that should be reviewed weekly rather than annually."""
    if facility_id is not None:
        require_facility_access(db, current_user, facility_id)
        facility_ids = [facility_id]
    elif is_facility_scoped_user(current_user):
        facility_ids = list(get_user_facility_ids(db, current_user))
    else:
        from app.models.facility import Facility
        facility_ids = [row.id for row in db.query(Facility.id).all()]

    if not facility_ids:
        return {"items": [], "total": 0}

    since = datetime.utcnow() - timedelta(days=days)
    query = (
        db.query(ReadingModel, ReadingPoint)
        .join(ReadingPoint, ReadingPoint.id == ReadingModel.point_id)
        .filter(
            ReadingModel.facility_id.in_(facility_ids),
            ReadingModel.in_spec.is_(False),
            ReadingModel.recorded_at >= since,
        )
    )
    total = query.count()
    rows = query.order_by(ReadingModel.recorded_at.desc()).limit(limit).all()

    items = []
    for reading, point in rows:
        payload = ReadingWithContext.model_validate(reading)
        payload.unit_label = unit_label(reading.unit)
        payload.point_code = point.code
        payload.point_name = point.name
        payload.min_spec = point.min_spec
        payload.max_spec = point.max_spec
        items.append(payload)
    return {"items": items, "total": total}
