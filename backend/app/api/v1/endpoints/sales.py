import json
import hashlib
import secrets
from datetime import date, datetime, timedelta
from decimal import Decimal
from typing import Any, Optional

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, status
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import func, or_
from sqlalchemy.orm import Session, joinedload, selectinload

from app.db.base import get_db
from app.core.deps import get_current_user
from app.core.config import settings
from app.utils.permission_deps import require_module_access
from app.models.facility import Facility
from app.models.inventory import InventoryPart
from app.models.invoice import Invoice, InvoiceStatus, InvoiceTransaction, InvoiceType
from app.models.sales import (
    SalesInventoryReservation,
    SalesPaymentAuthorization,
    SalesQuotation,
    SalesQuotationAcceptance,
    SalesQuotationLineItem,
    SalesQuotationRecipient,
)
from app.models.user import User, UserRole
from app.models.user_facility import UserFacility
from app.utils.facility_access import require_facility_access, scope_query_to_user_facilities
from app.utils.invoice_editing import compose_invoice_edit_notes, editable_labels, editable_line_items, editable_summary_rows, parse_invoice_edit_metadata, strip_invoice_edit_metadata
from app.utils.invoice_ledger import add_invoice_transaction, record_invoice_created, record_payment_delta, record_status_change, transaction_response
from app.utils.invoice_refunds import issue_invoice_refund
from app.utils.square_payments import SquareRequestError
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
from app.utils.email import send_html_email
from app.utils.notifications import create_notifications
from app.utils.permissions import has_module_permission
from app.utils.sales_inventory import (
    ACTIVE_RESERVATION,
    fulfill_sales_invoice_inventory,
    release_sales_inventory_reservations,
    reserve_sales_inventory,
)
from app.utils.list_search import (
    contains_ci,
    normalize_list_search,
    parsed_date_value,
    predicates_for_field,
    value_contains_ci,
)

router = APIRouter(dependencies=[Depends(require_module_access("sales"))])


class SalesTradeInPartIn(BaseModel):
    part_number: str = Field(min_length=1, max_length=255)
    description: str = Field(min_length=1)
    make: Optional[str] = None
    model: Optional[str] = None
    serial_number: Optional[str] = None
    batch_number: Optional[str] = None
    default_picture_url: Optional[str] = None
    condition: str = "used"
    reorder_level: int = Field(default=0, ge=0)
    location: Optional[str] = None
    supplier_name: Optional[str] = None
    supplier_contact: Optional[str] = None
    supplier_email: Optional[str] = None
    supplier_phone: Optional[str] = None
    supplier_address: Optional[str] = None
    vendor_name: Optional[str] = None
    purchase_location: Optional[str] = None
    shipping_method: Optional[str] = None
    acquisition_date: Optional[date] = None
    warehouse_arrival_date: Optional[date] = None


class SalesQuotationItemIn(BaseModel):
    part_id: Optional[int] = None
    item_kind: str = "product"
    is_default: bool = False
    quantity: int = 1
    unit_price: Optional[Decimal] = None
    shipping_fee: Decimal = Decimal("0")
    setup_fee: Decimal = Decimal("0")
    labor_fee: Decimal = Decimal("0")
    condition: Optional[str] = None
    description: Optional[str] = None
    item_metadata: Optional[dict[str, Any]] = None
    trade_in_part: Optional[SalesTradeInPartIn] = None


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
    primary_recipient_user_id: Optional[int] = None
    additional_recipient_user_ids: list[int] = Field(default_factory=list)
    items: list[SalesQuotationItemIn]


class SalesDirectInvoiceCreate(SalesQuotationCreate):
    due_date: Optional[date] = None


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
    primary_recipient_user_id: Optional[int] = None
    additional_recipient_user_ids: Optional[list[int]] = None
    items: Optional[list[SalesQuotationItemIn]] = None


class SalesDirectInvoiceUpdate(SalesQuotationUpdate):
    due_date: Optional[date] = None


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
    selected_line_item_ids: Optional[list[int]] = None
    selection_channel: str = "internal"


class SalesInvoiceRefundCreate(BaseModel):
    amount: Decimal
    payment_method: Optional[str] = None
    notes: Optional[str] = None


class SalesQuotationSend(BaseModel):
    expires_in_days: int = 30


class SalesCardAuthorizationCreate(BaseModel):
    card_holder_name: Optional[str] = None
    card_type: Optional[str] = None
    name_on_card: Optional[str] = None
    phone: Optional[str] = None
    title: Optional[str] = None
    expiration: Optional[str] = None
    masked_card_number: Optional[str] = None
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


def _authorization_response(authorization: SalesPaymentAuthorization) -> dict[str, Any]:
    return {
        "id": authorization.id,
        "invoice_id": authorization.invoice_id,
        "quotation_id": authorization.quotation_id,
        "status": authorization.status,
        "amount": authorization.amount,
        "currency": authorization.currency,
        "payment_method": authorization.payment_method,
        "channel": authorization.channel,
        "submitted_by_name": authorization.submitted_by_name,
        "submitted_by_email": authorization.submitted_by_email,
        "cardholder_name": authorization.cardholder_name,
        "card_brand": authorization.card_brand,
        "card_last_four": authorization.card_last_four,
        "card_expiration": authorization.card_expiration,
        "authorization_reference": authorization.authorization_reference,
        "notes": authorization.notes,
        "requested_by_name": (
            authorization.requested_by.full_name
            if getattr(authorization, "requested_by", None)
            else None
        ),
        "requested_at": authorization.requested_at,
        "submitted_at": authorization.submitted_at,
        "processed_at": authorization.processed_at,
        "token_expires_at": authorization.token_expires_at,
    }


def _acceptance_response(acceptance: Optional[SalesQuotationAcceptance]) -> Optional[dict[str, Any]]:
    if not acceptance:
        return None
    return {
        "id": acceptance.id,
        "accepted_by_name": acceptance.accepted_by_name,
        "signature_name": acceptance.signature_name,
        "terms_accepted": acceptance.terms_accepted,
        "accepted_at": acceptance.accepted_at,
        "quotation_revision": acceptance.quotation_revision,
        "selection_snapshot": acceptance.selection_snapshot,
        "pricing_snapshot": acceptance.pricing_snapshot,
        "ip_address": acceptance.ip_address,
        "user_agent": acceptance.user_agent,
    }


def _history_entry(
    action: str,
    user: Optional[User],
    details: Optional[dict[str, Any]] = None,
    actor_name: Optional[str] = None,
) -> dict[str, Any]:
    return {
        "action": action,
        "by": (
            user.full_name or user.username
            if user
            else actor_name or "External recipient"
        ),
        "user_id": user.id if user else None,
        "at": datetime.utcnow().isoformat(),
        "details": details or {},
    }


def _append_history(
    quotation: SalesQuotation,
    action: str,
    user: Optional[User],
    details: Optional[dict[str, Any]] = None,
    actor_name: Optional[str] = None,
) -> None:
    history = list(quotation.history or [])
    safe_details = json.loads(json.dumps(details or {}, default=str)) if details else None
    history.append(_history_entry(action, user, safe_details, actor_name))
    quotation.history = history


def _part_response(
    part: InventoryPart,
    commitment: Optional[dict[str, Any]] = None,
) -> dict[str, Any]:
    stock = commitment or {}
    reserved_quantity = int(stock.get("reserved_quantity") or 0)
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
        "quantity_reserved": reserved_quantity,
        "quantity_available": max(int(part.quantity_on_hand or 0) - reserved_quantity, 0),
        "quantity_in_open_quotations": int(stock.get("open_quote_quantity") or 0),
        "stock_commitments": stock.get("commitments") or [],
        "unit_price": part.unit_price,
        "facility_id": part.facility_id,
        "facility_name": part.facility.name if part.facility else None,
        "status": part.status,
    }


OPEN_UNACCEPTED_QUOTATION_STATUSES = ("sent", "viewed", "changes_requested")


def _part_commitment_map(
    db: Session,
    part_ids: list[int],
) -> dict[int, dict[str, Any]]:
    """Return bounded commitment details for the currently requested parts page."""
    result: dict[int, dict[str, Any]] = {
        part_id: {
            "reserved_quantity": 0,
            "open_quote_quantity": 0,
            "commitments": [],
        }
        for part_id in part_ids
    }
    if not part_ids:
        return result

    open_lines = (
        db.query(SalesQuotationLineItem, SalesQuotation)
        .join(SalesQuotation, SalesQuotation.id == SalesQuotationLineItem.quotation_id)
        .filter(
            SalesQuotationLineItem.part_id.in_(part_ids),
            SalesQuotationLineItem.item_kind == "product",
            SalesQuotation.status.in_(OPEN_UNACCEPTED_QUOTATION_STATUSES),
            SalesQuotation.converted_invoice_id.is_(None),
        )
        .order_by(SalesQuotation.created_at.desc(), SalesQuotationLineItem.id.desc())
        .all()
    )
    for line, quotation in open_lines:
        stock = result[line.part_id]
        quantity = int(line.quantity or 0)
        stock["open_quote_quantity"] += quantity
        stock["commitments"].append(
            {
                "type": "open_quotation",
                "quantity": quantity,
                "quotation_id": quotation.id,
                "quotation_number": quotation.quotation_number,
                "quotation_status": quotation.status,
                "invoice_id": None,
                "invoice_number": None,
                "invoice_status": None,
            }
        )

    active_reservations = (
        db.query(SalesInventoryReservation, SalesQuotation, Invoice)
        .join(SalesQuotation, SalesQuotation.id == SalesInventoryReservation.quotation_id)
        .join(Invoice, Invoice.id == SalesInventoryReservation.invoice_id)
        .filter(
            SalesInventoryReservation.part_id.in_(part_ids),
            SalesInventoryReservation.status == "active",
        )
        .order_by(SalesInventoryReservation.created_at.desc())
        .all()
    )
    for reservation, quotation, invoice in active_reservations:
        stock = result[reservation.part_id]
        quantity = int(reservation.quantity or 0)
        stock["reserved_quantity"] += quantity
        stock["commitments"].append(
            {
                "type": "reserved_unpaid_invoice",
                "quantity": quantity,
                "quotation_id": quotation.id,
                "quotation_number": quotation.quotation_number,
                "quotation_status": quotation.status,
                "invoice_id": invoice.id,
                "invoice_number": invoice.invoice_number,
                "invoice_status": (
                    invoice.status.value
                    if hasattr(invoice.status, "value")
                    else invoice.status
                ),
            }
        )
    return result


