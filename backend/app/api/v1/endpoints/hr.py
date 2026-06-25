"""HR module API endpoints — leave management, org structure, recruitment,
employee lifecycle, payroll, meetings, and documents."""

from datetime import date, datetime, timedelta
from decimal import Decimal
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import and_, desc, func, or_
from sqlalchemy.orm import Session, joinedload

from app.core.deps import get_current_user, require_roles
from app.db.base import get_db
from app.models.hr import (
    Announcement, AnnouncementPriority,
    AttendancePolicy,
    Candidate, CandidateStatus,
    ContractTemplate, ContractType,
    DocumentCategory, DocumentTemplate,
    EmployeeAcknowledgment, EmployeeAward, EmployeeContract,
    EmployeeDocument, EmployeePromotion, EmployeeResignation, EmployeeTermination,
    Holiday,
    JobOffer, JobOpening,
    LeavePolicy, LeaveRequest, LeaveRequestStatus, LeaveType,
    Meeting, MeetingAttendee, MeetingMinutes,
    OnboardingChecklist, OnboardingChecklistItem,
    PayFrequency, PayrollConfig, PayrollRun, PayrollRunStatus, Payslip,
    TaxBracket,
    Timesheet, TimesheetStatus, DayStatus,
    EmployeePolicyAssignment,
)
from app.models.user import User, UserRole
from app.schemas.hr import (
    AnnouncementCreate, AnnouncementResponse, AnnouncementUpdate,
    AttendancePolicyCreate, AttendancePolicyResponse, AttendancePolicyUpdate,
    CandidateCreate, CandidateResponse, CandidateUpdate,
    ContractTemplateCreate, ContractTemplateResponse, ContractTemplateUpdate,
    ContractTypeCreate, ContractTypeResponse,
    DocumentCategoryCreate, DocumentCategoryResponse,
    DocumentTemplateCreate, DocumentTemplateResponse, DocumentTemplateUpdate,
    EmployeeAcknowledgmentCreate, EmployeeAcknowledgmentResponse,
    EmployeeAwardCreate, EmployeeAwardResponse, EmployeeAwardUpdate,
    EmployeeContractCreate, EmployeeContractResponse, EmployeeContractUpdate,
    EmployeeDocumentCreate, EmployeeDocumentResponse, EmployeeDocumentUpdate,
    EmployeePromotionCreate, EmployeePromotionResponse, EmployeePromotionUpdate,
    EmployeeResignationCreate, EmployeeResignationResponse, EmployeeResignationUpdate,
    EmployeeTerminationCreate, EmployeeTerminationResponse, EmployeeTerminationUpdate,
    HRDashboardResponse,
    HolidayCreate, HolidayResponse, HolidayUpdate,
    JobOfferCreate, JobOfferResponse, JobOfferUpdate,
    JobOpeningCreate, JobOpeningResponse, JobOpeningUpdate,
    LeavePolicyCreate, LeavePolicyResponse, LeavePolicyUpdate,
    LeaveRequestCreate, LeaveRequestResponse, LeaveRequestUpdate,
    LeaveTypeCreate, LeaveTypeResponse, LeaveTypeUpdate,
    MeetingCreate, MeetingMinutesCreate, MeetingMinutesResponse,
    MeetingResponse, MeetingUpdate,
    OnboardingChecklistCreate, OnboardingChecklistResponse, OnboardingChecklistUpdate,
    PayrollConfigCreate, PayrollConfigResponse, PayrollConfigUpdate,
    PayrollRunCreate, PayrollRunResponse, PayrollRunUpdate,
    PayslipResponse,
    TaxBracketCreate, TaxBracketResponse, TaxBracketUpdate,
    TimesheetCreate, TimesheetResponse, TimesheetUpdate, GenerateTimesheetRequest,
    MyTimesheetCreate, MyTimesheetUpdate, TimesheetReview,
    EmployeePolicyAssignmentCreate, EmployeePolicyAssignmentResponse,
    UserMini,
)

router = APIRouter()

HR_ROLES = ("superadmin", "admin", "hr_manager")
require_hr = require_roles(*HR_ROLES)


def _user_mini(user: Optional[User]) -> Optional[dict]:
    if not user:
        return None
    return {"id": user.id, "full_name": user.full_name, "email": user.email,
            "role": user.role.value if user.role else "", "avatar_url": user.avatar_url}


# ── Dashboard ─────────────────────────────────────────────────────────────────

@router.get("/dashboard", response_model=HRDashboardResponse)
def hr_dashboard(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_hr),
):
    now = datetime.utcnow()
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    next_30 = now + timedelta(days=30)

    total_emp = db.query(func.count(User.id)).filter(
        User.role.in_([UserRole.EMPLOYEE, UserRole.HR_MANAGER, UserRole.TECHNICIAN,
                        UserRole.FACILITY_ADMIN, UserRole.FACILITY_MANAGER])
    ).scalar() or 0
    active_emp = db.query(func.count(User.id)).filter(
        User.role.in_([UserRole.EMPLOYEE, UserRole.HR_MANAGER, UserRole.TECHNICIAN,
                        UserRole.FACILITY_ADMIN, UserRole.FACILITY_MANAGER]),
        User.is_active == True,
    ).scalar() or 0

    pending_leave = db.query(func.count(LeaveRequest.id)).filter(
        LeaveRequest.status == LeaveRequestStatus.PENDING
    ).scalar() or 0
    approved_leave = db.query(func.count(LeaveRequest.id)).filter(
        LeaveRequest.status == LeaveRequestStatus.APPROVED,
        LeaveRequest.approved_at >= month_start,
    ).scalar() or 0

    upcoming_holidays = db.query(func.count(Holiday.id)).filter(
        Holiday.date >= date.today(),
        Holiday.date <= (date.today() + timedelta(days=30)),
    ).scalar() or 0

    open_jobs = db.query(func.count(JobOpening.id)).filter(
        JobOpening.status == "open"
    ).scalar() or 0
    total_candidates = db.query(func.count(Candidate.id)).scalar() or 0

    upcoming_meetings = db.query(func.count(Meeting.id)).filter(
        Meeting.scheduled_at >= now,
        Meeting.scheduled_at <= now + timedelta(days=7),
    ).scalar() or 0

    payroll_runs = db.query(func.count(PayrollRun.id)).filter(
        PayrollRun.created_at >= month_start,
    ).scalar() or 0

    recent_announcements = (
        db.query(Announcement)
        .options(joinedload(Announcement.author))
        .filter(
            or_(Announcement.expires_at.is_(None), Announcement.expires_at >= now),
        )
        .order_by(Announcement.is_pinned.desc(), Announcement.created_at.desc())
        .limit(5)
        .all()
    )

    upcoming_hols = (
        db.query(Holiday)
        .options(joinedload(Holiday.created_by))
        .filter(
            Holiday.date >= date.today(),
            Holiday.date <= (date.today() + timedelta(days=60)),
        )
        .order_by(Holiday.date.asc())
        .limit(5)
        .all()
    )

    return {
        "total_employees": total_emp,
        "active_employees": active_emp,
        "pending_leave_requests": pending_leave,
        "approved_leave_requests_this_month": approved_leave,
        "upcoming_holidays": upcoming_holidays,
        "open_job_openings": open_jobs,
        "total_candidates": total_candidates,
        "upcoming_meetings": upcoming_meetings,
        "payroll_runs_this_month": payroll_runs,
        "pending_announcements": pending_leave,
        "recent_announcements": recent_announcements,
        "upcoming_holidays_list": upcoming_hols,
    }


# ── Employees (user list for HR) ──────────────────────────────────────────────

@router.get("/employees", response_model=dict)
def list_employees(
    skip: int = 0,
    limit: int = 50,
    search: Optional[str] = None,
    role: Optional[str] = None,
    is_active: Optional[bool] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_hr),
):
    query = db.query(User).filter(
        User.role.notin_([UserRole.CLIENT, UserRole.SUPERADMIN])
    )
    if search:
        like = f"%{search}%"
        query = query.filter(or_(User.full_name.ilike(like), User.email.ilike(like)))
    if role:
        query = query.filter(User.role == role)
    if is_active is not None:
        query = query.filter(User.is_active == is_active)

    total = query.count()
    items = query.order_by(User.full_name).offset(skip).limit(limit).all()
    return {
        "total": total,
        "items": [_user_mini(u) for u in items],
    }


# ── Leave Types ───────────────────────────────────────────────────────────────

@router.get("/leave-types", response_model=List[LeaveTypeResponse])
def list_leave_types(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return db.query(LeaveType).order_by(LeaveType.name).all()


@router.post("/leave-types", response_model=LeaveTypeResponse, status_code=201)
def create_leave_type(
    payload: LeaveTypeCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_hr),
):
    obj = LeaveType(**payload.model_dump())
    db.add(obj)
    db.commit()
    db.refresh(obj)
    return obj


@router.put("/leave-types/{lt_id}", response_model=LeaveTypeResponse)
def update_leave_type(
    lt_id: int,
    payload: LeaveTypeUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_hr),
):
    obj = db.query(LeaveType).filter(LeaveType.id == lt_id).first()
    if not obj:
        raise HTTPException(404, "Leave type not found")
    for k, v in payload.model_dump(exclude_none=True).items():
        setattr(obj, k, v)
    db.commit()
    db.refresh(obj)
    return obj


