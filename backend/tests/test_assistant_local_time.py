"""The assistant counts days and times where they happened.

Stored times are UTC; days are local. Three cases this guards:

* "What are the jobs assigned to Daniel today?" -- a Super Admin asks about
  someone else. person_schedule gives Daniel's booked service requests and
  inspections together, overdue first, on each facility's own day: a job
  booked for 7 pm Tuesday in Texas is stored as 1 am Wednesday UTC and is
  still Tuesday's. Technicians, who see only their own work, are never handed
  the tool.
* "Has Sultan marked attendance today?" -- each check-in counts on the local
  day where Sultan was (the zone his device recorded), exactly as the
  Attendance module counts it, and "today" is Sultan's today. A name that
  fits two people is not answered as one; no check-in is told apart from
  approved leave, with the last check-in given.
* "Today" for the asker is their browser's day, not the server's.

    DATABASE_URL=sqlite:// venv312/Scripts/python.exe tests/test_assistant_local_time.py
"""
from __future__ import annotations

import os
import pathlib
import sys
from datetime import date, datetime, timedelta, timezone

os.environ.setdefault("DATABASE_URL", "sqlite://")
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))

from fastapi import HTTPException  # noqa: E402
from sqlalchemy import create_engine  # noqa: E402
from sqlalchemy.orm import sessionmaker  # noqa: E402
from sqlalchemy.pool import StaticPool  # noqa: E402
from zoneinfo import ZoneInfo  # noqa: E402

import app.models  # noqa: E402,F401
from app.api.v1.endpoints.assistant_internal import list_tools, whoami  # noqa: E402
from app.assistant.tools import attendance, entities, local_time, me  # noqa: E402
from app.assistant.tools.base import ToolContext  # noqa: E402
from app.assistant.tools.registry import dispatch  # noqa: E402
from app.db.base import Base  # noqa: E402
from app.models.attendance import (  # noqa: E402
    AttendanceEvent, AttendanceEventType, AttendanceSource, AttendanceVerificationStatus,
)
from app.models.equipment import Equipment  # noqa: E402
from app.models.facility import Facility  # noqa: E402
from app.models.hr import LeaveRequest, LeaveRequestStatus  # noqa: E402
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


CHICAGO = "America/Chicago"
KARACHI = "Asia/Karachi"


def utc_of(local: datetime, zone: str) -> datetime:
    """The naive UTC instant a local wall-clock time is stored as."""
    return local.replace(tzinfo=ZoneInfo(zone)).astimezone(timezone.utc).replace(tzinfo=None)


print("\nThe helpers")
start, end = local_time.utc_bounds(date(2030, 3, 12), date(2030, 3, 12), CHICAGO)
ok("a Texas day in UTC: 05:00 to 05:00 next day (daylight time)", (start, end) == (datetime(2030, 3, 12, 5), datetime(2030, 3, 13, 5)), (start, end))
start, end = local_time.utc_bounds(date(2030, 3, 10), date(2030, 3, 10), CHICAGO)
ok("  the day the clocks change is 23 hours long", (end - start) == timedelta(hours=23), end - start)
start, _ = local_time.utc_bounds(date(2030, 1, 15), date(2030, 1, 15), KARACHI)
ok("a Karachi day starts at 19:00 UTC the evening before", start == datetime(2030, 1, 14, 19), start)
ok("7 pm Tuesday in Texas is stored as 1 am Wednesday, and is Tuesday there",
   local_time.local_date(datetime(2030, 1, 16, 1, 0), CHICAGO) == date(2030, 1, 15))
ok("a local time reads as people say it, with the zone",
   local_time.time_label(datetime(2030, 1, 16, 1, 0), CHICAGO) == "Tue, Jan 15, 7:00 PM CST",
   local_time.time_label(datetime(2030, 1, 16, 1, 0), CHICAGO))
