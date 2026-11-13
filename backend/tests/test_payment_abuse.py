"""Payments, attacked: what a dishonest user tries, over real HTTP.

Every check here is an abuse attempt sent through the full application, as a
browser or a script would send it -- routing, login guards, module and
facility permissions, request validation, the payment code and the database.
Each one asserts the secure outcome: the attempt is refused, no money is
recorded that Square did not move, and nothing a customer may not see leaks.

    * customers recording their own payment, with no money moving
    * staff card recording: card data, amounts, methods, invoice state, replay
    * the rental card portal: links, other people's invoices, tampered or
      mismatched Square results, declines, replays
    * the sales card portal: test payments, links, mismatched Square results
    * Square webhooks: unsigned, forged, tampered, replayed, overpaying,
      wrong currency

Square itself is replaced by a fake that records every charge, so "no money
moved" is checked directly.

    DATABASE_URL=sqlite:// python backend/tests/test_payment_abuse.py
"""
from __future__ import annotations

import base64
import hashlib
import hmac
import json
import os
import pathlib
import sys
from datetime import date, datetime, timedelta
from decimal import Decimal as D

os.environ.setdefault("DATABASE_URL", "sqlite://")
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))

from cryptography.fernet import Fernet  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from sqlalchemy import create_engine, event  # noqa: E402
from sqlalchemy.orm import sessionmaker  # noqa: E402
from sqlalchemy.pool import StaticPool  # noqa: E402

import app.models  # noqa: E402,F401
from app.api.v1.endpoints import billing, rental_portal, sales_portal, service_requests  # noqa: E402
from app.core.config import settings  # noqa: E402
from app.core.deps import get_current_user  # noqa: E402
from app.db.base import Base, get_db  # noqa: E402
from app.main import app  # noqa: E402
from app.models.equipment import Equipment  # noqa: E402
from app.models.facility import Facility  # noqa: E402
from app.models.modality import Modality, ModalityCategory  # noqa: E402
from app.models.invoice import Invoice, InvoiceStatus, InvoiceTransaction, InvoiceType, PaymentProof  # noqa: E402
from app.utils.payment_proofs import new_card_claim  # noqa: E402
from app.models.payment_operation import PaymentOperation  # noqa: E402
from app.models.rental import BillingFrequency, Rental, RentalAgreementAcceptance  # noqa: E402
from app.models.sales import SalesQuotation, SalesQuotationAcceptance, SalesQuotationRecipient  # noqa: E402
from app.models.service_request import (  # noqa: E402
    Priority, QuotationAuthorization, QuotationPayment, ServiceRequest, ServiceRequestQuotation,
)
from app.models.user import User, UserRole, UserType  # noqa: E402
from app.utils import read_cache  # noqa: E402
from app.utils.square_payments import SquareRequestError, amount_to_minor_units  # noqa: E402

settings.PAYMENT_DATA_ENCRYPTION_KEYS = Fernet.generate_key().decode()
settings.SQUARE_ENVIRONMENT, settings.SQUARE_APPLICATION_ID = "sandbox", "sandbox-app"
settings.SQUARE_ACCESS_TOKEN, settings.SQUARE_LOCATION_ID, settings.SQUARE_CURRENCY = "server-token", "LOC", "USD"
settings.SQUARE_WEBHOOK_SIGNATURE_KEY = "webhook-signing-key"
settings.SQUARE_WEBHOOK_NOTIFICATION_URL = "https://medcodesolution.com/api/v1/webhooks/square"
settings.ENABLE_TEST_PAYMENTS = False
read_cache.settings.READ_CACHE_ENABLED = False

failures: list[str] = []


def ok(label: str, condition: bool, detail: str = "") -> None:
    print("{}  {}{}".format("PASS" if condition else "FAIL", label, "  " + detail if detail else ""))
    if not condition:
        failures.append(label)


def section(title: str) -> None:
    print()
    print(title)


engine = create_engine(os.environ.get("PAYMENT_ABUSE_TEST_DB", "sqlite://"),
                       **({"connect_args": {"check_same_thread": False}, "poolclass": StaticPool}
                          if "PAYMENT_ABUSE_TEST_DB" not in os.environ else {}))
if engine.dialect.name == "sqlite":
    # SQLAlchemy's recipe for real transactions on SQLite: without it the
    # driver lets a SAVEPOINT outlive the rollback of a refused request, which
    # PostgreSQL never does.
    @event.listens_for(engine, "connect")
    def _no_driver_transactions(dbapi_connection, _record):
        dbapi_connection.isolation_level = None

    @event.listens_for(engine, "begin")
    def _begin(connection):
        connection.exec_driver_sql("BEGIN")


