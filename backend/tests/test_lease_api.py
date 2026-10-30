"""Lease-to-own over real HTTP, through the full application.

The service and billing tests call functions directly. These go through the
app as a browser would -- routing, permission guards, request validation,
serialisation -- because that is where a working feature is most easily
broken: a route captured by another, a field leaked to a customer, a guard
missing on one endpoint. The full app is imported, so this also proves the
API still starts.

    DATABASE_URL=sqlite:// python backend/tests/test_lease_api.py
"""
from __future__ import annotations

import os
import pathlib
import sys
from datetime import date, timedelta
from decimal import Decimal as D

os.environ.setdefault("DATABASE_URL", "sqlite://")
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))

from cryptography.fernet import Fernet  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from sqlalchemy import create_engine  # noqa: E402
from sqlalchemy.orm import sessionmaker  # noqa: E402
from sqlalchemy.pool import StaticPool  # noqa: E402

import app.models  # noqa: E402,F401
from app.api.v1.endpoints import lease_portal  # noqa: E402
from app.core.config import settings  # noqa: E402
from app.core.deps import get_current_user  # noqa: E402
from app.db.base import Base, get_db  # noqa: E402
from app.main import app  # noqa: E402
from app.models.inventory import InventoryPart  # noqa: E402
from app.models.user import User, UserRole, UserType  # noqa: E402
from app.utils import lease_service as svc  # noqa: E402
from app.utils import read_cache  # noqa: E402
from app.utils.square_payments import amount_to_minor_units  # noqa: E402

settings.PAYMENT_DATA_ENCRYPTION_KEYS = Fernet.generate_key().decode()
settings.SQUARE_CURRENCY = "USD"
read_cache.settings.READ_CACHE_ENABLED = False

failures: list[str] = []


def ok(label: str, condition: bool, detail: str = "") -> None:
    print("{}  {}{}".format("PASS" if condition else "FAIL", label,
                            "  " + detail if detail else ""))
    if not condition:
        failures.append(label)


engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)


def _sqlite_buildable(table) -> bool:
    """Importing the full app registers the knowledge-base tables, whose
    Postgres-only types (JSONB, vectors) SQLite cannot build. Nothing a lease
    touches is among them, so they are left out rather than faked."""
    from sqlalchemy.schema import CreateTable
    try:
        CreateTable(table).compile(dialect=engine.dialect)
        return True
    except Exception:
        return False


Base.metadata.create_all(engine, tables=[t for t in Base.metadata.sorted_tables if _sqlite_buildable(t)])
Session = sessionmaker(bind=engine)

seed = Session()
admin = User(username="admin", email="admin@medrad.test", full_name="Sales Admin", hashed_password="x",
             user_type=UserType.EMPLOYEE, role=UserRole.ADMIN, is_active=True)
facility_user = User(username="fac", email="fac@medrad.test", full_name="Facility Admin", hashed_password="x",
                     user_type=UserType.EMPLOYEE, role=UserRole.FACILITY_ADMIN, is_active=True)
employee = User(username="emp", email="emp@medrad.test", full_name="Employee", hashed_password="x",
                user_type=UserType.EMPLOYEE, role=UserRole.EMPLOYEE, is_active=True)
part = InventoryPart(part_number="MON-500", part_type="sales", description="Patient monitor",
                     unit_price=D("10000"), condition="new", quantity_on_hand=5, reorder_level=0,
                     status="active")
seed.add_all([admin, facility_user, employee, part])
seed.commit()
IDS = {"admin": admin.id, "facility": facility_user.id, "employee": employee.id}
PART_ID = part.id
seed.close()

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

limited: list[str] = []
lease_portal.enforce_rate_limit = lambda *, bucket, identity, limit, window_seconds, **_: limited.append(bucket)
svc.send_html_email = lambda *a, **k: True


class FakeSquare:
    def __init__(self):
        self.charges = []

    def pay(self, *, source_id, idempotency_key, amount, invoice_number, customer_email=None, customer_id=None):
        self.charges.append((idempotency_key, D(str(amount))))
        return {"id": "PAY-{}".format(len(self.charges)), "status": "COMPLETED",
                "amount_money": {"amount": amount_to_minor_units(amount), "currency": "USD"},
                "card_details": {"card": {"card_brand": "VISA", "last_4": "4242"}}}

    def vault(self, **kwargs):
        return {"customer_id": "CUS-1", "card_id": "CARD-1", "card_brand": "VISA",
                "last_4": "4242", "exp_month": 12, "exp_year": 2030}


