from datetime import datetime
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session, joinedload, selectinload

from app.core.config import settings
from app.core.deps import get_current_user
from app.db.base import get_db
from app.models.invoice import Invoice, InvoiceStatus, InvoiceTransaction
from app.models.payment_operation import PaymentOperation
from app.models.sales import (
    SalesPaymentAuthorization,
    SalesQuotation,
    SalesQuotationAcceptance,
    SalesQuotationLineItem,
    SalesQuotationRecipient,
)
from app.models.user import User
from app.utils.notifications import create_notifications, notify_admins
from app.utils.square_payments import (
    SquareConfigurationError,
    SquareRequestError,
    create_square_payment,
    minor_units_to_amount,
    square_public_config,
)
from app.api.v1.endpoints.sales import (
    _accept_quotation_selection,
    _append_history,
    _create_invoice_for_accepted_quotation,
    _line_response,
    _money,
    _recipient_response,
    _selection_snapshot,
    _token_hash,
)
from app.utils.invoice_editing import editable_line_items
from app.utils.invoice_approval import approval_response
from app.utils.invoice_ledger import (
    add_invoice_transaction,
    record_payment_delta,
    record_status_change,
)
from app.utils.sales_inventory import (
    ensure_sales_inventory_available,
    fulfill_sales_invoice_inventory,
    release_sales_inventory_reservations,
)
from app.utils.payment_idempotency import (
    get_or_create_operation,
    mark_operation_failed,
    mark_operation_succeeded,
    payment_fingerprint,
    replay_or_raise,
)


router = APIRouter()


class PortalAcceptanceIn(BaseModel):
    selected_line_item_ids: list[int] = Field(default_factory=list)
    signature_name: str
    terms_accepted: bool


class PortalDecisionIn(BaseModel):
    action: str
    comments: Optional[str] = None


class PortalPaymentAuthorizationIn(BaseModel):
    cardholder_name: str = Field(min_length=2, max_length=200)
    card_brand: str = Field(min_length=2, max_length=50)
    card_last_four: str = Field(pattern=r"^\d{4}$")
    card_expiration: str = Field(min_length=4, max_length=7)
    submitted_by_name: str = Field(min_length=2, max_length=200)
    submitted_by_email: Optional[str] = Field(default=None, max_length=320)
    terms_accepted: bool
    notes: Optional[str] = Field(default=None, max_length=2000)


class PortalTestPaymentIn(BaseModel):
    payer_name: str = Field(min_length=2, max_length=200)
    confirmation: bool
    notes: Optional[str] = Field(default=None, max_length=2000)


class PortalSquarePaymentIn(BaseModel):
    source_id: str = Field(min_length=8, max_length=500)
    idempotency_key: str = Field(min_length=16, max_length=45)
    payer_name: str = Field(min_length=2, max_length=200)


def _recipient_options():
    return (
        joinedload(SalesQuotationRecipient.user),
        joinedload(SalesQuotationRecipient.quotation).joinedload(SalesQuotation.facility),
        joinedload(SalesQuotationRecipient.quotation).joinedload(SalesQuotation.created_by),
        joinedload(SalesQuotationRecipient.quotation).joinedload(SalesQuotation.accepted_by),
        joinedload(SalesQuotationRecipient.quotation).joinedload(SalesQuotation.converted_invoice),
        joinedload(SalesQuotationRecipient.quotation).joinedload(SalesQuotation.acceptance),
        joinedload(SalesQuotationRecipient.quotation)
        .joinedload(SalesQuotation.line_items)
        .joinedload(SalesQuotationLineItem.part),
        joinedload(SalesQuotationRecipient.quotation)
        .selectinload(SalesQuotation.recipients)
        .joinedload(SalesQuotationRecipient.user),
    )


