"""Card payments through Square, with the card processing fee.

Every card payment charges the amount being paid plus 3.5%, in one Square
payment, and the fee becomes part of the invoice: a $300 invoice paid by card
charges $310.50, its card fee is $10.50 and its total $310.50, all paid. ACH, MBMTS ACH
and cheque add nothing. A card payment is never typed in.

Exactly once: a retry with the same key never charges again, a different
amount than the payer was shown is never charged, nothing is recorded unless
Square completes that exact amount, and an answer lost on the way blocks any
new charge until Square's webhook settles it, fee included.

    cd backend
    DATABASE_URL=sqlite:// venv312/Scripts/python.exe tests/test_card_processing_fee.py
"""
from __future__ import annotations

import base64
import hashlib
import hmac
import json
import logging
import os
import pathlib
import sys
from datetime import date, datetime
from decimal import Decimal as D

os.environ.setdefault("DATABASE_URL", "sqlite://")
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))
logging.disable(logging.CRITICAL)

from cryptography.fernet import Fernet  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from sqlalchemy import create_engine, event  # noqa: E402
from sqlalchemy.orm import sessionmaker  # noqa: E402
from sqlalchemy.pool import StaticPool  # noqa: E402

import app.models  # noqa: E402,F401
from app.api.v1.endpoints import billing, service_requests  # noqa: E402
from app.core.config import settings  # noqa: E402
from app.core.deps import get_current_user  # noqa: E402
from app.db.base import Base, get_db  # noqa: E402
from app.main import app  # noqa: E402
from app.models.equipment import Equipment  # noqa: E402
from app.models.facility import Facility  # noqa: E402
from app.models.invoice import Invoice, InvoiceStatus, InvoiceTransaction, InvoiceType, PaymentProof  # noqa: E402
from app.models.modality import Modality, ModalityCategory  # noqa: E402
from app.models.payment_operation import PaymentOperation  # noqa: E402
from app.models.rental import BillingFrequency, Rental  # noqa: E402
from app.models.service_request import (  # noqa: E402
    Priority,
    QuotationAuthorization,
    QuotationLedgerEntry,
    QuotationPayment,
    ServiceRequest,
    ServiceRequestQuotation,
)
from app.models.user import User, UserRole, UserType  # noqa: E402
from app.utils import read_cache, rental_billing  # noqa: E402
from app.utils.card_fee import card_charge  # noqa: E402
from app.utils.square_payments import SquareRequestError, amount_to_minor_units  # noqa: E402

settings.PAYMENT_DATA_ENCRYPTION_KEYS = Fernet.generate_key().decode()
settings.SQUARE_ENVIRONMENT, settings.SQUARE_APPLICATION_ID = "sandbox", "sandbox-app"
settings.SQUARE_ACCESS_TOKEN, settings.SQUARE_LOCATION_ID, settings.SQUARE_CURRENCY = "server-token", "LOC", "USD"
settings.SQUARE_WEBHOOK_SIGNATURE_KEY = "webhook-signing-key"
settings.SQUARE_WEBHOOK_NOTIFICATION_URL = "https://medcodesolution.com/api/v1/webhooks/square"
settings.CARD_PROCESSING_FEE_PERCENT = "3.5"
read_cache.settings.READ_CACHE_ENABLED = False

failures: list[str] = []


def ok(label: str, condition: bool, detail: object = "") -> None:
    print("{}  {}{}".format("PASS" if condition else "FAIL", label, f"  {detail}" if not condition and detail != "" else ""))
    if not condition:
        failures.append(label)


# CARD_FEE_TEST_DB runs the same checks on a throwaway Postgres, as production uses.
if os.environ.get("CARD_FEE_TEST_DB"):
    engine = create_engine(os.environ["CARD_FEE_TEST_DB"])
    Base.metadata.drop_all(engine)
else:
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)

    @event.listens_for(engine, "connect")
    def _no_driver_transactions(dbapi_connection, _record):
        dbapi_connection.isolation_level = None

    @event.listens_for(engine, "begin")
    def _begin(connection):
        connection.exec_driver_sql("BEGIN")


