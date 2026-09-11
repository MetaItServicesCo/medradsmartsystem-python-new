"""Work order rules that used to be implied by the schema.

`ServiceRequest.equipment_id` was NOT NULL, which quietly guaranteed that every
ticket had a subject. Relaxing it for location-only reporting removes that
guarantee, so the rule moves here and is enforced explicitly instead of by a
column definition.

Also here: which trade a job should go to, and whether a vendor is fit to be
sent. Both are judgements that must not be scattered across endpoints.
"""
from __future__ import annotations

from fastapi import HTTPException, status as http_status
from sqlalchemy.orm import Session

from app.models.discipline import Discipline, UserDiscipline
from app.models.equipment import Equipment
from app.models.location import Location
from app.models.service_request import (
    NON_BILLABLE_TYPES, Priority, ServiceRequest, WorkOrderType,
)
from app.models.user import User, UserRole
from app.models.vendor import Vendor, VendorContract
from app.services import location_tree


def validate_subject(
    db: Session,
    *,
    equipment_id: int | None,
    location_id: int | None,
    facility_id: int,
) -> tuple[Equipment | None, Location | None]:
    """A work order must be about an asset, a place, or both — never neither.

    This is the invariant the NOT NULL used to provide. It is looser on purpose:
    "the socket in OR-3 is dead" is a location and no asset, and forcing the
    reporter to find an asset is how that report never gets filed.
    """
    if equipment_id is None and location_id is None:
        raise HTTPException(
            status_code=http_status.HTTP_400_BAD_REQUEST,
            detail="A work order must reference equipment, a location, or both",
        )

    equipment = None
    if equipment_id is not None:
        equipment = db.query(Equipment).filter(Equipment.id == equipment_id).first()
        if equipment is None:
            raise HTTPException(status_code=404, detail="Equipment not found")
        if equipment.facility_id != facility_id:
            raise HTTPException(
                status_code=http_status.HTTP_400_BAD_REQUEST,
                detail="That equipment belongs to a different facility",
            )

    location = None
    if location_id is not None:
        location = db.query(Location).filter(Location.id == location_id).first()
        if location is None:
            raise HTTPException(status_code=404, detail="Location not found")
        if location.facility_id != facility_id:
            raise HTTPException(
                status_code=http_status.HTTP_400_BAD_REQUEST,
                detail="That location belongs to a different facility",
            )
        if not location_tree.is_workable(location):
            raise HTTPException(
                status_code=http_status.HTTP_400_BAD_REQUEST,
                detail="That location is decommissioned or inactive",
            )

    return equipment, location


def infer_location(equipment: Equipment | None, location: Location | None) -> int | None:
    """Fall back to where the asset lives when the reporter did not say.

    Costs nothing and means every asset-based ticket still lands on the space
    board, which is what makes the capacity report complete rather than
    complete-except-for-tickets-raised-from-the-asset-screen.
    """
    if location is not None:
        return location.id
    if equipment is not None and equipment.location_id:
        return equipment.location_id
    return None


def infer_discipline(
    db: Session,
    *,
    equipment: Equipment | None,
    explicit_discipline_id: int | None,
) -> int | None:
    """The asset knows its own trade; take it unless told otherwise."""
    if explicit_discipline_id is not None:
        return explicit_discipline_id
    if equipment is not None and equipment.discipline_id:
        return equipment.discipline_id
    return None


def resolve_billable(work_order_type: str, explicit: bool | None) -> bool:
    """Whether the quotation path applies.

    In-house plant work is internal labour and must not be dragged through a
    flow built for billing a customer for medical equipment service. An explicit
    choice always wins — a contractor's corrective visit on a PM work order is
    billable and the type alone cannot know that.
    """
    if explicit is not None:
        return explicit
    return work_order_type not in NON_BILLABLE_TYPES


def candidate_technicians(
    db: Session,
    *,
    facility_id: int,
    discipline_id: int | None,
) -> list[User]:
    """Technicians who hold the trade, best match first.

    Without this, `UserRole.TECHNICIAN` is undifferentiated and an electrical
    job routes to a biomed. Falls back to all technicians rather than returning
    nothing when no one holds the trade — an unrouted work order helps nobody,
    and an empty picker reads as a broken screen.
    """
    base = (
        db.query(User)
        .filter(
            User.role == UserRole.TECHNICIAN,
            User.is_active.is_(True),
        )
    )

    if discipline_id is None:
        return base.all()

    holders = (
        base.join(UserDiscipline, UserDiscipline.user_id == User.id)
        .filter(UserDiscipline.discipline_id == discipline_id)
        .order_by(UserDiscipline.is_primary.desc(), User.full_name.asc())
        .all()
    )
    return holders or base.all()


