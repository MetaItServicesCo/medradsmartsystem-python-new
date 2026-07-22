import copy
import os
import uuid
from typing import Any, Optional
from datetime import date, datetime, time, timedelta, timezone
from decimal import Decimal
from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status
from pydantic import BaseModel
from sqlalchemy import case, func, or_
from sqlalchemy.orm import Session, joinedload, selectinload
from sqlalchemy.orm.attributes import flag_modified

from app import crud
from app.core.deps import get_current_user
from app.utils.permission_deps import require_module_access
from app.utils.permissions import has_module_permission
from app.db.base import get_db
from app.models.user import User, UserRole
from app.models.user_facility import UserFacility
from app.models.service_request import (
    ServiceRequest, ServiceRequestStatus, Priority,
    ServiceRequestQuotation, QuotationLineItem, QuotationPayment,
    QuotationAuthorization, QuotationLedgerEntry,
)
from app.models.facility import Facility
from app.models.equipment import Equipment
from app.models.test_equipment import TestEquipment
from app.models.inventory import InventoryPart, InventoryTransaction
from app.models.invoice import Invoice, InvoiceStatus, InvoiceType
from app.schemas.service_request import (
    ServiceRequestCreate, ServiceRequestUpdate,
    ServiceRequestResponse, ServiceRequestListResponse,
    ServiceRequestQuotationCreate, ServiceRequestQuotationUpdate,
    ServiceRequestQuotationResponse, ServiceRequestQuotationListResponse,
    QuotationPaymentCreate, QuotationPaymentResponse,
    QuotationAuthorizationRequestCreate, QuotationAuthorizationDecisionCreate,
    QuotationAuthorizationResponse,
    LineItemCreate, ServiceRequestNoteCreate, ServiceRequestClockOutCreate,
    ServiceRequestWorkSessionCreate,
)
from app.utils.notifications import create_notification, create_notifications, notify_admins
from app.utils.facility_access import get_user_facility_ids, require_facility_access, scope_query_to_user_facilities
from app.utils.invoice_editing import compose_invoice_edit_notes, editable_labels, editable_line_items, editable_summary_rows, parse_invoice_edit_metadata, strip_invoice_edit_metadata
from app.utils.invoice_ledger import record_invoice_created, record_payment_delta, record_status_change, transaction_response

router = APIRouter(dependencies=[Depends(require_module_access("service-requests"))])

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
SERVICE_WORKFLOW_STATUSES = [
    ServiceRequestStatus.IN_PROGRESS,
    ServiceRequestStatus.WAITING_ON_PARTS,
    ServiceRequestStatus.WAITING_FOR_APPROVAL,
    ServiceRequestStatus.WAITING_FOR_DEPOT_REPAIR,
    ServiceRequestStatus.WAITING_FOR_VENDOR_REPAIR,
    ServiceRequestStatus.COMPLETED,
]