def _buildable(table) -> bool:
    from sqlalchemy.schema import CreateTable
    try:
        CreateTable(table).compile(dialect=engine.dialect)
        return True
    except Exception:
        return False


Base.metadata.create_all(engine, tables=[t for t in Base.metadata.sorted_tables if _buildable(t)])
Session = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)

seed = Session()
clinic = Facility(name="Life Path", contact_person="C", phone="1", email="c@x.test", address="1 St", city="Waco",
                  state="TX", zip_code="76701", country="US")
other_clinic = Facility(name="Other Clinic", contact_person="C", phone="1", email="o@x.test", address="2 St",
                        city="Waco", state="TX", zip_code="76701", country="US")
seed.add_all([clinic, other_clinic])
seed.flush()


def person(username, role, facility=None):
    user = User(username=username, email=f"{username}@x.test", full_name=username.title(), hashed_password="x",
                user_type=UserType.CLIENT if role == UserRole.CLIENT else UserType.EMPLOYEE, role=role,
                is_active=True, facility_id=facility.id if facility else None)
    seed.add(user)
    return user


people = {
    "boss": person("boss", UserRole.SUPERADMIN),
    "admin": person("admin", UserRole.ADMIN),
    "facadmin": person("facadmin", UserRole.FACILITY_ADMIN, clinic),
    "outsider": person("outsider", UserRole.FACILITY_ADMIN, other_clinic),
}
seed.flush()
n = {"i": 0}


def invoice(kind=InvoiceType.SERVICE, total="300.00", paid="0", approved=True, status=InvoiceStatus.PENDING, facility=None, **extra) -> int:
    n["i"] += 1
    row = Invoice(invoice_number=f"INV-FEE-{n['i']:03d}", invoice_type=kind, customer_name="Life Path",
                  customer_email="lp@x.test", facility_id=(facility or clinic).id, subtotal=D(total), tax_amount=D("0"),
                  discount_amount=D("0"), total_amount=D(total), amount_paid=D(paid), balance_due=D(total) - D(paid),
                  status=status, issue_date=date.today(), due_date=date.today(),
                  billing_approval_status="approved" if approved else "pending", **extra)
    seed.add(row)
    seed.flush()
    return row.id


modality = Modality(name="Monitor", category=list(ModalityCategory)[0])
seed.add(modality)
seed.flush()
monitor = Equipment(asset_tag="A-1", make="Acme", model="M1", serial_number="SN-1", modality_id=modality.id, facility_id=clinic.id)
seed.add(monitor)
seed.flush()
request_row = ServiceRequest(request_number="SR-FEE-1", facility_id=clinic.id, equipment_id=monitor.id,
                             requester_id=people["facadmin"].id, problem_description="Broken", priority=Priority.MEDIUM)
seed.add(request_row)
seed.flush()


def quotation(number: str, amount="750.00") -> int:
    row = ServiceRequestQuotation(service_request_id=request_row.id, created_by_id=people["boss"].id,
                                  quotation_number=number, amount=D(amount), description="Repair", status="authorized")
    seed.add(row)
    seed.flush()
    seed.add(QuotationAuthorization(quotation_id=row.id, status="authorized", authorized_amount=D(amount)))
    return row.id


SERVICE = invoice()
PARTLY = invoice(total="500.00", paid="200.00", status=InvoiceStatus.PARTIALLY_PAID)
INSPECTION = invoice(InvoiceType.INSPECTION, total="1000.00")
FACILITY_OWN = invoice(total="100.00")
OTHER = invoice(facility=other_clinic)
UNAPPROVED = invoice(approved=False)
CANCELLED = invoice(status=InvoiceStatus.CANCELLED)
REVIEWING = invoice()
DECLINED = invoice(total="50.00")
LOST = invoice(total="200.00")
MOVED = invoice(total="300.00")
QUOTE = quotation("SQ-FEE-1")
QUOTE_LOST = quotation("SQ-FEE-2", amount="400.00")
seed.add(PaymentProof(invoice_id=REVIEWING, submitted_by_id=people["facadmin"].id, claimed_amount=D("300.00"),
                      payment_method="ach", status="pending_verification"))