def _portal_response(recipient: SalesQuotationRecipient) -> dict[str, Any]:
    quotation = recipient.quotation
    acceptance = quotation.acceptance
    invoice = quotation.converted_invoice
    invoice_approval = approval_response(invoice) if invoice else None
    square_config = square_public_config()
    return {
        "company_name": settings.PROJECT_NAME,
        "quotation": {
            "id": quotation.id,
            "quotation_number": quotation.quotation_number,
            "document_kind": quotation.document_kind or "quotation",
            "work_order": quotation.work_order,
            "revision": quotation.revision or 1,
            "quotation_type": quotation.quotation_type,
            "status": quotation.status,
            "selection_status": quotation.selection_status,
            "facility_name": quotation.facility.name if quotation.facility else None,
            "customer_name": quotation.customer_name,
            "customer_address": quotation.customer_address,
            "requested_date": quotation.requested_date,
            "sent_at": quotation.sent_at,
            "expires_at": quotation.expires_at,
            "notes": quotation.notes,
            "subtotal": quotation.subtotal,
            "tax_amount": quotation.tax_amount,
            "discount_amount": quotation.discount_amount,
            "total_amount": quotation.total_amount,
            "line_items": [_line_response(line) for line in quotation.line_items or []],
        },
        "recipient": _recipient_response(recipient),
        "can_accept": (
            recipient.recipient_type == "primary"
            and quotation.status in {"sent", "viewed"}
            and quotation.selection_status != "accepted"
        ),
        "test_payment_enabled": settings.ENABLE_TEST_PAYMENTS,
        "square_payment": square_config,
        "can_square_pay": (
            square_config["enabled"]
            and recipient.recipient_type == "primary"
            and acceptance is not None
            and invoice is not None
            and invoice.status not in {InvoiceStatus.PAID, InvoiceStatus.CANCELLED}
            and _money(invoice.balance_due) > 0
        ),
        "can_test_pay": (
            settings.ENABLE_TEST_PAYMENTS
            and recipient.recipient_type == "primary"
            and acceptance is not None
            and invoice is not None
            and invoice.status not in {InvoiceStatus.PAID, InvoiceStatus.CANCELLED}
            and _money(invoice.balance_due) > 0
        ),
        "test_payment_notice": (
            "Test mode only. No bank account or card is charged."
            if settings.ENABLE_TEST_PAYMENTS
            else None
        ),
        "acceptance": (
            {
                "accepted_by_name": acceptance.accepted_by_name,
                "signature_name": acceptance.signature_name,
                "accepted_at": acceptance.accepted_at,
                "quotation_revision": acceptance.quotation_revision,
                "selection_snapshot": acceptance.selection_snapshot,
                "pricing_snapshot": acceptance.pricing_snapshot,
            }
            if acceptance
            else None
        ),
        "invoice": (
            {
                "id": invoice.id,
                "invoice_number": invoice.invoice_number,
                "status": invoice.status.value if hasattr(invoice.status, "value") else invoice.status,
                "billing_approval_required": invoice_approval["billing_approval_required"],
                "billing_approval_status": invoice_approval["billing_approval_status"],
                "total_amount": invoice.total_amount,
                "amount_paid": invoice.amount_paid,
                "balance_due": invoice.balance_due,
                "payment_method": invoice.payment_method,
            }
            if invoice
            else None
        ),
    }


def _record_test_payment(
    db: Session,
    recipient: SalesQuotationRecipient,
    payload: PortalTestPaymentIn,
    actor: Optional[User],
) -> dict[str, Any]:
    if not settings.ENABLE_TEST_PAYMENTS:
        raise HTTPException(status_code=403, detail="Test payments are disabled")
    if recipient.recipient_type != "primary":
        raise HTTPException(status_code=403, detail="Only the primary recipient can make this payment")
    if not payload.confirmation:
        raise HTTPException(status_code=400, detail="Confirm that this is a simulated test payment")
    quotation = recipient.quotation
    if not quotation.acceptance or not quotation.converted_invoice_id:
        raise HTTPException(status_code=409, detail="Accept the quotation before making payment")

    invoice = (
        db.query(Invoice)
        .filter(Invoice.id == quotation.converted_invoice_id)
        .with_for_update()
        .first()
    )
    if not invoice:
        raise HTTPException(status_code=404, detail="Sales invoice not found")
    if invoice.status == InvoiceStatus.CANCELLED:
        raise HTTPException(status_code=409, detail="A cancelled invoice cannot receive payment")
    if invoice.status == InvoiceStatus.PAID:
        return _portal_response(recipient)

    balance = max(_money(invoice.balance_due), _money(0))
    if balance <= 0:
        raise HTTPException(status_code=409, detail="This invoice has no payable balance")
    ensure_sales_inventory_available(db, invoice)

    previous_paid = _money(invoice.amount_paid)
    previous_status = invoice.status
    invoice.amount_paid = previous_paid + balance
    invoice.balance_due = _money(0)
    invoice.payment_method = "test_mode"
    invoice.status = InvoiceStatus.PAID
    invoice.updated_at = datetime.utcnow()
    payment = record_payment_delta(
        db,
        invoice,
        previous_paid,
        invoice.amount_paid,
        actor,
        "test_mode",
        (
            f"TEST PAYMENT recorded by {payload.payer_name.strip()}. "
            "No funds were charged."
            + (f" {payload.notes.strip()}" if payload.notes and payload.notes.strip() else "")
        ),
    )
    record_status_change(
        db,
        invoice,
        previous_status,
        actor,
        "Invoice marked paid by the temporary test-payment workflow",
    )
    quotation.payment_method = "test_mode"
    quotation.paid_status = "paid"
    quotation.status = "completed"
    quotation.updated_at = datetime.utcnow()
    fulfill_sales_invoice_inventory(db, invoice, actor)
    _append_history(
        quotation,
        "test_payment_recorded",
        actor,
        {
            "invoice_id": invoice.id,
            "invoice_number": invoice.invoice_number,
            "amount": str(balance),
            "payment_reference": payment.reference_number if payment else None,
            "test_mode": True,
            "no_funds_charged": True,
        },
        payload.payer_name.strip(),
    )
    (
        db.query(SalesPaymentAuthorization)
        .filter(
            SalesPaymentAuthorization.invoice_id == invoice.id,
            SalesPaymentAuthorization.status.in_(["requested", "submitted"]),
        )
        .update(
            {
                SalesPaymentAuthorization.status: "superseded",
                SalesPaymentAuthorization.updated_at: datetime.utcnow(),
                SalesPaymentAuthorization.notes: "Superseded by simulated test payment",
            },
            synchronize_session=False,
        )
    )
    notify_admins(
        db,
        title="Test sales payment completed",
        message=(
            f"{payload.payer_name.strip()} completed a simulated ${balance:.2f} payment "
            f"for {invoice.invoice_number}. No funds were charged."
        ),
        notification_type="billing",
        link_url=f"/billing?search={invoice.invoice_number}",
        actor_id=actor.id if actor else recipient.user_id,
    )
    db.commit()
    db.refresh(recipient)
    return _portal_response(recipient)


