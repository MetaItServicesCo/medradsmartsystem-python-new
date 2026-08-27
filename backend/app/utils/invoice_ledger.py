import json
from decimal import Decimal
from typing import Any, Optional

from sqlalchemy.orm import Session

from app.models.invoice import Invoice, InvoiceTransaction
from app.models.user import User
from app.utils.invoice_editing import editable_line_items, editable_summary_rows


def _money(value: Any) -> Decimal:
    if value in (None, ""):
        return Decimal("0")
    return Decimal(str(value))


def _reference(db: Session, invoice: Invoice, prefix: str) -> str:
    count = db.query(InvoiceTransaction.id).filter(InvoiceTransaction.invoice_id == invoice.id).count()
    pending = sum(
        1 for item in getattr(db, "new", ())
        if isinstance(item, InvoiceTransaction) and item.invoice_id == invoice.id
    )
    return f"{prefix}-{invoice.invoice_number}-{count + pending + 1:02d}"


def transaction_response(transaction: InvoiceTransaction) -> dict[str, Any]:
    return {
        "id": transaction.id,
        "invoice_id": transaction.invoice_id,
        "facility_id": transaction.facility_id,
        "transaction_type": transaction.transaction_type,
        "amount": transaction.amount,
        "payment_method": transaction.payment_method,
        "card_brand": getattr(transaction, "card_brand", None),
        "card_last4": getattr(transaction, "card_last4", None),
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


# ---------------------------------------------------------------------------
# Invoice edit audit trail
# ---------------------------------------------------------------------------
_EDIT_TRACKED_FIELDS = [
    ("subtotal", "Subtotal"),
    ("tax_amount", "Tax"),
    ("discount_amount", "Discount"),
]


def _fmt_money(value: Any) -> str:
    return f"${_money(value):,.2f}"


def _item_label(item: Any) -> str:
    if isinstance(item, dict):
        for key in ("description", "name", "label", "item", "title"):
            value = item.get(key)
            if value is not None and str(value).strip():
                return str(value).strip()
    return "Item"


def _item_amount(item: Any) -> Optional[Decimal]:
    if not isinstance(item, dict):
        return None
    for key in ("total", "amount", "line_total", "subtotal"):
        if item.get(key) not in (None, ""):
            return _money(item[key])
    quantity = next((item[k] for k in ("quantity", "qty") if item.get(k) not in (None, "")), None)
    unit = next((item[k] for k in ("unit_price", "unitPrice", "price", "rate") if item.get(k) not in (None, "")), None)
    if quantity is not None and unit is not None:
        return _money(quantity) * _money(unit)
    return None


def _item_summary(item: Any) -> str:
    label = _item_label(item)
    amount = _item_amount(item)
    return f"{label} ({_fmt_money(amount)})" if amount is not None else label


def _index_by_label(items: Any) -> dict[str, Any]:
    indexed: dict[str, Any] = {}
    for item in items or []:
        if not isinstance(item, dict):
            continue
        label = _item_label(item)
        key = label
        suffix = 1
        while key in indexed:
            suffix += 1
            key = f"{label} #{suffix}"
        indexed[key] = item
    return indexed


def _diff_items(before: Any, after: Any, noun: str) -> list[str]:
    before_map = _index_by_label(before)
    after_map = _index_by_label(after)
    lines: list[str] = []
    for key, item in after_map.items():
        if key not in before_map:
            lines.append(f"Added {noun} — {_item_summary(item)}")
        elif json.dumps(item, sort_keys=True, default=str) != json.dumps(before_map[key], sort_keys=True, default=str):
            lines.append(f"Changed {noun} — {_item_summary(before_map[key])} → {_item_summary(item)}")
    for key, item in before_map.items():
        if key not in after_map:
            lines.append(f"Removed {noun} — {_item_summary(item)}")
    return lines


def record_invoice_edit(
    db: Session,
    invoice: Invoice,
    *,
    before_values: dict[str, Any],
    before_line_items: Any,
    before_summary_rows: Any,
    user: Optional[User],
) -> Optional[InvoiceTransaction]:
    """Log a before -> after audit entry when an invoice's contents change.

    Captures amount-field changes (subtotal/tax/discount/total) plus line-item
    and summary-row additions, removals, and edits. Writes nothing when the edit
    left the invoice's financial content unchanged. The editor and timestamp are
    recorded on the ledger transaction itself.
    """
    lines: list[str] = []
    for field, label in _EDIT_TRACKED_FIELDS:
        old_value = _money(before_values.get(field))
        new_value = _money(getattr(invoice, field, 0))
        if old_value != new_value:
            lines.append(f"{label}: {_fmt_money(old_value)} → {_fmt_money(new_value)}")

    lines += _diff_items(before_line_items, editable_line_items(invoice.notes), "line")
    lines += _diff_items(before_summary_rows, editable_summary_rows(invoice.notes), "summary row")

    old_total = _money(before_values.get("total_amount"))
    new_total = _money(getattr(invoice, "total_amount", 0))
    total_changed = old_total != new_total
    if not lines and not total_changed:
        return None

    header = f"Invoice {invoice.invoice_number} edited. Total {_fmt_money(old_total)} → {_fmt_money(new_total)}."
    description = header + ("".join(f"\n• {line}" for line in lines) if lines else "")
    return add_invoice_transaction(
        db,
        invoice,
        "invoice_edited",
        new_total,
        description=description,
        user=user,
        reference_prefix="EDT",
    )
