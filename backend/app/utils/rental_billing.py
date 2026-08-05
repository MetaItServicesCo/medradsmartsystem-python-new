"""Recurring rental billing engine.

Run periodically (a daily cron hitting POST /rentals/run-recurring-billing, or an
external scheduler). For each active agreement whose next billing date has arrived
it raises the period's invoice, applies the commitment discount at its milestone,
and either auto-charges the saved card or emails the customer to pay. Auto-charge
failures are retried and, after three consecutive declines, the customer is emailed.

This module is intentionally side-effect-guarded: it never calls Square unless
Square is configured AND a card is on file, so it is safe to run without payments.
"""

from __future__ import annotations

import calendar
from datetime import date, datetime, timedelta
from decimal import Decimal
from typing import Any, Optional

from sqlalchemy.orm import Session, selectinload

from app.core.config import settings
from app.models.inventory import InventoryPart
from app.models.invoice import Invoice, InvoiceStatus, InvoiceType
from app.models.rental import Rental, RentalStatus, RentalItemStatus, RentalDiscountType
from app.utils.email import send_html_email
from app.utils.invoice_editing import compose_invoice_edit_notes
from app.utils.invoice_ledger import add_invoice_transaction, record_invoice_created, record_payment_delta
from app.utils.logging import log_activity
from app.utils.square_payments import (
    SquareRequestError,
    create_square_payment,
    square_is_configured,
)

MAX_CHARGE_ATTEMPTS = 3

# Same tax rule as Sales: 8.25% on the taxable base (rent + shipping & packing +
# delivery & setup). Labor and the refundable deposit are non-taxable.
RENTAL_TAX_RATE = Decimal("8.25")
RENTAL_TAX_FACTOR = RENTAL_TAX_RATE / Decimal("100")

_FIXED_PERIOD_DAYS = {"weekly": 7, "biweekly": 14, "daily": 1}
_PERIOD_MONTHS = {"monthly": 1, "quarterly": 3}
_RETRY_DELAYS_DAYS = (2, 2)


def _money(value: Any) -> Decimal:
    if value in (None, ""):
        return Decimal("0")
    return Decimal(str(value))


def _line(item_number: str, description: str, unit_price: Any, quantity: int = 1) -> dict[str, Any]:
    total = _money(unit_price) * quantity
    return {
        "item_number": item_number,
        "description": description,
        "quantity": quantity,
        "unit_price": float(_money(unit_price)),
        "shipping_fee": 0,
        "setup_fee": 0,
        "condition": None,
        "total_amount": float(total),
    }


def _freq(rental: Rental) -> str:
    freq = rental.billing_frequency
    return (freq.value if hasattr(freq, "value") else str(freq)).lower()


def period_days(freq: str) -> int:
    """Legacy/UI compatibility helper.

    Calendar frequencies are advanced with :func:`advance_billing_date`; this
    approximate value must not be used to calculate monthly due dates.
    """
    return {**_FIXED_PERIOD_DAYS, "monthly": 30, "quarterly": 91}.get(freq, 30)


def _add_months(day: date, months: int) -> date:
    month_index = day.month - 1 + months
    year = day.year + month_index // 12
    month = month_index % 12 + 1
    return date(year, month, min(day.day, calendar.monthrange(year, month)[1]))


def advance_billing_date(day: date, freq: str, periods: int = 1) -> date:
    """Advance a billing date without turning a month into a fixed day count."""
    normalized = (freq or "monthly").lower()
    if normalized in _PERIOD_MONTHS:
        return _add_months(day, _PERIOD_MONTHS[normalized] * periods)
    return day + timedelta(days=_FIXED_PERIOD_DAYS.get(normalized, 30) * periods)


def billing_period_date(rental: Rental, period_index: int) -> date:
    """Return the anchored start date for a 1-based agreement period."""
    return advance_billing_date(rental.start_date, _freq(rental), max(0, period_index - 1))


def billing_period_end(rental: Rental, period_index: int) -> date:
    natural_end = billing_period_date(rental, period_index + 1) - timedelta(days=1)
    return min(natural_end, rental.end_date) if rental.end_date else natural_end


