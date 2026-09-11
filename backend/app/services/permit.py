"""Permit rules: the ICRA matrix, who must sign, and the gate on work.

The gate is the point of the module. A permit system that records approvals but
never refuses anything is a filing cabinet, so `assert_work_permitted` is called
from the work order transition into progress and raises if a required permit is
missing, unsigned, or outside its window.

Two things are derived rather than typed, because asking a technician to
classify their own risk is how everything becomes Class I:

  * the ICRA class, from the published activity/risk matrix
  * the patient risk group, from what the space is actually used for
"""
from __future__ import annotations

from datetime import datetime, timedelta

from fastapi import HTTPException, status as http_status
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models.location import Location, SpaceUse
from app.models.permit import (
    PERMITS_WORK, ApprovalRole, ApprovalStatus, ConstructionActivityType, ICRAClass,
    PatientRiskGroup, PermitApproval, PermitStatus, PermitType, WorkPermit,
)


# ── ICRA ─────────────────────────────────────────────────────────────────────

# The published ICRA matrix: construction activity type against patient risk
# group. Where the standard gives "III/IV" the stricter class is taken, because
# the cost of over-protecting is a plastic barrier and the cost of
# under-protecting is an aspergillosis cluster.
_ICRA_MATRIX: dict[tuple[str, str], str] = {
    (ConstructionActivityType.TYPE_A.value, PatientRiskGroup.GROUP_1.value): ICRAClass.CLASS_I.value,
    (ConstructionActivityType.TYPE_A.value, PatientRiskGroup.GROUP_2.value): ICRAClass.CLASS_I.value,
    (ConstructionActivityType.TYPE_A.value, PatientRiskGroup.GROUP_3.value): ICRAClass.CLASS_I.value,
    (ConstructionActivityType.TYPE_A.value, PatientRiskGroup.GROUP_4.value): ICRAClass.CLASS_II.value,

    (ConstructionActivityType.TYPE_B.value, PatientRiskGroup.GROUP_1.value): ICRAClass.CLASS_II.value,
    (ConstructionActivityType.TYPE_B.value, PatientRiskGroup.GROUP_2.value): ICRAClass.CLASS_II.value,
    (ConstructionActivityType.TYPE_B.value, PatientRiskGroup.GROUP_3.value): ICRAClass.CLASS_II.value,
    (ConstructionActivityType.TYPE_B.value, PatientRiskGroup.GROUP_4.value): ICRAClass.CLASS_IV.value,

    (ConstructionActivityType.TYPE_C.value, PatientRiskGroup.GROUP_1.value): ICRAClass.CLASS_II.value,
    (ConstructionActivityType.TYPE_C.value, PatientRiskGroup.GROUP_2.value): ICRAClass.CLASS_III.value,
    (ConstructionActivityType.TYPE_C.value, PatientRiskGroup.GROUP_3.value): ICRAClass.CLASS_IV.value,
    (ConstructionActivityType.TYPE_C.value, PatientRiskGroup.GROUP_4.value): ICRAClass.CLASS_IV.value,

    (ConstructionActivityType.TYPE_D.value, PatientRiskGroup.GROUP_1.value): ICRAClass.CLASS_III.value,
    (ConstructionActivityType.TYPE_D.value, PatientRiskGroup.GROUP_2.value): ICRAClass.CLASS_IV.value,
    (ConstructionActivityType.TYPE_D.value, PatientRiskGroup.GROUP_3.value): ICRAClass.CLASS_IV.value,
    (ConstructionActivityType.TYPE_D.value, PatientRiskGroup.GROUP_4.value): ICRAClass.CLASS_IV.value,
}

# What each class actually requires on site. Snapshotted onto the permit so the
# printed copy taped to the barrier says what was agreed, not what the list
# happens to say a year later.
_ICRA_PRECAUTIONS: dict[str, list[str]] = {
    ICRAClass.CLASS_I.value: [
        "Execute work by methods that minimise raising dust",
        "Immediately replace any ceiling tile displaced for inspection",
    ],
    ICRAClass.CLASS_II.value: [
        "Provide active means to prevent airborne dust from dispersing",
        "Water mist work surfaces while cutting",
        "Seal unused doors with tape",
        "Block and seal air vents",
        "Place dust mat at entrance and exit",
        "Contain HVAC system in the work area",
        "Wipe surfaces with disinfectant; HEPA vacuum before leaving",
    ],
    ICRAClass.CLASS_III.value: [
        "Isolate HVAC in the work area to prevent contamination of the duct system",
        "Complete all critical barriers before work begins",
        "Maintain negative air pressure using HEPA-equipped filtration units",
        "Contain construction waste before transport in tightly covered containers",
        "Cover transport receptacles; tape covering unless solid lid",
        "Vacuum work area with HEPA filtered vacuums",
        "Remove barrier materials carefully to minimise dust spread",
        "Do not remove barriers until the project is inspected and thoroughly cleaned",
    ],
    ICRAClass.CLASS_IV.value: [
        "Isolate HVAC in the work area to prevent contamination of the duct system",
        "Complete all critical barriers before work begins",
        "Maintain negative air pressure using HEPA-equipped filtration units",
        "Seal holes, pipes, conduits and punctures",
        "Construct an anteroom; all personnel to pass through it",
        "All personnel to wear coveralls, removed each time they leave the work area",
        "Do not remove barriers until the project is inspected and thoroughly cleaned",
        "Vacuum work area with HEPA filtered vacuums; wet mop with disinfectant",
        "Remove barrier materials carefully to minimise dust spread",
    ],
}

