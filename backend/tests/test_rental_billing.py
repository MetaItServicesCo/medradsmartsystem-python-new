from datetime import date, datetime
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
        security_deposit=Decimal("0"),
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


def test_recurring_discount_is_applied_after_tax():
    rental = SimpleNamespace(
        items=[_item("1000", 1, "0", "0", "0")],
        discount_type="flat",
        discount_value=Decimal("100"),
        discount_apply_after_periods=1,
    )

    amounts = _recurring_invoice_amounts(rental, 2)

    assert amounts["discount"] == Decimal("100")
    assert amounts["taxable_rental"] == Decimal("1000")
    assert amounts["tax"] == Decimal("82.50")
    assert amounts["total"] == Decimal("982.50")


def test_initial_invoice_discount_is_applied_after_tax():
    rental = SimpleNamespace(
        items=[_item("100", 1, "10", "20", "30")],
        security_deposit=Decimal("50"),
        discount_type="flat",
        discount_value=Decimal("20"),
        discount_application_mode="single_invoice",
        discount_invoice_number=1,
        discount_apply_after_periods=0,
        discount_continue=False,
        discount_requires_card=False,
        auto_charge_authorized_at=None,
    )

    amounts = _initial_invoice_amounts(rental)

    # Taxable base is the full $100 rent + $10 shipping + $20 setup. Deposit
    # and labor stay non-taxable; the $20 discount is subtracted afterward.
    assert amounts["discount"] == Decimal("20")
    assert amounts["tax"] == Decimal("10.72")
    assert amounts["subtotal"] == Decimal("210")
    assert amounts["total"] == Decimal("200.72")


def test_flat_discount_uses_full_initial_invoice_balance_not_only_rent():
    rental = SimpleNamespace(
        items=[_item("16.67", 1, "50", "50", "50", removal="50")],
        security_deposit=Decimal("50"),
        discount_type="flat",
        discount_value=Decimal("20"),
        discount_application_mode="single_invoice",
        discount_invoice_number=1,
        discount_apply_after_periods=0,
        discount_continue=False,
        discount_requires_card=False,
        auto_charge_authorized_at=None,
    )

    amounts = _initial_invoice_amounts(rental)

    assert amounts["rental"] == Decimal("16.67")
    assert amounts["discount"] == Decimal("20.00")
    assert amounts["subtotal"] == Decimal("266.67")
    assert amounts["tax"] == Decimal("13.75")
    assert amounts["total"] == Decimal("260.42")


def test_flat_discount_stays_conditional_until_saved_card_authorization():
    rental = SimpleNamespace(
        items=[_item("16.67", 1, "50", "50", "50", removal="50")],
        security_deposit=Decimal("50"),
        discount_type="flat",
        discount_value=Decimal("20"),
        discount_application_mode="single_invoice",
        discount_invoice_number=1,
        discount_apply_after_periods=0,
        discount_continue=False,
        discount_requires_card=True,
        auto_charge_authorized_at=None,
    )

    without_card = _initial_invoice_amounts(rental)
    with_card_preview = _initial_invoice_amounts(rental, include_conditional=True)

    assert without_card["discount"] == Decimal("0.00")
    assert without_card["total"] == Decimal("280.42")
    assert without_card["discount_conditional"] is True
    assert with_card_preview["discount"] == Decimal("20.00")
    assert with_card_preview["total"] == Decimal("260.42")


def test_flat_discount_is_capped_only_by_complete_recurring_invoice_total():
    rental = SimpleNamespace(
        items=[_item("16.67", 1, "0", "0", "0")],
        discount_type="flat",
        discount_value=Decimal("20"),
        discount_application_mode="single_invoice",
        discount_invoice_number=2,
        discount_apply_after_periods=1,
        discount_continue=False,
        discount_requires_card=False,
        auto_charge_authorized_at=None,
    )

    amounts = _recurring_invoice_amounts(rental, 2)

    assert amounts["tax"] == Decimal("1.38")
    assert amounts["discount"] == Decimal("18.05")
    assert amounts["total"] == Decimal("0.00")


def test_percent_discount_remains_based_on_rental_amount_and_applies_after_tax():
    rental = SimpleNamespace(
        items=[_item("16.67", 1, "50", "50", "50", removal="50")],
        security_deposit=Decimal("50"),
        discount_type="percent",
        discount_value=Decimal("20"),
        discount_application_mode="single_invoice",
        discount_invoice_number=1,
        discount_apply_after_periods=0,
        discount_continue=False,
        discount_requires_card=False,
        auto_charge_authorized_at=None,
    )

    amounts = _initial_invoice_amounts(rental)

    assert amounts["discount"] == Decimal("3.33")
    assert amounts["tax"] == Decimal("13.75")
    assert amounts["total"] == Decimal("277.09")


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


