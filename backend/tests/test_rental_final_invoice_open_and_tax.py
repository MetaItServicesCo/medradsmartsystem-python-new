"""Rental billing: no double billing, agreements kept open, tax that follows the lines.

A. "Convert to Invoice" bills only what no invoice has billed. The first
   invoice already carries period one and the one-time fees, so a one-period
   agreement converted straight away has nothing left to bill -- unless a fee
   was left off the first invoice on purpose (removal, billed on collection),
   the equipment came back late, or extra charges are entered. The periods it
   bills are recorded, so the schedule never bills them again. An agreement
   from before scheduled billing is billed whole, exactly as before.
B. An agreement can be kept open until returned: committed periods are the
   minimum term, then one period at a time while anything is out. Fixed-term
   agreements bill exactly as before.
C. Changing a rental invoice's lines in Billing recalculates its tax by the
   rule it was made with (8.25% on rent and logistics, never on deposits or
   labor) -- unless Billing typed the tax in. Other edits leave tax alone.

    DATABASE_URL=sqlite:// venv312/Scripts/python.exe tests/test_rental_final_invoice_open_and_tax.py
"""
from __future__ import annotations

import logging
import os
import pathlib
import sys
from datetime import date, timedelta
from decimal import Decimal as D

os.environ.setdefault("DATABASE_URL", "sqlite://")
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))
logging.disable(logging.CRITICAL)

import sqlalchemy as sa  # noqa: E402
from fastapi import FastAPI  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from sqlalchemy.orm import sessionmaker  # noqa: E402
from sqlalchemy.pool import StaticPool  # noqa: E402

import app.models  # noqa: E402,F401
from app.api.v1.endpoints import rentals  # noqa: E402
from app.core.deps import get_current_user  # noqa: E402
from app.db.base import Base, get_db  # noqa: E402
from app.models.inventory import InventoryPart  # noqa: E402
from app.models.invoice import Invoice, InvoiceStatus  # noqa: E402
from app.models.rental import Rental, RentalItem, RentalItemStatus, RentalStatus  # noqa: E402
from app.models.user import User, UserRole, UserType  # noqa: E402
from app.utils import read_cache, rental_billing  # noqa: E402
from app.utils.invoice_editing import editable_line_items  # noqa: E402
from app.utils.rental_billing import run_rental_recurring_billing  # noqa: E402

failures: list[str] = []


def ok(label: str, condition: bool, detail: object = "") -> None:
    print("{}  {}{}".format("PASS" if condition else "FAIL", label, f"  {str(detail)[:240]}" if not condition and detail != "" else ""))
    if not condition:
        failures.append(label)


read_cache.settings.READ_CACHE_ENABLED = False
rentals.send_html_email = lambda *a, **k: True
rental_billing._email_invoice_due = lambda *a, **k: False
# RENTAL_TEST_DB runs the same checks on a throwaway Postgres, as production uses.
engine = (
    sa.create_engine(os.environ["RENTAL_TEST_DB"]) if os.environ.get("RENTAL_TEST_DB")
    else sa.create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
)
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
api.dependency_overrides[get_db] = override_db
api.dependency_overrides[get_current_user] = override_user
http = TestClient(api)
TODAY = date.today()


def agreement(committed=1, freq="monthly", open_ended=False, start=None, rate="750.00", setup="750.00",
              removal="750.00", shipping="0", deposit="0", labor="0"):
    start = start or TODAY
    end = {"monthly": rental_billing.advance_billing_date(start, "monthly", committed) - timedelta(days=1),
           "weekly": start + timedelta(days=7 * committed - 1)}[freq]
    r = http.post("/rentals", json={
        "customer_name": "Clinic", "customer_email": "c@clinic.example.com", "customer_phone": "2145550100",
        "delivery_street": "1 St", "delivery_city": "Plano", "delivery_state": "TX", "delivery_zip": "75024",
        "billing_frequency": freq, "start_date": str(start), "end_date": str(end), "committed_periods": committed,
        "open_ended": open_ended, "discount_requires_card": False,
        "items": [{"part_id": BED, "quantity": 1, "rental_rate": rate, "setup_fee": setup, "removal_fee": removal,
                   "shipping_fee": shipping, "security_deposit": deposit, "labor_fee": labor}]})
    assert r.status_code == 201, r.text
    return r.json()


