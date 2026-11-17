"""Service and inspection invoices, sent to the customer and paid through the link.

    A. Inspection invoices are sent as service invoices are: only once approved
       for billing, only by an administrator with Billing edit, by email to a
       confirmed facility user (or an address when it has none), or by link.
    B. The link opens without signing in, shows that one invoice and nothing
       internal, and is its own: a service link does not open an inspection
       invoice, nor the other way round.
    C. Through either link the customer pays by card, or reports ACH, MBMTS
       ACH or cheque: any amount up to the balance, with a proof file, its
       reference number, or both. It waits in Billing's queue, Billing staff
       are told, and nothing is paid until an Admin approves it. One payment
       at a time.
    D. Unchanged: a signed-in payer still has to attach a proof; a card claim
       is still a card claim; Billing approves and rejects as before.

    Square, email and file storage are stand-ins: nothing is charged, sent or written.

    DATABASE_URL=sqlite:// venv312/Scripts/python.exe tests/test_invoice_link_payments.py
"""
from __future__ import annotations

import io
import logging
import os
import pathlib
import sys
from datetime import date, timedelta
from decimal import Decimal as D

os.environ.setdefault("DATABASE_URL", "sqlite://")
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))
logging.disable(logging.CRITICAL)
# libmagic is not on Windows development machines, and importing it there a
# second time hangs. Without it, a file's type is read from its own signature.
sys.modules["magic"] = None

from fastapi.testclient import TestClient  # noqa: E402
from PIL import Image  # noqa: E402
from sqlalchemy import create_engine, event  # noqa: E402
from sqlalchemy.orm import sessionmaker  # noqa: E402
from sqlalchemy.pool import StaticPool  # noqa: E402

import app.models  # noqa: E402,F401
from app.api.v1.endpoints import billing as billing_api  # noqa: E402
from app.api.v1.endpoints import inspection_invoice_portal as inspection_portal  # noqa: E402
from app.api.v1.endpoints import service_invoice_portal as service_portal  # noqa: E402
from app.core.config import settings  # noqa: E402
from app.core.deps import get_current_user  # noqa: E402
from app.db.base import Base, get_db  # noqa: E402
from app.main import app  # noqa: E402
from app.models.facility import Facility  # noqa: E402
from app.models.invoice import Invoice, InvoiceStatus, InvoiceTransaction, InvoiceType, PaymentProof  # noqa: E402
from app.models.notification import Notification  # noqa: E402
from app.models.user import User, UserRole, UserType  # noqa: E402
from app.utils import invoice_link_payments, read_cache  # noqa: E402

read_cache.settings.READ_CACHE_ENABLED = False
settings.API_RATE_LIMIT = 100000
settings.PUBLIC_APP_URL = "https://app.test"
settings.SQUARE_APPLICATION_ID = "app-id"
settings.SQUARE_ACCESS_TOKEN = "token"
settings.SQUARE_LOCATION_ID = "loc"
failures: list[str] = []


def ok(label: str, condition: bool, detail: object = "") -> None:
    print("{}  {}{}".format("PASS" if condition else "FAIL", label, f"  {str(detail)[:200]}" if not condition and detail != "" else ""))
    if not condition:
        failures.append(label)


def section(title: str) -> None:
    print(f"\n{title}")


# LINK_PAY_TEST_DB runs the same checks on a throwaway Postgres, as production uses.
if os.environ.get("LINK_PAY_TEST_DB"):
    engine = create_engine(os.environ["LINK_PAY_TEST_DB"])
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
staffed = Facility(name="Clinic A", phone="1", email="a@clinic.test", address="1 A St", city="Plano", state="TX",
                   zip_code="75024", country="US", contact_person="Ann Lee")
empty = Facility(name="Clinic B", phone="2", email="b@clinic.test", address="2 B St", city="Waco", state="TX",
                 zip_code="76701", country="US")
seed.add_all([staffed, empty])
seed.flush()


def person(username, role, facility=None, user_type=UserType.EMPLOYEE):
    user = User(username=username, email=f"{username}@x.test", full_name=username.title(), hashed_password="x",
                user_type=user_type, role=role, is_active=True, facility_id=facility.id if facility else None)
    seed.add(user)
    seed.flush()
    return user


PEOPLE = {
    "boss": person("boss", UserRole.SUPERADMIN),
    "admin": person("admin", UserRole.ADMIN),
    "tech": person("tech", UserRole.TECHNICIAN),
    "facadmin": person("facadmin", UserRole.FACILITY_ADMIN, staffed),
}