def _record_square_payment(
    db: Session,
    recipient: SalesQuotationRecipient,
    payload: PortalSquarePaymentIn,
    actor: Optional[User],
) -> dict[str, Any]:
    if recipient.recipient_type != "primary":
        raise HTTPException(status_code=403, detail="Only the primary recipient can make this payment")
    quotation = recipient.quotation
    if not quotation.acceptance or not quotation.converted_invoice_id:
        raise HTTPException(status_code=409, detail="Accept the quotation before making payment")

    invoice = (
        db.query(Invoice)
        .filter(Invoice.id == quotation.converted_invoice_id)
        .with_for_update()
        .first()
    )
    if not invoice:
        raise HTTPException(status_code=404, detail="Sales invoice not found")
    if invoice.status == InvoiceStatus.CANCELLED:
        raise HTTPException(status_code=409, detail="A cancelled invoice cannot receive payment")
    if invoice.status == InvoiceStatus.PAID:
        return _portal_response(recipient)

    balance = max(_money(invoice.balance_due), _money(0))
    if balance <= 0:
        raise HTTPException(status_code=409, detail="This invoice has no payable balance")
    # Lock and validate the exact selected products before Square charges the
    # customer. The locks remain in this transaction through fulfillment.
    ensure_sales_inventory_available(db, invoice)

    operation, replay = get_or_create_operation(
        db,
        idempotency_key=payload.idempotency_key,
        fingerprint=payment_fingerprint(
            "square_invoice_payment",
            invoice_id=invoice.id,
            amount=balance,
            currency=settings.SQUARE_CURRENCY,
            attributes={"payer_name": payload.payer_name.strip()},
        ),
        operation_type="square_invoice_payment",
        invoice_id=invoice.id,
        amount=balance,
        currency=settings.SQUARE_CURRENCY,
        provider="square",
        created_by_id=actor.id if actor else recipient.user_id,
    )
    if replay:
        replay_or_raise(operation)
        db.refresh(recipient)
        return _portal_response(recipient)

    # Persist the processing marker before contacting Square. This makes an
    # uncertain network response recoverable across worker/process restarts.
    invoice_id = invoice.id
    invoice_number = invoice.invoice_number
    customer_email = invoice.customer_email
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

    invoice = db.query(Invoice).filter(Invoice.id == invoice_id).with_for_update().first()
    operation = db.query(PaymentOperation).filter(PaymentOperation.id == operation_id).with_for_update().first()
    recipient = db.query(SalesQuotationRecipient).options(*_recipient_options()).filter(SalesQuotationRecipient.id == recipient.id).first()
    quotation = recipient.quotation

    payment_id = str(square_payment.get("id") or "").strip()
    payment_status = str(square_payment.get("status") or "").upper()
    square_amount = minor_units_to_amount(
        (square_payment.get("amount_money") or {}).get("amount")
    )
    square_currency = str(
        (square_payment.get("amount_money") or {}).get("currency") or ""
    ).upper()
    expected_currency = settings.SQUARE_CURRENCY.strip().upper() or "USD"
    if payment_status != "COMPLETED":
        mark_operation_failed(operation, f"Square payment status was {payment_status or 'unknown'}", unknown=True)
        db.commit()
        raise HTTPException(
            status_code=409,
            detail=f"Square payment is {payment_status.lower() or 'not completed'}",
        )
    if square_amount != balance or square_currency != expected_currency:
        mark_operation_failed(operation, "Square returned an unexpected amount or currency", unknown=True)
        db.commit()
        raise HTTPException(
            status_code=409,
            detail="Square completed an unexpected amount or currency; the invoice was not changed",
        )
    existing_transaction = (
        db.query(InvoiceTransaction.id)
        .filter(InvoiceTransaction.reference_number == payment_id)
        .first()
    )
    if existing_transaction:
        mark_operation_succeeded(
            operation,
            provider_reference=payment_id,
            response_data={"invoice_id": invoice.id, "payment_id": payment_id},
        )
        db.commit()
        return _portal_response(recipient)

    previous_paid = _money(invoice.amount_paid)
    previous_status = invoice.status
    invoice.amount_paid = previous_paid + square_amount
    invoice.balance_due = max(_money(invoice.total_amount) - _money(invoice.amount_paid), _money(0))
    invoice.payment_method = "square_card"
    invoice.status = (
        InvoiceStatus.PAID
        if invoice.balance_due <= 0
        else InvoiceStatus.PARTIALLY_PAID
    )
    invoice.updated_at = datetime.utcnow()
    payment_transaction = record_payment_delta(
        db,
        invoice,
        previous_paid,
        invoice.amount_paid,
        actor,
        "square_card",
        f"Square payment completed by {payload.payer_name.strip()} ({payment_id})",
    )
    if payment_transaction:
        payment_transaction.reference_number = payment_id
    record_status_change(
        db,
        invoice,
        previous_status,
        actor,
        "Invoice status synchronized with completed Square payment",
    )
    quotation.payment_method = "square_card"
    quotation.paid_status = (
        "paid" if invoice.status == InvoiceStatus.PAID else "unpaid"
    )
    if invoice.status == InvoiceStatus.PAID:
        quotation.status = "completed"
    quotation.updated_at = datetime.utcnow()
    fulfill_sales_invoice_inventory(db, invoice, actor)
    _append_history(
        quotation,
        "square_payment_completed",
        actor,
        {
            "invoice_id": invoice.id,
            "invoice_number": invoice.invoice_number,
            "amount": str(square_amount),
            "square_payment_id": payment_id,
            "square_status": payment_status,
        },
        payload.payer_name.strip(),
    )
    (
        db.query(SalesPaymentAuthorization)
        .filter(
            SalesPaymentAuthorization.invoice_id == invoice.id,
            SalesPaymentAuthorization.status.in_(["requested", "submitted"]),
        )
        .update(
            {
                SalesPaymentAuthorization.status: "processed",
                SalesPaymentAuthorization.processed_at: datetime.utcnow(),
                SalesPaymentAuthorization.updated_at: datetime.utcnow(),
                SalesPaymentAuthorization.notes: f"Processed through Square payment {payment_id}",
            },
            synchronize_session=False,
        )
    )
    notify_admins(
        db,
        title="Sales payment completed",
        message=(
            f"{payload.payer_name.strip()} paid ${square_amount:.2f} through Square "
            f"for {invoice.invoice_number}."
        ),
        notification_type="billing",
        link_url=f"/billing?search={invoice.invoice_number}",
        actor_id=actor.id if actor else recipient.user_id,
    )
    mark_operation_succeeded(
        operation,
        provider_reference=payment_id,
        response_data={"invoice_id": invoice.id, "payment_id": payment_id},
    )
    db.commit()
    db.refresh(recipient)
    return _portal_response(recipient)


