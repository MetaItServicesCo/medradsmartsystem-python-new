from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel


class AttendanceUserBrief(BaseModel):
    id: int
    full_name: str
    username: str
    email: str
    role: str
    avatar_url: Optional[str] = None


class AttendanceFacilityBrief(BaseModel):
    id: int
    name: str


class AttendanceProfileCreate(BaseModel):
    user_id: int
    facility_id: Optional[int] = None
    employee_code: Optional[str] = None
    notes: Optional[str] = None


class AttendanceProfileUpdate(BaseModel):
    facility_id: Optional[int] = None
    employee_code: Optional[str] = None
    face_status: Optional[str] = None
    notes: Optional[str] = None


class AttendanceFaceSampleResponse(BaseModel):
    id: int
    image_url: str
    quality_score: Optional[float] = None
    captured_at: datetime

    class Config:
        from_attributes = True


class AttendanceProfileResponse(BaseModel):
    id: int
    user_id: int
    facility_id: Optional[int] = None
    employee_code: Optional[str] = None
    face_status: str
    face_samples_count: int
    face_model_version: Optional[str] = None
    notes: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    user: AttendanceUserBrief
    facility: Optional[AttendanceFacilityBrief] = None

    class Config:
        from_attributes = True


class AttendanceEventCreate(BaseModel):
    user_id: Optional[int] = None
    facility_id: Optional[int] = None
    event_type: str
    event_time: Optional[datetime] = None
    timezone: str = "Asia/Karachi"
    source: str = "manual"
    verification_status: str = "verified"
    confidence: Optional[float] = None
    remark: Optional[str] = None
    device_label: Optional[str] = None


class AttendanceEventResponse(BaseModel):
    id: int
    user_id: int
    profile_id: Optional[int] = None
    facility_id: Optional[int] = None
    event_type: str
    event_time: datetime
    timezone: str
    source: str
    verification_status: str
    confidence: Optional[float] = None
    remark: Optional[str] = None
    device_label: Optional[str] = None
    image_url: Optional[str] = None
    created_by_id: Optional[int] = None
    created_at: datetime
    user: AttendanceUserBrief
    facility: Optional[AttendanceFacilityBrief] = None

    class Config:
        from_attributes = True


class AttendanceProfileListResponse(BaseModel):
    items: List[AttendanceProfileResponse]
    total: int


class AttendanceEventListResponse(BaseModel):
    items: List[AttendanceEventResponse]
    total: int


class AttendanceSummaryResponse(BaseModel):
    date: str
    total_employees: int
    enrolled_faces: int
    checked_in: int
    checked_out: int
    on_break: int
    needs_review: int
    latest_events: List[AttendanceEventResponse]
