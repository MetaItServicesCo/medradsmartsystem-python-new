"""Charging lease-to-own payments, against a Square that does what it is told.

The charge path is the riskiest code in the feature: it moves money with no
person watching. These checks drive it through a fake Square that approves,
declines, or loses its response mid-flight, and confirm the properties that
matter: a card is never charged twice for one invoice, never charged before
the invoice falls due, never charged when the response was lost (the webhook
settles that), stops after three declines with the customer told each time,
and stops entirely in default or while a buyout is open. A failure on one
agreement must never stop the others.

    DATABASE_URL=sqlite:// python backend/tests/test_lease_billing.py
"""
from __future__ import annotations

import os
import pathlib
import sys
from datetime import date, datetime, timedelta
from decimal import Decimal as D

os.environ.setdefault("DATABASE_URL", "sqlite://")
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))

from cryptography.fernet import Fernet  # noqa: E402
from sqlalchemy import create_engine  # noqa: E402
from sqlalchemy.orm import sessionmaker  # noqa: E402
from sqlalchemy.pool import StaticPool  # noqa: E402

import app.models  # noqa: E402,F401
from app.core.config import settings  # noqa: E402
from app.db.base import Base  # noqa: E402
from app.models.inventory import InventoryPart  # noqa: E402
from app.models.invoice import InvoiceStatus, InvoiceTransaction, PaymentReceiptDelivery  # noqa: E402
from app.models.lease import LeaseAgreement  # noqa: E402
from app.models.payment_operation import PaymentOperation  # noqa: E402
from app.models.user import User, UserRole, UserType  # noqa: E402
from app.utils import lease_billing as billing  # noqa: E402
from app.utils import lease_service as svc  # noqa: E402
from app.utils.square_payments import SquareRequestError, amount_to_minor_units  # noqa: E402

settings.PAYMENT_DATA_ENCRYPTION_KEYS = Fernet.generate_key().decode()
settings.SQUARE_CURRENCY = "USD"

failures: list[str] = []


def ok(label: str, condition: bool, detail: str = "") -> None:
    print("{}  {}{}".format("PASS" if condition else "FAIL", label,
                            "  " + detail if detail else ""))
    if not condition:
        failures.append(label)


# ── The fake Square ──────────────────────────────────────────────────────────

class FakeSquare:
    def __init__(self):
        self.mode = "approve"            # approve | decline | lost | short
        self.charges: list[dict] = []
        self.disabled: list[str] = []
        self.disable_fails = False

    def pay(self, *, source_id, idempotency_key, amount, invoice_number, customer_email=None, customer_id=None):
        self.charges.append({"key": idempotency_key, "amount": D(str(amount)), "card": source_id,
                             "invoice": invoice_number})
        if self.mode == "decline":
            raise SquareRequestError("Card declined", status_code=402)
        if self.mode == "lost":
            raise SquareRequestError("Connection reset", indeterminate=True)
        charged = D(str(amount)) - (D("1.00") if self.mode == "short" else D("0"))
        return {"id": "PAY-{}".format(len(self.charges)), "status": "COMPLETED",
                "amount_money": {"amount": amount_to_minor_units(charged), "currency": "USD"},
                "card_details": {"card": {"card_brand": "VISA", "last_4": "4242"}}}

    def disable(self, card_id):
        if self.disable_fails:
            raise SquareRequestError("Square unavailable", status_code=503)
        self.disabled.append(card_id)
        return {}


square = FakeSquare()
billing.create_square_payment = square.pay
billing.disable_square_card = square.disable
billing.square_is_configured = lambda: True
mail: list[tuple[str, str]] = []
svc.send_html_email = lambda to, subject, html, text, message_id=None: mail.append((to[0], subject)) or True

engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
Base.metadata.create_all(engine)
Session = sessionmaker(bind=engine)
FIRST_DUE = date.today() + timedelta(days=30)


