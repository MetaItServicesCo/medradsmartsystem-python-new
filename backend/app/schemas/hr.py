"""Pydantic schemas for the HR module."""

from datetime import date, datetime
from decimal import Decimal
from typing import Any, List, Optional

from pydantic import BaseModel, EmailStr

from app.models.hr import (
    AnnouncementPriority, CandidateStatus, ContractStatus, HolidayType,
    JobOpeningStatus, LeaveRequestStatus, MeetingStatus, OfferStatus,
    PayFrequency, PayrollRunStatus, RSVPStatus, ResignationStatus, TerminationType,
    TimesheetStatus,
)


# ── Shared ────────────────────────────────────────────────────────────────────

class UserMini(BaseModel):
    id: int
    full_name: str
    email: str
    role: str
    avatar_url: Optional[str] = None
    model_config = {"from_attributes": True}


# ── Leave Types ───────────────────────────────────────────────────────────────

class LeaveTypeCreate(BaseModel):
    name: str
    description: Optional[str] = None
    max_days_per_year: int = 0
    is_paid: bool = True
    carry_forward_days: int = 0
    color: str = "#7C3AED"
    is_active: bool = True

class LeaveTypeUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    max_days_per_year: Optional[int] = None
    is_paid: Optional[bool] = None
    carry_forward_days: Optional[int] = None
    color: Optional[str] = None
    is_active: Optional[bool] = None

class LeaveTypeResponse(BaseModel):
    id: int
    name: str
    description: Optional[str]
    max_days_per_year: int
    is_paid: bool
    carry_forward_days: int
    color: str
    is_active: bool
    created_at: datetime
    updated_at: datetime
    model_config = {"from_attributes": True}


# ── Leave Policies ────────────────────────────────────────────────────────────

class LeavePolicyCreate(BaseModel):
    name: str
    description: Optional[str] = None
    leave_type_id: int
    days_allowed: int = 0
    applicable_roles: Optional[List[str]] = None
    is_active: bool = True

class LeavePolicyUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    days_allowed: Optional[int] = None
    applicable_roles: Optional[List[str]] = None
    is_active: Optional[bool] = None

class LeavePolicyResponse(BaseModel):
    id: int
    name: str
    description: Optional[str]
    leave_type_id: int
    days_allowed: int
    applicable_roles: Optional[List[str]]
    is_active: bool
    created_at: datetime
    updated_at: datetime
    leave_type: Optional[LeaveTypeResponse] = None
    model_config = {"from_attributes": True}


# ── Leave Requests ────────────────────────────────────────────────────────────

class LeaveRequestCreate(BaseModel):
    leave_type_id: int
    start_date: date
    end_date: date
    reason: Optional[str] = None

class LeaveRequestUpdate(BaseModel):
    status: Optional[LeaveRequestStatus] = None
    comments: Optional[str] = None
    approved_by_id: Optional[int] = None

class LeaveRequestResponse(BaseModel):
    id: int
    user_id: int
    leave_type_id: Optional[int]
    start_date: date
    end_date: date
    total_days: float
    reason: Optional[str]
    status: LeaveRequestStatus
    approved_by_id: Optional[int]
    approved_at: Optional[datetime]
    comments: Optional[str]
    created_at: datetime
    updated_at: datetime
    user: Optional[UserMini] = None
    leave_type: Optional[LeaveTypeResponse] = None
    approved_by: Optional[UserMini] = None
    model_config = {"from_attributes": True}


# ── Attendance Policy ─────────────────────────────────────────────────────────

class AttendancePolicyCreate(BaseModel):
    name: str
    description: Optional[str] = None
    work_hours_per_day: float = 8.0
    work_days_per_week: int = 5
    overtime_threshold: float = 8.0
    grace_period_minutes: int = 15
    is_default: bool = False
    applicable_roles: Optional[List[str]] = None

class AttendancePolicyUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    work_hours_per_day: Optional[float] = None
    work_days_per_week: Optional[int] = None
    overtime_threshold: Optional[float] = None
    grace_period_minutes: Optional[int] = None
    is_default: Optional[bool] = None
    applicable_roles: Optional[List[str]] = None

