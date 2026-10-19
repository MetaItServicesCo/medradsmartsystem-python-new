"""The HR manager's questions, and everybody's questions about themselves.

Two groups of tools, and the line between them is the point. "How many leave
requests are pending" is an HR question and needs the hr module. "How much
leave have I got left" is nobody's business but the asker's and must work for
an employee who will never have hr. Getting that line wrong in either
direction is a bug: one locks people out of their own records, the other
hands out everybody else's.

    DATABASE_URL=sqlite:// python backend/tests/test_people_and_self.py
"""
from __future__ import annotations

import os
import pathlib
import sys
from datetime import date, timedelta

os.environ.setdefault("DATABASE_URL", "sqlite://")
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))

from sqlalchemy import create_engine  # noqa: E402
from sqlalchemy.orm import sessionmaker  # noqa: E402
from sqlalchemy.pool import StaticPool  # noqa: E402

import app.models  # noqa: E402,F401
from app.assistant.tools import me, people  # noqa: E402
from app.assistant.tools.base import ToolContext  # noqa: E402
from app.db.base import Base  # noqa: E402
from app.models.equipment import Equipment  # noqa: E402
from app.models.facility import Facility  # noqa: E402
from app.models.hr import (  # noqa: E402
    LeaveRequest, LeaveRequestStatus, LeaveType,
    PayrollRun, PayrollRunStatus, Payslip, Timesheet, TimesheetStatus,
)
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


def denied(label: str, fn) -> None:
    try:
        fn()
    except Exception as exc:  # ToolPermissionError is an HTTPException
        ok(label, getattr(exc, "status_code", None) == 403,
           str(getattr(exc, "detail", exc))[:60])
        return
    ok(label, False, "was allowed")


engine = create_engine("sqlite://", connect_args={"check_same_thread": False},
                       poolclass=StaticPool)
Base.metadata.create_all(engine)
db = sessionmaker(bind=engine)()

TODAY = date.today()
YEAR_START = date(TODAY.year, 1, 1)


def make_user(username, role):
    u = User(username=username, email=username + "@x.test",
             full_name=username.replace("_", " ").title(),
             hashed_password="x", user_type=UserType.EMPLOYEE,
             role=role, is_active=True)
    db.add(u)
    db.flush()
    return u


site = Facility(name="North", phone="0", email="n@x.test", address="1 Road",
                city="Houston", state="TX", zip_code="77001", country="US")
db.add(site)
db.flush()
modality = Modality(name="Imaging", category=ModalityCategory.IMAGING)
db.add(modality)
db.flush()
kit = Equipment(asset_tag="A1", make="Acme", model="M", serial_number="S1",
                modality_id=modality.id, facility_id=site.id)
db.add(kit)
db.flush()

hr = make_user("hr_person", UserRole.HR_MANAGER)
tech = make_user("sam_carter", UserRole.TECHNICIAN)
mate = make_user("sam_okafor", UserRole.TECHNICIAN)
staff = make_user("dana", UserRole.EMPLOYEE)

annual = LeaveType(name="Annual", max_days_per_year=25)
sick = LeaveType(name="Sick", max_days_per_year=10)
db.add_all([annual, sick])
db.flush()


def leave(user, start, end, days, status, kind=annual):
    db.add(LeaveRequest(user_id=user.id, leave_type_id=kind.id,
                        start_date=start, end_date=end, total_days=days,
                        status=status))


# Pending, approved and a stretch of leave that starts before the window.
leave(tech, TODAY + timedelta(days=3), TODAY + timedelta(days=5), 3,
      LeaveRequestStatus.PENDING)
leave(staff, TODAY - timedelta(days=2), TODAY + timedelta(days=2), 5,
      LeaveRequestStatus.APPROVED)
leave(staff, YEAR_START + timedelta(days=10), YEAR_START + timedelta(days=12),
      3, LeaveRequestStatus.APPROVED)
leave(mate, TODAY + timedelta(days=30), TODAY + timedelta(days=31), 2,
      LeaveRequestStatus.REJECTED)

for day in range(5):
    when = TODAY - timedelta(days=day)
    db.add(Timesheet(user_id=tech.id, work_date=when, hours=8,
                     status=TimesheetStatus.SUBMITTED, is_late=(day == 1),
                     late_minutes=12 if day == 1 else None,
                     policy_deduction=5 if day == 1 else 0))
    db.add(Timesheet(user_id=staff.id, work_date=when, hours=7,
                     status=TimesheetStatus.DRAFT, is_late=False))

run = PayrollRun(period_start=TODAY - timedelta(days=30), period_end=TODAY,
                 status=PayrollRunStatus.PAID, total_gross=10000,
                 total_tax=2000, total_net=8000)
db.add(run)
db.flush()
db.add(Payslip(payroll_run_id=run.id, user_id=tech.id, gross_pay=4000,
               tax_amount=800, deductions=0, net_pay=3200, work_hours=160))
db.add(Payslip(payroll_run_id=run.id, user_id=staff.id, gross_pay=6000,
               tax_amount=1200, deductions=0, net_pay=4800, work_hours=160))

_n = [0]


def request(requester, assignee, status=ServiceRequestStatus.ASSIGNED):
    _n[0] += 1
    db.add(ServiceRequest(
        request_number="SR-{:06d}".format(_n[0]), facility_id=site.id,
        equipment_id=kit.id, requester_id=requester.id,
        assigned_technician_id=assignee.id if assignee else None,
        problem_description="Noise", priority=Priority.LOW, status=status,
        history=[]))