VALID_TRANSITIONS = {
    ServiceRequestStatus.NEW: [ServiceRequestStatus.ASSIGNED, ServiceRequestStatus.CANCELLED],
    ServiceRequestStatus.ASSIGNED: [*SERVICE_WORKFLOW_STATUSES, ServiceRequestStatus.CANCELLED],
    ServiceRequestStatus.IN_PROGRESS: [*SERVICE_WORKFLOW_STATUSES, ServiceRequestStatus.CANCELLED],
    ServiceRequestStatus.WAITING_ON_PARTS: [*SERVICE_WORKFLOW_STATUSES, ServiceRequestStatus.CANCELLED],
    ServiceRequestStatus.WAITING_FOR_APPROVAL: [*SERVICE_WORKFLOW_STATUSES, ServiceRequestStatus.CANCELLED],
    ServiceRequestStatus.WAITING_FOR_DEPOT_REPAIR: [*SERVICE_WORKFLOW_STATUSES, ServiceRequestStatus.CANCELLED],
    ServiceRequestStatus.WAITING_FOR_VENDOR_REPAIR: [*SERVICE_WORKFLOW_STATUSES, ServiceRequestStatus.CANCELLED],
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
    travel_charges: Decimal = Decimal("0")
    labor_fee_override: Optional[Decimal] = None


class ServiceInvoiceUpdate(BaseModel):
    customer_name: Optional[str] = None
    customer_email: Optional[str] = None
    customer_phone: Optional[str] = None
    customer_address: Optional[str] = None
    subtotal: Optional[Decimal] = None
    tax_amount: Optional[Decimal] = None
    discount_amount: Optional[Decimal] = None
    total_amount: Optional[Decimal] = None
    amount_paid: Optional[Decimal] = None
    issue_date: Optional[date] = None
    due_date: Optional[date] = None
    status: Optional[InvoiceStatus] = None
    payment_method: Optional[str] = None
    notes: Optional[str] = None
    line_items: Optional[list[dict[str, Any]]] = None
    labels: Optional[dict[str, Any]] = None
    summary_rows: Optional[list[dict[str, Any]]] = None


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


def _role_name(user: User) -> str:
    return user.role.value if hasattr(user.role, "value") else str(user.role)


SERVICE_CUSTOMER_ROLES = {
    UserRole.FACILITY_ADMIN,
    UserRole.FACILITY_MANAGER,
    UserRole.CLIENT,
    UserRole.EMPLOYEE,
}
CUSTOMER_EDITABLE_REQUEST_FIELDS = {
    "priority",
    "problem_description",
    "service_required",
    "preferred_datetime",
    "requested_by_name",
    "reference_number",
    "request_image_url",
}
CUSTOMER_PAYMENT_FIELDS = {"amount_paid", "status", "payment_method", "notes"}


def _is_internal_service_user(user: User) -> bool:
    if user.role == UserRole.SUPERADMIN:
        return True
    # Migrated installations can contain legacy `admin` records that are
    # explicitly facility-bound. Those accounts are facility portal users;
    # only an unscoped admin is a global service operator.
    return user.role == UserRole.ADMIN and user.facility_id is None


def _is_service_customer_user(user: User) -> bool:
    return (
        user.role in SERVICE_CUSTOMER_ROLES
        or (user.role == UserRole.ADMIN and user.facility_id is not None)
    )


def _can_self_authorize_quotation(user: User) -> bool:
    return user.role in {
        UserRole.FACILITY_ADMIN,
        UserRole.FACILITY_MANAGER,
        UserRole.CLIENT,
    } or (user.role == UserRole.ADMIN and user.facility_id is not None)


def _require_service_facility_access(
    db: Session,
    user: User,
    facility_id: Optional[int],
) -> None:
    """Apply canonical and migrated facility-account scope to service data."""
    if _is_service_customer_user(user):
        if facility_id is None or facility_id not in get_user_facility_ids(db, user):
            raise HTTPException(status_code=403, detail="You do not have access to this facility")
        return
    require_facility_access(db, user, facility_id)


def _scope_service_query(query, facility_column, db: Session, user: User):
    if _is_service_customer_user(user):
        return query.filter(facility_column.in_(get_user_facility_ids(db, user)))
    return scope_query_to_user_facilities(query, facility_column, db, user)


def _authorize_service_request_update(
    user: User,
    service_request: ServiceRequest,
    update_data: dict[str, Any],
) -> None:
    """Enforce field-level service-request ownership and workflow boundaries."""
    if _is_internal_service_user(user):
        return

    if user.role == UserRole.TECHNICIAN:
        raise HTTPException(
            status_code=403,
            detail="Technicians must update service progress through a work session",
        )

    if not _is_service_customer_user(user):
        raise HTTPException(status_code=403, detail="Not authorized to update this service request")

    if service_request.requester_id != user.id:
        raise HTTPException(
            status_code=403,
            detail="Only the requester can change a submitted service request",
        )

    if service_request.status != ServiceRequestStatus.NEW:
        raise HTTPException(
            status_code=409,
            detail="This request is already being processed; contact the service team for changes",
        )

    submitted_fields = set(update_data)
    requested_status = update_data.get("status")
    if requested_status is not None:
        if requested_status != ServiceRequestStatus.CANCELLED.value:
            raise HTTPException(
                status_code=403,
                detail="Facility users cannot update operational service status",
            )
        submitted_fields.remove("status")

    disallowed_fields = submitted_fields - CUSTOMER_EDITABLE_REQUEST_FIELDS
    if disallowed_fields:
        raise HTTPException(
            status_code=403,
            detail=f"Facility users cannot update: {', '.join(sorted(disallowed_fields))}",
        )


def _authorization_dict(authorization: QuotationAuthorization) -> dict[str, Any]:
    return {
        **{column.name: getattr(authorization, column.name) for column in authorization.__table__.columns},
        "requested_by_name": authorization.requested_by.full_name if authorization.requested_by else None,
        "recorded_by_name": authorization.recorded_by.full_name if authorization.recorded_by else None,
    }


def _payment_dict(payment: QuotationPayment) -> dict[str, Any]:
    return {
        **{column.name: getattr(payment, column.name) for column in payment.__table__.columns},
        "paid_by_name": payment.created_by.full_name if payment.created_by else None,
    }


def _ledger_dict(entry: QuotationLedgerEntry) -> dict[str, Any]:
    return {column.name: getattr(entry, column.name) for column in entry.__table__.columns}


def _quotation_dict(quotation: ServiceRequestQuotation, *, include_ledger: bool = True) -> dict[str, Any]:
    data = {column.name: getattr(quotation, column.name) for column in quotation.__table__.columns}
    data["line_items"] = [
        {column.name: getattr(item, column.name) for column in item.__table__.columns}
        for item in (quotation.line_items or [])
    ]
    data["payments"] = [_payment_dict(payment) for payment in (quotation.payments or [])]
    data["authorizations"] = (
        [_authorization_dict(authorization) for authorization in (quotation.authorizations or [])]
        if include_ledger else []
    )
    data["ledger_entries"] = (
        [_ledger_dict(entry) for entry in (quotation.ledger_entries or [])]
        if include_ledger else []
    )
    return data


def _append_quotation_ledger(
    db: Session,
    quotation: ServiceRequestQuotation,
    event_type: str,
    actor: User,
    *,
    channel: Optional[str] = None,
    amount: Optional[Decimal] = None,
    reference_number: Optional[str] = None,
    details: Optional[dict[str, Any]] = None,
) -> QuotationLedgerEntry:
    clean_details = {
        key: _history_value(value)
        for key, value in (details or {}).items()
    }
    entry = QuotationLedgerEntry(
        quotation_id=quotation.id,
        event_type=event_type,
        actor_id=actor.id,
        actor_name=actor.full_name or actor.username,
        actor_role=_role_name(actor),
        channel=channel,
        amount=amount,
        reference_number=reference_number,
        details=clean_details,
    )
    db.add(entry)

    service_request = quotation.service_request
    if service_request:
        history = list(service_request.history or [])
        history.append(_history_entry(f"quotation_{event_type}", actor, {
            "quotation_id": quotation.id,
            "quotation_number": quotation.quotation_number,
            "channel": channel,
            "amount": float(amount) if amount is not None else None,
            "reference_number": reference_number,
            **clean_details,
        }))
        service_request.history = history
        flag_modified(service_request, "history")
    return entry


def _facility_authorizer_user_ids(db: Session, service_request: ServiceRequest) -> list[int]:
    facility_ids = {service_request.facility_id}
    if service_request.facility and service_request.facility.parent_facility_id:
        facility_ids.add(service_request.facility.parent_facility_id)
    secondary_ids = db.query(UserFacility.user_id).filter(UserFacility.facility_id.in_(facility_ids))
    users = (
        db.query(User.id)
        .filter(
            User.is_active.is_(True),
            User.role.in_([UserRole.FACILITY_ADMIN, UserRole.FACILITY_MANAGER]),
            or_(User.facility_id.in_(facility_ids), User.id.in_(secondary_ids)),
        )
        .all()
    )
    return [user_id for (user_id,) in users]


def _latest_active_authorization(quotation: ServiceRequestQuotation) -> Optional[QuotationAuthorization]:
    return next(
        (
            authorization
            for authorization in (quotation.authorizations or [])
            if authorization.status in {"requested", "authorized"}
        ),
        None,
    )


def _enrich(sr: ServiceRequest, *, include_quotation_ledger: bool = False) -> dict:
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
    data["tier_mileage_rate"] = tier.mileage_rate if tier else None
    data["calculated_service_cost"] = _calculate_service_cost(sr)
    data["requester_name"] = sr.requester.full_name if sr.requester else None
    data["technician_name"] = sr.assigned_technician.full_name if sr.assigned_technician else None
    # Quotations (multiple)
    data["quotations"] = []
    if sr.quotations:
        for q in sr.quotations:
            data["quotations"].append(_quotation_dict(q, include_ledger=include_quotation_ledger))
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
    if _is_internal_service_user(user):
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


def _test_equipment_history_items(db: Session, test_equipment_ids: list[int]) -> list[dict[str, Any]]:
    ids = list(dict.fromkeys(test_equipment_ids or []))
    if not ids:
        return []
    equipment_rows = db.query(TestEquipment).filter(TestEquipment.id.in_(ids)).all()
    found_ids = {item.id for item in equipment_rows}
    missing_ids = [item_id for item_id in ids if item_id not in found_ids]
    if missing_ids:
        raise HTTPException(status_code=404, detail=f"Test equipment not found: {', '.join(map(str, missing_ids))}")
    equipment_by_id = {item.id: item for item in equipment_rows}
    return [
        {
            "id": item.id,
            "tem": item.tem,
            "mrf": item.mrf,
            "model": item.model,
            "serial_number": item.serial_number,
            "description": item.description,
            "asset": item.asset,
            "image_url": item.image_url,
        }
        for item in (equipment_by_id[item_id] for item_id in ids)
    ]


def _service_part_option(part: InventoryPart) -> dict[str, Any]:
    return {
        "id": part.id,
        "facility_id": part.facility_id,
        "part_number": part.part_number,
        "description": part.description,
        "part_type": part.part_type,
        "make": part.make,
        "model": part.model,
        "serial_number": part.serial_number,
        "batch_number": part.batch_number,
        "default_picture_url": part.default_picture_url,
        "unit_price": float(part.unit_price or 0),
        "quantity_on_hand": int(part.quantity_on_hand or 0),
        "reorder_level": int(part.reorder_level or 0),
        "status": part.status,
    }


def _consume_service_parts(
    db: Session,
    service_request: ServiceRequest,
    usages: list[Any],
    current_user: User,
    session_id: str,
) -> list[dict[str, Any]]:
    """Atomically issue facility stock and return immutable history snapshots."""
    quantities: dict[int, int] = {}
    for usage in usages or []:
        part_id = int(usage.part_id)
        quantities[part_id] = quantities.get(part_id, 0) + int(usage.quantity)
    if not quantities:
        return []

    part_ids = sorted(quantities)
    parts = (
        db.query(InventoryPart)
        .filter(InventoryPart.id.in_(part_ids))
        .order_by(InventoryPart.id.asc())
        .with_for_update()
        .all()
    )
    parts_by_id = {part.id: part for part in parts}
    missing_ids = [part_id for part_id in part_ids if part_id not in parts_by_id]
    if missing_ids:
        raise HTTPException(status_code=404, detail=f"Inventory parts not found: {', '.join(map(str, missing_ids))}")

    snapshots: list[dict[str, Any]] = []
    for part_id in part_ids:
        part = parts_by_id[part_id]
        quantity = quantities[part_id]
        if str(part.status or "").lower() != "active":
            raise HTTPException(status_code=400, detail=f"Part {part.part_number} is not active")
        available = int(part.quantity_on_hand or 0)
        if available < quantity:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Insufficient stock for {part.part_number}. Available: {available}, requested: {quantity}",
            )

        part.quantity_on_hand = available - quantity
        transaction = InventoryTransaction(
            part_id=part.id,
            # Parts are global inventory. Record where they were consumed while
            # deducting stock from the single global part record.
            facility_id=service_request.facility_id,
            transaction_type="issuance",
            quantity=quantity,
            unit_cost=part.unit_price,
            balance_after=part.quantity_on_hand,
            authorization_reference=service_request.request_number,
            authorization_details=f"Service work session {session_id}",
            notes=f"Used during service request {service_request.request_number}",
            created_by_id=current_user.id,
        )
        db.add(transaction)
        db.flush()
        snapshots.append({
            **_service_part_option(part),
            "quantity_used": quantity,
            "balance_after": int(part.quantity_on_hand or 0),
            "inventory_transaction_id": transaction.id,
        })

        if part.quantity_on_hand <= part.reorder_level:
            notify_admins(
                db,
                title="Low stock alert",
                message=f"{part.part_number} is at or below reorder level after use on {service_request.request_number}.",
                notification_type="inventory",
                link_url="/inventory",
                actor_id=current_user.id,
            )
    return snapshots


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


def _parse_fee_notes(notes: Optional[str]) -> tuple[Optional[Decimal], Optional[Decimal]]:
    """Parse __FEES__:labor=X,travel=Y:: prefix. Returns (labor_override, travel_charges)."""
    if not notes or not notes.startswith("__FEES__:"):
        return None, None
    fee_part, _, _ = notes[len("__FEES__:"):].partition("::")
    labor: Optional[Decimal] = None
    travel: Optional[Decimal] = None
    for kv in fee_part.split(","):
        k, _, v = kv.partition("=")
        try:
            if k.strip() == "labor":
                labor = _money(v.strip())
            elif k.strip() == "travel":
                travel = _money(v.strip())
        except Exception:
            pass
    return labor, travel