def _sqlite_buildable(table) -> bool:
    from sqlalchemy.schema import CreateTable
    try:
        CreateTable(table).compile(dialect=engine.dialect)
        return True
    except Exception:
        return False


Base.metadata.create_all(engine, tables=[t for t in Base.metadata.sorted_tables if _sqlite_buildable(t)])
Session = sessionmaker(bind=engine)

# --- people, places and bills --------------------------------------------------------------------
seed = Session()
clinic_a = Facility(name="Clinic A", phone="555-0101", email="a@clinic.test", address="1 A St", city="Plano",
                    state="TX", zip_code="75024", country="US")
clinic_b = Facility(name="Clinic B", phone="555-0102", email="b@clinic.test", address="2 B St", city="Plano",
                    state="TX", zip_code="75024", country="US")
seed.add_all([clinic_a, clinic_b])
seed.flush()


def person(username, role, user_type=UserType.EMPLOYEE, facility=None):
    user = User(username=username, email=username + "@medrad.test", full_name=username.title(), hashed_password="x",
                user_type=user_type, role=role, is_active=True, facility_id=facility.id if facility else None)
    seed.add(user)
    return user


people = {
    "superadmin": person("superadmin", UserRole.SUPERADMIN),
    "employee": person("employee", UserRole.EMPLOYEE),
    "facility_admin": person("facadmin", UserRole.FACILITY_ADMIN, facility=clinic_a),
    "facility_manager": person("facmanager", UserRole.FACILITY_MANAGER, facility=clinic_a),
    "client": person("client", UserRole.CLIENT, UserType.CLIENT, facility=clinic_a),
    "other_facility": person("otherfac", UserRole.FACILITY_ADMIN, facility=clinic_b),
}
seed.flush()


def invoice(number, kind, total="500.00", facility=clinic_a, approved=True, status=InvoiceStatus.PENDING, **extra):
    row = Invoice(invoice_number=number, invoice_type=kind, customer_name="Clinic A", customer_email="a@clinic.test",
                  facility_id=facility.id, subtotal=D(total), tax_amount=D("0"), discount_amount=D("0"),
                  total_amount=D(total), amount_paid=D("0"), balance_due=D(total), status=status,
                  issue_date=date.today(), due_date=date.today(),
                  billing_approval_status="approved" if approved else "pending", **extra)
    seed.add(row)
    seed.flush()
    return row.id


INV = {kind: invoice("INV-{}-A".format(kind.value.upper()), kind) for kind in InvoiceType}
CUSTOMERS = ("facility_admin", "facility_manager", "client")
SELF_PAY_ROUTES = ("billing", "sales", "rentals", "inspections", "service-requests")
SELF = {(route, who, kind): invoice("INV-SELF-{}-{}-{}".format(route, who, kind.value), kind)
        for route in SELF_PAY_ROUTES for who in CUSTOMERS for kind in InvoiceType}
INV_UNAPPROVED = invoice("INV-SERVICE-UNAPPROVED", InvoiceType.SERVICE, approved=False)
INV_CANCELLED = invoice("INV-SERVICE-CANCELLED", InvoiceType.SERVICE, status=InvoiceStatus.CANCELLED)
INV_STAFF = invoice("INV-SERVICE-STAFF", InvoiceType.SERVICE)
INV_OTHER_CLINIC = invoice("INV-SERVICE-B", InvoiceType.SERVICE, facility=clinic_b)
INV_WEBHOOK = invoice("INV-WEBHOOK-1", InvoiceType.SERVICE, total="200.00")
INV_WEBHOOK_CANCELLED = invoice("INV-WEBHOOK-CANCELLED", InvoiceType.SERVICE, total="200.00",
                                status=InvoiceStatus.CANCELLED)

# A service request quotation, authorized and ready to be paid.
modality = Modality(name="Monitor", category=list(ModalityCategory)[0])
seed.add(modality)
seed.flush()
monitor = Equipment(asset_tag="A-1", make="Acme", model="M1", serial_number="SN-1", modality_id=modality.id,
                    facility_id=clinic_a.id)
