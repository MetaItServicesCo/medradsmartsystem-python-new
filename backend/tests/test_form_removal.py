"""Prove a form can only be removed when removing it is safe.

Inspection.form_template_id and InspectionBatch.form_template_id are both NOT
NULL. A form any inspection was ever run against therefore cannot be deleted
without either being refused by Postgres or leaving inspections that cannot be
opened -- and the second outcome would not announce itself. It would look like
a successful delete right up until somebody tried to read last quarter's PM
report.

So: delete when nothing uses it, refuse when something does, archive either
way, and never touch the default report form. Each of those is checked here
against the real endpoint functions.

    DATABASE_URL=sqlite:// python backend/tests/test_form_removal.py
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

from app.api.v1.endpoints.inspections import (  # noqa: E402
    ADVANCED_REPORT_SCHEMA,
    _form_usage,
    _is_default_form,
    archive_inspection_form,
    delete_inspection_form,
    unarchive_inspection_form,
)
from app.models.audit_log import AuditLog  # noqa: E402
from app.models.equipment import Equipment  # noqa: E402
from app.models.inspection import Inspection, InspectionBatch  # noqa: E402
from app.models.inspection_form import InspectionForm  # noqa: E402
from app.models.inventory import InventoryPart  # noqa: E402

failures: list[str] = []


def ok(label: str, condition: bool, detail: str = "") -> None:
    print("{}  {}{}".format("PASS" if condition else "FAIL", label,
                            "  " + detail if detail else ""))
    if not condition:
        failures.append(label)


def eq(label: str, got, want) -> None:
    ok(label, got == want, "got {!r}".format(got) if got != want else "")


class FakeUser:
    id = 1
    username = "tester"
    role = "admin"


user = FakeUser()


def session():
    engine = create_engine("sqlite://")
    for model in (InspectionForm, Inspection, InspectionBatch, Equipment,
                  InventoryPart, AuditLog):
        model.__table__.create(engine)
    return sessionmaker(bind=engine, autoflush=False)()


def a_form(db, name="Spare form"):
    form = InspectionForm(name=name, schema={"title": name})
    db.add(form)
    db.flush()
    return form


def an_inspection(db, form, number):
    row = Inspection(
        inspection_number=number,
        facility_id=1,
        form_template_id=form.id,
        scheduled_date=datetime(2026, 1, 1),
    )
    db.add(row)
    db.flush()
    return row


def refusal(fn, *args):
    """Run an endpoint and return the HTTPException it raised, or None."""
    try:
        fn(*args)
        return None
    except HTTPException as exc:
        return exc


# ── 1. A form nothing has used is deleted outright ───────────────────────────
db = session()
unused = a_form(db, "Never used")
eq("nothing uses it", _form_usage(db, [unused.id])[unused.id], 0)

result = delete_inspection_form(unused.id, db, user)
eq("it reports the delete", result["deleted"], True)
eq("and the form is gone",
   db.query(InspectionForm).filter(InspectionForm.id == unused.id).count(), 0)

# ── 2. A form an inspection holds is refused, and says how many ──────────────
in_use = a_form(db, "Quarterly PM")
an_inspection(db, in_use, "INS-1")
an_inspection(db, in_use, "INS-2")
eq("both inspections are counted", _form_usage(db, [in_use.id])[in_use.id], 2)

error = refusal(delete_inspection_form, in_use.id, db, user)
ok("delete is refused", error is not None and error.status_code == 409,
   str(error.status_code if error else "no error"))
ok("and says how many hold it", error is not None and "2 inspections" in error.detail,
   error.detail if error else "")
eq("and the form is still there",
   db.query(InspectionForm).filter(InspectionForm.id == in_use.id).count(), 1)
eq("and so are the inspections",
   db.query(Inspection).filter(Inspection.form_template_id == in_use.id).count(), 2)

# A batch counts exactly like an inspection does.
batch_form = a_form(db, "Batch only")
db.add(InspectionBatch(
    batch_number="B-1", facility_id=1, form_template_id=batch_form.id,
    scheduled_date=datetime(2026, 1, 1),
))
db.flush()
error = refusal(delete_inspection_form, batch_form.id, db, user)
ok("a batch blocks the delete too",
   error is not None and error.status_code == 409, str(error))
ok("and is counted as one", error is not None and "1 inspection." in error.detail,
   error.detail if error else "")

# ── 3. Archiving works whether or not the form is in use ─────────────────────
archived = archive_inspection_form(in_use.id, db, user)
ok("an in-use form can be archived", archived["archived_at"] is not None)
eq("archiving does not remove it",
   db.query(InspectionForm).filter(InspectionForm.id == in_use.id).count(), 1)
eq("and leaves every inspection intact",
   db.query(Inspection).filter(Inspection.form_template_id == in_use.id).count(), 2)

stamp = archived["archived_at"]
again = archive_inspection_form(in_use.id, db, user)
eq("archiving twice does not move the timestamp", again["archived_at"], stamp)

restored = unarchive_inspection_form(in_use.id, db, user)
ok("it can be brought back", restored["archived_at"] is None)

# ── 4. The default report form is never removable ────────────────────────────
default = a_form(db, ADVANCED_REPORT_SCHEMA["title"])
ok("it is recognised as the default", _is_default_form(db, default))
error = refusal(delete_inspection_form, default.id, db, user)
ok("the default cannot be deleted",
   error is not None and error.status_code == 400, str(error))
error = refusal(archive_inspection_form, default.id, db, user)
ok("nor archived", error is not None and error.status_code == 400, str(error))
eq("and it is still there",
   db.query(InspectionForm).filter(InspectionForm.id == default.id).count(), 1)

# ── 5. Nullable references are detached, not left dangling ───────────────────
attached = a_form(db, "Attached to kit")
for tag in ("EQ-1", "EQ-2"):
    db.add(Equipment(
        asset_tag=tag, make="Philips", model="MX40", serial_number=tag,
        modality_id=1, facility_id=1, inspection_form_id=attached.id,
    ))
db.add(InventoryPart(
    part_number="P-1", part_type="sales", description="A part",
    inspection_form_id=attached.id,
))
db.flush()

result = delete_inspection_form(attached.id, db, user)
eq("equipment is detached", result["detached_equipment"], 2)
eq("parts are detached", result["detached_parts"], 1)
eq("the equipment survives", db.query(Equipment).count(), 2)
eq("with no form attached",
   db.query(Equipment).filter(Equipment.inspection_form_id.isnot(None)).count(), 0)
eq("the part survives", db.query(InventoryPart).count(), 1)

# ── 6. A form that does not exist is a 404, not a crash ──────────────────────
error = refusal(delete_inspection_form, 999999, db, user)
ok("missing form is a 404", error is not None and error.status_code == 404, str(error))
error = refusal(archive_inspection_form, 999999, db, user)
ok("archiving a missing form is a 404",
   error is not None and error.status_code == 404, str(error))

db.close()

print()
if failures:
    print("{} failed: {}".format(len(failures), ", ".join(failures)))
    raise SystemExit(1)
print("all checks passed")