def invoice(number, kind, facility, total="500.00"):
    row = Invoice(invoice_number=number, invoice_type=kind, facility_id=facility.id, customer_name=facility.name,
                  customer_email=facility.email, subtotal=D(total), tax_amount=D("0"), discount_amount=D("0"),
                  total_amount=D(total), amount_paid=D("0"), balance_due=D(total), status=InvoiceStatus.PENDING,
                  issue_date=date(2026, 11, 17), due_date=date(2026, 11, 17) + timedelta(days=30),
                  notes="INTERNAL note for staff", billing_approval_status="pending")
    seed.add(row)
    seed.flush()
    return row.id


INSPECTION = invoice("INV-INSP-000001", InvoiceType.INSPECTION, staffed)
INSPECTION_B = invoice("INV-INSP-000002", InvoiceType.INSPECTION, empty, total="80.00")
SERVICE = invoice("INV-SERVICE-000001", InvoiceType.SERVICE, staffed, total="300.00")
SIGNED_IN = invoice("INV-INSP-000003", InvoiceType.INSPECTION, staffed, total="90.00")
IDS = {name: user.id for name, user in PEOPLE.items()}
seed.commit()
seed.close()

current = {"who": "boss"}


def db_override():
    db = Session()
    try:
        yield db
    finally:
        db.close()


def user_override():
    if current["who"] is None:
        from fastapi import HTTPException
        raise HTTPException(status_code=401, detail="Not signed in")
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

emails: list[tuple] = []
inspection_portal.send_html_email = lambda recipients, subject, html_body, text_body: emails.append((list(recipients), subject, html_body, text_body))
service_portal.send_html_email = lambda recipients, subject, html_body, text_body: emails.append((list(recipients), subject, html_body, text_body))
service_portal.deliver_payment_receipt = lambda db, delivery_id: None
billing_api.deliver_payment_receipt = lambda db, delivery_id: None
stored: dict[str, bytes] = {}


def fake_store(data):
    name = f"proof-{len(stored) + 1}.bin"
    stored[name] = data
    return name, "local"


invoice_link_payments.store_encrypted_payment_proof = fake_store
invoice_link_payments.delete_payment_proof_file = lambda name, backend="local": stored.pop(name, None)
billing_api.load_payment_proof = lambda proof: stored[proof.stored_filename]
billing_api.store_encrypted_payment_proof = fake_store
charges: list = []


def fake_square(source_id, idempotency_key, amount, invoice_number, customer_email):
    charges.append(amount)
    return {"id": f"sq-{len(charges)}", "status": "COMPLETED", "amount_money": {"amount": int(amount * 100), "currency": "USD"},
            "card_details": {"card": {"card_brand": "VISA", "last_4": "1111"}}}


service_portal.create_square_payment = fake_square
# Rate limits are checked once, on their own, at the end.
real_limits = (service_portal.enforce_rate_limit, inspection_portal.enforce_rate_limit)
service_portal.enforce_rate_limit = inspection_portal.enforce_rate_limit = lambda **kwargs: None


def as_user(who):
    current["who"] = who
    return client


def row(model, key):
    db = Session()
    try:
        item = db.get(model, key)
        db.expunge(item)
        return item
    finally:
        db.close()


def proofs(invoice_id):
    db = Session()
    try:
        return db.query(PaymentProof).filter(PaymentProof.invoice_id == invoice_id).order_by(PaymentProof.id).all()
    finally:
        db.close()


def ledger(invoice_id):
    db = Session()
    try:
        return [t.transaction_type for t in db.query(InvoiceTransaction)
                .filter(InvoiceTransaction.invoice_id == invoice_id).order_by(InvoiceTransaction.id)]
    finally:
        db.close()


def notes_for(title):
    db = Session()
    try:
        return db.query(Notification).filter(Notification.title == title).all()
    finally:
        db.close()


def png() -> bytes:
    buffer = io.BytesIO()
    Image.new("RGB", (40, 20), "white").save(buffer, format="PNG")
    return buffer.getvalue()


def report(kind, token, *, method="ach", amount="100.00", name="Ann Lee", email="ann@clinic.test", reference=None,
           file=None, notes=None):
    data = {"payment_method": method, "amount": amount, "payer_name": name}
    if email is not None:
        data["payer_email"] = email
    if reference is not None:
        data["reference_number"] = reference
    if notes is not None:
        data["notes"] = notes
    files = {"proof_file": ("cheque.png", file, "image/png")} if file is not None else None
    return as_user(None).post(f"{API}/public/{kind}-invoices/{token}/payment-proof", data=data, files=files)


