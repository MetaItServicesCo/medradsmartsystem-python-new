"""Space state transitions, and the downtime number they exist to produce.

Every status change closes the open history interval and opens a new one. That
is the whole discipline of this module: if a transition ever writes the current
row without closing the interval behind it, the capacity report silently starts
under-counting and nobody finds out for a quarter.

See the PHI boundary at the top of `app.models.space_status` before adding
anything here that touches occupancy.
"""
from __future__ import annotations

from datetime import datetime, timedelta

from fastapi import HTTPException, status as http_status
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models.location import Location, LocationType, PROCEDURE_USES
from app.models.space_status import (
    FACILITIES_ATTRIBUTABLE_REASONS, UNAVAILABLE_STATES, Availability,
    OutOfServiceReason, SpaceStatus, SpaceStatusHistory, StatusSource,
    legal_availabilities,
)


def _counts_as_bed(location: Location) -> bool:
    return location.location_type == LocationType.BED.value


def _counts_as_procedure_room(location: Location) -> bool:
    return location.space_use in PROCEDURE_USES


def validate_transition(location: Location, availability: str, oos_reason: str | None) -> None:
    """Refuse states that make no sense for this kind of space.

    A bed never enters `in_procedure`; an operating room never sits
    `vacant_dirty`, it sits in `turnover`. Checked here rather than by a
    constraint so that the 400 can say which values *are* legal, which is the
    difference between a usable API and a guessing game.
    """
    allowed = legal_availabilities(location.space_use, location.location_type)
    if availability not in allowed:
        raise HTTPException(
            status_code=http_status.HTTP_400_BAD_REQUEST,
            detail=(
                f"'{availability}' is not a valid state for this space. "
                f"Allowed: {', '.join(sorted(allowed))}."
            ),
        )

    if availability == Availability.OUT_OF_SERVICE.value and not oos_reason:
        # The reason is what separates capacity the plant lost from capacity
        # lost to staffing or infection control. Out of service without one is
        # a hole in the only report this table exists to produce.
        raise HTTPException(
            status_code=http_status.HTTP_400_BAD_REQUEST,
            detail="A space taken out of service must record a reason",
        )

    if oos_reason and oos_reason not in {r.value for r in OutOfServiceReason}:
        raise HTTPException(
            status_code=http_status.HTTP_400_BAD_REQUEST,
            detail=f"Unknown out-of-service reason '{oos_reason}'",
        )


def _current_status(db: Session, location_id: int) -> SpaceStatus | None:
    """Read the current row, including one added earlier in this transaction.

    `SessionLocal` is built with `autoflush=False`, so a `SpaceStatus` added but
    not yet flushed is invisible to a query — and two status changes in one
    request (a work order that downs a space and then completes, say) would each
    see nothing and insert, violating the one-row-per-location constraint.
    Flushing first is what makes this function honest about what already exists.
    """
    db.flush()
    return db.query(SpaceStatus).filter(SpaceStatus.location_id == location_id).first()


def _close_open_interval(db: Session, location_id: int, at: datetime) -> None:
    """Close whatever interval is still open for this space.

    Written as an UPDATE rather than a load-modify-save because a space with a
    stuck open interval — always a bug, occasionally a crash mid-transition —
    must end up with all of them closed rather than one.
    """
    open_rows = (
        db.query(SpaceStatusHistory)
        .filter(
            SpaceStatusHistory.location_id == location_id,
            SpaceStatusHistory.effective_to.is_(None),
        )
        .all()
    )
    for row in open_rows:
        row.effective_to = at
        # Settled at close rather than computed on read: the capacity report
        # aggregates across a great many rows, and a duration already banked
        # cannot drift if somebody later corrects a timestamp upstream.
        row.duration_minutes = round((at - row.effective_from).total_seconds() / 60.0, 2)
        db.add(row)


