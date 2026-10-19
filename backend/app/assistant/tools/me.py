"""What the person asking is themselves responsible for.

Every other tool answers questions about the business: how many service
requests are open, which facility earns most, who is busiest. Those are the
questions a Super Admin asks, and while the assistant was Super Admin only
they were the only questions it needed to answer.

Everyone else asks in the first person. "Where is my next call." "What have I
got tomorrow." "Am I off on Friday." Answering those by pointing the general
search tools at a person is possible and wrong: it depends on the model
correctly working out who "I" is, passing the right id, and remembering to
filter. Any one of those going astray shows somebody else's day, which is
worse than no answer at all.

So the asker is never a parameter here. These tools read ``ctx.user`` and
cannot be aimed at anybody else, which makes "whose work is this" a property
of the code rather than something the model gets right most of the time.

A day is assembled from four sources, and each is included only if the person
may see that module:

* service requests assigned to them
* inspections they are the inspector on
* calendar entries and meetings
* approved leave

That list is deliberately not the technician's day. A technician's schedule is
mostly the first two; an HR manager's is mostly the third and fourth; an admin
has some of each. Building this from one role's working day would have made it
useless to the others, and silently so -- an empty schedule reads as a free
afternoon, not as a tool that does not know about your kind of work. Whatever
is left out is named in the notes for the same reason.
"""
from __future__ import annotations

from datetime import date, datetime, timedelta
from typing import Any, Optional

from sqlalchemy.orm import Session

from app.assistant.tools.base import (
    ToolContext, ToolResult, clamp_limit, datetime_bounds, validate_date_range,
)
from app.models.calendar import CalendarEvent
from app.models.facility import Facility
from app.models.hr import LeaveRequest, LeaveRequestStatus
from app.models.inspection import Inspection, InspectionStatus
from app.models.service_request import ServiceRequest, ServiceRequestStatus


# A schedule with no dates means "the week ahead", which is what people mean
# when they ask what they have on without saying when.
DEFAULT_WINDOW_DAYS = 7

# Work that is still yours to do. Completed and cancelled requests are on
# nobody's schedule, and neither are closed inspections.
_LIVE_REQUEST_STATUSES = tuple(
    s for s in ServiceRequestStatus
    if s not in (ServiceRequestStatus.COMPLETED, ServiceRequestStatus.CANCELLED)
)
_LIVE_INSPECTION_STATUSES = (
    InspectionStatus.UPCOMING,
    InspectionStatus.IN_PROGRESS,
    InspectionStatus.OVERDUE,
)

# Each source, the module it needs, and how it reads when it is missing.
_SOURCES: tuple[tuple[str, str, str], ...] = (
    ("requests", "service-requests", "service requests"),
    ("inspections", "inspections", "inspections"),
    ("events", "calendar", "calendar entries and meetings"),
    ("leave", "my-leave", "booked leave"),
)


def _available(ctx: ToolContext) -> tuple[dict[str, bool], list[str]]:
    """Which parts of a day this person may be told about, and what is missing."""
    from app.utils.permissions import has_module_permission

    allowed: dict[str, bool] = {}
    missing: list[str] = []
    for key, module, label in _SOURCES:
        ok = has_module_permission(ctx.user, module, "view")
        allowed[key] = ok
        if not ok:
            missing.append(label)

    notes: list[str] = []
    if missing:
        notes.append(
            "Not included, because your account does not have access: "
            + ", ".join(missing) + "."
        )
    return allowed, notes


def _facility_places(db: Session, facility_ids: set[int]) -> dict[int, dict[str, Any]]:
    """Where each job is, in one query rather than one per row."""
    if not facility_ids:
        return {}
    rows = (
        db.query(Facility.id, Facility.name, Facility.address,
                 Facility.city, Facility.state)
        .filter(Facility.id.in_(facility_ids))
        .all()
    )
    places: dict[int, dict[str, Any]] = {}
    for facility_id, name, address, city, state in rows:
        where = ", ".join(part for part in (address, city, state) if part)
        places[facility_id] = {"facility": name, "address": where or None}
    return places


def _attach_places(db: Session, items: list[dict[str, Any]]) -> None:
    wanted = {i["facility_id"] for i in items if i.get("facility_id")}
    places = _facility_places(db, wanted)
    for item in items:
        if item.get("facility_id"):
            item.update(places.get(item["facility_id"],
                                   {"facility": None, "address": None}))


