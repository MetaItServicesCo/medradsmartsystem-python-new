"""Bulk invoices: several invoices, of one or more facilities, sent and paid as one.

    A. What can go in: open, approved invoices with a balance, of any type and
       facility. Not one paid, cancelled, awaiting approval, already in another
       bulk invoice, a lease-to-own invoice, a rental on automatic card charge,
       or one with a payment under way. Each says why not.
    B. Creating one: Admins and Super Admins with Billing edit; it gets its own
       number (INV-BULK-000001) and owes what its invoices owe.
    C. While an invoice is in it, it is paid only through it: Billing's Pay,
       Mark as Paid, card, proof upload, its own link (which says so), sending
       it on its own, and an edit of its paid amount or status are all refused.
    D. Sending it, and its link: the front page (by facility, with totals) and
       each invoice in full; nothing internal.
    E. Paying part: a cheque reported through the link waits for review, then
       is recorded on the bulk invoice only -- its invoices are untouched.
    F. Changing what is in it: never owing less than has been paid.
    G. Paying the rest by card through the link: the balance plus the card fee,
       once; every invoice is then marked paid through Billing's own payment
       path, referencing the bulk invoice; the lock is released.
    H. A Super Admin records payments in Billing; an Admin cannot.
    I. Cancelling: only with no payment; its invoices are freed, its link stops.
    J. An uncertain card result is settled by Square's webhook, once.
    K. If its invoices cannot be marked paid, the money stays recorded, staff
       are told, and settling again finishes it.

    Square, email and file storage are stand-ins: nothing is charged, sent or written.

    DATABASE_URL=sqlite:// venv312/Scripts/python.exe tests/test_bulk_invoices.py
    BULK_TEST_DB=postgresql://... runs the same checks on a throwaway Postgres.
"""
from __future__ import annotations

import io
import logging
import os
import pathlib
import sys
import uuid
from datetime import date, datetime, timedelta
from decimal import Decimal as D

os.environ.setdefault("DATABASE_URL", "sqlite://")
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))
logging.disable(logging.CRITICAL)
sys.modules["magic"] = None

from fastapi.testclient import TestClient  # noqa: E402
from PIL import Image  # noqa: E402
from sqlalchemy import create_engine, event  # noqa: E402
from sqlalchemy.orm import sessionmaker  # noqa: E402
from sqlalchemy.pool import StaticPool  # noqa: E402

import app.models  # noqa: E402,F401
from app.api.v1.endpoints import billing as billing_api  # noqa: E402
from app.api.v1.endpoints import bulk_invoices as bulk_api  # noqa: E402
from app.api.v1.endpoints import service_invoice_portal as service_portal  # noqa: E402
from app.api.v1.endpoints import square_webhooks  # noqa: E402
from app.core.config import settings  # noqa: E402
from app.core.deps import get_current_user  # noqa: E402
from app.db.base import Base, get_db  # noqa: E402
from app.main import app  # noqa: E402
from app.models.bulk_invoice import BulkInvoice, BulkInvoicePayment  # noqa: E402
from app.models.equipment import Equipment  # noqa: E402
from app.models.facility import Facility  # noqa: E402
from app.models.invoice import Invoice, InvoiceStatus, InvoiceTransaction, InvoiceType, PaymentProof  # noqa: E402
from app.models.modality import Modality, ModalityCategory  # noqa: E402
from app.models.notification import Notification  # noqa: E402
from app.models.payment_operation import PaymentOperation  # noqa: E402
from app.models.rental import BillingFrequency, Rental  # noqa: E402
from app.models.sales import SalesQuotation  # noqa: E402
from app.models.service_request import Priority, ServiceRequest, ServiceRequestStatus  # noqa: E402
from app.models.user import User, UserRole, UserType  # noqa: E402
from app.utils import bulk_invoices as bulk_rules  # noqa: E402
from app.utils import payment_receipts, read_cache, square_payments  # noqa: E402
from app.utils.invoice_approval import ensure_financial_edit_allowed  # noqa: E402

read_cache.settings.READ_CACHE_ENABLED = False
settings.API_RATE_LIMIT = 100000
settings.PUBLIC_APP_URL = "https://app.test"
settings.SQUARE_APPLICATION_ID = "app-id"
settings.SQUARE_ACCESS_TOKEN = "token"
settings.SQUARE_LOCATION_ID = "loc"
failures: list[str] = []


def ok(label: str, condition: bool, detail: object = "") -> None:
    print("{}  {}{}".format("PASS" if condition else "FAIL", label, f"  {str(detail)[:300]}" if not condition and detail != "" else ""))
    if not condition:
        failures.append(label)


def section(title: str) -> None:
    print(f"\n{title}")


if os.environ.get("BULK_TEST_DB"):
    engine = create_engine(os.environ["BULK_TEST_DB"])
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

# ---------------------------------------------------------------- the records

seed = Session()
clinic_a = Facility(name="Alpha Clinic", phone="1", email="a@clinic.test", address="1 A St", city="Plano", state="TX",
                    zip_code="75024", country="US", contact_person="Ann Lee", billing_name="Alpha Billing",
                    billing_email="ap@alpha.test")
clinic_b = Facility(name="Bravo Clinic", phone="2", email="b@clinic.test", address="2 B St", city="Waco", state="TX",
                    zip_code="76701", country="US")
modality = Modality(name="Bed", category=ModalityCategory.PATIENT_MONITORING)
seed.add_all([clinic_a, clinic_b, modality])
seed.flush()


def person(username, role, facility=None):
    user = User(username=username, email=f"{username}@x.test", full_name=username.title(), hashed_password="x",
                user_type=UserType.EMPLOYEE, role=role, is_active=True, facility_id=facility.id if facility else None)
    seed.add(user)
    seed.flush()
    return user


PEOPLE = {
    "boss": person("boss", UserRole.SUPERADMIN),
    "admin": person("admin", UserRole.ADMIN),
    "tech": person("tech", UserRole.TECHNICIAN),
    "facadmin": person("facadmin", UserRole.FACILITY_ADMIN, clinic_a),
}
IDS = {name: user.id for name, user in PEOPLE.items()}