def _facility_id(db: Session, rental: Rental) -> Optional[int]:
    # The agreement's customer facility is authoritative. Rental products are
    # global inventory and their storage location must not decide who is billed.
    if rental.facility_id is not None:
        return rental.facility_id
    for item in rental.items or []:
        if item.part_id:
            part = db.query(InventoryPart).filter(InventoryPart.id == item.part_id).first()
            if part and part.facility_id is not None:
                return part.facility_id
    return None


def _next_invoice_number(db: Session) -> str:
    last = db.query(Invoice).order_by(Invoice.id.desc()).first()
    return f"INV-RENTAL-{((last.id + 1) if last else 1):06d}"


def _append_history(rental: Rental, action: str, details: Optional[dict[str, Any]] = None) -> None:
    history = list(rental.history or [])
    history.append({
        "action": action,
        "by": "System (recurring billing)",
        "user_id": None,
        "at": date.today().isoformat(),
        "details": details or {},
    })
    rental.history = history


def _period_amounts(rental: Rental, period_index: int) -> tuple[Decimal, Decimal]:
    """Returns (base_rental, discount) for the given 1-based period. One-time
    shipping/setup fees are billed on the deposit invoice, not on the cycles. The
    commitment discount lands on the invoice immediately after the milestone."""
    base = Decimal("0")
    for item in rental.items or []:
        base += _money(item.rental_rate) * int(item.quantity or 1)

    discount = Decimal("0")
    apply_after = rental.discount_apply_after_periods
    if rental.discount_type and apply_after is not None and period_index == int(apply_after) + 1:
        if rental.discount_type == RentalDiscountType.PERCENT.value:
            discount = (base * _money(rental.discount_value) / Decimal("100")).quantize(Decimal("0.01"))
        else:
            discount = min(base, _money(rental.discount_value))
    return base, discount


def _recurring_invoice_amounts(rental: Rental, period_index: int) -> dict[str, Decimal]:
    """Calculate a recurring period with discount reducing the taxable base."""
    rental_total, discount = _period_amounts(rental, period_index)
    taxable_rental = max(Decimal("0"), rental_total - discount)
    tax = (taxable_rental * RENTAL_TAX_FACTOR).quantize(Decimal("0.01"))
    total = taxable_rental + tax
    return {
        "rental": rental_total,
        "discount": discount,
        "taxable_rental": taxable_rental,
        "tax": tax,
        "total": total,
    }


def effective_period_count(rental: Rental) -> int:
    """Number of billable periods, bounded by commitment and agreement end."""
    count = 0
    maximum = int(rental.committed_periods) if rental.committed_periods else 1200
    while count < maximum and billing_period_date(rental, count + 1) <= rental.end_date:
        count += 1
    return count


def projected_billing_schedule(rental: Rental) -> list[dict[str, Any]]:
    """Deterministic schedule used by APIs, UI, and the billing engine."""
    schedule: list[dict[str, Any]] = []
    for period_index in range(1, effective_period_count(rental) + 1):
        if period_index == 1:
            amounts = _initial_invoice_amounts(rental)
        else:
            amounts = _recurring_invoice_amounts(rental, period_index)
        schedule.append({
            "period": period_index,
            "billing_date": billing_period_date(rental, period_index),
            "period_end": billing_period_end(rental, period_index),
            "rental_amount": amounts["rental"],
            "discount": amounts["discount"],
            "tax": amounts["tax"],
            "total": amounts["total"],
        })
    return schedule


def projected_period(rental: Rental, period_index: int) -> Optional[dict[str, Any]]:
    """Return one projected period without constructing the complete schedule."""
    if period_index < 1 or period_index > effective_period_count(rental):
        return None
    amounts = _initial_invoice_amounts(rental) if period_index == 1 else _recurring_invoice_amounts(rental, period_index)
    return {
        "period": period_index,
        "billing_date": billing_period_date(rental, period_index),
        "period_end": billing_period_end(rental, period_index),
        "rental_amount": amounts["rental"],
        "discount": amounts["discount"],
        "tax": amounts["tax"],
        "total": amounts["total"],
    }


