"""The employee list is a picker's only view of the company, and it is bounded.

Two separate things are checked here.

The endpoint caps `limit`. Without a cap, any HR account can ask for every
user row in one request, and this install holds thousands of them. 1000 stays
valid because the pickers that page through this already ask for it.

The frontend side is a rule rather than a value: four places on the HR page
fetch employees with different limits, and every one of them used the bare
React Query key 'hr-employees'. Whichever mounted first won, and the rest
silently read its result -- so the Employee Sheet could be handed the 50 rows
fetched by the Policy Assignments tab next door, and an employee who was not
in those 50 looked like they had never come to work. A key that does not carry
its parameters is the bug, so that is what is asserted.

    DATABASE_URL=sqlite:// python backend/tests/test_employee_listing.py
"""
from __future__ import annotations

import inspect
import os
import pathlib
import re
import sys

os.environ.setdefault("DATABASE_URL", "sqlite://")
ROOT = pathlib.Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "backend"))

from app.api.v1.endpoints.attendance import read_profiles  # noqa: E402
from app.api.v1.endpoints.hr import list_employees  # noqa: E402


failures: list[str] = []


def ok(label: str, condition: bool, detail: str = "") -> None:
    print("{}  {}{}".format("PASS" if condition else "FAIL", label,
                            "  " + detail if detail else ""))
    if not condition:
        failures.append(label)


print("Employee listing")
print("=" * 72)

print()
print("The endpoint bounds what can be asked for")
print("-" * 72)

params = inspect.signature(list_employees).parameters
limit_default = params["limit"].default
skip_default = params["skip"].default


def bound(param, name):
    """Read a ge/le constraint off a FastAPI Query.

    Older FastAPI hangs these straight on the object; 0.104 keeps them in
    `metadata` as annotated-types markers. Look in both, so this test is
    about the constraint being there rather than about the version.
    """
    direct = getattr(param, name, None)
    if direct is not None:
        return direct
    for marker in getattr(param, "metadata", None) or []:
        value = getattr(marker, name, None)
        if value is not None:
            return value
    return None


ok("limit is a validated Query, not a bare int",
   type(limit_default).__name__ == "Query", type(limit_default).__name__)
ok("limit has an upper bound", bound(limit_default, "le") is not None,
   str(bound(limit_default, "le")))
ok("  and it is 1000, which the existing pickers ask for",
   bound(limit_default, "le") == 1000)
ok("limit must be at least 1", bound(limit_default, "ge") == 1)
ok("the default page stays small", getattr(limit_default, "default", None) == 50,
   str(getattr(limit_default, "default", None)))
ok("skip is a validated Query too",
   type(skip_default).__name__ == "Query", type(skip_default).__name__)
ok("  and cannot go negative", bound(skip_default, "ge") == 0)

print()
print("Every employee query key carries its parameters")
print("-" * 72)

hr_page = (ROOT / "frontend" / "src" / "pages" / "HR" / "index.tsx").read_text(
    encoding="utf-8", errors="replace")

bare = re.findall(r"queryKey:\s*\['hr-employees'\]", hr_page)
ok("no bare 'hr-employees' key remains", len(bare) == 0,
   "{} found".format(len(bare)))

keys = re.findall(r"queryKey:\s*\['hr-employees'([^\]]*)\]", hr_page)
ok("the page still fetches employees in several places", len(keys) >= 3,
   "{} query keys".format(len(keys)))
ok("  and every one of them is parameterised",
   all(k.strip().startswith(",") for k in keys))

# The limits themselves are named once, so two call sites cannot drift apart
# while sharing a key.
ok("the page limit is a single named constant",
   hr_page.count("const EMPLOYEE_PICKER_LIMIT = 1000") == 1)
ok("the search limit is too",
   hr_page.count("const EMPLOYEE_SEARCH_LIMIT = 50") == 1)
ok("no employee fetch passes a bare numeric limit any more",
   not re.search(r"fetchHREmployees\(\{\s*limit:\s*\d", hr_page))
ok("and none is called with no arguments, which silently meant 50",
   "fetchHREmployees()" not in hr_page)

print()
print("The register holds only people the system can record")
print("-" * 72)

attendance_src = (ROOT / "backend" / "app" / "api" / "v1" / "endpoints"
                  / "attendance.py").read_text(encoding="utf-8", errors="replace")
profiles = inspect.signature(read_profiles).parameters

ok("profiles can be narrowed to the enrolled", "enrolled_only" in profiles)
ok("  and it is off unless asked for",
   getattr(profiles["enrolled_only"].default, "default", None) is False)
ok("  filtering on a real enrolment, not a placeholder",
   "AttendanceProfile.face_status != AttendanceFaceStatus.NOT_ENROLLED" in attendance_src)
ok("the user scope is already active-only",
   "db.query(User).filter(User.is_active == True)" in attendance_src)

ok("the month grid lists enrolled people", "enrolled_only: true" in hr_page)
ok("  and pages through them", "fetchAllAttendanceRegister" in hr_page)
ok("  telling the caller when it is showing only part of the company",
   "of {entryTotal} enrolled employees" in hr_page)
ok("the sheet picker searches the same register",
   "queryKey: ['attendance-profiles', 'search', empSearch, EMPLOYEE_SEARCH_LIMIT]" in hr_page)

print()
print("The sheet reaches employees the first page cannot hold")
print("-" * 72)

ok("the sheet searches on the server",
   "search: empSearch || undefined" in hr_page)
ok("  and tells the select not to filter the results again",
   "serverFiltered" in hr_page)
ok("the selected employee is kept while the search moves on",
   "const [selected, setSelected] = useState<any | null>(null)" in hr_page)
ok("typing is debounced rather than firing a request per keystroke",
   "setTimeout(() => setEmpSearch(searchInput.trim()), 300)" in hr_page)
ok("options show more than a name, so duplicates can be told apart",
   "[p.user?.email, p.user?.role].filter(Boolean)" in hr_page)

print()
print("Missing data is not reported as absence")
print("-" * 72)

ok("the sheet says so plainly when nothing was recorded",
   "No attendance was recorded for" in hr_page)
ok("  and distinguishes that from having been marked absent",
   "not the same as having been marked absent" in hr_page)
ok("  naming the reasons a day is simply not listed",
   "shifts still in progress" in hr_page)

print()
print("=" * 72)
if failures:
    print("{} failing: {}".format(len(failures), ", ".join(failures)))
    sys.exit(1)
print("All employee listing checks passed.")