class AttendancePolicyResponse(BaseModel):
    id: int
    name: str
    description: Optional[str]
    work_hours_per_day: float
    work_days_per_week: int
    overtime_threshold: float
    grace_period_minutes: int
    is_default: bool
    applicable_roles: Optional[List[str]]
    created_at: datetime
    updated_at: datetime
    model_config = {"from_attributes": True}


# ── Holidays ──────────────────────────────────────────────────────────────────

class HolidayCreate(BaseModel):
    name: str
    date: date
    description: Optional[str] = None
    type: HolidayType = HolidayType.PUBLIC
    is_recurring: bool = False

class HolidayUpdate(BaseModel):
    name: Optional[str] = None
    date: Optional[date] = None
    description: Optional[str] = None
    type: Optional[HolidayType] = None
    is_recurring: Optional[bool] = None

class HolidayResponse(BaseModel):
    id: int
    name: str
    date: date
    description: Optional[str]
    type: HolidayType
    is_recurring: bool
    created_by_id: Optional[int]
    created_at: datetime
    updated_at: datetime
    created_by: Optional[UserMini] = None
    model_config = {"from_attributes": True}


# ── Announcements ─────────────────────────────────────────────────────────────

class AnnouncementCreate(BaseModel):
    title: str
    content: str
    priority: AnnouncementPriority = AnnouncementPriority.NORMAL
    published_at: Optional[datetime] = None
    expires_at: Optional[datetime] = None
    is_pinned: bool = False
    target_audience: Optional[List[str]] = None

class AnnouncementUpdate(BaseModel):
    title: Optional[str] = None
    content: Optional[str] = None
    priority: Optional[AnnouncementPriority] = None
    published_at: Optional[datetime] = None
    expires_at: Optional[datetime] = None
    is_pinned: Optional[bool] = None
    target_audience: Optional[List[str]] = None

class AnnouncementResponse(BaseModel):
    id: int
    title: str
    content: str
    priority: AnnouncementPriority
    author_id: Optional[int]
    published_at: Optional[datetime]
    expires_at: Optional[datetime]
    is_pinned: bool
    target_audience: Optional[List[str]]
    created_at: datetime
    updated_at: datetime
    author: Optional[UserMini] = None
    model_config = {"from_attributes": True}


# ── Recruitment ───────────────────────────────────────────────────────────────

class JobOpeningCreate(BaseModel):
    title: str
    department: Optional[str] = None
    description: Optional[str] = None
    requirements: Optional[str] = None
    location: Optional[str] = None
    employment_type: Optional[str] = None
    salary_min: Optional[Decimal] = None
    salary_max: Optional[Decimal] = None
    status: JobOpeningStatus = JobOpeningStatus.DRAFT
    closes_at: Optional[date] = None

class JobOpeningUpdate(BaseModel):
    title: Optional[str] = None
    department: Optional[str] = None
    description: Optional[str] = None
    requirements: Optional[str] = None
    location: Optional[str] = None
    employment_type: Optional[str] = None
    salary_min: Optional[Decimal] = None
    salary_max: Optional[Decimal] = None
    status: Optional[JobOpeningStatus] = None
    closes_at: Optional[date] = None

class JobOpeningResponse(BaseModel):
    id: int
    title: str
    department: Optional[str]
    description: Optional[str]
    requirements: Optional[str]
    location: Optional[str]
    employment_type: Optional[str]
    salary_min: Optional[Decimal]
    salary_max: Optional[Decimal]
    status: JobOpeningStatus
    created_by_id: Optional[int]
    posted_at: Optional[datetime]
    closes_at: Optional[date]
    created_at: datetime
    updated_at: datetime
    created_by: Optional[UserMini] = None
    candidate_count: int = 0
    model_config = {"from_attributes": True}


class CandidateCreate(BaseModel):
    job_opening_id: int
    first_name: str
    last_name: str
    email: str
    phone: Optional[str] = None
    resume_url: Optional[str] = None
    notes: Optional[str] = None

