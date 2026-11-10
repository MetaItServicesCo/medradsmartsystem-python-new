"""The current modality list, the old list, and the form each type gives.

Putting the list in place marks today's modalities as the old list (kept on
every existing asset, not offered for new ones) and creates the new list,
each sub-modality with the inspection form a new asset of that type gets.
It only applies when every form is found exactly once among the visible
forms, and only once. A new asset needs a sub-modality where its modality has
them, and gets its type's form unless another was chosen. Nothing existing
changes.

    cd backend
    DATABASE_URL=sqlite:// venv312/Scripts/python.exe tests/test_modality_list.py
"""
from __future__ import annotations

import logging
import os
import pathlib
import sys
from datetime import datetime

os.environ.setdefault("DATABASE_URL", "sqlite://")
os.environ["READ_CACHE_ENABLED"] = "false"
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))
logging.disable(logging.CRITICAL)

from fastapi import HTTPException  # noqa: E402
from sqlalchemy import create_engine  # noqa: E402
from sqlalchemy.exc import IntegrityError  # noqa: E402
from sqlalchemy.orm import sessionmaker  # noqa: E402
from sqlalchemy.pool import StaticPool  # noqa: E402

import app.models  # noqa: E402,F401
from app.api.v1.endpoints import equipment as equipment_api  # noqa: E402
from app.api.v1.endpoints import inspections as inspections_api  # noqa: E402
from app.api.v1.endpoints import modalities as modalities_api  # noqa: E402
from app.db.base import Base  # noqa: E402
from app.models.equipment import Equipment  # noqa: E402
from app.models.facility import Facility  # noqa: E402
from app.models.inspection import Inspection, InspectionBatch, InspectionStatus  # noqa: E402
from app.models.inspection_form import InspectionForm  # noqa: E402
from app.models.modality import Modality, ModalityCategory  # noqa: E402
from app.models.user import User, UserRole, UserType  # noqa: E402
from app.schemas.equipment import EquipmentCreate, EquipmentUpdate  # noqa: E402
from app.schemas.modality import ModalityCreate, ModalityUpdate  # noqa: E402
from scripts import apply_modality_list as listing  # noqa: E402

failures: list[str] = []


def ok(label: str, condition: bool, detail: object = "") -> None:
    print("{}  {}{}".format("PASS" if condition else "FAIL", label, f"  {detail}" if not condition else ""))
    if not condition:
        failures.append(label)


def refused(call, status: int) -> bool:
    try:
        call()
    except HTTPException as error:
        db.rollback()
        return error.status_code == status
    return False


# MODALITY_TEST_DB runs the same checks on a throwaway Postgres, as production uses.
if os.environ.get("MODALITY_TEST_DB"):
    engine = create_engine(os.environ["MODALITY_TEST_DB"])
    Base.metadata.drop_all(engine)
else:
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
Base.metadata.create_all(engine)
db = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)()

boss = User(username="boss", email="b@x.test", full_name="Boss", hashed_password="x",
            user_type=UserType.EMPLOYEE, role=UserRole.SUPERADMIN, is_active=True)
clinic = Facility(name="Life Path", contact_person="C", phone="1", email="c@x.test", address="1 St", city="Waco",
                  state="TX", zip_code="76701", country="US")
db.add_all([boss, clinic])
db.flush()

# Today's list, with an asset on it.
old_parent = Modality(name="Infusion", category=ModalityCategory.TREATMENT)
db.add(old_parent)
db.flush()
old_child = Modality(name="Infusion Pump", category=ModalityCategory.TREATMENT, parent_id=old_parent.id)
old_flat = Modality(name="DEFIBILLATOR", category=ModalityCategory.TREATMENT)
db.add_all([old_child, old_flat])
db.flush()
old_asset = Equipment(asset_tag="OLD-1", make="Baxter", model="Sigma", serial_number="S-OLD", modality_id=old_child.id,
                      facility_id=clinic.id, description="Old pump")
db.add(old_asset)
db.commit()

form_names = sorted({n for _, _, subs in listing.MODALITY_LIST for _, spec in subs for n in listing._names(spec)} - {"BP Monitor"})


def add_forms(names):
    forms = {}
    for name in names:
        form = InspectionForm(name=name, schema={"title": name})
        db.add(form)
        db.flush()
        forms[name] = form
    db.commit()
    return forms


