"""When a work order is actually due, and whether it was answered in time.

`Tier.response_time_hours` has been stored and rendered on the facility tier
screen since tiers shipped, and nothing has ever computed against it. There was
no due date, no breach flag, and priority was a free dropdown. For medical
equipment billed under a service contract that was survivable. For facilities
work it is not, because the clock is the product.

The important design point is where the number comes from. A facility tier is a
commercial arrangement — it says what this customer bought. It says nothing
about whether the thing that broke is in a store room or an operating theatre,
and that is the difference between a Tuesday ticket and a cancelled case. So
the space leads, and the tier is the floor beneath it.

Resolution order, first match wins:

  1. a vendor contract's own promised response, when the work is dispatched out
  2. the response matrix, keyed on space criticality x priority
  3. the facility tier's flat response_time_hours
  4. a conservative default

Nothing here reads a wall clock other than `now`, so it is trivially testable
and a fixed input always produces a fixed due date.
"""
from __future__ import annotations

from datetime import datetime, timedelta

from sqlalchemy.orm import Session

from app.models.location import Criticality, Location
from app.models.service_request import Priority, ServiceRequest, WorkOrderType
from app.models.vendor import VendorContract


# Response hours by space criticality and work order priority.
#
# The top-left cell is the one that matters: a critical-priority fault in a
# critical space is one hour, because that is a theatre with a case in it or an
# isolation room with a patient in it. The bottom-right is a week, because it
# is a scuffed door in a store room and pretending otherwise devalues every
# other number in the table.
_RESPONSE_MATRIX: dict[str, dict[str, int]] = {
    Criticality.CRITICAL.value: {
        Priority.CRITICAL.value: 1,
        Priority.HIGH.value:     2,
        Priority.MEDIUM.value:   8,
        Priority.LOW.value:      24,
    },
    Criticality.HIGH.value: {
        Priority.CRITICAL.value: 2,
        Priority.HIGH.value:     4,
        Priority.MEDIUM.value:   24,
        Priority.LOW.value:      72,
    },
    Criticality.STANDARD.value: {
        Priority.CRITICAL.value: 4,
        Priority.HIGH.value:     8,
        Priority.MEDIUM.value:   48,
        Priority.LOW.value:      120,
    },
    Criticality.LOW.value: {
        Priority.CRITICAL.value: 8,
        Priority.HIGH.value:     24,
        Priority.MEDIUM.value:   72,
        Priority.LOW.value:      168,
    },
}

_DEFAULT_RESPONSE_HOURS = 24

# Planned work is scheduled, not raced. A PM generated for next month has a due
# date from its schedule and a response clock would be noise; a shutdown has a
# date somebody negotiated with the operating theatre manager weeks ago.
_UNCLOCKED_TYPES: frozenset[str] = frozenset({
    WorkOrderType.PREVENTIVE.value,
    WorkOrderType.ROUNDS.value,
    WorkOrderType.PROJECT.value,
    WorkOrderType.UTILITY_SHUTDOWN.value,
    WorkOrderType.INSPECTION.value,
})


def effective_criticality(location: Location | None, equipment=None) -> str:
    """How critical this work is, from the space first and the asset second.

    The space leads because consequence is territorial: the same dead
    receptacle means different things in different rooms. The asset is the
    fallback for work with no location — and for the case where the asset is
    more critical than where it sits, which is the standby generator in an
    unremarkable yard.
    """
    if location is not None and location.criticality:
        return location.criticality
    if equipment is not None and getattr(equipment, "criticality", None):
        return equipment.criticality
    return Criticality.STANDARD.value


def _contract_response_hours(contract: VendorContract | None, priority: str) -> int | None:
    """What the vendor actually promised for this priority, if anything.

    A missing band falls through to the house matrix rather than being invented,
    because a contract that is silent on 'low' has not agreed to anything about
    it and recording a number would be a fiction the report later relies on.
    """
    if contract is None or not contract.response_hours_by_priority:
        return None
    raw = contract.response_hours_by_priority.get(priority)
    if raw is None:
        return None
    try:
        hours = int(raw)
    except (TypeError, ValueError):
        return None
    return hours if hours > 0 else None