def fresh():
    for table in reversed(Base.metadata.sorted_tables):
        with engine.begin() as conn:
            conn.exec_driver_sql("DELETE FROM {}".format(table.name))
    square.__init__()
    mail.clear()
    db = Session()
    staff = User(username="sales", email="sales@medrad.test", full_name="Sales Lead",
                 hashed_password="x", user_type=UserType.EMPLOYEE, role=UserRole.ADMIN, is_active=True)
    part = InventoryPart(part_number="MON-500", part_type="sales", description="Patient monitor",
                         unit_price=D("10000"), condition="new", quantity_on_hand=5,
                         reorder_level=0, status="active")
    db.add_all([staff, part])
    db.commit()
    return db, staff, part


def make_lease(db, staff, part, *, card=True, down=D("0"), count=12, email="billing@stmary.test"):
    data = svc.LeaseInput(customer_name="St. Mary Clinic", customer_email=email, part_id=part.id,
                          quantity=1, markup_percent=D("15"), down_payment=down,
                          installment_count=count, frequency="monthly", first_due_date=FIRST_DUE,
                          late_fee_amount=D("25"), grace_days=5, default_after_missed=3,
                          invoice_lead_days=7)
    a = svc.create_agreement(db, data, staff)
    svc.send_agreement(db, a, staff)
    svc.sign_agreement(db, a, signed_by_name="Dr. Jane Roe", revision=a.revision,
                       ip_address=None, user_agent=None)
    if card:
        svc.record_card(db, a, {"customer_id": "CUS-1", "card_id": "CARD-1", "card_brand": "VISA",
                                "last_4": "4242", "exp_month": 12, "exp_year": 2030},
                        authorize=True, accepted_by_name="Dr. Jane Roe", channel="public_link",
                        ip_address=None, user_agent=None)
    db.commit()
    return a.id


def run(db, day):
    return billing.run_lease_billing(db, today=day)


def agreement(db, lease_id):
    db.expire_all()
    return db.get(LeaseAgreement, lease_id)


print("Lease billing")
print("=" * 72)

print()
print("A card is charged on the due date, not when the invoice is raised")
print("-" * 72)
db, staff, part = fresh()
lid = make_lease(db, staff, part)
run(db, FIRST_DUE - timedelta(days=7))
a = agreement(db, lid)
first = a.installments[0]
ok("the invoice is raised seven days early", first.invoice_id is not None)
ok("  but the card is not charged yet", square.charges == [], str(square.charges))
run(db, FIRST_DUE - timedelta(days=1))
ok("nor the day before", square.charges == [])
result = run(db, FIRST_DUE)
a = agreement(db, lid)
inv = a.installments[0].invoice
ok("on the due date it is charged", len(square.charges) == 1 and result["charged"] == 1, str(result))
# No down payment here: 10,000 / 12 = 833.33 principal + 125.00 markup =
# 958.33, plus 79.06 tax at 8.25% = 1,037.39.
ok("  for exactly the installment", square.charges[0]["amount"] == D("1037.39"), str(square.charges[0]["amount"]))
ok("  against the saved card", square.charges[0]["card"] == "CARD-1")
ok("the invoice is paid", inv.status == InvoiceStatus.PAID and inv.balance_due == D("0.00"))
ok("the installment follows", a.installments[0].status == "paid")
ok("a receipt is queued to the customer",
   db.query(PaymentReceiptDelivery).filter_by(invoice_id=inv.id).count() == 1)
op = db.query(PaymentOperation).filter_by(invoice_id=inv.id).one()
ok("the payment operation is recorded as succeeded", op.status == "succeeded", op.status)
kinds = [t.transaction_type for t in db.query(InvoiceTransaction).filter_by(invoice_id=inv.id).all()]
ok("the ledger shows the attempt and the payment", "payment_attempt" in kinds, str(kinds))

run(db, FIRST_DUE)
run(db, FIRST_DUE + timedelta(days=1))
ok("running again the same day, or the next, never charges it twice", len(square.charges) == 1,
   str(len(square.charges)))

