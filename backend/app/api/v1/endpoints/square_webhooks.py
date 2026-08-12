from __future__ import annotations

from datetime import datetime, timedelta
from decimal import Decimal
import hashlib
from typing import Any

from fastapi import APIRouter, Depends, Header, HTTPException, Request
from sqlalchemy.orm import Session
from sqlalchemy.orm.attributes import flag_modified

from app.core.config import settings
from app.db.base import get_db
from app.models.invoice import Invoice, InvoiceStatus, InvoiceTransaction, InvoiceType
from app.models.payment_operation import PaymentOperation, PaymentWebhookEvent
from sqlalchemy.exc import IntegrityError
from app.utils.invoice_ledger import (
    add_invoice_transaction,
    record_payment_delta,
    record_status_change,
)
from app.utils.payment_receipts import queue_rental_payment_receipt, queue_sales_payment_receipt
from app.utils.square_payments import minor_units_to_amount, verify_square_webhook_signature
from app.utils.sales_inventory import fulfill_sales_invoice_inventory
from app.utils.payment_idempotency import (
    get_or_create_operation,
    mark_operation_succeeded,
    payment_fingerprint,
)


router = APIRouter()


def _money(value: Any) -> Decimal:
    if value in (None, ""):
        return Decimal("0")
    return Decimal(str(value))


def _sync_source_after_payment(invoice: Invoice, amount: Decimal, payment_id: str) -> None:
    at = datetime.utcnow().isoformat()
    if invoice.sales_quotation:
        quotation = invoice.sales_quotation
        history = list(quotation.history or [])
        history.append({
            "action": "square_payment_webhook",
            "by": "Square",
            "at": at,
            "details": {
                "invoice_id": invoice.id,
                "invoice_number": invoice.invoice_number,
                "amount": str(amount),
                "square_payment_id": payment_id,
            },
        })
        quotation.history = history
        quotation.payment_method = "square_card"
        quotation.paid_status = "paid" if invoice.status == InvoiceStatus.PAID else "unpaid"
        if invoice.status == InvoiceStatus.PAID:
            quotation.status = "completed"
        quotation.updated_at = datetime.utcnow()
        flag_modified(quotation, "history")
    if invoice.rental:
        rental = invoice.rental
        history = list(rental.history or [])
        history.append({
            "action": "square_payment_webhook",
            "by": "Square",
            "at": at,
            "details": {
                "invoice_id": invoice.id,
                "invoice_number": invoice.invoice_number,
                "amount": str(amount),
                "square_payment_id": payment_id,
            },
        })
        rental.history = history
        flag_modified(rental, "history")