def _strip_fee_prefix(notes: Optional[str]) -> Optional[str]:
    """Remove __FEES__:..:: prefix from stored notes before returning to client."""
    notes = strip_invoice_edit_metadata(notes)
    if not notes or not notes.startswith("__FEES__:"):
        return notes
    _, _, rest = notes.partition("::")
    return rest or None


def _service_invoice_line_items(invoice: Invoice) -> list[dict[str, Any]]:
    custom_rows = editable_line_items(invoice.notes)
    if custom_rows:
        return custom_rows
    sr = invoice.service_request
    if not sr:
        return []
    rows: list[dict[str, Any]] = []
    hours = _money(sr.time_spent_hours).quantize(Decimal("0.01"))
    labor_rate = _service_labor_rate(sr)
    labor_override, travel_override = _parse_fee_notes(invoice.notes)
    labor_total = labor_override if labor_override is not None else _calculate_service_cost(sr)
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
    if travel_override is not None and travel_override > Decimal("0"):
        rows.append({
            "item_number": sr.request_number,
            "description": "Travel Charges",
            "quantity": Decimal("1"),
            "unit_price": travel_override,
            "shipping_fee": Decimal("0"),
            "setup_fee": Decimal("0"),
            "condition": None,
            "total_amount": travel_override,
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


def _service_invoice_paid_quotations(invoice: Invoice) -> list[dict[str, Any]]:
    sr = invoice.service_request
    if not sr:
        return []

    paid_rows: list[dict[str, Any]] = []
    for quotation in sr.quotations or []:
        if quotation.status != "paid":
            continue
        payments = list(quotation.payments or [])
        paid_amount = sum((_money(payment.amount) for payment in payments), Decimal("0")).quantize(Decimal("0.01"))
        if paid_amount <= Decimal("0"):
            continue
        latest_payment = max(
            payments,
            key=lambda payment: payment.paid_at or payment.created_at or datetime.min,
            default=None,
        )
        paid_rows.append({
            "id": quotation.id,
            "quotation_number": quotation.quotation_number,
            "description": quotation.description or "Service quotation",
            "amount": quotation.amount,
            "paid_amount": paid_amount,
            "paid_at": latest_payment.paid_at if latest_payment else None,
            "payment_method": latest_payment.payment_method if latest_payment else None,
            "reference_number": latest_payment.reference_number if latest_payment else None,
            "line_items": [
                {c.name: getattr(line, c.name) for c in line.__table__.columns}
                for line in (quotation.line_items or [])
            ],
        })

    return paid_rows


def _sync_last_session_timestamps(sr: ServiceRequest, new_total: Decimal) -> None:
    """When time_spent_hours is manually edited, backfill the last clock-out
    entry's clocked_out_at so history stays consistent with the corrected total."""
    history = list(sr.history or [])
    clock_outs = [(i, e) for i, e in enumerate(history) if e.get("action") == "technician_clock_out"]
    if not clock_outs:
        return
    last_idx, last_entry = clock_outs[-1]
    other_total = sum(
        Decimal(str(e.get("changes", {}).get("duration_hours", 0) or 0))
        for _, e in clock_outs[:-1]
    )
    last_hours = max(new_total - other_total, Decimal("0"))
    changes = copy.deepcopy(last_entry.get("changes", {}))
    clocked_in_str = changes.get("clocked_in_at") or last_entry.get("timestamp")
    if not clocked_in_str:
        return
    try:
        clocked_in = datetime.fromisoformat(str(clocked_in_str).replace("Z", "+00:00"))
        if clocked_in.tzinfo is None:
            clocked_in = clocked_in.replace(tzinfo=timezone.utc)
        changes["clocked_out_at"] = (clocked_in + timedelta(hours=float(last_hours))).isoformat()
        changes["duration_hours"] = float(last_hours)
        changes["total_hours"] = float(new_total)
        history_copy = copy.deepcopy(list(sr.history or []))
        history_copy[last_idx]["changes"] = changes
        sr.history = history_copy
        flag_modified(sr, "history")
    except (ValueError, TypeError):
        pass


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
        "notes": _strip_fee_prefix(invoice.notes),
        "created_at": invoice.created_at,
        "updated_at": invoice.updated_at,
        "transactions": [transaction_response(item) for item in invoice.transactions or []],
        "line_items": _service_invoice_line_items(invoice),
        "labels": editable_labels(invoice.notes),
        "summary_rows": editable_summary_rows(invoice.notes),
        "paid_quotations": _service_invoice_paid_quotations(invoice),
    }


def _load_service_request_for_work(
    db: Session,
    request_id: int,
    current_user: User,
    existing_session_id: Optional[str] = None,
) -> ServiceRequest:
    # Serialize work-session writes so duration, history, and stock issuance
    # remain consistent under concurrent submissions or client retries.
    db_sr = (
        db.query(ServiceRequest)
        .filter(ServiceRequest.id == request_id)
        .with_for_update()
        .first()
    )
    if not db_sr:
        raise HTTPException(status_code=404, detail="Service request not found")
    _require_service_facility_access(db, current_user, db_sr.facility_id)
    if not _can_work_on_service(current_user, db_sr):
        raise HTTPException(status_code=403, detail="Only the assigned technician or an admin can update service work")
    if existing_session_id and any(
        entry.get("action") in {"technician_work_session", "technician_clock_out"}
        and (entry.get("changes") or {}).get("session_id") == existing_session_id
        for entry in (db_sr.history or [])
    ):
        return db_sr
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
    status_group: Optional[str] = Query(None),
    date_from: Optional[date] = Query(None),
    date_to: Optional[date] = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=2000),
    current_user: User = Depends(get_current_user),
) -> Any:
    """List service requests with filters."""
    if date_from and date_to and date_from > date_to:
        raise HTTPException(status_code=400, detail="From date cannot be later than To date")

    base_query = _scope_service_query(
        db.query(ServiceRequest), ServiceRequest.facility_id, db, current_user
    )
    if priority:
        base_query = base_query.filter(ServiceRequest.priority == priority)
    if facility_id:
        base_query = base_query.filter(ServiceRequest.facility_id == facility_id)
    if search:
        base_query = base_query.filter(
            ServiceRequest.request_number.ilike(f"%{search}%")
            | ServiceRequest.problem_description.ilike(f"%{search}%")
        )
    if date_from:
        base_query = base_query.filter(ServiceRequest.created_at >= datetime.combine(date_from, time.min))
    if date_to:
        base_query = base_query.filter(ServiceRequest.created_at <= datetime.combine(date_to, time.max))

    # Technicians only see service requests they are assigned to
    if current_user.role == UserRole.TECHNICIAN:
        base_query = base_query.filter(ServiceRequest.assigned_technician_id == current_user.id)

    # Employees only see requests they submitted. Clients are facility-scoped
    # through scope_query_to_user_facilities when assigned to facilities.
    if current_user.role == UserRole.EMPLOYEE:
        base_query = base_query.filter(ServiceRequest.requester_id == current_user.id)

    open_statuses = [ServiceRequestStatus.NEW, ServiceRequestStatus.ASSIGNED]
    active_statuses = [
        ServiceRequestStatus.IN_PROGRESS,
        ServiceRequestStatus.WAITING_ON_PARTS,
        ServiceRequestStatus.WAITING_FOR_APPROVAL,
        ServiceRequestStatus.WAITING_FOR_DEPOT_REPAIR,
        ServiceRequestStatus.WAITING_FOR_VENDOR_REPAIR,
    ]
    stats_row = base_query.with_entities(
        func.count(ServiceRequest.id),
        func.count(case((ServiceRequest.status.in_(open_statuses), 1))),
        func.count(case((ServiceRequest.status.in_(active_statuses), 1))),
        func.count(case((ServiceRequest.status == ServiceRequestStatus.COMPLETED, 1))),
    ).one()
    stats = {
        "total": int(stats_row[0] or 0),
        "new": int(stats_row[1] or 0),
        "in_progress": int(stats_row[2] or 0),
        "completed": int(stats_row[3] or 0),
    }

    query = base_query
    if status:
        query = query.filter(ServiceRequest.status == status)
    elif status_group == "new_open":
        query = query.filter(ServiceRequest.status.in_(open_statuses))
    elif status_group == "active":
        query = query.filter(ServiceRequest.status.in_(active_statuses))
    elif status_group == "completed":
        query = query.filter(ServiceRequest.status == ServiceRequestStatus.COMPLETED)

    query = query.options(
        joinedload(ServiceRequest.facility),
        joinedload(ServiceRequest.equipment).joinedload(Equipment.tier),
        joinedload(ServiceRequest.requester),
        joinedload(ServiceRequest.assigned_technician),
        selectinload(ServiceRequest.quotations).selectinload(ServiceRequestQuotation.line_items),
        selectinload(ServiceRequest.quotations).selectinload(ServiceRequestQuotation.payments),
    )

    total = query.count()
    items = query.order_by(ServiceRequest.created_at.desc()).offset(skip).limit(limit).all()
    return {"items": [_enrich(sr) for sr in items], "total": total, "stats": stats}


