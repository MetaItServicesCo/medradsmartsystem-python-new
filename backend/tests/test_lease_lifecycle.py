"""Lease-to-own end to end: draft, send, sign, collect, default, buy out, own.

test_lease_math covers the arithmetic. This covers what only shows up once
rows are written: stock leaving inventory exactly once, invoices raised once
and only when due, a payment made anywhere in the system being picked up,
default arriving and lifting, a buyout pausing collection and settling the
rest, and cancellation putting things back. Each scenario starts from a clean
database.

    DATABASE_URL=sqlite:// python backend/tests/test_lease_lifecycle.py
"""
from __future__ import annotations

import os
import pathlib
import sys
from datetime import date, timedelta
from decimal import Decimal as D

os.environ.setdefault("DATABASE_URL", "sqlite://")
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))

from sqlalchemy import create_engine  # noqa: E402
from sqlalchemy.orm import sessionmaker  # noqa: E402
from sqlalchemy.pool import StaticPool  # noqa: E402

import app.models  # noqa: E402,F401
from app.db.base import Base  # noqa: E402
from app.models.inventory import InventoryPart, InventoryTransaction  # noqa: E402
from app.models.invoice import Invoice, InvoiceStatus, InvoiceType  # noqa: E402
from app.models.lease import LeasePaymentAuthorization  # noqa: E402
from app.models.user import User, UserRole, UserType  # noqa: E402
from app.utils import lease_service as svc  # noqa: E402

failures: list[str] = []


def ok(label: str, condition: bool, detail: str = "") -> None:
    print("{}  {}{}".format("PASS" if condition else "FAIL", label,
                            "  " + detail if detail else ""))
    if not condition:
        failures.append(label)


def raises(fn, status: int) -> bool:
    try:
        fn()
    except svc.LeaseError as exc:
        return exc.status_code == status
    return False


# Card references are encrypted at rest and refuse to store without a key,
# so the test supplies one, as the payment security tests do.
from cryptography.fernet import Fernet  # noqa: E402
from app.core.config import settings  # noqa: E402
settings.PAYMENT_DATA_ENCRYPTION_KEYS = Fernet.generate_key().decode()

# Email is a side effect, not under test here; record instead of sending.
sent_mail: list[tuple[str, str]] = []
svc.send_html_email = lambda to, subject, html, text, message_id=None: sent_mail.append((to[0], subject)) or True

engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
Base.metadata.create_all(engine)
Session = sessionmaker(bind=engine)

FIRST_DUE = date.today() + timedelta(days=30)


def fresh():
    for table in reversed(Base.metadata.sorted_tables):
        with engine.begin() as conn:
            conn.exec_driver_sql("DELETE FROM {}".format(table.name))
    sent_mail.clear()
    db = Session()
    staff = User(username="sales", email="sales@medrad.test", full_name="Sales Lead",
                 hashed_password="x", user_type=UserType.EMPLOYEE, role=UserRole.ADMIN, is_active=True)
    part = InventoryPart(part_number="MON-500", part_type="sales", description="Patient monitor",
                         unit_price=D("10000"), condition="new", quantity_on_hand=3,
                         reorder_level=0, status="active")
    db.add_all([staff, part])
    db.commit()
    return db, staff, part


def lease_input(part_id, **over):
    base = dict(customer_name="St. Mary Clinic", customer_email="billing@stmary.test",
                part_id=part_id, quantity=1, markup_percent=D("15"), down_payment=D("1000"),
                installment_count=12, frequency="monthly", first_due_date=FIRST_DUE,
                grace_days=5, late_fee_amount=D("25"), default_after_missed=3, invoice_lead_days=7)
    base.update(over)
    return svc.LeaseInput(**base)


def pay(db, invoice, amount=None):
    """Settle an invoice the way any payment route in the system does."""
    amount = D(str(invoice.total_amount)) if amount is None else D(str(amount))
    invoice.amount_paid = D(str(invoice.amount_paid or 0)) + amount
    invoice.balance_due = max(D(str(invoice.total_amount)) - D(str(invoice.amount_paid)), D("0"))
    invoice.status = InvoiceStatus.PAID if invoice.balance_due <= 0 else InvoiceStatus.PARTIALLY_PAID
    db.flush()


