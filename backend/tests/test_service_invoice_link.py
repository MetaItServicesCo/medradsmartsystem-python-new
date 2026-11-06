"""Service invoices: the document, sending it, and paying through the link.

    A. The document: the demo's sections; the diagnosis and work done as worded
       when generating; test equipment only if used; parts with no amounts and
       never in the total; technician notes never shown.
    B. Sending: only after billing approval, only by an administrator. A facility
       with users sends to a confirmed one of them; with none, it needs an address.
    C. The link: opens without signing in, shows nothing internal, is not
       guessable, stops when approval is withdrawn, cancelled or expired.
    D. Paying: Square only, the exact balance, once. Failures change nothing.

    Square and email are stand-ins: nothing is charged or sent.

    DATABASE_URL=sqlite:// python backend/tests/test_service_invoice_link.py
"""
from __future__ import annotations

import os
import pathlib
import sys
from datetime import date, datetime, timedelta
from decimal import Decimal as D

os.environ.setdefault("DATABASE_URL", "sqlite://")
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))

from fastapi.testclient import TestClient  # noqa: E402
from sqlalchemy import create_engine, event  # noqa: E402
from sqlalchemy.orm import sessionmaker  # noqa: E402
from sqlalchemy.pool import StaticPool  # noqa: E402

import app.models  # noqa: E402,F401
from app.api.v1.endpoints import service_invoice_portal as portal  # noqa: E402
from app.core.config import settings  # noqa: E402
from app.core.deps import get_current_user  # noqa: E402
from app.db.base import Base, get_db  # noqa: E402
from app.main import app  # noqa: E402
from app.models.equipment import Equipment  # noqa: E402
from app.models.facility import Facility  # noqa: E402
from app.models.invoice import Invoice, InvoiceStatus  # noqa: E402
from app.models.modality import Modality, ModalityCategory  # noqa: E402
from app.models.service_request import Priority, ServiceRequest, ServiceRequestStatus  # noqa: E402
from app.models.tier import Tier  # noqa: E402
from app.models.user import User, UserRole, UserType  # noqa: E402
from app.utils import read_cache  # noqa: E402
from app.utils.square_payments import SquareRequestError  # noqa: E402

read_cache.settings.READ_CACHE_ENABLED = False
settings.API_RATE_LIMIT = 100000
settings.PUBLIC_APP_URL = "https://app.test"
settings.SQUARE_APPLICATION_ID = "app-id"
settings.SQUARE_ACCESS_TOKEN = "token"
settings.SQUARE_LOCATION_ID = "loc"
failures: list[str] = []


def ok(label: str, condition: bool, detail="") -> None:
    print("{}  {}{}".format("PASS" if condition else "FAIL", label, "  " + str(detail)[:150] if detail != "" else ""))
    if not condition:
        failures.append(label)


def section(title: str) -> None:
    print()
    print(title)


# TEST_POSTGRES_URL runs this on Postgres, which refuses queries SQLite lets through.
POSTGRES_URL = os.environ.get("TEST_POSTGRES_URL")
if POSTGRES_URL:
    engine = create_engine(POSTGRES_URL)
else:
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)

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

seed = Session()
staffed = Facility(name="Clinic A", phone="555-0101", email="a@clinic.test", address="1 A St", city="Plano", state="TX",
                   zip_code="75024", country="US", contact_person="Ann Lee", installment_type="Monthly")
empty = Facility(name="Clinic B", phone="555-0202", email="b@clinic.test", address="2 B St", city="Waco", state="TX",
                 zip_code="76701", country="US", billing_email="bills@clinic-b.test")
seed.add_all([staffed, empty])
seed.flush()


def person(username, role, user_type=UserType.EMPLOYEE, facility=None):
    user = User(username=username, email=username + "@medrad.test", full_name=username.title(), hashed_password="x",
                user_type=user_type, role=role, is_active=True, facility_id=facility.id if facility else None)
    seed.add(user)
    seed.flush()
    return user


