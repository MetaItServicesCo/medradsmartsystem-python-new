"""Durable, horizontally scalable OCR processing for payment proofs."""

from __future__ import annotations

from datetime import datetime, timedelta
from types import SimpleNamespace
from typing import Any

from sqlalchemy import or_
from sqlalchemy.orm import joinedload

from app.core.config import settings
from app.db.base import SessionLocal
from app.models.invoice import PaymentProof
from app.utils.payment_proofs import extract_payment_proof, load_payment_proof


def ocr_retry_delay_seconds(attempts: int) -> int:
    return min(300, 15 * (2 ** max(0, int(attempts) - 1)))


def claim_payment_proof_jobs(limit: int | None = None) -> list[int]:
    """Atomically lease queued jobs. SKIP LOCKED permits concurrent workers."""
    now = datetime.utcnow()
    stale_before = now - timedelta(seconds=max(60, settings.PAYMENT_PROOF_OCR_LEASE_SECONDS))
    batch_size = max(1, min(limit or settings.PAYMENT_PROOF_OCR_BATCH_SIZE, 25))
    db = SessionLocal()
    try:
        jobs = (
            db.query(PaymentProof)
            .filter(
                PaymentProof.status == "pending_verification",
                or_(
                    (
                        PaymentProof.extraction_status.in_(["queued", "retry"])
                        & or_(
                            PaymentProof.extraction_next_attempt_at.is_(None),
                            PaymentProof.extraction_next_attempt_at <= now,
                        )
                    ),
                    (
                        PaymentProof.extraction_status == "processing"
                        & PaymentProof.extraction_started_at.is_not(None)
                        & (PaymentProof.extraction_started_at <= stale_before)
                    ),
                ),
            )
            .order_by(PaymentProof.extraction_next_attempt_at.asc().nullsfirst(), PaymentProof.id.asc())
            .with_for_update(skip_locked=True)
            .limit(batch_size)
            .all()
        )
        claimed: list[int] = []
        for proof in jobs:
            proof.extraction_status = "processing"
            proof.extraction_started_at = now
            proof.extraction_next_attempt_at = None
            proof.extraction_attempt_count = int(proof.extraction_attempt_count or 0) + 1
            proof.extraction_last_error = None
            claimed.append(proof.id)
        db.commit()
        return claimed
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


def _proof_processing_input(proof_id: int) -> tuple[SimpleNamespace, str, str, Any]:
    db = SessionLocal()
    try:
        proof = (
            db.query(PaymentProof)
            .options(joinedload(PaymentProof.invoice), joinedload(PaymentProof.service_quotation))
            .filter(PaymentProof.id == proof_id)
            .first()
        )
        if not proof or proof.status != "pending_verification" or proof.extraction_status != "processing":
            raise LookupError("Payment proof OCR lease is no longer active")
        reference = (
            proof.invoice.invoice_number
            if proof.invoice is not None
            else proof.service_quotation.quotation_number
            if proof.service_quotation is not None
            else ""
        )
        stored = SimpleNamespace(
            stored_filename=proof.stored_filename,
            storage_backend=proof.storage_backend or "local",
        )
        return stored, proof.mime_type, reference, proof.claimed_amount
    finally:
        db.close()


def _record_success(proof_id: int, extraction: dict[str, Any]) -> bool:
    db = SessionLocal()
    try:
        proof = db.query(PaymentProof).filter(PaymentProof.id == proof_id).with_for_update().first()
        if not proof or proof.status != "pending_verification" or proof.extraction_status != "processing":
            db.rollback()
            return False
        proof.extraction_status = "completed"
        proof.extraction_completed_at = datetime.utcnow()
        proof.extraction_started_at = None
        proof.extraction_last_error = None
        proof.ocr_provider = extraction["provider"]
        proof.ocr_text = extraction["ocr_text"]
        proof.extracted_data = extraction["extracted_data"]
        proof.extraction_confidence = extraction["confidence"]
        proof.mismatch_flags = extraction["mismatch_flags"]
        db.commit()
        return True
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


def _record_failure(proof_id: int, exc: Exception) -> str:
    db = SessionLocal()
    try:
        proof = db.query(PaymentProof).filter(PaymentProof.id == proof_id).with_for_update().first()
        if not proof or proof.status != "pending_verification" or proof.extraction_status != "processing":
            db.rollback()
            return "lease_lost"
        attempts = int(proof.extraction_attempt_count or 0)
        error = f"{type(exc).__name__}: {str(exc)}"[:500]
        proof.extraction_last_error = error
        proof.extraction_started_at = None
        if attempts >= max(1, settings.PAYMENT_PROOF_OCR_MAX_ATTEMPTS):
            proof.extraction_status = "failed"
            proof.extraction_completed_at = datetime.utcnow()
            proof.extracted_data = {"extraction_error": error}
            proof.extraction_confidence = 0
            proof.mismatch_flags = ["ocr_extraction_failed"]
            outcome = "failed"
        else:
            proof.extraction_status = "retry"
            delay = ocr_retry_delay_seconds(attempts)
            proof.extraction_next_attempt_at = datetime.utcnow() + timedelta(seconds=delay)
            outcome = "retry"
        db.commit()
        return outcome
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


def process_payment_proof_job(proof_id: int) -> str:
    try:
        stored, mime_type, reference, claimed_amount = _proof_processing_input(proof_id)
        data = load_payment_proof(stored)
        extraction = extract_payment_proof(
            data,
            mime_type,
            expected_amount=claimed_amount,
            expected_reference=reference,
            raise_on_error=True,
        )
        return "completed" if _record_success(proof_id, extraction) else "lease_lost"
    except Exception as exc:
        return _record_failure(proof_id, exc)


def run_payment_proof_ocr_batch(limit: int | None = None) -> dict[str, int]:
    result = {"claimed": 0, "completed": 0, "retry": 0, "failed": 0, "lease_lost": 0}
    proof_ids = claim_payment_proof_jobs(limit)
    result["claimed"] = len(proof_ids)
    for proof_id in proof_ids:
        outcome = process_payment_proof_job(proof_id)
        result[outcome] = result.get(outcome, 0) + 1
    return result
