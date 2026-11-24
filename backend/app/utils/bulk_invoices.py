"""Bulk invoices: several invoices sent and paid as one (see app.models.bulk_invoice).

What a bulk invoice owes is what its invoices owe: while it is open, its total
is always worked out from them, so an invoice changed in Billing is reflected
at once. Payments are recorded on the bulk invoice alone. When it is paid in
full, each invoice is marked paid through Billing's one invoice-payment path
(_apply_invoice_payment_locked), so everything an invoice payment updates is
updated: its ledger and status, its service request's, sales quotation's or
rental's history, a sales invoice's stock and authorisation, a rental receipt.
That is done all together or not at all; if it cannot be done the money stays
recorded on the bulk invoice and staff are told, and can settle it again.

Card payments take the same care as an invoice's: the charge is on record
before Square is called, a retry never charges twice, nothing is recorded
unless Square completes that exact amount, and the webhook settles an
uncertain result. ACH, MBMTS ACH and cheque payments reported through the link
wait in Billing's review queue like any other until approved.
"""
from __future__ import annotations

import hashlib
import hmac
import base64
import html
import re
import secrets
from datetime import date, datetime, timedelta
from decimal import ROUND_HALF_UP, Decimal
from typing import Any, Callable, Iterable, Optional

from fastapi import HTTPException, UploadFile
from fastapi.concurrency import run_in_threadpool
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.bulk_invoice import BulkInvoice, BulkInvoicePayment, BulkInvoiceStatus
from app.models.facility import Facility
from app.models.invoice import Invoice, InvoiceStatus, InvoiceType, PaymentProof
from app.models.payment_operation import PaymentOperation
from app.models.user import User
from app.utils.bulk_invoice_lock import locking_bulk
from app.utils.card_fee import card_charge, card_fee_label, remember_card_charge, remembered_card_fee, succeeded_response
from app.utils.email import send_html_email
from app.utils.invoice_approval import BILLING_APPROVAL_APPROVED, invoice_requires_billing_approval
from app.utils.invoice_editing import editable_labels, editable_line_items, editable_summary_rows
from app.utils.notifications import notify_admins
from app.utils.payment_idempotency import (
    get_or_create_operation,
    mark_operation_failed,
    mark_operation_succeeded,
    payment_fingerprint,
    replay_or_raise,
)
from app.utils.payment_proofs import (
    PAYMENT_LINK,
    delete_payment_proof_file,
    payment_proof_sha256,
    read_and_validate_payment_proof,
    store_encrypted_payment_proof,
)

BULK_NUMBER_PREFIX = "INV-BULK-"
LEASE_INVOICE_PREFIX = "INV-LEASE-"
LINK_LIFETIME = timedelta(days=90)
OPEN_STATUSES = (BulkInvoiceStatus.DRAFT, BulkInvoiceStatus.SENT, BulkInvoiceStatus.PARTIALLY_PAID)
CARD_OPERATION = "square_bulk_invoice_payment"
MANUAL_OPERATION = "manual_bulk_invoice_payment"
LINK_METHODS = ("ach", "mbmts_ach", "cheque")
METHOD_LABELS = {
    "ach": "ACH",
    "mbmts_ach": "MBMTS ACH",
    "cheque": "Cheque",
    "check": "Cheque",
    "cash": "Cash",
    "bank_transfer": "Bank transfer",
    "credit_card": "Card",
    "square_card": "Card (Square)",
    "other": "Other",
}
# How a Super Admin says a bulk invoice was paid: Billing's Mark as Paid methods, and MBMTS ACH.
RECORD_METHODS = ("cheque", "ach", "mbmts_ach", "bank_transfer", "cash", "credit_card", "other")
TYPE_LABELS = {
    InvoiceType.SERVICE: "Service",
    InvoiceType.INSPECTION: "Inspection",
    InvoiceType.SALES: "Sales",
    InvoiceType.RENTAL: "Rental",
}
PAYMENT_IN_REVIEW = (
    "A payment for this bulk invoice is waiting for approval. "
    "No other payment can be made until it has been checked."
)
CARD_IN_PROGRESS = (
    "A card payment for this bulk invoice is being processed. "
    "No other payment can be made until it has finished."
)
REFERENCE_MAX = 100
_ADDRESS_PART = r'[^@\s,;:<>()\[\]"\\]+'
EMAIL_PATTERN = re.compile(rf"^{_ADDRESS_PART}@{_ADDRESS_PART}\.{_ADDRESS_PART}$")
CENT = Decimal("0.01")
ZERO = Decimal("0")


def money(value: Any) -> Decimal:
    if value in (None, ""):
        return ZERO
    return Decimal(str(value)).quantize(CENT, rounding=ROUND_HALF_UP)


def _status_value(value: Any) -> str:
    return value.value if hasattr(value, "value") else str(value or "")


def _type(invoice: Invoice) -> Optional[InvoiceType]:
    value = invoice.invoice_type
    if isinstance(value, InvoiceType):
        return value
    try:
        return InvoiceType(value)
    except ValueError:
        return None


def method_label(method: Optional[str]) -> str:
    return METHOD_LABELS.get((method or "").lower(), (method or "Payment").replace("_", " ").title())


# ---------------------------------------------------------------- what it holds