seed.add(monitor)
seed.flush()
request_row = ServiceRequest(request_number="SR-ABUSE-1", facility_id=clinic_a.id, equipment_id=monitor.id,
                             requester_id=people["client"].id, problem_description="Broken", priority=Priority.MEDIUM)
seed.add(request_row)
seed.flush()
SERVICE_QUOTES = {}
for who in ("facility_admin", "facility_manager", "client"):
    service_quote = ServiceRequestQuotation(service_request_id=request_row.id, created_by_id=people["superadmin"].id,
                                            quotation_number="SQ-ABUSE-" + who, amount=D("750.00"),
                                            description="Repair", status="authorized")
    seed.add(service_quote)
    seed.flush()
    seed.add(QuotationAuthorization(quotation_id=service_quote.id, status="authorized", authorized_amount=D("750.00")))
    SERVICE_QUOTES[who] = service_quote.id

# A signed rental with its first invoice, opened by link.
RENTAL_TOKEN, OTHER_RENTAL_TOKEN, UNSIGNED_TOKEN, EXPIRED_TOKEN = "rent-link-1", "rent-link-2", "rent-link-3", "rent-link-4"


def rental(number, token, signed=True, expires=None):
    row = Rental(rental_number=number, customer_name="Dr. Jane Roe", customer_email="jane@clinic.test",
                 customer_phone="555-0100", customer_address="1 Main St, Plano, TX 75024", secondary_recipients=[],
                 billing_frequency=list(BillingFrequency)[0], security_deposit=0, start_date=date(2026, 11, 1),
                 end_date=date(2027, 11, 1), history=[], facility_id=clinic_a.id,
                 access_token_hash=hashlib.sha256(token.encode()).hexdigest(), token_expires_at=expires)
    seed.add(row)
    seed.flush()
    if signed:
        seed.add(RentalAgreementAcceptance(rental_id=row.id, accepted_by_name="Dr. Jane Roe", signature_name="Jane Roe",
                                           terms_accepted=True, agreement_revision=1, agreement_snapshot={},
                                           pricing_snapshot={}))
    return row.id


RENTAL = rental("RA-ABUSE-1", RENTAL_TOKEN)
OTHER_RENTAL = rental("RA-ABUSE-2", OTHER_RENTAL_TOKEN)
UNSIGNED_RENTAL = rental("RA-ABUSE-3", UNSIGNED_TOKEN, signed=False)
rental("RA-ABUSE-4", EXPIRED_TOKEN, expires=datetime.utcnow() - timedelta(days=1))
RENTAL_INV = invoice("INV-RENT-1", InvoiceType.RENTAL, total="300.00", rental_id=RENTAL)
OTHER_RENTAL_INV = invoice("INV-RENT-2", InvoiceType.RENTAL, total="300.00", rental_id=OTHER_RENTAL)
UNSIGNED_RENTAL_INV = invoice("INV-RENT-3", InvoiceType.RENTAL, total="300.00", rental_id=UNSIGNED_RENTAL)

# An accepted sales quotation with its invoice, opened by link.
SALES_TOKEN = "sales-link-1"
quote = SalesQuotation(quotation_number="SQ-SALES-1", work_order="SO-SALES-1", created_by_id=people["superadmin"].id,
                       customer_name="Clinic A", customer_email="a@clinic.test", status="accepted",
                       paid_status="unpaid", subtotal=D("125"), total_amount=D("125"), history=[])
seed.add(quote)
seed.flush()
recipient = SalesQuotationRecipient(quotation_id=quote.id, recipient_type="primary", name="Clinic A",
                                    email="a@clinic.test", status="accepted",
                                    access_token_hash=hashlib.sha256(SALES_TOKEN.encode()).hexdigest())
seed.add(recipient)
seed.flush()
seed.add(SalesQuotationAcceptance(quotation_id=quote.id, recipient_id=recipient.id, accepted_by_name="Clinic A",
                                  signature_name="Clinic A", terms_accepted=True, quotation_revision=1,
                                  selection_snapshot=[], pricing_snapshot={"total_amount": "125"}))
SALES_INV = invoice("INV-SALES-PORTAL", InvoiceType.SALES, total="125.00", sales_quotation_id=quote.id)
quote.converted_invoice_id = SALES_INV
seed.commit()
IDS = {name: user.id for name, user in people.items()}
seed.close()

# --- the application, with a fake Square -------------------------------------------------------
current = {"who": "superadmin"}


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

