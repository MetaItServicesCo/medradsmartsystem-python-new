from datetime import date, datetime, timedelta
from decimal import Decimal

import pytest
from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.api.v1.endpoints.sales import (
    SalesQuotationItemIn,
    _accept_quotation_selection,
    _apply_items,
    _effective_quotation_lines,
    _sales_payment_method_category,
    _validate_saved_quotation_stock,
    revise_quotation,
    sales_summary,
)
from app.api.v1.endpoints.sales_portal import (
    PortalSquarePaymentIn,
    PortalTestPaymentIn,
    _recipient_options,
    _record_square_payment,
    _record_test_payment,
)
from app.core.config import settings
from app.db.base import Base
from app.models.inventory import InventoryPart, InventoryTransaction
from app.models.invoice import Invoice, InvoiceStatus, InvoiceTransaction, InvoiceType
from app.models.notification import Notification
from app.models.sales import (
    SalesInventoryReservation,
    SalesQuotation,
    SalesQuotationAcceptance,
    SalesQuotationLineItem,
    SalesQuotationRecipient,
)
from app.models.user import User, UserRole, UserType
from app.utils.sales_inventory import (
    ensure_sales_inventory_available,
    fulfill_sales_invoice_inventory,
    release_sales_inventory_reservations,
    reserve_sales_inventory,
)


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


@pytest.mark.parametrize(
    ("stored_method", "expected_category"),
    [
        ("credit_card", "credit_card"),
        ("square_card", "credit_card"),
        ("Credit Card", "credit_card"),
        ("cheque", "cheque"),
        ("check", "cheque"),
        ("bank_transfer", "bank_transfer"),
        ("wire transfer", "bank_transfer"),
        ("ach", "bank_transfer"),
        (None, None),
        ("test_mode", None),
    ],
)
def test_sales_payment_methods_are_grouped_for_completed_sales(
    stored_method: str | None,
    expected_category: str | None,
) -> None:
    assert _sales_payment_method_category(stored_method) == expected_category


def test_sales_summary_counts_square_payments_as_credit_cards() -> None:
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    db = sessionmaker(bind=engine)()
    try:
        admin = User(
            username="sales-summary-admin",
            email="sales-summary-admin@example.com",
            full_name="Sales Summary Admin",
            hashed_password="test",
            user_type=UserType.EMPLOYEE,
            role=UserRole.ADMIN,
        )
        db.add(admin)
        db.flush()
        for index in range(4):
            quotation = SalesQuotation(
                quotation_number=f"SQ-SUMMARY-{index}",
                work_order=f"SO-SUMMARY-{index}",
                created_by_id=admin.id,
                customer_name=f"Customer {index}",
                status="completed",
                paid_status="paid",
                payment_method="square_card",
                subtotal=Decimal("100"),
                total_amount=Decimal("100"),
                history=[],
            )
            db.add(quotation)
            db.flush()
            invoice = Invoice(
                invoice_number=f"INV-SALES-SUMMARY-{index}",
                invoice_type=InvoiceType.SALES,
                customer_name=quotation.customer_name,
                customer_email=f"customer-{index}@example.com",
                sales_quotation_id=quotation.id,
                subtotal=Decimal("100"),
                total_amount=Decimal("100"),
                amount_paid=Decimal("100"),
                balance_due=Decimal("0"),
                payment_method="square_card",
                status=InvoiceStatus.PAID,
                issue_date=date.today(),
                due_date=date.today(),
            )
            db.add(invoice)
            db.flush()
            quotation.converted_invoice_id = invoice.id
        db.commit()

        summary = sales_summary(db=db, current_user=admin)

        assert summary["completed"] == 4
        assert summary["completed_payment_methods"] == {
            "credit_card": 4,
            "cheque": 0,
            "bank_transfer": 0,
        }
    finally:
        db.close()


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


def test_quotation_rejects_the_same_part_twice_when_only_one_is_available() -> None:
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    db = sessionmaker(bind=engine)()
    try:
        part = InventoryPart(
            part_number="ONE-ONLY-001",
            part_type="sales",
            description="Only one available",
            unit_price=Decimal("25"),
            condition="new",
            quantity_on_hand=1,
            reorder_level=0,
            status="active",
        )
        db.add(part)
        db.flush()
        quotation = SalesQuotation(
            quotation_type="standard",
            tax_amount=Decimal("0"),
            discount_amount=Decimal("0"),
            history=[],
        )
        items = [
            SalesQuotationItemIn(part_id=part.id, quantity=1),
            SalesQuotationItemIn(part_id=part.id, quantity=1),
        ]

        with pytest.raises(HTTPException) as error:
            _apply_items(db, quotation, items, _user())

        assert error.value.status_code == 409
        assert "Only 1 unit(s)" in error.value.detail
        assert "requests 2 across all lines" in error.value.detail
    finally:
        db.close()