def _initial_invoice_amounts(rental: Rental) -> dict[str, Decimal]:
    """Calculate the upfront invoice, including rental period one.

    Rent, shipping, and delivery/setup are taxable. The refundable deposit and
    labor are not. Keeping this calculation centralized prevents the public
    portal, invoice ledger, and recurring scheduler from drifting apart.
    """
    rental_total, discount = _period_amounts(rental, 1)
    deposit = _money(rental.security_deposit)
    shipping_total = sum((_money(item.shipping_fee) for item in rental.items or []), Decimal("0"))
    setup_total = sum((_money(item.setup_fee) for item in rental.items or []), Decimal("0"))
    labor_total = sum((_money(item.labor_fee) for item in rental.items or []), Decimal("0"))
    taxable_rental = max(Decimal("0"), rental_total - discount)
    taxable_total = taxable_rental + shipping_total + setup_total
    tax = (taxable_total * RENTAL_TAX_FACTOR).quantize(Decimal("0.01"))
    subtotal = rental_total + deposit + shipping_total + setup_total + labor_total
    total = max(Decimal("0"), subtotal - discount + tax)
    return {
        "rental": rental_total,
        "deposit": deposit,
        "shipping": shipping_total,
        "setup": setup_total,
        "labor": labor_total,
        "discount": discount,
        "tax": tax,
        "subtotal": subtotal,
        "total": total,
    }


def _generate_period_invoice(db: Session, rental: Rental) -> Invoice:
    period_index = int(rental.periods_billed or 0) + 1
    scheduled_date = billing_period_date(rental, period_index)
    due_date = scheduled_date + timedelta(days=14)
    existing = (
        db.query(Invoice)
        .filter(Invoice.rental_id == rental.id, Invoice.rental_period_number == period_index)
        .first()
    )
    if existing:
        return existing

    amounts = _recurring_invoice_amounts(rental, period_index)
    base = amounts["rental"]
    discount = amounts["discount"]
    tax = amounts["tax"]
    total = amounts["total"]

    line_items = [
        _line(item.part_number or "Rental", item.part_description or "Rental product", _money(item.rental_rate), int(item.quantity or 1))
        for item in rental.items or []
    ]
    visible = (
        f"Rental {rental.rental_number} — period {period_index}"
        + (f" of {rental.committed_periods}" if rental.committed_periods else "")
        + (f" (commitment discount {discount} applied)" if discount > 0 else "")
    )
    invoice = Invoice(
        invoice_number=_next_invoice_number(db),
        invoice_type=InvoiceType.RENTAL,
        customer_name=rental.customer_name,
        customer_email=rental.customer_email or "billing@example.com",
        customer_phone=rental.customer_phone,
        customer_address=rental.customer_address,
        facility_id=_facility_id(db, rental),
        rental_id=rental.id,
        rental_period_number=period_index,
        rental_period_start=billing_period_date(rental, period_index),
        rental_period_end=billing_period_end(rental, period_index),
        subtotal=base,
        tax_amount=tax,
        discount_amount=discount,
        total_amount=total,
        amount_paid=Decimal("0"),
        balance_due=total,
        status=InvoiceStatus.OVERDUE if due_date < date.today() else InvoiceStatus.PENDING,
        issue_date=scheduled_date,
        due_date=due_date,
        payment_terms="Net 14",
        payment_method="credit_card" if rental.auto_charge else None,
        notes=compose_invoice_edit_notes(None, visible, {"line_items": line_items, "labels": {"tax": f"Tax ({RENTAL_TAX_RATE}%)"}}),
    )
    db.add(invoice)
    db.flush()
    record_invoice_created(db, invoice, None, f"Recurring rental invoice for {rental.rental_number}")
    _append_history(rental, "recurring_invoice_created", {
        "invoice": invoice.invoice_number,
        "period": period_index,
        "amount": str(total),
        "billing_date": billing_period_date(rental, period_index).isoformat(),
    })
    return invoice


def _public_pay_url(invoice: Invoice) -> str:
    base = settings.PUBLIC_APP_URL.rstrip("/")
    return f"{base}/rental-invoice/{invoice.id}"