# ── GET ONE ──────────────────────────────────────────────────────────────────

# --- SERVICE INVOICES -------------------------------------------------------

@router.get("/invoices")
def list_service_invoices(
    db: Session = Depends(get_db),
    status_filter: Optional[InvoiceStatus] = Query(None, alias="status"),
    service_request_id: Optional[int] = Query(None),
    search: Optional[str] = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=100),
    current_user: User = Depends(get_current_user),
) -> Any:
    """List generated service invoices for billing."""
    if not has_module_permission(current_user, "billing", "view"):
        raise HTTPException(status_code=403, detail="Billing view permission is required")
    query = (
        _scope_service_query(db.query(Invoice), Invoice.facility_id, db, current_user)
        .options(
            joinedload(Invoice.facility),
            joinedload(Invoice.transactions),
            joinedload(Invoice.service_request).joinedload(ServiceRequest.equipment).joinedload(Equipment.tier),
            joinedload(Invoice.service_request).joinedload(ServiceRequest.quotations).joinedload(ServiceRequestQuotation.line_items),
            joinedload(Invoice.service_request).joinedload(ServiceRequest.quotations).joinedload(ServiceRequestQuotation.payments),
        )
        .filter(Invoice.invoice_type == InvoiceType.SERVICE)
    )
    if status_filter:
        query = query.filter(Invoice.status == status_filter)
    if service_request_id:
        query = query.filter(Invoice.service_request_id == service_request_id)
    if search and search.strip():
        like = f"%{search.strip()}%"
        query = (
            query
            .outerjoin(ServiceRequest, Invoice.service_request_id == ServiceRequest.id)
            .outerjoin(Facility, Invoice.facility_id == Facility.id)
            .filter(
                or_(
                    Invoice.invoice_number.ilike(like),
                    Invoice.customer_name.ilike(like),
                    Invoice.customer_email.ilike(like),
                    Invoice.notes.ilike(like),
                    ServiceRequest.request_number.ilike(like),
                    ServiceRequest.problem_description.ilike(like),
                    Facility.name.ilike(like),
                )
            )
        )
    total = query.count()
    invoices = query.order_by(Invoice.created_at.desc()).offset(skip).limit(limit).all()
    return {
        "items": [_service_invoice_response(invoice) for invoice in invoices],
        "total": total,
        "skip": skip,
        "limit": limit,
    }


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
            joinedload(Invoice.service_request).joinedload(ServiceRequest.quotations).joinedload(ServiceRequestQuotation.payments),
        )
        .filter(Invoice.id == invoice_id, Invoice.invoice_type == InvoiceType.SERVICE)
        .first()
    )
    if not invoice:
        raise HTTPException(status_code=404, detail="Service invoice not found")
    if invoice.facility_id is not None:
        _require_service_facility_access(db, current_user, invoice.facility_id)
    if not has_module_permission(current_user, "billing", "edit"):
        raise HTTPException(status_code=403, detail="Not enough permissions to update payment")

    previous_paid = invoice.amount_paid
    previous_status = invoice.status
    update_data = payload.model_dump(exclude_unset=True)
    if not _is_internal_service_user(current_user):
        if not _is_service_customer_user(current_user):
            raise HTTPException(status_code=403, detail="Not authorized to update this invoice")
        disallowed_fields = set(update_data) - CUSTOMER_PAYMENT_FIELDS
        if disallowed_fields:
            raise HTTPException(
                status_code=403,
                detail="Facility users can pay invoices but cannot edit invoice contents",
            )
        requested_paid = _money(update_data.get("amount_paid", invoice.amount_paid))
        if requested_paid < _money(invoice.amount_paid):
            raise HTTPException(status_code=400, detail="Recorded payments cannot be reduced")
        if requested_paid > _money(invoice.total_amount):
            raise HTTPException(status_code=400, detail="Payment cannot exceed the invoice total")
        # Status is derived from the resulting balance; clients cannot select
        # an administrative invoice state such as cancelled.
        update_data.pop("status", None)

    existing_metadata = parse_invoice_edit_metadata(invoice.notes)
    if "line_items" in update_data:
        existing_metadata["line_items"] = update_data.pop("line_items") or []
    if "labels" in update_data:
        existing_metadata["labels"] = update_data.pop("labels") or {}
    if "summary_rows" in update_data:
        existing_metadata["summary_rows"] = update_data.pop("summary_rows") or []

    for field in [
        "customer_name", "customer_email", "customer_phone", "customer_address",
        "subtotal", "tax_amount", "discount_amount", "total_amount",
        "amount_paid", "issue_date", "due_date", "status", "payment_method",
    ]:
        if field in update_data:
            setattr(invoice, field, update_data[field])

    if "notes" in update_data or existing_metadata:
        invoice.notes = compose_invoice_edit_notes(invoice.notes, update_data.get("notes"), existing_metadata)
    if "total_amount" not in update_data and any(field in update_data for field in ["subtotal", "tax_amount", "discount_amount"]):
        invoice.total_amount = _money(invoice.subtotal) + _money(invoice.tax_amount) - _money(invoice.discount_amount)
    invoice.balance_due = _money(invoice.total_amount) - _money(invoice.amount_paid)
    if invoice.balance_due <= 0:
        invoice.status = InvoiceStatus.PAID
    elif _money(invoice.amount_paid) > 0 and invoice.status != InvoiceStatus.CANCELLED:
        invoice.status = InvoiceStatus.PARTIALLY_PAID
    elif not _is_internal_service_user(current_user):
        invoice.status = InvoiceStatus.PENDING
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


