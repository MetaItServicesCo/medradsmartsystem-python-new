"""Collecting lease-to-own payments: the recurring job and the card charge.

Mirrors the rental billing engine deliberately and step for step, using the
same payment primitives in the same order: an idempotent payment operation
recorded and committed before Square is called, rows re-locked after it
answers, an interrupted response left for webhook verification rather than
charged twice, three attempts two days apart with the customer told each
time, a receipt queued in the same transaction as the payment. The rental
module itself is not touched; live rental customers are charged by code this
feature never edits.

One difference from rentals. An installment invoice is raised a few days
before it falls due, so the customer can see it coming; the first charge
waits for the due date rather than happening when the invoice is raised.
"""
from __future__ import annotations

import logging
from datetime import date, datetime, timedelta
from decimal import Decimal
from typing import Any, Optional

from sqlalchemy import text
from sqlalchemy.orm import Session, selectinload

from app.core.config import settings
from app.models.invoice import Invoice, InvoiceStatus
from app.models.lease import LeaseAgreement, LeaseInstallment
from app.models.payment_operation import PaymentOperation
from app.utils import lease_service as svc
from app.utils.invoice_ledger import add_invoice_transaction, record_payment_delta
from app.utils.lease_math import money
from app.utils.payment_idempotency import (
    get_or_create_operation, mark_operation_failed, mark_operation_succeeded,
    payment_fingerprint, replay_or_raise,
)
from app.utils.payment_receipts import queue_payment_receipt
from app.utils.square_payments import (
    SquareRequestError, create_square_payment, disable_square_card, minor_units_to_amount,
    square_is_configured,
)

logger = logging.getLogger(__name__)

MAX_CHARGE_ATTEMPTS = 3
RETRY_DELAYS_DAYS = (2, 2)

# Distinct from the rental worker's key, so the two jobs never block each
# other, while two copies of this one can never run at once.
LEASE_BILLING_LOCK_KEY = 684_732_019_2027

CHARGEABLE_OPEN = (InvoiceStatus.PENDING, InvoiceStatus.OVERDUE)


def _chargeable_invoices(agreement: LeaseAgreement) -> list[Invoice]:
    """Invoices a saved card may be charged for: the down payment, the
    installments and late fees. Never the buyout, which the customer chooses."""
    invoices = []
    if agreement.down_payment_invoice:
        invoices.append(agreement.down_payment_invoice)
    for installment in agreement.installments:
        if installment.status == "cancelled":
            continue
        if installment.invoice:
            invoices.append(installment.invoice)
        if installment.late_fee_invoice:
            invoices.append(installment.late_fee_invoice)
    return invoices


def _has_exhausted_invoice(agreement: LeaseAgreement) -> bool:
    for invoice in _chargeable_invoices(agreement):
        if (invoice.status in CHARGEABLE_OPEN and money(invoice.balance_due) > 0
                and int(invoice.payment_attempt_count or 0) >= MAX_CHARGE_ATTEMPTS
                and invoice.next_payment_retry_at is None):
            return True
    return False


def _can_auto_charge(agreement: LeaseAgreement) -> bool:
    return bool(
        agreement.auto_charge
        and agreement.auto_charge_authorized_at
        and agreement.square_card_id
        and square_is_configured()
        # Collection stops in default, and pauses while a buyout is open.
        and agreement.status in ("active", "sent")
        and not svc.buyout_open(agreement)
        # Once a card has failed three times on an invoice, stop charging it
        # until the customer acts -- pays, or saves a different card. Charging
        # a failing card again for the next installment or a late fee is
        # pointless, hostile, and the pattern processors flag.
        and not _has_exhausted_invoice(agreement)
    )


def _due_for_charge(invoice: Invoice, today: date, now: datetime) -> bool:
    if invoice.status not in CHARGEABLE_OPEN or money(invoice.balance_due) <= 0:
        return False
    attempts = int(invoice.payment_attempt_count or 0)
    if attempts == 0:
        return invoice.due_date <= today
    retry_at = invoice.next_payment_retry_at
    return retry_at is not None and retry_at <= now and attempts < MAX_CHARGE_ATTEMPTS


