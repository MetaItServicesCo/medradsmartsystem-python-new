"""Schemas for space availability.

Note for reviewers: there is deliberately no field anywhere in this file that
could carry a patient's identity. See the PHI boundary at the top of
`app.models.space_status`. `notes` is for facilities notes, and a patient
detail appearing there is a defect, not a feature.
"""
from typing import Dict, List, Optional
from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, Field, field_validator

from app.models.space_status import AVAILABILITIES, OOS_REASONS


class SpaceStatusSet(BaseModel):
    availability: str
    oos_reason: Optional[str] = None
    work_order_id: Optional[int] = None
    expected_return_at: Optional[datetime] = None
    notes: Optional[str] = None

    @field_validator("availability")
    @classmethod
    def _known_availability(cls, value: str) -> str:
        if value not in AVAILABILITIES:
            raise ValueError(f"Unknown availability '{value}'. Allowed: {', '.join(AVAILABILITIES)}")
        return value

    @field_validator("oos_reason")
    @classmethod
    def _known_reason(cls, value: Optional[str]) -> Optional[str]:
        if value is not None and value not in OOS_REASONS:
            raise ValueError(f"Unknown reason '{value}'. Allowed: {', '.join(OOS_REASONS)}")
        return value


class SpaceStatus(BaseModel):
    id: int
    facility_id: int
    location_id: int
    availability: str
    oos_reason: Optional[str] = None
    work_order_id: Optional[int] = None
    since: datetime
    expected_return_at: Optional[datetime] = None
    source: str
    notes: Optional[str] = None
    changed_by_id: Optional[int] = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class SpaceStatusWithLocation(SpaceStatus):
    location_code: Optional[str] = None
    location_name: Optional[str] = None
    location_type: Optional[str] = None
    space_use: Optional[str] = None
    criticality: Optional[str] = None
    bed_count: int = 0
    hours_in_state: Optional[float] = None


class SpaceStatusListResponse(BaseModel):
    items: List[SpaceStatusWithLocation]
    total: int


class SpaceStatusHistoryEntry(BaseModel):
    id: int
    location_id: int
    availability: str
    oos_reason: Optional[str] = None
    work_order_id: Optional[int] = None
    effective_from: datetime
    effective_to: Optional[datetime] = None
    duration_minutes: Optional[Decimal] = None
    space_use: Optional[str] = None
    criticality: Optional[str] = None
    source: str
    notes: Optional[str] = None

    class Config:
        from_attributes = True


class SpaceStatusHistoryResponse(BaseModel):
    items: List[SpaceStatusHistoryEntry]
    total: int


class BoardSummary(BaseModel):
    total: int
    available: int
    unavailable: int
    by_availability: Dict[str, int]


class DowntimeReport(BaseModel):
    """The number that makes this a capacity conversation rather than a
    maintenance one."""

    start: datetime
    end: datetime
    incidents: int
    bed_days_lost: float
    procedure_room_hours_lost: float
    other_space_hours_lost: float
    minutes_by_reason: Dict[str, float]
    minutes_by_space_use: Dict[str, float]
    facilities_attributable_only: bool
