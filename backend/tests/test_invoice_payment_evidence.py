from datetime import datetime
from decimal import Decimal
from types import SimpleNamespace

from app.utils.invoice_payment_evidence import invoice_payment_evidence_response


def _invoice(*, proofs=None, receipts=None, transactions=None):
    return SimpleNamespace(
        id=42,
        invoice_number="INV-SALES-000042",
        payment_proofs=proofs or [],
        receipt_deliveries=receipts or [],
        transactions=transactions or [],
    )


def test_card_evidence_exposes_only_masked_card_metadata():
    receipt = SimpleNamespace(
        id=8,
        payment_reference="square-payment-123",
        payment_method="square_card",
        amount=Decimal("125.00"),
        card_brand="VISA",
        card_last4="4242",
        status="sent",
        created_at=datetime(2026, 8, 18, 10, 30),
    )

    response = invoice_payment_evidence_response(_invoice(receipts=[receipt]))

    assert response["items"] == [{
        "id": "card-8",
        "evidence_type": "card_payment",
        "status": "confirmed",
        "amount": Decimal("125.00"),
        "currency": "USD",
        "payment_method": "square_card",
        "reference_number": "square-payment-123",
        "card_brand": "VISA",
        "card_last4": "4242",
        "occurred_at": datetime(2026, 8, 18, 10, 30),
        "submitted_at": None,
        "submitted_by_name": None,
        "reviewed_at": None,
        "reviewed_by_name": None,
        "proof_id": None,
        "proof_filename": None,
        "proof_file_url": None,
        "receipt_delivery_status": "sent",
    }]
    serialized = str(response).lower()
    assert "cvv" not in serialized
    assert "source_token" not in serialized


def test_non_card_proof_keeps_review_state_and_secure_file_route():
    submitter = SimpleNamespace(full_name="Facility Manager", username="manager")
    reviewer = SimpleNamespace(full_name="Billing Admin", username="admin")
    transaction = SimpleNamespace(reference_number="PAY-INV-01")
    proof = SimpleNamespace(
        id=17,
        invoice_transaction_id=91,
        invoice_transaction=transaction,
        status="approved",
        claimed_amount=Decimal("80.00"),
        payment_method="cheque",
        reviewed_at=datetime(2026, 8, 18, 12, 0),
        created_at=datetime(2026, 8, 18, 11, 0),
        submitted_by=submitter,
        reviewed_by=reviewer,
        original_filename="cheque.jpg",
        review_notes="Matched bank record",
        ocr_provider="anthropic",
        extraction_confidence=Decimal("0.9800"),
        mismatch_flags=[],
    )

    response = invoice_payment_evidence_response(
        _invoice(proofs=[proof]),
        include_internal_review=True,
    )
    item = response["items"][0]

    assert item["evidence_type"] == "uploaded_proof"
    assert item["status"] == "approved"
    assert item["proof_file_url"] == "/billing/payment-proofs/17/file"
    assert item["submitted_by_name"] == "Facility Manager"
    assert item["reviewed_by_name"] == "Billing Admin"
    assert item["review_notes"] == "Matched bank record"


def test_receipt_and_linked_proof_do_not_duplicate_ledger_payments():
    receipt = SimpleNamespace(
        id=1,
        payment_reference="square-abc",
        payment_method="square_card",
        amount=Decimal("50.00"),
        card_brand="Mastercard",
        card_last4="1111",
        status="pending",
        created_at=datetime(2026, 8, 18, 9, 0),
    )
    proof_transaction = SimpleNamespace(
        id=2,
        transaction_type="payment",
        payment_method="cheque",
        reference_number="PAY-CHEQUE",
        amount=Decimal("25.00"),
        created_at=datetime(2026, 8, 18, 8, 0),
        created_by=None,
    )
    card_transaction = SimpleNamespace(
        id=3,
        transaction_type="payment",
        payment_method="credit_card",
        reference_number="square-abc",
        amount=Decimal("50.00"),
        created_at=datetime(2026, 8, 18, 9, 0),
        created_by=None,
    )
    proof = SimpleNamespace(
        id=4,
        invoice_transaction_id=2,
        invoice_transaction=proof_transaction,
        status="approved",
        claimed_amount=Decimal("25.00"),
        payment_method="cheque",
        reviewed_at=datetime(2026, 8, 18, 8, 5),
        created_at=datetime(2026, 8, 18, 7, 55),
        submitted_by=None,
        reviewed_by=None,
        original_filename="proof.pdf",
        review_notes=None,
        ocr_provider=None,
        extraction_confidence=None,
        mismatch_flags=[],
    )

    response = invoice_payment_evidence_response(
        _invoice(proofs=[proof], receipts=[receipt], transactions=[proof_transaction, card_transaction])
    )

    assert len(response["items"]) == 2
    assert {item["evidence_type"] for item in response["items"]} == {"uploaded_proof", "card_payment"}


def test_manual_card_ledger_exposes_only_optional_masked_metadata():
    transaction = SimpleNamespace(
        id=12,
        transaction_type="payment",
        payment_method="credit_card",
        reference_number="PAY-INTERNAL-12",
        amount=Decimal("45.00"),
        card_brand="Visa",
        card_last4="4242",
        created_at=datetime(2026, 8, 18, 14, 0),
        created_by=SimpleNamespace(full_name="Billing Admin", username="admin"),
    )

    response = invoice_payment_evidence_response(_invoice(transactions=[transaction]))
    evidence = response["items"][0]

    assert evidence["evidence_type"] == "card_payment"
    assert evidence["card_brand"] == "Visa"
    assert evidence["card_last4"] == "4242"
    serialized = str(response).lower()
    assert "cvv" not in serialized
    assert "4111111111111111" not in serialized