class CandidateUpdate(BaseModel):
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    resume_url: Optional[str] = None
    status: Optional[CandidateStatus] = None
    rating: Optional[int] = None
    notes: Optional[str] = None

class CandidateResponse(BaseModel):
    id: int
    job_opening_id: int
    first_name: str
    last_name: str
    email: str
    phone: Optional[str]
    resume_url: Optional[str]
    status: CandidateStatus
    applied_at: datetime
    rating: Optional[int]
    notes: Optional[str]
    created_at: datetime
    updated_at: datetime
    model_config = {"from_attributes": True}


class JobOfferCreate(BaseModel):
    candidate_id: int
    job_opening_id: Optional[int] = None
    salary: Optional[Decimal] = None
    start_date: Optional[date] = None
    expiry_date: Optional[date] = None
    notes: Optional[str] = None

class JobOfferUpdate(BaseModel):
    salary: Optional[Decimal] = None
    start_date: Optional[date] = None
    expiry_date: Optional[date] = None
    status: Optional[OfferStatus] = None
    notes: Optional[str] = None

class JobOfferResponse(BaseModel):
    id: int
    candidate_id: int
    job_opening_id: Optional[int]
    salary: Optional[Decimal]
    start_date: Optional[date]
    expiry_date: Optional[date]
    status: OfferStatus
    notes: Optional[str]
    created_at: datetime
    updated_at: datetime
    candidate: Optional[CandidateResponse] = None
    model_config = {"from_attributes": True}


class OnboardingChecklistItemCreate(BaseModel):
    title: str
    description: Optional[str] = None
    order_index: int = 0
    is_required: bool = True

class OnboardingChecklistCreate(BaseModel):
    name: str
    description: Optional[str] = None
    is_active: bool = True
    items: List[OnboardingChecklistItemCreate] = []

class OnboardingChecklistUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    is_active: Optional[bool] = None

class OnboardingChecklistItemResponse(BaseModel):
    id: int
    checklist_id: int
    title: str
    description: Optional[str]
    order_index: int
    is_required: bool
    model_config = {"from_attributes": True}

class OnboardingChecklistResponse(BaseModel):
    id: int
    name: str
    description: Optional[str]
    is_active: bool
    created_at: datetime
    updated_at: datetime
    items: List[OnboardingChecklistItemResponse] = []
    model_config = {"from_attributes": True}


# ── Employee Lifecycle ────────────────────────────────────────────────────────

class EmployeeAwardCreate(BaseModel):
    user_id: int
    title: str
    description: Optional[str] = None
    award_date: date
    category: Optional[str] = None
    amount: Optional[Decimal] = None

class EmployeeAwardUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    award_date: Optional[date] = None
    category: Optional[str] = None
    amount: Optional[Decimal] = None

class EmployeeAwardResponse(BaseModel):
    id: int
    user_id: int
    title: str
    description: Optional[str]
    award_date: date
    awarded_by_id: Optional[int]
    category: Optional[str]
    amount: Optional[Decimal]
    created_at: datetime
    user: Optional[UserMini] = None
    awarded_by: Optional[UserMini] = None
    model_config = {"from_attributes": True}


class EmployeePromotionCreate(BaseModel):
    user_id: int
    previous_title: Optional[str] = None
    new_title: str
    previous_salary: Optional[Decimal] = None
    new_salary: Optional[Decimal] = None
    effective_date: date
    reason: Optional[str] = None
    notes: Optional[str] = None

class EmployeePromotionUpdate(BaseModel):
    new_title: Optional[str] = None
    new_salary: Optional[Decimal] = None
    effective_date: Optional[date] = None
    reason: Optional[str] = None
    notes: Optional[str] = None

class EmployeePromotionResponse(BaseModel):
    id: int
    user_id: int
    previous_title: Optional[str]
    new_title: str
    previous_salary: Optional[Decimal]
    new_salary: Optional[Decimal]
    effective_date: date
    reason: Optional[str]
    approved_by_id: Optional[int]
    notes: Optional[str]
    created_at: datetime
    user: Optional[UserMini] = None
    approved_by: Optional[UserMini] = None
    model_config = {"from_attributes": True}