late_evening_texas = datetime(2030, 1, 16, 2, 0, tzinfo=timezone.utc)   # 8 pm Tuesday in Texas
ok("at 8 pm in Texas it is still Tuesday there, Wednesday in UTC and in Karachi",
   local_time.today_in(CHICAGO, late_evening_texas) == date(2030, 1, 15)
   and late_evening_texas.date() == date(2030, 1, 16)
   and local_time.today_in(KARACHI, late_evening_texas) == date(2030, 1, 16))
ok("only real zones are accepted", local_time.valid_zone("Asia/Karachi") == "Asia/Karachi"
   and local_time.valid_zone("Mars/Base") is None and local_time.valid_zone("") is None
   and local_time.valid_zone("x" * 80) is None)
ok("zones are named for people", local_time.zone_label(KARACHI) == "Karachi time")

# ── Data ──────────────────────────────────────────────────────────────────────
# LOCAL_TIME_TEST_DB runs the same checks on a throwaway Postgres, as production uses.
if os.environ.get("LOCAL_TIME_TEST_DB"):
    engine = create_engine(os.environ["LOCAL_TIME_TEST_DB"])
else:
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)


def _buildable(table) -> bool:
    from sqlalchemy.schema import CreateTable
    try:
        CreateTable(table).compile(dialect=engine.dialect)
        return True
    except Exception:
        return False


Base.metadata.create_all(engine, tables=[t for t in Base.metadata.sorted_tables if _buildable(t)])
db = sessionmaker(bind=engine)()

texas = Facility(name="Dallas Medical", phone="0", email="d@x.test", address="1 Main St", city="Dallas",
                 state="TX", zip_code="75201", country="US", timezone=CHICAGO)
karachi_site = Facility(name="Karachi Clinic", phone="0", email="k@x.test", address="2 Rd", city="Karachi",
                        state="SD", zip_code="74000", country="PK", timezone=KARACHI)
other_site = Facility(name="Houston Clinic", phone="0", email="h@x.test", address="3 Rd", city="Houston",
                      state="TX", zip_code="77001", country="US", timezone=None)   # no zone set: Texas
db.add_all([texas, karachi_site, other_site])
db.flush()
modality = Modality(name="Imaging", category=ModalityCategory.IMAGING)
db.add(modality)
db.flush()
form = InspectionForm(name="Annual", schema={})
db.add(form)
db.flush()
monitor = Equipment(asset_tag="AT-1", make="Acme", model="P1", serial_number="S1", modality_id=modality.id, facility_id=texas.id)
db.add(monitor)
db.flush()


def person(name: str, role: UserRole, *, facility: Facility | None = None, technician: bool = False) -> User:
    user = User(username=name.lower().replace(" ", "_"), email=f"{name.lower().replace(' ', '.')}@x.test",
                full_name=name, hashed_password="x", user_type=UserType.EMPLOYEE, role=role, is_active=True,
                facility_id=facility.id if facility else None, is_technician=technician)
    db.add(user)
    db.flush()
    return user


boss = person("Omar Boss", UserRole.SUPERADMIN)
daniel = person("Daniel Ruiz", UserRole.TECHNICIAN)
sam = person("Sam Lee", UserRole.TECHNICIAN)
sultan = person("Sultan Khan", UserRole.EMPLOYEE)
sultan_two = person("Sultan Ahmed", UserRole.EMPLOYEE)
nadia = person("Nadia Shah", UserRole.EMPLOYEE)
site_admin = person("Dana Site", UserRole.FACILITY_ADMIN, facility=karachi_site)

# The day the questions are about: Daniel's today, in Texas.
DAY = local_time.today_in(CHICAGO)
_n = [0]


def job(owner: User, when_local: datetime, site: Facility, status=ServiceRequestStatus.ASSIGNED) -> str:
    _n[0] += 1
    number = f"SR-{_n[0]:06d}"
    db.add(ServiceRequest(request_number=number, facility_id=site.id, equipment_id=monitor.id, requester_id=boss.id,
                          assigned_technician_id=owner.id, problem_description="Alarm", priority=Priority.HIGH,
                          status=status, preferred_datetime=utc_of(when_local, site.timezone or CHICAGO), history=[]))
    db.flush()
    return number