def _line_response(line: SalesQuotationLineItem) -> dict[str, Any]:
    metadata = line.item_metadata or {}
    return {
        "id": line.id,
        "part_id": line.part_id,
        "item_kind": line.item_kind or "product",
        "is_default": bool(line.is_default),
        "is_selected": bool(line.is_selected),
        "item_metadata": metadata,
        "trade_in_part": metadata.get("inventory_part") if line.item_kind == "trade_in" else None,
        "part_number": line.part.part_number if line.part else None,
        "part_description": line.part.description if line.part else None,
        "description": line.description,
        "quantity": line.quantity,
        "unit_price": line.unit_price,
        "shipping_fee": line.shipping_fee,
        "setup_fee": line.setup_fee,
        "labor_fee": line.labor_fee,
        "condition": line.condition,
        "total": line.total,
    }


def _recipient_response(recipient: SalesQuotationRecipient) -> dict[str, Any]:
    return {
        "id": recipient.id,
        "user_id": recipient.user_id,
        "recipient_type": recipient.recipient_type,
        "name": recipient.name,
        "email": recipient.email,
        "role": (
            recipient.user.role.value
            if recipient.user and hasattr(recipient.user.role, "value")
            else recipient.user.role
            if recipient.user
            else None
        ),
        "status": recipient.status,
        "sent_at": recipient.sent_at,
        "viewed_at": recipient.viewed_at,
        "accepted_at": recipient.accepted_at,
    }


