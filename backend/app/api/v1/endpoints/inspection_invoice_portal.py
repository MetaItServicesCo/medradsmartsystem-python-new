"""Inspection invoices: sending them, and paying them through a link.

The same as a service invoice. Once it is approved for billing, an
administrator with Billing edit permission emails it to one of the facility's
users (or to an address, when the facility has none), or copies its link to
send any other way. Whoever holds the link can view that one invoice and pay
its balance by card, or report an ACH, MBMTS ACH or cheque payment for Billing
to check, and nothing else. When its approval is withdrawn, the link shows
nothing and takes nothing until it is approved again.

A link is its own: made from the invoice and a stored nonce with a different
key from a service invoice's, and found by its hash only.
"""
from __future__ import annotations

import base64
import hashlib
import hmac
import html
import secrets
from datetime import datetime
from decimal import Decimal
from typing import Any, Literal, Optional

from fastapi import APIRouter, BackgroundTasks, Depends, File, Form, HTTPException, Request, UploadFile
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session, object_session

from app.api.v1.endpoints.inspections import inspection_invoice_detail
from app.api.v1.endpoints.service_invoice_portal import (
    EMAIL_PATTERN,
    LINK_LIFETIME,
    PublicSquarePaymentIn,
    _facility_users,
    _invoice_options,
    _pending_reports,
    _take_square_payment,
)
from app.core.config import settings
from app.core.deps import get_current_user
from app.db.base import get_db
from app.models.invoice import Invoice, InvoiceStatus, InvoiceType
from app.models.user import User
from app.utils.card_fee import card_charge
from app.utils.email import send_html_email
from app.utils.facility_access import require_facility_access
from app.utils.invoice_approval import BILLING_APPROVAL_APPROVED
from app.utils.invoice_link_payments import link_payment_options, report_link_payment
from app.utils.logging import log_activity
from app.utils.notifications import create_notifications
from app.utils.permissions import has_module_permission
from app.utils.rate_limit import enforce_rate_limit, public_payment_identity
from app.utils.service_access import is_internal_service_user
from app.utils.square_payments import square_public_config

router = APIRouter()

# What the link page needs to show the invoice as Billing does - and nothing
# internal: no ledger, no notes, no reviewer, no inspector.
PUBLIC_DOCUMENT_FIELDS = (
    "invoice_number", "invoice_type", "customer_name", "customer_email", "customer_phone", "customer_address",
    "facility_name", "subtotal", "tax_amount", "discount_amount", "total_amount", "amount_paid", "balance_due",
    "status", "issue_date", "due_date", "created_at", "payment_method", "card_fee_amount",
    "labels", "summary_rows", "line_items", "travel_charges", "service_charges", "travel_cost",
    "inspection_id", "inspection_batch_id", "inspection_number", "inspection_batch_number",
    "batch_asset_count", "batch_items", "inventory_part_name",
)


def _money(value: Any) -> Decimal:
    return Decimal(str(value if value not in (None, "") else 0))


