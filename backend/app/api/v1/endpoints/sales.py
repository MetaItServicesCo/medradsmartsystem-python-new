import json
from datetime import date, datetime, timedelta
from decimal import Decimal
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, EmailStr
from sqlalchemy import func, or_
from sqlalchemy.orm import Session, joinedload, selectinload

from app.db.base import get_db
from app.core.deps import get_current_user
from app.utils.permission_deps import require_module_access
from app.models.facility import Facility
from app.models.inventory import InventoryPart
from app.models.invoice import Invoice, InvoiceStatus, InvoiceTransaction, InvoiceType
from app.models.sales import SalesQuotation, SalesQuotationLineItem
from app.models.user import User, UserRole
from app.models.user_facility import UserFacility
from app.utils.facility_access import require_facility_access, scope_query_to_user_facilities
from app.utils.invoice_editing import compose_invoice_edit_notes, editable_labels, editable_line_items, editable_summary_rows, parse_invoice_edit_metadata, strip_invoice_edit_metadata
from app.utils.invoice_ledger import record_invoice_created, record_payment_delta, record_status_change, transaction_response
from app.utils.invoice_approval import (
    approval_response,
    ensure_financial_edit_allowed,
    has_financial_edits,
    invalidate_invoice_approval,
    is_facility_billing_user,
    is_invoice_approver,
    require_invoice_approved,
    require_invoice_payer,
    scope_invoice_approval_visibility,
    validate_requested_payment_status,
)
from app.utils.logging import log_activity
from app.utils.notifications import create_notifications
from app.utils.permissions import has_module_permission
from app.utils.list_search import (
    contains_ci,
    normalize_list_search,
    parsed_date_value,
    predicates_for_field,
    value_contains_ci,
)

router = APIRouter(dependencies=[Depends(require_module_access("sales"))])


class SalesQuotationItemIn(BaseModel):
    part_id: int
    quantity: int = 1
    unit_price: Optional[Decimal] = None
    shipping_fee: Decimal = Decimal("0")
    setup_fee: Decimal = Decimal("0")
    condition: Optional[str] = None
    description: Optional[str] = None


class SalesQuotationCreate(BaseModel):
    facility_id: Optional[int] = None
    customer_name: str
    customer_email: Optional[EmailStr] = None
    customer_phone: Optional[str] = None
    customer_address: Optional[str] = None
    quotation_type: str = "standard"
    requested_date: Optional[date] = None
    notes: Optional[str] = None
    tax_amount: Decimal = Decimal("0")
    discount_amount: Decimal = Decimal("0")
    items: list[SalesQuotationItemIn]


class SalesQuotationUpdate(BaseModel):
    facility_id: Optional[int] = None
    customer_name: Optional[str] = None
    customer_email: Optional[EmailStr] = None
    customer_phone: Optional[str] = None
    customer_address: Optional[str] = None
    quotation_type: Optional[str] = None
    requested_date: Optional[date] = None
    notes: Optional[str] = None
    tax_amount: Optional[Decimal] = None
    discount_amount: Optional[Decimal] = None
    status: Optional[str] = None
    paid_status: Optional[str] = None
    items: Optional[list[SalesQuotationItemIn]] = None


class SalesInvoiceUpdate(BaseModel):
    customer_name: Optional[str] = None
    customer_email: Optional[EmailStr] = None
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


class SalesInvoiceCreate(BaseModel):
    labour_hours: Decimal = Decimal("0")
    worked_hours: Decimal = Decimal("0")
    setup_fee: Decimal = Decimal("0")
    service_fee: Decimal = Decimal("0")
    shipping_fee: Decimal = Decimal("0")
    application_fee: Decimal = Decimal("0")
    tax_rate: Decimal = Decimal("0")
    discount_type: str = "fixed"
    discount_amount: Optional[Decimal] = None
    payment_method: Optional[str] = None
    action: Optional[str] = None
    due_date: Optional[date] = None
    notes: Optional[str] = None


def _money(value: Any) -> Decimal:
    if value in (None, ""):
        return Decimal("0")
    return Decimal(str(value))


def _next_number(db: Session, model: Any, field: str, prefix: str, start: int = 1) -> str:
    last = db.query(model).order_by(model.id.desc()).first()
    next_num = (last.id + 1) if last else start
    while True:
        value = f"{date.today().year}-{next_num:06d}" if prefix == "WO" else f"{prefix}-{next_num:06d}"
        if not db.query(model).filter(getattr(model, field) == value).first():
            return value
        next_num += 1


def _next_invoice_number(db: Session) -> str:
    last = db.query(Invoice).order_by(Invoice.id.desc()).first()
    next_num = (last.id + 1) if last else 1
    return f"INV-SALES-{next_num:06d}"


def _history_entry(action: str, user: User, details: Optional[dict[str, Any]] = None) -> dict[str, Any]:
    return {
        "action": action,
        "by": user.full_name or user.username,
        "user_id": user.id,
        "at": datetime.utcnow().isoformat(),
        "details": details or {},
    }


def _append_history(quotation: SalesQuotation, action: str, user: User, details: Optional[dict[str, Any]] = None) -> None:
    history = list(quotation.history or [])
    safe_details = json.loads(json.dumps(details or {}, default=str)) if details else None
    history.append(_history_entry(action, user, safe_details))
    quotation.history = history


