from datetime import date
from decimal import Decimal

import pytest
from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.api.v1.endpoints.sales import (
    _accept_quotation_selection,
    _effective_quotation_lines,
)
from app.api.v1.endpoints.sales_portal import (
    PortalSquarePaymentIn,
    PortalTestPaymentIn,
    _record_square_payment,
    _record_test_payment,
)
from app.core.config import settings
from app.db.base import Base
from app.models.invoice import Invoice, InvoiceStatus, InvoiceTransaction, InvoiceType
from app.models.sales import (
    SalesQuotation,
    SalesQuotationAcceptance,
    SalesQuotationLineItem,
    SalesQuotationRecipient,
)
from app.models.user import User, UserRole, UserType


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
        total=Decimal("-100") if kind in {"trade_in", "refund"} else Decimal("100"),
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


def test_refund_adjustment_is_always_included_with_selected_options() -> None:
    first = _line(1)
    second = _line(2)
    refund = _line(3, kind="refund")
    quotation = SalesQuotation(quotation_type="choice_single", history=[])
    quotation.line_items = [first, second, refund]

    accepted = _accept_quotation_selection(quotation, [1], "client_portal", _user(), "Facility User")

    assert accepted == [first, refund]
    assert refund.is_selected is True
    assert quotation.history[-1]["by"] == "Admin User"


def test_standard_keeps_required_all_behavior_for_backward_compatibility() -> None:
    quotation = SalesQuotation(quotation_type="standard", history=[])
    quotation.line_items = [_line(1), _line(2)]

    accepted = _accept_quotation_selection(quotation, None, "internal", _user())

    assert accepted == quotation.line_items
    assert all(line.is_selected for line in quotation.line_items)


def test_test_payment_marks_the_approved_invoice_paid_without_gateway(monkeypatch) -> None:
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    db = sessionmaker(bind=engine)()
    monkeypatch.setattr(settings, "ENABLE_TEST_PAYMENTS", True)
    try:
        admin = User(
            username="sales-admin",
            email="sales-admin@example.com",
            full_name="Sales Admin",
            hashed_password="test",
            user_type=UserType.EMPLOYEE,
            role=UserRole.ADMIN,
        )
        client = User(
            username="sales-client",
            email="sales-client@example.com",
            full_name="Sales Client",
            hashed_password="test",
            user_type=UserType.CLIENT,
            role=UserRole.CLIENT,
        )
        db.add_all([admin, client])
        db.flush()
        quotation = SalesQuotation(
            quotation_number="SQ-TEST-001",
            work_order="SO-TEST-001",
            created_by_id=admin.id,
            accepted_by_id=client.id,
            customer_name=client.full_name,
            customer_email=client.email,
            quotation_type="standard",
            status="accepted",
            paid_status="unpaid",
            selection_status="accepted",
            subtotal=Decimal("125"),
            total_amount=Decimal("125"),
            history=[],
        )
        db.add(quotation)
        db.flush()
        recipient = SalesQuotationRecipient(
            quotation_id=quotation.id,
            user_id=client.id,
            recipient_type="primary",
            name=client.full_name,
            email=client.email,
            status="accepted",
        )
        db.add(recipient)
        db.flush()
        db.add(
            SalesQuotationAcceptance(
                quotation_id=quotation.id,
                recipient_id=recipient.id,
                accepted_by_user_id=client.id,
                accepted_by_name=client.full_name,
                signature_name=client.full_name,
                terms_accepted=True,
                quotation_revision=1,
                selection_snapshot=[],
                pricing_snapshot={"total_amount": "125"},
            )
        )
        invoice = Invoice(
            invoice_number="INV-SALES-TEST-001",
            invoice_type=InvoiceType.SALES,
            customer_name=client.full_name,
            customer_email=client.email,
            sales_quotation_id=quotation.id,
            subtotal=Decimal("125"),
            tax_amount=Decimal("0"),
            discount_amount=Decimal("0"),
            total_amount=Decimal("125"),
            amount_paid=Decimal("0"),
            balance_due=Decimal("125"),
            status=InvoiceStatus.PENDING,
            issue_date=date.today(),
            due_date=date.today(),
            billing_approval_status="pending",
        )
        db.add(invoice)
        db.flush()
        quotation.converted_invoice_id = invoice.id
        db.commit()

        recipient = db.query(SalesQuotationRecipient).filter_by(id=recipient.id).first()
        response = _record_test_payment(
            db,
            recipient,
            PortalTestPaymentIn(
                payer_name=client.full_name,
                confirmation=True,
                notes="QA checkout",
            ),
            client,
        )

        db.refresh(invoice)
        assert invoice.status == InvoiceStatus.PAID
        assert invoice.amount_paid == Decimal("125")
        assert invoice.balance_due == Decimal("0")
        assert invoice.payment_method == "test_mode"
        assert response["invoice"]["status"] == "paid"
        assert response["can_test_pay"] is False
        assert any(
            transaction.transaction_type == "payment"
            and transaction.payment_method == "test_mode"
            and "No funds were charged" in transaction.description
            for transaction in invoice.transactions
        )
    finally:
        db.close()