rental = Rental(rental_number="RA-FEE-1", customer_name="Dr. Roe", customer_email="roe@x.test", customer_phone="555",
                customer_address="1 Main", secondary_recipients=[], billing_frequency=list(BillingFrequency)[0],
                security_deposit=0, start_date=date(2026, 11, 1), end_date=date(2027, 11, 1), history=[],
                facility_id=clinic.id, square_card_id="CARD-ON-FILE", square_customer_id="CUS-1",
                auto_charge=True, auto_charge_authorized_at=datetime(2026, 11, 1))
seed.add(rental)
seed.flush()
RENTAL_INV = invoice(InvoiceType.RENTAL, total="200.00", rental_id=rental.id)
seed.commit()
IDS = {name: user.id for name, user in people.items()}
RENTAL_ID = rental.id
seed.close()

current = {"who": "boss"}


def db_override():
    db = Session()
    try:
        yield db
    finally:
        db.close()


def user_override():
    db = Session()
    try:
        user = db.get(User, IDS[current["who"]])
        db.expunge(user)
        return user
    finally:
        db.close()


app.dependency_overrides[get_db] = db_override
app.dependency_overrides[get_current_user] = user_override
client = TestClient(app, raise_server_exceptions=False, base_url="http://localhost")
for module in (billing, service_requests):
    module.enforce_rate_limit = lambda **_: None


class FakeSquare:
    def __init__(self):
        self.charges: list[tuple[str, D]] = []
        self.answer = "ok"

    def pay(self, *, source_id, idempotency_key, amount, invoice_number, customer_email=None, customer_id=None):
        if self.answer == "decline":
            raise SquareRequestError("CARD_DECLINED", status_code=400)
        if self.answer == "lost":
            self.charges.append((idempotency_key, D(str(amount))))
            raise SquareRequestError("timeout", indeterminate=True)
        self.charges.append((idempotency_key, D(str(amount))))
        return {"id": f"SQ-{len(self.charges)}", "status": "COMPLETED", "reference_id": invoice_number,
                "amount_money": {"amount": amount_to_minor_units(amount), "currency": "USD"},
                "card_details": {"card": {"card_brand": "VISA", "last_4": "4242"}}}


square = FakeSquare()
billing.create_square_payment = square.pay
service_requests.create_square_payment = square.pay
rental_billing.create_square_payment = square.pay


def row(invoice_id) -> Invoice:
    db = Session()
    try:
        return db.get(Invoice, invoice_id)
    finally:
        db.close()


def ledger(invoice_id) -> list[str]:
    db = Session()
    try:
        return [t.transaction_type for t in db.query(InvoiceTransaction).filter(InvoiceTransaction.invoice_id == invoice_id).order_by(InvoiceTransaction.id)]
    finally:
        db.close()


def preview(invoice_id):
    return client.get(f"/api/v1/billing/invoices/{invoice_id}/card-payment")


def pay(invoice_id, key, charge_amount):
    return client.post(f"/api/v1/billing/invoices/{invoice_id}/square-payment",
                       json={"source_id": "cnon:card-ok", "idempotency_key": key, "charge_amount": str(charge_amount)})


print("The fee")
ok("$300 -> $10.50 fee, $310.50 charged", card_charge("300") == card_charge(D("300.00")) and card_charge("300").fee == D("10.50") and card_charge("300").total == D("310.50"))
ok("$200 -> $7.00 fee, $207.00 charged", card_charge("200").fee == D("7.00") and card_charge("200").total == D("207.00"))
ok("cents round half up: $100.50 -> $3.52 (3.5175)", card_charge("100.50").fee == D("3.52"))
ok("  and $125 -> $4.38 (4.375)", card_charge("125").fee == D("4.38"))

