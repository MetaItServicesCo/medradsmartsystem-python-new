"""Finding inspections on the Upcoming tab: frequency, technician and search.

Frequency is matched exactly: "annual" is not "semi-annual", and a blank
frequency reads as annual, as the lists show it. Typed spellings such as
"Semi-Annual", "6 months" or "yearly" name the stored frequency. Several
search words narrow the list together ("brookvale annual"). Work orders can be
searched by the asset fields the search menu offers (serial, tier, modality,
criticality, requirement), each searching only itself.

    cd backend
    DATABASE_URL=sqlite:// venv312/Scripts/python.exe tests/test_inspection_list_search.py
    # on Postgres, as production runs:
    TEST_DATABASE_URL=postgresql://user:pass@host/db venv312/Scripts/python.exe tests/test_inspection_list_search.py
"""
from __future__ import annotations

import logging
import os
import pathlib
import sys
from datetime import datetime

os.environ.setdefault("DATABASE_URL", "sqlite://")
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))
logging.disable(logging.CRITICAL)

from sqlalchemy import create_engine, text  # noqa: E402
from sqlalchemy.orm import sessionmaker  # noqa: E402
from sqlalchemy.pool import StaticPool  # noqa: E402

import app.models  # noqa: E402,F401
from app.api.v1.endpoints.inspections import (  # noqa: E402
    InspectionScheduleCreate,
    list_inspection_batches,
    list_inspections,
    schedule_inspections,
)
from app.db.base import Base  # noqa: E402
from app.models.equipment import Equipment  # noqa: E402
from app.models.facility import Facility  # noqa: E402
from app.models.inspection import Inspection, InspectionStatus  # noqa: E402
from app.models.modality import Modality, ModalityCategory  # noqa: E402
from app.models.user import User, UserRole, UserType  # noqa: E402
from app.utils.inspection_schedule import canonical_inspection_frequency  # noqa: E402

failures: list[str] = []


def ok(label: str, condition: bool, detail: object = "") -> None:
    print("{}  {}{}".format("PASS" if condition else "FAIL", label, f"  {detail}" if not condition else ""))
    if not condition:
        failures.append(label)


url = os.environ.get("TEST_DATABASE_URL")
if url:
    engine = create_engine(url)
    with engine.begin() as connection:
        connection.execute(text("DROP SCHEMA public CASCADE; CREATE SCHEMA public"))
    print("Running on", engine.dialect.name)
else:
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
Base.metadata.create_all(engine)
db = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)()

print("The typed spellings of a frequency")
for typed, stored in [("Annual", "annual"), ("yearly", "annual"), ("12 months", "annual"),
                      ("Semi-Annual", "semi_annual"), ("semi annual", "semi_annual"), ("6 months", "semi_annual"),
                      ("biannual", "semi_annual"), ("semi_annual", "semi_annual"), ("Quarterly", "quarterly"),
                      ("3 months", "quarterly"), ("monthly", "monthly"), ("instant", "instant"),
                      ("brookvale", None), ("", None), (None, None)]:
    ok(f"{typed!r} -> {stored!r}", canonical_inspection_frequency(typed) == stored, canonical_inspection_frequency(typed))

boss = User(username="boss", email="b@x.test", full_name="Boss Person", hashed_password="x",
            user_type=UserType.EMPLOYEE, role=UserRole.SUPERADMIN, is_active=True)
amir = User(username="amir", email="a@x.test", full_name="Amir Khan", hashed_password="x",
            user_type=UserType.EMPLOYEE, role=UserRole.SUPERADMIN, is_active=True)
monitors = Modality(name="Patient Monitors", category=ModalityCategory.TREATMENT)
xray = Modality(name="X-Ray", category=ModalityCategory.TREATMENT)
brookvale = Facility(name="Brookvale Clinic", contact_person="C", phone="1", email="c@x.test", address="1 St",
                     city="Waco", state="TX", zip_code="76701", country="US")
cedar = Facility(name="Cedar Hospital", contact_person="C", phone="1", email="d@x.test", address="2 St",
                 city="Waco", state="TX", zip_code="76701", country="US")
db.add_all([boss, amir, monitors, xray, brookvale, cedar])
db.flush()