def visit(owner: User, when_local: datetime, site: Facility, status=InspectionStatus.UPCOMING) -> str:
    _n[0] += 1
    number = f"INS-{_n[0]:04d}"
    db.add(Inspection(inspection_number=number, facility_id=site.id, equipment_id=monitor.id, inspector_id=owner.id,
                      form_template_id=form.id, status=status, scheduled_date=utc_of(when_local, site.timezone or CHICAGO)))
    db.flush()
    return number


def at(day: date, hour: int, minute: int = 0) -> datetime:
    return datetime(day.year, day.month, day.day, hour, minute)


EVENING_JOB = job(daniel, at(DAY, 19), texas)                       # 7 pm today in Texas: tomorrow in UTC
MORNING_VISIT = visit(daniel, at(DAY, 9), other_site)                # a facility with no zone set: Texas
TOMORROW_JOB = job(daniel, at(DAY + timedelta(days=1), 10), texas)
LATE_JOB = job(daniel, at(DAY - timedelta(days=2), 10), texas)        # overdue
KARACHI_JOB = job(daniel, at(DAY, 23, 30), karachi_site)             # Karachi's day, not Texas's
DONE_JOB = job(daniel, at(DAY, 11), texas, ServiceRequestStatus.COMPLETED)
SAMS_JOB = job(sam, at(DAY, 10), texas)
db.add(LeaveRequest(user_id=daniel.id, start_date=DAY + timedelta(days=3), end_date=DAY + timedelta(days=4),
                    total_days=2, status=LeaveRequestStatus.APPROVED))

# Sultan works in Karachi. His today, on his clock.
SULTAN_DAY = local_time.today_in(KARACHI)


def clock(user: User, kind: AttendanceEventType, local: datetime, zone: str = KARACHI) -> None:
    db.add(AttendanceEvent(user_id=user.id, event_type=kind, event_time=utc_of(local, zone), timezone=zone,
                           source=AttendanceSource.FACE, verification_status=AttendanceVerificationStatus.VERIFIED))


clock(sultan, AttendanceEventType.CHECK_IN, at(SULTAN_DAY, 0, 30))      # 00:30 local: the UTC date before
clock(sultan, AttendanceEventType.CHECK_OUT, at(SULTAN_DAY, 9, 0))
clock(sultan, AttendanceEventType.CHECK_IN, at(SULTAN_DAY - timedelta(days=1), 18, 2))
clock(nadia, AttendanceEventType.CHECK_IN, at(SULTAN_DAY - timedelta(days=2), 18, 5))   # not in today
db.add(LeaveRequest(user_id=nadia.id, start_date=SULTAN_DAY, end_date=SULTAN_DAY, total_days=1,
                    status=LeaveRequestStatus.APPROVED))
db.commit()


def ctx_for(user: User, zone: str | None = CHICAGO) -> ToolContext:
    return ToolContext(db=db, user=user, timezone=zone)


def refs(result) -> list[str]:
    return [item.get("reference") or item.get("request_number") for item in result.items]


print("\n\"What are the jobs assigned to Daniel today?\" -- asked by the Super Admin")
today_only = me.person_schedule(ctx_for(boss), daniel.id, date_from=DAY, date_to=DAY)
ok("the 7 pm job is today's, though stored as tomorrow in UTC", EVENING_JOB in refs(today_only), refs(today_only))
ok("  the inspection is there too: jobs means both", MORNING_VISIT in refs(today_only), refs(today_only))
ok("  the overdue job is listed first, marked overdue", refs(today_only)[0] == LATE_JOB
   and today_only.items[0].get("overdue") is True, refs(today_only))
ok("  tomorrow's job, finished work and Sam's job are not",
   not ({TOMORROW_JOB, DONE_JOB, SAMS_JOB} & set(refs(today_only))), refs(today_only))