equipment = Equipment(asset_tag="A-1", make="GE", model="Aespire 7900", serial_number="ANCS01144",
                      description="Anesthesia Machine", modality_id=modality.id, facility_id=clinic_a.id)
seed.add(equipment)
seed.flush()
sr = ServiceRequest(request_number="SR-000036", facility_id=clinic_a.id, equipment_id=equipment.id,
                    requester_id=PEOPLE["boss"].id, assigned_technician_id=PEOPLE["boss"].id,
                    problem_description="SIB board", priority=Priority.MEDIUM, status=ServiceRequestStatus.COMPLETED,
                    time_spent_hours=D("4"), total_cost=D("700"), history=[], completed_at=datetime(2026, 11, 20))
quotation = SalesQuotation(quotation_number="SQ-000010", work_order="WO-000010", created_by_id=PEOPLE["boss"].id,
                           customer_name="Bravo Clinic", status="in_progress", facility_id=clinic_b.id)
rental = Rental(rental_number="RNT-000200", customer_name="Bravo Clinic", customer_email="b@clinic.test",
                customer_phone="2", customer_address="2 B St", billing_frequency=BillingFrequency.MONTHLY,
                security_deposit=D("0"), auto_charge=False, facility_id=clinic_b.id, start_date=date(2026, 11, 1))
auto_rental = Rental(rental_number="RNT-000201", customer_name="Bravo Clinic", customer_email="b@clinic.test",
                     customer_phone="2", customer_address="2 B St", billing_frequency=BillingFrequency.MONTHLY,
                     security_deposit=D("0"), auto_charge=True, facility_id=clinic_b.id, start_date=date(2026, 11, 1))
seed.add_all([sr, quotation, rental, auto_rental])
seed.flush()


def invoice(number, kind, facility, total, *, approved=True, status=InvoiceStatus.PENDING, paid="0", **links):
    total, paid = D(total), D(paid)
    row = Invoice(invoice_number=number, invoice_type=kind, facility_id=facility.id, customer_name=facility.name,
                  customer_email=facility.email, subtotal=total, tax_amount=D("0"), discount_amount=D("0"),
                  total_amount=total, amount_paid=paid, balance_due=total - paid, status=status,
                  issue_date=date(2026, 11, 10), due_date=date(2026, 12, 10),
                  notes="INTERNAL note for staff only",
                  billing_approval_status="approved" if approved else "pending", **links)
    seed.add(row)
    seed.flush()
    return row.id


SERVICE = invoice("INV-SERVICE-000008", InvoiceType.SERVICE, clinic_a, "1500.00", service_request_id=sr.id)
INSPECTION = invoice("INV-INSP-000041", InvoiceType.INSPECTION, clinic_a, "850.00")
SALES = invoice("INV-SALES-000102", InvoiceType.SALES, clinic_b, "1200.00", sales_quotation_id=quotation.id)
RENTAL = invoice("INV-RENTAL-000300", InvoiceType.RENTAL, clinic_b, "450.00", rental_id=rental.id)
AUTO_RENTAL = invoice("INV-RENTAL-000301", InvoiceType.RENTAL, clinic_b, "450.00", rental_id=auto_rental.id)
LEASE = invoice("INV-LEASE-000001", InvoiceType.SALES, clinic_b, "300.00")
UNAPPROVED = invoice("INV-SERVICE-000009", InvoiceType.SERVICE, clinic_a, "200.00", approved=False)
PAID = invoice("INV-INSP-000042", InvoiceType.INSPECTION, clinic_a, "100.00", status=InvoiceStatus.PAID, paid="100.00")
SPARE = invoice("INV-INSP-000043", InvoiceType.INSPECTION, clinic_b, "60.00")
SPARE2 = invoice("INV-INSP-000044", InvoiceType.INSPECTION, clinic_b, "40.00")
WITH_PROOF = invoice("INV-INSP-000045", InvoiceType.INSPECTION, clinic_b, "70.00")
seed.add(PaymentProof(invoice_id=WITH_PROOF, submitted_by_id=PEOPLE["boss"].id, payment_method="cheque",
                      claimed_amount=D("70"), status="pending_verification", extraction_status="not_applicable",
                      storage_backend="none", extracted_data={}, mismatch_flags=[], requires_manual_review=True))
seed.commit()
seed.close()

# ---------------------------------------------------------------- the client and stand-ins

current = {"who": "admin"}


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
API = "/api/v1"
BULK = f"{API}/billing/bulk-invoices"

emails: list[tuple] = []
bulk_api.send_html_email = lambda recipients, subject, html_body, text_body: emails.append((list(recipients), subject, html_body, text_body))
bulk_rules.send_html_email = lambda recipients, subject, html_body, text_body: emails.append((list(recipients), subject, html_body, text_body))
payment_receipts.deliver_payment_receipt = lambda db, delivery_id: None
billing_api.deliver_payment_receipt = lambda db, delivery_id: None
bulk_api.enforce_rate_limit = lambda **kwargs: None
stored: dict[str, bytes] = {}


def fake_store(data):
    name = f"proof-{len(stored) + 1}.bin"
    stored[name] = data
    return name, "local"


bulk_rules.store_encrypted_payment_proof = fake_store
bulk_rules.delete_payment_proof_file = lambda name, backend="local": stored.pop(name, None)
billing_api.load_payment_proof = lambda proof: stored[proof.stored_filename]
charges: list = []
square_mode = {"mode": "complete"}


def fake_square(source_id, idempotency_key, amount, invoice_number, customer_email=None, customer_id=None):
    charges.append((amount, invoice_number))
    if square_mode["mode"] == "uncertain":
        raise square_payments.SquareRequestError("Square payment confirmation is pending.", indeterminate=True)
    return {"id": f"sq-{len(charges)}", "status": "COMPLETED", "amount_money": {"amount": int(amount * 100), "currency": "USD"},
            "card_details": {"card": {"card_brand": "VISA", "last_4": "4242"}}}


