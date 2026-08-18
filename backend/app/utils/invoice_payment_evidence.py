"""Read-only, PCI-safe payment evidence for invoice presentation.

This module deliberately does not mutate financial state.  It composes the
existing invoice ledger, non-card proof review record, and Square receipt
outbox into one presentation contract.  Only masked card metadata is exposed;
PANs, CVVs, source tokens, and saved-card provider IDs never enter the response.
"""

from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from app.models.invoice import Invoice


def _value(value: Any) -> Any:
    return value.value if hasattr(value, "value") else value


def _name(user: Any) -> str | None:
    if not user:
        return None
    return getattr(user, "full_name", None) or getattr(user, "username", None)


def _timestamp(value: Any) -> str:
    if isinstance(value, datetime):
        return value.isoformat()
    return str(value or "")


def _is_card_method(value: Any) -> bool:
    normalized = str(_value(value) or "").strip().lower()
    return "card" in normalized or "square" in normalized


def invoice_payment_evidence_response(
    invoice: "Invoice",
    *,
    include_internal_review: bool = False,
) -> dict[str, Any]:
    """Return display-only evidence attached to ``invoice``.

    Receipt rows are durable records created only after a successful provider
    payment. Payment-proof rows retain their review status so a pending upload
    cannot be mistaken for collected funds. Legacy/manual card ledger entries
    are included without inventing card details that were never recorded.
    """

    items: list[dict[str, Any]] = []
    receipt_references: set[str] = set()
    proof_transaction_ids: set[int] = set()

    for proof in getattr(invoice, "payment_proofs", None) or []:
        if proof.invoice_transaction_id:
            proof_transaction_ids.add(int(proof.invoice_transaction_id))
        item = {
            "id": f"proof-{proof.id}",
            "evidence_type": "uploaded_proof",
            "status": proof.status,
            "amount": proof.claimed_amount,
            "currency": "USD",
            "payment_method": proof.payment_method,
            "reference_number": (
                proof.invoice_transaction.reference_number
                if getattr(proof, "invoice_transaction", None)
                else None
            ),
            "card_brand": None,
            "card_last4": None,
            "occurred_at": proof.reviewed_at or proof.created_at,
            "submitted_at": proof.created_at,
            "submitted_by_name": _name(getattr(proof, "submitted_by", None)),
            "reviewed_at": proof.reviewed_at,
            "reviewed_by_name": _name(getattr(proof, "reviewed_by", None)),
            "proof_id": proof.id,
            "proof_filename": proof.original_filename,
            "proof_file_url": f"/billing/payment-proofs/{proof.id}/file",
            "receipt_delivery_status": None,
        }
        if include_internal_review:
            item["review_notes"] = proof.review_notes
            item["ocr_provider"] = proof.ocr_provider
            item["extraction_confidence"] = proof.extraction_confidence
            item["mismatch_flags"] = proof.mismatch_flags or []
        items.append(item)

    for receipt in getattr(invoice, "receipt_deliveries", None) or []:
        reference = str(receipt.payment_reference or "").strip()
        if reference:
            receipt_references.add(reference)
        items.append({
            "id": f"card-{receipt.id}",
            "evidence_type": "card_payment" if _is_card_method(receipt.payment_method) else "recorded_payment",
            "status": "confirmed",
            "amount": receipt.amount,
            "currency": "USD",
            "payment_method": receipt.payment_method,
            "reference_number": reference or None,
            "card_brand": receipt.card_brand,
            "card_last4": str(receipt.card_last4 or "")[-4:] or None,
            "occurred_at": receipt.created_at,
            "submitted_at": None,
            "submitted_by_name": None,
            "reviewed_at": None,
            "reviewed_by_name": None,
            "proof_id": None,
            "proof_filename": None,
            "proof_file_url": None,
            "receipt_delivery_status": receipt.status,
        })

    # Some legacy or manually recorded card payments predate receipt metadata.
    # Surface the ledger evidence without claiming a brand or last four digits.
    for transaction in getattr(invoice, "transactions", None) or []:
        if transaction.transaction_type not in {"payment", "refund"}:
            continue
        if transaction.id and int(transaction.id) in proof_transaction_ids:
            continue
        reference = str(transaction.reference_number or "").strip()
        if reference and reference in receipt_references:
            continue
        if not _is_card_method(transaction.payment_method):
            continue
        items.append({
            "id": f"ledger-{transaction.id}",
            "evidence_type": "card_refund" if transaction.transaction_type == "refund" else "card_payment",
            "status": "recorded",
            "amount": transaction.amount,
            "currency": "USD",
            "payment_method": transaction.payment_method,
            "reference_number": reference or None,
            "card_brand": getattr(transaction, "card_brand", None),
            "card_last4": str(getattr(transaction, "card_last4", None) or "")[-4:] or None,
            "occurred_at": transaction.created_at,
            "submitted_at": None,
            "submitted_by_name": _name(getattr(transaction, "created_by", None)),
            "reviewed_at": None,
            "reviewed_by_name": None,
            "proof_id": None,
            "proof_filename": None,
            "proof_file_url": None,
            "receipt_delivery_status": None,
        })

    items.sort(key=lambda item: _timestamp(item.get("occurred_at")), reverse=True)
    return {
        "invoice_id": invoice.id,
        "invoice_number": invoice.invoice_number,
        "items": items,
    }
