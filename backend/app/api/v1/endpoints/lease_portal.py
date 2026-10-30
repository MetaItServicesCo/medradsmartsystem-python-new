"""Lease-to-own for the customer: review, sign, save a card, pay, buy out.

Reached only through the link emailed to them. The link is the credential, so
only its hash is stored, it expires, issuing a new one kills the old, and
every route is rate-limited per link and address the way the rental portal's
are.

Paying an invoice and saving a card are separate actions on purpose. A
one-off payment never vaults a card, so the case where Square stores a card
and then declines the payment -- leaving a card on file nobody consented to
keep -- cannot happen here.
"""
from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.core.config import settings
from app.db.base import get_db
from app.models.invoice import Invoice, InvoiceStatus
from app.models.lease import LeaseAgreement
from app.models.payment_operation import PaymentOperation
from app.utils import lease_service as svc
from app.utils.invoice_ledger import add_invoice_transaction, record_payment_delta
from app.utils.lease_math import money
from app.utils.lease_presenter import lease_detail
from app.utils.payment_data_security import payment_data_encryption_configured
from app.utils.payment_idempotency import (
    get_or_create_operation, mark_operation_failed, mark_operation_succeeded,
    payment_fingerprint, replay_or_raise,
)
from app.utils.payment_receipts import queue_payment_receipt
from app.utils.rate_limit import enforce_rate_limit, public_payment_identity, request_ip
from app.utils.square_payments import (
    SquareRequestError, create_square_card_on_file, create_square_payment, minor_units_to_amount,
    square_is_configured, square_public_config,
)

router = APIRouter()


def _agreement(db: Session, token: str, *, lock: bool = False) -> LeaseAgreement:
    try:
        return svc.find_by_token(db, token, lock=lock)
    except svc.LeaseError as exc:
        raise HTTPException(status_code=exc.status_code, detail=str(exc))


def _view(db: Session, agreement: LeaseAgreement) -> dict[str, Any]:
    return lease_detail(agreement, staff=False) | {"square": square_public_config()}


def _limit(request: Request, token: str, bucket: str, limit: int = 5) -> None:
    enforce_rate_limit(bucket=bucket, identity=public_payment_identity(request, token),
                       limit=limit, window_seconds=600)


class SignIn(BaseModel):
    signed_by_name: str = Field(min_length=2, max_length=200)
    revision: int = Field(ge=1)
    agree: bool


class SaveCardIn(BaseModel):
    source_id: str = Field(min_length=1, max_length=512)
    idempotency_key: Optional[str] = Field(None, max_length=120)
    authorize_auto_charge: bool = True


class RemoveCardIn(BaseModel):
    confirm: bool


class PayIn(BaseModel):
    invoice_id: int
    source_id: str = Field(min_length=1, max_length=512)
    idempotency_key: Optional[str] = Field(None, max_length=120)


@router.get("/lease-portal/{token}")
def view_lease(token: str, request: Request, db: Session = Depends(get_db)) -> Any:
    _limit(request, token, "lease-portal-view", limit=60)
    agreement = _agreement(db, token, lock=True)
    svc.reconcile(db, agreement)
    db.commit()
    return _view(db, _agreement(db, token))


@router.post("/lease-portal/{token}/sign")
def sign_lease(token: str, payload: SignIn, request: Request, db: Session = Depends(get_db)) -> Any:
    _limit(request, token, "lease-portal-sign")
    if not payload.agree:
        raise HTTPException(status_code=422, detail="Tick the box to confirm you agree to the terms")
    agreement = _agreement(db, token, lock=True)
    try:
        svc.sign_agreement(db, agreement, signed_by_name=payload.signed_by_name, revision=payload.revision,
                           ip_address=request_ip(request), user_agent=request.headers.get("user-agent"))
    except svc.LeaseError as exc:
        db.rollback()
        raise HTTPException(status_code=exc.status_code, detail=str(exc))
    db.commit()
    return _view(db, _agreement(db, token))