PEOPLE = {
    "boss": person("boss", UserRole.SUPERADMIN),
    "hr": person("hr", UserRole.HR_MANAGER),
    "tech": person("tech", UserRole.TECHNICIAN),
    "facadmin": person("facadmin", UserRole.FACILITY_ADMIN, facility=staffed),
    "client": person("client", UserRole.CLIENT, UserType.CLIENT, facility=staffed),
}
gone = person("gone", UserRole.CLIENT, UserType.CLIENT, facility=staffed)
gone.is_active = False
tier = Tier(tier_code="T-P", name="Platinum", labor_rate_per_hour=D("100.00"), service_call_fee=D("1500.00"),
            preventive_maintenance_fee=D("0"), mileage_rate=D("1.00"))
modality = Modality(name="Bed", category=ModalityCategory.PATIENT_MONITORING)
seed.add_all([tier, modality])
seed.flush()
bed_a = Equipment(asset_tag="Hospital Bed", make="Hill Rom", model="P7500", serial_number="S258", modality_id=modality.id,
                  facility_id=staffed.id, tier_id=tier.id)
bed_b = Equipment(asset_tag="B-1", make="Hill Rom", model="P7500", serial_number="S259", modality_id=modality.id,
                  facility_id=empty.id, tier_id=tier.id)
seed.add_all([bed_a, bed_b])
seed.flush()
SESSION = {
    "timestamp": "2026-11-05T10:00:00", "action": "technician_work_session", "user": "Omar Ahmad",
    "changes": {"session_id": "s-1", "work_date": "2026-11-05", "start_time": "2026-11-05T09:00:00",
                "end_time": "2026-11-05T11:00:00", "duration_hours": 2.0, "diagnosis": "Brakes are locked up",
                "work_done": "Removed the damaged pedal", "notes": "INTERNAL customer is difficult",
                "parts": [{"part_number": "P-100", "description": "Pedal", "quantity_used": 1, "unit_price": 99.0}],
                "test_equipment": [{"id": 4, "mrf": "Fluke", "model": "87V", "serial_number": "TE-9", "description": "Meter"}]},
}
ADDITION = {
    "timestamp": "2026-11-06T10:00:00", "action": "work_order_addition", "user": "Omar Ahmad",
    "changes": {"addition_id": "a-1", "diagnosis": "", "work_done": "Fitted the new pedal", "notes": "INTERNAL second note"},
}
NOTE_ONLY = {"timestamp": "2026-11-06T11:00:00", "action": "work_order_addition", "user": "Omar Ahmad",
             "changes": {"addition_id": "a-2", "notes": "INTERNAL only"}}


def service_request(number, equipment, facility, hours="2.00", history=None):
    row = ServiceRequest(request_number=number, facility_id=facility.id, equipment_id=equipment.id,
                         requester_id=PEOPLE["client"].id, problem_description="Brakes are locked up",
                         service_required="- Brakes are locked up.", reference_number="PO-77",
                         preferred_datetime=datetime(2026, 11, 5, 8), completed_at=datetime(2026, 11, 5, 12),
                         priority=Priority.MEDIUM, status=ServiceRequestStatus.COMPLETED,
                         assigned_technician_id=PEOPLE["tech"].id, time_spent_hours=D(hours),
                         total_cost=D(hours) * D("100"), history=history if history is not None else [SESSION, ADDITION, NOTE_ONLY])
    seed.add(row)
    seed.flush()
    return row.id


SR_A = service_request("SR-A", bed_a, staffed)
SR_B = service_request("SR-B", bed_b, empty, hours="0", history=[])
SR_OLD = service_request("SR-OLD", bed_a, staffed)
SR_PAY = service_request("SR-PAY", bed_a, staffed)
IDS = {name: user.id for name, user in PEOPLE.items()}
GONE = gone.id
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
portal.send_html_email = lambda recipients, subject, html_body, text_body: emails.append((list(recipients), subject, html_body))
charges: list[dict] = []
square = {"mode": "ok"}
portal.deliver_payment_receipt = lambda db, delivery_id: None


