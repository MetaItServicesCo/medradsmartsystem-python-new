"""Regulatory schedules, and the certificates that prove they were met.

This is where hospital plant differs sharply from medical equipment. A defib
gets a PM because the manufacturer says so. A generator gets a thirty-minute
load test every month because NFPA 110 says so, an elevator gets a state
inspection because the jurisdiction says so, and a backflow preventer gets an
annual test because the water authority says so — and each produces a
*certificate* that expires, which somebody will eventually ask to see.

Two tables, for the same reason the vendor credentials are two:

  * `ComplianceProgram` — the rule. Frequency, authority, what it applies to,
    and whether it yields a certificate.
  * `ComplianceTask` — one occurrence. Due date, who did it, what the result
    was, and the certificate it produced.

`ComplianceTask` is deliberately not a `ServiceRequest`. A work order is
somebody's job to do; a compliance task is an obligation that exists whether or
not anybody has been assigned, must be reportable across years, and carries
evidence a work order has nowhere to put. The two are linked, not merged.
"""
from sqlalchemy import (
    Boolean, Column, Date, DateTime, ForeignKey, Index, Integer, JSON, Numeric,
    String, Text, UniqueConstraint,
)
from sqlalchemy.orm import relationship
from datetime import date, datetime
import enum

from app.db.base import Base
from app.utils.clock import utc_today


class ComplianceAuthority(str, enum.Enum):
    """Who is asking. Matters because the consequence of a miss differs: a
    missed manufacturer PM is a warranty problem, a missed NFPA test is a
    finding, and a missed state elevator inspection takes the car out of
    service by law."""

    NFPA = "nfpa"
    JOINT_COMMISSION = "joint_commission"
    CMS = "cms"
    ASHRAE = "ashrae"
    ASME = "asme"
    STATE = "state"
    LOCAL = "local"
    EPA = "epa"
    OSHA = "osha"
    MANUFACTURER = "manufacturer"
    INTERNAL = "internal"


class ComplianceFrequency(str, enum.Enum):
    DAILY = "daily"
    WEEKLY = "weekly"
    MONTHLY = "monthly"
    QUARTERLY = "quarterly"
    SEMIANNUAL = "semiannual"
    ANNUAL = "annual"
    BIENNIAL = "biennial"
    THREE_YEAR = "three_year"
    FIVE_YEAR = "five_year"


FREQUENCY_DAYS: dict[str, int] = {
    ComplianceFrequency.DAILY.value: 1,
    ComplianceFrequency.WEEKLY.value: 7,
    ComplianceFrequency.MONTHLY.value: 30,
    ComplianceFrequency.QUARTERLY.value: 91,
    ComplianceFrequency.SEMIANNUAL.value: 182,
    ComplianceFrequency.ANNUAL.value: 365,
    ComplianceFrequency.BIENNIAL.value: 730,
    ComplianceFrequency.THREE_YEAR.value: 1095,
    ComplianceFrequency.FIVE_YEAR.value: 1826,
}


class ComplianceTaskStatus(str, enum.Enum):
    SCHEDULED = "scheduled"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    OVERDUE = "overdue"
    # Missed outright. Distinct from overdue because a window that has closed
    # cannot be satisfied late — a monthly generator test missed in March is a
    # gap in the record forever, and pretending otherwise hides the finding.
    MISSED = "missed"
    WAIVED = "waived"


class ComplianceResult(str, enum.Enum):
    PASS = "pass"
    PASS_WITH_DEFICIENCY = "pass_with_deficiency"
    FAIL = "fail"
    NOT_APPLICABLE = "not_applicable"


