"""HR module models — leave management, org structure, recruitment,
employee lifecycle, payroll, meetings, and documents."""

from datetime import date, datetime
import enum

from sqlalchemy import (
    Boolean, Column, Date, DateTime, Enum as SQLEnum,
    Float, ForeignKey, Integer, JSON, Numeric, String, Text,
)
from sqlalchemy.orm import relationship

from app.db.base import Base


# ── Enums ────────────────────────────────────────────────────────────────────

class LeaveRequestStatus(str, enum.Enum):
    PENDING   = "pending"
    APPROVED  = "approved"
    REJECTED  = "rejected"
    CANCELLED = "cancelled"

class HolidayType(str, enum.Enum):
    PUBLIC   = "public"
    COMPANY  = "company"
    OPTIONAL = "optional"

class AnnouncementPriority(str, enum.Enum):
    LOW    = "low"
    NORMAL = "normal"
    HIGH   = "high"
    URGENT = "urgent"

class JobOpeningStatus(str, enum.Enum):
    DRAFT      = "draft"
    OPEN       = "open"
    CLOSED     = "closed"
    ON_HOLD    = "on_hold"
    FILLED     = "filled"

class CandidateStatus(str, enum.Enum):
    APPLIED    = "applied"
    SCREENING  = "screening"
    INTERVIEW  = "interview"
    OFFERED    = "offered"
    HIRED      = "hired"
    REJECTED   = "rejected"
    WITHDRAWN  = "withdrawn"

class OfferStatus(str, enum.Enum):
    DRAFT     = "draft"
    SENT      = "sent"
    ACCEPTED  = "accepted"
    DECLINED  = "declined"
    EXPIRED   = "expired"

class ResignationStatus(str, enum.Enum):
    SUBMITTED = "submitted"
    ACCEPTED  = "accepted"
    REJECTED  = "rejected"
    WITHDRAWN = "withdrawn"

class TerminationType(str, enum.Enum):
    VOLUNTARY   = "voluntary"
    INVOLUNTARY = "involuntary"
    RETIREMENT  = "retirement"
    REDUNDANCY  = "redundancy"

class PayrollRunStatus(str, enum.Enum):
    DRAFT     = "draft"
    PROCESSED = "processed"
    APPROVED  = "approved"
    PAID      = "paid"

class PayFrequency(str, enum.Enum):
    WEEKLY     = "weekly"
    BIWEEKLY   = "biweekly"
    SEMIMONTHLY = "semimonthly"
    MONTHLY    = "monthly"

class MeetingStatus(str, enum.Enum):
    SCHEDULED  = "scheduled"
    IN_PROGRESS = "in_progress"
    COMPLETED  = "completed"
    CANCELLED  = "cancelled"

class ContractStatus(str, enum.Enum):
    DRAFT    = "draft"
    ACTIVE   = "active"
    EXPIRED  = "expired"
    TERMINATED = "terminated"

class RSVPStatus(str, enum.Enum):
    PENDING  = "pending"
    ACCEPTED = "accepted"
    DECLINED = "declined"
    TENTATIVE = "tentative"

class TimesheetStatus(str, enum.Enum):
    DRAFT     = "draft"
    SUBMITTED = "submitted"
    APPROVED  = "approved"
    REJECTED  = "rejected"

class DayStatus(str, enum.Enum):
    FULL_DAY    = "full_day"
    HALF_DAY    = "half_day"
    EARLY_LEAVE = "early_leave"
    ABSENT      = "absent"
    ON_LEAVE    = "on_leave"
    HOLIDAY     = "holiday"


# ── Leave Management ─────────────────────────────────────────────────────────

class LeaveType(Base):
    __tablename__ = "hr_leave_types"

    id                 = Column(Integer, primary_key=True, index=True)
    name               = Column(String, nullable=False, unique=True)
    description        = Column(Text, nullable=True)
    max_days_per_year  = Column(Integer, nullable=False, default=0)
    is_paid            = Column(Boolean, default=True, nullable=False)
    carry_forward_days = Column(Integer, default=0, nullable=False)
    color              = Column(String, default="#7C3AED", nullable=False)
    is_active          = Column(Boolean, default=True, nullable=False)
    created_at         = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at         = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    policies  = relationship("LeavePolicy", back_populates="leave_type", cascade="all, delete-orphan")
    requests  = relationship("LeaveRequest", back_populates="leave_type")