def signed_active(db, staff, part, **over):
    agreement = svc.create_agreement(db, lease_input(part.id, **over), staff)
    svc.send_agreement(db, agreement, staff)
    svc.sign_agreement(db, agreement, signed_by_name="Dr. Jane Roe", revision=agreement.revision,
                       ip_address="10.0.0.1", user_agent="test")
    if agreement.down_payment_invoice:
        pay(db, agreement.down_payment_invoice)
    svc.reconcile(db, agreement)
    db.commit()
    return agreement


print("Lease lifecycle")
print("=" * 72)

print()
print("Drafting")
print("-" * 72)
db, staff, part = fresh()
a = svc.create_agreement(db, lease_input(part.id), staff)
db.commit()
ok("a draft gets a number", a.agreement_number == "LTO-000001", a.agreement_number)
ok("  and starts as a draft", a.status == "draft")
ok("its figures come from the math module",
   a.total_of_payments == D("12448.78") and a.regular_installment == D("947.19"),
   "{} {}".format(a.total_of_payments, a.regular_installment))
ok("the schedule is stored, 12 rows", len(a.installments) == 12)
ok("  each scheduled, none invoiced", all(i.status == "scheduled" and not i.invoice_id for i in a.installments))
ok("the item is snapshotted", a.item_part_number == "MON-500" and a.item_description == "Patient monitor")
ok("the offered terms are kept as evidence", len(a.terms_snapshot["installments"]) == 12)
ok("drafting takes no stock", db.get(InventoryPart, part.id).quantity_on_hand == 3)

ok("more than is in stock is refused", raises(
    lambda: svc.create_agreement(db, lease_input(part.id, quantity=4), staff), 409))
service_part = InventoryPart(part_number="SVC-1", part_type="service", description="Labour",
                             unit_price=D("100"), condition="new", quantity_on_hand=99, status="active")
db.add(service_part)
db.commit()
ok("a part Sales would not sell cannot be leased", raises(
    lambda: svc.create_agreement(db, lease_input(service_part.id), staff), 404))
ok("terms that cannot be offered are a 422", raises(
    lambda: svc.create_agreement(db, lease_input(part.id, down_payment=D("20000")), staff), 422))
ok("a missing email is a 422", raises(
    lambda: svc.create_agreement(db, lease_input(part.id, customer_email="nope"), staff), 422))

svc.update_draft(db, a, lease_input(part.id, installment_count=6), staff)
db.commit()
ok("a draft can be re-priced", len(a.installments) == 6 and a.installment_count == 6)
ok("  which moves the revision on", a.revision == 2, str(a.revision))

print()
print("Sending and signing")
print("-" * 72)
token = svc.send_agreement(db, a, staff)
db.commit()
ok("sending issues a link", bool(token) and a.status == "sent")
ok("  and emails the customer", sent_mail and sent_mail[-1][0] == "billing@stmary.test")
ok("  only the hash of the link is stored", a.access_token_hash and token not in (a.access_token_hash or ""))
ok("the link finds the agreement", svc.find_by_token(db, token).id == a.id)
ok("a wrong link is a 404", raises(lambda: svc.find_by_token(db, "not-a-real-token"), 404))
ok("a sent agreement can no longer be edited", raises(
    lambda: svc.update_draft(db, a, lease_input(part.id), staff), 409))

ok("signing against terms the customer was not shown is refused", raises(
    lambda: svc.sign_agreement(db, a, signed_by_name="Dr. Jane Roe", revision=1,
                               ip_address=None, user_agent=None), 409))
ok("a blank signature is refused", raises(
    lambda: svc.sign_agreement(db, a, signed_by_name=" ", revision=a.revision,
                               ip_address=None, user_agent=None), 422))

svc.sign_agreement(db, a, signed_by_name="Dr. Jane Roe", revision=a.revision,
                   ip_address="10.0.0.1", user_agent="Mozilla/5.0")