def asset(tag: str, facility: Facility, modality: Modality) -> Equipment:
    row = Equipment(asset_tag=tag, make="Acme", model="M", serial_number=f"SN-{tag}", modality_id=modality.id,
                    facility_id=facility.id, description="Asset")
    db.add(row)
    db.flush()
    return row


WHEN = datetime(2026, 12, 15, 9, 0)


def schedule(facility: Facility, equipment: list[Equipment], frequency: str, inspector: User, **extra) -> dict:
    result = schedule_inspections(
        InspectionScheduleCreate(facility_id=facility.id, equipment_ids=[item.id for item in equipment],
                                 frequency=frequency, scheduled_date=WHEN, inspector_id=inspector.id, **extra),
        db=db, current_user=boss,
    )
    return result["items"][0]


# Work orders (batches)
b_annual = schedule(brookvale, [asset("BA-1", brookvale, monitors)], "annual", boss, criticality="High")
b_semi = schedule(brookvale, [asset("BS-1", brookvale, xray)], "semi_annual", amir, compliance_requirement="Joint Commission")
c_annual = schedule(cedar, [asset("CA-1", cedar, monitors)], "annual", amir)
c_quarter = schedule(cedar, [asset("CQ-1", cedar, xray)], "quarterly", boss)
form_id = db.query(Inspection).first().form_template_id

# Individual inspections (no batch), with the stored spellings that occur
singles = {}
for number, facility, frequency, inspector in [
    ("INS-A", brookvale, "annual", boss),
    ("INS-BLANK", brookvale, None, boss),
    ("INS-SEMI", brookvale, "semi_annual", amir),
    ("INS-SEMI-ODD", cedar, "Semi-Annual", amir),
    ("INS-Q", cedar, "quarterly", boss),
    ("INS-M", cedar, "monthly", amir),
    ("INS-I", cedar, "instant", boss),
]:
    row = Inspection(inspection_number=number, facility_id=facility.id, inspector_id=inspector.id,
                     form_template_id=form_id, status=InspectionStatus.UPCOMING, scheduled_date=WHEN,
                     inspection_frequency=frequency)
    db.add(row)
    db.flush()
    singles[number] = row.id
# A blank frequency is stored as NULL (the column default would otherwise write "instant").
db.query(Inspection).filter(Inspection.id == singles["INS-BLANK"]).update({Inspection.inspection_frequency: None})
# Scheduling derives criticality from the equipment; give one work order's asset its own.
db.query(Inspection).filter(Inspection.batch_id == b_annual["id"]).update({Inspection.criticality: "urgent"})
db.commit()


def individual(**params) -> set[str]:
    base = dict(db=db, status_filter=InspectionStatus.UPCOMING, facility_id=None, unbatched_only=True, search=None,
                search_field=None, frequency=None, inspector_id=None, date_from=None, date_to=None, skip=0,
                limit=100, current_user=boss)
    base.update(params)
    return {item["inspection_number"] for item in list_inspections(**base)["items"]}


def orders(**params) -> set[str]:
    base = dict(db=db, status_filter=InspectionStatus.UPCOMING, facility_id=None, search=None, search_field=None,
                frequency=None, inspector_id=None, date_from=None, date_to=None, skip=0, limit=100,
                current_user=boss)
    base.update(params)
    return {item["batch_number"] for item in list_inspection_batches(**base)["items"]}


print("\nNothing chosen: every upcoming row, as before")
ok("all individual inspections", individual() == set(singles), individual())
ok("all work orders", len(orders()) == 4, orders())

print("\nThe frequency filter is exact")
ok("annual: annual and blank, never semi-annual", individual(frequency="annual") == {"INS-A", "INS-BLANK"},
   individual(frequency="annual"))
ok("semi-annual: both stored spellings", individual(frequency="semi_annual") == {"INS-SEMI", "INS-SEMI-ODD"},
   individual(frequency="semi_annual"))
ok("'6 months' is semi-annual", individual(frequency="6 months") == {"INS-SEMI", "INS-SEMI-ODD"})
ok("quarterly", individual(frequency="quarterly") == {"INS-Q"})
ok("monthly", individual(frequency="monthly") == {"INS-M"})
ok("instant", individual(frequency="instant") == {"INS-I"}, individual(frequency="instant"))
ok("work orders: annual is not semi-annual",
   orders(frequency="annual") == {b_annual["batch_number"], c_annual["batch_number"]}, orders(frequency="annual"))
