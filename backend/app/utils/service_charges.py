"""How a service charge was worked out, in words the customer can check.

Labor is hours × the tier's hourly rate: "4.00 hrs × $175.00/hr" for $700.00.
A line billed by quantity reads "2 × $45.00". A breakdown is only written when
its numbers give the amount billed; labor typed in by hand at invoicing shows
its hours as "adjusted", so a document never multiplies to the wrong total.
"""
from __future__ import annotations

from decimal import Decimal, InvalidOperation
from typing import Any, Optional

CENT = Decimal("0.01")


def _decimal(value: Any) -> Optional[Decimal]:
    if value is None or isinstance(value, bool) or value == "":
        return None
    try:
        number = Decimal(str(value))
    except (InvalidOperation, ValueError, TypeError):
        return None
    return number if number.is_finite() else None


def _money(value: Decimal) -> str:
    return f"${value:,.2f}"


def _quantity(value: Decimal) -> str:
    text = f"{value:.2f}".rstrip("0").rstrip(".")
    return text or "0"


def _adds_up(quantity: Decimal, unit_price: Decimal, amount: Decimal) -> bool:
    return (quantity * unit_price).quantize(CENT) == amount.quantize(CENT)


def is_labor_line(description: Any) -> bool:
    return str(description or "").strip().lower().startswith("service labor")


def labor_breakdown(hours: Any, rate: Any, amount: Any, *, adjusted: bool = True) -> Optional[str]:
    """ "4.00 hrs × $175.00/hr" when hours × rate is the amount. When it is not,
    "4.00 hrs, adjusted" (or nothing, with adjusted=False). Nothing without hours."""
    hours_d, rate_d, amount_d = _decimal(hours), _decimal(rate), _decimal(amount)
    if hours_d is None or hours_d <= 0 or amount_d is None:
        return None
    hours_text = f"{hours_d:.2f} hrs"
    if rate_d is not None and rate_d >= 0 and _adds_up(hours_d, rate_d, amount_d):
        return f"{hours_text} × {_money(rate_d)}/hr"
    return f"{hours_text}, adjusted" if adjusted else None


def charge_breakdown(row: dict[str, Any]) -> Optional[str]:
    """The breakdown for one invoice line, or None when there is nothing to explain."""
    if not isinstance(row, dict):
        return None
    amount = row.get("total_amount", row.get("total"))
    if is_labor_line(row.get("description")):
        return labor_breakdown(row.get("quantity"), row.get("unit_price"), amount)
    quantity, unit_price, amount_d = _decimal(row.get("quantity")), _decimal(row.get("unit_price")), _decimal(amount)
    if quantity is None or unit_price is None or amount_d is None:
        return None
    if quantity <= 0 or quantity == 1 or unit_price < 0:
        return None
    if not _adds_up(quantity, unit_price, amount_d):
        return None
    return f"{_quantity(quantity)} × {_money(unit_price)}"


def invoice_charges(line_items: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """The invoice's charge lines as shown: label, amount, and how it was worked out."""
    return [
        {
            "label": "Labor" if is_labor_line(row.get("description")) else str(row.get("description") or "Charge"),
            "amount": f"{float(row.get('total_amount') or 0):.2f}",
            "breakdown": charge_breakdown(row),
        }
        for row in line_items
        if isinstance(row, dict)
    ]