def _iso(value: Any) -> Optional[str]:
    return value.isoformat() if value else None


def _request_item(sr: ServiceRequest) -> dict[str, Any]:
    return {
        "kind": "service_request",
        "reference": sr.request_number,
        "id": sr.id,
        "title": (sr.problem_description or "")[:160] or "Service request",
        "when": _iso(sr.preferred_datetime),
        "until": None,
        "status": sr.status.value if sr.status else None,
        "priority": sr.priority.value if sr.priority else None,
        "facility_id": sr.facility_id,
    }


def _inspection_item(row: Inspection) -> dict[str, Any]:
    return {
        "kind": "inspection",
        "reference": row.inspection_number,
        "id": row.id,
        "title": "Inspection",
        "when": _iso(row.scheduled_date),
        "until": None,
        "status": row.status.value if row.status else None,
        "priority": None,
        "facility_id": row.facility_id,
    }


def _event_item(row: CalendarEvent) -> dict[str, Any]:
    return {
        "kind": "meeting" if row.is_meeting else "calendar_event",
        "reference": None,
        "id": row.id,
        "title": row.title,
        "when": _iso(row.start_time),
        "until": _iso(row.end_time),
        "status": None,
        "priority": None,
        "facility_id": None,
    }


def _leave_item(row: LeaveRequest) -> dict[str, Any]:
    return {
        "kind": "leave",
        "reference": None,
        "id": row.id,
        "title": "Approved leave",
        # Midnight, so leave sorts to the front of the day it starts rather
        # than being dropped for having no time on it.
        "when": datetime.combine(row.start_date, datetime.min.time()).isoformat(),
        "until": datetime.combine(row.end_date, datetime.max.time()).isoformat(),
        "status": row.status.value if row.status else None,
        "priority": None,
        "facility_id": None,
    }


def _sort_key(item: dict[str, Any]) -> tuple[int, str]:
    # Undated work sorts last rather than first, which is what an empty string
    # would do and would put "someday" at the top of today.
    return (0, item["when"]) if item["when"] else (1, "")


def my_schedule(
    ctx: ToolContext,
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    limit: Optional[int] = None,
) -> ToolResult:
    """Everything on the asker's own schedule in a date window, in time order."""
    ctx.apply_statement_timeout()
    allowed, notes = _available(ctx)

    if date_from is None and date_to is None:
        date_from = date.today()
        date_to = date_from + timedelta(days=DEFAULT_WINDOW_DAYS - 1)
    elif date_from is None:
        date_from = date_to
    elif date_to is None:
        date_to = date_from
    validate_date_range(date_from, date_to)
    start, end = datetime_bounds(date_from, date_to)

    items: list[dict[str, Any]] = []
    unscheduled = 0

    if allowed["requests"]:
        mine = (
            ctx.db.query(ServiceRequest)
            .filter(ServiceRequest.assigned_technician_id == ctx.user.id)
            .filter(ServiceRequest.status.in_(_LIVE_REQUEST_STATUSES))
        )
        mine = ctx.scope_to_facilities(mine, ServiceRequest.facility_id)
        items.extend(_request_item(sr) for sr in mine.filter(
            ServiceRequest.preferred_datetime.isnot(None),
            ServiceRequest.preferred_datetime >= start,
            ServiceRequest.preferred_datetime < end,
        ).all())
        # Work that is yours but has no agreed time is not on the schedule and
        # must not silently vanish: it is the commonest reason a day looks
        # emptier than it is.
        unscheduled = mine.filter(
            ServiceRequest.preferred_datetime.is_(None)).count()

    if allowed["inspections"]:
        mine = (
            ctx.db.query(Inspection)
            .filter(Inspection.inspector_id == ctx.user.id)
            .filter(Inspection.status.in_(_LIVE_INSPECTION_STATUSES))
            .filter(Inspection.scheduled_date >= start,
                    Inspection.scheduled_date < end)
        )
        mine = ctx.scope_to_facilities(mine, Inspection.facility_id)
        items.extend(_inspection_item(row) for row in mine.all())

    if allowed["events"]:
        events = (
            ctx.db.query(CalendarEvent)
            .filter(CalendarEvent.user_id == ctx.user.id)
            .filter(CalendarEvent.start_time < end,
                    CalendarEvent.end_time >= start)
        )
        items.extend(_event_item(row) for row in events.all())

    if allowed["leave"]:
        leave = (
            ctx.db.query(LeaveRequest)
            .filter(LeaveRequest.user_id == ctx.user.id)
            .filter(LeaveRequest.status == LeaveRequestStatus.APPROVED)
            .filter(LeaveRequest.start_date <= date_to,
                    LeaveRequest.end_date >= date_from)
        )
        items.extend(_leave_item(row) for row in leave.all())

    items.sort(key=_sort_key)
    total = len(items)
    items = items[:clamp_limit(limit)]
    _attach_places(ctx.db, items)

    if unscheduled:
        notes.append(
            "{} service request(s) are assigned to you with no agreed date, so "
            "they are not on this schedule.".format(unscheduled)
        )
    if not total:
        notes.append(
            "Nothing is scheduled for you in this period. That is not the same "
            "as having no work: anything without a date on it is not shown here."
        )

    counts: dict[str, int] = {}
    for item in items:
        counts[item["kind"]] = counts.get(item["kind"], 0) + 1

    return ToolResult(
        tool="my_schedule",
        total_count=total,
        items=items,
        aggregates={**counts, "unscheduled_service_requests": unscheduled},
        applied_filters={
            "person": ctx.user.full_name or ctx.user.username,
            "date_from": date_from.isoformat(),
            "date_to": date_to.isoformat(),
        },
        notes=notes,
    )