def _invoice_response(invoice: Invoice) -> dict[str, Any]:
    refunded_amount = _money(invoice.refunded_amount)
    return {
        "id": invoice.id,
        "invoice_number": invoice.invoice_number,
        "invoice_type": invoice.invoice_type.value if hasattr(invoice.invoice_type, "value") else invoice.invoice_type,
        "sales_quotation_id": invoice.sales_quotation_id,
        "sales_quotation_number": invoice.sales_quotation.quotation_number if invoice.sales_quotation else None,
        "source_document_kind": (
            (invoice.sales_quotation.document_kind or "quotation")
            if invoice.sales_quotation
            else None
        ),
        "source_document_status": invoice.sales_quotation.status if invoice.sales_quotation else None,
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
        "refunded_amount": refunded_amount,
        "net_paid": max(_money(invoice.amount_paid) - refunded_amount, Decimal("0")),
        "refund_status": invoice.refund_status or "none",
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
        "document_kind": quotation.document_kind or "quotation",
        "quotation_type": quotation.quotation_type,
        "selection_status": quotation.selection_status or "pending",
        "selection_channel": quotation.selection_channel,
        "selection_snapshot": quotation.selection_snapshot or [],
        "accepted_by_id": quotation.accepted_by_id,
        "accepted_by_name": quotation.accepted_by.full_name if quotation.accepted_by else None,
        "accepted_at": quotation.accepted_at,
        "sent_at": quotation.sent_at,
        "expires_at": quotation.expires_at,
        "revision": quotation.revision or 1,
        "status": quotation.status,
        "paid_status": (
            quotation.converted_invoice.refund_status
            if quotation.converted_invoice and quotation.converted_invoice.refund_status not in (None, "none")
            else quotation.paid_status
        ),
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
        "converted_invoice_due_date": quotation.converted_invoice.due_date if quotation.converted_invoice else None,
        "converted_invoice_payment_method": quotation.converted_invoice.payment_method if quotation.converted_invoice else quotation.payment_method,
        "created_at": quotation.created_at,
        "updated_at": quotation.updated_at,
        "history": quotation.history or [],
        "line_items": [_line_response(line) for line in quotation.line_items or []],
        "recipients": [_recipient_response(item) for item in quotation.recipients or []],
        "primary_recipient": next(
            (
                _recipient_response(item)
                for item in quotation.recipients or []
                if item.recipient_type == "primary"
            ),
            None,
        ),
        "additional_recipients": [
            _recipient_response(item)
            for item in quotation.recipients or []
            if item.recipient_type == "additional"
        ],
        "acceptance": _acceptance_response(quotation.acceptance),
        "payment_authorizations": [
            _authorization_response(item)
            for item in (quotation.payment_authorizations or [])
        ],
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


QUOTE_TYPES = {"standard", "choice_single", "choice_multiple"}
INTERNAL_SALES_ROLES = {UserRole.SUPERADMIN, UserRole.ADMIN}
QUOTATION_RECIPIENT_ROLES = {
    UserRole.FACILITY_ADMIN,
    UserRole.FACILITY_MANAGER,
    UserRole.CLIENT,
}
CREDIT_ITEM_KINDS = {"trade_in", "refund"}
SALES_TAX_RATE = Decimal("8.25")
SALES_TAX_FACTOR = SALES_TAX_RATE / Decimal("100")


def _token_hash(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def _eligible_quotation_recipient_query(db: Session, facility_id: int):
    linked_user_ids = db.query(UserFacility.user_id).filter(UserFacility.facility_id == facility_id)
    return db.query(User).filter(
        User.is_active.is_(True),
        User.role.in_(QUOTATION_RECIPIENT_ROLES),
        or_(User.facility_id == facility_id, User.id.in_(linked_user_ids)),
    )


def _sync_quotation_recipients(
    db: Session,
    quotation: SalesQuotation,
    primary_user_id: Optional[int],
    additional_user_ids: Optional[list[int]],
) -> None:
    if quotation.status not in {"draft", "pending", "changes_requested"}:
        raise HTTPException(
            status_code=409,
            detail="Recipients cannot be changed after the quotation has been sent",
        )

    if quotation.facility_id is None:
        if primary_user_id or additional_user_ids:
            raise HTTPException(
                status_code=400,
                detail="Facility users can only be selected after choosing a facility",
            )
        quotation.recipients.clear()
        return

    requested_ids = {
        user_id
        for user_id in [primary_user_id, *(additional_user_ids or [])]
        if user_id is not None
    }
    users = (
        _eligible_quotation_recipient_query(db, quotation.facility_id)
        .filter(User.id.in_(requested_ids))
        .order_by(User.id.asc())
        .all()
        if requested_ids
        else []
    )
    users_by_id = {user.id: user for user in users}
    missing = sorted(requested_ids - set(users_by_id))
    if missing:
        raise HTTPException(
            status_code=400,
            detail="One or more recipients are not active attached users of this facility",
        )

    additional_ids = [user_id for user_id in dict.fromkeys(additional_user_ids or []) if user_id != primary_user_id]
    quotation.recipients.clear()
    if primary_user_id:
        primary = users_by_id[primary_user_id]
        quotation.recipients.append(
            SalesQuotationRecipient(
                user_id=primary.id,
                recipient_type="primary",
                name=primary.full_name,
                email=primary.email,
            )
        )
        quotation.customer_name = primary.full_name
        quotation.customer_email = primary.email
        quotation.customer_phone = primary.phone
    for user_id in additional_ids:
        user = users_by_id[user_id]
        quotation.recipients.append(
            SalesQuotationRecipient(
                user_id=user.id,
                recipient_type="additional",
                name=user.full_name,
                email=user.email,
            )
        )


def _effective_quotation_lines(quotation: SalesQuotation) -> list[SalesQuotationLineItem]:
    lines = list(quotation.line_items or [])
    if quotation.quotation_type not in {"choice_single", "choice_multiple"}:
        return lines
    selected_products = [
        line
        for line in lines
        if (line.item_kind or "product") == "product" and line.is_selected
    ]
    if not selected_products:
        return []
    return selected_products + [
        line for line in lines if line.item_kind in CREDIT_ITEM_KINDS
    ]


def _line_pricing(
    line: SalesQuotationLineItem,
) -> tuple[Decimal, Decimal, Decimal]:
    """Return signed total, taxable merchandise, and taxable line fees.

    Products, Shipping & Packing, and Delivery & Setup are taxable. Labor is
    deliberately excluded. Trade-ins reduce the merchandise taxable base;
    refund credits do not rewrite tax because they represent a payment
    adjustment rather than a merchandise trade-in.
    """
    quantity = max(int(line.quantity or 0), 0)
    merchandise = _money(line.unit_price) * quantity
    shipping = _money(line.shipping_fee)
    setup = _money(line.setup_fee)
    labor = _money(line.labor_fee)
    unsigned_total = merchandise + shipping + setup + labor
    item_kind = (line.item_kind or "product").strip().lower()
    signed_total = -abs(unsigned_total) if item_kind in CREDIT_ITEM_KINDS else unsigned_total
    if item_kind == "product":
        taxable_merchandise = merchandise
        taxable_fees = shipping + setup
    elif item_kind == "trade_in":
        taxable_merchandise = -abs(merchandise)
        taxable_fees = Decimal("0")
    else:
        taxable_merchandise = Decimal("0")
        taxable_fees = Decimal("0")
    return (
        _money(signed_total),
        _money(taxable_merchandise),
        _money(taxable_fees),
    )


def _quotation_pricing(
    lines: list[SalesQuotationLineItem],
    discount_amount: Decimal | int | float | None = None,
) -> tuple[Decimal, Decimal, Decimal, Decimal]:
    """Calculate subtotal, taxable base, tax, and total authoritatively."""
    subtotal = Decimal("0")
    taxable_merchandise = Decimal("0")
    taxable_fees = Decimal("0")
    for line in lines:
        line_total, line_merchandise, line_fees = _line_pricing(line)
        line.total = line_total
        subtotal += line_total
        taxable_merchandise += line_merchandise
        taxable_fees += line_fees
    subtotal = _money(subtotal)
    # A trade-in can reduce taxable merchandise to zero, but its unused credit
    # must never spill into Shipping & Packing or Delivery & Setup.
    taxable_base = (
        max(_money(taxable_merchandise), Decimal("0"))
        + max(_money(taxable_fees), Decimal("0"))
    )
    taxable_base = _money(taxable_base)
    tax_amount = (taxable_base * SALES_TAX_FACTOR).quantize(Decimal("0.01"))
    total_amount = subtotal + tax_amount - _money(discount_amount)
    return subtotal, taxable_base, tax_amount, _money(total_amount)


def _apply_quotation_pricing(
    quotation: SalesQuotation,
    lines: list[SalesQuotationLineItem],
) -> tuple[Decimal, Decimal, Decimal, Decimal]:
    pricing = _quotation_pricing(lines, quotation.discount_amount)
    quotation.subtotal = pricing[0]
    quotation.tax_rate = SALES_TAX_RATE
    quotation.tax_amount = pricing[2]
    quotation.total_amount = pricing[3]
    return pricing


def _selection_snapshot(lines: list[SalesQuotationLineItem]) -> list[dict[str, Any]]:
    return [
        {
            "line_item_id": line.id,
            "part_id": line.part_id,
            "item_kind": line.item_kind or "product",
            "part_number": line.part.part_number if line.part else None,
            "description": line.description,
            "quantity": line.quantity,
            "unit_price": str(line.unit_price),
            "shipping_fee": str(line.shipping_fee),
            "setup_fee": str(line.setup_fee),
            "labor_fee": str(line.labor_fee),
            "condition": line.condition,
            "total": str(line.total),
            "item_metadata": line.item_metadata or {},
        }
        for line in lines
    ]


def _sales_line_item_number(line: SalesQuotationLineItem) -> str:
    if line.part:
        return line.part.part_number
    if line.item_kind == "refund":
        return "REFUND"
    if line.item_kind == "trade_in":
        inventory_part = (line.item_metadata or {}).get("inventory_part") or {}
        return str(inventory_part.get("part_number") or "TRADE-IN")
    return "SALES-ITEM"


def _quotation_revision_snapshot(quotation: SalesQuotation) -> dict[str, Any]:
    """Capture the customer-visible revision without retaining access tokens."""
    return {
        "revision": quotation.revision or 1,
        "status": quotation.status,
        "sent_at": quotation.sent_at,
        "expires_at": quotation.expires_at,
        "customer": {
            "name": quotation.customer_name,
            "email": quotation.customer_email,
            "phone": quotation.customer_phone,
            "address": quotation.customer_address,
            "facility_id": quotation.facility_id,
        },
        "quotation_type": quotation.quotation_type,
        "requested_date": quotation.requested_date,
        "notes": quotation.notes,
        "pricing": {
            "subtotal": quotation.subtotal,
            "tax_amount": quotation.tax_amount,
            "discount_amount": quotation.discount_amount,
            "total_amount": quotation.total_amount,
        },
        "line_items": _selection_snapshot(list(quotation.line_items or [])),
        "recipients": [
            {
                "user_id": recipient.user_id,
                "recipient_type": recipient.recipient_type,
                "name": recipient.name,
                "email": recipient.email,
                "status": recipient.status,
                "sent_at": recipient.sent_at,
                "viewed_at": recipient.viewed_at,
            }
            for recipient in quotation.recipients or []
        ],
    }


def _required_stock(lines: list[SalesQuotationLineItem]) -> dict[int, int]:
    required: dict[int, int] = {}
    for line in lines:
        if line.item_kind != "product" or line.part_id is None:
            continue
        required[line.part_id] = required.get(line.part_id, 0) + line.quantity
    return required


def _active_reserved_quantity_map(
    db: Session,
    part_ids: set[int],
    *,
    exclude_quotation_id: Optional[int] = None,
) -> dict[int, int]:
    if not part_ids:
        return {}
    query = db.query(
        SalesInventoryReservation.part_id,
        func.coalesce(func.sum(SalesInventoryReservation.quantity), 0),
    ).filter(
        SalesInventoryReservation.part_id.in_(sorted(part_ids)),
        SalesInventoryReservation.status == ACTIVE_RESERVATION,
    )
    if exclude_quotation_id is not None:
        # Resending a direct invoice must not treat its own idempotent stock
        # reservation as inventory committed to a different sale.
        query = query.filter(
            SalesInventoryReservation.quotation_id != exclude_quotation_id,
        )
    rows = (
        query
        .group_by(SalesInventoryReservation.part_id)
        .all()
    )
    return {int(part_id): int(quantity or 0) for part_id, quantity in rows}


def _validate_quotation_item_stock(
    db: Session,
    items: list[SalesQuotationItemIn],
    current_user: User,
) -> dict[int, InventoryPart]:
    """Validate combined quantities across every line for each Sales SKU."""
    product_items = [
        item
        for item in items
        if (item.item_kind or "product").strip().lower() == "product"
    ]
    part_ids = {item.part_id for item in product_items if item.part_id is not None}
    parts = (
        _sales_part_query(db, current_user)
        .filter(InventoryPart.id.in_(sorted(part_ids)))
        .all()
        if part_ids
        else []
    )
    parts_by_id = {part.id: part for part in parts}
    missing = sorted(part_ids - set(parts_by_id))
    if missing:
        raise HTTPException(
            status_code=404,
            detail=f"Sales part #{missing[0]} not found",
        )

    for item in product_items:
        if item.part_id is None:
            raise HTTPException(
                status_code=400,
                detail="A product is required for every sales option",
            )

    reserved_by_part = _active_reserved_quantity_map(db, set(parts_by_id))
    required_by_part: dict[int, int] = {}
    for item in product_items:
        required_by_part[item.part_id] = (
            required_by_part.get(item.part_id, 0) + int(item.quantity or 0)
        )
    for part_id, required in required_by_part.items():
        part = parts_by_id[part_id]
        reserved = reserved_by_part.get(part.id, 0)
        available = max(int(part.quantity_on_hand or 0) - reserved, 0)
        if required > available:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=(
                    f"Only {available} unit(s) of {part.part_number} are currently "
                    f"available; this quotation requests {required} across all lines."
                ),
            )
    return parts_by_id


def _validate_saved_quotation_stock(
    db: Session,
    quotation: SalesQuotation,
) -> None:
    """Revalidate immediately before delivery in case stock changed after draft."""
    product_lines = [
        line
        for line in quotation.line_items or []
        if (line.item_kind or "product") == "product"
    ]
    part_ids = {line.part_id for line in product_lines if line.part_id is not None}
    parts = (
        db.query(InventoryPart)
        .filter(
            InventoryPart.id.in_(sorted(part_ids)),
            InventoryPart.part_type.ilike("sales"),
            InventoryPart.status == "active",
        )
        .all()
        if part_ids
        else []
    )
    parts_by_id = {part.id: part for part in parts}
    missing = sorted(part_ids - set(parts_by_id))
    if missing:
        raise HTTPException(
            status_code=409,
            detail=f"Sales part #{missing[0]} is no longer available",
        )

    for line in product_lines:
        if line.part_id is None:
            raise HTTPException(
                status_code=409,
                detail="A quotation product no longer has a valid inventory part",
            )

    reserved_by_part = _active_reserved_quantity_map(
        db,
        set(parts_by_id),
        exclude_quotation_id=quotation.id,
    )
    required_by_part: dict[int, int] = {}
    for line in product_lines:
        required_by_part[line.part_id] = (
            required_by_part.get(line.part_id, 0) + int(line.quantity or 0)
        )
    for part_id, required in required_by_part.items():
        part = parts_by_id[part_id]
        reserved = reserved_by_part.get(part.id, 0)
        available = max(int(part.quantity_on_hand or 0) - reserved, 0)
        if required > available:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=(
                    f"Only {available} unit(s) of {part.part_number} are currently "
                    f"available; this quotation requests {required} across all lines. "
                    "Update the quotation before sending."
                ),
            )