def charge_invoice(db: Session, agreement: LeaseAgreement, invoice: Invoice) -> str:
    """Charge the saved card for one invoice.

    Returns 'charged', 'declined' or 'exhausted'. Commits internally around
    the call to Square, exactly as the rental charge does.
    """
    charge_amount = money(invoice.balance_due)
    if charge_amount <= 0:
        return "charged"
    attempt = int(invoice.payment_attempt_count or 0) + 1
    invoice.payment_attempt_count = attempt
    invoice.last_payment_attempt_at = datetime.utcnow()
    add_invoice_transaction(
        db, invoice, "payment_attempt", invoice.balance_due, "credit_card",
        "Automatic payment attempt {} of {}".format(attempt, MAX_CHARGE_ATTEMPTS),
        reference_prefix="ATT",
    )
    operation_key = "lease-invoice-{}-attempt-{}".format(invoice.id, attempt)
    operation, replay = get_or_create_operation(
        db,
        idempotency_key=operation_key,
        fingerprint=payment_fingerprint(
            "lease_auto_charge", invoice_id=invoice.id, amount=charge_amount,
            currency=settings.SQUARE_CURRENCY,
            attributes={"attempt": attempt, "lease_id": agreement.id},
        ),
        operation_type="lease_auto_charge",
        invoice_id=invoice.id,
        amount=charge_amount,
        currency=settings.SQUARE_CURRENCY,
        provider="square",
    )
    if replay:
        replay_or_raise(operation)

    agreement_id, invoice_id, operation_id = agreement.id, invoice.id, operation.id
    card_id, customer_id = agreement.square_card_id, agreement.square_customer_id
    email, invoice_number = agreement.customer_email, invoice.invoice_number
    db.commit()

    try:
        payment = create_square_payment(
            source_id=card_id, idempotency_key=operation_key, amount=charge_amount,
            invoice_number=invoice_number, customer_email=email, customer_id=customer_id,
        )
    except SquareRequestError as exc:
        agreement = db.query(LeaseAgreement).filter(LeaseAgreement.id == agreement_id).with_for_update().first()
        invoice = db.query(Invoice).filter(Invoice.id == invoice_id).with_for_update().first()
        operation = db.query(PaymentOperation).filter(PaymentOperation.id == operation_id).with_for_update().first()
        mark_operation_failed(operation, str(exc), unknown=exc.indeterminate)
        if exc.indeterminate:
            # The charge may have gone through. Never charge again on a guess;
            # the webhook settles it.
            invoice.next_payment_retry_at = None
            add_invoice_transaction(
                db, invoice, "payment_verification_pending", invoice.balance_due, "credit_card",
                "Square response was interrupted; webhook verification is pending and no retry was scheduled",
                reference_prefix="PEND",
            )
            svc.append_history(agreement, "auto_charge_verification_pending",
                               details={"invoice": invoice.invoice_number, "attempt": attempt})
            return "declined"
        agreement.failed_charge_count = int(agreement.failed_charge_count or 0) + 1
        add_invoice_transaction(
            db, invoice, "payment_failed", invoice.balance_due, "credit_card",
            "Automatic payment attempt {} was declined".format(attempt), reference_prefix="DEC",
        )
        if attempt >= MAX_CHARGE_ATTEMPTS:
            invoice.status = InvoiceStatus.OVERDUE
            invoice.next_payment_retry_at = None
            add_invoice_transaction(
                db, invoice, "auto_charge_exhausted", invoice.balance_due, "credit_card",
                "Automatic charging stopped after {} failed attempts".format(attempt),
                reference_prefix="FAIL",
            )
            svc.append_history(agreement, "auto_charge_failed",
                               details={"invoice": invoice.invoice_number, "attempts": attempt})
            _notify_customer(db, agreement, invoice,
                             "Action needed: payment failed for {}".format(agreement.agreement_number),
                             "We tried to charge your card on file for <strong>{}</strong> (${}) {} times "
                             "and it was declined. Please pay it or update your card.".format(
                                 invoice.invoice_number, invoice.balance_due, MAX_CHARGE_ATTEMPTS))
            return "exhausted"
        invoice.next_payment_retry_at = datetime.utcnow() + timedelta(days=RETRY_DELAYS_DAYS[attempt - 1])
        svc.append_history(agreement, "auto_charge_declined",
                           details={"invoice": invoice.invoice_number, "attempt": attempt})
        _notify_customer(db, agreement, invoice,
                         "Payment attempt declined for {}".format(agreement.agreement_number),
                         "Automatic payment attempt {} of {} for <strong>{}</strong> (${}) was declined. "
                         "We will try again on {}. You can also pay it or update your card now.".format(
                             attempt, MAX_CHARGE_ATTEMPTS, invoice.invoice_number, invoice.balance_due,
                             invoice.next_payment_retry_at.strftime("%B %d, %Y")))
        return "declined"

    agreement = db.query(LeaseAgreement).filter(LeaseAgreement.id == agreement_id).with_for_update().first()
    invoice = db.query(Invoice).filter(Invoice.id == invoice_id).with_for_update().first()
    operation = db.query(PaymentOperation).filter(PaymentOperation.id == operation_id).with_for_update().first()

    status = str(payment.get("status") or "").upper()
    money_block = payment.get("amount_money") or {}
    paid_amount = minor_units_to_amount(money_block.get("amount"))
    paid_currency = str(money_block.get("currency") or "").upper()
    expected_currency = settings.SQUARE_CURRENCY.strip().upper() or "USD"
    if status != "COMPLETED" or paid_amount != charge_amount or paid_currency != expected_currency:
        mark_operation_failed(operation, "Square returned an incomplete or mismatched automatic payment", unknown=True)
        invoice.next_payment_retry_at = None
        add_invoice_transaction(
            db, invoice, "payment_verification_pending", invoice.balance_due, "credit_card",
            "Square automatic payment requires reconciliation; no retry was scheduled",
            reference_prefix="PEND",
        )
        return "declined"

    previous_paid = invoice.amount_paid
    invoice.amount_paid = min(money(invoice.total_amount), money(previous_paid) + charge_amount)
    invoice.balance_due = max(money(invoice.total_amount) - money(invoice.amount_paid), Decimal("0"))
    invoice.status = InvoiceStatus.PAID if invoice.balance_due <= 0 else InvoiceStatus.PARTIALLY_PAID
    invoice.payment_method = "credit_card"
    invoice.next_payment_retry_at = None
    payment_txn = record_payment_delta(
        db, invoice, previous_paid, invoice.amount_paid, None, "credit_card",
        "Auto-charged card on file ({})".format(payment.get("id")),
    )
    if payment_txn is not None:
        payment_txn.reference_number = payment.get("id")
    card = (payment.get("card_details") or {}).get("card") or {}
    queue_payment_receipt(
        db, invoice, payment_reference=str(payment.get("id") or operation_key), amount=charge_amount,
        payment_method="square_card", recipients=[agreement.customer_email],
        card_brand=card.get("card_brand") or agreement.square_card_brand,
        card_last4=card.get("last_4") or agreement.square_card_last4,
    )
    mark_operation_succeeded(operation, provider_reference=payment.get("id"),
                             response_data={"invoice_id": invoice.id, "payment_id": payment.get("id")})
    agreement.failed_charge_count = 0
    svc.append_history(agreement, "auto_charged",
                       details={"invoice": invoice.invoice_number, "amount": str(charge_amount)})
    return "charged"