def public(kind, token):
    return as_user(None).get(f"{API}/public/{kind}-invoices/{token}")


def approve_billing(invoice_id):
    return as_user("boss").put(f"{API}/billing/invoices/{invoice_id}/approve")


def token_of(url):
    return url.rsplit("/", 1)[-1]


section("A. Sending an inspection invoice")
share = lambda who, invoice_id, **body: as_user(who).post(f"{API}/inspection-invoices/{invoice_id}/share", json=body)  # noqa: E731
ok("a technician cannot send it", share("tech", INSPECTION, channel="link").status_code == 403)
ok("not before it is approved for billing", share("boss", INSPECTION, channel="link").status_code == 409)
ok("(approved for billing)", approve_billing(INSPECTION).status_code == 200 and approve_billing(INSPECTION_B).status_code == 200
   and approve_billing(SERVICE).status_code == 200 and approve_billing(SIGNED_IN).status_code == 200)
options = as_user("boss").get(f"{API}/inspection-invoices/{INSPECTION}/share-options").json()
ok("the facility's users are offered to confirm", [r["user_id"] for r in options["recipients"]] == [IDS["facadmin"]], options)
ok("email must go to one of them", share("boss", INSPECTION, channel="email", email="x@y.test").status_code == 400)
sent = share("boss", INSPECTION, channel="email", recipient_user_id=IDS["facadmin"])
body = sent.json()
ok("emailed to the confirmed user, with an inspection link", sent.status_code == 200 and body["email"] == "facadmin@x.test"
   and body["share_url"].startswith("https://app.test/invoice/inspection/"), body)
ok("  the email names the invoice and the ways to pay", emails and emails[-1][0] == ["facadmin@x.test"]
   and "INV-INSP-000001" in emails[-1][2] and "ACH, MBMTS ACH or cheque" in emails[-1][2], emails[-1:] and emails[-1][2])
ok("  and the user is told in the app", any(n.user_id == IDS["facadmin"] for n in notes_for("Inspection invoice received")))
TOKEN = token_of(body["share_url"])
again = share("boss", INSPECTION, channel="link").json()
ok("copying the link again gives the same link", token_of(again["share_url"]) == TOKEN)
ok("a facility with no users: it needs an address", share("boss", INSPECTION_B, channel="email").status_code == 400
   and share("boss", INSPECTION_B, channel="email", email="bills@clinic-b.test").json()["email"] == "bills@clinic-b.test")
listing = as_user("boss").get(f"{API}/inspections/quotations", params={"invoice_id": INSPECTION}).json()["items"][0]
ok("Billing's listing never carries what the link is made from",
   "public_link_nonce" not in listing and "public_link_hash" not in listing and listing["invoice_number"] == "INV-INSP-000001")

section("B. The inspection link")
page = public("inspection", TOKEN)
data = page.json()
ok("opens without signing in, payable", page.status_code == 200 and data["state"] == "payable" and data["balance_due"] == "500.00", data)
document = data["document"] or {}
ok("  the invoice is there as Billing has it", document.get("invoice_number") == "INV-INSP-000001"
   and float(document.get("total_amount")) == 500 and document.get("facility_name") == "Clinic A", document)
ok("  and nothing internal", not {"transactions", "notes", "approved_for_billing_by_name", "inspector_name",
                                  "public_link_nonce", "public_link_hash", "id"} & set(document), sorted(document))
ok("  card, and ACH, MBMTS ACH and Cheque, are offered", data["can_pay"] is True and data["can_report_payment"] is True
   and [m["value"] for m in data["other_methods"]] == ["ach", "mbmts_ach", "cheque"], data.get("other_methods"))
ok("a made-up link opens nothing", public("inspection", "not-a-real-token").status_code == 404)
SERVICE_TOKEN = token_of(as_user("boss").post(f"{API}/service-invoices/{SERVICE}/share", json={"channel": "link"}).json()["share_url"])
ok("a service link does not open an inspection invoice, nor the other way round",
   public("inspection", SERVICE_TOKEN).status_code == 404 and public("service", TOKEN).status_code == 404)

section("C. Reporting an ACH, MBMTS ACH or cheque payment")
ok("only ACH, MBMTS ACH or Cheque", report("inspection", TOKEN, method="bank_transfer", reference="1").status_code == 422
   and report("inspection", TOKEN, method="credit_card", reference="1").status_code == 422)
