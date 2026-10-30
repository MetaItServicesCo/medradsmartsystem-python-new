"""Send, or Share Link Only, behaves the same in Sales and Rentals.

Every customer document can be emailed to the customer, or have its secure
link issued for staff to share by text, chat or any other medium. Both paths
issue the link and mark the document sent in exactly the same way; the only
difference is whether an email goes out. Lease to Own's half of this is in
test_lease_api.py.

    DATABASE_URL=sqlite:// python backend/tests/test_share_link_only.py
"""
from __future__ import annotations

import json
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
from app.api.v1.endpoints import rentals, sales  # noqa: E402
from app.core.deps import get_current_user  # noqa: E402
from app.db.base import Base, get_db  # noqa: E402
from app.models.rental import BillingFrequency, Rental  # noqa: E402
from app.models.sales import SalesQuotation  # noqa: E402
from app.models.user import User, UserRole, UserType  # noqa: E402

failures: list[str] = []


def ok(label: str, condition: bool, detail: str = "") -> None:
    print("{}  {}{}".format("PASS" if condition else "FAIL", label,
                            "  " + detail if detail else ""))
    if not condition:
        failures.append(label)


emails: list[list[str]] = []


def shared_by_link(entries) -> bool:
    return '"channel": "link"' in json.dumps(entries, default=str)


def record_email(recipients, *args, **kwargs):
    emails.append(list(recipients))
    return True


rentals.send_html_email = record_email
sales.send_html_email = record_email

engine = sa.create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
Base.metadata.create_all(engine)
Session = sessionmaker(bind=engine)

seed = Session()
boss = User(username="boss", email="boss@medrad.test", full_name="Boss", hashed_password="x",
            user_type=UserType.EMPLOYEE, role=UserRole.SUPERADMIN, is_active=True)
seed.add(boss)
seed.flush()


def rental(number):
    row = Rental(rental_number=number, customer_name="Dr. Jane Roe", customer_email="jane@clinic.test",
                 customer_phone="555-0100", customer_address="1 Main St, Plano, TX 75024",
                 secondary_recipients=[], billing_frequency=list(BillingFrequency)[0],
                 security_deposit=0, start_date=date(2026, 11, 1), end_date=date(2027, 11, 1),
                 history=[])
    seed.add(row)
    seed.flush()
    return row.id


def quotation(number):
    row = SalesQuotation(quotation_number=number, work_order="WO-" + number, created_by_id=boss.id,
                         customer_name="Dr. Jane Roe", customer_email="jane@clinic.test",
                         status="draft", history=[])
    seed.add(row)
    seed.flush()
    return row.id


RENTAL_EMAIL, RENTAL_LINK = rental("RA-0001"), rental("RA-0002")
QUOTE_EMAIL, QUOTE_LINK = quotation("SQ-0001"), quotation("SQ-0002")
seed.commit()
BOSS_ID = boss.id
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
        yield db.query(User).filter(User.id == BOSS_ID).one()
    finally:
        db.close()


api = FastAPI()
api.include_router(rentals.router, prefix="/rentals")
api.include_router(sales.router, prefix="/sales")
api.dependency_overrides[get_db] = override_db
api.dependency_overrides[get_current_user] = override_user
http = TestClient(api)

print("Share Link Only")
print("=" * 72)

print("Rentals")
print("-" * 72)
emails.clear()
r = http.post("/rentals/{}/send".format(RENTAL_EMAIL))
ok("sending emails the customer", r.status_code == 200 and emails == [["jane@clinic.test"]], r.text[:160])
ok("  and returns the link, marked as emailed", r.json().get("emailed") is True and "/rental/" in r.json().get("link", ""))

emails.clear()
r = http.post("/rentals/{}/send".format(RENTAL_LINK), params={"email_customer": "false"})
ok("Share Link Only emails nobody", r.status_code == 200 and emails == [], "{} {}".format(r.text[:160], emails))
ok("  and returns the link, marked as not emailed",
   r.json().get("emailed") is False and "/rental/" in r.json().get("link", ""))
db = Session()
shared = db.get(Rental, RENTAL_LINK)
ok("  the link is issued exactly as when sending", shared.access_token_hash is not None and shared.portal_sent_at is not None)
ok("  and the history records it was shared, not emailed", shared_by_link((shared.history or [])[-1:]),
   str((shared.history or [])[-1:])[:200])
db.close()

print()
print("Sales")
print("-" * 72)
emails.clear()
r = http.post("/sales/quotations/{}/send".format(QUOTE_EMAIL), json={"expires_in_days": 30})
ok("sending emails the customer", r.status_code == 200 and emails == [["jane@clinic.test"]], r.text[:160])
ok("  and returns the link, marked as emailed",
   r.json().get("emailed") is True and "/quotation/" in (r.json().get("primary_share_url") or ""))

emails.clear()
r = http.post("/sales/quotations/{}/send".format(QUOTE_LINK), json={"expires_in_days": 30},
              params={"email_customer": "false"})
ok("Share Link Only emails nobody", r.status_code == 200 and emails == [], "{} {}".format(r.text[:160], emails))
ok("  and returns the link, marked as not emailed",
   r.json().get("emailed") is False and "/quotation/" in (r.json().get("primary_share_url") or ""))
ok("  the quotation is marked sent exactly as when emailing", r.json().get("status") == "sent", str(r.json().get("status")))
ok("  and the history records it was shared, not emailed", shared_by_link(r.json().get("history", [])[-1:]),
   str(r.json().get("history", [])[-1:])[:200])

print()
if failures:
    print("{} check(s) failed:".format(len(failures)))
    for label in failures:
        print("  -", label)
    sys.exit(1)
print("All share-link-only checks passed")
