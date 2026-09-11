"""Generating compliance tasks, closing them out, and the evidence they leave.

The generator is idempotent by construction: one open task per program per
subject. A nightly sweep that raised a second monthly generator test because
the first was not done yet would turn the overdue list into noise within a
fortnight, and a noisy compliance list is one nobody reads.

`SEED_PROGRAMS` is the part worth reviewing carefully. It encodes real
regulatory intervals, and while the citations are accurate as written, the
authority having jurisdiction is the authority — a facility should confirm the
set against its own AHJ and state rules before relying on it. Nothing is
created automatically; seeding is an explicit call.
"""
from __future__ import annotations

from datetime import date, datetime, timedelta

from fastapi import HTTPException, status as http_status
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.models.compliance import (
    FREQUENCY_DAYS, ComplianceAuthority, ComplianceFrequency, ComplianceProgram,
    ComplianceResult, ComplianceTask, ComplianceTaskStatus,
)
from app.models.equipment import Equipment
from app.models.location import Location
from app.utils.clock import utc_today

OPEN_STATUSES = (
    ComplianceTaskStatus.SCHEDULED.value,
    ComplianceTaskStatus.IN_PROGRESS.value,
    ComplianceTaskStatus.OVERDUE.value,
)


# Frequencies, citations and grace windows for the programs a hospital plant is
# most commonly measured against. Seeded on request, per facility, and every
# field is editable afterwards — this is a starting point, not a ruling.
SEED_PROGRAMS: tuple[dict, ...] = (
    {
        "code": "NFPA110_GEN_MONTHLY",
        "name": "Generator monthly load test",
        "authority": ComplianceAuthority.NFPA.value,
        "citation": "NFPA 110",
        "frequency": ComplianceFrequency.MONTHLY.value,
        "discipline_code": "electrical",
        "grace_days": 3,
        "procedure": (
            "Run the generator under connected load for at least 30 minutes. "
            "Record runtime hours, load, coolant and exhaust temperature."
        ),
        "reading_point_codes": ["GEN_RUNTIME_HOURS", "GEN_LOAD_KW"],
    },
    {
        "code": "NFPA110_GEN_ANNUAL",
        "name": "Generator annual load bank test",
        "authority": ComplianceAuthority.NFPA.value,
        "citation": "NFPA 110",
        "frequency": ComplianceFrequency.ANNUAL.value,
        "discipline_code": "electrical",
        "grace_days": 14,
        "requires_certificate": True,
        "procedure": "Full-duration load bank test at the rated kW of the unit.",
    },
    {
        "code": "NFPA110_ATS_MONTHLY",
        "name": "Automatic transfer switch monthly test",
        "authority": ComplianceAuthority.NFPA.value,
        "citation": "NFPA 110",
        "frequency": ComplianceFrequency.MONTHLY.value,
        "discipline_code": "electrical",
        "grace_days": 3,
        "procedure": "Operate each transfer switch electrically; verify transfer and retransfer timing.",
    },
    {
        "code": "NFPA25_FIREPUMP_CHURN",
        "name": "Fire pump no-flow (churn) test",
        "authority": ComplianceAuthority.NFPA.value,
        "citation": "NFPA 25",
        "frequency": ComplianceFrequency.WEEKLY.value,
        "discipline_code": "fire_life_safety",
        "grace_days": 2,
        "procedure": "Run the pump at churn; record suction and discharge pressure and run time.",
        "reading_point_codes": ["FP_SUCTION_PSI", "FP_DISCHARGE_PSI"],
    },
    {
        "code": "NFPA25_FIREPUMP_ANNUAL",
        "name": "Fire pump annual flow test",
        "authority": ComplianceAuthority.NFPA.value,
        "citation": "NFPA 25",
        "frequency": ComplianceFrequency.ANNUAL.value,
        "discipline_code": "fire_life_safety",
        "grace_days": 14,
        "requires_certificate": True,
        "requires_licensed_provider": True,
        "procedure": "Flow test at 100%, 125% and 150% of rated capacity.",
    },
    {
        "code": "NFPA72_ALARM_ANNUAL",
        "name": "Fire alarm system annual inspection and test",
        "authority": ComplianceAuthority.NFPA.value,
        "citation": "NFPA 72",
        "frequency": ComplianceFrequency.ANNUAL.value,
        "discipline_code": "fire_life_safety",
        "grace_days": 14,
        "requires_certificate": True,
        "requires_licensed_provider": True,
    },
    {
        "code": "ASME_A171_ELEV_STATE",
        "name": "Elevator periodic state inspection",
        "authority": ComplianceAuthority.STATE.value,
        "citation": "ASME A17.1 / state elevator code",
        "frequency": ComplianceFrequency.ANNUAL.value,
        "discipline_code": "vertical_transport",
        "grace_days": 0,
        "requires_certificate": True,
        "certificate_must_be_posted": True,
        "requires_licensed_provider": True,
        "procedure": "State or third-party inspection. The certificate must be posted in the car.",
    },
    {
        "code": "ASME_A171_FIREFIGHTER",
        "name": "Firefighters' emergency operation test",
        "authority": ComplianceAuthority.ASME.value,
        "citation": "ASME A17.1",
        "frequency": ComplianceFrequency.MONTHLY.value,
        "discipline_code": "vertical_transport",
        "grace_days": 3,
        "procedure": "Test Phase I recall and Phase II in-car operation for each car.",
    },
    {
        "code": "ASME_A171_ELEV_5YR",
        "name": "Elevator five-year full load safety test",
        "authority": ComplianceAuthority.ASME.value,
        "citation": "ASME A17.1",
        "frequency": ComplianceFrequency.FIVE_YEAR.value,
        "discipline_code": "vertical_transport",
        "grace_days": 30,
        "requires_certificate": True,
        "requires_licensed_provider": True,
    },
    {
        "code": "BACKFLOW_ANNUAL",
        "name": "Backflow preventer annual test",
        "authority": ComplianceAuthority.LOCAL.value,
        "citation": "Local water authority cross-connection control",
        "frequency": ComplianceFrequency.ANNUAL.value,
        "discipline_code": "plumbing",
        "grace_days": 7,
        "requires_certificate": True,
        "requires_licensed_provider": True,
    },
    {
        "code": "NFPA99_MEDGAS_ANNUAL",
        "name": "Medical gas system annual verification",
        "authority": ComplianceAuthority.NFPA.value,
        "citation": "NFPA 99",
        "frequency": ComplianceFrequency.ANNUAL.value,
        "discipline_code": "medical_gas",
        "grace_days": 14,
        "requires_certificate": True,
        "requires_licensed_provider": True,
        "procedure": "Alarm, valve, outlet and source verification by a qualified verifier.",
    },
    {
        "code": "ASHRAE170_OR_PRESSURE",
        "name": "Operating room pressure relationship check",
        "authority": ComplianceAuthority.ASHRAE.value,
        "citation": "ASHRAE 170",
        "frequency": ComplianceFrequency.MONTHLY.value,
        "discipline_code": "mechanical",
        "grace_days": 3,
        "applies_to_space_uses": ["operating_room", "procedure_room"],
        "procedure": "Verify positive pressure relative to adjacent spaces; record temperature and humidity.",
        "reading_point_codes": ["OR_PRESSURE", "OR_TEMP_F", "OR_RH"],
    },
    {
        "code": "ASHRAE170_AIIR_PRESSURE",
        "name": "Airborne isolation room pressure check",
        "authority": ComplianceAuthority.CMS.value,
        "citation": "ASHRAE 170 / CMS conditions of participation",
        "frequency": ComplianceFrequency.DAILY.value,
        "discipline_code": "mechanical",
        "grace_days": 0,
        "applies_to_space_uses": ["aiir", "protective_isolation"],
        "procedure": "Verify the pressure relationship while the room is occupied. Record the value.",
        "reading_point_codes": ["AIIR_PRESSURE"],
    },
    {
        "code": "EYEWASH_WEEKLY",
        "name": "Emergency eyewash weekly activation",
        "authority": ComplianceAuthority.OSHA.value,
        "citation": "ANSI Z358.1",
        "frequency": ComplianceFrequency.WEEKLY.value,
        "discipline_code": "plumbing",
        "grace_days": 2,
        "procedure": "Activate to flush the line and verify flow.",
    },
    {
        "code": "LEGIONELLA_WATER_MGMT",
        "name": "Water management plan sampling",
        "authority": ComplianceAuthority.CMS.value,
        "citation": "ASHRAE 188 / CMS water management requirement",
        "frequency": ComplianceFrequency.QUARTERLY.value,
        "discipline_code": "plumbing",
        "grace_days": 14,
        "procedure": "Sample at control points; record temperature and disinfectant residual.",
        "reading_point_codes": ["DHW_TEMP_F", "CHLORINE_PPM"],
    },
)