def _create_invoice_for_accepted_quotation(
    db: Session,
    quotation: SalesQuotation,
    accepted_lines: list[SalesQuotationLineItem],
    accepted_by: Optional[User],
    *,
    reserve_inventory_now: bool = True,
    mark_accepted: bool = True,
    due_date: Optional[date] = None,
) -> Invoice:
    """Create one Sales invoice from its pricing source.

    Accepted quotations reserve immediately. Direct invoices are initially
    drafts and reserve only when sent, so abandoned drafts never block stock.
    """
    if quotation.converted_invoice:
        return quotation.converted_invoice

    for part_id, quantity in _required_stock(accepted_lines).items():
        line = next(line for line in accepted_lines if line.part_id == part_id)
        if not line.part or line.part.quantity_on_hand < quantity:
            raise HTTPException(
                status_code=409,
                detail=f"Not enough stock for {line.part.part_number if line.part else line.description}",
            )

    subtotal, _, tax_amount, total_amount = _apply_quotation_pricing(
        quotation,
        accepted_lines,
    )
    discount_amount = _money(quotation.discount_amount)

    invoice_line_items = [
        {
            "id": f"sales-line-{line.id}",
            "item_number": _sales_line_item_number(line),
            "description": line.description,
            "quantity": line.quantity,
            "unit_price": float(line.unit_price),
            "shipping_fee": float(line.shipping_fee),
            "setup_fee": float(line.setup_fee),
            "labor_fee": float(line.labor_fee),
            "custom_cells": (
                [
                    {
                        "id": f"labor-{line.id}",
                        "label": "Labor",
                        "value": f"${_money(line.labor_fee):.2f}",
                    }
                ]
                if _money(line.labor_fee) > 0
                else []
            ),
            "condition": line.condition,
            "total": float(line.total),
            "item_kind": line.item_kind or "product",
            "item_metadata": line.item_metadata or {},
        }
        for line in accepted_lines
    ]
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
        due_date=due_date or (date.today() + timedelta(days=30)),
        payment_terms="Net 30",
        notes=compose_invoice_edit_notes(
            None,
            (
                f"Direct Sales invoice created from {quotation.work_order}."
                if (quotation.document_kind or "quotation") == "direct_invoice"
                else f"Sales invoice generated from accepted quotation {quotation.quotation_number}."
            ),
            {
                "line_items": invoice_line_items,
                "labels": {
                    "shipping": "Shipping & Packing",
                    "setup": "Delivery & Setup",
                    "tax": "Sales Tax (8.25%)",
                },
                "selection_snapshot": quotation.selection_snapshot or [],
                "quotation_revision": quotation.revision or 1,
            },
        ),
    )
    db.add(invoice)
    db.flush()
    is_direct_invoice = (quotation.document_kind or "quotation") == "direct_invoice"
    record_invoice_created(
        db,
        invoice,
        accepted_by,
        (
            f"Direct Sales invoice {invoice.invoice_number} created"
            if is_direct_invoice
            else f"Sales invoice created from accepted quotation {quotation.quotation_number}"
        ),
    )
    if reserve_inventory_now:
        reserve_sales_inventory(db, quotation, invoice, accepted_lines, accepted_by)
    quotation.converted_invoice_id = invoice.id
    if mark_accepted:
        quotation.status = "accepted"
    quotation.updated_at = datetime.utcnow()
    return invoice


def _accept_quotation_selection(
    quotation: SalesQuotation,
    selected_line_item_ids: Optional[list[int]],
    channel: str,
    current_user: Optional[User],
    accepted_name: Optional[str] = None,
) -> list[SalesQuotationLineItem]:
    product_lines = [line for line in quotation.line_items or [] if (line.item_kind or "product") == "product"]
    credit_lines = [line for line in quotation.line_items or [] if line.item_kind in CREDIT_ITEM_KINDS]
    if quotation.quotation_type not in {"choice_single", "choice_multiple"}:
        selected = product_lines
    else:
        ids = set(selected_line_item_ids or [])
        valid_ids = {line.id for line in product_lines}
        if ids - valid_ids:
            raise HTTPException(status_code=400, detail="One or more selected quotation options are invalid")
        selected = [line for line in product_lines if line.id in ids]
        if quotation.quotation_type == "choice_single" and len(selected) != 1:
            raise HTTPException(status_code=400, detail="Choose exactly one quotation option")
        if quotation.quotation_type == "choice_multiple" and not selected:
            raise HTTPException(status_code=400, detail="Choose at least one quotation option")

    for line in product_lines:
        line.is_selected = line in selected
    for line in credit_lines:
        line.is_selected = True
    accepted_lines = selected + credit_lines
    _apply_quotation_pricing(quotation, accepted_lines)
    quotation.selection_status = "accepted"
    quotation.selection_channel = (channel or "internal")[:50]
    quotation.accepted_by_id = current_user.id if current_user else None
    quotation.accepted_at = datetime.utcnow()
    quotation.selection_snapshot = _selection_snapshot(accepted_lines)
    _append_history(
        quotation,
        "selection_accepted",
        current_user,
        {
            "channel": quotation.selection_channel,
            "selected_line_item_ids": [line.id for line in selected],
        },
        accepted_name,
    )
    return accepted_lines


def _apply_items(db: Session, quotation: SalesQuotation, items: list[SalesQuotationItemIn], current_user: User) -> None:
    if not items:
        raise HTTPException(status_code=400, detail="At least one sales part is required")
    if quotation.quotation_type not in QUOTE_TYPES:
        raise HTTPException(status_code=400, detail="Quotation type must be Standard, Choice Single, or Choice Multiple")
    if quotation.converted_invoice_id:
        raise HTTPException(status_code=409, detail="An invoiced quotation cannot be changed")

    parts_by_id = _validate_quotation_item_stock(db, items, current_user)
    quotation.line_items.clear()
    selected_lines: list[SalesQuotationLineItem] = []
    default_product_count = 0
    for item in items:
        if item.quantity <= 0:
            raise HTTPException(status_code=400, detail="Quantity must be greater than zero")
        item_kind = (item.item_kind or "product").strip().lower()
        if item_kind not in {"product", "trade_in", "refund"}:
            raise HTTPException(status_code=400, detail="Item type must be product, trade-in, or refund")
        part = None
        if item_kind == "product":
            part = parts_by_id[item.part_id]
        elif not (item.description or (item.trade_in_part.description if item.trade_in_part else "")).strip():
            raise HTTPException(
                status_code=400,
                detail="A description is required for trade-in and refund adjustments",
            )
        if item_kind != "trade_in" and item.trade_in_part is not None:
            raise HTTPException(
                status_code=400,
                detail="Trade-in inventory details can only be attached to a trade-in line",
            )

        if (
            item_kind == "product"
            and quotation.quotation_type in {"choice_single", "choice_multiple"}
            and item.is_default
            and current_user.role not in INTERNAL_SALES_ROLES
        ):
            raise HTTPException(status_code=403, detail="Only an Admin or Super Admin can set default quotation options")
        is_default = quotation.quotation_type == "standard" or item_kind in CREDIT_ITEM_KINDS or bool(item.is_default)
        if item_kind == "product" and is_default:
            default_product_count += 1
        unit_price = _money(item.unit_price if item.unit_price is not None else (part.unit_price if part else 0))
        shipping_fee = _money(item.shipping_fee)
        setup_fee = _money(item.setup_fee)
        labor_fee = _money(item.labor_fee)
        unsigned_total = (unit_price * item.quantity) + shipping_fee + setup_fee + labor_fee
        total = -abs(unsigned_total) if item_kind in CREDIT_ITEM_KINDS else unsigned_total
        item_metadata = dict(item.item_metadata or {})
        if item_kind == "trade_in" and item.trade_in_part:
            trade_in_part = item.trade_in_part.model_dump(mode="json")
            trade_in_part["part_number"] = item.trade_in_part.part_number.strip()
            trade_in_part["description"] = item.trade_in_part.description.strip()
            trade_in_part["condition"] = (item.trade_in_part.condition or "used").strip().lower()
            trade_in_part["serial_number"] = (item.trade_in_part.serial_number or "").strip() or None
            trade_in_part["batch_number"] = (item.trade_in_part.batch_number or "").strip() or None
            item_metadata["inventory_part"] = trade_in_part
        line = SalesQuotationLineItem(
                part_id=part.id if part else None,
                # Bind the relationship as well as the FK. Direct invoices are
                # generated in the same unit of work, before a relationship
                # reload; leaving this unset made valid stock look missing.
                part=part,
                item_kind=item_kind,
                is_default=is_default,
                is_selected=is_default,
                item_metadata=item_metadata,
                description=(
                    item.description
                    or (item.trade_in_part.description if item.trade_in_part else None)
                    or (part.description if part else "Quotation credit")
                ),
                quantity=item.quantity,
                unit_price=unit_price,
                shipping_fee=shipping_fee,
                setup_fee=setup_fee,
                labor_fee=labor_fee,
                condition=item.condition or (part.condition if part else None),
                total=total,
            )
        quotation.line_items.append(line)
        if is_default:
            selected_lines.append(line)

    if quotation.quotation_type == "choice_single" and default_product_count > 1:
        raise HTTPException(status_code=400, detail="Choice Single can have at most one default option")
    has_pending_choice = (
        quotation.quotation_type in {"choice_single", "choice_multiple"}
        and default_product_count == 0
    )
    if has_pending_choice:
        # A choice quote may intentionally have no preselected option.  Its
        # financial total is established only after the recipient chooses;
        # fixed discounts must not turn the draft into a negative quotation.
        selected_lines = []
    quotation.selection_status = "pending"
    quotation.selection_channel = None
    quotation.selection_snapshot = None
    quotation.accepted_by_id = None
    quotation.accepted_at = None
    _apply_quotation_pricing(quotation, selected_lines)