def _email_invoice_due(rental: Rental, invoice: Invoice) -> bool:
    if not rental.customer_email:
        return False
    subject = f"Rental invoice {invoice.invoice_number} — {rental.rental_number}"
    body = (
        f"<p>Hello {rental.customer_name},</p>"
        f"<p>Your rental invoice <strong>{invoice.invoice_number}</strong> for "
        f"<strong>${invoice.total_amount}</strong> is ready.</p>"
        f"<p><a href=\"{_public_pay_url(invoice)}\">View and pay this invoice</a></p>"
        f"<p>Thank you for renting with Mr. BioMed Tech Services.</p>"
    )
    return send_html_email([rental.customer_email], subject, body, f"Rental invoice {invoice.invoice_number}: ${invoice.total_amount}. {_public_pay_url(invoice)}")


def _email_charge_failed(rental: Rental, invoice: Invoice) -> bool:
    if not rental.customer_email:
        return False
    subject = f"Action needed: payment failed for {rental.rental_number}"
    body = (
        f"<p>Hello {rental.customer_name},</p>"
        f"<p>We tried to charge your card on file for rental invoice "
        f"<strong>{invoice.invoice_number}</strong> (${invoice.total_amount}) "
        f"{MAX_CHARGE_ATTEMPTS} times and it was declined.</p>"
        f"<p>Please update your payment method or pay this invoice manually: "
        f"<a href=\"{_public_pay_url(invoice)}\">Pay now</a></p>"
    )
    return send_html_email([rental.customer_email], subject, body, f"Payment failed for {invoice.invoice_number}. Please update your card: {_public_pay_url(invoice)}")


def _email_charge_declined(rental: Rental, invoice: Invoice, attempt: int, next_retry: datetime) -> bool:
    if not rental.customer_email:
        return False
    subject = f"Payment attempt declined for {rental.rental_number}"
    retry_label = next_retry.strftime("%B %d, %Y")
    body = (
        f"<p>Hello {rental.customer_name},</p>"
        f"<p>Automatic payment attempt {attempt} of {MAX_CHARGE_ATTEMPTS} for "
        f"<strong>{invoice.invoice_number}</strong> (${invoice.balance_due}) was declined.</p>"
        f"<p>We will retry on <strong>{retry_label}</strong>. You can also pay manually or update "
        f"your card here: <a href=\"{_public_pay_url(invoice)}\">View invoice</a>.</p>"
    )
    return send_html_email(
        [rental.customer_email], subject, body,
        f"Payment attempt {attempt} for {invoice.invoice_number} was declined. Next retry: {retry_label}. {_public_pay_url(invoice)}",
    )


def _try_auto_charge(db: Session, rental: Rental, invoice: Invoice) -> str:
    """Attempt to charge the saved card. Returns 'charged', 'declined', or 'exhausted'."""
    attempt = int(invoice.payment_attempt_count or 0) + 1
    invoice.payment_attempt_count = attempt
    invoice.last_payment_attempt_at = datetime.utcnow()
    add_invoice_transaction(
        db, invoice, "payment_attempt", invoice.balance_due,
        "credit_card", f"Automatic payment attempt {attempt} of {MAX_CHARGE_ATTEMPTS}",
        reference_prefix="ATT",
    )
    try:
        payment = create_square_payment(
            source_id=rental.square_card_id,
            idempotency_key=f"rental-invoice-{invoice.id}-attempt-{attempt}",
            amount=invoice.total_amount,
            invoice_number=invoice.invoice_number,
            customer_email=rental.customer_email,
            customer_id=rental.square_customer_id,
        )
    except SquareRequestError:
        rental.failed_charge_count = int(rental.failed_charge_count or 0) + 1
        add_invoice_transaction(
            db, invoice, "payment_failed", invoice.balance_due,
            "credit_card", f"Automatic payment attempt {attempt} was declined",
            reference_prefix="DEC",
        )
        if attempt >= MAX_CHARGE_ATTEMPTS:
            invoice.status = InvoiceStatus.OVERDUE
            invoice.next_payment_retry_at = None
            _append_history(rental, "auto_charge_failed", {"invoice": invoice.invoice_number, "attempts": rental.failed_charge_count})
            add_invoice_transaction(
                db, invoice, "auto_charge_exhausted", invoice.balance_due,
                "credit_card", f"Automatic charging stopped after {attempt} failed attempts",
                reference_prefix="FAIL",
            )
            notified = _email_charge_failed(rental, invoice)
            add_invoice_transaction(
                db, invoice, "customer_notified", 0, None,
                "Customer notified that automatic charging was exhausted" if notified else "Automatic-charge failure notification could not be delivered",
                reference_prefix="NTF",
            )
            return "exhausted"
        invoice.next_payment_retry_at = datetime.utcnow() + timedelta(days=_RETRY_DELAYS_DAYS[attempt - 1])
        notified = _email_charge_declined(rental, invoice, attempt, invoice.next_payment_retry_at)
        add_invoice_transaction(
            db, invoice, "customer_notified", 0, None,
            f"Customer notified of decline; retry scheduled for {invoice.next_payment_retry_at.date().isoformat()}"
            if notified else "Decline notification could not be delivered",
            reference_prefix="NTF",
        )
        _append_history(rental, "auto_charge_declined", {"invoice": invoice.invoice_number, "attempt": rental.failed_charge_count})
        return "declined"

    previous_paid = invoice.amount_paid
    invoice.amount_paid = invoice.total_amount
    invoice.balance_due = Decimal("0")
    invoice.status = InvoiceStatus.PAID
    invoice.payment_method = "credit_card"
    invoice.next_payment_retry_at = None
    payment_txn = record_payment_delta(
        db, invoice, previous_paid, invoice.total_amount, None, "credit_card",
        f"Auto-charged card on file ({payment.get('id')})",
    )
    if payment_txn is not None:
        payment_txn.reference_number = payment.get("id")
    rental.failed_charge_count = 0
    _append_history(rental, "auto_charged", {"invoice": invoice.invoice_number, "amount": str(invoice.total_amount)})
    return "charged"


