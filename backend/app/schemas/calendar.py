from typing import Optional
from pydantic import BaseModel
from datetime import datetime

class CalendarEventBase(BaseModel):
    title: str
    description: Optional[str] = None
    start_time: datetime
    end_time: datetime
    is_meeting: Optional[bool] = False
    workspace_id: Optional[int] = None
    color: Optional[str] = "#7C3AED"

class CalendarEventCreate(CalendarEventBase):
    pass

class CalendarEventUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    start_time: Optional[datetime] = None
    end_time: Optional[datetime] = None
    is_meeting: Optional[bool] = None
    color: Optional[str] = None

class CalendarEventResponse(CalendarEventBase):
    id: int
    user_id: int
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True
