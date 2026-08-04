from datetime import date, datetime, timedelta
from decimal import Decimal
from typing import Any, Optional
from math import ceil

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.encoders import jsonable_encoder
from pydantic import BaseModel, EmailStr
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session, joinedload, selectinload

from app.db.base import get_db
from app.core.deps import get_current_user
from app.utils.permission_deps import require_module_access
from app.models.facility import Facility
from app.models.inventory import InventoryPart
from app.models.invoice import Invoice, InvoiceStatus, InvoiceTransaction, InvoiceType
from app.models.rental import (
    Rental,
    RentalItem,
    RentalProductRate,
    RentalStatus,
    RentalItemStatus,
    RentalDepositStatus,
    BillingFrequency,
)
from app.models.user import User, UserRole
from app.utils.facility_access import (
    require_facility_access,
    scope_query_to_user_facilities,
    is_facility_scoped_user,
    get_user_facility_ids,
)
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
from app.utils.square_payments import (
    square_is_configured,
    create_square_card_on_file,
    SquareRequestError,
)
from app.utils.rental_billing import run_rental_recurring_billing, generate_deposit_invoice, period_days
from app.utils.permissions import has_module_permission
from app.utils.list_search import (
    contains_ci,
    normalize_list_search,
    parsed_date_value,
    predicates_for_field,
    value_contains_ci,
)

router = APIRouter(dependencies=[Depends(require_module_access("rentals"))])


class RentalItemIn(BaseModel):
    part_id: Optional[int] = None
    equipment_id: Optional[int] = None
    quantity: int = 1
    rental_rate: Decimal = Decimal("0")
    item_condition: Optional[str] = None
    shipping_fee: Decimal = Decimal("0")
    setup_fee: Decimal = Decimal("0")
    initial_condition: Optional[str] = None
    initial_meter_reading: Optional[str] = None


class RentalCreate(BaseModel):
    customer_name: str
    customer_email: EmailStr
    customer_phone: str
    customer_address: str
    billing_frequency: BillingFrequency
    security_deposit: Decimal = Decimal("0")
    start_date: date
    end_date: date
    terms_and_conditions: Optional[str] = None
    # Multiple rented items (preferred). The legacy single-item fields below are a
    # fallback so the pre-migration client keeps working during the transition.
    items: Optional[list[RentalItemIn]] = None
    part_id: Optional[int] = None
    rental_rate: Optional[Decimal] = None
    quantity: Optional[int] = None
    shipping_fee: Optional[Decimal] = None
    setup_fee: Optional[Decimal] = None
    item_condition: Optional[str] = None
    initial_condition: Optional[str] = None
    initial_meter_reading: Optional[str] = None
    # Recurring billing / commitment discount configuration.
    auto_charge: bool = False
    committed_periods: Optional[int] = None
    discount_type: Optional[str] = None       # 'flat' | 'percent'
    discount_value: Optional[Decimal] = None
    discount_apply_after_periods: Optional[int] = None


class RentalUpdate(BaseModel):
    customer_name: Optional[str] = None
    customer_email: Optional[str] = None
    customer_phone: Optional[str] = None
    customer_address: Optional[str] = None
    billing_frequency: Optional[BillingFrequency] = None
    security_deposit: Optional[Decimal] = None
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    status: Optional[RentalStatus] = None
    terms_and_conditions: Optional[str] = None
    items: Optional[list[RentalItemIn]] = None
    auto_charge: Optional[bool] = None
    committed_periods: Optional[int] = None
    discount_type: Optional[str] = None
    discount_value: Optional[Decimal] = None
    discount_apply_after_periods: Optional[int] = None


class RentalItemReturn(BaseModel):
    item_id: int
    return_condition: Optional[str] = None
    final_meter_reading: Optional[int] = None


class RentalReturnPayload(BaseModel):
    actual_return_date: date
    return_condition: Optional[str] = None
    final_meter_reading: Optional[int] = None
    # When provided, only these items are returned (partial return); otherwise all
    # still-outstanding items are returned.
    items: Optional[list[RentalItemReturn]] = None
    # Security-deposit settlement, applied when the agreement is fully returned.
    deposit_action: Optional[str] = None       # 'refund' | 'deduct' | 'waive'
    deposit_deduction: Optional[Decimal] = None


class RentalInvoiceCreate(BaseModel):
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


class RentalInvoiceUpdate(BaseModel):
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


def _next_number(db: Session, model: Any, field: str, prefix: str, start: int = 1) -> str:
    last = db.query(model).order_by(model.id.desc()).first()
    next_num = (last.id + 1) if last else start
    while True:
        value = f"{prefix}-{next_num:06d}"
        if not db.query(model).filter(getattr(model, field) == value).first():
            return value
        next_num += 1


def _next_invoice_number(db: Session) -> str:
    last = db.query(Invoice).order_by(Invoice.id.desc()).first()
    next_num = (last.id + 1) if last else 1
    return f"INV-RENTAL-{next_num:06d}"


def _history_entry(action: str, user: User, details: Optional[dict[str, Any]] = None) -> dict[str, Any]:
    return {
        "action": action,
        "by": user.full_name or user.username,
        "user_id": user.id,
        "at": datetime.utcnow().isoformat(),
        "details": jsonable_encoder(details or {}),
    }


def _append_history(rental: Rental, action: str, user: User, details: Optional[dict[str, Any]] = None) -> None:
    history = list(rental.history or [])
    history.append(_history_entry(action, user, details))
    rental.history = history


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