def generate_deposit_invoice(db: Session, rental: Rental) -> Optional[Invoice]:
    """Raise period one, the deposit, and one-time fees at agreement creation."""
    amounts = _initial_invoice_amounts(rental)
    if amounts["subtotal"] <= 0:
        return None

    line_items: list[dict[str, Any]] = []
    frequency = _freq(rental)
    for item in rental.items or []:
        item_total = _money(item.rental_rate) * int(item.quantity or 1)
        if item_total > 0:
            line_items.append(
                _line(
                    item.part_number or "Rental",
                    f"{item.part_description or 'Rental product'} - first {frequency} rental period",
                    _money(item.rental_rate),
                    int(item.quantity or 1),
                )
            )
    if amounts["deposit"] > 0:
        line_items.append(_line("DEPOSIT", "Security Deposit", amounts["deposit"]))
    if amounts["shipping"] > 0:
        line_items.append(_line("SHIP-PACK", "Shipping & Packing", amounts["shipping"]))
    if amounts["setup"] > 0:
        line_items.append(_line("DEL-SETUP", "Delivery & Setup", amounts["setup"]))
    if amounts["labor"] > 0:
        line_items.append(_line("LABOR", "Labor", amounts["labor"]))

    invoice = Invoice(
        invoice_number=_next_invoice_number(db),
        invoice_type=InvoiceType.RENTAL,
        customer_name=rental.customer_name,
        customer_email=rental.customer_email or "billing@example.com",
        customer_phone=rental.customer_phone,
        customer_address=rental.customer_address,
        facility_id=_facility_id(db, rental),
        rental_id=rental.id,
        rental_period_number=1,
        rental_period_start=billing_period_date(rental, 1),
        rental_period_end=billing_period_end(rental, 1),
        subtotal=amounts["subtotal"],
        tax_amount=amounts["tax"],
        discount_amount=amounts["discount"],
        total_amount=amounts["total"],
        amount_paid=Decimal("0"),
        balance_due=amounts["total"],
        status=InvoiceStatus.PENDING,
        issue_date=date.today(),
        due_date=date.today(),
        payment_terms="Due on receipt",
        payment_method="credit_card" if rental.auto_charge else None,
        notes=compose_invoice_edit_notes(None, f"Initial rental period, security deposit & one-time fees for rental {rental.rental_number}", {"line_items": line_items, "labels": {"tax": f"Tax ({RENTAL_TAX_RATE}%)"}}),
    )
    db.add(invoice)
    db.flush()
    record_invoice_created(db, invoice, None, f"Initial rental invoice for {rental.rental_number}")
    _append_history(rental, "deposit_invoiced", {"invoice": invoice.invoice_number, "amount": str(amounts["total"]), "rental_period": 1})
    return invoice