def test_quotation_allows_the_same_part_twice_when_two_are_available() -> None:
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    db = sessionmaker(bind=engine)()
    try:
        part = InventoryPart(
            part_number="TWO-AVAILABLE-001",
            part_type="sales",
            description="Two available",
            unit_price=Decimal("25"),
            condition="new",
            quantity_on_hand=2,
            reorder_level=0,
            status="active",
        )
        db.add(part)
        db.flush()
        quotation = SalesQuotation(
            quotation_type="standard",
            tax_amount=Decimal("0"),
            discount_amount=Decimal("0"),
            history=[],
        )

        _apply_items(
            db,
            quotation,
            [
                SalesQuotationItemIn(part_id=part.id, quantity=1),
                SalesQuotationItemIn(part_id=part.id, quantity=1),
            ],
            _user(),
        )

        assert len(quotation.line_items) == 2
        assert quotation.subtotal == Decimal("50")
    finally:
        db.close()


def test_quotation_rejects_quantity_above_current_available_stock() -> None:
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    db = sessionmaker(bind=engine)()
    try:
        part = InventoryPart(
            part_number="ONE-ONLY-002",
            part_type="sales",
            description="Quantity validation",
            unit_price=Decimal("25"),
            condition="new",
            quantity_on_hand=1,
            reorder_level=0,
            status="active",
        )
        db.add(part)
        db.flush()
        quotation = SalesQuotation(
            quotation_type="standard",
            tax_amount=Decimal("0"),
            discount_amount=Decimal("0"),
            history=[],
        )

        with pytest.raises(HTTPException) as error:
            _apply_items(
                db,
                quotation,
                [SalesQuotationItemIn(part_id=part.id, quantity=2)],
                _user(),
            )

        assert error.value.status_code == 409
        assert "Only 1 unit(s)" in error.value.detail
        assert "requests 2" in error.value.detail
    finally:
        db.close()


def test_send_validation_aggregates_duplicate_part_line_quantities() -> None:
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    db = sessionmaker(bind=engine)()
    try:
        part = InventoryPart(
            part_number="ONE-ONLY-003",
            part_type="sales",
            description="Send validation",
            unit_price=Decimal("25"),
            condition="new",
            quantity_on_hand=1,
            reorder_level=0,
            status="active",
        )
        db.add(part)
        db.flush()
        quotation = SalesQuotation(quotation_type="standard", history=[])
        quotation.line_items = [
            SalesQuotationLineItem(
                part_id=part.id,
                item_kind="product",
                quantity=1,
                unit_price=Decimal("25"),
                shipping_fee=Decimal("0"),
                setup_fee=Decimal("0"),
                total=Decimal("25"),
            ),
            SalesQuotationLineItem(
                part_id=part.id,
                item_kind="product",
                quantity=1,
                unit_price=Decimal("25"),
                shipping_fee=Decimal("0"),
                setup_fee=Decimal("0"),
                total=Decimal("25"),
            ),
        ]

        with pytest.raises(HTTPException) as error:
            _validate_saved_quotation_stock(db, quotation)

        assert error.value.status_code == 409
        assert "Only 1 unit(s)" in error.value.detail
        assert "requests 2 across all lines" in error.value.detail
    finally:
        db.close()


