import os
import uuid
from typing import Any, Optional
from datetime import date, datetime, timedelta
from decimal import Decimal
from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status
from pydantic import BaseModel
from sqlalchemy.orm import Session, joinedload

from app import crud
from app.core.deps import get_current_user, get_admin_user
from app.db.base import get_db
from app.models.user import User, UserRole
from app.models.service_request import (
    ServiceRequest, ServiceRequestStatus, Priority,
    ServiceRequestQuotation, QuotationLineItem, QuotationPayment,
)
from app.models.facility import Facility
from app.models.equipment import Equipment
from app.models.invoice import Invoice, InvoiceStatus, InvoiceType
from app.schemas.service_request import (
    ServiceRequestCreate, ServiceRequestUpdate,
    ServiceRequestResponse, ServiceRequestListResponse,
    ServiceRequestQuotationCreate, ServiceRequestQuotationUpdate,
    ServiceRequestQuotationResponse, ServiceRequestQuotationListResponse,
    QuotationPaymentCreate, QuotationPaymentResponse,
    LineItemCreate, ServiceRequestNoteCreate, ServiceRequestClockOutCreate,
)
from app.utils.notifications import create_notification, create_notifications, notify_admins
from app.utils.facility_access import require_facility_access, scope_query_to_user_facilities
from app.utils.invoice_ledger import record_invoice_created, record_payment_delta, record_status_change, transaction_response

router = APIRouter()

SERVICE_REQUEST_UPLOAD_DIR = os.path.join(
    os.path.dirname(os.path.abspath(__file__)),
    "..",
    "..",
    "..",
    "..",
    "uploads",
    "service_request_images",
)
ALLOWED_IMAGE_TYPES = {"image/jpeg", "image/png", "image/gif", "image/webp"}
MAX_IMAGE_SIZE = 8 * 1024 * 1024

# Allowed ordered transitions  (+ cancelled from any state)
VALID_TRANSITIONS = {
    ServiceRequestStatus.NEW: [ServiceRequestStatus.ASSIGNED, ServiceRequestStatus.CANCELLED],
    ServiceRequestStatus.ASSIGNED: [ServiceRequestStatus.IN_PROGRESS, ServiceRequestStatus.CANCELLED],
    ServiceRequestStatus.IN_PROGRESS: [ServiceRequestStatus.COMPLETED, ServiceRequestStatus.CANCELLED],
    ServiceRequestStatus.COMPLETED: [],   # terminal
    ServiceRequestStatus.CANCELLED: [],   # terminal
}


class ServiceInvoiceCreate(BaseModel):
    include_quotations: bool = False
    quotation_ids: Optional[list[int]] = None
    tax_amount: Decimal = Decimal("0")
    discount_amount: Decimal = Decimal("0")
    due_date: Optional[date] = None
    payment_method: Optional[str] = None
    notes: Optional[str] = None


class ServiceInvoiceUpdate(BaseModel):
    amount_paid: Optional[Decimal] = None
    due_date: Optional[date] = None
    status: Optional[InvoiceStatus] = None
    payment_method: Optional[str] = None
    notes: Optional[str] = None


def _money(value: Any) -> Decimal:
    if value in (None, ""):
        return Decimal("0")
    return Decimal(str(value))


def _service_labor_rate(sr: ServiceRequest) -> Decimal:
    tier = sr.equipment.tier if sr.equipment and sr.equipment.tier else None
    return Decimal(str(tier.labor_rate_per_hour or 0)) if tier else Decimal("0")


def _calculate_service_cost(sr: ServiceRequest) -> Decimal:
    hours = Decimal(str(sr.time_spent_hours or 0))
    return (hours * _service_labor_rate(sr)).quantize(Decimal("0.01"))


def _enrich(sr: ServiceRequest) -> dict:
    """Convert ORM object to dict with denormalised display names."""
    data = {c.name: getattr(sr, c.name) for c in sr.__table__.columns}
    # Enums → plain strings
    if data.get("priority"):
        data["priority"] = data["priority"].value if hasattr(data["priority"], "value") else data["priority"]
    if data.get("status"):
        data["status"] = data["status"].value if hasattr(data["status"], "value") else data["status"]
    data["history"] = data.get("history") or []
    # Nested names
    data["facility_name"] = sr.facility.name if sr.facility else None
    data["equipment_name"] = f"{sr.equipment.make} {sr.equipment.model}" if sr.equipment else None
    tier = sr.equipment.tier if sr.equipment and sr.equipment.tier else None
    data["tier_id"] = tier.id if tier else None
    data["tier_name"] = tier.name if tier else None
    data["tier_labor_rate_per_hour"] = tier.labor_rate_per_hour if tier else None
    data["calculated_service_cost"] = _calculate_service_cost(sr)
    data["requester_name"] = sr.requester.full_name if sr.requester else None
    data["technician_name"] = sr.assigned_technician.full_name if sr.assigned_technician else None
    # Quotations (multiple)
    data["quotations"] = []
    if sr.quotations:
        for q in sr.quotations:
            q_data = {c.name: getattr(q, c.name) for c in q.__table__.columns}
            q_data["line_items"] = [
                {c.name: getattr(li, c.name) for c in li.__table__.columns}
                for li in (q.line_items or [])
            ]
            q_data["payments"] = [
                {c.name: getattr(p, c.name) for c in p.__table__.columns}
                for p in (q.payments or [])
            ]
            data["quotations"].append(q_data)
    return data


def _history_value(value: Any) -> Any:
    if hasattr(value, "value"):
        return value.value
    if isinstance(value, datetime):
        return value.isoformat()
    if isinstance(value, Decimal):
        return float(value)
    return value


def _history_entry(action: str, user: User, changes: Optional[dict] = None) -> dict:
    return {
        "timestamp": datetime.utcnow().isoformat(),
        "action": action,
        "user_id": user.id,
        "user": user.full_name or user.username,
        "changes": changes or {},
    }