def _sync_completed_payment(db: Session, payment: dict[str, Any]) -> str:
    payment_id = str(payment.get("id") or "").strip()
    reference_id = str(payment.get("reference_id") or "").strip()
    if not payment_id or not reference_id:
        return "ignored"
    if (
        db.query(InvoiceTransaction.id)
        .filter(InvoiceTransaction.reference_number == payment_id)
        .first()
    ):
        return "duplicate"

    invoice = (
        db.query(Invoice)
        .filter(Invoice.invoice_number == reference_id)
        .with_for_update()
        .first()
    )
    if not invoice or invoice.status == InvoiceStatus.CANCELLED:
        return "ignored"
    amount = minor_units_to_amount((payment.get("amount_money") or {}).get("amount"))
    currency = str((payment.get("amount_money") or {}).get("currency") or "").upper()
    expected_currency = settings.SQUARE_CURRENCY.strip().upper() or "USD"
    if amount <= 0 or currency != expected_currency:
        return "ignored"

    operation = (
        db.query(PaymentOperation)
        .filter(PaymentOperation.provider_reference == payment_id)
        .with_for_update()
        .first()
    )
    if not operation:
        operation = (
            db.query(PaymentOperation)
            .filter(
                PaymentOperation.invoice_id == invoice.id,
                PaymentOperation.status.in_(["processing", "unknown"]),
                PaymentOperation.amount == amount,
            )
            .with_for_update()
            .first()
        )
    if not operation:
        operation, _ = get_or_create_operation(
            db,
            idempotency_key=f"square-webhook-payment:{payment_id}",
            fingerprint=payment_fingerprint(
                "square_invoice_payment",
                invoice_id=invoice.id,
                amount=amount,
                currency=currency,
            ),
            operation_type="square_invoice_payment",
            invoice_id=invoice.id,
            amount=amount,
            currency=currency,
            provider="square",
        )

    previous_paid = _money(invoice.amount_paid)
    previous_status = invoice.status
    remaining = max(_money(invoice.total_amount) - previous_paid, Decimal("0"))
    applied_amount = min(amount, remaining)
    if applied_amount <= 0:
        return "ignored"
    invoice.amount_paid = previous_paid + applied_amount
    invoice.balance_due = max(_money(invoice.total_amount) - _money(invoice.amount_paid), Decimal("0"))
    invoice.payment_method = "square_card"
    invoice.status = (
        InvoiceStatus.PAID
        if invoice.balance_due <= 0
        else InvoiceStatus.PARTIALLY_PAID
    )
    invoice.updated_at = datetime.utcnow()
    transaction = record_payment_delta(
        db,
        invoice,
        previous_paid,
        invoice.amount_paid,
        None,
        "square_card",
        f"Payment synchronized from Square webhook ({payment_id})",
    )
    if transaction:
        transaction.reference_number = payment_id
    if invoice.invoice_type == InvoiceType.RENTAL and invoice.rental:
        payment_card = (payment.get("card_details") or {}).get("card") or {}
        queue_rental_payment_receipt(
            db,
            invoice.rental,
            invoice,
            payment_reference=payment_id,
            amount=applied_amount,
            payment_method="square_card",
            card_brand=payment_card.get("card_brand"),
            card_last4=payment_card.get("last_4"),
        )
    elif invoice.invoice_type == InvoiceType.SALES and invoice.sales_quotation:
        payment_card = (payment.get("card_details") or {}).get("card") or {}
        queue_sales_payment_receipt(
            db,
            invoice.sales_quotation,
            invoice,
            payment_reference=payment_id,
            amount=applied_amount,
            payment_method="square_card",
            card_brand=payment_card.get("card_brand"),
            card_last4=payment_card.get("last_4"),
        )
    record_status_change(
        db,
        invoice,
        previous_status,
        None,
        "Invoice status synchronized from Square webhook",
    )
    fulfill_sales_invoice_inventory(db, invoice, None)
    _sync_source_after_payment(invoice, applied_amount, payment_id)
    mark_operation_succeeded(
        operation,
        provider_reference=payment_id,
        response_data={"invoice_id": invoice.id, "payment_id": payment_id},
    )
    db.commit()
    return "processed"


def _sync_completed_refund(db: Session, refund: dict[str, Any]) -> str:
    refund_id = str(refund.get("id") or "").strip()
    payment_id = str(refund.get("payment_id") or "").strip()
    if not refund_id or not payment_id:
        return "ignored"
    if (
        db.query(InvoiceTransaction.id)
        .filter(InvoiceTransaction.reference_number == refund_id)
        .first()
    ):
        return "duplicate"

    source_payment = (
        db.query(InvoiceTransaction)
        .filter(
            InvoiceTransaction.reference_number == payment_id,
            InvoiceTransaction.transaction_type == "payment",
        )
        .first()
    )
    if not source_payment:
        return "ignored"
    invoice = (
        db.query(Invoice)
        .filter(Invoice.id == source_payment.invoice_id)
        .with_for_update()
        .first()
    )
    if not invoice:
        return "ignored"
    amount = minor_units_to_amount((refund.get("amount_money") or {}).get("amount"))
    currency = str((refund.get("amount_money") or {}).get("currency") or "").upper()
    expected_currency = settings.SQUARE_CURRENCY.strip().upper() or "USD"
    if amount <= 0 or currency != expected_currency:
        return "ignored"

    operation = (
        db.query(PaymentOperation)
        .filter(PaymentOperation.provider_reference == refund_id)
        .with_for_update()
        .first()
    )
    if not operation:
        operation = (
            db.query(PaymentOperation)
            .filter(
                PaymentOperation.invoice_id == invoice.id,
                PaymentOperation.operation_type == "invoice_refund",
                PaymentOperation.status.in_(["processing", "unknown"]),
                PaymentOperation.amount == amount,
            )
            .with_for_update()
            .first()
        )
    if not operation:
        operation, _ = get_or_create_operation(
            db,
            idempotency_key=f"square-webhook-refund:{refund_id}",
            fingerprint=payment_fingerprint(
                "invoice_refund",
                invoice_id=invoice.id,
                amount=amount,
                currency=currency,
            ),
            operation_type="invoice_refund",
            invoice_id=invoice.id,
            amount=amount,
            currency=currency,
            provider="square",
        )

    invoice.refunded_amount = _money(invoice.refunded_amount) + amount
    invoice.refund_status = (
        "refunded"
        if _money(invoice.refunded_amount) >= _money(invoice.amount_paid)
        else "partially_refunded"
    )
    invoice.updated_at = datetime.utcnow()
    transaction = add_invoice_transaction(
        db,
        invoice,
        "refund",
        amount,
        "square_card",
        f"Refund synchronized from Square webhook ({refund_id})",
        None,
        "SQR",
    )
    transaction.reference_number = refund_id
    if invoice.sales_quotation:
        history = list(invoice.sales_quotation.history or [])
        history.append({
            "action": "square_refund_webhook",
            "by": "Square",
            "at": datetime.utcnow().isoformat(),
            "details": {
                "invoice_id": invoice.id,
                "amount": str(amount),
                "square_payment_id": payment_id,
                "square_refund_id": refund_id,
            },
        })
        invoice.sales_quotation.history = history
        flag_modified(invoice.sales_quotation, "history")
    mark_operation_succeeded(
        operation,
        provider_reference=refund_id,
        response_data={"invoice_id": invoice.id, "refund_id": refund_id},
    )
    db.commit()
    return "processed"