# What the space is used for maps onto how badly the people in it would take an
# airborne infection. Derived so the assessment starts from the truth rather
# than from whatever the requester felt like selecting.
_RISK_GROUP_BY_USE: dict[str, str] = {
    SpaceUse.OPERATING_ROOM.value: PatientRiskGroup.GROUP_4.value,
    SpaceUse.PROCEDURE_ROOM.value: PatientRiskGroup.GROUP_4.value,
    SpaceUse.ICU.value: PatientRiskGroup.GROUP_4.value,
    SpaceUse.NICU.value: PatientRiskGroup.GROUP_4.value,
    SpaceUse.AIIR.value: PatientRiskGroup.GROUP_4.value,
    SpaceUse.PROTECTIVE_ISOLATION.value: PatientRiskGroup.GROUP_4.value,
    SpaceUse.STERILE_PROCESSING.value: PatientRiskGroup.GROUP_4.value,
    SpaceUse.PHARMACY.value: PatientRiskGroup.GROUP_4.value,

    SpaceUse.EMERGENCY.value: PatientRiskGroup.GROUP_3.value,
    SpaceUse.IMAGING.value: PatientRiskGroup.GROUP_3.value,
    SpaceUse.DIALYSIS.value: PatientRiskGroup.GROUP_3.value,
    SpaceUse.LABORATORY.value: PatientRiskGroup.GROUP_3.value,
    SpaceUse.PATIENT_ROOM.value: PatientRiskGroup.GROUP_3.value,

    SpaceUse.KITCHEN.value: PatientRiskGroup.GROUP_2.value,
    SpaceUse.PUBLIC.value: PatientRiskGroup.GROUP_2.value,
    SpaceUse.CORRIDOR.value: PatientRiskGroup.GROUP_2.value,

    SpaceUse.OFFICE.value: PatientRiskGroup.GROUP_1.value,
    SpaceUse.STORAGE.value: PatientRiskGroup.GROUP_1.value,
    SpaceUse.MECHANICAL.value: PatientRiskGroup.GROUP_1.value,
    SpaceUse.ELECTRICAL.value: PatientRiskGroup.GROUP_1.value,
    SpaceUse.DATA.value: PatientRiskGroup.GROUP_1.value,
}


def risk_group_for_location(location: Location | None) -> str:
    """Infer the patient risk group from what the space is for.

    Defaults to Group 2 rather than Group 1 for an unclassified space: an
    unknown room in a hospital is more likely to be clinical than not, and the
    failure that matters is under-classifying.
    """
    if location is None or not location.space_use:
        return PatientRiskGroup.GROUP_2.value
    return _RISK_GROUP_BY_USE.get(location.space_use, PatientRiskGroup.GROUP_2.value)


def icra_class(activity_type: str, risk_group: str) -> str:
    result = _ICRA_MATRIX.get((activity_type, risk_group))
    if result is None:
        raise HTTPException(
            status_code=http_status.HTTP_400_BAD_REQUEST,
            detail=f"No ICRA class for activity '{activity_type}' and risk group '{risk_group}'",
        )
    return result


def icra_precautions(class_value: str) -> list[str]:
    return list(_ICRA_PRECAUTIONS.get(class_value, []))


# ── Who must sign ────────────────────────────────────────────────────────────