def _invoice_response(invoice: Invoice) -> dict[str, Any]:
    return {
        "id": invoice.id,
        "invoice_number": invoice.invoice_number,
        "invoice_type": invoice.invoice_type.value if hasattr(invoice.invoice_type, "value") else invoice.invoice_type,
        "rental_id": invoice.rental_id,
        "rental_number": invoice.rental.rental_number if invoice.rental else None,
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


def _rental_item_response(item: RentalItem) -> dict[str, Any]:
    return {
        "id": item.id,
        "part_id": item.part_id,
        "equipment_id": item.equipment_id,
        "part_number": item.part_number or (item.part.part_number if item.part else None),
        "part_description": item.part_description or (item.part.description if item.part else None),
        "default_picture_url": item.part.default_picture_url if item.part else None,
        "quantity": item.quantity,
        "rental_rate": item.rental_rate,
        "item_condition": item.item_condition,
        "shipping_fee": item.shipping_fee,
        "setup_fee": item.setup_fee,
        "initial_condition": item.initial_condition,
        "return_condition": item.return_condition,
        "initial_meter_reading": item.initial_meter_reading,
        "final_meter_reading": item.final_meter_reading,
        "returned_at": item.returned_at,
        "item_status": item.item_status,
    }


def _rental_response(rental: Rental) -> dict[str, Any]:
    items = list(rental.items or [])
    first = items[0] if items else None
    is_overdue = (
        rental.status == RentalStatus.ACTIVE
        and rental.end_date is not None
        and rental.end_date < date.today()
        and any(item.item_status != RentalItemStatus.RETURNED.value for item in items)
    )
    return {
        "id": rental.id,
        "rental_number": rental.rental_number,
        "is_overdue": is_overdue,
        "customer_name": rental.customer_name,
        "customer_email": rental.customer_email,
        "customer_phone": rental.customer_phone,
        "customer_address": rental.customer_address,
        "billing_frequency": rental.billing_frequency.value if hasattr(rental.billing_frequency, "value") else rental.billing_frequency,
        "security_deposit": rental.security_deposit,
        "start_date": rental.start_date,
        "end_date": rental.end_date,
        "status": rental.status.value if hasattr(rental.status, "value") else rental.status,
        "terms_and_conditions": rental.terms_and_conditions,
        "items": [_rental_item_response(item) for item in items],
        # Recurring billing / commitment discount / deposit settlement.
        "auto_charge": rental.auto_charge,
        "committed_periods": rental.committed_periods,
        "periods_billed": rental.periods_billed,
        "next_bill_date": rental.next_bill_date,
        "discount_type": rental.discount_type,
        "discount_value": rental.discount_value,
        "discount_apply_after_periods": rental.discount_apply_after_periods,
        "deposit_status": rental.deposit_status,
        "deposit_settled_amount": rental.deposit_settled_amount,
        # Legacy top-level fields, derived from the first item so older clients
        # keep rendering during the multi-item transition.
        "equipment_id": rental.equipment_id or (first.equipment_id if first else None),
        "part_id": rental.part_id or (first.part_id if first else None),
        "part_number": (rental.part.part_number if rental.part else None) or (first.part_number if first else None),
        "part_description": (rental.part.description if rental.part else None) or (first.part_description if first else None),
        "rental_rate": rental.rental_rate if rental.rental_rate is not None else (first.rental_rate if first else None),
        "quantity": rental.quantity if rental.quantity is not None else (first.quantity if first else None),
        "shipping_fee": rental.shipping_fee if rental.shipping_fee is not None else (first.shipping_fee if first else None),
        "setup_fee": rental.setup_fee if rental.setup_fee is not None else (first.setup_fee if first else None),
        "item_condition": rental.item_condition or (first.item_condition if first else None),
        "actual_return_date": rental.actual_return_date or (first.returned_at if first else None),
        "initial_condition": rental.initial_condition or (first.initial_condition if first else None),
        "return_condition": rental.return_condition or (first.return_condition if first else None),
        "initial_meter_reading": rental.initial_meter_reading or (first.initial_meter_reading if first else None),
        "final_meter_reading": rental.final_meter_reading if rental.final_meter_reading is not None else (first.final_meter_reading if first else None),
        "converted_invoice_id": rental.converted_invoice_id,
        "converted_invoice_number": rental.converted_invoice.invoice_number if rental.converted_invoice else None,
        "converted_invoice_status": (
            rental.converted_invoice.status.value
            if rental.converted_invoice and hasattr(rental.converted_invoice.status, "value")
            else rental.converted_invoice.status
            if rental.converted_invoice
            else None
        ),
        "converted_invoice_amount_paid": rental.converted_invoice.amount_paid if rental.converted_invoice else None,
        "converted_invoice_balance_due": rental.converted_invoice.balance_due if rental.converted_invoice else None,
        "converted_invoice_payment_method": rental.converted_invoice.payment_method if rental.converted_invoice else None,
        "created_by_id": rental.created_by_id,
        "created_by_name": rental.created_by.full_name if rental.created_by else None,
        "created_at": rental.created_at,
        "updated_at": rental.updated_at,
        "history": rental.history or [],
    }


def _rental_part_query(db: Session, current_user: User):
    return (
        scope_query_to_user_facilities(db.query(InventoryPart), InventoryPart.facility_id, db, current_user)
        .options(joinedload(InventoryPart.facility))
        .filter(
            InventoryPart.part_type.ilike("rental"),
            InventoryPart.status == "active",
        )
    )


def _frequency_value(freq: Any) -> str:
    return (freq.value if hasattr(freq, "value") else str(freq)).lower()


def _reject_daily(freq: Any) -> None:
    if _frequency_value(freq) == "daily":
        raise HTTPException(
            status_code=400,
            detail="Daily billing is no longer offered; choose weekly, bi-weekly, monthly or quarterly.",
        )


def _period_count(days: int, freq: str) -> int:
    """Number of billing periods covering `days` for the given frequency."""
    if days < 1:
        days = 1
    if freq == "daily":
        return days
    if freq == "weekly":
        return ceil(days / 7.0)
    if freq == "biweekly":
        return ceil(days / 14.0)
    if freq == "monthly":
        return ceil(days / 30.0)
    if freq == "quarterly":
        return ceil(days / 91.0)
    return days


def _required_stock(items: list["RentalItemIn"]) -> dict[int, int]:
    required: dict[int, int] = {}
    for item in items:
        if item.part_id:
            required[item.part_id] = required.get(item.part_id, 0) + max(1, int(item.quantity or 1))
    return required


def _apply_stock_delta(db: Session, delta: dict[int, int]) -> None:
    """Reserve (positive) or release (negative) stock per part, guarding availability."""
    for part_id, qty in delta.items():
        if qty == 0:
            continue
        part = db.query(InventoryPart).filter(InventoryPart.id == part_id).first()
        if not part:
            continue
        if qty > 0 and (part.quantity_on_hand or 0) < qty:
            raise HTTPException(status_code=400, detail=f"Not enough stock for {part.part_number}")
        part.quantity_on_hand = (part.quantity_on_hand or 0) - qty
        part.updated_at = datetime.utcnow()


def _resolve_create_items(payload: "RentalCreate") -> list["RentalItemIn"]:
    if payload.items:
        return payload.items
    if payload.part_id:
        return [RentalItemIn(
            part_id=payload.part_id,
            quantity=payload.quantity or 1,
            rental_rate=payload.rental_rate or Decimal("0"),
            item_condition=payload.item_condition,
            shipping_fee=payload.shipping_fee or Decimal("0"),
            setup_fee=payload.setup_fee or Decimal("0"),
            initial_condition=payload.initial_condition,
            initial_meter_reading=payload.initial_meter_reading,
        )]
    raise HTTPException(status_code=400, detail="At least one rental item is required")


def _build_rental_items(db: Session, current_user: User, items: list["RentalItemIn"]) -> list[RentalItem]:
    rows: list[RentalItem] = []
    for item in items:
        if int(item.quantity or 0) <= 0:
            raise HTTPException(status_code=400, detail="Quantity must be greater than zero")
        part = None
        if item.part_id:
            part = _rental_part_query(db, current_user).filter(InventoryPart.id == item.part_id).first()
            if not part:
                raise HTTPException(status_code=404, detail=f"Rental product {item.part_id} not found in active inventory")
        rows.append(RentalItem(
            part_id=item.part_id,
            equipment_id=item.equipment_id,
            part_number=part.part_number if part else None,
            part_description=part.description if part else None,
            quantity=int(item.quantity or 1),
            rental_rate=item.rental_rate or Decimal("0"),
            item_condition=item.item_condition or (part.condition if part else None),
            shipping_fee=item.shipping_fee or Decimal("0"),
            setup_fee=item.setup_fee or Decimal("0"),
            initial_condition=item.initial_condition,
            initial_meter_reading=item.initial_meter_reading,
            item_status=RentalItemStatus.OUT.value,
        ))
    return rows


def _required_stock_from_rows(rows: list[RentalItem]) -> dict[int, int]:
    required: dict[int, int] = {}
    for row in rows:
        if row.part_id:
            required[row.part_id] = required.get(row.part_id, 0) + max(1, int(row.quantity or 1))
    return required


def _stock_delta(old: dict[int, int], new: dict[int, int]) -> dict[int, int]:
    delta: dict[int, int] = {}
    for part_id in set(old) | set(new):
        change = new.get(part_id, 0) - old.get(part_id, 0)
        if change:
            delta[part_id] = change
    return delta


def _require_rental_facility_access(db: Session, current_user: User, rental: Rental) -> None:
    facility_ids: set[int] = set()
    if rental.part and rental.part.facility_id is not None:
        facility_ids.add(rental.part.facility_id)
    for item in rental.items or []:
        if item.part and item.part.facility_id is not None:
            facility_ids.add(item.part.facility_id)
    for facility_id in facility_ids:
        require_facility_access(db, current_user, facility_id)


@router.get("/parts")
def list_rental_parts(
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
    query = _rental_part_query(db, current_user)
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


class RentalProductRatePayload(BaseModel):
    weekly_rate: Optional[Decimal] = None
    biweekly_rate: Optional[Decimal] = None
    monthly_rate: Optional[Decimal] = None
    quarterly_rate: Optional[Decimal] = None
    default_deposit: Optional[Decimal] = None


def _rate_card_response(rate: Optional[RentalProductRate], part_id: int) -> dict[str, Any]:
    return {
        "part_id": part_id,
        "weekly_rate": rate.weekly_rate if rate else None,
        "biweekly_rate": rate.biweekly_rate if rate else None,
        "monthly_rate": rate.monthly_rate if rate else None,
        "quarterly_rate": rate.quarterly_rate if rate else None,
        "default_deposit": rate.default_deposit if rate else None,
    }


@router.get("/product-rates/{part_id}")
def get_product_rate(
    part_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Any:
    part = _rental_part_query(db, current_user).filter(InventoryPart.id == part_id).first()
    if not part:
        raise HTTPException(status_code=404, detail="Rental product not found in active inventory")
    rate = db.query(RentalProductRate).filter(RentalProductRate.part_id == part_id).first()
    return _rate_card_response(rate, part_id)


@router.put("/product-rates/{part_id}")
def upsert_product_rate(
    part_id: int,
    payload: RentalProductRatePayload,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Any:
    part = _rental_part_query(db, current_user).filter(InventoryPart.id == part_id).first()
    if not part:
        raise HTTPException(status_code=404, detail="Rental product not found in active inventory")
    if part.facility_id is not None:
        require_facility_access(db, current_user, part.facility_id)

    rate = db.query(RentalProductRate).filter(RentalProductRate.part_id == part_id).first()
    if not rate:
        rate = RentalProductRate(part_id=part_id)
        db.add(rate)
    for field in ("weekly_rate", "biweekly_rate", "monthly_rate", "quarterly_rate", "default_deposit"):
        setattr(rate, field, getattr(payload, field))
    rate.updated_at = datetime.utcnow()
    log_activity(db, "rental_product_rates", part_id, "UPSERT", current_user, {})
    db.commit()
    db.refresh(rate)
    return _rate_card_response(rate, part_id)


class RentalCardOnFilePayload(BaseModel):
    source_id: str  # Square Web-SDK card nonce


@router.post("/{rental_id}/save-card")
def save_rental_card(
    rental_id: int,
    payload: RentalCardOnFilePayload,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Any:
    """Vault a card on file (via Square) so the agreement can be auto-charged each period."""
    if not square_is_configured():
        raise HTTPException(status_code=400, detail="Square payments are not configured")
    rental = (
        db.query(Rental)
        .options(selectinload(Rental.items).joinedload(RentalItem.part), joinedload(Rental.part))
        .filter(Rental.id == rental_id)
        .first()
    )
    if not rental:
        raise HTTPException(status_code=404, detail="Rental agreement not found")
    _require_rental_facility_access(db, current_user, rental)
    try:
        result = create_square_card_on_file(
            source_id=payload.source_id,
            idempotency_key=f"rental-card-{rental_id}-{int(datetime.utcnow().timestamp())}",
            customer_name=rental.customer_name,
            customer_email=rental.customer_email,
        )
    except SquareRequestError as exc:
        raise HTTPException(status_code=exc.status_code, detail=str(exc))
    rental.square_card_id = result["card_id"]
    rental.square_customer_id = result["customer_id"]
    rental.failed_charge_count = 0
    rental.updated_at = datetime.utcnow()
    _append_history(rental, "card_saved", current_user, {"brand": result.get("card_brand"), "last_4": result.get("last_4")})
    log_activity(db, "rentals", rental.id, "SAVE_CARD", current_user, {"last_4": result.get("last_4")})
    db.commit()
    db.refresh(rental)
    return _rental_response(rental)


@router.post("/run-recurring-billing")
def run_recurring_billing(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Any:
    """Raise due period invoices and auto-charge/notify. Intended for a daily cron."""
    if current_user.role not in {UserRole.ADMIN, UserRole.SUPERADMIN}:
        raise HTTPException(status_code=403, detail="Only an admin can run recurring rental billing")
    return run_rental_recurring_billing(db)


@router.get("")
def list_rentals(
    db: Session = Depends(get_db),
    status_filter: Optional[str] = Query(None, alias="status"),
    search: Optional[str] = Query(None),
    search_field: Optional[str] = Query(None),
    date_from: Optional[date] = Query(None),
    date_to: Optional[date] = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(25, ge=1, le=500),
    current_user: User = Depends(get_current_user),
) -> Any:
    if date_from and date_to and date_from > date_to:
        raise HTTPException(status_code=422, detail="From date cannot be after To date")
    query = (
        db.query(Rental)
        .options(
            selectinload(Rental.items).joinedload(RentalItem.part).joinedload(InventoryPart.facility),
            joinedload(Rental.part).joinedload(InventoryPart.facility),
            joinedload(Rental.created_by),
            joinedload(Rental.converted_invoice),
        )
    )

    # Facility scoping: a scoped user sees an agreement when any of its items'
    # parts belong to an accessible facility. Every agreement has items (the
    # migration backfilled them), so item-based scoping covers all records.
    if is_facility_scoped_user(current_user):
        accessible = get_user_facility_ids(db, current_user)
        scope = (
            select(RentalItem.rental_id)
            .join(InventoryPart, RentalItem.part_id == InventoryPart.id)
            .where(InventoryPart.facility_id.in_(accessible))
        )
        query = query.filter(Rental.id.in_(scope))

    if date_from:
        query = query.filter(Rental.start_date >= date_from)
    if date_to:
        query = query.filter(Rental.start_date <= date_to)
    if status_filter:
        query = query.filter(Rental.status == status_filter)
    search_term = normalize_list_search(search)
    if search_term:
        normalized_value = search_term.lower().replace("-", "_").replace(" ", "_")
        searched_date = parsed_date_value(search_term)
        # Product / facility / condition search matches across the agreement's items.
        product_scope = (
            select(RentalItem.rental_id)
            .join(InventoryPart, RentalItem.part_id == InventoryPart.id)
            .where(or_(
                contains_ci(InventoryPart.part_number, search_term),
                contains_ci(InventoryPart.description, search_term),
                contains_ci(InventoryPart.make, search_term),
                contains_ci(InventoryPart.model, search_term),
                contains_ci(InventoryPart.serial_number, search_term),
                contains_ci(RentalItem.part_number, search_term),
                contains_ci(RentalItem.part_description, search_term),
            ))
        )
        facility_scope = (
            select(RentalItem.rental_id)
            .join(InventoryPart, RentalItem.part_id == InventoryPart.id)
            .join(Facility, InventoryPart.facility_id == Facility.id)
            .where(contains_ci(Facility.name, search_term))
        )
        condition_scope = (
            select(RentalItem.rental_id).where(contains_ci(RentalItem.item_condition, search_term))
        )
        search_by_field = {
            "agreement": [
                value_contains_ci(Rental.id, search_term.lstrip("#")),
                contains_ci(Rental.rental_number, search_term),
            ],
            "customer": [
                contains_ci(Rental.customer_name, search_term),
                contains_ci(Rental.customer_email, search_term),
                contains_ci(Rental.customer_phone, search_term),
            ],
            "product": [Rental.id.in_(product_scope)],
            "facility": [Rental.id.in_(facility_scope)],
            "created_by": [contains_ci(User.full_name, search_term)],
            "billing": [
                value_contains_ci(Rental.billing_frequency, normalized_value),
                value_contains_ci(Rental.security_deposit, search_term),
            ],
            "status": [value_contains_ci(Rental.status, normalized_value)],
            "condition": [Rental.id.in_(condition_scope)],
            "date": [
                value_contains_ci(Rental.start_date, search_term),
                value_contains_ci(Rental.end_date, search_term),
            ],
        }
        if searched_date:
            search_by_field["date"].extend(
                [Rental.start_date == searched_date, Rental.end_date == searched_date]
            )
        query = (
            query
            .outerjoin(User, Rental.created_by_id == User.id)
            .filter(or_(*predicates_for_field(search_field, search_by_field)))
        )
    total = query.count()
    rentals = query.order_by(Rental.created_at.desc()).offset(skip).limit(limit).all()
    return {"items": [_rental_response(item) for item in rentals], "total": total, "skip": skip, "limit": limit}


@router.post("", status_code=status.HTTP_201_CREATED)
def create_rental(
    payload: RentalCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Any:
    _reject_daily(payload.billing_frequency)
    items_in = _resolve_create_items(payload)
    item_rows = _build_rental_items(db, current_user, items_in)

    deposit = payload.security_deposit or Decimal("0")
    rental = Rental(
        rental_number=_next_number(db, Rental, "rental_number", "RNT"),
        created_by_id=current_user.id,
        customer_name=payload.customer_name,
        customer_email=str(payload.customer_email),
        customer_phone=payload.customer_phone,
        customer_address=payload.customer_address,
        billing_frequency=payload.billing_frequency,
        security_deposit=deposit,
        start_date=payload.start_date,
        end_date=payload.end_date,
        status=RentalStatus.ACTIVE,
        terms_and_conditions=payload.terms_and_conditions,
        auto_charge=bool(payload.auto_charge),
        committed_periods=payload.committed_periods,
        discount_type=payload.discount_type,
        discount_value=payload.discount_value,
        discount_apply_after_periods=payload.discount_apply_after_periods,
        deposit_status=RentalDepositStatus.HELD.value if deposit > 0 else None,
        periods_billed=0,
        next_bill_date=payload.start_date,
        history=[],
    )
    rental.items = item_rows

    # Reserve stock across all items.
    _apply_stock_delta(db, _required_stock(items_in))

    _append_history(rental, "created", current_user, {"items": len(item_rows)})
    db.add(rental)
    db.flush()

    # The first invoice is the security deposit, raised upfront. Rental cycles then
    # bill in arrears: the first cycle's invoice is raised once that cycle completes.
    generate_deposit_invoice(db, rental)
    rental.next_bill_date = payload.start_date + timedelta(days=period_days(_frequency_value(payload.billing_frequency)))

    log_activity(db, "rentals", rental.id, "CREATE", current_user, {"rental_number": rental.rental_number})
    db.commit()
    db.refresh(rental)
    return _rental_response(rental)


@router.put("/{rental_id}")
def update_rental(
    rental_id: int,
    payload: RentalUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Any:
    rental = (
        db.query(Rental)
        .options(selectinload(Rental.items).joinedload(RentalItem.part), joinedload(Rental.part), joinedload(Rental.converted_invoice))
        .filter(Rental.id == rental_id)
        .first()
    )
    if not rental:
        raise HTTPException(status_code=404, detail="Rental agreement not found")

    _require_rental_facility_access(db, current_user, rental)

    if payload.billing_frequency is not None:
        _reject_daily(payload.billing_frequency)

    update_data = payload.model_dump(exclude_unset=True, exclude={"items"})

    # Replace the item set (and reconcile reserved stock) when items are supplied.
    if payload.items is not None:
        if not payload.items:
            raise HTTPException(status_code=400, detail="At least one rental item is required")
        new_rows = _build_rental_items(db, current_user, payload.items)
        if rental.status == RentalStatus.ACTIVE:
            delta = _stock_delta(_required_stock_from_rows(rental.items or []), _required_stock(payload.items))
            _apply_stock_delta(db, delta)
        rental.items = new_rows

    for field, value in update_data.items():
        if field == "customer_email" and value is not None:
            value = str(value)
        setattr(rental, field, value)

    rental.updated_at = datetime.utcnow()
    changed = {key: str(value) for key, value in update_data.items()}
    if payload.items is not None:
        changed["items"] = str(len(payload.items))
    _append_history(rental, "updated", current_user, changed)
    log_activity(db, "rentals", rental.id, "UPDATE", current_user, changed)
    db.commit()
    db.refresh(rental)
    return _rental_response(rental)


@router.delete("/{rental_id}")
def delete_rental(
    rental_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Any:
    rental = (
        db.query(Rental)
        .options(selectinload(Rental.items).joinedload(RentalItem.part), joinedload(Rental.part))
        .filter(Rental.id == rental_id)
        .first()
    )
    if not rental:
        raise HTTPException(status_code=404, detail="Rental agreement not found")

    _require_rental_facility_access(db, current_user, rental)

    if rental.converted_invoice_id:
        raise HTTPException(status_code=400, detail="Cannot delete a rental already converted to invoice")

    # Release stock reserved for items still out.
    if rental.status == RentalStatus.ACTIVE:
        release = _required_stock_from_rows(
            [item for item in (rental.items or []) if item.item_status != RentalItemStatus.RETURNED.value]
        )
        _apply_stock_delta(db, {part_id: -qty for part_id, qty in release.items()})

    log_activity(db, "rentals", rental.id, "DELETE", current_user, {"rental_number": rental.rental_number})
    db.delete(rental)
    db.commit()
    return {"detail": "Rental agreement deleted"}


@router.post("/{rental_id}/return")
def return_rental(
    rental_id: int,
    payload: RentalReturnPayload,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Any:
    rental = (
        db.query(Rental)
        .options(selectinload(Rental.items).joinedload(RentalItem.part), joinedload(Rental.part), joinedload(Rental.converted_invoice))
        .filter(Rental.id == rental_id)
        .first()
    )
    if not rental:
        raise HTTPException(status_code=404, detail="Rental agreement not found")

    _require_rental_facility_access(db, current_user, rental)

    if rental.status == RentalStatus.COMPLETED:
        raise HTTPException(status_code=400, detail="Rental is already completed/returned")

    outstanding = [item for item in (rental.items or []) if item.item_status != RentalItemStatus.RETURNED.value]
    if not outstanding:
        raise HTTPException(status_code=400, detail="All items are already returned")

    # Return the specified items (partial) or every outstanding item.
    if payload.items:
        by_id = {item.id: item for item in outstanding}
        targets = []
        for ret in payload.items:
            item = by_id.get(ret.item_id)
            if not item:
                raise HTTPException(status_code=400, detail=f"Item {ret.item_id} is not an outstanding item on this agreement")
            targets.append((item, ret.return_condition, ret.final_meter_reading))
    else:
        targets = [(item, payload.return_condition, payload.final_meter_reading) for item in outstanding]

    released: dict[int, int] = {}
    for item, condition, meter in targets:
        item.item_status = RentalItemStatus.RETURNED.value
        item.returned_at = payload.actual_return_date
        resolved_condition = condition if condition is not None else payload.return_condition
        if resolved_condition is not None:
            item.return_condition = resolved_condition
        resolved_meter = meter if meter is not None else payload.final_meter_reading
        if resolved_meter is not None:
            item.final_meter_reading = resolved_meter
        if item.part_id:
            released[item.part_id] = released.get(item.part_id, 0) + max(1, int(item.quantity or 1))

    # Return the released stock to inventory.
    _apply_stock_delta(db, {part_id: -qty for part_id, qty in released.items()})

    fully_returned = all(item.item_status == RentalItemStatus.RETURNED.value for item in (rental.items or []))
    if fully_returned:
        rental.status = RentalStatus.COMPLETED
        rental.actual_return_date = payload.actual_return_date
        if payload.return_condition is not None:
            rental.return_condition = payload.return_condition
        if payload.final_meter_reading is not None:
            rental.final_meter_reading = payload.final_meter_reading
        # Settle the security deposit. deposit_settled_amount is the amount refunded
        # to the customer (full deposit for a refund, deposit minus damages for a deduction).
        deposit = _money(rental.security_deposit)
        if deposit > 0 and payload.deposit_action:
            action = payload.deposit_action.strip().lower()
            if action == "refund":
                rental.deposit_status = RentalDepositStatus.REFUNDED.value
                rental.deposit_settled_amount = deposit
            elif action == "deduct":
                deduction = min(deposit, _money(payload.deposit_deduction))
                rental.deposit_status = RentalDepositStatus.DEDUCTED.value
                rental.deposit_settled_amount = deposit - deduction
            elif action == "waive":
                rental.deposit_status = RentalDepositStatus.WAIVED.value
                rental.deposit_settled_amount = Decimal("0")
    rental.updated_at = datetime.utcnow()

    _append_history(
        rental,
        "returned",
        current_user,
        {
            "actual_return_date": str(payload.actual_return_date),
            "returned_items": [item.id for item, _, _ in targets],
            "fully_returned": fully_returned,
        },
    )
    log_activity(db, "rentals", rental.id, "RETURN", current_user, {"fully_returned": fully_returned})
    db.commit()
    db.refresh(rental)
    return _rental_response(rental)


@router.post("/{rental_id}/convert-to-invoice")
def convert_to_invoice(
    rental_id: int,
    payload: RentalInvoiceCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Any:
    rental = (
        db.query(Rental)
        .options(selectinload(Rental.items).joinedload(RentalItem.part), joinedload(Rental.part), joinedload(Rental.converted_invoice))
        .filter(Rental.id == rental_id)
        .first()
    )
    if not rental:
        raise HTTPException(status_code=404, detail="Rental agreement not found")

    _require_rental_facility_access(db, current_user, rental)

    action = (payload.action or "convert_to_invoice").lower()
    if action in {"approve", "approved"}:
        _append_history(rental, "approved", current_user)
        rental.updated_at = datetime.utcnow()
        log_activity(db, "rentals", rental.id, "APPROVE", current_user, {})
        db.commit()
        return _rental_response(rental)
    if action in {"reject", "rejected"}:
        _append_history(rental, "rejected", current_user)
        if rental.status == RentalStatus.ACTIVE:
            release = _required_stock_from_rows(
                [item for item in (rental.items or []) if item.item_status != RentalItemStatus.RETURNED.value]
            )
            _apply_stock_delta(db, {part_id: -qty for part_id, qty in release.items()})
        rental.status = RentalStatus.CANCELLED
        rental.updated_at = datetime.utcnow()
        log_activity(db, "rentals", rental.id, "REJECT", current_user, {})
        db.commit()
        return _rental_response(rental)
    if action in {"mark_pending", "pending"}:
        _append_history(rental, "marked_pending", current_user)
        rental.updated_at = datetime.utcnow()
        log_activity(db, "rentals", rental.id, "MARK_PENDING", current_user, {})
        db.commit()
        return _rental_response(rental)
        
    if rental.converted_invoice:
        return _invoice_response(rental.converted_invoice)

    # Base rental cost = periods covering the rental duration × each item's rate × qty.
    end_date = rental.actual_return_date if rental.actual_return_date else rental.end_date
    days = (end_date - rental.start_date).days
    if days < 1:
        days = 1
    freq = _frequency_value(rental.billing_frequency)
    periods = _period_count(days, freq)

    items = list(rental.items or [])
    base_rental_amount = Decimal("0")
    items_shipping = Decimal("0")
    items_setup = Decimal("0")
    for item in items:
        base_rental_amount += Decimal(periods) * _money(item.rental_rate) * Decimal(max(1, int(item.quantity or 1)))
        items_shipping += _money(item.shipping_fee)
        items_setup += _money(item.setup_fee)

    worked_hours = _money(payload.worked_hours)
    setup_fee = _money(payload.setup_fee) + items_setup
    service_fee = _money(payload.service_fee)
    shipping_fee = _money(payload.shipping_fee) + items_shipping
    application_fee = _money(payload.application_fee)
    raw_discount = _money(payload.discount_amount)
    tax_rate = _money(payload.tax_rate)
    tax_amount = (base_rental_amount * tax_rate / Decimal("100")).quantize(Decimal("0.01"))
    
    subtotal = base_rental_amount + worked_hours + setup_fee + service_fee + shipping_fee + application_fee
    discount_amount = (subtotal * raw_discount / Decimal("100")).quantize(Decimal("0.01")) if payload.discount_type == "percent" else raw_discount
    total_amount = subtotal + tax_amount - discount_amount

    # Create Invoice
    invoice = Invoice(
        invoice_number=_next_invoice_number(db),
        invoice_type=InvoiceType.RENTAL,
        customer_name=rental.customer_name,
        customer_email=rental.customer_email or "billing@example.com",
        customer_phone=rental.customer_phone,
        customer_address=rental.customer_address,
        facility_id=(items[0].part.facility_id if items and items[0].part else (rental.part.facility_id if rental.part else None)),
        rental_id=rental.id,
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
        notes=payload.notes or f"Rental invoice for agreement {rental.rental_number}.",
    )
    
    db.add(invoice)
    db.flush()
    record_invoice_created(db, invoice, current_user, f"Rental invoice created from agreement {rental.rental_number}")
    
    rental.converted_invoice_id = invoice.id
    rental.updated_at = datetime.utcnow()
    
    _append_history(
        rental,
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
    log_activity(db, "rentals", rental.id, "CONVERT_TO_INVOICE", current_user, {"invoice_id": invoice.id})
    db.commit()
    db.refresh(invoice)
    return _invoice_response(invoice)


@router.get("/invoices")
def list_rental_invoices(
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
            joinedload(Invoice.rental),
            joinedload(Invoice.approved_for_billing_by),
            selectinload(Invoice.transactions).joinedload(InvoiceTransaction.created_by),
        )
        .filter(Invoice.invoice_type == InvoiceType.RENTAL)
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
            "agreement": [contains_ci(Rental.rental_number, search_term)],
            "related_number": [contains_ci(Rental.rental_number, search_term)],
        }
        if searched_date:
            search_by_field["date"].extend(
                [Invoice.issue_date == searched_date, Invoice.due_date == searched_date]
            )
        query = (
            query
            .outerjoin(Facility, Invoice.facility_id == Facility.id)
            .outerjoin(Rental, Invoice.rental_id == Rental.id)
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
def update_rental_invoice(
    invoice_id: int,
    payload: RentalInvoiceUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Any:
    invoice = (
        db.query(Invoice)
        .options(
            joinedload(Invoice.rental),
            joinedload(Invoice.facility),
            joinedload(Invoice.approved_for_billing_by),
            joinedload(Invoice.transactions),
        )
        .filter(invoice_id == Invoice.id, Invoice.invoice_type == InvoiceType.RENTAL)
        .with_for_update(of=Invoice)
        .first()
    )
    if not invoice:
        raise HTTPException(status_code=404, detail="Rental invoice not found")
        
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
        
    if invoice.rental:
        if invoice.status == InvoiceStatus.PAID:
            _append_history(invoice.rental, "invoice_paid", current_user, {"invoice_id": invoice.id})
        else:
            _append_history(invoice.rental, "invoice_updated", current_user, {"invoice_id": invoice.id, "status": invoice.status.value})
            
    invoice.updated_at = datetime.utcnow()
    record_payment_delta(db, invoice, previous_paid, invoice.amount_paid, current_user, invoice.payment_method, update_data.get("notes"))
    record_status_change(db, invoice, previous_status, current_user)
    log_activity(db, "invoices", invoice.id, "UPDATE_RENTAL_INVOICE", current_user, update_data)
    db.commit()
    db.refresh(invoice)
    return _invoice_response(invoice)


@router.get("/history")
def list_rental_history(
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
    rentals_query = (
        db.query(Rental)
        .options(
            selectinload(Rental.items).joinedload(RentalItem.part).joinedload(InventoryPart.facility),
            joinedload(Rental.part).joinedload(InventoryPart.facility),
        )
    )
    if is_facility_scoped_user(current_user):
        accessible = get_user_facility_ids(db, current_user)
        scope = (
            select(RentalItem.rental_id)
            .join(InventoryPart, RentalItem.part_id == InventoryPart.id)
            .where(InventoryPart.facility_id.in_(accessible))
        )
        rentals_query = rentals_query.filter(Rental.id.in_(scope))
    search_term = normalize_list_search(search)
    searched_date = parsed_date_value(search_term) if search_term else None
    if search_term:
        product_scope = (
            select(RentalItem.rental_id)
            .join(InventoryPart, RentalItem.part_id == InventoryPart.id)
            .where(or_(
                contains_ci(InventoryPart.part_number, search_term),
                contains_ci(InventoryPart.description, search_term),
                contains_ci(RentalItem.part_number, search_term),
                contains_ci(RentalItem.part_description, search_term),
            ))
        )
        facility_scope = (
            select(RentalItem.rental_id)
            .join(InventoryPart, RentalItem.part_id == InventoryPart.id)
            .join(Facility, InventoryPart.facility_id == Facility.id)
            .where(contains_ci(Facility.name, search_term))
        )
        history_search_by_field = {
            "agreement": [contains_ci(Rental.rental_number, search_term)],
            "customer": [contains_ci(Rental.customer_name, search_term)],
            "product": [Rental.id.in_(product_scope)],
            "facility": [Rental.id.in_(facility_scope)],
            "activity": [value_contains_ci(Rental.history, search_term)],
            "date": [value_contains_ci(Rental.history, search_term)],
        }
        if searched_date:
            history_search_by_field["date"].append(
                value_contains_ci(Rental.history, searched_date.isoformat())
            )
        rentals_query = rentals_query.filter(
            or_(*predicates_for_field(search_field, history_search_by_field))
        )
    rentals = rentals_query.order_by(Rental.updated_at.desc()).all()
    rows: list[dict[str, Any]] = []
    for rental in rentals:
        first_item = (rental.items or [None])[0]
        facility_name = (
            (rental.part.facility.name if rental.part and rental.part.facility else None)
            or (first_item.part.facility.name if first_item and first_item.part and first_item.part.facility else None)
        )
        part_number = (rental.part.part_number if rental.part else None) or (first_item.part_number if first_item else None)
        part_description = (rental.part.description if rental.part else None) or (first_item.part_description if first_item else None)
        for item in rental.history or []:
            rows.append(
                {
                    **item,
                    "rental_id": rental.id,
                    "rental_number": rental.rental_number,
                    "facility_name": facility_name,
                    "customer_name": rental.customer_name,
                    "part_number": part_number,
                    "part_description": part_description,
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
            "agreement": ("rental_number",),
            "customer": ("customer_name",),
            "product": ("part_number", "part_description"),
            "facility": ("facility_name",),
            "activity": ("action", "by"),
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
def rental_summary(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Any:
    """Totals for the Rentals KPI cards, independent of tab pagination."""
    invoice_query = scope_invoice_approval_visibility(
        scope_query_to_user_facilities(db.query(Invoice), Invoice.facility_id, db, current_user)
        .filter(Invoice.invoice_type == InvoiceType.RENTAL),
        current_user,
    )
    total_invoiced = invoice_query.with_entities(func.coalesce(func.sum(Invoice.total_amount), 0)).scalar()
    total_collected = invoice_query.with_entities(func.coalesce(func.sum(Invoice.amount_paid), 0)).scalar()
    products = _rental_part_query(db, current_user).count()
    return {
        "total_invoiced": float(total_invoiced or 0),
        "total_collected": float(total_collected or 0),
        "products": products,
    }
