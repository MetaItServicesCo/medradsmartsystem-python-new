"""Choosing assets in an inspection batch, to change their technician or remove them.

* Any of the batch's assets not completed or closed can be chosen. The chosen
  ones go to a technician; the others keep theirs. Choosing all of them is
  exactly the batch-wide change: the batch's own technician changes too.
  The technician given work gets one bell, not one per asset.
* The chosen assets are removed together, all or none. Removing every asset
  deletes the batch. Nothing is removed once the batch is closed or has an
  invoice, and a completed asset is never removed -- one row at a time too.

    cd backend
    DATABASE_URL=sqlite:// venv312/Scripts/python.exe tests/test_batch_asset_selection.py
"""
from __future__ import annotations

import logging
import os
import pathlib
import sys
from datetime import date, datetime
from decimal import Decimal as D

os.environ.setdefault("DATABASE_URL", "sqlite://")
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))
logging.disable(logging.CRITICAL)

from fastapi import HTTPException  # noqa: E402
from sqlalchemy import create_engine  # noqa: E402
from sqlalchemy.orm import sessionmaker  # noqa: E402
from sqlalchemy.pool import StaticPool  # noqa: E402

import app.models  # noqa: E402,F401
from app.api.v1.endpoints import inspections as api  # noqa: E402
from app.db.base import Base  # noqa: E402
from app.models.equipment import Equipment  # noqa: E402
from app.models.facility import Facility  # noqa: E402
from app.models.inspection import Inspection, InspectionBatch, InspectionStatus  # noqa: E402
from app.models.invoice import Invoice, InvoiceStatus, InvoiceType  # noqa: E402
from app.models.modality import Modality, ModalityCategory  # noqa: E402
from app.models.notification import Notification  # noqa: E402
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


engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
Base.metadata.create_all(engine)
db = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)()

clinic = Facility(name="Life Path", contact_person="C", phone="1", email="lp@x.test", address="1 St", city="Waco",
                  state="TX", zip_code="76701", country="US")
db.add(clinic)
db.flush()
n = {"i": 0}


def person(name: str, role: UserRole) -> User:
    n["i"] += 1
    user = User(username=f"u{n['i']}", email=f"u{n['i']}@x.test", full_name=name, hashed_password="x",
                user_type=UserType.EMPLOYEE, role=role, is_active=True)
    db.add(user)
    db.flush()
    return user


boss = person("Boss", UserRole.SUPERADMIN)
omar = person("Omar Ahmad", UserRole.TECHNICIAN)
sam = person("Sam Tech", UserRole.TECHNICIAN)
scales = Modality(name="Scales", category=ModalityCategory.TREATMENT)
db.add(scales)
db.flush()
assets = []
for tag in ("A-1", "A-2", "A-3", "A-4"):
    item = Equipment(asset_tag=tag, make="Pelstar", model="500", serial_number=f"S-{tag}", modality_id=scales.id,
                     facility_id=clinic.id, description="Scale")
    db.add(item)
    assets.append(item)
db.commit()


def new_batch(count: int = 4) -> dict:
    return api.schedule_inspections(api.InspectionScheduleCreate(
        facility_id=clinic.id, equipment_ids=[a.id for a in assets[:count]], scheduled_date=datetime(2026, 12, 1, 9),
        inspector_id=omar.id,
    ), db=db, current_user=boss)["items"][0]


def rows(batch_id: int) -> list[Inspection]:
    db.expire_all()
    return db.query(Inspection).filter(Inspection.batch_id == batch_id).order_by(Inspection.id).all()


def batch_row(batch_id: int):
    db.expire_all()
    return db.get(InspectionBatch, batch_id)


def bells(user: User) -> list[str]:
    return [row.message for row in db.query(Notification).filter(Notification.user_id == user.id).order_by(Notification.id)]


def set_status(inspection_id: int, status: InspectionStatus) -> None:
    db.get(Inspection, inspection_id).status = status
    db.commit()


def give(batch_id, ids, who):
    return api.change_inspection_batch_assets_technician(
        batch_id, api.BatchAssetTechnicianUpdate(inspection_ids=ids, inspector_id=who.id if who else None),
        db=db, current_user=boss)


def remove(batch_id, ids):
    return api.remove_assets_from_inspection_batch(batch_id, api.BatchAssetSelection(inspection_ids=ids), db=db, current_user=boss)


