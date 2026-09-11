from typing import Any, Dict, List, Optional
from datetime import date, datetime

from pydantic import BaseModel


class ComplianceProgramBase(BaseModel):
    facility_id: int
    code: str
    name: str
    description: Optional[str] = None
    authority: str
    citation: Optional[str] = None
    frequency: str
    discipline_id: Optional[int] = None
    applies_to_space_uses: Optional[List[str]] = None
    applies_to_equipment_ids: Optional[List[int]] = None
    grace_days: int = 0
    requires_certificate: bool = False
    certificate_must_be_posted: bool = False
    requires_licensed_provider: bool = False
    procedure: Optional[str] = None
    reading_point_codes: Optional[List[str]] = None


class ComplianceProgramCreate(ComplianceProgramBase):
    pass


class ComplianceProgramUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    authority: Optional[str] = None
    citation: Optional[str] = None
    frequency: Optional[str] = None
    discipline_id: Optional[int] = None
    applies_to_space_uses: Optional[List[str]] = None
    applies_to_equipment_ids: Optional[List[int]] = None
    grace_days: Optional[int] = None
    requires_certificate: Optional[bool] = None
    certificate_must_be_posted: Optional[bool] = None
    requires_licensed_provider: Optional[bool] = None
    procedure: Optional[str] = None
    reading_point_codes: Optional[List[str]] = None
    is_active: Optional[bool] = None


class ComplianceProgram(ComplianceProgramBase):
    id: int
    is_active: bool
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class ComplianceProgramWithCounts(ComplianceProgram):
    open_tasks: int = 0
    overdue_tasks: int = 0
    subject_count: int = 0


class ComplianceProgramListResponse(BaseModel):
    items: List[ComplianceProgramWithCounts]
    total: int


class CertificateInput(BaseModel):
    certificate_number: Optional[str] = None
    certificate_issued_by: Optional[str] = None
    # A surveyor asks who signed and whether they were licensed on the day.
    inspector_license: Optional[str] = None
    certificate_issued_on: Optional[date] = None
    certificate_expires_on: Optional[date] = None


class ComplianceTaskComplete(BaseModel):
    result: str
    findings: Optional[str] = None
    corrective_action: Optional[str] = None
    performed_by_vendor_id: Optional[int] = None
    certificate: Optional[CertificateInput] = None
    measured_values: Optional[Dict[str, Any]] = None
    notes: Optional[str] = None


class ComplianceTask(BaseModel):
    id: int
    facility_id: int
    program_id: int
    equipment_id: Optional[int] = None
    location_id: Optional[int] = None
    status: str
    due_date: date
    grace_days: int
    completed_at: Optional[datetime] = None
    completed_by_id: Optional[int] = None
    performed_by_vendor_id: Optional[int] = None
    result: Optional[str] = None
    findings: Optional[str] = None
    corrective_action: Optional[str] = None
    work_order_id: Optional[int] = None
    certificate_number: Optional[str] = None
    certificate_issued_by: Optional[str] = None
    inspector_license: Optional[str] = None
    certificate_issued_on: Optional[date] = None
    certificate_expires_on: Optional[date] = None
    measured_values: Optional[Dict[str, Any]] = None
    notes: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True


class ComplianceTaskWithContext(ComplianceTask):
    program_code: Optional[str] = None
    program_name: Optional[str] = None
    authority: Optional[str] = None
    citation: Optional[str] = None
    procedure: Optional[str] = None
    requires_certificate: bool = False
    requires_licensed_provider: bool = False
    equipment_tag: Optional[str] = None
    location_code: Optional[str] = None
    is_overdue: bool = False
    days_overdue: int = 0
    # Late but inside tolerance is recoverable; past grace is a gap in the
    # record that cannot be filled retroactively.
    is_past_grace: bool = False


class ComplianceTaskListResponse(BaseModel):
    items: List[ComplianceTaskWithContext]
    total: int


class ComplianceSummary(BaseModel):
    open: int
    overdue: int
    past_grace: int
    due_within_14_days: int
    expired_certificates: int
    failures_last_12_months: int


class GenerationResult(BaseModel):
    created: int
    skipped_existing: int
    by_program: Dict[str, int]
    horizon_days: int


class SeedResult(BaseModel):
    created: int
    skipped: int
    programs: List[str]


class ComplianceMeta(BaseModel):
    authorities: List[Dict[str, str]]
    frequencies: List[Dict[str, str]]
    statuses: List[Dict[str, str]]
    results: List[Dict[str, str]]
