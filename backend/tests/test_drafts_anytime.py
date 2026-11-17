"""Save as Draft works at any time: a sales quotation or a rental agreement is
saved however much of it is filled in - nothing at all, part of it, or more
than is in stock. What a draft lacks stops it leaving: sending or converting a
quotation, and activating an agreement, check everything the form requires,
and say what is missing. Everything else is as it was: sending from the form,
creating a live agreement, and direct sales invoices keep every check.

(Lease-to-own drafts: tests/test_lease_api.py and tests/test_lease_lifecycle.py.)

    DATABASE_URL=sqlite:// python backend/tests/test_drafts_anytime.py
    DRAFTS_TEST_DB=postgresql://... (a throwaway database) runs it on Postgres.
"""
from __future__ import annotations

import logging
import os
import pathlib
import sys
from datetime import date

os.environ.setdefault("DATABASE_URL", "sqlite://")
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))
logging.disable(logging.CRITICAL)

import sqlalchemy as sa  # noqa: E402
from fastapi import FastAPI  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from sqlalchemy.orm import sessionmaker  # noqa: E402
from sqlalchemy.pool import StaticPool  # noqa: E402

import app.models  # noqa: E402,F401
from app.api.v1.endpoints import rentals, sales  # noqa: E402
from app.core.deps import get_current_user  # noqa: E402
from app.db.base import Base, get_db  # noqa: E402
from app.models.facility import Facility  # noqa: E402
from app.models.inventory import InventoryPart  # noqa: E402
from app.models.invoice import Invoice  # noqa: E402
from app.models.rental import Rental  # noqa: E402
from app.models.sales import SalesQuotation  # noqa: E402
from app.models.user import User, UserRole, UserType  # noqa: E402
from app.models.user_facility import UserFacility  # noqa: E402
from app.utils import read_cache  # noqa: E402

failures: list[str] = []


def ok(label: str, condition: bool, detail: object = "") -> None:
    print("{}  {}{}".format("PASS" if condition else "FAIL", label, f"  {str(detail)[:220]}" if not condition and detail != "" else ""))
    if not condition:
        failures.append(label)


read_cache.settings.READ_CACHE_ENABLED = False
rentals.send_html_email = lambda *a, **k: True
sales.send_html_email = lambda *a, **k: True
# DRAFTS_TEST_DB runs the same checks on a throwaway Postgres, as production uses.
engine = (
    sa.create_engine(os.environ["DRAFTS_TEST_DB"]) if os.environ.get("DRAFTS_TEST_DB")
    else sa.create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
)
Base.metadata.create_all(engine)
Session = sessionmaker(bind=engine)

seed = Session()
clinic = Facility(name="North Clinic", phone="555-0100", email="n@medrad.test", address="1 North St",
                  city="Plano", state="TX", zip_code="75024", country="US")
seed.add(clinic)
seed.flush()
boss = User(username="boss", email="boss@medrad.test", full_name="Boss", hashed_password="x",
            user_type=UserType.EMPLOYEE, role=UserRole.SUPERADMIN, is_active=True)
customer = User(username="clinicadmin", email="admin@clinic.example.com", full_name="Clinic Admin", hashed_password="x",
                user_type=UserType.CLIENT, role=UserRole.FACILITY_ADMIN, is_active=True, facility_id=clinic.id,
                phone="2145550100")
pump = InventoryPart(part_number="RNT-PUMP", part_type="rental", description="Infusion pump", unit_price=0,
                     condition="new", quantity_on_hand=5, reorder_level=0, status="active")
monitor = InventoryPart(part_number="MON-1", part_type="sales", description="Patient monitor", unit_price=1000,
                        condition="new", quantity_on_hand=2, reorder_level=0, status="active")
seed.add_all([boss, customer, pump, monitor])
seed.flush()
seed.add(UserFacility(user_id=customer.id, facility_id=clinic.id))
seed.commit()
IDS = {"boss": boss.id, "customer": customer.id}
PUMP, MONITOR, CLINIC = pump.id, monitor.id, clinic.id
seed.close()