square_payments.create_square_payment = fake_square


def as_user(who):
    current["who"] = who
    return client


def fresh(model, key):
    db = Session()
    try:
        item = db.get(model, key)
        db.expunge(item)
        return item
    finally:
        db.close()


def scalar(fn):
    """Run one read in its own session, closed after."""
    db = Session()
    try:
        return fn(db)
    finally:
        db.close()


def key() -> str:
    return uuid.uuid4().hex


def png() -> bytes:
    buffer = io.BytesIO()
    Image.new("RGB", (40, 20), "white").save(buffer, format="PNG")
    return buffer.getvalue()


def ledger(invoice_id):
    db = Session()
    try:
        return db.query(InvoiceTransaction).filter(InvoiceTransaction.invoice_id == invoice_id).order_by(InvoiceTransaction.id).all()
    finally:
        db.close()


# ---------------------------------------------------------------- A. what can go in

section("A. What can go in, and why not")
r = as_user("admin").get(f"{BULK}/candidates")
ok("Billing sees open invoices of every facility", r.status_code == 200, r.text)
groups = {group["facility_name"]: group for group in r.json()["groups"]}
by_number = {inv["invoice_number"]: inv for group in groups.values() for inv in group["invoices"]}
ok("  grouped by facility, A then B", list(groups) == ["Alpha Clinic", "Bravo Clinic"], list(groups))
ok("  Alpha's billing contact is offered for Bill To", groups["Alpha Clinic"]["bill_to"]["name"] == "Alpha Billing"
   and groups["Alpha Clinic"]["bill_to"]["email"] == "ap@alpha.test" and groups["Alpha Clinic"]["bill_to"]["city"] == "Plano")
for number in ("INV-SERVICE-000008", "INV-INSP-000041", "INV-SALES-000102", "INV-RENTAL-000300", "INV-INSP-000043"):
    ok(f"  {number} can go in", by_number[number]["eligible"] is True, by_number[number])
ok("  a paid invoice is not even listed", "INV-INSP-000042" not in by_number)
ok("  awaiting billing approval: says so", by_number["INV-SERVICE-000009"]["reason"] == "Awaiting billing approval", by_number["INV-SERVICE-000009"])
ok("  a rental on automatic card charge: says so", by_number["INV-RENTAL-000301"]["reason"] == "Rental on automatic card charge")
ok("  a lease-to-own invoice: paid through its lease", by_number["INV-LEASE-000001"]["reason"] == "Lease-to-own invoice: paid through its lease")
ok("  a payment waiting for review: says so", by_number["INV-INSP-000045"]["reason"] == "A payment is waiting for review")
ok("  the service invoice shows its request number", by_number["INV-SERVICE-000008"]["related_number"] == "SR-000036")
ok("  the sales invoice its work order, the rental its agreement",
   by_number["INV-SALES-000102"]["related_number"] == "WO-000010" and by_number["INV-RENTAL-000300"]["related_number"] == "RNT-000200")
ok("Billing search narrows it", [g["facility_name"] for g in as_user("admin").get(f"{BULK}/candidates", params={"search": "Bravo"}).json()["groups"]] == ["Bravo Clinic"])
for who, code in (("tech", 403), ("facadmin", 403)):
    ok(f"  {who} cannot list them", as_user(who).get(f"{BULK}/candidates").status_code == code)


def found(term):
    groups = as_user("admin").get(f"{BULK}/candidates", params={"search": term}).json()["groups"]
    return sorted(inv["invoice_number"] for group in groups for inv in group["invoices"])


ok("search: every word must match, in any order", found("clinic bravo rental") == ["INV-RENTAL-000300", "INV-RENTAL-000301"], found("clinic bravo rental"))
ok("  part of a facility's name", found("brav clin") == found("Bravo Clinic") and "INV-SALES-000102" in found("brav clin"))
ok("  a service request number finds its invoice", found("SR-000036") == ["INV-SERVICE-000008"], found("SR-000036"))
ok("  a work order or sales quotation number", found("WO-000010") == ["INV-SALES-000102"] and found("SQ-000010") == ["INV-SALES-000102"])
ok("  a rental agreement number", found("RNT-000200") == ["INV-RENTAL-000300"])
ok("  an invoice number, in part", found("000041") == ["INV-INSP-000041"])
ok("  % and _ in a word are just characters, not wildcards (0000_1 does not find 000041)",
   found("0000_1") == [] and found("00%41") == [] and found("000041") == ["INV-INSP-000041"], (found("0000_1"), found("00%41")))
ok("  a search of punctuation only is ignored", found("-") == found(""))
ok("  words that match nothing together find nothing", found("alpha rental") == [])
ok("  case does not matter", found("ALPHA service") == found("alpha SERVICE") != [])
db = Session()
db.add(Facility(name="Tiffany S", phone="9", email="t@clinic.test", address="9 T St", city="Houston", state="TX", zip_code="77019", country="US"))
db.commit()
db.close()
groups = as_user("admin").get(f"{BULK}/candidates", params={"search": "tiffany"}).json()["groups"]
ok("a facility the search names, with no open invoice, is shown saying so",
   [(g["facility_name"], g["invoices"], g.get("no_open_invoices")) for g in groups] == [("Tiffany S", [], True)], groups)
groups = as_user("admin").get(f"{BULK}/candidates", params={"search": "clinic"}).json()["groups"]
db = Session()
db.add(Facility(name="Zulu Clinic", phone="8", email="z@clinic.test", address="8 Z St", city="Waco", state="TX", zip_code="76701", country="US"))
db.commit()
db.close()
groups = as_user("admin").get(f"{BULK}/candidates", params={"search": "clinic"}).json()["groups"]
ok("  listed after the facilities that have open invoices", [g["facility_name"] for g in groups] == ["Alpha Clinic", "Bravo Clinic", "Zulu Clinic"],
   [g["facility_name"] for g in groups])