print("Before the list is in place")
plan = listing.plan(db)
ok("with no forms yet, it stops and says which are missing", not plan.ok and any("Hospital Bed Form" in p for p in plan.problems), plan.problems[:3])
applied = listing.apply(db)
ok("applying then changes nothing", not applied.ok and db.query(Modality).count() == 3 and not db.query(Modality).filter(Modality.is_legacy.is_(True)).count())
tree = modalities_api.list_modalities(db=db, current_user=boss, parent_only=True, search=None)
ok("the modality list is as today, nothing marked old", {m["name"] for m in tree["items"]} == {"Infusion", "DEFIBILLATOR"} and not any(m["is_legacy"] for m in tree["items"]))

forms = add_forms(form_names)
hidden_bp = InspectionForm(name="BP Monitor", schema={}, archived_at=datetime(2026, 1, 1))
db.add(hidden_bp)
db.commit()
plan = listing.plan(db)
ok("a hidden \"BP Monitor\" is not used; \"BP Monitor Form\" is", plan.ok and plan.forms["BP Monitor or BP Monitor Form"] == forms["BP Monitor Form"].id, plan.problems or plan.forms.get("BP Monitor or BP Monitor Form"))
dupe = InspectionForm(name="General Form", schema={})
db.add(dupe)
db.commit()
plan = listing.plan(db)
ok("two visible forms with the same name stop it", not plan.ok and any("General Form" in p and "2 visible" in p for p in plan.problems), plan.problems)
db.delete(dupe)
forms["Autoclave Form"].name = "autoclave  form"
db.commit()
plan = listing.plan(db)
ok("a name that differs only in case or spacing is matched, and said so", plan.ok and any("autoclave  form" in n and "ignoring case" in n for n in plan.form_notes), plan.problems)
forms["Autoclave Form"].name = "Autoclave Form"
db.commit()
ok("the plan counts what it would do", plan.old_modalities == 3 and plan.new_modalities == 15 and plan.new_sub_modalities == 146 and plan.old_assets == 1,
   (plan.old_modalities, plan.new_modalities, plan.new_sub_modalities, plan.old_assets))
ok("planning changes nothing", db.query(Modality).count() == 3)

print("\nPutting the list in place")
applied = listing.apply(db)
ok("it applies", applied.ok, applied.problems)
ok("today's three modalities are the old list", db.query(Modality).filter(Modality.is_legacy.is_(True)).count() == 3)
ok("15 modalities and 146 sub-modalities are the new list", db.query(Modality).filter(Modality.is_legacy.is_(False), Modality.parent_id.is_(None)).count() == 15
   and db.query(Modality).filter(Modality.is_legacy.is_(False), Modality.parent_id.isnot(None)).count() == 146)
db.refresh(old_asset)
ok("the existing asset keeps its modality and form", old_asset.modality_id == old_child.id and old_asset.inspection_form_id is None)
beds = db.query(Modality).filter(Modality.name == "Bed & Stretchers").one()
patient_beds = next(c for c in beds.children if c.name == "Patient Beds")
ok("Patient Beds gives Hospital Bed Form", patient_beds.inspection_form_id == forms["Hospital Bed Form"].id)
ok("Hospital Beds was added under Bed & Stretchers", any(c.name == "Hospital Beds" and c.inspection_form_id == forms["Hospital Bed Form"].id for c in beds.children))
oxygen = db.query(Modality).filter(Modality.name == "Oxygen Concentrator", Modality.is_legacy.is_(False)).one()
ok("Oxygen Concentrator gives General Form", oxygen.inspection_form_id == forms["General Form"].id)
nibp = db.query(Modality).filter(Modality.name == "NIBP Monitor").one()
ok("NIBP Monitor gives BP Monitor Form", nibp.inspection_form_id == forms["BP Monitor Form"].id)
lasers = db.query(Modality).filter(Modality.name == "Laser System", Modality.is_legacy.is_(False)).all()
ok("Laser System sits under both of its modalities", sorted(m.parent.name for m in lasers) == ["Lasers & Cosmetics", "Ophthalmology"])
ok("the old and new lists can share a name (Infusion, Infusion Pump)",
   db.query(Modality).filter(Modality.name == "Infusion Pump").count() == 2 and db.query(Modality).filter(Modality.name == "Infusion").count() == 2)
lab = db.query(Modality).filter(Modality.name == "Lab", Modality.is_legacy.is_(False)).one()
rad = db.query(Modality).filter(Modality.name == "Radiology and Imaging").one()
ok("categories: Lab is Laboratory, Radiology and Imaging is Imaging, the rest Treatment",
   lab.category == ModalityCategory.LABORATORY and rad.category == ModalityCategory.IMAGING and beds.category == ModalityCategory.TREATMENT)
