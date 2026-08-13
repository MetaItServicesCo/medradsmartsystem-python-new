from decimal import Decimal
from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from app.api.v1.endpoints.rental_portal import (
    _is_rental_account_user,
    _pricing_view,
    _require_primary_account_recipient,
    _require_signed,
)
from app.api.v1.endpoints.rentals import (
    RentalDiscountPackageIn,
    RentalSecondaryRecipientIn,
    _discount_package_values,
    _is_rental_customer_user,
    _normalize_secondary_recipients,
    _resolve_rental_customer_phone,
    _require_internal_rental_operator,
)
from app.models.user import UserRole


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


def test_rental_customer_phone_prefers_manual_agreement_value() -> None:
    assert _resolve_rental_customer_phone(" 2145550199 ", None) == "2145550199"
    assert _resolve_rental_customer_phone("2145550199", "9725550100") == "2145550199"


def test_rental_customer_phone_falls_back_to_linked_profile() -> None:
    assert _resolve_rental_customer_phone("", "9725550100") == "9725550100"


def test_rental_customer_phone_returns_controlled_validation_error_when_missing() -> None:
    with pytest.raises(HTTPException) as error:
        _resolve_rental_customer_phone("", None)
    assert error.value.status_code == 422
    assert "manually" in str(error.value.detail).lower()


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


def test_customer_roles_cannot_invoke_internal_rental_operations() -> None:
    _require_internal_rental_operator(SimpleNamespace(role=UserRole.SUPERADMIN, facility_id=None))
    _require_internal_rental_operator(SimpleNamespace(role=UserRole.ADMIN, facility_id=None))

    for role in (UserRole.FACILITY_ADMIN, UserRole.FACILITY_MANAGER, UserRole.CLIENT):
        with pytest.raises(HTTPException) as error:
            _require_internal_rental_operator(SimpleNamespace(role=role, facility_id=42))
        assert error.value.status_code == 403

    facility_admin_account = SimpleNamespace(role=UserRole.ADMIN, facility_id=42)
    with pytest.raises(HTTPException) as error:
        _require_internal_rental_operator(facility_admin_account)
    assert error.value.status_code == 403
    assert _is_rental_customer_user(facility_admin_account)
    assert _is_rental_account_user(facility_admin_account)


def test_only_selected_primary_account_recipient_can_transact() -> None:
    rental = SimpleNamespace(customer_user_id=17)
    primary = SimpleNamespace(id=17)
    copied_recipient = SimpleNamespace(id=18)

    _require_primary_account_recipient(rental, primary)
    with pytest.raises(HTTPException) as error:
        _require_primary_account_recipient(rental, copied_recipient)

    assert error.value.status_code == 403
    assert "primary" in str(error.value.detail).lower()


def test_discount_package_normalizes_name_and_keeps_reusable_pricing_rules() -> None:
    values = _discount_package_values(RentalDiscountPackageIn(
        name="  Four   Period Card Deal  ",
        discount_type="percent",
        discount_value=Decimal("20"),
        application_mode="commitment",
        invoice_number=3,
        continue_after=True,
        requires_saved_card=True,
    ))

    assert values == {
        "name": "Four Period Card Deal",
        "name_key": "four period card deal",
        "discount_type": "percent",
        "discount_value": Decimal("20.00"),
        "application_mode": "commitment",
        "invoice_number": 3,
        "continue_after": True,
        "requires_saved_card": True,
    }


def test_secondary_recipients_require_a_facility() -> None:
    with pytest.raises(HTTPException) as error:
        _normalize_secondary_recipients(
            None,
            None,
            "primary@example.com",
            [RentalSecondaryRecipientIn(user_id=42, name="Billing Team", email="billing@example.com")],
        )

    assert error.value.status_code == 400
    assert "facility" in str(error.value.detail).lower()


def test_discount_package_rejects_invalid_value_and_preserves_future_continuation() -> None:
    with pytest.raises(HTTPException) as error:
        _discount_package_values(RentalDiscountPackageIn(
            name="Invalid",
            discount_type="flat",
            discount_value=Decimal("0"),
        ))
    assert error.value.status_code == 422

    values = _discount_package_values(RentalDiscountPackageIn(
        name="One invoice",
        discount_type="flat",
        discount_value=Decimal("25"),
        application_mode="single_invoice",
        invoice_number=2,
        continue_after=True,
        requires_saved_card=False,
    ))
    assert values["continue_after"] is True