@router.delete("/leave-types/{lt_id}", status_code=204)
def delete_leave_type(
    lt_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_hr),
):
    obj = db.query(LeaveType).filter(LeaveType.id == lt_id).first()
    if not obj:
        raise HTTPException(404, "Leave type not found")
    db.delete(obj)
    db.commit()


# ── Leave Policies ────────────────────────────────────────────────────────────

@router.get("/leave-policies", response_model=List[LeavePolicyResponse])
def list_leave_policies(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_hr),
):
    return (
        db.query(LeavePolicy)
        .options(joinedload(LeavePolicy.leave_type))
        .order_by(LeavePolicy.name)
        .all()
    )


@router.post("/leave-policies", response_model=LeavePolicyResponse, status_code=201)
def create_leave_policy(
    payload: LeavePolicyCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_hr),
):
    obj = LeavePolicy(**payload.model_dump())
    db.add(obj)
    db.commit()
    db.refresh(obj)
    return db.query(LeavePolicy).options(joinedload(LeavePolicy.leave_type)).filter(LeavePolicy.id == obj.id).first()


@router.put("/leave-policies/{lp_id}", response_model=LeavePolicyResponse)
def update_leave_policy(
    lp_id: int,
    payload: LeavePolicyUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_hr),
):
    obj = db.query(LeavePolicy).filter(LeavePolicy.id == lp_id).first()
    if not obj:
        raise HTTPException(404, "Leave policy not found")
    for k, v in payload.model_dump(exclude_none=True).items():
        setattr(obj, k, v)
    db.commit()
    db.refresh(obj)
    return db.query(LeavePolicy).options(joinedload(LeavePolicy.leave_type)).filter(LeavePolicy.id == obj.id).first()


@router.delete("/leave-policies/{lp_id}", status_code=204)
def delete_leave_policy(
    lp_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_hr),
):
    obj = db.query(LeavePolicy).filter(LeavePolicy.id == lp_id).first()
    if not obj:
        raise HTTPException(404, "Leave policy not found")
    db.delete(obj)
    db.commit()


# ── Leave Requests ────────────────────────────────────────────────────────────

def _lr_query(db: Session):
    return (
        db.query(LeaveRequest)
        .options(
            joinedload(LeaveRequest.user),
            joinedload(LeaveRequest.leave_type),
            joinedload(LeaveRequest.approved_by),
        )
    )


@router.get("/leave-requests", response_model=dict)
def list_leave_requests(
    skip: int = 0,
    limit: int = 50,
    status: Optional[str] = None,
    user_id: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # Employees see only their own requests
    if current_user.role not in [UserRole.SUPERADMIN, UserRole.ADMIN, UserRole.HR_MANAGER]:
        user_id = current_user.id

    q = _lr_query(db)
    if user_id:
        q = q.filter(LeaveRequest.user_id == user_id)
    if status:
        q = q.filter(LeaveRequest.status == status)
    total = q.count()
    items = q.order_by(desc(LeaveRequest.created_at)).offset(skip).limit(limit).all()
    return {"total": total, "items": items}


@router.post("/leave-requests", response_model=LeaveRequestResponse, status_code=201)
def create_leave_request(
    payload: LeaveRequestCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    delta = (payload.end_date - payload.start_date).days + 1
    obj = LeaveRequest(
        user_id=current_user.id,
        total_days=max(delta, 1),
        **payload.model_dump(),
    )
    db.add(obj)
    db.commit()
    db.refresh(obj)
    return _lr_query(db).filter(LeaveRequest.id == obj.id).first()


@router.put("/leave-requests/{lr_id}", response_model=LeaveRequestResponse)
def update_leave_request(
    lr_id: int,
    payload: LeaveRequestUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_hr),
):
    obj = db.query(LeaveRequest).filter(LeaveRequest.id == lr_id).first()
    if not obj:
        raise HTTPException(404, "Leave request not found")
    data = payload.model_dump(exclude_none=True)
    if "status" in data and data["status"] in (LeaveRequestStatus.APPROVED, LeaveRequestStatus.REJECTED):
        data["approved_by_id"] = current_user.id
        data["approved_at"] = datetime.utcnow()
    for k, v in data.items():
        setattr(obj, k, v)
    db.commit()
    return _lr_query(db).filter(LeaveRequest.id == lr_id).first()


@router.delete("/leave-requests/{lr_id}", status_code=204)
def delete_leave_request(
    lr_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    obj = db.query(LeaveRequest).filter(LeaveRequest.id == lr_id).first()
    if not obj:
        raise HTTPException(404, "Leave request not found")
    if obj.user_id != current_user.id and current_user.role not in [UserRole.SUPERADMIN, UserRole.ADMIN, UserRole.HR_MANAGER]:
        raise HTTPException(403, "Cannot delete another user's leave request")
    db.delete(obj)
    db.commit()


# ── Attendance Policies ───────────────────────────────────────────────────────

@router.get("/attendance-policies", response_model=List[AttendancePolicyResponse])
def list_attendance_policies(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_hr),
):
    return db.query(AttendancePolicy).order_by(AttendancePolicy.name).all()


@router.post("/attendance-policies", response_model=AttendancePolicyResponse, status_code=201)
def create_attendance_policy(
    payload: AttendancePolicyCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_hr),
):
    if payload.is_default:
        db.query(AttendancePolicy).filter(AttendancePolicy.is_default == True).update({"is_default": False})
    obj = AttendancePolicy(**payload.model_dump())
    db.add(obj)
    db.commit()
    db.refresh(obj)
    return obj


@router.put("/attendance-policies/{ap_id}", response_model=AttendancePolicyResponse)
def update_attendance_policy(
    ap_id: int,
    payload: AttendancePolicyUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_hr),
):
    obj = db.query(AttendancePolicy).filter(AttendancePolicy.id == ap_id).first()
    if not obj:
        raise HTTPException(404, "Attendance policy not found")
    data = payload.model_dump(exclude_none=True)
    if data.get("is_default"):
        db.query(AttendancePolicy).filter(AttendancePolicy.id != ap_id).update({"is_default": False})
    for k, v in data.items():
        setattr(obj, k, v)
    db.commit()
    db.refresh(obj)
    return obj


@router.delete("/attendance-policies/{ap_id}", status_code=204)
def delete_attendance_policy(
    ap_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_hr),
):
    obj = db.query(AttendancePolicy).filter(AttendancePolicy.id == ap_id).first()
    if not obj:
        raise HTTPException(404, "Not found")
    db.delete(obj)
    db.commit()


# ── Employee Policy Assignments ───────────────────────────────────────────────

def _epa_query(db: Session):
    return db.query(EmployeePolicyAssignment).options(
        joinedload(EmployeePolicyAssignment.user),
        joinedload(EmployeePolicyAssignment.policy),
    )

@router.get("/employee-policy-assignments", response_model=List[EmployeePolicyAssignmentResponse])
def list_employee_policy_assignments(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_hr),
):
    return _epa_query(db).order_by(EmployeePolicyAssignment.user_id).all()

@router.post("/employee-policy-assignments", response_model=EmployeePolicyAssignmentResponse, status_code=201)
def create_employee_policy_assignment(
    payload: EmployeePolicyAssignmentCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_hr),
):
    # Upsert: one assignment per employee
    existing = db.query(EmployeePolicyAssignment).filter(EmployeePolicyAssignment.user_id == payload.user_id).first()
    if existing:
        for k, v in payload.model_dump().items():
            setattr(existing, k, v)
        db.commit()
        return _epa_query(db).filter(EmployeePolicyAssignment.id == existing.id).first()
    obj = EmployeePolicyAssignment(**payload.model_dump())
    db.add(obj)
    db.commit()
    db.refresh(obj)
    return _epa_query(db).filter(EmployeePolicyAssignment.id == obj.id).first()

@router.delete("/employee-policy-assignments/{epa_id}", status_code=204)
def delete_employee_policy_assignment(
    epa_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_hr),
):
    obj = db.query(EmployeePolicyAssignment).filter(EmployeePolicyAssignment.id == epa_id).first()
    if not obj:
        raise HTTPException(404, "Not found")
    db.delete(obj)
    db.commit()


# ── Holidays ──────────────────────────────────────────────────────────────────

@router.get("/holidays", response_model=List[HolidayResponse])
def list_holidays(
    year: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    q = db.query(Holiday).options(joinedload(Holiday.created_by))
    if year:
        q = q.filter(func.extract("year", Holiday.date) == year)
    return q.order_by(Holiday.date).all()


@router.post("/holidays", response_model=HolidayResponse, status_code=201)
def create_holiday(
    payload: HolidayCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_hr),
):
    obj = Holiday(**payload.model_dump(), created_by_id=current_user.id)
    db.add(obj)
    db.commit()
    db.refresh(obj)
    return db.query(Holiday).options(joinedload(Holiday.created_by)).filter(Holiday.id == obj.id).first()