def test_sent_quotation_revision_snapshots_and_invalidates_delivery_links() -> None:
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    db = sessionmaker(bind=engine)()
    try:
        admin = User(
            username="revision-admin",
            email="revision-admin@example.com",
            full_name="Revision Admin",
            hashed_password="test",
            user_type=UserType.EMPLOYEE,
            role=UserRole.ADMIN,
        )
        db.add(admin)
        db.flush()
        sent_at = datetime.utcnow()
        quotation = SalesQuotation(
            quotation_number="SQ-REVISION-001",
            work_order="SO-REVISION-001",
            created_by_id=admin.id,
            customer_name="Revision Customer",
            customer_email="revision@example.com",
            quotation_type="choice_single",
            status="viewed",
            paid_status="unpaid",
            selection_status="pending",
            subtotal=Decimal("100"),
            total_amount=Decimal("100"),
            sent_at=sent_at,
            expires_at=sent_at + timedelta(days=30),
            revision=1,
            history=[],
        )
        db.add(quotation)
        db.flush()
        line = SalesQuotationLineItem(
            quotation_id=quotation.id,
            item_kind="product",
            is_default=True,
            is_selected=True,
            description="Revision product",
            quantity=1,
            unit_price=Decimal("100"),
            shipping_fee=Decimal("0"),
            setup_fee=Decimal("0"),
            condition="new",
            total=Decimal("100"),
        )
        recipient = SalesQuotationRecipient(
            quotation_id=quotation.id,
            recipient_type="primary",
            name=quotation.customer_name,
            email=quotation.customer_email,
            status="viewed",
            access_token_hash="old-public-token-hash",
            token_expires_at=quotation.expires_at,
            sent_at=sent_at,
            viewed_at=sent_at,
        )
        db.add_all([line, recipient])
        db.commit()

        response = revise_quotation(quotation.id, db, admin)

        assert response["revision"] == 2
        assert response["status"] == "draft"
        assert response["sent_at"] is None
        db.refresh(quotation)
        db.refresh(recipient)
        assert quotation.expires_at is None
        assert quotation.selection_status == "pending"
        assert recipient.status == "draft"
        assert recipient.access_token_hash is None
        assert recipient.token_expires_at is None
        assert recipient.sent_at is None
        assert recipient.viewed_at is None
        revision_entry = quotation.history[-1]
        assert revision_entry["action"] == "revision_created"
        assert revision_entry["details"]["previous_revision"] == 1
        assert revision_entry["details"]["revision"] == 2
        assert revision_entry["details"]["previous_links_invalidated"] is True
        assert revision_entry["details"]["previous_revision_snapshot"]["line_items"][0]["description"] == "Revision product"
    finally:
        db.close()


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
        part = InventoryPart(
            part_number="SQUARE-PART-001",
            part_type="sales",
            description="Square payment stock test",
            unit_price=Decimal("50"),
            condition="new",
            quantity_on_hand=5,
            reorder_level=1,
            status="active",
        )
        db.add(part)
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
        db.add(
            SalesQuotationLineItem(
                quotation_id=quotation.id,
                part_id=part.id,
                item_kind="product",
                is_default=True,
                is_selected=True,
                description=part.description,
                quantity=2,
                unit_price=Decimal("50"),
                shipping_fee=Decimal("0"),
                setup_fee=Decimal("0"),
                condition="new",
                total=Decimal("100"),
            )
        )
        db.add(
            SalesQuotationLineItem(
                quotation_id=quotation.id,
                part_id=None,
                item_kind="trade_in",
                is_default=True,
                is_selected=True,
                item_metadata={
                    "inventory_part": {
                        "part_number": "TRADE-IN-001",
                        "description": "Customer trade-in monitor",
                        "make": "Acme",
                        "model": "Legacy Monitor",
                        "serial_number": "TRADE-SERIAL-001",
                        "condition": "used",
                        "reorder_level": 0,
                        "location": "Trade-in receiving",
                    }
                },
                description="Customer trade-in monitor",
                quantity=1,
                unit_price=Decimal("25"),
                shipping_fee=Decimal("0"),
                setup_fee=Decimal("0"),
                condition="used",
                total=Decimal("-25"),
            )
        )
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
        db.refresh(part)
        assert part.quantity_on_hand == 3
        assert any(
            transaction.transaction_type == "payment"
            and transaction.payment_method == "test_mode"
            and "No funds were charged" in transaction.description
            for transaction in invoice.transactions
        )
    finally:
        db.close()