current = {"user_id": IDS["boss"]}


def override_db():
    db = Session()
    try:
        yield db
    finally:
        db.close()


def override_user():
    db = Session()
    try:
        yield db.query(User).filter(User.id == current["user_id"]).one()
    finally:
        db.close()


api = FastAPI()
api.include_router(sales.router, prefix="/sales")
api.include_router(rentals.router, prefix="/rentals")
api.dependency_overrides[get_db] = override_db
api.dependency_overrides[get_current_user] = override_user
http = TestClient(api)


def count(model) -> int:
    db = Session()
    try:
        return db.query(model).count()
    finally:
        db.close()


def stock(part_id) -> int:
    db = Session()
    try:
        return db.get(InventoryPart, part_id).quantity_on_hand
    finally:
        db.close()


ADDRESS = "1 North St, Plano, TX 75024"
COMPLETE_QUOTE = {
    "customer_name": "Walk-in Clinic", "customer_email": "walkin@clinic.example.com", "customer_phone": "2145550111",
    "customer_address": ADDRESS, "quotation_type": "standard",
    "items": [{"part_id": MONITOR, "quantity": 1}],
}

print("Sales quotations")
print("=" * 72)
r = http.post("/sales/quotations", json={"save_as_draft": True})
empty = r.json()
ok("an empty quotation is saved as a draft", r.status_code == 201 and empty["status"] == "draft"
   and empty["line_items"] == [] and empty["customer_name"] == "", r.text[:200])
r = http.post("/sales/quotations", json={"save_as_draft": True, "customer_name": "Half Done", "customer_email": ""})
ok("  an empty email box is no email, not an error", r.status_code == 201 and r.json()["customer_email"] is None, r.text[:160])
HALF = r.json()["id"]
r = http.post(f"/sales/quotations/{empty['id']}/send", json={"expires_in_days": 30}, params={"email_customer": False})
ok("it cannot be sent, and says everything it is missing", r.status_code == 400
   and r.json()["detail"] == ("This draft is not complete. Before sending it, add the customer name, the customer phone, "
                              "the customer address and at least one sales part."), r.text[:240])
r = http.post(f"/sales/quotations/{empty['id']}/convert-to-invoice", json={})
ok("  nor converted to an invoice", r.status_code == 400 and "Before converting it" in r.json()["detail"], r.text[:200])

r = http.post("/sales/quotations", json=COMPLETE_QUOTE | {"items": [{"part_id": MONITOR, "quantity": 5}], "save_as_draft": True})
ok("more than is in stock is saved as a draft", r.status_code == 201 and len(r.json()["line_items"]) == 1, r.text[:200])
OVER = r.json()["id"]
r = http.post(f"/sales/quotations/{OVER}/send", json={"expires_in_days": 30}, params={"email_customer": False})
ok("  but sending it checks the stock, as before", r.status_code == 409 and "available" in r.json()["detail"], r.text[:200])

r = http.put(f"/sales/quotations/{HALF}", json={"items": [], "customer_phone": "2145550111", "save_as_draft": True})
ok("a draft is edited and saved again, still incomplete", r.status_code == 200 and r.json()["customer_phone"] == "2145550111", r.text[:200])
r = http.put(f"/sales/quotations/{HALF}", json={**COMPLETE_QUOTE, "customer_name": "Half Done", "save_as_draft": True})
ok("  then completed", r.status_code == 200 and len(r.json()["line_items"]) == 1, r.text[:200])
r = http.post(f"/sales/quotations/{HALF}/send", json={"expires_in_days": 30}, params={"email_customer": False})
ok("  and now it is sent", r.status_code == 200 and r.json()["status"] == "sent", r.text[:200])

print()
print("Sales: as before, without the draft flag")
print("-" * 72)
before = count(SalesQuotation)
r = http.post("/sales/quotations", json=COMPLETE_QUOTE | {"items": []})
ok("creating to send still needs a part", r.status_code == 400 and r.json()["detail"] == "At least one sales part is required"
   and count(SalesQuotation) == before)