def _part_response(part: InventoryPart) -> dict[str, Any]:
    return {
        "id": part.id,
        "part_number": part.part_number,
        "part_type": part.part_type,
        "description": part.description,
        "make": part.make,
        "model": part.model,
        "default_picture_url": part.default_picture_url,
        "serial_number": part.serial_number,
        "condition": part.condition,
        "quantity_on_hand": part.quantity_on_hand,
        "unit_price": part.unit_price,
        "facility_id": part.facility_id,
        "facility_name": part.facility.name if part.facility else None,
        "status": part.status,
    }


def _line_response(line: SalesQuotationLineItem) -> dict[str, Any]:
    return {
        "id": line.id,
        "part_id": line.part_id,
        "part_number": line.part.part_number if line.part else None,
        "part_description": line.part.description if line.part else None,
        "description": line.description,
        "quantity": line.quantity,
        "unit_price": line.unit_price,
        "shipping_fee": line.shipping_fee,
        "setup_fee": line.setup_fee,
        "condition": line.condition,
        "total": line.total,
    }


def _invoice_response(invoice: Invoice) -> dict[str, Any]:
    return {
        "id": invoice.id,
        "invoice_number": invoice.invoice_number,
        "invoice_type": invoice.invoice_type.value if hasattr(invoice.invoice_type, "value") else invoice.invoice_type,
        "sales_quotation_id": invoice.sales_quotation_id,
        "sales_quotation_number": invoice.sales_quotation.quotation_number if invoice.sales_quotation else None,
        "work_order": invoice.sales_quotation.work_order if invoice.sales_quotation else None,
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
        "notes": strip_invoice_edit_metadata(invoice.notes),
        "created_at": invoice.created_at,
        "updated_at": invoice.updated_at,
        "transactions": [transaction_response(item) for item in invoice.transactions or []],
        "line_items": editable_line_items(invoice.notes),
        "labels": editable_labels(invoice.notes),
        "summary_rows": editable_summary_rows(invoice.notes),
        **approval_response(invoice),
    }


def _quotation_response(quotation: SalesQuotation) -> dict[str, Any]:
    return {
        "id": quotation.id,
        "quotation_number": quotation.quotation_number,
        "work_order": quotation.work_order,
        "facility_id": quotation.facility_id,
        "facility_name": quotation.facility.name if quotation.facility else None,
        "customer_name": quotation.customer_name,
        "customer_email": quotation.customer_email,
        "customer_phone": quotation.customer_phone,
        "customer_address": quotation.customer_address,
        "quotation_type": quotation.quotation_type,
        "status": quotation.status,
        "paid_status": quotation.paid_status,
        "requested_date": quotation.requested_date,
        "notes": quotation.notes,
        "worked_hours": quotation.worked_hours,
        "setup_fee": quotation.setup_fee,
        "service_fee": quotation.service_fee,
        "shipping_fee": quotation.shipping_fee,
        "application_fee": quotation.application_fee,
        "tax_rate": quotation.tax_rate,
        "payment_method": quotation.payment_method,
        "subtotal": quotation.subtotal,
        "tax_amount": quotation.tax_amount,
        "discount_amount": quotation.discount_amount,
        "total_amount": quotation.total_amount,
        "created_by_id": quotation.created_by_id,
        "created_by_name": quotation.created_by.full_name if quotation.created_by else None,
        "converted_invoice_id": quotation.converted_invoice_id,
        "converted_invoice_number": quotation.converted_invoice.invoice_number if quotation.converted_invoice else None,
        "converted_invoice_status": (
            quotation.converted_invoice.status.value
            if quotation.converted_invoice and hasattr(quotation.converted_invoice.status, "value")
            else quotation.converted_invoice.status
            if quotation.converted_invoice
            else None
        ),
        "converted_invoice_amount_paid": quotation.converted_invoice.amount_paid if quotation.converted_invoice else None,
        "converted_invoice_balance_due": quotation.converted_invoice.balance_due if quotation.converted_invoice else None,
        "converted_invoice_payment_method": quotation.converted_invoice.payment_method if quotation.converted_invoice else quotation.payment_method,
        "created_at": quotation.created_at,
        "updated_at": quotation.updated_at,
        "history": quotation.history or [],
        "line_items": [_line_response(line) for line in quotation.line_items or []],
    }


def _sales_part_query(db: Session, current_user: User):
    return (
        scope_query_to_user_facilities(db.query(InventoryPart), InventoryPart.facility_id, db, current_user)
        .options(joinedload(InventoryPart.facility))
        .filter(
            InventoryPart.part_type.ilike("sales"),
            InventoryPart.status == "active",
        )
    )


def _apply_items(db: Session, quotation: SalesQuotation, items: list[SalesQuotationItemIn], current_user: User) -> None:
    if not items:
        raise HTTPException(status_code=400, detail="At least one sales part is required")

    quotation.line_items.clear()
    subtotal = Decimal("0")
    for item in items:
        if item.quantity <= 0:
            raise HTTPException(status_code=400, detail="Quantity must be greater than zero")
        part = _sales_part_query(db, current_user).filter(InventoryPart.id == item.part_id).first()
        if not part:
            raise HTTPException(status_code=404, detail=f"Sales part #{item.part_id} not found")
        if part.quantity_on_hand < item.quantity:
            raise HTTPException(status_code=400, detail=f"Not enough stock for {part.part_number}")
        unit_price = _money(item.unit_price if item.unit_price is not None else part.unit_price)
        shipping_fee = _money(item.shipping_fee)
        setup_fee = _money(item.setup_fee)
        total = (unit_price * item.quantity) + shipping_fee + setup_fee
        subtotal += total
        quotation.line_items.append(
            SalesQuotationLineItem(
                part_id=part.id,
                description=item.description or part.description,
                quantity=item.quantity,
                unit_price=unit_price,
                shipping_fee=shipping_fee,
                setup_fee=setup_fee,
                condition=item.condition or part.condition,
                total=total,
            )
        )

    quotation.subtotal = subtotal
    quotation.total_amount = subtotal + _money(quotation.tax_amount) - _money(quotation.discount_amount)