ok("  and not shown without a search", "Tiffany S" not in [g["facility_name"] for g in as_user("admin").get(f"{BULK}/candidates").json()["groups"]])
groups = as_user("admin").get(f"{BULK}/candidates").json()["groups"]
ok("each facility says how many can go in, and how many cannot",
   [(g["facility_name"], g["eligible_count"], g["locked_count"]) for g in groups] == [("Alpha Clinic", 2, 1), ("Bravo Clinic", 4, 3)],
   [(g["facility_name"], g["eligible_count"], g["locked_count"]) for g in groups])

# ---------------------------------------------------------------- B. creating one

section("B. Creating a bulk invoice")
body = {
    "invoice_ids": [SERVICE, INSPECTION, SALES, RENTAL],
    "bill_to_facility_id": None, "bill_to_name": "Alpha Billing", "bill_to_email": "ap@alpha.test",
    "bill_to_address": "1 A St\nPlano, TX 75024, US", "note": "November services",
}
r = as_user("tech").post(BULK, json=body)
ok("a technician cannot create one", r.status_code == 403, r.text)
bad = as_user("admin").post(BULK, json={**body, "invoice_ids": [SERVICE, UNAPPROVED, LEASE]})
ok("one that cannot go in refuses all, saying which and why", bad.status_code == 409
   and "INV-SERVICE-000009: Awaiting billing approval" in bad.text and "INV-LEASE-000001" in bad.text, bad.text)
ok("  and nothing was made", scalar(lambda db: db.query(BulkInvoice).count()) == 0)
ok("  an invalid email is refused", as_user("admin").post(BULK, json={**body, "bill_to_email": "nope"}).status_code == 422)
r = as_user("admin").post(BULK, json=body)
ok("an Admin creates it", r.status_code == 201, r.text)
first = r.json()
FIRST = first["id"]
ok("  its own number, INV-BULK-000001, as a draft", first["bulk_number"] == "INV-BULK-000001" and first["status"] == "draft")
ok("  it owes what its invoices owe: 1500 + 850 + 1200 + 450 = 4000", first["total_amount"] == "4000.00" and first["balance_due"] == "4000.00", first)
ok("  two facilities, four invoices", first["facilities"] == ["Alpha Clinic", "Bravo Clinic"] and first["invoice_count"] == 4, first)
doc = first["document"]
ok("  front page: grouped by facility with subtotals 2350 and 1650",
   [(g["facility_name"], g["subtotal"]) for g in doc["groups"]] == [("Alpha Clinic", "2350.00"), ("Bravo Clinic", "1650.00")], doc["groups"])
ok("  then every invoice in full, in the same order",
   [i["invoice_number"] for i in doc["invoices"]] == ["INV-INSP-000041", "INV-SERVICE-000008", "INV-RENTAL-000300", "INV-SALES-000102"]
   or [i["invoice_number"] for i in doc["invoices"]] == ["INV-SERVICE-000008", "INV-INSP-000041", "INV-RENTAL-000300", "INV-SALES-000102"],
   [i["invoice_number"] for i in doc["invoices"]])
kinds = {i["invoice_number"]: i["kind"] for i in doc["invoices"]}
ok("  each as it prints on its own (service document, inspection, sales, rental)",
   kinds == {"INV-SERVICE-000008": "service", "INV-INSP-000041": "inspection", "INV-SALES-000102": "sales", "INV-RENTAL-000300": "rental"}, kinds)
service_doc = next(i for i in doc["invoices"] if i["kind"] == "service")["document"]
ok("  the service invoice's own document: its asset and request", service_doc["equipment"]["description"] == "Anesthesia Machine"
   and service_doc["request_number"] == "SR-000036", service_doc.get("equipment"))
again = as_user("admin").post(BULK, json={**body, "invoice_ids": [SERVICE, SPARE]})
ok("an invoice already in one cannot go in another", again.status_code == 409 and "In bulk invoice INV-BULK-000001" in again.text, again.text)
listed = as_user("admin").get(BULK).json()["items"]
ok("it is listed in Billing", [row["bulk_number"] for row in listed] == ["INV-BULK-000001"])
ok("  found by an invoice in it", [row["bulk_number"] for row in as_user("admin").get(BULK, params={"search": "INV-SALES-000102"}).json()["items"]] == ["INV-BULK-000001"])
members = {row["invoice_id"]: row for row in as_user("admin").get(f"{BULK}/memberships").json()["items"]}
ok("Billing's list knows which invoices are in it", set(members) == {SERVICE, INSPECTION, SALES, RENTAL}
   and all(row["locked"] and row["bulk_number"] == "INV-BULK-000001" for row in members.values()), members)
mine = {row["invoice_id"] for row in as_user("facadmin").get(f"{BULK}/memberships").json()["items"]}
ok("  a facility's user sees only their own facility's invoices in it", mine == {SERVICE, INSPECTION}, mine)
ok("  a technician sees none of it", as_user("tech").get(f"{BULK}/memberships").status_code == 403)

# ---------------------------------------------------------------- C. paid only through it

section("C. While in it, an invoice is paid only through it")
LOCK = "is part of bulk invoice INV-BULK-000001"
r = as_user("boss").post(f"{API}/billing/invoices/{INSPECTION}/mark-paid", json={"payment_method": "cheque"})
ok("Mark as Paid is refused, saying why", r.status_code == 409 and LOCK in r.text, r.text)
r = as_user("boss").post(f"{API}/billing/invoices/{RENTAL}/payments", json={"amount": "10", "payment_method": "cash", "idempotency_key": key()})
ok("Billing's Pay is refused", r.status_code == 409 and LOCK in r.text, r.text)
r = as_user("boss").get(f"{API}/billing/invoices/{SALES}/card-payment")
ok("a card payment in Billing is refused", r.status_code == 409 and LOCK in r.text, r.text)
r = as_user("boss").post(f"{API}/billing/invoices/{INSPECTION}/payment-proofs",
                         data={"payment_method": "cheque", "amount": "10"}, files={"proof_file": ("c.png", png(), "image/png")})