square = FakeSquare()
lease_portal.create_square_payment = square.pay
lease_portal.create_square_card_on_file = square.vault
lease_portal.square_is_configured = lambda: True

FIRST_DUE = (date.today() + timedelta(days=30)).isoformat()
PAYLOAD = {
    "customer_name": "St. Mary Clinic", "customer_email": "billing@stmary.test", "part_id": PART_ID,
    "quantity": 1, "markup_percent": "15", "down_payment": "1000", "installment_count": 12,
    "frequency": "monthly", "first_due_date": FIRST_DUE,
}

print("Lease API")
print("=" * 72)

print()
print("Who may use the staff routes")
print("-" * 72)
current["who"] = "employee"
r = client.get("/api/v1/leases")
ok("an employee without the sales module is refused", r.status_code == 403, str(r.status_code))
current["who"] = "facility"
r = client.post("/api/v1/leases", json=PAYLOAD)
ok("a facility user cannot create one, as they cannot create Sales quotations",
   r.status_code == 403, str(r.status_code))
current["who"] = "admin"

print()
print("Products and the schedule preview")
print("-" * 72)
r = client.get("/api/v1/leases/products", params={"search": "monitor"})
ok("leasable products are listed", r.status_code == 200 and r.json()["items"][0]["part_number"] == "MON-500",
   r.text[:120])
ok("  with what is actually free to commit", r.json()["items"][0]["quantity_available"] == 5)
ok("  /products is not captured as an agreement id", r.status_code != 422)
r = client.post("/api/v1/leases/quote", json={"cash_price": "10000", "markup_percent": "15",
                                              "down_payment": "1000", "installment_count": 12,
                                              "frequency": "monthly", "first_due_date": FIRST_DUE})
ok("a preview returns the disclosed figures", r.status_code == 200
   and r.json()["total_of_payments"] == "12448.78" and r.json()["regular_installment"] == "947.19",
   r.text[:160])
r = client.post("/api/v1/leases/quote", json={"cash_price": "10000", "installment_count": 12,
                                              "frequency": "daily", "first_due_date": FIRST_DUE})
ok("an unsupported frequency is a 422", r.status_code == 422)

print()
print("Creating, editing, listing")
print("-" * 72)
r = client.post("/api/v1/leases", json=PAYLOAD)
ok("an admin creates a draft", r.status_code == 201, r.text[:200])
lease = r.json()
LID = lease["id"]
ok("  numbered", lease["agreement_number"] == "LTO-000001")
ok("  priced by the server", lease["total_of_payments"] == "12448.78")
ok("  with its schedule", len(lease["installments"]) == 12)
ok("  and staff-only detail", "history" in lease and "authorizations" in lease)

for bad, why in ((dict(installment_count=0), "zero installments"),
                 (dict(down_payment="20000"), "a down payment over the price"),
                 (dict(customer_email="x"), "a bad email"),
                 (dict(quantity=99), "more than is in stock")):
    r = client.post("/api/v1/leases", json=PAYLOAD | bad)
    ok("{} is refused".format(why), r.status_code in (409, 422), "{} {}".format(r.status_code, r.text[:100]))

r = client.put("/api/v1/leases/{}".format(LID), json=PAYLOAD | {"installment_count": 6})
ok("a draft can be edited", r.status_code == 200 and len(r.json()["installments"]) == 6, r.text[:120])
r = client.get("/api/v1/leases", params={"search": "St. Mary"})
ok("it is found by customer", r.status_code == 200 and r.json()["total"] == 1)
r = client.get("/api/v1/leases", params={"status": "nonsense"})
ok("an unknown status filter is a 422", r.status_code == 422)
r = client.get("/api/v1/leases/999999")
ok("an unknown agreement is a 404", r.status_code == 404)

print()
print("Sending, and what the customer can see")
print("-" * 72)
captured = {}
real_issue = svc.issue_portal_token