@router.get("/parts")
def list_sales_parts(
    db: Session = Depends(get_db),
    search: Optional[str] = Query(None),
    search_field: Optional[str] = Query(None),
    date_from: Optional[date] = Query(None),
    date_to: Optional[date] = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(25, ge=1, le=100),
    current_user: User = Depends(get_current_user),
) -> Any:
    if date_from and date_to and date_from > date_to:
        raise HTTPException(status_code=422, detail="From date cannot be after To date")
    query = _sales_part_query(db, current_user)
    if date_from:
        start_at = datetime.combine(date_from, datetime.min.time())
        query = query.filter(
            or_(
                InventoryPart.inventory_date >= date_from,
                (InventoryPart.inventory_date.is_(None) & (InventoryPart.created_at >= start_at)),
            )
        )
    if date_to:
        end_at = datetime.combine(date_to + timedelta(days=1), datetime.min.time())
        query = query.filter(
            or_(
                InventoryPart.inventory_date <= date_to,
                (InventoryPart.inventory_date.is_(None) & (InventoryPart.created_at < end_at)),
            )
        )
    search_term = normalize_list_search(search)
    if search_term:
        facility_match = (
            db.query(Facility.id)
            .filter(
                Facility.id == InventoryPart.facility_id,
                contains_ci(Facility.name, search_term),
            )
            .exists()
        )
        search_by_field = {
            "part_number": [
                contains_ci(InventoryPart.part_number, search_term),
                contains_ci(InventoryPart.asset_tag, search_term),
            ],
            "description": [contains_ci(InventoryPart.description, search_term)],
            "make_model": [
                contains_ci(InventoryPart.make, search_term),
                contains_ci(InventoryPart.model, search_term),
            ],
            "serial": [contains_ci(InventoryPart.serial_number, search_term)],
            "condition": [contains_ci(InventoryPart.condition, search_term)],
            "status": [contains_ci(InventoryPart.status, search_term)],
            "price": [value_contains_ci(InventoryPart.unit_price, search_term)],
            "stock": [value_contains_ci(InventoryPart.quantity_on_hand, search_term)],
            "facility": [facility_match],
        }
        query = query.filter(or_(*predicates_for_field(search_field, search_by_field)))
    total = query.count()
    parts = (
        query.order_by(InventoryPart.updated_at.desc(), InventoryPart.id.desc())
        .offset(skip)
        .limit(limit)
        .all()
    )
    return {"items": [_part_response(part) for part in parts], "total": total, "skip": skip, "limit": limit}


IN_PROGRESS_QUOTATION_STATUSES = ("in_progress",)
COMPLETED_QUOTATION_STATUSES = ("completed",)


@router.get("/quotations")
def list_quotations(
    db: Session = Depends(get_db),
    status_filter: Optional[str] = Query(None, alias="status"),
    view: Optional[str] = Query(None, description="quotations | in_progress | completed"),
    search: Optional[str] = Query(None),
    search_field: Optional[str] = Query(None),
    date_from: Optional[date] = Query(None),
    date_to: Optional[date] = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
    current_user: User = Depends(get_current_user),
) -> Any:
    if date_from and date_to and date_from > date_to:
        raise HTTPException(status_code=422, detail="From date cannot be after To date")
    query = (
        scope_query_to_user_facilities(db.query(SalesQuotation), SalesQuotation.facility_id, db, current_user)
        .options(
            joinedload(SalesQuotation.facility),
            joinedload(SalesQuotation.created_by),
            joinedload(SalesQuotation.converted_invoice),
            joinedload(SalesQuotation.line_items).joinedload(SalesQuotationLineItem.part),
        )
    )
    if date_from:
        query = query.filter(SalesQuotation.requested_date >= date_from)
    if date_to:
        query = query.filter(SalesQuotation.requested_date <= date_to)
    if status_filter:
        query = query.filter(SalesQuotation.status == status_filter)
    if view == "in_progress":
        query = query.filter(SalesQuotation.status.in_(IN_PROGRESS_QUOTATION_STATUSES))
    elif view == "completed":
        query = query.filter(SalesQuotation.status.in_(COMPLETED_QUOTATION_STATUSES))
    elif view == "quotations":
        query = query.filter(
            SalesQuotation.status.notin_(IN_PROGRESS_QUOTATION_STATUSES + COMPLETED_QUOTATION_STATUSES)
        )
    search_term = normalize_list_search(search)
    if search_term:
        normalized_value = search_term.lower().replace("-", "_").replace(" ", "_")
        requested_date = parsed_date_value(search_term)
        search_by_field = {
            "quotation": [
                value_contains_ci(SalesQuotation.id, search_term.lstrip("#")),
                contains_ci(SalesQuotation.quotation_number, search_term),
            ],
            "work_order": [contains_ci(SalesQuotation.work_order, search_term)],
            "customer": [contains_ci(SalesQuotation.customer_name, search_term)],
            "type": [contains_ci(SalesQuotation.quotation_type, normalized_value)],
            "status": [
                contains_ci(SalesQuotation.status, normalized_value),
                contains_ci(SalesQuotation.paid_status, normalized_value),
            ],
            "facility": [contains_ci(Facility.name, search_term)],
            "created_by": [contains_ci(User.full_name, search_term)],
            "date": [value_contains_ci(SalesQuotation.requested_date, search_term)],
            "activity": [value_contains_ci(SalesQuotation.history, search_term)],
        }
        if requested_date:
            search_by_field["date"].append(SalesQuotation.requested_date == requested_date)
        query = (
            query
            .outerjoin(Facility, SalesQuotation.facility_id == Facility.id)
            .outerjoin(User, SalesQuotation.created_by_id == User.id)
            .filter(or_(*predicates_for_field(search_field, search_by_field)))
        )
    total = query.count()
    quotations = query.order_by(SalesQuotation.created_at.desc()).offset(skip).limit(limit).all()
    return {
        "items": [_quotation_response(item) for item in quotations],
        "total": total,
        "skip": skip,
        "limit": limit,
    }


