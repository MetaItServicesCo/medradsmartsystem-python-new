"""A customer asks for changes to a rental agreement, as on a sales quotation.

    A. From the agreement link the customer asks for changes, saying what to
       change; an empty request is refused.
    B. Staff see the request in the customer's words on the agreement, and are
       notified with the start of it.
    C. While it is open the agreement cannot be signed, and no second request
       is taken; the customer sees what they asked for.
    D. Sending the link again (after editing the agreement) closes it: the
       agreement can be signed. The request stays in the history.
    E. A signed, cancelled or completed agreement takes no request; nothing
       else about the agreement changes (status, stock, invoices).

    DATABASE_URL=sqlite:// venv312/Scripts/python.exe tests/test_rental_change_requests.py
"""
from __future__ import annotations

import logging
import os
import pathlib
import sys
from datetime import date, timedelta

os.environ.setdefault("DATABASE_URL", "sqlite://")
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))
sys.modules.setdefault("magic", None)
logging.disable(logging.CRITICAL)

import sqlalchemy as sa  # noqa: E402
from fastapi import FastAPI  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from sqlalchemy.orm import sessionmaker  # noqa: E402
from sqlalchemy.pool import StaticPool  # noqa: E402

import app.models  # noqa: E402,F401
from app.api.v1.endpoints import rental_portal, rentals  # noqa: E402
from app.core.deps import get_current_user  # noqa: E402
from app.db.base import Base, get_db  # noqa: E402
from app.models.inventory import InventoryPart  # noqa: E402
from app.models.invoice import Invoice  # noqa: E402
from app.models.notification import Notification  # noqa: E402
from app.models.rental import Rental, RentalStatus  # noqa: E402
from app.models.user import User, UserRole, UserType  # noqa: E402
from app.utils import read_cache, rental_billing  # noqa: E402

failures: list[str] = []


def ok(label: str, condition: bool, detail: object = "") -> None:
    print("{}  {}{}".format("PASS" if condition else "FAIL", label, f"  {str(detail)[:240]}" if not condition and detail != "" else ""))
    if not condition:
        failures.append(label)


read_cache.settings.READ_CACHE_ENABLED = False
rentals.send_html_email = lambda *a, **k: True
rental_billing._email_invoice_due = lambda *a, **k: False
engine = sa.create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
Base.metadata.create_all(engine)
Session = sessionmaker(bind=engine)
seed = Session()
boss = User(username="boss", email="boss@medrad.test", full_name="Boss", hashed_password="x",
            user_type=UserType.EMPLOYEE, role=UserRole.SUPERADMIN, is_active=True)
bed = InventoryPart(part_number="MBTS0019", part_type="rental", description="Hospital Bed", unit_price=0,
                    condition="new", quantity_on_hand=50, reorder_level=0, status="active")
seed.add_all([boss, bed])
seed.commit()
BOSS, BED = boss.id, bed.id
seed.close()


def override_db():
    db = Session()
    try:
        yield db
    finally:
        db.close()


def override_user():
    db = Session()
    try:
        yield db.get(User, BOSS)
    finally:
        db.close()


api = FastAPI()
api.include_router(rentals.router, prefix="/rentals")
api.include_router(rental_portal.router)
api.dependency_overrides[get_db] = override_db
api.dependency_overrides[get_current_user] = override_user
http = TestClient(api)
TODAY = date.today()


def agreement():
    r = http.post("/rentals", json={
        "customer_name": "Clinic Buyer", "customer_email": "c@clinic.example.com", "customer_phone": "2145550100",
        "delivery_street": "1 St", "delivery_city": "Plano", "delivery_state": "TX", "delivery_zip": "75024",
        "billing_frequency": "monthly", "start_date": str(TODAY),
        "end_date": str(rental_billing.advance_billing_date(TODAY, "monthly", 1) - timedelta(days=1)),
        "committed_periods": 1, "discount_requires_card": False,
        "items": [{"part_id": BED, "quantity": 1, "rental_rate": "750.00", "setup_fee": "0", "removal_fee": "0",
                   "shipping_fee": "0", "security_deposit": "0", "labor_fee": "0"}]})
    assert r.status_code == 201, r.text
    return r.json()


def send(rental_id):
    r = http.post(f"/rentals/{rental_id}/send", params={"email_customer": "false"})
    assert r.status_code == 200, r.text
    return r.json()["link"].rsplit("/", 1)[-1]


def row(rental_id):
    db = Session()
    try:
        return db.get(Rental, rental_id)
    finally:
        db.close()


def stock():
    db = Session()
    try:
        return db.get(InventoryPart, BED).quantity_on_hand
    finally:
        db.close()


def invoice_count(rental_id):
    db = Session()
    try:
        return db.query(Invoice).filter(Invoice.rental_id == rental_id).count()
    finally:
        db.close()


