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

from datetime import date, timedelta
from decimal import Decimal
from typing import Any, Optional

from sqlalchemy.orm import Session, selectinload

from app.core.config import settings
from app.models.inventory import InventoryPart
from app.models.invoice import Invoice, InvoiceStatus, InvoiceType
from app.models.rental import Rental, RentalStatus, RentalItemStatus, RentalDiscountType
from app.utils.email import send_html_email
from app.utils.invoice_editing import compose_invoice_edit_notes
from app.utils.invoice_ledger import record_invoice_created, record_payment_delta
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

_PERIOD_DAYS = {"weekly": 7, "biweekly": 14, "monthly": 30, "quarterly": 91, "daily": 1}


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
    return _PERIOD_DAYS.get(freq, 30)


def _advance(day: date, freq: str) -> date:
    return day + timedelta(days=period_days(freq))


def _facility_id(db: Session, rental: Rental) -> Optional[int]:
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


def _generate_period_invoice(db: Session, rental: Rental) -> Invoice:
    period_index = int(rental.periods_billed or 0) + 1
    base, discount = _period_amounts(rental, period_index)
    tax = (base * RENTAL_TAX_FACTOR).quantize(Decimal("0.01"))
    total = max(Decimal("0"), base - discount + tax)

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
        subtotal=base,
        tax_amount=tax,
        discount_amount=discount,
        total_amount=total,
        amount_paid=Decimal("0"),
        balance_due=total,
        status=InvoiceStatus.PENDING,
        issue_date=date.today(),
        due_date=date.today() + timedelta(days=14),
        payment_terms="Net 14",
        payment_method="credit_card" if rental.auto_charge else None,
        notes=compose_invoice_edit_notes(None, visible, {"line_items": line_items, "labels": {"tax": f"Tax ({RENTAL_TAX_RATE}%)"}}),
    )
    db.add(invoice)
    db.flush()
    record_invoice_created(db, invoice, None, f"Recurring rental invoice for {rental.rental_number}")
    return invoice


def _public_pay_url(invoice: Invoice) -> str:
    base = settings.PUBLIC_APP_URL.rstrip("/")
    return f"{base}/rental-invoice/{invoice.id}"


def _email_invoice_due(rental: Rental, invoice: Invoice) -> None:
    if not rental.customer_email:
        return
    subject = f"Rental invoice {invoice.invoice_number} — {rental.rental_number}"
    body = (
        f"<p>Hello {rental.customer_name},</p>"
        f"<p>Your rental invoice <strong>{invoice.invoice_number}</strong> for "
        f"<strong>${invoice.total_amount}</strong> is ready.</p>"
        f"<p><a href=\"{_public_pay_url(invoice)}\">View and pay this invoice</a></p>"
        f"<p>Thank you for renting with Mr. BioMed Tech Services.</p>"
    )
    send_html_email([rental.customer_email], subject, body, f"Rental invoice {invoice.invoice_number}: ${invoice.total_amount}. {_public_pay_url(invoice)}")


def _email_charge_failed(rental: Rental, invoice: Invoice) -> None:
    if not rental.customer_email:
        return
    subject = f"Action needed: payment failed for {rental.rental_number}"
    body = (
        f"<p>Hello {rental.customer_name},</p>"
        f"<p>We tried to charge your card on file for rental invoice "
        f"<strong>{invoice.invoice_number}</strong> (${invoice.total_amount}) "
        f"{MAX_CHARGE_ATTEMPTS} times and it was declined.</p>"
        f"<p>Please update your payment method or pay this invoice manually: "
        f"<a href=\"{_public_pay_url(invoice)}\">Pay now</a></p>"
    )
    send_html_email([rental.customer_email], subject, body, f"Payment failed for {invoice.invoice_number}. Please update your card: {_public_pay_url(invoice)}")


def _try_auto_charge(db: Session, rental: Rental, invoice: Invoice) -> str:
    """Attempt to charge the saved card. Returns 'charged', 'declined', or 'exhausted'."""
    try:
        payment = create_square_payment(
            source_id=rental.square_card_id,
            idempotency_key=f"rental-invoice-{invoice.id}-{rental.failed_charge_count}",
            amount=invoice.total_amount,
            invoice_number=invoice.invoice_number,
            customer_email=rental.customer_email,
        )
    except SquareRequestError:
        rental.failed_charge_count = int(rental.failed_charge_count or 0) + 1
        if rental.failed_charge_count >= MAX_CHARGE_ATTEMPTS:
            invoice.status = InvoiceStatus.OVERDUE
            _append_history(rental, "auto_charge_failed", {"invoice": invoice.invoice_number, "attempts": rental.failed_charge_count})
            _email_charge_failed(rental, invoice)
            return "exhausted"
        _append_history(rental, "auto_charge_declined", {"invoice": invoice.invoice_number, "attempt": rental.failed_charge_count})
        return "declined"

    previous_paid = invoice.amount_paid
    invoice.amount_paid = invoice.total_amount
    invoice.balance_due = Decimal("0")
    invoice.status = InvoiceStatus.PAID
    invoice.payment_method = "credit_card"
    record_payment_delta(
        db, invoice, previous_paid, invoice.total_amount, None, "credit_card",
        f"Auto-charged card on file ({payment.get('id')})",
    )
    rental.failed_charge_count = 0
    _append_history(rental, "auto_charged", {"invoice": invoice.invoice_number, "amount": str(invoice.total_amount)})
    return "charged"


