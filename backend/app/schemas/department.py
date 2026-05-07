from typing import Optional, List
from datetime import datetime
from pydantic import BaseModel


class DepartmentBase(BaseModel):
    name: str
    description: Optional[str] = None
    facility_id: int


class DepartmentCreate(DepartmentBase):
    pass


class DepartmentUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    facility_id: Optional[int] = None


class Department(DepartmentBase):
    id: int
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class DepartmentListResponse(BaseModel):
    items: List[Department]
    total: int
