from __future__ import annotations

import hashlib
import io
import os
import re
from datetime import datetime
from decimal import Decimal, InvalidOperation
from functools import lru_cache
from pathlib import Path
from typing import Any, Optional
from uuid import uuid4

from fastapi import HTTPException, UploadFile
from PIL import Image, ImageEnhance, ImageOps

from app.core.config import settings
from app.models.invoice import PaymentProof
from app.utils.payment_data_security import (
    PaymentDataSecurityError,
    decrypt_payment_blob,
    encrypt_payment_blob,
)
from app.utils.upload_security import protected_upload_path


PAYMENT_PROOF_SUBTREE = "payment_proofs"
PAYMENT_PROOF_DIR = os.path.join(settings.UPLOAD_DIR, PAYMENT_PROOF_SUBTREE)
ALLOWED_PAYMENT_PROOF_MIMES = {
    "application/pdf": ".pdf",
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
}
NON_CARD_METHODS = frozenset({"ach", "mbmts_ach", "cheque", "check", "bank_transfer"})


def _detect_payment_proof_mime(data: bytes) -> str:
    """Use libmagic when available, with strict signatures as a portable fallback."""
    try:
        import magic

        detected = str(magic.from_buffer(data, mime=True)).strip().lower()
        if detected:
            return detected
    except (ImportError, OSError):
        # Windows development environments may not have the native libmagic DLL.
        # These signatures remain content-based; filenames/extensions are never trusted.
        pass

    if data.startswith(b"%PDF-"):
        return "application/pdf"
    if data.startswith(b"\xff\xd8\xff"):
        return "image/jpeg"
    if data.startswith(b"\x89PNG\r\n\x1a\n"):
        return "image/png"
    if len(data) >= 12 and data.startswith(b"RIFF") and data[8:12] == b"WEBP":
        return "image/webp"
    return "application/octet-stream"


def normalize_non_card_method(value: str) -> str:
    method = (value or "").strip().lower().replace(" ", "_")
    if method == "check":
        method = "cheque"
    if method not in NON_CARD_METHODS:
        raise HTTPException(
            status_code=400,
            detail="Payment proof is required only for ACH, MBMTS ACH, cheque, or bank transfer payments",
        )
    return method


async def read_and_validate_payment_proof(upload: UploadFile) -> tuple[bytes, str, str]:
    original_name = Path(upload.filename or "payment-proof").name[:255]
    data = await upload.read(settings.MAX_UPLOAD_SIZE + 1)
    if not data:
        raise HTTPException(status_code=400, detail="Payment proof file is empty")
    if len(data) > settings.MAX_UPLOAD_SIZE:
        raise HTTPException(
            status_code=413,
            detail=f"Payment proof cannot exceed {settings.MAX_UPLOAD_SIZE // (1024 * 1024)} MB",
        )
    detected_mime = _detect_payment_proof_mime(data)
    if detected_mime not in ALLOWED_PAYMENT_PROOF_MIMES:
        raise HTTPException(
            status_code=400,
            detail="Payment proof must be a PDF, JPEG, PNG, or WebP file",
        )
    if detected_mime.startswith("image/"):
        try:
            with Image.open(io.BytesIO(data)) as image:
                image.verify()
        except Exception as exc:
            raise HTTPException(status_code=400, detail="Payment proof image is invalid") from exc
    return data, detected_mime, original_name


def configured_payment_proof_storage_backend() -> str:
    backend = settings.PAYMENT_PROOF_STORAGE_BACKEND.strip().lower()
    return backend if backend in {"local", "s3"} else "local"


@lru_cache(maxsize=1)
def _s3_client():
    import boto3
    from botocore.config import Config

    kwargs: dict[str, Any] = {
        "config": Config(retries={"max_attempts": 5, "mode": "adaptive"}),
    }
    if settings.PAYMENT_PROOF_S3_ENDPOINT_URL.strip():
        kwargs["endpoint_url"] = settings.PAYMENT_PROOF_S3_ENDPOINT_URL.strip()
    if settings.PAYMENT_PROOF_S3_REGION.strip():
        kwargs["region_name"] = settings.PAYMENT_PROOF_S3_REGION.strip()
    if settings.PAYMENT_PROOF_S3_ACCESS_KEY_ID.strip():
        kwargs["aws_access_key_id"] = settings.PAYMENT_PROOF_S3_ACCESS_KEY_ID.strip()
    if settings.PAYMENT_PROOF_S3_SECRET_ACCESS_KEY.strip():
        kwargs["aws_secret_access_key"] = settings.PAYMENT_PROOF_S3_SECRET_ACCESS_KEY.strip()
    return boto3.client("s3", **kwargs)


