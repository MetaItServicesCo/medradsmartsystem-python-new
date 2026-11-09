"""Where an inspection's cost comes from.

The rule: the report's Inspection Charges field is used when it is above zero.
Otherwise the tier's PM (preventive maintenance) fee is used. Parts and Others
are added on top. The asset's tier comes first, then the facility's.

Each check goes through the real endpoints: save the report, generate the
invoice, read the amount.

    cd backend
    DATABASE_URL=sqlite:// venv312/Scripts/python.exe tests/test_inspection_costing.py
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
from sqlalchemy import create_engine  # noqa: E402
from sqlalchemy.orm import sessionmaker  # noqa: E402
from sqlalchemy.pool import StaticPool  # noqa: E402

import app.models  # noqa: E402,F401
from app.api.v1.endpoints.inspections import (  # noqa: E402
    InspectionReportUpdate,
    generate_inspection_batch_invoice,
    generate_inspection_invoice,
    save_inspection_report,
)
from app.db.base import Base  # noqa: E402
from app.models.equipment import Equipment  # noqa: E402
from app.models.facility import Facility  # noqa: E402
from app.models.facility_tier import FacilityTier  # noqa: E402
from app.models.inspection import Inspection, InspectionBatch, InspectionStatus  # noqa: E402
from app.models.inspection_form import InspectionForm  # noqa: E402
from app.models.invoice import Invoice  # noqa: E402
from app.models.modality import Modality, ModalityCategory  # noqa: E402
from app.models.tier import Tier  # noqa: E402
from app.models.user import User, UserRole, UserType  # noqa: E402

failures: list[str] = []


def ok(label: str, condition: bool, detail: object = "") -> None:
    print("{}  {}{}".format("PASS" if condition else "FAIL", label, f"  {detail}" if not condition and detail != "" else ""))
    if not condition:
        failures.append(label)


engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
Base.metadata.create_all(engine)
db = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)()

boss = User(username="boss", email="b@x.test", full_name="Boss", hashed_password="x",
            user_type=UserType.EMPLOYEE, role=UserRole.SUPERADMIN, is_active=True)
gold = Tier(tier_code="T-G", name="Gold", labor_rate_per_hour=D("100"), service_call_fee=D("900"),
            preventive_maintenance_fee=D("250.00"), mileage_rate=D("1"))
silver = Tier(tier_code="T-S", name="Silver", labor_rate_per_hour=D("80"), service_call_fee=D("700"),
              preventive_maintenance_fee=D("400.00"), mileage_rate=D("1"))
modality = Modality(name="Freezer", category=ModalityCategory.TREATMENT)
form = InspectionForm(name="Freezer Form", schema={"title": "Freezer Form"})
db.add_all([boss, gold, silver, modality, form])
db.flush()


def facility(name: str, tier: Tier | None = None) -> Facility:
    row = Facility(name=name, contact_person="C", phone="1", email="c@x.test", address="1 St", city="Waco",
                   state="TX", zip_code="76701", country="US", tier_id=tier.id if tier else None)
    db.add(row)
    db.flush()
    return row


serial = {"n": 0}


def asset(where: Facility, tier: Tier | None = None) -> Equipment:
    serial["n"] += 1
    row = Equipment(asset_tag=f"A-{serial['n']}", make="Accucold", model="FPSC", serial_number=f"S{serial['n']}",
                    modality_id=modality.id, facility_id=where.id, tier_id=tier.id if tier else None)
    db.add(row)
    db.flush()
    return row


def inspection(where: Facility, item: Equipment, batch: InspectionBatch | None = None) -> Inspection:
    serial["n"] += 1
    row = Inspection(inspection_number=f"INSP-{serial['n']:06d}", facility_id=where.id, equipment_id=item.id,
                     batch_id=batch.id if batch else None, form_template_id=form.id, scheduled_date=datetime(2026, 11, 1),
                     status=InspectionStatus.IN_PROGRESS, inspector_id=boss.id)
    db.add(row)
    db.commit()
    return row


def save_report(row: Inspection, parts=0, charge=0, others=0, billing="given") -> None:
    """Save a report as the screen does: the billing figures, and the same again in form_data."""
    form_data = {"checks": {"physical_inspection": "pass"}}
    if billing == "given":
        form_data["billing"] = {"parts": parts, "inspection_charges": charge, "others": others}
    save_inspection_report(row.id, InspectionReportUpdate(
        status=InspectionStatus.COMPLETED, result="pass", form_data=form_data,
        parts_amount=D(str(parts)), inspection_charge=D(str(charge)), other_charges=D(str(others)),
    ), db, boss)


def billed(where: Facility, tier: Tier | None = None, **report) -> D:
    row = inspection(where, asset(where, tier))
    save_report(row, **report)
    return D(str(generate_inspection_invoice(row.id, db, boss)["total_amount"]))


gold_clinic = facility("Gold Clinic", gold)
silver_clinic = facility("Silver Clinic", silver)

print("\nInspection Charges field, or the PM fee")
ok("the field left at 0: the tier's PM fee is billed", billed(gold_clinic) == D("250.00"))
ok("the field filled in: that amount is billed, not the PM fee", billed(gold_clinic, charge=175) == D("175.00"))
ok("the field above the PM fee: still the field", billed(gold_clinic, charge=999) == D("999.00"))
ok("the field equal to the PM fee: billed once", billed(gold_clinic, charge=250) == D("250.00"))
ok("cents are kept", billed(gold_clinic, charge="175.55") == D("175.55"))
ok("no billing figures in the report at all: the PM fee", billed(gold_clinic, billing="missing") == D("250.00"))
ok("the field negative: never a credit, the PM fee", billed(gold_clinic, charge=-50) == D("250.00"))

print("\nParts and Others are added on top")
ok("PM fee + parts", billed(gold_clinic, parts=100) == D("350.00"))
ok("PM fee + others", billed(gold_clinic, others=30) == D("280.00"))
ok("PM fee + parts + others", billed(gold_clinic, parts=100, others=30) == D("380.00"))
ok("the field + parts + others: no PM fee in it", billed(gold_clinic, charge=175, parts=100, others=30) == D("305.00"))

print("\nWhich tier's PM fee")
ok("the asset's own tier comes before the facility's", billed(gold_clinic, tier=silver) == D("400.00"))
ok("an asset with no tier uses the facility's", billed(silver_clinic) == D("400.00"))
ok("the field beats the PM fee of any tier", billed(silver_clinic, tier=gold, charge=60) == D("60.00"))
no_tier = facility("No Tier Clinic")
ok("no tier anywhere and an empty field: bills $0", billed(no_tier) == D("0.00"))
ok("no tier anywhere, with the field filled in: the field", billed(no_tier, charge=120) == D("120.00"))
ok("no tier anywhere, asset has one: the asset's", billed(no_tier, tier=gold) == D("250.00"))

print("\nThe invoice is a record of the price at the time")
row = inspection(gold_clinic, asset(gold_clinic))
save_report(row)
invoice = generate_inspection_invoice(row.id, db, boss)
ok("it starts at the PM fee", D(str(invoice["total_amount"])) == D("250.00"))
gold.preventive_maintenance_fee = D("300.00")
db.commit()
stored = db.query(Invoice).filter(Invoice.id == invoice["id"]).one()
db.refresh(stored)
ok("a later change to the tier's PM fee leaves it alone", stored.total_amount == D("250.00"), stored.total_amount)
ok("a new inspection gets the new PM fee", billed(gold_clinic) == D("300.00"))
gold.preventive_maintenance_fee = D("250.00")
db.commit()

print("\nCorrecting a report")
row = inspection(gold_clinic, asset(gold_clinic))
save_report(row)
first = generate_inspection_invoice(row.id, db, boss)
save_report(row, charge=175)
second = generate_inspection_invoice(row.id, db, boss)
ok("the charge corrected and the invoice regenerated: the new amount", D(str(second["total_amount"])) == D("175.00"), second["total_amount"])
ok("  on the same invoice, not a second one", first["id"] == second["id"]
   and db.query(Invoice).filter(Invoice.inspection_id == row.id).count() == 1)
ok("  and what is owed follows", D(str(second["balance_due"])) == D("175.00"), second["balance_due"])

print("\nA batch adds up asset by asset")
batch = InspectionBatch(batch_number="BATCH-1", facility_id=gold_clinic.id, inspector_id=boss.id,
                        form_template_id=form.id, scheduled_date=datetime(2026, 11, 1), status=InspectionStatus.IN_PROGRESS)
db.add(batch)
db.flush()
on_pm = inspection(gold_clinic, asset(gold_clinic), batch)
on_field = inspection(gold_clinic, asset(gold_clinic), batch)
on_other_tier = inspection(gold_clinic, asset(gold_clinic, silver), batch)
with_parts = inspection(gold_clinic, asset(gold_clinic), batch)
save_report(on_pm)
save_report(on_field, charge=175)
save_report(on_other_tier)
save_report(with_parts, parts=100)
result = generate_inspection_batch_invoice(batch.id, db, boss)
lines = {line["inspection_id"]: D(str(line["total_amount"])) for line in result["batch_items"]}
ok("an asset on the PM fee", lines[on_pm.id] == D("250.00"), lines)
ok("an asset with the field filled in", lines[on_field.id] == D("175.00"), lines)
ok("an asset on its own tier", lines[on_other_tier.id] == D("400.00"), lines)
ok("an asset with parts", lines[with_parts.id] == D("350.00"), lines)
ok("the batch total is the sum of its lines", D(str(result["total_amount"])) == sum(lines.values()) == D("1175.00"), result["total_amount"])

print("\nKnown gap, recorded so that it is visible (see the note to the product owner)")
split = facility("Two Tier Clinic")
db.add(FacilityTier(facility_id=split.id, tier_id=silver.id))
db.commit()
ok("KNOWN GAP: a facility whose tiers are all in its tier list, no main tier: an asset with no tier bills $0",
   billed(split) == D("0.00"))

print()
if failures:
    print(f"{len(failures)} check(s) failed")
    sys.exit(1)
print("All inspection costing checks passed")
