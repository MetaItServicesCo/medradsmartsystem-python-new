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
from datetime import date, datetime, time
from typing import Any, Optional

from sqlalchemy import func

from app.assistant.tools.base import (
    ToolContext,
    ToolInputError,
    ToolResult,
    clamp_limit,
    validate_date_range,
)
from app.assistant.tools.entities import _deep_link, _facility_names
from app.models.attendance import (
    AttendanceEvent,
    AttendanceEventType,
    AttendanceSource,
    AttendanceVerificationStatus,
)
from app.models.user import User


logger = logging.getLogger("medrad.assistant.attendance")

EVENT_TYPES: tuple[str, ...] = tuple(m.value for m in AttendanceEventType)
SOURCES: tuple[str, ...] = tuple(m.value for m in AttendanceSource)
VERIFICATION_STATUSES: tuple[str, ...] = tuple(m.value for m in AttendanceVerificationStatus)


def _like(value: str) -> str:
    return "%{}%".format(value.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_"))


def search_attendance(
    ctx: ToolContext,
    event_type: Optional[str] = None,
    person: Optional[str] = None,
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

    Defaults to today when no dates are given, because "who checked in" almost
    always means today and answering it for all of history would be a different
    question.
    """
    # Its own permission module, not part of HR: someone may administer
    # staff records without being allowed to see who is on site.
    ctx.require_module("attendance")
    ctx.apply_statement_timeout()
    take = clamp_limit(limit)

    # "Who checked in" with no period meant is about today.
    if date_from is None and date_to is None:
        date_from = date_to = date.today()
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

    query = ctx.scope_to_facilities(
        ctx.db.query(AttendanceEvent).join(
            User, AttendanceEvent.user_id == User.id
        ),
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
    if person:
        pattern = _like(person)
        query = query.filter(User.full_name.ilike(pattern, escape="\\"))
    if date_from:
        query = query.filter(AttendanceEvent.event_time >= datetime.combine(date_from, time.min))
    if date_to:
        query = query.filter(AttendanceEvent.event_time <= datetime.combine(date_to, time.max))

    totals = query.with_entities(
        func.count().label("count"),
        func.count(func.distinct(AttendanceEvent.user_id)).label("people"),
    ).one()

    rows = (
        query.order_by(AttendanceEvent.event_time.desc())
        .limit(take)
        .all()
    )
    facility_names = _facility_names(ctx, {row.facility_id for row in rows})

    items: list[dict[str, Any]] = [{
        "event_id": row.id,
        "person": row.user.full_name if row.user else None,
        "user_id": row.user_id,
        "event": _value(row.event_type),
        "event_time": row.event_time.isoformat() if row.event_time else None,
        "timezone": row.timezone,
        "facility_name": facility_names.get(row.facility_id),
        # How it was recorded, not what was recorded: "face" says a face check
        # was used, and nothing about the face.
        "source": _value(row.source),
        "verification_status": _value(row.verification_status),
        "device": row.device_label,
        "remark": row.remark,
        "route": _deep_link("/attendance"),
    } for row in rows]

    return ToolResult(
        tool="search_attendance",
        total_count=int(totals.count or 0),
        items=items,
        aggregates={"distinct_people": int(totals.people or 0)},
        applied_filters={
            "event_type": event_type,
            "person": person,
            "facility_id": facility_id,
            "source": source,
            "verification_status": verification_status,
            "date_field": "event_time",
            "date_from": date_from.isoformat() if date_from else None,
            "date_to": date_to.isoformat() if date_to else None,
        },
        notes=[
            "Counts attendance events, not people: someone who checked in, took "
            "a break and checked out is four events and one person. Use "
            "distinct_people for a headcount.",
            "Face-recognition check-ins are reported by source only. The stored "
            "images and face data are never retrievable through the assistant.",
        ],
    )


def _value(enum_or_str: Any) -> Optional[str]:
    """Enum columns come back as enums; the answer wants the written value."""
    if enum_or_str is None:
        return None
    return getattr(enum_or_str, "value", str(enum_or_str))
