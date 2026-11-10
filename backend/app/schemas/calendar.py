from typing import List, Optional
from pydantic import BaseModel, Field
from datetime import datetime

class CalendarEventBase(BaseModel):
    title: str = Field(..., max_length=100)
    description: Optional[str] = None
    start_time: datetime
    end_time: datetime
    is_meeting: Optional[bool] = False
    workspace_id: Optional[int] = None
    color: Optional[str] = "#7C3AED"

class CalendarEventCreate(CalendarEventBase):
    # Tagging one or more technicians makes the event a technician schedule.
    technician_ids: Optional[List[int]] = None
    all_day: bool = False
    location: Optional[str] = Field(None, max_length=200)

class CalendarEventUpdate(BaseModel):
    title: Optional[str] = Field(None, max_length=100)
    description: Optional[str] = None
    start_time: Optional[datetime] = None
    end_time: Optional[datetime] = None
    is_meeting: Optional[bool] = None
    color: Optional[str] = None
    technician_ids: Optional[List[int]] = None
    all_day: Optional[bool] = None
    location: Optional[str] = Field(None, max_length=200)

class CalendarTechnician(BaseModel):
    id: int
    full_name: str

class CalendarEventResponse(CalendarEventBase):
    id: int
    user_id: int
    created_at: datetime
    updated_at: datetime
    is_schedule: bool = False
    all_day: bool = False
    location: Optional[str] = None
    technicians: List[CalendarTechnician] = []
    created_by_name: Optional[str] = None
    # Whether the person asking may change or delete it.
    can_edit: bool = False

    class Config:
        from_attributes = True

class ScheduleClashCheck(BaseModel):
    technician_ids: List[int]
    start_time: datetime
    end_time: datetime
    exclude_event_id: Optional[int] = None

class ScheduleClash(BaseModel):
    technician_id: int
    technician_name: str
    event_id: int
    title: str
    start_time: datetime
    end_time: datetime
