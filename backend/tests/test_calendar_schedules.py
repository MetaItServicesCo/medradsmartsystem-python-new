"""Technician schedules in the Calendar.

Super Admins, Admins and technicians (by role, or any role flagged as one)
create an event and tag one or more technicians. It shows in each tagged
technician's calendar, in every Admin's and Super Admin's, and in its
creator's. The creator or an Admin / Super Admin changes or deletes it; tagged
technicians are told through the bell. Personal and workspace events work as
before.

    cd backend
    DATABASE_URL=sqlite:// venv312/Scripts/python.exe tests/test_calendar_schedules.py
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

from fastapi import HTTPException  # noqa: E402
from sqlalchemy import create_engine  # noqa: E402
from sqlalchemy.orm import sessionmaker  # noqa: E402
from sqlalchemy.pool import StaticPool  # noqa: E402
from starlette.requests import Request  # noqa: E402

import app.models  # noqa: E402,F401
from app.api.v1.endpoints import calendar as cal  # noqa: E402
from app.db.base import Base  # noqa: E402
from app.models.calendar import CalendarEvent  # noqa: E402
from app.models.chat import Workspace, WorkspaceMember  # noqa: E402
from app.models.notification import Notification  # noqa: E402
from app.models.user import User, UserRole, UserType  # noqa: E402
from app.schemas.calendar import CalendarEventCreate, CalendarEventUpdate, ScheduleClashCheck  # noqa: E402

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


# CALENDAR_TEST_DB runs the same checks on a throwaway Postgres, as production uses.
if os.environ.get("CALENDAR_TEST_DB"):
    engine = create_engine(os.environ["CALENDAR_TEST_DB"])
    Base.metadata.drop_all(engine)
else:
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
Base.metadata.create_all(engine)
db = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)()

n = {"i": 0}


def person(name: str, role: UserRole, flagged: bool = False, active: bool = True) -> User:
    n["i"] += 1
    user = User(username=f"u{n['i']}", email=f"u{n['i']}@x.test", full_name=name, hashed_password="x",
                user_type=UserType.CLIENT if role == UserRole.CLIENT else UserType.EMPLOYEE,
                role=role, is_active=active, is_technician=flagged)
    db.add(user)
    db.flush()
    return user


boss = person("Super Admin", UserRole.SUPERADMIN)
admin = person("Admin One", UserRole.ADMIN)
admin2 = person("Admin Two", UserRole.ADMIN)
omar = person("Omar Ahmad", UserRole.TECHNICIAN)
sam = person("Sam Tech", UserRole.TECHNICIAN)
hr_tech = person("Hana Flagged", UserRole.HR_MANAGER, flagged=True)
staff = person("Ella Employee", UserRole.EMPLOYEE)
client = person("Clinic Client", UserRole.CLIENT, flagged=True)
gone = person("Gone Tech", UserRole.TECHNICIAN, active=False)
db.commit()


def at(day: int, hour: int) -> datetime:
    return datetime(2026, 11, day, hour, 0)


def create(user: User, **fields):
    fields.setdefault("title", "Site visit")
    fields.setdefault("start_time", at(17, 10))
    fields.setdefault("end_time", at(17, 12))
    return cal.create_event(db=db, event_in=CalendarEventCreate(**fields), current_user=user)


def update(user: User, event_id: int, **fields):
    return cal.update_event(db=db, event_id=event_id, event_in=CalendarEventUpdate(**fields), current_user=user)


def seen(user: User) -> dict[int, dict]:
    return {event["id"]: event for event in cal.get_events(db=db, current_user=user)}


def bell(user: User) -> list[str]:
    return [row.title for row in db.query(Notification).filter(Notification.user_id == user.id).order_by(Notification.id).all()]


def clear_bells() -> None:
    db.query(Notification).delete()
    db.commit()


print("Who can be tagged")
names = [t["full_name"] for t in cal.list_schedule_technicians(db=db, current_user=admin)]
ok("technicians by role and by flag are listed", {"Omar Ahmad", "Sam Tech", "Hana Flagged"} <= set(names), names)
ok("not staff without the flag, clients or inactive technicians", not {"Ella Employee", "Clinic Client", "Gone Tech", "Admin One"} & set(names), names)
ok("a technician can see the list too", len(cal.list_schedule_technicians(db=db, current_user=omar)) == 3)
ok("a user who cannot create schedules is refused the list", refused(lambda: cal.list_schedule_technicians(db=db, current_user=staff), 403))

print("\nAn Admin schedules Omar")
visit = create(admin, title="Site visit - Life Path", technician_ids=[omar.id], location="Life Path Clinic", description="Bring the analyzer")
ok("it is a schedule, with Omar tagged", visit["is_schedule"] and [t["full_name"] for t in visit["technicians"]] == ["Omar Ahmad"], visit)
ok("location and notes are kept", visit["location"] == "Life Path Clinic" and visit["description"] == "Bring the analyzer")
ok("Omar gets a bell", bell(omar) == ["Scheduled: Site visit - Life Path"], bell(omar))
ok("  which opens the event", db.query(Notification).filter(Notification.user_id == omar.id).first().link_url == f"/calendar?event={visit['id']}")
ok("the Admin who created it gets none", bell(admin) == [])
ok("Omar sees it", visit["id"] in seen(omar))
ok("every Admin and Super Admin sees it", all(visit["id"] in seen(u) for u in (admin, admin2, boss)))
ok("another technician does not", visit["id"] not in seen(sam))
ok("staff and clients do not", visit["id"] not in seen(staff) and visit["id"] not in seen(client))
ok("Omar may not change it", seen(omar)[visit["id"]]["can_edit"] is False)
ok("the creator, another Admin and the Super Admin may", all(seen(u)[visit["id"]]["can_edit"] for u in (admin, admin2, boss)))
ok("Omar is refused when he tries to change it", refused(lambda: update(omar, visit["id"], title="Mine now"), 403))
ok("  or delete it", refused(lambda: cal.delete_event(db=db, event_id=visit["id"], current_user=omar), 403))
ok("Sam cannot even find it", refused(lambda: update(sam, visit["id"], title="x"), 404))

print("\nA technician schedules other technicians")
clear_bells()
job = create(omar, title="PM round", technician_ids=[sam.id, hr_tech.id, omar.id], start_time=at(18, 9), end_time=at(18, 17))
ok("a technician can tag other technicians, and a flagged HR manager", {t["id"] for t in job["technicians"]} == {sam.id, hr_tech.id, omar.id})
ok("each of the others gets a bell, the creator none", bell(sam) == ["Scheduled: PM round"] and bell(hr_tech) == ["Scheduled: PM round"] and bell(omar) == [])
ok("Sam and Hana see it; so do the Admins", all(job["id"] in seen(u) for u in (sam, hr_tech, admin, boss)))
ok("Omar, its creator, may change it", seen(omar)[job["id"]]["can_edit"] is True)
ok("Sam, only tagged, may not", seen(sam)[job["id"]]["can_edit"] is False)
ok("staff without the flag cannot create a schedule", refused(lambda: create(staff, technician_ids=[omar.id]), 403))
ok("nor can a client", refused(lambda: create(client, technician_ids=[omar.id]), 403))
ok("only technicians can be tagged", refused(lambda: create(admin, technician_ids=[staff.id]), 422))
ok("  not inactive ones", refused(lambda: create(admin, technician_ids=[gone.id]), 422))
ok("a schedule is not a workspace event", refused(lambda: create(admin, technician_ids=[omar.id], workspace_id=1), 400))
ok("the end cannot be before the start", refused(lambda: create(admin, technician_ids=[omar.id], start_time=at(17, 12), end_time=at(17, 10)), 400))
ok("a schedule is never a workspace meeting", create(admin, technician_ids=[omar.id], is_meeting=True, title="Not a meeting")["is_meeting"] is False)
day = create(admin, technician_ids=[sam.id], all_day=True, title="Training day", start_time=at(20, 0), end_time=at(21, 0))
ok("an all-day schedule is kept as all day", day["all_day"] is True)

print("\nChanging a schedule")
clear_bells()
update(admin2, visit["id"], start_time=at(17, 13), end_time=at(17, 15))
ok("another Admin moves it: Omar is told it changed", bell(omar) == ["Schedule changed: Site visit - Life Path"], bell(omar))
clear_bells()
update(admin, visit["id"], technician_ids=[sam.id])
ok("swapping Omar for Sam: Sam is told he is scheduled", bell(sam) == ["Scheduled: Site visit - Life Path"], bell(sam))
ok("  Omar is told he was removed", bell(omar) == ["Removed from schedule: Site visit - Life Path"], bell(omar))
ok("  and no longer sees it; Sam does", visit["id"] not in seen(omar) and visit["id"] in seen(sam))
clear_bells()
update(admin, visit["id"], color="#10B981")
ok("changing only the colour does not ring anyone", bell(sam) == [])
ok("a schedule must keep at least one technician", refused(lambda: update(admin, visit["id"], technician_ids=[]), 400))
ok("an edit cannot put the end before the start", refused(lambda: update(admin, visit["id"], end_time=at(17, 1)), 400))

print("\nClashes: a warning, saving still allowed")
check = lambda user, ids, start, end, exclude=None: cal.schedule_clashes(
    ScheduleClashCheck(technician_ids=ids, start_time=start, end_time=end, exclude_event_id=exclude), db=db, current_user=user)
over = check(admin, [sam.id], at(17, 14), at(17, 16))
ok("Sam at 14:00 overlaps the 13:00-15:00 visit", [c["event_id"] for c in over] == [visit["id"]] and over[0]["title"] == "Site visit - Life Path", over)
ok("back to back is not a clash", check(admin, [sam.id], at(17, 15), at(17, 16)) == [])
ok("the event itself is not its own clash", check(admin, [sam.id], at(17, 13), at(17, 15), visit["id"]) == [])
hidden = check(hr_tech, [sam.id], at(17, 14), at(17, 16))
ok("someone who cannot see that schedule learns only that the time is taken", hidden and hidden[0]["title"] == "Another booking", hidden)
ok("a clash does not stop saving", create(admin, technician_ids=[sam.id], start_time=at(17, 14), end_time=at(17, 16), title="Double booked")["is_schedule"])
ok("users who cannot schedule cannot check", refused(lambda: check(staff, [sam.id], at(17, 14), at(17, 16)), 403))

print("\nDeleting a schedule")
clear_bells()
cal.delete_event(db=db, event_id=job["id"], current_user=omar)
ok("its creator deletes it; the tagged technicians are told", bell(sam) == ["Schedule cancelled: PM round"] and bell(hr_tech) == ["Schedule cancelled: PM round"])
ok("it is gone", db.get(CalendarEvent, job["id"]) is None)
cal.delete_event(db=db, event_id=day["id"], current_user=boss)
ok("a Super Admin can delete someone else's schedule", db.get(CalendarEvent, day["id"]) is None)

print("\nPersonal and workspace events, as before")
mine = create(staff, title="Dentist")
ok("a personal event is not a schedule and tags no one", mine["is_schedule"] is False and mine["technicians"] == [])
ok("only its owner sees it, not the Admins", mine["id"] in seen(staff) and mine["id"] not in seen(admin) and mine["id"] not in seen(boss))
ok("its owner may change it", update(staff, mine["id"], title="Dentist 3pm")["title"] == "Dentist 3pm")
ok("nobody else may", refused(lambda: update(admin, mine["id"], title="x"), 403))
team = Workspace(name="Biomed team", created_by=staff.id)
db.add(team)
db.flush()
db.add_all([WorkspaceMember(workspace_id=team.id, user_id=staff.id), WorkspaceMember(workspace_id=team.id, user_id=sam.id)])
db.commit()
meet = create(staff, title="Team meeting", workspace_id=team.id, is_meeting=True)
ok("a workspace meeting is seen by its members", meet["id"] in seen(sam) and meet["is_meeting"] is True)
ok("  not by the Admins, who are not members", meet["id"] not in seen(admin))
cal.delete_event(db=db, event_id=mine["id"], current_user=staff)
ok("an owner deletes their own personal event", db.get(CalendarEvent, mine["id"]) is None)
own = create(omar, title="My own reminder")
turned = update(omar, own["id"], technician_ids=[sam.id])
ok("a technician's own event becomes a schedule when he tags someone", turned["is_schedule"] and turned["technicians"][0]["id"] == sam.id)

print("\nTimes: saved in UTC, sent back marked as UTC")
from datetime import timedelta, timezone as tz  # noqa: E402
from app.schemas.calendar import CalendarEventResponse, ScheduleClash  # noqa: E402
from sqlalchemy import text  # noqa: E402

as_json = lambda event: CalendarEventResponse(**event).model_dump(mode="json")
check = lambda user, ids, start, end, exclude=None: cal.schedule_clashes(
    ScheduleClashCheck(technician_ids=ids, start_time=start, end_time=end, exclude_event_id=exclude), db=db, current_user=user)
karachi, el_paso = tz(timedelta(hours=5)), tz(timedelta(hours=-7))
pk = create(boss, title="Karachi 9am", start_time=datetime(2026, 12, 1, 9, 0, tzinfo=karachi), end_time=datetime(2026, 12, 1, 10, 0, tzinfo=karachi))
stored = db.execute(text("select start_time from calendar_events where id = :i"), {"i": pk["id"]}).scalar()
ok("9:00 AM typed in Karachi is saved as 4:00 UTC", str(stored).startswith("2026-12-01 04:00"), stored)
ok("and sent back as 04:00 marked UTC, which a Karachi browser shows as 9:00 AM", as_json(pk)["start_time"] == "2026-12-01T04:00:00Z", as_json(pk)["start_time"])
ok("  when listed too", as_json(seen(boss)[pk["id"]])["end_time"] == "2026-12-01T05:00:00Z")
ep = create(boss, title="El Paso 9am", start_time=datetime(2026, 12, 1, 9, 0, tzinfo=el_paso), end_time=datetime(2026, 12, 1, 10, 0, tzinfo=el_paso))
ok("9:00 AM typed in El Paso is sent back as 16:00 UTC", as_json(ep)["start_time"] == "2026-12-01T16:00:00Z", as_json(ep)["start_time"])
browser = create(boss, title="Browser", start_time=datetime(2026, 12, 2, 4, 0, tzinfo=tz.utc), end_time=datetime(2026, 12, 2, 5, 0, tzinfo=tz.utc))
ok("what a browser sends (UTC, with Z) comes back unchanged", as_json(browser)["start_time"] == "2026-12-02T04:00:00Z")
ok("an event saved earlier, with no zone, is taken as UTC", as_json(seen(staff)[meet["id"]])["start_time"].endswith("Z"))
ok("created and updated times are marked too", as_json(pk)["created_at"].endswith("Z") and as_json(pk)["updated_at"].endswith("Z"))
moved = update(boss, pk["id"], start_time=datetime(2026, 12, 1, 8, 30, tzinfo=karachi))
ok("changing only the start (from a browser) works and is saved in UTC",
   as_json(moved)["start_time"] == "2026-12-01T03:30:00Z" and as_json(moved)["end_time"] == "2026-12-01T05:00:00Z", as_json(moved))
sched = create(admin, title="Karachi visit", technician_ids=[omar.id], start_time=datetime(2026, 12, 3, 9, 0, tzinfo=karachi), end_time=datetime(2026, 12, 3, 11, 0, tzinfo=karachi))
clash = check(admin, [omar.id], datetime(2026, 12, 3, 5, 0, tzinfo=tz.utc), datetime(2026, 12, 3, 5, 30, tzinfo=tz.utc))
ok("a clash is found whatever zone the times are asked in", [c["event_id"] for c in clash] == [sched["id"]], clash)
ok("  and its times come back marked UTC", clash and ScheduleClash(**clash[0]).model_dump(mode="json")["start_time"] == "2026-12-03T04:00:00Z")
ok("  next to it, not overlapping, is no clash", check(admin, [omar.id], datetime(2026, 12, 3, 11, 0, tzinfo=karachi), datetime(2026, 12, 3, 12, 0, tzinfo=karachi)) == [])
ok("a schedule's end before its start is still refused across zones",
   refused(lambda: create(admin, technician_ids=[omar.id], start_time=datetime(2026, 12, 4, 9, 0, tzinfo=karachi), end_time=datetime(2026, 12, 4, 0, 30, tzinfo=tz.utc)), 400))

print("\nDeleting needs only calendar.edit to ask; the rules above still decide")
checker = cal.router.dependencies[0].dependency


def asks_delete(user: User) -> bool:
    request = Request({"type": "http", "method": "DELETE", "path": "/api/v1/calendar/events/5", "headers": [], "query_string": b""})
    try:
        checker(request, current_user=user)
        return True
    except HTTPException:
        return False


def asks(user: User, method: str, path: str) -> bool:
    request = Request({"type": "http", "method": method, "path": path, "headers": [], "query_string": b""})
    try:
        checker(request, current_user=user)
        return True
    except HTTPException:
        return False


ok("an Admin may ask to delete", asks_delete(admin))
ok("a technician may ask to delete", asks_delete(omar))
ok("a client (view only) may not", not asks_delete(client))
ok("a client can still view the calendar", asks(client, "GET", "/api/v1/calendar/events"))
ok("but not create in it", not asks(client, "POST", "/api/v1/calendar/events"))

print()
if failures:
    print(f"{len(failures)} FAILED: {failures}")
    sys.exit(1)
print("ALL PASSED")
