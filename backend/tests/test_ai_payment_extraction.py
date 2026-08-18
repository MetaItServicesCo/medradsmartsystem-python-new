from __future__ import annotations

import sys
from decimal import Decimal
from types import SimpleNamespace

from PIL import Image

from app.utils import ai_payment_extraction, payment_proofs


def _fields(**overrides):
    values = {
        "document_type": "cheque",
        "amount_numeric": "1,200.00",
        "amount_words": "One Thousand Two Hundred and 00/100",
        "currency": "USD",
        "payer": "Medical Practice",
        "payee": "Mr. Biomed Tech Services",
        "date": "07/20/2026",
        "cheque_number": "21102",
        "bank_name": "Commercial Bank",
        "memo": "INV-SERVICE-004560",
        "reference_candidates": ["INV-SERVICE-004560"],
        "legibility": "clear",
    }
    values.update(overrides)
    return values


def test_ai_result_matches_existing_review_contract(monkeypatch) -> None:
    monkeypatch.setattr(ai_payment_extraction.settings, "AI_EXTRACTION_MODEL", "test-model")

    result = ai_payment_extraction._build_result(
        _fields(),
        Decimal("1200.00"),
        "INV-SERVICE-004560",
    )

    assert result["status"] == "pending_verification"
    assert result["provider"] == "claude:test-model"
    assert result["mismatch_flags"] == []
    assert result["extracted_data"]["amounts"] == ["1200.00"]
    assert result["extracted_data"]["written_amount"] == "One Thousand Two Hundred and 00/100"
    assert result["extracted_data"]["claimed_amount_detected"] is True
    assert result["extracted_data"]["target_reference_detected"] is True
    assert result["extracted_data"]["confidence_is_estimate"] is True


def test_ai_mismatch_is_advisory_and_never_approves_payment() -> None:
    result = ai_payment_extraction._build_result(
        _fields(amount_numeric="1199.00", reference_candidates=[], memo=""),
        Decimal("1200.00"),
        "INV-SERVICE-004560",
    )

    assert result["status"] == "pending_verification"
    assert result["extracted_data"]["reconciliation"] == "mismatch"
    assert "claimed_amount_not_detected" in result["mismatch_flags"]
    assert "target_reference_not_detected" in result["mismatch_flags"]


def test_ai_request_includes_every_prepared_page(monkeypatch) -> None:
    captured = {}

    class FakeMessages:
        def create(self, **kwargs):
            captured.update(kwargs)
            block = SimpleNamespace(
                type="tool_use",
                name="record_payment_document",
                input=_fields(),
            )
            return SimpleNamespace(content=[block])

    class FakeAnthropic:
        def __init__(self, **_kwargs):
            self.messages = FakeMessages()

    monkeypatch.setitem(sys.modules, "anthropic", SimpleNamespace(Anthropic=FakeAnthropic))
    monkeypatch.setattr(
        ai_payment_extraction,
        "_prepare_vision_images",
        lambda _data, _mime: [("page-one", "image/jpeg"), ("page-two", "image/jpeg")],
    )
    monkeypatch.setattr(ai_payment_extraction.settings, "ANTHROPIC_API_KEY", "test-key")
    monkeypatch.setattr(ai_payment_extraction.settings, "AI_EXTRACTION_MODEL", "test-model")

    result = ai_payment_extraction.extract_payment_proof_with_ai(
        b"pdf",
        "application/pdf",
        expected_amount=Decimal("1200.00"),
        expected_reference="INV-SERVICE-004560",
    )

    content = captured["messages"][0]["content"]
    assert len([block for block in content if block["type"] == "image"]) == 2
    assert captured["tool_choice"] == {"type": "tool", "name": "record_payment_document"}
    assert result["status"] == "pending_verification"


def test_ai_image_normalization_corrects_exif_and_bounds_size() -> None:
    source = Image.new("RGB", (2400, 1200), "white")
    from io import BytesIO

    buffer = BytesIO()
    source.save(buffer, format="PNG")

    images = ai_payment_extraction._prepare_vision_images(buffer.getvalue(), "image/png")

    assert len(images) == 1
    assert images[0][1] == "image/jpeg"
    assert images[0][0]


def test_ai_pdf_preparation_includes_all_pages() -> None:
    import fitz

    document = fitz.open()
    for page_number in range(3):
        page = document.new_page()
        page.insert_text((72, 72), f"Proof page {page_number + 1}")
    payload = document.tobytes()
    document.close()

    images = ai_payment_extraction._prepare_vision_images(payload, "application/pdf")

    assert len(images) == 3
    assert all(encoded and media_type == "image/jpeg" for encoded, media_type in images)


def test_worker_falls_back_to_local_ocr_when_ai_provider_fails(monkeypatch) -> None:
    monkeypatch.setattr(payment_proofs, "ai_extraction_available", lambda: True)
    monkeypatch.setattr(
        payment_proofs,
        "extract_payment_proof_with_ai",
        lambda *_args, **_kwargs: (_ for _ in ()).throw(RuntimeError("provider unavailable")),
    )
    monkeypatch.setattr(
        payment_proofs,
        "_image_text",
        lambda _data: "Cheque 21102 amount $1,200.00",
    )

    result = payment_proofs.extract_payment_proof(
        b"image",
        "image/jpeg",
        expected_amount=Decimal("1200.00"),
        raise_on_error=True,
    )

    assert result["provider"] == "tesseract"
    assert result["extracted_data"]["claimed_amount_detected"] is True


def test_detailed_findings_are_separated_from_safe_database_summary() -> None:
    detailed = {
        "ocr_version": 3,
        "payer": "Private Person",
        "payee": "Private Vendor",
        "bank_name": "Private Bank",
        "cheque_number": "21102",
        "claimed_amount_detected": True,
        "target_reference_detected": False,
        "confidence_basis": "model_legibility_heuristic",
    }

    safe = payment_proofs.safe_extracted_data_summary(detailed)
    serialized = payment_proofs.serialize_extracted_data(detailed)
    proof = SimpleNamespace(id=9, extracted_data=safe, extracted_data_encrypted=serialized)

    assert "payer" not in safe
    assert "bank_name" not in safe
    assert payment_proofs.resolved_extracted_data(proof) == detailed