@router.post("/lease-portal/{token}/save-card")
def save_card(token: str, payload: SaveCardIn, request: Request, db: Session = Depends(get_db)) -> Any:
    _limit(request, token, "lease-card-save")
    if not square_is_configured():
        raise HTTPException(status_code=400, detail="Card payments are not available")
    if not payment_data_encryption_configured():
        raise HTTPException(status_code=503, detail="Secure saved-card storage is not configured")
    agreement = _agreement(db, token, lock=True)
    if not agreement.signed_at:
        raise HTTPException(status_code=409, detail="Sign the agreement before saving a card")
    if agreement.status not in ("sent", "active", "in_default"):
        raise HTTPException(status_code=409, detail="This agreement is no longer collecting payments")

    agreement_id = agreement.id
    customer_name, customer_email = agreement.customer_name, agreement.customer_email
    existing_customer = agreement.square_customer_id
    signer = agreement.signed_by_name or agreement.customer_name
    db.commit()
    try:
        card = create_square_card_on_file(
            source_id=payload.source_id,
            idempotency_key=payload.idempotency_key or "lease-card-{}-{}".format(
                agreement_id, int(datetime.utcnow().timestamp())),
            customer_name=customer_name, customer_email=customer_email, customer_id=existing_customer,
        )
    except SquareRequestError as exc:
        raise HTTPException(status_code=exc.status_code, detail=str(exc))

    agreement = _agreement(db, token, lock=True)
    svc.record_card(db, agreement, card, authorize=payload.authorize_auto_charge,
                    accepted_by_name=signer, channel="public_link",
                    ip_address=request_ip(request), user_agent=request.headers.get("user-agent"))
    db.commit()
    return _view(db, _agreement(db, token))


@router.post("/lease-portal/{token}/remove-card")
def remove_card(token: str, payload: RemoveCardIn, request: Request, db: Session = Depends(get_db)) -> Any:
    _limit(request, token, "lease-card-remove")
    if not payload.confirm:
        raise HTTPException(status_code=422, detail="Confirm removing the saved card")
    agreement = _agreement(db, token, lock=True)
    svc.revoke_auto_charge(db, agreement, accepted_by_name=agreement.signed_by_name or agreement.customer_name,
                           channel="public_link", ip_address=request_ip(request),
                           user_agent=request.headers.get("user-agent"))
    # The card is disabled at Square by the billing job, which retries until
    # it succeeds. It can no longer be charged from this moment regardless.
    db.commit()
    return _view(db, _agreement(db, token))


def _owned_invoice(db: Session, agreement: LeaseAgreement, invoice_id: int) -> Invoice:
    """Only an invoice that belongs to this agreement can be paid from its link."""
    linked = {agreement.down_payment_invoice_id, agreement.buyout_invoice_id}
    for installment in agreement.installments:
        linked.update({installment.invoice_id, installment.late_fee_invoice_id})
    linked.discard(None)
    if invoice_id not in linked:
        raise HTTPException(status_code=404, detail="Invoice not found")
    invoice = db.query(Invoice).filter(Invoice.id == invoice_id).with_for_update().first()
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")
    return invoice


