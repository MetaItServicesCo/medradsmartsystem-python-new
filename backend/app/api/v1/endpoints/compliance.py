"""Regulatory schedules, their occurrences, and the certificates they produce.

Generation is idempotent and explicit — `POST /generate` is meant for a nightly
job, and running it twice creates nothing the first run already made. That
matters more than it sounds: a compliance list that fills with duplicates of
work nobody has done yet stops being read within a fortnight.
"""
import os
from typing import Any, List, Optional
from datetime import date

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.deps import get_admin_user, get_current_user
from app.db.base import get_db
from app.models.compliance import (
    ComplianceAuthority, ComplianceFrequency, ComplianceProgram, ComplianceResult,
    ComplianceTask, ComplianceTaskStatus,
)
from app.models.equipment import Equipment
from app.models.location import Location
from app.models.user import User
from app.schemas.compliance import (
    ComplianceMeta, ComplianceProgram as ProgramSchema, ComplianceProgramCreate,
    ComplianceProgramListResponse, ComplianceProgramUpdate, ComplianceProgramWithCounts,
    ComplianceSummary, ComplianceTaskComplete, ComplianceTaskListResponse,
    ComplianceTaskWithContext, GenerationResult, SeedResult,
)
from app.services import compliance as compliance_service
from app.utils.evidence_upload import resolve_evidence, store_evidence
from app.utils.clock import utc_today
from app.utils.facility_access import (
    get_user_facility_ids, is_facility_scoped_user, require_facility_access,
    scope_query_to_user_facilities,
)

router = APIRouter()


def _facility_ids(db: Session, current_user: User, facility_id: Optional[int]) -> List[int]:
    if facility_id is not None:
        require_facility_access(db, current_user, facility_id)
        return [facility_id]
    if is_facility_scoped_user(current_user):
        return list(get_user_facility_ids(db, current_user))
    from app.models.facility import Facility
    return [row.id for row in db.query(Facility.id).all()]


def _label(value: str) -> str:
    return value.replace("_", " ").title()


@router.get("/meta", response_model=ComplianceMeta)
def compliance_metadata(current_user: User = Depends(get_current_user)) -> Any:
    return ComplianceMeta(
        authorities=[{"value": a.value, "label": a.value.replace("_", " ").upper()}
                     for a in ComplianceAuthority],
        frequencies=[{"value": f.value, "label": _label(f.value)} for f in ComplianceFrequency],
        statuses=[{"value": s.value, "label": _label(s.value)} for s in ComplianceTaskStatus],
        results=[{"value": r.value, "label": _label(r.value)} for r in ComplianceResult],
    )


@router.get("/summary", response_model=ComplianceSummary)
def summary(
    db: Session = Depends(get_db),
    facility_id: Optional[int] = Query(None),
    current_user: User = Depends(get_current_user),
) -> Any:
    """The compliance position in the numbers somebody actually asks for."""
    facility_ids = _facility_ids(db, current_user, facility_id)
    if not facility_ids:
        return ComplianceSummary(
            open=0, overdue=0, past_grace=0, due_within_14_days=0,
            expired_certificates=0, failures_last_12_months=0,
        )
    return compliance_service.summary(db, facility_ids=facility_ids)


# ── Programs ─────────────────────────────────────────────────────────────────

@router.get("/programs", response_model=ComplianceProgramListResponse)
def list_programs(
    db: Session = Depends(get_db),
    facility_id: Optional[int] = Query(None),
    authority: Optional[str] = Query(None),
    discipline_id: Optional[int] = Query(None),
    include_inactive: bool = Query(False),
    current_user: User = Depends(get_current_user),
) -> Any:
    query = scope_query_to_user_facilities(
        db.query(ComplianceProgram), ComplianceProgram.facility_id, db, current_user,
    )
    if facility_id is not None:
        require_facility_access(db, current_user, facility_id)
        query = query.filter(ComplianceProgram.facility_id == facility_id)
    if authority:
        query = query.filter(ComplianceProgram.authority == authority)
    if discipline_id is not None:
        query = query.filter(ComplianceProgram.discipline_id == discipline_id)
    if not include_inactive:
        query = query.filter(ComplianceProgram.is_active.is_(True))

    rows = query.order_by(ComplianceProgram.name.asc()).all()
    if not rows:
        return {"items": [], "total": 0}

    # Two grouped counts rather than a query per program: a facility can carry
    # a few dozen programs and this list is on a dashboard.
    ids = [row.id for row in rows]
    open_counts = dict(
        db.query(ComplianceTask.program_id, func.count(ComplianceTask.id))
        .filter(
            ComplianceTask.program_id.in_(ids),
            ComplianceTask.status.in_(compliance_service.OPEN_STATUSES),
        )
        .group_by(ComplianceTask.program_id).all()
    )
    overdue_counts = dict(
        db.query(ComplianceTask.program_id, func.count(ComplianceTask.id))
        .filter(
            ComplianceTask.program_id.in_(ids),
            ComplianceTask.status.in_(compliance_service.OPEN_STATUSES),
            ComplianceTask.due_date < utc_today(),
        )
        .group_by(ComplianceTask.program_id).all()
    )

    items = []
    for program in rows:
        payload = ComplianceProgramWithCounts.model_validate(program)
        payload.open_tasks = int(open_counts.get(program.id, 0))
        payload.overdue_tasks = int(overdue_counts.get(program.id, 0))
        payload.subject_count = len(compliance_service.subjects_for(db, program))
        items.append(payload)
    return {"items": items, "total": len(items)}