def fake_square(source_id, idempotency_key, amount, invoice_number, customer_email):
    charges.append({"amount": amount, "key": idempotency_key})
    if square["mode"] == "decline":
        raise SquareRequestError("Card declined", status_code=402)
    if square["mode"] == "pending":
        return {"id": f"sq-{len(charges)}", "status": "PENDING", "amount_money": {"amount": int(amount * 100), "currency": "USD"}}
    cents = int(amount * 100) - (100 if square["mode"] == "short" else 0)
    return {"id": f"sq-{len(charges)}", "status": "COMPLETED", "amount_money": {"amount": cents, "currency": "USD"},
            "card_details": {"card": {"card_brand": "VISA", "last_4": "1111"}}}


portal.create_square_payment = fake_square


def as_user(who):
    current["who"] = who
    return client


def generate(request_id, **body):
    return as_user("boss").post(f"{API}/service-requests/{request_id}/generate-invoice", json=body)


def approve(invoice_id):
    return as_user("boss").put(f"{API}/billing/invoices/{invoice_id}/approve")


def share(invoice_id, who="boss", **body):
    return as_user(who).post(f"{API}/service-invoices/{invoice_id}/share", json=body)


def document(invoice_id, who="boss"):
    return as_user(who).get(f"{API}/service-invoices/{invoice_id}/document")


def public(token):
    return as_user(None).get(f"{API}/public/service-invoices/{token}")


def pay(token, key, name="Ann Lee"):
    return as_user(None).post(f"{API}/public/service-invoices/{token}/square-payment",
                              json={"source_id": "cnon:card-ok", "idempotency_key": key, "payer_name": name})


def token_of(url):
    return url.rsplit("/", 1)[-1]


def invoice_row(invoice_id):
    db = Session()
    try:
        row = db.get(Invoice, invoice_id)
        db.expunge(row)
        return row
    finally:
        db.close()


def set_invoice(invoice_id, **fields):
    db = Session()
    row = db.get(Invoice, invoice_id)
    for field, value in fields.items():
        setattr(row, field, value)
    db.commit()
    db.close()


# ── A ──────────────────────────────────────────────────────────────────────────
section("A. The document")
entries = as_user("boss").get(f"{API}/service-requests/{SR_A}/invoice-work-entries").json()["items"]
ok("the rows to word before generating: a session and an addition with text", [e["key"] for e in entries] == ["s-1", "a-1"], entries)
ok("an addition with only a note is not a row", all(e["key"] != "a-2" for e in entries))
ok("a technician cannot read them this way", as_user("tech").get(f"{API}/service-requests/{SR_A}/invoice-work-entries").status_code == 403)
r = generate(SR_A, work_entries=[{"key": "s-1", "diagnosis": "Brakes locked", "work_done": "Removed the damaged pedal."},
                                 {"key": "not-a-row", "work_done": "Injected"}])
invoice_a = r.json()
ok("generated with the administrator's wording", r.status_code == 200, r.text[:120])
doc = document(invoice_a["id"]).json()
row = doc["work_entries"][0]
ok("  the wording is on the invoice", row["diagnosis"] == "Brakes locked" and row["work_done"] == "Removed the damaged pedal.", row)
ok("  times, hours and technician came from the work order", row["hours"] == 2.0 and row["technician"] == "Omar Ahmad"
   and row["check_in"] == "2026-11-05T09:00:00" and row["date"] == "2026-11-05", row)
