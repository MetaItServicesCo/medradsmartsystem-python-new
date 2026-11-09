"""What the Inspection Batch window shows for each asset.

Each asset is named as its inventory record names it: make, model, modality,
sub-modality, tier, description and serial, beside the existing fields.

    cd backend
    DATABASE_URL=sqlite:// venv312/Scripts/python.exe tests/test_inspection_batch_columns.py
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

from sqlalchemy import create_engine, event  # noqa: E402
from sqlalchemy.orm import sessionmaker  # noqa: E402
from sqlalchemy.pool import StaticPool  # noqa: E402

import app.models  # noqa: E402,F401
from app.api.v1.endpoints.inspections import _inspection_response, get_inspection_batch  # noqa: E402
from app.db.base import Base  # noqa: E402
from app.models.equipment import Equipment  # noqa: E402
from app.models.facility import Facility  # noqa: E402
from app.models.inspection import Inspection, InspectionBatch, InspectionStatus  # noqa: E402
from app.models.inspection_form import InspectionForm  # noqa: E402
from app.models.inventory import InventoryPart  # noqa: E402
from app.models.modality import Modality, ModalityCategory  # noqa: E402
from app.models.tier import Tier  # noqa: E402
from app.models.user import User, UserRole, UserType  # noqa: E402

failures: list[str] = []


def ok(label: str, condition: bool, detail: object = "") -> None:
    print("{}  {}{}".format("PASS" if condition else "FAIL", label, f"  {detail}" if not condition else ""))
    if not condition:
        failures.append(label)


engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
Base.metadata.create_all(engine)
db = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)()

boss = User(username="boss", email="b@x.test", full_name="Boss", hashed_password="x",
            user_type=UserType.EMPLOYEE, role=UserRole.SUPERADMIN, is_active=True)
t1 = Tier(tier_code="T-1", name="T-1", labor_rate_per_hour=D("175"), service_call_fee=D("0"),
          preventive_maintenance_fee=D("250"), mileage_rate=D("1"))
lab = Modality(name="LAB", category=ModalityCategory.TREATMENT)
form = InspectionForm(name="Form", schema={"title": "Form"})
db.add_all([boss, t1, lab, form])
db.flush()
centrifuges = Modality(name="CENTRIFUGES [Legacy 41]", category=ModalityCategory.TREATMENT, parent_id=lab.id)
scales = Modality(name="Scales", category=ModalityCategory.TREATMENT)
db.add_all([centrifuges, scales])
clinic = Facility(name="Life Path", contact_person="C", phone="1", email="c@x.test", address="1 St", city="Waco",
                  state="TX", zip_code="76701", country="US")
db.add(clinic)
db.flush()

batch = InspectionBatch(batch_number="INSP-012425", facility_id=clinic.id, inspector_id=boss.id,
                        form_template_id=form.id, scheduled_date=datetime(2026, 11, 1), status=InspectionStatus.IN_PROGRESS)
db.add(batch)
db.flush()

n = {"i": 0}


def add(equipment: Equipment | None = None, part: InventoryPart | None = None) -> None:
    if equipment:
        db.add(equipment)
    if part:
        db.add(part)
    db.flush()
    n["i"] += 1
    db.add(Inspection(inspection_number=f"INSP-{n['i']:06d}", facility_id=clinic.id, batch_id=batch.id,
                      equipment_id=equipment.id if equipment else None, inventory_part_id=part.id if part else None,
                      form_template_id=form.id, scheduled_date=datetime(2026, 11, 1),
                      status=InspectionStatus.IN_PROGRESS, inspector_id=boss.id))
    db.commit()


# 1: a sub-modality, as in the screenshot.  2: a top-level modality.  3: no description.  4: an inventory part.
add(Equipment(asset_tag="FPSC 12", make="NA", model="642EFisher", serial_number="161013BR009", tier_id=t1.id,
              modality_id=centrifuges.id, facility_id=clinic.id, description="Fisher Healthcare Centrifuge"))
add(Equipment(asset_tag="FPSC 10", make="Pelstar", model="500KL", serial_number="500 0128443", tier_id=t1.id,
              modality_id=scales.id, facility_id=clinic.id, description="Patient Scale"))
add(Equipment(asset_tag="FPSC 08", make="Accucold", model="NA", serial_number="NA",
              modality_id=scales.id, facility_id=clinic.id, description=""))
add(part=InventoryPart(part_number="P-1", part_type="sales", description="Infusion pump", make="Baxter", model="Sigma",
                       modality_id=centrifuges.id))
db.expire_all()

queries = {"n": 0}
event.listen(engine, "before_cursor_execute", lambda *a, **k: queries.__setitem__("n", queries["n"] + 1))
result = get_inspection_batch(batch.id, db, boss)
rows = {(row["asset_tag"] or row["part_number"]): row for row in result["assets"]}

print("\nA sub-modality: its modality is the parent")
r = rows["FPSC 12"]
ok("modality", r["modality_name"] == "LAB", r["modality_name"])
ok("sub-modality", r["sub_modality_name"] == "CENTRIFUGES [Legacy 41]", r["sub_modality_name"])
ok("description", r["equipment_description"] == "Fisher Healthcare Centrifuge", r["equipment_description"])
ok("make, model, serial and tier, as before", (r["make"], r["model"], r["serial_number"], r["tier_name"]) == ("NA", "642EFisher", "161013BR009", "T-1"))

print("\nA top-level modality: no sub-modality")
r = rows["FPSC 10"]
ok("modality", r["modality_name"] == "Scales", r["modality_name"])
ok("no sub-modality", r["sub_modality_name"] is None, r["sub_modality_name"])
ok("description", r["equipment_description"] == "Patient Scale")

print("\nAn empty description")
ok("comes back empty, for the dash", rows["FPSC 08"]["equipment_description"] is None, rows["FPSC 08"]["equipment_description"])

print("\nAn inventory part")
r = rows["P-1"]
ok("its modality and sub-modality", (r["modality_name"], r["sub_modality_name"]) == ("LAB", "CENTRIFUGES [Legacy 41]"), r)
ok("its description", r["equipment_description"] == "Infusion pump")
ok("its make and model", (r["make"], r["model"]) == ("Baxter", "Sigma"))

print("\nNothing else changes")
ok("the fields that were there are all still there",
   all(key in rows["FPSC 12"] for key in ("asset_name", "asset_tag", "serial_number", "tier_name", "inspector_name", "status", "tier_pm_fee")))
ok("loading the batch does not ask the database once per asset", queries["n"] <= 15, queries["n"])
plain = _inspection_response(db.query(Inspection).first())
ok("other inspection lists are not given the new fields", "modality_name" not in plain and "equipment_description" not in plain)

print()
if failures:
    print(f"{len(failures)} FAILED: {failures}")
    sys.exit(1)
print("ALL PASSED")