def _s3_object_key() -> str:
    prefix = settings.PAYMENT_PROOF_S3_PREFIX.strip().strip("/") or PAYMENT_PROOF_SUBTREE
    return f"{prefix}/{datetime.utcnow():%Y/%m}/{uuid4().hex}.proof"


def store_encrypted_payment_proof(data: bytes) -> tuple[str, str]:
    storage_backend = configured_payment_proof_storage_backend()
    try:
        encrypted = encrypt_payment_blob(data)
        if storage_backend == "s3":
            stored_name = _s3_object_key()
            extra: dict[str, Any] = {
                "Bucket": settings.PAYMENT_PROOF_S3_BUCKET.strip(),
                "Key": stored_name,
                "Body": encrypted,
                "ContentType": "application/octet-stream",
                "CacheControl": "no-store",
                "Metadata": {"encrypted": "fernet-v1"},
            }
            if settings.PAYMENT_PROOF_S3_SERVER_SIDE_ENCRYPTION.strip():
                extra["ServerSideEncryption"] = settings.PAYMENT_PROOF_S3_SERVER_SIDE_ENCRYPTION.strip()
            _s3_client().put_object(**extra)
            return stored_name, storage_backend

        os.makedirs(PAYMENT_PROOF_DIR, mode=0o700, exist_ok=True)
        stored_name = f"{uuid4().hex}.proof"
        destination = protected_upload_path(PAYMENT_PROOF_DIR, stored_name, PAYMENT_PROOF_SUBTREE)
        descriptor = os.open(destination, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        with os.fdopen(descriptor, "wb") as handle:
            handle.write(encrypted)
    except PaymentDataSecurityError as exc:
        raise HTTPException(
            status_code=503,
            detail="Secure payment-document storage is temporarily unavailable",
        ) from exc
    except Exception as exc:
        raise HTTPException(
            status_code=503,
            detail="Payment proof storage is temporarily unavailable",
        ) from exc
    return stored_name, storage_backend


def load_payment_proof(proof: PaymentProof) -> bytes:
    try:
        if (proof.storage_backend or "local").strip().lower() == "s3":
            response = _s3_client().get_object(
                Bucket=settings.PAYMENT_PROOF_S3_BUCKET.strip(),
                Key=proof.stored_filename,
            )
            return decrypt_payment_blob(response["Body"].read())
        path = protected_upload_path(PAYMENT_PROOF_DIR, proof.stored_filename, PAYMENT_PROOF_SUBTREE)
        with open(path, "rb") as handle:
            return decrypt_payment_blob(handle.read())
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail="Payment proof file is unavailable") from exc
    except PaymentDataSecurityError as exc:
        raise HTTPException(
            status_code=503,
            detail="Secure payment-document access is temporarily unavailable",
        ) from exc
    except Exception as exc:
        raise HTTPException(status_code=503, detail="Payment proof file is temporarily unavailable") from exc


def delete_payment_proof_file(stored_filename: str, storage_backend: str = "local") -> None:
    try:
        if storage_backend.strip().lower() == "s3":
            _s3_client().delete_object(
                Bucket=settings.PAYMENT_PROOF_S3_BUCKET.strip(),
                Key=stored_filename,
            )
            return
        path = protected_upload_path(PAYMENT_PROOF_DIR, stored_filename, PAYMENT_PROOF_SUBTREE)
        if os.path.exists(path):
            os.remove(path)
    except (OSError, ValueError):
        # Database state remains authoritative. Operational cleanup can retry.
        pass


def payment_proof_sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def _ocr_image_pass(image: Image.Image, *, page_segmentation_mode: int) -> tuple[str, float]:
    """Return text plus a quality score from one Tesseract document pass."""
    import pytesseract

    result = pytesseract.image_to_data(
        image,
        config=f"--oem 3 --psm {page_segmentation_mode}",
        output_type=pytesseract.Output.DICT,
    )
    lines: dict[tuple[Any, ...], list[str]] = {}
    weighted_confidence = 0.0
    confidence_weight = 0
    for index, raw_token in enumerate(result.get("text", [])):
        token = str(raw_token or "").strip()
        if not token:
            continue
        try:
            confidence = max(0.0, float(result.get("conf", [])[index]))
        except (IndexError, TypeError, ValueError):
            confidence = 0.0
        key = tuple(
            result.get(field, [0] * len(result.get("text", [])))[index]
            for field in ("page_num", "block_num", "par_num", "line_num")
        )
        lines.setdefault(key, []).append(token)
        weight = max(1, sum(character.isalnum() for character in token))
        weighted_confidence += confidence * weight
        confidence_weight += weight

    text = "\n".join(" ".join(tokens) for tokens in lines.values()).strip()
    mean_confidence = weighted_confidence / confidence_weight if confidence_weight else 0.0
    # Confidence is the main orientation signal. Readable characters and
    # payment-shaped values break ties without trusting any extracted value.
    quality = mean_confidence + min(20.0, len(re.findall(r"[A-Za-z0-9]", text)) / 20)
    if re.search(r"\$\s*\d|\d[,.]\d{2}", text):
        quality += 8.0
    return text, quality