ok("  a row that does not exist was ignored", all(e["key"] != "not-a-row" for e in doc["work_entries"]))
ok("  the addition's row is there", doc["work_entries"][1]["work_done"] == "Fitted the new pedal")
ok("the header and service report block", doc["po"] == "PO-77" and doc["installment_plan"] == "Monthly"
   and doc["facility"]["contact_name"] == "Ann Lee" and doc["equipment"]["serial_number"] == "S258"
   and doc["equipment"]["service_required"] == "- Brakes are locked up." and doc["technician"] == "Tech")
ok("total hours", doc["total_hours"] == 2.0)
ok("test equipment that was used shows", doc["test_equipment"] == [{"description": "Meter", "make": "Fluke", "model": "87V", "serial_number": "TE-9"}], doc["test_equipment"])
ok("parts are listed with no amounts", doc["parts"] == [{"part_number": "P-100", "description": "Pedal", "quantity": 1, "condition": None}], doc["parts"])
ok("charges: service fee and labor; the part is not in the total",
   doc["charges"] == [{"label": "Service Fee", "amount": "1500.00"}, {"label": "Labor", "amount": "200.00"}]
   and doc["total_amount"] == "1700.00", doc["charges"])
ok("technician notes never appear", "INTERNAL" not in str(doc))
ok("the invoice carries no link", "payment_link" not in doc)
invoice_b = generate(SR_B).json()
doc_b = document(invoice_b["id"]).json()
ok("no test equipment used: none listed", doc_b["test_equipment"] == [])
ok("no hours: only the Service Fee is charged, Total Hours 0", doc_b["charges"] == [{"label": "Service Fee", "amount": "1500.00"}]
   and doc_b["total_hours"] == 0.0, doc_b["charges"])
ok("no installment plan set: No", doc_b["installment_plan"] == "No")
invoice_old = generate(SR_OLD).json()
set_invoice(invoice_old["id"], service_work_entries=None)
ok("an older invoice with no saved copy reads the work order", document(invoice_old["id"]).json()["work_entries"][0]["work_done"] == "Removed the damaged pedal")
ok("a technician without Billing cannot open it", document(invoice_a["id"], "tech").status_code in (403, 404))
ok("the facility cannot see it before approval", document(invoice_a["id"], "facadmin").status_code == 404)

# ── B ──────────────────────────────────────────────────────────────────────────
section("B. Sending")
for channel in ("email", "link"):
    r = share(invoice_a["id"], channel=channel, recipient_user_id=IDS["client"])
    ok(f"before approval, {channel} is refused", r.status_code == 409 and "Approve" in r.text, r.text[:80])
ok("  and no link exists", invoice_row(invoice_a["id"]).public_link_hash is None)
ok("approve", approve(invoice_a["id"]).status_code == 200 and approve(invoice_b["id"]).status_code == 200)
ok("the facility can now see it", document(invoice_a["id"], "facadmin").status_code == 200)
for who in ("tech", "hr", "facadmin", "client"):
    ok(f"{who} cannot send it", share(invoice_a["id"], who, channel="link").status_code == 403)
options = as_user("boss").get(f"{API}/service-invoices/{invoice_a['id']}/share-options").json()
ok("a facility with users: they are offered to confirm, the requester first",
   [p["user_id"] for p in options["recipients"]] == [IDS["client"], IDS["facadmin"]] and options["approved"] is True, options)
ok("  an inactive user is not offered", all(p["user_id"] != GONE for p in options["recipients"]))
ok("a user must be chosen", share(invoice_a["id"], channel="email").status_code == 400)
ok("someone outside the facility is refused", share(invoice_a["id"], channel="email", recipient_user_id=IDS["tech"]).status_code == 400)
ok("an inactive user is refused", share(invoice_a["id"], channel="email", recipient_user_id=GONE).status_code == 400)
ok("a typed address is not used when there are users",
   share(invoice_a["id"], channel="email", email="x@evil.test").status_code == 400 and emails == [])
