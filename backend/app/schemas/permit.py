from typing import Any, Dict, List, Optional
from datetime import datetime

from pydantic import BaseModel, Field, field_validator

from app.models.permit import PERMIT_TYPES


class PermitApproval(BaseModel):
    id: int
    permit_id: int
    approver_role: str
    status: str
    approved_by_id: Optional[int] = None
    approved_by_name: Optional[str] = None
    decided_at: Optional[datetime] = None
    conditions: Optional[str] = None
    rejection_reason: Optional[str] = None

    class Config:
        from_attributes = True


class WorkPermitBase(BaseModel):
    facility_id: int
    work_order_id: Optional[int] = None
    location_id: Optional[int] = None
    permit_type: str
    title: str
    description: Optional[str] = None
    work_scope: Optional[str] = None
    valid_from: Optional[datetime] = None
    valid_to: Optional[datetime] = None

    # ICRA. The class is never accepted from the client — it is derived from
    # the matrix, because letting the requester classify their own risk is how
    # everything becomes Class I.
    construction_activity_type: Optional[str] = None
    patient_risk_group: Optional[str] = None

    # ILSM triggers
    impairs_fire_alarm: bool = False
    impairs_sprinkler: bool = False
    impairs_egress: bool = False
    impairs_smoke_barrier: bool = False

    # Hot work
    fire_watch_minutes_after: Optional[int] = None
    fire_watch_by: Optional[str] = None
    extinguisher_verified: bool = False

    # Lockout / tagout
    isolation_points: Optional[List[Dict[str, Any]]] = None
    energy_verified_zero: bool = False

    # Utility shutdown
    service_type: Optional[str] = None

    @field_validator("permit_type")
    @classmethod
    def _known_type(cls, value: str) -> str:
        if value not in PERMIT_TYPES:
            raise ValueError(f"Unknown permit type '{value}'. Allowed: {', '.join(PERMIT_TYPES)}")
        return value


class WorkPermitCreate(WorkPermitBase):
    # For a shutdown: populate the affected spaces from the dependency graph
    # rather than making somebody list them, and snapshot the result.
    derive_impact_from_equipment_id: Optional[int] = None


class WorkPermitUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    work_scope: Optional[str] = None
    location_id: Optional[int] = None
    valid_from: Optional[datetime] = None
    valid_to: Optional[datetime] = None
    construction_activity_type: Optional[str] = None
    patient_risk_group: Optional[str] = None
    impairs_fire_alarm: Optional[bool] = None
    impairs_sprinkler: Optional[bool] = None
    impairs_egress: Optional[bool] = None
    impairs_smoke_barrier: Optional[bool] = None
    fire_watch_minutes_after: Optional[int] = None
    fire_watch_by: Optional[str] = None
    extinguisher_verified: Optional[bool] = None
    isolation_points: Optional[List[Dict[str, Any]]] = None
    energy_verified_zero: Optional[bool] = None
    service_type: Optional[str] = None


class ApprovalDecision(BaseModel):
    role: str
    approved: bool
    conditions: Optional[str] = None
    reason: Optional[str] = None


class PermitClose(BaseModel):
    # Not decoration. Closing a Class IV ICRA without confirming the barriers
    # came down is exactly the paperwork-shaped hole permits exist to close.
    controls_removed: bool = Field(
        description="Barriers down, locks off, impaired systems restored",
    )
    notes: Optional[str] = None


class WorkPermit(WorkPermitBase):
    id: int
    permit_number: str
    status: str
    icra_class: Optional[str] = None
    required_precautions: Optional[List[str]] = None
    ilsm_measures: Optional[List[str]] = None
    fire_watch_required: bool = False
    affected_location_ids: Optional[List[int]] = None
    affected_summary: Optional[str] = None
    requested_by_id: Optional[int] = None
    requested_at: Optional[datetime] = None
    activated_at: Optional[datetime] = None
    closed_at: Optional[datetime] = None
    controls_removed: bool = False
    closeout_notes: Optional[str] = None
    document_filename: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class WorkPermitDetail(WorkPermit):
    approvals: List[PermitApproval] = []
    is_authorising: bool = False
    outstanding_approvals: List[str] = []
    location_code: Optional[str] = None
    work_order_number: Optional[str] = None


class WorkPermitListResponse(BaseModel):
    items: List[WorkPermitDetail]
    total: int


class ICRAPreview(BaseModel):
    """What the assessment would produce, before committing to it.

    Exists so the requester sees that choosing Type C in an ICU means Class IV
    and three signatures *before* they submit, rather than discovering it a day
    later.
    """

    construction_activity_type: str
    patient_risk_group: str
    icra_class: str
    required_precautions: List[str]
    required_approvals: List[str]


class PermitMeta(BaseModel):
    permit_types: List[Dict[str, str]]
    statuses: List[Dict[str, str]]
    approval_roles: List[Dict[str, str]]
    construction_activity_types: List[Dict[str, str]]
    patient_risk_groups: List[Dict[str, str]]
    icra_classes: List[Dict[str, str]]