request(staff, tech)                  # dana raised it, sam works it
request(tech, tech)                   # sam raised and works it
request(mate, mate)                   # nothing to do with either
db.commit()

hr_ctx = ToolContext(db=db, user=hr)
tech_ctx = ToolContext(db=db, user=tech)
staff_ctx = ToolContext(db=db, user=staff)


print("HR questions, and questions about yourself")
print("=" * 72)

print()
print("Leave, across the organisation")
print("-" * 72)

pending = people.search_leave_requests(hr_ctx, status=["pending"])
ok("pending requests are counted", pending.total_count == 1,
   str(pending.total_count))
ok("the person is named",
   pending.items and pending.items[0]["person"] == "Sam Carter",
   pending.items[0]["person"] if pending.items else "")

window = people.search_leave_requests(hr_ctx, date_from=TODAY, date_to=TODAY)
ok("leave starting before the window still counts today",
   window.total_count == 1, str(window.total_count))

named = people.search_leave_requests(hr_ctx, person="dana")
ok("a named person is filtered to", named.total_count == 2,
   str(named.total_count))
ok("their days are totalled", named.aggregates["total_days"] == 8.0,
   str(named.aggregates["total_days"]))

ambiguous = people.search_leave_requests(hr_ctx, person="sam")
ok("an ambiguous name returns nothing and says why",
   ambiguous.total_count == 0
   and any("More than one person" in n for n in ambiguous.notes),
   " | ".join(ambiguous.notes))

unknown = people.search_leave_requests(hr_ctx, person="nobody at all")
ok("an unknown name says so rather than returning everyone",
   unknown.total_count == 0 and any("No employee matches" in n
                                    for n in unknown.notes))

print()
print("Hours and pay")
print("-" * 72)

sheets = people.search_timesheets(hr_ctx, person="sam_carter")
ok("hours are totalled by the database",
   sheets.aggregates["total_hours"] == 40.0,
   str(sheets.aggregates["total_hours"]))
ok("lateness is counted", sheets.aggregates["late_days"] == 1)

late = people.search_timesheets(hr_ctx, late_only=True)
ok("late_only narrows to the late days", late.total_count == 1)

runs = people.search_payroll(hr_ctx)
ok("a broad payroll question gives run totals",
   runs.aggregates["total_net"] == 8000.0, str(runs.aggregates))
ok("and names nobody", all("person" not in i for i in runs.items))
ok("and says how to get an individual",
   any("named person" in n for n in runs.notes))

slips = people.search_payroll(hr_ctx, person="sam_carter")
ok("a named person gives their payslips", slips.total_count == 1)
ok("with their net pay",
   slips.items and slips.items[0]["net_pay"] == 3200.0,
   str(slips.items[0]["net_pay"]) if slips.items else "")

print()
print("HR tools are HR's")
print("-" * 72)

denied("a technician cannot search leave",
       lambda: people.search_leave_requests(tech_ctx))
denied("a technician cannot search timesheets",
       lambda: people.search_timesheets(tech_ctx))
denied("a technician cannot see payroll",
       lambda: people.search_payroll(tech_ctx))
denied("an employee cannot see payroll",
       lambda: people.search_payroll(staff_ctx))

print()
print("Your own records, without the HR module")
print("-" * 72)

mine = me.my_leave(staff_ctx)
ok("an employee can see their own leave", mine.total_count == 2,
   str(mine.total_count))
balance = mine.aggregates["balance_this_year"]
ok("their allowance is reported", balance["Annual"]["allowance"] == 25)
ok("days taken this year are counted", balance["Annual"]["taken"] == 8.0,
   str(balance["Annual"]["taken"]))
ok("and what is left", balance["Annual"]["remaining"] == 17.0,
   str(balance["Annual"]["remaining"]))
ok("an untouched type shows the full allowance",
   balance["Sick"]["remaining"] == 10)

others = {i["id"] for i in mine.items}
tech_leave = {r.id for r in db.query(LeaveRequest).filter(
    LeaveRequest.user_id == tech.id).all()}
ok("nobody else's leave is in it", not (others & tech_leave))

hours = me.my_timesheet(staff_ctx)
ok("an employee sees their own hours",
   hours.aggregates["total_hours"] == 35.0,
   str(hours.aggregates["total_hours"]))

print()
print("My requests, raised and assigned")
print("-" * 72)

reqs = me.my_requests(tech_ctx)
labels = sorted(i["relationship"] for i in reqs.items)
ok("both kinds come back", reqs.total_count == 2, str(reqs.total_count))
ok("each says which it is", labels == ["assigned", "raised_and_assigned"],
   str(labels))
ok("somebody else's request is absent",
   all(i["reference"] != "SR-000003" for i in reqs.items))

dana = me.my_requests(staff_ctx)
ok("an employee sees the one they raised", dana.total_count == 1)
ok("marked as raised, not assigned",
   dana.items and dana.items[0]["relationship"] == "raised",
   dana.items[0]["relationship"] if dana.items else "")
ok("with the site on it",
   dana.items and dana.items[0].get("facility") == "North")


print()
print("=" * 72)
if failures:
    print("{} failing: {}".format(len(failures), ", ".join(failures)))
    sys.exit(1)
print("All people and self-service checks passed.")