print("\nA Super Admin pays a service invoice by card")
current["who"] = "boss"
view = preview(SERVICE).json()
ok("the card window is told the balance, the fee and the total", (view["balance_due"], view["card_fee"], view["charge_amount"]) == ("300.00", "10.50", "310.50"), view)
ok("  with the fee's name", view["card_fee_label"] == "Card processing fee (3.5%)", view.get("card_fee_label"))
ok("  and its percentage", view["card_fee_percent"] == "3.5", view.get("card_fee_percent"))
ok("  and the secure card form's settings", view["square_payment"]["enabled"] is True and view["can_pay"] is True)
r = pay(SERVICE, "pay-service-0001-aaaa", "310.50")
inv = row(SERVICE)
ok("Square is charged $310.50, once", r.status_code == 200 and square.charges == [("pay-service-0001-aaaa", D("310.50"))], (r.status_code, r.text[:150], square.charges))
ok("  the invoice's total becomes $310.50, its fee $10.50", inv.total_amount == D("310.50") and inv.card_fee_amount == D("10.50"), (inv.total_amount, inv.card_fee_amount))
ok("  and it is paid in full", inv.status == InvoiceStatus.PAID and inv.amount_paid == D("310.50") and inv.balance_due == D("0"), (inv.status, inv.amount_paid, inv.balance_due))
ok("  by card through Square", inv.payment_method == "square_card")
ok("  the ledger shows the fee, then the payment", ledger(SERVICE)[-3:-1] == ["card_processing_fee", "payment"] or ledger(SERVICE)[-2:] == ["card_processing_fee", "payment"] or ("card_processing_fee" in ledger(SERVICE) and ledger(SERVICE).index("card_processing_fee") < ledger(SERVICE).index("payment")), ledger(SERVICE))
db = Session()
payment_row = db.query(InvoiceTransaction).filter(InvoiceTransaction.invoice_id == SERVICE, InvoiceTransaction.transaction_type == "payment").one()
operation = db.query(PaymentOperation).filter(PaymentOperation.invoice_id == SERVICE).one()
db.close()
ok("  the payment carries Square's id and the card", payment_row.reference_number == "SQ-1" and payment_row.card_last4 == "4242", (payment_row.reference_number, payment_row.card_last4))
ok("  the charge's record says what fee it carried", operation.status == "succeeded" and operation.response_data.get("card_fee") == "10.50", operation.response_data)
r = pay(SERVICE, "pay-service-0001-aaaa", "310.50")
ok("the same request again charges nothing", r.status_code == 200 and len(square.charges) == 1 and row(SERVICE).amount_paid == D("310.50"))
r = pay(SERVICE, "pay-service-0002-bbbb", "310.50")
ok("a new request on the paid invoice is refused, nothing charged", r.status_code == 409 and len(square.charges) == 1)

print("\nThe fee is on what is left to pay")
view = preview(PARTLY).json()
ok("$200 paid of $500: the card pays $300 + $10.50", (view["balance_due"], view["card_fee"], view["charge_amount"]) == ("300.00", "10.50", "310.50"), view)
r = pay(PARTLY, "pay-partly-0001-cccc", "310.50")
inv = row(PARTLY)
ok("  charged $310.50; the invoice is $510.50, all paid", r.status_code == 200 and square.charges[-1][1] == D("310.50") and inv.total_amount == D("510.50") and inv.amount_paid == D("510.50") and inv.status == InvoiceStatus.PAID, (inv.total_amount, inv.amount_paid))

print("\nAny invoice: an inspection invoice")
r = pay(INSPECTION, "pay-inspect-0001-dddd", "1035.00")
inv = row(INSPECTION)
ok("$1,000 charges $1,035.00 and is paid", r.status_code == 200 and inv.card_fee_amount == D("35.00") and inv.status == InvoiceStatus.PAID, (r.status_code, r.text[:100]))

print("\nThe amount the payer saw")
before = len(square.charges)
r = pay(MOVED, "pay-moved-0001-eeee", "300.00")
ok("a card payment for the balance without the fee is refused, nothing charged", r.status_code == 409 and "changed to $310.50" in r.text and len(square.charges) == before, r.text[:120])
ok("  and the invoice is untouched", row(MOVED).amount_paid == 0 and row(MOVED).card_fee_amount == 0)

print("\nA declined card")
square.answer = "decline"
r = pay(DECLINED, "pay-decline-0001-ffff", "51.75")
inv = row(DECLINED)
ok("records nothing: no fee, no payment", r.status_code == 400 and inv.amount_paid == 0 and inv.card_fee_amount == 0 and inv.total_amount == D("50.00"), (r.status_code, inv.total_amount))
square.answer = "ok"
r = pay(DECLINED, "pay-decline-0002-gggg", "51.75")
ok("  another card then pays it", r.status_code == 200 and row(DECLINED).status == InvoiceStatus.PAID and row(DECLINED).total_amount == D("51.75"))

