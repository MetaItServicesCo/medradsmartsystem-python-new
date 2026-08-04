from decimal import Decimal
from types import SimpleNamespace

from app.utils.rental_billing import _initial_invoice_amounts


def _item(rate: str, quantity: int, shipping: str, setup: str, labor: str):
    return SimpleNamespace(
        rental_rate=Decimal(rate),
        quantity=quantity,
        shipping_fee=Decimal(shipping),
        setup_fee=Decimal(setup),
        labor_fee=Decimal(labor),
    )


def test_initial_invoice_includes_first_rental_period_and_correct_tax_base():
    rental = SimpleNamespace(
        items=[_item("100", 2, "10", "20", "30")],
        security_deposit=Decimal("50"),
        discount_type=None,
        discount_value=Decimal("0"),
        discount_apply_after_periods=None,
    )

    amounts = _initial_invoice_amounts(rental)

    assert amounts["rental"] == Decimal("200")
    assert amounts["subtotal"] == Decimal("310")
    assert amounts["tax"] == Decimal("18.98")
    assert amounts["total"] == Decimal("328.98")


def test_initial_invoice_does_not_tax_deposit_or_labor():
    rental = SimpleNamespace(
        items=[_item("0", 1, "0", "0", "125")],
        security_deposit=Decimal("500"),
        discount_type=None,
        discount_value=Decimal("0"),
        discount_apply_after_periods=None,
    )

    amounts = _initial_invoice_amounts(rental)

    assert amounts["tax"] == Decimal("0.00")
    assert amounts["total"] == Decimal("625.00")