limited: list[str] = []
for module in (rental_portal, sales_portal, billing, service_requests):
    module.enforce_rate_limit = lambda *, bucket, identity, limit, window_seconds, **_: limited.append(bucket)


class FakeSquare:
    """Records every charge. `answer` decides what Square says next."""

    def __init__(self):
        self.charges: list[tuple[str, D]] = []
        self.answer = "ok"

    def pay(self, *, source_id, idempotency_key, amount, invoice_number, customer_email=None, customer_id=None):
        if self.answer == "decline":
            raise SquareRequestError("CARD_DECLINED", status_code=400)
        if self.answer == "lost":
            raise SquareRequestError("timeout", indeterminate=True)
        self.charges.append((idempotency_key, D(str(amount))))
        charged = D(str(amount)) - D("1.00") if self.answer == "short" else D(str(amount))
        currency = "EUR" if self.answer == "currency" else "USD"
        status = "PENDING" if self.answer == "pending" else "COMPLETED"
        return {"id": "PAY-{}".format(len(self.charges)), "status": status,
                "amount_money": {"amount": amount_to_minor_units(charged), "currency": currency},
                "card_details": {"card": {"card_brand": "VISA", "last_4": "4242"}}}

    def vault(self, **kwargs):
        return {"customer_id": "CUS-SECRET", "card_id": "CARD-SECRET", "brand": "VISA", "card_brand": "VISA",
                "last_4": "4242", "exp_month": 12, "exp_year": 2030}


square = FakeSquare()
for module in (rental_portal, sales_portal):
    module.create_square_payment = square.pay
rental_portal.create_square_card_on_file = square.vault


def money_on(invoice_id):
    db = Session()
    try:
        row = db.get(Invoice, invoice_id)
        return D(str(row.amount_paid or 0)), row.status
    finally:
        db.close()


def as_user(who):
    current["who"] = who


print("Payment abuse, end to end")
print("=" * 72)

# --- 1. customers recording their own payment ----------------------------------------------------
section("1. A customer cannot mark their own bill paid without money moving")


def queued_or_refused(r, target_paid):
    """The secure outcomes: refused, or held as a claim for staff to verify; never money recorded."""
    held = r.status_code == 202 and r.json().get("is_card_claim") and r.json().get("status") == "pending_verification"
    return (r.status_code in (403, 409) or held) and target_paid == 0


CLAIMS: dict[tuple[str, InvoiceType], int] = {}
for who in CUSTOMERS:
    as_user(who)
    for kind in InvoiceType:
        target = SELF[("billing", who, kind)]
        r = client.post("/api/v1/billing/invoices/{}/payments".format(target),
                        json={"amount": "500.00", "payment_method": "credit_card", "card_brand": "Visa",
                              "card_last4": "4242", "idempotency_key": "self-{}-{}".format(who, kind.value)})
        ok("{}: 'I paid by card' on a {} invoice through Billing records no money".format(who, kind.value),
           queued_or_refused(r, money_on(target)[0]), "{} {}".format(r.status_code, r.text[:90]))
        if r.status_code == 202:
            CLAIMS[(who, kind)] = r.json()["id"]

# The edit route of the module that owns each kind of invoice.
EDIT_ROUTES = {"sales": InvoiceType.SALES, "rentals": InvoiceType.RENTAL, "inspections": InvoiceType.INSPECTION,
               "service-requests": InvoiceType.SERVICE}
for route, kind in EDIT_ROUTES.items():
    for who in CUSTOMERS:
        as_user(who)
        target = SELF[(route, who, kind)]
        r = client.put("/api/v1/{}/invoices/{}".format(route, target),
                       json={"amount_paid": "500.00", "payment_method": "credit_card"})
        ok("{}: setting amount_paid on a {} invoice directly is refused".format(who, kind.value),
           r.status_code in (403, 409) and money_on(target)[0] == 0, "{} {}".format(r.status_code, r.text[:90]))

for who in CUSTOMERS:
    as_user(who)
    r = client.post("/api/v1/service-requests/quotations/{}/payments".format(SERVICE_QUOTES[who]),
                    json={"amount": "750.00", "payment_method": "credit_card", "account_last_four": "4242",
                          "idempotency_key": "self-quote-{}".format(who)})
    db = Session()
    recorded = db.query(QuotationPayment).filter(QuotationPayment.quotation_id == SERVICE_QUOTES[who]).count()
    db.close()
    ok("{}: 'I paid by card' on a service quotation records no money".format(who),
       queued_or_refused(r, recorded), "{} {}".format(r.status_code, r.text[:90]))
    if r.status_code == 202:
        CLAIMS[(who, "quote")] = r.json()["id"]

