from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import Any

from fastapi import APIRouter, Depends, Header, HTTPException, Request
from sqlalchemy.orm import Session
from sqlalchemy.orm.attributes import flag_modified

from app.core.config import settings
from app.db.base import get_db
from app.models.invoice import Invoice, InvoiceStatus, InvoiceTransaction
from app.utils.invoice_ledger import (
    add_invoice_transaction,
    record_payment_delta,
    record_status_change,
)
from app.utils.square_payments import minor_units_to_amount, verify_square_webhook_signature


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
    record_status_change(
        db,
        invoice,
        previous_status,
        None,
        "Invoice status synchronized from Square webhook",
    )
    _sync_source_after_payment(invoice, applied_amount, payment_id)
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
    event_object = ((payload.get("data") or {}).get("object") or {})
    if event_type in {"payment.created", "payment.updated"}:
        payment = event_object.get("payment") or {}
        if str(payment.get("status") or "").upper() == "COMPLETED":
            return {"status": _sync_completed_payment(db, payment)}
    if event_type in {"refund.created", "refund.updated"}:
        refund = event_object.get("refund") or {}
        if str(refund.get("status") or "").upper() == "COMPLETED":
            return {"status": _sync_completed_refund(db, refund)}
    return {"status": "ignored"}
