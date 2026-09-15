"""Service and inspection jobs on a site's category equipment.

See app/services/equipment_jobs.py for how these map onto work orders.
"""
from datetime import datetime, timedelta
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import case, func
from sqlalchemy.orm import Session

from app.core.deps import get_current_user
from app.db.base import get_db
from app.models.equipment import Equipment
from app.models.facility import Facility
from app.models.maintenance_schedule import MaintenanceSchedule, ScheduleStatus
from app.models.permit import PERMITS_WORK, PermitStatus, WorkPermit
from app.models.service_request import ServiceRequest, ServiceRequestStatus
from app.models.user import User
from app.schemas.site_categories import EquipmentJobCreate, EquipmentJobUpdate
from app.services import equipment_jobs, site_categories
from app.utils.facility_access import require_facility_access
from app.utils.notifications import create_notification
from app.utils.permission_deps import require_module_access
from app.utils.permissions import has_module_permission, require_module_permission

router = APIRouter(dependencies=[Depends(require_module_access("service-requests"))])


def _site_or_404(db: Session, user: User, facility_id: int) -> Facility:
    if db.get(Facility, facility_id) is None:
        raise HTTPException(status_code=404, detail="Site not found")
    require_facility_access(db, user, facility_id)
    return db.get(Facility, facility_id)


def _job_or_404(db: Session, user: User, job_id: int) -> ServiceRequest:
    job = db.get(ServiceRequest, job_id)
    if job is None or job.work_order_type not in equipment_jobs.KIND_OF_TYPE:
        raise HTTPException(status_code=404, detail="Job not found")
    require_facility_access(db, user, job.facility_id)
    return job


def _category_codes(db: Session) -> dict[int, str]:
    return {pk: code for code, pk in site_categories.ensure_disciplines(db).items()}


def _tell_assignee(db: Session, job: ServiceRequest, actor: User) -> None:
    if not job.assigned_technician_id or job.assigned_technician_id == actor.id:
        return
    kind = equipment_jobs.KIND_OF_TYPE[job.work_order_type]
    equipment = job.equipment.name if job.equipment else "equipment"
    create_notification(
        db,
        user_id=job.assigned_technician_id,
        title=f"New {kind} job",
        message=f"{job.request_number}: {job.problem_description} ({equipment})",
        notification_type="service_request",
        link_url=f"/equipment-maintenance/{kind}",
        actor_id=actor.id,
    )