db.commit()
ok("signing takes the unit out of stock", db.get(InventoryPart, part.id).quantity_on_hand == 2)
moves = db.query(InventoryTransaction).filter_by(part_id=part.id).all()
ok("  with an inventory transaction saying why",
   len(moves) == 1 and moves[0].transaction_type == "lease_to_own"
   and moves[0].authorization_reference == a.agreement_number)
evidence = db.query(LeasePaymentAuthorization).filter_by(agreement_id=a.id, event_type="signed").one()
ok("the exact wording signed against is kept", "Total of payments" in evidence.consent_text
   and a.agreement_number in evidence.consent_text)
ok("  with who, from where", evidence.accepted_by_name == "Dr. Jane Roe" and evidence.ip_address == "10.0.0.1")
ok("a down payment invoice is raised", a.down_payment_invoice is not None)
dp = a.down_payment_invoice
ok("  as an ordinary Sales invoice", dp.invoice_type == InvoiceType.SALES)
ok("  numbered as a lease invoice", dp.invoice_number.startswith("INV-LEASE-"), dp.invoice_number)
ok("  for the down payment plus its tax", dp.total_amount == D("1082.50"), str(dp.total_amount))
ok("not yet in force until the down payment clears", a.status == "sent" and svc.stage(a) == "awaiting_down_payment")
ok("signing twice is refused", raises(
    lambda: svc.sign_agreement(db, a, signed_by_name="Dr. Jane Roe", revision=a.revision,
                               ip_address=None, user_agent=None), 409))

pay(db, dp)
events = svc.reconcile(db, a)
db.commit()
ok("paying the down payment, from anywhere, puts it in force", a.status == "active", str(events))

db2, staff2, part2 = fresh()
nod = svc.create_agreement(db2, lease_input(part2.id, down_payment=D("0")), staff2)
svc.send_agreement(db2, nod, staff2)
svc.sign_agreement(db2, nod, signed_by_name="Dr. Jane Roe", revision=nod.revision,
                   ip_address=None, user_agent=None)
db2.commit()
ok("with no down payment it is in force on signature", nod.status == "active" and nod.down_payment_invoice_id is None)
db2.close()

print()
print("Raising installment invoices")
print("-" * 72)
early = FIRST_DUE - timedelta(days=8)
ok("nothing is raised before the lead time", svc.generate_due_invoices(db, a, early) == [])
on_time = FIRST_DUE - timedelta(days=7)
raised = svc.generate_due_invoices(db, a, on_time)
db.commit()
ok("installment 1 is raised seven days before it is due", len(raised) == 1, str(len(raised)))
first = a.installments[0]
ok("  linked to its installment", first.invoice_id == raised[0].id and first.status == "invoiced")
ok("  for the installment amount with tax", raised[0].total_amount == first.total, str(raised[0].total_amount))
ok("  due on the installment's due date", raised[0].due_date == FIRST_DUE)
ok("running it again raises nothing more", svc.generate_due_invoices(db, a, on_time) == [])
ok("  and there is still exactly one invoice for installment 1",
   db.query(Invoice).filter(Invoice.notes.like("%installment 1 of%")).count() == 1)

pay(db, raised[0])
svc.reconcile(db, a)
db.commit()
ok("paying it marks the installment paid", first.status == "paid" and first.paid_at is not None)

print()
print("Late fees and default")
print("-" * 72)
db, staff, part = fresh()
a = signed_active(db, staff, part)
for k in range(3):
    svc.generate_due_invoices(db, a, a.installments[k].due_date)
db.commit()
due1 = a.installments[0].due_date
ok("no late fee inside the grace period",
   svc.assess_late_fees(db, a, due1 + timedelta(days=5)) == [])
fees = svc.assess_late_fees(db, a, due1 + timedelta(days=6))
db.commit()
ok("a late fee once grace runs out", len(fees) == 1, str(len(fees)))
ok("  for the agreed amount, untaxed", fees[0].total_amount == D("25.00") and fees[0].tax_amount == D("0.00"))
ok("never twice for the same installment",
   svc.assess_late_fees(db, a, due1 + timedelta(days=40)).__len__() <= 2
   and a.installments[0].late_fee_invoice_id == fees[0].id)

