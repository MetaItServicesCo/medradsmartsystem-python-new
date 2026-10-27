"""Generating timesheets from attendance, end to end against a real database.

test_attendance_rules covers the arithmetic. This covers the part that only
shows up once rows are being written: which employees get processed, what
they are paid, which existing rows may be overwritten, and -- the one that
matters most -- that a day somebody is still working does not become an
unpaid absence on their payslip.

    DATABASE_URL=sqlite:// python backend/tests/test_timesheet_generation.py
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
from app.api.v1.endpoints.hr import generate_timesheets  # noqa: E402
from app.db.base import Base  # noqa: E402
from app.models.attendance import (  # noqa: E402
    AttendanceEvent, AttendanceEventType, AttendanceFaceStatus, AttendanceProfile,
    AttendanceSource, AttendanceVerificationStatus,
)
from app.models.hr import (  # noqa: E402
    AttendancePolicy, DayStatus, EmployeePolicyAssignment, Holiday, PayrollConfig,
    Timesheet, TimesheetStatus,
)
from app.models.user import User, UserRole, UserType  # noqa: E402
from app.schemas.hr import GenerateTimesheetRequest  # noqa: E402

failures: list[str] = []


def ok(label: str, condition: bool, detail: str = "") -> None:
    print("{}  {}{}".format("PASS" if condition else "FAIL", label,
                            "  " + detail if detail else ""))
    if not condition:
        failures.append(label)


engine = create_engine("sqlite://", connect_args={"check_same_thread": False},
                       poolclass=StaticPool)
Base.metadata.create_all(engine)
Session = sessionmaker(bind=engine)

ADMIN = None


def fresh() -> "Session":
    """A clean database with one admin, for each scenario."""
    global ADMIN
    for table in reversed(Base.metadata.sorted_tables):
        with engine.begin() as conn:
            conn.exec_driver_sql("DELETE FROM {}".format(table.name))
    db = Session()
    admin = User(username="hr", email="hr@medrad.test", full_name="HR",
                 hashed_password="x", user_type=UserType.EMPLOYEE,
                 role=UserRole.HR_MANAGER, is_active=True)
    db.add(admin)
    db.commit()
    ADMIN = admin
    return db


def add_employee(db, user_id=None, enrolled_on=datetime(2026, 1, 1), active=True,
                 role=UserRole.EMPLOYEE):
    user = User(username="e{}".format(user_id or 2), email="e{}@medrad.test".format(user_id or 2),
                full_name="Employee {}".format(user_id or 2), hashed_password="x",
                user_type=UserType.EMPLOYEE, role=role, is_active=active)
    db.add(user)
    db.commit()
    if enrolled_on is not None:
        db.add(AttendanceProfile(user_id=user.id, employee_code=str(user.id),
                                 face_status=AttendanceFaceStatus.ENROLLED,
                                 created_at=enrolled_on, updated_at=enrolled_on))
        db.commit()
    return user


def scan(db, user, utc: str, kind: AttendanceEventType, timezone="Asia/Karachi"):
    db.add(AttendanceEvent(
        user_id=user.id, event_type=kind, event_time=datetime.fromisoformat(utc),
        timezone=timezone, source=AttendanceSource.FACE,
        verification_status=AttendanceVerificationStatus.VERIFIED,
    ))
    db.commit()


def karachi_policy(db, **kwargs):
    policy = AttendancePolicy(
        name=kwargs.pop("name", "Karachi day"),
        timezone="Asia/Karachi",
        work_hours_per_day=kwargs.pop("work_hours_per_day", 8.0),
        shift_start_time=kwargs.pop("shift_start_time", "09:00"),
        shift_end_time=kwargs.pop("shift_end_time", "17:00"),
        late_arrival_grace_minutes=kwargs.pop("late_arrival_grace_minutes", 15),
        early_departure_grace_minutes=kwargs.pop("early_departure_grace_minutes", 15),
        grace_period_minutes=15,
        is_default=kwargs.pop("is_default", True),
        is_active=kwargs.pop("is_active", True),
        **kwargs,
    )
    db.add(policy)
    db.commit()
    return policy


def run(db, year=2026, month=10, user_id=None):
    return generate_timesheets(
        GenerateTimesheetRequest(year=year, month=month, user_id=user_id),
        db=db, current_user=ADMIN,
    )


def rows(db, user):
    return {t.work_date.isoformat(): t for t in db.query(Timesheet).filter(
        Timesheet.user_id == user.id).all()}


print("Timesheet generation")
print("=" * 72)

print()
print("A shift still running is not an unpaid absence")
print("-" * 72)
# This is exactly the live case: checked in at 18:33 Karachi on 27 Oct, no
# check-out yet. The old generator wrote ABSENT with zero wage.
db = fresh()
karachi_policy(db)
emp = add_employee(db, 2)
db.add(PayrollConfig(user_id=emp.id, base_salary=22000, effective_from=date(2026, 1, 1)))
db.commit()
scan(db, emp, "2026-10-27T13:33:00", AttendanceEventType.CHECK_IN)

import app.api.v1.endpoints.hr as hr_module  # noqa: E402
real_date = hr_module.date


class FrozenDate(real_date):
    @classmethod
    def today(cls):
        return real_date(2026, 10, 27)


hr_module.date = FrozenDate
try:
    result = run(db)
finally:
    hr_module.date = real_date

written = rows(db, emp)
ok("the open day gets no row at all", "2026-10-27" not in written,
   str(sorted(written)[-3:]))
ok("  so it is certainly not an absence",
   written.get("2026-10-27") is None or written["2026-10-27"].day_status != DayStatus.ABSENT)
ok("earlier days in the month are still processed", len(written) > 0, str(len(written)))
ok("  and those are absences, correctly",
   all(t.day_status == DayStatus.ABSENT for t in written.values()),
   str({d: t.day_status.value for d, t in list(written.items())[:3]}))

print()
print("Hours, wages and the policy")
print("-" * 72)
db = fresh()
karachi_policy(db, work_hours_per_day=8)
emp = add_employee(db, 3)
db.add(PayrollConfig(user_id=emp.id, base_salary=22000, effective_from=date(2026, 1, 1)))
db.commit()
# 5 Oct, 09:00-17:00 Karachi with a one hour break -> 7 worked hours.
scan(db, emp, "2026-10-05T04:00:00", AttendanceEventType.CHECK_IN)
scan(db, emp, "2026-10-05T07:00:00", AttendanceEventType.BREAK_START)
scan(db, emp, "2026-10-05T08:00:00", AttendanceEventType.BREAK_END)
scan(db, emp, "2026-10-05T12:00:00", AttendanceEventType.CHECK_OUT)
# 6 Oct, a clean eight hours with no break.
scan(db, emp, "2026-10-06T04:00:00", AttendanceEventType.CHECK_IN)
scan(db, emp, "2026-10-06T12:00:00", AttendanceEventType.CHECK_OUT)
run(db)
written = rows(db, emp)

daily = 22000 / 22
ok("the break is deducted from the hours", written["2026-10-05"].hours_worked == 7.0,
   str(written["2026-10-05"].hours_worked))
ok("  seven hours against an eight hour policy is early leave",
   written["2026-10-05"].day_status == DayStatus.EARLY_LEAVE,
   written["2026-10-05"].day_status.value)
ok("  which still earns the full daily rate",
   abs(written["2026-10-05"].daily_wage_earned - daily) < 0.01,
   str(written["2026-10-05"].daily_wage_earned))
ok("a clean eight hours is a full day",
   written["2026-10-06"].day_status == DayStatus.FULL_DAY,
   written["2026-10-06"].day_status.value)
ok("  earning the daily rate", abs(written["2026-10-06"].daily_wage_earned - daily) < 0.01)
ok("the policy that was applied is recorded on the row",
   written["2026-10-06"].policy_id is not None)
ok("generated rows are marked as coming from attendance",
   written["2026-10-06"].source == "attendance", written["2026-10-06"].source)
ok("  and start as drafts for HR to approve",
   written["2026-10-06"].status == TimesheetStatus.DRAFT)

print()
print("A past day never closed is flagged, not guessed")
print("-" * 72)
db = fresh()
karachi_policy(db)
emp = add_employee(db, 4)
scan(db, emp, "2026-10-05T04:00:00", AttendanceEventType.CHECK_IN)
result = run(db)
written = rows(db, emp)
ok("it is not an absence", written["2026-10-05"].day_status != DayStatus.ABSENT,
   written["2026-10-05"].day_status.value)
ok("  it is a half day", written["2026-10-05"].day_status == DayStatus.HALF_DAY)
ok("  with the reason on the row",
   "check-out" in (written["2026-10-05"].deduction_reason or ""),
   str(written["2026-10-05"].deduction_reason))
ok("  and the run reports how many need attention",
   result.get("needs_attention", 0) >= 1, str(result))

print()
print("Late arrivals and the consecutive-late strike")
print("-" * 72)
db = fresh()
policy = karachi_policy(db, late_strike_action="half_day", consecutive_late_limit=2)
emp = add_employee(db, 5)
db.add(PayrollConfig(user_id=emp.id, base_salary=22000, effective_from=date(2026, 1, 1)))
db.commit()
for day in ("05", "06"):
    scan(db, emp, "2026-10-{}T04:30:00".format(day), AttendanceEventType.CHECK_IN)
    scan(db, emp, "2026-10-{}T12:30:00".format(day), AttendanceEventType.CHECK_OUT)
run(db)
written = rows(db, emp)
ok("the late arrival is flagged", written["2026-10-05"].is_late is True)
ok("  with the minutes past the grace", written["2026-10-05"].late_minutes == 15.0,
   str(written["2026-10-05"].late_minutes))
ok("  and the first one costs nothing",
   written["2026-10-05"].policy_deduction == 0, str(written["2026-10-05"].policy_deduction))
ok("the second trips the strike",
   written["2026-10-06"].policy_deduction > 0, str(written["2026-10-06"].policy_deduction))
ok("  deducting half the daily rate",
   abs(written["2026-10-06"].policy_deduction - daily / 2) < 0.01)
ok("  with an explanation", "consecutive late" in (written["2026-10-06"].deduction_reason or ""))
ok("  and the net wage reflects it",
   written["2026-10-06"].daily_wage_earned < written["2026-10-05"].daily_wage_earned)

print()
print("Holidays, leave and enrolment")
print("-" * 72)
db = fresh()
karachi_policy(db)
emp = add_employee(db, 6, enrolled_on=datetime(2026, 10, 20))
db.add(Holiday(name="National day", date=date(2026, 10, 22)))
db.commit()
run(db)
written = rows(db, emp)
ok("nothing is written before the employee was enrolled",
   all(d >= "2026-10-20" for d in written), str(sorted(written)[:2]))
ok("the holiday is a holiday", written["2026-10-22"].day_status == DayStatus.HOLIDAY,
   written["2026-10-22"].day_status.value)
ok("  and earns nothing by itself", written["2026-10-22"].daily_wage_earned == 0)
ok("weekends are not written at all",
   "2026-10-24" not in written and "2026-10-25" not in written)

print()
print("Existing rows are not trampled")
print("-" * 72)
db = fresh()
karachi_policy(db)
emp = add_employee(db, 7)
scan(db, emp, "2026-10-05T04:00:00", AttendanceEventType.CHECK_IN)
scan(db, emp, "2026-10-05T12:00:00", AttendanceEventType.CHECK_OUT)
db.add(Timesheet(user_id=emp.id, work_date=date(2026, 10, 6), hours=3, hours_worked=3,
                 source="manual", status=TimesheetStatus.SUBMITTED,
                 task_title="Wrote the report"))
db.add(Timesheet(user_id=emp.id, work_date=date(2026, 10, 7), hours=8, hours_worked=8,
                 source="attendance", status=TimesheetStatus.APPROVED))
db.add(Timesheet(user_id=emp.id, work_date=date(2026, 10, 8), hours=8, hours_worked=8,
                 source="attendance", status=TimesheetStatus.REJECTED))
db.commit()
run(db)
written = rows(db, emp)
ok("an employee's own manual entry survives",
   written["2026-10-06"].hours_worked == 3 and written["2026-10-06"].source == "manual",
   "{} {}".format(written["2026-10-06"].hours_worked, written["2026-10-06"].source))
ok("  and keeps its title", written["2026-10-06"].task_title == "Wrote the report")
ok("an approved row is not rewritten", written["2026-10-07"].hours_worked == 8)
ok("  and stays approved", written["2026-10-07"].status == TimesheetStatus.APPROVED)
ok("a rejected row is not rewritten either", written["2026-10-08"].hours_worked == 8)
ok("  and stays rejected, so a dispute has something to point at",
   written["2026-10-08"].status == TimesheetStatus.REJECTED)
ok("a draft generated row IS refreshed", written["2026-10-05"].hours_worked == 8.0,
   str(written["2026-10-05"].hours_worked))

print()
print("Running it twice changes nothing")
print("-" * 72)
db = fresh()
karachi_policy(db)
emp = add_employee(db, 8)
scan(db, emp, "2026-10-05T04:00:00", AttendanceEventType.CHECK_IN)
scan(db, emp, "2026-10-05T12:00:00", AttendanceEventType.CHECK_OUT)
first = run(db)
snapshot = {d: (t.day_status, t.hours_worked, t.daily_wage_earned) for d, t in rows(db, emp).items()}
second = run(db)
after = {d: (t.day_status, t.hours_worked, t.daily_wage_earned) for d, t in rows(db, emp).items()}
ok("the first run creates", first["created"] > 0, str(first))
ok("the second creates nothing new", second["created"] == 0, str(second))
ok("  and the verdicts are identical", snapshot == after)
ok("  with no duplicate rows", len(rows(db, emp)) == len(snapshot))

print()
print("Who gets processed")
print("-" * 72)
db = fresh()
karachi_policy(db)
kept = add_employee(db, 9)
gone = add_employee(db, 10, active=False)
run(db)
ok("an inactive employee gets no rows", len(rows(db, gone)) == 0, str(len(rows(db, gone))))
ok("an active one does", len(rows(db, kept)) > 0)

db = fresh()
karachi_policy(db)
one = add_employee(db, 11)
two = add_employee(db, 12)
run(db, user_id=one.id)
ok("a single-employee run touches only that employee",
   len(rows(db, one)) > 0 and len(rows(db, two)) == 0,
   "{} vs {}".format(len(rows(db, one)), len(rows(db, two))))

print()
print("Policy assignment beats the default")
print("-" * 72)
db = fresh()
default_policy = karachi_policy(db, name="Office", work_hours_per_day=8, is_default=True)
short_policy = karachi_policy(db, name="Part time", work_hours_per_day=4, is_default=False)
emp = add_employee(db, 13)
db.add(EmployeePolicyAssignment(user_id=emp.id, policy_id=short_policy.id,
                                effective_from=date(2026, 1, 1)))
db.commit()
scan(db, emp, "2026-10-05T04:00:00", AttendanceEventType.CHECK_IN)
scan(db, emp, "2026-10-05T09:00:00", AttendanceEventType.CHECK_OUT)   # five hours
run(db)
written = rows(db, emp)
ok("five hours clears a four hour policy",
   written["2026-10-05"].day_status == DayStatus.FULL_DAY,
   written["2026-10-05"].day_status.value)
ok("  and the assigned policy is the one recorded",
   written["2026-10-05"].policy_id == short_policy.id)

print()
print("=" * 72)
if failures:
    print("{} failing: {}".format(len(failures), ", ".join(failures)))
    sys.exit(1)
print("All timesheet generation checks passed.")
