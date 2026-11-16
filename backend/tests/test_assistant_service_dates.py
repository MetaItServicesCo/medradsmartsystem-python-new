"""The assistant on "what is assigned to me for <day>", for every kind of asker.

The bug this guards: an administrator who also works as a technician asked
"What service requests are assigned to me for 16 November?" and was told
none. The request booked for that day had been raised on the 10th, and the
search the assistant used read the 16th as the day requests were raised.

A service request has two dates: the day it is booked for (Preferred Date /
Time) and the day it was raised. my_schedule answers the asker's own day from
the booked date, whatever their role; search_service_requests now has to be
told which date a range is on, and never guesses.

    DATABASE_URL=sqlite:// venv312/Scripts/python.exe tests/test_assistant_service_dates.py
"""
from __future__ import annotations

import os
import pathlib
import sys
from datetime import date, datetime

os.environ.setdefault("DATABASE_URL", "sqlite://")
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))

from sqlalchemy import create_engine  # noqa: E402
from sqlalchemy.orm import sessionmaker  # noqa: E402
from sqlalchemy.pool import StaticPool  # noqa: E402

import app.models  # noqa: E402,F401
from app.assistant.tools import entities, me  # noqa: E402
from app.assistant.tools.base import ToolContext, ToolInputError  # noqa: E402
from app.assistant.tools.registry import TOOLS_BY_NAME  # noqa: E402
from app.db.base import Base  # noqa: E402
from app.models.equipment import Equipment  # noqa: E402
from app.models.facility import Facility  # noqa: E402
from app.models.modality import Modality, ModalityCategory  # noqa: E402
from app.models.service_request import Priority, ServiceRequest, ServiceRequestStatus  # noqa: E402
from app.models.user import User, UserRole, UserType  # noqa: E402

failures: list[str] = []


def ok(label: str, condition: bool, detail: object = "") -> None:
    print("{}  {}{}".format("PASS" if condition else "FAIL", label, f"  {detail}" if not condition and detail != "" else ""))
    if not condition:
        failures.append(label)


engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
Base.metadata.create_all(engine)
db = sessionmaker(bind=engine)()

DAY = date(2030, 11, 16)
RAISED = datetime(2030, 11, 10, 8, 0)


def at(day: date, hour: int) -> datetime:
    return datetime(day.year, day.month, day.day, hour, 0)


site = Facility(name="North Hospital", phone="0", email="n@x.test", address="1 Rd", city="Houston",
                state="TX", zip_code="77001", country="US")
db.add(site)
db.flush()
modality = Modality(name="Imaging", category=ModalityCategory.IMAGING)
db.add(modality)
db.flush()
pump = Equipment(asset_tag="AT-1", make="Acme", model="P1", serial_number="S1", modality_id=modality.id, facility_id=site.id)
db.add(pump)
db.flush()


def person(username: str, role: UserRole, *, technician: bool = False, facility: Facility | None = None) -> User:
    user = User(username=username, email=f"{username}@x.test", full_name=username.replace("_", " ").title(),
                hashed_password="x", user_type=UserType.EMPLOYEE, role=role, is_active=True,
                is_technician=technician, facility_id=facility.id if facility else None)
    db.add(user)
    db.flush()
    return user


admin_tech = person("omar_admin", UserRole.ADMIN, technician=True)       # the person who asked
tech = person("sam_tech", UserRole.TECHNICIAN)
admin = person("plain_admin", UserRole.ADMIN)                            # assigned nothing
facility_user = person("site_admin", UserRole.FACILITY_ADMIN, facility=site)
_n = [0]


def request(owner: User, booked: datetime | None, raised: datetime, status=ServiceRequestStatus.ASSIGNED) -> str:
    _n[0] += 1
    number = f"SR-{_n[0]:06d}"
    db.add(ServiceRequest(request_number=number, facility_id=site.id, equipment_id=pump.id, requester_id=facility_user.id,
                          assigned_technician_id=owner.id, problem_description="Alarm sounding", priority=Priority.HIGH,
                          status=status, preferred_datetime=booked, created_at=raised, history=[]))
    db.flush()
    return number


# The asker's work: raised on the 10th, booked for the 16th -- the one that was missed.
BOOKED_FOR_DAY = request(admin_tech, at(DAY, 10), RAISED)
# Raised on the 16th but booked for the 20th: about the 16th it is not.
RAISED_ON_DAY = request(admin_tech, at(date(2030, 11, 20), 9), at(DAY, 9))
# Assigned but with no booked date.
UNBOOKED = request(admin_tech, None, RAISED)
# Another technician's job on the 16th.
TECH_ON_DAY = request(tech, at(DAY, 14), RAISED)
db.commit()