def resolve_response_hours(
    db: Session,
    *,
    priority: str,
    location: Location | None,
    equipment=None,
    facility=None,
    contract: VendorContract | None = None,
) -> int:
    """The response window in hours. See the resolution order at module top."""
    from_contract = _contract_response_hours(contract, priority)
    if from_contract is not None:
        return from_contract

    criticality = effective_criticality(location, equipment)
    by_criticality = _RESPONSE_MATRIX.get(criticality)
    if by_criticality:
        matched = by_criticality.get(priority)
        if matched:
            return matched

    tier = getattr(facility, "tier", None) if facility is not None else None
    tier_hours = getattr(tier, "response_time_hours", None)
    if tier_hours:
        return int(tier_hours)

    return _DEFAULT_RESPONSE_HOURS


def compute_due_at(created_at: datetime, response_hours: int) -> datetime:
    """Elapsed hours from creation, deliberately not business hours.

    A theatre does not stop being a theatre at five o'clock, and a hospital
    plant runs continuously. If a customer ever needs a business-hours calendar
    for low-priority work, it belongs here as an explicit calendar rather than
    as a fudge to this arithmetic.
    """
    return created_at + timedelta(hours=response_hours)


def apply_sla(
    db: Session,
    work_order: ServiceRequest,
    *,
    location: Location | None = None,
    contract: VendorContract | None = None,
    now: datetime | None = None,
) -> ServiceRequest:
    """Stamp the response window and due date onto a work order.

    Safe to call again after a priority or location change — recomputes from the
    original `created_at`, so a ticket escalated three hours in becomes due
    relative to when it was raised, not to when somebody noticed.
    """
    if work_order.work_order_type in _UNCLOCKED_TYPES:
        work_order.sla_response_hours = None
        work_order.sla_due_at = None
        work_order.sla_breached = False
        return work_order

    now = now or datetime.utcnow()
    created_at = work_order.created_at or now

    if location is None and work_order.location_id:
        location = db.query(Location).filter(Location.id == work_order.location_id).first()
    if contract is None and work_order.vendor_contract_id:
        contract = (
            db.query(VendorContract)
            .filter(VendorContract.id == work_order.vendor_contract_id)
            .first()
        )

    priority = getattr(work_order.priority, "value", work_order.priority)

    hours = resolve_response_hours(
        db,
        priority=priority,
        location=location,
        equipment=work_order.equipment,
        facility=work_order.facility,
        contract=contract,
    )

    work_order.sla_response_hours = hours
    work_order.sla_due_at = compute_due_at(created_at, hours)
    work_order.sla_breached = is_breached(work_order, now=now)
    return work_order


def is_breached(work_order: ServiceRequest, *, now: datetime | None = None) -> bool:
    """Breached when nobody responded before the due date.

    Measured against `responded_at` — first technician contact — and not
    against completion. A response SLA that silently grades on completion
    punishes long repairs that were answered immediately and rewards quick
    fixes that nobody looked at for two days.
    """
    if work_order.sla_due_at is None:
        return False
    if work_order.responded_at is not None:
        return work_order.responded_at > work_order.sla_due_at
    return (now or datetime.utcnow()) > work_order.sla_due_at


def mark_responded(work_order: ServiceRequest, *, now: datetime | None = None) -> ServiceRequest:
    """Record first contact. Idempotent: the first response is the one that
    counts, and a second technician picking the job up later must not overwrite
    a time that has already been met."""
    if work_order.responded_at is None:
        work_order.responded_at = now or datetime.utcnow()
        work_order.sla_breached = is_breached(work_order, now=now)
    return work_order


def time_remaining_minutes(work_order: ServiceRequest, *, now: datetime | None = None) -> float | None:
    """Minutes left on the clock; negative once overdue. None if unclocked."""
    if work_order.sla_due_at is None:
        return None
    delta = work_order.sla_due_at - (now or datetime.utcnow())
    return delta.total_seconds() / 60.0
