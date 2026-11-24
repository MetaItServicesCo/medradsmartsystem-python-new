"""Bulk invoices in Billing, and the customer's bulk invoice link.

Staff (an Admin or Super Admin with Billing permission) put open invoices of
one or more facilities into a bulk invoice, send it, and see it paid. A Super
Admin can also record a payment on it, or take a card. The customer, through
its link, sees the front page and every invoice in full, and pays it by card,
or reports an ACH, MBMTS ACH or cheque payment for Billing to check. The rules
-- what can go in, what it owes, how payments are recorded -- are in
app.utils.bulk_invoices.
"""
from __future__ import annotations

import html
import re
from datetime import datetime
from decimal import Decimal
from typing import Any, Literal, Optional

from fastapi import APIRouter, BackgroundTasks, Depends, File, Form, HTTPException, Query, Request, UploadFile
from pydantic import BaseModel, Field
from sqlalchemy import or_, select
from sqlalchemy.orm import Session, joinedload, selectinload

from app.core.config import settings
from app.core.deps import get_current_user
from app.db.base import get_db
from app.models.bulk_invoice import BulkInvoice, BulkInvoicePayment, BulkInvoiceStatus
from app.models.facility import Facility
from app.models.inspection import Inspection, InspectionBatch
from app.models.invoice import Invoice, InvoiceStatus
from app.models.rental import Rental
from app.models.sales import SalesQuotation
from app.models.service_request import ServiceRequest
from app.models.user import User, UserRole
from app.utils import bulk_invoices as bulk_rules
from app.utils.bulk_invoices import (
    BULK_NUMBER_PREFIX,
    EMAIL_PATTERN,
    LINK_METHODS,
    MANUAL_OPERATION,
    METHOD_LABELS,
    RECORD_METHODS,
    bulk_balance,
    bulk_busy,
    bulk_by_token,
    bulk_document,
    bulk_total,
    being_updated,
    busy_invoice_ids,
    counted,
    facility_bill_to,
    ineligibility,
    invoice_summary,
    issue_link,
    members,
    money,
    payments_view,
    require_payable,
)
from app.utils.card_fee import card_charge
from app.utils.email import send_html_email
from app.utils.facility_access import get_user_facility_ids
from app.utils.invoice_approval import is_facility_billing_user, is_invoice_approver
from app.utils.numbering import assign_unique_number
from app.utils.payment_idempotency import get_or_create_operation, mark_operation_succeeded, payment_fingerprint, replay_or_raise
from app.utils.permission_deps import require_module_access
from app.utils.permissions import has_module_permission
from app.utils.rate_limit import enforce_rate_limit, public_payment_identity
from app.utils.square_payments import square_public_config

router = APIRouter(dependencies=[Depends(require_module_access("billing"))])
public_router = APIRouter()

MAX_INVOICES = 500


def _invoice_options():
    return (
        joinedload(Invoice.facility),
        joinedload(Invoice.service_request),
        joinedload(Invoice.inspection),
        joinedload(Invoice.inspection_batch),
        joinedload(Invoice.sales_quotation),
        joinedload(Invoice.rental),
        joinedload(Invoice.bulk_invoice),
    )


def _bulk_query(db: Session):
    return db.query(BulkInvoice).options(
        selectinload(BulkInvoice.invoices).options(*_invoice_options()),
        selectinload(BulkInvoice.payments).joinedload(BulkInvoicePayment.created_by),
        joinedload(BulkInvoice.created_by),
    )


def _search_words(search: Optional[str]) -> list[str]:
    """The words searched for; a word of punctuation only is dropped."""
    return [word for word in re.split(r"[\s,]+", (search or "").strip()) if re.search(r"[A-Za-z0-9]", word)][:8]


def _like(word: str) -> str:
    """%word%, with the word's own % and _ matched as they are."""
    return "%" + word.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_") + "%"