class EmployeeResignationCreate(BaseModel):
    user_id: int
    last_working_day: Optional[date] = None
    reason: Optional[str] = None

class EmployeeResignationUpdate(BaseModel):
    last_working_day: Optional[date] = None
    status: Optional[ResignationStatus] = None
    notes: Optional[str] = None

class EmployeeResignationResponse(BaseModel):
    id: int
    user_id: int
    submitted_at: datetime
    last_working_day: Optional[date]
    reason: Optional[str]
    status: ResignationStatus
    notes: Optional[str]
    processed_by_id: Optional[int]
    created_at: datetime
    user: Optional[UserMini] = None
    processed_by: Optional[UserMini] = None
    model_config = {"from_attributes": True}


class EmployeeTerminationCreate(BaseModel):
    user_id: int
    termination_date: date
    reason: Optional[str] = None
    termination_type: TerminationType = TerminationType.VOLUNTARY
    notes: Optional[str] = None

class EmployeeTerminationUpdate(BaseModel):
    termination_date: Optional[date] = None
    reason: Optional[str] = None
    termination_type: Optional[TerminationType] = None
    notes: Optional[str] = None

class EmployeeTerminationResponse(BaseModel):
    id: int
    user_id: int
    termination_date: date
    reason: Optional[str]
    termination_type: TerminationType
    notes: Optional[str]
    processed_by_id: Optional[int]
    created_at: datetime
    user: Optional[UserMini] = None
    processed_by: Optional[UserMini] = None
    model_config = {"from_attributes": True}


# ── Payroll ───────────────────────────────────────────────────────────────────

class TaxBracketCreate(BaseModel):
    name: str
    min_income: Decimal = Decimal("0")
    max_income: Optional[Decimal] = None
    rate: float
    effective_from: date
    effective_to: Optional[date] = None

class TaxBracketUpdate(BaseModel):
    name: Optional[str] = None
    min_income: Optional[Decimal] = None
    max_income: Optional[Decimal] = None
    rate: Optional[float] = None
    effective_from: Optional[date] = None
    effective_to: Optional[date] = None

class TaxBracketResponse(BaseModel):
    id: int
    name: str
    min_income: Decimal
    max_income: Optional[Decimal]
    rate: float
    effective_from: date
    effective_to: Optional[date]
    created_at: datetime
    updated_at: datetime
    model_config = {"from_attributes": True}


class PayrollConfigCreate(BaseModel):
    user_id: int
    base_salary: Decimal
    hourly_rate: Optional[Decimal] = None
    overtime_multiplier: float = 1.5
    pay_frequency: PayFrequency = PayFrequency.MONTHLY
    effective_from: date

class PayrollConfigUpdate(BaseModel):
    base_salary: Optional[Decimal] = None
    hourly_rate: Optional[Decimal] = None
    overtime_multiplier: Optional[float] = None
    pay_frequency: Optional[PayFrequency] = None
    effective_from: Optional[date] = None
    is_active: Optional[bool] = None

class PayrollConfigResponse(BaseModel):
    id: int
    user_id: int
    base_salary: Decimal
    hourly_rate: Optional[Decimal]
    overtime_multiplier: float
    pay_frequency: PayFrequency
    effective_from: date
    is_active: bool
    created_at: datetime
    updated_at: datetime
    user: Optional[UserMini] = None
    model_config = {"from_attributes": True}


class PayslipResponse(BaseModel):
    id: int
    payroll_run_id: int
    user_id: int
    gross_pay: Decimal
    tax_amount: Decimal
    deductions: Decimal
    net_pay: Decimal
    work_hours: float
    overtime_hours: float
    notes: Optional[str]
    created_at: datetime
    user: Optional[UserMini] = None
    model_config = {"from_attributes": True}


class PayrollRunCreate(BaseModel):
    period_start: date
    period_end: date
    notes: Optional[str] = None

class PayrollRunUpdate(BaseModel):
    status: Optional[PayrollRunStatus] = None
    notes: Optional[str] = None

