"""AI-powered payment-proof (cheque / bank slip) extraction via Claude vision.

This is a drop-in provider for :func:`app.utils.payment_proofs.extract_payment_proof`.
It reads a photographed cheque or bank payment document the way a person does —
handling rotation, skew, and real-world backgrounds that line-OCR engines cannot —
and returns the *same result contract* as the Tesseract path, plus richer
structured fields and a deterministic reconciliation against the expected amount.

The model only *reads* the document. Whether the amount matches, and whether the
payment is ever applied, are decided by our own code — never by the model.
"""
from __future__ import annotations

import base64
import io
import logging
import re
from decimal import Decimal, InvalidOperation
from typing import Any, Optional

from app.core.config import settings


logger = logging.getLogger("medrad.ai_extraction")


# Structured schema the vision model must fill in. Forcing this single tool call
# guarantees deterministic JSON — no free-form text to parse.
_EXTRACTION_TOOL = {
    "name": "record_payment_document",
    "description": (
        "Record the fields read from a photographed cheque or bank payment "
        "document. Use empty strings for anything not clearly legible; never guess."
    ),
    "input_schema": {
        "type": "object",
        "additionalProperties": False,
        "properties": {
            "document_type": {
                "type": "string",
                "enum": ["cheque", "bank_transfer_receipt", "ach_confirmation", "deposit_slip", "other"],
                "description": "The kind of payment document shown.",
            },
            "amount_numeric": {
                "type": "string",
                "description": "The payment amount in digits only, e.g. '1200.00'. Empty string if not legible.",
            },
            "amount_words": {
                "type": "string",
                "description": "The amount written in words, e.g. 'One Thousand Two Hundred and 00/100'. Empty string if none.",
            },
            "currency": {
                "type": "string",
                "description": "ISO currency code (e.g. 'USD') if determinable, else empty string.",
            },
            "payer": {
                "type": "string",
                "description": "Account holder / drawer / sender name. Empty string if not legible.",
            },
            "payee": {
                "type": "string",
                "description": "Pay-to-the-order-of / beneficiary name. Empty string if not legible.",
            },
            "date": {
                "type": "string",
                "description": "The date printed on the document, exactly as shown. Empty string if none.",
            },
            "cheque_number": {
                "type": "string",
                "description": "Cheque/check number or transaction/confirmation reference. Empty string if none.",
            },
            "bank_name": {
                "type": "string",
                "description": "Issuing / originating bank name. Empty string if none.",
            },
            "memo": {
                "type": "string",
                "description": "Memo / note / invoice reference written on the document. Empty string if none.",
            },
            "reference_candidates": {
                "type": "array",
                "items": {"type": "string"},
                "description": "Every invoice or reference number visible anywhere on the document.",
            },
            "legibility": {
                "type": "string",
                "enum": ["clear", "partial", "poor"],
                "description": "How legible the document is overall.",
            },
        },
        "required": [
            "document_type", "amount_numeric", "amount_words", "currency",
            "payer", "payee", "date", "cheque_number", "bank_name", "memo",
            "reference_candidates", "legibility",
        ],
    },
}

_PROMPT = (
    "This image is a customer's payment proof for an invoice — usually a cheque, "
    "but it may be a bank transfer receipt or ACH confirmation. It is often a phone "
    "photo that may be rotated, angled, or on a busy background. Read it carefully, "
    "correcting for orientation, and record the fields using the tool. Read the amount "
    "from the digits box; cross-check it against the written-words amount when both are "
    "present. Use empty strings for anything you cannot read with confidence — do not guess."
)

_LEGIBILITY_CONFIDENCE = {
    # These are deliberately conservative review-aid estimates, not calibrated
    # probabilities. Financial approval remains a separate human action.
    "clear": Decimal("0.75"),
    "partial": Decimal("0.50"),
    "poor": Decimal("0.25"),
}


def ai_extraction_available() -> bool:
    """True when AI extraction is enabled and an API key is configured."""
    return bool(settings.AI_EXTRACTION_ENABLED and settings.ANTHROPIC_API_KEY.strip())


def _encode_image_jpeg(data: bytes) -> tuple[str, str]:
    """Normalize one image into an EXIF-corrected, bounded JPEG."""
    from PIL import Image, ImageOps

    with Image.open(io.BytesIO(data)) as source:
        image = ImageOps.exif_transpose(source).convert("RGB")
        image.thumbnail((2000, 2000))
        buffer = io.BytesIO()
        image.save(buffer, format="JPEG", quality=90)
    return base64.standard_b64encode(buffer.getvalue()).decode("ascii"), "image/jpeg"


def _prepare_vision_images(data: bytes, mime_type: str) -> list[tuple[str, str]]:
    """Prepare all proof pages for vision using the same ten-page limit as OCR."""
    if mime_type == "application/pdf":
        import fitz

        encoded: list[tuple[str, str]] = []
        with fitz.open(stream=data, filetype="pdf") as document:
            if document.page_count > 10:
                raise ValueError("Payment proof PDF cannot exceed 10 pages")
            for page_number in range(document.page_count):
                page = document.load_page(page_number)
                pixmap = page.get_pixmap(matrix=fitz.Matrix(2, 2), alpha=False)
                encoded.append(_encode_image_jpeg(pixmap.tobytes("png")))
        if not encoded:
            raise ValueError("Payment proof PDF contains no pages")
        return encoded

    return [_encode_image_jpeg(data)]


def _parse_amount(raw: str) -> Optional[Decimal]:
    cleaned = re.sub(r"[^0-9.]", "", (raw or "").replace(",", "").strip())
    if not cleaned or cleaned == ".":
        return None
    try:
        return Decimal(cleaned).quantize(Decimal("0.01"))
    except (InvalidOperation, ValueError):
        return None