def _invoice_matches(word: str):
    """An invoice this word finds: by its number, its facility or customer, or what it bills for
    (the service request, inspection, sales quotation or work order, or rental)."""
    like = _like(word)
    return or_(
        Invoice.invoice_number.ilike(like, escape="\\"),
        Invoice.customer_name.ilike(like, escape="\\"),
        Invoice.facility_id.in_(select(Facility.id).where(Facility.name.ilike(like, escape="\\"))),
        Invoice.service_request_id.in_(
            select(ServiceRequest.id).where(ServiceRequest.request_number.ilike(like, escape="\\"))
        ),
        Invoice.rental_id.in_(select(Rental.id).where(Rental.rental_number.ilike(like, escape="\\"))),
        Invoice.sales_quotation_id.in_(
            select(SalesQuotation.id).where(or_(
                SalesQuotation.quotation_number.ilike(like, escape="\\"),
                SalesQuotation.work_order.ilike(like, escape="\\"),
            ))
        ),
        Invoice.inspection_batch_id.in_(
            select(InspectionBatch.id).where(InspectionBatch.batch_number.ilike(like, escape="\\"))
        ),
        Invoice.inspection_id.in_(
            select(Inspection.id).where(Inspection.inspection_number.ilike(like, escape="\\"))
        ),
    )


def _require_staff(user: User, *, edit: bool = False) -> None:
    if not is_invoice_approver(user):
        raise HTTPException(status_code=403, detail="Only an Admin or Super Admin can manage bulk invoices")
    if not has_module_permission(user, "billing", "edit" if edit else "view"):
        raise HTTPException(status_code=403, detail=f"Billing {'edit' if edit else 'view'} permission is required")


def _require_super_admin(user: User) -> None:
    _require_staff(user, edit=True)
    if user.role != UserRole.SUPERADMIN:
        raise HTTPException(status_code=403, detail="Only a Super Admin can record a payment on a bulk invoice")


def _get_bulk(db: Session, bulk_id: int, *, for_update: bool = False) -> BulkInvoice:
    if for_update:
        # Lock the bulk invoice's own row first, then load what it holds.
        locked = db.query(BulkInvoice.id).filter(BulkInvoice.id == bulk_id).with_for_update().first()
        if not locked:
            raise HTTPException(status_code=404, detail="Bulk invoice not found")
    bulk = _bulk_query(db).filter(BulkInvoice.id == bulk_id).populate_existing().first()
    if not bulk:
        raise HTTPException(status_code=404, detail="Bulk invoice not found")
    return bulk


def _row(bulk: BulkInvoice) -> dict[str, Any]:
    ordered = members(bulk)
    facilities: list[str] = []
    for invoice in ordered:
        name = bulk_rules.facility_name(invoice)
        if name not in facilities:
            facilities.append(name)
    return {
        "id": bulk.id,
        "bulk_number": bulk.bulk_number,
        "status": bulk.status,
        "bill_to_name": bulk.bill_to_name,
        "bill_to_email": bulk.bill_to_email,
        "facilities": facilities,
        "invoice_count": len(ordered),
        "total_amount": f"{bulk_total(bulk):.2f}",
        "amount_paid": f"{money(bulk.amount_paid):.2f}",
        "balance_due": f"{bulk_balance(bulk):.2f}",
        "created_at": bulk.created_at,
        "created_by": bulk.created_by.full_name if bulk.created_by else None,
        "public_link_sent_at": bulk.public_link_sent_at,
        "public_link_email": bulk.public_link_email,
        "paid_at": bulk.paid_at,
        "needs_attention": bool(bulk.settlement_error),
        "being_updated": bulk.status not in (BulkInvoiceStatus.PAID, BulkInvoiceStatus.CANCELLED) and being_updated(bulk),
    }


def _detail(db: Session, bulk: BulkInvoice, user: User) -> dict[str, Any]:
    is_open = bulk.status in bulk_rules.OPEN_STATUSES
    busy = bulk_busy(db, bulk) if is_open else None
    balance = bulk_balance(bulk)
    return {
        **_row(bulk),
        "bill_to_facility_id": bulk.bill_to_facility_id,
        "bill_to_address": bulk.bill_to_address,
        "note": bulk.note,
        "card_fee_amount": f"{money(bulk.card_fee_amount):.2f}",
        "settlement_error": bulk.settlement_error,
        "cancelled_at": bulk.cancelled_at,
        "public_link_expires_at": bulk.public_link_expires_at,
        "busy": busy,
        "invoice_ids": [invoice.id for invoice in members(bulk)],
        "invoices": [invoice_summary(bulk, invoice) for invoice in members(bulk)],
        "payments": payments_view(bulk, staff=True),
        "document": bulk_document(db, bulk),
        "can_edit": is_open and not busy,
        "can_send": is_open and balance > 0 and not being_updated(bulk),
        "can_cancel": is_open and money(bulk.amount_paid) <= 0 and not busy,
        "can_record_payment": user.role == UserRole.SUPERADMIN and is_open and balance > 0 and not busy and not being_updated(bulk),
        "can_settle": bulk.status != BulkInvoiceStatus.CANCELLED and balance <= 0 and (
            bool(bulk.settlement_error) or (bulk.status != BulkInvoiceStatus.PAID and money(bulk.amount_paid) > 0)
        ),
    }