@router.get("/parts")
def list_sales_parts(
    db: Session = Depends(get_db),
    search: Optional[str] = Query(None),
    search_field: Optional[str] = Query(None),
    part_ids: Optional[str] = Query(
        None,
        description="Optional comma-separated part ids for bounded stock checks",
    ),
    date_from: Optional[date] = Query(None),
    date_to: Optional[date] = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(25, ge=1, le=100),
    current_user: User = Depends(get_current_user),
) -> Any:
    if date_from and date_to and date_from > date_to:
        raise HTTPException(status_code=422, detail="From date cannot be after To date")
    query = _sales_part_query(db, current_user)
    if part_ids:
        try:
            requested_part_ids = sorted(
                {
                    int(value.strip())
                    for value in part_ids.split(",")
                    if value.strip()
                }
            )
        except ValueError as exc:
            raise HTTPException(status_code=422, detail="part_ids must contain integers") from exc
        if len(requested_part_ids) > 100:
            raise HTTPException(status_code=422, detail="At most 100 part ids may be requested")
        query = query.filter(InventoryPart.id.in_(requested_part_ids))
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
    commitments = _part_commitment_map(db, [part.id for part in parts])
    return {
        "items": [
            _part_response(part, commitments.get(part.id))
            for part in parts
        ],
        "total": total,
        "skip": skip,
        "limit": limit,
    }


IN_PROGRESS_QUOTATION_STATUSES = ("accepted", "in_progress")
COMPLETED_QUOTATION_STATUSES = ("completed",)


def _sales_payment_method_category(value: Optional[str]) -> Optional[str]:
    """Map gateway and legacy payment values to the three Sales UI groups."""
    normalized = str(value or "").strip().lower().replace("-", "_").replace(" ", "_")
    if normalized in {"credit_card", "square_card", "card", "square"}:
        return "credit_card"
    if normalized in {"cheque", "check"}:
        return "cheque"
    if normalized in {"bank_transfer", "wire_transfer", "ach", "mbmts_ach"}:
        return "bank_transfer"
    return None


@router.get("/facilities/{facility_id}/quotation-recipients")
def list_quotation_recipient_candidates(
    facility_id: int,
    search: Optional[str] = Query(None),
    limit: int = Query(50, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Any:
    facility = db.query(Facility.id).filter(Facility.id == facility_id).first()
    if not facility:
        raise HTTPException(status_code=404, detail="Facility not found")
    require_facility_access(db, current_user, facility_id)
    query = _eligible_quotation_recipient_query(db, facility_id)
    if search and search.strip():
        like = f"%{search.strip()}%"
        query = query.filter(
            or_(
                User.full_name.ilike(like),
                User.email.ilike(like),
                User.username.ilike(like),
            )
        )
    total = query.count()
    users = query.order_by(User.full_name.asc(), User.id.asc()).limit(limit).all()
    return {
        "items": [
            {
                "id": user.id,
                "full_name": user.full_name,
                "email": user.email,
                "phone": user.phone,
                "role": user.role.value if hasattr(user.role, "value") else user.role,
            }
            for user in users
        ],
        "total": total,
    }


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
            joinedload(SalesQuotation.accepted_by),
            joinedload(SalesQuotation.converted_invoice),
            joinedload(SalesQuotation.line_items).joinedload(SalesQuotationLineItem.part),
            selectinload(SalesQuotation.recipients).joinedload(SalesQuotationRecipient.user),
            joinedload(SalesQuotation.acceptance),
            selectinload(SalesQuotation.payment_authorizations).joinedload(SalesPaymentAuthorization.requested_by),
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
            SalesQuotation.document_kind == "quotation",
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
            joinedload(SalesQuotation.accepted_by),
            joinedload(SalesQuotation.converted_invoice),
            joinedload(SalesQuotation.line_items).joinedload(SalesQuotationLineItem.part),
            selectinload(SalesQuotation.recipients).joinedload(SalesQuotationRecipient.user),
            joinedload(SalesQuotation.acceptance),
            selectinload(SalesQuotation.payment_authorizations).joinedload(SalesPaymentAuthorization.requested_by),
        )
        .filter(SalesQuotation.id == quotation_id)
        .first()
    )
    if not quotation:
        raise HTTPException(status_code=404, detail="Sales quotation not found")
    return _quotation_response(quotation)