print("\nAn answer lost on the way")
square.answer = "lost"
r = pay(LOST, "pay-lost-0001-hhhh", "207.00")
inv = row(LOST)
ok("records nothing yet", r.status_code >= 400 and inv.amount_paid == 0 and inv.card_fee_amount == 0, (r.status_code, inv.amount_paid))
square.answer = "ok"
before = len(square.charges)
r = pay(LOST, "pay-lost-0002-iiii", "207.00")
ok("  and no new charge can be made until it is settled", r.status_code == 409 and len(square.charges) == before, (r.status_code, r.text[:100]))
r = pay(LOST, "pay-lost-0001-hhhh", "207.00")
ok("  nor the same one sent again", r.status_code == 409 and len(square.charges) == before, (r.status_code, r.text[:100]))


def signed(body: bytes) -> str:
    return base64.b64encode(hmac.new(settings.SQUARE_WEBHOOK_SIGNATURE_KEY.encode(),
                                     settings.SQUARE_WEBHOOK_NOTIFICATION_URL.encode() + body, hashlib.sha256).digest()).decode()


def webhook(event_id, reference, cents, payment_id):
    body = json.dumps({"event_id": event_id, "type": "payment.updated", "data": {"object": {"payment": {
        "id": payment_id, "status": "COMPLETED", "reference_id": reference,
        "amount_money": {"amount": cents, "currency": "USD"},
        "card_details": {"card": {"card_brand": "VISA", "last_4": "4242"}}}}}}).encode()
    return client.post("/api/v1/webhooks/square", content=body,
                       headers={"content-type": "application/json", "x-square-hmacsha256-signature": signed(body)})


r = webhook("ev-lost-1", row(LOST).invoice_number, 20700, "SQ-LOST")
inv = row(LOST)
ok("Square's webhook settles it: $207.00 recorded, the $7.00 fee on the invoice", r.status_code == 200 and inv.status == InvoiceStatus.PAID and inv.card_fee_amount == D("7.00") and inv.total_amount == D("207.00") and inv.amount_paid == D("207.00"), (r.text, inv.total_amount, inv.card_fee_amount, inv.amount_paid))
r = webhook("ev-lost-2", row(LOST).invoice_number, 20700, "SQ-LOST")
inv = row(LOST)
ok("  the same payment delivered again changes nothing", inv.amount_paid == D("207.00") and inv.card_fee_amount == D("7.00") and ledger(LOST).count("card_processing_fee") == 1)

print("\nWho may pay by card, and when not")
current["who"] = "admin"
ok("an Admin cannot (only a Super Admin or the facility)", preview(SERVICE).status_code == 403 and pay(MOVED, "pay-admin-0001-jjjj", "310.50").status_code == 403)
current["who"] = "outsider"
ok("another facility's user cannot", pay(SERVICE, "pay-outsider-001-kkkk", "310.50").status_code == 403)
ok("  nor see the invoice by sending someone else's completed payment again", pay(SERVICE, "pay-service-0001-aaaa", "310.50").status_code == 403)
current["who"] = "facadmin"
r = pay(FACILITY_OWN, "pay-facility-001-llll", "103.50")
inv = row(FACILITY_OWN)
ok("a facility's own billing user pays their invoice by card: charged at once, no claim to verify", r.status_code == 200 and inv.status == InvoiceStatus.PAID and inv.card_fee_amount == D("3.50"), (r.status_code, r.text[:120]))
current["who"] = "boss"
ok("an invoice not approved for billing cannot be paid", preview(UNAPPROVED).status_code == 409)
ok("nor a cancelled one", preview(CANCELLED).status_code == 409)
ok("nor one with a payment waiting for review", preview(REVIEWING).status_code == 409 and "waiting for review" in preview(REVIEWING).text)
ok("nor a paid one", preview(SERVICE).status_code == 409)
r = client.post(f"/api/v1/billing/invoices/{MOVED}/payments", json={"amount": "300", "payment_method": "credit_card", "card_last4": "4242"})
ok("a card payment can no longer be typed in", r.status_code == 409 and row(MOVED).amount_paid == 0)