@router.get("/{request_id}/available-parts")
def list_service_request_parts(
    request_id: int,
    search: Optional[str] = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Any:
    """List active in-stock parts from the global inventory catalog."""
    service_request = db.query(ServiceRequest).filter(ServiceRequest.id == request_id).first()
    if not service_request:
        raise HTTPException(status_code=404, detail="Service request not found")
    _require_service_facility_access(db, current_user, service_request.facility_id)
    if not _can_work_on_service(current_user, service_request):
        raise HTTPException(status_code=403, detail="Only the assigned technician or an admin can select service parts")

    query = db.query(InventoryPart).filter(
        InventoryPart.status == "active",
        InventoryPart.quantity_on_hand > 0,
    )
    if search and search.strip():
        like = f"%{search.strip()}%"
        query = query.filter(or_(
            InventoryPart.part_number.ilike(like),
            InventoryPart.description.ilike(like),
            InventoryPart.make.ilike(like),
            InventoryPart.model.ilike(like),
            InventoryPart.serial_number.ilike(like),
            InventoryPart.batch_number.ilike(like),
        ))
    total = query.count()
    parts = query.order_by(InventoryPart.updated_at.desc(), InventoryPart.id.desc()).offset(skip).limit(limit).all()
    return {"items": [_service_part_option(part) for part in parts], "total": total}


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
            selectinload(ServiceRequest.quotations).selectinload(ServiceRequestQuotation.line_items),
            selectinload(ServiceRequest.quotations).selectinload(ServiceRequestQuotation.payments),
            selectinload(ServiceRequest.quotations).selectinload(ServiceRequestQuotation.authorizations),
            selectinload(ServiceRequest.quotations).selectinload(ServiceRequestQuotation.ledger_entries),
        )
        .filter(ServiceRequest.id == request_id)
        .first()
    )
    if not sr:
        raise HTTPException(status_code=404, detail="Service request not found")
    _require_service_facility_access(db, current_user, sr.facility_id)
    # Technicians can only view service requests assigned to them
    if current_user.role == UserRole.TECHNICIAN and sr.assigned_technician_id != current_user.id:
        raise HTTPException(status_code=403, detail="You can only view service requests assigned to you")
    # Employees can only view requests they submitted. Clients are facility-scoped.
    if current_user.role == UserRole.EMPLOYEE and sr.requester_id != current_user.id:
        raise HTTPException(status_code=403, detail="You can only view service requests you submitted")
    data = _enrich(sr, include_quotation_ledger=True)
    active_invoice = None
    if has_module_permission(current_user, "billing", "view"):
        active_invoice = (
            db.query(Invoice)
            .options(
                joinedload(Invoice.facility),
                joinedload(Invoice.transactions),
                joinedload(Invoice.service_request).joinedload(ServiceRequest.equipment).joinedload(Equipment.tier),
                joinedload(Invoice.service_request).joinedload(ServiceRequest.quotations).joinedload(ServiceRequestQuotation.line_items),
                joinedload(Invoice.service_request).joinedload(ServiceRequest.quotations).joinedload(ServiceRequestQuotation.payments),
            )
            .filter(
                Invoice.service_request_id == sr.id,
                Invoice.invoice_type == InvoiceType.SERVICE,
                Invoice.status != InvoiceStatus.CANCELLED,
            )
            .first()
        )
    data["service_invoice"] = _service_invoice_response(active_invoice) if active_invoice else None
    return data


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
    _require_service_facility_access(db, current_user, sr_in.facility_id)
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
    _require_service_facility_access(db, current_user, db_sr.facility_id)

    update_data = sr_in.model_dump(exclude_unset=True)
    _authorize_service_request_update(current_user, db_sr, update_data)
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
        elif new_status in [
            ServiceRequestStatus.IN_PROGRESS,
            ServiceRequestStatus.WAITING_ON_PARTS,
            ServiceRequestStatus.WAITING_FOR_APPROVAL,
            ServiceRequestStatus.WAITING_FOR_DEPOT_REPAIR,
            ServiceRequestStatus.WAITING_FOR_VENDOR_REPAIR,
        ]:
            if not db_sr.started_at:
                update_data["started_at"] = datetime.utcnow()
        elif new_status == ServiceRequestStatus.COMPLETED:
            if _active_clock_session(db_sr):
                raise HTTPException(status_code=400, detail="End the active work session before marking this service request complete")
            update_data["completed_at"] = datetime.utcnow()
            update_data["total_cost"] = _calculate_service_cost(db_sr)

    for field, value in update_data.items():
        before = getattr(db_sr, field, None)
        if _history_value(before) != _history_value(value):
            changes[field] = {"from": _history_value(before), "to": _history_value(value)}
        setattr(db_sr, field, value)

    if "time_spent_hours" in update_data and "total_cost" not in update_data:
        db_sr.total_cost = _calculate_service_cost(db_sr)
        _sync_last_session_timestamps(db_sr, Decimal(str(update_data["time_spent_hours"])))

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
    if not _is_internal_service_user(current_user):
        raise HTTPException(status_code=403, detail="Only an administrator can generate a service invoice")
    if not has_module_permission(current_user, "billing", "edit"):
        raise HTTPException(status_code=403, detail="Billing edit permission is required")

    db_sr = (
        db.query(ServiceRequest)
        .options(
            joinedload(ServiceRequest.facility),
            joinedload(ServiceRequest.equipment).joinedload(Equipment.tier),
            joinedload(ServiceRequest.quotations).joinedload(ServiceRequestQuotation.line_items),
            joinedload(ServiceRequest.quotations).joinedload(ServiceRequestQuotation.payments),
        )
        .filter(ServiceRequest.id == request_id)
        .first()
    )
    if not db_sr:
        raise HTTPException(status_code=404, detail="Service request not found")
    _require_service_facility_access(db, current_user, db_sr.facility_id)
    if db_sr.status != ServiceRequestStatus.COMPLETED:
        raise HTTPException(status_code=400, detail="Complete the service request before generating an invoice")

    existing_invoice = (
        db.query(Invoice)
        .options(
            joinedload(Invoice.facility),
            joinedload(Invoice.transactions),
            joinedload(Invoice.service_request).joinedload(ServiceRequest.equipment).joinedload(Equipment.tier),
            joinedload(Invoice.service_request).joinedload(ServiceRequest.quotations).joinedload(ServiceRequestQuotation.line_items),
            joinedload(Invoice.service_request).joinedload(ServiceRequest.quotations).joinedload(ServiceRequestQuotation.payments),
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
            if quotation.status not in {"paid", "partially_paid", "included_in_invoice", "cancelled", "rejected"}
        ]
        selected_ids = set(payload.quotation_ids or [])
        selected_quotations = [
            quotation for quotation in eligible
            if payload.quotation_ids is None or quotation.id in selected_ids
        ]

    service_amount = (
        _money(payload.labor_fee_override).quantize(Decimal("0.01"))
        if payload.labor_fee_override is not None
        else _calculate_service_cost(db_sr)
    )
    travel_charges = _money(payload.travel_charges).quantize(Decimal("0.01"))
    quotation_amount = sum((_money(quotation.amount) for quotation in selected_quotations), Decimal("0"))
    subtotal = (service_amount + travel_charges + quotation_amount).quantize(Decimal("0.01"))
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
        notes=f"__FEES__:labor={service_amount},travel={travel_charges}::{payload.notes or f'Service invoice for {db_sr.request_number}.'}",
    )
    db.add(invoice)
    db.flush()
    record_invoice_created(db, invoice, current_user, f"Service invoice created for {db_sr.request_number}")

    for quotation in selected_quotations:
        active_authorization = _latest_active_authorization(quotation)
        if active_authorization:
            active_authorization.status = "fulfilled_in_invoice"
            active_authorization.invalidated_at = datetime.utcnow()
        quotation.status = "included_in_invoice"
        quotation.updated_at = datetime.utcnow()
        _append_quotation_ledger(
            db,
            quotation,
            "included_in_service_invoice",
            current_user,
            amount=quotation.amount,
            details={"invoice_id": invoice.id, "invoice_number": invoice.invoice_number},
        )

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
        "clocked_in_at": now.isoformat() + "Z",
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


class ActiveSessionAdjust(BaseModel):
    session_hours: float


