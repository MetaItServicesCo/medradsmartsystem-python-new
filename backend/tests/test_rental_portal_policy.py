from decimal import Decimal
from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from app.api.v1.endpoints.rental_portal import _pricing_view, _require_signed


def _item(rate: str, quantity: int, shipping: str, setup: str, labor: str):
    return SimpleNamespace(
        rental_rate=Decimal(rate),
        quantity=quantity,
        shipping_fee=Decimal(shipping),
        setup_fee=Decimal(setup),
        labor_fee=Decimal(labor),
    )


def test_public_payment_requires_acceptance_of_current_revision() -> None:
    rental = SimpleNamespace(revision=2, acceptance=None)
    with pytest.raises(HTTPException) as error:
        _require_signed(rental)
    assert error.value.status_code == 409

    rental.acceptance = SimpleNamespace(agreement_revision=1)
    with pytest.raises(HTTPException):
        _require_signed(rental)

    rental.acceptance = SimpleNamespace(agreement_revision=2)
    assert _require_signed(rental) is rental.acceptance


def test_pricing_table_allocates_exact_invoice_tax_without_taxing_deposit_or_labor() -> None:
    rental = SimpleNamespace(
        items=[_item("100", 1, "20", "30", "40")],
        security_deposit=Decimal("50"),
        discount_type=None,
        discount_value=Decimal("0"),
        discount_apply_after_periods=None,
    )
    invoice = SimpleNamespace(tax_amount=Decimal("12.38"), total_amount=Decimal("252.38"))

    pricing = _pricing_view(rental, invoice)

    assert pricing["rental_tax"] + pricing["shipping_tax"] + pricing["setup_tax"] == Decimal("12.38")
    assert pricing["grand_total"] == Decimal("252.38")

