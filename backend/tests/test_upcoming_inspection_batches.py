"""Upcoming inspections are listed one batch per row.

Scheduling an inspection for several assets creates one batch, with one
inspection per asset. Upcoming lists the batch once, as In Progress and
Completed do, and its assets are started, rescheduled and closed together.
Inspections that belong to no batch, such as auto-generated ones, are still
listed on their own.

    cd backend
    DATABASE_URL=sqlite:// venv312/Scripts/python.exe tests/test_upcoming_inspection_batches.py
"""
from __future__ import annotations

import logging
import os
import pathlib
import sys
from datetime import date, datetime

os.environ.setdefault("DATABASE_URL", "sqlite://")
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))
logging.disable(logging.CRITICAL)

from fastapi import HTTPException  # noqa: E402
from sqlalchemy import create_engine  # noqa: E402
from sqlalchemy.orm import sessionmaker  # noqa: E402
from sqlalchemy.pool import StaticPool  # noqa: E402

import app.models  # noqa: E402,F401
from app.api.v1.endpoints.inspections import (  # noqa: E402
    InspectionBatchReschedule,
    InspectionScheduleCreate,
    close_inspection_batch,
    inspection_summary,
    list_inspection_batches,
    list_inspections,
    reopen_closed_inspection,
    InspectionReopen,
    reschedule_inspection_batch,
    schedule_inspections,
    start_inspection_batch,
)
from app.db.base import Base  # noqa: E402
from app.models.equipment import Equipment  # noqa: E402
from app.models.facility import Facility  # noqa: E402
from app.models.inspection import Inspection, InspectionBatch, InspectionStatus  # noqa: E402
from app.models.modality import Modality, ModalityCategory  # noqa: E402
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

boss = User(username="boss", email="b@x.test", full_name="Boss", hashed_password="x",
            user_type=UserType.EMPLOYEE, role=UserRole.SUPERADMIN, is_active=True)
tech = User(username="tech", email="t@x.test", full_name="Tech", hashed_password="x",
            user_type=UserType.EMPLOYEE, role=UserRole.SUPERADMIN, is_active=True)
sets = Modality(name="Surgical Sets", category=ModalityCategory.TREATMENT)
clinic = Facility(name="Life Path", contact_person="C", phone="1", email="c@x.test", address="1 St", city="Waco",
                  state="TX", zip_code="76701", country="US")
db.add_all([boss, tech, sets, clinic])
db.flush()
assets = [
    Equipment(asset_tag=tag, make="Stryker", model="Set", serial_number=f"SN-{tag}", modality_id=sets.id,
              facility_id=clinic.id, description="Instrument Set")
    for tag in ("SET-1", "SET-2", "SET-3")
]
db.add_all(assets)
db.commit()

WHEN = datetime(2026, 12, 15, 9, 0)


def batches(status: InspectionStatus = InspectionStatus.UPCOMING) -> dict:
    return list_inspection_batches(db=db, status_filter=status, facility_id=None, search=None, search_field=None,
                                   date_from=None, date_to=None, skip=0, limit=25, current_user=boss)


def individual_upcoming() -> dict:
    return list_inspections(db=db, status_filter=InspectionStatus.UPCOMING, facility_id=None, unbatched_only=True,
                            search=None, search_field=None, date_from=None, date_to=None, skip=0, limit=25,
                            current_user=boss)


def summary() -> dict:
    return inspection_summary(date_from=None, date_to=None, db=db, current_user=boss)


def schedule(equipment: list[Equipment]) -> dict:
    result = schedule_inspections(
        InspectionScheduleCreate(facility_id=clinic.id, equipment_ids=[item.id for item in equipment],
                                 frequency="annual", scheduled_date=WHEN),
        db=db, current_user=boss,
    )
    return result["items"][0]


print("Scheduling two sets for a future date")
first = schedule(assets[:2])
ok("makes one batch with two assets", first["asset_count"] == 2 and len(first["assets"]) == 2, first["asset_count"])
listed = batches()
ok("Upcoming lists it as one row", listed["total"] == 1 and listed["items"][0]["id"] == first["id"], listed["total"])
ok("the row names both assets", len(listed["items"][0]["asset_names"]) == 2 and all("Stryker" in name for name in listed["items"][0]["asset_names"]),
   listed["items"][0].get("asset_names"))
ok("and they are not listed again as separate inspections", individual_upcoming()["total"] == 0, individual_upcoming()["total"])
ok("the Upcoming count is 1, not 2", summary()["upcoming"] == 1, summary()["upcoming"])

print("\nAn inspection that belongs to no batch is still listed on its own")
loose = Inspection(inspection_number="INSP-LOOSE", facility_id=clinic.id, equipment_id=assets[2].id,
                   form_template_id=first["form_template_id"], scheduled_date=WHEN, status=InspectionStatus.UPCOMING)
db.add(loose)
db.commit()
ok("under Individual Inspections", individual_upcoming()["total"] == 1)
ok("and counted", summary()["upcoming"] == 2, summary()["upcoming"])