third_due = a.installments[2].due_date
svc.reconcile(db, a, today=third_due + timedelta(days=6))
db.commit()
ok("three missed at once puts it in default", a.status == "in_default", a.status)
ok("  staff are told", any("default" in (getattr(n, "title", "") or "").lower()
                           for n in db.query(app.models.Notification).all()))
for k in range(3):
    pay(db, a.installments[k].invoice)
svc.reconcile(db, a, today=third_due + timedelta(days=6))
db.commit()
ok("catching up lifts the default", a.status == "active", a.status)

print()
print("Early buyout")
print("-" * 72)
db, staff, part = fresh()
a = signed_active(db, staff, part)
for k in range(4):
    svc.generate_due_invoices(db, a, a.installments[k].due_date)
    pay(db, a.installments[k].invoice)
svc.reconcile(db, a)
db.commit()
quote = svc.quote_buyout(a)
ok("after four payments the buyout is 6,495.00", quote.total == D("6495.00"), str(quote.total))
buy = svc.start_buyout(db, a, staff)
db.commit()
ok("starting it raises one invoice for that amount", buy.total_amount == D("6495.00"), str(buy.total_amount))
ok("  and the stage says so", svc.stage(a) == "buyout_pending")
ok("scheduled collection pauses while it is open",
   svc.generate_due_invoices(db, a, a.installments[6].due_date) == [])
ok("asking twice returns the same invoice", svc.start_buyout(db, a, staff).id == buy.id)
pay(db, buy)
events = svc.reconcile(db, a)
db.commit()
ok("paying it completes the agreement", a.status == "completed" and a.completion_method == "buyout", str(events))
ok("  the unpaid installments are settled, not left owing",
   all(i.status in ("paid", "cancelled") for i in a.installments))
ok("  nothing was overpaid", a.overpayment_amount == D("0"))
ok("  the customer is told they own it", any("now own" in s for _, s in sent_mail))

db, staff, part = fresh()
a = signed_active(db, staff, part)
svc.generate_due_invoices(db, a, a.installments[0].due_date)
db.commit()
buy = svc.start_buyout(db, a, staff)
db.commit()
pay(db, a.installments[0].invoice)       # paid by the customer while the buyout was open
svc.reconcile(db, a)
pay(db, buy)
svc.reconcile(db, a)
db.commit()
ok("an installment paid during an open buyout is flagged as overpaid",
   a.overpayment_amount == D("947.19"), str(a.overpayment_amount))

db, staff, part = fresh()
a = signed_active(db, staff, part)
svc.start_buyout(db, a, staff)
db.commit()
svc.cancel_buyout(db, a, staff)
db.commit()
ok("a buyout can be withdrawn", a.buyout_invoice_id is None and svc.stage(a) == "active")
ok("  and collection resumes",
   len(svc.generate_due_invoices(db, a, a.installments[0].due_date)) == 1)

print()
print("Completing on schedule")
print("-" * 72)
db, staff, part = fresh()
a = signed_active(db, staff, part, installment_count=3)
for k in range(3):
    svc.generate_due_invoices(db, a, a.installments[k].due_date)
    pay(db, a.installments[k].invoice)
events = svc.reconcile(db, a)
db.commit()
ok("the last payment completes it", a.status == "completed" and a.completion_method == "schedule", str(events))
ok("  and automatic charging stops", a.auto_charge is False)

print()
print("Cancelling")
print("-" * 72)
db, staff, part = fresh()
a = signed_active(db, staff, part)
svc.generate_due_invoices(db, a, a.installments[0].due_date)
db.commit()
open_invoice = a.installments[0].invoice
ok("cancelling needs a reason", raises(
    lambda: svc.cancel_agreement(db, a, reason="", return_stock=True, actor=staff), 422))
svc.cancel_agreement(db, a, reason="Customer withdrew", return_stock=True, actor=staff)
db.commit()
ok("it is cancelled", a.status == "cancelled")
ok("  the open invoice is cancelled with it", open_invoice.status == InvoiceStatus.CANCELLED)
ok("  the paid down payment is left alone for staff to refund",
   a.down_payment_invoice.status == InvoiceStatus.PAID)