ok("a proof file or a reference number is needed", report("inspection", TOKEN).status_code == 422)
ok("their name is needed", report("inspection", TOKEN, name=" ", reference="ACH-1").status_code == 422)
ok("a mistyped email is refused", report("inspection", TOKEN, email="ann at clinic", reference="ACH-1").status_code == 422)
ok("not more than the balance", report("inspection", TOKEN, amount="500.01", reference="ACH-1").status_code == 400)
ok("nor nothing", report("inspection", TOKEN, amount="0", reference="ACH-1").status_code == 400)
reported = report("inspection", TOKEN, amount="200.00", reference="ACH-778812")
after = reported.json()
ok("part of the balance, with its reference number only", reported.status_code == 200 and after["pending_reports"] == 1, reported.text[:200])
ok("  the page then says it is waiting, and takes no other payment", after["can_report_payment"] is False and after["can_pay"] is False)
proof = proofs(INSPECTION)[-1]
ok("  it is in the queue, from the link, with who sent it", proof.status == "pending_verification" and proof.submitted_by_id is None
   and proof.submitted_via == "payment_link" and proof.payer_name == "Ann Lee" and proof.payer_email == "ann@clinic.test"
   and proof.payer_reference == "ACH-778812" and proof.payment_method == "ach" and proof.claimed_amount == D("200.00"))
ok("  nothing to read in the background, so it is ready to review", proof.extraction_status == "not_applicable" and not proof.stored_filename)
ok("  the invoice is not paid", row(Invoice, INSPECTION).amount_paid == 0 and row(Invoice, INSPECTION).status == InvoiceStatus.PENDING)
ok("  its ledger records the report", ledger(INSPECTION)[-1] == "payment_proof_submitted")
alerts = notes_for("Payment proof awaiting review")
ok("  Billing staff are told", {IDS["boss"], IDS["admin"]} <= {n.user_id for n in alerts}
   and any("sent through the invoice link by Ann Lee" in (n.message or "") for n in alerts))
ok("a second report waits for the first", report("inspection", TOKEN, amount="50.00", reference="ACH-2").status_code == 409)
ok("and so does a card", as_user(None).post(f"{API}/public/inspection-invoices/{TOKEN}/square-payment", json={
    "source_id": "cnon:ok-card", "idempotency_key": "k" * 20, "payer_name": "Ann Lee"}).status_code == 409 and not charges)

queue = as_user("boss").get(f"{API}/billing/payment-proofs").json()
entry = next(item for item in queue if item["id"] == proof.id)
ok("Billing's queue shows it: who, from the link, no document, not a card claim",
   entry["submitted_by_name"] == "Ann Lee (invoice link)" and entry["submitted_via"] == "payment_link"
   and entry["payer_reference"] == "ACH-778812" and entry["file_url"] is None and entry["is_card_claim"] is False, entry)
ok("  there is no file to open", as_user("boss").get(f"{API}/billing/payment-proofs/{proof.id}/file").status_code == 404)
evidence = as_user("boss").get(f"{API}/billing/invoices/{INSPECTION}/payment-evidence").json()
item = next(i for i in evidence["items"] if i["id"] == f"proof-{proof.id}")
ok("  the invoice's payment evidence lists it as reported, with its reference",
   item["evidence_type"] == "reported_payment" and item["reference_number"] == "ACH-778812"
   and item["submitted_by_name"] == "Ann Lee (invoice link)", item)
approved = as_user("boss").post(f"{API}/billing/payment-proofs/{proof.id}/approve", json={"notes": "Seen in the bank"})
ok("an Admin approves it in Billing as any other", approved.status_code == 200 and approved.json()["status"] == "approved", approved.text[:200])
paid = row(Invoice, INSPECTION)
ok("  and only then is it paid: $200 of $500", paid.amount_paid == D("200.00") and paid.balance_due == D("300.00")
   and paid.status == InvoiceStatus.PARTIALLY_PAID)
data = public("inspection", TOKEN).json()
ok("  the link shows the $300 left, payable again", data["balance_due"] == "300.00" and data["can_report_payment"] is True)

cheque = report("inspection", TOKEN, method="cheque", amount="300.00", email=None, file=png(), notes="Mailed Monday")
ok("a cheque with its photo, the rest of the balance, no email", cheque.status_code == 200, cheque.text[:200])
proof = proofs(INSPECTION)[-1]
ok("  the photo is read in the background, as in Billing", proof.extraction_status == "queued" and proof.stored_filename in stored
   and proof.payer_email is None and "Mailed Monday" in (proof.notes or ""))