def test_sales_payment_preflight_rejects_insufficient_stock() -> None:
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    db = sessionmaker(bind=engine)()
    try:
        admin = User(
            username="stock-admin",
            email="stock-admin@example.com",
            full_name="Stock Admin",
            hashed_password="test",
            user_type=UserType.EMPLOYEE,
            role=UserRole.ADMIN,
        )
        db.add(admin)
        db.flush()
        part = InventoryPart(
            part_number="LOW-STOCK-001",
            part_type="sales",
            description="Insufficient stock test",
            unit_price=Decimal("50"),
            condition="new",
            quantity_on_hand=1,
            reorder_level=1,
            status="active",
        )
        db.add(part)
        db.flush()
        quotation = SalesQuotation(
            quotation_number="SQ-LOW-STOCK-001",
            work_order="SO-LOW-STOCK-001",
            created_by_id=admin.id,
            customer_name="Stock Customer",
            customer_email="stock@example.com",
            quotation_type="standard",
            status="accepted",
            paid_status="unpaid",
            selection_status="accepted",
            subtotal=Decimal("100"),
            total_amount=Decimal("100"),
            history=[],
        )
        db.add(quotation)
        db.flush()
        db.add(
            SalesQuotationLineItem(
                quotation_id=quotation.id,
                part_id=part.id,
                item_kind="product",
                is_selected=True,
                description=part.description,
                quantity=2,
                unit_price=Decimal("50"),
                shipping_fee=Decimal("0"),
                setup_fee=Decimal("0"),
                condition="new",
                total=Decimal("100"),
            )
        )
        invoice = Invoice(
            invoice_number="INV-SALES-LOW-STOCK-001",
            invoice_type=InvoiceType.SALES,
            customer_name=quotation.customer_name,
            customer_email=quotation.customer_email,
            sales_quotation_id=quotation.id,
            subtotal=Decimal("100"),
            tax_amount=Decimal("0"),
            discount_amount=Decimal("0"),
            total_amount=Decimal("100"),
            amount_paid=Decimal("0"),
            balance_due=Decimal("100"),
            status=InvoiceStatus.PENDING,
            issue_date=date.today(),
            due_date=date.today(),
        )
        db.add(invoice)
        db.flush()
        quotation.converted_invoice_id = invoice.id
        db.commit()

        with pytest.raises(HTTPException) as error:
            ensure_sales_inventory_available(db, invoice)

        assert error.value.status_code == 409
        assert "Available: 1" in error.value.detail
        assert "required: 2" in error.value.detail
        db.refresh(part)
        assert part.quantity_on_hand == 1
        assert db.query(InventoryTransaction).count() == 0
    finally:
        db.close()


def test_accepted_sales_invoice_reserves_last_unit_until_payment() -> None:
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    db = sessionmaker(bind=engine)()
    try:
        admin = User(
            username="reservation-admin",
            email="reservation-admin@example.com",
            full_name="Reservation Admin",
            hashed_password="test",
            user_type=UserType.EMPLOYEE,
            role=UserRole.ADMIN,
        )
        part = InventoryPart(
            part_number="LAST-UNIT-001",
            part_type="sales",
            description="Last unit reservation test",
            unit_price=Decimal("75"),
            condition="new",
            quantity_on_hand=1,
            reorder_level=0,
            status="active",
        )
        db.add_all([admin, part])
        db.flush()

        def make_sale(suffix: str) -> tuple[SalesQuotation, SalesQuotationLineItem, Invoice]:
            quotation = SalesQuotation(
                quotation_number=f"SQ-RESERVE-{suffix}",
                work_order=f"SO-RESERVE-{suffix}",
                created_by_id=admin.id,
                customer_name=f"Customer {suffix}",
                customer_email=f"customer-{suffix.lower()}@example.com",
                quotation_type="standard",
                status="accepted",
                paid_status="unpaid",
                selection_status="accepted",
                subtotal=Decimal("75"),
                total_amount=Decimal("75"),
                history=[],
            )
            line = SalesQuotationLineItem(
                part_id=part.id,
                item_kind="product",
                is_default=True,
                is_selected=True,
                description=part.description,
                quantity=1,
                unit_price=Decimal("75"),
                shipping_fee=Decimal("0"),
                setup_fee=Decimal("0"),
                condition="new",
                total=Decimal("75"),
            )
            quotation.line_items.append(line)
            db.add(quotation)
            db.flush()
            invoice = Invoice(
                invoice_number=f"INV-SALES-RESERVE-{suffix}",
                invoice_type=InvoiceType.SALES,
                customer_name=quotation.customer_name,
                customer_email=quotation.customer_email,
                sales_quotation_id=quotation.id,
                subtotal=Decimal("75"),
                tax_amount=Decimal("0"),
                discount_amount=Decimal("0"),
                total_amount=Decimal("75"),
                amount_paid=Decimal("0"),
                balance_due=Decimal("75"),
                status=InvoiceStatus.PENDING,
                issue_date=date.today(),
                due_date=date.today(),
            )
            db.add(invoice)
            db.flush()
            quotation.converted_invoice_id = invoice.id
            return quotation, line, invoice

        first_quote, first_line, first_invoice = make_sale("A")
        reserve_sales_inventory(db, first_quote, first_invoice, [first_line], admin)
        db.commit()

        db.refresh(part)
        assert part.quantity_on_hand == 1
        first_reservation = (
            db.query(SalesInventoryReservation)
            .filter(SalesInventoryReservation.invoice_id == first_invoice.id)
            .one()
        )
        assert first_reservation.quantity == 1
        assert first_reservation.status == "active"

        second_quote, second_line, second_invoice = make_sale("B")
        with pytest.raises(HTTPException) as error:
            reserve_sales_inventory(
                db,
                second_quote,
                second_invoice,
                [second_line],
                admin,
            )
        assert error.value.status_code == 409
        assert "0 unit(s) are available" in error.value.detail
        db.rollback()

        first_invoice = db.query(Invoice).filter(Invoice.id == first_invoice.id).one()
        first_invoice.amount_paid = first_invoice.total_amount
        first_invoice.balance_due = Decimal("0")
        first_invoice.status = InvoiceStatus.PAID
        assert fulfill_sales_invoice_inventory(db, first_invoice, admin) is True
        db.commit()

        db.refresh(part)
        db.refresh(first_reservation)
        assert part.quantity_on_hand == 0
        assert first_reservation.status == "fulfilled"
        assert (
            db.query(InventoryTransaction)
            .filter(
                InventoryTransaction.part_id == part.id,
                InventoryTransaction.transaction_type == "sale",
            )
            .count()
            == 1
        )
    finally:
        db.close()