@router.post("/{request_id}/work-sessions", response_model=ServiceRequestResponse)
def create_manual_work_session(
    request_id: int,
    session: ServiceRequestWorkSessionCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Any:
    """Save one manual technician work-session ledger entry."""
    db_sr = _load_service_request_for_work(db, request_id, current_user, session.session_id)
    session_id = session.session_id or uuid.uuid4().hex
    if session.session_id and any(
        entry.get("action") in {"technician_work_session", "technician_clock_out"}
        and (entry.get("changes") or {}).get("session_id") == session_id
        for entry in (db_sr.history or [])
    ):
        # Idempotent retry: the session, stock issuance, and ledger entry were
        # already committed together in the original request.
        return get_service_request(request_id, db, current_user)

    requested_status: Optional[ServiceRequestStatus] = None
    if session.status:
        try:
            requested_status = ServiceRequestStatus(session.status)
        except ValueError as error:
            raise HTTPException(status_code=400, detail="Invalid service request status") from error

        if requested_status != db_sr.status and requested_status not in VALID_TRANSITIONS.get(db_sr.status, []):
            raise HTTPException(
                status_code=400,
                detail=(
                    f"Cannot transition from '{db_sr.status.value}' to '{requested_status.value}'. "
                    f"Allowed: {[item.value for item in VALID_TRANSITIONS.get(db_sr.status, [])]}"
                ),
            )

    break_minutes = Decimal(str(session.break_minutes or 0))
    if break_minutes < 0:
        raise HTTPException(status_code=400, detail="Break time cannot be negative")

    manual_total_hours = Decimal(str(session.total_work_hours)) if session.total_work_hours is not None else None
    if manual_total_hours is not None and manual_total_hours < 0:
        raise HTTPException(status_code=400, detail="Total work hours cannot be negative")
    total_mileage = Decimal(str(session.total_mileage)) if session.total_mileage is not None else Decimal("0")
    if total_mileage < 0:
        raise HTTPException(status_code=400, detail="Total mileage cannot be negative")

    start_time = session.start_time
    end_time = session.end_time
    duration_source = "manual_total_hours"
    raw_hours: Optional[Decimal] = None
    if manual_total_hours is not None and manual_total_hours > 0:
        duration_hours = manual_total_hours.quantize(Decimal("0.01"))
    else:
        if not start_time or not end_time:
            raise HTTPException(status_code=400, detail="Start/end time or total work hours is required")
        if start_time.tzinfo is None:
            start_time = start_time.replace(tzinfo=timezone.utc)
        if end_time.tzinfo is None:
            end_time = end_time.replace(tzinfo=timezone.utc)
        if end_time <= start_time:
            raise HTTPException(status_code=400, detail="End time must be after start time")
        raw_hours = Decimal(str((end_time - start_time).total_seconds() / 3600))
        break_hours = break_minutes / Decimal("60")
        duration_hours = max(raw_hours - break_hours, Decimal("0")).quantize(Decimal("0.01"))
        duration_source = "start_end_time"

    diagnosis = (session.diagnosis or "").strip()
    work_done = (session.work_done or "").strip()
    notes = (session.notes or "").strip()
    test_equipment_used = _test_equipment_history_items(db, list(session.test_equipment_ids or []))
    part_usages = list(session.part_usages or [])
    if duration_hours <= 0:
        raise HTTPException(status_code=400, detail="Work-session duration must be greater than zero after break time")
    if not diagnosis and not work_done and not notes and not test_equipment_used and not part_usages:
        raise HTTPException(status_code=400, detail="Add diagnosis, work done, notes, test equipment, or parts before saving the session")

    now = datetime.utcnow()
    if db_sr.status == ServiceRequestStatus.NEW:
        raise HTTPException(status_code=400, detail="Assign a technician before saving work")
    if not db_sr.started_at:
        db_sr.started_at = now

    existing_hours = Decimal(str(db_sr.time_spent_hours or 0))
    db_sr.time_spent_hours = existing_hours + duration_hours
    db_sr.total_cost = _calculate_service_cost(db_sr)

    previous_status = db_sr.status
    target_status = requested_status
    if target_status is None and previous_status == ServiceRequestStatus.ASSIGNED:
        target_status = ServiceRequestStatus.IN_PROGRESS

    if target_status is not None and target_status != previous_status:
        if target_status == ServiceRequestStatus.COMPLETED:
            if _active_clock_session(db_sr):
                raise HTTPException(status_code=400, detail="End the active work session before marking this service request complete")
            db_sr.completed_at = now
        elif target_status in SERVICE_WORKFLOW_STATUSES and not db_sr.started_at:
            db_sr.started_at = now
        db_sr.status = target_status
        db_sr.total_cost = _calculate_service_cost(db_sr)

    parts_used = _consume_service_parts(db, db_sr, part_usages, current_user, session_id)
    history = list(db_sr.history or [])
    session_changes = {
        "session_id": session_id,
        "break_minutes": float(break_minutes),
        "duration_hours": float(duration_hours),
        "total_work_hours": float(duration_hours),
        "total_mileage": float(total_mileage.quantize(Decimal("0.01"))),
        "duration_source": duration_source,
        "total_hours": float(db_sr.time_spent_hours or 0),
        "diagnosis": diagnosis,
        "work_done": work_done,
        "notes": notes,
        "test_equipment": test_equipment_used,
        "parts": parts_used,
        "status": (
            {"from": previous_status.value, "to": db_sr.status.value}
            if previous_status != db_sr.status
            else db_sr.status.value
        ),
    }
    if start_time:
        session_changes["start_time"] = start_time.isoformat()
        # Compatibility for report utilities that still read clock fields.
        session_changes["clocked_in_at"] = start_time.isoformat()
    if end_time:
        session_changes["end_time"] = end_time.isoformat()
        session_changes["clocked_out_at"] = end_time.isoformat()
    if raw_hours is not None:
        session_changes["raw_hours"] = float(raw_hours.quantize(Decimal("0.01")))
    history.append(_history_entry("technician_work_session", current_user, session_changes))
    db_sr.history = history

    if previous_status != db_sr.status:
        recipients = {db_sr.requester_id, db_sr.assigned_technician_id}
        create_notifications(
            db,
            user_ids=[user_id for user_id in recipients if user_id and user_id != current_user.id],
            title="Service request updated",
            message=f"Service request {db_sr.request_number} is now {db_sr.status.value.replace('_', ' ')}.",
            notification_type="service_request",
            link_url=f"/service-requests/{db_sr.id}",
            actor_id=current_user.id,
        )
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


@router.patch("/{request_id}/active-session", response_model=ServiceRequestResponse)
def adjust_active_session(
    request_id: int,
    body: ActiveSessionAdjust,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Any:
    """Admin-only: adjust the effective start time of the active clock session."""
    if not _is_internal_service_user(current_user):
        raise HTTPException(status_code=403, detail="Not authorized")

    db_sr = db.query(ServiceRequest).filter(ServiceRequest.id == request_id).first()
    if not db_sr:
        raise HTTPException(status_code=404, detail="Service request not found")

    history = list(db_sr.history or [])
    active_idx = None
    for i in range(len(history) - 1, -1, -1):
        action = history[i].get("action")
        if action == "technician_clock_out":
            break
        if action == "technician_clock_in":
            active_idx = i
            break

    if active_idx is None:
        raise HTTPException(status_code=400, detail="No active clock session found")

    hours = max(float(body.session_hours), 0)
    new_start = datetime.now(timezone.utc) - timedelta(hours=hours)
    history = copy.deepcopy(db_sr.history or [])
    history[active_idx]["changes"]["clocked_in_at"] = new_start.isoformat()
    db_sr.history = history
    flag_modified(db_sr, "history")
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
    test_equipment_ids = list(dict.fromkeys(clock_out.test_equipment_ids or []))
    part_usages = list(clock_out.part_usages or [])
    total_mileage = Decimal(str(clock_out.total_mileage)) if clock_out.total_mileage is not None else Decimal("0")
    if total_mileage < 0:
        raise HTTPException(status_code=400, detail="Total mileage cannot be negative")
    if not diagnosis and not work_done and not notes and not test_equipment_ids and not part_usages:
        raise HTTPException(status_code=400, detail="Add diagnosis, work done, notes, test equipment, or parts before clocking out")

    test_equipment_used = []
    if test_equipment_ids:
        equipment_rows = (
            db.query(TestEquipment)
            .filter(TestEquipment.id.in_(test_equipment_ids))
            .all()
        )
        found_ids = {item.id for item in equipment_rows}
        missing_ids = [item_id for item_id in test_equipment_ids if item_id not in found_ids]
        if missing_ids:
            raise HTTPException(status_code=404, detail=f"Test equipment not found: {', '.join(map(str, missing_ids))}")
        equipment_by_id = {item.id: item for item in equipment_rows}
        test_equipment_used = [
            {
                "id": item.id,
                "tem": item.tem,
                "mrf": item.mrf,
                "model": item.model,
                "serial_number": item.serial_number,
                "description": item.description,
                "asset": item.asset,
                "image_url": item.image_url,
            }
            for item in (equipment_by_id[item_id] for item_id in test_equipment_ids)
        ]

    now = datetime.now(timezone.utc)
    changes = active.get("changes") or {}
    clocked_in_str = changes.get("clocked_in_at") or active.get("timestamp")
    clocked_in_at = datetime.fromisoformat(clocked_in_str)
    if clocked_in_at.tzinfo is None:
        clocked_in_at = clocked_in_at.replace(tzinfo=timezone.utc)
    duration_hours = max((now - clocked_in_at).total_seconds() / 3600, 0)
    rounded_hours = Decimal(str(round(duration_hours, 2)))
    existing_hours = Decimal(str(db_sr.time_spent_hours or 0))
    db_sr.time_spent_hours = existing_hours + rounded_hours
    db_sr.total_cost = _calculate_service_cost(db_sr)

    session_id = changes.get("session_id") or uuid.uuid4().hex
    parts_used = _consume_service_parts(db, db_sr, part_usages, current_user, session_id)
    history = list(db_sr.history or [])
    history.append(_history_entry("technician_clock_out", current_user, {
        "session_id": session_id,
        "clocked_in_at": clocked_in_at.isoformat(),
        "clocked_out_at": now.isoformat(),
        "duration_hours": float(rounded_hours),
        "total_mileage": float(total_mileage.quantize(Decimal("0.01"))),
        "total_hours": float(db_sr.time_spent_hours or 0),
        "diagnosis": diagnosis,
        "work_done": work_done,
        "notes": notes,
        "test_equipment": test_equipment_used,
        "parts": parts_used,
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
    current_user: User = Depends(get_current_user),
) -> Any:
    """Delete a service request (admin only)."""
    if not _is_internal_service_user(current_user):
        raise HTTPException(status_code=403, detail="Only an administrator can delete a service request")
    db_sr = db.query(ServiceRequest).filter(ServiceRequest.id == request_id).first()
    if not db_sr:
        raise HTTPException(status_code=404, detail="Service request not found")
    _require_service_facility_access(db, current_user, db_sr.facility_id)
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
    if not (_is_internal_service_user(current_user) or current_user.role == UserRole.TECHNICIAN):
        raise HTTPException(status_code=403, detail="Not enough permissions")

    db_sr = db.query(ServiceRequest).filter(ServiceRequest.id == request_id).first()
    if not db_sr:
        raise HTTPException(status_code=404, detail="Service request not found")
    _require_service_facility_access(db, current_user, db_sr.facility_id)
    if current_user.role == UserRole.TECHNICIAN and db_sr.assigned_technician_id != current_user.id:
        raise HTTPException(status_code=403, detail="You can only create quotations for service requests assigned to you")

    if db_sr.status in {ServiceRequestStatus.COMPLETED, ServiceRequestStatus.CANCELLED}:
        raise HTTPException(status_code=400, detail="Cannot create quotation for a completed or cancelled service request")

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
        service_request=db_sr,
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

    _append_quotation_ledger(
        db,
        db_quotation,
        "created",
        current_user,
        amount=total_amount,
        details={"status": "draft"},
    )

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
    if not (_is_internal_service_user(current_user) or current_user.role == UserRole.TECHNICIAN):
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
    _require_service_facility_access(db, current_user, db_quotation.service_request.facility_id)
    if current_user.role == UserRole.TECHNICIAN and db_quotation.service_request.assigned_technician_id != current_user.id:
        raise HTTPException(status_code=403, detail="You can only edit quotations for service requests assigned to you")

    if db_quotation.service_request.status in {ServiceRequestStatus.COMPLETED, ServiceRequestStatus.CANCELLED}:
        raise HTTPException(status_code=400, detail="Cannot edit a quotation for a completed or cancelled service request")
    if db_quotation.status in {"paid", "partially_paid", "included_in_invoice"} or db_quotation.payments:
        raise HTTPException(status_code=400, detail="A billed or paid quotation cannot be edited")

    update_data = quotation_in.model_dump(exclude_unset=True)
    protected_statuses = {
        "authorization_requested",
        "authorized",
        "partially_paid",
        "paid",
        "included_in_invoice",
    }
    if update_data.get("status") in protected_statuses:
        raise HTTPException(
            status_code=400,
            detail="Authorization and payment statuses can only be changed through their dedicated workflow",
        )
    authorization_sensitive_change = any(
        field in update_data for field in {"description", "line_items", "status"}
    )
    active_authorization = _latest_active_authorization(db_quotation)

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

    if authorization_sensitive_change and active_authorization:
        active_authorization.status = "invalidated"
        active_authorization.invalidated_at = datetime.utcnow()
        db_quotation.status = "draft"
        _append_quotation_ledger(
            db,
            db_quotation,
            "authorization_invalidated",
            current_user,
            amount=db_quotation.amount,
            details={
                "authorization_id": active_authorization.id,
                "reason": "Quotation details or amount changed",
            },
        )

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
    if not (_is_internal_service_user(current_user) or current_user.role == UserRole.TECHNICIAN):
        raise HTTPException(status_code=403, detail="Not enough permissions")

    db_quotation = (
        db.query(ServiceRequestQuotation)
        .options(joinedload(ServiceRequestQuotation.service_request))
        .filter(ServiceRequestQuotation.id == quotation_id)
        .first()
    )
    if not db_quotation:
        raise HTTPException(status_code=404, detail="Quotation not found")
    _require_service_facility_access(db, current_user, db_quotation.service_request.facility_id)
    if current_user.role == UserRole.TECHNICIAN and db_quotation.service_request.assigned_technician_id != current_user.id:
        raise HTTPException(status_code=403, detail="You can only delete quotations for service requests assigned to you")

    if db_quotation.service_request.status in {ServiceRequestStatus.COMPLETED, ServiceRequestStatus.CANCELLED}:
        raise HTTPException(status_code=400, detail="Cannot delete a quotation for a completed or cancelled service request")
    if db_quotation.status in {"paid", "partially_paid", "included_in_invoice"} or db_quotation.payments:
        raise HTTPException(status_code=400, detail="A billed or paid quotation cannot be deleted")

    db.delete(db_quotation)
    db.commit()
    return {"detail": "Quotation deleted"}


@router.get("/quotations/all", response_model=list[ServiceRequestQuotationListResponse])
def get_all_quotations(
    db: Session = Depends(get_db),
    search: Optional[str] = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
    current_user: User = Depends(get_current_user),
) -> Any:
    """Get all service request quotations."""
    quotations = (
        db.query(ServiceRequestQuotation)
        .join(ServiceRequest, ServiceRequest.id == ServiceRequestQuotation.service_request_id)
        .options(
            joinedload(ServiceRequestQuotation.service_request).joinedload(ServiceRequest.facility),
            selectinload(ServiceRequestQuotation.line_items),
            selectinload(ServiceRequestQuotation.payments),
            selectinload(ServiceRequestQuotation.authorizations),
            selectinload(ServiceRequestQuotation.ledger_entries),
        )
        .order_by(ServiceRequestQuotation.created_at.desc())
    )
    if search and search.strip():
        like = f"%{search.strip()}%"
        quotations = quotations.outerjoin(Facility, ServiceRequest.facility_id == Facility.id).filter(
            or_(
                ServiceRequestQuotation.quotation_number.ilike(like),
                ServiceRequestQuotation.description.ilike(like),
                ServiceRequest.request_number.ilike(like),
                ServiceRequest.problem_description.ilike(like),
                Facility.name.ilike(like),
            )
        )
    quotations = (
        _scope_service_query(quotations, ServiceRequest.facility_id, db, current_user)
        .offset(skip)
        .limit(limit)
        .all()
    )

    result = []
    for q in quotations:
        q_dict = _quotation_dict(q)
        q_dict["request_number"] = q.service_request.request_number if q.service_request else "Unknown"
        q_dict["facility_name"] = q.service_request.facility.name if q.service_request and q.service_request.facility else None
        q_dict["facility_id"] = q.service_request.facility_id if q.service_request else None
        result.append(q_dict)

    return result


# ── QUOTATION PAYMENT ENDPOINTS ─────────────────────────────────────────────

@router.get("/quotations/{quotation_id}/authorization-candidates")
def get_quotation_authorization_candidates(
    quotation_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Any:
    if not _is_internal_service_user(current_user):
        raise HTTPException(status_code=403, detail="Only an admin or super admin can record phone authorization")
    if not has_module_permission(current_user, "billing", "edit"):
        raise HTTPException(status_code=403, detail="Billing edit permission is required")
    quotation = (
        db.query(ServiceRequestQuotation)
        .options(joinedload(ServiceRequestQuotation.service_request).joinedload(ServiceRequest.facility))
        .filter(ServiceRequestQuotation.id == quotation_id)
        .first()
    )
    if not quotation:
        raise HTTPException(status_code=404, detail="Quotation not found")
    candidate_ids = _facility_authorizer_user_ids(db, quotation.service_request)
    candidates = db.query(User).filter(User.id.in_(candidate_ids)).order_by(User.full_name.asc()).all() if candidate_ids else []
    return [
        {"id": candidate.id, "full_name": candidate.full_name, "email": candidate.email, "role": _role_name(candidate)}
        for candidate in candidates
    ]


@router.post(
    "/quotations/{quotation_id}/authorization-requests",
    response_model=QuotationAuthorizationResponse,
    status_code=status.HTTP_201_CREATED,
)
def request_quotation_authorization(
    quotation_id: int,
    payload: QuotationAuthorizationRequestCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Any:
    """Request customer authorization for a service quotation."""
    if not _is_internal_service_user(current_user):
        raise HTTPException(status_code=403, detail="Only an admin or super admin can request authorization")
    if not has_module_permission(current_user, "billing", "edit"):
        raise HTTPException(status_code=403, detail="Billing edit permission is required")

    quotation = (
        db.query(ServiceRequestQuotation)
        .options(
            joinedload(ServiceRequestQuotation.service_request).joinedload(ServiceRequest.facility),
            selectinload(ServiceRequestQuotation.authorizations),
        )
        .filter(ServiceRequestQuotation.id == quotation_id)
        .with_for_update(of=ServiceRequestQuotation)
        .first()
    )
    if not quotation:
        raise HTTPException(status_code=404, detail="Quotation not found")
    if quotation.service_request.status == ServiceRequestStatus.CANCELLED:
        raise HTTPException(status_code=400, detail="Cannot authorize a quotation for a cancelled service request")
    if quotation.status in {"paid", "included_in_invoice", "cancelled"}:
        raise HTTPException(status_code=400, detail="This quotation is no longer eligible for authorization")

    active = _latest_active_authorization(quotation)
    if active:
        if active.status == "requested":
            return _authorization_dict(active)
        raise HTTPException(status_code=409, detail="This quotation is already authorized")

    authorization = QuotationAuthorization(
        quotation=quotation,
        status="requested",
        authorized_amount=quotation.amount,
        requested_by_id=current_user.id,
        notes=payload.notes,
    )
    db.add(authorization)
    db.flush()
    quotation.status = "authorization_requested"
    quotation.updated_at = datetime.utcnow()
    _append_quotation_ledger(
        db,
        quotation,
        "authorization_requested",
        current_user,
        amount=quotation.amount,
        details={"authorization_id": authorization.id, "notes": payload.notes},
    )

    create_notifications(
        db,
        user_ids=[
            user_id for user_id in _facility_authorizer_user_ids(db, quotation.service_request)
            if user_id != current_user.id
        ],
        title="Quotation authorization requested",
        message=f"Authorization is required for {quotation.quotation_number} (${quotation.amount}).",
        notification_type="billing",
        link_url=f"/billing?search={quotation.quotation_number}",
        actor_id=current_user.id,
    )
    db.commit()
    db.refresh(authorization)
    return _authorization_dict(authorization)


@router.post(
    "/quotations/{quotation_id}/authorization-decisions",
    response_model=QuotationAuthorizationResponse,
)
def decide_quotation_authorization(
    quotation_id: int,
    payload: QuotationAuthorizationDecisionCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Any:
    """Authorize/decline in self-service or record a customer's phone decision."""
    decision = payload.decision.strip().lower()
    channel = payload.channel.strip().lower()
    if decision not in {"authorized", "declined"}:
        raise HTTPException(status_code=400, detail="Decision must be authorized or declined")
    if channel not in {"self_service", "phone"}:
        raise HTTPException(status_code=400, detail="Authorization channel must be self_service or phone")
    if not has_module_permission(current_user, "billing", "edit"):
        raise HTTPException(status_code=403, detail="Billing edit permission is required")

    quotation = (
        db.query(ServiceRequestQuotation)
        .options(
            joinedload(ServiceRequestQuotation.service_request).joinedload(ServiceRequest.facility),
            selectinload(ServiceRequestQuotation.authorizations),
        )
        .filter(ServiceRequestQuotation.id == quotation_id)
        .with_for_update(of=ServiceRequestQuotation)
        .first()
    )
    if not quotation:
        raise HTTPException(status_code=404, detail="Quotation not found")
    _require_service_facility_access(db, current_user, quotation.service_request.facility_id)
    if quotation.service_request.status == ServiceRequestStatus.CANCELLED:
        raise HTTPException(status_code=400, detail="Cannot authorize a quotation for a cancelled service request")

    authorization = next(
        (item for item in (quotation.authorizations or []) if item.status == "requested"),
        None,
    )
    if not authorization:
        raise HTTPException(status_code=409, detail="No pending authorization request exists for this quotation")
    if _money(authorization.authorized_amount) != _money(quotation.amount):
        raise HTTPException(status_code=409, detail="Quotation amount changed; request authorization again")

    authorizer: User
    recorded_by: Optional[User] = None
    if channel == "self_service":
        if not _can_self_authorize_quotation(current_user):
            raise HTTPException(status_code=403, detail="Self-service authorization is limited to facility billing users")
        authorizer = current_user
    else:
        if not _is_internal_service_user(current_user):
            raise HTTPException(status_code=403, detail="Only an admin or super admin can record phone authorization")
        if not payload.authorized_by_user_id:
            raise HTTPException(status_code=400, detail="Select the facility representative who authorized by phone")
        authorizer = db.query(User).filter(User.id == payload.authorized_by_user_id, User.is_active.is_(True)).first()
        if not authorizer or authorizer.role not in {UserRole.FACILITY_ADMIN, UserRole.FACILITY_MANAGER}:
            raise HTTPException(status_code=400, detail="Phone authorizer must be an active facility admin or manager")
        if quotation.service_request.facility_id not in get_user_facility_ids(db, authorizer):
            raise HTTPException(status_code=403, detail="Selected authorizer does not manage this facility")
        recorded_by = current_user

    now = datetime.utcnow()
    authorization.status = decision
    authorization.channel = channel
    authorization.authorized_by_id = authorizer.id
    authorization.authorized_by_name = authorizer.full_name or authorizer.username
    authorization.authorized_by_role = _role_name(authorizer)
    authorization.recorded_by_id = recorded_by.id if recorded_by else None
    authorization.notes = payload.notes or authorization.notes
    authorization.decided_at = now
    if decision == "authorized":
        authorization.confirmation_reference = payload.confirmation_reference or f"AUTH-{quotation.quotation_number}-{authorization.id:04d}"
        quotation.status = "authorized"
    else:
        authorization.confirmation_reference = payload.confirmation_reference
        quotation.status = "rejected"
    quotation.updated_at = now

    ledger_actor = current_user if recorded_by else authorizer
    _append_quotation_ledger(
        db,
        quotation,
        f"authorization_{decision}",
        ledger_actor,
        channel=channel,
        amount=authorization.authorized_amount,
        reference_number=authorization.confirmation_reference,
        details={
            "authorization_id": authorization.id,
            "authorized_by_id": authorizer.id,
            "authorized_by_name": authorization.authorized_by_name,
            "authorized_by_role": authorization.authorized_by_role,
            "recorded_by_id": recorded_by.id if recorded_by else None,
            "recorded_by_name": (recorded_by.full_name or recorded_by.username) if recorded_by else None,
            "notes": payload.notes,
        },
    )

    notify_ids = {
        authorization.requested_by_id,
        quotation.service_request.requester_id,
        quotation.service_request.assigned_technician_id,
    }
    create_notifications(
        db,
        user_ids=[user_id for user_id in notify_ids if user_id and user_id != current_user.id],
        title=f"Quotation authorization {decision}",
        message=f"{quotation.quotation_number} was {decision} by {authorization.authorized_by_name}.",
        notification_type="billing",
        link_url=f"/billing?search={quotation.quotation_number}",
        actor_id=current_user.id,
    )
    db.commit()
    db.refresh(authorization)
    return _authorization_dict(authorization)


@router.post("/quotations/{quotation_id}/payments", response_model=QuotationPaymentResponse, status_code=status.HTTP_201_CREATED)
def create_quotation_payment(
    quotation_id: int,
    payment_in: QuotationPaymentCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Any:
    """Record a payment for a quotation via Credit Card, ACH, or MBMTS ACH."""
    if current_user.role not in [
        UserRole.SUPERADMIN,
        UserRole.ADMIN,
        UserRole.FACILITY_ADMIN,
        UserRole.FACILITY_MANAGER,
        UserRole.CLIENT,
    ]:
        raise HTTPException(status_code=403, detail="Not enough permissions")
    if not has_module_permission(current_user, "billing", "edit"):
        raise HTTPException(status_code=403, detail="Billing edit permission is required")

    db_quotation = (
        db.query(ServiceRequestQuotation)
        .options(
            joinedload(ServiceRequestQuotation.service_request),
            selectinload(ServiceRequestQuotation.authorizations),
            selectinload(ServiceRequestQuotation.payments),
        )
        .filter(ServiceRequestQuotation.id == quotation_id)
        .with_for_update(of=ServiceRequestQuotation)
        .first()
    )
    if not db_quotation:
        raise HTTPException(status_code=404, detail="Quotation not found")
    _require_service_facility_access(db, current_user, db_quotation.service_request.facility_id)

    valid_methods = ["credit_card", "ach", "mbmts_ach"]
    if payment_in.payment_method not in valid_methods:
        raise HTTPException(status_code=400, detail=f"Invalid payment method. Allowed: {valid_methods}")
    if db_quotation.status not in {"authorized", "partially_paid"}:
        raise HTTPException(status_code=409, detail="Only an authorized quotation can be paid")

    authorization = next(
        (item for item in (db_quotation.authorizations or []) if item.status == "authorized"),
        None,
    )
    if not authorization:
        raise HTTPException(status_code=409, detail="Quotation payment must be authorized first")
    if _money(authorization.authorized_amount) != _money(db_quotation.amount):
        raise HTTPException(status_code=409, detail="Authorization no longer matches the quotation amount")

    payment_amount = _money(payment_in.amount).quantize(Decimal("0.01"))
    if payment_amount <= Decimal("0"):
        raise HTTPException(status_code=400, detail="Payment amount must be greater than zero")
    paid_to_date = sum(
        (_money(payment.amount) for payment in (db_quotation.payments or []) if payment.status == "completed"),
        Decimal("0"),
    ).quantize(Decimal("0.01"))
    remaining_balance = max((_money(db_quotation.amount) - paid_to_date).quantize(Decimal("0.01")), Decimal("0"))
    if remaining_balance <= Decimal("0"):
        raise HTTPException(status_code=409, detail="This quotation is already fully paid")
    if payment_amount > remaining_balance:
        raise HTTPException(status_code=400, detail=f"Payment cannot exceed the remaining balance of ${remaining_balance}")

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
        amount=payment_amount,
        reference_number=reference_number,
        notes=payment_in.notes,
        status="completed",
        paid_at=datetime.utcnow(),
        created_by_id=current_user.id,
        authorization_id=authorization.id,
        payment_channel=(
            "admin_assisted"
            if _is_internal_service_user(current_user)
            else "facility_self_service"
        ),
        payer_role=_role_name(current_user),
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

    new_paid_total = (paid_to_date + payment_amount).quantize(Decimal("0.01"))
    new_balance = max((_money(db_quotation.amount) - new_paid_total).quantize(Decimal("0.01")), Decimal("0"))
    db_quotation.status = "paid" if new_balance == Decimal("0") else "partially_paid"
    db_quotation.updated_at = datetime.utcnow()

    _append_quotation_ledger(
        db,
        db_quotation,
        "payment_recorded",
        current_user,
        channel=db_payment.payment_channel,
        amount=payment_amount,
        reference_number=reference_number,
        details={
            "authorization_id": authorization.id,
            "authorization_reference": authorization.confirmation_reference,
            "authorized_by_id": authorization.authorized_by_id,
            "authorized_by_name": authorization.authorized_by_name,
            "authorized_by_role": authorization.authorized_by_role,
            "paid_by_id": current_user.id,
            "paid_by_name": current_user.full_name or current_user.username,
            "paid_by_role": _role_name(current_user),
            "payment_channel": db_payment.payment_channel,
            "payment_method": payment_in.payment_method,
            "paid_total": new_paid_total,
            "remaining_balance": new_balance,
            "quotation_status": db_quotation.status,
        },
    )

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

    return _payment_dict(db_payment)