as_user("other_facility")
r = client.post("/api/v1/billing/invoices/{}/payments".format(INV[InvoiceType.SERVICE]),
                json={"amount": "1.00", "payment_method": "credit_card"})
ok("a user from another clinic cannot touch this clinic's invoice", r.status_code in (403, 404))

# --- 1b. a typed-in card payment, and claims made before card went through Square ---------------
section("1b. A typed-in card payment is refused; claims made before still get reviewed")
as_user("client")
target = SELF[("billing", "client", InvoiceType.SERVICE)]
claim_body = {"amount": "500.00", "payment_method": "credit_card", "card_brand": "Visa", "card_last4": "4242"}
r = client.post("/api/v1/billing/invoices/{}/payments".format(target), json=claim_body)
ok("a customer's typed-in card payment is refused: card goes through the secure card form",
   r.status_code == 409 and "secure card form" in r.text and money_on(target)[0] == 0, r.text[:120])
db = Session()
queued = db.query(PaymentProof).filter(PaymentProof.invoice_id == target).count()
db.close()
ok("  and nothing is queued for review", queued == 0, str(queued))
r = client.post("/api/v1/billing/invoices/{}/payments".format(target), json={**claim_body, "payment_method": "ach"})
ok("an ACH 'claim' still needs uploaded proof", r.status_code == 409)
r = client.post("/api/v1/billing/invoices/{}/payments".format(target), json={**claim_body, "payment_method": "cash"})
ok("a customer cannot record cash either", r.status_code == 409 and money_on(target)[0] == 0)

# Card claims customers made before this change may still be waiting in the
# review queue: they are reviewed exactly as before.
reject_target = SELF[("billing", "facility_admin", InvoiceType.SERVICE)]
db = Session()
legacy = new_card_claim(submitted_by_id=people["client"].id, amount=D("500.00"), notes=None,
                        card_brand="Visa", card_last4="4242", invoice_id=target)
legacy_reject = new_card_claim(submitted_by_id=people["facility_admin"].id, amount=D("500.00"), notes=None,
                               card_brand="Visa", card_last4="4242", invoice_id=reject_target)
legacy_quote = new_card_claim(submitted_by_id=people["client"].id, amount=D("750.00"), notes=None,
                              card_brand=None, card_last4="4242", service_quotation_id=SERVICE_QUOTES["client"])
db.add_all([legacy, legacy_reject, legacy_quote])
db.commit()
claim_id, reject_id, quote_claim = legacy.id, legacy_reject.id, legacy_quote.id
db.close()

r = client.post("/api/v1/billing/payment-proofs/{}/approve".format(claim_id), json={})
ok("a customer cannot approve their own claim", r.status_code == 403 and money_on(target)[0] == 0)
r = client.get("/api/v1/billing/payment-proofs/{}/file".format(claim_id))
ok("a claim has no document to download", r.status_code == 404)

as_user("superadmin")
queue = client.get("/api/v1/billing/payment-proofs", params={"status": "pending_verification"})
listed = {item["id"]: item for item in (queue.json() if queue.status_code == 200 else [])}
ok("staff see an earlier claim in the payment-proof review queue, with the card it named",
   claim_id in listed and listed[claim_id]["card_last4"] == "4242" and listed[claim_id]["file_url"] is None,
   "{} {}".format(queue.status_code, queue.text[:120]))
r = client.post("/api/v1/billing/payment-proofs/{}/approve".format(claim_id), json={"notes": "Found in Square"})
ok("approving it records the payment", r.status_code == 200 and money_on(target) == (D("500.00"), InvoiceStatus.PAID),
   r.text[:120])
db = Session()
card_rows = [(t.card_brand, t.card_last4) for t in db.query(InvoiceTransaction).filter(
    InvoiceTransaction.invoice_id == target, InvoiceTransaction.card_last4.isnot(None))]
db.close()
ok("  with the card's brand and last four on the ledger", card_rows == [("Visa", "4242")], str(card_rows))
r = client.post("/api/v1/billing/payment-proofs/{}/approve".format(claim_id), json={})
ok("approving it again records nothing more", r.status_code == 200 and money_on(target)[0] == D("500.00"))