def _notify_customer(db: Session, agreement: LeaseAgreement, invoice: Invoice, subject: str, line: str) -> None:
    token = svc.issue_portal_token(agreement, svc.PORTAL_LINK_DAYS)
    sent = svc._email(
        agreement, subject,
        "<p>Hello {}</p><p>{}</p><p><a href=\"{}\">View your agreement and pay</a></p>".format(
            agreement.customer_name, line, svc.portal_url(token)),
    )
    add_invoice_transaction(
        db, invoice, "customer_notified", 0, None,
        "Customer notified" if sent else "Customer notification could not be delivered",
        reference_prefix="NTF",
    )


def _email_new_invoices(db: Session, agreement: LeaseAgreement, invoices: list[Invoice]) -> int:
    """Customers paying by hand are sent each invoice as it is raised;
    automatic payers are sent a receipt when the charge succeeds instead."""
    if not invoices or _can_auto_charge(agreement):
        return 0
    token = svc.issue_portal_token(agreement, svc.PORTAL_LINK_DAYS)
    lines = "".join(
        "<li>{} — ${}, due {}</li>".format(i.invoice_number, i.total_amount, i.due_date.isoformat())
        for i in invoices
    )
    sent = svc._email(
        agreement, "Lease-to-own {}: payment due".format(agreement.agreement_number),
        "<p>Hello {}</p><p>The following is due on your lease-to-own agreement:</p><ul>{}</ul>"
        "<p><a href=\"{}\">View and pay</a></p>".format(agreement.customer_name, lines, svc.portal_url(token)),
    )
    for invoice in invoices:
        add_invoice_transaction(
            db, invoice, "invoice_emailed" if sent else "invoice_email_failed", 0, None,
            "Invoice delivery to {} {}".format(agreement.customer_email, "succeeded" if sent else "failed"),
            reference_prefix="MAIL",
        )
    return 1 if sent else 0


