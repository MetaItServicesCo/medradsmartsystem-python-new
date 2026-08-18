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


def test_money_candidates_support_grouped_cheque_amounts() -> None:
    assert payment_proofs._money_candidates("Amount $ 1,200.00") == [Decimal("1200.00")]
    assert payment_proofs._money_candidates("Amount USD 1 200.00") == [Decimal("1200.00")]


def test_money_candidates_tolerate_common_ocr_decimal_errors() -> None:
    assert payment_proofs._money_candidates(
        "Amount $ 1,200,00 and duplicate $ 1,200 00"
    ) == [Decimal("1200.00")]


def test_image_ocr_selects_the_readable_rotation(monkeypatch) -> None:
    image = payment_proofs.Image.new("RGB", (120, 60), "white")
    payload = payment_proofs.io.BytesIO()
    image.save(payload, format="PNG")
    calls: list[tuple[int, int, int]] = []

    def fake_pass(candidate, *, page_segmentation_mode):
        calls.append((candidate.width, candidate.height, page_segmentation_mode))
        if candidate.height > candidate.width:
            return "Cheque amount $1,200.00", 90.0
        return "unreadable", 10.0

    monkeypatch.setattr(payment_proofs, "_ocr_image_pass", fake_pass)
    monkeypatch.setattr(payment_proofs, "_ocr_numeric_pass", lambda _image: "$1,200.00")

    text = payment_proofs._image_text(payload.getvalue())

    assert "$1,200.00" in text
    assert len([call for call in calls if call[2] == 11]) == 5
    assert calls[-1][2] == 6
    assert calls[-1][1] > calls[-1][0]


def test_image_ocr_prefers_payment_signals_over_clear_background_text(monkeypatch) -> None:
    image = payment_proofs.Image.new("RGB", (120, 60), "white")
    payload = payment_proofs.io.BytesIO()
    image.save(payload, format="PNG")

    def fake_pass(candidate, *, page_segmentation_mode):
        if candidate.height > candidate.width:
            return "PAY TO THE ORDER OF Vendor\nOne Hundred DOLLARS\n$100.00\nMEMO", 55.0
        return "POST IT SUPER STICKY NOTES CLEAR BACKGROUND WORDS", 95.0

    monkeypatch.setattr(payment_proofs, "_ocr_image_pass", fake_pass)
    monkeypatch.setattr(payment_proofs, "_ocr_numeric_pass", lambda _image: "$100.00")

    text = payment_proofs._image_text(payload.getvalue())

    assert "PAY TO THE ORDER OF" in text
    assert "$100.00" in text


def test_cheque_fields_are_extracted_for_manual_review(monkeypatch) -> None:
    monkeypatch.setattr(
        payment_proofs,
        "_image_text",
        lambda _data: """Commercial Bank
21102
PAY TO THE ORDER OF: Mr. Biomed Tech Services
One Thousand Two Hundred and 00/100 DOLLARS
MEMO: Equipment maintenance
07/20/2026
$ 1,200.00""",
    )

    result = payment_proofs.extract_payment_proof(
        b"valid-image-placeholder",
        "image/jpeg",
        expected_amount=Decimal("1200.00"),
        expected_reference="INV-SERVICE-004560",
    )

    extracted = result["extracted_data"]
    assert extracted["ocr_version"] == 2
    assert extracted["amounts"] == ["1200.00"]
    assert extracted["cheque_number"] == "21102"
    assert extracted["reference"] == "21102"
    assert extracted["payee"] == "Mr. Biomed Tech Services"
    assert extracted["bank_name"] == "Commercial Bank"
    assert extracted["memo"] == "Equipment maintenance"
    assert extracted["written_amount"] == "One Thousand Two Hundred and 00/100"
    assert extracted["dates"] == ["07/20/2026"]
    assert extracted["claimed_amount_detected"] is True
    assert extracted["target_reference_detected"] is False
    assert result["mismatch_flags"] == ["target_reference_not_detected"]


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
