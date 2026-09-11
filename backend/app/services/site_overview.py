"""One hospital, summarised — the numbers its dashboard opens on.

Gathered in one place rather than by the browser firing eight list requests and
counting the rows, which is both slower and wrong: a list capped at 200 reports
200 beds whatever the real number is.

The figures chosen are the ones somebody running a hospital's estate is
accountable for at a glance: what is unavailable right now, what is overdue,
and what is open. Totals that only go up — how many rooms exist — are context,
not news, so they sit underneath.
"""
from __future__ import annotations

from datetime import timedelta

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models.compliance import ComplianceTask
from app.models.equipment import Equipment
from app.models.fixture import Fixture
from app.models.location import Location
from app.models.permit import WorkPermit
from app.models.service_request import ServiceRequest
from app.models.space_status import SpaceStatus
from app.utils.clock import utc_today

# Statuses that mean a job is still somebody's problem.
_CLOSED = {"completed", "cancelled"}
# Bed and theatre states that mean the space cannot take a patient.
_UNAVAILABLE = {"out_of_service", "blocked"}


def _counts_by(db: Session, column, *filters) -> dict[str, int]:
    rows = db.query(column, func.count()).filter(*filters).group_by(column).all()
    return {str(k): int(v) for k, v in rows if k is not None}


def build(db: Session, facility_id: int) -> dict:
    loc_filter = (Location.facility_id == facility_id, Location.is_active.is_(True))

    by_type = _counts_by(db, Location.location_type, *loc_filter)
    beds = int(
        db.query(func.coalesce(func.sum(Location.bed_count), 0))
        .filter(*loc_filter).scalar() or 0
    )

    # Space availability, counted from the status table rather than inferred:
    # a room with no status row has never been set either way, and reporting it
    # as available would be a guess.
    space_states = _counts_by(
        db, SpaceStatus.availability, SpaceStatus.facility_id == facility_id,
    )
    unavailable = sum(n for state, n in space_states.items() if state in _UNAVAILABLE)

    work_orders = db.query(ServiceRequest).filter(
        ServiceRequest.facility_id == facility_id,
    )
    open_orders = [
        row for row in work_orders.all()
        if str(getattr(row.status, "value", row.status)).lower() not in _CLOSED
    ]
    open_by_priority: dict[str, int] = {}
    for row in open_orders:
        key = str(getattr(row.priority, "value", row.priority)).lower()
        open_by_priority[key] = open_by_priority.get(key, 0) + 1

    today = utc_today()
    compliance_overdue = db.query(func.count(ComplianceTask.id)).filter(
        ComplianceTask.facility_id == facility_id,
        ComplianceTask.status.in_(["overdue", "missed"]),
    ).scalar() or 0
    compliance_due_soon = db.query(func.count(ComplianceTask.id)).filter(
        ComplianceTask.facility_id == facility_id,
        ComplianceTask.status == "scheduled",
        ComplianceTask.due_date <= today + timedelta(days=30),
    ).scalar() or 0

    permits_active = db.query(func.count(WorkPermit.id)).filter(
        WorkPermit.facility_id == facility_id,
        WorkPermit.status.in_(["approved", "active"]),
    ).scalar() or 0

    assets_total = db.query(func.count(Equipment.id)).filter(
        Equipment.facility_id == facility_id,
    ).scalar() or 0

    fixtures_total = db.query(func.count(Fixture.id)).filter(
        Fixture.facility_id == facility_id, Fixture.is_active.is_(True),
    ).scalar() or 0
    fixtures_faulty = db.query(func.count(Fixture.id)).filter(
        Fixture.facility_id == facility_id, Fixture.is_active.is_(True),
        Fixture.status == "faulty",
    ).scalar() or 0

    return {
        "facility_id": facility_id,
        "estate": {
            "buildings": by_type.get("building", 0),
            "floors": by_type.get("floor", 0),
            "rooms": by_type.get("room", 0) + by_type.get("mech_room", 0),
            "beds": beds,
            "spaces_total": sum(by_type.values()),
        },
        "spaces": {
            "unavailable": unavailable,
            "by_state": space_states,
        },
        "work": {
            "open": len(open_orders),
            "by_priority": open_by_priority,
            "critical": open_by_priority.get("critical", 0),
            "high": open_by_priority.get("high", 0),
        },
        "compliance": {
            "overdue": int(compliance_overdue),
            "due_within_30_days": int(compliance_due_soon),
        },
        "permits": {"active": int(permits_active)},
        "assets": {"total": int(assets_total)},
        "fixtures": {"total": int(fixtures_total), "faulty": int(fixtures_faulty)},
    }