def test_custom_schedule_evenly_partitions_the_inclusive_date_range():
    rental = SimpleNamespace(
        items=[_item("100", 1, "0", "0", "0")],
        security_deposit=Decimal("0"),
        discount_type=None,
        discount_value=Decimal("0"),
        discount_apply_after_periods=None,
        billing_frequency="custom",
        start_date=date(2026, 1, 1),
        end_date=date(2026, 1, 10),
        committed_periods=3,
    )

    schedule = projected_billing_schedule(rental)

    assert [(row["billing_date"], row["period_end"]) for row in schedule] == [
        (date(2026, 1, 1), date(2026, 1, 3)),
        (date(2026, 1, 4), date(2026, 1, 6)),
        (date(2026, 1, 7), date(2026, 1, 10)),
    ]


def test_daily_schedule_renders_every_committed_period_as_its_own_table_row():
    rental = SimpleNamespace(
        items=[_item("16.67", 1, "0", "0", "0")],
        security_deposit=Decimal("0"),
        discount_type=None,
        discount_value=Decimal("0"),
        discount_apply_after_periods=None,
        billing_frequency="daily",
        start_date=date(2026, 8, 9),
        end_date=date(2026, 8, 13),
        committed_periods=5,
    )

    schedule = projected_billing_schedule(rental)

    assert [(row["billing_date"], row["period_end"]) for row in schedule] == [
        (date(2026, 8, 9), date(2026, 8, 9)),
        (date(2026, 8, 10), date(2026, 8, 10)),
        (date(2026, 8, 11), date(2026, 8, 11)),
        (date(2026, 8, 12), date(2026, 8, 12)),
        (date(2026, 8, 13), date(2026, 8, 13)),
    ]


def test_commitment_discount_catches_up_on_invoice_n_and_can_continue():
    rental = SimpleNamespace(
        items=[_item("100", 1, "0", "0", "0")],
        discount_type="percent",
        discount_value=Decimal("20"),
        discount_application_mode="commitment",
        discount_invoice_number=3,
        discount_apply_after_periods=2,
        discount_continue=True,
        discount_requires_card=False,
        auto_charge_authorized_at=None,
    )

    assert _recurring_invoice_amounts(rental, 2)["total"] == Decimal("108.25")
    # Invoice three catches up three $20 discounts after tax: $100 + $8.25 - $60.
    assert _recurring_invoice_amounts(rental, 3)["total"] == Decimal("48.25")
    # Future invoices retain the normal 20% discount when continuation is on.
    assert _recurring_invoice_amounts(rental, 4)["total"] == Decimal("88.25")


def test_card_conditioned_discount_is_previewed_but_not_billed_before_authorization():
    rental = SimpleNamespace(
        items=[_item("100", 1, "0", "0", "0")],
        discount_type="percent",
        discount_value=Decimal("20"),
        discount_application_mode="single_invoice",
        discount_invoice_number=2,
        discount_apply_after_periods=1,
        discount_continue=False,
        discount_requires_card=True,
        auto_charge_authorized_at=None,
    )

    posted = _recurring_invoice_amounts(rental, 2)
    preview = _recurring_invoice_amounts(rental, 2, include_conditional=True)

    assert posted["discount"] == Decimal("0")
    assert posted["total"] == Decimal("108.25")
    assert preview["discount"] == Decimal("20.00")
    assert preview["total"] == Decimal("88.25")
    assert preview["discount_conditional"] is True


def test_internal_schedule_scenarios_match_actual_card_discount_eligibility():
    rental = SimpleNamespace(
        items=[_item("100", 1, "0", "0", "0")],
        security_deposit=Decimal("0"),
        discount_type="percent",
        discount_value=Decimal("20"),
        discount_application_mode="single_invoice",
        discount_invoice_number=2,
        discount_apply_after_periods=1,
        discount_continue=False,
        discount_requires_card=True,
        auto_charge_authorized_at=None,
        billing_frequency="monthly",
        start_date=date(2026, 1, 1),
        end_date=date(2026, 2, 28),
        committed_periods=2,
    )

    without_card = projected_billing_schedule(rental, include_conditional=False)
    assert without_card[1]["discount"] == Decimal("0")
    assert without_card[1]["tax"] == Decimal("8.25")
    assert without_card[1]["total"] == Decimal("108.25")
    assert without_card[1]["discount_conditional"] is True

    rental.auto_charge_authorized_at = datetime(2026, 1, 1)
    with_card = projected_billing_schedule(rental, include_conditional=False)
    assert with_card[1]["discount"] == Decimal("20.00")
    assert with_card[1]["tax"] == Decimal("8.25")
    assert with_card[1]["total"] == Decimal("88.25")
    assert with_card[1]["discount_conditional"] is False


def test_security_deposit_is_per_item_and_only_appears_upfront():
    first = _item("100", 2, "0", "0", "0")
    first.security_deposit = Decimal("75")
    second = _item("25", 1, "0", "0", "0")
    second.security_deposit = Decimal("10")
    rental = SimpleNamespace(
        items=[first, second],
        security_deposit=Decimal("160"),
        discount_type=None,
        discount_value=Decimal("0"),
        discount_apply_after_periods=None,
    )

    initial = _initial_invoice_amounts(rental)
    recurring = _recurring_invoice_amounts(rental, 2)

    assert initial["deposit"] == Decimal("160")
    assert initial["subtotal"] == Decimal("385")
    assert recurring["total"] == Decimal("243.56")
