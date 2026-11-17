"""Paying a service or inspection invoice through its link by ACH, MBMTS ACH or cheque.

The payer is not signed in. They report the payment - the amount, any part of
the balance, with a proof file, its reference number, or both - and it joins
the same review queue as a payment reported in Billing. Nothing is paid until
an Admin or Super Admin approves it there, exactly as for a signed-in payer.

One payment at a time: while one waits for review, or a card is being
charged, no other can be reported, so the same balance is not paid twice.
"""
from __future__ import annotations

import re
from datetime import datetime
from decimal import Decimal, InvalidOperation
from typing import Any, Callable, Optional

from fastapi import HTTPException, UploadFile
from fastapi.concurrency import run_in_threadpool
from sqlalchemy.orm import Session

from app.models.invoice import Invoice, InvoiceStatus, PaymentProof
from app.models.payment_operation import PaymentOperation
from app.utils.invoice_approval import BILLING_APPROVAL_APPROVED
from app.utils.invoice_ledger import add_invoice_transaction
from app.utils.notifications import notify_admins
from app.utils.payment_proofs import (
    PAYMENT_LINK,
    SERVICE_CARD_IN_PROGRESS,
    SERVICE_PAYMENT_IN_REVIEW,
    delete_payment_proof_file,
    payment_proof_sha256,
    read_and_validate_payment_proof,
    store_encrypted_payment_proof,
)

# What the link offers besides a card.
LINK_METHODS = ("ach", "mbmts_ach", "cheque")
METHOD_LABELS = {"ach": "ACH", "mbmts_ach": "MBMTS ACH", "cheque": "Cheque"}
REFERENCE_MAX = 100
_ADDRESS_PART = r'[^@\s,;:<>()\[\]"\\]+'
EMAIL_PATTERN = re.compile(rf"^{_ADDRESS_PART}@{_ADDRESS_PART}\.{_ADDRESS_PART}$")


def _money(value: Any) -> Decimal:
    try:
        return Decimal(str(value if value not in (None, "") else 0)).quantize(Decimal("0.01"))
    except (InvalidOperation, ValueError) as exc:
        raise HTTPException(status_code=422, detail="Enter the amount paid") from exc


def pending_payment(db: Session, invoice: Invoice) -> Optional[str]:
    """Why no other payment can be reported now, or None."""
    if (
        db.query(PaymentProof.id)
        .filter(PaymentProof.invoice_id == invoice.id, PaymentProof.status == "pending_verification")
        .first()
    ):
        return SERVICE_PAYMENT_IN_REVIEW
    if (
        db.query(PaymentOperation.id)
        .filter(
            PaymentOperation.invoice_id == invoice.id,
            PaymentOperation.operation_type == "square_invoice_payment",
            PaymentOperation.status.in_(["processing", "unknown"]),
        )
        .first()
    ):
        return SERVICE_CARD_IN_PROGRESS
    return None


def link_payment_options(db: Session, invoice: Invoice) -> dict[str, Any]:
    """What the link page shows about paying other than by card. Added to its response."""
    balance = max(_money(invoice.balance_due), Decimal("0"))
    payable = (
        invoice.billing_approval_status == BILLING_APPROVAL_APPROVED
        and invoice.status != InvoiceStatus.CANCELLED
        and balance > 0
    )
    return {
        "other_methods": [{"value": method, "label": METHOD_LABELS[method]} for method in LINK_METHODS],
        "can_report_payment": payable and pending_payment(db, invoice) is None,
    }


def _clean(value: Optional[str], limit: int) -> str:
    return " ".join((value or "").split())[:limit]


