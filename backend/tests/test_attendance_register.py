"""The register endpoints, and the self-service module that reads them.

Two things are being protected here.

The first is that /attendance/me/register is scoped on the authenticated user
and not on their role. The events endpoint next door self-scopes by checking
for UserRole.EMPLOYEE, which quietly does nothing for a technician -- so
granting a technician the attendance module through the permission matrix
would show them everybody. A self-service endpoint must not be one role check
away from being a company-wide one.

The second is that an employee can be handed their own record and the staff
notices without being handed the HR module, which also holds payroll,
terminations and everybody else's contracts.

    DATABASE_URL=sqlite:// python backend/tests/test_attendance_register.py
"""
from __future__ import annotations

import inspect
import os
import pathlib
import re
import sys
from datetime import date, datetime

os.environ.setdefault("DATABASE_URL", "sqlite://")
ROOT = pathlib.Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "backend"))

from sqlalchemy import create_engine  # noqa: E402
from sqlalchemy.orm import sessionmaker  # noqa: E402
from sqlalchemy.pool import StaticPool  # noqa: E402

import app.models  # noqa: E402,F401
from app.api.v1.endpoints.attendance import (  # noqa: E402
    read_my_register, read_register,
)
from app.db.base import Base  # noqa: E402
from app.models.attendance import (  # noqa: E402
    AttendanceEvent, AttendanceEventType, AttendanceFaceStatus, AttendanceProfile,
    AttendanceSource, AttendanceVerificationStatus,
)
from app.models.hr import AttendancePolicy  # noqa: E402
from app.models.user import User, UserRole, UserType  # noqa: E402
from app.utils.permissions import (  # noqa: E402
    ALL_MODULES, _ROLE_PERMISSIONS, has_module_permission,
)

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
db = Session()

policy = AttendancePolicy(
    name="Karachi day", timezone="Asia/Karachi", work_hours_per_day=8.0,
    shift_start_time="09:00", shift_end_time="17:00",
    late_arrival_grace_minutes=15, early_departure_grace_minutes=15,
    grace_period_minutes=15, is_default=True, is_active=True,
)
db.add(policy)
db.commit()


def make_user(username, role, enrolled=True):
    user = User(username=username, email="{}@medrad.test".format(username),
                full_name=username.title(), hashed_password="x",
                user_type=UserType.EMPLOYEE, role=role, is_active=True)
    db.add(user)
    db.commit()
    if enrolled:
        db.add(AttendanceProfile(user_id=user.id, employee_code=str(user.id),
                                 face_status=AttendanceFaceStatus.ENROLLED,
                                 created_at=datetime(2026, 1, 1),
                                 updated_at=datetime(2026, 1, 1)))
        db.commit()
    return user


def scan(user, utc, kind):
    db.add(AttendanceEvent(
        user_id=user.id, event_type=kind, event_time=datetime.fromisoformat(utc),
        timezone="Asia/Karachi", source=AttendanceSource.FACE,
        verification_status=AttendanceVerificationStatus.VERIFIED))
    db.commit()


alice = make_user("alice", UserRole.EMPLOYEE)
bob = make_user("bob", UserRole.TECHNICIAN)
carol = make_user("carol", UserRole.EMPLOYEE, enrolled=False)
hr = make_user("hr_boss", UserRole.HR_MANAGER)

scan(alice, "2026-10-05T04:00:00", AttendanceEventType.CHECK_IN)
scan(alice, "2026-10-05T12:00:00", AttendanceEventType.CHECK_OUT)
scan(bob, "2026-10-05T04:30:00", AttendanceEventType.CHECK_IN)
scan(bob, "2026-10-05T08:00:00", AttendanceEventType.CHECK_OUT)


print("Attendance register")
print("=" * 72)

print()
print("The HR-wide view")
print("-" * 72)

result = read_register(date_from=date(2026, 10, 5), date_to=date(2026, 10, 5),
                       user_id=None, enrolled_only=True, skip=0, limit=100,
                       db=db, current_user=hr)
names = {item["user"]["username"] for item in result["items"]}
ok("enrolled employees are listed", {"alice", "bob"} <= names, str(sorted(names)))
ok("  and an unenrolled one is not", "carol" not in names)
alice_entry = next(i for i in result["items"] if i["user"]["username"] == "alice")
ok("the verdict comes back classified",
   alice_entry["days"][0]["status"] == "full_day", alice_entry["days"][0]["status"])
ok("  with local clock times", alice_entry["days"][0]["check_in"] == "09:00",
   str(alice_entry["days"][0]["check_in"]))
ok("  and the policy that was applied",
   alice_entry["policy"]["work_hours_per_day"] == 8.0)
bob_entry = next(i for i in result["items"] if i["user"]["username"] == "bob")
ok("a short day is a half day", bob_entry["days"][0]["status"] == "half_day",
   bob_entry["days"][0]["status"])
ok("  and a late arrival is flagged", bob_entry["days"][0]["is_late"] is True)

narrowed = read_register(date_from=date(2026, 10, 5), date_to=date(2026, 10, 5),
                         user_id=alice.id, enrolled_only=True, skip=0, limit=100,
                         db=db, current_user=hr)
