"""Service invoices: the document, sending it, and paying it through a link.

The same options as sales and rental - email it, or copy the link to send any
other way - available only once the invoice is approved for billing. Whoever
holds the link can view the invoice and pay the balance by Square, and nothing
else. An invoice whose approval is withdrawn stops being shown or payable until
it is approved again.

The link token is derived from a stored nonce, so the same link can be shown
again and printed as a QR code; only its hash is searchable. Sending again keeps
the link the customer already has, unless it has expired.
"""
from __future__ import annotations

import base64
import hashlib
import hmac
import html
import re
import secrets
from datetime import datetime, timedelta
from typing import Any, Callable, Literal, Optional

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, Request
from pydantic import BaseModel, Field
from sqlalchemy import or_
from sqlalchemy.orm import Session, joinedload, object_session, selectinload
from sqlalchemy.orm.attributes import flag_modified

from app.api.v1.endpoints.service_requests import (
    _is_internal_service_user,
    _money,
    _require_service_facility_access,
    _scope_service_query,
    _service_invoice_line_items,
    _service_invoice_paid_quotations,
)
from app.core.config import settings
from app.core.deps import get_current_user
from app.db.base import get_db
from app.models.equipment import Equipment
from app.models.invoice import Invoice, InvoiceStatus, InvoiceTransaction, InvoiceType, PaymentProof
from app.models.payment_operation import PaymentOperation
from app.models.service_request import ServiceRequest, ServiceRequestQuotation
from app.models.user import User
from app.models.user_facility import UserFacility
from app.utils.email import send_html_email
from app.utils.facility_access import FACILITY_SCOPED_ROLES
from app.utils.invoice_approval import (
    BILLING_APPROVAL_APPROVED,
    is_facility_billing_user,
    scope_invoice_approval_visibility,
)
from app.utils.invoice_ledger import record_payment_delta, record_status_change
from app.utils.notifications import create_notifications, notify_admins
from app.utils.payment_idempotency import (
    get_or_create_operation,
    mark_operation_failed,
    mark_operation_succeeded,
    payment_fingerprint,
    replay_or_raise,
)
from app.utils.payment_proofs import SERVICE_PAYMENT_IN_REVIEW, service_payment_in_review
from app.utils.payment_receipts import deliver_payment_receipt, queue_payment_receipt
from app.utils.permissions import has_module_permission
from app.utils.rate_limit import enforce_rate_limit, public_payment_identity
from app.utils.service_invoice_document import build_service_invoice_document, service_work_entries
from app.utils.square_payments import (
    SquareConfigurationError,
    SquareRequestError,
    create_square_payment,
    minor_units_to_amount,
    square_public_config,
)

router = APIRouter()

LINK_LIFETIME = timedelta(days=90)
# One address only: separators and brackets could add recipients to the message.
_ADDRESS_PART = r'[^@\s,;:<>()\[\]"\\]+'
EMAIL_PATTERN = re.compile(rf"^{_ADDRESS_PART}@{_ADDRESS_PART}\.{_ADDRESS_PART}$")


def _invoice_options():
    return (
        joinedload(Invoice.facility),
        joinedload(Invoice.service_request).joinedload(ServiceRequest.equipment).joinedload(Equipment.tier),
        joinedload(Invoice.service_request).joinedload(ServiceRequest.assigned_technician),
        joinedload(Invoice.service_request)
        .selectinload(ServiceRequest.quotations)
        .selectinload(ServiceRequestQuotation.line_items),
        joinedload(Invoice.service_request)
        .selectinload(ServiceRequest.quotations)
        .selectinload(ServiceRequestQuotation.payments),
    )