def capture(agreement, days):
    token = real_issue(agreement, days)
    captured["token"] = token
    return token


svc.issue_portal_token = capture
r = client.post("/api/v1/leases/{}/send".format(LID))
svc.issue_portal_token = real_issue
ok("sending works", r.status_code == 200 and r.json()["stage"] == "awaiting_signature", r.text[:120])
TOKEN = captured["token"]
ok("sending returns the customer link, so staff can copy and share it",
   r.json().get("share_url", "").endswith("/lease/" + TOKEN), str(r.json().get("share_url")))
ok("  and the agreement itself never carries it afterwards",
   "share_url" not in client.get("/api/v1/leases/{}".format(LID)).json())

svc.issue_portal_token = capture
r = client.post("/api/v1/leases/{}/send".format(LID))
svc.issue_portal_token = real_issue
ok("resending returns a fresh link", r.status_code == 200
   and r.json().get("share_url", "").endswith("/lease/" + captured["token"]) and captured["token"] != TOKEN)
ok("  and the link it replaced stops working", client.get("/api/v1/lease-portal/{}".format(TOKEN)).status_code == 404)
TOKEN = captured["token"]

lease_emails = []
svc.send_html_email = lambda *a, **k: lease_emails.append(a) or True
svc.issue_portal_token = capture
r = client.post("/api/v1/leases/{}/send".format(LID), params={"email_customer": "false"})
svc.issue_portal_token = real_issue
svc.send_html_email = lambda *a, **k: True
ok("Share Link Only issues a fresh link and emails nobody", r.status_code == 200 and lease_emails == []
   and r.json().get("emailed") is False and r.json().get("share_url", "").endswith("/lease/" + captured["token"]),
   "{} {}".format(r.text[:120], len(lease_emails)))
latest_send = max((h for h in r.json()["history"] if h.get("action") == "sent"), key=lambda h: h["at"])
ok("  and the history records it was shared, not emailed", latest_send.get("details", {}).get("channel") == "link",
   str(latest_send)[:160])
TOKEN = captured["token"]

r = client.get("/api/v1/lease-portal/{}".format(TOKEN))
view = r.json()
ok("the customer can open the agreement", r.status_code == 200, r.text[:120])
ok("  and sees the exact wording they will sign", "Total of payments" in view.get("consent_text", ""))
for field in ("history", "authorizations", "notes", "overpayment_amount", "created_by", "customer_user_id"):
    ok("  but not the staff-only field '{}'".format(field), field not in view)
ok("  the payment form gets Square's public config only", "square" in view
   and "access_token" not in str(view["square"]).lower())
ok("a wrong link is a 404", client.get("/api/v1/lease-portal/not-a-real-token").status_code == 404)

print()
print("Signing")
print("-" * 72)
r = client.post("/api/v1/lease-portal/{}/sign".format(TOKEN),
                json={"signed_by_name": "Dr. Jane Roe", "revision": view["revision"], "agree": False})
ok("signing without ticking agreement is refused", r.status_code == 422)
r = client.post("/api/v1/lease-portal/{}/sign".format(TOKEN),
                json={"signed_by_name": "Dr. Jane Roe", "revision": 1, "agree": True})
ok("signing an out-of-date revision is refused", r.status_code == 409, str(r.status_code))
r = client.post("/api/v1/lease-portal/{}/sign".format(TOKEN),
                json={"signed_by_name": "Dr. Jane Roe", "revision": view["revision"], "agree": True})
ok("signing works", r.status_code == 200 and r.json()["stage"] == "awaiting_down_payment", r.text[:160])
view = r.json()
down = view["down_payment_invoice"]
ok("  and leaves the down payment to pay", down and down["payable"] and down["total_amount"] == "1082.50")

print()
print("Paying")
print("-" * 72)
other = client.post("/api/v1/leases", json=PAYLOAD | {"customer_email": "other@x.test"}).json()
r = client.post("/api/v1/lease-portal/{}/pay".format(TOKEN),
                json={"invoice_id": 999999, "source_id": "cnon:ok", "idempotency_key": "k-0"})