@router.post("/programs", response_model=ProgramSchema, status_code=201)
def create_program(
    payload: ComplianceProgramCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_admin_user),
) -> Any:
    require_facility_access(db, current_user, payload.facility_id)
    exists = db.query(ComplianceProgram.id).filter(
        ComplianceProgram.facility_id == payload.facility_id,
        ComplianceProgram.code == payload.code,
    ).first()
    if exists:
        raise HTTPException(status_code=409, detail=f"Program '{payload.code}' already exists here")

    program = ComplianceProgram(**payload.model_dump())
    db.add(program)
    db.commit()
    db.refresh(program)
    return program


@router.put("/programs/{program_id}", response_model=ProgramSchema)
def update_program(
    program_id: int,
    payload: ComplianceProgramUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_admin_user),
) -> Any:
    program = db.query(ComplianceProgram).filter(ComplianceProgram.id == program_id).first()
    if program is None:
        raise HTTPException(status_code=404, detail="Program not found")
    require_facility_access(db, current_user, program.facility_id)

    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(program, field, value)
    db.commit()
    db.refresh(program)
    return program


@router.post("/programs/seed", response_model=SeedResult)
def seed_programs(
    facility_id: int = Query(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_admin_user),
) -> Any:
    """Create the standard regulatory programs for a facility.

    Idempotent on code, so it is safe to re-run and to extend later. Every
    field is editable afterwards — the seeds encode common intervals, and the
    authority having jurisdiction is always the authority.
    """
    require_facility_access(db, current_user, facility_id)
    created, skipped = compliance_service.seed_programs(db, facility_id=facility_id)
    db.commit()
    return SeedResult(
        created=created,
        skipped=skipped,
        programs=[spec["code"] for spec in compliance_service.SEED_PROGRAMS],
    )


@router.post("/generate", response_model=GenerationResult)
def generate(
    db: Session = Depends(get_db),
    facility_id: Optional[int] = Query(None),
    horizon_days: int = Query(30, ge=1, le=365),
    current_user: User = Depends(get_current_user),
) -> Any:
    """Create the tasks falling due inside the horizon. Safe to re-run."""
    facility_ids = _facility_ids(db, current_user, facility_id)
    if not facility_ids:
        return GenerationResult(created=0, skipped_existing=0, by_program={}, horizon_days=horizon_days)

    result = compliance_service.generate_tasks(
        db, facility_ids=facility_ids, horizon_days=horizon_days,
    )
    compliance_service.mark_overdue(db, facility_ids=facility_ids)
    db.commit()
    return result


# ── Tasks ────────────────────────────────────────────────────────────────────

def _task_context(db: Session, rows: List[ComplianceTask]) -> List[ComplianceTaskWithContext]:
    if not rows:
        return []

    programs = {
        p.id: p for p in db.query(ComplianceProgram).filter(
            ComplianceProgram.id.in_({r.program_id for r in rows})
        ).all()
    }
    equipment_ids = {r.equipment_id for r in rows if r.equipment_id}
    location_ids = {r.location_id for r in rows if r.location_id}
    tags = dict(
        db.query(Equipment.id, Equipment.asset_tag)
        .filter(Equipment.id.in_(equipment_ids)).all()
    ) if equipment_ids else {}
    codes = dict(
        db.query(Location.id, Location.code)
        .filter(Location.id.in_(location_ids)).all()
    ) if location_ids else {}

    items = []
    for task in rows:
        payload = ComplianceTaskWithContext.model_validate(task)
        program = programs.get(task.program_id)
        if program is not None:
            payload.program_code = program.code
            payload.program_name = program.name
            payload.authority = program.authority
            payload.citation = program.citation
            payload.procedure = program.procedure
            payload.requires_certificate = program.requires_certificate
            payload.requires_licensed_provider = program.requires_licensed_provider
        payload.equipment_tag = tags.get(task.equipment_id)
        payload.location_code = codes.get(task.location_id)
        payload.is_overdue = task.is_overdue
        payload.days_overdue = task.days_overdue
        payload.is_past_grace = task.is_past_grace
        items.append(payload)
    return items


