from decimal import Decimal

import pytest
from fastapi import HTTPException

from app.api.v1.endpoints.sales import (
    _accept_quotation_selection,
    _effective_quotation_lines,
)
from app.models.sales import SalesQuotation, SalesQuotationLineItem
from app.models.user import User, UserRole


def _user() -> User:
    return User(id=7, full_name="Admin User", role=UserRole.ADMIN)


def _line(line_id: int, *, kind: str = "product", selected: bool = False) -> SalesQuotationLineItem:
    return SalesQuotationLineItem(
        id=line_id,
        item_kind=kind,
        is_default=selected,
        is_selected=selected,
        description=f"Line {line_id}",
        quantity=1,
        unit_price=Decimal("100"),
        shipping_fee=Decimal("0"),
        setup_fee=Decimal("0"),
        total=Decimal("-100") if kind == "trade_in" else Decimal("100"),
    )


def test_choice_single_accepts_exactly_one_product_and_always_includes_trade_in() -> None:
    first = _line(1)
    second = _line(2)
    trade_in = _line(3, kind="trade_in")
    quotation = SalesQuotation(quotation_type="choice_single", history=[])
    quotation.line_items = [first, second, trade_in]

    accepted = _accept_quotation_selection(quotation, [2], "client_portal", _user())

    assert accepted == [second, trade_in]
    assert first.is_selected is False
    assert second.is_selected is True
    assert trade_in.is_selected is True
    assert quotation.selection_status == "accepted"
    assert quotation.selection_channel == "client_portal"
    assert [item["line_item_id"] for item in quotation.selection_snapshot] == [2, 3]


@pytest.mark.parametrize("selected_ids", [[], [1, 2]])
def test_choice_single_rejects_invalid_selection_count(selected_ids: list[int]) -> None:
    quotation = SalesQuotation(quotation_type="choice_single", history=[])
    quotation.line_items = [_line(1), _line(2)]

    with pytest.raises(HTTPException) as error:
        _accept_quotation_selection(quotation, selected_ids, "internal", _user())

    assert error.value.status_code == 400


def test_choice_multiple_effective_lines_exclude_unselected_alternatives() -> None:
    first = _line(1)
    second = _line(2)
    third = _line(3)
    trade_in = _line(4, kind="trade_in")
    quotation = SalesQuotation(quotation_type="choice_multiple", history=[])
    quotation.line_items = [first, second, third, trade_in]

    _accept_quotation_selection(quotation, [1, 3], "internal", _user())

    assert _effective_quotation_lines(quotation) == [first, third, trade_in]


def test_standard_keeps_required_all_behavior_for_backward_compatibility() -> None:
    quotation = SalesQuotation(quotation_type="standard", history=[])
    quotation.line_items = [_line(1), _line(2)]

    accepted = _accept_quotation_selection(quotation, None, "internal", _user())

    assert accepted == quotation.line_items
    assert all(line.is_selected for line in quotation.line_items)
