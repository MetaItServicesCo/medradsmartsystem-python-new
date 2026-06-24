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
