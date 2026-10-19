"""Check that narrowing never deletes the tools a person needs.

The agent trims the tool list before offering it to the model, because
selection accuracy falls away once there are too many. Trimming by module is
right for the searches and wrong for two other kinds of tool, and when it is
wrong it is wrong silently: the model simply cannot see the tool, so it says
it is unable to help and nothing anywhere records a fault.

That is exactly what happened when the personal tools arrived. They belong to
no module -- "what is my schedule tomorrow" is not a service-requests
question or an HR one -- so narrowing to whatever module the question
classified as deleted every one of them, for anybody holding more tools than
the threshold.

    python agent-service/tests/test_tool_narrowing.py
"""
from __future__ import annotations

import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))

from app.graph import (  # noqa: E402
    ALWAYS_AVAILABLE, NARROW_ABOVE_TOOL_COUNT, _narrow_tools,
)


failures: list[str] = []


def ok(label: str, condition: bool, detail: str = "") -> None:
    print("{}  {}{}".format("PASS" if condition else "FAIL", label,
                            "  " + detail if detail else ""))
    if not condition:
        failures.append(label)


PERSONAL = ["my_schedule", "my_next_commitment", "my_leave",
            "my_timesheet", "my_requests"]
HR = ["search_leave_requests", "search_timesheets", "search_payroll"]
SERVICE = ["search_service_requests", "service_request_detail",
           "create_service_request", "assign_service_request"]
OTHER = ["search_invoices", "search_rentals", "rank_products",
         "rank_technicians", "search_users", "search_attendance",
         "facility_detail", "search_inspections", "search_sales_quotations",
         "facility_business_summary", "rank_facilities_by_revenue",
         "set_service_request_status", "set_service_request_priority",
         "search_service_quotations"]

MODULES = {}
for n in PERSONAL:
    MODULES[n] = "platform"
MODULES["resolve_entity"] = "platform"
for n in HR:
    MODULES[n] = "hr"
for n in SERVICE:
    MODULES[n] = "service-requests"
for n in OTHER:
    MODULES.setdefault(n, "billing")

ALL = [{"name": n} for n in (["resolve_entity"] + PERSONAL + HR + SERVICE + OTHER)]


def names(tools):
    return {t["name"] for t in tools}


print("Tool narrowing")
print("=" * 72)
print()
print("  {} tools in play, threshold is {}".format(len(ALL), NARROW_ABOVE_TOOL_COUNT))
print()

print("Narrowing to a module")
print("-" * 72)

hr_view = _narrow_tools(ALL, MODULES, "hr")
ok("narrowing actually happened", len(hr_view) < len(ALL),
   "{} of {}".format(len(hr_view), len(ALL)))
ok("the module's own tools survive", set(HR) <= names(hr_view))
ok("another module's tools are gone", not (set(SERVICE) & names(hr_view)))

ok("every personal tool survives", set(PERSONAL) <= names(hr_view),
   "missing: " + ", ".join(sorted(set(PERSONAL) - names(hr_view))))
ok("resolve_entity survives", ALWAYS_AVAILABLE <= names(hr_view))

service_view = _narrow_tools(ALL, MODULES, "service-requests")
ok("personal tools survive a different module too",
   set(PERSONAL) <= names(service_view),
   "missing: " + ", ".join(sorted(set(PERSONAL) - names(service_view))))
ok("HR tools are gone from a service-requests question",
   not (set(HR) & names(service_view)))

print()
print("When narrowing should not happen at all")
print("-" * 72)

ok("no module means no narrowing",
   names(_narrow_tools(ALL, MODULES, None)) == names(ALL))

small = ALL[:NARROW_ABOVE_TOOL_COUNT]
ok("a short list is left alone",
   names(_narrow_tools(small, MODULES, "hr")) == names(small),
   "{} tools".format(len(small)))

print()
print("Narrowing never strands the model")
print("-" * 72)

# A module nothing belongs to would leave only the always-available set.
lonely = _narrow_tools(ALL, MODULES, "rentals")
ok("a module with no tools falls back to everything",
   names(lonely) == names(ALL), "{} tools".format(len(lonely)))
ok("the model is never left with a single forced tool", len(lonely) > 1,
   "{} tools".format(len(lonely)))

print()
print("The regression this was written for")
print("-" * 72)

for module in ("hr", "service-requests", "inspections", "billing", "users"):
    kept = names(_narrow_tools(ALL, MODULES, module))
    ok('"what is my schedule tomorrow" still works under module={}'.format(module),
       "my_schedule" in kept)


print()
print("=" * 72)
if failures:
    print("{} failing: {}".format(len(failures), ", ".join(failures)))
    sys.exit(1)
print("All narrowing checks passed.")