def seed_programs(db: Session, *, facility_id: int) -> tuple[int, int]:
    """Create the standard programs for a facility. Returns (created, skipped).

    Idempotent on code, so running it twice is harmless and adding a program to
    the list later back-fills it without disturbing anything already edited.
    """
    from app.models.discipline import Discipline

    disciplines = {d.code: d.id for d in db.query(Discipline).all()}
    existing = {
        code for (code,) in db.query(ComplianceProgram.code)
        .filter(ComplianceProgram.facility_id == facility_id).all()
    }

    created = skipped = 0
    for spec in SEED_PROGRAMS:
        if spec["code"] in existing:
            skipped += 1
            continue
        payload = dict(spec)
        discipline_code = payload.pop("discipline_code", None)
        db.add(ComplianceProgram(
            facility_id=facility_id,
            discipline_id=disciplines.get(discipline_code),
            **payload,
        ))
        created += 1
    return created, skipped


def subjects_for(db: Session, program: ComplianceProgram) -> list[tuple[int | None, int | None]]:
    """Which (equipment_id, location_id) pairs this program applies to.

    Checked most specific first: an explicit asset list beats a space-use rule,
    which beats a discipline-wide rule. A program that matches nothing produces
    no tasks rather than one unattached task, because an obligation against
    nothing in particular cannot be discharged.
    """
    if program.applies_to_equipment_ids:
        return [(equipment_id, None) for equipment_id in program.applies_to_equipment_ids]

    if program.applies_to_space_uses:
        rows = (
            db.query(Location.id)
            .filter(
                Location.facility_id == program.facility_id,
                Location.space_use.in_(program.applies_to_space_uses),
                Location.is_active.is_(True),
            )
            .all()
        )
        return [(None, location_id) for (location_id,) in rows]

    if program.discipline_id:
        rows = (
            db.query(Equipment.id)
            .filter(
                Equipment.facility_id == program.facility_id,
                Equipment.discipline_id == program.discipline_id,
                Equipment.status != "retired",
            )
            .all()
        )
        return [(equipment_id, None) for (equipment_id,) in rows]

    return []