def _payment_authorization_options():
    return (
        joinedload(SalesPaymentAuthorization.invoice).joinedload(Invoice.facility),
        joinedload(SalesPaymentAuthorization.quotation).joinedload(SalesQuotation.acceptance),
        joinedload(SalesPaymentAuthorization.quotation)
        .joinedload(SalesQuotation.line_items)
        .joinedload(SalesQuotationLineItem.part),
        joinedload(SalesPaymentAuthorization.recipient).joinedload(SalesQuotationRecipient.user),
        joinedload(SalesPaymentAuthorization.requested_by),
    )


def _payment_authorization_response(authorization: SalesPaymentAuthorization) -> dict[str, Any]:
    invoice = authorization.invoice
    quotation = authorization.quotation
    acceptance = quotation.acceptance
    invoice_approval = approval_response(invoice)
    stored_lines = editable_line_items(invoice.notes)
    line_items = stored_lines or [
        {
            "item_number": line.part.part_number if line.part else line.item_kind.upper(),
            "description": line.description,
            "quantity": line.quantity,
            "unit_price": line.unit_price,
            "shipping_fee": line.shipping_fee,
            "setup_fee": line.setup_fee,
            "labor_fee": line.labor_fee,
            "condition": line.condition,
            "total": line.total,
        }
        for line in quotation.line_items or []
        if line.is_selected
    ]
    return {
        "company_name": settings.PROJECT_NAME,
        "authorization": {
            "id": authorization.id,
            "status": authorization.status,
            "amount": authorization.amount,
            "currency": authorization.currency,
            "payment_method": authorization.payment_method,
            "channel": authorization.channel,
            "cardholder_name": authorization.cardholder_name,
            "card_brand": authorization.card_brand,
            "card_last_four": authorization.card_last_four,
            "card_expiration": authorization.card_expiration,
            "authorization_reference": authorization.authorization_reference,
            "submitted_by_name": authorization.submitted_by_name,
            "submitted_at": authorization.submitted_at,
            "requested_at": authorization.requested_at,
            "token_expires_at": authorization.token_expires_at,
        },
        "invoice": {
            "id": invoice.id,
            "invoice_number": invoice.invoice_number,
            "status": invoice.status.value if hasattr(invoice.status, "value") else invoice.status,
            "billing_approval_required": invoice_approval["billing_approval_required"],
            "billing_approval_status": invoice_approval["billing_approval_status"],
            "customer_name": invoice.customer_name,
            "customer_email": invoice.customer_email,
            "customer_phone": invoice.customer_phone,
            "customer_address": invoice.customer_address,
            "facility_name": invoice.facility.name if invoice.facility else None,
            "subtotal": invoice.subtotal,
            "tax_amount": invoice.tax_amount,
            "discount_amount": invoice.discount_amount,
            "total_amount": invoice.total_amount,
            "amount_paid": invoice.amount_paid,
            "balance_due": invoice.balance_due,
            "issue_date": invoice.issue_date,
            "due_date": invoice.due_date,
            "line_items": line_items,
        },
        "quotation": {
            "id": quotation.id,
            "quotation_number": quotation.quotation_number,
            "revision": quotation.revision or 1,
        },
        "acceptance": (
            {
                "accepted_by_name": acceptance.accepted_by_name,
                "signature_name": acceptance.signature_name,
                "accepted_at": acceptance.accepted_at,
                "quotation_revision": acceptance.quotation_revision,
            }
            if acceptance
            else None
        ),
        "can_submit": (
            authorization.status == "requested"
            and authorization.token_expires_at >= datetime.utcnow()
            and invoice.status not in {InvoiceStatus.PAID, InvoiceStatus.CANCELLED}
            and _money(invoice.balance_due) > 0
        ),
        "payment_note": (
            "This form authorizes payment processing. It does not store a full card number "
            "or security code, and it does not mark the invoice paid until payment is processed."
        ),
    }


