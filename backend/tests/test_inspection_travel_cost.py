"""An inspection batch's travel cost, and Billing's edits to its invoice.

The travel cost belongs to the batch (one trip to the facility) and is billed
once on the batch invoice as its own "Travel Cost" line. It can be set before
or after the invoice exists, until the invoice is approved for billing or paid.

Rows that Billing adds to the invoice stay on it when the batch invoice is
recalculated, and the Travel Cost row edited in Billing is the batch's travel
cost, so the two always agree.

    cd backend
    DATABASE_URL=sqlite:// venv312/Scripts/python.exe tests/test_inspection_travel_cost.py
"""
from __future__ import annotations

import logging
import os
import pathlib
import sys
from datetime import datetime
from decimal import Decimal as D

os.environ.setdefault("DATABASE_URL", "sqlite://")
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))
logging.disable(logging.CRITICAL)

from fastapi import HTTPException  # noqa: E402
from pydantic import ValidationError  # noqa: E402
from sqlalchemy import create_engine  # noqa: E402
from sqlalchemy.orm import sessionmaker  # noqa: E402
from sqlalchemy.pool import StaticPool  # noqa: E402

import app.models  # noqa: E402,F401
from app.api.v1.endpoints.inspections import (  # noqa: E402
    BatchTravelCostUpdate,
    InspectionInvoiceUpdate,
    InspectionReportUpdate,
    generate_inspection_batch_invoice,
    get_inspection_batch,
    save_inspection_report,
    set_inspection_batch_travel_cost,
    update_inspection_invoice,
)
from app.db.base import Base  # noqa: E402
from app.models.equipment import Equipment  # noqa: E402
from app.models.facility import Facility  # noqa: E402
from app.models.inspection import Inspection, InspectionBatch, InspectionStatus  # noqa: E402
from app.models.inspection_form import InspectionForm  # noqa: E402
from app.models.invoice import Invoice, InvoiceStatus, InvoiceTransaction  # noqa: E402
from app.models.modality import Modality, ModalityCategory  # noqa: E402
from app.models.tier import Tier  # noqa: E402
from app.models.user import User, UserRole, UserType  # noqa: E402

failures: list[str] = []


def ok(label: str, condition: bool, detail: object = "") -> None:
    print("{}  {}{}".format("PASS" if condition else "FAIL", label, f"  {detail}" if not condition and detail != "" else ""))
    if not condition:
        failures.append(label)


def refused(call, status: int, text: str = "") -> bool:
    try:
        call()
    except HTTPException as error:
        db.rollback()
        return error.status_code == status and text in str(error.detail)
    return False


# TRAVEL_TEST_DB runs the same checks on a throwaway Postgres, as production uses.
if os.environ.get("TRAVEL_TEST_DB"):
    engine = create_engine(os.environ["TRAVEL_TEST_DB"])
    Base.metadata.drop_all(engine)
else:
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
Base.metadata.create_all(engine)
db = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)()

boss = User(username="boss", email="b@x.test", full_name="Boss", hashed_password="x",
            user_type=UserType.EMPLOYEE, role=UserRole.SUPERADMIN, is_active=True)
gold = Tier(tier_code="T-G", name="Gold", labor_rate_per_hour=D("100"), service_call_fee=D("900"),
            preventive_maintenance_fee=D("250.00"), mileage_rate=D("1"))
modality = Modality(name="Freezer", category=ModalityCategory.TREATMENT)
form = InspectionForm(name="Freezer Form", schema={"title": "Freezer Form"})
db.add_all([boss, gold, modality, form])
db.flush()
clinic = Facility(name="Gold Clinic", contact_person="C", phone="1", email="c@x.test", address="1 St", city="Waco",
                  state="TX", zip_code="76701", country="US", tier_id=gold.id)
db.add(clinic)
db.flush()
client = User(username="client", email="cl@x.test", full_name="Client", hashed_password="x", facility_id=clinic.id,
              user_type=UserType.CLIENT, role=UserRole.CLIENT, is_active=True)
db.add(client)
db.flush()

n = {"i": 0}


def make_batch(number: str, assets: int) -> tuple[InspectionBatch, list[Inspection]]:
    batch = InspectionBatch(batch_number=number, facility_id=clinic.id, inspector_id=boss.id, form_template_id=form.id,
                            scheduled_date=datetime(2026, 11, 1), status=InspectionStatus.IN_PROGRESS)
    db.add(batch)
    db.flush()
    rows = []
    for position in range(1, assets + 1):
        n["i"] += 1
        item = Equipment(asset_tag=f"A-{n['i']}", make="Accucold", model="FPSC", serial_number=f"S{n['i']}",
                         modality_id=modality.id, facility_id=clinic.id)
        db.add(item)
        db.flush()
        row = Inspection(inspection_number=f"{number}-{position:03d}", facility_id=clinic.id, equipment_id=item.id, batch_id=batch.id,
                         form_template_id=form.id, scheduled_date=datetime(2026, 11, 1), status=InspectionStatus.IN_PROGRESS, inspector_id=boss.id)
        db.add(row)
        rows.append(row)
    db.commit()
    return batch, rows