print("\nA service quotation paid by card")
current["who"] = "facadmin"
view = client.get(f"/api/v1/service-requests/quotations/{QUOTE}/card-payment").json()
ok("$750 -> $26.25 fee, $776.25 charged", (view["balance_due"], view["card_fee"], view["charge_amount"]) == ("750.00", "26.25", "776.25"), view)
r = client.post(f"/api/v1/service-requests/quotations/{QUOTE}/square-payment",
                json={"source_id": "cnon:card-ok", "idempotency_key": "pay-quote-0001-mmmm", "charge_amount": "776.25"})
db = Session()
payments = [(p.amount, p.card_fee_amount, p.payment_method) for p in db.query(QuotationPayment).filter(QuotationPayment.quotation_id == QUOTE)]
quote_row = db.get(ServiceRequestQuotation, QUOTE)
charged_entries = db.query(QuotationLedgerEntry).filter(QuotationLedgerEntry.quotation_id == QUOTE, QuotationLedgerEntry.event_type == "card_charged").all()
db.close()
ok("Square is charged $776.25", r.status_code == 200 and square.charges[-1] == ("pay-quote-0001-mmmm", D("776.25")), (r.status_code, r.text[:150]))
ok("  the quotation is paid its $750, with the $26.25 fee on the payment", payments == [(D("750.00"), D("26.25"), "credit_card")], payments)
ok("  and is paid", quote_row.status == "paid")
ok("  its ledger records the charge with Square's id", len(charged_entries) == 1 and charged_entries[0].amount == D("776.25"))
before = len(square.charges)
r = client.post(f"/api/v1/service-requests/quotations/{QUOTE}/square-payment",
                json={"source_id": "cnon:card-ok", "idempotency_key": "pay-quote-0001-mmmm", "charge_amount": "776.25"})
ok("  the same request again charges nothing", len(square.charges) == before and r.status_code == 200)
r = client.post(f"/api/v1/service-requests/quotations/{QUOTE_LOST}/payments", json={"amount": "400", "payment_method": "credit_card"})
ok("a quotation card payment can no longer be typed in", r.status_code == 409)

square.answer = "lost"
r = client.post(f"/api/v1/service-requests/quotations/{QUOTE_LOST}/square-payment",
                json={"source_id": "cnon:card-ok", "idempotency_key": "pay-quote-lost-001", "charge_amount": "414.00"})
square.answer = "ok"
r = webhook("ev-quote-lost", "SQ-FEE-2", 41400, "SQ-QUOTE-LOST")
db = Session()
payments = [(p.amount, p.card_fee_amount) for p in db.query(QuotationPayment).filter(QuotationPayment.quotation_id == QUOTE_LOST)]
db.close()
ok("a quotation charge whose answer was lost is settled by the webhook, fee included", payments == [(D("400.00"), D("14.00"))], (r.text, payments))
webhook("ev-quote-lost-2", "SQ-FEE-2", 41400, "SQ-QUOTE-LOST")
db = Session()
count = db.query(QuotationPayment).filter(QuotationPayment.quotation_id == QUOTE_LOST).count()
db.close()
ok("  and delivered again, recorded once", count == 1)

print("\nA rental's automatic charge to the card on file")
db = Session()
rental_row = db.get(Rental, RENTAL_ID)
rental_invoice = db.get(Invoice, RENTAL_INV)
result = rental_billing._try_auto_charge(db, rental_row, rental_invoice)
db.commit()
db.close()
inv = row(RENTAL_INV)
ok("$200 charges $207.00 to the card on file", result == "charged" and square.charges[-1][1] == D("207.00"), (result, square.charges[-1]))
ok("  the invoice carries the $7.00 fee and is paid", inv.card_fee_amount == D("7.00") and inv.total_amount == D("207.00") and inv.status == InvoiceStatus.PAID, (inv.card_fee_amount, inv.total_amount, inv.status))

print()
if failures:
    print(f"{len(failures)} FAILED: {failures}")
    sys.exit(1)
print("ALL PASSED")