def test_cancelling_unpaid_sales_invoice_releases_stock_reservation() -> None:
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    db = sessionmaker(bind=engine)()
    try:
        admin = User(
            username="release-admin",
            email="release-admin@example.com",
            full_name="Release Admin",
            hashed_password="test",
            user_type=UserType.EMPLOYEE,
            role=UserRole.ADMIN,
        )
        part = InventoryPart(
            part_number="RELEASE-001",
            part_type="sales",
            description="Reservation release test",
            unit_price=Decimal("50"),
            condition="new",
            quantity_on_hand=1,
            reorder_level=0,
            status="active",
        )
        db.add_all([admin, part])
        db.flush()

        def make_sale(suffix: str) -> tuple[SalesQuotation, SalesQuotationLineItem, Invoice]:
            quotation = SalesQuotation(
                quotation_number=f"SQ-RELEASE-{suffix}",
                work_order=f"SO-RELEASE-{suffix}",
                created_by_id=admin.id,
                customer_name=f"Customer {suffix}",
                customer_email=f"release-{suffix.lower()}@example.com",
                quotation_type="standard",
                status="accepted",
                paid_status="unpaid",
                selection_status="accepted",
                subtotal=Decimal("50"),
                total_amount=Decimal("50"),
                history=[],
            )
            line = SalesQuotationLineItem(
                part_id=part.id,
                item_kind="product",
                is_default=True,
                is_selected=True,
                description=part.description,
                quantity=1,
                unit_price=Decimal("50"),
                shipping_fee=Decimal("0"),
                setup_fee=Decimal("0"),
                condition="new",
                total=Decimal("50"),
            )
            quotation.line_items.append(line)
            db.add(quotation)
            db.flush()
            invoice = Invoice(
                invoice_number=f"INV-SALES-RELEASE-{suffix}",
                invoice_type=InvoiceType.SALES,
                customer_name=quotation.customer_name,
                customer_email=quotation.customer_email,
                sales_quotation_id=quotation.id,
                subtotal=Decimal("50"),
                tax_amount=Decimal("0"),
                discount_amount=Decimal("0"),
                total_amount=Decimal("50"),
                amount_paid=Decimal("0"),
                balance_due=Decimal("50"),
                status=InvoiceStatus.PENDING,
                issue_date=date.today(),
                due_date=date.today(),
            )
            db.add(invoice)
            db.flush()
            quotation.converted_invoice_id = invoice.id
            return quotation, line, invoice

        first_quote, first_line, first_invoice = make_sale("A")
        reserve_sales_inventory(db, first_quote, first_invoice, [first_line], admin)
        assert release_sales_inventory_reservations(
            db,
            first_invoice,
            "Invoice cancelled in test",
            admin,
        ) == 1
        db.commit()

        released = (
            db.query(SalesInventoryReservation)
            .filter(SalesInventoryReservation.invoice_id == first_invoice.id)
            .one()
        )
        assert released.status == "released"
        assert released.release_reason == "Invoice cancelled in test"

        second_quote, second_line, second_invoice = make_sale("B")
        reservations = reserve_sales_inventory(
            db,
            second_quote,
            second_invoice,
            [second_line],
            admin,
        )
        db.commit()
        assert len(reservations) == 1
        assert reservations[0].status == "active"
        db.refresh(part)
        assert part.quantity_on_hand == 1
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
        part = InventoryPart(
            part_number="SQUARE-PART-001",
            part_type="sales",
            description="Square payment stock test",
            unit_price=Decimal("50"),
            condition="new",
            quantity_on_hand=2,
            reorder_level=1,
            status="active",
        )
        db.add(part)
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
        db.add(
            SalesQuotationLineItem(
                quotation_id=quotation.id,
                part_id=part.id,
                item_kind="product",
                is_default=True,
                is_selected=True,
                description=part.description,
                quantity=2,
                unit_price=Decimal("50"),
                shipping_fee=Decimal("0"),
                setup_fee=Decimal("0"),
                condition="new",
                total=Decimal("100"),
            )
        )
        db.add(
            SalesQuotationLineItem(
                quotation_id=quotation.id,
                part_id=None,
                item_kind="trade_in",
                is_default=True,
                is_selected=True,
                item_metadata={
                    "inventory_part": {
                        "part_number": "TRADE-IN-001",
                        "description": "Customer trade-in monitor",
                        "make": "Acme",
                        "model": "Legacy Monitor",
                        "serial_number": "TRADE-SERIAL-001",
                        "condition": "used",
                        "reorder_level": 0,
                        "location": "Trade-in receiving",
                    }
                },
                description="Customer trade-in monitor",
                quantity=1,
                unit_price=Decimal("25"),
                shipping_fee=Decimal("0"),
                setup_fee=Decimal("0"),
                condition="used",
                total=Decimal("-25"),
            )
        )
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

        recipient = (
            db.query(SalesQuotationRecipient)
            .options(*_recipient_options())
            .filter_by(id=recipient.id)
            .first()
        )
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
        db.refresh(part)
        assert part.quantity_on_hand == 0
        stock_transaction = (
            db.query(InventoryTransaction)
            .filter(
                InventoryTransaction.part_id == part.id,
                InventoryTransaction.transaction_type == "sale",
                InventoryTransaction.authorization_reference == invoice.invoice_number,
            )
            .one()
        )
        assert stock_transaction.quantity == 2
        assert stock_transaction.balance_after == 0
        assert (
            db.query(Notification)
            .filter(
                Notification.user_id == admin.id,
                Notification.title == "Low stock alert",
            )
            .count()
            == 1
        )
        trade_in_part = db.query(InventoryPart).filter(InventoryPart.part_number == "TRADE-IN-001").one()
        assert trade_in_part.part_type == "sales"
        assert trade_in_part.facility_id is None
        assert trade_in_part.quantity_on_hand == 1
        assert trade_in_part.serial_number == "TRADE-SERIAL-001"
        trade_in_transaction = (
            db.query(InventoryTransaction)
            .filter(
                InventoryTransaction.part_id == trade_in_part.id,
                InventoryTransaction.transaction_type == "trade_in_receiving",
                InventoryTransaction.authorization_reference == invoice.invoice_number,
            )
            .one()
        )
        assert trade_in_transaction.quantity == 1
        assert trade_in_transaction.balance_after == 1
        assert (
            db.query(InvoiceTransaction)
            .filter(InvoiceTransaction.reference_number == "square-payment-001")
            .count()
            == 1
        )

        duplicate = _record_square_payment(db, recipient, payload, client)
        assert duplicate["invoice"]["status"] == "paid"
        assert len(square_calls) == 1
        db.refresh(part)
        assert part.quantity_on_hand == 0
        assert (
            db.query(InventoryTransaction)
            .filter(
                InventoryTransaction.part_id == part.id,
                InventoryTransaction.transaction_type == "sale",
                InventoryTransaction.authorization_reference == invoice.invoice_number,
            )
            .count()
            == 1
        )
        assert db.query(InventoryPart).filter(InventoryPart.part_number == "TRADE-IN-001").count() == 1
        assert (
            db.query(InventoryTransaction)
            .filter(
                InventoryTransaction.transaction_type == "trade_in_receiving",
                InventoryTransaction.authorization_reference == invoice.invoice_number,
            )
            .count()
            == 1
        )
        assert (
            db.query(InvoiceTransaction)
            .filter(InvoiceTransaction.reference_number == "square-payment-001")
            .count()
            == 1
        )
    finally:
        db.close()