def _find_payment_authorization(
    db: Session,
    token: str,
    *,
    for_update: bool = False,
) -> SalesPaymentAuthorization:
    query = (
        db.query(SalesPaymentAuthorization)
        .options(*_payment_authorization_options())
        .filter(SalesPaymentAuthorization.access_token_hash == _token_hash(token))
    )
    if for_update:
        query = query.with_for_update(of=SalesPaymentAuthorization)
    authorization = query.first()
    if not authorization:
        raise HTTPException(status_code=404, detail="Payment authorization link not found")
    if authorization.token_expires_at < datetime.utcnow():
        if authorization.status == "requested":
            authorization.status = "expired"
            db.commit()
        raise HTTPException(status_code=410, detail="This payment authorization link has expired")
    return authorization


def _mark_viewed(
    db: Session,
    recipient: SalesQuotationRecipient,
    actor: Optional[User],
) -> None:
    quotation = recipient.quotation
    if recipient.viewed_at is None:
        now = datetime.utcnow()
        recipient.viewed_at = now
        recipient.status = "viewed"
        if quotation.status == "sent":
            quotation.status = "viewed"
        _append_history(
            quotation,
            "viewed",
            actor,
            {
                "recipient_id": recipient.id,
                "recipient_type": recipient.recipient_type,
                "email": recipient.email,
            },
            recipient.name,
        )
        db.commit()


def _ensure_recipient_available(recipient: Optional[SalesQuotationRecipient]) -> SalesQuotationRecipient:
    if not recipient:
        raise HTTPException(status_code=404, detail="Quotation link not found")
    if recipient.token_expires_at and recipient.token_expires_at < datetime.utcnow():
        raise HTTPException(status_code=410, detail="This quotation link has expired")
    if recipient.quotation.status in {"draft", "cancelled"}:
        raise HTTPException(status_code=410, detail="This quotation is no longer available")
    return recipient


def _accept_recipient_quotation(
    db: Session,
    recipient: SalesQuotationRecipient,
    payload: PortalAcceptanceIn,
    request: Request,
    actor: Optional[User],
) -> dict[str, Any]:
    quotation = recipient.quotation
    if recipient.recipient_type != "primary":
        raise HTTPException(status_code=403, detail="Only the primary recipient can accept this quotation")
    if not payload.terms_accepted:
        raise HTTPException(status_code=400, detail="Accept the quotation terms before continuing")
    signature_name = payload.signature_name.strip()
    if not signature_name:
        raise HTTPException(status_code=400, detail="Signature name is required")
    is_direct_invoice = (quotation.document_kind or "quotation") == "direct_invoice"
    if quotation.acceptance:
        return _portal_response(recipient)
    if quotation.status not in {"sent", "viewed"}:
        raise HTTPException(status_code=409, detail="This quotation cannot be accepted in its current status")
    if quotation.expires_at and quotation.expires_at < datetime.utcnow():
        raise HTTPException(status_code=410, detail="This quotation has expired")

    accepted_lines = _accept_quotation_selection(
        quotation,
        payload.selected_line_item_ids,
        "client_portal",
        actor,
        recipient.name,
    )
    accepted_at = datetime.utcnow()
    pricing_snapshot = {
        "subtotal": str(_money(quotation.subtotal)),
        "tax_amount": str(_money(quotation.tax_amount)),
        "discount_amount": str(_money(quotation.discount_amount)),
        "total_amount": str(_money(quotation.total_amount)),
    }
    acceptance = SalesQuotationAcceptance(
        quotation_id=quotation.id,
        recipient_id=recipient.id,
        accepted_by_user_id=actor.id if actor else recipient.user_id,
        accepted_by_name=recipient.name,
        signature_name=signature_name,
        terms_accepted=True,
        quotation_revision=quotation.revision or 1,
        selection_snapshot=_selection_snapshot(accepted_lines),
        pricing_snapshot=pricing_snapshot,
        ip_address=request.client.host if request.client else None,
        user_agent=(request.headers.get("user-agent") or "")[:1000],
        accepted_at=accepted_at,
    )
    db.add(acceptance)
    quotation.acceptance = acceptance
    quotation.accepted_at = accepted_at
    quotation.status = "accepted"
    recipient.status = "accepted"
    recipient.accepted_at = accepted_at
    invoice = _create_invoice_for_accepted_quotation(
        db,
        quotation,
        accepted_lines,
        actor or recipient.user,
    )
    _append_history(
        quotation,
        "direct_invoice_signed" if is_direct_invoice else "invoice_generated",
        actor,
        {
            "invoice_id": invoice.id,
            "invoice_number": invoice.invoice_number,
            "total_amount": str(invoice.total_amount),
        },
        recipient.name,
    )
    notify_admins(
        db,
        title="Sales invoice signed" if is_direct_invoice else "Sales quotation accepted",
        message=(
            f"{invoice.invoice_number} was signed by {recipient.name} and is ready for payment."
            if is_direct_invoice
            else f"{quotation.quotation_number} was accepted by {recipient.name}; "
            f"{invoice.invoice_number} is ready for payment."
        ),
        notification_type="billing",
        link_url=f"/sales/invoices?search={invoice.invoice_number}",
        actor_id=actor.id if actor else recipient.user_id,
    )
    create_notifications(
        db,
        user_ids=[item.user_id for item in quotation.recipients if item.user_id],
        title="Invoice signed" if is_direct_invoice else "Quotation accepted",
        message=(
            f"{invoice.invoice_number} was signed and is ready for payment."
            if is_direct_invoice
            else f"{quotation.quotation_number} was accepted and its invoice is ready for payment."
        ),
        notification_type="billing",
        link_url=f"/quotation/account/{quotation.id}",
        actor_id=actor.id if actor else recipient.user_id,
    )
    db.commit()
    db.refresh(recipient)
    return _portal_response(recipient)