ok("an invoice that is not this agreement's cannot be paid from its link", r.status_code == 404)
r = client.post("/api/v1/lease-portal/{}/pay".format(TOKEN),
                json={"invoice_id": down["id"], "source_id": "cnon:ok", "idempotency_key": "k-1"})
ok("the down payment can be paid", r.status_code == 200, r.text[:160])
ok("  which puts the agreement in force", r.json()["stage"] == "active", r.json().get("stage"))
ok("  charging exactly the down payment", square.charges[-1][1] == D("1082.50"))
r = client.post("/api/v1/lease-portal/{}/pay".format(TOKEN),
                json={"invoice_id": down["id"], "source_id": "cnon:ok", "idempotency_key": "k-1"})
ok("paying it again does not charge twice", len(square.charges) == 1 and r.status_code == 200,
   str(len(square.charges)))

print()
print("Saving and removing a card")
print("-" * 72)
r = client.post("/api/v1/lease-portal/{}/save-card".format(TOKEN),
                json={"source_id": "cnon:card", "authorize_auto_charge": True})
ok("a card can be saved for automatic charges", r.status_code == 200 and r.json()["card"]["last4"] == "4242",
   r.text[:160])
ok("  and the customer only ever sees the masked card", "CARD-1" not in r.text and "CUS-1" not in r.text)
r = client.post("/api/v1/lease-portal/{}/remove-card".format(TOKEN), json={"confirm": False})
ok("removing needs confirmation", r.status_code == 422)
r = client.post("/api/v1/lease-portal/{}/remove-card".format(TOKEN), json={"confirm": True})
ok("removing works", r.status_code == 200 and r.json()["card"] is None and r.json()["auto_charge"] is False)

saved_keys = settings.PAYMENT_DATA_ENCRYPTION_KEYS
settings.PAYMENT_DATA_ENCRYPTION_KEYS = ""
r = client.post("/api/v1/lease-portal/{}/save-card".format(TOKEN), json={"source_id": "cnon:card"})
settings.PAYMENT_DATA_ENCRYPTION_KEYS = saved_keys
ok("a card is never stored when encryption is not configured", r.status_code == 503, str(r.status_code))

print()
print("Buying out early")
print("-" * 72)
r = client.post("/api/v1/lease-portal/{}/buyout".format(TOKEN))
ok("the customer can ask to buy out", r.status_code == 200 and r.json()["stage"] == "buyout_pending", r.text[:160])
buy = r.json()["buyout_invoice"]
ok("  the buyout is the unpaid cash price plus tax", buy["total_amount"] == "9742.50", buy["total_amount"])
r = client.post("/api/v1/lease-portal/{}/pay".format(TOKEN),
                json={"invoice_id": buy["id"], "source_id": "cnon:ok", "idempotency_key": "k-buy"})
ok("paying it completes the agreement", r.status_code == 200 and r.json()["status"] == "completed",
   r.json().get("status"))

print()
print("Staff actions")
print("-" * 72)
r = client.get("/api/v1/leases/{}".format(LID))
ok("staff see it completed by buyout", r.json()["status"] == "completed"
   and r.json()["completion_method"] == "buyout")
r = client.post("/api/v1/leases/{}/cancel".format(LID), json={"reason": "late cancel", "return_stock": True})
ok("a completed agreement cannot be cancelled", r.status_code == 409)
r = client.post("/api/v1/leases/{}/cancel".format(other["id"]), json={"reason": "no", "return_stock": True})
ok("a reason under three characters is refused", r.status_code == 422)
r = client.post("/api/v1/leases/{}/cancel".format(other["id"]), json={"reason": "Customer withdrew", "return_stock": True})
ok("a draft can be cancelled with a reason", r.status_code == 200 and r.json()["status"] == "cancelled")

print()
print("Every portal route is rate limited")
print("-" * 72)
for bucket in ("lease-portal-view", "lease-portal-sign", "lease-payment", "lease-card-save",
               "lease-card-remove", "lease-buyout"):
    ok("{} is limited".format(bucket), bucket in limited)

print()
print("=" * 72)
if failures:
    print("{} failing: {}".format(len(failures), ", ".join(failures)))
    sys.exit(1)
print("All lease API checks passed.")