@router.post("/lease-portal/{token}/pay")
def pay_invoice(token: str, payload: PayIn, request: Request, db: Session = Depends(get_db)) -> Any:
    """Pay one invoice once, with a card entered now. Never saves the card."""
    _limit(request, token, "lease-payment")
    if not square_is_configured():
        raise HTTPException(status_code=400, detail="Card payments are not available")
    agreement = _agreement(db, token, lock=True)
    if not agreement.signed_at:
        raise HTTPException(status_code=409, detail="Sign the agreement before paying")
    invoice = _owned_invoice(db, agreement, payload.invoice_id)
    if invoice.status == InvoiceStatus.CANCELLED:
        raise HTTPException(status_code=409, detail="This invoice has been cancelled")
    amount = money(invoice.balance_due)
    if invoice.status == InvoiceStatus.PAID or amount <= 0:
        return _view(db, agreement)

    payer = agreement.signed_by_name or agreement.customer_name
    key = payload.idempotency_key or "lease-payment-{}-{}".format(agreement.id, invoice.id)
    operation, replay = get_or_create_operation(
        db,
        idempotency_key=key,
        fingerprint=payment_fingerprint("lease_invoice_payment", invoice_id=invoice.id, amount=amount,
                                        currency=settings.SQUARE_CURRENCY, attributes={}),
        operation_type="lease_invoice_payment",
        invoice_id=invoice.id, amount=amount, currency=settings.SQUARE_CURRENCY, provider="square",
    )
    if replay:
        replay_or_raise(operation)
        return _view(db, _agreement(db, token))
    attempt = int(invoice.payment_attempt_count or 0) + 1
    invoice.payment_attempt_count = attempt
    invoice.last_payment_attempt_at = datetime.utcnow()
    add_invoice_transaction(db, invoice, "payment_attempt", invoice.balance_due, "credit_card",
                            "Customer online payment attempt {} by {}".format(attempt, payer),
                            reference_prefix="ATT")
    invoice_id, operation_id = invoice.id, operation.id
    invoice_number, email = invoice.invoice_number, agreement.customer_email
    db.commit()

    try:
        payment = create_square_payment(source_id=payload.source_id, idempotency_key=key, amount=amount,
                                        invoice_number=invoice_number, customer_email=email)
    except SquareRequestError as exc:
        invoice = db.query(Invoice).filter(Invoice.id == invoice_id).with_for_update().first()
        operation = db.query(PaymentOperation).filter(PaymentOperation.id == operation_id).with_for_update().first()
        mark_operation_failed(operation, str(exc), unknown=exc.indeterminate)
        add_invoice_transaction(
            db, invoice, "payment_verification_pending" if exc.indeterminate else "payment_failed",
            invoice.balance_due, "credit_card",
            "Customer online payment attempt {} by {} {}".format(
                attempt, payer, "needs verification" if exc.indeterminate else "failed: {}".format(exc)),
            reference_prefix="PEND" if exc.indeterminate else "DEC",
        )
        db.commit()
        raise HTTPException(status_code=exc.status_code, detail=str(exc))

    agreement = _agreement(db, token, lock=True)
    invoice = db.query(Invoice).filter(Invoice.id == invoice_id).with_for_update().first()
    operation = db.query(PaymentOperation).filter(PaymentOperation.id == operation_id).with_for_update().first()
    block = payment.get("amount_money") or {}
    if (str(payment.get("status") or "").upper() != "COMPLETED"
            or minor_units_to_amount(block.get("amount")) != amount
            or str(block.get("currency") or "").upper() != (settings.SQUARE_CURRENCY.strip().upper() or "USD")):
        mark_operation_failed(operation, "Square returned an incomplete or mismatched payment", unknown=True)
        add_invoice_transaction(db, invoice, "payment_verification_pending", invoice.balance_due, "credit_card",
                                "Square payment requires reconciliation", reference_prefix="PEND")
        db.commit()
        raise HTTPException(status_code=502, detail="The payment could not be confirmed. We will check it and be in touch.")

    previous = invoice.amount_paid
    invoice.amount_paid = min(money(invoice.total_amount), money(previous) + amount)
    invoice.balance_due = max(money(invoice.total_amount) - money(invoice.amount_paid), Decimal("0"))
    invoice.status = InvoiceStatus.PAID if invoice.balance_due <= 0 else InvoiceStatus.PARTIALLY_PAID
    invoice.payment_method = "credit_card"
    invoice.next_payment_retry_at = None
    txn = record_payment_delta(db, invoice, previous, invoice.amount_paid, None, "credit_card",
                               "Paid online by {} ({})".format(payer, payment.get("id")))
    if txn is not None:
        txn.reference_number = payment.get("id")
    card = (payment.get("card_details") or {}).get("card") or {}
    queue_payment_receipt(db, invoice, payment_reference=str(payment.get("id") or key), amount=amount,
                          payment_method="square_card", recipients=[agreement.customer_email],
                          card_brand=card.get("card_brand"), card_last4=card.get("last_4"))
    mark_operation_succeeded(operation, provider_reference=payment.get("id"),
                             response_data={"invoice_id": invoice.id, "payment_id": payment.get("id")})
    svc.append_history(agreement, "paid_online", by=payer,
                       details={"invoice": invoice.invoice_number, "amount": str(amount)})
    svc.reconcile(db, agreement)
    db.commit()
    return _view(db, _agreement(db, token))


@router.post("/lease-portal/{token}/buyout")
def request_buyout(token: str, request: Request, db: Session = Depends(get_db)) -> Any:
    """Raise the buyout invoice; the customer then pays it like any other."""
    _limit(request, token, "lease-buyout")
    agreement = _agreement(db, token, lock=True)
    svc.reconcile(db, agreement)
    try:
        svc.start_buyout(db, agreement, requested_by=agreement.signed_by_name or agreement.customer_name)
    except svc.LeaseError as exc:
        db.rollback()
        raise HTTPException(status_code=exc.status_code, detail=str(exc))
    db.commit()
    return _view(db, _agreement(db, token))