ok("uploading a payment proof is refused", r.status_code == 409 and LOCK in r.text, r.text)
r = as_user("admin").post(f"{API}/service-invoices/{SERVICE}/share", json={"channel": "link"})
ok("sending the service invoice on its own is refused", r.status_code == 409 and LOCK in r.text, r.text)
r = as_user("admin").post(f"{API}/inspection-invoices/{INSPECTION}/share", json={"channel": "link"})
ok("sending the inspection invoice on its own is refused", r.status_code == 409 and LOCK in r.text, r.text)
db = Session()
service_row = db.get(Invoice, SERVICE)
try:
    ensure_financial_edit_allowed(service_row, {"status": InvoiceStatus.PAID, "amount_paid": D("1500")})
    ok("Edit Invoice cannot mark it paid", False)
except Exception as exc:  # noqa: BLE001
    ok("Edit Invoice cannot mark it paid", getattr(exc, "status_code", None) == 409 and LOCK in str(getattr(exc, "detail", "")))
try:
    ensure_financial_edit_allowed(service_row, {"status": InvoiceStatus.CANCELLED})
    ok("  nor cancel it", False)
except Exception as exc:  # noqa: BLE001
    ok("  nor cancel it", getattr(exc, "status_code", None) == 409)
try:
    ensure_financial_edit_allowed(service_row, {"status": InvoiceStatus.PENDING, "notes": "x", "total_amount": D("1600")})
    ok("  but its amounts can still change while nothing is paid (the bulk total follows)", True)
except Exception as exc:  # noqa: BLE001
    ok("  but its amounts can still change while nothing is paid (the bulk total follows)", False, exc)
db.close()
# Its own link (if it was sent before) says it is in a bulk invoice, and takes no payment.
db = Session()
row = db.get(Invoice, SERVICE)
row.public_link_hash = service_portal._token_hash("svc-token")
row.public_link_expires_at = datetime.utcnow() + timedelta(days=5)
db.commit()
db.close()
r = client.get(f"{API}/public/service-invoices/svc-token")
ok("its own link says it is in a bulk invoice, and offers no payment",
   r.status_code == 200 and r.json()["state"] == "in_bulk" and r.json()["bulk_number"] == "INV-BULK-000001"
   and r.json()["can_pay"] is False and r.json()["document"] is None, r.text)
r = client.post(f"{API}/public/service-invoices/svc-token/square-payment",
                json={"source_id": "cnon:card", "idempotency_key": key()[:40], "payer_name": "Ann Lee"})
ok("  a card payment through it is refused", r.status_code == 409 and LOCK in r.text, r.text)
r = client.post(f"{API}/public/service-invoices/svc-token/payment-proof",
                data={"payment_method": "ach", "amount": "10", "payer_name": "Ann Lee", "reference_number": "ACH-1"})
ok("  so is reporting an ACH payment through it", r.status_code == 409 and LOCK in r.text, r.text)
ok("no money moved on any of them", all(fresh(Invoice, i).amount_paid == 0 for i in (SERVICE, INSPECTION, SALES, RENTAL)))

# ---------------------------------------------------------------- D. sending it

section("D. Sending it, and its link")
r = as_user("admin").post(f"{BULK}/{FIRST}/send", json={"channel": "email"})
ok("sent by email to its Bill To address", r.status_code == 200 and r.json()["email"] == "ap@alpha.test", r.text)
link = r.json()["share_url"]
token = link.rsplit("/", 1)[-1]
ok("  its own link", link.startswith("https://app.test/invoice/bulk/"))
ok("  now 'sent'", r.json()["status"] == "sent")
sent = emails[-1]
ok("  the email names it, the four invoices, the balance and the link",
   sent[0] == ["ap@alpha.test"] and "INV-BULK-000001" in sent[1] and "4 invoices" in sent[2] and "$4,000.00" in sent[2] and link in sent[2], sent[2])
r = client.get(f"{API}/public/bulk-invoices/{token}")
public = r.json()
ok("the link opens without signing in", r.status_code == 200 and public["state"] == "payable" and public["is_bulk"] is True, r.text)
ok("  balance 4000, card charge with its fee", public["balance_due"] == "4000.00" and public["base_amount"] == "4000.00"
   and D(public["charge_amount"]) == D(public["base_amount"]) + D(public["card_fee"]), public)
ok("  ACH, MBMTS ACH and cheque offered", [m["value"] for m in public["other_methods"]] == ["ach", "mbmts_ach", "cheque"])
ok("  nothing internal in it", "INTERNAL" not in r.text and "hashed_password" not in r.text)
ok("  a wrong link is not found", client.get(f"{API}/public/bulk-invoices/nope").status_code == 404)

# ---------------------------------------------------------------- E. a part payment

section("E. A cheque for part of it, reported through the link")
r = client.post(f"{API}/public/bulk-invoices/{token}/payment-proof",
                data={"payment_method": "cheque", "amount": "5000", "payer_name": "Ann Lee", "reference_number": "4521"})
ok("more than the balance is refused", r.status_code == 400 and "$4000.00" in r.text, r.text)
r = client.post(f"{API}/public/bulk-invoices/{token}/payment-proof",
                data={"payment_method": "cheque", "amount": "1000", "payer_name": "Ann Lee", "reference_number": "4521"},
                files={"proof_file": ("cheque.png", png(), "image/png")})
ok("a $1000 cheque is reported", r.status_code == 200 and r.json()["pending_reports"] == 1 and r.json()["can_pay"] is False, r.text)
db = Session()
proof = db.query(PaymentProof).filter(PaymentProof.bulk_invoice_id == FIRST).one()
PROOF = proof.id
db.close()
ok("  it waits in Billing's review queue, as the bulk invoice's",
   any(p["id"] == PROOF and p["target_type"] == "bulk_invoice" and p["target_number"] == "INV-BULK-000001" and p["customer_name"] == "Alpha Billing"
       for p in as_user("admin").get(f"{API}/billing/payment-proofs").json()), as_user("admin").get(f"{API}/billing/payment-proofs").text[:300])
