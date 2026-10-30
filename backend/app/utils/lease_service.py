"""What can happen to a lease-to-own agreement, and the rules for each step.

The API and the billing job both call these, so a rule lives in one place:
how an agreement is priced, sent, signed, invoiced, reconciled against its
payments, bought out, and cancelled. HTTP concerns (status codes, rate
limits, who is asking) stay in the endpoints; money concerns stay in
lease_math; this module is the sequence in between.

Two principles run through it.

An installment's invoice is the truth about whether it was paid. Payment
links, staff-recorded payments, uploaded proofs and Square webhooks all update
invoices already, so `reconcile` reads them rather than every payment route
having to know leases exist.

Nothing irreversible happens silently. Stock leaves inventory with an
inventory transaction; invoices are cancelled with a ledger entry; ownership,
default and overpayment each leave a history entry a person can read.
"""
from __future__ import annotations

import hashlib
import secrets
from dataclasses import dataclass
from datetime import date, datetime, timedelta
from decimal import Decimal
from typing import Any, Optional

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.inventory import InventoryPart, InventoryTransaction
from app.models.invoice import Invoice, InvoiceStatus, InvoiceType
from app.models.lease import LeaseAgreement, LeaseInstallment, LeasePaymentAuthorization
from app.models.sales import SalesInventoryReservation
from app.models.user import User
from app.utils.email import send_html_email
from app.utils.invoice_editing import compose_invoice_edit_notes
from app.utils.invoice_ledger import record_invoice_created, record_status_change
from app.utils.lease_math import (
    BuyoutQuote, InstallmentState, LeaseQuote, LeaseTerms, ZERO, all_paid, build_schedule,
    buyout_quote, money, should_default, validate_terms,
)
from app.utils.notifications import notify_admins
from app.utils.numbering import assign_unique_number

DEFAULT_TAX_RATE = Decimal("8.25")      # the rate Sales and Rentals already charge
AGREEMENT_PREFIX = "LTO-"
INVOICE_PREFIX = "INV-LEASE-"
SIGNING_LINK_DAYS = 30
PORTAL_LINK_DAYS = 90
ACTIVE_RESERVATION = "active"

CONSENT_VERSION = "lease-to-own-2026-10"


class LeaseError(Exception):
    """A rule was broken. `status_code` is what the API should answer with."""

    def __init__(self, message: str, status_code: int = 400):
        super().__init__(message)
        self.status_code = status_code


@dataclass(frozen=True)
class LeaseInput:
    """Everything staff choose when drafting an agreement."""
    customer_name: str
    customer_email: str
    part_id: int
    quantity: int
    markup_percent: Decimal
    down_payment: Decimal
    installment_count: int
    frequency: str
    first_due_date: date
    unit_cash_price: Optional[Decimal] = None   # defaults to the catalogue price
    tax_rate_percent: Decimal = DEFAULT_TAX_RATE
    grace_days: int = 5
    late_fee_amount: Decimal = Decimal("25.00")
    default_after_missed: int = 3
    invoice_lead_days: int = 7
    facility_id: Optional[int] = None
    customer_user_id: Optional[int] = None
    customer_phone: Optional[str] = None
    customer_address: Optional[str] = None
    notes: Optional[str] = None


# ── Small helpers ────────────────────────────────────────────────────────────

def _now() -> datetime:
    return datetime.utcnow()