def _build_result(
    fields: dict[str, Any],
    expected_amount: Decimal,
    expected_reference: Optional[str],
) -> dict[str, Any]:
    """Turn the model's structured read into the standard extraction contract.

    The amount comparison is done here, deterministically — the model never decides
    whether the cheque matches the invoice.
    """
    cheque_amount = _parse_amount(str(fields.get("amount_numeric", "")))
    expected = Decimal(str(expected_amount)).quantize(Decimal("0.01"))
    amount_match = cheque_amount is not None and abs(cheque_amount - expected) <= Decimal("0.01")

    references = [str(r).strip() for r in (fields.get("reference_candidates") or []) if str(r).strip()]
    memo = str(fields.get("memo") or "").strip()
    cheque_number = str(fields.get("cheque_number") or "").strip()
    haystack = " ".join(references + [memo, cheque_number]).lower()
    reference_match = bool(expected_reference and expected_reference.strip().lower() in haystack)

    mismatches: list[str] = []
    if cheque_amount is None:
        mismatches.append("amount_not_detected")
    elif not amount_match:
        mismatches.append("claimed_amount_not_detected")
    if expected_reference and not reference_match:
        mismatches.append("target_reference_not_detected")

    legibility = str(fields.get("legibility") or "partial")
    confidence = _LEGIBILITY_CONFIDENCE.get(legibility, Decimal("0.50"))
    if amount_match:
        confidence = min(Decimal("0.85"), confidence + Decimal("0.05"))

    if cheque_amount is None:
        reconciliation = "undetermined"
    elif amount_match:
        reconciliation = "match"
    else:
        reconciliation = "mismatch"

    date_value = str(fields.get("date") or "").strip()
    summary_lines = [
        ("Document", str(fields.get("document_type") or "")),
        ("Bank", str(fields.get("bank_name") or "")),
        ("Payer", str(fields.get("payer") or "")),
        ("Payee", str(fields.get("payee") or "")),
        ("Amount", str(fields.get("amount_numeric") or "")),
        ("In words", str(fields.get("amount_words") or "")),
        ("Date", date_value),
        ("Cheque #", cheque_number),
        ("Memo", memo),
    ]
    ocr_text = "\n".join(f"{label}: {value}" for label, value in summary_lines if value)

    return {
        "status": "pending_verification",
        "provider": f"claude:{settings.AI_EXTRACTION_MODEL}",
        "ocr_text": ocr_text[:12000],
        "extracted_data": {
            # Keys the existing review UI already reads (kept identical to the OCR path).
            "ocr_version": 3,
            "amounts": [str(cheque_amount)] if cheque_amount is not None else [],
            "dates": [date_value] if date_value else [],
            "reference": references[0] if references else (cheque_number or None),
            "claimed_amount_detected": amount_match,
            "target_reference_detected": reference_match,
            # Richer structured fields + the reconciliation the reviewer wants to see.
            "document_type": fields.get("document_type") or None,
            "cheque_amount": str(cheque_amount) if cheque_amount is not None else None,
            "written_amount": str(fields.get("amount_words") or "") or None,
            # Kept as an alias for API consumers that adopted the richer AI key.
            "amount_in_words": str(fields.get("amount_words") or "") or None,
            "currency": str(fields.get("currency") or "") or None,
            "payer": str(fields.get("payer") or "") or None,
            "payee": str(fields.get("payee") or "") or None,
            "cheque_number": cheque_number or None,
            "bank_name": str(fields.get("bank_name") or "") or None,
            "memo": memo or None,
            "amount_due": str(expected),
            "amount_match": amount_match,
            "reconciliation": reconciliation,
            "legibility": legibility,
            "confidence_basis": "model_legibility_heuristic",
            "confidence_is_estimate": True,
        },
        "confidence": confidence,
        "mismatch_flags": mismatches,
    }


def extract_payment_proof_with_ai(
    data: bytes,
    mime_type: str,
    *,
    expected_amount: Decimal,
    expected_reference: Optional[str] = None,
) -> dict[str, Any]:
    """Read a payment proof with Claude vision and return the extraction contract.

    Raises on transient API/network failure so the OCR worker retries with backoff;
    the caller decides whether to fall back to Tesseract.
    """
    import anthropic

    images = _prepare_vision_images(data, mime_type)
    client = anthropic.Anthropic(
        api_key=settings.ANTHROPIC_API_KEY,
        timeout=float(settings.AI_EXTRACTION_TIMEOUT_SECONDS),
        max_retries=1,
    )
    content: list[dict[str, Any]] = []
    for page_number, (image_b64, media_type) in enumerate(images, start=1):
        if len(images) > 1:
            content.append({"type": "text", "text": f"Payment proof page {page_number} of {len(images)}."})
        content.append(
            {
                "type": "image",
                "source": {"type": "base64", "media_type": media_type, "data": image_b64},
            }
        )
    content.append({"type": "text", "text": _PROMPT})

    message = client.messages.create(
        model=settings.AI_EXTRACTION_MODEL,
        max_tokens=1024,
        thinking={"type": "disabled"},
        tools=[_EXTRACTION_TOOL],
        tool_choice={"type": "tool", "name": "record_payment_document"},
        messages=[
            {
                "role": "user",
                "content": content,
            }
        ],
    )

    fields: Optional[dict[str, Any]] = None
    for block in message.content:
        if getattr(block, "type", None) == "tool_use" and getattr(block, "name", None) == "record_payment_document":
            fields = dict(block.input or {})
            break
    if fields is None:
        raise RuntimeError("AI extraction returned no structured result")

    return _build_result(fields, expected_amount, expected_reference)