ok("  staff are told", scalar(lambda db: db.query(Notification).filter(Notification.title == "Payment proof awaiting review").count()) >= 1)
r = client.post(f"{API}/public/bulk-invoices/{token}/square-payment",
                json={"source_id": "cnon:card", "idempotency_key": key()[:40], "payer_name": "Ann Lee"})
ok("  no card payment until it is checked", r.status_code == 409 and "waiting for approval" in r.text, r.text)
ok("  nor a change to what is in it", as_user("admin").put(f"{BULK}/{FIRST}", json={"invoice_ids": [SERVICE, INSPECTION, SALES]}).status_code == 409)
db = Session()
proof = db.get(PaymentProof, PROOF)
proof.extraction_status = "completed"
db.commit()
db.close()
r = as_user("admin").post(f"{API}/billing/payment-proofs/{PROOF}/approve", json={"notes": "Cheque cleared"})
ok("Billing approves it", r.status_code == 200 and r.json()["status"] == "approved", r.text)
bulk = as_user("admin").get(f"{BULK}/{FIRST}").json()
ok("  recorded on the bulk invoice: partially paid, $1000 paid, $3000 left",
   bulk["status"] == "partially_paid" and bulk["amount_paid"] == "1000.00" and bulk["balance_due"] == "3000.00", bulk)
ok("  one payment in its record: cheque 4521", [(p["payment_method"], p["amount"], p["reference_number"]) for p in bulk["payments"]] == [("cheque", "1000.00", "4521")], bulk["payments"])
ok("  its invoices are untouched", all(fresh(Invoice, i).amount_paid == 0 and fresh(Invoice, i).status == InvoiceStatus.PENDING
                                        for i in (SERVICE, INSPECTION, SALES, RENTAL)))
ok("  and still paid only through it", as_user("boss").post(f"{API}/billing/invoices/{SALES}/mark-paid",
                                                             json={"payment_method": "cash"}).status_code == 409)
ok("  a receipt was emailed", any("Payment received for invoice INV-BULK-000001" in e[1] and "$1,000.00" in e[2] for e in emails))
try:
    db = Session()
    ensure_financial_edit_allowed(db.get(Invoice, SERVICE), {"total_amount": D("1700")})
    ok("  with a payment on it, its invoices' amounts can no longer change", False)
except Exception as exc:  # noqa: BLE001
    ok("  with a payment on it, its invoices' amounts can no longer change", getattr(exc, "status_code", None) == 409, exc)
finally:
    db.close()

# ---------------------------------------------------------------- F. changing what is in it

section("F. Changing what is in it")
r = as_user("admin").put(f"{BULK}/{FIRST}", json={"invoice_ids": [SERVICE, INSPECTION, SALES, RENTAL, SPARE]})
ok("an invoice can be added", r.status_code == 200 and r.json()["total_amount"] == "4060.00" and r.json()["balance_due"] == "3060.00", r.text)
r = as_user("admin").put(f"{BULK}/{FIRST}", json={"invoice_ids": [SERVICE, INSPECTION, SALES, RENTAL]})
ok("  and taken out again: it is free to be paid on its own", r.status_code == 200 and fresh(Invoice, SPARE).bulk_invoice_id is None, r.text)
r = as_user("admin").put(f"{BULK}/{FIRST}", json={"invoice_ids": [RENTAL]})
ok("it can never owe less than has been paid ($450 < $1000)", r.status_code == 409 and "$1000.00 has been paid" in r.text, r.text)
r = as_user("admin").put(f"{BULK}/{FIRST}", json={"invoice_ids": [SERVICE, INSPECTION, SALES, RENTAL, UNAPPROVED]})
ok("one that cannot go in is refused", r.status_code == 409 and "Awaiting billing approval" in r.text, r.text)
r = as_user("admin").put(f"{BULK}/{FIRST}", json={"bill_to_name": "Alpha Group AP", "note": "Thank you"})
ok("its Bill To can be changed", r.status_code == 200 and r.json()["bill_to_name"] == "Alpha Group AP", r.text)

# ---------------------------------------------------------------- G. the rest by card

section("G. The rest, by card, through the link")
public = client.get(f"{API}/public/bulk-invoices/{token}").json()
ok("the link shows $3000 left, card charge with the fee", public["balance_due"] == "3000.00" and public["base_amount"] == "3000.00", public)
r = client.post(f"{API}/public/bulk-invoices/{token}/square-payment",
                json={"source_id": "cnon:card", "idempotency_key": key()[:40], "payer_name": "Ann Lee", "charge_amount": "1.00"})
ok("an amount that is no longer due is refused before any charge", r.status_code == 409 and "has changed" in r.text and not charges, r.text)
pay_key = key()[:40]
r = client.post(f"{API}/public/bulk-invoices/{token}/square-payment",
                json={"source_id": "cnon:card", "idempotency_key": pay_key, "payer_name": "Ann Lee", "charge_amount": public["charge_amount"]})
ok("the card is charged once, the balance plus the fee", r.status_code == 200 and charges == [(D(public["charge_amount"]), "INV-BULK-000001")], (r.text, charges))
ok("  it is paid", r.json()["state"] == "paid" and r.json()["balance_due"] == "0.00", r.text)
bulk = as_user("admin").get(f"{BULK}/{FIRST}").json()
ok("  paid in full: $4000, card fee kept apart", bulk["status"] == "paid" and bulk["amount_paid"] == "4000.00"
   and D(bulk["card_fee_amount"]) == D(public["card_fee"]) and not bulk["needs_attention"], bulk)
for number, invoice_id, amount in (("service", SERVICE, "1500.00"), ("inspection", INSPECTION, "850.00"),
                                   ("sales", SALES, "1200.00"), ("rental", RENTAL, "450.00")):
    row = fresh(Invoice, invoice_id)
    ok(f"  the {number} invoice is paid, ${amount}", row.status == InvoiceStatus.PAID and row.amount_paid == D(amount) and row.balance_due == 0,
       (row.status, row.amount_paid))
    payment_rows = [t for t in ledger(invoice_id) if t.transaction_type == "payment"]
    ok(f"    its ledger says it was paid through the bulk invoice",
       len(payment_rows) == 1 and "Paid through bulk invoice INV-BULK-000001" in (payment_rows[0].description or ""),
       [(t.transaction_type, t.description) for t in ledger(invoice_id)])
    ok(f"    no card fee was added to it", fresh(Invoice, invoice_id).card_fee_amount == 0)