@router.put("/holidays/{h_id}", response_model=HolidayResponse)
def update_holiday(
    h_id: int,
    payload: HolidayUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_hr),
):
    obj = db.query(Holiday).filter(Holiday.id == h_id).first()
    if not obj:
        raise HTTPException(404, "Holiday not found")
    for k, v in payload.model_dump(exclude_none=True).items():
        setattr(obj, k, v)
    db.commit()
    return db.query(Holiday).options(joinedload(Holiday.created_by)).filter(Holiday.id == h_id).first()


@router.delete("/holidays/{h_id}", status_code=204)
def delete_holiday(
    h_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_hr),
):
    obj = db.query(Holiday).filter(Holiday.id == h_id).first()
    if not obj:
        raise HTTPException(404, "Not found")
    db.delete(obj)
    db.commit()


# ── Announcements ─────────────────────────────────────────────────────────────

@router.get("/announcements", response_model=List[AnnouncementResponse])
def list_announcements(
    include_expired: bool = False,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    q = db.query(Announcement).options(joinedload(Announcement.author))
    if not include_expired:
        now = datetime.utcnow()
        q = q.filter(or_(Announcement.expires_at.is_(None), Announcement.expires_at >= now))
    return q.order_by(Announcement.is_pinned.desc(), Announcement.created_at.desc()).all()


@router.post("/announcements", response_model=AnnouncementResponse, status_code=201)
def create_announcement(
    payload: AnnouncementCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_hr),
):
    data = payload.model_dump()
    if data.get("published_at") is None:
        data["published_at"] = datetime.utcnow()
    obj = Announcement(**data, author_id=current_user.id)
    db.add(obj)
    db.commit()
    db.refresh(obj)
    return db.query(Announcement).options(joinedload(Announcement.author)).filter(Announcement.id == obj.id).first()


@router.put("/announcements/{a_id}", response_model=AnnouncementResponse)
def update_announcement(
    a_id: int,
    payload: AnnouncementUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_hr),
):
    obj = db.query(Announcement).filter(Announcement.id == a_id).first()
    if not obj:
        raise HTTPException(404, "Announcement not found")
    for k, v in payload.model_dump(exclude_none=True).items():
        setattr(obj, k, v)
    db.commit()
    return db.query(Announcement).options(joinedload(Announcement.author)).filter(Announcement.id == a_id).first()


@router.delete("/announcements/{a_id}", status_code=204)
def delete_announcement(
    a_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_hr),
):
    obj = db.query(Announcement).filter(Announcement.id == a_id).first()
    if not obj:
        raise HTTPException(404, "Not found")
    db.delete(obj)
    db.commit()


# ── Job Openings ──────────────────────────────────────────────────────────────

@router.get("/job-openings", response_model=dict)
def list_job_openings(
    skip: int = 0,
    limit: int = 50,
    status: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_hr),
):
    q = db.query(JobOpening).options(joinedload(JobOpening.created_by))
    if status:
        q = q.filter(JobOpening.status == status)
    total = q.count()
    items = q.order_by(desc(JobOpening.created_at)).offset(skip).limit(limit).all()
    result = []
    for jo in items:
        d = {c.name: getattr(jo, c.name) for c in jo.__table__.columns}
        d["created_by"] = _user_mini(jo.created_by)
        d["candidate_count"] = db.query(func.count(Candidate.id)).filter(Candidate.job_opening_id == jo.id).scalar() or 0
        result.append(d)
    return {"total": total, "items": result}


@router.post("/job-openings", response_model=JobOpeningResponse, status_code=201)
def create_job_opening(
    payload: JobOpeningCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_hr),
):
    obj = JobOpening(**payload.model_dump(), created_by_id=current_user.id)
    if obj.status == "open" and not obj.posted_at:
        obj.posted_at = datetime.utcnow()
    db.add(obj)
    db.commit()
    db.refresh(obj)
    return obj


@router.put("/job-openings/{jo_id}", response_model=JobOpeningResponse)
def update_job_opening(
    jo_id: int,
    payload: JobOpeningUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_hr),
):
    obj = db.query(JobOpening).filter(JobOpening.id == jo_id).first()
    if not obj:
        raise HTTPException(404, "Job opening not found")
    data = payload.model_dump(exclude_none=True)
    if data.get("status") == "open" and not obj.posted_at:
        data["posted_at"] = datetime.utcnow()
    for k, v in data.items():
        setattr(obj, k, v)
    db.commit()
    db.refresh(obj)
    return obj


@router.delete("/job-openings/{jo_id}", status_code=204)
def delete_job_opening(
    jo_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_hr),
):
    obj = db.query(JobOpening).filter(JobOpening.id == jo_id).first()
    if not obj:
        raise HTTPException(404, "Not found")
    db.delete(obj)
    db.commit()


# ── Candidates ────────────────────────────────────────────────────────────────

@router.get("/candidates", response_model=dict)
def list_candidates(
    skip: int = 0,
    limit: int = 50,
    job_opening_id: Optional[int] = None,
    status: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_hr),
):
    q = db.query(Candidate)
    if job_opening_id:
        q = q.filter(Candidate.job_opening_id == job_opening_id)
    if status:
        q = q.filter(Candidate.status == status)
    total = q.count()
    items = q.order_by(desc(Candidate.applied_at)).offset(skip).limit(limit).all()
    return {"total": total, "items": items}


@router.post("/candidates", response_model=CandidateResponse, status_code=201)
def create_candidate(
    payload: CandidateCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_hr),
):
    obj = Candidate(**payload.model_dump())
    db.add(obj)
    db.commit()
    db.refresh(obj)
    return obj


@router.put("/candidates/{c_id}", response_model=CandidateResponse)
def update_candidate(
    c_id: int,
    payload: CandidateUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_hr),
):
    obj = db.query(Candidate).filter(Candidate.id == c_id).first()
    if not obj:
        raise HTTPException(404, "Candidate not found")
    for k, v in payload.model_dump(exclude_none=True).items():
        setattr(obj, k, v)
    db.commit()
    db.refresh(obj)
    return obj


@router.delete("/candidates/{c_id}", status_code=204)
def delete_candidate(
    c_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_hr),
):
    obj = db.query(Candidate).filter(Candidate.id == c_id).first()
    if not obj:
        raise HTTPException(404, "Not found")
    db.delete(obj)
    db.commit()


# ── Job Offers ────────────────────────────────────────────────────────────────

@router.get("/job-offers", response_model=List[JobOfferResponse])
def list_job_offers(
    job_opening_id: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_hr),
):
    q = db.query(JobOffer).options(joinedload(JobOffer.candidate))
    if job_opening_id:
        q = q.filter(JobOffer.job_opening_id == job_opening_id)
    return q.order_by(desc(JobOffer.created_at)).all()


@router.post("/job-offers", response_model=JobOfferResponse, status_code=201)
def create_job_offer(
    payload: JobOfferCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_hr),
):
    obj = JobOffer(**payload.model_dump())
    db.add(obj)
    db.commit()
    db.refresh(obj)
    return db.query(JobOffer).options(joinedload(JobOffer.candidate)).filter(JobOffer.id == obj.id).first()


@router.put("/job-offers/{o_id}", response_model=JobOfferResponse)
def update_job_offer(
    o_id: int,
    payload: JobOfferUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_hr),
):
    obj = db.query(JobOffer).filter(JobOffer.id == o_id).first()
    if not obj:
        raise HTTPException(404, "Offer not found")
    for k, v in payload.model_dump(exclude_none=True).items():
        setattr(obj, k, v)
    db.commit()
    db.refresh(obj)
    return db.query(JobOffer).options(joinedload(JobOffer.candidate)).filter(JobOffer.id == o_id).first()


@router.delete("/job-offers/{o_id}", status_code=204)
def delete_job_offer(
    o_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_hr),
):
    obj = db.query(JobOffer).filter(JobOffer.id == o_id).first()
    if not obj:
        raise HTTPException(404, "Not found")
    db.delete(obj)
    db.commit()


# ── Onboarding Checklists ─────────────────────────────────────────────────────

@router.get("/onboarding-checklists", response_model=List[OnboardingChecklistResponse])
def list_onboarding_checklists(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_hr),
):
    return (
        db.query(OnboardingChecklist)
        .options(joinedload(OnboardingChecklist.items))
        .order_by(OnboardingChecklist.name)
        .all()
    )


@router.post("/onboarding-checklists", response_model=OnboardingChecklistResponse, status_code=201)
def create_onboarding_checklist(
    payload: OnboardingChecklistCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_hr),
):
    data = payload.model_dump()
    items_data = data.pop("items", [])
    obj = OnboardingChecklist(**data)
    db.add(obj)
    db.flush()
    for item in items_data:
        db.add(OnboardingChecklistItem(checklist_id=obj.id, **item))
    db.commit()
    db.refresh(obj)
    return db.query(OnboardingChecklist).options(joinedload(OnboardingChecklist.items)).filter(OnboardingChecklist.id == obj.id).first()


@router.put("/onboarding-checklists/{cl_id}", response_model=OnboardingChecklistResponse)
def update_onboarding_checklist(
    cl_id: int,
    payload: OnboardingChecklistUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_hr),
):
    obj = db.query(OnboardingChecklist).filter(OnboardingChecklist.id == cl_id).first()
    if not obj:
        raise HTTPException(404, "Checklist not found")
    for k, v in payload.model_dump(exclude_none=True).items():
        setattr(obj, k, v)
    db.commit()
    return db.query(OnboardingChecklist).options(joinedload(OnboardingChecklist.items)).filter(OnboardingChecklist.id == cl_id).first()


