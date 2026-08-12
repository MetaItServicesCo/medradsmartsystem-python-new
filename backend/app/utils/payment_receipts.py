"""Durable, retryable customer payment receipts.

Financial state is committed before SMTP is attempted. A unique
``(invoice_id, payment_reference)`` row makes queueing idempotent, while a
stable Message-ID helps receiving mail systems suppress a duplicate if a
worker exits after SMTP accepts a message but before the database is updated.
"""

from __future__ import annotations

import hashlib
import html
from datetime import datetime, timedelta
from decimal import Decimal
from typing import Any, Iterable, Optional

from sqlalchemy import or_
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.invoice import Invoice, InvoiceType, PaymentReceiptDelivery
from app.models.rental import Rental
from app.utils.email import send_html_email
from app.utils.invoice_ledger import add_invoice_transaction


RECEIPT_MAX_ATTEMPTS = 8
_RETRY_MINUTES = (15, 60, 360, 1440, 1440, 1440, 1440, 1440)


def _money(value: Any) -> Decimal:
    return Decimal(str(value or 0)).quantize(Decimal("0.01"))


def rental_receipt_recipients(rental: Optional[Rental], invoice: Invoice) -> list[str]:
    values: list[str] = [invoice.customer_email]
    if rental:
        values.append(rental.customer_email)
        for recipient in rental.secondary_recipients or []:
            if isinstance(recipient, dict):
                values.append(str(recipient.get("email") or ""))
            elif isinstance(recipient, str):
                values.append(recipient)
    return sorted({value.strip().lower() for value in values if value and "@" in value})


def queue_payment_receipt(
    db: Session,
    invoice: Invoice,
    *,
    payment_reference: str,
    amount: Any,
    payment_method: Optional[str] = None,
    recipients: Optional[Iterable[str]] = None,
    card_brand: Optional[str] = None,
    card_last4: Optional[str] = None,
) -> Optional[PaymentReceiptDelivery]:
    """Queue one receipt for one confirmed positive payment.

    Call this in the same transaction that records the payment. Duplicate
    provider callbacks and request replays return the existing delivery row.
    """
    reference = str(payment_reference or "").strip()
    amount_value = _money(amount)
    if not reference or amount_value <= 0:
        return None
    addresses = sorted({str(item).strip().lower() for item in (recipients or []) if item and "@" in str(item)})
    if not addresses:
        return None

    existing = (
        db.query(PaymentReceiptDelivery)
        .filter(
            PaymentReceiptDelivery.invoice_id == invoice.id,
            PaymentReceiptDelivery.payment_reference == reference,
        )
        .first()
    )
    if existing:
        return existing

    delivery = PaymentReceiptDelivery(
        invoice_id=invoice.id,
        payment_reference=reference,
        recipients=addresses,
        amount=amount_value,
        payment_method=payment_method or invoice.payment_method,
        card_brand=(card_brand or "").strip() or None,
        card_last4=(card_last4 or "").strip()[-4:] or None,
        status="pending",
        next_attempt_at=datetime.utcnow(),
    )
    db.add(delivery)
    try:
        db.flush()
    except IntegrityError:
        # This path is primarily for concurrent webhook/request delivery. The
        # caller's transaction may contain financial changes, so do not issue a
        # broad rollback here. PostgreSQL's unique lock normally means only one
        # caller reaches this block; callers should rely on their outer
        # idempotency guard. Re-raise to preserve transaction correctness.
        raise
    return delivery


def queue_rental_payment_receipt(
    db: Session,
    rental: Rental,
    invoice: Invoice,
    *,
    payment_reference: str,
    amount: Any,
    payment_method: Optional[str] = None,
    card_brand: Optional[str] = None,
    card_last4: Optional[str] = None,
) -> Optional[PaymentReceiptDelivery]:
    return queue_payment_receipt(
        db,
        invoice,
        payment_reference=payment_reference,
        amount=amount,
        payment_method=payment_method,
        recipients=rental_receipt_recipients(rental, invoice),
        card_brand=card_brand or rental.square_card_brand,
        card_last4=card_last4 or rental.square_card_last4,
    )