db = Session()
ok("  the service request's history records the payment",
   any(h.get("action") == "service_invoice_payment_recorded" for h in db.get(ServiceRequest, sr.id).history or []))
ok("  the sales quotation is marked paid", db.get(SalesQuotation, quotation.id).paid_status == "paid")
ok("  the rental's history records it", any(h.get("action") == "invoice_paid" for h in db.get(Rental, rental.id).history or []))
operation = db.query(PaymentOperation).filter(PaymentOperation.bulk_invoice_id == FIRST).one()
ok("  the card charge is on record as succeeded", operation.status == "succeeded" and operation.provider_reference == "sq-1")
db.close()
r = client.post(f"{API}/public/bulk-invoices/{token}/square-payment",
                json={"source_id": "cnon:card", "idempotency_key": pay_key, "payer_name": "Ann Lee", "charge_amount": public["charge_amount"]})
ok("the same payment sent again charges nothing more", len(charges) == 1, (r.status_code, r.text))
members = {row["invoice_id"]: row for row in as_user("admin").get(f"{BULK}/memberships").json()["items"]}
ok("its invoices are no longer held (they are paid)", all(not members[i]["locked"] for i in (SERVICE, INSPECTION, SALES, RENTAL)), members)
ok("the webhook for the same payment changes nothing", scalar(lambda db: square_webhooks._sync_completed_payment(
    db, {"id": "sq-1", "reference_id": "INV-BULK-000001", "amount_money": {"amount": 1, "currency": "USD"}})) == "duplicate")
changed = as_user("admin").put(f"{BULK}/{FIRST}", json={"note": "x"})
cancelled = as_user("admin").post(f"{BULK}/{FIRST}/cancel")
ok("a paid bulk invoice cannot be changed or cancelled", changed.status_code == 409 and cancelled.status_code == 409,
   (changed.status_code, changed.text[:150], cancelled.status_code, cancelled.text[:150]))

# ---------------------------------------------------------------- H. recorded in Billing

section("H. A Super Admin records payments in Billing")
r = as_user("admin").post(BULK, json={**body, "invoice_ids": [SPARE, SPARE2], "bill_to_name": "Bravo Clinic", "bill_to_email": ""})
SECOND = r.json()["id"]
ok("a second bulk invoice, $100", r.status_code == 201 and r.json()["bulk_number"] == "INV-BULK-000002" and r.json()["total_amount"] == "100.00", r.text)
r = as_user("admin").post(f"{BULK}/{SECOND}/payments", json={"amount": "40", "payment_method": "cash", "idempotency_key": key()})
ok("an Admin cannot record a payment", r.status_code == 403, r.text)
ok("  nor take a card", as_user("admin").get(f"{BULK}/{SECOND}/card-payment").status_code == 403)
r = as_user("boss").post(f"{BULK}/{SECOND}/payments", json={"amount": "150", "payment_method": "cash", "idempotency_key": key()})
ok("more than the balance is refused", r.status_code == 400, r.text)
manual_key = key()
r = as_user("boss").post(f"{BULK}/{SECOND}/payments", json={"amount": "40", "payment_method": "mbmts_ach", "reference": "MB-7", "idempotency_key": manual_key})
ok("the Super Admin records $40 by MBMTS ACH: partially paid", r.status_code == 200 and r.json()["status"] == "partially_paid"
   and r.json()["balance_due"] == "60.00", r.text)
r = as_user("boss").post(f"{BULK}/{SECOND}/payments", json={"amount": "40", "payment_method": "mbmts_ach", "reference": "MB-7", "idempotency_key": manual_key})
ok("  sent twice, recorded once", r.status_code == 200 and r.json()["amount_paid"] == "40.00", r.text)
card = as_user("boss").get(f"{BULK}/{SECOND}/card-payment").json()
ok("the card form charges the $60 left plus the fee", card["base_amount"] == "60.00" and card["can_pay"] is True, card)
r = as_user("boss").post(f"{BULK}/{SECOND}/square-payment", json={"source_id": "cnon:card", "idempotency_key": key(), "charge_amount": card["charge_amount"]})
ok("  paid by card in Billing: paid in full, its invoices paid", r.status_code == 200 and r.json()["status"] == "paid"
   and fresh(Invoice, SPARE).status == InvoiceStatus.PAID and fresh(Invoice, SPARE2).status == InvoiceStatus.PAID, r.text)

# ---------------------------------------------------------------- I. cancelling

section("I. Cancelling")
db = Session()
extra = Invoice(invoice_number="INV-INSP-000046", invoice_type=InvoiceType.INSPECTION, facility_id=clinic_b.id,
                customer_name="Bravo Clinic", customer_email="b@clinic.test", subtotal=D("25"), tax_amount=D("0"),
                discount_amount=D("0"), total_amount=D("25"), amount_paid=D("0"), balance_due=D("25"),
                status=InvoiceStatus.PENDING, issue_date=date(2026, 11, 12), due_date=date(2026, 12, 12), billing_approval_status="approved")
db.add(extra)
db.commit()
EXTRA = extra.id
db.close()
r = as_user("admin").post(BULK, json={**body, "invoice_ids": [EXTRA], "bill_to_name": "Bravo Clinic"})
THIRD = r.json()["id"]
send = as_user("admin").post(f"{BULK}/{THIRD}/send", json={"channel": "link"}).json()
third_token = send["share_url"].rsplit("/", 1)[-1]
ok("sending by link emails nobody", send["email"] is None)
r = as_user("admin").post(f"{BULK}/{THIRD}/cancel")
ok("a bulk invoice with no payment is cancelled", r.status_code == 200 and r.json()["status"] == "cancelled", r.text)
ok("  its invoice is free again", fresh(Invoice, EXTRA).bulk_invoice_id is None)
ok("  and can be paid on its own", as_user("boss").post(f"{API}/billing/invoices/{EXTRA}/mark-paid", json={"payment_method": "cash"}).status_code == 200)
ok("  its link no longer works", client.get(f"{API}/public/bulk-invoices/{third_token}").status_code == 404)