ok("it can be narrowed to one employee", len(narrowed["items"]) == 1)
ok("  and it is the right one", narrowed["items"][0]["user"]["id"] == alice.id)

print()
print("The self-service view is scoped on the account, not the role")
print("-" * 72)

for actor, label in ((alice, "an employee"), (bob, "a technician"), (hr, "an HR manager")):
    mine = read_my_register(date_from=date(2026, 10, 5), date_to=date(2026, 10, 5),
                            db=db, current_user=actor)
    ids = {item["user"]["id"] for item in mine["items"]}
    ok("{} sees exactly one record".format(label), len(mine["items"]) == 1, str(len(mine["items"])))
    ok("  and it is their own", ids == {actor.id}, str(ids))

source = inspect.getsource(read_my_register)
ok("it filters on the authenticated user directly",
   "[current_user]" in source, "self-scope is literal")
ok("  and takes no user_id parameter that could be pointed elsewhere",
   "user_id" not in inspect.signature(read_my_register).parameters)
ok("  so no permission change can widen it",
   "UserRole" not in source and "role" not in source.split('"""')[-1])

print()
print("Ranges are bounded")
print("-" * 72)

for bad_from, bad_to, why in (
    (date(2026, 10, 10), date(2026, 10, 1), "an inverted range"),
    (date(2020, 1, 1), date(2026, 10, 1), "a range of years"),
):
    try:
        read_my_register(date_from=bad_from, date_to=bad_to, db=db, current_user=alice)
        ok("{} is rejected".format(why), False, "it was accepted")
    except Exception as exc:
        ok("{} is rejected".format(why), getattr(exc, "status_code", None) == 422,
           str(getattr(exc, "status_code", exc)))

limit_param = inspect.signature(read_register).parameters["limit"].default
caps = [m.le for m in getattr(limit_param, "metadata", []) if hasattr(m, "le")]
ok("the HR view's page size is capped", caps and caps[0] == 500, str(caps))

print()
print("Self-service modules exist and are narrow")
print("-" * 72)

ok("my-attendance is a module", "my-attendance" in ALL_MODULES)
ok("company-policies is a module", "company-policies" in ALL_MODULES)

staff = ("superadmin", "admin", "hr_manager", "facility_admin",
         "facility_manager", "technician", "employee")
for role in staff:
    perms = _ROLE_PERMISSIONS[role]
    ok("{} can see their own attendance".format(role), "my-attendance" in perms)
    ok("  and the company notices".format(role), "company-policies" in perms)

ok("a client gets neither -- they are not staff",
   "my-attendance" not in _ROLE_PERMISSIONS["client"]
   and "company-policies" not in _ROLE_PERMISSIONS["client"])

ok("an employee still cannot reach the HR module",
   "hr" not in _ROLE_PERMISSIONS["employee"])
ok("  nor the HR-wide attendance console",
   "attendance" not in _ROLE_PERMISSIONS["employee"])
ok("  but can read notices", has_module_permission(alice, "company-policies", "view"))
ok("  and their own attendance", has_module_permission(alice, "my-attendance", "view"))
ok("publishing notices is still HR only",
   not has_module_permission(alice, "hr", "add"))

print()
print("A saved permission matrix does not hide a new module")
print("-" * 72)

alice.permissions = {"dashboard": {"index": True, "view": True}}
db.commit()
ok("a matrix that does not mention the module falls back to the role default",
   has_module_permission(alice, "my-attendance", "view") is True)
alice.permissions = {"my-attendance": {"index": False, "view": False}}
db.commit()
ok("  and an explicit denial is still honoured",
   has_module_permission(alice, "my-attendance", "view") is False)
alice.permissions = None
db.commit()

print()
print("Front end and back end agree on who gets what")
print("-" * 72)

config = (ROOT / "frontend" / "src" / "config" / "permissions.ts").read_text(
    encoding="utf-8", errors="replace")
for module in ("my-attendance", "company-policies"):
    ok("{} is in the matrix editor".format(module), "'{}'".format(module) in config)

frontend_roles = {
    m.group(1): m.group(2)
    for m in re.finditer(r"\n  ([a-z_]+): \{(.*?)\n  \},", config, re.S)
}
for role in staff:
    if role == "superadmin":
        continue        # granted implicitly as every module
    body = frontend_roles.get(role, "")
    ok("{} matches the backend for my-attendance".format(role),
       ("my-attendance" in body) == ("my-attendance" in _ROLE_PERMISSIONS[role]))
    ok("  and for company-policies",
       ("company-policies" in body) == ("company-policies" in _ROLE_PERMISSIONS[role]))

app_tsx = (ROOT / "frontend" / "src" / "App.tsx").read_text(encoding="utf-8", errors="replace")
ok("both modules have a route", "'my-attendance': '/my-attendance'" in app_tsx
   and "'company-policies': '/policies'" in app_tsx)
sidebar = (ROOT / "frontend" / "src" / "components" / "Layout" / "Sidebar.tsx").read_text(
    encoding="utf-8", errors="replace")
ok("  and a way to reach them", "module: 'my-attendance'" in sidebar
   and "module: 'company-policies'" in sidebar)

print()
print("=" * 72)
if failures:
    print("{} failing: {}".format(len(failures), ", ".join(failures)))
    sys.exit(1)
print("All attendance register checks passed.")