r = share(invoice_a["id"], channel="link")
link = r.json().get("share_url", "")
token = token_of(link)
ok("Copy Link: gives the link and emails nobody", r.status_code == 200 and link.startswith("https://app.test/invoice/service/") and emails == [], link)
ok("  the invoice number and ids are not in the link", invoice_a["invoice_number"] not in link and f"/{invoice_a['id']}" not in link)
stored = invoice_row(invoice_a["id"])
ok("  only a hash is searchable; the token is not stored", token not in (stored.public_link_hash, stored.public_link_nonce))
r = share(invoice_a["id"], channel="email", recipient_user_id=IDS["facadmin"])
ok("email to a confirmed user", r.status_code == 200 and emails and emails[-1][0] == ["facadmin@medrad.test"], emails[-1:] )
ok("  with the link in it", link in emails[-1][2])
ok("  and the same link: the one already shared keeps working", r.json()["share_url"] == link)
ok("the printed invoice still has no link once one is issued", token_of(link) not in document(invoice_a["id"]).text)
options = as_user("boss").get(f"{API}/service-invoices/{invoice_b['id']}/share-options").json()
ok("a facility with no users: nobody to confirm, the billing address suggested", options["recipients"] == [] , options)
ok("  an address is required", share(invoice_b["id"], channel="email").status_code == 400)
ok("  a bad address is refused", share(invoice_b["id"], channel="email", email="not-an-email").status_code == 400)
emails.clear()
r = share(invoice_b["id"], channel="email", email="owner@clinic-b.test")
ok("  a good address gets it", r.status_code == 200 and emails[-1][0] == ["owner@clinic-b.test"], r.text[:100])
token_b = token_of(r.json()["share_url"])
ok("  Copy Link needs no address", share(invoice_b["id"], channel="link").status_code == 200)

# ── C ──────────────────────────────────────────────────────────────────────────
section("C. The link")
r = public(token)
body = r.json()
ok("opens without signing in", r.status_code == 200 and body["state"] == "payable", r.text[:100])
ok("  the invoice and its work", body["document"]["work_entries"][0]["diagnosis"] == "Brakes locked")
ok("  and the invoice in it carries no link", "payment_link" not in body["document"] and token_of(link) not in str(body))
ok("  Square, nothing else", body["can_pay"] is True and body["square_payment"]["enabled"] is True and "test_payment_enabled" not in body)
text = str(body)
ok("  no notes, fee markers or secrets", "INTERNAL" not in text and "__FEES__" not in text and "nonce" not in text and "token" not in text.replace("access_token", ""), "")
ok("a made-up link is not found", public("made-up-token").status_code == 404)
ok("an empty-looking link is not found", public("None").status_code == 404)
other = generate(SR_PAY).json()
approve(other["id"])
ok("an invoice with no link issued cannot be reached", invoice_row(other["id"]).public_link_hash is None)
r = as_user("boss").put(f"{API}/service-requests/invoices/{invoice_b['id']}", json={"total_amount": "1000", "subtotal": "1000"})
ok("staff change the amount: approval is withdrawn", r.status_code == 200 and invoice_row(invoice_b["id"]).billing_approval_status != "approved", r.text[:100])
r = public(token_b).json()
ok("  the link shows only that it is being updated", r["state"] == "under_review" and r["document"] is None and r["can_pay"] is False, r)
ok("  and cannot be paid", pay(token_b, "k" * 20).status_code == 409 and charges == [])
ok("  and cannot be re-sent", share(invoice_b["id"], channel="link").status_code == 409)
approve(invoice_b["id"])
r = public(token_b).json()
ok("approved again: the same link shows the new amount", r["state"] == "payable" and r["balance_due"] == "1000.00", r.get("balance_due"))
set_invoice(invoice_b["id"], public_link_expires_at=datetime.utcnow() - timedelta(days=1))
ok("an expired link says so", public(token_b).status_code == 410)
ok("  and cannot be paid", pay(token_b, "e" * 20).status_code == 410 and charges == [])
new_link = share(invoice_b["id"], channel="link").json()["share_url"]
ok("sending again issues a new link", token_of(new_link) != token_b and public(token_of(new_link)).status_code == 200)
ok("  and the old one stays dead", public(token_b).status_code == 404)
set_invoice(invoice_b["id"], status=InvoiceStatus.CANCELLED)
ok("a cancelled invoice's link says so", public(token_of(new_link)).status_code == 410)
ok("  and it cannot be sent", share(invoice_b["id"], channel="link").status_code == 409)