# ---------------------------------------------------------------- listing


@router.get("")
def list_bulk_invoices(
    status: Optional[str] = Query(None, max_length=24),
    search: Optional[str] = Query(None, max_length=120),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Any:
    _require_staff(current_user)
    query = _bulk_query(db)
    if status:
        query = query.filter(BulkInvoice.status == status)
    for word in _search_words(search):
        like = _like(word)
        holding = db.query(Invoice.bulk_invoice_id).filter(Invoice.bulk_invoice_id.isnot(None), _invoice_matches(word))
        query = query.filter(or_(
            BulkInvoice.bulk_number.ilike(like, escape="\\"),
            BulkInvoice.bill_to_name.ilike(like, escape="\\"),
            BulkInvoice.bill_to_email.ilike(like, escape="\\"),
            BulkInvoice.id.in_(holding),
        ))
    bulks = query.order_by(BulkInvoice.created_at.desc(), BulkInvoice.id.desc()).limit(300).all()
    return {"items": [_row(bulk) for bulk in bulks], "total": len(bulks)}


@router.get("/memberships")
def list_memberships(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)) -> Any:
    """Which invoices are in a bulk invoice: for Billing's list to say so.

    Billing staff see all of them; a facility's billing user, their own facilities' invoices.
    """
    query = (
        db.query(Invoice.id, BulkInvoice.id, BulkInvoice.bulk_number, BulkInvoice.status, BulkInvoice.settlement_error)
        .join(BulkInvoice, Invoice.bulk_invoice_id == BulkInvoice.id)
        .filter(BulkInvoice.status != BulkInvoiceStatus.CANCELLED)
    )
    if is_facility_billing_user(current_user):
        if not has_module_permission(current_user, "billing", "view"):
            raise HTTPException(status_code=403, detail="Billing view permission is required")
        query = query.filter(Invoice.facility_id.in_(get_user_facility_ids(db, current_user) or [-1]))
    else:
        _require_staff(current_user)
    rows = query.all()
    return {"items": [
        {
            "invoice_id": invoice_id,
            "bulk_invoice_id": bulk_id,
            "bulk_number": number,
            "status": status,
            # Paid only through it (see app.utils.bulk_invoice_lock).
            "locked": status != BulkInvoiceStatus.PAID or bool(error),
        }
        for invoice_id, bulk_id, number, status, error in rows
    ]}


