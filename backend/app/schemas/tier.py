from typing import Optional, List
from datetime import datetime
from decimal import Decimal
from pydantic import BaseModel


class TierBase(BaseModel):
    tier_code: str
    name: str
    description: Optional[str] = None
    response_time_hours: Optional[int] = None
    labor_rate_per_hour: Decimal
    service_call_fee: Decimal
    preventive_maintenance_fee: Decimal
    mileage_rate: Decimal
    status: str = "active"


class TierCreate(TierBase):
    pass


class TierUpdate(BaseModel):
    tier_code: Optional[str] = None
    name: Optional[str] = None
    description: Optional[str] = None
    response_time_hours: Optional[int] = None
    labor_rate_per_hour: Optional[Decimal] = None
    service_call_fee: Optional[Decimal] = None
    preventive_maintenance_fee: Optional[Decimal] = None
    mileage_rate: Optional[Decimal] = None
    status: Optional[str] = None


class TierInDBBase(TierBase):
    id: int
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class Tier(TierInDBBase):
    pass


class TierListResponse(BaseModel):
    items: List[Tier]
    total: int