def required_approvals(permit: WorkPermit) -> list[str]:
    """The roles this permit needs, given its type and how the risk came out.

    Signatures are not a fixed set per type. An ICRA Class I is a courtesy
    notification; a Class IV shuts a wing and needs Infection Prevention,
    Safety and the unit that loses the space. Making the list depend on the
    assessment is what stops everything from being routed to everyone, which is
    how approvals become rubber stamps.
    """
    roles: set[str] = set()
    permit_type = permit.permit_type

    if permit_type == PermitType.ICRA.value:
        # Class I and II are contained work; III and IV breach containment and
        # need the clinical side to agree before it happens.
        if permit.icra_class in {ICRAClass.CLASS_III.value, ICRAClass.CLASS_IV.value}:
            roles.add(ApprovalRole.INFECTION_PREVENTION.value)
            roles.add(ApprovalRole.NURSE_MANAGER.value)
        elif permit.icra_class == ICRAClass.CLASS_II.value:
            roles.add(ApprovalRole.INFECTION_PREVENTION.value)
        roles.add(ApprovalRole.FACILITY_MANAGER.value)

    elif permit_type == PermitType.ILSM.value:
        roles.add(ApprovalRole.SAFETY_OFFICER.value)
        roles.add(ApprovalRole.FACILITY_MANAGER.value)

    elif permit_type == PermitType.HOT_WORK.value:
        roles.add(ApprovalRole.SAFETY_OFFICER.value)
        roles.add(ApprovalRole.FACILITY_MANAGER.value)

    elif permit_type == PermitType.LOTO.value:
        roles.add(ApprovalRole.FACILITY_MANAGER.value)

    elif permit_type == PermitType.CONFINED_SPACE.value:
        roles.add(ApprovalRole.SAFETY_OFFICER.value)
        roles.add(ApprovalRole.FACILITY_MANAGER.value)

    elif permit_type == PermitType.UTILITY_SHUTDOWN.value:
        roles.add(ApprovalRole.FACILITY_MANAGER.value)
        # A shutdown reaching clinical space needs the people who will lose it.
        if permit.affected_location_ids:
            roles.add(ApprovalRole.NURSE_MANAGER.value)
        roles.add(ApprovalRole.SAFETY_OFFICER.value)

    elif permit_type == PermitType.PENETRATION.value:
        # Breaching a rated barrier is both an infection and a fire problem.
        roles.add(ApprovalRole.SAFETY_OFFICER.value)
        roles.add(ApprovalRole.INFECTION_PREVENTION.value)

    elif permit_type == PermitType.ELECTRICAL_ENERGIZED.value:
        roles.add(ApprovalRole.SAFETY_OFFICER.value)
        roles.add(ApprovalRole.FACILITY_MANAGER.value)

    # Any life-safety impairment pulls in Safety regardless of permit type —
    # that is what interim life safety measures are for.
    if any((permit.impairs_fire_alarm, permit.impairs_sprinkler,
            permit.impairs_egress, permit.impairs_smoke_barrier)):
        roles.add(ApprovalRole.SAFETY_OFFICER.value)

    return sorted(roles)


def ilsm_measures(permit: WorkPermit) -> list[str]:
    """Interim measures the specific impairments demand."""
    measures: list[str] = []
    if permit.impairs_fire_alarm:
        measures += [
            "Notify the fire department and the alarm monitoring company",
            "Provide additional fire watch patrols in the affected area",
            "Post signage identifying the impaired detection zone",
        ]
    if permit.impairs_sprinkler:
        measures += [
            "Provide continuous fire watch in the affected compartment",
            "Notify the fire department of the sprinkler impairment",
            "Prohibit hot work in the affected area for the duration",
        ]
    if permit.impairs_egress:
        measures += [
            "Post clear signage for the alternative egress route",
            "Brief all staff on the affected unit on the temporary route",
            "Inspect the alternative route daily for obstruction",
        ]
    if permit.impairs_smoke_barrier:
        measures += [
            "Erect a temporary smoke-tight barrier",
            "Increase hazard surveillance of the affected compartment",
        ]
    if measures:
        measures.append("Conduct additional fire drills and staff education on the affected unit")
    return measures


# ── Lifecycle ────────────────────────────────────────────────────────────────

def next_permit_number(db: Session, permit_type: str) -> str:
    """Human-readable and type-prefixed, so a number read over a phone says
    what kind of permit it is."""
    prefix = {
        PermitType.ICRA.value: "ICRA",
        PermitType.ILSM.value: "ILSM",
        PermitType.HOT_WORK.value: "HW",
        PermitType.LOTO.value: "LOTO",
        PermitType.CONFINED_SPACE.value: "CS",
        PermitType.UTILITY_SHUTDOWN.value: "USD",
        PermitType.PENETRATION.value: "PEN",
        PermitType.ELECTRICAL_ENERGIZED.value: "EEW",
    }.get(permit_type, "PTW")
    count = db.query(func.count(WorkPermit.id)).scalar() or 0
    return f"{prefix}-{count + 1:05d}"


