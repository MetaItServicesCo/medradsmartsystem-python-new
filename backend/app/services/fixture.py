"""Registering what is in a room, and raising a ticket when one of it fails.

Two operations carry this module.

Inventorying a room is a bulk act. Somebody walks into an operating theatre and
counts: twelve receptacles, eight lights, four gas outlets. Asking them to fill
in twelve forms guarantees the register is never built, so `bulk_create` takes a
count and produces sequential codes against the room.

Reporting a fault has to be one click. The person who finds a dead socket is a
nurse between cases, not a facilities planner, and every field the form asks
for is a reason to give up and tell somebody verbally instead. So everything is
inferred: the room from the fixture, the trade from the fixture type, the
priority from the room's criticality, the title from the specification. What
remains is "what is wrong with it", which only they can answer.
"""
from __future__ import annotations

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models.discipline import Discipline
from app.models.fixture import Fixture, FixtureStatus
from app.models.location import Location
from app.models.service_request import ServiceRequest
from app.services import fixture_catalog, work_order


def discipline_id_for(db: Session, fixture_type: str) -> int | None:
    """Resolve the trade that owns this fixture type, by discipline code."""
    code = fixture_catalog.discipline_for(fixture_type)
    if not code:
        return None
    row = db.query(Discipline.id).filter(Discipline.code == code).first()
    return row.id if row else None


def next_sequence(db: Session, location_id: int, fixture_type: str) -> int:
    """The next number for this type in this room.

    Counts existing rows rather than tracking a counter: fixtures get removed
    during refits, and a register that skips SKT-04 forever because something
    once occupied it invites people to wonder what happened to it.
    """
    prefix = fixture_catalog.prefix_for(fixture_type)
    existing = (
        db.query(Fixture.code)
        .filter(Fixture.location_id == location_id,
                Fixture.code.like(f"{prefix}-%"))
        .all()
    )
    highest = 0
    for (code,) in existing:
        tail = code.rsplit("-", 1)[-1]
        if tail.isdigit():
            highest = max(highest, int(tail))
    return highest + 1


def bulk_create(
    db: Session,
    *,
    location: Location,
    fixture_type: str,
    count: int,
    spec: dict | None = None,
    label: str | None = None,
    manufacturer: str | None = None,
    model: str | None = None,
    serial_numbers: list[str] | None = None,
    circuit_ref: str | None = None,
    served_by_equipment_id: int | None = None,
    created_by_id: int | None = None,
) -> list[Fixture]:
    """Add `count` fixtures of one type to a room, numbered sequentially."""
    if fixture_type not in fixture_catalog.BY_TYPE:
        raise ValueError(f"Unknown fixture type: {fixture_type}")

    prefix = fixture_catalog.prefix_for(fixture_type)
    discipline_id = discipline_id_for(db, fixture_type)
    # The catalogue's defaults, with whatever the form overrode on top.
    merged = {**fixture_catalog.defaults_for(fixture_type), **(spec or {})}
    start = next_sequence(db, location.id, fixture_type)

    created: list[Fixture] = []
    for offset in range(count):
        serial = None
        if serial_numbers and offset < len(serial_numbers):
            serial = serial_numbers[offset] or None
        fixture = Fixture(
            facility_id=location.facility_id,
            location_id=location.id,
            discipline_id=discipline_id,
            fixture_type=fixture_type,
            code=f"{prefix}-{start + offset:02d}",
            label=label,
            manufacturer=manufacturer,
            model=model,
            serial_number=serial,
            spec=merged,
            circuit_ref=circuit_ref,
            served_by_equipment_id=served_by_equipment_id,
            status=FixtureStatus.WORKING.value,
            created_by_id=created_by_id,
        )
        db.add(fixture)
        created.append(fixture)

    db.flush()
    return created


def _next_request_number(db: Session) -> str:
    last = db.query(ServiceRequest).order_by(ServiceRequest.id.desc()).first()
    return f"SR-{((last.id + 1) if last else 1):06d}"


def report_fault(
    db: Session,
    *,
    fixture: Fixture,
    reported_by_id: int,
    description: str,
    priority: str | None = None,
    takes_out_of_service: bool = False,
) -> ServiceRequest:
    """Raise a work order against one fixture.

    Everything the dispatcher needs is already known, so nothing here is asked
    of the person reporting: the room comes from the fixture, the trade from
    its type, the priority from the room's criticality, and the title from the
    specification — "20 A critical receptacle SKT-04" rather than "socket".
    """
    location = db.get(Location, fixture.location_id)
    summary = fixture_catalog.describe(fixture.fixture_type, fixture.spec)
    where = location.name or location.code if location else "unknown location"

    # Not str.capitalize(): it lowercases everything after the first
    # character, which turns "20 A" into "20 a" and "120 V" into "120 v".
    # Unit casing is not decorative — A and a are different units.
    if summary:
        summary = summary[0].upper() + summary[1:]

    request = ServiceRequest(
        request_number=_next_request_number(db),
        facility_id=fixture.facility_id,
        requester_id=reported_by_id,
        location_id=fixture.location_id,
        equipment_id=None,
        discipline_id=fixture.discipline_id,
        work_order_type="corrective",
        priority=priority or work_order.default_priority(location),
        problem_description=(
            f"{summary} {fixture.code} in {where}: {description}"
        ),
        service_required=description,
    )
    db.add(request)
    db.flush()

    fixture.status = FixtureStatus.FAULTY.value
    fixture.work_order_id = request.id
    # A fixture being out of service is not the same as the room being out of
    # service. One dead socket of twelve does not close a theatre, so that
    # judgement stays with whoever reports it rather than being inferred.
    if takes_out_of_service and location is not None:
        from app.services import space_status
        space_status.set_status(
            db,
            location=location,
            availability="out_of_service",
            oos_reason="equipment_failure",
            work_order_id=request.id,
            changed_by_id=reported_by_id,
            notes=f"{fixture.code} faulty",
        )

    db.flush()
    return request


def summarise_location(db: Session, location_id: int) -> list[dict]:
    """What is in this room, grouped the way a trade would ask for it.

    Returns one row per fixture type with its counts, so the room panel can
    lead with "12 receptacles, 1 faulty" instead of a flat list of eighty rows.
    """
    rows = (
        db.query(
            Fixture.fixture_type,
            Fixture.status,
            func.count(Fixture.id).label("n"),
        )
        .filter(Fixture.location_id == location_id, Fixture.is_active.is_(True))
        .group_by(Fixture.fixture_type, Fixture.status)
        .all()
    )

    grouped: dict[str, dict] = {}
    for fixture_type, status, count in rows:
        entry = fixture_catalog.BY_TYPE.get(fixture_type, {})
        bucket = grouped.setdefault(fixture_type, {
            "fixture_type": fixture_type,
            "label": entry.get("label", fixture_type.replace("_", " ")),
            "discipline": entry.get("discipline"),
            "total": 0,
            "working": 0,
            "faulty": 0,
            "isolated": 0,
        })
        bucket["total"] += count
        if status in bucket:
            bucket[status] += count

    return sorted(
        grouped.values(),
        key=lambda b: (b["discipline"] or "zz", b["label"]),
    )