print()
print("Declines retry twice, two days apart, then stop")
print("-" * 72)
db, staff, part = fresh()
lid = make_lease(db, staff, part)
square.mode = "decline"
run(db, FIRST_DUE)
a = agreement(db, lid)
inv = a.installments[0].invoice
ok("the first attempt is declined", len(square.charges) == 1 and inv.payment_attempt_count == 1)
ok("  a retry is scheduled", inv.next_payment_retry_at is not None)
ok("  and the customer is told", any("declined" in s for _, s in mail))
run(db, FIRST_DUE)
ok("it is not retried before the retry time", len(square.charges) == 1)
inv.next_payment_retry_at = datetime.utcnow() - timedelta(minutes=1)
db.commit()
run(db, FIRST_DUE + timedelta(days=2))
inv.next_payment_retry_at = datetime.utcnow() - timedelta(minutes=1)
db.commit()
run(db, FIRST_DUE + timedelta(days=4))
a = agreement(db, lid)
inv = a.installments[0].invoice
ok("three attempts in all", len(square.charges) == 3, str(len(square.charges)))
ok("  each with its own idempotency key", len({c["key"] for c in square.charges}) == 3)
ok("then automatic charging stops", inv.next_payment_retry_at is None and inv.status == InvoiceStatus.OVERDUE)
ok("  and the customer is told it failed", any("Action needed" in s for _, s in mail))
square.mode = "approve"
run(db, FIRST_DUE + timedelta(days=10))
ok("it is not charged a fourth time", len(square.charges) == 3, str(len(square.charges)))

print()
print("A lost response is never charged again on a guess")
print("-" * 72)
db, staff, part = fresh()
lid = make_lease(db, staff, part)
square.mode = "lost"
run(db, FIRST_DUE)
a = agreement(db, lid)
inv = a.installments[0].invoice
ok("the attempt is made once", len(square.charges) == 1)
ok("  no retry is scheduled", inv.next_payment_retry_at is None)
ok("  it is left for webhook verification", "payment_verification_pending" in [
    t.transaction_type for t in db.query(InvoiceTransaction).filter_by(invoice_id=inv.id).all()])
square.mode = "approve"
run(db, FIRST_DUE + timedelta(days=5))
ok("  and later runs do not charge it again", len(square.charges) == 1, str(len(square.charges)))

db, staff, part = fresh()
lid = make_lease(db, staff, part)
square.mode = "short"
run(db, FIRST_DUE)
a = agreement(db, lid)
inv = a.installments[0].invoice
ok("a payment for the wrong amount is not recorded as paid", inv.status != InvoiceStatus.PAID)
ok("  and is flagged for reconciliation", inv.next_payment_retry_at is None)

print()
print("Without automatic charging, the customer is sent the invoice")
print("-" * 72)
db, staff, part = fresh()
lid = make_lease(db, staff, part, card=False)
run(db, FIRST_DUE - timedelta(days=7))
ok("Square is never called", square.charges == [])
ok("the customer is emailed the invoice when it is raised", any("payment due" in s for _, s in mail))
run(db, FIRST_DUE)
ok("  and nothing is charged on the due date either", square.charges == [])

print()
print("Collection stops in default and pauses for a buyout")
print("-" * 72)
# A genuine default: three installments left unpaid by a customer paying by
# hand. Default is derived from what is actually missed, so it cannot simply
# be set; reconcile would lift it again.
db, staff, part = fresh()
lid = make_lease(db, staff, part, card=False)
a = agreement(db, lid)
third_due = a.installments[2].due_date
for k in range(3):
    run(db, a.installments[k].due_date - timedelta(days=7))
run(db, third_due + timedelta(days=6))
a = agreement(db, lid)
ok("three missed installments put it in default", a.status == "in_default", a.status)
svc.record_card(db, a, {"customer_id": "CUS-1", "card_id": "CARD-1", "last_4": "4242"},
                authorize=True, accepted_by_name="Dr. Jane Roe", channel="public_link",
                ip_address=None, user_agent=None)
db.commit()
run(db, third_due + timedelta(days=7))
ok("nothing is charged while in default, even with a card saved", square.charges == [],
   str(len(square.charges)))