def _token_hash(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def append_history(agreement: LeaseAgreement, action: str, actor: Optional[User] = None,
                   details: Optional[dict[str, Any]] = None, by: Optional[str] = None) -> None:
    history = list(agreement.history or [])
    history.append({
        "action": action,
        "by": by or (actor.full_name if actor else "System"),
        "user_id": actor.id if actor else None,
        "at": _now().isoformat(),
        "details": details or {},
    })
    agreement.history = history


def _part_available(db: Session, part: InventoryPart) -> int:
    """On hand, less what accepted Sales quotations are already holding."""
    reserved = (
        db.query(func.coalesce(func.sum(SalesInventoryReservation.quantity), 0))
        .filter(SalesInventoryReservation.part_id == part.id,
                SalesInventoryReservation.status == ACTIVE_RESERVATION)
        .scalar()
    )
    return max(int(part.quantity_on_hand or 0) - int(reserved or 0), 0)


def leasable_part(db: Session, part_id: int, *, lock: bool = False) -> InventoryPart:
    """The same products Sales may sell: active parts of type `sales`."""
    query = db.query(InventoryPart).filter(
        InventoryPart.id == part_id,
        InventoryPart.part_type.ilike("sales"),
        InventoryPart.status == "active",
    )
    if lock:
        query = query.with_for_update()
    part = query.first()
    if not part:
        raise LeaseError("That product is not available for sale or lease", 404)
    return part


def terms_of(agreement: LeaseAgreement) -> LeaseTerms:
    return LeaseTerms(
        cash_price=money(agreement.cash_price),
        markup_percent=Decimal(str(agreement.markup_percent)),
        down_payment=money(agreement.down_payment),
        installment_count=int(agreement.installment_count),
        tax_rate_percent=Decimal(str(agreement.tax_rate_percent)),
        frequency=agreement.frequency,
        first_due_date=agreement.first_due_date,
    )


def _snapshot(quote: LeaseQuote) -> dict[str, Any]:
    """The schedule exactly as offered, kept as evidence of what was agreed."""
    return {
        "cash_price": str(quote.cash_price),
        "markup_percent": str(quote.markup_percent),
        "markup_amount": str(quote.markup_amount),
        "lease_price": str(quote.lease_price),
        "down_payment": str(quote.down_payment),
        "down_payment_tax": str(quote.down_payment_tax),
        "down_payment_total": str(quote.down_payment_total),
        "financed_amount": str(quote.financed_amount),
        "tax_rate_percent": str(quote.tax_rate_percent),
        "total_tax": str(quote.total_tax),
        "total_of_payments": str(quote.total_of_payments),
        "regular_installment": str(quote.regular_installment),
        "installments": [
            {
                "number": i.number, "due_date": i.due_date.isoformat(),
                "principal": str(i.principal), "markup": str(i.markup),
                "amount": str(i.amount), "tax": str(i.tax), "total": str(i.total),
            }
            for i in quote.installments
        ],
    }


def _validate_policy(data: LeaseInput) -> list[str]:
    problems = []
    if not (data.customer_name or "").strip():
        problems.append("The customer's name is required.")
    if "@" not in (data.customer_email or ""):
        problems.append("A valid customer email is required; it is where the agreement is sent.")
    if int(data.quantity) < 1:
        problems.append("The quantity must be at least 1.")
    if int(data.grace_days) < 0 or int(data.grace_days) > 60:
        problems.append("The grace period must be between 0 and 60 days.")
    if money(data.late_fee_amount) < ZERO:
        problems.append("The late fee cannot be negative.")
    if int(data.default_after_missed) < 1 or int(data.default_after_missed) > 24:
        problems.append("Default must be after between 1 and 24 missed installments.")
    if int(data.invoice_lead_days) < 0 or int(data.invoice_lead_days) > 30:
        problems.append("Invoices must be raised between 0 and 30 days before they fall due.")
    return problems


# ── Drafting ─────────────────────────────────────────────────────────────────

def _apply_terms(db: Session, agreement: LeaseAgreement, data: LeaseInput, part: InventoryPart) -> LeaseQuote:
    unit_price = money(data.unit_cash_price) if data.unit_cash_price is not None else money(part.unit_price)
    quantity = int(data.quantity)
    terms = LeaseTerms(
        cash_price=unit_price * quantity,
        markup_percent=Decimal(str(data.markup_percent)),
        down_payment=money(data.down_payment),
        installment_count=int(data.installment_count),
        tax_rate_percent=Decimal(str(data.tax_rate_percent)),
        frequency=data.frequency,
        first_due_date=data.first_due_date,
    )
    problems = _validate_policy(data) + validate_terms(terms)
    if problems:
        raise LeaseError(" ".join(problems), 422)
    quote = build_schedule(terms)

    agreement.facility_id = data.facility_id
    agreement.customer_user_id = data.customer_user_id
    agreement.customer_name = data.customer_name.strip()
    agreement.customer_email = data.customer_email.strip()
    agreement.customer_phone = (data.customer_phone or "").strip() or None
    agreement.customer_address = (data.customer_address or "").strip() or None
    agreement.part_id = part.id
    agreement.quantity = quantity
    agreement.item_part_number = part.part_number
    agreement.item_description = part.description
    agreement.unit_cash_price = unit_price
    agreement.cash_price = quote.cash_price
    agreement.markup_percent = quote.markup_percent
    agreement.markup_amount = quote.markup_amount
    agreement.lease_price = quote.lease_price
    agreement.down_payment = quote.down_payment
    agreement.down_payment_tax = quote.down_payment_tax
    agreement.tax_rate_percent = quote.tax_rate_percent
    agreement.installment_count = quote.installment_count
    agreement.frequency = quote.frequency
    agreement.first_due_date = data.first_due_date
    agreement.regular_installment = quote.regular_installment
    agreement.total_tax = quote.total_tax
    agreement.total_of_payments = quote.total_of_payments
    agreement.terms_snapshot = _snapshot(quote)
    agreement.grace_days = int(data.grace_days)
    agreement.late_fee_amount = money(data.late_fee_amount)
    agreement.default_after_missed = int(data.default_after_missed)
    agreement.invoice_lead_days = int(data.invoice_lead_days)
    agreement.notes = (data.notes or "").strip() or None

    # The schedule is rebuilt wholesale; a draft has no invoices to protect.
    # The old rows are deleted and flushed first: assigning a new list lets
    # the unit of work insert before it deletes, which collides on the
    # (agreement, number) unique key the moment a draft is re-priced.
    if agreement.id is not None and agreement.installments:
        for previous in list(agreement.installments):
            db.delete(previous)
        agreement.installments = []
        db.flush()
    agreement.installments = [
        LeaseInstallment(
            number=i.number, due_date=i.due_date, principal=i.principal, markup=i.markup,
            amount=i.amount, tax=i.tax, total=i.total, status="scheduled",
        )
        for i in quote.installments
    ]
    return quote


def create_agreement(db: Session, data: LeaseInput, actor: User) -> LeaseAgreement:
    part = leasable_part(db, data.part_id)
    if int(data.quantity) > _part_available(db, part):
        raise LeaseError(
            "Only {} unit(s) of {} are available right now.".format(_part_available(db, part), part.part_number),
            409,
        )
    agreement = LeaseAgreement(status="draft", revision=1, created_by_id=actor.id, history=[])
    _apply_terms(db, agreement, data, part)
    append_history(agreement, "created", actor, {"total_of_payments": str(agreement.total_of_payments)})
    assign_unique_number(db, agreement, "agreement_number", prefix=AGREEMENT_PREFIX)
    return agreement


def update_draft(db: Session, agreement: LeaseAgreement, data: LeaseInput, actor: User) -> LeaseAgreement:
    if agreement.status != "draft":
        raise LeaseError("Only a draft can be edited. Cancel and redraft to change sent terms.", 409)
    part = leasable_part(db, data.part_id)
    _apply_terms(db, agreement, data, part)
    agreement.revision = int(agreement.revision or 1) + 1
    append_history(agreement, "edited", actor, {"revision": agreement.revision})
    db.flush()
    return agreement


# ── Sending and signing ──────────────────────────────────────────────────────

def issue_portal_token(agreement: LeaseAgreement, days: int) -> str:
    """A fresh customer link. Only its hash is stored; issuing one replaces
    the last, the same trade rentals make, so a forwarded old email goes dead."""
    token = secrets.token_urlsafe(32)
    agreement.access_token_hash = _token_hash(token)
    agreement.token_expires_at = _now() + timedelta(days=days)
    return token


def portal_url(token: str) -> str:
    return "{}/lease/{}".format(settings.PUBLIC_APP_URL.rstrip("/"), token)


def send_agreement(db: Session, agreement: LeaseAgreement, actor: User) -> str:
    if agreement.status not in ("draft", "sent"):
        raise LeaseError("This agreement can no longer be sent.", 409)
    if agreement.signed_at:
        raise LeaseError("This agreement has already been signed.", 409)
    part = leasable_part(db, agreement.part_id)
    available = _part_available(db, part)
    if int(agreement.quantity) > available:
        raise LeaseError("Only {} unit(s) are available; update the agreement before sending.".format(available), 409)

    token = issue_portal_token(agreement, SIGNING_LINK_DAYS)
    agreement.status = "sent"
    agreement.sent_at = _now()
    append_history(agreement, "sent", actor, {"to": agreement.customer_email, "revision": agreement.revision})
    _email(
        agreement,
        "Your lease-to-own agreement {}".format(agreement.agreement_number),
        "<p>Hello {name},</p>"
        "<p>Your lease-to-own agreement for <strong>{item}</strong> is ready for you to review and sign.</p>"
        "<p>Total of payments: <strong>${total}</strong>, as {count} {freq} installments of "
        "<strong>${each}</strong>{down}.</p>"
        "<p><a href=\"{url}\">Review and sign the agreement</a></p>"
        "<p>This link expires in {days} days.</p>".format(
            name=agreement.customer_name, item=agreement.item_description,
            total=agreement.total_of_payments, count=agreement.installment_count,
            freq=agreement.frequency, each=agreement.regular_installment,
            down=(" after a down payment of ${}".format(money(agreement.down_payment) + money(agreement.down_payment_tax))
                  if money(agreement.down_payment) > 0 else ""),
            url=portal_url(token), days=SIGNING_LINK_DAYS,
        ),
    )
    return token


def find_by_token(db: Session, token: str, *, lock: bool = False) -> LeaseAgreement:
    if not token or len(token) > 200:
        raise LeaseError("This link is not valid.", 404)
    query = db.query(LeaseAgreement).filter(LeaseAgreement.access_token_hash == _token_hash(token))
    if lock:
        query = query.with_for_update()
    agreement = query.first()
    if not agreement:
        raise LeaseError("This link is not valid or has been replaced by a newer one.", 404)
    if agreement.token_expires_at and agreement.token_expires_at < _now():
        raise LeaseError("This link has expired. Ask us to send a new one.", 410)
    if agreement.status == "cancelled":
        raise LeaseError("This agreement has been cancelled.", 410)
    return agreement


def consent_text(agreement: LeaseAgreement) -> str:
    """The exact disclosure a signature is given against. Stored verbatim."""
    down = money(agreement.down_payment)
    return (
        "I agree to lease-to-own {qty} x {item} under agreement {number}, revision {rev}. "
        "Cash price ${cash}; lease price ${lease} (markup {markup}%). "
        "{down_clause}"
        "{count} {freq} installments of ${each} beginning {first}, sales tax included at {tax}%. "
        "Total of payments ${total}. "
        "A late fee of ${fee} applies to any installment unpaid {grace} days after it is due; "
        "after {default_after} missed installments the agreement is in default. "
        "I may buy out early at the unpaid cash price plus tax. "
        "Ownership passes to me when every payment is made."
    ).format(
        qty=agreement.quantity, item=agreement.item_description, number=agreement.agreement_number,
        rev=agreement.revision, cash=agreement.cash_price, lease=agreement.lease_price,
        markup=agreement.markup_percent,
        down_clause=("Down payment ${} plus tax. ".format(down) if down > 0 else "No down payment. "),
        count=agreement.installment_count, freq=agreement.frequency, each=agreement.regular_installment,
        first=agreement.first_due_date.isoformat(), tax=agreement.tax_rate_percent,
        total=agreement.total_of_payments, fee=agreement.late_fee_amount, grace=agreement.grace_days,
        default_after=agreement.default_after_missed,
    )


def sign_agreement(db: Session, agreement: LeaseAgreement, *, signed_by_name: str, revision: int,
                   ip_address: Optional[str], user_agent: Optional[str]) -> LeaseAgreement:
    """The customer accepts. Stock leaves inventory here, at the point of commitment.

    `revision` is the one the customer was shown; if staff changed the terms
    since, the signature is refused rather than applied to terms they never saw.
    """
    if agreement.status != "sent" or agreement.signed_at:
        raise LeaseError("This agreement is not awaiting a signature.", 409)
    name = (signed_by_name or "").strip()
    if len(name) < 2:
        raise LeaseError("Type your full name to sign.", 422)
    if int(revision) != int(agreement.revision):
        raise LeaseError("These terms have changed since you opened them. Reload to see the current terms.", 409)

    part = leasable_part(db, agreement.part_id, lock=True)
    available = _part_available(db, part)
    if int(agreement.quantity) > available:
        raise LeaseError("Sorry, this item is no longer in stock. We will be in touch.", 409)

    now = _now()
    part.quantity_on_hand = int(part.quantity_on_hand or 0) - int(agreement.quantity)
    part.updated_at = now
    db.add(InventoryTransaction(
        part_id=part.id, facility_id=agreement.facility_id, transaction_type="lease_to_own",
        quantity=int(agreement.quantity), unit_cost=part.unit_price,
        balance_after=part.quantity_on_hand, authorization_reference=agreement.agreement_number,
        authorization_details="Lease-to-own agreement {}".format(agreement.agreement_number),
        notes="Committed to lease-to-own {} on signature".format(agreement.agreement_number),
    ))
    if part.quantity_on_hand <= int(part.reorder_level or 0):
        notify_admins(db, title="Low stock alert",
                      message="{} is at or below its reorder level after lease-to-own {}.".format(
                          part.part_number, agreement.agreement_number),
                      notification_type="inventory", link_url="/inventory")
    agreement.stock_committed = True
    agreement.stock_committed_at = now

    agreement.signed_at = now
    agreement.signed_by_name = name
    agreement.signed_terms_revision = int(agreement.revision)
    agreement.signature_ip = (ip_address or "")[:120] or None
    agreement.signature_user_agent = user_agent
    db.add(LeasePaymentAuthorization(
        agreement_id=agreement.id, event_type="signed", consent_version=CONSENT_VERSION,
        consent_text=consent_text(agreement), accepted_by_name=name, channel="public_link",
        ip_address=agreement.signature_ip, user_agent=user_agent,
    ))
    append_history(agreement, "signed", by=name, details={"revision": agreement.revision})

    if money(agreement.down_payment) > 0:
        invoice = _new_invoice(
            db, agreement,
            subtotal=money(agreement.down_payment), tax=money(agreement.down_payment_tax),
            issue=date.today(), due=date.today(),
            description="Lease-to-own {} — down payment".format(agreement.agreement_number),
            item_number="DOWN-PAYMENT", item_label="Down payment",
        )
        agreement.down_payment_invoice = invoice
    else:
        _activate(agreement)
    # Keep the customer's link alive for the life of the agreement: it is
    # where they pay, see their schedule and buy out.
    agreement.token_expires_at = now + timedelta(days=PORTAL_LINK_DAYS)
    db.flush()
    return agreement


def _activate(agreement: LeaseAgreement) -> None:
    agreement.status = "active"
    agreement.activated_at = _now()
    append_history(agreement, "activated")


# ── Saved cards ──────────────────────────────────────────────────────────────

AUTO_CHARGE_CONSENT = (
    "I authorize {company} to charge the card ending {last4} for each installment of lease-to-own "
    "agreement {number} on or after its due date, and for any late fee under the agreement, until the "
    "agreement is paid in full or I withdraw this authorization."
)


def record_card(db: Session, agreement: LeaseAgreement, card: dict[str, Any], *, authorize: bool,
                accepted_by_name: str, channel: str, ip_address: Optional[str],
                user_agent: Optional[str]) -> Optional[str]:
    """Store a vaulted card. Returns the replaced provider card id, if any,
    so the caller can disable it at Square once this commit has landed."""
    previous = agreement.square_card_id
    agreement.square_customer_id = card.get("customer_id") or agreement.square_customer_id
    agreement.square_card_id = card.get("card_id")
    agreement.square_card_brand = card.get("card_brand")
    agreement.square_card_last4 = (card.get("last_4") or "")[-4:] or None
    agreement.square_card_exp_month = card.get("exp_month")
    agreement.square_card_exp_year = card.get("exp_year")
    agreement.auto_charge = bool(authorize)
    agreement.auto_charge_authorized_at = _now() if authorize else None
    agreement.failed_charge_count = 0
    db.add(LeasePaymentAuthorization(
        agreement_id=agreement.id,
        event_type="authorized" if authorize else "card_saved",
        consent_version=CONSENT_VERSION,
        consent_text=(AUTO_CHARGE_CONSENT.format(
            company="Mr. BioMed Tech Services", last4=agreement.square_card_last4 or "unknown",
            number=agreement.agreement_number)
            if authorize else "Card saved without authorizing automatic charges."),
        accepted_by_name=accepted_by_name, channel=channel,
        ip_address=(ip_address or "")[:120] or None, user_agent=user_agent,
        card_brand=agreement.square_card_brand, card_last4=agreement.square_card_last4,
        card_exp_month=agreement.square_card_exp_month, card_exp_year=agreement.square_card_exp_year,
    ))
    append_history(agreement, "card_saved", by=accepted_by_name,
                   details={"last_4": agreement.square_card_last4, "auto_charge": bool(authorize)})
    if previous and previous != agreement.square_card_id:
        agreement.card_cleanup_pending = True
        agreement.card_cleanup_reference = previous
        return previous
    return None


def revoke_auto_charge(db: Session, agreement: LeaseAgreement, *, accepted_by_name: str, channel: str,
                       ip_address: Optional[str], user_agent: Optional[str]) -> Optional[str]:
    """Stop automatic charges at once, locally, before any call to Square,
    so the billing job cannot charge again even if Square is unreachable."""
    card_id = agreement.square_card_id
    agreement.auto_charge = False
    agreement.auto_charge_authorized_at = None
    db.add(LeasePaymentAuthorization(
        agreement_id=agreement.id, event_type="revoked", consent_version=CONSENT_VERSION,
        consent_text="Automatic charges withdrawn and the saved card removed.",
        accepted_by_name=accepted_by_name, channel=channel,
        ip_address=(ip_address or "")[:120] or None, user_agent=user_agent,
        card_brand=agreement.square_card_brand, card_last4=agreement.square_card_last4,
    ))
    append_history(agreement, "auto_charge_revoked", by=accepted_by_name)
    if card_id:
        agreement.card_cleanup_pending = True
        agreement.card_cleanup_reference = card_id
    agreement.square_card_id = None
    agreement.square_card_brand = None
    agreement.square_card_last4 = None
    agreement.square_card_exp_month = None
    agreement.square_card_exp_year = None
    return card_id


# ── Invoices ─────────────────────────────────────────────────────────────────

def _new_invoice(db: Session, agreement: LeaseAgreement, *, subtotal: Decimal, tax: Decimal,
                 issue: date, due: date, description: str, item_number: str,
                 item_label: str, actor: Optional[User] = None) -> Invoice:
    total = money(subtotal) + money(tax)
    line = {
        "item_number": item_number,
        "description": "{} — {}".format(item_label, agreement.item_description),
        "quantity": 1,
        "unit_price": float(money(subtotal)),
        "shipping_fee": 0,
        "setup_fee": 0,
        "condition": None,
        "total_amount": float(money(subtotal)),
    }
    invoice = Invoice(
        invoice_type=InvoiceType.SALES,
        customer_name=agreement.customer_name,
        customer_email=agreement.customer_email,
        customer_phone=agreement.customer_phone,
        customer_address=agreement.customer_address,
        facility_id=agreement.facility_id,
        subtotal=money(subtotal),
        tax_amount=money(tax),
        discount_amount=ZERO,
        total_amount=total,
        amount_paid=ZERO,
        balance_due=total,
        status=InvoiceStatus.OVERDUE if due < date.today() else InvoiceStatus.PENDING,
        issue_date=issue,
        due_date=due,
        payment_terms="Due on receipt" if due <= issue else "Due {}".format(due.isoformat()),
        payment_method="credit_card" if agreement.auto_charge else None,
        notes=compose_invoice_edit_notes(
            None, description,
            {"line_items": [line],
             "labels": {"tax": "Tax ({}%)".format(agreement.tax_rate_percent)} if money(tax) > 0 else {}},
        ),
    )
    assign_unique_number(db, invoice, "invoice_number", prefix=INVOICE_PREFIX)
    record_invoice_created(db, invoice, actor, description)
    return invoice


def generate_due_invoices(db: Session, agreement: LeaseAgreement, today: date) -> list[Invoice]:
    """Raise the invoice for every installment whose lead time has arrived.

    Idempotent: an installment that already has an invoice is skipped, and
    the unique constraint on invoice_id backs that up under concurrency.
    """
    if agreement.status not in ("active", "in_default") or buyout_open(agreement):
        return []
    created = []
    lead = timedelta(days=max(0, int(agreement.invoice_lead_days or 0)))
    for installment in agreement.installments:
        if installment.status != "scheduled" or installment.invoice_id:
            continue
        if installment.due_date - lead > today:
            continue
        invoice = _new_invoice(
            db, agreement,
            subtotal=money(installment.amount), tax=money(installment.tax),
            issue=today, due=installment.due_date,
            description="Lease-to-own {} — installment {} of {}".format(
                agreement.agreement_number, installment.number, agreement.installment_count),
            item_number="INSTALLMENT-{}".format(installment.number),
            item_label="Installment {} of {}".format(installment.number, agreement.installment_count),
        )
        # The relationship, not just the id: anything reading installment.invoice
        # in this same session -- the charge that follows, reconcile -- must see
        # it now, not after the row happens to be reloaded.
        installment.invoice = invoice
        installment.status = "invoiced"
        created.append(invoice)
    if created:
        append_history(agreement, "installments_invoiced",
                       details={"invoices": [i.invoice_number for i in created]})
    return created


def assess_late_fees(db: Session, agreement: LeaseAgreement, today: date) -> list[Invoice]:
    """One late fee per missed installment, never two. Late fees are not taxed."""
    fee = money(agreement.late_fee_amount)
    if fee <= 0 or agreement.status not in ("active", "in_default") or buyout_open(agreement):
        return []
    created = []
    grace = timedelta(days=max(0, int(agreement.grace_days or 0)))
    for installment in agreement.installments:
        if installment.late_fee_invoice_id or installment.status != "invoiced":
            continue
        invoice = installment.invoice
        if not invoice or money(invoice.balance_due) <= 0:
            continue
        if today <= installment.due_date + grace:
            continue
        late_invoice = _new_invoice(
            db, agreement, subtotal=fee, tax=ZERO, issue=today, due=today,
            description="Lease-to-own {} — late fee, installment {} unpaid {} days after it was due".format(
                agreement.agreement_number, installment.number, agreement.grace_days),
            item_number="LATE-FEE-{}".format(installment.number),
            item_label="Late fee for installment {}".format(installment.number),
        )
        installment.late_fee_invoice = late_invoice
        created.append(late_invoice)
    if created:
        append_history(agreement, "late_fees_assessed",
                       details={"invoices": [i.invoice_number for i in created]})
    return created


# ── Reconciliation ───────────────────────────────────────────────────────────

def buyout_open(agreement: LeaseAgreement) -> bool:
    """A buyout invoice exists and has not been withdrawn.

    Read through the relationship, never the bare id, so a buyout started
    earlier in this same session counts before anything is flushed.
    """
    invoice = agreement.buyout_invoice
    return invoice is not None and invoice.status != InvoiceStatus.CANCELLED


def _invoice_paid(invoice: Optional[Invoice]) -> bool:
    return bool(invoice) and (invoice.status == InvoiceStatus.PAID or money(invoice.balance_due) <= 0) \
        and invoice.status != InvoiceStatus.CANCELLED


def installment_states(agreement: LeaseAgreement) -> list[InstallmentState]:
    states = []
    for installment in agreement.installments:
        invoice = installment.invoice
        states.append(InstallmentState(
            number=installment.number,
            due_date=installment.due_date,
            principal=money(installment.principal),
            markup=money(installment.markup),
            total=money(installment.total),
            amount_paid=money(invoice.amount_paid) if invoice else ZERO,
            invoiced=invoice is not None,
            cancelled=installment.status == "cancelled",
        ))
    return states


def outstanding_late_fees(agreement: LeaseAgreement) -> Decimal:
    total = ZERO
    for installment in agreement.installments:
        fee_invoice = installment.late_fee_invoice
        if fee_invoice and fee_invoice.status != InvoiceStatus.CANCELLED:
            total += max(money(fee_invoice.balance_due), ZERO)
    return total


def quote_buyout(agreement: LeaseAgreement) -> BuyoutQuote:
    return buyout_quote(installment_states(agreement), Decimal(str(agreement.tax_rate_percent)),
                        outstanding_late_fees(agreement))


def _cancel_invoice(db: Session, invoice: Invoice, reason: str, actor: Optional[User] = None) -> bool:
    if invoice.status in (InvoiceStatus.PAID, InvoiceStatus.CANCELLED) or money(invoice.amount_paid) > 0:
        return False
    previous = invoice.status
    invoice.status = InvoiceStatus.CANCELLED
    invoice.next_payment_retry_at = None
    record_status_change(db, invoice, previous, actor, reason)
    return True


def reconcile(db: Session, agreement: LeaseAgreement, today: Optional[date] = None) -> list[str]:
    """Bring the agreement's state into line with its invoices.

    Safe to call as often as anyone likes -- on every read, after every
    payment, from the job. Returns what changed, for logging.
    """
    today = today or date.today()
    events: list[str] = []
    if agreement.status in ("draft", "cancelled"):
        return events

    now = _now()
    for installment in agreement.installments:
        if installment.status == "cancelled":
            continue
        invoice = installment.invoice
        if invoice is None:
            continue
        if invoice.status == InvoiceStatus.CANCELLED:
            # Cancelled in Billing, outside this flow: staff chose not to
            # collect it. Treated as waived, and said so, rather than raising
            # a second invoice for the same installment behind their back.
            installment.status = "cancelled"
            append_history(agreement, "installment_waived",
                           details={"installment": installment.number, "invoice": invoice.invoice_number})
            events.append("waived:{}".format(installment.number))
        elif _invoice_paid(invoice):
            if installment.status != "paid":
                installment.status = "paid"
                installment.paid_at = installment.paid_at or now
                events.append("paid:{}".format(installment.number))
        elif installment.status != "invoiced":
            installment.status = "invoiced"

    # Awaiting the down payment: active once it clears.
    if agreement.status == "sent" and agreement.signed_at:
        if money(agreement.down_payment) <= 0 or _invoice_paid(agreement.down_payment_invoice):
            _activate(agreement)
            events.append("activated")

    # A buyout that has been paid completes the agreement outright.
    if buyout_open(agreement) and _invoice_paid(agreement.buyout_invoice) \
            and agreement.status in ("active", "in_default"):
        overpaid = ZERO
        started = agreement.buyout_requested_at or now
        for installment in agreement.installments:
            if installment.status == "paid" and installment.paid_at and installment.paid_at >= started:
                # Settled while a buyout covering it was outstanding: the
                # customer has paid for this slice twice.
                overpaid += money(installment.invoice.amount_paid) if installment.invoice else ZERO
            elif installment.status in ("scheduled", "invoiced"):
                if installment.invoice:
                    _cancel_invoice(db, installment.invoice,
                                    "Superseded by early buyout of {}".format(agreement.agreement_number))
                installment.status = "cancelled"
        agreement.overpayment_amount = overpaid
        _complete(db, agreement, "buyout")
        events.append("completed:buyout")
        if overpaid > 0:
            notify_admins(db, title="Lease buyout overpayment",
                          message="{} was overpaid by ${} during its buyout; a refund is due.".format(
                              agreement.agreement_number, overpaid),
                          notification_type="billing", link_url="/sales")
        return events

    states = installment_states(agreement)
    if agreement.status in ("active", "in_default") and all_paid(states):
        _complete(db, agreement, "schedule")
        events.append("completed:schedule")
        return events

    defaulting = should_default(states, today, int(agreement.grace_days or 0),
                                int(agreement.default_after_missed or 0))
    if agreement.status == "active" and defaulting:
        agreement.status = "in_default"
        agreement.defaulted_at = now
        append_history(agreement, "defaulted",
                       details={"missed": agreement.default_after_missed})
        notify_admins(db, title="Lease-to-own in default",
                      message="{} ({}) has missed {} installments. Automatic charging has stopped.".format(
                          agreement.agreement_number, agreement.customer_name,
                          agreement.default_after_missed),
                      notification_type="billing", link_url="/sales")
        events.append("defaulted")
    elif agreement.status == "in_default" and not defaulting:
        agreement.status = "active"
        append_history(agreement, "default_cured")
        events.append("cured")
    return events


def _complete(db: Session, agreement: LeaseAgreement, method: str) -> None:
    agreement.status = "completed"
    agreement.completed_at = _now()
    agreement.completion_method = method
    agreement.auto_charge = False
    append_history(agreement, "completed", details={"method": method})
    _email(
        agreement,
        "You now own your {}".format(agreement.item_description),
        "<p>Hello {name},</p>"
        "<p>Lease-to-own agreement <strong>{number}</strong> is paid in full. "
        "Ownership of <strong>{qty} x {item}</strong> has passed to you.</p>"
        "<p>Thank you for your business.</p>".format(
            name=agreement.customer_name, number=agreement.agreement_number,
            qty=agreement.quantity, item=agreement.item_description),
    )


# ── Buyout ───────────────────────────────────────────────────────────────────

def start_buyout(db: Session, agreement: LeaseAgreement, actor: Optional[User] = None,
                 requested_by: Optional[str] = None) -> Invoice:
    """Raise one invoice for the buyout. Scheduled collection pauses until it
    is paid or withdrawn, so the customer is not charged both ways."""
    if agreement.status not in ("active", "in_default"):
        raise LeaseError("Only an agreement in force can be bought out.", 409)
    if buyout_open(agreement):
        return agreement.buyout_invoice
    quote = quote_buyout(agreement)
    if quote.total <= 0:
        raise LeaseError("Nothing is left to pay on this agreement.", 409)
    invoice = _new_invoice(
        db, agreement,
        subtotal=quote.remaining_principal + quote.outstanding_fees, tax=quote.tax,
        issue=date.today(), due=date.today(),
        description="Lease-to-own {} — early buyout. Remaining cash price ${}, unearned markup of ${} waived{}.".format(
            agreement.agreement_number, quote.remaining_principal, quote.waived_markup,
            ", late fees ${} included".format(quote.outstanding_fees) if quote.outstanding_fees > 0 else ""),
        item_number="BUYOUT", item_label="Early buyout", actor=actor,
    )
    # Late fees are settled by the buyout, so their own invoices are withdrawn.
    for installment in agreement.installments:
        if installment.late_fee_invoice:
            _cancel_invoice(db, installment.late_fee_invoice, "Included in buyout invoice {}".format(
                invoice.invoice_number), actor)
    agreement.buyout_invoice = invoice
    agreement.buyout_quoted_total = quote.total
    agreement.buyout_requested_at = _now()
    append_history(agreement, "buyout_started", actor, by=requested_by, details={
        "invoice": invoice.invoice_number, "total": str(quote.total),
        "waived_markup": str(quote.waived_markup),
        "installments": list(quote.installments_covered),
    })
    db.flush()
    return invoice


def cancel_buyout(db: Session, agreement: LeaseAgreement, actor: User) -> None:
    invoice = agreement.buyout_invoice
    if not invoice:
        raise LeaseError("There is no buyout in progress.", 409)
    if _invoice_paid(invoice):
        raise LeaseError("The buyout has already been paid.", 409)
    if money(invoice.amount_paid) > 0:
        raise LeaseError("Part of the buyout has been paid; refund it before withdrawing.", 409)
    _cancel_invoice(db, invoice, "Buyout withdrawn", actor)
    agreement.buyout_invoice = None
    agreement.buyout_quoted_total = None
    agreement.buyout_requested_at = None
    append_history(agreement, "buyout_withdrawn", actor, details={"invoice": invoice.invoice_number})


# ── Cancellation ─────────────────────────────────────────────────────────────

def cancel_agreement(db: Session, agreement: LeaseAgreement, *, reason: str, return_stock: bool,
                     actor: User) -> LeaseAgreement:
    if agreement.status in ("completed", "cancelled"):
        raise LeaseError("This agreement is already {}.".format(agreement.status), 409)
    reason = (reason or "").strip()
    if len(reason) < 3:
        raise LeaseError("Give a reason for cancelling.", 422)

    cancelled = []
    linked = [agreement.down_payment_invoice, agreement.buyout_invoice]
    for installment in agreement.installments:
        linked.extend([installment.invoice, installment.late_fee_invoice])
        if installment.status in ("scheduled", "invoiced"):
            installment.status = "cancelled"
    for invoice in linked:
        if invoice and _cancel_invoice(db, invoice, "Lease-to-own {} cancelled: {}".format(
                agreement.agreement_number, reason), actor):
            cancelled.append(invoice.invoice_number)

    if return_stock and agreement.stock_committed and not agreement.stock_returned and agreement.part_id:
        part = db.query(InventoryPart).filter(InventoryPart.id == agreement.part_id).with_for_update().first()
        if part:
            part.quantity_on_hand = int(part.quantity_on_hand or 0) + int(agreement.quantity)
            part.updated_at = _now()
            db.add(InventoryTransaction(
                part_id=part.id, facility_id=agreement.facility_id,
                transaction_type="lease_to_own_return", quantity=int(agreement.quantity),
                unit_cost=part.unit_price, balance_after=part.quantity_on_hand,
                authorization_reference=agreement.agreement_number,
                authorization_details="Lease-to-own {} cancelled".format(agreement.agreement_number),
                notes="Returned to stock on cancellation: {}".format(reason),
                created_by_id=actor.id,
            ))
            agreement.stock_returned = True

    agreement.status = "cancelled"
    agreement.cancelled_at = _now()
    agreement.cancellation_reason = reason
    agreement.auto_charge = False
    agreement.access_token_hash = None
    if agreement.square_card_id:
        agreement.card_cleanup_pending = True
        agreement.card_cleanup_reference = agreement.square_card_id
        agreement.square_card_id = None
    append_history(agreement, "cancelled", actor, {
        "reason": reason, "invoices_cancelled": cancelled, "stock_returned": agreement.stock_returned,
    })
    db.flush()
    return agreement


# ── Customer email ───────────────────────────────────────────────────────────

def _email(agreement: LeaseAgreement, subject: str, html: str) -> bool:
    """Best effort. A failed email never rolls back a payment or a signature."""
    if not agreement.customer_email:
        return False
    try:
        text = " ".join(html.replace("<", " <").split())
        return bool(send_html_email([agreement.customer_email], subject, html, text))
    except Exception:
        return False


def stage(agreement: LeaseAgreement) -> str:
    """The one-word state a person needs, including the in-between ones."""
    if agreement.status == "sent" and agreement.signed_at:
        return "awaiting_down_payment"
    if agreement.status == "sent":
        return "awaiting_signature"
    if agreement.status in ("active", "in_default") and buyout_open(agreement):
        return "buyout_pending"
    return agreement.status