print("Changing the technician of chosen assets")
b = new_batch()
ids = [r.id for r in rows(b["id"])]
db.query(Notification).delete()
db.commit()
result = give(b["id"], ids[:2], sam)
after = rows(b["id"])
ok("the two chosen go to Sam", [r.inspector_id for r in after] == [sam.id, sam.id, omar.id, omar.id], [r.inspector_id for r in after])
ok("  the batch's own technician is unchanged", batch_row(b["id"]).inspector_id == omar.id)
ok("  Sam gets one bell for both", bells(sam) == ["2 asset(s) at Life Path."], bells(sam))
ok("  and the batch comes back with them", [a["inspector_id"] for a in result["assets"]][:2] == [sam.id, sam.id])
set_status(ids[3], InspectionStatus.COMPLETED)
ok("a completed asset keeps its technician", refused(lambda: give(b["id"], [ids[3]], sam), 400, "keep their technician"))
ok("an asset of another batch is refused", refused(lambda: give(b["id"], [999999], sam), 404))
give(b["id"], ids[:3], sam)
ok("choosing every asset still to do gives the whole batch, as the batch-wide change does",
   batch_row(b["id"]).inspector_id == sam.id and [r.inspector_id for r in rows(b["id"])][:3] == [sam.id] * 3
   and rows(b["id"])[3].inspector_id == omar.id)

print("\nRemoving chosen assets")
b2 = new_batch()
ids2 = [r.id for r in rows(b2["id"])]
set_status(ids2[0], InspectionStatus.COMPLETED)
ok("a completed asset is never removed, and nothing else is either", refused(lambda: remove(b2["id"], ids2[:2]), 400, "Completed")
   and len(rows(b2["id"])) == 4)
set_status(ids2[3], InspectionStatus.CLOSED)
ok("closed assets are removed one by one, not with others", refused(lambda: remove(b2["id"], ids2[2:]), 400, "Closed"))
result = remove(b2["id"], ids2[1:3])
ok("two removed together", [r.id for r in rows(b2["id"])] == [ids2[0], ids2[3]] and result["id"] == b2["id"], [r.id for r in rows(b2["id"])])

b3 = new_batch(2)
ids3 = [r.id for r in rows(b3["id"])]
db.query(Notification).delete()
db.commit()
result = remove(b3["id"], ids3)
ok("removing every asset deletes the batch", result.get("deleted") is True and batch_row(b3["id"]) is None and not rows(b3["id"]), result)
ok("  and its technician is told", any("was deleted" in m for m in bells(omar)), bells(omar))

b4 = new_batch(2)
ids4 = [r.id for r in rows(b4["id"])]
api.remove_asset_from_inspection_batch(b4["id"], ids4[0], db=db, current_user=boss)
result = api.remove_asset_from_inspection_batch(b4["id"], ids4[1], db=db, current_user=boss)
ok("one row at a time too: the last asset going deletes the batch", result.get("deleted") is True and batch_row(b4["id"]) is None)

print("\nNot once the batch is closed or invoiced")
b5 = new_batch(3)
ids5 = [r.id for r in rows(b5["id"])]
db.add(Invoice(invoice_number="INV-INSP-1", invoice_type=InvoiceType.INSPECTION, facility_id=clinic.id, inspection_batch_id=b5["id"],
               customer_name="Life Path", customer_email="lp@x.test", subtotal=D("100"), tax_amount=D("0"), discount_amount=D("0"),
               total_amount=D("100"), amount_paid=D("0"), balance_due=D("100"), status=InvoiceStatus.PENDING,
               issue_date=date(2026, 12, 1), due_date=date(2026, 12, 31)))
db.commit()
ok("an invoiced batch keeps its assets", refused(lambda: remove(b5["id"], ids5[:1]), 409, "invoice") and len(rows(b5["id"])) == 3)
ok("  one row at a time too", refused(lambda: api.remove_asset_from_inspection_batch(b5["id"], ids5[0], db=db, current_user=boss), 409, "invoice"))
ok("  its technicians can still change", give(b5["id"], ids5[:1], sam)["id"] == b5["id"] and rows(b5["id"])[0].inspector_id == sam.id)
b6 = new_batch(2)
ids6 = [r.id for r in rows(b6["id"])]
batch_row(b6["id"]).status = InspectionStatus.CLOSED
db.commit()
ok("a closed batch keeps its assets", refused(lambda: remove(b6["id"], ids6[:1]), 400, "upcoming or in-progress"))
ok("  one row at a time too", refused(lambda: api.remove_asset_from_inspection_batch(b6["id"], ids6[0], db=db, current_user=boss), 400))
ok("  and its technician cannot change", refused(lambda: give(b6["id"], ids6[:1], sam), 400))

print("\nThe batch-wide change, and deleting a batch, as before")
b7 = new_batch(2)
api.change_inspection_batch_technician(b7["id"], api.InspectionTechnicianUpdate(inspector_id=sam.id), db=db, current_user=boss)
ok("the whole batch to Sam", batch_row(b7["id"]).inspector_id == sam.id and all(r.inspector_id == sam.id for r in rows(b7["id"])))
deleted = api.delete_inspection_batch(b7["id"], db=db, current_user=boss)
ok("deleting a batch", deleted["batch_number"] == b7["batch_number"] and batch_row(b7["id"]) is None)
ok("an invoiced batch is not deleted", refused(lambda: api.delete_inspection_batch(b5["id"], db=db, current_user=boss), 409))

print(f"\n{len(failures)} FAILED: {failures}" if failures else "\nALL PASSED")
sys.exit(1 if failures else 0)