@router.delete("/onboarding-checklists/{cl_id}", status_code=204)
def delete_onboarding_checklist(
    cl_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_hr),
):
    obj = db.query(OnboardingChecklist).filter(OnboardingChecklist.id == cl_id).first()
    if not obj:
        raise HTTPException(404, "Not found")
    db.delete(obj)
    db.commit()


# ── Employee Awards ───────────────────────────────────────────────────────────

def _awards_query(db: Session):
    return db.query(EmployeeAward).options(
        joinedload(EmployeeAward.user),
        joinedload(EmployeeAward.awarded_by),
    )


@router.get("/awards", response_model=dict)
def list_awards(
    user_id: Optional[int] = None,
    skip: int = 0,
    limit: int = 50,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_hr),
):
    q = _awards_query(db)
    if user_id:
        q = q.filter(EmployeeAward.user_id == user_id)
    total = q.count()
    items = q.order_by(desc(EmployeeAward.award_date)).offset(skip).limit(limit).all()
    return {"total": total, "items": items}


@router.post("/awards", response_model=EmployeeAwardResponse, status_code=201)
def create_award(
    payload: EmployeeAwardCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_hr),
):
    obj = EmployeeAward(**payload.model_dump(), awarded_by_id=current_user.id)
    db.add(obj)
    db.commit()
    db.refresh(obj)
    return _awards_query(db).filter(EmployeeAward.id == obj.id).first()


@router.put("/awards/{a_id}", response_model=EmployeeAwardResponse)
def update_award(
    a_id: int,
    payload: EmployeeAwardUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_hr),
):
    obj = db.query(EmployeeAward).filter(EmployeeAward.id == a_id).first()
    if not obj:
        raise HTTPException(404, "Award not found")
    for k, v in payload.model_dump(exclude_none=True).items():
        setattr(obj, k, v)
    db.commit()
    return _awards_query(db).filter(EmployeeAward.id == a_id).first()


@router.delete("/awards/{a_id}", status_code=204)
def delete_award(
    a_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_hr),
):
    obj = db.query(EmployeeAward).filter(EmployeeAward.id == a_id).first()
    if not obj:
        raise HTTPException(404, "Not found")
    db.delete(obj)
    db.commit()


# ── Promotions ────────────────────────────────────────────────────────────────

def _promo_query(db: Session):
    return db.query(EmployeePromotion).options(
        joinedload(EmployeePromotion.user),
        joinedload(EmployeePromotion.approved_by),
    )


@router.get("/promotions", response_model=dict)
def list_promotions(
    user_id: Optional[int] = None,
    skip: int = 0,
    limit: int = 50,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_hr),
):
    q = _promo_query(db)
    if user_id:
        q = q.filter(EmployeePromotion.user_id == user_id)
    total = q.count()
    items = q.order_by(desc(EmployeePromotion.effective_date)).offset(skip).limit(limit).all()
    return {"total": total, "items": items}


@router.post("/promotions", response_model=EmployeePromotionResponse, status_code=201)
def create_promotion(
    payload: EmployeePromotionCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_hr),
):
    obj = EmployeePromotion(**payload.model_dump(), approved_by_id=current_user.id)
    db.add(obj)
    db.commit()
    db.refresh(obj)
    return _promo_query(db).filter(EmployeePromotion.id == obj.id).first()


@router.put("/promotions/{p_id}", response_model=EmployeePromotionResponse)
def update_promotion(
    p_id: int,
    payload: EmployeePromotionUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_hr),
):
    obj = db.query(EmployeePromotion).filter(EmployeePromotion.id == p_id).first()
    if not obj:
        raise HTTPException(404, "Promotion not found")
    for k, v in payload.model_dump(exclude_none=True).items():
        setattr(obj, k, v)
    db.commit()
    return _promo_query(db).filter(EmployeePromotion.id == p_id).first()


@router.delete("/promotions/{p_id}", status_code=204)
def delete_promotion(
    p_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_hr),
):
    obj = db.query(EmployeePromotion).filter(EmployeePromotion.id == p_id).first()
    if not obj:
        raise HTTPException(404, "Not found")
    db.delete(obj)
    db.commit()


# ── Resignations ──────────────────────────────────────────────────────────────

def _resign_query(db: Session):
    return db.query(EmployeeResignation).options(
        joinedload(EmployeeResignation.user),
        joinedload(EmployeeResignation.processed_by),
    )


@router.get("/resignations", response_model=dict)
def list_resignations(
    user_id: Optional[int] = None,
    skip: int = 0,
    limit: int = 50,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_hr),
):
    q = _resign_query(db)
    if user_id:
        q = q.filter(EmployeeResignation.user_id == user_id)
    total = q.count()
    items = q.order_by(desc(EmployeeResignation.submitted_at)).offset(skip).limit(limit).all()
    return {"total": total, "items": items}


@router.post("/resignations", response_model=EmployeeResignationResponse, status_code=201)
def create_resignation(
    payload: EmployeeResignationCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_hr),
):
    obj = EmployeeResignation(**payload.model_dump(), processed_by_id=current_user.id)
    db.add(obj)
    db.commit()
    db.refresh(obj)
    return _resign_query(db).filter(EmployeeResignation.id == obj.id).first()


@router.put("/resignations/{r_id}", response_model=EmployeeResignationResponse)
def update_resignation(
    r_id: int,
    payload: EmployeeResignationUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_hr),
):
    obj = db.query(EmployeeResignation).filter(EmployeeResignation.id == r_id).first()
    if not obj:
        raise HTTPException(404, "Not found")
    for k, v in payload.model_dump(exclude_none=True).items():
        setattr(obj, k, v)
    db.commit()
    return _resign_query(db).filter(EmployeeResignation.id == r_id).first()


@router.delete("/resignations/{r_id}", status_code=204)
def delete_resignation(
    r_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_hr),
):
    obj = db.query(EmployeeResignation).filter(EmployeeResignation.id == r_id).first()
    if not obj:
        raise HTTPException(404, "Not found")
    db.delete(obj)
    db.commit()


# ── Terminations ──────────────────────────────────────────────────────────────

def _term_query(db: Session):
    return db.query(EmployeeTermination).options(
        joinedload(EmployeeTermination.user),
        joinedload(EmployeeTermination.processed_by),
    )


@router.get("/terminations", response_model=dict)
def list_terminations(
    user_id: Optional[int] = None,
    skip: int = 0,
    limit: int = 50,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_hr),
):
    q = _term_query(db)
    if user_id:
        q = q.filter(EmployeeTermination.user_id == user_id)
    total = q.count()
    items = q.order_by(desc(EmployeeTermination.termination_date)).offset(skip).limit(limit).all()
    return {"total": total, "items": items}


@router.post("/terminations", response_model=EmployeeTerminationResponse, status_code=201)
def create_termination(
    payload: EmployeeTerminationCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_hr),
):
    obj = EmployeeTermination(**payload.model_dump(), processed_by_id=current_user.id)
    db.add(obj)
    db.commit()
    db.refresh(obj)
    return _term_query(db).filter(EmployeeTermination.id == obj.id).first()


@router.put("/terminations/{t_id}", response_model=EmployeeTerminationResponse)
def update_termination(
    t_id: int,
    payload: EmployeeTerminationUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_hr),
):
    obj = db.query(EmployeeTermination).filter(EmployeeTermination.id == t_id).first()
    if not obj:
        raise HTTPException(404, "Not found")
    for k, v in payload.model_dump(exclude_none=True).items():
        setattr(obj, k, v)
    db.commit()
    return _term_query(db).filter(EmployeeTermination.id == t_id).first()


@router.delete("/terminations/{t_id}", status_code=204)
def delete_termination(
    t_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_hr),
):
    obj = db.query(EmployeeTermination).filter(EmployeeTermination.id == t_id).first()
    if not obj:
        raise HTTPException(404, "Not found")
    db.delete(obj)
    db.commit()


# ── Tax Brackets ──────────────────────────────────────────────────────────────

@router.get("/tax-brackets", response_model=List[TaxBracketResponse])
def list_tax_brackets(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_hr),
):
    return db.query(TaxBracket).order_by(TaxBracket.min_income).all()


@router.post("/tax-brackets", response_model=TaxBracketResponse, status_code=201)
def create_tax_bracket(
    payload: TaxBracketCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_hr),
):
    obj = TaxBracket(**payload.model_dump())
    db.add(obj)
    db.commit()
    db.refresh(obj)
    return obj


@router.put("/tax-brackets/{tb_id}", response_model=TaxBracketResponse)
def update_tax_bracket(
    tb_id: int,
    payload: TaxBracketUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_hr),
):
    obj = db.query(TaxBracket).filter(TaxBracket.id == tb_id).first()
    if not obj:
        raise HTTPException(404, "Not found")
    for k, v in payload.model_dump(exclude_none=True).items():
        setattr(obj, k, v)
    db.commit()
    db.refresh(obj)
    return obj


