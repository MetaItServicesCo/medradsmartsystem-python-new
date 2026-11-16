"""People asked about the way colleagues speak of them, and what the calendar shows.

The case this reproduces: a Super Admin asked "Where is SAM today?" and "what
is assigned to Shahryad Ahmad (SAM) today?" while the Calendar showed three
schedules for Shahryar Ahmed (SAM) that day. The assistant answered "multiple
possible users", then "no location information", then "no matching user".

* Names are matched word by word: "SAM" is the person with the word SAM in
  their name, not everyone containing those letters (Samuel, Osama); a typo
  ("Shahryad Ahmad") still finds Shahryar Ahmed; several equally close people
  are asked about, never guessed.
* The tools take the name as typed, so one call answers.
* Technician schedules -- calendar entries technicians are tagged on, with a
  place -- are part of a person's day, seen as the Calendar shows them: an
  Admin sees every schedule; others the ones they created or are tagged on;
  another person's personal events stay private.

    DATABASE_URL=sqlite:// venv312/Scripts/python.exe tests/test_assistant_people.py
"""
from __future__ import annotations

import os
import pathlib
import sys
from datetime import date, datetime, timezone
from zoneinfo import ZoneInfo

os.environ.setdefault("DATABASE_URL", "sqlite://")
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))

from sqlalchemy import create_engine  # noqa: E402
from sqlalchemy.orm import sessionmaker  # noqa: E402
from sqlalchemy.pool import StaticPool  # noqa: E402

import app.models  # noqa: E402,F401
from app.assistant.tools import attendance, entities, local_time, me  # noqa: E402
from app.assistant.tools.base import ToolContext  # noqa: E402
from app.assistant.tools.person_match import clear_match, match_people, score_person  # noqa: E402
from app.db.base import Base  # noqa: E402
from app.models.attendance import (  # noqa: E402
    AttendanceEvent, AttendanceEventType, AttendanceSource, AttendanceVerificationStatus,
)
from app.models.calendar import CalendarEvent  # noqa: E402
from app.models.facility import Facility  # noqa: E402
from app.models.user import User, UserRole, UserType  # noqa: E402

failures: list[str] = []


def ok(label: str, condition: bool, detail: object = "") -> None:
    print("{}  {}{}".format("PASS" if condition else "FAIL", label, f"  {detail}" if not condition and detail != "" else ""))
    if not condition:
        failures.append(label)


# PEOPLE_TEST_DB runs the same checks on a throwaway Postgres, as production uses.
if os.environ.get("PEOPLE_TEST_DB"):
    engine = create_engine(os.environ["PEOPLE_TEST_DB"])
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
CHICAGO = "America/Chicago"
site = Facility(name="North Hospital", phone="0", email="n@x.test", address="1 Rd", city="Dallas", state="TX",
                zip_code="75201", country="US")
db.add(site)
db.flush()


def person(name: str, username: str, role: UserRole, *, facility: Facility | None = None, active: bool = True) -> User:
    user = User(username=username, email=f"{username}@x.test", full_name=name, hashed_password="x",
                user_type=UserType.EMPLOYEE, role=role, is_active=active, facility_id=facility.id if facility else None)
    db.add(user)
    db.flush()
    return user


omar = person("Omar Ahmad", "omar", UserRole.SUPERADMIN)
sam = person("Shahryar Ahmed (SAM)", "shahryar", UserRole.TECHNICIAN)
daniel = person("Daniel Perez", "dperez", UserRole.TECHNICIAN)
samuel = person("Samuel Green", "samuel", UserRole.TECHNICIAN)
osama = person("Osama Khan", "osama", UserRole.EMPLOYEE)
site_admin = person("Dana Site", "dana", UserRole.FACILITY_ADMIN, facility=site)

DAY = local_time.today_in(CHICAGO)


def utc(day: date, hour: int, minute: int = 0) -> datetime:
    """A Texas wall-clock time on ``day``, as the naive UTC instant it is stored as."""
    local = datetime(day.year, day.month, day.day, hour, minute, tzinfo=ZoneInfo(CHICAGO))
    return local.astimezone(timezone.utc).replace(tzinfo=None)


def schedule(title: str, place: str, hour: int, minute: int, *tagged: User, creator: User = omar, day: date = DAY) -> None:
    event = CalendarEvent(user_id=creator.id, title=title, start_time=utc(day, hour, minute),
                          end_time=utc(day, hour + 1, minute), is_schedule=True, location=place)
    event.technicians = list(tagged)
    db.add(event)


# SAM's day, as the Calendar showed it: three schedules Omar booked and tagged him on.
schedule("Texas Pain Physicians", "Texas Pain Physicians, Plano", 13, 0, sam)
schedule("PURPOSEFUL HEALTH", "Purposeful Health, Frisco", 14, 0, sam)
schedule("Airrosti Rehab", "Airrosti, Dallas", 14, 38, sam)
schedule("Daniel's site visit", "North Hospital", 10, 0, daniel)
db.add(CalendarEvent(user_id=sam.id, title="Dentist", start_time=utc(DAY, 9), end_time=utc(DAY, 10)))   # personal
db.add(AttendanceEvent(user_id=sam.id, event_type=AttendanceEventType.CHECK_IN, event_time=utc(DAY, 8, 55),
                       timezone=CHICAGO, source=AttendanceSource.FACE, verification_status=AttendanceVerificationStatus.VERIFIED,
                       location_place="Dallas office"))