ok("  the Karachi job is on Karachi's day: 11:30 pm there is not today in Texas terms of that site",
   (KARACHI_JOB in refs(today_only)) == (local_time.local_date(utc_of(at(DAY, 23, 30), KARACHI), KARACHI) == DAY))
evening = next(item for item in today_only.items if item["reference"] == EVENING_JOB)
ok("  each time is local, with the zone", evening["when_local"].startswith(DAY.strftime("%a")) and "7:00 PM C" in evening["when_local"]
   and evening["local_date"] == DAY.isoformat(), evening)
ok("  the dates covered are said", today_only.applied_filters["covers"] == local_time.day_label(DAY))
week = me.person_schedule(ctx_for(boss), daniel.id)
ok("no dates: Daniel's today and the next six days, with his approved leave",
   week.applied_filters["date_from"] == DAY.isoformat() and any(item["kind"] == "leave" for item in week.items)
   and TOMORROW_JOB in refs(week), (week.applied_filters, refs(week)))
ok("  the leave is a whole day, not a clock time", all(item["when_local"] is None for item in week.items if item["kind"] == "leave"))

print("\nWho may ask about someone else's day")
ok("a technician is never offered person_schedule", "person_schedule" not in {t["name"] for t in list_tools(current_user=daniel)["tools"]})
try:
    dispatch("person_schedule", ctx_for(daniel), {"user_id": sam.id})
    ok("  and a technician calling it anyway is refused", False, "no error")
except HTTPException as error:
    ok("  and a technician calling it anyway is refused", error.status_code == 403, error.detail)
ok("the Super Admin and a facility admin are offered it",
   "person_schedule" in {t["name"] for t in list_tools(current_user=boss)["tools"]}
   and "person_schedule" in {t["name"] for t in list_tools(current_user=site_admin)["tools"]})
scoped = me.person_schedule(ctx_for(site_admin), daniel.id, date_from=DAY - timedelta(days=3), date_to=DAY + timedelta(days=3))
ok("a facility admin sees only the jobs at their own facility", set(refs(scoped)) <= {KARACHI_JOB}, refs(scoped))
ok("  and not his leave without HR access", not any(item["kind"] == "leave" for item in scoped.items))
ok("asking about yourself is your own schedule", me.person_schedule(ctx_for(boss), boss.id).tool == "my_schedule")
try:
    me.person_schedule(ctx_for(boss), 999999)
    ok("an unknown person is refused", False)
except HTTPException as error:
    ok("an unknown person is refused, pointing to resolve_entity", "resolve_entity" in str(error.detail), error.detail)

print("\nThe searches count on the facility's day too")
booked = entities.search_service_requests(ctx_for(boss), assigned_technician_id=daniel.id, date_from=DAY, date_to=DAY, date_basis="scheduled")
ok("search_service_requests: the 7 pm job is today's", EVENING_JOB in [i["request_number"] for i in booked.items]
   and TOMORROW_JOB not in [i["request_number"] for i in booked.items], [i["request_number"] for i in booked.items])
ok("  with its local time", next(i for i in booked.items if i["request_number"] == EVENING_JOB)["scheduled_for_local"].find("7:00 PM") > 0)
visits = entities.search_inspections(ctx_for(boss), inspector_id=daniel.id, date_from=DAY, date_to=DAY, count_assets=True)
ok("search_inspections: the morning visit at the zone-less facility is today's (Texas)",
   [i["inspection_number"] for i in visits.items] == [MORNING_VISIT], [i["inspection_number"] for i in visits.items])

print("\n\"Has Sultan marked attendance today?\"")
# Several Sultans: not answered as one.
both = attendance.search_attendance(ctx_for(boss), person="Sultan")
ok("two people called Sultan: asks which, answers nothing yet", both.total_count == 0
   and sorted(both.aggregates["people_matching"]) == ["Sultan Ahmed", "Sultan Khan"] and "Ask which one" in both.notes[0], both.notes)
