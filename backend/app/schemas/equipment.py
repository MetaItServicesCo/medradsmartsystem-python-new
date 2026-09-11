from typing import Optional, List
from datetime import date, datetime
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
    inspection_form_id: Optional[int] = None
    default_picture_url: Optional[str] = None
    description: Optional[str] = None
    risk_priority: Optional[str] = None
    risk_name: Optional[str] = None
    location: Optional[str] = None
    inventory_date: Optional[date] = None
    acquisition_authorized_by: Optional[str] = None
    department: Optional[str] = None
    po_no: Optional[str] = None
    requester_first_name: Optional[str] = None
    requester_last_name: Optional[str] = None
    requester_phone: Optional[str] = None
    requester_fax: Optional[str] = None
    requester_mailing_address: Optional[str] = None
    requester_email: Optional[str] = None
    owning_department: Optional[str] = None
    acquisition_method: Optional[str] = None
    acquired_company_name: Optional[str] = None
    acquired_account_number: Optional[str] = None
    acquired_sales_person: Optional[str] = None
    acquired_phone: Optional[str] = None
    acquired_email: Optional[str] = None
    acquired_mailing_address: Optional[str] = None
    cost: Optional[Decimal] = None
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
    purchase_date: Optional[date] = None
    warranty_expiration: Optional[date] = None
    status: str = "active"

    # ── Facilities / MEP ────────────────────────────────────────────────────
    # All optional, so every existing caller keeps working unchanged. Without
    # these an MEP asset cannot be created through the API at all: the columns
    # exist on the model but nothing can set them.
    #
    # `location` above stays as it is — the legacy free-text string, still the
    # fallback display for an asset that has not been placed in the tree.
    discipline_id: Optional[int] = None
    location_id: Optional[int] = None
    parent_equipment_id: Optional[int] = None
    criticality: Optional[str] = None
    electrical_branch: Optional[str] = None
    service_vendor_id: Optional[int] = None

    # ── Depreciation ────────────────────────────────────────────────────────
    depreciation_method: Optional[str] = None
    salvage_value: Optional[Decimal] = None
    useful_life_years: Optional[Decimal] = None
    total_expected_units: Optional[Decimal] = None


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
    inspection_form_id: Optional[int] = None
    default_picture_url: Optional[str] = None
    description: Optional[str] = None
    risk_priority: Optional[str] = None
    risk_name: Optional[str] = None
    location: Optional[str] = None
    inventory_date: Optional[date] = None
    acquisition_authorized_by: Optional[str] = None
    department: Optional[str] = None
    po_no: Optional[str] = None
    requester_first_name: Optional[str] = None
    requester_last_name: Optional[str] = None
    requester_phone: Optional[str] = None
    requester_fax: Optional[str] = None
    requester_mailing_address: Optional[str] = None
    requester_email: Optional[str] = None
    owning_department: Optional[str] = None
    acquisition_method: Optional[str] = None
    acquired_company_name: Optional[str] = None
    acquired_account_number: Optional[str] = None
    acquired_sales_person: Optional[str] = None
    acquired_phone: Optional[str] = None
    acquired_email: Optional[str] = None
    acquired_mailing_address: Optional[str] = None
    cost: Optional[Decimal] = None
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
    purchase_date: Optional[date] = None
    warranty_expiration: Optional[date] = None
    status: Optional[str] = None

    # ── Facilities / MEP ────────────────────────────────────────────────────
    # All optional, so every existing caller keeps working unchanged. Without
    # these an MEP asset cannot be created through the API at all: the columns
    # exist on the model but nothing can set them.
    #
    # `location` above stays as it is — the legacy free-text string, still the
    # fallback display for an asset that has not been placed in the tree.
    discipline_id: Optional[int] = None
    location_id: Optional[int] = None
    parent_equipment_id: Optional[int] = None
    criticality: Optional[str] = None
    electrical_branch: Optional[str] = None
    service_vendor_id: Optional[int] = None

    # ── Depreciation ────────────────────────────────────────────────────────
    depreciation_method: Optional[str] = None
    salvage_value: Optional[Decimal] = None
    useful_life_years: Optional[Decimal] = None
    total_expected_units: Optional[Decimal] = None


class Equipment(EquipmentBase):
    id: int
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class EquipmentListResponse(BaseModel):
    items: List[Equipment]
    total: int