def _token_hash(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def _link_token(invoice_id: int, nonce: str) -> str:
    digest = hmac.new(
        settings.SECRET_KEY.encode("utf-8"),
        f"service-invoice-link:{invoice_id}:{nonce}".encode("utf-8"),
        hashlib.sha256,
    ).digest()
    return base64.urlsafe_b64encode(digest).decode("ascii").rstrip("=")


def _link_url(token: str) -> str:
    return f"{settings.PUBLIC_APP_URL.rstrip('/')}/invoice/service/{token}"


def _is_approved(invoice: Invoice) -> bool:
    return invoice.billing_approval_status == BILLING_APPROVAL_APPROVED


def _issue_link(invoice: Invoice) -> str:
    now = datetime.utcnow()
    if not invoice.public_link_nonce or not invoice.public_link_expires_at or invoice.public_link_expires_at <= now:
        invoice.public_link_nonce = secrets.token_urlsafe(32)
        invoice.public_link_hash = _token_hash(_link_token(invoice.id, invoice.public_link_nonce))
    invoice.public_link_expires_at = now + LINK_LIFETIME
    invoice.public_link_sent_at = now
    return _link_url(_link_token(invoice.id, invoice.public_link_nonce))


def _document(invoice: Invoice) -> dict[str, Any]:
    document = build_service_invoice_document(invoice, _service_invoice_line_items(invoice))
    # Shown for the record, as on the standard invoice; never part of its total.
    document["paid_quotations"] = [
        {
            "quotation_number": quotation["quotation_number"],
            "description": quotation["description"],
            "paid_amount": f"{float(quotation['paid_amount'] or 0):.2f}",
            "paid_at": quotation["paid_at"],
        }
        for quotation in _service_invoice_paid_quotations(invoice)
    ]
    return document


def _facility_users(db: Session, facility_id: Optional[int]) -> list[User]:
    if not facility_id:
        return []
    assigned = db.query(UserFacility.user_id).filter(UserFacility.facility_id == facility_id)
    return (
        db.query(User)
        .filter(
            or_(User.facility_id == facility_id, User.id.in_(assigned)),
            User.role.in_(FACILITY_SCOPED_ROLES),
            User.is_active.is_(True),
        )
        .order_by(User.full_name)
        .all()
    )


def _staff_invoice(db: Session, invoice_id: int, user: User, for_update: bool = False) -> Invoice:
    if not _is_internal_service_user(user) or not has_module_permission(user, "billing", "edit"):
        raise HTTPException(status_code=403, detail="Only an administrator with Billing edit permission can send invoices")
    query = db.query(Invoice).options(*_invoice_options()).filter(
        Invoice.id == invoice_id, Invoice.invoice_type == InvoiceType.SERVICE,
    )
    if for_update:
        query = query.with_for_update(of=Invoice)
    invoice = query.first()
    if not invoice:
        raise HTTPException(status_code=404, detail="Service invoice not found")
    if invoice.facility_id is not None:
        _require_service_facility_access(db, user, invoice.facility_id)
    return invoice


# ---------------------------------------------------------------- signed in


@router.get("/service-invoices/{invoice_id}/document")
def read_service_invoice_document(
    invoice_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Any:
    if not has_module_permission(current_user, "billing", "view"):
        raise HTTPException(status_code=403, detail="Billing view permission is required")
    query = _scope_service_query(db.query(Invoice), Invoice.facility_id, db, current_user)
    query = scope_invoice_approval_visibility(query, current_user)
    invoice = query.options(*_invoice_options()).filter(
        Invoice.id == invoice_id, Invoice.invoice_type == InvoiceType.SERVICE,
    ).first()
    if not invoice:
        raise HTTPException(status_code=404, detail="Service invoice not found")
    return _document(invoice)


@router.get("/service-requests/{request_id}/invoice-work-entries")
def read_invoice_work_entries(
    request_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Any:
    """The rows the invoice will show, for the administrator to word before generating it."""
    if not _is_internal_service_user(current_user) or not has_module_permission(current_user, "billing", "edit"):
        raise HTTPException(status_code=403, detail="Billing edit permission is required")
    sr = db.query(ServiceRequest).options(joinedload(ServiceRequest.assigned_technician)).filter(
        ServiceRequest.id == request_id,
    ).first()
    if not sr:
        raise HTTPException(status_code=404, detail="Service request not found")
    _require_service_facility_access(db, current_user, sr.facility_id)
    return {"items": service_work_entries(sr)}


@router.get("/service-invoices/{invoice_id}/share-options")
def read_share_options(
    invoice_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Any:
    """Who an emailed invoice would go to: the facility's users to confirm, or
    none, in which case the sender is asked for an address."""
    invoice = _staff_invoice(db, invoice_id, current_user)
    users = _facility_users(db, invoice.facility_id)
    requester_id = invoice.service_request.requester_id if invoice.service_request else None
    users.sort(key=lambda user: user.id != requester_id)
    return {
        "approved": _is_approved(invoice),
        "recipients": [{"user_id": user.id, "name": user.full_name, "email": user.email} for user in users],
        "suggested_email": invoice.customer_email,
        "link_sent_at": invoice.public_link_sent_at,
    }


class ShareInvoiceIn(BaseModel):
    channel: Literal["email", "link"]
    recipient_user_id: Optional[int] = None
    email: Optional[str] = Field(default=None, max_length=320)


@router.post("/service-invoices/{invoice_id}/share")
def share_service_invoice(
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
    sr = invoice.service_request
    if sr:
        history = list(sr.history or [])
        history.append({
            "timestamp": datetime.utcnow().isoformat(),
            "action": "service_invoice_shared",
            "user_id": current_user.id,
            "user": current_user.full_name or current_user.username,
            "changes": {
                "invoice_number": invoice.invoice_number,
                "channel": payload.channel,
                "email": recipient_email,
            },
        })
        sr.history = history
        flag_modified(sr, "history")
    if recipient_user:
        create_notifications(
            db,
            user_ids=[recipient_user.id],
            title="Service invoice received",
            message=f"Invoice {invoice.invoice_number} is ready to view and pay.",
            notification_type="billing",
            # Signed in, they open it in Billing; the secret link is not stored here.
            link_url=f"/billing?search={invoice.invoice_number}",
            actor_id=current_user.id,
        )
    expires = invoice.public_link_expires_at.strftime("%B %d, %Y")
    db.commit()
    if recipient_email:
        name = html.escape(recipient_user.full_name if recipient_user else invoice.customer_name or "there")
        number = html.escape(invoice.invoice_number)
        background_tasks.add_task(
            send_html_email,
            [recipient_email],
            f"Invoice {invoice.invoice_number}",
            (
                f"<p>Hello {name},</p><p>Service invoice <strong>{number}</strong> is ready to view and pay.</p>"
                f"<p><a href=\"{html.escape(link)}\">View and pay invoice</a></p>"
                f"<p>This secure link expires on {expires}.</p>"
            ),
            (
                f"Hello {recipient_user.full_name if recipient_user else invoice.customer_name or 'there'},\n\n"
                f"Service invoice {invoice.invoice_number} is ready to view and pay.\n{link}\n\n"
                f"This link expires on {expires}."
            ),
        )
    return {"share_url": link, "channel": payload.channel, "email": recipient_email, "expires_at": invoice.public_link_expires_at}


# ---------------------------------------------------------------- through the link


def _invoice_by_token(db: Session, token: str, for_update: bool = False) -> Invoice:
    query = db.query(Invoice).options(*_invoice_options()).filter(
        Invoice.public_link_hash == _token_hash(token),
        Invoice.invoice_type == InvoiceType.SERVICE,
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


def _pending_reports(db: Session, invoice: Invoice) -> int:
    """Payments someone reported that staff have not checked yet: the payer
    should know before paying the same balance again."""
    return (
        db.query(PaymentProof)
        .filter(PaymentProof.invoice_id == invoice.id, PaymentProof.status == "pending_verification")
        .count()
    )


def _public_response(invoice: Invoice) -> dict[str, Any]:
    square = square_public_config()
    if not _is_approved(invoice):
        # Being changed by staff: nothing shown or payable until it is approved again.
        return {
            "state": "under_review",
            "invoice_number": invoice.invoice_number,
            "document": None,
            "can_pay": False,
            "square_payment": None,
        }
    balance = _money(invoice.balance_due)
    pending = _pending_reports(object_session(invoice), invoice)
    return {
        "state": "paid" if balance <= 0 else "payable",
        "invoice_number": invoice.invoice_number,
        "balance_due": f"{balance:.2f}",
        "payer_name": (invoice.facility.contact_person if invoice.facility else None) or invoice.customer_name,
        "payer_email": invoice.public_link_email or invoice.customer_email,
        "document": _document(invoice),
        "pending_reports": pending,
        "can_pay": balance > 0 and bool(square.get("enabled")) and not pending,
        "square_payment": square,
    }


@router.get("/public/service-invoices/{token}")
def read_public_service_invoice(token: str, db: Session = Depends(get_db)) -> Any:
    return _public_response(_invoice_by_token(db, token))


class PublicSquarePaymentIn(BaseModel):
    source_id: str = Field(min_length=8, max_length=500)
    idempotency_key: str = Field(min_length=16, max_length=45)
    payer_name: str = Field(min_length=2, max_length=200)


@router.post("/public/service-invoices/{token}/square-payment")
def pay_public_service_invoice(
    token: str,
    payload: PublicSquarePaymentIn,
    request: Request,
    db: Session = Depends(get_db),
) -> Any:
    enforce_rate_limit(
        bucket="public-service-card-payment",
        identity=public_payment_identity(request, token),
        limit=8,
        window_seconds=600,
    )
    invoice = _invoice_by_token(db, token, for_update=True)
    return _take_square_payment(db, invoice, payload, _public_response)


def _take_square_payment(
    db: Session,
    invoice: Invoice,
    payload: PublicSquarePaymentIn,
    respond: Callable[[Invoice], dict[str, Any]],
    actor: Optional[User] = None,
) -> Any:
    """Charge the balance once and record it. The invoice is locked by the caller.

    The one path by which a service invoice takes a card, through its link or
    signed in, so both have the same safeguards: the exact balance, one charge
    per attempt, nothing recorded unless Square completes that amount, and no
    second charge after an uncertain result.
    """
    if not _is_approved(invoice):
        raise HTTPException(status_code=409, detail="This invoice is being updated and cannot be paid right now")
    if invoice.status == InvoiceStatus.PAID:
        return respond(invoice)
    if service_payment_in_review(db, invoice):
        raise HTTPException(status_code=409, detail=SERVICE_PAYMENT_IN_REVIEW)
    balance = max(_money(invoice.balance_due), _money(0))
    if balance <= 0:
        raise HTTPException(status_code=409, detail="This invoice has no payable balance")
    payer = payload.payer_name.strip()

    operation, replay = get_or_create_operation(
        db,
        idempotency_key=payload.idempotency_key,
        fingerprint=payment_fingerprint(
            "square_invoice_payment",
            invoice_id=invoice.id,
            amount=balance,
            currency=settings.SQUARE_CURRENCY,
            attributes={"payer_name": payer},
        ),
        operation_type="square_invoice_payment",
        invoice_id=invoice.id,
        amount=balance,
        currency=settings.SQUARE_CURRENCY,
        provider="square",
        created_by_id=actor.id if actor else None,
    )
    if replay:
        replay_or_raise(operation)
        db.refresh(invoice)
        return respond(invoice)

    # Persist the processing marker before contacting Square. This makes an
    # uncertain network response recoverable across worker/process restarts.
    invoice_id = invoice.id
    invoice_number = invoice.invoice_number
    customer_email = invoice.public_link_email or invoice.customer_email
    operation_id = operation.id
    db.commit()
    try:
        square_payment = create_square_payment(
            source_id=payload.source_id,
            idempotency_key=payload.idempotency_key,
            amount=balance,
            invoice_number=invoice_number,
            customer_email=customer_email,
        )
    except SquareConfigurationError as exc:
        operation = db.query(PaymentOperation).filter(PaymentOperation.id == operation_id).with_for_update().first()
        mark_operation_failed(operation, str(exc))
        db.commit()
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except SquareRequestError as exc:
        operation = db.query(PaymentOperation).filter(PaymentOperation.id == operation_id).with_for_update().first()
        mark_operation_failed(operation, str(exc), unknown=exc.indeterminate)
        db.commit()
        raise HTTPException(status_code=exc.status_code, detail=str(exc)) from exc

    invoice = db.query(Invoice).options(*_invoice_options()).filter(Invoice.id == invoice_id).with_for_update(of=Invoice).first()
    operation = db.query(PaymentOperation).filter(PaymentOperation.id == operation_id).with_for_update().first()

    payment_id = str(square_payment.get("id") or "").strip()
    payment_status = str(square_payment.get("status") or "").upper()
    square_amount = minor_units_to_amount((square_payment.get("amount_money") or {}).get("amount"))
    square_currency = str((square_payment.get("amount_money") or {}).get("currency") or "").upper()
    expected_currency = settings.SQUARE_CURRENCY.strip().upper() or "USD"
    if payment_status != "COMPLETED":
        mark_operation_failed(operation, f"Square payment status was {payment_status or 'unknown'}", unknown=True)
        db.commit()
        raise HTTPException(status_code=409, detail=f"Square payment is {payment_status.lower() or 'not completed'}")
    if square_amount != balance or square_currency != expected_currency:
        mark_operation_failed(operation, "Square returned an unexpected amount or currency", unknown=True)
        db.commit()
        raise HTTPException(status_code=409, detail="Square completed an unexpected amount or currency; the invoice was not changed")
    already_recorded = db.query(InvoiceTransaction.id).filter(InvoiceTransaction.reference_number == payment_id).first()
    if already_recorded:
        mark_operation_succeeded(
            operation, provider_reference=payment_id, response_data={"invoice_id": invoice.id, "payment_id": payment_id},
        )
        db.commit()
        return respond(invoice)

    previous_paid = _money(invoice.amount_paid)
    previous_status = invoice.status
    invoice.amount_paid = previous_paid + square_amount
    invoice.balance_due = max(_money(invoice.total_amount) - _money(invoice.amount_paid), _money(0))
    invoice.payment_method = "square_card"
    invoice.status = InvoiceStatus.PAID if invoice.balance_due <= 0 else InvoiceStatus.PARTIALLY_PAID
    invoice.updated_at = datetime.utcnow()
    transaction = record_payment_delta(
        db, invoice, previous_paid, invoice.amount_paid, actor, "square_card",
        f"Square payment completed by {payer} ({payment_id})",
    )
    if transaction:
        transaction.reference_number = payment_id
    record_status_change(db, invoice, previous_status, actor, "Invoice status synchronized with completed Square payment")
    sr = invoice.service_request
    if sr:
        history = list(sr.history or [])
        history.append({
            "timestamp": datetime.utcnow().isoformat(),
            "action": "service_invoice_payment_recorded",
            "user_id": actor.id if actor else None,
            "user": payer,
            "changes": {
                "invoice_id": invoice.id,
                "invoice_number": invoice.invoice_number,
                "amount": str(square_amount),
                "payment_method": "square_card",
                "status": invoice.status.value,
            },
        })
        sr.history = history
        sr.billing_status = "approved"
        flag_modified(sr, "history")
    # Staff changed the invoice in the moments the card was being charged. The
    # money is taken and stays on record; someone needs to look at it.
    overpaid = _money(invoice.amount_paid) > _money(invoice.total_amount)
    needs_attention = previous_status == InvoiceStatus.CANCELLED or overpaid
    notify_admins(
        db,
        title="Service payment needs attention" if needs_attention else "Service payment completed",
        message=(
            f"{payer} paid ${square_amount:.2f} through Square for {invoice.invoice_number}"
            + (", but the invoice was cancelled or reduced while the card was being charged. Please review it."
               if needs_attention else ".")
        ),
        notification_type="billing",
        link_url=f"/billing?search={invoice.invoice_number}",
        actor_id=actor.id if actor else None,
    )
    mark_operation_succeeded(
        operation, provider_reference=payment_id, response_data={"invoice_id": invoice.id, "payment_id": payment_id},
    )
    card = (square_payment.get("card_details") or {}).get("card") or {}
    receipt = queue_payment_receipt(
        db,
        invoice,
        payment_reference=payment_id,
        amount=square_amount,
        payment_method="square_card",
        recipients=[address for address in {invoice.customer_email, invoice.public_link_email} if address],
        card_brand=card.get("card_brand"),
        card_last4=card.get("last_4"),
    )
    db.commit()
    if receipt:
        deliver_payment_receipt(db, receipt.id)
    db.refresh(invoice)
    return respond(invoice)


# ---------------------------------------------------------------- signed in, as the facility


def _facility_invoice(db: Session, invoice_id: int, user: User, for_update: bool = False) -> Invoice:
    """An approved invoice of the signed-in facility user's own facility."""
    if not is_facility_billing_user(user) or not has_module_permission(user, "billing", "edit"):
        raise HTTPException(status_code=403, detail="This account cannot pay invoices")
    query = _scope_service_query(db.query(Invoice), Invoice.facility_id, db, user)
    query = scope_invoice_approval_visibility(query, user).options(*_invoice_options()).filter(
        Invoice.id == invoice_id, Invoice.invoice_type == InvoiceType.SERVICE,
    )
    if for_update:
        query = query.with_for_update(of=Invoice)
    invoice = query.first()
    if not invoice:
        raise HTTPException(status_code=404, detail="Service invoice not found")
    if invoice.status == InvoiceStatus.CANCELLED:
        raise HTTPException(status_code=409, detail="This invoice has been cancelled")
    return invoice


def _facility_payment_response(db: Session, invoice: Invoice, user: User) -> dict[str, Any]:
    square = square_public_config()
    balance = _money(invoice.balance_due)
    pending = _pending_reports(db, invoice)
    return {
        "invoice_number": invoice.invoice_number,
        "status": invoice.status.value,
        "balance_due": f"{balance:.2f}",
        "payer_name": user.full_name,
        "payer_email": user.email,
        "can_pay": balance > 0 and bool(square.get("enabled")) and not pending,
        "square_payment": square,
        "pending_reports": pending,
    }


@router.get("/service-invoices/{invoice_id}/card-payment")
def read_card_payment(
    invoice_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Any:
    return _facility_payment_response(db, _facility_invoice(db, invoice_id, current_user), current_user)


class AccountSquarePaymentIn(BaseModel):
    source_id: str = Field(min_length=8, max_length=500)
    idempotency_key: str = Field(min_length=16, max_length=45)


@router.post("/service-invoices/{invoice_id}/square-payment")
def pay_service_invoice_signed_in(
    invoice_id: int,
    payload: AccountSquarePaymentIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Any:
    # Per invoice, like its link; and across invoices, generous enough for someone
    # paying a stack of them in one sitting, but it still stops card testing.
    enforce_rate_limit(
        bucket="account-service-card-payment",
        identity=f"user:{current_user.id}:invoice:{invoice_id}",
        limit=8,
        window_seconds=600,
    )
    enforce_rate_limit(
        bucket="account-service-card-payment-all",
        identity=f"user:{current_user.id}",
        limit=30,
        window_seconds=600,
    )
    invoice = _facility_invoice(db, invoice_id, current_user, for_update=True)
    charge = PublicSquarePaymentIn(
        source_id=payload.source_id,
        idempotency_key=payload.idempotency_key,
        payer_name=(current_user.full_name or current_user.username or "Facility user")[:200].ljust(2, "."),
    )
    user_id = current_user.id
    return _take_square_payment(
        db, invoice, charge,
        lambda paid: _facility_payment_response(db, paid, db.get(User, user_id)),
        actor=current_user,
    )