def _can_work_on_service(user: User, sr: ServiceRequest) -> bool:
    if user.role in [UserRole.SUPERADMIN, UserRole.ADMIN]:
        return True
    return sr.assigned_technician_id == user.id


def _active_clock_session(sr: ServiceRequest) -> Optional[dict]:
    for entry in reversed(sr.history or []):
        action = entry.get("action")
        if action == "technician_clock_out":
            return None
        if action == "technician_clock_in":
            return entry
    return None


def _next_service_invoice_number(db: Session) -> str:
    last = db.query(Invoice).order_by(Invoice.id.desc()).first()
    next_num = (last.id + 1) if last else 1
    return f"INV-SERVICE-{next_num:06d}"


def _facility_billing_address(facility: Optional[Facility]) -> Optional[str]:
    if not facility:
        return None
    billing_parts = [
        facility.billing_street,
        facility.billing_suite,
        facility.billing_city,
        facility.billing_state,
        facility.billing_zip_code,
    ]
    billing_address = ", ".join([part for part in billing_parts if part])
    return billing_address or facility.address


def _service_invoice_line_items(invoice: Invoice) -> list[dict[str, Any]]:
    sr = invoice.service_request
    if not sr:
        return []
    rows: list[dict[str, Any]] = []
    hours = _money(sr.time_spent_hours).quantize(Decimal("0.01"))
    labor_rate = _service_labor_rate(sr)
    labor_total = _calculate_service_cost(sr)
    rows.append({
        "item_number": sr.request_number,
        "description": f"Service labor - {sr.equipment.make} {sr.equipment.model}" if sr.equipment else "Service labor",
        "quantity": hours,
        "unit_price": labor_rate,
        "shipping_fee": Decimal("0"),
        "setup_fee": Decimal("0"),
        "condition": None,
        "total_amount": labor_total,
    })

    for quotation in sr.quotations or []:
        if quotation.status != "included_in_invoice":
            continue
        if quotation.line_items:
            for line in quotation.line_items:
                rows.append({
                    "item_number": quotation.quotation_number,
                    "description": line.description,
                    "quantity": line.quantity,
                    "unit_price": line.unit_price,
                    "shipping_fee": Decimal("0"),
                    "setup_fee": Decimal("0"),
                    "condition": line.item_type,
                    "total_amount": line.total,
                })
        else:
            rows.append({
                "item_number": quotation.quotation_number,
                "description": quotation.description or "Service quotation",
                "quantity": Decimal("1"),
                "unit_price": quotation.amount,
                "shipping_fee": Decimal("0"),
                "setup_fee": Decimal("0"),
                "condition": None,
                "total_amount": quotation.amount,
            })
    return rows


def _service_invoice_response(invoice: Invoice) -> dict[str, Any]:
    sr = invoice.service_request
    return {
        "id": invoice.id,
        "invoice_number": invoice.invoice_number,
        "invoice_type": invoice.invoice_type.value if hasattr(invoice.invoice_type, "value") else invoice.invoice_type,
        "service_request_id": invoice.service_request_id,
        "request_number": sr.request_number if sr else None,
        "customer_name": invoice.customer_name,
        "customer_email": invoice.customer_email,
        "customer_phone": invoice.customer_phone,
        "customer_address": invoice.customer_address,
        "facility_id": invoice.facility_id,
        "facility_name": invoice.facility.name if invoice.facility else None,
        "subtotal": invoice.subtotal,
        "tax_amount": invoice.tax_amount,
        "discount_amount": invoice.discount_amount,
        "total_amount": invoice.total_amount,
        "amount_paid": invoice.amount_paid,
        "balance_due": invoice.balance_due,
        "status": invoice.status.value if hasattr(invoice.status, "value") else invoice.status,
        "issue_date": invoice.issue_date,
        "due_date": invoice.due_date,
        "payment_method": invoice.payment_method,
        "notes": invoice.notes,
        "created_at": invoice.created_at,
        "updated_at": invoice.updated_at,
        "transactions": [transaction_response(item) for item in invoice.transactions or []],
        "line_items": _service_invoice_line_items(invoice),
    }


def _load_service_request_for_work(db: Session, request_id: int, current_user: User) -> ServiceRequest:
    db_sr = db.query(ServiceRequest).filter(ServiceRequest.id == request_id).first()
    if not db_sr:
        raise HTTPException(status_code=404, detail="Service request not found")
    require_facility_access(db, current_user, db_sr.facility_id)
    if not _can_work_on_service(current_user, db_sr):
        raise HTTPException(status_code=403, detail="Only the assigned technician or an admin can update service work")
    if db_sr.status in [ServiceRequestStatus.COMPLETED, ServiceRequestStatus.CANCELLED]:
        raise HTTPException(status_code=400, detail="Completed or cancelled service requests cannot be updated")
    if not db_sr.assigned_technician_id:
        raise HTTPException(status_code=400, detail="Assign a technician before starting work")
    return db_sr


# ── LIST ─────────────────────────────────────────────────────────────────────

@router.get("/", response_model=ServiceRequestListResponse)
def list_service_requests(
    db: Session = Depends(get_db),
    status: Optional[str] = Query(None),
    priority: Optional[str] = Query(None),
    facility_id: Optional[int] = Query(None),
    search: Optional[str] = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
    current_user: User = Depends(get_current_user),
) -> Any:
    """List service requests with filters."""
    query = (
        scope_query_to_user_facilities(db.query(ServiceRequest), ServiceRequest.facility_id, db, current_user)
        .options(
            joinedload(ServiceRequest.facility),
            joinedload(ServiceRequest.equipment).joinedload(Equipment.tier),
            joinedload(ServiceRequest.requester),
            joinedload(ServiceRequest.assigned_technician),
            joinedload(ServiceRequest.quotations).joinedload(ServiceRequestQuotation.line_items),
            joinedload(ServiceRequest.quotations).joinedload(ServiceRequestQuotation.payments),
        )
    )

    if status:
        query = query.filter(ServiceRequest.status == status)
    if priority:
        query = query.filter(ServiceRequest.priority == priority)
    if facility_id:
        query = query.filter(ServiceRequest.facility_id == facility_id)
    if search:
        query = query.filter(
            ServiceRequest.request_number.ilike(f"%{search}%")
            | ServiceRequest.problem_description.ilike(f"%{search}%")
        )

    total = query.count()
    items = query.order_by(ServiceRequest.created_at.desc()).offset(skip).limit(limit).all()
    return {"items": [_enrich(sr) for sr in items], "total": total}