WORDS = "Please deliver on Monday instead.\nAnd add a second mattress."
SIGN = {"signature_name": "Clinic Buyer", "terms_accepted": True}

print("A. Asking for changes")
a = agreement()
token = send(a["id"])
before_stock, before_invoices = stock(), invoice_count(a["id"])
view = http.get(f"/rentals/public/{token}").json()
ok("an unsigned agreement offers Request Changes alongside signing", view["can_request_changes"] is True and view["can_sign"] is True and view["change_request"] is None)
for blank in ("", "   \n "):
    r = http.post(f"/rentals/public/{token}/request-changes", json={"comments": blank})
    ok(f"an empty request is refused ({blank!r})", r.status_code == 422 and "describe the changes" in r.text, r.text)
r = http.post(f"/rentals/public/{token}/request-changes", json={"comments": "x" * 5001})
ok("comments over 5,000 characters are refused", r.status_code == 422)
r = http.post(f"/rentals/public/{token}/request-changes", json={"comments": WORDS})
ok("a request saying what to change is taken", r.status_code == 200, r.text)
portal = r.json()

print("\nB. Staff see it")
entry = (row(a["id"]).history or [])[-1]
ok("it is kept in the agreement's history, in the customer's words", entry["action"] == "changes_requested" and entry["details"]["comments"] == WORDS and entry["by"] == "Clinic Buyer", entry)
listed = next(item for item in http.get("/rentals").json()["items"] if item["id"] == a["id"])
ok("the agreements list carries the open request", listed["change_request"]["comments"] == WORDS and listed["change_request"]["by"] == "Clinic Buyer", listed.get("change_request"))
db = Session()
note = db.query(Notification).filter(Notification.user_id == BOSS).order_by(Notification.id.desc()).first()
db.close()
ok("admins are notified with the start of the request", note is not None and note.title == f"Rental changes requested: {a['rental_number']}"
   and '"Please deliver on Monday instead. And add a second mattress."' in (note.message or ""), getattr(note, "message", None))

print("\nC. While it is open")
ok("the customer sees what they asked for", portal["change_request"]["comments"] == WORDS)
ok("  and cannot sign, or ask again", portal["can_sign"] is False and portal["can_request_changes"] is False)
r = http.post(f"/rentals/public/{token}/accept", json=SIGN)
ok("signing is refused until the revised agreement is sent", r.status_code == 409 and "revised agreement" in r.text, r.text)
r = http.post(f"/rentals/public/{token}/request-changes", json={"comments": "again"})
ok("a second request is not taken while one is open", r.status_code == 409, r.text)
current = row(a["id"])
ok("nothing else changed: status, stock, invoices", current.status == RentalStatus.ACTIVE and stock() == before_stock and invoice_count(a["id"]) == before_invoices)

print("\nD. Staff edit and send again")
r = http.put(f"/rentals/{a['id']}", json={"notes": "Delivery moved to Monday; second mattress added."})
ok("staff can edit the unsigned agreement", r.status_code == 200, r.text)
new_token = send(a["id"])
listed = next(item for item in http.get("/rentals").json()["items"] if item["id"] == a["id"])
ok("sending the link again closes the request for staff", listed["change_request"] is None)
view = http.get(f"/rentals/public/{new_token}").json()
ok("  and for the customer, who can sign", view["change_request"] is None and view["can_sign"] is True and view["can_request_changes"] is True)
ok("the old link no longer works", http.get(f"/rentals/public/{token}").status_code == 404)
r = http.post(f"/rentals/public/{new_token}/accept", json=SIGN)
ok("the revised agreement is signed", r.status_code == 200 and r.json()["acceptance"] is not None, r.text)
ok("the request stays in the history", any(e.get("action") == "changes_requested" for e in row(a["id"]).history))

print("\nE. No request once signed or closed")
r = http.post(f"/rentals/public/{new_token}/request-changes", json={"comments": "One more thing"})
ok("a signed agreement takes no request", r.status_code == 409 and "already signed" in r.text, r.text)
ok("  and offers none", http.get(f"/rentals/public/{new_token}").json()["can_request_changes"] is False)
b = agreement()
b_token = send(b["id"])
db = Session()
db.get(Rental, b["id"]).status = RentalStatus.CANCELLED
db.commit()
db.close()
r = http.post(f"/rentals/public/{b_token}/request-changes", json={"comments": "Change it"})
ok("a cancelled agreement takes no request", r.status_code == 409 and "no longer open" in r.text, r.text)
c = agreement()
c_token = send(c["id"])
r = http.post(f"/rentals/public/{c_token}/accept", json=SIGN)
ok("an agreement with no request signs exactly as before", r.status_code == 200 and r.json()["acceptance"] is not None, r.text)

print()
if failures:
    print(f"{len(failures)} check(s) failed")
    sys.exit(1)
print("All rental change request checks passed")