db.commit()


def ctx(user: User) -> ToolContext:
    return ToolContext(db=db, user=user, timezone=CHICAGO)


print("\nMatching names as people type them")
ok("\"SAM\": the word SAM, not the letters in Samuel or Osama",
   score_person("SAM", sam.full_name, sam.username) == 1.0
   and score_person("SAM", samuel.full_name, samuel.username) < 0.8
   and score_person("SAM", osama.full_name, osama.username) < 0.5)
for typed in ("SAM", "Shahryar Ahmed (SAM)", "Shahryad Ahmad (SAM)", "shahryar", "Shahryad Ahmad"):
    best = clear_match(match_people(db, typed))
    ok(f"\"{typed}\" is clearly Shahryar Ahmed (SAM)", best is not None and best["user_id"] == sam.id,
       match_people(db, typed))
ok("\"Danial Peres\" is clearly Daniel Perez", (clear_match(match_people(db, "Danial Peres")) or {}).get("user_id") == daniel.id)
ok("\"Omar\" is Omar Ahmad", (clear_match(match_people(db, "Omar")) or {}).get("user_id") == omar.id)
ok("a name that fits nobody finds nobody", match_people(db, "Zzyzx") == [])

found = entities.resolve_entity(ctx(omar), kind="user", query="SAM")
ok("resolve_entity(\"SAM\"): Shahryar first, named as the clear match",
   found.items[0]["user_id"] == sam.id and any("Clear match: Shahryar Ahmed (SAM)" in note for note in found.notes), found.notes)

print("\n\"What is assigned to Shahryad Ahmad (SAM) today?\" -- one call, the name as typed")
day = me.person_schedule(ctx(omar), person="Shahryad Ahmad (SAM)", date_from=DAY, date_to=DAY)
titles = [item["title"] for item in day.items]
ok("his three schedules, in time order", titles == ["Texas Pain Physicians", "PURPOSEFUL HEALTH", "Airrosti Rehab"], titles)
ok("  each a schedule with its place and local time",
   [item["kind"] for item in day.items] == ["schedule"] * 3
   and day.items[0]["location"] == "Texas Pain Physicians, Plano"
   and "1:00 PM" in day.items[0]["when_local"] and "2:38 PM" in day.items[2]["when_local"], day.items)
ok("  not his personal dentist appointment, and not Daniel's visit", "Dentist" not in titles and "Daniel's site visit" not in titles)
ok("  for the person named", day.applied_filters["person"] == "Shahryar Ahmed (SAM)")
ok("\"SAM\" gives the same day", [i["title"] for i in me.person_schedule(ctx(omar), person="SAM", date_from=DAY, date_to=DAY).items] == titles)

print("\n\"Where did SAM check in today?\"")
seen = attendance.search_attendance(ctx(omar), person="SAM")
ok("his check-in, with the place", seen.total_count == 1 and seen.items[0]["location"] == "Dallas office"
   and "8:55 AM" in seen.items[0]["local_time"], seen.items)

print("\nSchedules are seen as the Calendar shows them")
ok("a facility admin who neither booked nor is on them does not see SAM's schedules",
   me.person_schedule(ctx(site_admin), person="SAM", date_from=DAY, date_to=DAY).total_count == 0)
own = me.my_schedule(ToolContext(db=db, user=sam, timezone=CHICAGO), date_from=DAY, date_to=DAY)
ok("SAM's own schedule: his three schedules and his own dentist appointment",
   sorted(i["title"] for i in own.items) == sorted(titles + ["Dentist"]), [i["title"] for i in own.items])
creator = me.my_schedule(ctx(omar), date_from=DAY, date_to=DAY)
ok("Omar booked them, but they are not on Omar's own schedule", creator.total_count == 0, [i["title"] for i in creator.items])

print("\nTwo people who fit equally are asked about, not guessed")
person("Sam Lee", "slee", UserRole.TECHNICIAN)
db.commit()
two = me.person_schedule(ctx(omar), person="SAM", date_from=DAY, date_to=DAY)
ok("\"SAM\" now fits Shahryar Ahmed (SAM) and Sam Lee: asks which",
   two.total_count == 0 and sorted(two.aggregates["people_matching"]) == ["Sam Lee", "Shahryar Ahmed (SAM)"]
   and "Ask which one" in two.notes[0], two.notes)
ok("  naming only those two, not Samuel or Osama", "Samuel" not in two.notes[0] and "Osama" not in two.notes[0], two.notes)
ok("  the full name still answers at once",
   me.person_schedule(ctx(omar), person="Shahryar Ahmed (SAM)", date_from=DAY, date_to=DAY).total_count == 3)

print(f"\n{len(failures)} FAILED: {failures}" if failures else "\nALL PASSED")
sys.exit(1 if failures else 0)
