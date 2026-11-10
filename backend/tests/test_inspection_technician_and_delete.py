"""Choosing an inspection's technician, and deleting a whole batch.

Scheduling or starting an inspection gives the batch and every asset in it to
the technician chosen (the creator if none is). A batch's technician can be
changed in one go: the batch and every asset not yet completed or closed.
The technician given work gets a bell. A whole upcoming or in-progress batch
can be deleted, with its asset inspections; the assets stay in inventory.
It is refused when an asset in it is completed or anything is invoiced.

    cd backend
    DATABASE_URL=sqlite:// venv312/Scripts/python.exe tests/test_inspection_technician_and_delete.py
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


engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
Base.metadata.create_all(engine)
db = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)()


def facility(name: str) -> Facility:
    item = Facility(name=name, contact_person="C", phone="1", email=f"{name[:4].lower()}@x.test", address="1 St", city="Waco",
                    state="TX", zip_code="76701", country="US")
    db.add(item)
    db.flush()
    return item


clinic, other = facility("Life Path"), facility("Other Clinic")
n = {"i": 0}


def person(name: str, role: UserRole, **extra) -> User:
    n["i"] += 1
    user = User(username=f"u{n['i']}", email=f"u{n['i']}@x.test", full_name=name, hashed_password="x",
                user_type=UserType.EMPLOYEE, role=role, is_active=extra.pop("active", True), **extra)
    db.add(user)
    db.flush()
    return user


boss = person("Boss", UserRole.SUPERADMIN)
omar = person("Omar Ahmad", UserRole.TECHNICIAN)
sam = person("Sam Tech", UserRole.TECHNICIAN)
gone = person("Gone Tech", UserRole.TECHNICIAN, active=False)
elsewhere = person("Elsa Elsewhere", UserRole.EMPLOYEE, is_technician=True, facility_id=other.id)
scales = Modality(name="Scales", category=ModalityCategory.TREATMENT)
db.add(scales)
db.flush()
assets = []
for tag in ("A-1", "A-2", "A-3"):
    item = Equipment(asset_tag=tag, make="Pelstar", model="500", serial_number=f"S-{tag}", modality_id=scales.id, facility_id=clinic.id, description="Scale")
    db.add(item)
    assets.append(item)
db.commit()
WHEN = datetime(2026, 12, 1, 9, 0)


def schedule(**kw):
    return api.schedule_inspections(api.InspectionScheduleCreate(facility_id=clinic.id, equipment_ids=[a.id for a in assets], scheduled_date=WHEN, **kw),
                                    db=db, current_user=boss)["items"][0]


def instant(**kw):
    return api.create_instant_inspection(api.InstantInspectionCreate(facility_id=clinic.id, equipment_ids=[a.id for a in assets], **kw),
                                         db=db, current_user=boss)["items"][0]


def bell(user: User) -> list[str]:
    return [row.title for row in db.query(Notification).filter(Notification.user_id == user.id, Notification.notification_type == "inspection").order_by(Notification.id)]


def clear() -> None:
    db.query(Notification).delete()
    db.commit()


def inspections_of(batch_id: int) -> list[Inspection]:
    db.expire_all()
    return db.query(Inspection).filter(Inspection.batch_id == batch_id).order_by(Inspection.id).all()


print("Choosing the technician when scheduling")
up = schedule(inspector_id=omar.id)
ok("the batch is Omar's", up["inspector_id"] == omar.id and up["inspector_name"] == "Omar Ahmad")
ok("  and every asset in it", all(i.inspector_id == omar.id for i in inspections_of(up["id"])) and len(inspections_of(up["id"])) == 3)
ok("Omar gets a bell", bell(omar) == [f"Inspection assigned: {up['batch_number']}"], bell(omar))
clear()
mine = schedule()
ok("with no technician chosen, it is the creator's, as before", mine["inspector_id"] == boss.id and all(i.inspector_id == boss.id for i in inspections_of(mine["id"])))
ok("  and nobody gets a bell", db.query(Notification).filter(Notification.notification_type == "inspection", Notification.title.like("Inspection assigned%")).count() == 0)
ok("an unknown technician is refused", refused(lambda: schedule(inspector_id=99999), 404))
ok("an inactive one too", refused(lambda: schedule(inspector_id=gone.id), 404))
ok("one who may only work at another facility too", refused(lambda: schedule(inspector_id=elsewhere.id), 422))

print("\nChoosing the technician when starting an instant inspection")
now = instant(inspector_id=sam.id)
ok("the batch is Sam's, in progress", now["inspector_id"] == sam.id and now["status"] == "in_progress")
ok("  and every asset in it", all(i.inspector_id == sam.id and i.status == InspectionStatus.IN_PROGRESS for i in inspections_of(now["id"])))
ok("Sam gets a bell", bell(sam) == [f"Inspection assigned: {now['batch_number']}"], bell(sam))
ok("with none chosen, the creator's, as before", instant()["inspector_id"] == boss.id)

print("\nChanging the technician for a whole batch")
clear()
rows = inspections_of(now["id"])
rows[0].status = InspectionStatus.COMPLETED
rows[1].status = InspectionStatus.CLOSED
db.commit()
changed = api.change_inspection_batch_technician(now["id"], api.InspectionTechnicianUpdate(inspector_id=omar.id), db=db, current_user=boss)
rows = inspections_of(now["id"])
ok("the batch is now Omar's", changed["inspector_id"] == omar.id and changed["inspector_name"] == "Omar Ahmad")
ok("  so is the asset still in progress", rows[2].inspector_id == omar.id)
ok("  a completed asset keeps who did it", rows[0].inspector_id == sam.id)
ok("  a closed asset is left as it was", rows[1].inspector_id == sam.id)
ok("Omar gets a bell", bell(omar) == [f"Inspection assigned: {now['batch_number']}"], bell(omar))
clear()
api.change_inspection_batch_technician(now["id"], api.InspectionTechnicianUpdate(inspector_id=omar.id), db=db, current_user=boss)
ok("giving it to the same technician again rings no bell", bell(omar) == [])
ok("an upcoming batch can be changed too", api.change_inspection_batch_technician(up["id"], api.InspectionTechnicianUpdate(inspector_id=sam.id), db=db, current_user=boss)["inspector_id"] == sam.id
   and all(i.inspector_id == sam.id for i in inspections_of(up["id"])))
ok("someone who may only work elsewhere is refused", refused(lambda: api.change_inspection_batch_technician(up["id"], api.InspectionTechnicianUpdate(inspector_id=elsewhere.id), db=db, current_user=boss), 422))
done_batch = db.get(InspectionBatch, mine["id"])
done_batch.status = InspectionStatus.COMPLETED
db.commit()
ok("a completed batch cannot be changed", refused(lambda: api.change_inspection_batch_technician(mine["id"], api.InspectionTechnicianUpdate(inspector_id=omar.id), db=db, current_user=boss), 400))
done_batch.status = InspectionStatus.UPCOMING
db.commit()
ok("a technician (who may edit) can change it", api.change_inspection_batch_technician(mine["id"], api.InspectionTechnicianUpdate(inspector_id=omar.id), db=db, current_user=sam)["inspector_id"] == omar.id)

print("\nChanging one asset's technician")
clear()
one = inspections_of(up["id"])[0]
api.update_inspection_technician(one.id, api.InspectionTechnicianUpdate(inspector_id=omar.id), db=db, current_user=boss)
ok("works as before", inspections_of(up["id"])[0].inspector_id == omar.id)
ok("  and the technician given it gets a bell", bell(omar) == [f"Inspection assigned: {up['batch_number']}"], bell(omar))

print("\nDeleting a whole batch")
clear()
up_ids = [i.id for i in inspections_of(up["id"])]
result = api.delete_inspection_batch(up["id"], db=db, current_user=boss)
db.expire_all()
ok("an upcoming batch is deleted", db.get(InspectionBatch, up["id"]) is None and result["deleted_inspections"] == 3, result)
ok("  with its asset inspections", db.query(Inspection).filter(Inspection.id.in_(up_ids)).count() == 0)
ok("  the assets stay in inventory", db.query(Equipment).count() == 3)
ok("  its technicians are told", bell(omar) == [f"Inspection cancelled: {up['batch_number']}"] and bell(sam) == [f"Inspection cancelled: {up['batch_number']}"], (bell(omar), bell(sam)))
working = instant(inspector_id=sam.id)
first = inspections_of(working["id"])[0]
first.form_data = {"checks": {"battery": "fail"}}
db.commit()
api.delete_inspection_batch(working["id"], db=db, current_user=boss)
db.expire_all()
ok("an in-progress batch is deleted, report details and all", db.get(InspectionBatch, working["id"]) is None and db.get(Inspection, first.id) is None)
ok("a batch with a completed asset is refused", refused(lambda: api.delete_inspection_batch(now["id"], db=db, current_user=boss), 400))
ok("  and nothing in it is deleted", db.get(InspectionBatch, now["id"]) is not None and len(inspections_of(now["id"])) == 3)
billed = instant(inspector_id=sam.id)
db.add(Invoice(invoice_number="INV-1", invoice_type=InvoiceType.INSPECTION, facility_id=clinic.id, inspection_batch_id=billed["id"],
               customer_name="Life Path", customer_email="l@x.test", subtotal=D("0"), total_amount=D("0"), balance_due=D("0"), issue_date=datetime(2026, 12, 1), due_date=datetime(2026, 12, 31), status=InvoiceStatus.CANCELLED))
db.commit()
ok("a batch with an invoice (even cancelled) is refused", refused(lambda: api.delete_inspection_batch(billed["id"], db=db, current_user=boss), 409))
asset_billed = instant(inspector_id=sam.id)
db.add(Invoice(invoice_number="INV-2", invoice_type=InvoiceType.INSPECTION, facility_id=clinic.id, inspection_id=inspections_of(asset_billed["id"])[0].id,
               customer_name="Life Path", customer_email="l@x.test", subtotal=D("0"), total_amount=D("0"), balance_due=D("0"), issue_date=datetime(2026, 12, 1), due_date=datetime(2026, 12, 31), status=InvoiceStatus.PENDING))
db.commit()
ok("so is one with an invoice for one of its assets", refused(lambda: api.delete_inspection_batch(asset_billed["id"], db=db, current_user=boss), 409))
closed_batch = instant()
for i in inspections_of(closed_batch["id"]):
    i.status = InspectionStatus.CLOSED
db.get(InspectionBatch, closed_batch["id"]).status = InspectionStatus.CLOSED
db.commit()
ok("a closed batch is not offered for deletion", refused(lambda: api.delete_inspection_batch(closed_batch["id"], db=db, current_user=boss), 400))
spare = schedule()
ok("a technician (no delete permission) cannot delete", refused(lambda: api.delete_inspection_batch(spare["id"], db=db, current_user=sam), 403))
ok("an unknown batch is not found", refused(lambda: api.delete_inspection_batch(99999, db=db, current_user=boss), 404))

print()
if failures:
    print(f"{len(failures)} FAILED: {failures}")
    sys.exit(1)
print("ALL PASSED")