def _finish_card_cleanup(db: Session, agreement: LeaseAgreement) -> bool:
    """Disable a replaced or withdrawn card at Square. Retried every run
    until it works; until then, it can never be charged, because it is no
    longer the agreement's card."""
    if not agreement.card_cleanup_pending or not agreement.card_cleanup_reference:
        return False
    if not square_is_configured():
        return False
    try:
        disable_square_card(agreement.card_cleanup_reference)
    except SquareRequestError as exc:
        if exc.status_code != 404:
            logger.warning("Lease %s card cleanup will retry: %s", agreement.agreement_number, exc)
            return False
    agreement.card_cleanup_pending = False
    agreement.card_cleanup_reference = None
    svc.append_history(agreement, "saved_card_removed_at_provider")
    return True


def bill_agreement(db: Session, agreement: LeaseAgreement, today: date, results: dict[str, int]) -> None:
    """One agreement's full pass. The caller commits."""
    for event in svc.reconcile(db, agreement, today):
        results[event.split(":")[0]] = results.get(event.split(":")[0], 0) + 1

    raised = svc.generate_due_invoices(db, agreement, today)
    results["invoiced"] += len(raised)
    results["late_fees"] += len(svc.assess_late_fees(db, agreement, today))
    results["emailed"] += _email_new_invoices(db, agreement, raised)
    if _finish_card_cleanup(db, agreement):
        results["cards_cleaned"] += 1

    if _can_auto_charge(agreement):
        now = datetime.utcnow()
        for invoice in _chargeable_invoices(agreement):
            if not _due_for_charge(invoice, today, now):
                continue
            outcome = charge_invoice(db, agreement, invoice)
            results[outcome] += 1
            db.commit()
            # The charge re-locked rows on its own; reload before the next.
            agreement = db.query(LeaseAgreement).filter(LeaseAgreement.id == agreement.id).first()
            if not _can_auto_charge(agreement):
                break

    svc.reconcile(db, agreement, today)


def run_lease_billing(db: Session, today: Optional[date] = None) -> dict[str, int]:
    """Every open agreement, one at a time, each committed on its own.

    A failure on one agreement is rolled back and logged; it never stops the
    rest, and never undoes an agreement already billed.
    """
    today = today or date.today()
    results = {key: 0 for key in (
        "agreements", "invoiced", "late_fees", "emailed", "charged", "declined", "exhausted",
        "cards_cleaned", "errors",
    )}
    ids = [row[0] for row in db.query(LeaseAgreement.id).filter(
        LeaseAgreement.status.in_(("sent", "active", "in_default"))).all()]
    for agreement_id in ids:
        try:
            agreement = (
                db.query(LeaseAgreement)
                .options(selectinload(LeaseAgreement.installments).selectinload(LeaseInstallment.invoice))
                .filter(LeaseAgreement.id == agreement_id)
                .with_for_update(skip_locked=True)
                .first()
            )
            if agreement is None:
                continue
            if agreement.status == "sent" and not agreement.signed_at:
                db.rollback()
                continue
            results["agreements"] += 1
            bill_agreement(db, agreement, today, results)
            db.commit()
        except Exception:
            db.rollback()
            results["errors"] += 1
            logger.exception("Lease billing failed for agreement %s; it will retry next run", agreement_id)
    return results


def run_lease_billing_job(db: Session) -> dict[str, Any]:
    """Run once, with one active runner per database."""
    engine = db.get_bind()
    lock_connection = None
    if engine.dialect.name == "postgresql":
        lock_connection = engine.connect()
        acquired = bool(lock_connection.execute(
            text("SELECT pg_try_advisory_lock(:key)"), {"key": LEASE_BILLING_LOCK_KEY}).scalar())
        if not acquired:
            lock_connection.close()
            return {"already_running": 1}
    try:
        result = run_lease_billing(db)
        result["already_running"] = 0
        return result
    finally:
        if lock_connection is not None:
            try:
                lock_connection.execute(text("SELECT pg_advisory_unlock(:key)"), {"key": LEASE_BILLING_LOCK_KEY})
                lock_connection.commit()
            finally:
                lock_connection.close()
