import os
import uuid
from typing import Any, Optional
from datetime import datetime
from decimal import Decimal
from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status
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
from app.schemas.service_request import (
    ServiceRequestCreate, ServiceRequestUpdate,
    ServiceRequestResponse, ServiceRequestListResponse,
    ServiceRequestQuotationCreate, ServiceRequestQuotationUpdate,
    ServiceRequestQuotationResponse, ServiceRequestQuotationListResponse,
    QuotationPaymentCreate, QuotationPaymentResponse,
    LineItemCreate,
)
from app.utils.notifications import create_notification, create_notifications, notify_admins

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
        db.query(ServiceRequest)
        .options(
            joinedload(ServiceRequest.facility),
            joinedload(ServiceRequest.equipment),
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
            joinedload(ServiceRequest.equipment),
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
    # Validate equipment
    if not db.query(Equipment).filter(Equipment.id == sr_in.equipment_id).first():
        raise HTTPException(status_code=404, detail="Equipment not found")

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
            joinedload(ServiceRequest.equipment),
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
            update_data["completed_at"] = datetime.utcnow()

    for field, value in update_data.items():
        before = getattr(db_sr, field, None)
        if _history_value(before) != _history_value(value):
            changes[field] = {"from": _history_value(before), "to": _history_value(value)}
        setattr(db_sr, field, value)

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
            joinedload(ServiceRequest.equipment),
            joinedload(ServiceRequest.requester),
            joinedload(ServiceRequest.assigned_technician),
            joinedload(ServiceRequest.quotations).joinedload(ServiceRequestQuotation.line_items),
            joinedload(ServiceRequest.quotations).joinedload(ServiceRequestQuotation.payments),
        )
        .filter(ServiceRequest.id == db_sr.id)
        .first()
    )


# ── DELETE ───────────────────────────────────────────────────────────────────

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
        .options(
            joinedload(ServiceRequestQuotation.service_request).joinedload(ServiceRequest.facility),
            joinedload(ServiceRequestQuotation.line_items),
            joinedload(ServiceRequestQuotation.payments),
        )
        .order_by(ServiceRequestQuotation.created_at.desc())
        .all()
    )

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
