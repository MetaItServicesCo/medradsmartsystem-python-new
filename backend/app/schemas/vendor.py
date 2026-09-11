from typing import Any, Dict, List, Optional
from datetime import date, datetime
from decimal import Decimal

from pydantic import BaseModel, Field


# ── Contacts ─────────────────────────────────────────────────────────────────

class VendorContactBase(BaseModel):
    full_name: str
    title: Optional[str] = None
    phone: Optional[str] = None
    mobile: Optional[str] = None
    email: Optional[str] = None
    is_primary: bool = False
    is_escalation: bool = False
    escalation_order: Optional[int] = None
    notes: Optional[str] = None


class VendorContactCreate(VendorContactBase):
    vendor_id: int


class VendorContactUpdate(BaseModel):
    full_name: Optional[str] = None
    title: Optional[str] = None
    phone: Optional[str] = None
    mobile: Optional[str] = None
    email: Optional[str] = None
    is_primary: Optional[bool] = None
    is_escalation: Optional[bool] = None
    escalation_order: Optional[int] = None
    notes: Optional[str] = None


class VendorContact(VendorContactBase):
    id: int
    vendor_id: int
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


# ── Credentials ──────────────────────────────────────────────────────────────

class VendorCredentialBase(BaseModel):
    credential_type: str
    identifier: Optional[str] = None
    issuer: Optional[str] = None
    jurisdiction: Optional[str] = None
    issued_on: Optional[date] = None
    expires_on: Optional[date] = None
    coverage_amount: Optional[Decimal] = None
    # A lapsed liability policy is a site-access problem; an expiring W-9 is an
    # accounting one. Defaulting to blocking is the safe way round.
    is_blocking: bool = True
    notes: Optional[str] = None


class VendorCredentialCreate(VendorCredentialBase):
    vendor_id: int


class VendorCredentialUpdate(BaseModel):
    credential_type: Optional[str] = None
    identifier: Optional[str] = None
    issuer: Optional[str] = None
    jurisdiction: Optional[str] = None
    issued_on: Optional[date] = None
    expires_on: Optional[date] = None
    coverage_amount: Optional[Decimal] = None
    is_blocking: Optional[bool] = None
    notes: Optional[str] = None


class VendorCredential(VendorCredentialBase):
    id: int
    vendor_id: int
    document_filename: Optional[str] = None
    is_expired: bool = False
    days_until_expiry: Optional[int] = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


# ── Contracts ────────────────────────────────────────────────────────────────

class VendorContractBase(BaseModel):
    vendor_id: int
    facility_id: Optional[int] = None
    contract_number: str
    title: str
    contract_type: str = "full_service"
    status: str = "draft"
    discipline_ids: Optional[List[int]] = None
    location_id: Optional[int] = None
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    renewal_notice_date: Optional[date] = None
    auto_renews: bool = False
    annual_value: Optional[Decimal] = None
    labor_rate_per_hour: Optional[Decimal] = None
    overtime_rate_per_hour: Optional[Decimal] = None
    holiday_rate_per_hour: Optional[Decimal] = None
    trip_charge: Optional[Decimal] = None
    # e.g. {"critical": 2, "high": 8, "medium": 24, "low": 72}
    response_hours_by_priority: Optional[Dict[str, int]] = None
    covers_after_hours: bool = False
    covers_parts: bool = False
    scope_notes: Optional[str] = None


class VendorContractCreate(VendorContractBase):
    covered_equipment_ids: Optional[List[int]] = None


class VendorContractUpdate(BaseModel):
    facility_id: Optional[int] = None
    title: Optional[str] = None
    contract_type: Optional[str] = None
    status: Optional[str] = None
    discipline_ids: Optional[List[int]] = None
    location_id: Optional[int] = None
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    renewal_notice_date: Optional[date] = None
    auto_renews: Optional[bool] = None
    annual_value: Optional[Decimal] = None
    labor_rate_per_hour: Optional[Decimal] = None
    overtime_rate_per_hour: Optional[Decimal] = None
    holiday_rate_per_hour: Optional[Decimal] = None
    trip_charge: Optional[Decimal] = None
    response_hours_by_priority: Optional[Dict[str, int]] = None
    covers_after_hours: Optional[bool] = None
    covers_parts: Optional[bool] = None
    scope_notes: Optional[str] = None
    covered_equipment_ids: Optional[List[int]] = None


class VendorContract(VendorContractBase):
    id: int
    document_filename: Optional[str] = None
    is_current: bool = False
    covered_equipment_ids: List[int] = []
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class VendorContractListResponse(BaseModel):
    items: List[VendorContract]
    total: int


# ── Vendors ──────────────────────────────────────────────────────────────────

class VendorBase(BaseModel):
    code: str = Field(min_length=1, max_length=48)
    name: str
    legal_name: Optional[str] = None
    vendor_type: str = "service_contractor"
    status: str = "active"
    discipline_ids: Optional[List[int]] = None
    phone: Optional[str] = None
    after_hours_phone: Optional[str] = None
    email: Optional[str] = None
    website: Optional[str] = None
    address: Optional[str] = None
    suite: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    zip_code: Optional[str] = None
    country: Optional[str] = "United States"
    tax_id: Optional[str] = None
    account_number: Optional[str] = None
    notes: Optional[str] = None


class VendorCreate(VendorBase):
    pass


class VendorUpdate(BaseModel):
    name: Optional[str] = None
    legal_name: Optional[str] = None
    vendor_type: Optional[str] = None
    status: Optional[str] = None
    discipline_ids: Optional[List[int]] = None
    phone: Optional[str] = None
    after_hours_phone: Optional[str] = None
    email: Optional[str] = None
    website: Optional[str] = None
    address: Optional[str] = None
    suite: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    zip_code: Optional[str] = None
    country: Optional[str] = None
    tax_id: Optional[str] = None
    account_number: Optional[str] = None
    notes: Optional[str] = None


class Vendor(VendorBase):
    id: int
    credentials_ok: bool
    earliest_credential_expiry: Optional[date] = None
    is_dispatchable: bool = False
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class VendorDetail(Vendor):
    contacts: List[VendorContact] = []
    credentials: List[VendorCredential] = []
    contracts: List[VendorContract] = []


class VendorListResponse(BaseModel):
    items: List[Vendor]
    total: int


class ExpiringCredential(BaseModel):
    """One row of the compliance watchlist."""

    vendor_id: int
    vendor_name: str
    credential_id: int
    credential_type: str
    identifier: Optional[str] = None
    expires_on: Optional[date] = None
    days_until_expiry: Optional[int] = None
    is_blocking: bool
    is_expired: bool


class ComplianceWatchlist(BaseModel):
    """What a surveyor will ask about, before they ask.

    Split into expired and expiring because they need different responses:
    one is a vendor who must stop work today, the other is a phone call.
    """

    expired: List[ExpiringCredential]
    expiring_soon: List[ExpiringCredential]
    horizon_days: int
    blocked_vendor_count: int
