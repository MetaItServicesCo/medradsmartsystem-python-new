"""Attendance tools: who checked in, when, and where.

Asked who had checked in today, the assistant searched inspections and service
requests -- the nearest things it had -- found nothing resembling a check-in,
and said no evidence covered it. Meanwhile the screen was showing one: Omar
Ahmad, checked in by face recognition at 1:34pm.

Only attendance_events is read here, and deliberately so. The neighbouring
tables hold face embeddings and the photographs captured at each check-in, and
none of that is needed to answer who was at work. The event row carries the
person, the time, the place and how it was recorded, which is the question;
the biometric material stays where it is.
"""
from __future__ import annotations

import logging
from datetime import date, timedelta
from typing import Any, Optional

from app.assistant.tools.base import (
    ToolContext,
    ToolInputError,
    ToolResult,
    clamp_limit,
    validate_date_range,
)
from app.assistant.tools.entities import _deep_link, _facility_names
from app.assistant.tools.local_time import (
    day_label, person_zone, time_label, today_in, utc_bounds, widened_utc_bounds, zone_label,
)
from app.models.attendance import (
    AttendanceEvent,
    AttendanceEventType,
    AttendanceSource,
    AttendanceVerificationStatus,
)
from app.models.user import User
from app.utils.attendance_rules import event_timezone_of, local_date_of


logger = logging.getLogger("medrad.assistant.attendance")

EVENT_TYPES: tuple[str, ...] = tuple(m.value for m in AttendanceEventType)
SOURCES: tuple[str, ...] = tuple(m.value for m in AttendanceSource)
VERIFICATION_STATUSES: tuple[str, ...] = tuple(m.value for m in AttendanceVerificationStatus)


