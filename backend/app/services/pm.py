"""Turning maintenance schedules into work orders.

Idempotence is the whole discipline here. A sweep that raises a second monthly
filter change because the first has not been done yet produces a PM backlog
that is pure fiction, and once the backlog is fiction people stop working it.
`MaintenanceSchedule.open_work_order_id` is what prevents that: a schedule with
work already open generates nothing.

Runtime-based scheduling is here because plant needs it and clinical equipment
does not. A standby generator that never runs does not need its 200-hour
service; one that ran all week through a storm needs it early. Calendar-only
scheduling gets both of those wrong.
"""
from __future__ import annotations

from datetime import date, datetime, timedelta

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models.maintenance_schedule import (
    MaintenanceSchedule, ScheduleBasis, ScheduleStatus,
)
from app.models.reading import Reading, ReadingPoint
from app.models.service_request import (
    Priority, ServiceRequest, ServiceRequestStatus, WorkOrderType,
)
from app.utils.clock import utc_today


def _next_request_number(db: Session) -> str:
    last = db.query(ServiceRequest).order_by(ServiceRequest.id.desc()).first()
    return f"SR-{((last.id + 1) if last else 1):06d}"


def current_runtime(db: Session, schedule: MaintenanceSchedule) -> float | None:
    """Latest runtime reading for a runtime-based schedule."""
    if schedule.runtime_point_id is None:
        return None
    latest = (
        db.query(Reading)
        .filter(Reading.point_id == schedule.runtime_point_id)
        .order_by(Reading.recorded_at.desc())
        .first()
    )
    return float(latest.value) if latest is not None else None


def is_due(db: Session, schedule: MaintenanceSchedule, *, today: date | None = None) -> bool:
    """Whether work should be raised now, counting the lead time.

    Lead time matters: a planner needs the work order before the date, not on
    it, or every PM is raised already late.
    """
    today = today or utc_today()

    if schedule.status != ScheduleStatus.ACTIVE.value:
        return False
    if schedule.open_work_order_id is not None:
        return False

    calendar_due = False
    if schedule.next_due_date is not None:
        calendar_due = today >= (schedule.next_due_date - timedelta(days=schedule.lead_time_days or 0))

    runtime_due = False
    if schedule.basis in {ScheduleBasis.RUNTIME_HOURS.value, ScheduleBasis.CALENDAR_OR_RUNTIME.value}:
        if schedule.interval_runtime_hours:
            hours = current_runtime(db, schedule)
            if hours is not None:
                since = hours - float(schedule.runtime_at_last_service or 0)
                runtime_due = since >= float(schedule.interval_runtime_hours)

    if schedule.basis == ScheduleBasis.CALENDAR.value:
        return calendar_due
    if schedule.basis == ScheduleBasis.RUNTIME_HOURS.value:
        return runtime_due
    # Whichever arrives first, which is the honest reading of an engine's
    # service interval.
    return calendar_due or runtime_due


def generate_work_order(
    db: Session,
    schedule: MaintenanceSchedule,
    *,
    requester_id: int,
    now: datetime | None = None,
) -> ServiceRequest:
    """Raise the work order for one schedule and link it back.

    Does not commit. The link is set before returning, so a caller that commits
    once for a whole sweep cannot end up with work orders whose schedules still
    think they are due.
    """
    now = now or datetime.utcnow()

    work_order = ServiceRequest(
        request_number=_next_request_number(db),
        facility_id=schedule.facility_id,
        equipment_id=schedule.equipment_id,
        location_id=schedule.location_id,
        requester_id=requester_id,
        assigned_technician_id=schedule.assigned_technician_id,
        assigned_vendor_id=schedule.assigned_vendor_id,
        problem_description=schedule.name,
        service_required=schedule.task_description or schedule.name,
        priority=Priority(schedule.priority) if schedule.priority else Priority.MEDIUM,
        status=(
            ServiceRequestStatus.ASSIGNED if schedule.assigned_technician_id
            else ServiceRequestStatus.NEW
        ),
        work_order_type=WorkOrderType.PREVENTIVE.value,
        discipline_id=schedule.discipline_id,
        # Planned in-house work is not billed through the quotation path built
        # for charging a customer for medical equipment service.
        is_billable=False,
        takes_space_out_of_service=schedule.takes_space_out_of_service,
        assigned_at=now if schedule.assigned_technician_id else None,
        history=[{
            "action": "generated_from_schedule",
            "at": now.isoformat() + "Z",
            "changes": {"schedule_id": schedule.id, "schedule": schedule.name},
        }],
    )
    db.add(work_order)
    db.flush()

    schedule.open_work_order_id = work_order.id
    schedule.last_generated_at = now
    return work_order


