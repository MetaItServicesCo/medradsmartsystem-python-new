"""Prove "what have I got on" answers about the asker, and only the asker.

Opening the assistant to every role turns a question it never had to handle
into the commonest one there is. "Where is my next call" has no useful answer
for a Super Admin and is the whole point for a technician, and getting it
wrong is not a wrong number on a dashboard -- it is sending somebody to
another person's job.

Two properties carry that, and both are checked here against the real models:

1. The asker is not a parameter. These tools read the session's user, so no
   amount of model confusion about who "I" is can surface somebody else's day.
2. A day is assembled from every source the person may see, and whatever is
   left out is said out loud. A technician's day is service requests and
   inspections; an HR manager's is meetings and leave. Building it from one
   role's working day would have made it quietly useless to the others -- an
   empty schedule reads as a free afternoon, not as a tool that does not know
   about your kind of work.

    DATABASE_URL=sqlite:// python backend/tests/test_my_schedule.py
"""
from __future__ import annotations

import inspect as pyinspect
import os
import pathlib
import sys
from datetime import date, datetime, timedelta

os.environ.setdefault("DATABASE_URL", "sqlite://")
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))

from sqlalchemy import create_engine  # noqa: E402
from sqlalchemy.orm import sessionmaker  # noqa: E402
from sqlalchemy.pool import StaticPool  # noqa: E402

import app.models  # noqa: E402,F401  - registers every table
from app.assistant.tools import me  # noqa: E402
from app.assistant.tools.base import ToolContext  # noqa: E402
from app.db.base import Base  # noqa: E402
from app.models.calendar import CalendarEvent  # noqa: E402
from app.models.equipment import Equipment  # noqa: E402
from app.models.facility import Facility  # noqa: E402
from app.models.hr import LeaveRequest, LeaveRequestStatus  # noqa: E402
from app.models.inspection import Inspection, InspectionStatus  # noqa: E402
from app.models.inspection_form import InspectionForm  # noqa: E402
from app.models.modality import Modality, ModalityCategory  # noqa: E402
from app.models.service_request import (  # noqa: E402
    Priority, ServiceRequest, ServiceRequestStatus,
)
from app.models.user import User, UserRole, UserType  # noqa: E402


failures: list[str] = []


def ok(label: str, condition: bool, detail: str = "") -> None:
    print("{}  {}{}".format("PASS" if condition else "FAIL", label,
                            "  " + detail if detail else ""))
    if not condition:
        failures.append(label)


engine = create_engine("sqlite://", connect_args={"check_same_thread": False},
                       poolclass=StaticPool)
Base.metadata.create_all(engine)
db = sessionmaker(bind=engine)()

TOMORROW = date.today() + timedelta(days=1)
AT_NINE = datetime.combine(TOMORROW, datetime.min.time()) + timedelta(hours=9)
AT_ELEVEN = AT_NINE + timedelta(hours=2)


def make_user(username, role, facility_id=None):
    person = User(username=username, email=username + "@x.test",
                  full_name=username.replace("_", " ").title(),
                  hashed_password="x", user_type=UserType.EMPLOYEE,
                  role=role, is_active=True, facility_id=facility_id)
    db.add(person)
    db.flush()
    return person


def make_site(name):
    return Facility(name=name, phone="0", email=name.replace(" ", "") + "@x.test",
                    address="12 Mill Road", city="Houston", state="TX",
                    zip_code="77001", country="US")


north = make_site("North Hospital")
south = make_site("South Clinic")
db.add_all([north, south])
db.flush()

modality = Modality(name="Imaging", category=ModalityCategory.IMAGING)
db.add(modality)
db.flush()
form = InspectionForm(name="Annual safety", schema={})
db.add(form)
db.flush()

pump = Equipment(asset_tag="AT-1", make="Acme", model="P1", serial_number="S1",
                 modality_id=modality.id, facility_id=north.id)
db.add(pump)
db.flush()

tech = make_user("tech", UserRole.TECHNICIAN)
other = make_user("other_tech", UserRole.TECHNICIAN)
hr = make_user("hr_person", UserRole.HR_MANAGER)
local = make_user("south_admin", UserRole.FACILITY_ADMIN, facility_id=south.id)

_n = [0]


def make_request(owner, when, facility=north,
                 status=ServiceRequestStatus.ASSIGNED):
    _n[0] += 1
    sr = ServiceRequest(
        request_number="SR-{:06d}".format(_n[0]), facility_id=facility.id,
        equipment_id=pump.id, requester_id=tech.id,
        assigned_technician_id=owner.id, problem_description="Alarm sounding",
        priority=Priority.HIGH, status=status, preferred_datetime=when,
        history=[])
    db.add(sr)
    return sr


def make_inspection(owner, when, facility=north,
                    status=InspectionStatus.UPCOMING):
    _n[0] += 1
    row = Inspection(
        inspection_number="INS-{:04d}".format(_n[0]), facility_id=facility.id,
        equipment_id=pump.id, inspector_id=owner.id,
        form_template_id=form.id, status=status, scheduled_date=when)
    db.add(row)
    return row


# Tomorrow, for the technician: one call, one inspection, plus a meeting.
make_request(tech, AT_ELEVEN)
make_inspection(tech, AT_NINE)
db.add(CalendarEvent(user_id=tech.id, title="Toolbox talk",
                     start_time=AT_NINE - timedelta(hours=1),
                     end_time=AT_NINE - timedelta(minutes=30)))