def complete(row: Inspection, charge=0) -> None:
    save_inspection_report(row.id, InspectionReportUpdate(
        status=InspectionStatus.COMPLETED, result="pass",
        form_data={"checks": {"physical_inspection": "pass"}, "billing": {"parts": 0, "inspection_charges": charge, "others": 0}},
        parts_amount=D("0"), inspection_charge=D(str(charge)), other_charges=D("0"),
    ), db, boss)


def travel(batch: InspectionBatch, amount, user: User = None):
    return set_inspection_batch_travel_cost(batch.id, BatchTravelCostUpdate(travel_cost=amount), db, user or boss)


def invoice_of(batch: InspectionBatch) -> Invoice:
    db.expire_all()
    return db.query(Invoice).filter(Invoice.inspection_batch_id == batch.id).one()


def batch_view(batch: InspectionBatch) -> dict:
    db.expire_all()
    return get_inspection_batch(batch.id, db, boss)


def money(value) -> D:
    return D(str(value)).quantize(D("0.01"))


def billing_save(invoice: dict, rows: list[dict], summary_rows: list[dict] | None = None, discount=0):
    """Save the invoice as Billing's editor does: the rows, and totals worked out from them."""
    subtotal = sum(D(str(row["total_amount"])) for row in rows)
    extra = sum(D(str(row["value"])) for row in (summary_rows or []))
    return update_inspection_invoice(invoice["id"], InspectionInvoiceUpdate(
        line_items=rows, summary_rows=summary_rows or [], subtotal=subtotal, tax_amount=D("0"), discount_amount=D(str(discount)),
        total_amount=subtotal + extra - D(str(discount)),
    ), db, boss)


def row(item_number, description, amount) -> dict:
    return {"item_number": item_number, "description": description, "quantity": 1, "unit_price": amount,
            "shipping_fee": 0, "setup_fee": 0, "condition": None, "total_amount": amount, "custom_cells": []}


print("A batch with no travel cost: invoiced exactly as before")
plain, plain_rows = make_batch("INSP-100000", 2)
for item in plain_rows:
    complete(item)
result = generate_inspection_batch_invoice(plain.id, db, boss)
ok("the total is the assets' lines", money(result["total_amount"]) == D("500.00"), result["total_amount"])
ok("  no travel cost on it", result["travel_cost"] is None)
ok("  no Billing rows invented", result["line_items"] == [])

print("\nSetting the travel cost before the batch is invoiced")
batch, rows = make_batch("INSP-200000", 2)
answer = travel(batch, "120")
ok("it is kept on the batch", money(batch_view(batch)["travel_cost"]) == D("120.00"), batch_view(batch)["travel_cost"])
ok("  nothing to recalculate yet", answer["batch_invoice"] is None)
for item in rows:
    complete(item)
result = generate_inspection_batch_invoice(batch.id, db, boss)
ok("the invoice bills the assets and the travel once", money(result["total_amount"]) == D("620.00"), result["total_amount"])
ok("  the subtotal includes it", money(result["subtotal"]) == D("620.00"), result["subtotal"])
ok("  and says what the travel cost is", money(result["travel_cost"]) == D("120.00"))
ok("  the per-asset breakdown is still the assets alone", [money(item["total_amount"]) for item in result["batch_items"]] == [D("250.00"), D("250.00")])
ok("  balance due is the full total", money(result["balance_due"]) == D("620.00"))
ok("the batch window shows the invoice's travel cost too", money(batch_view(batch)["batch_invoice"]["travel_cost"]) == D("120.00"))

print("\nChanging it after the invoice exists")
answer = travel(batch, "80.5")
stored = invoice_of(batch)
ok("the invoice is recalculated", money(stored.total_amount) == D("580.50") and money(stored.balance_due) == D("580.50"), stored.total_amount)
ok("  and the answer carries it", money(answer["batch_invoice"]["total_amount"]) == D("580.50"))
ok("  the ledger records the recalculation", db.query(InvoiceTransaction).filter(
    InvoiceTransaction.invoice_id == stored.id, InvoiceTransaction.transaction_type == "invoice_recalculated").count() == 1)
travel(batch, None)
ok("cleared: the invoice is the assets alone again", money(invoice_of(batch).total_amount) == D("500.00"))
ok("  and the batch has none", batch_view(batch)["travel_cost"] is None)
travel(batch, "80.50")

print("\nBilling adds rows to the invoice")
invoice = batch_view(batch)["batch_invoice"]
asset_rows = [row(item["inspection_number"], item["asset_name"], item["subtotal"]) for item in invoice["batch_items"]]
edited = billing_save(invoice, asset_rows + [row("TRAVEL", "Travel Cost", 80.5), row("ITEM-4", "Parking", 25)],
                      summary_rows=[{"label": "Fuel surcharge", "value": 10}])