@router.post("/direct-invoices", status_code=status.HTTP_201_CREATED)
def create_direct_invoice(
    payload: SalesDirectInvoiceCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Any:
    """Create a direct Sales invoice draft without a quotation approval step."""
    if current_user.role not in INTERNAL_SALES_ROLES:
        raise HTTPException(status_code=403, detail="Only an Admin or Super Admin can create Sales invoices")
    if payload.facility_id is not None:
        facility = db.query(Facility).filter(Facility.id == payload.facility_id).first()
        if not facility:
            raise HTTPException(status_code=404, detail="Facility not found")
        require_facility_access(db, current_user, payload.facility_id)

    source = SalesQuotation(
        quotation_number=_next_number(db, SalesQuotation, "quotation_number", "SQ"),
        work_order=_next_number(db, SalesQuotation, "work_order", "WO"),
        facility_id=payload.facility_id,
        created_by_id=current_user.id,
        customer_name=payload.customer_name,
        customer_email=str(payload.customer_email) if payload.customer_email else None,
        customer_phone=payload.customer_phone,
        customer_address=payload.customer_address,
        document_kind="direct_invoice",
        quotation_type="standard",
        status="draft",
        paid_status="unpaid",
        requested_date=payload.requested_date or date.today(),
        notes=payload.notes,
        tax_amount=payload.tax_amount,
        discount_amount=payload.discount_amount,
        history=[],
    )
    _append_history(source, "direct_invoice_created", current_user)
    db.add(source)
    db.flush()
    _sync_quotation_recipients(
        db,
        source,
        payload.primary_recipient_user_id,
        payload.additional_recipient_user_ids,
    )
    _apply_items(db, source, payload.items, current_user)
    invoice = _create_invoice_for_accepted_quotation(
        db,
        source,
        _effective_quotation_lines(source),
        current_user,
        reserve_inventory_now=False,
        mark_accepted=False,
        due_date=payload.due_date,
    )
    invoice.issue_date = payload.requested_date or date.today()
    log_activity(
        db,
        "sales_invoices",
        invoice.id,
        "CREATE_DIRECT",
        current_user,
        {"invoice_number": invoice.invoice_number, "work_order": source.work_order},
    )
    db.commit()
    db.refresh(source)
    return _quotation_response(source)


@router.put("/direct-invoices/{invoice_id}")
def update_direct_invoice(
    invoice_id: int,
    payload: SalesDirectInvoiceUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Any:
    invoice = (
        db.query(Invoice)
        .options(
            joinedload(Invoice.sales_quotation).joinedload(SalesQuotation.facility),
            joinedload(Invoice.sales_quotation).joinedload(SalesQuotation.line_items).joinedload(SalesQuotationLineItem.part),
            joinedload(Invoice.sales_quotation).selectinload(SalesQuotation.recipients).joinedload(SalesQuotationRecipient.user),
        )
        .filter(Invoice.id == invoice_id, Invoice.invoice_type == InvoiceType.SALES)
        .with_for_update(of=Invoice)
        .first()
    )
    source = invoice.sales_quotation if invoice else None
    if not invoice or not source or (source.document_kind or "quotation") != "direct_invoice":
        raise HTTPException(status_code=404, detail="Direct Sales invoice not found")
    if source.facility_id is not None:
        require_facility_access(db, current_user, source.facility_id)
    if source.status != "draft" or source.acceptance:
        raise HTTPException(status_code=409, detail="Only an unsigned direct Sales invoice draft can be edited")
    if payload.facility_id is not None:
        require_facility_access(db, current_user, payload.facility_id)

    update_data = payload.model_dump(
        exclude_unset=True,
        exclude={
            "items",
            "primary_recipient_user_id",
            "additional_recipient_user_ids",
            "status",
            "paid_status",
            "due_date",
            "quotation_type",
        },
    )
    for field, value in update_data.items():
        if field == "customer_email" and value is not None:
            value = str(value)
        setattr(source, field, value)
    source.quotation_type = "standard"
    if payload.items is not None:
        _apply_items(db, source, payload.items, current_user)
    else:
        _apply_quotation_pricing(source, _effective_quotation_lines(source))
    if {"primary_recipient_user_id", "additional_recipient_user_ids"}.intersection(payload.model_fields_set):
        _sync_quotation_recipients(
            db,
            source,
            payload.primary_recipient_user_id,
            payload.additional_recipient_user_ids or [],
        )

    lines = _effective_quotation_lines(source)
    subtotal, _, tax_amount, total_amount = _apply_quotation_pricing(source, lines)
    invoice.customer_name = source.customer_name
    invoice.customer_email = source.customer_email or "billing@example.com"
    invoice.customer_phone = source.customer_phone
    invoice.customer_address = source.customer_address
    invoice.facility_id = source.facility_id
    if "requested_date" in payload.model_fields_set and payload.requested_date:
        invoice.issue_date = payload.requested_date
    invoice.subtotal = subtotal
    invoice.tax_amount = tax_amount
    invoice.discount_amount = _money(source.discount_amount)
    invoice.total_amount = total_amount
    invoice.balance_due = max(total_amount - _money(invoice.amount_paid), Decimal("0"))
    if "due_date" in payload.model_fields_set and payload.due_date:
        invoice.due_date = payload.due_date
    invoice.notes = compose_invoice_edit_notes(
        invoice.notes,
        f"Direct Sales invoice created from {source.work_order}.",
        {
            "line_items": [
                {
                    "id": f"sales-line-{line.id}",
                    "item_number": _sales_line_item_number(line),
                    "description": line.description,
                    "quantity": line.quantity,
                    "unit_price": float(line.unit_price),
                    "shipping_fee": float(line.shipping_fee),
                    "setup_fee": float(line.setup_fee),
                    "labor_fee": float(line.labor_fee),
                    "condition": line.condition,
                    "total": float(line.total),
                    "item_kind": line.item_kind or "product",
                    "item_metadata": line.item_metadata or {},
                }
                for line in lines
            ],
            "labels": {
                "shipping": "Shipping & Packing",
                "setup": "Delivery & Setup",
                "tax": "Sales Tax (8.25%)",
            },
        },
    )
    source.updated_at = datetime.utcnow()
    _append_history(source, "direct_invoice_updated", current_user, update_data)
    log_activity(db, "sales_invoices", invoice.id, "UPDATE_DIRECT", current_user, update_data)
    db.commit()
    db.refresh(source)
    return _quotation_response(source)


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
        status="draft",
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
    _sync_quotation_recipients(
        db,
        quotation,
        payload.primary_recipient_user_id,
        payload.additional_recipient_user_ids,
    )
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
        .options(
            joinedload(SalesQuotation.line_items),
            joinedload(SalesQuotation.facility),
            selectinload(SalesQuotation.recipients).joinedload(SalesQuotationRecipient.user),
        )
        .filter(SalesQuotation.id == quotation_id)
        .with_for_update(of=SalesQuotation)
        .first()
    )
    if not quotation:
        raise HTTPException(status_code=404, detail="Sales quotation not found")
    if quotation.facility_id is not None:
        require_facility_access(db, current_user, quotation.facility_id)
    if payload.facility_id is not None:
        require_facility_access(db, current_user, payload.facility_id)

    requested_status = (
        str(payload.status).strip().lower()
        if "status" in payload.model_fields_set and payload.status is not None
        else None
    )
    if (
        quotation.converted_invoice_id
        and requested_status in {"cancelled", "declined", "rejected"}
    ):
        raise HTTPException(
            status_code=409,
            detail=(
                "Cancel the linked unpaid Sales invoice instead. "
                "That action releases its inventory reservation."
            ),
        )

    changed_fields = set(payload.model_fields_set) - {"status", "paid_status"}
    if quotation.status not in {"draft", "pending"} and (
        payload.items is not None
        or changed_fields
    ):
        raise HTTPException(
            status_code=409,
            detail="This quotation is locked. Create a revision before editing a sent quotation.",
        )

    update_data = payload.model_dump(
        exclude_unset=True,
        exclude={
            "items",
            "primary_recipient_user_id",
            "additional_recipient_user_ids",
        },
    )
    for field, value in update_data.items():
        if field == "customer_email" and value is not None:
            value = str(value)
        setattr(quotation, field, value)
    if payload.items is not None:
        _apply_items(db, quotation, payload.items, current_user)
    else:
        _apply_quotation_pricing(
            quotation,
            _effective_quotation_lines(quotation),
        )
    if {
        "primary_recipient_user_id",
        "additional_recipient_user_ids",
    }.intersection(payload.model_fields_set):
        _sync_quotation_recipients(
            db,
            quotation,
            payload.primary_recipient_user_id,
            payload.additional_recipient_user_ids or [],
        )
    quotation.updated_at = datetime.utcnow()
    _append_history(quotation, "updated", current_user, update_data)
    log_activity(db, "sales_quotations", quotation.id, "UPDATE", current_user, update_data)
    db.commit()
    db.refresh(quotation)
    return _quotation_response(quotation)


@router.post("/quotations/{quotation_id}/revise")
def revise_quotation(
    quotation_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Any:
    """Reopen an unaccepted delivered quotation as a new draft revision."""
    if current_user.role not in INTERNAL_SALES_ROLES:
        raise HTTPException(
            status_code=403,
            detail="Only an Admin or Super Admin can create quotation revisions",
        )
    quotation = (
        db.query(SalesQuotation)
        .options(
            joinedload(SalesQuotation.facility),
            joinedload(SalesQuotation.created_by),
            joinedload(SalesQuotation.accepted_by),
            joinedload(SalesQuotation.converted_invoice),
            joinedload(SalesQuotation.acceptance),
            joinedload(SalesQuotation.line_items).joinedload(SalesQuotationLineItem.part),
            selectinload(SalesQuotation.recipients).joinedload(SalesQuotationRecipient.user),
        )
        .filter(SalesQuotation.id == quotation_id)
        .with_for_update(of=SalesQuotation)
        .first()
    )
    if not quotation:
        raise HTTPException(status_code=404, detail="Sales quotation not found")
    if quotation.facility_id is not None:
        require_facility_access(db, current_user, quotation.facility_id)
    if (
        quotation.acceptance
        or quotation.accepted_at
        or quotation.converted_invoice_id
        or quotation.status in {"accepted", "in_progress", "completed", "cancelled", "declined"}
    ):
        raise HTTPException(
            status_code=409,
            detail="Accepted, invoiced, declined, cancelled, or completed quotations cannot be revised",
        )
    if quotation.status not in {"sent", "viewed", "changes_requested"} or not quotation.sent_at:
        raise HTTPException(
            status_code=409,
            detail="Only a sent, viewed, or change-requested quotation can be revised",
        )

    previous_revision = quotation.revision or 1
    previous_snapshot = _quotation_revision_snapshot(quotation)
    now = datetime.utcnow()
    quotation.revision = previous_revision + 1
    quotation.status = "draft"
    quotation.selection_status = "pending"
    quotation.selection_channel = None
    quotation.selection_snapshot = None
    quotation.accepted_by_id = None
    quotation.accepted_at = None
    quotation.sent_at = None
    quotation.expires_at = None
    quotation.updated_at = now
    for line in quotation.line_items or []:
        line.is_selected = bool(line.is_default)
    for recipient in quotation.recipients or []:
        recipient.status = "draft"
        recipient.access_token_hash = None
        recipient.token_expires_at = None
        recipient.sent_at = None
        recipient.viewed_at = None
        recipient.accepted_at = None
        recipient.updated_at = now
    _append_history(
        quotation,
        "revision_created",
        current_user,
        {
            "previous_revision": previous_revision,
            "revision": quotation.revision,
            "previous_revision_snapshot": previous_snapshot,
            "previous_links_invalidated": True,
        },
    )
    log_activity(
        db,
        "sales_quotations",
        quotation.id,
        "CREATE_REVISION",
        current_user,
        {
            "previous_revision": previous_revision,
            "revision": quotation.revision,
        },
    )
    db.commit()
    db.refresh(quotation)
    return _quotation_response(quotation)


@router.post("/quotations/{quotation_id}/send")
def send_quotation(
    quotation_id: int,
    payload: SalesQuotationSend,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Any:
    if current_user.role not in INTERNAL_SALES_ROLES:
        raise HTTPException(status_code=403, detail="Only an Admin or Super Admin can send sales quotations")
    if not 1 <= payload.expires_in_days <= 90:
        raise HTTPException(status_code=400, detail="Quotation expiration must be between 1 and 90 days")

    quotation = (
        db.query(SalesQuotation)
        .options(
            joinedload(SalesQuotation.facility),
            joinedload(SalesQuotation.created_by),
            joinedload(SalesQuotation.accepted_by),
            joinedload(SalesQuotation.converted_invoice),
            joinedload(SalesQuotation.line_items).joinedload(SalesQuotationLineItem.part),
            selectinload(SalesQuotation.recipients).joinedload(SalesQuotationRecipient.user),
        )
        .filter(SalesQuotation.id == quotation_id)
        .with_for_update(of=SalesQuotation)
        .first()
    )
    if not quotation:
        raise HTTPException(status_code=404, detail="Sales quotation not found")
    if quotation.facility_id is not None:
        require_facility_access(db, current_user, quotation.facility_id)
    is_direct_invoice = (quotation.document_kind or "quotation") == "direct_invoice"
    if (
        (quotation.converted_invoice_id and not is_direct_invoice)
        or quotation.status in {"accepted", "completed", "cancelled", "declined"}
    ):
        raise HTTPException(status_code=409, detail="This sales document can no longer be sent")
    _validate_saved_quotation_stock(db, quotation)

    if is_direct_invoice:
        if not quotation.converted_invoice:
            raise HTTPException(status_code=409, detail="The direct Sales invoice record is missing")
        reserve_sales_inventory(
            db,
            quotation,
            quotation.converted_invoice,
            _effective_quotation_lines(quotation),
            current_user,
        )

    primary = next(
        (item for item in quotation.recipients if item.recipient_type == "primary"),
        None,
    )
    if not primary:
        if quotation.facility_id is not None:
            raise HTTPException(status_code=400, detail="Select a primary facility recipient before sending")
        if not quotation.customer_name or not quotation.customer_email:
            raise HTTPException(
                status_code=400,
                detail="Customer name and email are required before sending an external quotation",
            )
        primary = SalesQuotationRecipient(
            quotation_id=quotation.id,
            recipient_type="primary",
            name=quotation.customer_name,
            email=quotation.customer_email,
        )
        quotation.recipients.append(primary)

    db.flush()
    now = datetime.utcnow()
    expires_at = now + timedelta(days=payload.expires_in_days)
    delivery_links: list[dict[str, Any]] = []
    for recipient in quotation.recipients:
        token = secrets.token_urlsafe(32)
        recipient.access_token_hash = _token_hash(token)
        recipient.token_expires_at = expires_at
        recipient.sent_at = now
        recipient.status = "sent"
        recipient.updated_at = now
        relative_url = f"/quotation/{token}"
        public_url = f"{settings.PUBLIC_APP_URL.rstrip('/')}{relative_url}"
        delivery_links.append(
            {
                "recipient_id": recipient.id,
                "recipient_type": recipient.recipient_type,
                "name": recipient.name,
                "email": recipient.email,
                "share_url": public_url,
            }
        )
        if recipient.user_id:
            create_notifications(
                db,
                user_ids=[recipient.user_id],
                title="Sales invoice received" if is_direct_invoice else "Sales quotation received",
                message=(
                    f"{quotation.converted_invoice.invoice_number} is ready to sign and pay."
                    if is_direct_invoice
                    else f"{quotation.quotation_number} is ready for your review."
                ),
                notification_type="billing",
                link_url=relative_url,
                actor_id=current_user.id,
            )
        background_tasks.add_task(
            send_html_email,
            [recipient.email],
            (
                f"Invoice {quotation.converted_invoice.invoice_number}"
                if is_direct_invoice
                else f"Quotation {quotation.quotation_number}"
            ),
            (
                f"<p>Hello {recipient.name},</p>"
                f"<p>{'Invoice' if is_direct_invoice else 'Quotation'} <strong>"
                f"{quotation.converted_invoice.invoice_number if is_direct_invoice else quotation.quotation_number}"
                f"</strong> is ready for {'signature and payment' if is_direct_invoice else 'review'}.</p>"
                f"<p><a href=\"{public_url}\">View {'invoice' if is_direct_invoice else 'quotation'}</a></p>"
                f"<p>This secure link expires on {expires_at.strftime('%B %d, %Y')}.</p>"
            ),
            (
                f"Hello {recipient.name},\n\n{'Invoice' if is_direct_invoice else 'Quotation'} "
                f"{quotation.converted_invoice.invoice_number if is_direct_invoice else quotation.quotation_number} "
                f"is ready for {'signature and payment' if is_direct_invoice else 'review'}.\n"
                f"{public_url}\n\nThis link expires on {expires_at.strftime('%B %d, %Y')}."
            ),
        )

    quotation.status = "sent"
    quotation.sent_at = now
    quotation.expires_at = expires_at
    quotation.updated_at = now
    _append_history(
        quotation,
        "sent",
        current_user,
        {
            "revision": quotation.revision or 1,
            "expires_at": expires_at.isoformat(),
            "recipients": [
                {
                    "user_id": item.user_id,
                    "name": item.name,
                    "email": item.email,
                    "recipient_type": item.recipient_type,
                }
                for item in quotation.recipients
            ],
        },
    )
    log_activity(
        db,
        "sales_quotations",
        quotation.id,
        "SEND",
        current_user,
        {"recipient_count": len(quotation.recipients), "expires_at": expires_at},
    )
    db.commit()
    return {
        **_quotation_response(quotation),
        "delivery_links": delivery_links,
        "primary_share_url": next(
            (
                item["share_url"]
                for item in delivery_links
                if item["recipient_type"] == "primary"
            ),
            None,
        ),
    }


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
        .with_for_update(of=SalesQuotation)
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
        if quotation.converted_invoice_id:
            raise HTTPException(
                status_code=409,
                detail="Cancel the unpaid Sales invoice to release its inventory reservation",
            )
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

    selection_channel = (
        (payload.selection_channel or "internal")
        if current_user.role in INTERNAL_SALES_ROLES
        else "client_portal"
    )
    accepted_lines = _accept_quotation_selection(
        quotation,
        payload.selected_line_item_ids,
        selection_channel,
        current_user,
    )
    for part_id, quantity in _required_stock(accepted_lines).items():
        line = next(line for line in accepted_lines if line.part_id == part_id)
        if not line.part or line.part.quantity_on_hand < quantity:
            raise HTTPException(
                status_code=400,
                detail=f"Not enough stock for {line.part.part_number if line.part else line.description}",
            )

    worked_hours = _money(payload.worked_hours)
    setup_fee = _money(payload.setup_fee)
    service_fee = _money(payload.service_fee)
    shipping_fee = _money(payload.shipping_fee)
    application_fee = _money(payload.application_fee)
    parts_amount, _, line_tax_amount, _ = _quotation_pricing(
        accepted_lines,
        Decimal("0"),
    )
    raw_discount = _money(payload.discount_amount if payload.discount_amount is not None else quotation.discount_amount)
    tax_rate = SALES_TAX_RATE
    tax_amount = line_tax_amount
    subtotal = parts_amount + worked_hours + setup_fee + service_fee + shipping_fee + application_fee
    discount_amount = (subtotal * raw_discount / Decimal("100")).quantize(Decimal("0.01")) if payload.discount_type == "percent" else raw_discount
    total_amount = subtotal + tax_amount - discount_amount

    quotation.subtotal = parts_amount
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

    invoice_line_items = [
        {
            "id": f"sales-line-{line.id}",
            "item_number": _sales_line_item_number(line),
            "description": line.description,
            "quantity": line.quantity,
            "unit_price": float(line.unit_price),
            "shipping_fee": float(line.shipping_fee),
            "setup_fee": float(line.setup_fee),
            "labor_fee": float(line.labor_fee),
            "custom_cells": (
                [
                    {
                        "id": f"labor-{line.id}",
                        "label": "Labor",
                        "value": f"${_money(line.labor_fee):.2f}",
                    }
                ]
                if _money(line.labor_fee) > 0
                else []
            ),
            "condition": line.condition,
            "total": float(line.total),
            "item_kind": line.item_kind or "product",
            "item_metadata": line.item_metadata or {},
        }
        for line in accepted_lines
    ]
    visible_notes = payload.notes or f"Sales invoice for quotation {quotation.quotation_number} / work order {quotation.work_order}."
    invoice_notes = compose_invoice_edit_notes(
        None,
        visible_notes,
        {
            "line_items": invoice_line_items,
            "labels": {
                "shipping": "Shipping & Packing",
                "setup": "Delivery & Setup",
                "tax": "Sales Tax (8.25%)",
            },
            "selection_snapshot": quotation.selection_snapshot or [],
        },
    )
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
        notes=invoice_notes,
    )
    db.add(invoice)
    db.flush()
    record_invoice_created(db, invoice, current_user, f"Sales invoice created from quotation {quotation.quotation_number}")
    reserve_sales_inventory(db, quotation, invoice, accepted_lines, current_user)
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
            "selected_line_item_ids": [line.id for line in accepted_lines if line.item_kind == "product"],
        },
    )
    log_activity(db, "sales_quotations", quotation.id, "CONVERT_TO_INVOICE", current_user, {"invoice_id": invoice.id})
    db.commit()
    db.refresh(invoice)
    return _invoice_response(invoice)


