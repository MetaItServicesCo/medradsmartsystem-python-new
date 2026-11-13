"""The card processing fee.

Whenever an invoice (or a service quotation) is paid by card, a percentage of
the amount being paid is added on top and charged with it, in one Square
payment. Each invoice carries its own fee on its own amount: a $300 invoice
paid by card charges $309; a later $200 invoice charges $206.

On an invoice the fee becomes part of the bill at the moment of payment: the
card_fee_amount field and total_amount rise by the fee, the ledger records a
"card_processing_fee" entry, and the payment then covers the whole. ACH, MBMTS
ACH and cheque add nothing. A failed charge changes nothing.

Every card path uses these functions, so the fee is worked out and recorded
the same way everywhere, and a webhook settling an uncertain charge applies
exactly the fee that was charged.
"""
from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
from typing import Any, Optional

from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.invoice import Invoice
from app.utils.invoice_ledger import add_invoice_transaction

CENT = Decimal("0.01")
ZERO = Decimal("0")


def _money(value: Any) -> Decimal:
    try:
        return Decimal(str(value if value not in (None, "") else 0)).quantize(CENT, rounding=ROUND_HALF_UP)
    except (InvalidOperation, ValueError):
        return ZERO


def card_fee_percent() -> Decimal:
    """The configured percentage (3 means 3%). Never negative."""
    try:
        percent = Decimal(str(settings.CARD_PROCESSING_FEE_PERCENT).strip() or "0")
    except (InvalidOperation, ValueError):
        percent = ZERO
    return max(percent, ZERO)


def card_fee_label() -> str:
    percent = card_fee_percent().normalize()
    text = format(percent, "f")
    return f"Card processing fee ({text}%)"


@dataclass(frozen=True)
class CardCharge:
    """What a card payment charges: the amount being paid, the fee on it, and both."""
    base: Decimal
    fee: Decimal
    total: Decimal

    def as_dict(self) -> dict[str, Any]:
        return {
            "base_amount": f"{self.base:.2f}",
            "card_fee": f"{self.fee:.2f}",
            "card_fee_percent": format(card_fee_percent().normalize(), "f"),
            "card_fee_label": card_fee_label(),
            "charge_amount": f"{self.total:.2f}",
        }


def card_charge(base: Any) -> CardCharge:
    amount = max(_money(base), ZERO)
    fee = (amount * card_fee_percent() / Decimal("100")).quantize(CENT, rounding=ROUND_HALF_UP)
    return CardCharge(base=amount, fee=fee, total=(amount + fee).quantize(CENT))


# ── The charge's record ──────────────────────────────────────────────────────
# The payment operation (the idempotency record written before Square is
# called) remembers the breakdown, so whoever records the outcome -- the
# request itself, or the webhook after an uncertain response -- applies the
# same fee that was charged.

_FEE_KEY = "card_fee"
_BASE_KEY = "card_fee_base"


def remember_card_charge(operation: Any, charge: CardCharge) -> None:
    data = dict(operation.response_data or {})
    data[_FEE_KEY] = f"{charge.fee:.2f}"
    data[_BASE_KEY] = f"{charge.base:.2f}"
    operation.response_data = data


def remembered_card_fee(operation: Any) -> Optional[Decimal]:
    data = (operation.response_data or {}) if operation is not None else {}
    if not isinstance(data, dict) or _FEE_KEY not in data:
        return None
    return max(_money(data.get(_FEE_KEY)), ZERO)


def succeeded_response(operation: Any, data: dict[str, Any]) -> dict[str, Any]:
    """The operation's result, keeping the remembered fee alongside it."""
    kept = {key: value for key, value in (operation.response_data or {}).items() if key in (_FEE_KEY, _BASE_KEY)}
    return {**kept, **data}


# ── On the invoice ───────────────────────────────────────────────────────────

def apply_card_fee(db: Session, invoice: Invoice, fee: Any, user: Any = None, *, base: Any = None) -> Decimal:
    """Add a card payment's fee to the invoice, just before the payment is recorded.

    The fee becomes part of what the invoice bills: its card fee, total and
    balance rise by it (and an approved total with it, since this is not an
    edit of the invoice), and the ledger says so. The caller then records the
    card payment, which covers the whole. Returns the fee applied.
    """
    amount = max(_money(fee), ZERO)
    if amount <= 0:
        return ZERO
    invoice.card_fee_amount = _money(invoice.card_fee_amount) + amount
    invoice.total_amount = _money(invoice.total_amount) + amount
    invoice.balance_due = max(_money(invoice.total_amount) - _money(invoice.amount_paid), ZERO)
    if invoice.approved_total_amount is not None:
        invoice.approved_total_amount = _money(invoice.approved_total_amount) + amount
    on = f" on ${_money(base):.2f}" if base is not None else ""
    add_invoice_transaction(
        db,
        invoice,
        "card_processing_fee",
        amount,
        "square_card",
        f"{card_fee_label()}{on} added for payment by card",
        user,
        "FEE",
    )
    return amount


def paid_toward_charges(invoice: Optional[Invoice]) -> Decimal:
    """What has been paid toward what the invoice itself charges for: the amount
    paid, less any card processing fee (which is paid on top, not toward it)."""
    if invoice is None:
        return ZERO
    return max(_money(invoice.amount_paid) - _money(getattr(invoice, "card_fee_amount", 0)), ZERO)
