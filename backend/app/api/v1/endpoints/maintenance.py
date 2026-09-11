"""Recurring maintenance schedules and the work orders they raise.

`POST /generate` is meant for a nightly job. It is idempotent by construction:
a schedule with work already open generates nothing, so running it twice — or
running it after somebody has run it by hand — cannot invent a PM backlog.
"""
from typing import Any, List, Optional
from datetime import date, datetime
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.deps import get_current_user
from app.db.base import get_db
from app.models.equipment import Equipment
from app.models.location import Location
from app.models.maintenance_schedule import (
    MaintenanceSchedule, ScheduleBasis, ScheduleStatus,
)
from app.models.user import User
from app.services import pm as pm_service
from app.utils.facility_access import (
    get_user_facility_ids, is_facility_scoped_user, require_facility_access,
    scope_query_to_user_facilities,
)

router = APIRouter()


class ScheduleBase(BaseModel):
    facility_id: int
    equipment_id: Optional[int] = None
    location_id: Optional[int] = None
    name: str
    task_description: Optional[str] = None
    discipline_id: Optional[int] = None
    basis: str = ScheduleBasis.CALENDAR.value
    interval_days: Optional[int] = None
    interval_runtime_hours: Optional[Decimal] = None
    runtime_point_id: Optional[int] = None
    estimated_hours: Optional[Decimal] = None
    priority: str = "medium"
    lead_time_days: int = 7
    assigned_technician_id: Optional[int] = None
    assigned_vendor_id: Optional[int] = None
    takes_space_out_of_service: bool = False
    next_due_date: Optional[date] = None


class ScheduleCreate(ScheduleBase):
    pass


class ScheduleUpdate(BaseModel):
    name: Optional[str] = None
    task_description: Optional[str] = None
    discipline_id: Optional[int] = None
    basis: Optional[str] = None
    interval_days: Optional[int] = None
    interval_runtime_hours: Optional[Decimal] = None
    runtime_point_id: Optional[int] = None
    estimated_hours: Optional[Decimal] = None
    priority: Optional[str] = None
    lead_time_days: Optional[int] = None
    assigned_technician_id: Optional[int] = None
    assigned_vendor_id: Optional[int] = None
    takes_space_out_of_service: Optional[bool] = None
    next_due_date: Optional[date] = None
    status: Optional[str] = None


class Schedule(ScheduleBase):
    id: int
    status: str
    runtime_at_last_service: Optional[Decimal] = None
    last_generated_at: Optional[datetime] = None
    last_completed_at: Optional[datetime] = None
    open_work_order_id: Optional[int] = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class ScheduleWithContext(Schedule):
    equipment_tag: Optional[str] = None
    location_code: Optional[str] = None
    is_due: bool = False
    is_overdue: bool = False
    current_runtime_hours: Optional[float] = None


class ScheduleListResponse(BaseModel):
    items: List[ScheduleWithContext]
    total: int


class GenerationResult(BaseModel):
    considered: int
    generated: int
    request_numbers: List[str]


class Forecast(BaseModel):
    horizon_days: int
    scheduled: int
    overdue: int
    estimated_hours: float
    by_month: dict


def _facility_ids(db: Session, current_user: User, facility_id: Optional[int]) -> List[int]:
    if facility_id is not None:
        require_facility_access(db, current_user, facility_id)
        return [facility_id]
    if is_facility_scoped_user(current_user):
        return list(get_user_facility_ids(db, current_user))
    from app.models.facility import Facility
    return [row.id for row in db.query(Facility.id).all()]


def _context(db: Session, rows: List[MaintenanceSchedule]) -> List[ScheduleWithContext]:
    items = []
    for schedule in rows:
        payload = ScheduleWithContext.model_validate(schedule)
        if schedule.equipment_id:
            row = db.query(Equipment.asset_tag).filter(Equipment.id == schedule.equipment_id).first()
            payload.equipment_tag = row[0] if row else None
        if schedule.location_id:
            row = db.query(Location.code).filter(Location.id == schedule.location_id).first()
            payload.location_code = row[0] if row else None
        payload.is_due = pm_service.is_due(db, schedule)
        payload.is_overdue = schedule.is_overdue
        if schedule.runtime_point_id:
            payload.current_runtime_hours = pm_service.current_runtime(db, schedule)
        items.append(payload)
    return items


@router.get("/meta")
def maintenance_metadata(current_user: User = Depends(get_current_user)) -> Any:
    return {
        "bases": [
            {"value": b.value, "label": b.value.replace("_", " ").title()} for b in ScheduleBasis
        ],
        "statuses": [
            {"value": s.value, "label": s.value.title()} for s in ScheduleStatus
        ],
    }


