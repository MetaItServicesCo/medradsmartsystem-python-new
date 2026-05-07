from typing import Optional, List
from datetime import datetime
from decimal import Decimal
from pydantic import BaseModel


class EquipmentBase(BaseModel):
    asset_tag: str
    make: str
    model: str
    serial_number: str
    modality_id: int
    facility_id: int
    tier_id: Optional[int] = None
    purchase_date: Optional[str] = None
    warranty_expiration: Optional[str] = None
    status: str = "active"


class EquipmentCreate(EquipmentBase):
    pass


class EquipmentUpdate(BaseModel):
    asset_tag: Optional[str] = None
    make: Optional[str] = None
    model: Optional[str] = None
    serial_number: Optional[str] = None
    modality_id: Optional[int] = None
    facility_id: Optional[int] = None
    tier_id: Optional[int] = None
    purchase_date: Optional[str] = None
    warranty_expiration: Optional[str] = None
    status: Optional[str] = None


class Equipment(EquipmentBase):
    id: int
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class EquipmentListResponse(BaseModel):
    items: List[Equipment]
    total: int