def invoices(rental_id):
    db = Session()
    try:
        return db.query(Invoice).filter(Invoice.rental_id == rental_id).order_by(Invoice.id).all()
    finally:
        db.close()


def rental_row(rental_id):
    db = Session()
    try:
        return db.get(Rental, rental_id)
    finally:
        db.close()


def convert(rental_id, **extra):
    return http.post(f"/rentals/{rental_id}/convert-to-invoice", json={"action": "convert_to_invoice", **extra})


def edit_lines(invoice_id, keep, **extra):
    invoice = [i for i in invoices_all() if i.id == invoice_id][0]
    lines = [line for line in editable_line_items(invoice.notes) if keep(line)]
    subtotal = sum(D(str(line["total_amount"])) for line in lines)
    body = {"line_items": lines, "subtotal": str(subtotal), "tax_amount": str(invoice.tax_amount),
            "total_amount": str(subtotal + D(str(invoice.tax_amount)) - D(str(invoice.discount_amount or 0)))}
    body.update(extra)
    return http.put(f"/rentals/invoices/{invoice_id}", json=body)


def invoices_all():
    db = Session()
    try:
        return db.query(Invoice).all()
    finally:
        db.close()


def bill(days_ahead):
    db = Session()
    try:
        run_rental_recurring_billing(db, today=TODAY + timedelta(days=days_ahead))
    finally:
        db.close()


def set_return(rental_id, returned_on):
    db = Session()
    rental = db.get(Rental, rental_id)
    rental.actual_return_date = returned_on
    for item in rental.items:
        item.item_status = RentalItemStatus.RETURNED.value
    db.commit()
    db.close()


print("A. Convert to Invoice bills only what is left")
r = agreement(committed=1, removal="0")
first = invoices(r["id"])
ok("a one-period agreement's first invoice carries period one and its fees", len(first) == 1
   and D(str(first[0].subtotal)) == D("1500.00"), [(i.invoice_number, i.subtotal) for i in first])
c = convert(r["id"])
ok("converting it straight away bills nothing twice: refused, nothing created",
   c.status_code == 409 and "Nothing is left to bill" in c.json()["detail"] and len(invoices(r["id"])) == 1, c.text[:200])
c = convert(r["id"], worked_hours="120.00", service_fee="80.00")
final = invoices(r["id"])[-1]
ok("extra charges alone are billed, untaxed (labor and service)", c.status_code == 200 and len(invoices(r["id"])) == 2
   and D(str(final.subtotal)) == D("200.00") and D(str(final.tax_amount)) == D("0.00"), c.text[:200])
ok("  and listed line by line", [l["item_number"] for l in editable_line_items(final.notes)] == ["WORKED-HOURS", "SERVICE-FEE"])

# RNT-000107: the removal fee taken off the first invoice on purpose, billed on collection.
r = agreement(committed=1)
opening = invoices(r["id"])[0]
e = edit_lines(opening.id, lambda line: line["item_number"] != "REMOVAL")
opening = invoices(r["id"])[0]
ok("(removal taken off the first invoice in Billing; its tax follows: 8.25% of $1,500)", e.status_code == 200
   and D(str(opening.subtotal)) == D("1500.00") and D(str(opening.tax_amount)) == D("123.75")
   and D(str(opening.total_amount)) == D("1623.75"), (e.text[:160], opening.subtotal, opening.tax_amount, opening.total_amount))
preview = http.get(f"/rentals/{r['id']}/final-invoice-preview").json()
ok("the preview shows rent and setup billed, removal not", preview["unbilled_periods"] == 0 and D(preview["rent"]) == 0
   and {f["kind"]: f["already_billed"] for f in preview["fees"] if D(f["amount"]) > 0} == {"setup": True, "removal": False}, preview)
c = convert(r["id"])
final = invoices(r["id"])[-1]
ok("the final invoice bills only the removal: $750 + $61.88 tax", c.status_code == 200
   and D(str(final.subtotal)) == D("750.00") and D(str(final.tax_amount)) == D("61.88")
   and D(str(final.total_amount)) == D("811.88"), (final.subtotal, final.tax_amount, final.total_amount))