class ComplianceProgram(Base):
    __tablename__ = "compliance_programs"
    __table_args__ = (
        UniqueConstraint("facility_id", "code", name="uq_compliance_program_code"),
        Index("ix_compliance_programs_facility_active", "facility_id", "is_active"),
    )

    id = Column(Integer, primary_key=True, index=True)
    facility_id = Column(Integer, ForeignKey("facilities.id", ondelete="CASCADE"), nullable=False, index=True)

    code = Column(String(64), nullable=False, index=True)
    name = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)

    authority = Column(String(32), nullable=False, index=True)
    # The clause somebody can be pointed at when they ask why this exists.
    citation = Column(String(255), nullable=True)
    frequency = Column(String(24), nullable=False)

    discipline_id = Column(Integer, ForeignKey("disciplines.id", ondelete="SET NULL"), nullable=True, index=True)

    # Scope, checked most specific first. Explicit assets beat a space-use rule,
    # which beats a discipline-wide rule.
    applies_to_space_uses = Column(JSON, nullable=True, default=list)
    applies_to_equipment_ids = Column(JSON, nullable=True, default=list)

    # How late is still acceptable. NFPA generator testing has a real tolerance
    # window; a state inspection date generally does not.
    grace_days = Column(Integer, nullable=False, default=0)

    requires_certificate = Column(Boolean, nullable=False, default=False)
    # Certificates that must be physically posted — elevator, boiler — because
    # a surveyor looks for them on the wall, not in a database.
    certificate_must_be_posted = Column(Boolean, nullable=False, default=False)
    requires_licensed_provider = Column(Boolean, nullable=False, default=False)

    # What the task actually involves, shown to whoever performs it.
    procedure = Column(Text, nullable=True)
    # Reading point codes this task should capture, so a generator load test
    # records its runtime and load rather than just being ticked off.
    reading_point_codes = Column(JSON, nullable=True, default=list)

    is_active = Column(Boolean, nullable=False, default=True, index=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    facility = relationship("Facility")
    discipline = relationship("Discipline")
    tasks = relationship("ComplianceTask", back_populates="program", cascade="all, delete-orphan")

    @property
    def interval_days(self) -> int:
        return FREQUENCY_DAYS.get(self.frequency, 365)


class ComplianceTask(Base):
    """One occurrence of a program, against one asset or space."""

    __tablename__ = "compliance_tasks"
    __table_args__ = (
        Index("ix_compliance_tasks_facility_status_due", "facility_id", "status", "due_date"),
        Index("ix_compliance_tasks_program_due", "program_id", "due_date"),
        Index("ix_compliance_tasks_equipment", "equipment_id", "status"),
        Index("ix_compliance_tasks_cert_expiry", "certificate_expires_on"),
        # One open task per program per subject. The generator regenerates on
        # completion; without this a nightly sweep would pile up duplicates.
        Index("ix_compliance_tasks_open", "program_id", "equipment_id", "location_id", "status"),
    )

    id = Column(Integer, primary_key=True, index=True)
    facility_id = Column(Integer, ForeignKey("facilities.id", ondelete="CASCADE"), nullable=False, index=True)
    program_id = Column(Integer, ForeignKey("compliance_programs.id", ondelete="CASCADE"), nullable=False, index=True)

    equipment_id = Column(Integer, ForeignKey("equipment.id", ondelete="CASCADE"), nullable=True, index=True)
    location_id = Column(Integer, ForeignKey("locations.id", ondelete="CASCADE"), nullable=True, index=True)

    status = Column(String(24), nullable=False, default=ComplianceTaskStatus.SCHEDULED.value, index=True)
    due_date = Column(Date, nullable=False, index=True)
    # Snapshotted from the program at generation. The tolerance may be revised;
    # whether *this* task was late must not change retroactively.
    grace_days = Column(Integer, nullable=False, default=0)

    completed_at = Column(DateTime, nullable=True)
    completed_by_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    performed_by_vendor_id = Column(Integer, ForeignKey("vendors.id", ondelete="SET NULL"), nullable=True)
    result = Column(String(32), nullable=True, index=True)
    findings = Column(Text, nullable=True)
    corrective_action = Column(Text, nullable=True)

    # A failed test that generated remedial work. The link is what turns a
    # finding into something somebody is actually doing.
    work_order_id = Column(Integer, ForeignKey("service_requests.id", ondelete="SET NULL"), nullable=True)

    # ── Certificate ─────────────────────────────────────────────────────────
    certificate_number = Column(String(128), nullable=True)
    certificate_issued_by = Column(String(255), nullable=True)
    # The inspector's licence. A surveyor asks who signed and whether they were
    # licensed on the day — this is that answer.
    inspector_license = Column(String(128), nullable=True)
    certificate_issued_on = Column(Date, nullable=True)
    certificate_expires_on = Column(Date, nullable=True, index=True)
    certificate_filename = Column(String(255), nullable=True)
    certificate_path = Column(String(512), nullable=True)

    measured_values = Column(JSON, nullable=True, default=dict)
    notes = Column(Text, nullable=True)

    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    facility = relationship("Facility")
    program = relationship("ComplianceProgram", back_populates="tasks")
    equipment = relationship("Equipment")
    location = relationship("Location")
    completed_by = relationship("User", foreign_keys=[completed_by_id])
    performed_by_vendor = relationship("Vendor")
    work_order = relationship("ServiceRequest")

    @property
    def is_overdue(self) -> bool:
        if self.status in {ComplianceTaskStatus.COMPLETED.value, ComplianceTaskStatus.WAIVED.value}:
            return False
        return self.due_date < utc_today()

    @property
    def days_overdue(self) -> int:
        return max(0, (utc_today() - self.due_date).days) if self.is_overdue else 0

    @property
    def is_past_grace(self) -> bool:
        """Past the point where doing it late still counts."""
        return self.days_overdue > (self.grace_days or 0)

    @property
    def certificate_expired(self) -> bool:
        return (
            self.certificate_expires_on is not None
            and self.certificate_expires_on < utc_today()
        )