@router.get("/public/quotations/{token}")
def get_public_quotation(
    token: str,
    db: Session = Depends(get_db),
) -> Any:
    recipient = (
        db.query(SalesQuotationRecipient)
        .options(*_recipient_options())
        .filter(SalesQuotationRecipient.access_token_hash == _token_hash(token))
        .first()
    )
    recipient = _ensure_recipient_available(recipient)
    _mark_viewed(db, recipient, recipient.user)
    return _portal_response(recipient)


@router.post("/public/quotations/{token}/accept")
def accept_public_quotation(
    token: str,
    payload: PortalAcceptanceIn,
    request: Request,
    db: Session = Depends(get_db),
) -> Any:
    recipient = (
        db.query(SalesQuotationRecipient)
        .options(*_recipient_options())
        .filter(SalesQuotationRecipient.access_token_hash == _token_hash(token))
        .with_for_update(of=SalesQuotationRecipient)
        .first()
    )
    recipient = _ensure_recipient_available(recipient)
    return _accept_recipient_quotation(db, recipient, payload, request, recipient.user)


@router.post("/public/quotations/{token}/decision")
def decide_public_quotation(
    token: str,
    payload: PortalDecisionIn,
    db: Session = Depends(get_db),
) -> Any:
    recipient = (
        db.query(SalesQuotationRecipient)
        .options(*_recipient_options())
        .filter(SalesQuotationRecipient.access_token_hash == _token_hash(token))
        .with_for_update(of=SalesQuotationRecipient)
        .first()
    )
    recipient = _ensure_recipient_available(recipient)
    if recipient.recipient_type != "primary":
        raise HTTPException(status_code=403, detail="Only the primary recipient can respond")
    action = payload.action.strip().lower()
    if action not in {"decline", "request_changes"}:
        raise HTTPException(status_code=400, detail="Action must be decline or request_changes")
    quotation = recipient.quotation
    is_direct_invoice = (quotation.document_kind or "quotation") == "direct_invoice"
    if quotation.selection_status == "accepted" or (
        quotation.converted_invoice_id and not is_direct_invoice
    ):
        raise HTTPException(status_code=409, detail="An accepted quotation can no longer be changed")
    quotation.status = "declined" if action == "decline" else "changes_requested"
    if is_direct_invoice and quotation.converted_invoice:
        quotation.converted_invoice.status = InvoiceStatus.CANCELLED
        quotation.converted_invoice.balance_due = 0
        release_sales_inventory_reservations(
            db,
            quotation.converted_invoice,
            recipient.user,
            f"Direct Sales invoice {quotation.converted_invoice.invoice_number} was {quotation.status.replace('_', ' ')}",
        )
    recipient.status = quotation.status
    _append_history(
        quotation,
        quotation.status,
        recipient.user,
        {"comments": payload.comments or "", "recipient_id": recipient.id},
        recipient.name,
    )
    create_notifications(
        db,
        user_ids=[quotation.created_by_id],
        title="Sales quotation response",
        message=f"{recipient.name} {quotation.status.replace('_', ' ')} for {quotation.quotation_number}.",
        notification_type="billing",
        link_url=f"/sales/quotations?search={quotation.quotation_number}",
        actor_id=recipient.user_id,
    )
    db.commit()
    return _portal_response(recipient)


@router.post("/public/quotations/{token}/test-payment")
def pay_public_quotation_in_test_mode(
    token: str,
    payload: PortalTestPaymentIn,
    db: Session = Depends(get_db),
) -> Any:
    recipient = (
        db.query(SalesQuotationRecipient)
        .options(*_recipient_options())
        .filter(SalesQuotationRecipient.access_token_hash == _token_hash(token))
        .with_for_update(of=SalesQuotationRecipient)
        .first()
    )
    recipient = _ensure_recipient_available(recipient)
    return _record_test_payment(db, recipient, payload, recipient.user)