r = client.post("/api/v1/billing/payment-proofs/{}/reject".format(reject_id), json={})
ok("rejecting needs a reason", r.status_code == 400)
r = client.post("/api/v1/billing/payment-proofs/{}/reject".format(reject_id), json={"notes": "Not found in Square"})
ok("a rejected claim records nothing", r.status_code == 200 and money_on(reject_target)[0] == 0)
r = client.post("/api/v1/billing/payment-proofs/{}/approve".format(reject_id), json={})
ok("  and can no longer be approved", r.status_code == 409 and money_on(reject_target)[0] == 0)

r = client.post("/api/v1/service-requests/payment-proofs/{}/approve".format(quote_claim), json={})
db = Session()
quote_payments = [(p.amount, p.account_last_four) for p in db.query(QuotationPayment)
                  .filter(QuotationPayment.quotation_id == SERVICE_QUOTES["client"])]
db.close()
ok("approving an earlier service-quotation claim records that payment once",
   r.status_code == 200 and quote_payments == [(D("750.00"), "4242")], "{} {}".format(r.status_code, quote_payments))

# --- 2. staff cannot type in a card payment ------------------------------------------------------
section("2. Staff cannot type in a card payment either")
as_user("employee")
r = client.post("/api/v1/billing/invoices/{}/payments".format(INV_STAFF), json={"amount": "10", "payment_method": "credit_card"})
ok("an employee without billing rights is refused", r.status_code == 403, str(r.status_code))

as_user("superadmin")
pay = lambda body, invoice_id=INV_STAFF: client.post("/api/v1/billing/invoices/{}/payments".format(invoice_id), json=body)  # noqa: E731
for method in ("credit_card", "Credit Card", "card", "square_card"):
    r = pay({"amount": "100", "payment_method": method, "card_brand": "Visa", "card_last4": "4242",
             "idempotency_key": "staff-card-{}".format(method.replace(" ", "-"))})
    ok("a Super Admin typing in '{}' is refused: card goes through Square".format(method),
       r.status_code == 409 and "secure card form" in r.text and money_on(INV_STAFF)[0] == 0, r.text[:90])
for amount in ("0", "-50", "-0.01"):
    r = pay({"amount": amount, "payment_method": "cash"})
    ok("an amount of {} is refused".format(amount), r.status_code in (400, 422) and money_on(INV_STAFF)[0] == 0)
r = pay({"amount": "500.01", "payment_method": "cash"})
ok("more than the balance is refused", r.status_code == 400 and money_on(INV_STAFF)[0] == 0)
for method in ("ach", "check", "cheque", "bank_transfer", "ACH", " Check "):
    r = pay({"amount": "100", "payment_method": method})
    ok("'{}' cannot be marked paid without proof and approval".format(method), r.status_code == 409)
r = pay({"amount": "100", "payment_method": "cash"}, INV_CANCELLED)
ok("a cancelled invoice cannot be paid", r.status_code == 409)
r = pay({"amount": "100", "payment_method": "cash"}, INV_UNAPPROVED)
ok("an invoice not yet approved for billing cannot be paid", r.status_code == 409)

r = pay({"amount": "100", "payment_method": "cash", "idempotency_key": "staff-pay-0001",
         "card_number": "4111111111111111", "cvv": "123"})
ok("a cash payment is recorded", r.status_code == 200 and money_on(INV_STAFF)[0] == D("100"), r.text[:120])
db = Session()
stored = json.dumps([[t.card_last4, t.card_brand, t.description] for t in db.query(InvoiceTransaction)
                     .filter(InvoiceTransaction.invoice_id == INV_STAFF)], default=str)
db.close()
ok("  and a card number or CVV sent alongside is never stored", "4111111111111111" not in stored and "123\"" not in stored, stored)
r = pay({"amount": "100", "payment_method": "cash", "idempotency_key": "staff-pay-0001"})
ok("replaying the same request records nothing twice", money_on(INV_STAFF)[0] == D("100"), str(money_on(INV_STAFF)))
r = pay({"amount": "400", "payment_method": "cash", "idempotency_key": "staff-pay-0001"})
ok("reusing its key for a different amount is refused", r.status_code == 409 and money_on(INV_STAFF)[0] == D("100"))