def run(
    db: Session,
    *,
    facility_ids: list[int],
    requester_id: int,
    today: date | None = None,
) -> dict:
    """Generate every work order currently due. Does not commit.

    Intended for a nightly job. Returns a summary rather than the rows, because
    a sweep across a large estate should not drag every object back through the
    caller.
    """
    today = today or utc_today()
    schedules = (
        db.query(MaintenanceSchedule)
        .filter(
            MaintenanceSchedule.facility_id.in_(facility_ids),
            MaintenanceSchedule.status == ScheduleStatus.ACTIVE.value,
            MaintenanceSchedule.open_work_order_id.is_(None),
        )
        .all()
    )

    generated: list[str] = []
    for schedule in schedules:
        if not is_due(db, schedule, today=today):
            continue
        work_order = generate_work_order(db, schedule, requester_id=requester_id)
        generated.append(work_order.request_number)

    return {
        "considered": len(schedules),
        "generated": len(generated),
        "request_numbers": generated,
    }


def close_out(
    db: Session,
    schedule: MaintenanceSchedule,
    *,
    completed_at: datetime | None = None,
) -> MaintenanceSchedule:
    """Advance a schedule after its work order completes.

    The next date is measured from completion rather than from the previous due
    date. For calendar PM either is defensible; for plant, measuring from when
    the filter was actually changed is the one that matches physical reality.
    """
    completed_at = completed_at or datetime.utcnow()

    schedule.last_completed_at = completed_at
    schedule.open_work_order_id = None

    if schedule.interval_days:
        schedule.next_due_date = completed_at.date() + timedelta(days=schedule.interval_days)

    if schedule.basis in {ScheduleBasis.RUNTIME_HOURS.value, ScheduleBasis.CALENDAR_OR_RUNTIME.value}:
        hours = current_runtime(db, schedule)
        if hours is not None:
            schedule.runtime_at_last_service = hours

    return schedule


def close_out_for_work_order(db: Session, work_order) -> int:
    """Advance any schedule whose open work order just completed.

    Called from the work order completion path, so a technician finishing a PM
    does not also have to remember to reset its schedule.
    """
    schedules = (
        db.query(MaintenanceSchedule)
        .filter(MaintenanceSchedule.open_work_order_id == work_order.id)
        .all()
    )
    for schedule in schedules:
        close_out(db, schedule, completed_at=work_order.completed_at or datetime.utcnow())
    return len(schedules)


def forecast(db: Session, *, facility_ids: list[int], days: int = 90) -> dict:
    """What is coming, so a planner can see the shape of the next quarter."""
    today = utc_today()
    horizon = today + timedelta(days=days)

    rows = (
        db.query(MaintenanceSchedule)
        .filter(
            MaintenanceSchedule.facility_id.in_(facility_ids),
            MaintenanceSchedule.status == ScheduleStatus.ACTIVE.value,
            MaintenanceSchedule.next_due_date.isnot(None),
            MaintenanceSchedule.next_due_date <= horizon,
        )
        .order_by(MaintenanceSchedule.next_due_date.asc())
        .all()
    )

    overdue = [s for s in rows if s.next_due_date < today]
    hours = sum(float(s.estimated_hours or 0) for s in rows)

    by_month: dict[str, int] = {}
    for schedule in rows:
        key = schedule.next_due_date.strftime("%Y-%m")
        by_month[key] = by_month.get(key, 0) + 1

    return {
        "horizon_days": days,
        "scheduled": len(rows),
        "overdue": len(overdue),
        "estimated_hours": round(hours, 1),
        "by_month": dict(sorted(by_month.items())),
    }