def _has_open_task(db: Session, program_id: int, equipment_id: int | None, location_id: int | None) -> bool:
    query = db.query(ComplianceTask.id).filter(
        ComplianceTask.program_id == program_id,
        ComplianceTask.status.in_(OPEN_STATUSES),
    )
    query = query.filter(
        ComplianceTask.equipment_id.is_(None) if equipment_id is None
        else ComplianceTask.equipment_id == equipment_id
    )
    query = query.filter(
        ComplianceTask.location_id.is_(None) if location_id is None
        else ComplianceTask.location_id == location_id
    )
    return db.query(query.exists()).scalar()


def generate_tasks(
    db: Session,
    *,
    facility_ids: list[int],
    horizon_days: int = 30,
    today: date | None = None,
) -> dict:
    """Create the tasks falling due inside the horizon.

    Does not commit. Safe to run repeatedly — the open-task check is what makes
    it idempotent, and it is the reason the overdue list stays meaningful
    instead of filling with duplicates of work nobody has done yet.
    """
    today = today or utc_today()
    horizon = today + timedelta(days=horizon_days)

    created = 0
    skipped = 0
    by_program: dict[str, int] = {}

    programs = (
        db.query(ComplianceProgram)
        .filter(
            ComplianceProgram.facility_id.in_(facility_ids),
            ComplianceProgram.is_active.is_(True),
        )
        .all()
    )

    for program in programs:
        for equipment_id, location_id in subjects_for(db, program):
            if _has_open_task(db, program.id, equipment_id, location_id):
                skipped += 1
                continue

            # Schedule from the last completion, so a task done early does not
            # pull the whole series forward and one done late does not compress
            # the next interval.
            last = (
                db.query(ComplianceTask)
                .filter(
                    ComplianceTask.program_id == program.id,
                    ComplianceTask.equipment_id.is_(None) if equipment_id is None
                    else ComplianceTask.equipment_id == equipment_id,
                    ComplianceTask.location_id.is_(None) if location_id is None
                    else ComplianceTask.location_id == location_id,
                    ComplianceTask.status == ComplianceTaskStatus.COMPLETED.value,
                )
                .order_by(ComplianceTask.due_date.desc())
                .first()
            )
            if last is not None:
                due = last.due_date + timedelta(days=program.interval_days)
                # A series that has fallen far behind should come due now rather
                # than generate a backlog of historical dates nobody can meet.
                if due < today:
                    due = today
            else:
                due = today

            if due > horizon:
                continue

            db.add(ComplianceTask(
                facility_id=program.facility_id,
                program_id=program.id,
                equipment_id=equipment_id,
                location_id=location_id,
                due_date=due,
                # Snapshotted: revising the tolerance later must not change
                # whether this occurrence was late.
                grace_days=program.grace_days,
                status=ComplianceTaskStatus.SCHEDULED.value,
            ))
            created += 1
            by_program[program.code] = by_program.get(program.code, 0) + 1

    return {
        "created": created,
        "skipped_existing": skipped,
        "by_program": by_program,
        "horizon_days": horizon_days,
    }