def facility_name(invoice: Invoice) -> str:
    return (invoice.facility.name if invoice.facility else None) or invoice.customer_name or "No facility"


def members(bulk: BulkInvoice) -> list[Invoice]:
    """Its invoices, by facility, then the oldest first."""
    return sorted(
        bulk.invoices or [],
        key=lambda invoice: (
            facility_name(invoice).lower(),
            invoice.issue_date or date.max,
            invoice.invoice_number or "",
        ),
    )


def counted(invoice: Invoice) -> bool:
    """A cancelled invoice is shown, but owes nothing."""
    return invoice.status != InvoiceStatus.CANCELLED


def bulk_total(bulk: BulkInvoice) -> Decimal:
    """What its invoices owe; once paid in full, what they owed then."""
    if bulk.status == BulkInvoiceStatus.PAID:
        return money(bulk.total_amount)
    return sum((money(invoice.balance_due) for invoice in bulk.invoices or [] if counted(invoice)), ZERO)


def bulk_balance(bulk: BulkInvoice) -> Decimal:
    return max(bulk_total(bulk) - money(bulk.amount_paid), ZERO)


def row_amount(bulk: BulkInvoice, invoice: Invoice) -> Decimal:
    """The invoice's line on the front page: what it owes, or what was paid on it."""
    settled = (bulk.settled_amounts or {}) if isinstance(bulk.settled_amounts, dict) else {}
    if str(invoice.id) in settled:
        return money(settled[str(invoice.id)])
    if not counted(invoice):
        return ZERO
    return money(invoice.balance_due)


def related_number(invoice: Invoice) -> Optional[str]:
    kind = _type(invoice)
    if kind == InvoiceType.SERVICE and invoice.service_request:
        return invoice.service_request.request_number
    if kind == InvoiceType.INSPECTION:
        if invoice.inspection_batch:
            return invoice.inspection_batch.batch_number
        if invoice.inspection:
            return invoice.inspection.inspection_number
    if kind == InvoiceType.SALES and invoice.sales_quotation:
        return invoice.sales_quotation.work_order or invoice.sales_quotation.quotation_number
    if kind == InvoiceType.RENTAL and invoice.rental:
        return invoice.rental.rental_number
    return None


def type_label(invoice: Invoice) -> str:
    return TYPE_LABELS.get(_type(invoice), "Invoice")


def is_lease_invoice(invoice: Invoice) -> bool:
    return (invoice.invoice_number or "").startswith(LEASE_INVOICE_PREFIX)


def is_auto_charge_rental(invoice: Invoice) -> bool:
    return _type(invoice) == InvoiceType.RENTAL and bool(invoice.rental and invoice.rental.auto_charge)


def needs_approval(invoice: Invoice) -> bool:
    return invoice_requires_billing_approval(invoice) and invoice.billing_approval_status != BILLING_APPROVAL_APPROVED


def busy_invoice_ids(db: Session, invoice_ids: Iterable[int]) -> dict[int, str]:
    """Invoices with a payment waiting for review, or a card charge under way."""
    ids = [invoice_id for invoice_id in invoice_ids if invoice_id is not None]
    if not ids:
        return {}
    busy: dict[int, str] = {}
    for (invoice_id,) in (
        db.query(PaymentOperation.invoice_id)
        .filter(PaymentOperation.invoice_id.in_(ids), PaymentOperation.status.in_(["processing", "unknown"]))
        .all()
    ):
        busy[invoice_id] = "A card payment is being processed"
    for (invoice_id,) in (
        db.query(PaymentProof.invoice_id)
        .filter(PaymentProof.invoice_id.in_(ids), PaymentProof.status == "pending_verification")
        .all()
    ):
        busy[invoice_id] = "A payment is waiting for review"
    return busy


def ineligibility(invoice: Invoice, bulk_id: Optional[int], busy: dict[int, str]) -> Optional[str]:
    """Why the invoice cannot be in this bulk invoice, or None."""
    if invoice.status == InvoiceStatus.CANCELLED:
        return "Cancelled"
    if invoice.status == InvoiceStatus.PAID or money(invoice.balance_due) <= 0:
        return "Already paid"
    if is_lease_invoice(invoice):
        return "Lease-to-own invoice: paid through its lease"
    if is_auto_charge_rental(invoice):
        return "Rental on automatic card charge"
    if needs_approval(invoice):
        return "Awaiting billing approval"
    other = locking_bulk(invoice)
    if other is not None and other.id != bulk_id:
        return f"In bulk invoice {other.bulk_number}"
    if invoice.id in busy:
        return busy[invoice.id]
    if (invoice.refund_status or "none") != "none":
        return "Has a refund in progress"
    return None


def invoice_summary(bulk: Optional[BulkInvoice], invoice: Invoice) -> dict[str, Any]:
    return {
        "id": invoice.id,
        "invoice_number": invoice.invoice_number,
        "invoice_type": _status_value(invoice.invoice_type),
        "type_label": type_label(invoice),
        "related_number": related_number(invoice),
        "facility_id": invoice.facility_id,
        "facility_name": facility_name(invoice),
        "customer_name": invoice.customer_name,
        "issue_date": invoice.issue_date,
        "due_date": invoice.due_date,
        "total_amount": f"{money(invoice.total_amount):.2f}",
        "amount_paid": f"{money(invoice.amount_paid):.2f}",
        "balance_due": f"{money(invoice.balance_due):.2f}",
        "amount": f"{(row_amount(bulk, invoice) if bulk is not None else money(invoice.balance_due)):.2f}",
        "status": _status_value(invoice.status),
    }