@router.post("/public/quotations/{token}/square-payment")
def pay_public_quotation_with_square(
    token: str,
    payload: PortalSquarePaymentIn,
    db: Session = Depends(get_db),
) -> Any:
    recipient = (
        db.query(SalesQuotationRecipient)
        .options(*_recipient_options())
        .filter(SalesQuotationRecipient.access_token_hash == _token_hash(token))
        .with_for_update(of=SalesQuotationRecipient)
        .first()
    )
    recipient = _ensure_recipient_available(recipient)
    return _record_square_payment(db, recipient, payload, recipient.user)


@router.get("/public/sales-payment/{token}")
def get_public_sales_payment_authorization(
    token: str,
    db: Session = Depends(get_db),
) -> Any:
    return _payment_authorization_response(_find_payment_authorization(db, token))


@router.post("/public/sales-payment/{token}/authorize")
def submit_public_sales_payment_authorization(
    token: str,
    payload: PortalPaymentAuthorizationIn,
    request: Request,
    db: Session = Depends(get_db),
) -> Any:
    if not payload.terms_accepted:
        raise HTTPException(status_code=400, detail="Payment authorization consent is required")
    authorization = _find_payment_authorization(db, token, for_update=True)
    invoice = authorization.invoice
    quotation = authorization.quotation
    if authorization.status == "submitted":
        return _payment_authorization_response(authorization)
    if authorization.status != "requested":
        raise HTTPException(
            status_code=409,
            detail=f"This authorization is {authorization.status.replace('_', ' ')}",
        )
    if invoice.status in {InvoiceStatus.PAID, InvoiceStatus.CANCELLED}:
        raise HTTPException(
            status_code=409,
            detail="This invoice can no longer receive a payment authorization",
        )
    current_balance = max(_money(invoice.balance_due), _money(0))
    if current_balance <= 0:
        raise HTTPException(status_code=409, detail="This invoice has no outstanding balance")
    if current_balance != _money(authorization.amount):
        authorization.status = "superseded"
        authorization.updated_at = datetime.utcnow()
        db.commit()
        raise HTTPException(
            status_code=409,
            detail="The invoice balance changed. Ask the sender for a new authorization link.",
        )

    now = datetime.utcnow()
    authorization.status = "submitted"
    authorization.submitted_by_user_id = (
        authorization.recipient.user_id
        if authorization.recipient and authorization.recipient.user_id
        else None
    )
    authorization.submitted_by_name = payload.submitted_by_name.strip()
    authorization.submitted_by_email = (
        payload.submitted_by_email.strip()
        if payload.submitted_by_email
        else authorization.recipient.email
        if authorization.recipient
        else invoice.customer_email
    )
    authorization.cardholder_name = payload.cardholder_name.strip()
    authorization.card_brand = payload.card_brand.strip()
    authorization.card_last_four = payload.card_last_four
    authorization.card_expiration = payload.card_expiration.strip()
    authorization.authorization_reference = f"SAUTH-{authorization.id:06d}"
    authorization.notes = payload.notes
    authorization.submitted_at = now
    authorization.ip_address = request.client.host if request.client else None
    authorization.user_agent = (request.headers.get("user-agent") or "")[:1000]
    authorization.updated_at = now
    add_invoice_transaction(
        db,
        invoice,
        "payment_authorization_submitted",
        authorization.amount,
        "credit_card",
        (
            f"Payment authorization {authorization.authorization_reference} submitted by "
            f"{authorization.submitted_by_name}; card ending {authorization.card_last_four}"
        ),
        authorization.submitted_by,
        "SAUTH",
    )
    _append_history(
        quotation,
        "credit_card_authorization_submitted",
        authorization.submitted_by,
        {
            "authorization_id": authorization.id,
            "authorization_reference": authorization.authorization_reference,
            "invoice_id": invoice.id,
            "invoice_number": invoice.invoice_number,
            "amount": str(authorization.amount),
            "submitted_by_name": authorization.submitted_by_name,
            "card_brand": authorization.card_brand,
            "card_last_four": authorization.card_last_four,
            "channel": "public_link",
        },
        authorization.submitted_by_name,
    )
    notify_admins(
        db,
        title="Sales payment authorization submitted",
        message=(
            f"{authorization.submitted_by_name} authorized ${authorization.amount:.2f} "
            f"for {invoice.invoice_number}."
        ),
        notification_type="billing",
        link_url=f"/billing?search={invoice.invoice_number}",
        actor_id=authorization.submitted_by_user_id,
    )
    db.commit()
    db.refresh(authorization)
    return _payment_authorization_response(authorization)