# Assigned to them but with no agreed time: real work, not on a schedule.
make_request(tech, None)
# Finished work is on nobody's schedule.
make_request(tech, AT_NINE, status=ServiceRequestStatus.COMPLETED)
# Somebody else's day, at the same hour.
make_request(other, AT_NINE)
make_inspection(other, AT_ELEVEN)

# The HR manager's day: a meeting and approved leave.
db.add(CalendarEvent(user_id=hr.id, title="Interview panel",
                     start_time=AT_NINE, end_time=AT_ELEVEN))
db.add(LeaveRequest(user_id=hr.id, start_date=TOMORROW, end_date=TOMORROW,
                    total_days=1, status=LeaveRequestStatus.APPROVED))
db.add(LeaveRequest(user_id=hr.id, start_date=TOMORROW, end_date=TOMORROW,
                    total_days=1, status=LeaveRequestStatus.PENDING))

# A facility admin assigned work at a site they cannot see.
make_request(local, AT_NINE, facility=north)
db.commit()

tech_ctx = ToolContext(db=db, user=tech)
hr_ctx = ToolContext(db=db, user=hr)
local_ctx = ToolContext(db=db, user=local)


print("A person's own day")
print("=" * 72)

print()
print("The asker cannot be aimed at anyone else")
print("-" * 72)

for name in ("my_schedule", "my_next_commitment"):
    params = set(pyinspect.signature(getattr(me, name)).parameters)
    ok("{} takes no user parameter".format(name),
       not (params & {"user", "user_id", "person", "technician_id", "inspector_id"}),
       ", ".join(sorted(params)))

print()
print("A technician's day")
print("-" * 72)

day = me.my_schedule(tech_ctx, date_from=TOMORROW, date_to=TOMORROW)
kinds = sorted(i["kind"] for i in day.items)
refs = {i["reference"] for i in day.items if i["reference"]}

ok("three things are on it", day.total_count == 3, str(kinds))
ok("the service request is there", "service_request" in kinds)
ok("the inspection is there", "inspection" in kinds)
ok("the meeting is there", "calendar_event" in kinds or "meeting" in kinds)
ok("it is in time order",
   [i["when"] for i in day.items] == sorted(i["when"] for i in day.items))
ok("the finished job is not on it",
   not any(i["status"] == "completed" for i in day.items))
ok("another technician's work is absent",
   "SR-000006" not in refs and "INS-0007" not in refs, str(sorted(refs)))
ok("undated work is counted, not shown",
   day.aggregates.get("unscheduled_service_requests") == 1)
ok("and it is said out loud",
   any("no agreed date" in n for n in day.notes), " | ".join(day.notes))
ok("the site is named", any(i.get("facility") == "North Hospital"
                            for i in day.items if i.get("facility_id")))
ok("the address is there for travel",
   any(i.get("address") for i in day.items if i.get("facility_id")))

print()
print("The next thing, and where")
print("-" * 72)

nxt = me.my_next_commitment(tech_ctx)
ok("exactly one thing comes back", nxt.total_count == 1)
if nxt.items:
    ok("it is the soonest", nxt.items[0]["title"] == "Toolbox talk",
       nxt.items[0]["title"])

print()
print("An HR manager's day is not a technician's")
print("-" * 72)

hr_day = me.my_schedule(hr_ctx, date_from=TOMORROW, date_to=TOMORROW)
hr_kinds = sorted(i["kind"] for i in hr_day.items)

ok("they get a schedule at all, not an error", hr_day.total_count >= 1, str(hr_kinds))
ok("their meeting is on it", "meeting" in hr_kinds or "calendar_event" in hr_kinds)
ok("approved leave is on it", "leave" in hr_kinds)
ok("leave not yet approved is not",
   sum(1 for k in hr_kinds if k == "leave") == 1, str(hr_kinds))
ok("they are told what they cannot see",
   any("does not have access" in n for n in hr_day.notes),
   " | ".join(hr_day.notes))
ok("service requests are named as excluded",
   any("service requests" in n for n in hr_day.notes))
ok("no service request leaks in",
   "service_request" not in hr_kinds)

print()
print("Facility scope still applies to your own work")
print("-" * 72)

scoped = me.my_schedule(local_ctx, date_from=TOMORROW, date_to=TOMORROW)
ok("work at a site they cannot see is withheld",
   not any(i["kind"] == "service_request" for i in scoped.items),
   str([i["kind"] for i in scoped.items]))

print()
print("An empty day says which kind of empty it is")
print("-" * 72)

far = date.today() + timedelta(days=300)
quiet = me.my_schedule(tech_ctx, date_from=far, date_to=far)
ok("nothing is returned", quiet.total_count == 0)
ok("it does not imply there is no work",
   any("not the same as having no work" in n for n in quiet.notes),
   " | ".join(quiet.notes))

print()
print("Defaults")
print("-" * 72)

week = me.my_schedule(tech_ctx)
ok("no dates means the week ahead",
   week.applied_filters["date_from"] == date.today().isoformat()
   and week.applied_filters["date_to"]
   == (date.today() + timedelta(days=6)).isoformat(),
   "{} to {}".format(week.applied_filters["date_from"],
                     week.applied_filters["date_to"]))
ok("the answer says whose day it is",
   week.applied_filters["person"] == "Tech", week.applied_filters["person"])

print()
print("=" * 72)
if failures:
    print("{} failing: {}".format(len(failures), ", ".join(failures)))
    sys.exit(1)
print("All personal-schedule checks passed.")