# RNT-000108's clean-up: the duplicate cancelled in Billing, the removal billed at pickup.
r = agreement(committed=1)
opening = invoices(r["id"])[0]
edit_lines(opening.id, lambda line: line["item_number"] != "REMOVAL")
db = Session()
rental = db.get(Rental, r["id"])
duplicate = Invoice(invoice_number="INV-RENTAL-DUP", invoice_type="rental", customer_name="Clinic", customer_email="c@x.example.com",
                    rental_id=rental.id, subtotal=D("2250"), tax_amount=D("185.63"), discount_amount=D("0"), total_amount=D("2435.63"),
                    amount_paid=D("0"), balance_due=D("2435.63"), status=InvoiceStatus.PENDING, issue_date=TODAY, due_date=TODAY,
                    notes="Rental invoice for agreement (old convert)")
db.add(duplicate)
db.flush()
rental.converted_invoice_id = duplicate.id
db.commit()
DUP = duplicate.id
db.close()
ok("(an old duplicate made by Convert to Invoice before this fix)", convert(r["id"]).json().get("invoice_number") == "INV-RENTAL-DUP")
cancel = http.put(f"/rentals/invoices/{DUP}", json={"status": "cancelled"})
c = convert(r["id"])
final = invoices(r["id"])[-1]
ok("once Billing cancels it, the agreement converts again and bills only the removal: $811.88", cancel.status_code == 200
   and c.status_code == 200 and final.id != DUP and D(str(final.total_amount)) == D("811.88"), (cancel.text[:120], c.text[:160]))

# Kept late: the extra period is billed once, and the schedule does not bill it again.
r = agreement(committed=1, removal="0", setup="0", start=TODAY - timedelta(days=45))
set_return(r["id"], TODAY)
c = convert(r["id"])
final = invoices(r["id"])[-1]
ok("returned late: the period beyond the one invoiced is billed", c.status_code == 200
   and D(str(final.subtotal)) == D("750.00") and "period 2" in editable_line_items(final.notes)[0]["description"],
   (c.text[:160], final.subtotal))
ok("  and recorded as billed", rental_row(r["id"]).periods_billed == 2)
bill(40)
ok("  so the schedule never bills it again", len(invoices(r["id"])) == 2)

# An agreement from before scheduled billing: exactly as it always was.
db = Session()
legacy = Rental(rental_number="RNT-LEGACY", created_by_id=BOSS, customer_name="Old", customer_email="o@x.example.com",
                customer_phone="1", customer_address="1 St", billing_frequency="monthly", security_deposit=D("0"),
                start_date=TODAY - timedelta(days=60), end_date=TODAY, status=RentalStatus.ACTIVE, periods_billed=0, history=[])
db.add(legacy)
db.flush()
db.add(RentalItem(rental_id=legacy.id, part_id=BED, quantity=1, rental_rate=D("100"), setup_fee=D("50"), removal_fee=D("0"),
                  shipping_fee=D("0"), labor_fee=D("0"), security_deposit=D("0"), item_status="out", part_number="MBTS0019"))
db.commit()
LEGACY = legacy.id
db.close()
c = convert(LEGACY)
final = invoices(LEGACY)[-1]
ok("an agreement from before scheduled billing is billed whole, as before (2 months + setup)", c.status_code == 200
   and D(str(final.subtotal)) == D("250.00"), (c.text[:160], final.subtotal))

print("\nB. Agreements kept open until returned")
fixed = agreement(committed=1, removal="0", setup="0")
bill(40)
bill(75)
ok("a fixed one-period agreement still bills once", len(invoices(fixed["id"])) == 1)
opened = agreement(committed=1, removal="0", setup="0", open_ended=True)
ok("an open agreement is due again after its minimum term", opened["open_ended"] is True and opened["next_bill_date"] is not None
   and opened["next_payment"]["period"] == 2, opened["next_payment"])
for days in (32, 63, 94):
    bill(days)
rows = invoices(opened["id"])
ok("  and is billed each month while the equipment is out", [i.rental_period_number for i in rows] == [1, 2, 3, 4],
   [i.rental_period_number for i in rows])
ok("  each invoice says it is an open agreement", "open agreement" in (rows[-1].notes or ""))
ok("  its periods run past the minimum term's end", rows[-1].rental_period_end > rows[-1].rental_period_start)
ok("  and it is never flagged overdue",
   next(item for item in http.get("/rentals", params={"limit": 100}).json()["items"] if item["id"] == opened["id"])["is_overdue"] is False)