@router.delete("/tax-brackets/{tb_id}", status_code=204)
def delete_tax_bracket(
    tb_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_hr),
):
    obj = db.query(TaxBracket).filter(TaxBracket.id == tb_id).first()
    if not obj:
        raise HTTPException(404, "Not found")
    db.delete(obj)
    db.commit()


# ── Payroll Configs ───────────────────────────────────────────────────────────

@router.get("/payroll-configs", response_model=List[PayrollConfigResponse])
def list_payroll_configs(
    user_id: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_hr),
):
    q = db.query(PayrollConfig).options(joinedload(PayrollConfig.user))
    if user_id:
        q = q.filter(PayrollConfig.user_id == user_id)
    return q.order_by(desc(PayrollConfig.effective_from)).all()


@router.post("/payroll-configs", response_model=PayrollConfigResponse, status_code=201)
def create_payroll_config(
    payload: PayrollConfigCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_hr),
):
    # deactivate old configs for this user
    db.query(PayrollConfig).filter(
        PayrollConfig.user_id == payload.user_id,
        PayrollConfig.is_active == True
    ).update({"is_active": False})
    obj = PayrollConfig(**payload.model_dump())
    db.add(obj)
    db.commit()
    db.refresh(obj)
    return db.query(PayrollConfig).options(joinedload(PayrollConfig.user)).filter(PayrollConfig.id == obj.id).first()


@router.put("/payroll-configs/{pc_id}", response_model=PayrollConfigResponse)
def update_payroll_config(
    pc_id: int,
    payload: PayrollConfigUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_hr),
):
    obj = db.query(PayrollConfig).filter(PayrollConfig.id == pc_id).first()
    if not obj:
        raise HTTPException(404, "Not found")
    for k, v in payload.model_dump(exclude_none=True).items():
        setattr(obj, k, v)
    db.commit()
    return db.query(PayrollConfig).options(joinedload(PayrollConfig.user)).filter(PayrollConfig.id == pc_id).first()


# ── Payroll Runs ──────────────────────────────────────────────────────────────

@router.get("/payroll-runs", response_model=dict)
def list_payroll_runs(
    skip: int = 0,
    limit: int = 20,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_hr),
):
    q = db.query(PayrollRun).options(
        joinedload(PayrollRun.processed_by),
        joinedload(PayrollRun.payslips).joinedload(Payslip.user),
    )
    total = q.count()
    items = q.order_by(desc(PayrollRun.period_start)).offset(skip).limit(limit).all()
    return {"total": total, "items": items}


@router.post("/payroll-runs", response_model=PayrollRunResponse, status_code=201)
def create_payroll_run(
    payload: PayrollRunCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_hr),
):
    obj = PayrollRun(**payload.model_dump(), processed_by_id=current_user.id)
    db.add(obj)
    db.commit()
    db.refresh(obj)
    return obj


@router.put("/payroll-runs/{pr_id}", response_model=PayrollRunResponse)
def update_payroll_run(
    pr_id: int,
    payload: PayrollRunUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_hr),
):
    obj = db.query(PayrollRun).filter(PayrollRun.id == pr_id).first()
    if not obj:
        raise HTTPException(404, "Not found")
    data = payload.model_dump(exclude_none=True)
    if data.get("status") == PayrollRunStatus.PROCESSED:
        data["run_date"] = datetime.utcnow()
    for k, v in data.items():
        setattr(obj, k, v)
    db.commit()
    db.refresh(obj)
    return obj


@router.post("/payroll-runs/{pr_id}/process", response_model=PayrollRunResponse)
def process_payroll_run(
    pr_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_hr),
):
    run = db.query(PayrollRun).filter(PayrollRun.id == pr_id).first()
    if not run:
        raise HTTPException(404, "Payroll run not found")
    if run.status == PayrollRunStatus.PAID:
        raise HTTPException(400, "Cannot reprocess a paid payroll run")

    # Remove previous payslips so re-processing is safe
    db.query(Payslip).filter(Payslip.payroll_run_id == run.id).delete()

    employees = db.query(User).filter(User.is_active == True).all()

    total_gross = 0.0
    total_deductions = 0.0
    total_net = 0.0

    for emp in employees:
        timesheets = db.query(Timesheet).filter(
            Timesheet.user_id == emp.id,
            Timesheet.work_date >= run.period_start,
            Timesheet.work_date <= run.period_end,
            Timesheet.source == "attendance",
        ).all()

        if not timesheets:
            continue

        gross_pay      = sum(float(t.daily_wage_earned or 0) for t in timesheets)
        deductions     = sum(float(t.policy_deduction or 0) for t in timesheets)
        work_hours     = sum(float(t.hours_worked or 0) for t in timesheets)
        net_pay        = max(0.0, gross_pay - deductions)

        slip = Payslip(
            payroll_run_id=run.id,
            user_id=emp.id,
            gross_pay=round(gross_pay, 2),
            tax_amount=0,
            deductions=round(deductions, 2),
            net_pay=round(net_pay, 2),
            work_hours=round(work_hours, 2),
        )
        db.add(slip)

        total_gross      += gross_pay
        total_deductions += deductions
        total_net        += net_pay

    run.status      = PayrollRunStatus.PROCESSED
    run.total_gross = round(total_gross, 2)
    run.total_tax   = 0
    run.total_net   = round(total_net, 2)
    run.run_date    = datetime.utcnow()
    db.commit()

    return db.query(PayrollRun).options(
        joinedload(PayrollRun.payslips).joinedload(Payslip.user),
        joinedload(PayrollRun.processed_by),
    ).filter(PayrollRun.id == pr_id).first()


@router.post("/payroll-runs/{pr_id}/payslips", response_model=PayslipResponse, status_code=201)
def add_payslip(
    pr_id: int,
    user_id: int,
    gross_pay: Decimal,
    tax_amount: Decimal,
    deductions: Decimal,
    work_hours: float = 0,
    overtime_hours: float = 0,
    notes: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_hr),
):
    run = db.query(PayrollRun).filter(PayrollRun.id == pr_id).first()
    if not run:
        raise HTTPException(404, "Payroll run not found")
    net_pay = gross_pay - tax_amount - deductions
    slip = Payslip(
        payroll_run_id=pr_id, user_id=user_id, gross_pay=gross_pay,
        tax_amount=tax_amount, deductions=deductions, net_pay=net_pay,
        work_hours=work_hours, overtime_hours=overtime_hours, notes=notes,
    )
    db.add(slip)
    # update run totals
    run.total_gross = (run.total_gross or 0) + gross_pay
    run.total_net = (run.total_net or 0) + net_pay
    run.total_tax = (run.total_tax or 0) + tax_amount
    db.commit()
    db.refresh(slip)
    return db.query(Payslip).options(joinedload(Payslip.user)).filter(Payslip.id == slip.id).first()


# ── Meetings ──────────────────────────────────────────────────────────────────

def _meeting_query(db: Session):
    return db.query(Meeting).options(
        joinedload(Meeting.organizer),
        joinedload(Meeting.attendees).joinedload(MeetingAttendee.user),
        joinedload(Meeting.minutes).joinedload(MeetingMinutes.recorded_by),
    )


@router.get("/meetings", response_model=dict)
def list_meetings(
    skip: int = 0,
    limit: int = 50,
    status: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_hr),
):
    q = _meeting_query(db)
    if status:
        q = q.filter(Meeting.status == status)
    total = q.count()
    items = q.order_by(desc(Meeting.scheduled_at)).offset(skip).limit(limit).all()
    return {"total": total, "items": items}


@router.post("/meetings", response_model=MeetingResponse, status_code=201)
def create_meeting(
    payload: MeetingCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_hr),
):
    data = payload.model_dump()
    attendee_ids = data.pop("attendee_ids", [])
    obj = Meeting(**data, organizer_id=current_user.id)
    db.add(obj)
    db.flush()
    for uid in set(attendee_ids):
        db.add(MeetingAttendee(meeting_id=obj.id, user_id=uid))
    db.commit()
    db.refresh(obj)
    return _meeting_query(db).filter(Meeting.id == obj.id).first()


@router.put("/meetings/{m_id}", response_model=MeetingResponse)
def update_meeting(
    m_id: int,
    payload: MeetingUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_hr),
):
    obj = db.query(Meeting).filter(Meeting.id == m_id).first()
    if not obj:
        raise HTTPException(404, "Meeting not found")
    for k, v in payload.model_dump(exclude_none=True).items():
        setattr(obj, k, v)
    db.commit()
    return _meeting_query(db).filter(Meeting.id == m_id).first()


@router.delete("/meetings/{m_id}", status_code=204)
def delete_meeting(
    m_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_hr),
):
    obj = db.query(Meeting).filter(Meeting.id == m_id).first()
    if not obj:
        raise HTTPException(404, "Not found")
    db.delete(obj)
    db.commit()


@router.put("/meetings/{m_id}/minutes", response_model=MeetingMinutesResponse)
def upsert_meeting_minutes(
    m_id: int,
    payload: MeetingMinutesCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_hr),
):
    meeting = db.query(Meeting).filter(Meeting.id == m_id).first()
    if not meeting:
        raise HTTPException(404, "Meeting not found")
    mins = db.query(MeetingMinutes).filter(MeetingMinutes.meeting_id == m_id).first()
    if mins:
        mins.content = payload.content
        mins.action_items = payload.action_items
        mins.recorded_by_id = current_user.id
        mins.updated_at = datetime.utcnow()
    else:
        mins = MeetingMinutes(
            meeting_id=m_id, content=payload.content,
            action_items=payload.action_items, recorded_by_id=current_user.id,
        )
        db.add(mins)
    db.commit()
    db.refresh(mins)
    return db.query(MeetingMinutes).options(joinedload(MeetingMinutes.recorded_by)).filter(MeetingMinutes.id == mins.id).first()