def my_next_commitment(ctx: ToolContext) -> ToolResult:
    """The next thing on the asker's own schedule, and where it is."""
    ctx.apply_statement_timeout()
    allowed, notes = _available(ctx)

    now = datetime.utcnow()
    today = now.date()
    candidates: list[dict[str, Any]] = []

    if allowed["requests"]:
        mine = (
            ctx.db.query(ServiceRequest)
            .filter(ServiceRequest.assigned_technician_id == ctx.user.id)
            .filter(ServiceRequest.status.in_(_LIVE_REQUEST_STATUSES))
            .filter(ServiceRequest.preferred_datetime.isnot(None),
                    ServiceRequest.preferred_datetime >= now)
            .order_by(ServiceRequest.preferred_datetime.asc())
        )
        found = ctx.scope_to_facilities(mine, ServiceRequest.facility_id).first()
        if found is not None:
            candidates.append(_request_item(found))

    if allowed["inspections"]:
        mine = (
            ctx.db.query(Inspection)
            .filter(Inspection.inspector_id == ctx.user.id)
            .filter(Inspection.status.in_(_LIVE_INSPECTION_STATUSES))
            .filter(Inspection.scheduled_date >= now)
            .order_by(Inspection.scheduled_date.asc())
        )
        found = ctx.scope_to_facilities(mine, Inspection.facility_id).first()
        if found is not None:
            candidates.append(_inspection_item(found))

    if allowed["events"]:
        found = (
            ctx.db.query(CalendarEvent)
            .filter(CalendarEvent.user_id == ctx.user.id)
            .filter(CalendarEvent.end_time >= now)
            .order_by(CalendarEvent.start_time.asc())
            .first()
        )
        if found is not None:
            candidates.append(_event_item(found))

    if allowed["leave"]:
        found = (
            ctx.db.query(LeaveRequest)
            .filter(LeaveRequest.user_id == ctx.user.id)
            .filter(LeaveRequest.status == LeaveRequestStatus.APPROVED)
            .filter(LeaveRequest.end_date >= today)
            .order_by(LeaveRequest.start_date.asc())
            .first()
        )
        if found is not None:
            candidates.append(_leave_item(found))

    candidates.sort(key=_sort_key)
    items = candidates[:1]
    _attach_places(ctx.db, items)

    if not items:
        notes.append(
            "Nothing upcoming is scheduled for you. Work can be assigned "
            "without an agreed time, so this does not mean you have none."
        )

    return ToolResult(
        tool="my_next_commitment",
        total_count=len(items),
        items=items,
        applied_filters={"person": ctx.user.full_name or ctx.user.username},
        notes=notes,
    )