set_return(opened["id"], TODAY + timedelta(days=100))
bill(130)
bill(160)
ok("once everything is returned, billing stops", len(invoices(opened["id"])) == 4 and rental_row(opened["id"]).next_bill_date is None)
r = http.post("/rentals", json={
    "customer_name": "Clinic", "customer_email": "c@clinic.example.com", "customer_phone": "2145550100",
    "delivery_street": "1 St", "delivery_city": "Plano", "delivery_state": "TX", "delivery_zip": "75024",
    "billing_frequency": "custom", "start_date": str(TODAY), "end_date": str(TODAY + timedelta(days=20)),
    "committed_periods": 2, "open_ended": True, "discount_requires_card": False,
    "items": [{"part_id": BED, "quantity": 1, "rental_rate": "100"}]})
ok("a custom schedule cannot be kept open", r.status_code == 422 and "regular billing frequency" in r.json()["detail"], r.text[:160])
switch = agreement(committed=1, removal="0", setup="0")
u = http.put(f"/rentals/{switch['id']}", json={"open_ended": True})
ok("a fixed agreement switched to open is due again", u.status_code == 200 and u.json()["open_ended"] is True
   and u.json()["next_bill_date"] is not None, u.text[:200])
u = http.put(f"/rentals/{switch['id']}", json={"open_ended": False})
ok("  and switched back, it is not", u.status_code == 200 and u.json()["next_bill_date"] is None)

print("\nC. Tax follows the lines when Billing edits a rental invoice")
r = agreement(committed=1, rate="200.00", setup="100.00", removal="0", deposit="300.00", labor="50.00")
opening = invoices(r["id"])[0]
ok("(the first invoice: tax on rent + setup only = 8.25% of $300 = $24.75)", D(str(opening.tax_amount)) == D("24.75"), opening.tax_amount)
e = edit_lines(opening.id, lambda line: line["item_number"] != "DEL-SETUP")
opening = invoices(r["id"])[0]
ok("removing setup recalculates tax on rent alone, deposit and labor untaxed: $16.50",
   e.status_code == 200 and D(str(opening.tax_amount)) == D("16.50")
   and D(str(opening.total_amount)) == D(str(opening.subtotal)) + D("16.50"), (opening.subtotal, opening.tax_amount, opening.total_amount))
e = edit_lines(opening.id, lambda line: line["item_number"] != "LABOR", tax_amount="0.00", tax_overridden=True)
opening = invoices(r["id"])[0]
ok("tax typed in by Billing is kept as typed", e.status_code == 200 and D(str(opening.tax_amount)) == D("0.00"), opening.tax_amount)
before = invoices(r["id"])[0]
e = http.put(f"/rentals/invoices/{before.id}", json={"due_date": str(TODAY + timedelta(days=20)),
                                                      "line_items": editable_line_items(before.notes),
                                                      "tax_amount": str(before.tax_amount)})
after = invoices(r["id"])[0]
ok("an edit that leaves the lines alone leaves the tax alone", e.status_code == 200 and after.tax_amount == before.tax_amount)
db = Session()
old_style = Invoice(invoice_number="INV-RENTAL-OLD", invoice_type="rental", customer_name="Old", customer_email="o@x.example.com",
                    rental_id=LEGACY, subtotal=D("100"), tax_amount=D("5.00"), discount_amount=D("0"), total_amount=D("105"),
                    amount_paid=D("0"), balance_due=D("105"), status=InvoiceStatus.PENDING, issue_date=TODAY, due_date=TODAY,
                    notes="Old invoice")
db.add(old_style)
db.commit()
OLD = old_style.id
db.close()
e = http.put(f"/rentals/invoices/{OLD}", json={"line_items": [{"item_number": "X", "description": "Rent", "quantity": 1,
                                                                 "unit_price": 100, "total_amount": 100}],
                                                "subtotal": "100", "tax_amount": "5.00", "total_amount": "105"})
ok("an invoice made before lines were stored keeps the tax as edited", e.status_code == 200
   and D(str(invoices_all()[[i.id for i in invoices_all()].index(OLD)].tax_amount)) == D("5.00"))

print(f"\n{len(failures)} FAILED: {failures}" if failures else "\nALL PASSED")
sys.exit(1 if failures else 0)