def facility_bill_to(facility: Optional[Facility]) -> Optional[dict[str, Any]]:
    """A facility's billing contact, for the Bill To of a bulk invoice."""
    if facility is None:
        return None
    billing_street = facility.billing_street
    return {
        "facility_id": facility.id,
        "name": facility.billing_name or facility.name,
        "email": facility.billing_email or facility.email,
        # The billing address if the facility has one, else its own: in parts, for the two-line print.
        "address": billing_street or facility.address,
        "suite": facility.billing_suite if billing_street else facility.suite,
        "city": (facility.billing_city if billing_street else None) or facility.city,
        "state": (facility.billing_state if billing_street else None) or facility.state,
        "zip_code": (facility.billing_zip_code if billing_street else None) or facility.zip_code,
        "country": facility.country,
    }


# ---------------------------------------------------------------- whether it can be paid


def bulk_busy(db: Session, bulk: BulkInvoice) -> Optional[str]:
    """A payment of it waiting for review, or a card charge under way."""
    if (
        db.query(PaymentProof.id)
        .filter(PaymentProof.bulk_invoice_id == bulk.id, PaymentProof.status == "pending_verification")
        .first()
    ):
        return PAYMENT_IN_REVIEW
    if (
        db.query(PaymentOperation.id)
        .filter(PaymentOperation.bulk_invoice_id == bulk.id, PaymentOperation.status.in_(["processing", "unknown"]))
        .first()
    ):
        return CARD_IN_PROGRESS
    return None


def being_updated(bulk: BulkInvoice) -> bool:
    """One of its invoices was changed and waits for billing approval again."""
    return any(needs_approval(invoice) for invoice in bulk.invoices or [] if counted(invoice))


def require_payable(db: Session, bulk: BulkInvoice, *, amount: Optional[Decimal] = None) -> Decimal:
    """The balance, if the bulk invoice can take a payment now; else why not."""
    if bulk.status == BulkInvoiceStatus.CANCELLED:
        raise HTTPException(status_code=409, detail="This bulk invoice has been cancelled")
    if bulk.status == BulkInvoiceStatus.PAID:
        raise HTTPException(status_code=409, detail="This bulk invoice is already paid")
    if being_updated(bulk):
        raise HTTPException(status_code=409, detail="This bulk invoice is being updated and cannot be paid right now")
    balance = bulk_balance(bulk)
    if balance <= 0:
        raise HTTPException(status_code=409, detail="This bulk invoice has no payable balance")
    blocked = bulk_busy(db, bulk)
    if blocked:
        raise HTTPException(status_code=409, detail=blocked)
    if amount is not None and amount >= balance:
        # Paying it in full marks its invoices paid: a sales invoice must still have its stock.
        from app.utils.sales_inventory import ensure_sales_inventory_available

        for invoice in bulk.invoices or []:
            if counted(invoice) and _type(invoice) == InvoiceType.SALES and money(invoice.balance_due) > 0:
                ensure_sales_inventory_available(db, invoice)
    return balance


# ---------------------------------------------------------------- the link


