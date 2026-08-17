from decimal import Decimal

import pytest
from fastapi import HTTPException

from app.utils import payment_proofs
from app.utils.payment_proof_processing import ocr_retry_delay_seconds


def test_non_card_method_normalization_is_explicit() -> None:
    assert payment_proofs.normalize_non_card_method("ACH") == "ach"
    assert payment_proofs.normalize_non_card_method("MBMTS ACH") == "mbmts_ach"
    assert payment_proofs.normalize_non_card_method("check") == "cheque"

    with pytest.raises(HTTPException) as error:
        payment_proofs.normalize_non_card_method("credit_card")

    assert error.value.status_code == 400


def test_ocr_is_advisory_even_when_amount_and_reference_match(monkeypatch) -> None:
    monkeypatch.setattr(
        payment_proofs,
        "_image_text",
        lambda _data: "ACH confirmation ABC-7788 amount $125.00 on 08/17/2026 INV-SERVICE-123",
    )

    result = payment_proofs.extract_payment_proof(
        b"valid-image-placeholder",
        "image/png",
        expected_amount=Decimal("125.00"),
        expected_reference="INV-SERVICE-123",
    )

    assert result["status"] == "pending_verification"
    assert result["extracted_data"]["claimed_amount_detected"] is True
    assert result["extracted_data"]["target_reference_detected"] is True
    assert result["mismatch_flags"] == []


def test_ocr_mismatch_never_marks_payment_approved(monkeypatch) -> None:
    monkeypatch.setattr(
        payment_proofs,
        "_image_text",
        lambda _data: "Cheque reference CHK-9000 amount $20.00 on 08/17/2026",
    )

    result = payment_proofs.extract_payment_proof(
        b"valid-image-placeholder",
        "image/png",
        expected_amount=Decimal("125.00"),
        expected_reference="INV-SERVICE-123",
    )

    assert result["status"] == "pending_verification"
    assert "claimed_amount_not_detected" in result["mismatch_flags"]
    assert "target_reference_not_detected" in result["mismatch_flags"]


def test_strict_worker_extraction_surfaces_failures_for_retry(monkeypatch) -> None:
    monkeypatch.setattr(
        payment_proofs,
        "_image_text",
        lambda _data: (_ for _ in ()).throw(RuntimeError("ocr unavailable")),
    )

    with pytest.raises(RuntimeError, match="ocr unavailable"):
        payment_proofs.extract_payment_proof(
            b"valid-image-placeholder",
            "image/png",
            expected_amount=Decimal("10.00"),
            raise_on_error=True,
        )


def test_ocr_retry_uses_bounded_exponential_backoff() -> None:
    assert ocr_retry_delay_seconds(1) == 15
    assert ocr_retry_delay_seconds(2) == 30
    assert ocr_retry_delay_seconds(5) == 240
    assert ocr_retry_delay_seconds(20) == 300


def test_s3_storage_is_private_and_client_side_encrypted(monkeypatch) -> None:
    captured = {}

    class FakeS3:
        def put_object(self, **kwargs):
            captured.update(kwargs)

    monkeypatch.setattr(payment_proofs.settings, "PAYMENT_PROOF_STORAGE_BACKEND", "s3")
    monkeypatch.setattr(payment_proofs.settings, "PAYMENT_PROOF_S3_BUCKET", "private-proof-bucket")
    monkeypatch.setattr(payment_proofs.settings, "PAYMENT_PROOF_S3_PREFIX", "proofs")
    monkeypatch.setattr(payment_proofs, "encrypt_payment_blob", lambda data: b"encrypted:" + data)
    monkeypatch.setattr(payment_proofs, "_s3_client", lambda: FakeS3())

    stored_name, backend = payment_proofs.store_encrypted_payment_proof(b"private document")

    assert backend == "s3"
    assert stored_name.startswith("proofs/")
    assert captured["Bucket"] == "private-proof-bucket"
    assert captured["Body"] == b"encrypted:private document"
    assert captured["CacheControl"] == "no-store"
    assert "ACL" not in captured