ok("spellings are kept as given", db.query(Modality).filter(Modality.name.in_(["Clono scope", "Vacum hood/vent", "SI Laser System", "Plastic Vac"])).count() == 4)
again = listing.apply(db)
ok("it will not apply a second time", not again.ok and any("already in place" in p for p in again.problems) and db.query(Modality).count() == 3 + 15 + 146)

print("\nA name stays unique within its modality and its list")
db.add(Modality(name="Patient Beds", category=ModalityCategory.TREATMENT, parent_id=beds.id))
try:
    db.commit()
    ok("the same name twice under one modality is refused", False)
except IntegrityError:
    db.rollback()
    ok("the same name twice under one modality is refused", True)

print("\nAdding an asset")
equip = lambda **kw: equipment_api.create_equipment(equip_in=EquipmentCreate(**{
    "asset_tag": kw.pop("tag"), "make": "Hill-Rom", "model": "P7500", "serial_number": kw.pop("tag2", None) or kw.get("serial", "X"),
    "facility_id": clinic.id, **kw}), db=db, current_user=boss)
bed = equip(tag="BED-1", tag2="SN-B1", modality_id=patient_beds.id)
ok("a Patient Beds asset gets Hospital Bed Form by itself", bed.inspection_form_id == forms["Hospital Bed Form"].id, bed.inspection_form_id)
chosen = equip(tag="BED-2", tag2="SN-B2", modality_id=patient_beds.id, inspection_form_id=forms["General Form"].id)
ok("a form chosen for the asset is kept", chosen.inspection_form_id == forms["General Form"].id)
ok("a modality with sub-modalities needs one chosen", refused(lambda: equip(tag="BED-3", tag2="SN-B3", modality_id=beds.id), 422))
legacy = equip(tag="OLD-2", tag2="SN-O2", modality_id=old_flat.id)
ok("an asset on an old modality is added as before, with no form given", legacy.inspection_form_id is None and legacy.modality_id == old_flat.id)
forms["Exam Light Form"].archived_at = datetime(2026, 5, 1)
db.commit()
light = db.query(Modality).filter(Modality.name == "Exam Light", Modality.is_legacy.is_(False)).one()
lamp = equip(tag="LAMP-1", tag2="SN-L1", modality_id=light.id)
ok("a type whose form has been hidden gives no form", lamp.inspection_form_id is None)
forms["Exam Light Form"].archived_at = None
db.commit()
ok("an unknown modality is refused", refused(lambda: equip(tag="X-1", tag2="SN-X1", modality_id=99999), 404))
moved = equipment_api.update_equipment(id=old_asset.id, equip_in=EquipmentUpdate(description="Old pump, relabelled"), db=db, current_user=boss)
ok("editing an old asset without touching its modality works as before", moved.modality_id == old_child.id and moved.description == "Old pump, relabelled")
ok("moving an asset to a modality with sub-modalities needs one", refused(lambda: equipment_api.update_equipment(id=old_asset.id, equip_in=EquipmentUpdate(modality_id=beds.id), db=db, current_user=boss), 422))
moved = equipment_api.update_equipment(id=old_asset.id, equip_in=EquipmentUpdate(modality_id=patient_beds.id), db=db, current_user=boss)
ok("moving it to a sub-modality of the new list works", moved.modality_id == patient_beds.id)

print("\nAdding new inventory to an inspection batch")
batch = InspectionBatch(batch_number="INSP-9", facility_id=clinic.id, inspector_id=boss.id, form_template_id=forms["General Form"].id,
                        scheduled_date=datetime(2026, 11, 20), status=InspectionStatus.IN_PROGRESS)
db.add(batch)
db.commit()
defib = db.query(Modality).filter(Modality.name == "Defibrillator", Modality.is_legacy.is_(False)).one()
inspections_api.add_asset_to_inspection_batch(batch.id, inspections_api.BatchAssetCreate(
    asset_tag="DEF-1", make="Zoll", model="R", serial_number="SN-D1", modality_id=defib.id), db=db, current_user=boss)
