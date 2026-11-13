"""Sales tax on service work: 8.25%, the rate Sales and Rentals charge.

A quotation paid on its own is taxed on its parts and other lines; its labor
lines are not. Part $150 + Labor $100 is $250, with 8.25% of $150 ($12.38)
added: $262.38.

A service invoice is taxed only when it includes a quotation, and then on the
whole invoice: the Service Fee, the labor and the quotations included, each at
its amount before tax. Travel is never taxed. Service Fee $150 + Labor $150 +
quotation $150 is $450, with 8.25% of $450 ($37.13) added. An invoice with
only a Service Fee and labor carries no tax.

Tax is rounded to the cent, half up, as the screens show it.
"""
from __future__ import annotations

from decimal import ROUND_HALF_UP, Decimal
from typing import Any, Iterable

SERVICE_TAX_RATE = Decimal("8.25")
CENT = Decimal("0.01")
UNTAXED_LINE_TYPES = {"labor"}


def _money(value: Any) -> Decimal:
    if value in (None, ""):
        return Decimal("0")
    return Decimal(str(value))


def tax_on(amount: Any, rate: Decimal = SERVICE_TAX_RATE) -> Decimal:
    """``rate`` percent of ``amount``, to the cent: 8.25% of $450 is $37.13."""
    base = _money(amount)
    if base <= 0:
        return Decimal("0.00")
    return (base * rate / Decimal("100")).quantize(CENT, rounding=ROUND_HALF_UP)


def is_taxable_quotation_line(item_type: Any) -> bool:
    return str(item_type or "").strip().lower() not in UNTAXED_LINE_TYPES


def quotation_tax(lines: Iterable[Any]) -> tuple[Decimal, Decimal, Decimal]:
    """(subtotal, taxable amount, tax) for a quotation's lines.

    Each line is an object or a dict with ``item_type`` and ``total``.
    """
    subtotal = Decimal("0")
    taxable = Decimal("0")
    for line in lines:
        get = line.get if isinstance(line, dict) else (lambda key, line=line: getattr(line, key, None))
        # To the cent, as each line is stored, so the subtotal is the lines' sum.
        total = _money(get("total")).quantize(CENT, rounding=ROUND_HALF_UP)
        subtotal += total
        if is_taxable_quotation_line(get("item_type")):
            taxable += total
    subtotal = subtotal.quantize(CENT, rounding=ROUND_HALF_UP)
    taxable = taxable.quantize(CENT, rounding=ROUND_HALF_UP)
    return subtotal, taxable, tax_on(taxable)


def quotation_amount_before_tax(quotation: Any) -> Decimal:
    """What a quotation charges before its own tax: what an invoice includes."""
    return (_money(getattr(quotation, "amount", 0)) - _money(getattr(quotation, "tax_amount", 0))).quantize(CENT)


def service_invoice_taxable_amount(
    service_call_fee: Any, labor: Any, quotations_before_tax: Any, *, includes_quotation: bool,
) -> Decimal:
    """What a new service invoice is taxed on: nothing without a quotation,
    else the Service Fee, the labor and the quotations. Never travel."""
    if not includes_quotation:
        return Decimal("0.00")
    return (_money(service_call_fee) + _money(labor) + _money(quotations_before_tax)).quantize(CENT)