def generate_deposit_invoice(db: Session, rental: Rental) -> Optional[Invoice]:
    """The agreement's first invoice, raised upfront at creation: the security
    deposit plus the one-time Shipping & Packing and Delivery & Setup fees."""
    deposit = _money(rental.security_deposit)
    shipping_total = sum((_money(item.shipping_fee) for item in rental.items or []), Decimal("0"))
    setup_total = sum((_money(item.setup_fee) for item in rental.items or []), Decimal("0"))
    labor_total = sum((_money(item.labor_fee) for item in rental.items or []), Decimal("0"))
    # Deposit + labor are non-taxable; shipping & packing + delivery & setup are taxable.
    subtotal = deposit + shipping_total + setup_total + labor_total
    tax = ((shipping_total + setup_total) * RENTAL_TAX_FACTOR).quantize(Decimal("0.01"))
    total = subtotal + tax
    if subtotal <= 0:
        return None

    line_items: list[dict[str, Any]] = []
    if deposit > 0:
        line_items.append(_line("DEPOSIT", "Security Deposit", deposit))
    if shipping_total > 0:
        line_items.append(_line("SHIP-PACK", "Shipping & Packing", shipping_total))
    if setup_total > 0:
        line_items.append(_line("DEL-SETUP", "Delivery & Setup", setup_total))
    if labor_total > 0:
        line_items.append(_line("LABOR", "Labor", labor_total))

    invoice = Invoice(
        invoice_number=_next_invoice_number(db),
        invoice_type=InvoiceType.RENTAL,
        customer_name=rental.customer_name,
        customer_email=rental.customer_email or "billing@example.com",
        customer_phone=rental.customer_phone,
        customer_address=rental.customer_address,
        facility_id=_facility_id(db, rental),
        rental_id=rental.id,
        subtotal=subtotal,
        tax_amount=tax,
        discount_amount=Decimal("0"),
        total_amount=total,
        amount_paid=Decimal("0"),
        balance_due=total,
        status=InvoiceStatus.PENDING,
        issue_date=date.today(),
        due_date=date.today(),
        payment_terms="Due on receipt",
        payment_method="credit_card" if rental.auto_charge else None,
        notes=compose_invoice_edit_notes(None, f"Security deposit & one-time fees for rental {rental.rental_number}", {"line_items": line_items, "labels": {"tax": f"Tax ({RENTAL_TAX_RATE}%)"}}),
    )
    db.add(invoice)
    db.flush()
    record_invoice_created(db, invoice, None, f"Deposit & fees invoice for {rental.rental_number}")
    _append_history(rental, "deposit_invoiced", {"invoice": invoice.invoice_number, "amount": str(total)})
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
        .all()
    )

    for rental in due:
        # Stop once the committed term is fully billed.
        if rental.committed_periods and int(rental.periods_billed or 0) >= int(rental.committed_periods):
            results["skipped"] += 1
            continue
        # Stop billing agreements that are entirely returned.
        items = rental.items or []
        if items and all(item.item_status == RentalItemStatus.RETURNED.value for item in items):
            results["skipped"] += 1
            continue

        invoice = _generate_period_invoice(db, rental)
        rental.periods_billed = int(rental.periods_billed or 0) + 1
        rental.next_bill_date = _advance(rental.next_bill_date, _freq(rental))
        results["billed"] += 1

        can_auto_charge = bool(rental.auto_charge and rental.square_card_id and square_is_configured())
        if can_auto_charge:
            outcome = _try_auto_charge(db, rental, invoice)
            results[{"charged": "charged", "declined": "declined", "exhausted": "exhausted"}[outcome]] += 1
            if outcome == "exhausted":
                _email_invoice_due(rental, invoice)
        else:
            _email_invoice_due(rental, invoice)
            results["emailed"] += 1

        log_activity(db, "rentals", rental.id, "RECURRING_BILL", None, {"invoice": invoice.invoice_number})
        db.commit()

    return results