@router.post("/quotations/{quotation_id}/request-card-authorization")
def request_card_authorization(
    quotation_id: int,
    payload: SalesCardAuthorizationCreate,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Any:
    if current_user.role not in INTERNAL_SALES_ROLES:
        raise HTTPException(
            status_code=403,
            detail="Only an Admin or Super Admin can request sales payment authorization",
        )
    quotation = (
        db.query(SalesQuotation)
        .options(
            joinedload(SalesQuotation.converted_invoice),
            joinedload(SalesQuotation.acceptance),
            selectinload(SalesQuotation.recipients).joinedload(SalesQuotationRecipient.user),
            selectinload(SalesQuotation.payment_authorizations),
        )
        .filter(SalesQuotation.id == quotation_id)
        .with_for_update(of=SalesQuotation)
        .first()
    )
    if not quotation:
        raise HTTPException(status_code=404, detail="Sales quotation not found")
    if quotation.facility_id is not None:
        require_facility_access(db, current_user, quotation.facility_id)
    if not quotation.acceptance:
        raise HTTPException(
            status_code=409,
            detail="The customer must sign and approve the quotation before payment authorization is requested",
        )
    invoice = quotation.converted_invoice
    if not invoice:
        raise HTTPException(status_code=409, detail="The accepted quotation does not have an invoice")
    require_invoice_approved(invoice)
    balance_due = max(_money(invoice.balance_due), Decimal("0"))
    if balance_due <= 0:
        raise HTTPException(status_code=409, detail="This invoice has no outstanding balance")

    now = datetime.utcnow()
    for existing in quotation.payment_authorizations or []:
        if existing.status in {"requested", "submitted"}:
            existing.status = "superseded"
            existing.updated_at = now

    primary_recipient = next(
        (item for item in quotation.recipients or [] if item.recipient_type == "primary"),
        None,
    )
    token = secrets.token_urlsafe(32)
    digits = "".join(character for character in (payload.masked_card_number or "") if character.isdigit())
    has_authorization_details = bool(payload.card_holder_name or payload.name_on_card or digits)
    authorization = SalesPaymentAuthorization(
        invoice_id=invoice.id,
        quotation_id=quotation.id,
        recipient_id=primary_recipient.id if primary_recipient else None,
        requested_by_id=current_user.id,
        status="submitted" if has_authorization_details else "requested",
        amount=balance_due,
        currency="USD",
        payment_method="credit_card",
        channel="admin_assisted" if has_authorization_details else "public_link",
        submitted_by_name=(
            payload.card_holder_name or payload.name_on_card
            if has_authorization_details
            else None
        ),
        submitted_by_email=quotation.customer_email if has_authorization_details else None,
        cardholder_name=payload.name_on_card or payload.card_holder_name,
        card_brand=payload.card_type,
        card_last_four=digits[-4:] if len(digits) >= 4 else None,
        card_expiration=payload.expiration,
        notes=payload.notes,
        access_token_hash=_token_hash(token),
        token_expires_at=now + timedelta(days=30),
        requested_at=now,
        submitted_at=now if has_authorization_details else None,
    )
    db.add(authorization)
    db.flush()
    if has_authorization_details:
        authorization.authorization_reference = f"SAUTH-{authorization.id:06d}"

    relative_url = f"/payment/sales/{token}"
    public_url = f"{settings.PUBLIC_APP_URL.rstrip('/')}{relative_url}"
    add_invoice_transaction(
        db,
        invoice,
        "payment_authorization_submitted" if has_authorization_details else "payment_authorization_requested",
        balance_due,
        "credit_card",
        (
            f"Sales payment authorization {'submitted' if has_authorization_details else 'requested'} "
            f"for the approved invoice balance"
        ),
        current_user,
        "SAUTH",
    )
    history_details = {
        "authorization_id": authorization.id,
        "invoice_id": invoice.id,
        "invoice_number": invoice.invoice_number,
        "amount": str(balance_due),
        "status": authorization.status,
        "channel": authorization.channel,
        "authorization_reference": authorization.authorization_reference,
    }
    _append_history(
        quotation,
        "credit_card_authorization_submitted" if has_authorization_details else "credit_card_authorization_requested",
        current_user,
        history_details,
    )

    if primary_recipient and primary_recipient.user_id:
        create_notifications(
            db,
            user_ids=[primary_recipient.user_id],
            title="Payment authorization requested",
            message=f"Authorize the {invoice.invoice_number} balance of ${balance_due:.2f}.",
            notification_type="billing",
            link_url=relative_url,
            actor_id=current_user.id,
        )
    if primary_recipient and primary_recipient.email:
        background_tasks.add_task(
            send_html_email,
            [primary_recipient.email],
            f"Payment authorization for {invoice.invoice_number}",
            (
                f"<p>Hello {primary_recipient.name},</p>"
                f"<p>Invoice <strong>{invoice.invoice_number}</strong> has an outstanding "
                f"balance of <strong>${balance_due:.2f}</strong>.</p>"
                f"<p><a href=\"{public_url}\">Review invoice and authorize payment</a></p>"
                "<p>For your security, this link expires in 30 days.</p>"
            ),
            (
                f"Review invoice {invoice.invoice_number} and authorize its "
                f"${balance_due:.2f} balance: {public_url}"
            ),
        )

    log_activity(
        db,
        "sales_payment_authorizations",
        authorization.id,
        "REQUEST_SALES_PAYMENT_AUTHORIZATION",
        current_user,
        history_details,
    )
    quotation.updated_at = now
    db.commit()
    db.refresh(authorization)
    return {
        "authorization": _authorization_response(authorization),
        "payment_url": public_url,
        "invoice_number": invoice.invoice_number,
        "amount": balance_due,
    }


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
    if quotation.status == "completed":
        return _quotation_response(quotation)
    if quotation.converted_invoice.status != InvoiceStatus.PAID:
        raise HTTPException(
            status_code=409,
            detail="The sales invoice must be fully paid before the sale can be completed",
        )

    fulfill_sales_invoice_inventory(
        db,
        quotation.converted_invoice,
        current_user,
    )
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
            "status": [
                value_contains_ci(Invoice.status, normalized_value),
                contains_ci(Invoice.refund_status, normalized_value),
            ],
            "amount": [
                value_contains_ci(Invoice.total_amount, search_term),
                value_contains_ci(Invoice.amount_paid, search_term),
                value_contains_ci(Invoice.refunded_amount, search_term),
                value_contains_ci(Invoice.balance_due, search_term),
            ],
            "total": [value_contains_ci(Invoice.total_amount, search_term)],
            "paid": [
                value_contains_ci(Invoice.amount_paid, search_term),
                value_contains_ci(Invoice.refunded_amount, search_term),
            ],
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
    if invoice.status == InvoiceStatus.CANCELLED and previous_status != InvoiceStatus.CANCELLED:
        release_sales_inventory_reservations(
            db,
            invoice,
            "Sales invoice cancelled",
            current_user,
        )
    invoice.updated_at = datetime.utcnow()
    payment_transaction = record_payment_delta(
        db,
        invoice,
        previous_paid,
        invoice.amount_paid,
        current_user,
        invoice.payment_method,
        update_data.get("notes"),
    )
    if payment_transaction:
        authorization = (
            db.query(SalesPaymentAuthorization)
            .filter(
                SalesPaymentAuthorization.invoice_id == invoice.id,
                SalesPaymentAuthorization.status == "submitted",
            )
            .order_by(SalesPaymentAuthorization.submitted_at.desc())
            .with_for_update()
            .first()
        )
        if authorization:
            authorization.status = (
                "processed"
                if invoice.status == InvoiceStatus.PAID
                else "partially_processed"
            )
            authorization.processed_at = datetime.utcnow()
            authorization.updated_at = datetime.utcnow()
            authorization.notes = " | ".join(
                item
                for item in [
                    authorization.notes,
                    f"Payment recorded as {payment_transaction.reference_number}",
                ]
                if item
            )
    record_status_change(db, invoice, previous_status, current_user)
    fulfill_sales_invoice_inventory(db, invoice, current_user)
    log_activity(db, "invoices", invoice.id, "UPDATE_SALES_INVOICE", current_user, update_data)
    db.commit()
    db.refresh(invoice)
    return _invoice_response(invoice)


@router.post("/invoices/{invoice_id}/refunds")
def refund_sales_invoice(
    invoice_id: int,
    payload: SalesInvoiceRefundCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Any:
    """Record a full or partial sales refund without mutating inventory."""
    if current_user.role not in INTERNAL_SALES_ROLES:
        raise HTTPException(status_code=403, detail="Only an Admin or Super Admin can issue a refund")
    if not has_module_permission(current_user, "billing", "edit"):
        raise HTTPException(status_code=403, detail="Billing edit permission is required")
    if payload.amount <= 0:
        raise HTTPException(status_code=400, detail="Refund amount must be greater than zero")

    invoice = (
        db.query(Invoice)
        .options(
            joinedload(Invoice.sales_quotation),
            joinedload(Invoice.facility),
            selectinload(Invoice.transactions).joinedload(InvoiceTransaction.created_by),
        )
        .filter(Invoice.id == invoice_id, Invoice.invoice_type == InvoiceType.SALES)
        .with_for_update(of=Invoice)
        .first()
    )
    if not invoice:
        raise HTTPException(status_code=404, detail="Sales invoice not found")
    if invoice.facility_id is not None:
        require_facility_access(db, current_user, invoice.facility_id)
    require_invoice_approved(invoice)

    refundable = max(_money(invoice.amount_paid) - _money(invoice.refunded_amount), Decimal("0"))
    if payload.amount > refundable:
        raise HTTPException(status_code=400, detail="Refund cannot exceed the remaining paid amount")

    try:
        result = issue_invoice_refund(
            db,
            invoice,
            payload.amount,
            payment_method=payload.payment_method,
            notes=payload.notes,
            user=current_user,
        )
    except SquareRequestError as exc:
        raise HTTPException(status_code=exc.status_code, detail=str(exc))
    if invoice.sales_quotation:
        _append_history(
            invoice.sales_quotation,
            "refund_issued",
            current_user,
            {
                "invoice_id": invoice.id,
                "amount": str(payload.amount),
                "refund_status": invoice.refund_status,
                "method": result["method"],
                "square_refund_id": result["square_refund_id"],
            },
        )
    log_activity(
        db,
        "invoices",
        invoice.id,
        "REFUND_SALES_INVOICE",
        current_user,
        {"amount": str(payload.amount), "refund_status": invoice.refund_status},
    )
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
        SalesQuotation.document_kind == "quotation",
        SalesQuotation.status.notin_(IN_PROGRESS_QUOTATION_STATUSES + COMPLETED_QUOTATION_STATUSES),
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
    payment_method_expression = func.lower(
        func.coalesce(Invoice.payment_method, SalesQuotation.payment_method, "")
    )
    completed_payment_rows = (
        base.filter(SalesQuotation.status.in_(COMPLETED_QUOTATION_STATUSES))
        .outerjoin(Invoice, SalesQuotation.converted_invoice_id == Invoice.id)
        .with_entities(
            payment_method_expression.label("payment_method"),
            func.count(SalesQuotation.id).label("record_count"),
        )
        .group_by(payment_method_expression)
        .all()
    )
    completed_payment_methods = {
        "credit_card": 0,
        "cheque": 0,
        "bank_transfer": 0,
    }
    for payment_method, record_count in completed_payment_rows:
        category = _sales_payment_method_category(payment_method)
        if category:
            completed_payment_methods[category] += int(record_count or 0)
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
        "completed_payment_methods": completed_payment_methods,
    }