# ── Document Categories ───────────────────────────────────────────────────────

@router.get("/document-categories", response_model=List[DocumentCategoryResponse])
def list_document_categories(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_hr),
):
    return db.query(DocumentCategory).order_by(DocumentCategory.name).all()


@router.post("/document-categories", response_model=DocumentCategoryResponse, status_code=201)
def create_document_category(
    payload: DocumentCategoryCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_hr),
):
    obj = DocumentCategory(**payload.model_dump())
    db.add(obj)
    db.commit()
    db.refresh(obj)
    return obj


@router.delete("/document-categories/{dc_id}", status_code=204)
def delete_document_category(
    dc_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_hr),
):
    obj = db.query(DocumentCategory).filter(DocumentCategory.id == dc_id).first()
    if not obj:
        raise HTTPException(404, "Not found")
    db.delete(obj)
    db.commit()


# ── Contract Types ────────────────────────────────────────────────────────────

@router.get("/contract-types", response_model=List[ContractTypeResponse])
def list_contract_types(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_hr),
):
    return db.query(ContractType).order_by(ContractType.name).all()


@router.post("/contract-types", response_model=ContractTypeResponse, status_code=201)
def create_contract_type(
    payload: ContractTypeCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_hr),
):
    obj = ContractType(**payload.model_dump())
    db.add(obj)
    db.commit()
    db.refresh(obj)
    return obj


@router.delete("/contract-types/{ct_id}", status_code=204)
def delete_contract_type(
    ct_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_hr),
):
    obj = db.query(ContractType).filter(ContractType.id == ct_id).first()
    if not obj:
        raise HTTPException(404, "Not found")
    db.delete(obj)
    db.commit()


# ── Document Templates ────────────────────────────────────────────────────────

@router.get("/document-templates", response_model=List[DocumentTemplateResponse])
def list_document_templates(
    category_id: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_hr),
):
    q = db.query(DocumentTemplate).options(
        joinedload(DocumentTemplate.category),
        joinedload(DocumentTemplate.created_by),
    )
    if category_id:
        q = q.filter(DocumentTemplate.category_id == category_id)
    return q.order_by(DocumentTemplate.name).all()


@router.post("/document-templates", response_model=DocumentTemplateResponse, status_code=201)
def create_document_template(
    payload: DocumentTemplateCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_hr),
):
    obj = DocumentTemplate(**payload.model_dump(), created_by_id=current_user.id)
    db.add(obj)
    db.commit()
    db.refresh(obj)
    return db.query(DocumentTemplate).options(
        joinedload(DocumentTemplate.category), joinedload(DocumentTemplate.created_by)
    ).filter(DocumentTemplate.id == obj.id).first()


@router.put("/document-templates/{dt_id}", response_model=DocumentTemplateResponse)
def update_document_template(
    dt_id: int,
    payload: DocumentTemplateUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_hr),
):
    obj = db.query(DocumentTemplate).filter(DocumentTemplate.id == dt_id).first()
    if not obj:
        raise HTTPException(404, "Not found")
    for k, v in payload.model_dump(exclude_none=True).items():
        setattr(obj, k, v)
    db.commit()
    return db.query(DocumentTemplate).options(
        joinedload(DocumentTemplate.category), joinedload(DocumentTemplate.created_by)
    ).filter(DocumentTemplate.id == dt_id).first()


@router.delete("/document-templates/{dt_id}", status_code=204)
def delete_document_template(
    dt_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_hr),
):
    obj = db.query(DocumentTemplate).filter(DocumentTemplate.id == dt_id).first()
    if not obj:
        raise HTTPException(404, "Not found")
    db.delete(obj)
    db.commit()


# ── Contract Templates ────────────────────────────────────────────────────────

@router.get("/contract-templates", response_model=List[ContractTemplateResponse])
def list_contract_templates(
    contract_type_id: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_hr),
):
    q = db.query(ContractTemplate).options(
        joinedload(ContractTemplate.contract_type),
        joinedload(ContractTemplate.created_by),
    )
    if contract_type_id:
        q = q.filter(ContractTemplate.contract_type_id == contract_type_id)
    return q.order_by(ContractTemplate.name).all()


@router.post("/contract-templates", response_model=ContractTemplateResponse, status_code=201)
def create_contract_template(
    payload: ContractTemplateCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_hr),
):
    obj = ContractTemplate(**payload.model_dump(), created_by_id=current_user.id)
    db.add(obj)
    db.commit()
    db.refresh(obj)
    return db.query(ContractTemplate).options(
        joinedload(ContractTemplate.contract_type), joinedload(ContractTemplate.created_by)
    ).filter(ContractTemplate.id == obj.id).first()


@router.put("/contract-templates/{ct_id}", response_model=ContractTemplateResponse)
def update_contract_template(
    ct_id: int,
    payload: ContractTemplateUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_hr),
):
    obj = db.query(ContractTemplate).filter(ContractTemplate.id == ct_id).first()
    if not obj:
        raise HTTPException(404, "Not found")
    for k, v in payload.model_dump(exclude_none=True).items():
        setattr(obj, k, v)
    db.commit()
    return db.query(ContractTemplate).options(
        joinedload(ContractTemplate.contract_type), joinedload(ContractTemplate.created_by)
    ).filter(ContractTemplate.id == ct_id).first()


@router.delete("/contract-templates/{ct_id}", status_code=204)
def delete_contract_template(
    ct_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_hr),
):
    obj = db.query(ContractTemplate).filter(ContractTemplate.id == ct_id).first()
    if not obj:
        raise HTTPException(404, "Not found")
    db.delete(obj)
    db.commit()


# ── Employee Documents ────────────────────────────────────────────────────────

def _doc_query(db: Session):
    return db.query(EmployeeDocument).options(
        joinedload(EmployeeDocument.user),
        joinedload(EmployeeDocument.category),
        joinedload(EmployeeDocument.uploaded_by),
    )


@router.get("/employee-documents", response_model=dict)
def list_employee_documents(
    user_id: Optional[int] = None,
    category_id: Optional[int] = None,
    skip: int = 0,
    limit: int = 50,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_hr),
):
    q = _doc_query(db)
    if user_id:
        q = q.filter(EmployeeDocument.user_id == user_id)
    if category_id:
        q = q.filter(EmployeeDocument.category_id == category_id)
    total = q.count()
    items = q.order_by(desc(EmployeeDocument.created_at)).offset(skip).limit(limit).all()
    return {"total": total, "items": items}


@router.post("/employee-documents", response_model=EmployeeDocumentResponse, status_code=201)
def create_employee_document(
    payload: EmployeeDocumentCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_hr),
):
    obj = EmployeeDocument(**payload.model_dump(), uploaded_by_id=current_user.id)
    db.add(obj)
    db.commit()
    db.refresh(obj)
    return _doc_query(db).filter(EmployeeDocument.id == obj.id).first()


@router.put("/employee-documents/{ed_id}", response_model=EmployeeDocumentResponse)
def update_employee_document(
    ed_id: int,
    payload: EmployeeDocumentUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_hr),
):
    obj = db.query(EmployeeDocument).filter(EmployeeDocument.id == ed_id).first()
    if not obj:
        raise HTTPException(404, "Not found")
    for k, v in payload.model_dump(exclude_none=True).items():
        setattr(obj, k, v)
    db.commit()
    return _doc_query(db).filter(EmployeeDocument.id == ed_id).first()


@router.delete("/employee-documents/{ed_id}", status_code=204)
def delete_employee_document(
    ed_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_hr),
):
    obj = db.query(EmployeeDocument).filter(EmployeeDocument.id == ed_id).first()
    if not obj:
        raise HTTPException(404, "Not found")
    db.delete(obj)
    db.commit()


# ── Employee Contracts ────────────────────────────────────────────────────────

def _contract_query(db: Session):
    return db.query(EmployeeContract).options(
        joinedload(EmployeeContract.user),
        joinedload(EmployeeContract.contract_type),
    )


@router.get("/employee-contracts", response_model=dict)
def list_employee_contracts(
    user_id: Optional[int] = None,
    skip: int = 0,
    limit: int = 50,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_hr),
):
    q = _contract_query(db)
    if user_id:
        q = q.filter(EmployeeContract.user_id == user_id)
    total = q.count()
    items = q.order_by(desc(EmployeeContract.created_at)).offset(skip).limit(limit).all()
    return {"total": total, "items": items}


@router.post("/employee-contracts", response_model=EmployeeContractResponse, status_code=201)
def create_employee_contract(
    payload: EmployeeContractCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_hr),
):
    obj = EmployeeContract(**payload.model_dump())
    db.add(obj)
    db.commit()
    db.refresh(obj)
    return _contract_query(db).filter(EmployeeContract.id == obj.id).first()