ok("  the same photo sent again is not a second payment", report("inspection", TOKEN, method="cheque", amount="300.00",
   email=None, file=png()).status_code == 200 and len(proofs(INSPECTION)) == 2)
ok("  Billing can open the photo", as_user("boss").get(f"{API}/billing/payment-proofs/{proof.id}/file").status_code == 200)
db = Session()
db.query(PaymentProof).filter(PaymentProof.id == proof.id).update({"extraction_status": "completed"})
db.commit()
db.close()
rejected = as_user("boss").post(f"{API}/billing/payment-proofs/{proof.id}/reject", json={"notes": "Unsigned cheque"})
ok("rejecting it works as before, nothing paid", rejected.status_code == 200 and row(Invoice, INSPECTION).amount_paid == D("200.00"))

section("C. A card through the inspection link")
paid_by_card = as_user(None).post(f"{API}/public/inspection-invoices/{TOKEN}/square-payment", json={
    "source_id": "cnon:ok-card", "idempotency_key": "card-key-0000000001", "payer_name": "Ann Lee"})
ok("the rest is paid by card through Square, with its card fee", paid_by_card.status_code == 200
   and paid_by_card.json()["state"] == "paid" and charges and charges[-1] > D("300.00"), paid_by_card.text[:200])
ok("  Billing is told it was an inspection payment", bool(notes_for("Inspection payment completed")))
ok("  a paid invoice takes no more reports", report("inspection", TOKEN, reference="X-1").status_code == 409)

section("C. The same through a service invoice's link")
data = public("service", SERVICE_TOKEN).json()
ok("the service link offers ACH, MBMTS ACH and Cheque too", data["can_report_payment"] is True and len(data["other_methods"]) == 3)
service_report = report("service", SERVICE_TOKEN, method="mbmts_ach", amount="300.00", reference="MB-5521")
ok("an MBMTS ACH payment is reported", service_report.status_code == 200 and service_report.json()["pending_reports"] == 1)
proof = proofs(SERVICE)[-1]
ok("  waiting for review, not paid", proof.payment_method == "mbmts_ach" and row(Invoice, SERVICE).amount_paid == 0)
ok("  the signed-in facility user cannot pay it twice either", as_user("facadmin").post(
    f"{API}/billing/invoices/{SERVICE}/payment-proofs", data={"payment_method": "ach", "amount": "300.00"},
    files={"proof_file": ("p.png", png(), "image/png")}).status_code == 409)
db = Session()
db.query(Invoice).filter(Invoice.id == SERVICE).update({"billing_approval_status": "pending"})
db.commit()
db.close()
data = public("service", SERVICE_TOKEN).json()
ok("approval withdrawn: the link shows nothing and takes nothing", data["state"] == "under_review"
   and report("service", SERVICE_TOKEN, reference="MB-9").status_code == 409)

section("D. Unchanged for a signed-in payer")
ok("a signed-in payer still has to attach the proof", as_user("facadmin").post(
    f"{API}/billing/invoices/{SIGNED_IN}/payment-proofs", data={"payment_method": "ach", "amount": "90.00"}).status_code == 422)
signed = as_user("facadmin").post(f"{API}/billing/invoices/{SIGNED_IN}/payment-proofs",
                                  data={"payment_method": "cheque", "amount": "90.00"}, files={"proof_file": ("c.png", png(), "image/png")})
ok("  and with it, it is submitted as before, by them", signed.status_code == 201 and signed.json()["submitted_by_name"] == "Facadmin"
   and signed.json()["submitted_via"] is None, signed.text[:200])
claim = billing_api.is_card_claim(PaymentProof(payment_method="credit_card", stored_filename=None))
ok("a reported card payment is still a card claim; a cheque with a reference only is not",
   claim and not billing_api.is_card_claim(PaymentProof(payment_method="cheque", stored_filename=None)))

section("Too many reports through one link")
service_portal.enforce_rate_limit, inspection_portal.enforce_rate_limit = real_limits
codes = [report("inspection", TOKEN, method="wire", reference="1").status_code for _ in range(11)]
ok("ten tries in ten minutes, then it must wait", codes[:10] == [422] * 10 and codes[10] == 429, codes)

print(f"\n{len(failures)} FAILED: {failures}" if failures else "\nALL PASSED")
sys.exit(1 if failures else 0)