print("\nRescheduling the batch")
NEW = datetime(2027, 1, 10, 8, 30)
moved = reschedule_inspection_batch(first["id"], InspectionBatchReschedule(scheduled_date=NEW), db=db, current_user=boss)
ok("moves the batch", moved["scheduled_date"] == NEW, moved["scheduled_date"])
ok("and every asset in it", all(asset["scheduled_date"] == NEW for asset in moved["assets"]))

print("\nStarting the batch")
db.query(Inspection).filter(Inspection.batch_id == first["id"]).order_by(Inspection.id).first().inspector_id = tech.id
db.commit()
started = start_inspection_batch(first["id"], db=db, current_user=boss)
ok("starts both assets together", all(asset["status"] == "in_progress" for asset in started["assets"]),
   [asset["status"] for asset in started["assets"]])
ok("the batch moves to In Progress", started["status"] == "in_progress" and started["started_at"] is not None)
ok("it leaves Upcoming", batches()["total"] == 0)
ok("and shows in In Progress", any(item["id"] == first["id"] for item in batches(InspectionStatus.IN_PROGRESS)["items"]))
in_progress_items = batches(InspectionStatus.IN_PROGRESS)["items"]
ok("other batch lists are not given asset names", in_progress_items and all("asset_names" not in item for item in in_progress_items))
ok("a technician already assigned to an asset stays assigned",
   sorted(asset["inspector_id"] for asset in started["assets"]) == sorted([tech.id, boss.id]),
   [asset["inspector_id"] for asset in started["assets"]])
ok("the Upcoming count drops to the loose one", summary()["upcoming"] == 1, summary()["upcoming"])
ok("an In Progress batch cannot be rescheduled as a batch",
   refused(lambda: reschedule_inspection_batch(first["id"], InspectionBatchReschedule(scheduled_date=NEW), db=db, current_user=boss), 400))
ok("or closed as a batch", refused(lambda: close_inspection_batch(first["id"], db=db, current_user=boss), 400))
ok("starting it again is refused, nothing left to start", refused(lambda: start_inspection_batch(first["id"], db=db, current_user=boss), 400))

print("\nA batch left half-started by the old screen")
half = schedule([assets[2]])
extra = Inspection(inspection_number="INSP-HALF-2", facility_id=clinic.id, equipment_id=assets[0].id, batch_id=half["id"],
                   form_template_id=half["form_template_id"], scheduled_date=WHEN, status=InspectionStatus.IN_PROGRESS)
db.add(extra)
batch_row = db.get(InspectionBatch, half["id"])
batch_row.status = InspectionStatus.IN_PROGRESS
db.commit()
finished = start_inspection_batch(half["id"], db=db, current_user=boss)
ok("Start brings its waiting asset along", all(asset["status"] == "in_progress" for asset in finished["assets"]),
   [asset["status"] for asset in finished["assets"]])

print("\nClosing a batch")
third = schedule(assets[:2])
closed = close_inspection_batch(third["id"], db=db, current_user=boss)
ok("closes every asset", all(asset["status"] == "closed" for asset in closed["assets"]))
ok("the batch is closed", closed["status"] == "closed", closed["status"])
ok("and leaves Upcoming", all(item["id"] != third["id"] for item in batches()["items"]))
reopened = reopen_closed_inspection(closed["assets"][0]["id"], InspectionReopen(), db=db, current_user=boss)
ok("reopening one asset brings its batch back to Upcoming",
   any(item["id"] == third["id"] for item in batches()["items"]) and reopened["batch_id"] == third["id"])

print("\nThe batch date filter")
in_range = list_inspection_batches(db=db, status_filter=InspectionStatus.UPCOMING, facility_id=None, search=None,
                                   search_field=None, date_from=date(2026, 12, 1), date_to=date(2026, 12, 31),
                                   skip=0, limit=25, current_user=boss)
ok("finds the batch on its scheduled date", any(item["id"] == third["id"] for item in in_range["items"]))
out_of_range = list_inspection_batches(db=db, status_filter=InspectionStatus.UPCOMING, facility_id=None, search=None,
                                       search_field=None, date_from=date(2027, 2, 1), date_to=date(2027, 2, 28),
                                       skip=0, limit=25, current_user=boss)
ok("and not outside it", out_of_range["total"] == 0, out_of_range["total"])

print("\nA batch that does not exist")
ok("start: not found", refused(lambda: start_inspection_batch(99999, db=db, current_user=boss), 404))
ok("reschedule: not found", refused(lambda: reschedule_inspection_batch(99999, InspectionBatchReschedule(scheduled_date=NEW), db=db, current_user=boss), 404))
ok("close: not found", refused(lambda: close_inspection_batch(99999, db=db, current_user=boss), 404))

print()
if failures:
    print(f"{len(failures)} FAILED: {failures}")
    sys.exit(1)
print("ALL PASSED")