def _message_id(delivery: PaymentReceiptDelivery) -> str:
    digest = hashlib.sha256(
        f"{delivery.invoice_id}:{delivery.payment_reference}".encode("utf-8")
    ).hexdigest()[:32]
    sender = settings.SMTP_FROM_EMAIL or settings.SMTP_USER or "receipts@medcodesolution.com"
    domain = sender.rsplit("@", 1)[-1] if "@" in sender else "medcodesolution.com"
    return f"<payment-receipt-{digest}@{domain}>"


def _receipt_content(delivery: PaymentReceiptDelivery) -> tuple[str, str, str]:
    invoice = delivery.invoice
    rental = invoice.rental
    customer = html.escape(invoice.customer_name or "Customer")
    invoice_number = html.escape(invoice.invoice_number)
    agreement = html.escape(rental.rental_number) if rental else "—"
    amount = _money(delivery.amount)
    balance = _money(invoice.balance_due)
    method = (delivery.payment_method or "Payment").replace("_", " ").title()
    masked = ""
    if delivery.card_last4:
        brand = html.escape(delivery.card_brand or "Card")
        masked = f"{brand} ending {html.escape(delivery.card_last4)}"
    paid_at = (delivery.created_at or datetime.utcnow()).strftime("%B %d, %Y")
    subject = f"Payment receipt {invoice_number} — ${amount:,.2f}"
    payment_label = masked or html.escape(method)
    body = f"""
    <div style="background:#f6f4ff;padding:32px 12px;font-family:Inter,Arial,sans-serif;color:#1f1b4d">
      <div style="max-width:680px;margin:auto;background:#fff;border:1px solid #e5e0ff;border-radius:18px;overflow:hidden">
        <div style="padding:26px 30px;background:linear-gradient(135deg,#6d3ce7,#e7439a);color:#fff">
          <div style="font-size:13px;letter-spacing:.12em;text-transform:uppercase">Payment receipt</div>
          <h1 style="margin:8px 0 0;font-size:28px">Thank you for your payment</h1>
        </div>
        <div style="padding:30px">
          <p style="font-size:17px;margin-top:0">Hello {customer},</p>
          <p>Your payment was confirmed and applied to the invoice below.</p>
          <table role="presentation" style="width:100%;border-collapse:collapse;margin:24px 0;border:1px solid #e7e4f4">
            <tr><td style="padding:12px;border-bottom:1px solid #e7e4f4;color:#6b7280">Invoice</td><td style="padding:12px;border-bottom:1px solid #e7e4f4;text-align:right;font-weight:700">{invoice_number}</td></tr>
            <tr><td style="padding:12px;border-bottom:1px solid #e7e4f4;color:#6b7280">Rental agreement</td><td style="padding:12px;border-bottom:1px solid #e7e4f4;text-align:right">{agreement}</td></tr>
            <tr><td style="padding:12px;border-bottom:1px solid #e7e4f4;color:#6b7280">Payment date</td><td style="padding:12px;border-bottom:1px solid #e7e4f4;text-align:right">{paid_at}</td></tr>
            <tr><td style="padding:12px;border-bottom:1px solid #e7e4f4;color:#6b7280">Payment method</td><td style="padding:12px;border-bottom:1px solid #e7e4f4;text-align:right">{payment_label}</td></tr>
            <tr><td style="padding:14px;color:#6b7280">Amount received</td><td style="padding:14px;text-align:right;font-size:22px;font-weight:800;color:#059669">${amount:,.2f}</td></tr>
          </table>
          <p style="margin-bottom:4px"><strong>Remaining invoice balance:</strong> ${balance:,.2f}</p>
          <p style="color:#6b7280;font-size:13px">Reference: {html.escape(delivery.payment_reference)}</p>
          <p style="margin-top:26px">Mr. BioMed Tech Services</p>
        </div>
      </div>
    </div>
    """
    text = (
        f"Payment receipt\n\nHello {invoice.customer_name},\n"
        f"We received ${amount:,.2f} for invoice {invoice.invoice_number}.\n"
        f"Rental agreement: {rental.rental_number if rental else '-'}\n"
        f"Payment method: {masked or method}\nRemaining balance: ${balance:,.2f}\n"
        f"Reference: {delivery.payment_reference}\n\nMr. BioMed Tech Services"
    )
    return subject, body, text


