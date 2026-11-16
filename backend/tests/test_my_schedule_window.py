"""A technician asks "what are my inspections from now on?"

The answer covers today and the next six days, says those dates, and lists
first the work whose day has passed but is still not done, marked overdue.
"From today" alone is that same week, never today only. A window that does not
start today has no overdue list: it is a question about those days.

    DATABASE_URL=sqlite:// venv312/Scripts/python.exe tests/test_my_schedule_window.py
"""
from __future__ import annotations

import os
import pathlib
import sys
from datetime import date, datetime, timedelta

os.environ.setdefault("DATABASE_URL", "sqlite://")
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))

from sqlalchemy import create_engine  # noqa: E402
from sqlalchemy.orm import sessionmaker  # noqa: E402
from sqlalchemy.pool import StaticPool  # noqa: E402

import app.models  # noqa: E402,F401
from app.assistant.tools import me  # noqa: E402
from app.assistant.tools.base import ToolContext  # noqa: E402
from app.assistant.tools.registry import TOOLS_BY_NAME  # noqa: E402
from app.db.base import Base  # noqa: E402
from app.models.equipment import Equipment  # noqa: E402
from app.models.facility import Facility  # noqa: E402
from app.models.inspection import Inspection, InspectionStatus  # noqa: E402
from app.models.inspection_form import InspectionForm  # noqa: E402
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

TODAY = date.today()


def at(days: int, hour: int = 9) -> datetime:
    day = TODAY + timedelta(days=days)
    return datetime(day.year, day.month, day.day, hour, 0)


def spoken(day: date) -> str:
    return "{}, {} {}, {}".format(day.strftime("%A"), day.strftime("%b"), day.day, day.year)


site = Facility(name="North Hospital", phone="0", email="n@x.test", address="1 Rd", city="Houston",
                state="TX", zip_code="77001", country="US")
db.add(site)
db.flush()
modality = Modality(name="Imaging", category=ModalityCategory.IMAGING)
db.add(modality)
db.flush()
form = InspectionForm(name="Annual safety", schema={})
db.add(form)
db.flush()
pump = Equipment(asset_tag="AT-1", make="Acme", model="P1", serial_number="S1", modality_id=modality.id, facility_id=site.id)
db.add(pump)
db.flush()


def person(username: str, role: UserRole, technician: bool = False) -> User:
    user = User(username=username, email=f"{username}@x.test", full_name=username.replace("_", " ").title(),
                hashed_password="x", user_type=UserType.EMPLOYEE, role=role, is_active=True, is_technician=technician)
    db.add(user)
    db.flush()
    return user


tech = person("sam_tech", UserRole.TECHNICIAN)
other = person("other_tech", UserRole.TECHNICIAN)
admin_tech = person("omar_admin", UserRole.ADMIN, technician=True)
_n = [0]


def inspection(owner: User, when: datetime, status=InspectionStatus.UPCOMING) -> str:
    _n[0] += 1
    number = f"INS-{_n[0]:04d}"
    db.add(Inspection(inspection_number=number, facility_id=site.id, equipment_id=pump.id, inspector_id=owner.id,
                      form_template_id=form.id, status=status, scheduled_date=when))
    db.flush()
    return number


def request(owner: User, when: datetime, status=ServiceRequestStatus.ASSIGNED) -> str:
    _n[0] += 1
    number = f"SR-{_n[0]:06d}"
    db.add(ServiceRequest(request_number=number, facility_id=site.id, equipment_id=pump.id, requester_id=other.id,
                          assigned_technician_id=owner.id, problem_description="Alarm", priority=Priority.HIGH,
                          status=status, preferred_datetime=when, history=[]))
    db.flush()
    return number


TOMORROW = inspection(tech, at(1))
DAY_FIVE = inspection(tech, at(5))
LAST_DAY = inspection(tech, at(6, 16))
BEYOND = inspection(tech, at(7, 8))                                    # the eighth day: outside the week
LATE = inspection(tech, at(-3), InspectionStatus.OVERDUE)              # due three days ago, not done
LATE_UPCOMING = inspection(tech, at(-1), InspectionStatus.UPCOMING)   # due yesterday, still marked upcoming
DONE = inspection(tech, at(-2), InspectionStatus.COMPLETED)           # finished: on nobody's schedule
SOMEONE_ELSES = inspection(other, at(2))
LATE_JOB = request(tech, at(-4))                                        # a service call whose day has passed
FINISHED_JOB = request(tech, at(-4), ServiceRequestStatus.COMPLETED)
ADMIN_LATE = inspection(admin_tech, at(-2))
ADMIN_NEXT = inspection(admin_tech, at(3))
db.commit()

