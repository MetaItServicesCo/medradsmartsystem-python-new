"""No page may ask a list endpoint for more rows than it allows.

This is the check that was missing. /attendance/events caps limit at 500, and
both the HR month grid and the employee attendance sheet asked it for 5000.
FastAPI does not clamp an over-cap limit -- it rejects the request with a 422
before the handler runs. So the request failed on every page load, the pages
received nothing, and they drew that nothing as a month of absences. Nobody
saw an error, because nobody was looking at one.

The rule is mechanical, so it is enforced mechanically: resolve each frontend
API helper to the route it calls, read that route's cap out of the FastAPI
signature, and compare every numeric `limit:` passed at a call site.

    python backend/tests/test_api_limits.py
"""
from __future__ import annotations

import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parents[2]
API_DIR = ROOT / "frontend" / "src" / "api"
ENDPOINTS = ROOT / "backend" / "app" / "api" / "v1" / "endpoints"
FRONTEND_SRC = ROOT / "frontend" / "src"

failures: list[str] = []


def ok(label: str, condition: bool, detail: str = "") -> None:
    print("{}  {}{}".format("PASS" if condition else "FAIL", label,
                            "  " + detail if detail else ""))
    if not condition:
        failures.append(label)


# ── What each endpoint allows ────────────────────────────────────────────────
# module -> route -> cap, e.g. "attendance" -> "/events" -> 500
caps: dict[str, dict[str, int]] = {}
for path in sorted(ENDPOINTS.glob("*.py")):
    text = path.read_text(encoding="utf-8", errors="replace")
    routes = caps.setdefault(path.stem, {})
    for match in re.finditer(
        r'@router\.get\(\s*"([^"]+)"(?:.|\n)*?\ndef \w+\((?:.|\n)*?\n\) *(?:->|:)',
        text,
    ):
        block = match.group(0)
        cap = re.search(r"limit: int = Query\(\s*\d+\s*,[^)]*?le=(\d+)", block)
        if cap:
            routes[match.group(1)] = int(cap.group(1))


# ── What each frontend helper calls ──────────────────────────────────────────
# helper name -> "/module/route"
helper_paths: dict[str, str] = {}
for path in sorted(API_DIR.glob("*.ts")):
    text = path.read_text(encoding="utf-8", errors="replace")
    base = re.search(r"const BASE\s*=\s*['\"]([^'\"]+)['\"]", text)
    base_value = base.group(1) if base else ""
    # Split into one chunk per exported helper so a URL is attributed to the
    # helper it sits inside.
    parts = re.split(r"\nexport const (\w+)", text)
    for name, body in zip(parts[1::2], parts[2::2]):
        url = re.search(r"apiClient\.get\(\s*[`'\"]([^`'\"]+)[`'\"]", body)
        if not url:
            continue
        route = url.group(1).replace("${BASE}", base_value)
        helper_paths[name] = route


def cap_for(route: str) -> int | None:
    bits = route.strip("/").split("/")
    if len(bits) < 2:
        return None
    module, rest = bits[0], "/" + "/".join(bits[1:])
    return caps.get(module.replace("-", "_"), {}).get(rest)


print("API limits")
print("=" * 72)

print()
print("The mapping itself resolved")
print("-" * 72)

ok("frontend API helpers were found", len(helper_paths) > 20,
   "{} helpers".format(len(helper_paths)))
ok("backend caps were parsed", sum(len(v) for v in caps.values()) > 10,
   "{} capped routes".format(sum(len(v) for v in caps.values())))
ok("the attendance events cap is readable", cap_for("/attendance/events") == 500,
   str(cap_for("/attendance/events")))
ok("the employees cap is readable", cap_for("/hr/employees") == 1000,
   str(cap_for("/hr/employees")))

print()
print("No call site asks for more than its endpoint allows")
print("-" * 72)

sources = [p for p in FRONTEND_SRC.rglob("*.ts")] + [p for p in FRONTEND_SRC.rglob("*.tsx")]
offences: list[str] = []
checked = 0

for source in sources:
    text = source.read_text(encoding="utf-8", errors="replace")
    for name, route in helper_paths.items():
        cap = cap_for(route)
        if cap is None:
            continue
        # Any call of this helper, with the argument object that follows it.
        for call in re.finditer(re.escape(name) + r"\(([^()]*(?:\([^()]*\)[^()]*)*)\)", text):
            args = call.group(1)
            for literal in re.finditer(r"limit:\s*(\d+)", args):
                checked += 1
                asked = int(literal.group(1))
                if asked > cap:
                    offences.append("{}: {}({} > cap {} on {})".format(
                        source.relative_to(ROOT).as_posix(), name, asked, cap, route))

ok("some limits were actually inspected", checked > 0, "{} checked".format(checked))
ok("none exceeds its endpoint cap", not offences,
   "; ".join(offences) if offences else "")

print()
print("The attendance views page rather than over-ask")
print("-" * 72)

hr_page = (FRONTEND_SRC / "pages" / "HR" / "index.tsx").read_text(
    encoding="utf-8", errors="replace")
attendance_api = (API_DIR / "attendance.ts").read_text(encoding="utf-8", errors="replace")

ok("the HR page uses the paging helper", "fetchAllAttendanceEvents" in hr_page)
ok("  and no longer calls the single-page helper directly",
   "fetchAttendanceEvents(" not in hr_page)
ok("the page size is the server's cap, named once",
   "export const ATTENDANCE_EVENTS_PAGE_LIMIT = 500" in attendance_api)
ok("the paging loop is bounded", "maxEvents = 20000" in attendance_api)

print()
print("A failed request is never drawn as attendance")
print("-" * 72)

ok("the grid reports a failed load", "Attendance could not be loaded, so this grid" in hr_page)
ok("the sheet reports a failed load", "Attendance could not be loaded for this employee" in hr_page)
ok("the sheet refuses to render rows on failure",
   "!eventsLoading && !eventsFailed" in hr_page)

print()
print("Unbounded list endpoints")
print("-" * 72)

hr_src = (ENDPOINTS / "hr.py").read_text(encoding="utf-8", errors="replace")
ok("/hr/employees is bounded", "limit: int = Query(50, ge=1, le=1000)" in hr_src)
ok("/hr/leave-requests is bounded too", hr_src.count("limit: int = Query(50, ge=1, le=1000)") >= 2,
   "{} bounded".format(hr_src.count("limit: int = Query(50, ge=1, le=1000)")))

print()
print("=" * 72)
if failures:
    print("{} failing: {}".format(len(failures), ", ".join(failures)))
    sys.exit(1)
print("All API limit checks passed.")