# ── D ──────────────────────────────────────────────────────────────────────────
section("D. Paying")
square["mode"] = "decline"
r = pay(token, "d" * 20)
row = invoice_row(invoice_a["id"])
ok("a declined card changes nothing", r.status_code == 402 and row.amount_paid == 0 and row.status == InvoiceStatus.PENDING, r.text[:100])
token_other = token_of(share(other["id"], channel="link").json()["share_url"])
square["mode"] = "pending"
r = pay(token_other, "p" * 20)
ok("a payment not completed changes nothing", r.status_code == 409 and invoice_row(other["id"]).amount_paid == 0, r.text[:80])
square["mode"] = "ok"
charges.clear()
r = pay(token_other, "q" * 20)
ok("  and after an uncertain result, no second card is charged until it is checked",
   r.status_code == 409 and charges == [] and invoice_row(other["id"]).amount_paid == 0, r.text[:90])
approve(invoice_old["id"])
token_old = token_of(share(invoice_old["id"], channel="link").json()["share_url"])
square["mode"] = "short"
r = pay(token_old, "s" * 20)
ok("Square completing another amount changes nothing", r.status_code == 409 and invoice_row(invoice_old["id"]).amount_paid == 0, r.text[:80])
square["mode"] = "ok"
ok("a name is required", as_user(None).post(f"{API}/public/service-invoices/{token}/square-payment",
   json={"source_id": "cnon:card-ok", "idempotency_key": "n" * 20, "payer_name": ""}).status_code == 422)
charges.clear()
r = pay(token, "g" * 20)
row = invoice_row(invoice_a["id"])
ok("the balance is charged, once", r.status_code == 200 and len(charges) == 1 and charges[0]["amount"] == D("1700.00"), r.text[:120])
ok("  the invoice is paid", row.status == InvoiceStatus.PAID and row.amount_paid == D("1700.00") and row.balance_due == 0 and row.payment_method == "square_card")
ok("  the customer sees it paid, with no way to pay again", r.json()["state"] == "paid" and r.json()["can_pay"] is False)
db = Session()
sr = db.get(ServiceRequest, SR_A)
ok("  the request's history records who paid", sr.history[-1]["action"] == "service_invoice_payment_recorded" and sr.history[-1]["user"] == "Ann Lee")
ok("  its billing status is approved", sr.billing_status == "approved")
db.close()
billed = as_user("boss").get(f"{API}/service-requests/invoices", params={"service_request_id": SR_A}).json()["items"][0]
ok("  Billing shows it paid", billed["status"] == "paid" and D(str(billed["balance_due"])) == 0)
charges.clear()
r = pay(token, "g" * 20)
ok("the same payment retried charges nothing", r.status_code == 200 and charges == [] and invoice_row(invoice_a["id"]).amount_paid == D("1700.00"), r.text[:100])
r = pay(token, "h" * 20)
ok("a second payment on a paid invoice charges nothing", charges == [] and invoice_row(invoice_a["id"]).amount_paid == D("1700.00"), r.status_code)
ok("a paid invoice cannot be sent for payment", share(invoice_a["id"], channel="link").status_code == 409)
ok("the facility still sees the paid invoice", document(invoice_a["id"], "facadmin").json()["status"] == "paid")

print()
if failures:
    print(f"{len(failures)} FAILED")
    for label in failures:
        print("  -", label)
    sys.exit(1)
print("All service invoice link checks passed")
