from typing import Any, Dict, List, Optional
from datetime import date, datetime
from decimal import Decimal
from pydantic import BaseModel, EmailStr


class InventoryPartBase(BaseModel):
    facility_id: int
    tier_id: Optional[int] = None
    part_number: str
    part_type: str
    description: str
    make: Optional[str] = None
    model: Optional[str] = None
    unit_price: Decimal = Decimal("0")
    condition: str = "new"
    supplier_name: Optional[str] = None
    supplier_contact: Optional[str] = None
    supplier_email: Optional[EmailStr] = None
    supplier_phone: Optional[str] = None
    technical_specs: Optional[Dict[str, Any]] = None
    batch_number: Optional[str] = None
    expiry_date: Optional[date] = None
    serial_number: Optional[str] = None
    is_critical: bool = False
    quantity_on_hand: int = 0
    reorder_level: int = 0
    location: Optional[str] = None
    status: str = "active"


class InventoryPartCreate(InventoryPartBase):
    pass


class InventoryPartUpdate(BaseModel):
    facility_id: Optional[int] = None
    tier_id: Optional[int] = None
    part_number: Optional[str] = None
    part_type: Optional[str] = None
    description: Optional[str] = None
    make: Optional[str] = None
    model: Optional[str] = None
    unit_price: Optional[Decimal] = None
    condition: Optional[str] = None
    supplier_name: Optional[str] = None
    supplier_contact: Optional[str] = None
    supplier_email: Optional[EmailStr] = None
    supplier_phone: Optional[str] = None
    technical_specs: Optional[Dict[str, Any]] = None
    batch_number: Optional[str] = None
    expiry_date: Optional[date] = None
    serial_number: Optional[str] = None
    is_critical: Optional[bool] = None
    quantity_on_hand: Optional[int] = None
    reorder_level: Optional[int] = None
    location: Optional[str] = None
    status: Optional[str] = None


class InventoryPartResponse(InventoryPartBase):
    id: int
    facility_name: Optional[str] = None
    tier_name: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class InventoryPartListResponse(BaseModel):
    items: List[InventoryPartResponse]
    total: int


class InventoryTransactionCreate(BaseModel):
    transaction_type: str
    quantity: int
    unit_cost: Optional[Decimal] = None
    from_facility_id: Optional[int] = None
    to_facility_id: Optional[int] = None
    authorization_reference: Optional[str] = None
    authorization_details: Optional[str] = None
    notes: Optional[str] = None


class InventoryTransactionResponse(BaseModel):
    id: int
    part_id: int
    facility_id: int
    transaction_type: str
    quantity: int
    unit_cost: Optional[Decimal] = None
    balance_after: int
    from_facility_id: Optional[int] = None
    to_facility_id: Optional[int] = None
    authorization_reference: Optional[str] = None
    authorization_details: Optional[str] = None
    notes: Optional[str] = None
    created_by_id: int
    created_by_name: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True


class InventoryTransactionListResponse(BaseModel):
    items: List[InventoryTransactionResponse]
    total: int