ok("they are on the invoice", [line["description"] for line in edited["line_items"]][-2:] == ["Travel Cost", "Parking"])
ok("  and in its total", money(edited["total_amount"]) == D("615.50"), edited["total_amount"])
ok("the travel cost is unchanged", money(batch_view(batch)["travel_cost"]) == D("80.50"))

print("\nThe batch invoice is recalculated after Billing's edits")
travel(batch, "100")
invoice = batch_view(batch)["batch_invoice"]
lines = {line["item_number"]: money(line["total_amount"]) for line in invoice["line_items"]}
ok("Billing's added row is kept", lines.get("ITEM-4") == D("25.00"), lines)
ok("  the Travel Cost row follows the batch", lines.get("TRAVEL") == D("100.00"), lines)
ok("  the asset rows are still there", lines.get("INSP-200000-001") == D("250.00") and lines.get("INSP-200000-002") == D("250.00"), lines)
ok("  the summary row is kept", invoice["summary_rows"] == [{"label": "Fuel surcharge", "value": 10}])
ok("  and the total is what they all add up to", money(invoice["total_amount"]) == D("635.00"), invoice["total_amount"])

print("\nBilling's price for an asset stands until its report changes")
invoice = batch_view(batch)["batch_invoice"]
rows_now = [dict(line) for line in invoice["line_items"]]
rows_now[0] = {**rows_now[0], "unit_price": 300, "total_amount": 300}
billing_save(invoice, rows_now, summary_rows=invoice["summary_rows"])
travel(batch, "90")
lines = {line["item_number"]: money(line["total_amount"]) for line in batch_view(batch)["batch_invoice"]["line_items"]}
ok("a travel change leaves Billing's asset price alone", lines.get("INSP-200000-001") == D("300.00"), lines)
first = db.get(Inspection, rows[0].id)
first.form_data = {**(first.form_data or {}), "billing": {"parts": 0, "inspection_charges": 400, "others": 0}}
db.commit()
generate_inspection_batch_invoice(batch.id, db, boss)
lines = {line["item_number"]: money(line["total_amount"]) for line in batch_view(batch)["batch_invoice"]["line_items"]}
ok("its report's charge corrected: the row takes the new amount", lines.get("INSP-200000-001") == D("400.00"), lines)
ok("  everything else unchanged", lines.get("INSP-200000-002") == D("250.00") and lines.get("TRAVEL") == D("90.00") and lines.get("ITEM-4") == D("25.00"), lines)
ok("  total: 400 + 250 + 90 + 25 + 10", money(batch_view(batch)["batch_invoice"]["total_amount"]) == D("775.00"))

print("\nBilling edits the Travel Cost row")
invoice = batch_view(batch)["batch_invoice"]
rows_now = [dict(line) for line in invoice["line_items"]]
rows_now = [{**line, "unit_price": 150, "total_amount": 150} if line["item_number"] == "TRAVEL" else line for line in rows_now]
billing_save(invoice, rows_now, summary_rows=invoice["summary_rows"])
ok("the batch's travel cost follows", money(batch_view(batch)["travel_cost"]) == D("150.00"), batch_view(batch)["travel_cost"])
ok("  as does the invoice's", money(batch_view(batch)["batch_invoice"]["travel_cost"]) == D("150.00"))
invoice = batch_view(batch)["batch_invoice"]
billing_save(invoice, [line for line in invoice["line_items"] if line["item_number"] != "TRAVEL"], summary_rows=invoice["summary_rows"])
ok("the row removed: the batch has no travel cost", batch_view(batch)["travel_cost"] is None)
generate_inspection_batch_invoice(batch.id, db, boss)
lines = [line["item_number"] for line in batch_view(batch)["batch_invoice"]["line_items"]]
ok("  and a recalculation does not bring it back", "TRAVEL" not in lines and "ITEM-4" in lines, lines)

print("\nWhen it cannot be changed")
stored = invoice_of(batch)
stored.billing_approval_status = "approved"
db.commit()
ok("the invoice approved for billing: refused", refused(lambda: travel(batch, "50"), 409, "approved for billing"))
ok("  and the batch is untouched", batch_view(batch)["travel_cost"] is None)
stored = invoice_of(batch)
stored.billing_approval_status = "pending"
stored.amount_paid = D("100")
db.commit()
ok("a payment recorded: refused", refused(lambda: travel(batch, "50"), 409, "payment has been recorded"))
ok("a facility user cannot set it", refused(lambda: travel(batch, "50", client), 403))
try:
    BatchTravelCostUpdate(travel_cost="-5")
    ok("a negative amount is refused", False)
except ValidationError:
    ok("a negative amount is refused", True)
ok("an unknown batch is not found", refused(lambda: set_inspection_batch_travel_cost(999999, BatchTravelCostUpdate(travel_cost="5"), db, boss), 404))

print()
if failures:
    print(f"{len(failures)} FAILED: {failures}")
    sys.exit(1)
print("ALL PASSED")