# ---------------------------------------------------------------- J. an uncertain card result

section("J. An uncertain card result, settled by the webhook")
db = Session()
late = Invoice(invoice_number="INV-INSP-000047", invoice_type=InvoiceType.INSPECTION, facility_id=clinic_b.id,
               customer_name="Bravo Clinic", customer_email="b@clinic.test", subtotal=D("90"), tax_amount=D("0"),
               discount_amount=D("0"), total_amount=D("90"), amount_paid=D("0"), balance_due=D("90"),
               status=InvoiceStatus.PENDING, issue_date=date(2026, 11, 12), due_date=date(2026, 12, 12), billing_approval_status="approved")
db.add(late)
db.commit()
LATE = late.id
db.close()
FOURTH = as_user("admin").post(BULK, json={**body, "invoice_ids": [LATE], "bill_to_name": "Bravo Clinic"}).json()["id"]
fourth_token = as_user("admin").post(f"{BULK}/{FOURTH}/send", json={"channel": "link"}).json()["share_url"].rsplit("/", 1)[-1]
fourth = client.get(f"{API}/public/bulk-invoices/{fourth_token}").json()
square_mode["mode"] = "uncertain"
r = client.post(f"{API}/public/bulk-invoices/{fourth_token}/square-payment",
                json={"source_id": "cnon:card", "idempotency_key": key()[:40], "payer_name": "Bo", "charge_amount": fourth["charge_amount"]})
square_mode["mode"] = "complete"
ok("Square does not answer: the customer is told it is being verified", r.status_code == 502 and "pending" in r.text.lower(), r.text)
public = client.get(f"{API}/public/bulk-invoices/{fourth_token}").json()
ok("  no other payment can be made meanwhile", public["can_pay"] is False and public["can_report_payment"] is False, public)
ok("  nothing recorded", fresh(BulkInvoice, FOURTH).amount_paid == 0)
db = Session()
result = square_webhooks._sync_completed_payment(db, {
    "id": "sq-late", "reference_id": "INV-BULK-000004", "status": "COMPLETED",
    "amount_money": {"amount": int(D(fourth["charge_amount"]) * 100), "currency": "USD"},
})
db.close()
ok("Square's webhook records it", result == "processed", result)
ok("  the bulk invoice and its invoice are paid", fresh(BulkInvoice, FOURTH).status == "paid" and fresh(Invoice, LATE).status == InvoiceStatus.PAID)
db = Session()
ok("  the fee as it was charged", db.query(BulkInvoicePayment).filter(BulkInvoicePayment.bulk_invoice_id == FOURTH).one().card_fee_amount == D(fourth["card_fee"]))
ok("  sent again, recorded once", square_webhooks._sync_completed_payment(db, {
    "id": "sq-late", "reference_id": "INV-BULK-000004", "amount_money": {"amount": 100, "currency": "USD"}}) == "duplicate")
ok("  a payment for it that matches no charge is ignored", square_webhooks._sync_completed_payment(db, {
    "id": "sq-stranger", "reference_id": "INV-BULK-000002", "amount_money": {"amount": 100, "currency": "USD"}}) == "ignored")
db.close()

# ---------------------------------------------------------------- K. when its invoices cannot be marked paid

section("K. When its invoices cannot be marked paid")
db = Session()
odd = Invoice(invoice_number="INV-INSP-000048", invoice_type=InvoiceType.INSPECTION, facility_id=clinic_a.id,
              customer_name="Alpha Clinic", customer_email="a@clinic.test", subtotal=D("30"), tax_amount=D("0"),
              discount_amount=D("0"), total_amount=D("30"), amount_paid=D("0"), balance_due=D("30"),
              status=InvoiceStatus.PENDING, issue_date=date(2026, 11, 12), due_date=date(2026, 12, 12), billing_approval_status="approved")
db.add(odd)
db.commit()
ODD = odd.id
db.close()
FIFTH = as_user("admin").post(BULK, json={**body, "invoice_ids": [ODD]}).json()["id"]
real_apply = billing_api._apply_invoice_payment_locked


def broken_apply(*args, **kwargs):
    from fastapi import HTTPException
    raise HTTPException(status_code=409, detail="Stock is short for a part")


billing_api._apply_invoice_payment_locked = broken_apply
r = as_user("boss").post(f"{BULK}/{FIFTH}/payments", json={"amount": "30", "payment_method": "cheque", "reference": "88", "idempotency_key": key()})
billing_api._apply_invoice_payment_locked = real_apply
detail = as_user("admin").get(f"{BULK}/{FIFTH}").json()
ok("the payment is kept on the bulk invoice", r.status_code == 200 and detail["amount_paid"] == "30.00" and detail["status"] == "paid", r.text)
ok("  it needs attention, saying why", detail["needs_attention"] and "Stock is short" in (detail["settlement_error"] or ""), detail)
ok("  staff are told", scalar(lambda db: db.query(Notification).filter(Notification.title == "Bulk invoice needs attention").count()) >= 1)
ok("  its invoice is untouched, and still held", fresh(Invoice, ODD).status == InvoiceStatus.PENDING
   and as_user("boss").post(f"{API}/billing/invoices/{ODD}/mark-paid", json={"payment_method": "cash"}).status_code == 409)
ok("  'settle' is offered", detail["can_settle"] is True)
r = as_user("admin").post(f"{BULK}/{FIFTH}/settle")
ok("settling again marks its invoice paid", r.status_code == 200 and not r.json()["needs_attention"]
   and fresh(Invoice, ODD).status == InvoiceStatus.PAID, r.text)

print()
print(f"{len(failures)} failed: {failures}" if failures else "All bulk invoice checks passed")
sys.exit(1 if failures else 0)