class LeavePolicy(Base):
    __tablename__ = "hr_leave_policies"

    id               = Column(Integer, primary_key=True, index=True)
    name             = Column(String, nullable=False)
    description      = Column(Text, nullable=True)
    leave_type_id    = Column(Integer, ForeignKey("hr_leave_types.id", ondelete="CASCADE"), nullable=False, index=True)
    days_allowed     = Column(Integer, nullable=False, default=0)
    applicable_roles = Column(JSON, nullable=True)  # list of role strings
    is_active        = Column(Boolean, default=True, nullable=False)
    created_at       = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at       = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    leave_type = relationship("LeaveType", back_populates="policies")


class LeaveRequest(Base):
    __tablename__ = "hr_leave_requests"

    id             = Column(Integer, primary_key=True, index=True)
    user_id        = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    leave_type_id  = Column(Integer, ForeignKey("hr_leave_types.id", ondelete="SET NULL"), nullable=True, index=True)
    start_date     = Column(Date, nullable=False)
    end_date       = Column(Date, nullable=False)
    total_days     = Column(Float, nullable=False, default=0)
    reason         = Column(Text, nullable=True)
    status         = Column(SQLEnum(LeaveRequestStatus), default=LeaveRequestStatus.PENDING, nullable=False, index=True)
    approved_by_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    approved_at    = Column(DateTime, nullable=True)
    comments       = Column(Text, nullable=True)
    created_at     = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at     = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    user        = relationship("User", foreign_keys=[user_id])
    leave_type  = relationship("LeaveType", back_populates="requests")
    approved_by = relationship("User", foreign_keys=[approved_by_id])


# ── Attendance Policies ───────────────────────────────────────────────────────

class AttendancePolicy(Base):
    __tablename__ = "hr_attendance_policies"

    id                     = Column(Integer, primary_key=True, index=True)
    name                   = Column(String, nullable=False)
    description            = Column(Text, nullable=True)
    work_hours_per_day     = Column(Float, default=8.0, nullable=False)
    work_days_per_week     = Column(Integer, default=5, nullable=False)
    overtime_threshold     = Column(Float, default=8.0, nullable=False)
    grace_period_minutes   = Column(Integer, default=15, nullable=False)
    is_default             = Column(Boolean, default=False, nullable=False)
    applicable_roles       = Column(JSON, nullable=True)
    created_at             = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at             = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)


# ── Organization Structure ───────────────────────────────────────────────────

class Holiday(Base):
    __tablename__ = "hr_holidays"

    id           = Column(Integer, primary_key=True, index=True)
    name         = Column(String, nullable=False)
    date         = Column(Date, nullable=False, index=True)
    description  = Column(Text, nullable=True)
    type         = Column(SQLEnum(HolidayType), default=HolidayType.PUBLIC, nullable=False)
    is_recurring = Column(Boolean, default=False, nullable=False)
    created_by_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at   = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at   = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    created_by = relationship("User", foreign_keys=[created_by_id])


class Announcement(Base):
    __tablename__ = "hr_announcements"

    id              = Column(Integer, primary_key=True, index=True)
    title           = Column(String, nullable=False)
    content         = Column(Text, nullable=False)
    priority        = Column(SQLEnum(AnnouncementPriority), default=AnnouncementPriority.NORMAL, nullable=False)
    author_id       = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    published_at    = Column(DateTime, nullable=True)
    expires_at      = Column(DateTime, nullable=True)
    is_pinned       = Column(Boolean, default=False, nullable=False)
    target_audience = Column(JSON, nullable=True)  # list of roles; null = everyone
    created_at      = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at      = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    author = relationship("User", foreign_keys=[author_id])


# ── Recruitment ───────────────────────────────────────────────────────────────