ok("  the unit goes back into stock", db.get(InventoryPart, part.id).quantity_on_hand == 3)
ok("  with a return transaction", db.query(InventoryTransaction).filter_by(
    part_id=part.id, transaction_type="lease_to_own_return").count() == 1)
ok("  and the customer's link stops working", a.access_token_hash is None)
ok("cancelling twice is refused", raises(
    lambda: svc.cancel_agreement(db, a, reason="again", return_stock=True, actor=staff), 409))

print()
print("Waived and stock-held edge cases")
print("-" * 72)
db, staff, part = fresh()
a = signed_active(db, staff, part)
svc.generate_due_invoices(db, a, a.installments[0].due_date)
a.installments[0].invoice.status = InvoiceStatus.CANCELLED   # cancelled in Billing by hand
svc.reconcile(db, a)
db.commit()
ok("an installment cancelled in Billing is treated as waived, not re-billed",
   a.installments[0].status == "cancelled")
ok("  and it is recorded", any(h["action"] == "installment_waived" for h in a.history))

db, staff, part = fresh()
from app.models.sales import SalesInventoryReservation, SalesQuotation  # noqa: E402
quote_row = SalesQuotation(quotation_number="SQ-1", work_order="SO-1", created_by_id=staff.id,
                           customer_name="Other", status="accepted", paid_status="unpaid")
db.add(quote_row)
db.flush()
held = Invoice(invoice_number="INV-SALES-1", invoice_type=InvoiceType.SALES, customer_name="Other",
               customer_email="o@x.test", subtotal=D("1"), total_amount=D("1"), balance_due=D("1"),
               issue_date=date.today(), due_date=date.today())
db.add(held)
db.flush()
db.add(SalesInventoryReservation(quotation_id=quote_row.id, invoice_id=held.id, part_id=part.id,
                                 quantity=3, status="active"))
db.commit()
ok("stock held by an accepted Sales quotation cannot be leased", raises(
    lambda: svc.create_agreement(db, lease_input(part.id), staff), 409))

print()
print("Saved cards")
print("-" * 72)
db, staff, part = fresh()
a = signed_active(db, staff, part)
replaced = svc.record_card(db, a, {"customer_id": "C1", "card_id": "CARD-1", "card_brand": "VISA",
                                   "last_4": "4242", "exp_month": 12, "exp_year": 2030},
                           authorize=True, accepted_by_name="Dr. Jane Roe", channel="public_link",
                           ip_address="10.0.0.1", user_agent="test")
db.commit()
ok("a saved card enables automatic charging", a.auto_charge and a.square_card_last4 == "4242")
ok("  nothing to clean up for a first card", replaced is None and not a.card_cleanup_pending)
auth = db.query(LeasePaymentAuthorization).filter_by(agreement_id=a.id, event_type="authorized").one()
ok("  the authorization wording is kept with the masked card",
   "4242" in auth.consent_text and auth.card_last4 == "4242")
replaced = svc.record_card(db, a, {"customer_id": "C1", "card_id": "CARD-2", "card_brand": "VISA",
                                   "last_4": "1111"}, authorize=True, accepted_by_name="Dr. Jane Roe",
                           channel="public_link", ip_address=None, user_agent=None)
db.commit()
ok("replacing a card queues the old one for removal at Square",
   replaced == "CARD-1" and a.card_cleanup_pending)
svc.revoke_auto_charge(db, a, accepted_by_name="Dr. Jane Roe", channel="public_link",
                       ip_address=None, user_agent=None)
db.commit()
ok("withdrawing stops automatic charging at once", a.auto_charge is False and a.square_card_id is None)
ok("  and records it", db.query(LeasePaymentAuthorization).filter_by(
    agreement_id=a.id, event_type="revoked").count() == 1)

print()
print("=" * 72)
if failures:
    print("{} failing: {}".format(len(failures), ", ".join(failures)))
    sys.exit(1)
print("All lease lifecycle checks passed.")