@router.get("/tasks", response_model=ComplianceTaskListResponse)
def list_tasks(
    db: Session = Depends(get_db),
    facility_id: Optional[int] = Query(None),
    program_id: Optional[int] = Query(None),
    equipment_id: Optional[int] = Query(None),
    status: Optional[str] = Query(None),
    overdue_only: bool = Query(False),
    due_within_days: Optional[int] = Query(None, ge=1, le=365),
    skip: int = 0,
    limit: int = Query(200, le=1000),
    current_user: User = Depends(get_current_user),
) -> Any:
    facility_ids = _facility_ids(db, current_user, facility_id)
    if not facility_ids:
        return {"items": [], "total": 0}

    query = db.query(ComplianceTask).filter(ComplianceTask.facility_id.in_(facility_ids))
    if program_id is not None:
        query = query.filter(ComplianceTask.program_id == program_id)
    if equipment_id is not None:
        query = query.filter(ComplianceTask.equipment_id == equipment_id)
    if status:
        query = query.filter(ComplianceTask.status == status)
    if overdue_only:
        query = query.filter(
            ComplianceTask.status.in_(compliance_service.OPEN_STATUSES),
            ComplianceTask.due_date < utc_today(),
        )
    if due_within_days is not None:
        from datetime import timedelta
        query = query.filter(
            ComplianceTask.status.in_(compliance_service.OPEN_STATUSES),
            ComplianceTask.due_date <= utc_today() + timedelta(days=due_within_days),
        )

    total = query.count()
    rows = query.order_by(ComplianceTask.due_date.asc()).offset(skip).limit(limit).all()
    return {"items": _task_context(db, rows), "total": total}


@router.post("/tasks/{task_id}/complete", response_model=ComplianceTaskWithContext)
def complete_task(
    task_id: int,
    payload: ComplianceTaskComplete,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Any:
    """Close a task with the evidence it was supposed to produce.

    A program that exists to yield a certificate is not satisfied by somebody
    ticking "pass" — that is precisely the gap a surveyor finds, so the
    certificate number (and the inspector's licence, where the program demands
    a licensed provider) is required rather than optional.
    """
    task = db.query(ComplianceTask).filter(ComplianceTask.id == task_id).first()
    if task is None:
        raise HTTPException(status_code=404, detail="Task not found")
    require_facility_access(db, current_user, task.facility_id)

    compliance_service.complete(
        db, task,
        result=payload.result,
        user_id=current_user.id,
        findings=payload.findings,
        corrective_action=payload.corrective_action,
        vendor_id=payload.performed_by_vendor_id,
        certificate=payload.certificate.model_dump(exclude_unset=True) if payload.certificate else None,
        measured_values=payload.measured_values,
    )
    if payload.notes:
        task.notes = payload.notes

    db.commit()
    db.refresh(task)
    return _task_context(db, [task])[0]


@router.get("/certificates/expiring", response_model=ComplianceTaskListResponse)
def expiring_certificates(
    db: Session = Depends(get_db),
    facility_id: Optional[int] = Query(None),
    horizon_days: int = Query(60, ge=1, le=365),
    current_user: User = Depends(get_current_user),
) -> Any:
    """Certificates about to lapse.

    Distinct from the overdue task list: a posted elevator certificate can
    expire while the next inspection is already booked, and the car still comes
    out of service on the date.
    """
    facility_ids = _facility_ids(db, current_user, facility_id)
    if not facility_ids:
        return {"items": [], "total": 0}

    rows = compliance_service.upcoming_certificate_expiries(
        db, facility_ids=facility_ids, horizon_days=horizon_days,
    )
    return {"items": _task_context(db, rows), "total": len(rows)}


# ── Certificate files ────────────────────────────────────────────────────────

@router.post("/tasks/{task_id}/certificate", response_model=ComplianceTaskWithContext)
async def upload_certificate(
    task_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Any:
    """Attach the scanned certificate to a completed task.

    A certificate number in a database is not what a surveyor asks for — they
    ask to see the certificate. Recording the number without being able to
    produce the document is the same gap one step further along.
    """
    task = db.query(ComplianceTask).filter(ComplianceTask.id == task_id).first()
    if task is None:
        raise HTTPException(status_code=404, detail="Task not found")
    require_facility_access(db, current_user, task.facility_id)

    stored_path, original_name, _size = await store_evidence(file, "compliance_certificates")
    task.certificate_path = stored_path
    task.certificate_filename = original_name

    db.commit()
    db.refresh(task)
    return _task_context(db, [task])[0]


@router.get("/tasks/{task_id}/certificate")
def download_certificate(
    task_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Any:
    from fastapi.responses import FileResponse

    task = db.query(ComplianceTask).filter(ComplianceTask.id == task_id).first()
    if task is None:
        raise HTTPException(status_code=404, detail="Task not found")
    require_facility_access(db, current_user, task.facility_id)

    path = resolve_evidence(task.certificate_path, "compliance_certificates")
    return FileResponse(
        path,
        filename=task.certificate_filename or os.path.basename(path),
    )