def run_rental_recurring_billing(db: Session, today: Optional[date] = None) -> dict[str, int]:
    """Bill every agreement whose next billing date has arrived. Safe to call daily."""
    today = today or date.today()
    results = {"billed": 0, "charged": 0, "emailed": 0, "declined": 0, "exhausted": 0, "skipped": 0}

    due = (
        db.query(Rental)
        .options(selectinload(Rental.items))
        .filter(
            Rental.status == RentalStatus.ACTIVE,
            Rental.next_bill_date.isnot(None),
            Rental.next_bill_date <= today,
        )
        .with_for_update(skip_locked=True)
        .all()
    )

    for rental in due:
        period_index = int(rental.periods_billed or 0) + 1
        # Stop at the first applicable boundary: commitment or agreement end.
        if period_index > effective_period_count(rental):
            rental.next_bill_date = None
            _append_history(rental, "billing_schedule_completed", {
                "periods_billed": int(rental.periods_billed or 0),
                "committed_periods": rental.committed_periods,
                "agreement_end": rental.end_date.isoformat(),
            })
            results["skipped"] += 1
            db.commit()
            continue
        # Stop billing agreements that are entirely returned.
        items = rental.items or []
        if items and all(item.item_status == RentalItemStatus.RETURNED.value for item in items):
            rental.next_bill_date = None
            _append_history(rental, "billing_stopped", {"reason": "all_items_returned"})
            results["skipped"] += 1
            db.commit()
            continue

        invoice = _generate_period_invoice(db, rental)
        rental.periods_billed = period_index
        next_period = period_index + 1
        rental.next_bill_date = (
            billing_period_date(rental, next_period)
            if next_period <= effective_period_count(rental)
            else None
        )
        results["billed"] += 1

        can_auto_charge = bool(
            rental.auto_charge
            and rental.auto_charge_authorized_at
            and rental.square_card_id
            and square_is_configured()
            and invoice.status != InvoiceStatus.PAID
            and _money(invoice.balance_due) > 0
        )
        if can_auto_charge:
            outcome = _try_auto_charge(db, rental, invoice)
            results[{"charged": "charged", "declined": "declined", "exhausted": "exhausted"}[outcome]] += 1
        elif invoice.status != InvoiceStatus.PAID and _money(invoice.balance_due) > 0:
            emailed = _email_invoice_due(rental, invoice)
            add_invoice_transaction(
                db, invoice, "invoice_emailed" if emailed else "invoice_email_failed", 0, None,
                f"Invoice delivery to {rental.customer_email} " + ("succeeded" if emailed else "failed or SMTP is not configured"),
                reference_prefix="MAIL",
            )
            if emailed:
                results["emailed"] += 1

        log_activity(db, "rentals", rental.id, "RECURRING_BILL", None, {"invoice": invoice.invoice_number})
        db.commit()

    # Retry existing declined auto-charge invoices independently from generating
    # a new rental period. Each invoice therefore keeps its own attempt history.
    retry_due = (
        db.query(Invoice)
        .filter(
            Invoice.invoice_type == InvoiceType.RENTAL,
            Invoice.status.in_([InvoiceStatus.PENDING, InvoiceStatus.OVERDUE]),
            Invoice.balance_due > 0,
            Invoice.next_payment_retry_at.isnot(None),
            Invoice.next_payment_retry_at <= datetime.utcnow(),
        )
        .with_for_update(skip_locked=True)
        .all()
    )
    for invoice in retry_due:
        rental = invoice.rental
        if not rental or not (rental.auto_charge and rental.auto_charge_authorized_at and rental.square_card_id and square_is_configured()):
            invoice.next_payment_retry_at = None
            results["skipped"] += 1
            db.commit()
            continue
        outcome = _try_auto_charge(db, rental, invoice)
        results[{"charged": "charged", "declined": "declined", "exhausted": "exhausted"}[outcome]] += 1
        db.commit()

    return results
