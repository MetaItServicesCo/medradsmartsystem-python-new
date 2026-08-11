from typing import Optional, List
from datetime import datetime
from decimal import Decimal
from pydantic import BaseModel, Field


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
    payment_channel: Optional[str] = None
    idempotency_key: Optional[str] = None

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
    authorization_id: Optional[int] = None
    payer_role: Optional[str] = None
    paid_by_name: Optional[str] = None

    class Config:
        from_attributes = True


class QuotationAuthorizationRequestCreate(BaseModel):
    notes: Optional[str] = None


class QuotationAuthorizationDecisionCreate(BaseModel):
    decision: str  # authorized / declined
    channel: str  # self_service / phone
    authorized_by_user_id: Optional[int] = None
    notes: Optional[str] = None
    confirmation_reference: Optional[str] = None


class QuotationAuthorizationResponse(BaseModel):
    id: int
    quotation_id: int
    status: str
    authorized_amount: Decimal
    channel: Optional[str] = None
    requested_by_id: Optional[int] = None
    requested_by_name: Optional[str] = None
    authorized_by_id: Optional[int] = None
    authorized_by_name: Optional[str] = None
    authorized_by_role: Optional[str] = None
    recorded_by_id: Optional[int] = None
    recorded_by_name: Optional[str] = None
    confirmation_reference: Optional[str] = None
    notes: Optional[str] = None
    requested_at: Optional[datetime] = None
    decided_at: Optional[datetime] = None
    invalidated_at: Optional[datetime] = None
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class QuotationLedgerEntryResponse(BaseModel):
    id: int
    quotation_id: int
    event_type: str
    actor_id: Optional[int] = None
    actor_name: str
    actor_role: str
    channel: Optional[str] = None
    amount: Optional[Decimal] = None
    reference_number: Optional[str] = None
    details: Optional[dict] = None
    created_at: datetime

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
    authorizations: List[QuotationAuthorizationResponse] = []
    ledger_entries: List[QuotationLedgerEntryResponse] = []

    class Config:
        from_attributes = True

class ServiceRequestQuotationListResponse(ServiceRequestQuotationResponse):
    request_number: str
    facility_name: Optional[str] = None
    facility_id: Optional[int] = None


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


class ServiceRequestPartUsage(BaseModel):
    part_id: int = Field(gt=0)
    quantity: int = Field(gt=0)


class ServiceRequestClockOutCreate(BaseModel):
    diagnosis: Optional[str] = None
    work_done: Optional[str] = None
    notes: Optional[str] = None
    test_equipment_ids: Optional[List[int]] = None
    part_usages: List[ServiceRequestPartUsage] = Field(default_factory=list)
    total_mileage: Optional[Decimal] = None


class ServiceRequestWorkSessionCreate(BaseModel):
    session_id: Optional[str] = Field(default=None, min_length=8, max_length=64, pattern=r"^[A-Za-z0-9_-]+$")
    start_time: Optional[datetime] = None
    end_time: Optional[datetime] = None
    break_minutes: Decimal = Decimal("0")
    total_work_hours: Optional[Decimal] = None
    total_mileage: Optional[Decimal] = None
    diagnosis: Optional[str] = None
    work_done: Optional[str] = None
    notes: Optional[str] = None
    test_equipment_ids: Optional[List[int]] = None
    part_usages: List[ServiceRequestPartUsage] = Field(default_factory=list)
    status: Optional[str] = None


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
    tier_mileage_rate: Optional[Decimal] = None
    calculated_service_cost: Optional[Decimal] = None
    requester_name: Optional[str] = None
    technician_name: Optional[str] = None

    class Config:
        from_attributes = True


class ServiceRequestListResponse(BaseModel):
    items: List[ServiceRequestResponse]
    total: int
    stats: dict[str, int] = Field(default_factory=dict)