def mark_overdue(db: Session, *, facility_ids: list[int], today: date | None = None) -> int:
    """Flip scheduled tasks past their date to overdue.

    A status rather than a computed property because the overdue list is a
    worklist people are measured against, and it should not change shape
    depending on which query built it.
    """
    today = today or utc_today()
    rows = (
        db.query(ComplianceTask)
        .filter(
            ComplianceTask.facility_id.in_(facility_ids),
            ComplianceTask.status == ComplianceTaskStatus.SCHEDULED.value,
            ComplianceTask.due_date < today,
        )
        .all()
    )
    for task in rows:
        task.status = ComplianceTaskStatus.OVERDUE.value
    return len(rows)


def complete(
    db: Session,
    task: ComplianceTask,
    *,
    result: str,
    user_id: int | None,
    findings: str | None = None,
    corrective_action: str | None = None,
    vendor_id: int | None = None,
    certificate: dict | None = None,
    measured_values: dict | None = None,
    now: datetime | None = None,
) -> ComplianceTask:
    """Close a task out, with the evidence it was supposed to produce."""
    now = now or datetime.utcnow()

    if task.status in {ComplianceTaskStatus.COMPLETED.value, ComplianceTaskStatus.WAIVED.value}:
        raise HTTPException(status_code=409, detail="That task is already closed")

    valid_results = {r.value for r in ComplianceResult}
    if result not in valid_results:
        raise HTTPException(
            status_code=http_status.HTTP_400_BAD_REQUEST,
            detail=f"Unknown result '{result}'. Allowed: {', '.join(sorted(valid_results))}",
        )

    program = task.program
    certificate = certificate or {}

    # A program that exists to produce a certificate has not been satisfied by
    # somebody ticking "pass". This is the gap a surveyor finds.
    if program and program.requires_certificate and result != ComplianceResult.FAIL.value:
        if not certificate.get("certificate_number"):
            raise HTTPException(
                status_code=http_status.HTTP_400_BAD_REQUEST,
                detail=f"{program.name} requires a certificate number to be recorded",
            )
        if program.requires_licensed_provider and not certificate.get("inspector_license"):
            raise HTTPException(
                status_code=http_status.HTTP_400_BAD_REQUEST,
                detail=f"{program.name} requires the inspector's licence number",
            )

    task.status = ComplianceTaskStatus.COMPLETED.value
    task.result = result
    task.completed_at = now
    task.completed_by_id = user_id
    task.performed_by_vendor_id = vendor_id
    task.findings = findings
    task.corrective_action = corrective_action
    if measured_values:
        task.measured_values = measured_values

    for field in (
        "certificate_number", "certificate_issued_by", "inspector_license",
        "certificate_issued_on", "certificate_expires_on",
    ):
        if field in certificate:
            setattr(task, field, certificate[field])

    return task


def upcoming_certificate_expiries(
    db: Session, *, facility_ids: list[int], horizon_days: int = 60,
) -> list[ComplianceTask]:
    """Certificates about to lapse.

    Distinct from the overdue task list: a posted elevator certificate can
    expire while the next inspection is already booked, and the car still comes
    out of service on the date.
    """
    today = utc_today()
    horizon = today + timedelta(days=horizon_days)
    return (
        db.query(ComplianceTask)
        .filter(
            ComplianceTask.facility_id.in_(facility_ids),
            ComplianceTask.certificate_expires_on.isnot(None),
            ComplianceTask.certificate_expires_on <= horizon,
        )
        .order_by(ComplianceTask.certificate_expires_on.asc())
        .all()
    )


def summary(db: Session, *, facility_ids: list[int]) -> dict:
    """The compliance position, in the four numbers somebody actually asks for."""
    today = utc_today()
    base = db.query(ComplianceTask).filter(ComplianceTask.facility_id.in_(facility_ids))

    open_tasks = base.filter(ComplianceTask.status.in_(OPEN_STATUSES)).all()
    overdue = [t for t in open_tasks if t.due_date < today]
    past_grace = [t for t in overdue if t.days_overdue > (t.grace_days or 0)]

    due_soon = [
        t for t in open_tasks
        if today <= t.due_date <= today + timedelta(days=14)
    ]

    expired_certs = (
        base.filter(
            ComplianceTask.certificate_expires_on.isnot(None),
            ComplianceTask.certificate_expires_on < today,
        ).count()
    )

    failures = base.filter(
        ComplianceTask.result == ComplianceResult.FAIL.value,
        ComplianceTask.completed_at >= datetime.utcnow() - timedelta(days=365),
    ).count()

    return {
        "open": len(open_tasks),
        "overdue": len(overdue),
        # The number that matters: late but still inside tolerance is recoverable,
        # past grace is a gap in the record that cannot be filled retroactively.
        "past_grace": len(past_grace),
        "due_within_14_days": len(due_soon),
        "expired_certificates": expired_certs,
        "failures_last_12_months": failures,
    }
