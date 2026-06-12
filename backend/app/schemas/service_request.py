from typing import Optional, List
from datetime import datetime
from decimal import Decimal
from pydantic import BaseModel


# ── Line Items ───────────────────────────────────────────────────────────────

class LineItemBase(BaseModel):
    item_type: str = "part"  # part / labor / other
    description: str
    quantity: Decimal = Decimal("1")
    unit_price: Decimal
    total: Decimal

class LineItemCreate(LineItemBase):
    pass

class LineItemResponse(LineItemBase):
    id: int
    quotation_id: int
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True


# ── Quotation Payment ────────────────────────────────────────────────────────

class QuotationPaymentBase(BaseModel):
    payment_method: str  # credit_card / ach / mbmts_ach
    amount: Decimal
    notes: Optional[str] = None
    # ACH fields
    bank_name: Optional[str] = None
    account_last_four: Optional[str] = None
    routing_number_last_four: Optional[str] = None
    # MBMTS ACH fields
    mbmts_account_name: Optional[str] = None
    mbmts_routing_number: Optional[str] = None
    mbmts_account_number: Optional[str] = None
    mbmts_bank_name: Optional[str] = None
    mbmts_bank_address: Optional[str] = None

class QuotationPaymentCreate(QuotationPaymentBase):
    pass

class QuotationPaymentResponse(QuotationPaymentBase):
    id: int
    quotation_id: int
    reference_number: Optional[str] = None  # system-generated
    status: str
    paid_at: Optional[datetime] = None
    created_at: Optional[datetime] = None
    created_by_id: int

    class Config:
        from_attributes = True


# ── Quotation ────────────────────────────────────────────────────────────────

class ServiceRequestQuotationBase(BaseModel):
    description: str

class ServiceRequestQuotationCreate(ServiceRequestQuotationBase):
    line_items: Optional[List[LineItemCreate]] = []

class ServiceRequestQuotationUpdate(BaseModel):
    description: Optional[str] = None
    status: Optional[str] = None
    line_items: Optional[List[LineItemCreate]] = None

class ServiceRequestQuotationResponse(ServiceRequestQuotationBase):
    id: int
    service_request_id: int
    created_by_id: int
    quotation_number: str
    amount: Decimal
    status: str
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    line_items: List[LineItemResponse] = []
    payments: List[QuotationPaymentResponse] = []
    revision_history: Optional[list] = []

    class Config:
        from_attributes = True

class ServiceRequestQuotationListResponse(ServiceRequestQuotationResponse):
    request_number: str
    facility_name: Optional[str] = None


# ── Service Request ──────────────────────────────────────────────────────────

class ServiceRequestBase(BaseModel):
    facility_id: int
    equipment_id: int
    problem_description: str
    service_required: Optional[str] = None
    preferred_datetime: Optional[datetime] = None
    requested_by_name: Optional[str] = None
    reference_number: Optional[str] = None
    request_image_url: Optional[str] = None
    priority: str  # low / medium / high / critical


class ServiceRequestCreate(ServiceRequestBase):
    requester_id: Optional[int] = None  # Set server-side from current_user if omitted


class ServiceRequestUpdate(BaseModel):
    status: Optional[str] = None
    priority: Optional[str] = None
    assigned_technician_id: Optional[int] = None
    problem_description: Optional[str] = None
    service_required: Optional[str] = None
    preferred_datetime: Optional[datetime] = None
    requested_by_name: Optional[str] = None
    reference_number: Optional[str] = None
    request_image_url: Optional[str] = None
    resolution_description: Optional[str] = None
    time_spent_hours: Optional[Decimal] = None
    total_cost: Optional[Decimal] = None
    billing_status: Optional[str] = None
    cc_auth_requested: Optional[bool] = None
    invoice_deleted: Optional[bool] = None


class ServiceRequestNoteCreate(BaseModel):
    note: str


class ServiceRequestClockOutCreate(BaseModel):
    diagnosis: Optional[str] = None
    work_done: Optional[str] = None
    notes: Optional[str] = None


class ServiceRequestResponse(BaseModel):
    id: int
    request_number: str
    facility_id: int
    equipment_id: int
    requester_id: int
    assigned_technician_id: Optional[int] = None
    problem_description: str
    service_required: Optional[str] = None
    preferred_datetime: Optional[datetime] = None
    requested_by_name: Optional[str] = None
    reference_number: Optional[str] = None
    request_image_url: Optional[str] = None
    priority: str
    status: str
    resolution_description: Optional[str] = None
    time_spent_hours: Optional[Decimal] = None
    total_cost: Optional[Decimal] = None
    assigned_at: Optional[datetime] = None
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    
    billing_status: Optional[str] = "pending"
    cc_auth_requested: Optional[bool] = False
    invoice_deleted: Optional[bool] = False
    history: Optional[list] = []
    
    quotations: List[ServiceRequestQuotationResponse] = []

    # Denormalized names for UI display
    facility_name: Optional[str] = None
    equipment_name: Optional[str] = None
    tier_id: Optional[int] = None
    tier_name: Optional[str] = None
    tier_labor_rate_per_hour: Optional[Decimal] = None
    calculated_service_cost: Optional[Decimal] = None
    requester_name: Optional[str] = None
    technician_name: Optional[str] = None

    class Config:
        from_attributes = True


class ServiceRequestListResponse(BaseModel):
    items: List[ServiceRequestResponse]
    total: int