db, staff, part = fresh()
lid = make_lease(db, staff, part)
a = agreement(db, lid)
svc.generate_due_invoices(db, a, FIRST_DUE - timedelta(days=7))
svc.start_buyout(db, a, staff)
db.commit()
run(db, FIRST_DUE)
ok("nothing scheduled is charged while a buyout is open", square.charges == [])
ok("  and the buyout itself is never auto-charged", square.charges == [])

print()
print("The down payment and late fees")
print("-" * 72)
db, staff, part = fresh()
lid = make_lease(db, staff, part, down=D("1000"))
run(db, date.today())
a = agreement(db, lid)
ok("an authorized card pays the down payment", a.down_payment_invoice.status == InvoiceStatus.PAID)
ok("  for the down payment plus tax", square.charges and square.charges[0]["amount"] == D("1082.50"))
ok("  which puts the agreement in force", a.status == "active")

db, staff, part = fresh()
lid = make_lease(db, staff, part, card=False)
run(db, FIRST_DUE - timedelta(days=7))
run(db, FIRST_DUE + timedelta(days=6))
a = agreement(db, lid)
ok("an installment unpaid past the grace period gets a late fee",
   a.installments[0].late_fee_invoice is not None)
ok("  of the agreed amount", a.installments[0].late_fee_invoice.total_amount == D("25.00"))

print()
print("The schedule runs to ownership")
print("-" * 72)
db, staff, part = fresh()
lid = make_lease(db, staff, part, count=3)
for k in range(3):
    run(db, svc.terms_of(agreement(db, lid)).first_due_date if k == 0 else agreement(db, lid).installments[k].due_date)
a = agreement(db, lid)
ok("three monthly charges", len(square.charges) == 3, str(len(square.charges)))
ok("  and the agreement completes", a.status == "completed" and a.completion_method == "schedule", a.status)
ok("  the customer is told they own it", any("now own" in s for _, s in mail))
ok("  and charging is switched off", a.auto_charge is False)
run(db, FIRST_DUE + timedelta(days=200))
ok("a completed agreement is never charged again", len(square.charges) == 3)

print()
print("A replaced card is removed at Square, and retried until it is")
print("-" * 72)
db, staff, part = fresh()
lid = make_lease(db, staff, part)
a = agreement(db, lid)
svc.record_card(db, a, {"customer_id": "CUS-1", "card_id": "CARD-2", "last_4": "1111"},
                authorize=True, accepted_by_name="Dr. Jane Roe", channel="public_link",
                ip_address=None, user_agent=None)
db.commit()
square.disable_fails = True
run(db, date.today())
ok("while Square is unavailable the cleanup stays pending", agreement(db, lid).card_cleanup_pending)
ok("  and the old card is not the agreement's card", agreement(db, lid).square_card_id == "CARD-2")
square.disable_fails = False
run(db, date.today())
ok("once Square answers, the old card is disabled", square.disabled == ["CARD-1"], str(square.disabled))
ok("  and the cleanup is cleared", not agreement(db, lid).card_cleanup_pending)

print()
print("One broken agreement never stops the rest")
print("-" * 72)
db, staff, part = fresh()
good = make_lease(db, staff, part, email="good@x.test")
bad = make_lease(db, staff, part, email="bad@x.test")
real = billing.bill_agreement


def flaky(db_, agreement_, today_, results_):
    if agreement_.id == bad:
        raise RuntimeError("simulated failure")
    return real(db_, agreement_, today_, results_)


billing.bill_agreement = flaky
try:
    result = run(db, FIRST_DUE)
finally:
    billing.bill_agreement = real
ok("the failure is counted", result["errors"] == 1, str(result))
ok("  and the healthy agreement was still charged",
   any(c["amount"] == D("1037.39") for c in square.charges) and result["charged"] == 1)

print()
print("=" * 72)
if failures:
    print("{} failing: {}".format(len(failures), ", ".join(failures)))
    sys.exit(1)
print("All lease billing checks passed.")