def _like(value: str) -> str:
    return "%{}%".format(value.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_"))


def _matching_people(ctx: ToolContext, person: str) -> list[User]:
    """Everyone whose name matches, so two Sultans are never merged into one."""
    return (
        ctx.db.query(User)
        .filter(User.full_name.ilike(_like(person), escape="\\"))
        .order_by(User.full_name.asc())
        .limit(10)
        .all()
    )


def search_attendance(
    ctx: ToolContext,
    event_type: Optional[str] = None,
    person: Optional[str] = None,
    user_id: Optional[int] = None,
    facility_id: Optional[int] = None,
    source: Optional[str] = None,
    verification_status: Optional[str] = None,
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    limit: int = 25,
) -> ToolResult:
    """Find attendance events: check-ins, check-outs and breaks.

    This is the record behind "who is in today". Attendance is not derived from
    service requests or inspections, so no amount of searching those will ever
    show that someone arrived at work.

    Each event counts on the day where the person was: the local day in the
    time zone their device recorded with it, exactly as the Attendance module
    counts it. Stored times are UTC, so a check-in at 6 pm in Karachi and a
    check-out at 3 am there are the same working day and different UTC dates.

    With no dates it is about today -- each person's own today. For one person
    that is today where they last checked in, which at 8 pm in Texas is already
    tomorrow in Karachi.
    """
    # Its own permission module, not part of HR: someone may administer
    # staff records without being allowed to see who is on site.
    ctx.require_module("attendance")
    ctx.apply_statement_timeout()
    take = clamp_limit(limit)
    validate_date_range(date_from, date_to)

    for value, allowed, label in (
        (event_type, EVENT_TYPES, "event type"),
        (source, SOURCES, "source"),
        (verification_status, VERIFICATION_STATUSES, "verification status"),
    ):
        if value is not None and value not in allowed:
            raise ToolInputError(
                "'{}' is not a valid {}. Valid values: {}".format(
                    value, label, ", ".join(allowed)
                )
            )

    notes: list[str] = [
        "Counts attendance events, not people: someone who checked in, took "
        "a break and checked out is four events and one person. Use "
        "distinct_people for a headcount.",
        "Each event is on the local day and time where the person checked in "
        "(local_time); never restate the stored UTC time.",
        "Face-recognition check-ins are reported by source only. The stored "
        "images and face data are never retrievable through the assistant.",
    ]

    # Who, exactly. A name that fits several people is not answered as one.
    subject: Optional[User] = None
    if user_id is not None:
        subject = ctx.db.get(User, user_id)
        if subject is None:
            raise ToolInputError("No person with that id. Find them with resolve_entity first.")
    elif person:
        matches = _matching_people(ctx, person)
        if len(matches) > 1:
            names = [m.full_name or m.username for m in matches]
            return ToolResult(
                tool="search_attendance",
                total_count=0,
                items=[],
                aggregates={"people_matching": names},
                applied_filters={"person": person},
                notes=["{} people match \"{}\": {}. Ask which one before answering, then "
                       "search again with their user_id.".format(len(names), person, ", ".join(names))],
            )
        if len(matches) == 1:
            subject = matches[0]
        else:
            notes.append("Nobody's name matches \"{}\". Say so; do not report it as no "
                         "check-in.".format(person))

    subject_zone = (person_zone(ctx.db, subject.id) or ctx.zone) if subject else None
    today_mode = date_from is None and date_to is None
    if today_mode and subject is not None:
        # One person: their own today.
        date_from = date_to = today_in(subject_zone)
        today_mode = False
    elif date_from is None:
        date_from = date_to
    elif date_to is None:
        date_to = date_from

    query = ctx.scope_to_facilities(
        ctx.db.query(AttendanceEvent).join(User, AttendanceEvent.user_id == User.id),
        AttendanceEvent.facility_id,
    )
    if event_type:
        query = query.filter(AttendanceEvent.event_type == event_type)
    if source:
        query = query.filter(AttendanceEvent.source == source)
    if verification_status:
        query = query.filter(AttendanceEvent.verification_status == verification_status)
    if facility_id is not None:
        query = query.filter(AttendanceEvent.facility_id == facility_id)
    if subject is not None:
        query = query.filter(AttendanceEvent.user_id == subject.id)
    elif person:
        query = query.filter(User.full_name.ilike(_like(person), escape="\\"))

    # A UTC range wide enough to hold the local days in every zone; the exact
    # local day of each event is then read from the zone it recorded.
    if today_mode:
        around = ctx.today()
        lo, hi = widened_utc_bounds(around - timedelta(days=1), around + timedelta(days=1))
    else:
        lo, hi = widened_utc_bounds(date_from, date_to)
    candidates = (
        query.filter(AttendanceEvent.event_time >= lo, AttendanceEvent.event_time < hi)
        .order_by(AttendanceEvent.event_time.desc())
        .all()
    )

    def on_day(event: AttendanceEvent) -> bool:
        zone = event_timezone_of(event)
        day = local_date_of(event)
        if today_mode:
            # Everyone's own today: a check-in in Karachi and one in Texas are
            # both "today" on their own clocks.
            return day == today_in(zone)
        return date_from <= day <= date_to

    matched = [event for event in candidates if on_day(event)]
    rows = matched[:take]
    facility_names = _facility_names(ctx, {row.facility_id for row in rows})

    items: list[dict[str, Any]] = [{
        "event_id": row.id,
        "person": row.user.full_name if row.user else None,
        "user_id": row.user_id,
        "event": _value(row.event_type),
        "event_time": row.event_time.isoformat() if row.event_time else None,
        "local_time": time_label(row.event_time, event_timezone_of(row)),
        "local_date": local_date_of(row).isoformat(),
        "timezone": event_timezone_of(row),
        "facility_name": facility_names.get(row.facility_id),
        # How it was recorded, not what was recorded: "face" says a face check
        # was used, and nothing about the face.
        "source": _value(row.source),
        "verification_status": _value(row.verification_status),
        "device": row.device_label,
        "location": row.location_place,
        "remark": row.remark,
        "route": _deep_link("/attendance"),
    } for row in rows]

    if subject is not None:
        name = subject.full_name or subject.username
        when = day_label(date_from) if date_from == date_to else "{} to {}".format(
            day_label(date_from), day_label(date_to))
        notes.insert(0, "For {}, on their own clock ({}): {}.".format(name, zone_label(subject_zone), when))
        if not any(_value(e.event_type) == "check_in" for e in matched):
            notes.append("No check-in recorded for {} on {}.".format(name, when))
            earlier = (
                ctx.db.query(AttendanceEvent)
                .filter(AttendanceEvent.user_id == subject.id,
                        AttendanceEvent.event_type == AttendanceEventType.CHECK_IN,
                        AttendanceEvent.event_time < utc_bounds(date_from, date_from, subject_zone)[0])
                .order_by(AttendanceEvent.event_time.desc())
                .first()
            )
            if earlier is not None:
                notes.append("Their last check-in before that: {}.".format(
                    time_label(earlier.event_time, event_timezone_of(earlier))))
        notes.extend(_leave_notes(ctx, subject, date_from, date_to))
    elif today_mode:
        notes.insert(0, "\"Today\" is each person's own today where they checked in.")

    return ToolResult(
        tool="search_attendance",
        total_count=len(matched),
        items=items,
        aggregates={"distinct_people": len({event.user_id for event in matched})},
        applied_filters={
            "event_type": event_type,
            "person": (subject.full_name or subject.username) if subject else person,
            "facility_id": facility_id,
            "source": source,
            "verification_status": verification_status,
            "date_field": "event_time, on each event's local day",
            "date_from": date_from.isoformat() if date_from else "each person's today",
            "date_to": date_to.isoformat() if date_to else "each person's today",
        },
        notes=notes,
    )


def _leave_notes(ctx: ToolContext, subject: User, date_from: date, date_to: date) -> list[str]:
    """Approved leave over the days asked about: "no check-in" is not "absent"
    for someone who is on leave. Only for an asker who may see leave."""
    from app.models.hr import LeaveRequest, LeaveRequestStatus
    from app.utils.permissions import has_module_permission

    own = subject.id == ctx.user.id
    if not has_module_permission(ctx.user, "my-leave" if own else "hr", "view"):
        return []
    rows = (
        ctx.db.query(LeaveRequest)
        .filter(LeaveRequest.user_id == subject.id,
                LeaveRequest.status == LeaveRequestStatus.APPROVED,
                LeaveRequest.start_date <= date_to,
                LeaveRequest.end_date >= date_from)
        .order_by(LeaveRequest.start_date.asc())
        .all()
    )
    name = subject.full_name or subject.username
    if not rows:
        return ["No approved leave on record for {} on these days.".format(name)]
    return ["{} is on approved leave {}.".format(
        name,
        day_label(row.start_date) if row.start_date == row.end_date
        else "from {} to {}".format(day_label(row.start_date), day_label(row.end_date)),
    ) for row in rows]


def _value(enum_or_str: Any) -> Optional[str]:
    """Enum columns come back as enums; the answer wants the written value."""
    if enum_or_str is None:
        return None
    return getattr(enum_or_str, "value", str(enum_or_str))
