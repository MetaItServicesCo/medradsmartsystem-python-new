from typing import Any, Dict, List, Optional
from datetime import date, datetime
from decimal import Decimal
from pydantic import BaseModel, EmailStr


class InventoryPartBase(BaseModel):
    facility_id: int
    tier_id: Optional[int] = None
    modality_id: Optional[int] = None
    inspection_form_id: Optional[int] = None
    asset_tag: Optional[str] = None
    part_number: str
    part_type: str
    description: str
    make: Optional[str] = None
    model: Optional[str] = None
    default_picture_url: Optional[str] = None
    risk_priority: Optional[str] = None
    risk_name: Optional[str] = None
    inventory_date: Optional[date] = None
    unit_price: Decimal = Decimal("0")
    condition: str = "new"
    acquisition_authorized_by: Optional[str] = None
    department: Optional[str] = None
    po_no: Optional[str] = None
    requester_first_name: Optional[str] = None
    requester_last_name: Optional[str] = None
    requester_phone: Optional[str] = None
    requester_fax: Optional[str] = None
    requester_mailing_address: Optional[str] = None
    requester_email: Optional[EmailStr] = None
    owning_department: Optional[str] = None
    acquisition_method: Optional[str] = None
    acquired_company_name: Optional[str] = None
    acquired_account_number: Optional[str] = None
    acquired_sales_person: Optional[str] = None
    acquired_phone: Optional[str] = None
    acquired_email: Optional[EmailStr] = None
    acquired_mailing_address: Optional[str] = None
    acquisition_date: Optional[date] = None
    capital_equipment: Optional[str] = None
    warranty_duration: Optional[str] = None
    parts_duration: Optional[str] = None
    labor_duration: Optional[str] = None
    coverage_start_date: Optional[date] = None
    coverage_type: Optional[str] = None
    part_warranty_end_date: Optional[date] = None
    labor_warranty_end_date: Optional[date] = None
    pm_scheduling: Optional[str] = None
    installation_date: Optional[date] = None
    last_pm_date: Optional[date] = None
    next_generated_pm_date: Optional[date] = None
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
    modality_id: Optional[int] = None
    inspection_form_id: Optional[int] = None
    asset_tag: Optional[str] = None
    part_number: Optional[str] = None
    part_type: Optional[str] = None
    description: Optional[str] = None
    make: Optional[str] = None
    model: Optional[str] = None
    default_picture_url: Optional[str] = None
    risk_priority: Optional[str] = None
    risk_name: Optional[str] = None
    inventory_date: Optional[date] = None
    unit_price: Optional[Decimal] = None
    condition: Optional[str] = None
    acquisition_authorized_by: Optional[str] = None
    department: Optional[str] = None
    po_no: Optional[str] = None
    requester_first_name: Optional[str] = None
    requester_last_name: Optional[str] = None
    requester_phone: Optional[str] = None
    requester_fax: Optional[str] = None
    requester_mailing_address: Optional[str] = None
    requester_email: Optional[EmailStr] = None
    owning_department: Optional[str] = None
    acquisition_method: Optional[str] = None
    acquired_company_name: Optional[str] = None
    acquired_account_number: Optional[str] = None
    acquired_sales_person: Optional[str] = None
    acquired_phone: Optional[str] = None
    acquired_email: Optional[EmailStr] = None
    acquired_mailing_address: Optional[str] = None
    acquisition_date: Optional[date] = None
    capital_equipment: Optional[str] = None
    warranty_duration: Optional[str] = None
    parts_duration: Optional[str] = None
    labor_duration: Optional[str] = None
    coverage_start_date: Optional[date] = None
    coverage_type: Optional[str] = None
    part_warranty_end_date: Optional[date] = None
    labor_warranty_end_date: Optional[date] = None
    pm_scheduling: Optional[str] = None
    installation_date: Optional[date] = None
    last_pm_date: Optional[date] = None
    next_generated_pm_date: Optional[date] = None
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
    modality_name: Optional[str] = None
    inspection_form_name: Optional[str] = None
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