class PayrollRunResponse(BaseModel):
    id: int
    period_start: date
    period_end: date
    status: PayrollRunStatus
    total_gross: Decimal
    total_net: Decimal
    total_tax: Decimal
    run_date: Optional[datetime]
    processed_by_id: Optional[int]
    notes: Optional[str]
    created_at: datetime
    updated_at: datetime
    processed_by: Optional[UserMini] = None
    payslips: List[PayslipResponse] = []
    model_config = {"from_attributes": True}


# ── Meetings ──────────────────────────────────────────────────────────────────

class MeetingAttendeeCreate(BaseModel):
    user_id: int
    rsvp_status: RSVPStatus = RSVPStatus.PENDING

class MeetingCreate(BaseModel):
    title: str
    description: Optional[str] = None
    scheduled_at: datetime
    duration_minutes: int = 60
    location: Optional[str] = None
    meeting_type: Optional[str] = None
    attendee_ids: List[int] = []

class MeetingUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    scheduled_at: Optional[datetime] = None
    duration_minutes: Optional[int] = None
    location: Optional[str] = None
    meeting_type: Optional[str] = None
    status: Optional[MeetingStatus] = None

class MeetingAttendeeResponse(BaseModel):
    id: int
    meeting_id: int
    user_id: int
    rsvp_status: RSVPStatus
    user: Optional[UserMini] = None
    model_config = {"from_attributes": True}

class MeetingMinutesCreate(BaseModel):
    content: str
    action_items: Optional[List[dict]] = None

class MeetingMinutesResponse(BaseModel):
    id: int
    meeting_id: int
    content: str
    action_items: Optional[List[dict]]
    recorded_by_id: Optional[int]
    recorded_at: datetime
    updated_at: datetime
    recorded_by: Optional[UserMini] = None
    model_config = {"from_attributes": True}

class MeetingResponse(BaseModel):
    id: int
    title: str
    description: Optional[str]
    scheduled_at: datetime
    duration_minutes: int
    location: Optional[str]
    meeting_type: Optional[str]
    organizer_id: Optional[int]
    status: MeetingStatus
    created_at: datetime
    updated_at: datetime
    organizer: Optional[UserMini] = None
    attendees: List[MeetingAttendeeResponse] = []
    minutes: Optional[MeetingMinutesResponse] = None
    model_config = {"from_attributes": True}


# ── Documents ─────────────────────────────────────────────────────────────────

class DocumentCategoryCreate(BaseModel):
    name: str
    description: Optional[str] = None
    color: str = "#2563EB"

class DocumentCategoryResponse(BaseModel):
    id: int
    name: str
    description: Optional[str]
    color: str
    created_at: datetime
    model_config = {"from_attributes": True}


class ContractTypeCreate(BaseModel):
    name: str
    description: Optional[str] = None

class ContractTypeResponse(BaseModel):
    id: int
    name: str
    description: Optional[str]
    created_at: datetime
    model_config = {"from_attributes": True}


class DocumentTemplateCreate(BaseModel):
    name: str
    description: Optional[str] = None
    category_id: Optional[int] = None
    content: str
    variables: Optional[List[str]] = None

class DocumentTemplateUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    category_id: Optional[int] = None
    content: Optional[str] = None
    variables: Optional[List[str]] = None

class DocumentTemplateResponse(BaseModel):
    id: int
    name: str
    description: Optional[str]
    category_id: Optional[int]
    content: str
    variables: Optional[List[str]]
    created_by_id: Optional[int]
    created_at: datetime
    updated_at: datetime
    category: Optional[DocumentCategoryResponse] = None
    created_by: Optional[UserMini] = None
    model_config = {"from_attributes": True}


class ContractTemplateCreate(BaseModel):
    name: str
    description: Optional[str] = None
    contract_type_id: Optional[int] = None
    content: str

class ContractTemplateUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    contract_type_id: Optional[int] = None
    content: Optional[str] = None

