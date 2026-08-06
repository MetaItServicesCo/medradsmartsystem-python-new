from datetime import date
from decimal import Decimal
from types import SimpleNamespace

from app.utils.rental_billing import (
    _facility_id,
    _initial_invoice_amounts,
    _recurring_invoice_amounts,
    advance_billing_date,
    projected_billing_schedule,
)


def _item(rate: str, quantity: int, shipping: str, setup: str, labor: str, removal: str = "0"):
    return SimpleNamespace(
        rental_rate=Decimal(rate),
        quantity=quantity,
        shipping_fee=Decimal(shipping),
        setup_fee=Decimal(setup),
        labor_fee=Decimal(labor),
        removal_fee=Decimal(removal),
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


def test_removal_fee_is_billed_upfront_and_taxed_like_shipping():
    rental = SimpleNamespace(
        items=[_item("0", 1, "0", "0", "0", removal="100")],
        security_deposit=Decimal("0"),
        discount_type=None,
        discount_value=Decimal("0"),
        discount_apply_after_periods=None,
    )

    amounts = _initial_invoice_amounts(rental)

    assert amounts["removal"] == Decimal("100")
    assert amounts["subtotal"] == Decimal("100")
    assert amounts["tax"] == Decimal("8.25")
    assert amounts["total"] == Decimal("108.25")


def test_agreement_customer_facility_is_authoritative_for_billing():
    rental = SimpleNamespace(facility_id=321, items=[])

    assert _facility_id(None, rental) == 321


def test_monthly_schedule_uses_calendar_months_and_preserves_month_end_anchor():
    assert advance_billing_date(date(2026, 1, 31), "monthly", 1) == date(2026, 2, 28)
    assert advance_billing_date(date(2026, 1, 31), "monthly", 2) == date(2026, 3, 31)
    assert advance_billing_date(date(2026, 11, 30), "quarterly", 1) == date(2027, 2, 28)


def test_recurring_discount_reduces_taxable_rent_before_tax():
    rental = SimpleNamespace(
        items=[_item("1000", 1, "0", "0", "0")],
        discount_type="flat",
        discount_value=Decimal("100"),
        discount_apply_after_periods=1,
    )

    amounts = _recurring_invoice_amounts(rental, 2)

    assert amounts["discount"] == Decimal("100")
    assert amounts["taxable_rental"] == Decimal("900")
    assert amounts["tax"] == Decimal("74.25")
    assert amounts["total"] == Decimal("974.25")


def test_projected_schedule_contains_first_invoice_and_remaining_periods():
    rental = SimpleNamespace(
        items=[_item("100", 1, "10", "20", "30")],
        security_deposit=Decimal("50"),
        discount_type=None,
        discount_value=Decimal("0"),
        discount_apply_after_periods=None,
        billing_frequency="monthly",
        start_date=date(2026, 1, 31),
        end_date=date(2026, 4, 30),
        committed_periods=4,
    )

    schedule = projected_billing_schedule(rental)

    assert [period["billing_date"] for period in schedule] == [
        date(2026, 1, 31), date(2026, 2, 28), date(2026, 3, 31), date(2026, 4, 30),
    ]
    assert schedule[0]["total"] == Decimal("220.72")
    assert schedule[1]["total"] == Decimal("108.25")


def test_extending_term_adds_only_recurring_periods_and_never_repeats_upfront_fees():
    rental = SimpleNamespace(
        items=[_item("100", 1, "10", "20", "30")],
        security_deposit=Decimal("50"),
        discount_type=None,
        discount_value=Decimal("0"),
        discount_apply_after_periods=None,
        billing_frequency="monthly",
        start_date=date(2026, 1, 31),
        end_date=date(2026, 4, 30),
        committed_periods=4,
    )
    original = projected_billing_schedule(rental)

    rental.end_date = date(2026, 6, 30)
    rental.committed_periods = 6
    extended = projected_billing_schedule(rental)

    assert [period["billing_date"] for period in extended[:4]] == [period["billing_date"] for period in original]
    assert [period["total"] for period in extended[:4]] == [period["total"] for period in original]
    assert [period["billing_date"] for period in extended[4:]] == [date(2026, 5, 31), date(2026, 6, 30)]
    assert [period["total"] for period in extended[4:]] == [Decimal("108.25"), Decimal("108.25")]
