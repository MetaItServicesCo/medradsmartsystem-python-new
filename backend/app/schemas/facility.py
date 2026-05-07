from typing import Optional, List
from datetime import datetime
from pydantic import BaseModel, EmailStr


class FacilityBase(BaseModel):
    name: str
    address: str
    city: str
    state: str
    zip_code: str
    country: str
    phone: str
    email: str
    timezone: Optional[str] = "UTC"
    operating_hours: Optional[str] = None
    tier_id: Optional[int] = None

    # General Information
    contact_person: Optional[str] = None
    suite: Optional[str] = None
    website: Optional[str] = None

    # Facility Details
    parent_facility_id: Optional[int] = None
    status: Optional[str] = "active"

    # Billing
    billing_name: Optional[str] = None
    billing_email: Optional[str] = None
    billing_street: Optional[str] = None
    billing_suite: Optional[str] = None
    billing_city: Optional[str] = None
    billing_state: Optional[str] = None
    billing_zip_code: Optional[str] = None

    # Other Settings
    tax_exemption: Optional[bool] = False
    inheritance: Optional[str] = None
    installment_type: Optional[str] = None
    payment_method: Optional[str] = None
    delivery_email: Optional[str] = None


class FacilityCreate(FacilityBase):
    pass


class FacilityUpdate(BaseModel):
    name: Optional[str] = None
    address: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    zip_code: Optional[str] = None
    country: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    timezone: Optional[str] = None
    operating_hours: Optional[str] = None
    tier_id: Optional[int] = None

    contact_person: Optional[str] = None
    suite: Optional[str] = None
    website: Optional[str] = None
    parent_facility_id: Optional[int] = None
    status: Optional[str] = None

    billing_name: Optional[str] = None
    billing_email: Optional[str] = None
    billing_street: Optional[str] = None
    billing_suite: Optional[str] = None
    billing_city: Optional[str] = None
    billing_state: Optional[str] = None
    billing_zip_code: Optional[str] = None

    tax_exemption: Optional[bool] = None
    inheritance: Optional[str] = None
    installment_type: Optional[str] = None
    payment_method: Optional[str] = None
    delivery_email: Optional[str] = None


class FacilityBrief(BaseModel):
    """Lightweight response for search/autocomplete."""
    id: int
    name: str
    city: Optional[str] = None
    state: Optional[str] = None

    class Config:
        from_attributes = True


class FacilityUserBrief(BaseModel):
    id: int
    full_name: str
    username: str
    role: str
    avatar_url: Optional[str] = None

    class Config:
        from_attributes = True


class FacilityInDBBase(FacilityBase):
    id: int
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class Facility(FacilityInDBBase):
    assigned_users: Optional[List[FacilityUserBrief]] = None


class FacilityListResponse(BaseModel):
    items: List[Facility]
    total: int
    skip: int
    limit: int