@router.get("/client-sales/quotations")
def list_client_quotations(
    search: Optional[str] = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Any:
    query = (
        db.query(SalesQuotationRecipient)
        .options(*_recipient_options())
        .join(SalesQuotation, SalesQuotation.id == SalesQuotationRecipient.quotation_id)
        .filter(
            SalesQuotationRecipient.user_id == current_user.id,
            SalesQuotation.status.notin_(["draft", "cancelled"]),
        )
    )
    if search and search.strip():
        like = f"%{search.strip()}%"
        query = query.filter(
            SalesQuotation.quotation_number.ilike(like)
            | SalesQuotation.work_order.ilike(like)
            | SalesQuotation.customer_name.ilike(like)
        )
    total = query.count()
    recipients = (
        query.order_by(SalesQuotation.sent_at.desc(), SalesQuotation.id.desc())
        .offset(skip)
        .limit(limit)
        .all()
    )
    return {"items": [_portal_response(item) for item in recipients], "total": total}


@router.get("/client-sales/quotations/{quotation_id}")
def get_client_quotation(
    quotation_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Any:
    recipient = (
        db.query(SalesQuotationRecipient)
        .options(*_recipient_options())
        .filter(
            SalesQuotationRecipient.quotation_id == quotation_id,
            SalesQuotationRecipient.user_id == current_user.id,
        )
        .first()
    )
    if not recipient:
        raise HTTPException(status_code=404, detail="Quotation not found")
    _mark_viewed(db, recipient, current_user)
    return _portal_response(recipient)


@router.post("/client-sales/quotations/{quotation_id}/accept")
def accept_client_quotation(
    quotation_id: int,
    payload: PortalAcceptanceIn,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Any:
    recipient = (
        db.query(SalesQuotationRecipient)
        .options(*_recipient_options())
        .filter(
            SalesQuotationRecipient.quotation_id == quotation_id,
            SalesQuotationRecipient.user_id == current_user.id,
        )
        .with_for_update(of=SalesQuotationRecipient)
        .first()
    )
    if not recipient:
        raise HTTPException(status_code=404, detail="Quotation not found")
    return _accept_recipient_quotation(db, recipient, payload, request, current_user)


@router.post("/client-sales/quotations/{quotation_id}/decision")
def decide_client_quotation(
    quotation_id: int,
    payload: PortalDecisionIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Any:
    recipient = (
        db.query(SalesQuotationRecipient)
        .options(*_recipient_options())
        .filter(
            SalesQuotationRecipient.quotation_id == quotation_id,
            SalesQuotationRecipient.user_id == current_user.id,
        )
        .with_for_update(of=SalesQuotationRecipient)
        .first()
    )
    if not recipient:
        raise HTTPException(status_code=404, detail="Quotation not found")
    if recipient.recipient_type != "primary":
        raise HTTPException(status_code=403, detail="Only the primary recipient can respond")
    action = payload.action.strip().lower()
    if action not in {"decline", "request_changes"}:
        raise HTTPException(status_code=400, detail="Action must be decline or request_changes")
    quotation = recipient.quotation
    is_direct_invoice = (quotation.document_kind or "quotation") == "direct_invoice"
    if quotation.selection_status == "accepted" or (
        quotation.converted_invoice_id and not is_direct_invoice
    ):
        raise HTTPException(status_code=409, detail="An accepted quotation can no longer be changed")
    quotation.status = "declined" if action == "decline" else "changes_requested"
    if is_direct_invoice and quotation.converted_invoice:
        quotation.converted_invoice.status = InvoiceStatus.CANCELLED
        quotation.converted_invoice.balance_due = 0
        release_sales_inventory_reservations(
            db,
            quotation.converted_invoice,
            current_user,
            f"Direct Sales invoice {quotation.converted_invoice.invoice_number} was {quotation.status.replace('_', ' ')}",
        )
    recipient.status = quotation.status
    _append_history(
        quotation,
        quotation.status,
        current_user,
        {"comments": payload.comments or "", "recipient_id": recipient.id},
    )
    create_notifications(
        db,
        user_ids=[quotation.created_by_id],
        title="Sales quotation response",
        message=f"{recipient.name} {quotation.status.replace('_', ' ')} for {quotation.quotation_number}.",
        notification_type="billing",
        link_url=f"/sales/quotations?search={quotation.quotation_number}",
        actor_id=current_user.id,
    )
    db.commit()
    return _portal_response(recipient)


@router.post("/client-sales/quotations/{quotation_id}/test-payment")
def pay_client_quotation_in_test_mode(
    quotation_id: int,
    payload: PortalTestPaymentIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Any:
    recipient = (
        db.query(SalesQuotationRecipient)
        .options(*_recipient_options())
        .filter(
            SalesQuotationRecipient.quotation_id == quotation_id,
            SalesQuotationRecipient.user_id == current_user.id,
        )
        .with_for_update(of=SalesQuotationRecipient)
        .first()
    )
    if not recipient:
        raise HTTPException(status_code=404, detail="Quotation not found")
    return _record_test_payment(db, recipient, payload, current_user)


@router.post("/client-sales/quotations/{quotation_id}/square-payment")
def pay_client_quotation_with_square(
    quotation_id: int,
    payload: PortalSquarePaymentIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Any:
    recipient = (
        db.query(SalesQuotationRecipient)
        .options(*_recipient_options())
        .filter(
            SalesQuotationRecipient.quotation_id == quotation_id,
            SalesQuotationRecipient.user_id == current_user.id,
        )
        .with_for_update(of=SalesQuotationRecipient)
        .first()
    )
    if not recipient:
        raise HTTPException(status_code=404, detail="Quotation not found")
    return _record_square_payment(db, recipient, payload, current_user)