asset = db.query(Equipment).filter(Equipment.asset_tag == "DEF-1").one()
inspection = db.query(Inspection).filter(Inspection.equipment_id == asset.id).one()
ok("the asset gets Defibrillator Form", asset.inspection_form_id == forms["Defibrillator Form"].id)
ok("  and its inspection opens on it", inspection.form_template_id == forms["Defibrillator Form"].id)
cardiology = defib.parent
ok("  a modality without its sub-modality is refused here too", refused(lambda: inspections_api.add_asset_to_inspection_batch(batch.id, inspections_api.BatchAssetCreate(
    asset_tag="DEF-2", make="Zoll", model="R", serial_number="SN-D2", modality_id=cardiology.id), db=db, current_user=boss), 422))

print("\nThe Modalities screen")
tree = modalities_api.list_modalities(db=db, current_user=boss, parent_only=True, search=None)
current = [m for m in tree["items"] if not m["is_legacy"]]
old = [m for m in tree["items"] if m["is_legacy"]]
ok("lists the new list and the old list, told apart", len(current) == 15 and {m["name"] for m in old} == {"Infusion", "DEFIBILLATOR"})
beds_node = next(m for m in current if m["name"] == "Bed & Stretchers")
pb = next(c for c in beds_node["children"] if c["name"] == "Patient Beds")
ok("each sub-modality shows its form", pb["inspection_form_name"] == "Hospital Bed Form" and pb["inspection_form_hidden"] is False)
changed = modalities_api.update_modality(id=patient_beds.id, modality_in=ModalityUpdate(inspection_form_id=forms["General Form"].id), db=db, current_user=boss)
ok("an admin can change a sub-modality's form", changed["inspection_form_name"] == "General Form")
forms["Otoscope Form"].archived_at = datetime(2026, 5, 1)
db.commit()
ok("but not to a hidden form", refused(lambda: modalities_api.update_modality(id=patient_beds.id, modality_in=ModalityUpdate(inspection_form_id=forms["Otoscope Form"].id), db=db, current_user=boss), 422))
otoscope = db.query(Modality).filter(Modality.name == "Otoscope", Modality.is_legacy.is_(False)).one()
oto_node = next(c for m in current for c in m["children"] if c["id"] == otoscope.id)
ok("a type whose form was hidden is flagged", modalities_api._build_tree(otoscope)["inspection_form_hidden"] is True)
added = modalities_api.create_modality(modality_in=ModalityCreate(name="Bariatric Beds", category="treatment", parent_id=beds.id, inspection_form_id=forms["Hospital Bed Form"].id), db=db, current_user=boss)
ok("an admin can add a sub-modality with its form", added["inspection_form_name"] == "Hospital Bed Form" and added["is_legacy"] is False)
under_old = modalities_api.create_modality(modality_in=ModalityCreate(name="Pump Spare", category="treatment", parent_id=old_parent.id), db=db, current_user=boss)
ok("a sub-modality added under an old modality stays on the old list", under_old["is_legacy"] is True)
copy = modalities_api.duplicate_modality(id=beds.id, db=db, current_user=boss)
ok("duplicating keeps the list and the forms", copy["is_legacy"] is False and any(c["inspection_form_name"] == "Hospital Bed Form" for c in copy["children"]))

print("\nProduction's form names")
prod_engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
Base.metadata.create_all(prod_engine)
prod = sessionmaker(bind=prod_engine, autoflush=False, expire_on_commit=False)()
named = {"General Form": "General 1", "Surgical Light Form": "Surgical Lights Form", "BP Monitor Form": "BP Monitor"}
for name in sorted({named.get(name, name) for name in form_names}):
    prod.add(InspectionForm(name=name, schema={}))
prod.add(InspectionForm(name="General", schema={}, archived_at=datetime(2026, 1, 1)))
prod.commit()
prod_plan = listing.plan(prod)
by_key = {key: prod.get(InspectionForm, form_id).name if form_id else None for key, form_id in prod_plan.forms.items()}
ok("with production's names the plan is clean", prod_plan.ok, prod_plan.problems)
ok("  General Form is General 1 (the hidden General is not used)", by_key.get("General Form or General 1") == "General 1", by_key)
ok("  Surgical Light Form is Surgical Lights Form", by_key.get("Surgical Light Form or Surgical Lights Form") == "Surgical Lights Form", by_key)
ok("  NIBP Monitor's form is BP Monitor", by_key.get("BP Monitor or BP Monitor Form") == "BP Monitor", by_key)

print()
if failures:
    print(f"{len(failures)} FAILED: {failures}")
    sys.exit(1)
print("ALL PASSED")