def set_status(
    db: Session,
    location: Location,
    *,
    availability: str,
    oos_reason: str | None = None,
    work_order_id: int | None = None,
    expected_return_at: datetime | None = None,
    notes: str | None = None,
    source: str = StatusSource.MANUAL.value,
    changed_by_id: int | None = None,
    now: datetime | None = None,
) -> SpaceStatus:
    """Move a space to a new state, closing the previous interval.

    Does not commit. The caller owns the transaction, because a status change is
    usually one half of something larger — closing a work order, or a reading
    going out of band — and half of that pair is worse than neither.
    """
    validate_transition(location, availability, oos_reason)
    now = now or datetime.utcnow()

    if availability != Availability.OUT_OF_SERVICE.value:
        # Reason and work order belong to being down. Carrying them into an
        # available state is how a space ends up permanently attributed to a
        # work order that closed months ago.
        oos_reason = None
        work_order_id = None
        expected_return_at = None

    current = _current_status(db, location.id)

    unchanged = (
        current is not None
        and current.availability == availability
        and current.oos_reason == oos_reason
        and current.work_order_id == work_order_id
    )
    if unchanged:
        # Idempotent. Re-asserting the same state must not restart the clock the
        # downtime report is counting, so only the soft fields are touched.
        current.notes = notes if notes is not None else current.notes
        current.expected_return_at = expected_return_at or current.expected_return_at
        db.add(current)
        return current

    _close_open_interval(db, location.id, now)

    if current is None:
        current = SpaceStatus(facility_id=location.facility_id, location_id=location.id)

    current.availability = availability
    current.oos_reason = oos_reason
    current.work_order_id = work_order_id
    current.expected_return_at = expected_return_at
    current.notes = notes
    current.source = source
    current.changed_by_id = changed_by_id
    # Not `updated_at`: editing a note must not move the moment the space
    # entered this state.
    current.since = now
    db.add(current)

    db.add(SpaceStatusHistory(
        facility_id=location.facility_id,
        location_id=location.id,
        availability=availability,
        oos_reason=oos_reason,
        work_order_id=work_order_id,
        effective_from=now,
        effective_to=None,
        duration_minutes=None,
        # Denormalised at write time. A store room reclassified as an ICU next
        # year must not rewrite what last quarter's downtime is attributed to.
        space_use=location.space_use,
        criticality=location.criticality,
        counts_as_bed=_counts_as_bed(location),
        counts_as_procedure_room=_counts_as_procedure_room(location),
        source=source,
        notes=notes,
        changed_by_id=changed_by_id,
    ))

    return current


def ensure_status(db: Session, location: Location, *, now: datetime | None = None) -> SpaceStatus:
    """Give a space a starting state if it has never had one.

    New rooms come out of the survey with no status at all. Defaulting them to
    available on first read means the board is usable from the moment a floor
    is pinned, instead of after somebody sets four hundred rooms by hand.
    """
    existing = _current_status(db, location.id)
    if existing is not None:
        return existing
    return set_status(
        db, location,
        availability=Availability.AVAILABLE.value,
        source=StatusSource.SYSTEM.value,
        now=now,
    )


def take_out_of_service_for_work_order(
    db: Session,
    location: Location,
    work_order,
    *,
    reason: str | None = None,
    expected_return_at: datetime | None = None,
    changed_by_id: int | None = None,
    now: datetime | None = None,
) -> SpaceStatus:
    """Down a space because of a work order, and record which one.

    Planned work is attributed to maintenance and unplanned to equipment
    failure, because those are different lines on the capacity report and
    conflating them makes a well-run planned shutdown look like a breakdown.
    """
    from app.models.service_request import WorkOrderType

    if reason is None:
        wo_type = getattr(work_order, "work_order_type", WorkOrderType.CORRECTIVE.value)
        reason = (
            OutOfServiceReason.MAINTENANCE.value
            if wo_type in {WorkOrderType.PREVENTIVE.value, WorkOrderType.UTILITY_SHUTDOWN.value}
            else OutOfServiceReason.EQUIPMENT_FAILURE.value
        )

    return set_status(
        db, location,
        availability=Availability.OUT_OF_SERVICE.value,
        oos_reason=reason,
        work_order_id=work_order.id,
        expected_return_at=expected_return_at,
        source=StatusSource.WORK_ORDER.value,
        changed_by_id=changed_by_id,
        now=now,
    )


def restore_spaces_for_work_order(
    db: Session,
    work_order,
    *,
    changed_by_id: int | None = None,
    now: datetime | None = None,
) -> list[SpaceStatus]:
    """Bring back every space this work order took down.

    Called when a work order completes. Beds return dirty rather than clean —
    a space that has had a technician and a ladder in it needs housekeeping
    before it takes a patient, and marking it clean here would be the system
    telling a comfortable lie.
    """
    downed = (
        db.query(SpaceStatus)
        .filter(
            SpaceStatus.work_order_id == work_order.id,
            SpaceStatus.availability == Availability.OUT_OF_SERVICE.value,
        )
        .all()
    )

    restored: list[SpaceStatus] = []
    for current in downed:
        location = db.query(Location).filter(Location.id == current.location_id).first()
        if location is None:
            continue
        allowed = legal_availabilities(location.space_use, location.location_type)
        if Availability.VACANT_DIRTY.value in allowed:
            target = Availability.VACANT_DIRTY.value
        elif Availability.TERMINAL_CLEAN.value in allowed:
            target = Availability.TERMINAL_CLEAN.value
        else:
            target = Availability.AVAILABLE.value

        restored.append(set_status(
            db, location,
            availability=target,
            source=StatusSource.WORK_ORDER.value,
            changed_by_id=changed_by_id,
            notes=f"Restored on completion of {work_order.request_number}",
            now=now,
        ))
    return restored