@router.get("/candidates")
def list_candidates(
    search: Optional[str] = Query(None, max_length=120),
    bulk_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Any:
    """Open invoices, by facility, each saying whether it can go in (and if not, why)."""
    _require_staff(current_user, edit=True)
    open_filter = (
        Invoice.status.in_([InvoiceStatus.PENDING, InvoiceStatus.PARTIALLY_PAID, InvoiceStatus.OVERDUE])
        & (Invoice.balance_due > 0)
    )
    query = db.query(Invoice).options(*_invoice_options()).outerjoin(Facility, Invoice.facility_id == Facility.id)
    query = query.filter(or_(open_filter, Invoice.bulk_invoice_id == bulk_id) if bulk_id else open_filter)
    for word in _search_words(search):
        query = query.filter(_invoice_matches(word))
    invoices = query.order_by(Facility.name, Invoice.issue_date, Invoice.id).limit(1500).all()
    busy = busy_invoice_ids(db, [invoice.id for invoice in invoices])
    groups: list[dict[str, Any]] = []
    by_key: dict[str, dict[str, Any]] = {}
    for invoice in invoices:
        key = f"facility-{invoice.facility_id}" if invoice.facility_id else f"customer-{bulk_rules.facility_name(invoice)}"
        group = by_key.get(key)
        if group is None:
            group = {
                "key": key,
                "facility_id": invoice.facility_id,
                "facility_name": bulk_rules.facility_name(invoice),
                "bill_to": facility_bill_to(invoice.facility) or {
                    "facility_id": None, "name": invoice.customer_name, "email": invoice.customer_email,
                    "address": invoice.customer_address, "suite": None, "city": None, "state": None,
                    "zip_code": None, "country": None,
                },
                "invoices": [],
            }
            by_key[key] = group
            groups.append(group)
        reason = ineligibility(invoice, bulk_id, busy)
        group["invoices"].append({
            **invoice_summary(None, invoice),
            "eligible": reason is None,
            "reason": reason,
            "in_this_bulk": bool(bulk_id and invoice.bulk_invoice_id == bulk_id),
        })
    for group in groups:
        group["eligible_count"] = sum(1 for invoice in group["invoices"] if invoice["eligible"] or invoice["in_this_bulk"])
        group["locked_count"] = len(group["invoices"]) - group["eligible_count"]
    words = _search_words(search)
    if words:
        # A facility the search names that has no open invoice is still shown, saying so: the
        # search found it; there is just nothing of it to put in a bulk invoice.
        shown = {group["facility_id"] for group in groups if group["facility_id"]}
        named = db.query(Facility)
        for word in words:
            named = named.filter(Facility.name.ilike(_like(word), escape="\\"))
        for facility in named.order_by(Facility.name).limit(50).all():
            if facility.id in shown:
                continue
            groups.append({
                "key": f"facility-{facility.id}",
                "facility_id": facility.id,
                "facility_name": facility.name,
                "bill_to": facility_bill_to(facility),
                "invoices": [],
                "eligible_count": 0,
                "locked_count": 0,
                "no_open_invoices": True,
            })
    groups.sort(key=lambda group: (group["eligible_count"] == 0, not group["invoices"], group["facility_name"].lower()))
    return {"groups": groups, "truncated": len(invoices) >= 1500}


# ---------------------------------------------------------------- one bulk invoice


class BulkInvoiceIn(BaseModel):
    invoice_ids: list[int] = Field(min_length=1, max_length=MAX_INVOICES)
    bill_to_facility_id: Optional[int] = None
    bill_to_name: str = Field(min_length=1, max_length=200)
    bill_to_email: Optional[str] = Field(default=None, max_length=320)
    bill_to_address: Optional[str] = Field(default=None, max_length=1000)
    note: Optional[str] = Field(default=None, max_length=2000)


class BulkInvoiceUpdate(BaseModel):
    invoice_ids: Optional[list[int]] = Field(default=None, min_length=1, max_length=MAX_INVOICES)
    bill_to_facility_id: Optional[int] = None
    bill_to_name: Optional[str] = Field(default=None, min_length=1, max_length=200)
    bill_to_email: Optional[str] = Field(default=None, max_length=320)
    bill_to_address: Optional[str] = Field(default=None, max_length=1000)
    note: Optional[str] = Field(default=None, max_length=2000)


def _clean_bill_to(data: dict[str, Any]) -> dict[str, Any]:
    cleaned: dict[str, Any] = {}
    if "bill_to_name" in data:
        name = " ".join((data["bill_to_name"] or "").split())
        if not name:
            raise HTTPException(status_code=422, detail="Enter who the bulk invoice is for")
        cleaned["bill_to_name"] = name
    if "bill_to_email" in data:
        email = (data["bill_to_email"] or "").strip()
        if email and not EMAIL_PATTERN.match(email):
            raise HTTPException(status_code=422, detail="Enter a valid email address for the bulk invoice, or leave it empty")
        cleaned["bill_to_email"] = email or None
    if "bill_to_address" in data:
        cleaned["bill_to_address"] = (data["bill_to_address"] or "").strip() or None
    if "note" in data:
        cleaned["note"] = (data["note"] or "").strip() or None
    if "bill_to_facility_id" in data:
        cleaned["bill_to_facility_id"] = data["bill_to_facility_id"]
    return cleaned


def _lock_invoices(db: Session, invoice_ids: list[int]) -> list[Invoice]:
    ids = sorted(set(invoice_ids))
    db.query(Invoice.id).filter(Invoice.id.in_(ids)).order_by(Invoice.id).with_for_update().all()
    invoices = db.query(Invoice).options(*_invoice_options()).filter(Invoice.id.in_(ids)).populate_existing().all()
    if len(invoices) != len(ids):
        raise HTTPException(status_code=404, detail="One of the invoices was not found; refresh and try again")
    return invoices


def _require_eligible(db: Session, invoices: list[Invoice], bulk_id: Optional[int]) -> None:
    busy = busy_invoice_ids(db, [invoice.id for invoice in invoices])
    problems = [
        f"{invoice.invoice_number}: {reason}"
        for invoice in invoices
        if (reason := ineligibility(invoice, bulk_id, busy)) is not None
    ]
    if problems:
        raise HTTPException(status_code=409, detail="These invoices cannot go in a bulk invoice: " + "; ".join(problems[:8]))


@router.post("", status_code=201)
def create_bulk_invoice(
    payload: BulkInvoiceIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Any:
    _require_staff(current_user, edit=True)
    bill_to = _clean_bill_to(payload.model_dump())
    invoices = _lock_invoices(db, payload.invoice_ids)
    _require_eligible(db, invoices, None)
    bulk = BulkInvoice(
        status=BulkInvoiceStatus.DRAFT,
        issue_date=datetime.utcnow().date(),
        created_by_id=current_user.id,
        **bill_to,
    )
    assign_unique_number(db, bulk, "bulk_number", prefix=BULK_NUMBER_PREFIX)
    for invoice in invoices:
        invoice.bulk_invoice_id = bulk.id
    db.flush()
    bulk.total_amount = bulk_total(bulk)
    db.commit()
    return _detail(db, _get_bulk(db, bulk.id), current_user)


@router.get("/{bulk_id}")
def read_bulk_invoice(bulk_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)) -> Any:
    _require_staff(current_user)
    return _detail(db, _get_bulk(db, bulk_id), current_user)


@router.put("/{bulk_id}")
def update_bulk_invoice(
    bulk_id: int,
    payload: BulkInvoiceUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Any:
    _require_staff(current_user, edit=True)
    bulk = _get_bulk(db, bulk_id, for_update=True)
    if bulk.status not in bulk_rules.OPEN_STATUSES:
        raise HTTPException(status_code=409, detail=f"A {bulk.status.replace('_', ' ')} bulk invoice cannot be changed")
    data = payload.model_dump(exclude_unset=True)
    receipts: list[Any] = []
    if data.get("invoice_ids") is not None:
        blocked = bulk_busy(db, bulk)
        if blocked:
            raise HTTPException(status_code=409, detail=f"{blocked} Its invoices can be changed once that is done.")
        wanted = set(data["invoice_ids"])
        current = {invoice.id for invoice in bulk.invoices or []}
        added = sorted(wanted - current)
        removed = sorted(current - wanted)
        if added or removed:
            touched = _lock_invoices(db, added + removed)
            _require_eligible(db, [invoice for invoice in touched if invoice.id in added], bulk.id)
            # What it will owe: never less than has already been paid on it.
            staying = [invoice for invoice in bulk.invoices or [] if invoice.id not in removed]
            new_total = sum(
                (money(invoice.balance_due) for invoice in staying + [i for i in touched if i.id in added] if counted(invoice)),
                Decimal("0"),
            )
            if new_total < money(bulk.amount_paid):
                raise HTTPException(
                    status_code=409,
                    detail=f"${money(bulk.amount_paid):.2f} has been paid on this bulk invoice; it cannot owe less than that.",
                )
            for invoice in touched:
                invoice.bulk_invoice_id = bulk.id if invoice.id in added else None
            db.flush()
            db.expire(bulk, ["invoices"])
    for field, value in _clean_bill_to({key: value for key, value in data.items() if key != "invoice_ids"}).items():
        setattr(bulk, field, value)
    bulk.updated_at = datetime.utcnow()
    if money(bulk.amount_paid) > 0 and bulk_balance(bulk) <= 0:
        receipts = bulk_rules.settle(db, bulk, current_user)
    elif bulk.status != BulkInvoiceStatus.PAID:
        bulk.total_amount = bulk_total(bulk)
    db.commit()
    bulk_rules.deliver_receipts(db, receipts)
    return _detail(db, _get_bulk(db, bulk.id), current_user)


class SendBulkIn(BaseModel):
    channel: Literal["email", "link"]
    email: Optional[str] = Field(default=None, max_length=320)


@router.post("/{bulk_id}/send")
def send_bulk_invoice(
    bulk_id: int,
    payload: SendBulkIn,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Any:
    _require_staff(current_user, edit=True)
    bulk = _get_bulk(db, bulk_id, for_update=True)
    if bulk.status not in bulk_rules.OPEN_STATUSES:
        raise HTTPException(status_code=409, detail=f"A {bulk.status.replace('_', ' ')} bulk invoice cannot be sent")
    if being_updated(bulk):
        raise HTTPException(status_code=409, detail="An invoice in it waits for billing approval; approve it before sending")
    balance = bulk_balance(bulk)
    if balance <= 0:
        raise HTTPException(status_code=409, detail="This bulk invoice has no balance to pay")
    recipient = None
    if payload.channel == "email":
        recipient = (payload.email or bulk.bill_to_email or "").strip()
        if not EMAIL_PATTERN.match(recipient):
            raise HTTPException(status_code=400, detail="Enter a valid email address to send the bulk invoice to")
    link = issue_link(bulk)
    if recipient:
        bulk.public_link_email = recipient
    if bulk.status == BulkInvoiceStatus.DRAFT:
        bulk.status = BulkInvoiceStatus.SENT
    bulk.updated_at = datetime.utcnow()
    expires = bulk.public_link_expires_at.strftime("%B %d, %Y")
    count = len([invoice for invoice in bulk.invoices or [] if counted(invoice)])
    db.commit()
    if recipient:
        name = bulk.bill_to_name or "there"
        number = bulk.bulk_number
        background_tasks.add_task(
            send_html_email,
            [recipient],
            f"Invoice {number}",
            (
                f"<p>Hello {html.escape(name)},</p>"
                f"<p>Invoice <strong>{html.escape(number)}</strong> brings together {count} invoice{'s' if count != 1 else ''} "
                f"for a balance of <strong>${balance:,.2f}</strong>. You can view each invoice and pay them all at once.</p>"
                f"<p><a href=\"{html.escape(link)}\">View and pay invoice</a></p>"
                f"<p>This secure link expires on {expires}.</p>"
            ),
            (
                f"Hello {name},\n\nInvoice {number} brings together {count} invoice{'s' if count != 1 else ''} "
                f"for a balance of ${balance:,.2f}. View each invoice and pay them all at once:\n{link}\n\n"
                f"This link expires on {expires}."
            ),
        )
    return {
        "share_url": link,
        "channel": payload.channel,
        "email": recipient,
        "expires_at": bulk.public_link_expires_at,
        **_detail(db, _get_bulk(db, bulk.id), current_user),
    }


@router.post("/{bulk_id}/cancel")
def cancel_bulk_invoice(bulk_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)) -> Any:
    """Its invoices go back to being paid on their own; its link stops working."""
    _require_staff(current_user, edit=True)
    bulk = _get_bulk(db, bulk_id, for_update=True)
    if bulk.status == BulkInvoiceStatus.CANCELLED:
        return _detail(db, bulk, current_user)
    if bulk.status not in bulk_rules.OPEN_STATUSES:
        raise HTTPException(status_code=409, detail="A paid bulk invoice cannot be cancelled")
    if money(bulk.amount_paid) > 0:
        raise HTTPException(status_code=409, detail="A payment has been recorded on this bulk invoice; it cannot be cancelled")
    blocked = bulk_busy(db, bulk)
    if blocked:
        raise HTTPException(status_code=409, detail=blocked)
    ids = [invoice.id for invoice in bulk.invoices or []]
    if ids:
        _lock_invoices(db, ids)
        db.query(Invoice).filter(Invoice.id.in_(ids)).update({Invoice.bulk_invoice_id: None}, synchronize_session=False)
    bulk.status = BulkInvoiceStatus.CANCELLED
    bulk.cancelled_at = datetime.utcnow()
    bulk.public_link_hash = None
    bulk.public_link_expires_at = None
    bulk.total_amount = Decimal("0")
    db.commit()
    return _detail(db, _get_bulk(db, bulk.id), current_user)


# ---------------------------------------------------------------- paid in Billing


class RecordBulkPaymentIn(BaseModel):
    amount: Decimal = Field(gt=0)
    payment_method: str = Field(min_length=2, max_length=40)
    reference: Optional[str] = Field(default=None, max_length=120)
    notes: Optional[str] = Field(default=None, max_length=1000)
    idempotency_key: str = Field(min_length=16, max_length=64)


@router.post("/{bulk_id}/payments")
def record_bulk_payment(
    bulk_id: int,
    payload: RecordBulkPaymentIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Any:
    """A Super Admin records a payment received: all of the balance, or part of it."""
    _require_super_admin(current_user)
    method = payload.payment_method.strip().lower().replace(" ", "_")
    method = "cheque" if method == "check" else method
    if method not in RECORD_METHODS:
        raise HTTPException(status_code=422, detail="Choose how the bulk invoice was paid")
    bulk = _get_bulk(db, bulk_id, for_update=True)
    amount = money(payload.amount)
    operation, replay = get_or_create_operation(
        db,
        idempotency_key=payload.idempotency_key,
        fingerprint=payment_fingerprint(
            MANUAL_OPERATION,
            amount=amount,
            attributes={"bulk_invoice_id": bulk.id, "payment_method": method, "actor_id": current_user.id},
        ),
        operation_type=MANUAL_OPERATION,
        amount=amount,
        created_by_id=current_user.id,
    )
    if replay:
        replay_or_raise(operation)
        return _detail(db, _get_bulk(db, bulk.id), current_user)
    require_payable(db, bulk, amount=amount)
    actor = current_user.full_name or current_user.username
    reference = (payload.reference or "").strip() or None
    payment, receipts = bulk_rules.record_payment(
        db,
        bulk,
        amount=amount,
        method=method,
        user=current_user,
        payer_name=bulk.bill_to_name,
        reference=reference,
        notes=" · ".join(part for part in (f"Recorded by Super Admin {actor}", (payload.notes or "").strip()) if part),
    )
    mark_operation_succeeded(operation, provider_reference=None, response_data={"bulk_invoice_id": bulk.id, "payment_id": payment.id})
    db.commit()
    bulk_rules.deliver_receipts(db, receipts)
    return _detail(db, _get_bulk(db, bulk.id), current_user)


@router.get("/{bulk_id}/card-payment")
def read_bulk_card_payment(bulk_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)) -> Any:
    """What a card payment of the bulk invoice charges, and the secure card form's settings."""
    _require_super_admin(current_user)
    bulk = _get_bulk(db, bulk_id)
    balance = require_payable(db, bulk)
    square = square_public_config()
    return {
        "bulk_invoice_id": bulk.id,
        "invoice_number": bulk.bulk_number,
        "balance_due": f"{balance:.2f}",
        **card_charge(balance).as_dict(),
        "payer_name": current_user.full_name or current_user.username,
        "payer_email": current_user.email,
        "square_payment": square,
        "can_pay": balance > 0 and bool(square.get("enabled")),
    }


class BulkCardPaymentIn(BaseModel):
    source_id: str = Field(min_length=8, max_length=500)
    idempotency_key: str = Field(min_length=16, max_length=64)
    charge_amount: Decimal


@router.post("/{bulk_id}/square-payment")
def pay_bulk_by_card(
    bulk_id: int,
    payload: BulkCardPaymentIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Any:
    _require_super_admin(current_user)
    enforce_rate_limit(bucket="billing-bulk-card-payment", identity=f"user:{current_user.id}:bulk:{bulk_id}", limit=8, window_seconds=600)
    bulk = _get_bulk(db, bulk_id, for_update=True)
    user_id = current_user.id
    bulk = bulk_rules.take_card_payment(
        db,
        bulk,
        source_id=payload.source_id,
        idempotency_key=payload.idempotency_key,
        payer_name=(current_user.full_name or current_user.username or "Super Admin"),
        charge_amount=payload.charge_amount,
        actor=current_user,
    )
    return _detail(db, _get_bulk(db, bulk.id), db.get(User, user_id))


@router.post("/{bulk_id}/settle")
def settle_bulk_invoice(bulk_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)) -> Any:
    """Mark its invoices paid again, when that could not be done as it was paid in full."""
    _require_staff(current_user, edit=True)
    bulk = _get_bulk(db, bulk_id, for_update=True)
    if bulk.status == BulkInvoiceStatus.CANCELLED:
        raise HTTPException(status_code=409, detail="This bulk invoice has been cancelled")
    if bulk_balance(bulk) > 0:
        raise HTTPException(status_code=409, detail="This bulk invoice is not paid in full yet")
    if bulk.status == BulkInvoiceStatus.PAID and not bulk.settlement_error:
        return _detail(db, bulk, current_user)
    receipts = bulk_rules.settle(db, bulk, current_user)
    error = bulk.settlement_error
    db.commit()
    bulk_rules.deliver_receipts(db, receipts)
    if error:
        raise HTTPException(status_code=409, detail=f"Its invoices could not be marked paid: {error}")
    return _detail(db, _get_bulk(db, bulk.id), current_user)


# ---------------------------------------------------------------- through the link


def _public_response(db: Session, bulk: BulkInvoice) -> dict[str, Any]:
    square = square_public_config()
    if bulk.status != BulkInvoiceStatus.PAID and being_updated(bulk):
        # One of its invoices is being changed by staff: nothing shown or payable until approved again.
        return {
            "state": "under_review",
            "invoice_number": bulk.bulk_number,
            "is_bulk": True,
            "document": None,
            "can_pay": False,
            "square_payment": None,
            "can_report_payment": False,
            "other_methods": [],
        }
    balance = bulk_balance(bulk)
    busy = bulk_busy(db, bulk) if balance > 0 else None
    return {
        "state": "paid" if balance <= 0 else "payable",
        "invoice_number": bulk.bulk_number,
        "is_bulk": True,
        "balance_due": f"{balance:.2f}",
        "payer_name": bulk.bill_to_name,
        "payer_email": bulk.public_link_email or bulk.bill_to_email,
        "document": bulk_document(db, bulk),
        "pending_reports": 1 if busy == bulk_rules.PAYMENT_IN_REVIEW else 0,
        "can_pay": balance > 0 and bool(square.get("enabled")) and not busy,
        "square_payment": square,
        "card_fee_amount": f"{money(bulk.card_fee_amount):.2f}",
        **card_charge(balance).as_dict(),
        "other_methods": [{"value": method, "label": METHOD_LABELS[method]} for method in LINK_METHODS],
        "can_report_payment": balance > 0 and not busy,
    }


def _public_bulk(db: Session, token: str, *, for_update: bool = False) -> BulkInvoice:
    bulk = bulk_by_token(db, token, for_update=for_update)
    return _get_bulk(db, bulk.id)


@public_router.get("/public/bulk-invoices/{token}")
def read_public_bulk_invoice(token: str, db: Session = Depends(get_db)) -> Any:
    return _public_response(db, _public_bulk(db, token))


class PublicBulkCardPaymentIn(BaseModel):
    source_id: str = Field(min_length=8, max_length=500)
    idempotency_key: str = Field(min_length=16, max_length=45)
    payer_name: str = Field(min_length=2, max_length=200)
    charge_amount: Optional[Decimal] = None


@public_router.post("/public/bulk-invoices/{token}/square-payment")
def pay_public_bulk_invoice(
    token: str,
    payload: PublicBulkCardPaymentIn,
    request: Request,
    db: Session = Depends(get_db),
) -> Any:
    enforce_rate_limit(
        bucket="public-bulk-card-payment",
        identity=public_payment_identity(request, token),
        limit=8,
        window_seconds=600,
    )
    bulk = _public_bulk(db, token, for_update=True)
    bulk = bulk_rules.take_card_payment(
        db,
        bulk,
        source_id=payload.source_id,
        idempotency_key=payload.idempotency_key,
        payer_name=payload.payer_name,
        charge_amount=payload.charge_amount,
        actor=None,
    )
    return _public_response(db, _get_bulk(db, bulk.id))


@public_router.post("/public/bulk-invoices/{token}/payment-proof")
async def report_public_bulk_payment(
    token: str,
    request: Request,
    payment_method: str = Form(...),
    amount: str = Form(...),
    payer_name: str = Form(...),
    payer_email: Optional[str] = Form(None),
    reference_number: Optional[str] = Form(None),
    notes: Optional[str] = Form(None),
    proof_file: Optional[UploadFile] = File(None),
    db: Session = Depends(get_db),
) -> Any:
    """An ACH, MBMTS ACH or cheque payment, for Billing to check before it counts."""
    enforce_rate_limit(
        bucket="public-bulk-payment-proof",
        identity=public_payment_identity(request, token),
        limit=10,
        window_seconds=600,
    )
    return await bulk_rules.report_link_payment(
        db,
        load_bulk=lambda: _public_bulk(db, token, for_update=True),
        respond=lambda bulk: _public_response(db, _get_bulk(db, bulk.id)),
        payment_method=payment_method,
        amount=amount,
        payer_name=payer_name,
        payer_email=payer_email,
        reference=reference_number,
        notes=notes,
        proof_file=proof_file,
    )