@router.put("/employee-contracts/{ec_id}", response_model=EmployeeContractResponse)
def update_employee_contract(
    ec_id: int,
    payload: EmployeeContractUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_hr),
):
    obj = db.query(EmployeeContract).filter(EmployeeContract.id == ec_id).first()
    if not obj:
        raise HTTPException(404, "Not found")
    for k, v in payload.model_dump(exclude_none=True).items():
        setattr(obj, k, v)
    db.commit()
    return _contract_query(db).filter(EmployeeContract.id == ec_id).first()


@router.delete("/employee-contracts/{ec_id}", status_code=204)
def delete_employee_contract(
    ec_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_hr),
):
    obj = db.query(EmployeeContract).filter(EmployeeContract.id == ec_id).first()
    if not obj:
        raise HTTPException(404, "Not found")
    db.delete(obj)
    db.commit()


# ── Acknowledgments ───────────────────────────────────────────────────────────

@router.get("/acknowledgments", response_model=dict)
def list_acknowledgments(
    document_id: Optional[int] = None,
    user_id: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_hr),
):
    q = db.query(EmployeeAcknowledgment).options(joinedload(EmployeeAcknowledgment.user))
    if document_id:
        q = q.filter(EmployeeAcknowledgment.document_id == document_id)
    if user_id:
        q = q.filter(EmployeeAcknowledgment.user_id == user_id)
    total = q.count()
    items = q.order_by(desc(EmployeeAcknowledgment.acknowledged_at)).all()
    return {"total": total, "items": items}


@router.post("/acknowledgments", response_model=EmployeeAcknowledgmentResponse, status_code=201)
def create_acknowledgment(
    payload: EmployeeAcknowledgmentCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    obj = EmployeeAcknowledgment(**payload.model_dump(), user_id=current_user.id)
    db.add(obj)
    db.commit()
    db.refresh(obj)
    return db.query(EmployeeAcknowledgment).options(joinedload(EmployeeAcknowledgment.user)).filter(EmployeeAcknowledgment.id == obj.id).first()


# ── Timesheets ────────────────────────────────────────────────────────────────

def _timesheet_query(db: Session):
    return db.query(Timesheet).options(
        joinedload(Timesheet.user),
        joinedload(Timesheet.reviewed_by),
    )


@router.post("/timesheets/generate", response_model=dict)
def generate_timesheets(
    payload: GenerateTimesheetRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_hr),
):
    """Auto-generate timesheet entries from attendance events for a given month."""
    from calendar import monthrange
    from app.models.attendance import AttendanceEvent, AttendanceEventType

    year, month = payload.year, payload.month
    _, days_in_month = monthrange(year, month)
    month_start = date(year, month, 1)
    month_end = date(year, month, days_in_month)
    today = date.today()

    # Employees to process
    emp_q = db.query(User).filter(User.is_active == True)
    if payload.user_id:
        emp_q = emp_q.filter(User.id == payload.user_id)
    employees = emp_q.all()

    # Holiday dates this month
    holiday_dates = {h.date for h in db.query(Holiday).filter(
        Holiday.date >= month_start, Holiday.date <= month_end,
    ).all()}

    # Approved leaves this month
    approved_leaves = db.query(LeaveRequest).filter(
        LeaveRequest.status == LeaveRequestStatus.APPROVED,
        LeaveRequest.start_date <= month_end,
        LeaveRequest.end_date >= month_start,
    ).all()

    created = updated = 0

    def _to_local(dt_utc: datetime, tz_str: str) -> datetime:
        try:
            from zoneinfo import ZoneInfo
            return dt_utc.replace(tzinfo=ZoneInfo("UTC")).astimezone(ZoneInfo(tz_str))
        except Exception:
            return dt_utc

    def _check_late(check_in_utc: datetime, policy: "AttendancePolicy") -> tuple:
        if not policy or not policy.shift_start_time:
            return False, 0.0
        local_in = _to_local(check_in_utc, policy.timezone or "UTC")
        h, m = map(int, policy.shift_start_time.split(":"))
        shift_start = local_in.replace(hour=h, minute=m, second=0, microsecond=0)
        deadline = shift_start + timedelta(minutes=policy.late_arrival_grace_minutes or 0)
        if local_in > deadline:
            return True, round((local_in - deadline).total_seconds() / 60, 1)
        return False, 0.0

    def _check_early_departure(check_out_utc: datetime, policy: "AttendancePolicy") -> tuple:
        if not policy or not policy.shift_end_time:
            return False, 0.0
        local_out = _to_local(check_out_utc, policy.timezone or "UTC")
        h, m = map(int, policy.shift_end_time.split(":"))
        shift_end = local_out.replace(hour=h, minute=m, second=0, microsecond=0)
        # Handle overnight shift (end time < start time means next-day end)
        if policy.shift_start_time:
            sh, sm = map(int, policy.shift_start_time.split(":"))
            if (h * 60 + m) < (sh * 60 + sm):
                shift_end += timedelta(days=1)
        grace = timedelta(minutes=policy.early_departure_grace_minutes or 0)
        if local_out < (shift_end - grace):
            return True, round((shift_end - local_out).total_seconds() / 60, 1)
        return False, 0.0

    def _count_consecutive_late(db: Session, user_id: int, before_date: date) -> int:
        """Count how many consecutive working days before `before_date` were late."""
        count = 0
        d = before_date - timedelta(days=1)
        for _ in range(10):  # look back max 10 days
            if d.weekday() >= 5:
                d -= timedelta(days=1)
                continue
            ts = db.query(Timesheet).filter(
                Timesheet.user_id == user_id,
                Timesheet.work_date == d,
            ).first()
            if ts and ts.is_late:
                count += 1
                d -= timedelta(days=1)
            else:
                break
        return count

    # One globally-assigned policy applies to all employees
    global_policy = db.query(AttendancePolicy).filter(
        AttendancePolicy.is_default == True,
        AttendancePolicy.is_active == True,
    ).first()

    for emp in employees:
        # Daily rate
        config = db.query(PayrollConfig).filter(
            PayrollConfig.user_id == emp.id,
            PayrollConfig.effective_from <= month_end,
        ).order_by(desc(PayrollConfig.effective_from)).first()
        if config:
            if config.hourly_rate and float(config.hourly_rate) > 0:
                daily_rate = float(config.hourly_rate) * 8
            elif config.base_salary and float(config.base_salary) > 0:
                daily_rate = float(config.base_salary) / 22
            else:
                daily_rate = 0.0
        else:
            daily_rate = 0.0

        # Per-employee assignment overrides the global default
        assignment = db.query(EmployeePolicyAssignment).filter(
            EmployeePolicyAssignment.user_id == emp.id
        ).first()
        policy = assignment.policy if assignment else global_policy

        # Attendance events — fetch extra day on each side for overnight shifts
        raw_events = db.query(AttendanceEvent).filter(
            AttendanceEvent.user_id == emp.id,
            AttendanceEvent.event_time >= datetime.combine(month_start - timedelta(days=1), datetime.min.time()),
            AttendanceEvent.event_time < datetime.combine(month_end + timedelta(days=2), datetime.min.time()),
        ).all()

        # Group by UTC date (or local date if policy timezone known)
        events_by_date: dict[date, list] = {}
        for evt in raw_events:
            if policy and policy.timezone:
                d = _to_local(evt.event_time, policy.timezone).date()
            else:
                d = evt.event_time.date()
            events_by_date.setdefault(d, []).append(evt)

        # Leave dates
        leave_dates: set[date] = set()
        for lr in approved_leaves:
            if lr.user_id != emp.id:
                continue
            d = lr.start_date
            while d <= lr.end_date:
                if month_start <= d <= month_end:
                    leave_dates.add(d)
                d += timedelta(days=1)

        for day_num in range(1, days_in_month + 1):
            work_date = date(year, month, day_num)
            if work_date.weekday() >= 5:
                continue
            if work_date > today:
                continue

            is_late = False
            late_min = 0.0
            is_early_dep = False
            early_dep_min = 0.0
            policy_deduction = 0.0
            deduction_reason = None

            if work_date in holiday_dates:
                day_status = DayStatus.HOLIDAY
                hours_worked = 0.0
                wage = 0.0
            elif work_date in leave_dates:
                day_status = DayStatus.ON_LEAVE
                hours_worked = 0.0
                wage = 0.0
            else:
                day_events = events_by_date.get(work_date, [])
                ins  = [e for e in day_events if e.event_type == AttendanceEventType.CHECK_IN]
                outs = [e for e in day_events if e.event_type == AttendanceEventType.CHECK_OUT]
                bks  = [e for e in day_events if e.event_type == AttendanceEventType.BREAK_START]
                bke  = [e for e in day_events if e.event_type == AttendanceEventType.BREAK_END]

                if not ins or not outs:
                    day_status = DayStatus.ABSENT
                    hours_worked = 0.0
                    wage = 0.0
                else:
                    first_in = min(e.event_time for e in ins)
                    last_out = max(e.event_time for e in outs)
                    gross_h  = (last_out - first_in).total_seconds() / 3600
                    break_h  = 0.0
                    if bks and bke:
                        break_h = (max(e.event_time for e in bke) - min(e.event_time for e in bks)).total_seconds() / 3600
                    hours_worked = round(max(gross_h - break_h, 0), 2)

                    if gross_h >= 9:
                        day_status = DayStatus.FULL_DAY
                        wage = daily_rate
                    elif gross_h > 4:
                        day_status = DayStatus.EARLY_LEAVE
                        wage = daily_rate
                    else:
                        day_status = DayStatus.HALF_DAY
                        wage = daily_rate * 0.5

                    # Policy checks
                    if policy:
                        is_late, late_min = _check_late(first_in, policy)
                        is_early_dep, early_dep_min = _check_early_departure(last_out, policy)

                        # Consecutive late strike
                        if is_late:
                            consecutive = _count_consecutive_late(db, emp.id, work_date)
                            limit = policy.consecutive_late_limit or 3
                            if (consecutive + 1) >= limit:
                                action = policy.late_strike_action or "none"
                                if action == "full_day":
                                    policy_deduction = daily_rate
                                elif action == "half_day":
                                    policy_deduction = daily_rate * 0.5
                                # action == "none" → flagged only, no deduction
                                if policy_deduction > 0:
                                    deduction_reason = (
                                        f"Policy '{policy.name}': {consecutive + 1} consecutive "
                                        f"late arrivals (limit {limit})"
                                    )

            net_wage = max(0, wage - policy_deduction)

            existing = db.query(Timesheet).filter(
                Timesheet.user_id == emp.id,
                Timesheet.work_date == work_date,
            ).first()

            ts_data = dict(
                day_status=day_status, hours_worked=hours_worked, hours=hours_worked,
                daily_wage_earned=net_wage, policy_id=policy.id if policy else None,
                is_late=is_late, late_minutes=late_min,
                is_early_departure=is_early_dep, early_departure_minutes=early_dep_min,
                policy_deduction=policy_deduction, deduction_reason=deduction_reason,
            )

            if existing:
                for k, v in ts_data.items():
                    setattr(existing, k, v)
                updated += 1
            else:
                db.add(Timesheet(
                    user_id=emp.id, work_date=work_date,
                    status=TimesheetStatus.DRAFT, **ts_data,
                ))
                created += 1

    db.commit()
    return {"created": created, "updated": updated}