ok("work orders: semi-annual", orders(frequency="semi_annual") == {b_semi["batch_number"]})
ok("work orders: quarterly", orders(frequency="quarterly") == {c_quarter["batch_number"]})

print("\nThe technician filter")
ok("Amir's individual inspections", individual(inspector_id=amir.id) == {"INS-SEMI", "INS-SEMI-ODD", "INS-M"})
ok("Amir's work orders", orders(inspector_id=amir.id) == {b_semi["batch_number"], c_annual["batch_number"]})
ok("filters combine: Amir + annual", orders(inspector_id=amir.id, frequency="annual") == {c_annual["batch_number"]})
ok("filters combine with facility", individual(facility_id=cedar.id, frequency="semi_annual") == {"INS-SEMI-ODD"})

print("\nSearching by frequency")
ok("Frequency field, 'annual': not semi-annual",
   individual(search="annual", search_field="frequency") == {"INS-A", "INS-BLANK"},
   individual(search="annual", search_field="frequency"))
ok("Frequency field, 'Semi-Annual'",
   individual(search="Semi-Annual", search_field="frequency") == {"INS-SEMI", "INS-SEMI-ODD"})
ok("Frequency field, 'semi annual' as a phrase",
   individual(search="semi annual", search_field="frequency") == {"INS-SEMI", "INS-SEMI-ODD"},
   individual(search="semi annual", search_field="frequency"))
ok("Work orders, frequency field 'annual'",
   orders(search="annual", search_field="frequency") == {b_annual["batch_number"], c_annual["batch_number"]})
ok("Frequency field, a partial word still finds by substring",
   individual(search="quart", search_field="frequency") == {"INS-Q"})
ok("All fields, 'annual': not semi-annual", individual(search="annual") == {"INS-A", "INS-BLANK"},
   individual(search="annual"))

print("\nSeveral words narrow the list together")
ok("'brookvale annual'", individual(search="brookvale annual") == {"INS-A", "INS-BLANK"},
   individual(search="brookvale annual"))
ok("'cedar semi-annual'", individual(search="cedar semi-annual") == {"INS-SEMI-ODD"},
   individual(search="cedar semi-annual"))
ok("'amir monthly'", individual(search="amir monthly") == {"INS-M"}, individual(search="amir monthly"))
ok("work orders: 'cedar annual'", orders(search="cedar annual") == {c_annual["batch_number"]},
   orders(search="cedar annual"))
ok("a whole facility name still matches as a phrase", individual(search="Cedar Hospital") ==
   {"INS-SEMI-ODD", "INS-Q", "INS-M", "INS-I"}, individual(search="Cedar Hospital"))
ok("one word: unchanged behaviour", individual(search="brookvale") == {"INS-A", "INS-BLANK", "INS-SEMI"})
ok("no match: empty", individual(search="zzz nothing") == set())

print("\nWork orders searched by asset fields")
ok("serial", orders(search="SN-CQ", search_field="serial") == {c_quarter["batch_number"]},
   orders(search="SN-CQ", search_field="serial"))
ok("modality", orders(search="x-ray", search_field="modality") == {b_semi["batch_number"], c_quarter["batch_number"]},
   orders(search="x-ray", search_field="modality"))
ok("criticality", orders(search="urgent", search_field="criticality") == {b_annual["batch_number"]},
   orders(search="urgent", search_field="criticality"))
ok("requirement", orders(search="joint", search_field="requirement") == {b_semi["batch_number"]},
   orders(search="joint", search_field="requirement"))
ok("a serial does not leak into other fields' searches",
   orders(search="SN-CQ", search_field="facility") == set(), orders(search="SN-CQ", search_field="facility"))

print("\nCounts and paging still agree")
page = list_inspections(db=db, status_filter=InspectionStatus.UPCOMING, facility_id=None, unbatched_only=True,
                        search="cedar", search_field=None, frequency=None, inspector_id=None, date_from=None,
                        date_to=None, skip=0, limit=2, current_user=boss)
ok("the total counts every match, not the page", page["total"] == 4 and len(page["items"]) == 2, page["total"])

db.close()
print("\n" + ("All inspection search checks passed" if not failures else f"{len(failures)} failed: {failures}"))
sys.exit(1 if failures else 0)
