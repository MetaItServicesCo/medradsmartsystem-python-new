"""Single source of truth for issuing refunds against an invoice.

Both Sales and Rentals refund through here so the behaviour is identical everywhere:
a real Square refund is executed when the invoice was card-paid online (the Square
payment_id is captured as the paying transaction's ``reference_number``), otherwise the
refund is recorded as an offline/manual bookkeeping entry. Either way the invoice's
``refunded_amount`` / ``refund_status`` are updated and a ``refund`` ledger transaction is
written. Square-executed refunds tie the ledger transaction to the Square refund id so the
webhook (`_sync_completed_refund`) de-duplicates the later refund event.
"""

from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import Any, Optional

from sqlalchemy.orm import Session

from app.models.invoice import Invoice, InvoiceTransaction
from app.models.user import User
from app.utils.invoice_ledger import add_invoice_transaction
from app.utils.square_payments import (
    amount_to_minor_units,
    create_square_refund,
    square_is_configured,
)


def _money(value: Any) -> Decimal:
    if value in (None, ""):
        return Decimal("0")
    return Decimal(str(value))


def _card_payment_for(db: Session, invoice: Invoice) -> Optional[InvoiceTransaction]:
    """The most recent Square card payment on this invoice (identified by a stored
    payment_id), or None when the invoice was paid offline / has no online payment."""
    return (
        db.query(InvoiceTransaction)
        .filter(
            InvoiceTransaction.invoice_id == invoice.id,
            InvoiceTransaction.transaction_type == "payment",
            InvoiceTransaction.reference_number.isnot(None),
        )
        .order_by(InvoiceTransaction.id.desc())
        .first()
    )


def _apply_refund_to_invoice(
    db: Session,
    invoice: Invoice,
    amount: Decimal,
    method: str,
    description: str,
    user: Optional[User],
    reference: Optional[str] = None,
) -> InvoiceTransaction:
    invoice.refunded_amount = _money(invoice.refunded_amount) + _money(amount)
    invoice.refund_status = (
        "refunded"
        if _money(invoice.refunded_amount) >= _money(invoice.amount_paid)
        else "partially_refunded"
    )
    invoice.updated_at = datetime.utcnow()
    transaction = add_invoice_transaction(db, invoice, "refund", amount, method, description, user, "REF")
    if reference:
        transaction.reference_number = reference
    return transaction


def execute_square_invoice_refund(
    db: Session,
    invoice: Invoice,
    amount: Decimal,
    *,
    user: Optional[User] = None,
    reason: Optional[str] = None,
    description: Optional[str] = None,
    idempotency_key: Optional[str] = None,
) -> Optional[str]:
    """Refund `amount` to the Square card that paid this invoice.

    Returns the Square refund id when a real refund was executed (ledger + invoice updated),
    or None when the invoice has no online card payment (nothing is recorded — the caller
    decides whether to fall back to a manual entry). Raises ``SquareRequestError`` if a
    Square refund is attempted and declined.
    """
    amount = _money(amount)
    if amount <= 0:
        return None
    source_payment = _card_payment_for(db, invoice)
    if source_payment is None or not square_is_configured():
        return None
    existing_refunded = _money(invoice.refunded_amount)
    refund = create_square_refund(
        payment_id=source_payment.reference_number,
        # Stable per refund step: a retry of a failed call reuses the key (Square de-dups),
        # while a genuine second refund carries a higher running total and a fresh key.
        idempotency_key=idempotency_key or (
            f"invoice-refund-{invoice.id}-{amount_to_minor_units(existing_refunded)}"
            f"-{amount_to_minor_units(amount)}"
        ),
        amount=amount,
        reason=reason or f"Refund for {invoice.invoice_number}",
    )
    refund_id = refund.get("id")
    base_description = description or f"Refund issued for {invoice.invoice_number}"
    _apply_refund_to_invoice(
        db,
        invoice,
        amount,
        "square_card",
        f"{base_description} ({refund_id})",
        user,
        reference=refund_id,
    )
    return refund_id


def record_manual_invoice_refund(
    db: Session,
    invoice: Invoice,
    amount: Decimal,
    *,
    payment_method: Optional[str] = None,
    user: Optional[User] = None,
    description: Optional[str] = None,
) -> InvoiceTransaction:
    """Record an offline/manual refund of `amount` (no Square call): the money was returned
    outside the system (cash, cheque, or a manual card refund), and this is the bookkeeping."""
    amount = _money(amount)
    source_payment = _card_payment_for(db, invoice)
    base_description = description or f"Refund issued for {invoice.invoice_number}"
    if source_payment is not None and source_payment.reference_number:
        base_description = f"{base_description} (against {source_payment.reference_number})"
    return _apply_refund_to_invoice(
        db,
        invoice,
        amount,
        payment_method or invoice.payment_method or "manual",
        base_description,
        user,
    )


def issue_invoice_refund(
    db: Session,
    invoice: Invoice,
    amount: Decimal,
    *,
    payment_method: Optional[str] = None,
    notes: Optional[str] = None,
    user: Optional[User] = None,
    idempotency_key: Optional[str] = None,
) -> dict[str, Any]:
    """Explicit staff refund used by the Sales and Rentals "Record Refund" actions.

    Executes a real Square refund when the invoice was card-paid online, otherwise records a
    manual/offline refund. Raises ``SquareRequestError`` if a Square refund is declined (the
    endpoint surfaces it so the user knows the money did not move). The caller is responsible
    for validating `amount` against the refundable balance and for locking the invoice row.
    """
    amount = _money(amount)
    refund_id = execute_square_invoice_refund(
        db,
        invoice,
        amount,
        user=user,
        reason=notes or f"Refund for {invoice.invoice_number}",
        description=notes or f"Refund issued for {invoice.invoice_number}",
        idempotency_key=idempotency_key,
    )
    if refund_id:
        return {"method": "square_card", "square_refund_id": refund_id, "amount": str(amount)}
    transaction = record_manual_invoice_refund(
        db,
        invoice,
        amount,
        payment_method=payment_method,
        user=user,
        description=notes,
    )
    return {
        "method": transaction.payment_method or "manual",
        "square_refund_id": None,
        "amount": str(amount),
    }