class ContractTemplateResponse(BaseModel):
    id: int
    name: str
    description: Optional[str]
    contract_type_id: Optional[int]
    content: str
    created_by_id: Optional[int]
    created_at: datetime
    updated_at: datetime
    contract_type: Optional[ContractTypeResponse] = None
    created_by: Optional[UserMini] = None
    model_config = {"from_attributes": True}


class EmployeeDocumentCreate(BaseModel):
    user_id: int
    category_id: Optional[int] = None
    title: str
    description: Optional[str] = None
    file_url: Optional[str] = None
    document_date: Optional[date] = None
    is_confidential: bool = False

class EmployeeDocumentUpdate(BaseModel):
    category_id: Optional[int] = None
    title: Optional[str] = None
    description: Optional[str] = None
    file_url: Optional[str] = None
    document_date: Optional[date] = None
    is_confidential: Optional[bool] = None

class EmployeeDocumentResponse(BaseModel):
    id: int
    user_id: int
    category_id: Optional[int]
    title: str
    description: Optional[str]
    file_url: Optional[str]
    document_date: Optional[date]
    is_confidential: bool
    uploaded_by_id: Optional[int]
    created_at: datetime
    updated_at: datetime
    user: Optional[UserMini] = None
    category: Optional[DocumentCategoryResponse] = None
    uploaded_by: Optional[UserMini] = None
    model_config = {"from_attributes": True}


class EmployeeContractCreate(BaseModel):
    user_id: int
    contract_type_id: Optional[int] = None
    title: str
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    file_url: Optional[str] = None
    notes: Optional[str] = None

class EmployeeContractUpdate(BaseModel):
    contract_type_id: Optional[int] = None
    title: Optional[str] = None
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    file_url: Optional[str] = None
    status: Optional[ContractStatus] = None
    notes: Optional[str] = None

class EmployeeContractResponse(BaseModel):
    id: int
    user_id: int
    contract_type_id: Optional[int]
    title: str
    start_date: Optional[date]
    end_date: Optional[date]
    file_url: Optional[str]
    status: ContractStatus
    notes: Optional[str]
    created_at: datetime
    updated_at: datetime
    user: Optional[UserMini] = None
    contract_type: Optional[ContractTypeResponse] = None
    model_config = {"from_attributes": True}


class EmployeeAcknowledgmentCreate(BaseModel):
    document_id: int
    notes: Optional[str] = None

class EmployeeAcknowledgmentResponse(BaseModel):
    id: int
    user_id: int
    document_id: int
    acknowledged_at: datetime
    notes: Optional[str]
    user: Optional[UserMini] = None
    model_config = {"from_attributes": True}


# ── Timesheets ────────────────────────────────────────────────────────────────

class TimesheetCreate(BaseModel):
    user_id: int
    work_date: date
    hours: float
    project: Optional[str] = None
    description: Optional[str] = None
    status: TimesheetStatus = TimesheetStatus.DRAFT

class TimesheetUpdate(BaseModel):
    work_date: Optional[date] = None
    hours: Optional[float] = None
    project: Optional[str] = None
    description: Optional[str] = None
    status: Optional[TimesheetStatus] = None
    review_notes: Optional[str] = None

class TimesheetResponse(BaseModel):
    id: int
    user_id: int
    work_date: date
    hours: float
    project: Optional[str]
    description: Optional[str]
    status: TimesheetStatus
    submitted_at: Optional[datetime]
    reviewed_by_id: Optional[int]
    reviewed_at: Optional[datetime]
    review_notes: Optional[str]
    created_at: datetime
    updated_at: datetime
    user: Optional[UserMini] = None
    reviewed_by: Optional[UserMini] = None
    model_config = {"from_attributes": True}


# ── Dashboard ─────────────────────────────────────────────────────────────────

class HRDashboardResponse(BaseModel):
    total_employees: int
    active_employees: int
    pending_leave_requests: int
    approved_leave_requests_this_month: int
    upcoming_holidays: int
    open_job_openings: int
    total_candidates: int
    upcoming_meetings: int
    payroll_runs_this_month: int
    pending_announcements: int
    recent_announcements: List[AnnouncementResponse] = []
    upcoming_holidays_list: List[HolidayResponse] = []