ctx = ToolContext(db=db, user=tech)


def refs(result) -> list[str]:
    return [item["reference"] for item in result.items]


print("\n\"What are my inspections from now on?\" -- my_schedule with no dates")
week = me.my_schedule(ctx)
week_end = TODAY + timedelta(days=6)
ok("it covers today and the next six days", week.applied_filters["date_from"] == TODAY.isoformat()
   and week.applied_filters["date_to"] == week_end.isoformat(), week.applied_filters)
ok("  and gives those dates as they should be said",
   week.applied_filters["covers"] == f"{spoken(TODAY)} to {spoken(week_end)}", week.applied_filters["covers"])
ok("  the first note tells the answer to say them",
   week.notes[0] == f"This covers {spoken(TODAY)} to {spoken(week_end)}. Say these dates in the answer.", week.notes[0])
ok("the inspections in the week are there, the last day included",
   {TOMORROW, DAY_FIVE, LAST_DAY} <= set(refs(week)), refs(week))
ok("  the eighth day is not", BEYOND not in refs(week), refs(week))
ok("overdue work is there too: inspections and the service call whose day has passed",
   {LATE, LATE_UPCOMING, LATE_JOB} <= set(refs(week)), refs(week))
flagged = {item["reference"] for item in week.items if item.get("overdue")}
ok("  marked overdue, and only those", flagged == {LATE, LATE_UPCOMING, LATE_JOB}, flagged)
ok("  listed first", set(refs(week)[:3]) == {LATE, LATE_UPCOMING, LATE_JOB}, refs(week))
ok("  counted, and named in a note to mention first", week.aggregates["overdue_inspections"] == 2
   and week.aggregates["overdue_service_requests"] == 1
   and any("marked overdue: 2 inspection(s) and 1 service request(s)" in note for note in week.notes), week.notes)
ok("finished work is not on it, overdue or not", DONE not in refs(week) and FINISHED_JOB not in refs(week), refs(week))
ok("another technician's inspection is not", SOMEONE_ELSES not in refs(week), refs(week))

print("\n\"From today\": a start date with no end")
from_today = me.my_schedule(ctx, date_from=TODAY)
ok("is the same week, not today only", from_today.applied_filters["date_to"] == week_end.isoformat()
   and refs(from_today) == refs(week), (from_today.applied_filters, refs(from_today)))

print("\nA window that does not start today")
later = me.my_schedule(ctx, date_from=TODAY + timedelta(days=1))
ok("from tomorrow: the seven days from tomorrow", later.applied_filters["date_to"] == (TODAY + timedelta(days=7)).isoformat())
ok("  with no overdue list: it is about those days", not any(item.get("overdue") for item in later.items)
   and later.aggregates["overdue_inspections"] == 0, refs(later))
ok("  so the eighth day is now in", BEYOND in refs(later), refs(later))
one_day = me.my_schedule(ctx, date_from=TODAY + timedelta(days=5), date_to=TODAY + timedelta(days=5))
ok("a single day reads as that day", one_day.applied_filters["covers"] == spoken(TODAY + timedelta(days=5))
   and refs(one_day) == [DAY_FIVE], (one_day.applied_filters["covers"], refs(one_day)))
past = me.my_schedule(ctx, date_from=TODAY - timedelta(days=3), date_to=TODAY - timedelta(days=3))
ok("a past day lists what is still open from it, not as overdue", refs(past) == [LATE]
   and not any(item.get("overdue") for item in past.items), refs(past))

print("\nThe same for an administrator who also works as a technician")
mine = me.my_schedule(ToolContext(db=db, user=admin_tech))
ok("their overdue inspection first, then their week, nobody else's",
   refs(mine) == [ADMIN_LATE, ADMIN_NEXT] and mine.items[0].get("overdue") and not mine.items[1].get("overdue"), refs(mine))

print("\nWhat the model is told")
description = TOOLS_BY_NAME["my_schedule"].description
ok("my_schedule says what \"from now on\" covers and that the dates must be said",
   "from now on" in description and "today and the next six days" in description and "covers" in description)
ok("  and that overdue work is listed", "overdue" in description)

print(f"\n{len(failures)} FAILED: {failures}" if failures else "\nALL PASSED")
sys.exit(1 if failures else 0)
