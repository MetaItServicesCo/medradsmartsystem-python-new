"""Prove a duplicated inspection form is an exact, independent copy.

The copy has the original's layout, description and modality under the first
free "(Copy)" name -- names are unique across every form, hidden (archived)
ones included -- and changing one never changes the other. Hiding and
unhiding, which the forms screen offers, are the existing archive endpoints;
they are checked here only as far as a copy is concerned.

    DATABASE_URL=sqlite:// python backend/tests/test_form_duplicate.py
"""
from __future__ import annotations

import os
import pathlib
import sys
from datetime import datetime

os.environ.setdefault("DATABASE_URL", "sqlite://")
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))

from fastapi import HTTPException  # noqa: E402
from sqlalchemy import create_engine  # noqa: E402
from sqlalchemy.orm import sessionmaker  # noqa: E402
from sqlalchemy.orm.attributes import flag_modified  # noqa: E402

from app.api.v1.endpoints.inspections import (  # noqa: E402
    archive_inspection_form,
    duplicate_inspection_form,
    unarchive_inspection_form,
)
from app.models.audit_log import AuditLog  # noqa: E402
from app.models.equipment import Equipment  # noqa: E402
from app.models.inspection import Inspection, InspectionBatch  # noqa: E402
from app.models.inspection_form import InspectionForm  # noqa: E402
from app.models.inventory import InventoryPart  # noqa: E402
from app.models.modality import Modality, ModalityCategory  # noqa: E402

failures: list[str] = []


def ok(label: str, condition: bool, detail: str = "") -> None:
    print("{}  {}{}".format("PASS" if condition else "FAIL", label,
                            "  " + detail if detail else ""))
    if not condition:
        failures.append(label)


def eq(label: str, got, want) -> None:
    ok(label, got == want, "got {!r}".format(got) if got != want else "")


class Admin:
    id = 1
    username = "admin"
    role = "admin"
    permissions = None


class Viewer:
    id = 2
    username = "viewer"
    role = "viewer"
    permissions = {"inspections": {"index": True, "add": False, "edit": False, "delete": False}}


def session():
    engine = create_engine("sqlite://")
    for model in (Modality, InspectionForm, Inspection, InspectionBatch, Equipment,
                  InventoryPart, AuditLog):
        model.__table__.create(engine)
    return sessionmaker(bind=engine, autoflush=False)()


db = session()
modality = Modality(name="C-Arm", category=ModalityCategory.IMAGING)
db.add(modality)
db.flush()
schema = {
    "version": 5,
    "title": "C-Arm",
    "canvas_form": {
        "canvas_width": 1080,
        "canvas_height": 600,
        "elements": [
            {"id": "h1", "type": "heading", "label": "General Information", "x": 0, "y": 0, "width": 400, "height": 40},
            {"id": "t1", "type": "table", "x": 0, "y": 60, "width": 800, "height": 200,
             "cells": [[{"id": "c1", "type": "label", "label": "Pass"}, {"id": "c2", "type": "radio"}]]},
        ],
    },
}
original = InspectionForm(name="C-Arm", description="Updated description", modality_id=modality.id, schema=schema)
db.add(original)
db.flush()
db.add(Inspection(inspection_number="INS-1", facility_id=1, form_template_id=original.id,
                  scheduled_date=datetime(2026, 1, 1)))
db.commit()

# ── 1. The copy is the same form under a new name ────────────────────────────
copy = duplicate_inspection_form(original.id, db, Admin())
eq("the copy is named '(Copy)'", copy["name"], "C-Arm (Copy)")
ok("it is a new form", copy["id"] != original.id)
eq("with the same layout", copy["schema"], schema)
eq("the same description", copy["description"], "Updated description")
eq("and the same modality", copy["modality_id"], modality.id)
eq("it starts visible, not hidden", copy["archived_at"], None)
eq("the original is unchanged", (original.name, original.schema), ("C-Arm", schema))
eq("inspections stay on the original",
   db.query(Inspection).filter(Inspection.form_template_id == copy["id"]).count(), 0)
log = db.query(AuditLog).filter(AuditLog.table_name == "inspection_forms", AuditLog.record_id == copy["id"]).first()
ok("the copy is logged as created from the original",
   log is not None and log.action == "CREATE" and f'"duplicated_from": {original.id}' in (log.changes_json or ""),
   log.changes_json if log else "no log")

# ── 2. The copy is independent of the original ───────────────────────────────
stored = db.query(InspectionForm).filter(InspectionForm.id == copy["id"]).one()
stored.schema["canvas_form"]["elements"][0]["label"] = "Changed in the copy"
flag_modified(stored, "schema")
db.commit()
db.expire_all()
eq("changing the copy leaves the original's layout alone",
   db.query(InspectionForm).filter(InspectionForm.id == original.id).one().schema["canvas_form"]["elements"][0]["label"],
   "General Information")

# ── 3. Further copies take the next free name, hidden forms included ─────────
eq("a second copy is '(Copy 2)'", duplicate_inspection_form(original.id, db, Admin())["name"], "C-Arm (Copy 2)")
third = duplicate_inspection_form(original.id, db, Admin())
archive_inspection_form(third["id"], db, Admin())
eq("a hidden '(Copy 3)' still holds its name", duplicate_inspection_form(original.id, db, Admin())["name"], "C-Arm (Copy 4)")
eq("a copy of a copy is named after it", duplicate_inspection_form(copy["id"], db, Admin())["name"], "C-Arm (Copy) (Copy)")

# ── 4. A hidden form can be duplicated, and the copy is visible ──────────────
archive_inspection_form(original.id, db, Admin())
from_hidden = duplicate_inspection_form(original.id, db, Admin())
ok("a hidden form can be duplicated", from_hidden["name"].startswith("C-Arm (Copy"))
eq("its copy is visible", from_hidden["archived_at"], None)
ok("the original stays hidden",
   db.query(InspectionForm).filter(InspectionForm.id == original.id).one().archived_at is not None)
unarchive_inspection_form(original.id, db, Admin())
eq("and unhides as before",
   db.query(InspectionForm).filter(InspectionForm.id == original.id).one().archived_at, None)

# ── 5. Refusals ──────────────────────────────────────────────────────────────
before = db.query(InspectionForm).count()
try:
    duplicate_inspection_form(original.id, db, Viewer())
    error = None
except HTTPException as exc:
    error = exc
ok("someone who may not add forms cannot duplicate one", error is not None and error.status_code == 403,
   str(error.status_code if error else "no error"))
try:
    duplicate_inspection_form(999999, db, Admin())
    error = None
except HTTPException as exc:
    error = exc
ok("a form that does not exist is a 404", error is not None and error.status_code == 404)
eq("and neither refusal created a form", db.query(InspectionForm).count(), before)

print()
if failures:
    print(f"{len(failures)} check(s) failed")
    sys.exit(1)
print("All form duplicate checks passed")