@router.get("/jobs")
def list_jobs(
    facility_id: int = Query(...),
    kind: str = Query(...),
    status: Optional[str] = Query(None),
    category: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    equipment_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Any:
    _site_or_404(db, current_user, facility_id)
    query, counts = equipment_jobs.list_query(
        db, facility_id, kind, status=status, category=category, search=search, equipment_id=equipment_id,
    )
    codes = _category_codes(db)
    db.commit()
    rows = query.limit(500).all()
    return {"items": [equipment_jobs.serialise(job, codes) for job in rows],
            "total": len(rows), "counts": counts}


@router.get("/summary")
def summary(
    facility_id: int = Query(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Any:
    """Open, overdue and failed counts for the site's page."""
    _site_or_404(db, current_user, facility_id)
    today = datetime.utcnow().date()
    open_statuses = site_categories.OPEN_STATUSES
    rows = (
        db.query(
            ServiceRequest.work_order_type,
            func.sum(case((ServiceRequest.status.in_(open_statuses), 1), else_=0)),
            func.sum(case((ServiceRequest.status.in_(open_statuses) & (ServiceRequest.due_on < today), 1),
                          else_=0)),
            func.sum(case((ServiceRequest.inspection_result == "fail", 1), else_=0)),
        )
        .join(Equipment, Equipment.id == ServiceRequest.equipment_id)
        .filter(ServiceRequest.facility_id == facility_id, Equipment.name.isnot(None),
                ServiceRequest.work_order_type.in_(list(equipment_jobs.KIND_OF_TYPE)),
                ServiceRequest.status != ServiceRequestStatus.CANCELLED)
        .group_by(ServiceRequest.work_order_type)
        .all()
    )
    result: dict[str, Any] = {kind: {"open": 0, "overdue": 0, "failed": 0} for kind in equipment_jobs.KINDS}
    for work_order_type, open_count, overdue, failed in rows:
        kind = equipment_jobs.KIND_OF_TYPE[work_order_type]
        result[kind] = {"open": int(open_count or 0), "overdue": int(overdue or 0), "failed": int(failed or 0)}

    # Maintenance Plans and Permits to Work sit in the same section; each count
    # is given only to people who can open that screen.
    if has_module_permission(current_user, "maintenance", "index"):
        active = [ScheduleStatus.ACTIVE.value]
        plans = db.query(
            func.count(MaintenanceSchedule.id),
            func.sum(case((MaintenanceSchedule.next_due_date < today, 1), else_=0)),
            func.sum(case((MaintenanceSchedule.next_due_date.between(today, today + timedelta(days=30)), 1),
                          else_=0)),
        ).filter(MaintenanceSchedule.facility_id == facility_id, MaintenanceSchedule.status.in_(active)).one()
        result["plans"] = {"active": int(plans[0] or 0), "overdue": int(plans[1] or 0),
                           "due_in_30_days": int(plans[2] or 0)}
    if has_module_permission(current_user, "permits", "index"):
        permits = db.query(
            func.sum(case((WorkPermit.status.in_(list(PERMITS_WORK)), 1), else_=0)),
            func.sum(case((WorkPermit.status == PermitStatus.PENDING_APPROVAL.value, 1), else_=0)),
        ).filter(WorkPermit.facility_id == facility_id).one()
        result["permits"] = {"active": int(permits[0] or 0), "awaiting_approval": int(permits[1] or 0)}
    return result


@router.get("/assignees")
def assignees(
    facility_id: int = Query(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Any:
    _site_or_404(db, current_user, facility_id)
    return [
        {"id": user.id, "name": user.full_name,
         "role": user.role.value if hasattr(user.role, "value") else str(user.role)}
        for user in equipment_jobs.assignable_users(db, facility_id)
    ]


@router.post("/jobs", status_code=201)
def create_job(
    payload: EquipmentJobCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Any:
    require_module_permission(current_user, "service-requests", "add")
    _site_or_404(db, current_user, payload.facility_id)
    job = equipment_jobs.create(
        db, current_user, facility_id=payload.facility_id, kind=payload.kind,
        equipment_id=payload.equipment_id, title=payload.title, due_on=payload.due_on,
        assigned_to_id=payload.assigned_to_id, status=payload.status, notes=payload.notes,
        inspection_result=payload.inspection_result, findings=payload.findings,
        labour_cost=payload.labour_cost, parts_cost=payload.parts_cost, is_major_work=payload.is_major_work,
    )
    db.commit()
    db.refresh(job)
    _tell_assignee(db, job, current_user)
    db.commit()
    return equipment_jobs.serialise(job, _category_codes(db))


@router.patch("/jobs/{job_id}")
def update_job(
    job_id: int,
    payload: EquipmentJobUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Any:
    require_module_permission(current_user, "service-requests", "edit")
    job = _job_or_404(db, current_user, job_id)
    changes = equipment_jobs.update(db, current_user, job, payload.model_dump(exclude_unset=True))
    db.commit()
    db.refresh(job)
    if "assigned_to" in changes:
        _tell_assignee(db, job, current_user)
        db.commit()
    return equipment_jobs.serialise(job, _category_codes(db))


@router.delete("/jobs/{job_id}")
def delete_job(
    job_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Any:
    """Remove a job raised by mistake. A finished job is kept: it is the record."""
    require_module_permission(current_user, "service-requests", "delete")
    job = _job_or_404(db, current_user, job_id)
    if equipment_jobs.simple_status(job.status) == "done":
        raise HTTPException(status_code=409, detail="A finished job is part of the equipment's record")
    db.delete(job)
    db.commit()
    return {"detail": "Job removed"}