@router.get("/schedules", response_model=ScheduleListResponse)
def list_schedules(
    db: Session = Depends(get_db),
    facility_id: Optional[int] = Query(None),
    equipment_id: Optional[int] = Query(None),
    location_id: Optional[int] = Query(None),
    discipline_id: Optional[int] = Query(None),
    status: Optional[str] = Query(None),
    due_only: bool = Query(False),
    skip: int = 0,
    limit: int = Query(200, le=1000),
    current_user: User = Depends(get_current_user),
) -> Any:
    query = scope_query_to_user_facilities(
        db.query(MaintenanceSchedule), MaintenanceSchedule.facility_id, db, current_user,
    )
    if facility_id is not None:
        require_facility_access(db, current_user, facility_id)
        query = query.filter(MaintenanceSchedule.facility_id == facility_id)
    if equipment_id is not None:
        query = query.filter(MaintenanceSchedule.equipment_id == equipment_id)
    if location_id is not None:
        query = query.filter(MaintenanceSchedule.location_id == location_id)
    if discipline_id is not None:
        query = query.filter(MaintenanceSchedule.discipline_id == discipline_id)
    if status:
        query = query.filter(MaintenanceSchedule.status == status)

    total = query.count()
    rows = (
        query.order_by(MaintenanceSchedule.next_due_date.asc().nullslast())
        .offset(skip).limit(limit).all()
    )
    items = _context(db, rows)
    if due_only:
        items = [i for i in items if i.is_due]
        total = len(items)
    return {"items": items, "total": total}


@router.post("/schedules", response_model=Schedule, status_code=201)
def create_schedule(
    payload: ScheduleCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Any:
    require_facility_access(db, current_user, payload.facility_id)

    if payload.equipment_id is None and payload.location_id is None:
        raise HTTPException(
            status_code=400,
            detail="A schedule must attach to equipment or a location",
        )

    # A schedule that cannot say when it next falls due will never generate
    # anything, which is a silent failure rather than a loud one.
    if payload.basis in {ScheduleBasis.CALENDAR.value, ScheduleBasis.CALENDAR_OR_RUNTIME.value}:
        if not payload.interval_days:
            raise HTTPException(
                status_code=400,
                detail="A calendar-based schedule needs an interval in days",
            )
    if payload.basis in {ScheduleBasis.RUNTIME_HOURS.value, ScheduleBasis.CALENDAR_OR_RUNTIME.value}:
        if not payload.interval_runtime_hours or not payload.runtime_point_id:
            raise HTTPException(
                status_code=400,
                detail="A runtime-based schedule needs an hour interval and a runtime reading point",
            )

    schedule = MaintenanceSchedule(**payload.model_dump())
    if schedule.next_due_date is None and schedule.interval_days:
        from datetime import timedelta
        schedule.next_due_date = date.today() + timedelta(days=schedule.interval_days)

    db.add(schedule)
    db.commit()
    db.refresh(schedule)
    return schedule


@router.put("/schedules/{schedule_id}", response_model=Schedule)
def update_schedule(
    schedule_id: int,
    payload: ScheduleUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Any:
    schedule = db.query(MaintenanceSchedule).filter(MaintenanceSchedule.id == schedule_id).first()
    if schedule is None:
        raise HTTPException(status_code=404, detail="Schedule not found")
    require_facility_access(db, current_user, schedule.facility_id)

    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(schedule, field, value)
    db.commit()
    db.refresh(schedule)
    return schedule


@router.delete("/schedules/{schedule_id}")
def retire_schedule(
    schedule_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Any:
    """Retire rather than delete — generated work orders reference it, and the
    history of what was maintained is the point."""
    schedule = db.query(MaintenanceSchedule).filter(MaintenanceSchedule.id == schedule_id).first()
    if schedule is None:
        raise HTTPException(status_code=404, detail="Schedule not found")
    require_facility_access(db, current_user, schedule.facility_id)

    schedule.status = ScheduleStatus.RETIRED.value
    db.commit()
    return {"detail": f"{schedule.name} retired"}


@router.post("/generate", response_model=GenerationResult)
def generate(
    db: Session = Depends(get_db),
    facility_id: Optional[int] = Query(None),
    current_user: User = Depends(get_current_user),
) -> Any:
    """Raise work orders for every schedule currently due. Safe to re-run."""
    facility_ids = _facility_ids(db, current_user, facility_id)
    if not facility_ids:
        return GenerationResult(considered=0, generated=0, request_numbers=[])

    result = pm_service.run(db, facility_ids=facility_ids, requester_id=current_user.id)
    db.commit()
    return result


@router.get("/forecast", response_model=Forecast)
def forecast(
    db: Session = Depends(get_db),
    facility_id: Optional[int] = Query(None),
    days: int = Query(90, ge=7, le=730),
    current_user: User = Depends(get_current_user),
) -> Any:
    """The shape of the coming quarter, in work count and estimated hours."""
    facility_ids = _facility_ids(db, current_user, facility_id)
    if not facility_ids:
        return Forecast(horizon_days=days, scheduled=0, overdue=0, estimated_hours=0.0, by_month={})
    return pm_service.forecast(db, facility_ids=facility_ids, days=days)
