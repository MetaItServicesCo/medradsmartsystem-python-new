"""Disputing a record that decides what you were paid.

Both of these are self-service writes, which is the risky kind: an employee
is allowed to change something, so the question is what stops them changing
somebody else's, or changing their own twice, or quietly rewriting a verdict
rather than asking for it to be looked at again.

They are deliberately narrow. Only your own row. Only a record in a state
that can be disputed. They move it into a queue HR already works rather than
inventing a second one. And both leave an activity-log entry, because a
person contesting their pay has to outlive the conversation.

    DATABASE_URL=sqlite:// python backend/tests/test_attendance_disputes.py
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
from app.api.v1.endpoints.attendance import (  # noqa: E402
    AttendanceDispute, dispute_my_attendance_event,
)
from app.api.v1.endpoints.hr import (  # noqa: E402
    TimesheetDispute, dispute_my_timesheet, list_my_timesheets,
)
from app.db.base import Base  # noqa: E402
from app.models.attendance import (  # noqa: E402
    AttendanceEvent, AttendanceEventType, AttendanceSource,
    AttendanceVerificationStatus,
)
from app.models.hr import DayStatus, Timesheet, TimesheetStatus  # noqa: E402
from app.models.user import User, UserRole, UserType  # noqa: E402

failures: list[str] = []


def ok(label: str, condition: bool, detail: str = "") -> None:
    print("{}  {}{}".format("PASS" if condition else "FAIL", label,
                            "  " + detail if detail else ""))
    if not condition:
        failures.append(label)


def raises(fn, expected_status: int) -> bool:
    try:
        fn()
    except Exception as exc:
        return getattr(exc, "status_code", None) == expected_status
    return False


engine = create_engine("sqlite://", connect_args={"check_same_thread": False},
                       poolclass=StaticPool)
Base.metadata.create_all(engine)
Session = sessionmaker(bind=engine)
db = Session()


def make_user(username):
    user = User(username=username, email="{}@medrad.test".format(username),
                full_name=username.title(), hashed_password="x",
                user_type=UserType.EMPLOYEE, role=UserRole.EMPLOYEE, is_active=True)
    db.add(user)
    db.commit()
    return user


alice = make_user("alice")
mallory = make_user("mallory")

print("Disputes")
print("=" * 72)

print()
print("A rejected timesheet can be sent back to HR")
print("-" * 72)

row = Timesheet(user_id=alice.id, work_date=date(2026, 10, 5), hours=8, hours_worked=8,
                source="attendance", status=TimesheetStatus.REJECTED,
                day_status=DayStatus.FULL_DAY, daily_wage_earned=1000.0,
                is_late=True, late_minutes=15.0,
                review_notes="Rejected: hours not verified",
                reviewed_by_id=mallory.id, reviewed_at=datetime.utcnow())
db.add(row)
db.commit()

updated = dispute_my_timesheet(row.id, TimesheetDispute(reason="I was here all day, the scanner failed"),
                               db=db, current_user=alice)
ok("it goes back into the submitted queue", updated.status == TimesheetStatus.SUBMITTED,
   updated.status.value)
ok("  the original rejection note is kept",
   "Rejected: hours not verified" in (updated.review_notes or ""))
ok("  the employee's reason is recorded",
   "the scanner failed" in (updated.review_notes or ""), str(updated.review_notes))
ok("  and attributed to them by name", "Alice" in (updated.review_notes or ""))
ok("  the stale reviewer is cleared so it is not shown as already handled",
   updated.reviewed_by_id is None and updated.reviewed_at is None)
ok("  and it is stamped as newly submitted", updated.submitted_at is not None)
ok("the hours themselves are untouched -- a dispute asks, it does not rewrite",
   updated.hours_worked == 8)

print()
print("And nothing else can be")
print("-" * 72)

ok("a second dispute on the same row is refused, it is no longer rejected",
   raises(lambda: dispute_my_timesheet(
       row.id, TimesheetDispute(reason="again please"), db=db, current_user=alice), 400))

approved = Timesheet(user_id=alice.id, work_date=date(2026, 10, 6), hours=8, hours_worked=8,
                     source="attendance", status=TimesheetStatus.APPROVED)
db.add(approved)
db.commit()
ok("an approved row cannot be disputed",
   raises(lambda: dispute_my_timesheet(
       approved.id, TimesheetDispute(reason="not happy"), db=db, current_user=alice), 400))
ok("  and stays approved",
   db.query(Timesheet).get(approved.id).status == TimesheetStatus.APPROVED)

someone_elses = Timesheet(user_id=mallory.id, work_date=date(2026, 10, 5), hours=8,
                          hours_worked=8, source="attendance",
                          status=TimesheetStatus.REJECTED)
db.add(someone_elses)
db.commit()
ok("another employee's row is not found, let alone changed",
   raises(lambda: dispute_my_timesheet(
       someone_elses.id, TimesheetDispute(reason="mine actually"),
       db=db, current_user=alice), 404))
ok("  and it is untouched",
   db.query(Timesheet).get(someone_elses.id).status == TimesheetStatus.REJECTED)
ok("a row that does not exist is a 404, not a crash",
   raises(lambda: dispute_my_timesheet(
       999999, TimesheetDispute(reason="ghost"), db=db, current_user=alice), 404))

print()
print("The reason has to say something")
print("-" * 72)

for bad, why in (("", "an empty reason"), ("  ", "whitespace"), ("x", "a single character")):
    try:
        TimesheetDispute(reason=bad)
        ok("{} is rejected".format(why), False, "it was accepted")
    except Exception:
        ok("{} is rejected".format(why), True)
try:
    TimesheetDispute(reason="y" * 5000)
    ok("an absurdly long reason is rejected", False, "it was accepted")
except Exception:
    ok("an absurdly long reason is rejected", True)

print()
print("An attendance scan can be flagged by the person it is about")
print("-" * 72)

event = AttendanceEvent(
    user_id=alice.id, event_type=AttendanceEventType.CHECK_OUT,
    event_time=datetime(2026, 10, 5, 8, 0), timezone="Asia/Karachi",
    source=AttendanceSource.FACE, remark="Marked by face recognition",
    verification_status=AttendanceVerificationStatus.VERIFIED)
db.add(event)
db.commit()

payload = dispute_my_attendance_event(
    event.id, AttendanceDispute(reason="This is not when I left"),
    db=db, current_user=alice)
ok("it is moved into the review queue HR already works",
   payload["verification_status"] == "needs_review", str(payload["verification_status"]))
ok("  the original remark survives", "face recognition" in (payload["remark"] or ""))
ok("  with the dispute appended", "not when I left" in (payload["remark"] or ""))
ok("  and the time itself is not rewritten",
   db.query(AttendanceEvent).get(event.id).event_time == datetime(2026, 10, 5, 8, 0))

ok("disputing it twice is refused",
   raises(lambda: dispute_my_attendance_event(
       event.id, AttendanceDispute(reason="still wrong"), db=db, current_user=alice), 400))

theirs = AttendanceEvent(
    user_id=mallory.id, event_type=AttendanceEventType.CHECK_IN,
    event_time=datetime(2026, 10, 5, 4, 0), timezone="Asia/Karachi",
    source=AttendanceSource.FACE,
    verification_status=AttendanceVerificationStatus.VERIFIED)
db.add(theirs)
db.commit()
ok("somebody else's scan is a 404",
   raises(lambda: dispute_my_attendance_event(
       theirs.id, AttendanceDispute(reason="mine"), db=db, current_user=alice), 404))
ok("  and is left verified",
   db.query(AttendanceEvent).get(theirs.id).verification_status
   == AttendanceVerificationStatus.VERIFIED)

print()
print("The employee's own timesheet shows everything, not just what they typed")
print("-" * 72)

db.add(Timesheet(user_id=alice.id, work_date=date(2026, 10, 7), hours=4, hours_worked=4,
                 source="manual", status=TimesheetStatus.DRAFT, task_title="Wrote a report"))
db.commit()

everything = list_my_timesheets(date_from=None, date_to=None, status=None, source=None,
                                skip=0, limit=100, db=db, current_user=alice)
sources = {t.source for t in everything["items"]}
ok("generated rows are visible to the person being paid from them",
   "attendance" in sources, str(sources))
ok("  alongside the ones they typed", "manual" in sources)
generated = next(t for t in everything["items"] if t.source == "attendance"
                 and t.work_date == date(2026, 10, 5))
ok("  carrying the day's verdict", generated.day_status == DayStatus.FULL_DAY,
   str(generated.day_status))
ok("  what it earned", generated.daily_wage_earned == 1000.0)
ok("  and why it was flagged", generated.is_late is True and generated.late_minutes == 15.0)

only_manual = list_my_timesheets(date_from=None, date_to=None, status=None, source="manual",
                                 skip=0, limit=100, db=db, current_user=alice)
ok("source is a filter they can still apply",
   {t.source for t in only_manual["items"]} == {"manual"})

others = list_my_timesheets(date_from=None, date_to=None, status=None, source=None,
                            skip=0, limit=100, db=db, current_user=mallory)
ok("and it is still only ever their own rows",
   all(t.user_id == mallory.id for t in others["items"]),
   str({t.user_id for t in others["items"]}))

print()
print("=" * 72)
if failures:
    print("{} failing: {}".format(len(failures), ", ".join(failures)))
    sys.exit(1)
print("All dispute checks passed.")