@router.get("/timesheets", response_model=dict)
def list_timesheets(
    user_id: Optional[int] = None,
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    status: Optional[TimesheetStatus] = None,
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_hr),
):
    q = _timesheet_query(db)
    if user_id:
        q = q.filter(Timesheet.user_id == user_id)
    if date_from:
        q = q.filter(Timesheet.work_date >= date_from)
    if date_to:
        q = q.filter(Timesheet.work_date <= date_to)
    if status:
        q = q.filter(Timesheet.status == status)
    total = q.count()
    items = q.order_by(desc(Timesheet.work_date)).offset(skip).limit(limit).all()
    return {"total": total, "items": items}


@router.post("/timesheets", response_model=TimesheetResponse, status_code=201)
def create_timesheet(
    payload: TimesheetCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_hr),
):
    data = payload.model_dump()
    if data.get("status") == TimesheetStatus.SUBMITTED:
        data["submitted_at"] = datetime.utcnow()
    obj = Timesheet(**data)
    db.add(obj)
    db.commit()
    db.refresh(obj)
    return _timesheet_query(db).filter(Timesheet.id == obj.id).first()


@router.put("/timesheets/{ts_id}", response_model=TimesheetResponse)
def update_timesheet(
    ts_id: int,
    payload: TimesheetUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_hr),
):
    obj = db.query(Timesheet).filter(Timesheet.id == ts_id).first()
    if not obj:
        raise HTTPException(404, "Timesheet not found")
    data = payload.model_dump(exclude_none=True)
    if data.get("status") == TimesheetStatus.SUBMITTED and not obj.submitted_at:
        data["submitted_at"] = datetime.utcnow()
    if data.get("status") in (TimesheetStatus.APPROVED, TimesheetStatus.REJECTED):
        data["reviewed_by_id"] = current_user.id
        data["reviewed_at"] = datetime.utcnow()
    for k, v in data.items():
        setattr(obj, k, v)
    db.commit()
    return _timesheet_query(db).filter(Timesheet.id == ts_id).first()


@router.delete("/timesheets/{ts_id}", status_code=204)
def delete_timesheet(
    ts_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_hr),
):
    obj = db.query(Timesheet).filter(Timesheet.id == ts_id).first()
    if not obj:
        raise HTTPException(404, "Not found")
    db.delete(obj)
    db.commit()


# ── Employee Self-Service Timesheets ──────────────────────────────────────────

@router.get("/my-timesheets", response_model=dict)
def list_my_timesheets(
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    status: Optional[TimesheetStatus] = None,
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    q = _timesheet_query(db).filter(
        Timesheet.user_id == current_user.id,
        Timesheet.source == "manual",
    )
    if date_from:
        q = q.filter(Timesheet.work_date >= date_from)
    if date_to:
        q = q.filter(Timesheet.work_date <= date_to)
    if status:
        q = q.filter(Timesheet.status == status)
    total = q.count()
    items = q.order_by(desc(Timesheet.work_date)).offset(skip).limit(limit).all()
    return {"total": total, "items": items}


@router.post("/my-timesheets", response_model=TimesheetResponse, status_code=201)
def create_my_timesheet(
    payload: MyTimesheetCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    obj = Timesheet(
        user_id=current_user.id,
        source="manual",
        status=TimesheetStatus.DRAFT,
        **payload.model_dump(),
    )
    db.add(obj)
    db.commit()
    db.refresh(obj)
    return _timesheet_query(db).filter(Timesheet.id == obj.id).first()


@router.put("/my-timesheets/{ts_id}", response_model=TimesheetResponse)
def update_my_timesheet(
    ts_id: int,
    payload: MyTimesheetUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    obj = db.query(Timesheet).filter(
        Timesheet.id == ts_id,
        Timesheet.user_id == current_user.id,
        Timesheet.source == "manual",
    ).first()
    if not obj:
        raise HTTPException(404, "Not found")
    if obj.status != TimesheetStatus.DRAFT:
        raise HTTPException(400, "Only draft timesheets can be edited")
    for k, v in payload.model_dump(exclude_none=True).items():
        setattr(obj, k, v)
    db.commit()
    return _timesheet_query(db).filter(Timesheet.id == ts_id).first()


@router.delete("/my-timesheets/{ts_id}", status_code=204)
def delete_my_timesheet(
    ts_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    obj = db.query(Timesheet).filter(
        Timesheet.id == ts_id,
        Timesheet.user_id == current_user.id,
        Timesheet.source == "manual",
    ).first()
    if not obj:
        raise HTTPException(404, "Not found")
    if obj.status not in (TimesheetStatus.DRAFT, TimesheetStatus.REJECTED):
        raise HTTPException(400, "Cannot delete a submitted or approved timesheet")
    db.delete(obj)
    db.commit()


@router.post("/my-timesheets/{ts_id}/submit", response_model=TimesheetResponse)
def submit_my_timesheet(
    ts_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    obj = db.query(Timesheet).filter(
        Timesheet.id == ts_id,
        Timesheet.user_id == current_user.id,
        Timesheet.source == "manual",
    ).first()
    if not obj:
        raise HTTPException(404, "Not found")
    if obj.status != TimesheetStatus.DRAFT:
        raise HTTPException(400, "Only draft timesheets can be submitted")
    obj.status = TimesheetStatus.SUBMITTED
    obj.submitted_at = datetime.utcnow()
    db.commit()
    return _timesheet_query(db).filter(Timesheet.id == ts_id).first()


# ── HR Review of Employee Submissions ─────────────────────────────────────────

@router.get("/employee-submissions", response_model=dict)
def list_employee_submissions(
    user_id: Optional[int] = None,
    status: Optional[TimesheetStatus] = None,
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_hr),
):
    q = _timesheet_query(db).filter(Timesheet.source == "manual")
    if user_id:
        q = q.filter(Timesheet.user_id == user_id)
    if status:
        q = q.filter(Timesheet.status == status)
    if date_from:
        q = q.filter(Timesheet.work_date >= date_from)
    if date_to:
        q = q.filter(Timesheet.work_date <= date_to)
    total = q.count()
    items = q.order_by(desc(Timesheet.submitted_at)).offset(skip).limit(limit).all()
    return {"total": total, "items": items}


@router.post("/employee-submissions/{ts_id}/review", response_model=TimesheetResponse)
def review_employee_submission(
    ts_id: int,
    payload: TimesheetReview,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_hr),
):
    obj = db.query(Timesheet).filter(
        Timesheet.id == ts_id,
        Timesheet.source == "manual",
    ).first()
    if not obj:
        raise HTTPException(404, "Not found")
    if obj.status != TimesheetStatus.SUBMITTED:
        raise HTTPException(400, "Only submitted timesheets can be reviewed")
    if payload.status not in (TimesheetStatus.APPROVED, TimesheetStatus.REJECTED):
        raise HTTPException(400, "Status must be approved or rejected")
    obj.status = payload.status
    obj.review_notes = payload.review_notes
    obj.reviewed_by_id = current_user.id
    obj.reviewed_at = datetime.utcnow()
    db.commit()
    return _timesheet_query(db).filter(Timesheet.id == ts_id).first()