# --- 3. the rental card portal -------------------------------------------------------------------
section("3. The rental card portal")
rpay = lambda token, body: client.post("/api/v1/rentals/public/{}/pay-invoice".format(token), json=body)  # noqa: E731
card = {"source_id": "cnon:card-nonce-ok", "invoice_id": RENTAL_INV}
r = rpay("guessed-token", card)
ok("a guessed link is a 404", r.status_code == 404 and not square.charges)
r = rpay(EXPIRED_TOKEN, card)
ok("an expired link is refused", r.status_code == 410 and not square.charges)
r = rpay(UNSIGNED_TOKEN, {**card, "invoice_id": UNSIGNED_RENTAL_INV})
ok("an agreement not yet signed cannot be paid", r.status_code == 409 and not square.charges)
r = rpay(RENTAL_TOKEN, {**card, "invoice_id": OTHER_RENTAL_INV})
ok("another customer's invoice cannot be paid with this link", r.status_code == 404 and not square.charges)
r = rpay(RENTAL_TOKEN, {**card, "source_id": "x"})
ok("a junk card token is refused before Square is asked", r.status_code == 422 and not square.charges)

square.answer = "decline"
r = rpay(RENTAL_TOKEN, {**card, "idempotency_key": "rent-decline-01"})
ok("a declined card leaves the invoice unpaid", r.status_code == 400 and money_on(RENTAL_INV)[0] == 0, r.text[:100])
square.answer = "short"
r = rpay(RENTAL_TOKEN, {**card, "idempotency_key": "rent-short-0001"})
ok("Square charging less than the balance never marks the invoice paid",
   r.status_code == 409 and money_on(RENTAL_INV)[0] == 0, r.text[:100])
square.answer = "currency"
r = rpay(RENTAL_TOKEN, {**card, "idempotency_key": "rent-currency-1"})
ok("a charge in another currency never marks the invoice paid", r.status_code == 409 and money_on(RENTAL_INV)[0] == 0)
square.answer = "pending"
r = rpay(RENTAL_TOKEN, {**card, "idempotency_key": "rent-pending-01"})
ok("a charge Square has not completed never marks the invoice paid", r.status_code == 409 and money_on(RENTAL_INV)[0] == 0)

# Those uncertain outcomes are held for verification; clear them as reconciliation would.
db = Session()
for operation in db.query(PaymentOperation).filter(PaymentOperation.invoice_id == RENTAL_INV,
                                                   PaymentOperation.status.in_(["processing", "unknown"])):
    operation.status = "failed"
db.commit()
db.close()

square.answer, square.charges = "ok", []
r = rpay(RENTAL_TOKEN, {**card, "idempotency_key": "rent-good-00001", "amount": "0.01", "amount_paid": "300"})
ok("a payment charges the server's balance plus the 3% card fee, whatever amount the browser sends",
   r.status_code == 200 and square.charges == [("rent-good-00001", D("309.00"))], str(square.charges))
ok("  and the invoice is paid, the fee on it", money_on(RENTAL_INV) == (D("309.00"), InvoiceStatus.PAID))
r = rpay(RENTAL_TOKEN, {**card, "idempotency_key": "rent-good-00001"})
ok("replaying it charges nothing more", len(square.charges) == 1 and r.status_code == 200)
r = rpay(RENTAL_TOKEN, {**card, "idempotency_key": "rent-good-00002"})
ok("paying a paid invoice again charges nothing", len(square.charges) == 1 and r.status_code == 200)
r = rpay(RENTAL_TOKEN, {**card, "invoice_id": RENTAL_INV, "save_card": False, "authorize_auto_charge": True,
                        "idempotency_key": "rent-auth-00001"})
ok("automatic charging cannot be authorized without saving a card", r.status_code == 422)
ok("every portal payment attempt is rate limited", limited.count("rental-payment") >= 10, str(limited.count("rental-payment")))
view = client.get("/api/v1/rentals/public/{}".format(RENTAL_TOKEN)).text
ok("the portal never shows Square's secret card or customer ids", "CARD-SECRET" not in view and "CUS-SECRET" not in view)
ok("  nor the server's Square access token", "server-token" not in view)

# --- 4. the sales card portal --------------------------------------------------------------------
section("4. The sales card portal")
r = client.post("/api/v1/public/quotations/{}/test-payment".format(SALES_TOKEN),
                json={"payer_name": "Clinic A", "confirmation": True})
ok("a 'test payment' is refused while test payments are off", r.status_code == 403 and money_on(SALES_INV)[0] == 0)
spay = lambda token, key: client.post("/api/v1/public/quotations/{}/square-payment".format(token),  # noqa: E731
                                      json={"source_id": "cnon:card-nonce-ok", "idempotency_key": key, "payer_name": "Clinic A"})