def _image_text(data: bytes) -> str:
    """Read photographed proofs in any cardinal orientation.

    Phone photos commonly arrive sideways without reliable EXIF orientation.
    A light sparse-text pass selects the strongest orientation, followed by a
    denser document pass at full working resolution. This remains local OCR;
    no payment document is sent to an external service.
    """
    with Image.open(io.BytesIO(data)) as source:
        grayscale = ImageOps.autocontrast(
            ImageOps.exif_transpose(source).convert("L"),
            cutoff=1,
        )

    resampling = getattr(Image, "Resampling", Image).LANCZOS
    orientation_image = grayscale.copy()
    orientation_image.thumbnail((1800, 1800), resampling)
    candidates: list[tuple[float, int, str]] = []
    for rotation in (0, 90, 180, 270):
        rotated = orientation_image.rotate(rotation, expand=True)
        text, quality = _ocr_image_pass(rotated, page_segmentation_mode=11)
        candidates.append((quality, rotation, text))

    _, best_rotation, sparse_text = max(candidates, key=lambda candidate: candidate[0])
    document_image = grayscale.rotate(best_rotation, expand=True)
    document_image.thumbnail((2800, 2800), resampling)
    document_image = ImageEnhance.Sharpness(document_image).enhance(1.5)
    dense_text, _ = _ocr_image_pass(document_image, page_segmentation_mode=6)

    # Preserve both layouts because sparse mode is better at isolated cheque
    # numbers while dense mode is better at payee, amount, and memo rows.
    return "\n".join(value for value in (sparse_text, dense_text) if value).strip()


def _pdf_text(data: bytes) -> str:
    import fitz
    import pytesseract

    chunks: list[str] = []
    with fitz.open(stream=data, filetype="pdf") as document:
        if document.page_count > 10:
            raise ValueError("Payment proof PDF cannot exceed 10 pages")
        for page_number in range(document.page_count):
            page = document.load_page(page_number)
            text = page.get_text("text").strip()
            if len(text) < 40:
                pixmap = page.get_pixmap(matrix=fitz.Matrix(2, 2), alpha=False)
                image = Image.open(io.BytesIO(pixmap.tobytes("png"))).convert("L")
                text = pytesseract.image_to_string(image, config="--psm 6")
            chunks.append(text)
    return "\n".join(chunks)


def _money_candidates(text: str) -> list[Decimal]:
    # Tesseract can read the final decimal separator on photographed cheques
    # as a comma/colon, or omit it while retaining a space. Normalize only
    # currency-shaped values so account and routing numbers stay untouched.
    normalized_text = re.sub(
        r"(?<=\d)[,:;](?=\d{2}(?:\D|$))",
        ".",
        text,
    )
    normalized_text = re.sub(
        r"((?:USD\s*)?\$\s*(?:[0-9]{1,3}(?:[,\s][0-9]{3})+|[0-9]+))\s+(\d{2})(?!\d)",
        r"\1.\2",
        normalized_text,
        flags=re.I,
    )
    values: list[Decimal] = []
    for raw in re.findall(
        r"(?<!\d)(?:USD\s*)?\$?\s*((?:[0-9]{1,3}(?:[,\s][0-9]{3})+|[0-9]+)\.[0-9]{2})(?!\d)",
        normalized_text,
        flags=re.I,
    ):
        try:
            amount = Decimal(raw.replace(",", "").replace(" ", "")).quantize(Decimal("0.01"))
        except InvalidOperation:
            continue
        if amount >= 0 and amount not in values:
            values.append(amount)
    return values[:20]


def _extract_reference(text: str) -> Optional[str]:
    patterns = (
        r"(?:confirmation|reference|trace|transaction|check|cheque)\s*(?:number|no\.?|#)?\s*[:#-]?\s*([A-Z0-9-]{4,40})",
        r"\b(?:ACH|CHK|TXN)[- ]?[A-Z0-9-]{4,36}\b",
    )
    for pattern in patterns:
        match = re.search(pattern, text, flags=re.I)
        if match:
            return (match.group(1) if match.lastindex else match.group(0)).strip()[:64]
    return None