class JobOpening(Base):
    __tablename__ = "hr_job_openings"

    id             = Column(Integer, primary_key=True, index=True)
    title          = Column(String, nullable=False)
    department     = Column(String, nullable=True)
    description    = Column(Text, nullable=True)
    requirements   = Column(Text, nullable=True)
    location       = Column(String, nullable=True)
    employment_type = Column(String, nullable=True)  # full_time, part_time, contract
    salary_min     = Column(Numeric(12, 2), nullable=True)
    salary_max     = Column(Numeric(12, 2), nullable=True)
    status         = Column(SQLEnum(JobOpeningStatus), default=JobOpeningStatus.DRAFT, nullable=False, index=True)
    created_by_id  = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    posted_at      = Column(DateTime, nullable=True)
    closes_at      = Column(Date, nullable=True)
    created_at     = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at     = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    created_by = relationship("User", foreign_keys=[created_by_id])
    candidates = relationship("Candidate", back_populates="job_opening", cascade="all, delete-orphan")


class Candidate(Base):
    __tablename__ = "hr_candidates"

    id             = Column(Integer, primary_key=True, index=True)
    job_opening_id = Column(Integer, ForeignKey("hr_job_openings.id", ondelete="CASCADE"), nullable=False, index=True)
    first_name     = Column(String, nullable=False)
    last_name      = Column(String, nullable=False)
    email          = Column(String, nullable=False)
    phone          = Column(String, nullable=True)
    resume_url     = Column(String, nullable=True)
    status         = Column(SQLEnum(CandidateStatus), default=CandidateStatus.APPLIED, nullable=False, index=True)
    applied_at     = Column(DateTime, default=datetime.utcnow, nullable=False)
    rating         = Column(Integer, nullable=True)  # 1–5
    notes          = Column(Text, nullable=True)
    created_at     = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at     = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    job_opening = relationship("JobOpening", back_populates="candidates")
    offer       = relationship("JobOffer", back_populates="candidate", uselist=False, cascade="all, delete-orphan")


class JobOffer(Base):
    __tablename__ = "hr_job_offers"

    id             = Column(Integer, primary_key=True, index=True)
    candidate_id   = Column(Integer, ForeignKey("hr_candidates.id", ondelete="CASCADE"), nullable=False, index=True)
    job_opening_id = Column(Integer, ForeignKey("hr_job_openings.id", ondelete="SET NULL"), nullable=True)
    salary         = Column(Numeric(12, 2), nullable=True)
    start_date     = Column(Date, nullable=True)
    expiry_date    = Column(Date, nullable=True)
    status         = Column(SQLEnum(OfferStatus), default=OfferStatus.DRAFT, nullable=False, index=True)
    notes          = Column(Text, nullable=True)
    created_at     = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at     = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    candidate   = relationship("Candidate", back_populates="offer")


class OnboardingChecklist(Base):
    __tablename__ = "hr_onboarding_checklists"

    id          = Column(Integer, primary_key=True, index=True)
    name        = Column(String, nullable=False)
    description = Column(Text, nullable=True)
    is_active   = Column(Boolean, default=True, nullable=False)
    created_at  = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at  = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    items = relationship("OnboardingChecklistItem", back_populates="checklist",
                         order_by="OnboardingChecklistItem.order_index",
                         cascade="all, delete-orphan")


class OnboardingChecklistItem(Base):
    __tablename__ = "hr_onboarding_checklist_items"

    id           = Column(Integer, primary_key=True, index=True)
    checklist_id = Column(Integer, ForeignKey("hr_onboarding_checklists.id", ondelete="CASCADE"), nullable=False, index=True)
    title        = Column(String, nullable=False)
    description  = Column(Text, nullable=True)
    order_index  = Column(Integer, default=0, nullable=False)
    is_required  = Column(Boolean, default=True, nullable=False)

    checklist = relationship("OnboardingChecklist", back_populates="items")


# ── Employee Lifecycle ────────────────────────────────────────────────────────

class EmployeeAward(Base):
    __tablename__ = "hr_employee_awards"

    id            = Column(Integer, primary_key=True, index=True)
    user_id       = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    title         = Column(String, nullable=False)
    description   = Column(Text, nullable=True)
    award_date    = Column(Date, nullable=False)
    awarded_by_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    category      = Column(String, nullable=True)
    amount        = Column(Numeric(12, 2), nullable=True)
    created_at    = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at    = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    user       = relationship("User", foreign_keys=[user_id])
    awarded_by = relationship("User", foreign_keys=[awarded_by_id])


