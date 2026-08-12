from datetime import datetime
from decimal import Decimal
from types import SimpleNamespace
from unittest.mock import MagicMock

from app.models.invoice import PaymentReceiptDelivery
from app.utils.payment_receipts import (
    _receipt_content,
    deliver_payment_receipt,
    queue_payment_receipt,
    rental_receipt_recipients,
    sales_receipt_recipients,
)
from app.utils.rental_billing_job import run_rental_billing_job


def test_rental_receipt_recipients_include_primary_and_secondary_without_duplicates():
    rental = SimpleNamespace(
        customer_email="Primary@Example.com",
        secondary_recipients=[
            {"name": "Accounts", "email": "accounts@example.com"},
            {"email": "PRIMARY@example.com"},
            "audit@example.com",
        ],
    )
    invoice = SimpleNamespace(customer_email="primary@example.com")

    assert rental_receipt_recipients(rental, invoice) == [
        "accounts@example.com",
        "audit@example.com",
        "primary@example.com",
    ]


def test_sales_receipt_recipients_include_all_document_recipients_without_duplicates():
    quotation = SimpleNamespace(
        customer_email="Primary@Example.com",
        recipients=[
            SimpleNamespace(email="accounts@example.com"),
            SimpleNamespace(email="PRIMARY@example.com"),
        ],
    )
    invoice = SimpleNamespace(customer_email="primary@example.com")

    assert sales_receipt_recipients(quotation, invoice) == [
        "accounts@example.com",
        "primary@example.com",
    ]


def test_sales_receipt_content_uses_sales_document_reference():
    quotation = SimpleNamespace(quotation_number="SQ-000321")
    invoice = SimpleNamespace(
        customer_name="Sales Customer",
        invoice_number="INV-SALES-000321",
        balance_due=Decimal("0"),
        rental=None,
        sales_quotation=quotation,
    )
    delivery = SimpleNamespace(
        invoice=invoice,
        amount=Decimal("75.00"),
        payment_method="square_card",
        card_brand="VISA",
        card_last4="4242",
        payment_reference="square-payment-321",
        sent_at=None,
        created_at=datetime(2026, 8, 13, 10, 30),
    )

    subject, html_body, text_body = _receipt_content(delivery)

    assert "INV-SALES-000321" in subject
    assert "Sales document" in html_body
    assert "SQ-000321" in html_body + text_body


def test_receipt_content_contains_payment_facts_and_only_masked_card_metadata():
    rental = SimpleNamespace(rental_number="RNT-000123")
    invoice = SimpleNamespace(
        customer_name="Jane Customer",
        invoice_number="INV-RENTAL-000777",
        balance_due=Decimal("0"),
        rental=rental,
    )
    delivery = SimpleNamespace(
        invoice=invoice,
        amount=Decimal("108.25"),
        payment_method="square_card",
        card_brand="VISA",
        card_last4="4242",
        payment_reference="square-payment-123",
        sent_at=None,
        created_at=datetime(2026, 8, 12, 10, 30),
    )

    subject, html_body, text_body = _receipt_content(delivery)

    assert "INV-RENTAL-000777" in subject
    assert "$108.25" in html_body
    assert "VISA ending 4242" in html_body
    assert "RNT-000123" in text_body
    assert "4111111111111111" not in html_body + text_body


def test_queue_payment_receipt_is_idempotent_for_invoice_and_payment_reference():
    db = MagicMock()
    db.query.return_value.filter.return_value.first.return_value = None
    invoice = SimpleNamespace(id=81, payment_method="square_card")

    delivery = queue_payment_receipt(
        db,
        invoice,
        payment_reference="payment-81",
        amount="50.00",
        recipients=["customer@example.com"],
        card_last4="4242",
    )

    assert isinstance(delivery, PaymentReceiptDelivery)
    assert delivery.amount == Decimal("50.00")
    assert delivery.recipients == ["customer@example.com"]
    db.add.assert_called_once_with(delivery)
    db.flush.assert_called_once()

    existing = SimpleNamespace(id=99)
    db = MagicMock()
    db.query.return_value.filter.return_value.first.return_value = existing
    assert queue_payment_receipt(
        db,
        invoice,
        payment_reference="payment-81",
        amount="50.00",
        recipients=["customer@example.com"],
    ) is existing
    db.add.assert_not_called()


def test_receipt_delivery_locks_only_the_outbox_row(monkeypatch):
    """PostgreSQL cannot lock nullable eager-join rows with FOR UPDATE."""
    rental = SimpleNamespace(rental_number="RNT-000216")
    invoice = SimpleNamespace(
        customer_name="Rental Customer",
        invoice_number="INV-RENTAL-004573",
        balance_due=Decimal("0"),
        rental=rental,
    )
    delivery = SimpleNamespace(
        id=1,
        invoice_id=4573,
        invoice=invoice,
        amount=Decimal("324.75"),
        payment_method="credit_card",
        card_brand="VISA",
        card_last4="1111",
        payment_reference="sandbox-payment-1",
        recipients=["customer@example.com"],
        status="pending",
        attempt_count=0,
        next_attempt_at=datetime.utcnow(),
        last_error=None,
        sent_at=None,
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow(),
    )
    query = MagicMock()
    query.filter.return_value = query
    query.with_for_update.return_value = query
    query.first.side_effect = [delivery, delivery]
    db = MagicMock()
    db.query.return_value = query
    monkeypatch.setattr(
        "app.utils.payment_receipts.send_html_email",
        lambda *_args, **_kwargs: True,
    )
    ledger = MagicMock()
    monkeypatch.setattr("app.utils.payment_receipts.add_invoice_transaction", ledger)

    assert deliver_payment_receipt(db, delivery.id) is True

    assert delivery.status == "sent"
    assert query.with_for_update.call_count == 2
    query.options.assert_not_called()
    ledger.assert_called_once()


def test_billing_job_runs_cleanup_billing_and_receipt_delivery(monkeypatch):
    db = MagicMock()
    db.get_bind.return_value.dialect.name = "sqlite"
    monkeypatch.setattr(
        "app.utils.rental_billing_job.retry_pending_card_cleanup",
        lambda _db: (2, 1),
    )
    monkeypatch.setattr(
        "app.utils.rental_billing_job.run_rental_recurring_billing",
        lambda _db: {"billed": 3, "charged": 2},
    )
    monkeypatch.setattr(
        "app.utils.rental_billing_job.deliver_due_payment_receipts",
        lambda _db: {"receipt_sent": 2, "receipt_failed": 0},
    )

    result = run_rental_billing_job(db)

    assert result == {
        "billed": 3,
        "charged": 2,
        "receipt_sent": 2,
        "receipt_failed": 0,
        "already_running": 0,
        "saved_card_cleanup_completed": 2,
        "saved_card_cleanup_pending": 1,
    }
    db.commit.assert_called_once()
