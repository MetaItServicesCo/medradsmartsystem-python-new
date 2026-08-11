from __future__ import annotations

import hashlib
import json
from datetime import datetime
from decimal import Decimal, ROUND_HALF_UP
from typing import Any, Optional

from fastapi import HTTPException
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models.payment_operation import PaymentOperation


def money(value: Any) -> Decimal:
    return Decimal(str(value or 0)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def payment_fingerprint(
    operation_type: str,
    *,
    amount: Any,
    currency: str = "USD",
    invoice_id: Optional[int] = None,
    quotation_id: Optional[int] = None,
    attributes: Optional[dict[str, Any]] = None,
) -> str:
    """Hash only stable business intent; card tokens and secrets are excluded."""
    canonical = {
        "operation_type": operation_type,
        "invoice_id": invoice_id,
        "quotation_id": quotation_id,
        "amount": format(money(amount), ".2f"),
        "currency": (currency or "USD").strip().upper(),
        "attributes": attributes or {},
    }
    encoded = json.dumps(canonical, sort_keys=True, separators=(",", ":"), default=str)
    return hashlib.sha256(encoded.encode("utf-8")).hexdigest()


def get_or_create_operation(
    db: Session,
    *,
    idempotency_key: str,
    fingerprint: str,
    operation_type: str,
    amount: Any,
    currency: str = "USD",
    invoice_id: Optional[int] = None,
    quotation_id: Optional[int] = None,
    provider: Optional[str] = None,
    created_by_id: Optional[int] = None,
) -> tuple[PaymentOperation, bool]:
    key = (idempotency_key or "").strip()
    if not key:
        raise HTTPException(status_code=422, detail="An idempotency key is required")
    if len(key) > 255:
        raise HTTPException(status_code=422, detail="The idempotency key is too long")

    existing = (
        db.query(PaymentOperation)
        .filter(PaymentOperation.idempotency_key == key)
        .with_for_update()
        .first()
    )
    if existing:
        if existing.request_fingerprint != fingerprint:
            raise HTTPException(
                status_code=409,
                detail="This payment retry key was already used for different payment details",
            )
        return existing, True

    if invoice_id is not None:
        active = (
            db.query(PaymentOperation)
            .filter(
                PaymentOperation.invoice_id == invoice_id,
                PaymentOperation.operation_type == operation_type,
                PaymentOperation.status.in_(["processing", "unknown"]),
            )
            .with_for_update()
            .first()
        )
        if active:
            raise HTTPException(
                status_code=409,
                detail="A payment for this invoice is already being processed or verified",
            )

    operation = PaymentOperation(
        idempotency_key=key,
        request_fingerprint=fingerprint,
        operation_type=operation_type,
        status="processing",
        invoice_id=invoice_id,
        quotation_id=quotation_id,
        provider=provider,
        amount=money(amount),
        currency=(currency or "USD").strip().upper(),
        created_by_id=created_by_id,
    )
    try:
        with db.begin_nested():
            db.add(operation)
            db.flush()
    except IntegrityError:
        existing = (
            db.query(PaymentOperation)
            .filter(PaymentOperation.idempotency_key == key)
            .with_for_update()
            .first()
        )
        if not existing or existing.request_fingerprint != fingerprint:
            raise HTTPException(status_code=409, detail="The payment request conflicts with an existing operation")
        return existing, True
    return operation, False


def replay_or_raise(operation: PaymentOperation) -> Optional[dict[str, Any]]:
    if operation.status == "succeeded":
        return operation.response_data or {}
    if operation.status in {"processing", "unknown"}:
        raise HTTPException(
            status_code=409,
            detail="This payment is already being processed or awaiting provider verification",
        )
    # A definitive provider rejection can be retried with the same immutable
    # command key. Square will preserve its own idempotency semantics.
    operation.status = "processing"
    operation.error_message = None
    operation.completed_at = None
    operation.updated_at = datetime.utcnow()
    return None


def mark_operation_succeeded(
    operation: PaymentOperation,
    *,
    provider_reference: Optional[str] = None,
    response_data: Optional[dict[str, Any]] = None,
) -> None:
    operation.status = "succeeded"
    operation.provider_reference = provider_reference or operation.provider_reference
    operation.response_data = response_data or operation.response_data or {}
    operation.error_message = None
    operation.completed_at = datetime.utcnow()
    operation.updated_at = datetime.utcnow()


def mark_operation_failed(operation: PaymentOperation, message: str, *, unknown: bool = False) -> None:
    operation.status = "unknown" if unknown else "failed"
    operation.error_message = str(message)[:4000]
    operation.updated_at = datetime.utcnow()
    if not unknown:
        operation.completed_at = datetime.utcnow()