def refs(result) -> set[str]:
    return {item.get("reference") or item.get("request_number") for item in result.items}


print("\n\"What service requests are assigned to me for 16 November?\" -- my_schedule, by role")
mine = me.my_schedule(ToolContext(db=db, user=admin_tech), date_from=DAY, date_to=DAY)
ok("administrator who is also a technician: the job booked for the 16th is there", BOOKED_FOR_DAY in refs(mine), refs(mine))
ok("  not the one merely raised that day and booked for the 20th", RAISED_ON_DAY not in refs(mine), refs(mine))
ok("  not another technician's job", TECH_ON_DAY not in refs(mine), refs(mine))
ok("  the job with no booked date is mentioned, not lost", mine.aggregates.get("unscheduled_service_requests") == 1
   and any("no agreed date" in note for note in mine.notes), (mine.aggregates, mine.notes))
theirs = me.my_schedule(ToolContext(db=db, user=tech), date_from=DAY, date_to=DAY)
ok("technician: their own job on the 16th, and only theirs", refs(theirs) == {TECH_ON_DAY}, refs(theirs))
nothing = me.my_schedule(ToolContext(db=db, user=admin), date_from=DAY, date_to=DAY)
ok("administrator assigned nothing: none, said as nothing booked, not as no work", nothing.total_count == 0
   and any("Nothing is scheduled" in note for note in nothing.notes), nothing.notes)
site_day = me.my_schedule(ToolContext(db=db, user=facility_user), date_from=DAY, date_to=DAY)
ok("facility user: no service work is theirs to do", not any(item["kind"] == "service_request" for item in site_day.items), refs(site_day))

print("\nsearch_service_requests must be told which date a range is on")
ctx = ToolContext(db=db, user=admin)
for label, kwargs in (("no date_basis", {}), ("an unknown date_basis", {"date_basis": "updated"})):
    try:
        entities.search_service_requests(ctx, date_from=DAY, date_to=DAY, **kwargs)
        ok(f"a date range with {label} is refused", False, "no error")
    except ToolInputError as error:
        ok(f"a date range with {label} is refused, saying what to use", "scheduled" in str(error) and "created" in str(error), str(error))
try:
    entities.search_service_requests(ctx, date_from=DAY, date_to=DAY)
except ToolInputError as error:
    ok("  and pointing a person's own day to my_schedule", "my_schedule" in str(error), str(error))
plain = entities.search_service_requests(ctx)
ok("no date range: no date_basis needed, as before", plain.total_count == 4, plain.total_count)

booked = entities.search_service_requests(ctx, assigned_technician_id=admin_tech.id, date_from=DAY, date_to=DAY, date_basis="scheduled")
ok("scheduled: the asker's job booked for the 16th", [i["request_number"] for i in booked.items] == [BOOKED_FOR_DAY], [i["request_number"] for i in booked.items])
ok("  each result says the day it is booked for", booked.items[0]["scheduled_for"].startswith("2030-11-16"), booked.items[0])
ok("  and the result says which date it used", booked.applied_filters["date_basis"] == "scheduled"
   and any("booked for" in note for note in booked.notes), (booked.applied_filters, booked.notes))
raised = entities.search_service_requests(ctx, assigned_technician_id=admin_tech.id, date_from=DAY, date_to=DAY, date_basis="created")
ok("created: the one raised on the 16th", [i["request_number"] for i in raised.items] == [RAISED_ON_DAY], [i["request_number"] for i in raised.items])
ok("  saying these are raised dates", any("raised" in note for note in raised.notes), raised.notes)
others = entities.search_service_requests(ctx, assigned_technician_id=tech.id, date_from=DAY, date_to=DAY, date_basis="Scheduled ")
ok("another person's day, as an administrator asks it (case and spaces forgiven)", [i["request_number"] for i in others.items] == [TECH_ON_DAY])

print("\nWhat the model is told")
tool = TOOLS_BY_NAME["search_service_requests"]
ok("the tool's schema offers date_basis: scheduled or created", tool.parameters["properties"]["date_basis"]["enum"] == ["scheduled", "created"])
ok("  its description sends the asker's own work to my_schedule", "my_schedule" in tool.description and "booked" in tool.description)
people = TOOLS_BY_NAME["search_users"]
ok("the people tool no longer sends the asker's own workload to the search", "for the asker's own, my_schedule" in people.description, people.description)

print(f"\n{len(failures)} FAILED: {failures}" if failures else "\nALL PASSED")
sys.exit(1 if failures else 0)