async def report_link_payment(
    db: Session,
    *,
    load_invoice: Callable[[], Invoice],
    respond: Callable[[Invoice], dict[str, Any]],
    payment_method: str,
    amount: Any,
    payer_name: Optional[str],
    payer_email: Optional[str],
    reference: Optional[str],
    notes: Optional[str],
    proof_file: Optional[UploadFile],
) -> dict[str, Any]:
    """Record an ACH, MBMTS ACH or cheque payment reported through an invoice link.

    `load_invoice` finds the link's invoice, locked, and refuses an invalid,
    expired or cancelled link. The file is read and checked before the lock.
    """
    method = (payment_method or "").strip().lower().replace(" ", "_")
    method = "cheque" if method == "check" else method
    if method not in LINK_METHODS:
        raise HTTPException(status_code=422, detail="Choose ACH, MBMTS ACH or Cheque")
    amount = _money(amount)
    if amount <= 0:
        raise HTTPException(status_code=400, detail="Payment amount must be greater than zero")
    name = _clean(payer_name, 200)
    if len(name) < 2:
        raise HTTPException(status_code=422, detail="Enter your name")
    email = (payer_email or "").strip()[:320] or None
    if email and not EMAIL_PATTERN.match(email):
        raise HTTPException(status_code=422, detail="Enter a valid email address, or leave it empty")
    reference = _clean(reference, REFERENCE_MAX) or None
    note = (notes or "").strip()[:1000] or None
    has_file = proof_file is not None and bool(proof_file.filename)
    if not has_file and not reference:
        raise HTTPException(
            status_code=422,
            detail=f"Attach the {'cheque' if method == 'cheque' else 'payment'} proof, or enter its reference number",
        )

    data = mime_type = original_name = sha256 = None
    if has_file:
        data, mime_type, original_name = await read_and_validate_payment_proof(proof_file)
        sha256 = payment_proof_sha256(data)

    return await run_in_threadpool(
        _record,
        db,
        load_invoice=load_invoice,
        respond=respond,
        method=method,
        amount=amount,
        name=name,
        email=email,
        reference=reference,
        note=note,
        data=data,
        mime_type=mime_type,
        original_name=original_name,
        sha256=sha256,
    )


def _record(
    db: Session,
    *,
    load_invoice: Callable[[], Invoice],
    respond: Callable[[Invoice], dict[str, Any]],
    method: str,
    amount: Decimal,
    name: str,
    email: Optional[str],
    reference: Optional[str],
    note: Optional[str],
    data: Optional[bytes],
    mime_type: Optional[str],
    original_name: Optional[str],
    sha256: Optional[str],
) -> dict[str, Any]:
    invoice = load_invoice()
    if invoice.billing_approval_status != BILLING_APPROVAL_APPROVED:
        raise HTTPException(status_code=409, detail="This invoice is being updated and cannot be paid right now")
    balance = max(_money(invoice.total_amount) - _money(invoice.amount_paid), Decimal("0"))
    if balance <= 0:
        raise HTTPException(status_code=409, detail="This invoice has no payable balance")
    if amount > balance:
        raise HTTPException(status_code=400, detail=f"The payment cannot be more than the balance, ${balance:.2f}")
    if sha256:
        # The same file and amount sent again (a double click, a retry): already received.
        duplicate = (
            db.query(PaymentProof.id)
            .filter(
                PaymentProof.invoice_id == invoice.id,
                PaymentProof.sha256 == sha256,
                PaymentProof.claimed_amount == amount,
                PaymentProof.status.in_(["pending_verification", "approved"]),
            )
            .first()
        )
        if duplicate:
            return respond(invoice)
    blocked = pending_payment(db, invoice)
    if blocked:
        raise HTTPException(status_code=409, detail=blocked)

    label = METHOD_LABELS[method]
    summary = "; ".join(part for part in [
        f"Sent through the invoice link by {name}" + (f" <{email}>" if email else ""),
        f"Reference {reference}" if reference else None,
        note,
    ] if part)
    stored_name = storage_backend = None
    if data is not None:
        stored_name, storage_backend = store_encrypted_payment_proof(data)
    proof = PaymentProof(
        invoice_id=invoice.id,
        submitted_by_id=None,
        submitted_via=PAYMENT_LINK,
        payer_name=name,
        payer_email=email,
        payer_reference=reference,
        payment_method=method,
        claimed_amount=amount,
        notes=summary,
        original_filename=original_name,
        stored_filename=stored_name,
        storage_backend=storage_backend or "none",
        mime_type=mime_type,
        file_size=len(data) if data is not None else None,
        sha256=sha256,
        status="pending_verification",
        # A document is read in the background; a reference number alone has nothing to read.
        extraction_status="queued" if data is not None else "not_applicable",
        extraction_next_attempt_at=datetime.utcnow() if data is not None else None,
        extracted_data={},
        mismatch_flags=[],
        requires_manual_review=True,
    )
    try:
        db.add(proof)
        db.flush()
        add_invoice_transaction(
            db,
            invoice,
            "payment_proof_submitted",
            0,
            method,
            f"{label} proof #{proof.id} submitted through the invoice link by {name} for ${amount}; pending verification",
            None,
            "PRF",
        )
        notify_admins(
            db,
            title="Payment proof awaiting review",
            message=f"{invoice.invoice_number}: {label} for ${amount} sent through the invoice link by {name}",
            notification_type="billing",
            link_url=f"/billing?search={invoice.invoice_number}",
        )
        db.commit()
    except Exception:
        db.rollback()
        if stored_name:
            delete_payment_proof_file(stored_name, storage_backend)
        raise
    db.refresh(invoice)
    return respond(invoice)
