from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel


class TestEquipmentBase(BaseModel):
    tem: str
    mrf: Optional[str] = None
    model: Optional[str] = None
    serial_number: Optional[str] = None
    description: Optional[str] = None
    asset: Optional[str] = None
    technician_id: Optional[int] = None
    status: str = "active"
    image_url: Optional[str] = None


class TestEquipmentCreate(TestEquipmentBase):
    pass


class TestEquipmentUpdate(BaseModel):
    tem: Optional[str] = None
    mrf: Optional[str] = None
    model: Optional[str] = None
    serial_number: Optional[str] = None
    description: Optional[str] = None
    asset: Optional[str] = None
    technician_id: Optional[int] = None
    status: Optional[str] = None
    image_url: Optional[str] = None


class TestEquipmentResponse(TestEquipmentBase):
    id: int
    technician_name: Optional[str] = None
    created_by_id: Optional[int] = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class TestEquipmentListResponse(BaseModel):
    items: List[TestEquipmentResponse]
    total: int
