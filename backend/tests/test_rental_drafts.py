"""A rental agreement can be saved as a draft, then activated.

Creating a rental makes it live at once: stock is reserved, the first invoice
is raised, and billing begins. A draft must do none of that until staff
activate it, and activation must then do exactly what creating a live rental
does, against the stock available at that moment. Customers never see a draft,
just as they never see an unsent sales quotation.

    DATABASE_URL=sqlite:// python backend/tests/test_rental_drafts.py
"""
from __future__ import annotations

import os
import pathlib
import sys
from datetime import date

os.environ.setdefault("DATABASE_URL", "sqlite://")
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))

import sqlalchemy as sa  # noqa: E402
from fastapi import FastAPI  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from sqlalchemy.orm import sessionmaker  # noqa: E402
from sqlalchemy.pool import StaticPool  # noqa: E402

import app.models  # noqa: E402,F401
from app.api.v1.endpoints import rental_portal, rentals  # noqa: E402
from app.core.deps import get_current_user  # noqa: E402
from app.db.base import Base, get_db  # noqa: E402
from app.models.facility import Facility  # noqa: E402
from app.models.inventory import InventoryPart  # noqa: E402
from app.models.invoice import Invoice  # noqa: E402
from app.models.rental import Rental  # noqa: E402
from app.models.user import User, UserRole, UserType  # noqa: E402
from app.models.user_facility import UserFacility  # noqa: E402
from app.utils import read_cache  # noqa: E402

failures: list[str] = []


def ok(label: str, condition: bool, detail: str = "") -> None:
    print("{}  {}{}".format("PASS" if condition else "FAIL", label,
                            "  " + detail if detail else ""))
    if not condition:
        failures.append(label)


read_cache.settings.READ_CACHE_ENABLED = False
rentals.send_html_email = lambda *a, **k: True
engine = sa.create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
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
                user_type=UserType.CLIENT, role=UserRole.FACILITY_ADMIN, is_active=True, facility_id=clinic.id)
pump = InventoryPart(part_number="RNT-PUMP", part_type="rental", description="Infusion pump", unit_price=0,
                     condition="new", quantity_on_hand=5, reorder_level=0, status="active")
seed.add_all([boss, customer, pump])
seed.flush()
seed.add(UserFacility(user_id=customer.id, facility_id=clinic.id))
seed.commit()
IDS = {"boss": boss.id, "customer": customer.id}
PUMP, CLINIC = pump.id, clinic.id
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
api.include_router(rentals.router, prefix="/rentals")
api.include_router(rental_portal.router)
api.dependency_overrides[get_db] = override_db
api.dependency_overrides[get_current_user] = override_user
http = TestClient(api)


def as_user(name):
    current["user_id"] = IDS[name]


def stock() -> int:
    db = Session()
    try:
        return db.get(InventoryPart, PUMP).quantity_on_hand
    finally:
        db.close()


def invoices_for(rental_id) -> int:
    db = Session()
    try:
        return db.query(Invoice).filter(Invoice.rental_id == rental_id).count()
    finally:
        db.close()


def payload(quantity=1, draft=True):
    return {
        "facility_id": CLINIC, "customer_user_id": IDS["customer"],
        "customer_name": "Clinic Admin", "customer_email": "admin@clinic.example.com", "customer_phone": "(214) 555-0100",
        "delivery_street": "1 North St", "delivery_city": "Plano", "delivery_state": "TX", "delivery_zip": "75024",
        "billing_frequency": "monthly", "start_date": str(date(2026, 11, 1)), "end_date": str(date(2027, 4, 30)),
        "committed_periods": 6, "discount_requires_card": False,
        "items": [{"part_id": PUMP, "quantity": quantity, "rental_rate": "250.00", "security_deposit": "100.00"}],
        "save_as_draft": draft,
    }


def listed(name):
    as_user(name)
    return {row["id"] for row in http.get("/rentals", params={"limit": 100}).json().get("items", [])}


print("Rental drafts")
print("=" * 72)

as_user("boss")
r = http.post("/rentals", json=payload(quantity=1))
ok("Save as Draft creates the agreement", r.status_code == 201, r.text[:200])
DRAFT = r.json().get("id")
ok("  as a draft", r.json().get("status") == "draft", str(r.json().get("status")))
ok("  without reserving any stock", stock() == 5, str(stock()))
ok("  without raising an invoice", invoices_for(DRAFT) == 0, str(invoices_for(DRAFT)))

ok("staff see the draft in the list", DRAFT in listed("boss"))
ok("the facility customer does not", DRAFT not in listed("customer"))
as_user("customer")
ok("  nor can they open it", http.get("/rentals/agreements/{}/detail".format(DRAFT)).status_code == 404)
ok("  nor reach it through their account portal", http.get("/rentals/account/{}".format(DRAFT)).status_code == 404)

as_user("boss")
r = http.post("/rentals/{}/send".format(DRAFT))
ok("a draft cannot be sent to the customer", r.status_code == 409, r.text[:160])
r = http.put("/rentals/{}".format(DRAFT), json={"status": "active"})
ok("a draft cannot go live through a status edit, which would skip stock and billing", r.status_code == 409, r.text[:160])
r = http.put("/rentals/{}".format(DRAFT), json={"items": [{"part_id": PUMP, "quantity": 2, "rental_rate": "250.00", "security_deposit": "100.00"}]})
ok("a draft can be edited", r.status_code == 200 and r.json().get("status") == "draft", r.text[:160])
ok("  still without touching stock", stock() == 5, str(stock()))

r = http.post("/rentals/{}/activate".format(DRAFT))
ok("activating makes it live", r.status_code == 200 and r.json().get("status") == "active", r.text[:200])
ok("  reserving its stock now", stock() == 3, str(stock()))
ok("  and raising the first invoice", invoices_for(DRAFT) == 1, str(invoices_for(DRAFT)))
ok("it cannot be activated twice", http.post("/rentals/{}/activate".format(DRAFT)).status_code == 409)
r = http.put("/rentals/{}".format(DRAFT), json={"status": "draft"})
ok("a live agreement cannot be turned back into a draft", r.status_code == 409, r.text[:160])
ok("the customer sees it once it is live", DRAFT in listed("customer"))

as_user("boss")
r = http.post("/rentals", json=payload(quantity=10))
BIG = r.json().get("id")
ok("a draft can be saved for more than is in stock today", r.status_code == 201 and stock() == 3, r.text[:160])
r = http.post("/rentals/{}/activate".format(BIG))
ok("  but activation checks stock at that moment and refuses", r.status_code == 400, r.text[:160])
db = Session()
big = db.get(Rental, BIG)
ok("  leaving it a draft with nothing reserved or invoiced",
   big.status.value == "draft" and stock() == 3 and invoices_for(BIG) == 0, "{} {}".format(big.status, stock()))
db.close()
r = http.delete("/rentals/{}".format(BIG))
ok("a draft can be deleted", r.status_code == 200, r.text[:160])
ok("  with stock untouched", stock() == 3, str(stock()))

r = http.post("/rentals", json=payload(quantity=1, draft=False))
LIVE = r.json().get("id")
ok("creating without Save as Draft is unchanged: live at once",
   r.status_code == 201 and r.json().get("status") == "active" and stock() == 2 and invoices_for(LIVE) == 1,
   "{} stock={} invoices={}".format(r.json().get("status"), stock(), invoices_for(LIVE)))

print()
if failures:
    print("{} check(s) failed:".format(len(failures)))
    for label in failures:
        print("  -", label)
    sys.exit(1)
print("All rental draft checks passed")