def deliver_payment_receipt(db: Session, delivery_id: int) -> bool:
    # Lock only the outbox row. Eager-loading Invoice.rental here causes
    # SQLAlchemy to emit LEFT OUTER JOINs; PostgreSQL rejects an unqualified
    # FOR UPDATE when it would also lock the nullable side of those joins.
    # The relationships are loaded lazily after the claim is committed.
    delivery = (
        db.query(PaymentReceiptDelivery)
        .filter(PaymentReceiptDelivery.id == delivery_id)
        .with_for_update()
        .first()
    )
    if not delivery or delivery.status == "sent":
        return bool(delivery and delivery.status == "sent")
    if int(delivery.attempt_count or 0) >= RECEIPT_MAX_ATTEMPTS:
        return False

    delivery.status = "sending"
    delivery.attempt_count = int(delivery.attempt_count or 0) + 1
    delivery.updated_at = datetime.utcnow()
    delivery.next_attempt_at = None
    db.commit()

    subject, html_body, text_body = _receipt_content(delivery)
    delivered = send_html_email(
        delivery.recipients or [],
        subject,
        html_body,
        text_body,
        message_id=_message_id(delivery),
    )

    delivery = (
        db.query(PaymentReceiptDelivery)
        .filter(PaymentReceiptDelivery.id == delivery_id)
        .with_for_update()
        .first()
    )
    if delivered:
        delivery.status = "sent"
        delivery.sent_at = datetime.utcnow()
        delivery.last_error = None
        add_invoice_transaction(
            db,
            delivery.invoice,
            "payment_receipt_sent",
            0,
            delivery.payment_method,
            f"Payment receipt emailed to {', '.join(delivery.recipients or [])}",
            reference_prefix="RCT",
        )
    else:
        delivery.status = "failed"
        delay_index = min(max(delivery.attempt_count - 1, 0), len(_RETRY_MINUTES) - 1)
        delivery.next_attempt_at = datetime.utcnow() + timedelta(minutes=_RETRY_MINUTES[delay_index])
        delivery.last_error = "SMTP delivery failed or email is not configured"
    delivery.updated_at = datetime.utcnow()
    db.commit()
    return delivered


def deliver_due_payment_receipts(db: Session, limit: int = 50) -> dict[str, int]:
    """Deliver due receipts, reclaiming a worker attempt stuck for 15 minutes."""
    now = datetime.utcnow()
    stale = now - timedelta(minutes=15)
    rows = (
        db.query(PaymentReceiptDelivery.id)
        .join(Invoice, Invoice.id == PaymentReceiptDelivery.invoice_id)
        .filter(
            Invoice.invoice_type == InvoiceType.RENTAL,
            PaymentReceiptDelivery.attempt_count < RECEIPT_MAX_ATTEMPTS,
            or_(
                PaymentReceiptDelivery.status == "pending",
                (PaymentReceiptDelivery.status == "failed")
                & (PaymentReceiptDelivery.next_attempt_at <= now),
                (PaymentReceiptDelivery.status == "sending")
                & (PaymentReceiptDelivery.updated_at <= stale),
            ),
        )
        .order_by(PaymentReceiptDelivery.created_at.asc())
        .limit(limit)
        .all()
    )
    result = {"receipt_sent": 0, "receipt_failed": 0}
    for (delivery_id,) in rows:
        if deliver_payment_receipt(db, delivery_id):
            result["receipt_sent"] += 1
        else:
            result["receipt_failed"] += 1
    return result