def test_square_payment_marks_sales_invoice_paid_and_is_idempotent(monkeypatch) -> None:
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    db = sessionmaker(bind=engine)()
    monkeypatch.setattr(settings, "SQUARE_ENVIRONMENT", "sandbox")
    monkeypatch.setattr(settings, "SQUARE_APPLICATION_ID", "sandbox-app")
    monkeypatch.setattr(settings, "SQUARE_ACCESS_TOKEN", "sandbox-token")
    monkeypatch.setattr(settings, "SQUARE_LOCATION_ID", "sandbox-location")
    monkeypatch.setattr(settings, "SQUARE_CURRENCY", "USD")
    square_calls: list[dict] = []

    def fake_square_payment(**kwargs):
        square_calls.append(kwargs)
        return {
            "id": "square-payment-001",
            "status": "COMPLETED",
            "amount_money": {"amount": 12500, "currency": "USD"},
        }

    monkeypatch.setattr(
        "app.api.v1.endpoints.sales_portal.create_square_payment",
        fake_square_payment,
    )
    try:
        admin = User(
            username="square-admin",
            email="square-admin@example.com",
            full_name="Square Admin",
            hashed_password="test",
            user_type=UserType.EMPLOYEE,
            role=UserRole.ADMIN,
        )
        client = User(
            username="square-client",
            email="square-client@example.com",
            full_name="Square Client",
            hashed_password="test",
            user_type=UserType.CLIENT,
            role=UserRole.CLIENT,
        )
        db.add_all([admin, client])
        db.flush()
        quotation = SalesQuotation(
            quotation_number="SQ-SQUARE-001",
            work_order="SO-SQUARE-001",
            created_by_id=admin.id,
            accepted_by_id=client.id,
            customer_name=client.full_name,
            customer_email=client.email,
            quotation_type="standard",
            status="accepted",
            paid_status="unpaid",
            selection_status="accepted",
            subtotal=Decimal("125"),
            total_amount=Decimal("125"),
            history=[],
        )
        db.add(quotation)
        db.flush()
        recipient = SalesQuotationRecipient(
            quotation_id=quotation.id,
            user_id=client.id,
            recipient_type="primary",
            name=client.full_name,
            email=client.email,
            status="accepted",
        )
        db.add(recipient)
        db.flush()
        db.add(
            SalesQuotationAcceptance(
                quotation_id=quotation.id,
                recipient_id=recipient.id,
                accepted_by_user_id=client.id,
                accepted_by_name=client.full_name,
                signature_name=client.full_name,
                terms_accepted=True,
                quotation_revision=1,
                selection_snapshot=[],
                pricing_snapshot={"total_amount": "125"},
            )
        )
        invoice = Invoice(
            invoice_number="INV-SALES-SQUARE-001",
            invoice_type=InvoiceType.SALES,
            customer_name=client.full_name,
            customer_email=client.email,
            sales_quotation_id=quotation.id,
            subtotal=Decimal("125"),
            tax_amount=Decimal("0"),
            discount_amount=Decimal("0"),
            total_amount=Decimal("125"),
            amount_paid=Decimal("0"),
            balance_due=Decimal("125"),
            status=InvoiceStatus.PENDING,
            issue_date=date.today(),
            due_date=date.today(),
            billing_approval_status="pending",
        )
        db.add(invoice)
        db.flush()
        quotation.converted_invoice_id = invoice.id
        db.commit()

        recipient = db.query(SalesQuotationRecipient).filter_by(id=recipient.id).first()
        payload = PortalSquarePaymentIn(
            source_id="cnon:sandbox-card-token",
            idempotency_key="3e09d6c0-c764-4b06-b11e-2712914fb9ae",
            payer_name=client.full_name,
        )
        response = _record_square_payment(db, recipient, payload, client)

        db.refresh(invoice)
        assert square_calls == [{
            "source_id": payload.source_id,
            "idempotency_key": payload.idempotency_key,
            "amount": Decimal("125.00"),
            "invoice_number": invoice.invoice_number,
            "customer_email": invoice.customer_email,
        }]
        assert invoice.status == InvoiceStatus.PAID
        assert invoice.amount_paid == Decimal("125")
        assert invoice.balance_due == Decimal("0")
        assert invoice.payment_method == "square_card"
        assert response["invoice"]["status"] == "paid"
        assert response["can_square_pay"] is False
        assert (
            db.query(InvoiceTransaction)
            .filter(InvoiceTransaction.reference_number == "square-payment-001")
            .count()
            == 1
        )

        duplicate = _record_square_payment(db, recipient, payload, client)
        assert duplicate["invoice"]["status"] == "paid"
        assert len(square_calls) == 1
        assert (
            db.query(InvoiceTransaction)
            .filter(InvoiceTransaction.reference_number == "square-payment-001")
            .count()
            == 1
        )
    finally:
        db.close()