@router.post("/square")
async def receive_square_webhook(
    request: Request,
    x_square_hmacsha256_signature: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> dict[str, str]:
    raw_body = await request.body()
    if not verify_square_webhook_signature(raw_body, x_square_hmacsha256_signature):
        raise HTTPException(status_code=403, detail="Invalid Square webhook signature")
    try:
        payload = await request.json()
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="Invalid Square webhook payload") from exc

    event_type = str(payload.get("type") or "")
    event_id = str(payload.get("event_id") or payload.get("id") or "").strip()
    if not event_id:
        raise HTTPException(status_code=400, detail="Square webhook event id is required")
    event = db.query(PaymentWebhookEvent).filter(PaymentWebhookEvent.event_id == event_id).with_for_update().first()
    if event and event.status == "processed":
        return {"status": "duplicate"}
    if event and event.status == "processing":
        # Square retries deliveries. A recent processing marker means another
        # worker owns this event; an old marker means that worker terminated
        # before completing and the event is safe to reclaim.
        lease_started = event.updated_at or event.received_at
        if lease_started and lease_started >= datetime.utcnow() - timedelta(minutes=5):
            return {"status": "duplicate"}
    if not event:
        event = PaymentWebhookEvent(
            provider="square",
            event_id=event_id,
            event_type=event_type or "unknown",
            payload_hash=hashlib.sha256(raw_body).hexdigest(),
            status="processing",
        )
        try:
            with db.begin_nested():
                db.add(event)
                db.flush()
        except IntegrityError:
            return {"status": "duplicate"}
    else:
        event.status = "processing"
        event.error_message = None
    db.commit()

    try:
        event_object = ((payload.get("data") or {}).get("object") or {})
        result = "ignored"
        if event_type in {"payment.created", "payment.updated"}:
            payment = event_object.get("payment") or {}
            if str(payment.get("status") or "").upper() == "COMPLETED":
                result = _sync_completed_payment(db, payment)
        elif event_type in {"refund.created", "refund.updated"}:
            refund = event_object.get("refund") or {}
            if str(refund.get("status") or "").upper() == "COMPLETED":
                result = _sync_completed_refund(db, refund)
    except Exception as exc:
        db.rollback()
        event = db.query(PaymentWebhookEvent).filter(PaymentWebhookEvent.event_id == event_id).with_for_update().first()
        event.status = "failed"
        event.error_message = str(exc)[:4000]
        db.commit()
        raise
    event = db.query(PaymentWebhookEvent).filter(PaymentWebhookEvent.event_id == event_id).with_for_update().first()
    event.status = "processed"
    event.processed_at = datetime.utcnow()
    db.commit()
    return {"status": result}