class EmployeePromotion(Base):
    __tablename__ = "hr_employee_promotions"

    id               = Column(Integer, primary_key=True, index=True)
    user_id          = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    previous_title   = Column(String, nullable=True)
    new_title        = Column(String, nullable=False)
    previous_salary  = Column(Numeric(12, 2), nullable=True)
    new_salary       = Column(Numeric(12, 2), nullable=True)
    effective_date   = Column(Date, nullable=False)
    reason           = Column(Text, nullable=True)
    approved_by_id   = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    notes            = Column(Text, nullable=True)
    created_at       = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at       = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    user        = relationship("User", foreign_keys=[user_id])
    approved_by = relationship("User", foreign_keys=[approved_by_id])


class EmployeeResignation(Base):
    __tablename__ = "hr_employee_resignations"

    id               = Column(Integer, primary_key=True, index=True)
    user_id          = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    submitted_at     = Column(DateTime, default=datetime.utcnow, nullable=False)
    last_working_day = Column(Date, nullable=True)
    reason           = Column(Text, nullable=True)
    status           = Column(SQLEnum(ResignationStatus), default=ResignationStatus.SUBMITTED, nullable=False)
    notes            = Column(Text, nullable=True)
    processed_by_id  = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at       = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at       = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    user         = relationship("User", foreign_keys=[user_id])
    processed_by = relationship("User", foreign_keys=[processed_by_id])


class EmployeeTermination(Base):
    __tablename__ = "hr_employee_terminations"

    id               = Column(Integer, primary_key=True, index=True)
    user_id          = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    termination_date = Column(Date, nullable=False)
    reason           = Column(Text, nullable=True)
    termination_type = Column(SQLEnum(TerminationType), default=TerminationType.VOLUNTARY, nullable=False)
    notes            = Column(Text, nullable=True)
    processed_by_id  = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at       = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at       = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    user         = relationship("User", foreign_keys=[user_id])
    processed_by = relationship("User", foreign_keys=[processed_by_id])


# ── Payroll ───────────────────────────────────────────────────────────────────

class TaxBracket(Base):
    __tablename__ = "hr_tax_brackets"

    id             = Column(Integer, primary_key=True, index=True)
    name           = Column(String, nullable=False)
    min_income     = Column(Numeric(12, 2), nullable=False, default=0)
    max_income     = Column(Numeric(12, 2), nullable=True)  # null = no upper limit
    rate           = Column(Float, nullable=False)  # percentage e.g. 22.0
    effective_from = Column(Date, nullable=False)
    effective_to   = Column(Date, nullable=True)
    created_at     = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at     = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)


class PayrollConfig(Base):
    __tablename__ = "hr_payroll_configs"

    id                   = Column(Integer, primary_key=True, index=True)
    user_id              = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    base_salary          = Column(Numeric(12, 2), nullable=False, default=0)
    hourly_rate          = Column(Numeric(10, 4), nullable=True)
    overtime_multiplier  = Column(Float, default=1.5, nullable=False)
    pay_frequency        = Column(SQLEnum(PayFrequency), default=PayFrequency.MONTHLY, nullable=False)
    effective_from       = Column(Date, nullable=False)
    is_active            = Column(Boolean, default=True, nullable=False)
    created_at           = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at           = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    user = relationship("User", foreign_keys=[user_id])


class PayrollRun(Base):
    __tablename__ = "hr_payroll_runs"

    id              = Column(Integer, primary_key=True, index=True)
    period_start    = Column(Date, nullable=False)
    period_end      = Column(Date, nullable=False)
    status          = Column(SQLEnum(PayrollRunStatus), default=PayrollRunStatus.DRAFT, nullable=False, index=True)
    total_gross     = Column(Numeric(14, 2), default=0, nullable=False)
    total_net       = Column(Numeric(14, 2), default=0, nullable=False)
    total_tax       = Column(Numeric(14, 2), default=0, nullable=False)
    run_date        = Column(DateTime, nullable=True)
    processed_by_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    notes           = Column(Text, nullable=True)
    created_at      = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at      = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    processed_by = relationship("User", foreign_keys=[processed_by_id])
    payslips     = relationship("Payslip", back_populates="payroll_run", cascade="all, delete-orphan")