r = http.post("/sales/quotations", json=COMPLETE_QUOTE | {"items": [{"part_id": MONITOR, "quantity": 5}]})
ok("  and enough stock", r.status_code == 409 and count(SalesQuotation) == before, r.text[:160])
r = http.post("/sales/quotations", json=COMPLETE_QUOTE | {"customer_email": "not-an-email", "save_as_draft": True})
ok("  a mistyped email is refused, even in a draft", r.status_code == 422)
r = http.put(f"/sales/quotations/{empty['id']}", json={"items": []})
ok("  editing a draft without saving it as a draft keeps every check", r.status_code == 400)
r = http.post("/sales/quotations", json=COMPLETE_QUOTE)
SENDABLE = r.json()["id"]
r = http.post(f"/sales/quotations/{SENDABLE}/send", json={"expires_in_days": 30}, params={"email_customer": False})
ok("a complete quotation is sent as before", r.status_code == 200 and r.json()["status"] == "sent", r.text[:160])
r = http.post(f"/sales/quotations/{SENDABLE}/send", json={"expires_in_days": 30}, params={"email_customer": False})
ok("  and resent as before", r.status_code == 200, r.text[:160])
db = Session()
legacy = SalesQuotation(quotation_number="SQ-LEGACY", work_order="WO-LEGACY", created_by_id=IDS["boss"],
                        customer_name="Dr. Jane Roe", customer_email="jane@clinic.example.com", status="draft", history=[])
db.add(legacy)
db.commit()
LEGACY = legacy.id
db.close()
r = http.post(f"/sales/quotations/{LEGACY}/send", json={"expires_in_days": 30}, params={"email_customer": False})
ok("a draft never saved through Save as Draft (older data) is sent as before", r.status_code == 200, r.text[:200])
r = http.put(f"/sales/quotations/{empty['id']}", json={**COMPLETE_QUOTE})
r = http.post(f"/sales/quotations/{empty['id']}/send", json={"expires_in_days": 30}, params={"email_customer": False})
ok("a draft completed and saved from the form to send is sent", r.status_code == 200, r.text[:200])
r = http.post("/sales/direct-invoices", json={"save_as_draft": True, "customer_name": "X"})
ok("a direct invoice keeps its rules: no part, no invoice", r.status_code == 400
   and r.json()["detail"] == "At least one sales part is required", r.text[:160])


def agreement(**over):
    data = {
        "facility_id": CLINIC, "customer_user_id": IDS["customer"],
        "customer_name": "Clinic Admin", "customer_email": "admin@clinic.example.com", "customer_phone": "(214) 555-0100",
        "delivery_street": "1 North St", "delivery_city": "Plano", "delivery_state": "TX", "delivery_zip": "75024",
        "billing_frequency": "monthly", "start_date": str(date(2026, 11, 1)), "end_date": str(date(2027, 4, 30)),
        "committed_periods": 6, "discount_requires_card": False,
        "items": [{"part_id": PUMP, "quantity": 1, "rental_rate": "250.00", "security_deposit": "100.00"}],
    }
    data.update(over)
    return data


print()
print("Rental agreements")
print("=" * 72)
r = http.post("/rentals", json={"billing_frequency": "monthly", "start_date": "", "end_date": "", "customer_email": "",
                                "save_as_draft": True})
blank = r.json()
ok("an empty agreement is saved as a draft", r.status_code == 201 and blank["status"] == "draft"
   and blank["start_date"] is None and blank["end_date"] is None and blank["items"] == [], r.text[:200])
ok("  with no billing dates yet, and nothing reserved", blank["next_payment"] is None and stock(PUMP) == 5)
ok("  it is listed with the rest", any(row["id"] == blank["id"] for row in http.get("/rentals", params={"limit": 100}).json()["items"]))
ok("  and opens", http.get(f"/rentals/agreements/{blank['id']}/detail").status_code == 200)
r = http.post(f"/rentals/{blank['id']}/activate")
ok("it cannot be activated, and says what it needs", r.status_code == 400 and r.json()["detail"] == (
    "This draft is not complete. Before activating it, add the customer name, the customer email, the customer phone, "
    "the delivery address, at least one rental product, the committed billing periods, the start date and the end date."),
   r.text[:300])