def downtime_report(
    db: Session,
    *,
    facility_ids: list[int],
    start: datetime,
    end: datetime,
    facilities_attributable_only: bool = True,
) -> dict:
    """Capacity lost to spaces being unavailable, over a window.

    This is the number the whole space-status design exists to produce, and the
    one a standalone CMMS cannot compute because it does not know what the
    space was for, nor a bed management system because it does not know why the
    space went down.

    Intervals are clipped to the window, so a space down across a month
    boundary contributes its correct share to each month rather than all of it
    to whichever end the query happens to catch.
    """
    query = (
        db.query(SpaceStatusHistory)
        .filter(
            SpaceStatusHistory.facility_id.in_(facility_ids),
            SpaceStatusHistory.availability.in_(UNAVAILABLE_STATES),
            SpaceStatusHistory.effective_from < end,
        )
        .filter(
            (SpaceStatusHistory.effective_to.is_(None))
            | (SpaceStatusHistory.effective_to > start)
        )
    )
    if facilities_attributable_only:
        query = query.filter(SpaceStatusHistory.oos_reason.in_(FACILITIES_ATTRIBUTABLE_REASONS))

    bed_minutes = 0.0
    procedure_minutes = 0.0
    other_minutes = 0.0
    by_reason: dict[str, float] = {}
    by_space_use: dict[str, float] = {}
    incidents = 0

    for row in query.all():
        # Clip to the window. An interval still open is counted up to `end`,
        # which is what makes an ongoing outage visible in today's report
        # rather than only after it is fixed.
        interval_start = max(row.effective_from, start)
        interval_end = min(row.effective_to or end, end)
        if interval_end <= interval_start:
            continue

        minutes = (interval_end - interval_start).total_seconds() / 60.0
        incidents += 1

        if row.counts_as_bed:
            bed_minutes += minutes
        elif row.counts_as_procedure_room:
            procedure_minutes += minutes
        else:
            other_minutes += minutes

        reason = row.oos_reason or "unspecified"
        by_reason[reason] = by_reason.get(reason, 0.0) + minutes
        use = row.space_use or "unclassified"
        by_space_use[use] = by_space_use.get(use, 0.0) + minutes

    return {
        "start": start,
        "end": end,
        "incidents": incidents,
        "bed_days_lost": round(bed_minutes / 1440.0, 2),
        "procedure_room_hours_lost": round(procedure_minutes / 60.0, 2),
        "other_space_hours_lost": round(other_minutes / 60.0, 2),
        "minutes_by_reason": {k: round(v, 2) for k, v in sorted(by_reason.items())},
        "minutes_by_space_use": {k: round(v, 2) for k, v in sorted(by_space_use.items())},
        "facilities_attributable_only": facilities_attributable_only,
    }


def current_board(db: Session, *, facility_ids: list[int], location_id: int | None = None) -> dict:
    """Live counts for the space board — what is available right now."""
    query = (
        db.query(SpaceStatus.availability, func.count(SpaceStatus.id))
        .filter(SpaceStatus.facility_id.in_(facility_ids))
    )
    if location_id is not None:
        anchor = db.query(Location).filter(Location.id == location_id).first()
        if anchor is not None:
            query = query.join(Location, Location.id == SpaceStatus.location_id).filter(
                Location.path.like(f"{anchor.path}%")
            )

    counts = {availability: int(count) for availability, count in query.group_by(SpaceStatus.availability).all()}
    total = sum(counts.values())
    unavailable = sum(counts.get(state, 0) for state in UNAVAILABLE_STATES)

    return {
        "total": total,
        "unavailable": unavailable,
        "available": total - unavailable,
        "by_availability": counts,
    }


def stale_out_of_service(db: Session, *, facility_ids: list[int], older_than_hours: int = 72) -> list[SpaceStatus]:
    """Spaces down longer than expected, or with no expected return at all.

    The failure mode this catches is a space taken down for a two-hour job,
    forgotten, and still marked out of service six weeks later — which quietly
    corrupts every capacity number until somebody walks past the room.
    """
    cutoff = datetime.utcnow() - timedelta(hours=older_than_hours)
    return (
        db.query(SpaceStatus)
        .filter(
            SpaceStatus.facility_id.in_(facility_ids),
            SpaceStatus.availability.in_(UNAVAILABLE_STATES),
            SpaceStatus.since < cutoff,
        )
        .order_by(SpaceStatus.since.asc())
        .all()
    )
