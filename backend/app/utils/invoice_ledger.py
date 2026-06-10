from decimal import Decimal
from typing import Any, Optional

from sqlalchemy.orm import Session

from app.models.invoice import Invoice, InvoiceTransaction
from app.models.user import User


def _money(value: Any) -> Decimal:
    if value in (None, ""):
        return Decimal("0")
    return Decimal(str(value))


def _reference(db: Session, invoice: Invoice, prefix: str) -> str:
    count = db.query(InvoiceTransaction.id).filter(InvoiceTransaction.invoice_id == invoice.id).count()
    return f"{prefix}-{invoice.invoice_number}-{count + 1:02d}"


def transaction_response(transaction: InvoiceTransaction) -> dict[str, Any]:
    return {
        "id": transaction.id,
        "invoice_id": transaction.invoice_id,
        "facility_id": transaction.facility_id,
        "transaction_type": transaction.transaction_type,
        "amount": transaction.amount,
        "payment_method": transaction.payment_method,
        "reference_number": transaction.reference_number,
        "description": transaction.description,
        "created_by_id": transaction.created_by_id,
        "created_by_name": transaction.created_by.full_name if transaction.created_by else None,
        "created_at": transaction.created_at,
    }


def add_invoice_transaction(
    db: Session,
    invoice: Invoice,
    transaction_type: str,
    amount: Any = 0,
    payment_method: Optional[str] = None,
    description: Optional[str] = None,
    user: Optional[User] = None,
    reference_prefix: str = "TXN",
) -> InvoiceTransaction:
    transaction = InvoiceTransaction(
        invoice_id=invoice.id,
        facility_id=invoice.facility_id,
        transaction_type=transaction_type,
        amount=_money(amount),
        payment_method=payment_method,
        reference_number=_reference(db, invoice, reference_prefix),
        description=description,
        created_by_id=user.id if user else None,
    )
    db.add(transaction)
    return transaction


def record_invoice_created(db: Session, invoice: Invoice, user: Optional[User], description: Optional[str] = None) -> InvoiceTransaction:
    return add_invoice_transaction(
        db,
        invoice,
        "invoice_created",
        invoice.total_amount,
        invoice.payment_method,
        description or f"Invoice {invoice.invoice_number} created",
        user,
        "INV",
    )


def record_payment_delta(
    db: Session,
    invoice: Invoice,
    previous_paid: Any,
    new_paid: Any,
    user: Optional[User],
    payment_method: Optional[str] = None,
    description: Optional[str] = None,
) -> Optional[InvoiceTransaction]:
    delta = _money(new_paid) - _money(previous_paid)
    if delta == 0:
        return None
    if delta > 0:
        return add_invoice_transaction(
            db,
            invoice,
            "payment",
            delta,
            payment_method or invoice.payment_method,
            description or f"Payment recorded against {invoice.invoice_number}",
            user,
            "PAY",
        )
    return add_invoice_transaction(
        db,
        invoice,
        "refund",
        abs(delta),
        payment_method or invoice.payment_method,
        description or f"Payment refund/adjustment recorded against {invoice.invoice_number}",
        user,
        "REF",
    )


def record_status_change(
    db: Session,
    invoice: Invoice,
    previous_status: Any,
    user: Optional[User],
    description: Optional[str] = None,
) -> Optional[InvoiceTransaction]:
    new_status = invoice.status.value if hasattr(invoice.status, "value") else invoice.status
    old_status = previous_status.value if hasattr(previous_status, "value") else previous_status
    if old_status == new_status:
        return None
    return add_invoice_transaction(
        db,
        invoice,
        "status_change",
        0,
        invoice.payment_method,
        description or f"Invoice status changed from {old_status} to {new_status}",
        user,
        "STS",
    )