class Payslip(Base):
    __tablename__ = "hr_payslips"

    id              = Column(Integer, primary_key=True, index=True)
    payroll_run_id  = Column(Integer, ForeignKey("hr_payroll_runs.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id         = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    gross_pay       = Column(Numeric(12, 2), default=0, nullable=False)
    tax_amount      = Column(Numeric(12, 2), default=0, nullable=False)
    deductions      = Column(Numeric(12, 2), default=0, nullable=False)
    net_pay         = Column(Numeric(12, 2), default=0, nullable=False)
    work_hours      = Column(Float, default=0, nullable=False)
    overtime_hours  = Column(Float, default=0, nullable=False)
    notes           = Column(Text, nullable=True)
    created_at      = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at      = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    payroll_run = relationship("PayrollRun", back_populates="payslips")
    user        = relationship("User", foreign_keys=[user_id])


# ── Meetings ──────────────────────────────────────────────────────────────────

class Meeting(Base):
    __tablename__ = "hr_meetings"

    id                = Column(Integer, primary_key=True, index=True)
    title             = Column(String, nullable=False)
    description       = Column(Text, nullable=True)
    scheduled_at      = Column(DateTime, nullable=False)
    duration_minutes  = Column(Integer, default=60, nullable=False)
    location          = Column(String, nullable=True)
    meeting_type      = Column(String, nullable=True)  # team, one_on_one, all_hands, review
    organizer_id      = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    status            = Column(SQLEnum(MeetingStatus), default=MeetingStatus.SCHEDULED, nullable=False, index=True)
    created_at        = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at        = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    organizer = relationship("User", foreign_keys=[organizer_id])
    attendees = relationship("MeetingAttendee", back_populates="meeting", cascade="all, delete-orphan")
    minutes   = relationship("MeetingMinutes", back_populates="meeting", uselist=False, cascade="all, delete-orphan")


class MeetingAttendee(Base):
    __tablename__ = "hr_meeting_attendees"

    id          = Column(Integer, primary_key=True, index=True)
    meeting_id  = Column(Integer, ForeignKey("hr_meetings.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id     = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    rsvp_status = Column(SQLEnum(RSVPStatus), default=RSVPStatus.PENDING, nullable=False)

    meeting = relationship("Meeting", back_populates="attendees")
    user    = relationship("User", foreign_keys=[user_id])


class MeetingMinutes(Base):
    __tablename__ = "hr_meeting_minutes"

    id             = Column(Integer, primary_key=True, index=True)
    meeting_id     = Column(Integer, ForeignKey("hr_meetings.id", ondelete="CASCADE"), nullable=False, index=True, unique=True)
    content        = Column(Text, nullable=False)
    action_items   = Column(JSON, nullable=True)  # list of {item, assignee, due_date}
    recorded_by_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    recorded_at    = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at     = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    meeting     = relationship("Meeting", back_populates="minutes")
    recorded_by = relationship("User", foreign_keys=[recorded_by_id])


# ── Documents ─────────────────────────────────────────────────────────────────

class DocumentCategory(Base):
    __tablename__ = "hr_document_categories"

    id          = Column(Integer, primary_key=True, index=True)
    name        = Column(String, nullable=False, unique=True)
    description = Column(Text, nullable=True)
    color       = Column(String, default="#2563EB", nullable=False)
    created_at  = Column(DateTime, default=datetime.utcnow, nullable=False)

    templates  = relationship("DocumentTemplate", back_populates="category")
    documents  = relationship("EmployeeDocument", back_populates="category")


class ContractType(Base):
    __tablename__ = "hr_contract_types"

    id          = Column(Integer, primary_key=True, index=True)
    name        = Column(String, nullable=False, unique=True)
    description = Column(Text, nullable=True)
    created_at  = Column(DateTime, default=datetime.utcnow, nullable=False)

    templates  = relationship("ContractTemplate", back_populates="contract_type")
    contracts  = relationship("EmployeeContract", back_populates="contract_type")


class DocumentTemplate(Base):
    __tablename__ = "hr_document_templates"

    id             = Column(Integer, primary_key=True, index=True)
    name           = Column(String, nullable=False)
    description    = Column(Text, nullable=True)
    category_id    = Column(Integer, ForeignKey("hr_document_categories.id", ondelete="SET NULL"), nullable=True, index=True)
    content        = Column(Text, nullable=False)  # HTML/Markdown template
    variables      = Column(JSON, nullable=True)   # list of variable names used in content
    created_by_id  = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at     = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at     = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    category   = relationship("DocumentCategory", back_populates="templates")
    created_by = relationship("User", foreign_keys=[created_by_id])


class ContractTemplate(Base):
    __tablename__ = "hr_contract_templates"

    id               = Column(Integer, primary_key=True, index=True)
    name             = Column(String, nullable=False)
    description      = Column(Text, nullable=True)
    contract_type_id = Column(Integer, ForeignKey("hr_contract_types.id", ondelete="SET NULL"), nullable=True, index=True)
    content          = Column(Text, nullable=False)
    created_by_id    = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at       = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at       = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    contract_type = relationship("ContractType", back_populates="templates")
    created_by    = relationship("User", foreign_keys=[created_by_id])


class EmployeeDocument(Base):
    __tablename__ = "hr_employee_documents"

    id               = Column(Integer, primary_key=True, index=True)
    user_id          = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    category_id      = Column(Integer, ForeignKey("hr_document_categories.id", ondelete="SET NULL"), nullable=True, index=True)
    title            = Column(String, nullable=False)
    description      = Column(Text, nullable=True)
    file_url         = Column(String, nullable=True)
    document_date    = Column(Date, nullable=True)
    is_confidential  = Column(Boolean, default=False, nullable=False)
    uploaded_by_id   = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at       = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at       = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    user        = relationship("User", foreign_keys=[user_id])
    category    = relationship("DocumentCategory", back_populates="documents")
    uploaded_by = relationship("User", foreign_keys=[uploaded_by_id])
    acknowledgments = relationship("EmployeeAcknowledgment", back_populates="document", cascade="all, delete-orphan")


class EmployeeContract(Base):
    __tablename__ = "hr_employee_contracts"

    id               = Column(Integer, primary_key=True, index=True)
    user_id          = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    contract_type_id = Column(Integer, ForeignKey("hr_contract_types.id", ondelete="SET NULL"), nullable=True)
    title            = Column(String, nullable=False)
    start_date       = Column(Date, nullable=True)
    end_date         = Column(Date, nullable=True)
    file_url         = Column(String, nullable=True)
    status           = Column(SQLEnum(ContractStatus), default=ContractStatus.DRAFT, nullable=False, index=True)
    notes            = Column(Text, nullable=True)
    created_at       = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at       = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    user          = relationship("User", foreign_keys=[user_id])
    contract_type = relationship("ContractType", back_populates="contracts")


class Timesheet(Base):
    __tablename__ = "hr_timesheets"

    id                 = Column(Integer, primary_key=True, index=True)
    user_id            = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    work_date          = Column(Date, nullable=False, index=True)
    hours              = Column(Float, nullable=False, default=0)
    hours_worked       = Column(Float, nullable=True)
    day_status         = Column(SQLEnum(DayStatus), nullable=True, index=True)
    daily_wage_earned  = Column(Float, nullable=True)
    project            = Column(String, nullable=True)
    description        = Column(Text, nullable=True)
    status             = Column(SQLEnum(TimesheetStatus), default=TimesheetStatus.DRAFT, nullable=False, index=True)
    submitted_at       = Column(DateTime, nullable=True)
    reviewed_by_id     = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    reviewed_at        = Column(DateTime, nullable=True)
    review_notes       = Column(Text, nullable=True)
    created_at         = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at         = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    user        = relationship("User", foreign_keys=[user_id])
    reviewed_by = relationship("User", foreign_keys=[reviewed_by_id])


class EmployeeAcknowledgment(Base):
    __tablename__ = "hr_employee_acknowledgments"

    id              = Column(Integer, primary_key=True, index=True)
    user_id         = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    document_id     = Column(Integer, ForeignKey("hr_employee_documents.id", ondelete="CASCADE"), nullable=False, index=True)
    acknowledged_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    notes           = Column(Text, nullable=True)

    user     = relationship("User", foreign_keys=[user_id])
    document = relationship("EmployeeDocument", back_populates="acknowledgments")