ok("  nothing reserved, no invoice", stock(PUMP) == 5 and count(Invoice) == 0)

r = http.put(f"/rentals/{blank['id']}", json={"customer_name": "Clinic Admin", "items": [], "start_date": "2026-11-01",
                                              "end_date": "", "save_as_draft": True})
ok("a draft is edited and saved again, still incomplete", r.status_code == 200 and r.json()["start_date"] == "2026-11-01"
   and r.json()["end_date"] is None, r.text[:200])
r = http.put(f"/rentals/{blank['id']}", json=agreement(save_as_draft=False) | {"save_as_draft": False})
ok("  then completed, as the form does before activating", r.status_code == 200, r.text[:200])
r = http.post(f"/rentals/{blank['id']}/activate")
ok("  and activated exactly as before: live, stock reserved, first invoice", r.status_code == 200
   and r.json()["status"] == "active" and stock(PUMP) == 4 and count(Invoice) == 1, r.text[:200])

r = http.post("/rentals", json=agreement(items=[{"part_id": PUMP, "quantity": 9, "rental_rate": "250.00"}], save_as_draft=True))
ok("more than is in stock is saved as a draft", r.status_code == 201, r.text[:160])
r = http.post(f"/rentals/{r.json()['id']}/activate")
ok("  activating it checks the stock, as before", r.status_code in (400, 409) and stock(PUMP) == 4, r.text[:160])

r = http.post("/rentals", json=agreement(discount_type="flat", discount_value="50", save_as_draft=True))
DISC = r.json()["id"]
ok("a discount with no invoice chosen is saved as a draft", r.status_code == 201, r.text[:160])
r = http.post(f"/rentals/{DISC}/activate")
ok("  activating it checks the discount, as creating one does", r.status_code == 422
   and "invoice number where the discount applies" in r.json()["detail"], r.text[:160])

print()
print("Rentals: as before, without the draft flag")
print("-" * 72)
before = count(Rental)
for label, body in (
    ("a live agreement still needs the customer email", agreement(customer_email="")),
    ("  and its dates", agreement(end_date="")),
    ("  and a delivery address", agreement(delivery_street="", delivery_city="", delivery_state="", delivery_zip="")),
    ("  and a product", agreement(items=[])),
    ("  and its committed periods", agreement(committed_periods=None)),
):
    r = http.post("/rentals", json=body)
    ok(label, r.status_code in (400, 422) and count(Rental) == before, f"{r.status_code} {r.text[:160]}")
r = http.post("/rentals", json=agreement())
ok("a complete live agreement is created as before", r.status_code == 201 and r.json()["status"] == "active"
   and stock(PUMP) == 3, r.text[:160])
LIVE = r.json()["id"]
def end_of(rental_id):
    return next(row for row in http.get("/rentals", params={"limit": 100}).json()["items"] if row["id"] == rental_id)["end_date"]


r = http.put(f"/rentals/{LIVE}", json={"end_date": "", "save_as_draft": True})
ok("  a live agreement cannot have a date cleared, flag or not", r.status_code == 422 and end_of(LIVE) == "2027-04-30",
   f"{r.status_code} {r.text[:160]}")
r = http.put(f"/rentals/{LIVE}", json={"end_date": None})
ok("  nor set to nothing", r.status_code == 422 and end_of(LIVE) == "2027-04-30", f"{r.status_code} {r.text[:160]}")
r = http.put(f"/rentals/{LIVE}", json={"terms_and_conditions": "Net 30"})
ok("  and is edited as before", r.status_code == 200 and end_of(LIVE) == "2027-04-30", r.text[:160])

print()
print("=" * 72)
if failures:
    print(f"{len(failures)} FAILED: {failures}")
    sys.exit(1)
print("ALL PASSED")
