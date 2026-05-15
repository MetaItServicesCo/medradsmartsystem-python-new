from typing import Optional, List
from datetime import datetime
from pydantic import BaseModel


class FacilityUserResponse(BaseModel):
    id: int
    username: str
    email: str
    full_name: str
    user_type: str
    role: str
    is_active: bool
    facility_id: Optional[int] = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class FacilityUserUpdate(BaseModel):
    facility_id: Optional[int] = None


class FacilityUserBulkAssign(BaseModel):
    facility_id: int
    user_ids: List[int]


class FacilityManagerRoleUpdate(BaseModel):
    role: str


class FacilityUserListResponse(BaseModel):
    items: List[FacilityUserResponse]
    total: int