his = attendance.search_attendance(ctx_for(boss), user_id=sultan.id)
ok("by user_id: Sultan's today, on his own clock", his.applied_filters["date_from"] == SULTAN_DAY.isoformat()
   and any("Karachi time" in note and local_time.day_label(SULTAN_DAY) in note for note in his.notes), his.notes)
ok("  the 00:30 check-in is today's there, though the UTC date before",
   any(item["event"] == "check_in" and item["local_date"] == SULTAN_DAY.isoformat() for item in his.items)
   and his.total_count == 2, [(i["event"], i["local_date"]) for i in his.items])
ok("  and yesterday's 6:02 pm check-in is not", all(item["local_date"] == SULTAN_DAY.isoformat() for item in his.items))
first = next(item for item in his.items if item["event"] == "check_in")
ok("  times are local, with the zone", first["local_time"].endswith("12:30 AM PKT"), first["local_time"])
ok("  the module counts the same day", all(
    attendance.local_date_of(event).isoformat() == item["local_date"]
    for item, event in zip(his.items, db.query(AttendanceEvent).filter(AttendanceEvent.user_id == sultan.id)
                          .order_by(AttendanceEvent.event_time.desc()).limit(2))))
ok("  no leave for him today, said so", any("No approved leave" in note for note in his.notes), his.notes)

hers = attendance.search_attendance(ctx_for(boss), user_id=nadia.id)
ok("no check-in today: said, with her last check-in", hers.total_count == 0
   and any("No check-in recorded for Nadia Shah" in note for note in hers.notes)
   and any("last check-in before that" in note and "6:05 PM PKT" in note for note in hers.notes), hers.notes)
ok("  and that she is on approved leave today, not absent", any("Nadia Shah is on approved leave" in note for note in hers.notes), hers.notes)
nobody = attendance.search_attendance(ctx_for(boss), person="Zzyzx")
ok("a name that fits nobody is said as such, not as no check-in", any("Nobody's name matches" in note for note in nobody.notes))
everyone = attendance.search_attendance(ctx_for(boss))
ok("everyone today: each person's own today", {i["person"] for i in everyone.items} == {"Sultan Khan"}
   and any("each person's own today" in note for note in everyone.notes), [(i["person"], i["local_date"]) for i in everyone.items])
named_range = attendance.search_attendance(ctx_for(boss), user_id=sultan.id, date_from=SULTAN_DAY - timedelta(days=1),
                                           date_to=SULTAN_DAY - timedelta(days=1))
ok("an explicit day is that local day", [i["local_date"] for i in named_range.items] == [(SULTAN_DAY - timedelta(days=1)).isoformat()],
   [i["local_date"] for i in named_range.items])

print("\n\"Today\" is the asker's")
ok("their browser's zone wins", ToolContext(db=db, user=boss, timezone=KARACHI).today() == local_time.today_in(KARACHI))
ok("  without one, where they last checked in", ToolContext(db=db, user=sultan).zone == KARACHI)
ok("  without either, the business's (Texas)", ToolContext(db=db, user=boss).zone == CHICAGO)
ok("  an invalid zone is ignored", ToolContext(db=db, user=sultan, timezone="Mars/Base").zone == KARACHI)
who = whoami(db=db, current_user=boss, browser_zone=KARACHI)
ok("whoami gives the agent the asker's zone, today and local time",
   who["timezone"] == KARACHI and who["today"] == local_time.today_in(KARACHI).isoformat()
   and who["timezone_label"] == "Karachi time" and "PKT" in who["now_local"], who)
mine = me.my_schedule(ToolContext(db=db, user=daniel, timezone=CHICAGO), date_from=DAY, date_to=DAY)
ok("my_schedule for Daniel: the 7 pm job is today's, the same as when the boss asks", EVENING_JOB in refs(mine), refs(mine))

print(f"\n{len(failures)} FAILED: {failures}" if failures else "\nALL PASSED")
sys.exit(1 if failures else 0)