def extract_payment_proof(
    data: bytes,
    mime_type: str,
    *,
    expected_amount: Decimal,
    expected_reference: Optional[str] = None,
    raise_on_error: bool = False,
) -> dict[str, Any]:
    """Extract review hints. The result never authorizes or applies payment."""
    try:
        raw_text = _pdf_text(data) if mime_type == "application/pdf" else _image_text(data)
        normalized = re.sub(r"[ \t]+", " ", raw_text).strip()
        amounts = _money_candidates(normalized)
        dates = list(dict.fromkeys(re.findall(
            r"\b(?:0?[1-9]|1[0-2])[/.-](?:0?[1-9]|[12]\d|3[01])[/.-](?:20)?\d{2}\b",
            normalized,
        )))[:8]
        reference = _extract_reference(normalized)
        expected = Decimal(str(expected_amount)).quantize(Decimal("0.01"))
        amount_match = any(abs(value - expected) <= Decimal("0.01") for value in amounts)
        reference_match = bool(
            expected_reference
            and expected_reference.lower() in normalized.lower()
        )
        mismatches: list[str] = []
        if not amounts:
            mismatches.append("amount_not_detected")
        elif not amount_match:
            mismatches.append("claimed_amount_not_detected")
        if expected_reference and not reference_match:
            mismatches.append("target_reference_not_detected")
        confidence = Decimal("0.25")
        if len(normalized) >= 40:
            confidence += Decimal("0.20")
        if amounts:
            confidence += Decimal("0.15")
        if amount_match:
            confidence += Decimal("0.25")
        if reference or reference_match:
            confidence += Decimal("0.15")
        return {
            "status": "pending_verification",
            "provider": "tesseract",
            "ocr_text": normalized[:12000],
            "extracted_data": {
                "amounts": [str(value) for value in amounts],
                "dates": dates,
                "reference": reference,
                "claimed_amount_detected": amount_match,
                "target_reference_detected": reference_match,
            },
            "confidence": min(confidence, Decimal("1.0000")),
            "mismatch_flags": mismatches,
        }
    except Exception as exc:
        if raise_on_error:
            raise
        return {
            "status": "pending_verification",
            "provider": "tesseract",
            "ocr_text": None,
            "extracted_data": {"extraction_error": str(exc)[:300]},
            "confidence": Decimal("0"),
            "mismatch_flags": ["ocr_extraction_failed"],
        }


def payment_proof_response(proof: PaymentProof, *, include_ocr_text: bool = False) -> dict[str, Any]:
    invoice = proof.invoice
    quotation = proof.service_quotation
    target_number = invoice.invoice_number if invoice else (quotation.quotation_number if quotation else None)
    customer_name = invoice.customer_name if invoice else None
    if customer_name is None and quotation and quotation.service_request:
        facility = quotation.service_request.facility
        customer_name = facility.name if facility else None
    return {
        "id": proof.id,
        "invoice_id": proof.invoice_id,
        "service_quotation_id": proof.service_quotation_id,
        "target_type": "invoice" if proof.invoice_id else "service_quotation",
        "target_number": target_number,
        "customer_name": customer_name,
        "payment_method": proof.payment_method,
        "claimed_amount": proof.claimed_amount,
        "notes": proof.notes,
        "original_filename": proof.original_filename,
        "mime_type": proof.mime_type,
        "file_size": proof.file_size,
        "status": proof.status,
        "extraction_status": proof.extraction_status,
        "extraction_attempt_count": proof.extraction_attempt_count,
        "extraction_completed_at": proof.extraction_completed_at,
        "extraction_last_error": proof.extraction_last_error,
        "ocr_provider": proof.ocr_provider,
        "ocr_text": proof.ocr_text if include_ocr_text else None,
        "extracted_data": proof.extracted_data or {},
        "extraction_confidence": proof.extraction_confidence,
        "mismatch_flags": proof.mismatch_flags or [],
        "requires_manual_review": proof.requires_manual_review,
        "submitted_by_id": proof.submitted_by_id,
        "submitted_by_name": proof.submitted_by.full_name if proof.submitted_by else None,
        "reviewed_by_id": proof.reviewed_by_id,
        "reviewed_by_name": proof.reviewed_by.full_name if proof.reviewed_by else None,
        "reviewed_at": proof.reviewed_at,
        "review_notes": proof.review_notes,
        "invoice_transaction_id": proof.invoice_transaction_id,
        "quotation_payment_id": proof.quotation_payment_id,
        "file_url": f"/api/v1/billing/payment-proofs/{proof.id}/file",
        "created_at": proof.created_at,
        "updated_at": proof.updated_at,
    }