def assess(db: Session, permit: WorkPermit, location: Location | None) -> WorkPermit:
    """Fill in everything derivable, so the requester types as little as possible."""
    if permit.permit_type == PermitType.ICRA.value:
        if not permit.patient_risk_group:
            permit.patient_risk_group = risk_group_for_location(location)
        if not permit.construction_activity_type:
            permit.construction_activity_type = ConstructionActivityType.TYPE_B.value
        permit.icra_class = icra_class(
            permit.construction_activity_type, permit.patient_risk_group,
        )
        permit.required_precautions = icra_precautions(permit.icra_class)

    measures = ilsm_measures(permit)
    if measures:
        permit.ilsm_measures = measures

    if permit.permit_type == PermitType.HOT_WORK.value:
        permit.fire_watch_required = True
        if not permit.fire_watch_minutes_after:
            # An hour, where codes commonly say thirty to sixty minutes. The
            # extra half hour is cheap and the failure mode is a fire.
            permit.fire_watch_minutes_after = 60

    return permit


def submit(db: Session, permit: WorkPermit, *, now: datetime | None = None) -> WorkPermit:
    """Move a draft to pending, creating an unsigned row per required role.

    Approvals are materialised now rather than inferred later so that the
    outstanding set is visible the moment the permit is requested — a requester
    should be able to see they are waiting on Infection Prevention without
    anyone having to work it out.
    """
    if permit.status not in {PermitStatus.DRAFT.value, PermitStatus.REJECTED.value}:
        raise HTTPException(
            status_code=http_status.HTTP_409_CONFLICT,
            detail=f"A permit in '{permit.status}' cannot be submitted",
        )

    roles = required_approvals(permit)
    if not roles:
        raise HTTPException(
            status_code=http_status.HTTP_400_BAD_REQUEST,
            detail="This permit requires no approvals — check its type and assessment",
        )

    existing = {approval.approver_role: approval for approval in permit.approvals}
    for role in roles:
        approval = existing.get(role)
        if approval is None:
            permit.approvals.append(PermitApproval(approver_role=role))
        elif approval.status == ApprovalStatus.REJECTED.value:
            # Resubmission after a rejection clears the decision rather than
            # leaving a stale "rejected" that would block forever.
            approval.status = ApprovalStatus.PENDING.value
            approval.decided_at = None
            approval.rejection_reason = None

    # Roles no longer required — the assessment was revised down — are withdrawn
    # rather than deleted, because somebody asked for them and that is history.
    for role, approval in existing.items():
        if role not in roles and approval.status == ApprovalStatus.PENDING.value:
            approval.status = ApprovalStatus.WITHDRAWN.value

    permit.status = PermitStatus.PENDING_APPROVAL.value
    permit.requested_at = now or datetime.utcnow()
    return permit


def record_decision(
    db: Session,
    permit: WorkPermit,
    *,
    role: str,
    approved: bool,
    user_id: int | None,
    user_name: str | None,
    conditions: str | None = None,
    reason: str | None = None,
    now: datetime | None = None,
) -> WorkPermit:
    """Record one signature and roll the permit forward if it was the last."""
    now = now or datetime.utcnow()

    approval = next(
        (a for a in permit.approvals if a.approver_role == role and a.status != ApprovalStatus.WITHDRAWN.value),
        None,
    )
    if approval is None:
        raise HTTPException(
            status_code=http_status.HTTP_400_BAD_REQUEST,
            detail=f"This permit does not require approval from {role.replace('_', ' ')}",
        )

    approval.status = ApprovalStatus.APPROVED.value if approved else ApprovalStatus.REJECTED.value
    approval.approved_by_id = user_id
    # Denormalised: the approval is evidence, and it must still say who signed
    # after that person has left and their account is gone.
    approval.approved_by_name = user_name
    approval.decided_at = now
    approval.conditions = conditions
    approval.rejection_reason = None if approved else reason

    if not approved:
        # One rejection stops the permit. Collecting the rest would be theatre.
        permit.status = PermitStatus.REJECTED.value
        return permit

    outstanding = [
        a for a in permit.approvals
        if a.status == ApprovalStatus.PENDING.value
    ]
    if not outstanding:
        permit.status = PermitStatus.APPROVED.value
    return permit