def assert_vendor_dispatchable(db: Session, vendor_id: int) -> Vendor:
    """Refuse to dispatch a vendor whose papers have lapsed.

    An accreditation survey will ask you to evidence that the contractor who
    worked on your fire pump was licensed and insured on the day they did it.
    Blocking at assignment is the only point where that is still cheap to fix;
    a report a quarter later is an audit finding, not a control.
    """
    vendor = db.query(Vendor).filter(Vendor.id == vendor_id).first()
    if vendor is None:
        raise HTTPException(status_code=404, detail="Vendor not found")

    if vendor.status == "suspended":
        raise HTTPException(
            status_code=http_status.HTTP_409_CONFLICT,
            detail=f"{vendor.name} is suspended and cannot be dispatched",
        )
    if vendor.status != "active":
        raise HTTPException(
            status_code=http_status.HTTP_409_CONFLICT,
            detail=f"{vendor.name} is not an active vendor",
        )
    if not vendor.credentials_ok:
        expiry = vendor.earliest_credential_expiry
        when = f" (earliest expiry {expiry.isoformat()})" if expiry else ""
        raise HTTPException(
            status_code=http_status.HTTP_409_CONFLICT,
            detail=(
                f"{vendor.name} has a lapsed or missing required credential{when}. "
                "Update the certificate of insurance or licence before dispatching."
            ),
        )
    return vendor


def find_covering_contract(
    db: Session,
    *,
    vendor_id: int,
    facility_id: int,
    equipment_id: int | None,
    discipline_id: int | None,
) -> VendorContract | None:
    """The contract this job falls under, if any.

    Scope composes three ways and they are checked most-specific first: an
    explicit asset list beats a discipline, which beats a blanket facility
    contract. Elevator contracts are nearly always written as an asset list,
    and the sixth car added last year quietly not being on it is exactly the
    gap this ordering surfaces.
    """
    from app.models.vendor import VendorContractAsset, VendorContractStatus

    candidates = (
        db.query(VendorContract)
        .filter(
            VendorContract.vendor_id == vendor_id,
            VendorContract.status == VendorContractStatus.ACTIVE.value,
        )
        .filter(
            (VendorContract.facility_id == facility_id)
            | (VendorContract.facility_id.is_(None))
        )
        .all()
    )
    current = [c for c in candidates if c.is_current]
    if not current:
        return None

    if equipment_id is not None:
        covered_ids = {
            row.contract_id
            for row in db.query(VendorContractAsset)
            .filter(
                VendorContractAsset.equipment_id == equipment_id,
                VendorContractAsset.contract_id.in_([c.id for c in current]),
            )
            .all()
        }
        for contract in current:
            if contract.id in covered_ids:
                return contract

    if discipline_id is not None:
        for contract in current:
            if contract.discipline_ids and discipline_id in contract.discipline_ids:
                return contract

    for contract in current:
        if not contract.discipline_ids and not contract.covered_assets:
            return contract

    return None


def default_priority(location: Location | None) -> str:
    """Seed priority from the space when the reporter did not choose.

    A nurse reporting a fault is not grading it against an SLA matrix, and
    defaulting everything to medium is how a theatre outage sits behind a
    broken office chair in the queue.
    """
    if location is None or not location.criticality:
        return Priority.MEDIUM.value
    return {
        "critical": Priority.HIGH.value,
        "high": Priority.MEDIUM.value,
        "standard": Priority.MEDIUM.value,
        "low": Priority.LOW.value,
    }.get(location.criticality, Priority.MEDIUM.value)


def validate_type(work_order_type: str) -> str:
    valid = {t.value for t in WorkOrderType}
    if work_order_type not in valid:
        raise HTTPException(
            status_code=http_status.HTTP_400_BAD_REQUEST,
            detail=f"Unknown work order type '{work_order_type}'. Allowed: {', '.join(sorted(valid))}.",
        )
    return work_order_type


def discipline_or_404(db: Session, discipline_id: int) -> Discipline:
    discipline = db.query(Discipline).filter(Discipline.id == discipline_id).first()
    if discipline is None:
        raise HTTPException(status_code=404, detail="Discipline not found")
    return discipline