def _token_hash(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def _link_token(bulk_id: int, nonce: str) -> str:
    digest = hmac.new(
        settings.SECRET_KEY.encode("utf-8"),
        f"bulk-invoice-link:{bulk_id}:{nonce}".encode("utf-8"),
        hashlib.sha256,
    ).digest()
    return base64.urlsafe_b64encode(digest).decode("ascii").rstrip("=")


def link_url(token: str) -> str:
    return f"{settings.PUBLIC_APP_URL.rstrip('/')}/invoice/bulk/{token}"


def issue_link(bulk: BulkInvoice) -> str:
    """Its secure link, valid for 90 days from now; the same link while it lasts."""
    now = datetime.utcnow()
    if not bulk.public_link_nonce or not bulk.public_link_expires_at or bulk.public_link_expires_at <= now:
        bulk.public_link_nonce = secrets.token_urlsafe(32)
        bulk.public_link_hash = _token_hash(_link_token(bulk.id, bulk.public_link_nonce))
    bulk.public_link_expires_at = now + LINK_LIFETIME
    bulk.public_link_sent_at = now
    return link_url(_link_token(bulk.id, bulk.public_link_nonce))


def bulk_by_token(db: Session, token: str, *, for_update: bool = False) -> BulkInvoice:
    query = db.query(BulkInvoice).filter(BulkInvoice.public_link_hash == _token_hash(token))
    if for_update:
        query = query.with_for_update(of=BulkInvoice)
    bulk = query.first()
    if not bulk:
        raise HTTPException(status_code=404, detail="This invoice link is not valid")
    if not bulk.public_link_expires_at or bulk.public_link_expires_at <= datetime.utcnow():
        raise HTTPException(status_code=410, detail="This invoice link has expired. Please ask for a new one.")
    if bulk.status == BulkInvoiceStatus.CANCELLED:
        raise HTTPException(status_code=410, detail="This invoice has been cancelled")
    return bulk


# ---------------------------------------------------------------- its document


def _generic_document(invoice: Invoice) -> dict[str, Any]:
    """A sales or rental invoice, with the fields Billing prints it from."""
    return {
        "invoice_number": invoice.invoice_number,
        "invoice_type": _status_value(invoice.invoice_type),
        "related_number": related_number(invoice),
        "customer_name": invoice.customer_name,
        "customer_email": invoice.customer_email,
        "customer_phone": invoice.customer_phone,
        "customer_address": invoice.customer_address,
        "facility_name": invoice.facility.name if invoice.facility else None,
        "subtotal": f"{money(invoice.subtotal):.2f}",
        "tax_amount": f"{money(invoice.tax_amount):.2f}",
        "discount_amount": f"{money(invoice.discount_amount):.2f}",
        "total_amount": f"{money(invoice.total_amount):.2f}",
        "card_fee_amount": f"{money(invoice.card_fee_amount):.2f}",
        "amount_paid": f"{money(invoice.amount_paid):.2f}",
        "balance_due": f"{money(invoice.balance_due):.2f}",
        "status": _status_value(invoice.status),
        "issue_date": invoice.issue_date,
        "due_date": invoice.due_date,
        "created_at": invoice.created_at,
        "payment_method": invoice.payment_method,
        "line_items": editable_line_items(invoice.notes),
        "labels": editable_labels(invoice.notes),
        "summary_rows": editable_summary_rows(invoice.notes),
    }


def invoice_detail(db: Session, invoice: Invoice) -> dict[str, Any]:
    """One invoice, as its own page in the bulk invoice: exactly as it prints on its own."""
    kind = _type(invoice)
    if kind == InvoiceType.SERVICE and invoice.service_request_id:
        from app.api.v1.endpoints.service_invoice_portal import _document as service_document

        return {"kind": "service", "document": service_document(invoice)}
    if kind == InvoiceType.INSPECTION:
        from app.api.v1.endpoints.inspection_invoice_portal import _document as inspection_document

        document = inspection_document(db, invoice)
        if document is not None:
            return {"kind": "inspection", "document": document}
    return {"kind": _status_value(invoice.invoice_type) or "sales", "document": _generic_document(invoice)}


def payments_view(bulk: BulkInvoice, *, staff: bool) -> list[dict[str, Any]]:
    rows = []
    for payment in bulk.payments or []:
        row = {
            "id": payment.id,
            "paid_at": payment.created_at,
            "payment_method": payment.payment_method,
            "method_label": method_label(payment.payment_method),
            "amount": f"{money(payment.amount):.2f}",
            "card_fee_amount": f"{money(payment.card_fee_amount):.2f}",
            "reference_number": payment.reference_number,
            "card_brand": payment.card_brand,
            "card_last4": payment.card_last4,
        }
        if staff:
            row.update({
                "payer_name": payment.payer_name,
                "notes": payment.notes,
                "recorded_by": payment.created_by.full_name if payment.created_by else None,
                "payment_proof_id": payment.payment_proof_id,
            })
        rows.append(row)
    return rows


def bulk_document(db: Session, bulk: BulkInvoice, *, details: bool = True) -> dict[str, Any]:
    """The bulk invoice as it prints: the front page, then each invoice in full."""
    groups: list[dict[str, Any]] = []
    by_key: dict[str, dict[str, Any]] = {}
    ordered = members(bulk)
    for invoice in ordered:
        key = f"facility-{invoice.facility_id}" if invoice.facility_id else f"customer-{facility_name(invoice)}"
        group = by_key.get(key)
        if group is None:
            group = {"facility_id": invoice.facility_id, "facility_name": facility_name(invoice), "subtotal": ZERO, "invoices": []}
            by_key[key] = group
            groups.append(group)
        group["invoices"].append(invoice_summary(bulk, invoice))
        group["subtotal"] += row_amount(bulk, invoice)
    for group in groups:
        group["subtotal"] = f"{group['subtotal']:.2f}"
    dues = [invoice.due_date for invoice in ordered if counted(invoice) and invoice.due_date]
    total = bulk_total(bulk)
    return {
        "bulk_number": bulk.bulk_number,
        "status": bulk.status,
        "issue_date": bulk.issue_date or (bulk.created_at.date() if bulk.created_at else None),
        "due_date": min(dues) if dues else None,
        "note": bulk.note,
        "bill_to": {"name": bulk.bill_to_name, "email": bulk.bill_to_email, "address": bulk.bill_to_address},
        "groups": groups,
        "invoice_count": len(ordered),
        "facility_count": len(groups),
        "total_amount": f"{total:.2f}",
        "amount_paid": f"{money(bulk.amount_paid):.2f}",
        "card_fee_amount": f"{money(bulk.card_fee_amount):.2f}",
        "balance_due": f"{bulk_balance(bulk):.2f}",
        "payments": payments_view(bulk, staff=False),
        "invoices": [
            {"invoice_number": invoice.invoice_number, "type_label": type_label(invoice), **invoice_detail(db, invoice)}
            for invoice in ordered
        ] if details else [],
    }


# ---------------------------------------------------------------- recording payments


def _status_after_payment(bulk: BulkInvoice) -> str:
    return BulkInvoiceStatus.PARTIALLY_PAID if money(bulk.amount_paid) > 0 else bulk.status


def settle(db: Session, bulk: BulkInvoice, user: Optional[User]) -> list[Any]:
    """Mark every invoice paid, once the bulk invoice is paid in full.

    All of them or none: one that cannot be marked paid leaves every invoice
    as it was, the money recorded on the bulk invoice, and staff told. Returns
    the rental receipts to send once committed.
    """
    from app.api.v1.endpoints.billing import _apply_invoice_payment_locked

    if bulk_balance(bulk) > 0:
        return []
    total = bulk_total(bulk)
    payments = bulk.payments or []
    method = payments[-1].payment_method if payments else "other"
    summary = "; ".join(
        f"{method_label(payment.payment_method)} ${money(payment.amount):.2f}"
        + (f" ref {payment.reference_number}" if payment.reference_number else "")
        for payment in payments
    )
    ids = [invoice.id for invoice in bulk.invoices or [] if counted(invoice)]
    receipts: list[Any] = []
    settled: dict[str, str] = dict(bulk.settled_amounts or {}) if isinstance(bulk.settled_amounts, dict) else {}
    try:
        with db.begin_nested():
            locked = (
                db.query(Invoice).filter(Invoice.id.in_(ids)).order_by(Invoice.id).with_for_update().all()
                if ids else []
            )
            for invoice in locked:
                amount = money(invoice.balance_due)
                if invoice.status == InvoiceStatus.CANCELLED or amount <= 0:
                    continue
                _transaction, receipt = _apply_invoice_payment_locked(
                    db,
                    invoice,
                    amount=amount,
                    payment_method=method,
                    notes=f"Paid through bulk invoice {bulk.bulk_number}" + (f" ({summary})" if summary else ""),
                    user=user,
                )
                settled[str(invoice.id)] = f"{amount:.2f}"
                if receipt is not None:
                    receipts.append(receipt)
    except Exception as exc:  # noqa: BLE001 - the money is kept on the bulk invoice either way
        detail = exc.detail if isinstance(exc, HTTPException) else str(exc)
        bulk.settlement_error = str(detail)[:2000] or "Its invoices could not be marked paid"
        bulk.status = BulkInvoiceStatus.PAID
        bulk.total_amount = total
        bulk.paid_at = bulk.paid_at or datetime.utcnow()
        notify_admins(
            db,
            title="Bulk invoice needs attention",
            message=(
                f"{bulk.bulk_number} is paid in full, but its invoices could not be marked paid: "
                f"{bulk.settlement_error}. Open it in Billing and settle it."
            ),
            notification_type="billing",
            link_url=f"/billing?bulk={bulk.bulk_number}",
        )
        return []
    bulk.settled_amounts = settled
    bulk.settlement_error = None
    bulk.total_amount = total
    bulk.status = BulkInvoiceStatus.PAID
    bulk.paid_at = bulk.paid_at or datetime.utcnow()
    return receipts


def record_payment(
    db: Session,
    bulk: BulkInvoice,
    *,
    amount: Decimal,
    method: str,
    user: Optional[User],
    payer_name: Optional[str] = None,
    reference: Optional[str] = None,
    notes: Optional[str] = None,
    card_fee: Decimal = ZERO,
    card_brand: Optional[str] = None,
    card_last4: Optional[str] = None,
    proof: Optional[PaymentProof] = None,
    received: bool = False,
) -> tuple[BulkInvoicePayment, list[Any]]:
    """Record a payment on the bulk invoice; mark its invoices paid once it is paid in full.

    `received` is money already taken (a completed card charge): it is always
    recorded, and anything beyond the balance flagged for a refund review.
    """
    amount = money(amount)
    balance = bulk_balance(bulk)
    if amount <= 0:
        raise HTTPException(status_code=400, detail="Payment amount must be greater than zero")
    excess = ZERO
    if amount > balance:
        if not received:
            raise HTTPException(status_code=400, detail=f"The payment cannot be more than the balance, ${balance:.2f}")
        excess = amount - balance
    payment = BulkInvoicePayment(
        bulk_invoice_id=bulk.id,
        amount=amount - excess,
        card_fee_amount=money(card_fee),
        payment_method=method,
        reference_number=(reference or None),
        payer_name=(payer_name or None),
        notes=(notes or None),
        card_brand=card_brand,
        card_last4=card_last4,
        payment_proof_id=proof.id if proof is not None else None,
        created_by_id=user.id if user else None,
    )
    db.add(payment)
    bulk.payments.append(payment)
    bulk.amount_paid = money(bulk.amount_paid) + money(payment.amount)
    bulk.card_fee_amount = money(bulk.card_fee_amount) + money(card_fee)
    bulk.status = _status_after_payment(bulk)
    bulk.updated_at = datetime.utcnow()
    if excess > 0:
        notify_admins(
            db,
            title="Bulk invoice payment needs attention",
            message=(
                f"${amount:.2f} was received for {bulk.bulk_number}, ${excess:.2f} more than its balance "
                "(it changed while the card was charged). Review it for a refund."
            ),
            notification_type="billing",
            link_url=f"/billing?bulk={bulk.bulk_number}",
        )
    db.flush()
    receipts = settle(db, bulk, user) if bulk_balance(bulk) <= 0 else []
    return payment, receipts


def deliver_receipts(db: Session, receipts: list[Any]) -> None:
    from app.utils.payment_receipts import deliver_payment_receipt

    for receipt in receipts:
        try:
            deliver_payment_receipt(db, receipt.id)
        except Exception:  # noqa: BLE001 - a receipt never undoes a payment
            pass


def email_receipt(bulk: BulkInvoice, payment: BulkInvoicePayment, recipients: Iterable[Optional[str]]) -> None:
    """A short receipt for a payment on the bulk invoice. Best effort, after commit."""
    addresses = sorted({address for address in recipients if address and EMAIL_PATTERN.match(address)})
    if not addresses:
        return
    number = html.escape(bulk.bulk_number)
    paid = money(payment.amount) + money(payment.card_fee_amount)
    balance = bulk_balance(bulk)
    status_line = "It is now paid in full. Thank you." if balance <= 0 else f"Balance remaining: ${balance:,.2f}."
    try:
        send_html_email(
            addresses,
            f"Payment received for invoice {bulk.bulk_number}",
            (
                f"<p>Hello {html.escape(bulk.bill_to_name or 'there')},</p>"
                f"<p>We received your payment of <strong>${paid:,.2f}</strong> "
                f"({html.escape(method_label(payment.payment_method))}) for invoice <strong>{number}</strong>.</p>"
                f"<p>{html.escape(status_line)}</p>"
            ),
            (
                f"Hello {bulk.bill_to_name or 'there'},\n\nWe received your payment of ${paid:,.2f} "
                f"({method_label(payment.payment_method)}) for invoice {bulk.bulk_number}.\n{status_line}"
            ),
        )
    except Exception:  # noqa: BLE001 - email never undoes a payment
        pass


# ---------------------------------------------------------------- by card, through Square


def take_card_payment(
    db: Session,
    bulk: BulkInvoice,
    *,
    source_id: str,
    idempotency_key: str,
    payer_name: str,
    charge_amount: Optional[Decimal],
    actor: Optional[User],
) -> BulkInvoice:
    """Charge the balance, plus the card fee, once; record it. The bulk invoice is locked by the caller."""
    from app.utils.square_payments import (
        SquareConfigurationError,
        SquareRequestError,
        create_square_payment,
        minor_units_to_amount,
    )

    if bulk.status == BulkInvoiceStatus.PAID:
        return bulk
    balance = require_payable(db, bulk, amount=bulk_balance(bulk))
    charge = card_charge(balance)
    if charge_amount is not None and money(charge_amount) != charge.total:
        raise HTTPException(status_code=409, detail=f"The amount due has changed to ${charge.total:.2f}. Review it and pay again.")
    payer = (payer_name or "").strip()
    operation, replay = get_or_create_operation(
        db,
        idempotency_key=idempotency_key,
        fingerprint=payment_fingerprint(
            CARD_OPERATION,
            amount=charge.total,
            currency=settings.SQUARE_CURRENCY,
            attributes={"bulk_invoice_id": bulk.id, "payer_name": payer, "card_fee": f"{charge.fee:.2f}"},
        ),
        operation_type=CARD_OPERATION,
        bulk_invoice_id=bulk.id,
        amount=charge.total,
        currency=settings.SQUARE_CURRENCY,
        provider="square",
        created_by_id=actor.id if actor else None,
    )
    if replay:
        replay_or_raise(operation)
        db.refresh(bulk)
        return bulk
    remember_card_charge(operation, charge)

    bulk_id, bulk_number, operation_id = bulk.id, bulk.bulk_number, operation.id
    customer_email = bulk.public_link_email or bulk.bill_to_email
    # On record before Square is called: an uncertain answer is settled later, never charged twice.
    db.commit()
    try:
        square_payment = create_square_payment(
            source_id=source_id,
            idempotency_key=idempotency_key,
            amount=charge.total,
            invoice_number=bulk_number,
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

    bulk = db.query(BulkInvoice).filter(BulkInvoice.id == bulk_id).populate_existing().with_for_update().first()
    operation = db.query(PaymentOperation).filter(PaymentOperation.id == operation_id).with_for_update().first()
    payment_id = str(square_payment.get("id") or "").strip()
    payment_status = str(square_payment.get("status") or "").upper()
    money_block = square_payment.get("amount_money") or {}
    square_amount = minor_units_to_amount(money_block.get("amount"))
    square_currency = str(money_block.get("currency") or "").upper()
    if payment_status != "COMPLETED":
        mark_operation_failed(operation, f"Square payment status was {payment_status or 'unknown'}", unknown=True)
        db.commit()
        raise HTTPException(status_code=409, detail=f"Square payment is {payment_status.lower() or 'not completed'}")
    if square_amount != charge.total or square_currency != (settings.SQUARE_CURRENCY.strip().upper() or "USD"):
        mark_operation_failed(operation, "Square returned an unexpected amount or currency", unknown=True)
        db.commit()
        raise HTTPException(status_code=409, detail="Square completed an unexpected amount or currency; the invoice was not changed")
    if db.query(BulkInvoicePayment.id).filter(BulkInvoicePayment.reference_number == payment_id).first():
        # Already recorded (the webhook got there first).
        mark_operation_succeeded(operation, provider_reference=payment_id,
                                 response_data=succeeded_response(operation, {"bulk_invoice_id": bulk.id, "payment_id": payment_id}))
        db.commit()
        db.refresh(bulk)
        return bulk

    card = (square_payment.get("card_details") or {}).get("card") or {}
    payment, receipts = record_payment(
        db,
        bulk,
        amount=charge.base,
        method="square_card",
        user=actor,
        payer_name=payer,
        reference=payment_id,
        notes=f"Card payment by {payer} through Square: ${charge.base:.2f} + {card_fee_label()} ${charge.fee:.2f}",
        card_fee=charge.fee,
        card_brand=card.get("card_brand"),
        card_last4=card.get("last_4"),
        received=True,
    )
    mark_operation_succeeded(operation, provider_reference=payment_id,
                             response_data=succeeded_response(operation, {"bulk_invoice_id": bulk.id, "payment_id": payment_id}))
    notify_admins(
        db,
        title="Bulk invoice payment completed",
        message=f"{payer} paid ${square_amount:.2f} by card through Square for bulk invoice {bulk.bulk_number}.",
        notification_type="billing",
        link_url=f"/billing?bulk={bulk.bulk_number}",
        actor_id=actor.id if actor else None,
    )
    db.commit()
    deliver_receipts(db, receipts)
    db.refresh(bulk)
    email_receipt(bulk, payment, [bulk.public_link_email, bulk.bill_to_email])
    return bulk


def sync_webhook_payment(db: Session, bulk: BulkInvoice, payment: dict[str, Any], payment_id: str) -> str:
    """A bulk invoice's card payment whose result its request never saw.

    Recorded only when it matches a card charge of that bulk invoice still
    awaiting its result, for the same amount; that charge says what fee was in it.
    """
    from app.utils.square_payments import minor_units_to_amount

    if db.query(BulkInvoicePayment.id).filter(BulkInvoicePayment.reference_number == payment_id).first():
        return "duplicate"
    if bulk.status == BulkInvoiceStatus.CANCELLED:
        return "ignored"
    amount = minor_units_to_amount((payment.get("amount_money") or {}).get("amount"))
    currency = str((payment.get("amount_money") or {}).get("currency") or "").upper()
    if amount <= 0 or currency != (settings.SQUARE_CURRENCY.strip().upper() or "USD"):
        return "ignored"
    operation = (
        db.query(PaymentOperation)
        .filter(PaymentOperation.provider_reference == payment_id, PaymentOperation.bulk_invoice_id == bulk.id)
        .with_for_update()
        .first()
    ) or (
        db.query(PaymentOperation)
        .filter(
            PaymentOperation.bulk_invoice_id == bulk.id,
            PaymentOperation.operation_type == CARD_OPERATION,
            PaymentOperation.status.in_(["processing", "unknown"]),
            PaymentOperation.amount == amount,
        )
        .with_for_update()
        .first()
    )
    if operation is None:
        return "ignored"
    fee = remembered_card_fee(operation) or ZERO
    base = amount - fee if amount > fee else amount
    card = (payment.get("card_details") or {}).get("card") or {}
    _payment, receipts = record_payment(
        db,
        bulk,
        amount=base,
        method="square_card",
        user=None,
        payer_name=None,
        reference=payment_id,
        notes="Card payment synchronized from Square",
        card_fee=fee if amount > fee else ZERO,
        card_brand=card.get("card_brand"),
        card_last4=card.get("last_4"),
        received=True,
    )
    mark_operation_succeeded(operation, provider_reference=payment_id,
                             response_data=succeeded_response(operation, {"bulk_invoice_id": bulk.id, "payment_id": payment_id}))
    db.commit()
    deliver_receipts(db, receipts)
    return "processed"


# ---------------------------------------------------------------- reported through the link


def _clean(value: Optional[str], limit: int) -> str:
    return " ".join((value or "").split())[:limit]


async def report_link_payment(
    db: Session,
    *,
    load_bulk: Callable[[], BulkInvoice],
    respond: Callable[[BulkInvoice], dict[str, Any]],
    payment_method: str,
    amount: Any,
    payer_name: Optional[str],
    payer_email: Optional[str],
    reference: Optional[str],
    notes: Optional[str],
    proof_file: Optional[UploadFile],
) -> dict[str, Any]:
    """An ACH, MBMTS ACH or cheque payment of the bulk invoice, for Billing to check before it counts."""
    method = (payment_method or "").strip().lower().replace(" ", "_")
    method = "cheque" if method == "check" else method
    if method not in LINK_METHODS:
        raise HTTPException(status_code=422, detail="Choose ACH, MBMTS ACH or Cheque")
    amount = money(amount)
    if amount <= 0:
        raise HTTPException(status_code=400, detail="Payment amount must be greater than zero")
    name = _clean(payer_name, 200)
    if len(name) < 2:
        raise HTTPException(status_code=422, detail="Enter your name")
    email = (payer_email or "").strip()[:320] or None
    if email and not EMAIL_PATTERN.match(email):
        raise HTTPException(status_code=422, detail="Enter a valid email address, or leave it empty")
    reference = _clean(reference, REFERENCE_MAX) or None
    note = (notes or "").strip()[:1000] or None
    has_file = proof_file is not None and bool(proof_file.filename)
    if not has_file and not reference:
        raise HTTPException(
            status_code=422,
            detail=f"Attach the {'cheque' if method == 'cheque' else 'payment'} proof, or enter its reference number",
        )
    data = mime_type = original_name = sha256 = None
    if has_file:
        data, mime_type, original_name = await read_and_validate_payment_proof(proof_file)
        sha256 = payment_proof_sha256(data)
    return await run_in_threadpool(
        _record_reported,
        db,
        load_bulk=load_bulk,
        respond=respond,
        method=method,
        amount=amount,
        name=name,
        email=email,
        reference=reference,
        note=note,
        data=data,
        mime_type=mime_type,
        original_name=original_name,
        sha256=sha256,
    )


def _record_reported(
    db: Session,
    *,
    load_bulk: Callable[[], BulkInvoice],
    respond: Callable[[BulkInvoice], dict[str, Any]],
    method: str,
    amount: Decimal,
    name: str,
    email: Optional[str],
    reference: Optional[str],
    note: Optional[str],
    data: Optional[bytes],
    mime_type: Optional[str],
    original_name: Optional[str],
    sha256: Optional[str],
) -> dict[str, Any]:
    bulk = load_bulk()
    if sha256:
        # The same file and amount sent again (a double click, a retry): already received.
        duplicate = (
            db.query(PaymentProof.id)
            .filter(
                PaymentProof.bulk_invoice_id == bulk.id,
                PaymentProof.sha256 == sha256,
                PaymentProof.claimed_amount == amount,
                PaymentProof.status.in_(["pending_verification", "approved"]),
            )
            .first()
        )
        if duplicate:
            return respond(bulk)
    balance = require_payable(db, bulk)
    if amount > balance:
        raise HTTPException(status_code=400, detail=f"The payment cannot be more than the balance, ${balance:.2f}")
    label = METHOD_LABELS[method]
    summary = "; ".join(part for part in [
        f"Sent through the bulk invoice link by {name}" + (f" <{email}>" if email else ""),
        f"Reference {reference}" if reference else None,
        note,
    ] if part)
    stored_name = storage_backend = None
    if data is not None:
        stored_name, storage_backend = store_encrypted_payment_proof(data)
    proof = PaymentProof(
        bulk_invoice_id=bulk.id,
        submitted_by_id=None,
        submitted_via=PAYMENT_LINK,
        payer_name=name,
        payer_email=email,
        payer_reference=reference,
        payment_method=method,
        claimed_amount=amount,
        notes=summary,
        original_filename=original_name,
        stored_filename=stored_name,
        storage_backend=storage_backend or "none",
        mime_type=mime_type,
        file_size=len(data) if data is not None else None,
        sha256=sha256,
        status="pending_verification",
        extraction_status="queued" if data is not None else "not_applicable",
        extraction_next_attempt_at=datetime.utcnow() if data is not None else None,
        extracted_data={},
        mismatch_flags=[],
        requires_manual_review=True,
    )
    try:
        db.add(proof)
        db.flush()
        notify_admins(
            db,
            title="Payment proof awaiting review",
            message=f"Bulk invoice {bulk.bulk_number}: {label} for ${amount} sent through its link by {name}",
            notification_type="billing",
            link_url=f"/billing?bulk={bulk.bulk_number}",
        )
        db.commit()
    except Exception:
        db.rollback()
        if stored_name:
            delete_payment_proof_file(stored_name, storage_backend)
        raise
    db.refresh(bulk)
    return respond(bulk)


def approve_reported(db: Session, proof: PaymentProof, user: User, notes: Optional[str]) -> None:
    """Billing approves a payment reported for a bulk invoice: it is recorded on the bulk invoice."""
    bulk = db.query(BulkInvoice).filter(BulkInvoice.id == proof.bulk_invoice_id).with_for_update().first()
    if bulk is None:
        raise HTTPException(status_code=404, detail="Bulk invoice not found")
    if bulk.status == BulkInvoiceStatus.CANCELLED:
        raise HTTPException(status_code=409, detail="This bulk invoice has been cancelled; the payment cannot be recorded on it")
    if bulk.status == BulkInvoiceStatus.PAID:
        raise HTTPException(status_code=409, detail="This bulk invoice is already paid in full")
    amount = money(proof.claimed_amount)
    balance = bulk_balance(bulk)
    if amount > balance:
        raise HTTPException(
            status_code=409,
            detail=f"The reported ${amount:.2f} is more than the bulk invoice's balance, ${balance:.2f}. Reject it, or ask for a corrected payment.",
        )
    if amount >= balance:
        from app.utils.sales_inventory import ensure_sales_inventory_available

        for invoice in bulk.invoices or []:
            if counted(invoice) and _type(invoice) == InvoiceType.SALES and money(invoice.balance_due) > 0:
                ensure_sales_inventory_available(db, invoice)
    payment, receipts = record_payment(
        db,
        bulk,
        amount=amount,
        method=proof.payment_method,
        user=user,
        payer_name=proof.payer_name,
        reference=proof.payer_reference or f"PRF-{proof.id}",
        notes=notes or proof.notes or f"Approved payment proof #{proof.id}",
        card_brand=proof.card_brand,
        card_last4=proof.card_last4,
        proof=proof,
    )
    proof.status = "approved"
    proof.reviewed_by_id = user.id
    proof.reviewed_at = datetime.utcnow()
    proof.review_notes = notes
    proof.updated_at = datetime.utcnow()
    recipients = [proof.payer_email, bulk.public_link_email, bulk.bill_to_email]
    db.commit()
    deliver_receipts(db, receipts)
    db.refresh(bulk)
    email_receipt(bulk, payment, recipients)