r = spay("guessed-sales-token", "sales-key-guess-0001")
ok("a guessed sales link is a 404", r.status_code == 404)
square.charges = []
square.answer = "short"
r = spay(SALES_TOKEN, "sales-key-short-0001")
ok("Square charging less than the balance never marks a sales invoice paid",
   r.status_code >= 400 and money_on(SALES_INV)[0] == 0, "{} {}".format(r.status_code, r.text[:100]))
square.answer = "lost"
r = spay(SALES_TOKEN, "sales-key-lost-00001")
ok("a lost Square response leaves the invoice unpaid", r.status_code >= 400 and money_on(SALES_INV)[0] == 0)
square.answer = "ok"
r = spay(SALES_TOKEN, "sales-key-retry-0001")
ok("  and blocks a second charge until it is verified", r.status_code == 409 and money_on(SALES_INV)[0] == 0,
   "{} {}".format(r.status_code, r.text[:100]))

# --- 5. Square webhooks --------------------------------------------------------------------------
section("5. Square webhooks")


def signed(body: bytes, url=settings.SQUARE_WEBHOOK_NOTIFICATION_URL, key=settings.SQUARE_WEBHOOK_SIGNATURE_KEY):
    return base64.b64encode(hmac.new(key.encode(), url.encode() + body, hashlib.sha256).digest()).decode()


def event(event_id, invoice_number, cents, currency="USD", payment_id=None):
    return json.dumps({"event_id": event_id, "type": "payment.updated", "data": {"object": {"payment": {
        "id": payment_id or "SQPAY-" + event_id, "status": "COMPLETED", "reference_id": invoice_number,
        "amount_money": {"amount": cents, "currency": currency}}}}}).encode()


hook = lambda body, signature: client.post("/api/v1/webhooks/square", content=body,  # noqa: E731
                                           headers={"content-type": "application/json",
                                                    **({"x-square-hmacsha256-signature": signature} if signature else {})})
body = event("ev-1", "INV-WEBHOOK-1", 5000)
ok("an unsigned webhook is refused", hook(body, None).status_code == 403 and money_on(INV_WEBHOOK)[0] == 0)
ok("a webhook signed with a guessed key is refused", hook(body, signed(body, key="guess")).status_code == 403)
ok("a webhook signed for another URL is refused", hook(body, signed(body, url="https://evil.test/hook")).status_code == 403)
tampered = event("ev-1", "INV-WEBHOOK-1", 20000)
ok("a signed webhook whose amount was changed is refused", hook(tampered, signed(body)).status_code == 403
   and money_on(INV_WEBHOOK)[0] == 0)
r = hook(body, signed(body))
ok("a genuine signed webhook is applied", r.status_code == 200 and money_on(INV_WEBHOOK)[0] == D("50.00"), r.text)
ok("  replaying it changes nothing", hook(body, signed(body)).status_code == 200 and money_on(INV_WEBHOOK)[0] == D("50.00"))
again = event("ev-1b", "INV-WEBHOOK-1", 5000, payment_id="SQPAY-ev-1")
ok("  the same Square payment under a new event id changes nothing",
   hook(again, signed(again)).status_code == 200 and money_on(INV_WEBHOOK)[0] == D("50.00"))
euro = event("ev-2", "INV-WEBHOOK-1", 5000, currency="EUR")
ok("a payment in another currency is ignored", hook(euro, signed(euro)).status_code == 200
   and money_on(INV_WEBHOOK)[0] == D("50.00"))
big = event("ev-3", "INV-WEBHOOK-1", 10_000_000)
hook(big, signed(big))
ok("an overpayment is capped at the invoice total", money_on(INV_WEBHOOK) == (D("200.00"), InvoiceStatus.PAID),
   str(money_on(INV_WEBHOOK)))
cancelled = event("ev-4", "INV-WEBHOOK-CANCELLED", 5000)
hook(cancelled, signed(cancelled))
ok("a payment against a cancelled invoice is ignored", money_on(INV_WEBHOOK_CANCELLED)[0] == 0)
unknown = event("ev-5", "INV-DOES-NOT-EXIST", 5000)
ok("a payment for an unknown invoice is ignored", hook(unknown, signed(unknown)).status_code == 200)

print()
if failures:
    print("{} check(s) failed:".format(len(failures)))
    for label in failures:
        print("  - " + label)
    sys.exit(1)
print("All payment abuse checks passed")