def _token_hash(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def _link_token(invoice_id: int, nonce: str) -> str:
    digest = hmac.new(
        settings.SECRET_KEY.encode("utf-8"),
        f"inspection-invoice-link:{invoice_id}:{nonce}".encode("utf-8"),
        hashlib.sha256,
    ).digest()
    return base64.urlsafe_b64encode(digest).decode("ascii").rstrip("=")


def _link_url(token: str) -> str:
    return f"{settings.PUBLIC_APP_URL.rstrip('/')}/invoice/inspection/{token}"


def _is_approved(invoice: Invoice) -> bool:
    return invoice.billing_approval_status == BILLING_APPROVAL_APPROVED


def _issue_link(invoice: Invoice) -> str:
    """The invoice's link: the one already sent while it is still valid, else a new one."""
    now = datetime.utcnow()
    if not invoice.public_link_nonce or not invoice.public_link_expires_at or invoice.public_link_expires_at <= now:
        invoice.public_link_nonce = secrets.token_urlsafe(32)
        invoice.public_link_hash = _token_hash(_link_token(invoice.id, invoice.public_link_nonce))
    invoice.public_link_expires_at = now + LINK_LIFETIME
    invoice.public_link_sent_at = now
    return _link_url(_link_token(invoice.id, invoice.public_link_nonce))


def _staff_invoice(db: Session, invoice_id: int, user: User, for_update: bool = False) -> Invoice:
    if not is_internal_service_user(user) or not has_module_permission(user, "billing", "edit"):
        raise HTTPException(status_code=403, detail="Only an administrator with Billing edit permission can send invoices")
    query = db.query(Invoice).filter(Invoice.id == invoice_id, Invoice.invoice_type == InvoiceType.INSPECTION)
    if for_update:
        query = query.with_for_update(of=Invoice)
    invoice = query.first()
    if not invoice:
        raise HTTPException(status_code=404, detail="Inspection invoice not found")
    if invoice.facility_id is not None:
        require_facility_access(db, user, invoice.facility_id)
    return invoice


# ---------------------------------------------------------------- signed in


@router.get("/inspection-invoices/{invoice_id}/share-options")
def read_inspection_share_options(
    invoice_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Any:
    """Who an emailed invoice would go to: the facility's users to confirm, or
    none, in which case the sender is asked for an address."""
    invoice = _staff_invoice(db, invoice_id, current_user)
    return {
        "approved": _is_approved(invoice),
        "recipients": [
            {"user_id": user.id, "name": user.full_name, "email": user.email}
            for user in _facility_users(db, invoice.facility_id)
        ],
        "suggested_email": invoice.customer_email,
        "link_sent_at": invoice.public_link_sent_at,
    }


class ShareInvoiceIn(BaseModel):
    channel: Literal["email", "link"]
    recipient_user_id: Optional[int] = None
    email: Optional[str] = Field(default=None, max_length=320)


@router.post("/inspection-invoices/{invoice_id}/share")
def share_inspection_invoice(
    invoice_id: int,
    payload: ShareInvoiceIn,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Any:
    invoice = _staff_invoice(db, invoice_id, current_user, for_update=True)
    if not _is_approved(invoice):
        raise HTTPException(status_code=409, detail="Approve this invoice for billing before sending it")
    if invoice.status == InvoiceStatus.CANCELLED:
        raise HTTPException(status_code=409, detail="A cancelled invoice cannot be sent")
    if _money(invoice.balance_due) <= 0:
        raise HTTPException(status_code=409, detail="This invoice has no balance to pay")

    recipient_user: Optional[User] = None
    recipient_email: Optional[str] = None
    if payload.channel == "email":
        users = _facility_users(db, invoice.facility_id)
        if users:
            # The facility has users: it goes to one of them, as confirmed.
            recipient_user = next((user for user in users if user.id == payload.recipient_user_id), None)
            if not recipient_user:
                raise HTTPException(status_code=400, detail="Choose one of this facility's users to send the invoice to")
            recipient_email = recipient_user.email
        else:
            recipient_email = (payload.email or "").strip()
            if not EMAIL_PATTERN.match(recipient_email):
                raise HTTPException(status_code=400, detail="Enter a valid email address to send the invoice to")

    link = _issue_link(invoice)
    if recipient_email:
        invoice.public_link_email = recipient_email
    log_activity(db, "invoices", invoice.id, "SHARED", current_user, {
        "invoice_number": invoice.invoice_number,
        "channel": payload.channel,
        "email": recipient_email,
    })
    if recipient_user:
        create_notifications(
            db,
            user_ids=[recipient_user.id],
            title="Inspection invoice received",
            message=f"Invoice {invoice.invoice_number} is ready to view and pay.",
            notification_type="billing",
            # Signed in, they open it in Billing; the secret link is not stored here.
            link_url=f"/billing?search={invoice.invoice_number}",
            actor_id=current_user.id,
        )
    expires = invoice.public_link_expires_at.strftime("%B %d, %Y")
    db.commit()
    if recipient_email:
        name = recipient_user.full_name if recipient_user else invoice.customer_name or "there"
        number = invoice.invoice_number
        background_tasks.add_task(
            send_html_email,
            [recipient_email],
            f"Invoice {number}",
            (
                f"<p>Hello {html.escape(name)},</p><p>Inspection invoice <strong>{html.escape(number)}</strong> is ready to view and pay.</p>"
                f"<p><a href=\"{html.escape(link)}\">View and pay invoice</a></p>"
                f"<p>You can pay by card, ACH, MBMTS ACH or cheque.</p>"
                f"<p>This secure link expires on {expires}.</p>"
            ),
            (
                f"Hello {name},\n\n"
                f"Inspection invoice {number} is ready to view and pay.\n{link}\n\n"
                f"You can pay by card, ACH, MBMTS ACH or cheque.\n\n"
                f"This link expires on {expires}."
            ),
        )
    return {"share_url": link, "channel": payload.channel, "email": recipient_email, "expires_at": invoice.public_link_expires_at}


# ---------------------------------------------------------------- through the link


def _invoice_by_token(db: Session, token: str, for_update: bool = False) -> Invoice:
    query = db.query(Invoice).options(*_invoice_options()).filter(
        Invoice.public_link_hash == _token_hash(token),
        Invoice.invoice_type == InvoiceType.INSPECTION,
    )
    if for_update:
        query = query.with_for_update(of=Invoice)
    invoice = query.first()
    if not invoice:
        raise HTTPException(status_code=404, detail="This invoice link is not valid")
    if not invoice.public_link_expires_at or invoice.public_link_expires_at <= datetime.utcnow():
        raise HTTPException(status_code=410, detail="This invoice link has expired. Please ask for a new one.")
    if invoice.status == InvoiceStatus.CANCELLED:
        raise HTTPException(status_code=410, detail="This invoice has been cancelled")
    return invoice


def _document(db: Session, invoice: Invoice) -> Optional[dict[str, Any]]:
    detail = inspection_invoice_detail(db, invoice.id)
    if detail is None:
        return None
    return {field: detail.get(field) for field in PUBLIC_DOCUMENT_FIELDS}


def _public_response(invoice: Invoice) -> dict[str, Any]:
    db = object_session(invoice)
    square = square_public_config()
    if not _is_approved(invoice):
        # Being changed by staff: nothing shown or payable until it is approved again.
        return {
            "state": "under_review",
            "invoice_number": invoice.invoice_number,
            "document": None,
            "can_pay": False,
            "square_payment": None,
            "can_report_payment": False,
            "other_methods": [],
        }
    balance = _money(invoice.balance_due)
    pending = _pending_reports(db, invoice)
    return {
        "state": "paid" if balance <= 0 else "payable",
        "invoice_number": invoice.invoice_number,
        "balance_due": f"{balance:.2f}",
        "payer_name": (invoice.facility.contact_person if invoice.facility else None) or invoice.customer_name,
        "payer_email": invoice.public_link_email or invoice.customer_email,
        "document": _document(db, invoice),
        "pending_reports": pending,
        "can_pay": balance > 0 and bool(square.get("enabled")) and not pending,
        "square_payment": square,
        "card_fee_amount": f"{_money(invoice.card_fee_amount):.2f}",
        **card_charge(balance).as_dict(),
        **link_payment_options(db, invoice),
    }


@router.get("/public/inspection-invoices/{token}")
def read_public_inspection_invoice(token: str, db: Session = Depends(get_db)) -> Any:
    return _public_response(_invoice_by_token(db, token))


@router.post("/public/inspection-invoices/{token}/square-payment")
def pay_public_inspection_invoice(
    token: str,
    payload: PublicSquarePaymentIn,
    request: Request,
    db: Session = Depends(get_db),
) -> Any:
    enforce_rate_limit(
        bucket="public-inspection-card-payment",
        identity=public_payment_identity(request, token),
        limit=8,
        window_seconds=600,
    )
    invoice = _invoice_by_token(db, token, for_update=True)
    # The same card path as a service invoice's link: exactly once, the exact balance.
    return _take_square_payment(db, invoice, payload, _public_response)


@router.post("/public/inspection-invoices/{token}/payment-proof")
async def report_public_inspection_invoice_payment(
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
        bucket="public-invoice-payment-proof",
        identity=public_payment_identity(request, token),
        limit=10,
        window_seconds=600,
    )
    return await report_link_payment(
        db,
        load_invoice=lambda: _invoice_by_token(db, token, for_update=True),
        respond=_public_response,
        payment_method=payment_method,
        amount=amount,
        payer_name=payer_name,
        payer_email=payer_email,
        reference=reference_number,
        notes=notes,
        proof_file=proof_file,
    )