# ── GET ONE ──────────────────────────────────────────────────────────────────

# --- SERVICE INVOICES -------------------------------------------------------

@router.get("/invoices")
def list_service_invoices(
    db: Session = Depends(get_db),
    status_filter: Optional[InvoiceStatus] = Query(None, alias="status"),
    current_user: User = Depends(get_current_user),
) -> Any:
    """List generated service invoices for billing."""
    query = (
        scope_query_to_user_facilities(db.query(Invoice), Invoice.facility_id, db, current_user)
        .options(
            joinedload(Invoice.facility),
            joinedload(Invoice.transactions),
            joinedload(Invoice.service_request).joinedload(ServiceRequest.equipment).joinedload(Equipment.tier),
            joinedload(Invoice.service_request).joinedload(ServiceRequest.quotations).joinedload(ServiceRequestQuotation.line_items),
        )
        .filter(Invoice.invoice_type == InvoiceType.SERVICE)
    )
    if status_filter:
        query = query.filter(Invoice.status == status_filter)
    invoices = query.order_by(Invoice.created_at.desc()).all()
    return {"items": [_service_invoice_response(invoice) for invoice in invoices], "total": len(invoices)}


@router.put("/invoices/{invoice_id}")
def update_service_invoice(
    invoice_id: int,
    payload: ServiceInvoiceUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Any:
    """Update a generated service invoice and record ledger transactions."""
    invoice = (
        db.query(Invoice)
        .options(
            joinedload(Invoice.facility),
            joinedload(Invoice.transactions),
            joinedload(Invoice.service_request).joinedload(ServiceRequest.equipment).joinedload(Equipment.tier),
            joinedload(Invoice.service_request).joinedload(ServiceRequest.quotations).joinedload(ServiceRequestQuotation.line_items),
        )
        .filter(Invoice.id == invoice_id, Invoice.invoice_type == InvoiceType.SERVICE)
        .first()
    )
    if not invoice:
        raise HTTPException(status_code=404, detail="Service invoice not found")
    if invoice.facility_id is not None:
        require_facility_access(db, current_user, invoice.facility_id)

    previous_paid = invoice.amount_paid
    previous_status = invoice.status
    update_data = payload.model_dump(exclude_unset=True)
    for field in ["amount_paid", "due_date", "notes", "status", "payment_method"]:
        if field in update_data:
            setattr(invoice, field, update_data[field])

    invoice.balance_due = _money(invoice.total_amount) - _money(invoice.amount_paid)
    if invoice.balance_due <= 0:
        invoice.status = InvoiceStatus.PAID
    elif _money(invoice.amount_paid) > 0 and invoice.status != InvoiceStatus.CANCELLED:
        invoice.status = InvoiceStatus.PARTIALLY_PAID
    invoice.updated_at = datetime.utcnow()

    if invoice.service_request:
        invoice.service_request.billing_status = "approved"
        history = list(invoice.service_request.history or [])
        history.append(_history_entry("service_invoice_updated", current_user, {
            "invoice_id": invoice.id,
            "invoice_number": invoice.invoice_number,
            "status": invoice.status.value if hasattr(invoice.status, "value") else invoice.status,
            "amount_paid": str(invoice.amount_paid),
            "balance_due": str(invoice.balance_due),
        }))
        invoice.service_request.history = history

    record_payment_delta(db, invoice, previous_paid, invoice.amount_paid, current_user, invoice.payment_method, update_data.get("notes"))
    record_status_change(db, invoice, previous_status, current_user)
    db.commit()
    db.refresh(invoice)
    return _service_invoice_response(invoice)


@router.get("/{request_id}", response_model=ServiceRequestResponse)
def get_service_request(
    request_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Any:
    """Get a single service request by ID."""
    sr = (
        db.query(ServiceRequest)
        .options(
            joinedload(ServiceRequest.facility),
            joinedload(ServiceRequest.equipment).joinedload(Equipment.tier),
            joinedload(ServiceRequest.requester),
            joinedload(ServiceRequest.assigned_technician),
            joinedload(ServiceRequest.quotations).joinedload(ServiceRequestQuotation.line_items),
            joinedload(ServiceRequest.quotations).joinedload(ServiceRequestQuotation.payments),
        )
        .filter(ServiceRequest.id == request_id)
        .first()
    )
    if not sr:
        raise HTTPException(status_code=404, detail="Service request not found")
    require_facility_access(db, current_user, sr.facility_id)
    return _enrich(sr)


@router.post("/upload")
async def upload_service_request_image(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
) -> Any:
    """Upload an image attachment for a service request."""
    if file.content_type not in ALLOWED_IMAGE_TYPES:
        raise HTTPException(status_code=400, detail="Only JPG, PNG, GIF, and WebP images are allowed")

    content = await file.read()
    if len(content) > MAX_IMAGE_SIZE:
        raise HTTPException(status_code=400, detail="Image too large. Maximum size is 8MB")

    os.makedirs(SERVICE_REQUEST_UPLOAD_DIR, exist_ok=True)
    file_ext = os.path.splitext(file.filename or "image")[1].lower()
    if file_ext not in {".jpg", ".jpeg", ".png", ".gif", ".webp"}:
        file_ext = ".jpg"

    stored_name = f"{uuid.uuid4().hex}{file_ext}"
    file_path = os.path.join(SERVICE_REQUEST_UPLOAD_DIR, stored_name)
    with open(file_path, "wb") as f:
        f.write(content)

    return {
        "file_url": f"/uploads/service_request_images/{stored_name}",
        "file_name": file.filename or stored_name,
        "file_size": len(content),
        "file_type": file.content_type,
    }


# ── CREATE ───────────────────────────────────────────────────────────────────

@router.post("/", response_model=ServiceRequestResponse, status_code=status.HTTP_201_CREATED)
def create_service_request(
    sr_in: ServiceRequestCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),  # any authenticated user
) -> Any:
    """Create a new service request (any authenticated user)."""
    # Validate facility
    if not db.query(Facility).filter(Facility.id == sr_in.facility_id).first():
        raise HTTPException(status_code=404, detail="Facility not found")
    require_facility_access(db, current_user, sr_in.facility_id)
    # Validate equipment
    equipment = db.query(Equipment).filter(Equipment.id == sr_in.equipment_id).first()
    if not equipment:
        raise HTTPException(status_code=404, detail="Equipment not found")
    if equipment.facility_id != sr_in.facility_id:
        raise HTTPException(status_code=400, detail="Equipment does not belong to the selected facility")

    # Generate unique request number
    last = db.query(ServiceRequest).order_by(ServiceRequest.id.desc()).first()
    next_num = (last.id + 1) if last else 1
    request_number = f"SR-{next_num:06d}"

    db_sr = ServiceRequest(
        request_number=request_number,
        facility_id=sr_in.facility_id,
        equipment_id=sr_in.equipment_id,
        problem_description=sr_in.problem_description,
        service_required=sr_in.service_required or sr_in.problem_description,
        preferred_datetime=sr_in.preferred_datetime,
        requested_by_name=sr_in.requested_by_name,
        reference_number=sr_in.reference_number,
        request_image_url=sr_in.request_image_url,
        priority=sr_in.priority,
        requester_id=sr_in.requester_id or current_user.id,
        status=ServiceRequestStatus.NEW,
        history=[_history_entry("created", current_user, {
            "facility_id": sr_in.facility_id,
            "equipment_id": sr_in.equipment_id,
            "priority": sr_in.priority,
            "preferred_datetime": sr_in.preferred_datetime.isoformat() if sr_in.preferred_datetime else None,
            "requested_by_name": sr_in.requested_by_name,
            "reference_number": sr_in.reference_number,
        })],
    )
    db.add(db_sr)
    db.commit()
    db.refresh(db_sr)
    notify_admins(
        db,
        title="New service request",
        message=f"Service request {db_sr.request_number} was created.",
        notification_type="service_request",
        link_url=f"/service-requests/{db_sr.id}",
        actor_id=current_user.id,
    )
    if db_sr.requester_id != current_user.id:
        create_notification(
            db,
            user_id=db_sr.requester_id,
            title="Service request created",
            message=f"Service request {db_sr.request_number} was created for you.",
            notification_type="service_request",
            link_url=f"/service-requests/{db_sr.id}",
            actor_id=current_user.id,
        )
    db.commit()

    # Re-query with joins for response
    return _enrich(
        db.query(ServiceRequest)
        .options(
            joinedload(ServiceRequest.facility),
            joinedload(ServiceRequest.equipment).joinedload(Equipment.tier),
            joinedload(ServiceRequest.requester),
            joinedload(ServiceRequest.assigned_technician),
            joinedload(ServiceRequest.quotations),
        )
        .filter(ServiceRequest.id == db_sr.id)
        .first()
    )


# ── UPDATE (with ordered transitions) ───────────────────────────────────────

@router.patch("/{request_id}", response_model=ServiceRequestResponse)
def update_service_request(
    request_id: int,
    sr_in: ServiceRequestUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Any:
    """Update a service request. Status changes follow ordered transitions."""
    db_sr = db.query(ServiceRequest).filter(ServiceRequest.id == request_id).first()
    if not db_sr:
        raise HTTPException(status_code=404, detail="Service request not found")
    require_facility_access(db, current_user, db_sr.facility_id)

    update_data = sr_in.model_dump(exclude_unset=True)
    changes = {}

    # Enforce ordered status transitions
    if "status" in update_data and update_data["status"]:
        new_status = ServiceRequestStatus(update_data["status"])
        current_status = db_sr.status
        allowed = VALID_TRANSITIONS.get(current_status, [])

        if new_status not in allowed:
            raise HTTPException(
                status_code=400,
                detail=f"Cannot transition from '{current_status.value}' to '{new_status.value}'. "
                       f"Allowed: {[s.value for s in allowed]}",
            )

        # Auto-set timestamps based on transition
        if new_status == ServiceRequestStatus.ASSIGNED:
            update_data["assigned_at"] = datetime.utcnow()
        elif new_status == ServiceRequestStatus.IN_PROGRESS:
            update_data["started_at"] = datetime.utcnow()
        elif new_status == ServiceRequestStatus.COMPLETED:
            if _active_clock_session(db_sr):
                raise HTTPException(status_code=400, detail="Clock out before marking this service request complete")
            update_data["completed_at"] = datetime.utcnow()
            update_data["total_cost"] = _calculate_service_cost(db_sr)

    for field, value in update_data.items():
        before = getattr(db_sr, field, None)
        if _history_value(before) != _history_value(value):
            changes[field] = {"from": _history_value(before), "to": _history_value(value)}
        setattr(db_sr, field, value)

    if "time_spent_hours" in update_data and "total_cost" not in update_data:
        db_sr.total_cost = _calculate_service_cost(db_sr)

    if changes:
        history = list(db_sr.history or [])
        history.append(_history_entry("status_changed" if "status" in changes else "updated", current_user, changes))
        db_sr.history = history

    db.commit()
    db.refresh(db_sr)
    recipients = {db_sr.requester_id}
    if db_sr.assigned_technician_id:
        recipients.add(db_sr.assigned_technician_id)
    create_notifications(
        db,
        user_ids=[uid for uid in recipients if uid and uid != current_user.id],
        title="Service request updated",
        message=f"Service request {db_sr.request_number} was updated.",
        notification_type="service_request",
        link_url=f"/service-requests/{db_sr.id}",
        actor_id=current_user.id,
    )
    if "assigned_technician_id" in update_data and db_sr.assigned_technician_id:
        create_notification(
            db,
            user_id=db_sr.assigned_technician_id,
            title="Service request assigned",
            message=f"You were assigned to {db_sr.request_number}.",
            notification_type="service_request",
            link_url=f"/service-requests/{db_sr.id}",
            actor_id=current_user.id,
        )
    db.commit()

    return _enrich(
        db.query(ServiceRequest)
        .options(
            joinedload(ServiceRequest.facility),
            joinedload(ServiceRequest.equipment).joinedload(Equipment.tier),
            joinedload(ServiceRequest.requester),
            joinedload(ServiceRequest.assigned_technician),
            joinedload(ServiceRequest.quotations).joinedload(ServiceRequestQuotation.line_items),
            joinedload(ServiceRequest.quotations).joinedload(ServiceRequestQuotation.payments),
        )
        .filter(ServiceRequest.id == db_sr.id)
        .first()
    )


# ── DELETE ───────────────────────────────────────────────────────────────────

@router.post("/{request_id}/generate-invoice")
def generate_service_invoice(
    request_id: int,
    payload: ServiceInvoiceCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Any:
    """Generate a service invoice from completed work, optionally bundling service quotations."""
    if current_user.role not in [
        UserRole.SUPERADMIN,
        UserRole.ADMIN,
        UserRole.FACILITY_ADMIN,
        UserRole.FACILITY_MANAGER,
        UserRole.TECHNICIAN,
    ]:
        raise HTTPException(status_code=403, detail="Not enough permissions")

    db_sr = (
        db.query(ServiceRequest)
        .options(
            joinedload(ServiceRequest.facility),
            joinedload(ServiceRequest.equipment).joinedload(Equipment.tier),
            joinedload(ServiceRequest.quotations).joinedload(ServiceRequestQuotation.line_items),
        )
        .filter(ServiceRequest.id == request_id)
        .first()
    )
    if not db_sr:
        raise HTTPException(status_code=404, detail="Service request not found")
    require_facility_access(db, current_user, db_sr.facility_id)
    if db_sr.status != ServiceRequestStatus.COMPLETED:
        raise HTTPException(status_code=400, detail="Complete the service request before generating an invoice")

    existing_invoice = (
        db.query(Invoice)
        .options(
            joinedload(Invoice.facility),
            joinedload(Invoice.transactions),
            joinedload(Invoice.service_request).joinedload(ServiceRequest.equipment).joinedload(Equipment.tier),
            joinedload(Invoice.service_request).joinedload(ServiceRequest.quotations).joinedload(ServiceRequestQuotation.line_items),
        )
        .filter(
            Invoice.invoice_type == InvoiceType.SERVICE,
            Invoice.service_request_id == request_id,
            Invoice.status != InvoiceStatus.CANCELLED,
        )
        .first()
    )
    if existing_invoice:
        return _service_invoice_response(existing_invoice)

    selected_quotations: list[ServiceRequestQuotation] = []
    if payload.include_quotations:
        eligible = [
            quotation for quotation in (db_sr.quotations or [])
            if quotation.status not in {"paid", "included_in_invoice", "cancelled", "rejected"}
        ]
        selected_ids = set(payload.quotation_ids or [])
        selected_quotations = [
            quotation for quotation in eligible
            if not selected_ids or quotation.id in selected_ids
        ]

    service_amount = _calculate_service_cost(db_sr)
    quotation_amount = sum((_money(quotation.amount) for quotation in selected_quotations), Decimal("0"))
    subtotal = (service_amount + quotation_amount).quantize(Decimal("0.01"))
    tax_amount = _money(payload.tax_amount).quantize(Decimal("0.01"))
    discount_amount = _money(payload.discount_amount).quantize(Decimal("0.01"))
    total_amount = max((subtotal + tax_amount - discount_amount).quantize(Decimal("0.01")), Decimal("0"))

    facility = db_sr.facility
    invoice = Invoice(
        invoice_number=_next_service_invoice_number(db),
        invoice_type=InvoiceType.SERVICE,
        customer_name=(facility.billing_name or facility.name) if facility else (db_sr.requested_by_name or "Service Customer"),
        customer_email=(facility.billing_email or facility.email) if facility else "billing@example.com",
        customer_phone=facility.phone if facility else None,
        customer_address=_facility_billing_address(facility),
        facility_id=db_sr.facility_id,
        service_request_id=db_sr.id,
        subtotal=subtotal,
        tax_amount=tax_amount,
        discount_amount=discount_amount,
        total_amount=total_amount,
        amount_paid=Decimal("0"),
        balance_due=total_amount,
        status=InvoiceStatus.PENDING,
        issue_date=date.today(),
        due_date=payload.due_date or date.today() + timedelta(days=30),
        payment_terms="Net 30",
        payment_method=payload.payment_method,
        notes=payload.notes or f"Service invoice for {db_sr.request_number}.",
    )
    db.add(invoice)
    db.flush()
    record_invoice_created(db, invoice, current_user, f"Service invoice created for {db_sr.request_number}")

    for quotation in selected_quotations:
        quotation.status = "included_in_invoice"
        quotation.updated_at = datetime.utcnow()

    db_sr.billing_status = "approved"
    db_sr.invoice_deleted = False
    history = list(db_sr.history or [])
    history.append(_history_entry("service_invoice_generated", current_user, {
        "invoice_id": invoice.id,
        "invoice_number": invoice.invoice_number,
        "service_amount": str(service_amount),
        "included_quotation_ids": [quotation.id for quotation in selected_quotations],
        "included_quotation_total": str(quotation_amount),
        "total_amount": str(total_amount),
        "quotations_billed_separately": not payload.include_quotations,
    }))
    db_sr.history = history
    create_notifications(
        db,
        user_ids=[uid for uid in {db_sr.requester_id, db_sr.assigned_technician_id} if uid and uid != current_user.id],
        title="Service invoice generated",
        message=f"Invoice {invoice.invoice_number} was generated for {db_sr.request_number}.",
        notification_type="service_request",
        link_url=f"/billing?highlightInvoice={invoice.id}",
        actor_id=current_user.id,
    )
    db.commit()
    db.refresh(invoice)
    return _service_invoice_response(invoice)


@router.post("/{request_id}/clock-in", response_model=ServiceRequestResponse)
def clock_in_service_request(
    request_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Any:
    """Start a technician work session and move the request into progress."""
    db_sr = _load_service_request_for_work(db, request_id, current_user)
    if _active_clock_session(db_sr):
        raise HTTPException(status_code=400, detail="A work session is already active for this service request")

    now = datetime.utcnow()
    if db_sr.status == ServiceRequestStatus.ASSIGNED:
        db_sr.status = ServiceRequestStatus.IN_PROGRESS
        if not db_sr.started_at:
            db_sr.started_at = now
    elif db_sr.status != ServiceRequestStatus.IN_PROGRESS:
        raise HTTPException(status_code=400, detail="Service request must be assigned before clock-in")

    session_id = uuid.uuid4().hex
    history = list(db_sr.history or [])
    history.append(_history_entry("technician_clock_in", current_user, {
        "session_id": session_id,
        "clocked_in_at": now.isoformat(),
    }))
    db_sr.history = history
    db.commit()
    db.refresh(db_sr)
    return _enrich(
        db.query(ServiceRequest)
        .options(
            joinedload(ServiceRequest.facility),
            joinedload(ServiceRequest.equipment).joinedload(Equipment.tier),
            joinedload(ServiceRequest.requester),
            joinedload(ServiceRequest.assigned_technician),
            joinedload(ServiceRequest.quotations).joinedload(ServiceRequestQuotation.line_items),
            joinedload(ServiceRequest.quotations).joinedload(ServiceRequestQuotation.payments),
        )
        .filter(ServiceRequest.id == db_sr.id)
        .first()
    )


@router.post("/{request_id}/clock-out", response_model=ServiceRequestResponse)
def clock_out_service_request(
    request_id: int,
    clock_out: ServiceRequestClockOutCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Any:
    """End the active technician work session, add duration, and store session report details."""
    db_sr = _load_service_request_for_work(db, request_id, current_user)
    active = _active_clock_session(db_sr)
    if not active:
        raise HTTPException(status_code=400, detail="No active work session found")

    diagnosis = (clock_out.diagnosis or "").strip()
    work_done = (clock_out.work_done or "").strip()
    notes = (clock_out.notes or "").strip()
    if not diagnosis and not work_done and not notes:
        raise HTTPException(status_code=400, detail="Add diagnosis, work done, or notes before clocking out")

    now = datetime.utcnow()
    changes = active.get("changes") or {}
    clocked_in_at = datetime.fromisoformat(changes.get("clocked_in_at") or active.get("timestamp"))
    duration_hours = max((now - clocked_in_at).total_seconds() / 3600, 0)
    rounded_hours = Decimal(str(round(duration_hours, 2)))
    existing_hours = Decimal(str(db_sr.time_spent_hours or 0))
    db_sr.time_spent_hours = existing_hours + rounded_hours
    db_sr.total_cost = _calculate_service_cost(db_sr)

    history = list(db_sr.history or [])
    history.append(_history_entry("technician_clock_out", current_user, {
        "session_id": changes.get("session_id"),
        "clocked_in_at": clocked_in_at.isoformat(),
        "clocked_out_at": now.isoformat(),
        "duration_hours": float(rounded_hours),
        "total_hours": float(db_sr.time_spent_hours or 0),
        "diagnosis": diagnosis,
        "work_done": work_done,
        "notes": notes,
    }))
    db_sr.history = history
    db.commit()
    db.refresh(db_sr)
    return _enrich(
        db.query(ServiceRequest)
        .options(
            joinedload(ServiceRequest.facility),
            joinedload(ServiceRequest.equipment).joinedload(Equipment.tier),
            joinedload(ServiceRequest.requester),
            joinedload(ServiceRequest.assigned_technician),
            joinedload(ServiceRequest.quotations).joinedload(ServiceRequestQuotation.line_items),
            joinedload(ServiceRequest.quotations).joinedload(ServiceRequestQuotation.payments),
        )
        .filter(ServiceRequest.id == db_sr.id)
        .first()
    )


@router.post("/{request_id}/notes", response_model=ServiceRequestResponse)
def add_service_request_note(
    request_id: int,
    note_in: ServiceRequestNoteCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Any:
    """Append a technician/admin service note to the request history."""
    note = (note_in.note or "").strip()
    if not note:
        raise HTTPException(status_code=400, detail="Note is required")
    db_sr = _load_service_request_for_work(db, request_id, current_user)
    history = list(db_sr.history or [])
    history.append(_history_entry("service_note", current_user, {"note": note}))
    db_sr.history = history
    db.commit()
    db.refresh(db_sr)
    return _enrich(
        db.query(ServiceRequest)
        .options(
            joinedload(ServiceRequest.facility),
            joinedload(ServiceRequest.equipment).joinedload(Equipment.tier),
            joinedload(ServiceRequest.requester),
            joinedload(ServiceRequest.assigned_technician),
            joinedload(ServiceRequest.quotations).joinedload(ServiceRequestQuotation.line_items),
            joinedload(ServiceRequest.quotations).joinedload(ServiceRequestQuotation.payments),
        )
        .filter(ServiceRequest.id == db_sr.id)
        .first()
    )


@router.delete("/{request_id}")
def delete_service_request(
    request_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_admin_user),  # admin only
) -> Any:
    """Delete a service request (admin only)."""
    db_sr = db.query(ServiceRequest).filter(ServiceRequest.id == request_id).first()
    if not db_sr:
        raise HTTPException(status_code=404, detail="Service request not found")
    require_facility_access(db, current_user, db_sr.facility_id)
    db.delete(db_sr)
    db.commit()
    return {"detail": "Service request deleted"}


# ══════════════════════════════════════════════════════════════════════════════
# ── QUOTATION ENDPOINTS ──────────────────────────────────────────────────────
# ══════════════════════════════════════════════════════════════════════════════

@router.post("/{request_id}/quotations", response_model=ServiceRequestQuotationResponse, status_code=status.HTTP_201_CREATED)
def create_quotation(
    request_id: int,
    quotation_in: ServiceRequestQuotationCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Any:
    """Create a new quotation for a service request. Multiple quotations allowed.
    Quotation can only be created if the service is NOT completed."""
    if current_user.role not in [UserRole.SUPERADMIN, UserRole.ADMIN, UserRole.TECHNICIAN]:
        raise HTTPException(status_code=403, detail="Not enough permissions")

    db_sr = db.query(ServiceRequest).filter(ServiceRequest.id == request_id).first()
    if not db_sr:
        raise HTTPException(status_code=404, detail="Service request not found")
    require_facility_access(db, current_user, db_sr.facility_id)

    if db_sr.status == ServiceRequestStatus.COMPLETED:
        raise HTTPException(status_code=400, detail="Cannot create quotation for a completed service request")

    # Generate quotation number
    count = db.query(ServiceRequestQuotation).filter(
        ServiceRequestQuotation.service_request_id == request_id
    ).count()
    quotation_number = f"{db_sr.request_number}-Q{count + 1:02d}"

    # Calculate total from line items
    total_amount = Decimal("0")
    if quotation_in.line_items:
        total_amount = sum(li.total for li in quotation_in.line_items)

    db_quotation = ServiceRequestQuotation(
        service_request_id=request_id,
        created_by_id=current_user.id,
        quotation_number=quotation_number,
        amount=total_amount,
        description=quotation_in.description,
    )
    db.add(db_quotation)
    db.flush()

    # Add line items
    if quotation_in.line_items:
        for li in quotation_in.line_items:
            db_item = QuotationLineItem(
                quotation_id=db_quotation.id,
                item_type=li.item_type,
                description=li.description,
                quantity=li.quantity,
                unit_price=li.unit_price,
                total=li.total,
            )
            db.add(db_item)

    db.commit()
    db.refresh(db_quotation)
    create_notifications(
        db,
        user_ids=[uid for uid in {db_sr.requester_id, db_sr.assigned_technician_id} if uid and uid != current_user.id],
        title="Quotation created",
        message=f"Quotation {quotation_number} was created for {db_sr.request_number}.",
        notification_type="service_request",
        link_url=f"/service-requests/{request_id}",
        actor_id=current_user.id,
    )
    db.commit()

    return db_quotation


@router.put("/quotations/{quotation_id}", response_model=ServiceRequestQuotationResponse)
def update_quotation(
    quotation_id: int,
    quotation_in: ServiceRequestQuotationUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Any:
    """Update a quotation. Editable until the service request is completed."""
    if current_user.role not in [UserRole.SUPERADMIN, UserRole.ADMIN, UserRole.TECHNICIAN]:
        raise HTTPException(status_code=403, detail="Not enough permissions")

    db_quotation = (
        db.query(ServiceRequestQuotation)
        .options(
            joinedload(ServiceRequestQuotation.service_request),
            joinedload(ServiceRequestQuotation.line_items),
        )
        .filter(ServiceRequestQuotation.id == quotation_id)
        .first()
    )
    if not db_quotation:
        raise HTTPException(status_code=404, detail="Quotation not found")
    require_facility_access(db, current_user, db_quotation.service_request.facility_id)

    if db_quotation.service_request.status == ServiceRequestStatus.COMPLETED:
        raise HTTPException(status_code=400, detail="Cannot edit quotation after service is completed")

    update_data = quotation_in.model_dump(exclude_unset=True)

    if "description" in update_data:
        db_quotation.description = update_data["description"]
    if "status" in update_data:
        db_quotation.status = update_data["status"]

    # Replace line items if provided
    if "line_items" in update_data and update_data["line_items"] is not None:
        old_amount = db_quotation.amount
        
        # Remove old line items
        db.query(QuotationLineItem).filter(
            QuotationLineItem.quotation_id == quotation_id
        ).delete()

        total_amount = Decimal("0")
        for li_data in quotation_in.line_items:
            db_item = QuotationLineItem(
                quotation_id=quotation_id,
                item_type=li_data.item_type,
                description=li_data.description,
                quantity=li_data.quantity,
                unit_price=li_data.unit_price,
                total=li_data.total,
            )
            db.add(db_item)
            total_amount += li_data.total
            
        if total_amount != old_amount:
            # Initialize revision_history if null
            rev_history = list(db_quotation.revision_history) if db_quotation.revision_history else []
            difference = total_amount - old_amount
            
            # Format history entry
            history_entry = {
                "timestamp": datetime.utcnow().isoformat(),
                "user": current_user.full_name or current_user.username,
                "old_amount": float(old_amount),
                "new_amount": float(total_amount),
                "difference": float(difference),
            }
            rev_history.append(history_entry)
            
            # Re-assign so SQLAlchemy detects the change
            db_quotation.revision_history = rev_history

        db_quotation.amount = total_amount

    db_quotation.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(db_quotation)
    sr = db_quotation.service_request
    create_notifications(
        db,
        user_ids=[uid for uid in {sr.requester_id, sr.assigned_technician_id} if uid and uid != current_user.id],
        title="Quotation updated",
        message=f"Quotation {db_quotation.quotation_number} was updated.",
        notification_type="service_request",
        link_url=f"/service-requests/{sr.id}",
        actor_id=current_user.id,
    )
    db.commit()

    return db_quotation


@router.delete("/quotations/{quotation_id}")
def delete_quotation(
    quotation_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Any:
    """Delete a quotation."""
    if current_user.role not in [UserRole.SUPERADMIN, UserRole.ADMIN, UserRole.TECHNICIAN]:
        raise HTTPException(status_code=403, detail="Not enough permissions")

    db_quotation = (
        db.query(ServiceRequestQuotation)
        .options(joinedload(ServiceRequestQuotation.service_request))
        .filter(ServiceRequestQuotation.id == quotation_id)
        .first()
    )
    if not db_quotation:
        raise HTTPException(status_code=404, detail="Quotation not found")
    require_facility_access(db, current_user, db_quotation.service_request.facility_id)

    if db_quotation.service_request.status == ServiceRequestStatus.COMPLETED:
        raise HTTPException(status_code=400, detail="Cannot delete quotation after service is completed")

    db.delete(db_quotation)
    db.commit()
    return {"detail": "Quotation deleted"}


@router.get("/quotations/all", response_model=list[ServiceRequestQuotationListResponse])
def get_all_quotations(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Any:
    """Get all service request quotations."""
    quotations = (
        db.query(ServiceRequestQuotation)
        .join(ServiceRequest, ServiceRequest.id == ServiceRequestQuotation.service_request_id)
        .options(
            joinedload(ServiceRequestQuotation.service_request).joinedload(ServiceRequest.facility),
            joinedload(ServiceRequestQuotation.line_items),
            joinedload(ServiceRequestQuotation.payments),
        )
        .order_by(ServiceRequestQuotation.created_at.desc())
    )
    quotations = scope_query_to_user_facilities(quotations, ServiceRequest.facility_id, db, current_user).all()

    result = []
    for q in quotations:
        q_dict = {c.name: getattr(q, c.name) for c in q.__table__.columns}
        q_dict["request_number"] = q.service_request.request_number if q.service_request else "Unknown"
        q_dict["facility_name"] = q.service_request.facility.name if q.service_request and q.service_request.facility else None
        q_dict["line_items"] = [
            {c.name: getattr(li, c.name) for c in li.__table__.columns}
            for li in (q.line_items or [])
        ]
        q_dict["payments"] = [
            {c.name: getattr(p, c.name) for c in p.__table__.columns}
            for p in (q.payments or [])
        ]
        result.append(q_dict)

    return result


# ── QUOTATION PAYMENT ENDPOINTS ─────────────────────────────────────────────

@router.post("/quotations/{quotation_id}/payments", response_model=QuotationPaymentResponse, status_code=status.HTTP_201_CREATED)
def create_quotation_payment(
    quotation_id: int,
    payment_in: QuotationPaymentCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Any:
    """Record a payment for a quotation via Credit Card, ACH, or MBMTS ACH."""
    if current_user.role not in [UserRole.SUPERADMIN, UserRole.ADMIN]:
        raise HTTPException(status_code=403, detail="Not enough permissions")

    db_quotation = (
        db.query(ServiceRequestQuotation)
        .options(joinedload(ServiceRequestQuotation.service_request))
        .filter(ServiceRequestQuotation.id == quotation_id)
        .first()
    )
    if not db_quotation:
        raise HTTPException(status_code=404, detail="Quotation not found")
    require_facility_access(db, current_user, db_quotation.service_request.facility_id)

    valid_methods = ["credit_card", "ach", "mbmts_ach"]
    if payment_in.payment_method not in valid_methods:
        raise HTTPException(status_code=400, detail=f"Invalid payment method. Allowed: {valid_methods}")

    # Auto-generate reference number: PAY-{quotation_number}-{seq}
    existing_count = db.query(QuotationPayment).filter(
        QuotationPayment.quotation_id == quotation_id
    ).count()
    q_num = db_quotation.quotation_number or f"Q-{quotation_id}"
    method_prefix = {"credit_card": "CC", "ach": "ACH", "mbmts_ach": "MACH"}
    reference_number = f"PAY-{q_num}-{method_prefix.get(payment_in.payment_method, 'PAY')}-{existing_count + 1:02d}"

    db_payment = QuotationPayment(
        quotation_id=quotation_id,
        payment_method=payment_in.payment_method,
        amount=payment_in.amount,
        reference_number=reference_number,
        notes=payment_in.notes,
        status="completed",
        paid_at=datetime.utcnow(),
        created_by_id=current_user.id,
        # ACH fields
        bank_name=payment_in.bank_name,
        account_last_four=payment_in.account_last_four,
        routing_number_last_four=payment_in.routing_number_last_four,
        # MBMTS ACH fields
        mbmts_account_name=payment_in.mbmts_account_name,
        mbmts_routing_number=payment_in.mbmts_routing_number,
        mbmts_account_number=payment_in.mbmts_account_number,
        mbmts_bank_name=payment_in.mbmts_bank_name,
        mbmts_bank_address=payment_in.mbmts_bank_address,
    )
    db.add(db_payment)

    # Update quotation status to paid
    db_quotation.status = "paid"
    db_quotation.updated_at = datetime.utcnow()

    db.commit()
    db.refresh(db_payment)
    sr = db_quotation.service_request
    create_notifications(
        db,
        user_ids=[uid for uid in {sr.requester_id, sr.assigned_technician_id} if uid and uid != current_user.id],
        title="Quotation payment recorded",
        message=f"Payment {reference_number} was recorded.",
        notification_type="service_request",
        link_url=f"/service-requests/{sr.id}",
        actor_id=current_user.id,
    )
    db.commit()

    return db_payment
