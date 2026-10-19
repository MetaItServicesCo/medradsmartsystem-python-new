"""Lock down what each role's assistant can reach.

"The assistant works for HR" is an opinion until something checks it. This is
the check: for every role, the exact set of tools the agent is offered, and
the exact set it is not.

It catches the two failures that matter and that nothing else would notice.
A tool quietly disappearing for a role -- because its module was renamed, or
a permission preset changed -- turns a working answer into "I cannot do that"
with no error anywhere. And a tool quietly appearing for a role turns a
question into a disclosure. Both are silent, and both are one careless line
away at any time.

The expected sets below are deliberately written out rather than computed. A
test that derives the answer the same way the code does would agree with the
code no matter what the code did.

    DATABASE_URL=sqlite:// python backend/tests/test_role_coverage.py
"""
from __future__ import annotations

import os
import pathlib
import sys

os.environ.setdefault("DATABASE_URL", "sqlite://")
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))

from app.api.v1.endpoints.assistant_internal import list_tools  # noqa: E402
from app.assistant.tools.registry import TOOLS_BY_NAME  # noqa: E402
from app.models.user import User, UserRole  # noqa: E402


failures: list[str] = []


def ok(label: str, condition: bool, detail: str = "") -> None:
    print("{}  {}{}".format("PASS" if condition else "FAIL", label,
                            "  " + detail if detail else ""))
    if not condition:
        failures.append(label)


def offered(role: UserRole, permissions=None) -> set[str]:
    """Exactly what the agent would be handed for this person."""
    user = User(username=role.value, full_name=role.value, role=role,
                is_active=True, permissions=permissions)
    payload = list_tools(current_user=user)
    return {schema["name"] for schema in payload["tools"]}


# Available to everybody, because they are about the asker and gate
# themselves internally.
SELF = {
    "resolve_entity", "my_schedule", "my_next_commitment",
    "my_leave", "my_timesheet", "my_requests",
}
HR = {"search_leave_requests", "search_timesheets", "search_payroll"}
WRITES = {
    "create_service_request", "assign_service_request",
    "set_service_request_status", "set_service_request_priority",
}

EXPECTED: dict[UserRole, set[str]] = {
    UserRole.TECHNICIAN: SELF | WRITES | {
        "search_service_requests", "service_request_detail",
        # Service quotes hang off a service request, so they come with
        # that module rather than with Sales.
        "search_service_quotations",
        "rank_technicians", "search_inspections", "facility_detail",
    },
    UserRole.HR_MANAGER: SELF | HR | {
        "search_attendance", "search_users", "facility_detail",
    },
    UserRole.EMPLOYEE: SELF | WRITES | {
        "search_service_requests", "service_request_detail",
        # Service quotes hang off a service request, so they come with
        # that module rather than with Sales.
        "search_service_quotations",
        "rank_technicians", "facility_detail",
    },
    UserRole.CLIENT: SELF | WRITES | {
        "search_service_requests", "service_request_detail",
        # Service quotes hang off a service request, so they come with
        # that module rather than with Sales.
        "search_service_quotations",
        "rank_technicians", "search_inspections", "facility_detail",
        "search_invoices", "facility_business_summary",
        "rank_facilities_by_revenue",
    },
}


print("What each role's assistant can reach")
print("=" * 72)

print()
print("Super Admin keeps everything")
print("-" * 72)

boss = offered(UserRole.SUPERADMIN)
ok("every tool is offered", boss == set(TOOLS_BY_NAME),
   "missing: {}".format(sorted(set(TOOLS_BY_NAME) - boss)) if boss != set(TOOLS_BY_NAME) else "")

print()
print("Each role gets exactly its own set")
print("-" * 72)

for role, expected in EXPECTED.items():
    actual = offered(role)
    extra = sorted(actual - expected)
    missing = sorted(expected - actual)
    detail = ""
    if extra:
        detail += "unexpected: " + ", ".join(extra) + "  "
    if missing:
        detail += "absent: " + ", ".join(missing)
    ok("{} gets exactly its tools".format(role.value), actual == expected, detail)

print()
print("Nobody is handed somebody else's work")
print("-" * 72)

tech_tools = offered(UserRole.TECHNICIAN)
hr_tools = offered(UserRole.HR_MANAGER)
employee_tools = offered(UserRole.EMPLOYEE)

ok("a technician gets no HR tools", not (tech_tools & HR), str(sorted(tech_tools & HR)))
ok("an employee gets no HR tools", not (employee_tools & HR))
ok("an HR manager gets no service-request writes", not (hr_tools & WRITES),
   str(sorted(hr_tools & WRITES)))
ok("an HR manager cannot search service requests",
   "search_service_requests" not in hr_tools)
ok("nobody but admins gets revenue ranking for the whole business",
   "rank_facilities_by_revenue" not in tech_tools
   and "rank_facilities_by_revenue" not in hr_tools)

print()
print("Everybody can ask about themselves")
print("-" * 72)

for role in (UserRole.TECHNICIAN, UserRole.HR_MANAGER, UserRole.EMPLOYEE,
             UserRole.CLIENT, UserRole.ADMIN, UserRole.FACILITY_MANAGER):
    got = offered(role)
    ok("{} can ask about their own day".format(role.value), SELF <= got,
       "missing: " + ", ".join(sorted(SELF - got)) if not SELF <= got else "")

print()
print("A saved per-user matrix still overrides the role")
print("-" * 72)

denied = {"index": False, "view": False, "add": False, "edit": False}
narrowed = offered(UserRole.HR_MANAGER, permissions={"hr": dict(denied)})
ok("removing hr removes the HR tools", not (narrowed & HR),
   str(sorted(narrowed & HR)))
ok("and leaves the rest alone", "search_attendance" in narrowed)

read_only = offered(UserRole.TECHNICIAN, permissions={
    "service-requests": {"index": True, "view": True, "add": False, "edit": False},
})
ok("read-only on a module removes its write tools", not (read_only & WRITES),
   str(sorted(read_only & WRITES)))
ok("but keeps its searches", "search_service_requests" in read_only)

print()
print("The registry stays coherent")
print("-" * 72)

ok("every tool declares a module",
   all(t.module for t in TOOLS_BY_NAME.values()))
ok("every write tool needs add or edit",
   all(t.permission in ("add", "edit")
       for t in TOOLS_BY_NAME.values() if t.writes))
ok("platform tools are all about the asker",
   {t.name for t in TOOLS_BY_NAME.values() if t.module == "platform"}
   == SELF, str(sorted(t.name for t in TOOLS_BY_NAME.values()
                       if t.module == "platform")))
ok("no two tools share a name", len(TOOLS_BY_NAME) == len(set(TOOLS_BY_NAME)))
ok("every tool has a description the model can act on",
   all(len(t.description) > 60 for t in TOOLS_BY_NAME.values()))


print()
print("=" * 72)
if failures:
    print("{} failing: {}".format(len(failures), ", ".join(failures)))
    sys.exit(1)
print("All role coverage checks passed.")