@router.get("/quotations/{quotation_id}")
def get_quotation(
    quotation_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Any:
    """Fetch a single quotation by id (used to open a quotation linked from an
    invoice or history row that is not on the currently loaded page)."""
    quotation = (
        scope_query_to_user_facilities(db.query(SalesQuotation), SalesQuotation.facility_id, db, current_user)
        .options(
            joinedload(SalesQuotation.facility),
            joinedload(SalesQuotation.created_by),
            joinedload(SalesQuotation.converted_invoice),
            joinedload(SalesQuotation.line_items).joinedload(SalesQuotationLineItem.part),
        )
        .filter(SalesQuotation.id == quotation_id)
        .first()
    )
    if not quotation:
        raise HTTPException(status_code=404, detail="Sales quotation not found")
    return _quotation_response(quotation)


@router.post("/quotations", status_code=status.HTTP_201_CREATED)
def create_quotation(
    payload: SalesQuotationCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Any:
    if payload.facility_id is not None:
        facility = db.query(Facility).filter(Facility.id == payload.facility_id).first()
        if not facility:
            raise HTTPException(status_code=404, detail="Facility not found")
        require_facility_access(db, current_user, payload.facility_id)
    quotation = SalesQuotation(
        quotation_number=_next_number(db, SalesQuotation, "quotation_number", "SQ"),
        work_order=_next_number(db, SalesQuotation, "work_order", "WO"),
        facility_id=payload.facility_id,
        created_by_id=current_user.id,
        customer_name=payload.customer_name,
        customer_email=str(payload.customer_email) if payload.customer_email else None,
        customer_phone=payload.customer_phone,
        customer_address=payload.customer_address,
        quotation_type=payload.quotation_type or "standard",
        status="pending",
        paid_status="unpaid",
        requested_date=payload.requested_date or date.today(),
        notes=payload.notes,
        tax_amount=payload.tax_amount,
        discount_amount=payload.discount_amount,
        history=[],
    )
    _append_history(quotation, "created", current_user)
    db.add(quotation)
    db.flush()
    _apply_items(db, quotation, payload.items, current_user)
    log_activity(db, "sales_quotations", quotation.id, "CREATE", current_user, {"work_order": quotation.work_order})
    db.commit()
    db.refresh(quotation)
    return _quotation_response(quotation)


@router.put("/quotations/{quotation_id}")
def update_quotation(
    quotation_id: int,
    payload: SalesQuotationUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Any:
    quotation = (
        db.query(SalesQuotation)
        .options(joinedload(SalesQuotation.line_items), joinedload(SalesQuotation.facility))
        .filter(SalesQuotation.id == quotation_id)
        .first()
    )
    if not quotation:
        raise HTTPException(status_code=404, detail="Sales quotation not found")
    if quotation.facility_id is not None:
        require_facility_access(db, current_user, quotation.facility_id)
    if payload.facility_id is not None:
        require_facility_access(db, current_user, payload.facility_id)

    update_data = payload.model_dump(exclude_unset=True, exclude={"items"})
    for field, value in update_data.items():
        if field == "customer_email" and value is not None:
            value = str(value)
        setattr(quotation, field, value)
    if payload.items is not None:
        _apply_items(db, quotation, payload.items, current_user)
    else:
        quotation.total_amount = _money(quotation.subtotal) + _money(quotation.tax_amount) - _money(quotation.discount_amount)
    quotation.updated_at = datetime.utcnow()
    _append_history(quotation, "updated", current_user, update_data)
    log_activity(db, "sales_quotations", quotation.id, "UPDATE", current_user, update_data)
    db.commit()
    db.refresh(quotation)
    return _quotation_response(quotation)


@router.delete("/quotations/{quotation_id}")
def delete_quotation(
    quotation_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Any:
    quotation = db.query(SalesQuotation).filter(SalesQuotation.id == quotation_id).first()
    if not quotation:
        raise HTTPException(status_code=404, detail="Sales quotation not found")
    if quotation.facility_id is not None:
        require_facility_access(db, current_user, quotation.facility_id)
    if quotation.converted_invoice_id:
        raise HTTPException(status_code=400, detail="Cannot delete a quotation already converted to invoice")
    log_activity(db, "sales_quotations", quotation.id, "DELETE", current_user, {"work_order": quotation.work_order})
    db.delete(quotation)
    db.commit()
    return {"detail": "Sales quotation deleted"}


@router.post("/quotations/{quotation_id}/convert-to-invoice")
def convert_to_invoice(
    quotation_id: int,
    payload: SalesInvoiceCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Any:
    quotation = (
        db.query(SalesQuotation)
        .options(
            joinedload(SalesQuotation.facility),
            joinedload(SalesQuotation.line_items).joinedload(SalesQuotationLineItem.part),
            joinedload(SalesQuotation.converted_invoice),
        )
        .filter(SalesQuotation.id == quotation_id)
        .first()
    )
    if not quotation:
        raise HTTPException(status_code=404, detail="Sales quotation not found")
    if quotation.facility_id is not None:
        require_facility_access(db, current_user, quotation.facility_id)

    action = (payload.action or "convert_to_invoice").lower()
    if action in {"approve", "approved"}:
        quotation.status = "approved"
        quotation.updated_at = datetime.utcnow()
        _append_history(quotation, "approved", current_user)
        log_activity(db, "sales_quotations", quotation.id, "APPROVE", current_user, {})
        db.commit()
        return _quotation_response(quotation)
    if action in {"reject", "rejected"}:
        quotation.status = "rejected"
        quotation.updated_at = datetime.utcnow()
        _append_history(quotation, "rejected", current_user)
        log_activity(db, "sales_quotations", quotation.id, "REJECT", current_user, {})
        db.commit()
        return _quotation_response(quotation)
    if action in {"mark_pending", "pending"}:
        quotation.status = "pending"
        quotation.updated_at = datetime.utcnow()
        _append_history(quotation, "marked_pending", current_user)
        log_activity(db, "sales_quotations", quotation.id, "MARK_PENDING", current_user, {})
        db.commit()
        return _quotation_response(quotation)

    if quotation.converted_invoice:
        return _invoice_response(quotation.converted_invoice)

    worked_hours = _money(payload.worked_hours)
    setup_fee = _money(payload.setup_fee)
    service_fee = _money(payload.service_fee)
    shipping_fee = _money(payload.shipping_fee)
    application_fee = _money(payload.application_fee)
    parts_amount = _money(quotation.subtotal)
    raw_discount = _money(payload.discount_amount if payload.discount_amount is not None else quotation.discount_amount)
    tax_rate = _money(payload.tax_rate)
    tax_amount = (parts_amount * tax_rate / Decimal("100")).quantize(Decimal("0.01"))
    subtotal = parts_amount + worked_hours + setup_fee + service_fee + shipping_fee + application_fee
    discount_amount = (subtotal * raw_discount / Decimal("100")).quantize(Decimal("0.01")) if payload.discount_type == "percent" else raw_discount
    total_amount = subtotal + tax_amount - discount_amount

    quotation.worked_hours = worked_hours
    quotation.setup_fee = setup_fee
    quotation.service_fee = service_fee
    quotation.shipping_fee = shipping_fee
    quotation.application_fee = application_fee
    quotation.tax_rate = tax_rate
    quotation.tax_amount = tax_amount
    quotation.discount_amount = discount_amount
    quotation.total_amount = total_amount
    quotation.payment_method = payload.payment_method

    invoice = Invoice(
        invoice_number=_next_invoice_number(db),
        invoice_type=InvoiceType.SALES,
        customer_name=quotation.customer_name,
        customer_email=quotation.customer_email or "billing@example.com",
        customer_phone=quotation.customer_phone,
        customer_address=quotation.customer_address,
        facility_id=quotation.facility_id,
        sales_quotation_id=quotation.id,
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
        notes=payload.notes or f"Sales invoice for quotation {quotation.quotation_number} / work order {quotation.work_order}.",
    )
    db.add(invoice)
    db.flush()
    record_invoice_created(db, invoice, current_user, f"Sales invoice created from quotation {quotation.quotation_number}")
    quotation.converted_invoice_id = invoice.id
    quotation.status = "in_progress"
    quotation.updated_at = datetime.utcnow()
    _append_history(
        quotation,
        "converted_to_invoice",
        current_user,
        {
            "invoice_id": invoice.id,
            "invoice_number": invoice.invoice_number,
            "payment_method": payload.payment_method,
            "action": action,
            "discount_type": payload.discount_type,
            "total_amount": str(total_amount),
        },
    )
    log_activity(db, "sales_quotations", quotation.id, "CONVERT_TO_INVOICE", current_user, {"invoice_id": invoice.id})
    db.commit()
    db.refresh(invoice)
    return _invoice_response(invoice)


@router.post("/quotations/{quotation_id}/request-card-authorization")
def request_card_authorization(
    quotation_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Any:
    quotation = db.query(SalesQuotation).filter(SalesQuotation.id == quotation_id).first()
    if not quotation:
        raise HTTPException(status_code=404, detail="Sales quotation not found")
    if quotation.facility_id is not None:
        require_facility_access(db, current_user, quotation.facility_id)
        recipient_roles = [UserRole.FACILITY_ADMIN, UserRole.FACILITY_MANAGER, UserRole.CLIENT]
        primary_users = (
            db.query(User.id)
            .filter(
                User.facility_id == quotation.facility_id,
                User.role.in_(recipient_roles),
                User.is_active.is_(True),
            )
            .all()
        )
        linked_users = (
            db.query(UserFacility.user_id)
            .join(User, User.id == UserFacility.user_id)
            .filter(
                UserFacility.facility_id == quotation.facility_id,
                User.role.in_(recipient_roles),
                User.is_active.is_(True),
            )
            .all()
        )
        create_notifications(
            db,
            user_ids=[user.id for user in primary_users] + [user.user_id for user in linked_users],
            title="Credit card authorization requested",
            message=f"Authorization requested for {quotation.quotation_number or f'quotation #{quotation.id}'}.",
            notification_type="billing",
            link_url="/billing",
            actor_id=current_user.id,
        )
    _append_history(quotation, "credit_card_authorization_requested", current_user)
    quotation.updated_at = datetime.utcnow()
    log_activity(db, "sales_quotations", quotation.id, "REQUEST_CARD_AUTHORIZATION", current_user, {})
    db.commit()
    return _quotation_response(quotation)


@router.post("/quotations/{quotation_id}/complete")
def complete_quotation(
    quotation_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Any:
    quotation = (
        db.query(SalesQuotation)
        .options(joinedload(SalesQuotation.line_items).joinedload(SalesQuotationLineItem.part), joinedload(SalesQuotation.converted_invoice))
        .filter(SalesQuotation.id == quotation_id)
        .first()
    )
    if not quotation:
        raise HTTPException(status_code=404, detail="Sales quotation not found")
    if quotation.facility_id is not None:
        require_facility_access(db, current_user, quotation.facility_id)
    if not quotation.converted_invoice:
        raise HTTPException(status_code=400, detail="Convert quotation to invoice before completing")

    for line in quotation.line_items or []:
        if line.part.quantity_on_hand < line.quantity:
            raise HTTPException(status_code=400, detail=f"Not enough stock for {line.part.part_number}")
        line.part.quantity_on_hand -= line.quantity
        line.part.updated_at = datetime.utcnow()

    quotation.status = "completed"
    if quotation.converted_invoice.status == InvoiceStatus.PAID:
        quotation.paid_status = "paid"
    quotation.updated_at = datetime.utcnow()
    _append_history(quotation, "completed", current_user)
    log_activity(db, "sales_quotations", quotation.id, "COMPLETE", current_user, {})
    db.commit()
    return _quotation_response(quotation)


@router.get("/invoices")
def list_sales_invoices(
    db: Session = Depends(get_db),
    status_filter: Optional[InvoiceStatus] = Query(None, alias="status"),
    search: Optional[str] = Query(None),
    search_field: Optional[str] = Query(None),
    date_from: Optional[date] = Query(None),
    date_to: Optional[date] = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
    current_user: User = Depends(get_current_user),
) -> Any:
    if date_from and date_to and date_from > date_to:
        raise HTTPException(status_code=422, detail="From date cannot be after To date")
    query = (
        scope_query_to_user_facilities(db.query(Invoice), Invoice.facility_id, db, current_user)
        .options(
            joinedload(Invoice.facility),
            joinedload(Invoice.sales_quotation),
            joinedload(Invoice.approved_for_billing_by),
            selectinload(Invoice.transactions).joinedload(InvoiceTransaction.created_by),
        )
        .filter(Invoice.invoice_type == InvoiceType.SALES)
    )
    if date_from:
        query = query.filter(Invoice.issue_date >= date_from)
    if date_to:
        query = query.filter(Invoice.issue_date <= date_to)
    query = scope_invoice_approval_visibility(query, current_user)
    if status_filter:
        query = query.filter(Invoice.status == status_filter)
    search_term = normalize_list_search(search)
    if search_term:
        normalized_value = search_term.lower().replace("-", "_").replace(" ", "_")
        searched_date = parsed_date_value(search_term)
        search_by_field = {
            "invoice": [contains_ci(Invoice.invoice_number, search_term)],
            "billing_number": [contains_ci(Invoice.invoice_number, search_term)],
            "customer": [
                contains_ci(Invoice.customer_name, search_term),
                contains_ci(Invoice.customer_email, search_term),
            ],
            "facility_customer": [
                contains_ci(Facility.name, search_term),
                contains_ci(Invoice.customer_name, search_term),
                contains_ci(Invoice.customer_email, search_term),
            ],
            "notes": [contains_ci(Invoice.notes, search_term)],
            "payment_method": [contains_ci(Invoice.payment_method, normalized_value)],
            "status": [value_contains_ci(Invoice.status, normalized_value)],
            "amount": [
                value_contains_ci(Invoice.total_amount, search_term),
                value_contains_ci(Invoice.amount_paid, search_term),
                value_contains_ci(Invoice.balance_due, search_term),
            ],
            "total": [value_contains_ci(Invoice.total_amount, search_term)],
            "paid": [value_contains_ci(Invoice.amount_paid, search_term)],
            "balance": [value_contains_ci(Invoice.balance_due, search_term)],
            "date": [
                value_contains_ci(Invoice.issue_date, search_term),
                value_contains_ci(Invoice.due_date, search_term),
            ],
            "due": [value_contains_ci(Invoice.due_date, search_term)],
            "facility": [contains_ci(Facility.name, search_term)],
            "quotation": [
                contains_ci(SalesQuotation.quotation_number, search_term),
                contains_ci(SalesQuotation.work_order, search_term),
            ],
            "related_number": [
                contains_ci(SalesQuotation.quotation_number, search_term),
                contains_ci(SalesQuotation.work_order, search_term),
            ],
        }
        if searched_date:
            search_by_field["date"].extend(
                [Invoice.issue_date == searched_date, Invoice.due_date == searched_date]
            )
        query = (
            query
            .outerjoin(Facility, Invoice.facility_id == Facility.id)
            .outerjoin(SalesQuotation, Invoice.sales_quotation_id == SalesQuotation.id)
            .filter(or_(*predicates_for_field(search_field, search_by_field)))
        )
    total = query.count()
    invoices = query.order_by(Invoice.created_at.desc()).offset(skip).limit(limit).all()
    return {
        "items": [_invoice_response(invoice) for invoice in invoices],
        "total": total,
        "skip": skip,
        "limit": limit,
    }


@router.put("/invoices/{invoice_id}")
def update_sales_invoice(
    invoice_id: int,
    payload: SalesInvoiceUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Any:
    invoice = (
        db.query(Invoice)
        .options(
            joinedload(Invoice.sales_quotation),
            joinedload(Invoice.facility),
            joinedload(Invoice.approved_for_billing_by),
            joinedload(Invoice.transactions),
        )
        .filter(Invoice.id == invoice_id, Invoice.invoice_type == InvoiceType.SALES)
        .with_for_update(of=Invoice)
        .first()
    )
    if not invoice:
        raise HTTPException(status_code=404, detail="Sales invoice not found")
    if invoice.facility_id is not None:
        require_facility_access(db, current_user, invoice.facility_id)
    if not has_module_permission(current_user, "billing", "edit"):
        raise HTTPException(status_code=403, detail="Billing edit permission is required")

    previous_paid = invoice.amount_paid
    previous_status = invoice.status
    update_data = payload.model_dump(exclude_unset=True)
    internal_editor = is_invoice_approver(current_user)
    facility_payer = is_facility_billing_user(current_user)
    if not (internal_editor or facility_payer):
        raise HTTPException(status_code=403, detail="Not authorized to update this invoice")

    ensure_financial_edit_allowed(invoice, update_data)
    financial_edit = has_financial_edits(invoice, update_data)
    requested_paid = _money(update_data.get("amount_paid", invoice.amount_paid))
    validate_requested_payment_status(invoice, update_data, requested_paid)
    if requested_paid != _money(invoice.amount_paid):
        require_invoice_approved(invoice)
        require_invoice_payer(current_user)
    if facility_payer:
        require_invoice_approved(invoice)
        customer_fields = {"amount_paid", "status", "payment_method", "notes"}
        if set(update_data) - customer_fields:
            raise HTTPException(
                status_code=403,
                detail="Facility users can pay invoices but cannot edit invoice contents",
            )
        if requested_paid < _money(invoice.amount_paid):
            raise HTTPException(status_code=400, detail="Recorded payments cannot be reduced")
        if requested_paid > _money(invoice.total_amount):
            raise HTTPException(status_code=400, detail="Payment cannot exceed the invoice total")
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
    if financial_edit:
        invalidate_invoice_approval(db, invoice, current_user)
    invoice.balance_due = _money(invoice.total_amount) - _money(invoice.amount_paid)
    if invoice.balance_due <= 0:
        invoice.status = InvoiceStatus.PAID
    elif _money(invoice.amount_paid) > 0 and invoice.status != InvoiceStatus.CANCELLED:
        invoice.status = InvoiceStatus.PARTIALLY_PAID
    if invoice.sales_quotation:
        invoice.sales_quotation.paid_status = "paid" if invoice.status == InvoiceStatus.PAID else "unpaid"
        invoice.sales_quotation.payment_method = invoice.payment_method
        if invoice.status == InvoiceStatus.PAID and invoice.sales_quotation.status == "in_progress":
            invoice.sales_quotation.status = "completed"
        _append_history(invoice.sales_quotation, "invoice_updated", current_user, {"invoice_id": invoice.id, "status": invoice.status.value})
    invoice.updated_at = datetime.utcnow()
    record_payment_delta(db, invoice, previous_paid, invoice.amount_paid, current_user, invoice.payment_method, update_data.get("notes"))
    record_status_change(db, invoice, previous_status, current_user)
    log_activity(db, "invoices", invoice.id, "UPDATE_SALES_INVOICE", current_user, update_data)
    db.commit()
    db.refresh(invoice)
    return _invoice_response(invoice)


@router.get("/history")
def list_sales_history(
    db: Session = Depends(get_db),
    search: Optional[str] = Query(None),
    search_field: Optional[str] = Query(None),
    date_from: Optional[date] = Query(None),
    date_to: Optional[date] = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
    current_user: User = Depends(get_current_user),
) -> Any:
    if date_from and date_to and date_from > date_to:
        raise HTTPException(status_code=422, detail="From date cannot be after To date")
    quotations_query = (
        scope_query_to_user_facilities(db.query(SalesQuotation), SalesQuotation.facility_id, db, current_user)
        .options(joinedload(SalesQuotation.facility), joinedload(SalesQuotation.created_by))
    )
    search_term = normalize_list_search(search)
    searched_date = parsed_date_value(search_term) if search_term else None
    if search_term:
        history_search_by_field = {
            "quotation": [contains_ci(SalesQuotation.quotation_number, search_term)],
            "work_order": [contains_ci(SalesQuotation.work_order, search_term)],
            "customer": [contains_ci(SalesQuotation.customer_name, search_term)],
            "facility": [contains_ci(Facility.name, search_term)],
            "activity": [value_contains_ci(SalesQuotation.history, search_term)],
            "date": [value_contains_ci(SalesQuotation.history, search_term)],
        }
        if searched_date:
            history_search_by_field["date"].append(
                value_contains_ci(SalesQuotation.history, searched_date.isoformat())
            )
        quotations_query = quotations_query.outerjoin(
            Facility, SalesQuotation.facility_id == Facility.id
        ).filter(
            or_(*predicates_for_field(search_field, history_search_by_field))
        )
    quotations = quotations_query.order_by(SalesQuotation.updated_at.desc()).all()
    rows: list[dict[str, Any]] = []
    for quotation in quotations:
        for item in quotation.history or []:
            rows.append(
                {
                    **item,
                    "quotation_id": quotation.id,
                    "quotation_number": quotation.quotation_number,
                    "work_order": quotation.work_order,
                    "facility_name": quotation.facility.name if quotation.facility else None,
                    "customer_name": quotation.customer_name,
                    "quotation_type": quotation.quotation_type,
                    "status": quotation.status,
                    "created_by_name": quotation.created_by.full_name if quotation.created_by else None,
                }
            )
    rows.sort(key=lambda item: item.get("at") or "", reverse=True)
    if date_from or date_to:
        def history_date_in_range(item: dict[str, Any]) -> bool:
            raw_at = item.get("at")
            if not raw_at:
                return False
            try:
                item_date = datetime.fromisoformat(str(raw_at).replace("Z", "+00:00")).date()
            except (TypeError, ValueError):
                return False
            return (date_from is None or item_date >= date_from) and (date_to is None or item_date <= date_to)

        rows = [row for row in rows if history_date_in_range(row)]
    if search_term:
        normalized = search_term.casefold()
        row_fields = {
            "quotation": ("quotation_number",),
            "work_order": ("work_order",),
            "customer": ("customer_name",),
            "facility": ("facility_name",),
            "activity": ("action", "by"),
            "type": ("quotation_type",),
            "status": ("status",),
            "created_by": ("created_by_name", "by"),
            "date": ("at",),
        }
        selected_keys = row_fields.get(
            (search_field or "all").strip().lower(),
            tuple(key for keys in row_fields.values() for key in keys),
        )
        rows = [
            row for row in rows
            if (
                normalized in " ".join(str(row.get(key) or "") for key in selected_keys).casefold()
                or (
                    "at" in selected_keys
                    and searched_date is not None
                    and str(row.get("at") or "").startswith(searched_date.isoformat())
                )
            )
        ]
    return {"items": rows[skip:skip + limit], "total": len(rows), "skip": skip, "limit": limit}


@router.get("/summary")
def sales_summary(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Any:
    """Counts for the Sales KPI cards, independent of tab pagination."""
    base = scope_query_to_user_facilities(db.query(SalesQuotation), SalesQuotation.facility_id, db, current_user)
    in_progress = base.filter(SalesQuotation.status.in_(IN_PROGRESS_QUOTATION_STATUSES)).count()
    completed = base.filter(SalesQuotation.status.in_(COMPLETED_QUOTATION_STATUSES)).count()
    quotations = base.filter(
        SalesQuotation.status.notin_(IN_PROGRESS_QUOTATION_STATUSES + COMPLETED_QUOTATION_STATUSES)
    ).count()
    invoices = scope_invoice_approval_visibility(
        scope_query_to_user_facilities(db.query(Invoice), Invoice.facility_id, db, current_user)
        .filter(Invoice.invoice_type == InvoiceType.SALES),
        current_user,
    ).count()
    history = (
        scope_query_to_user_facilities(db.query(SalesQuotation), SalesQuotation.facility_id, db, current_user)
        .with_entities(func.coalesce(func.sum(func.json_array_length(SalesQuotation.history)), 0))
        .scalar()
    )
    in_progress_total = base.filter(SalesQuotation.status.in_(IN_PROGRESS_QUOTATION_STATUSES)).with_entities(
        func.coalesce(func.sum(SalesQuotation.total_amount), 0)
    ).scalar()
    completed_total = base.filter(SalesQuotation.status.in_(COMPLETED_QUOTATION_STATUSES)).with_entities(
        func.coalesce(func.sum(SalesQuotation.total_amount), 0)
    ).scalar()
    in_progress_paid = (
        base.filter(SalesQuotation.status.in_(IN_PROGRESS_QUOTATION_STATUSES))
        .join(Invoice, SalesQuotation.converted_invoice_id == Invoice.id)
        .with_entities(func.coalesce(func.sum(Invoice.amount_paid), 0))
        .scalar()
    )
    parts = _sales_part_query(db, current_user).count()
    return {
        "quotations": quotations,
        "invoices": invoices,
        "in_progress": in_progress,
        "completed": completed,
        "history": int(history or 0),
        "parts": parts,
        "in_progress_total": float(in_progress_total or 0),
        "in_progress_paid": float(in_progress_paid or 0),
        "completed_total": float(completed_total or 0),
    }