def close(
    db: Session,
    permit: WorkPermit,
    *,
    user_id: int | None,
    controls_removed: bool,
    notes: str | None = None,
    now: datetime | None = None,
) -> WorkPermit:
    """Close out a permit.

    `controls_removed` is not decoration. Closing a Class IV ICRA without
    confirming the barriers came down, or a LOTO without confirming the locks
    came off, is precisely the paperwork-shaped hole this module exists to
    close.
    """
    if permit.status in {PermitStatus.CLOSED.value, PermitStatus.CANCELLED.value}:
        raise HTTPException(status_code=409, detail="That permit is already closed")
    if not controls_removed:
        raise HTTPException(
            status_code=http_status.HTTP_400_BAD_REQUEST,
            detail=(
                "Confirm that barriers, locks and isolations have been removed "
                "and impaired systems restored before closing this permit"
            ),
        )

    permit.status = PermitStatus.CLOSED.value
    permit.controls_removed = True
    permit.closed_at = now or datetime.utcnow()
    permit.closed_by_id = user_id
    permit.closeout_notes = notes
    return permit


def expire_stale(db: Session, *, facility_ids: list[int], now: datetime | None = None) -> int:
    """Expire approved permits whose window has passed unused.

    An approval given for last Tuesday must not still be authorising work. This
    is the sweep that makes the window mean something; run it on a schedule.
    """
    now = now or datetime.utcnow()
    stale = (
        db.query(WorkPermit)
        .filter(
            WorkPermit.facility_id.in_(facility_ids),
            WorkPermit.status == PermitStatus.APPROVED.value,
            WorkPermit.valid_to.isnot(None),
            WorkPermit.valid_to < now,
        )
        .all()
    )
    for permit in stale:
        permit.status = PermitStatus.EXPIRED.value
    return len(stale)


# ── The gate ─────────────────────────────────────────────────────────────────

def assert_work_permitted(db: Session, work_order) -> None:
    """Refuse to start work whose permits are not in order.

    This is the whole point of the module. Called from the work order's
    transition into progress; a permit system that cannot stop anything is a
    filing cabinet.

    Only permits actually attached to this work order are considered — the
    system does not invent requirements, it enforces the ones somebody raised.
    """
    permits = (
        db.query(WorkPermit)
        .filter(
            WorkPermit.work_order_id == work_order.id,
            WorkPermit.status.notin_([
                PermitStatus.CANCELLED.value, PermitStatus.CLOSED.value,
            ]),
        )
        .all()
    )
    if not permits:
        return

    blocking: list[str] = []
    for permit in permits:
        if permit.status == PermitStatus.REJECTED.value:
            blocking.append(f"{permit.permit_number} was rejected")
        elif permit.status == PermitStatus.EXPIRED.value:
            blocking.append(f"{permit.permit_number} expired")
        elif permit.status in {PermitStatus.DRAFT.value, PermitStatus.PENDING_APPROVAL.value}:
            waiting = ", ".join(r.replace("_", " ") for r in permit.outstanding_approvals)
            blocking.append(
                f"{permit.permit_number} is awaiting {waiting}" if waiting
                else f"{permit.permit_number} has not been submitted"
            )
        elif not permit.is_authorising:
            # Approved, but outside the window it was approved for.
            blocking.append(
                f"{permit.permit_number} is approved but not valid at this time"
            )

    if blocking:
        raise HTTPException(
            status_code=http_status.HTTP_409_CONFLICT,
            detail="Work cannot start: " + "; ".join(blocking),
        )


def activate_for_work_order(db: Session, work_order, *, now: datetime | None = None) -> int:
    """Mark approved permits as active once work actually begins.

    Distinct from approved because "authorised but not started" and "controls
    are up right now" are different states to anyone walking the building.
    """
    now = now or datetime.utcnow()
    count = 0
    for permit in db.query(WorkPermit).filter(
        WorkPermit.work_order_id == work_order.id,
        WorkPermit.status == PermitStatus.APPROVED.value,
    ).all():
        permit.status = PermitStatus.ACTIVE.value
        permit.activated_at = now
        count += 1
    return count


def default_window(permit_type: str, start: datetime) -> tuple[datetime, datetime]:
    """A sensible validity window when nobody has set one.

    Hot work is a shift; a shutdown is a night; an ICRA on a construction
    project runs for weeks. Defaulting to something short is safer than
    defaulting to open-ended.
    """
    hours = {
        PermitType.HOT_WORK.value: 12,
        PermitType.LOTO.value: 24,
        PermitType.CONFINED_SPACE.value: 12,
        PermitType.UTILITY_SHUTDOWN.value: 24,
        PermitType.ELECTRICAL_ENERGIZED.value: 12,
        PermitType.PENETRATION.value: 24 * 7,
        PermitType.ILSM.value: 24 * 30,
        PermitType.ICRA.value: 24 * 30,
    }.get(permit_type, 24 * 7)
    return start, start + timedelta(hours=hours)
