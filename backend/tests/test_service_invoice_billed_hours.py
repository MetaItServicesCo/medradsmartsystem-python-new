"""The service invoice's visits add up to the hours billed.

An administrator's hours correction (6.67 -> 4) changes what the request bills;
the technician's logged visit stays as recorded on the work order. The invoice
the customer reads must not show 6.67 on the visit while billing 4: the visit
shows 4 and its check-out moves to match. Billing's preview keeps the logged
hours beside it; the customer's copy never carries them.

    cd backend
    DATABASE_URL=sqlite:// venv312/Scripts/python.exe tests/test_service_invoice_billed_hours.py
"""
from __future__ import annotations

import copy
import logging
import os
import pathlib
import sys
from datetime import date
from decimal import Decimal as D
from types import SimpleNamespace

os.environ.setdefault("DATABASE_URL", "sqlite://")
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))
logging.disable(logging.CRITICAL)

import app.models  # noqa: E402,F401
from app.utils.service_invoice_document import (  # noqa: E402
    billed_work_entries,
    build_service_invoice_document,
    latest_hours_correction,
    service_work_entries,
)

failures: list[str] = []


def ok(label: str, condition: bool, detail: object = "") -> None:
    print("{}  {}{}".format("PASS" if condition else "FAIL", label, f"  {detail}" if not condition else ""))
    if not condition:
        failures.append(label)


def visit(session_id, day, start, end, hours, *, break_minutes=0, work="Replaced the tube"):
    return {
        "timestamp": f"{day}T{end}",
        "action": "technician_work_session",
        "user": "Tech One",
        "changes": {
            "session_id": session_id,
            "work_date": day,
            "start_time": f"{day}T{start}" if start else None,
            "end_time": f"{day}T{end}" if end else None,
            "break_minutes": break_minutes,
            "duration_hours": hours,
            "diagnosis": "No image",
            "work_done": work,
        },
    }


def correction(from_hours, to_hours, reason="Travel was logged as work"):
    return {
        "timestamp": "2026-11-20T10:00:00",
        "action": "hours_correction",
        "user": "Billing Admin",
        "changes": {"from_hours": from_hours, "to_hours": to_hours, "reason": reason},
    }


def request(history, total):
    return SimpleNamespace(
        history=history,
        time_spent_hours=D(str(total)),
        assigned_technician=SimpleNamespace(full_name="Tech One"),
        resolution_description=None,
        request_number="SR-1",
        reference_number=None,
        service_required="C-arm service",
        problem_description=None,
        equipment=None,
        preferred_datetime=None,
        completed_at=None,
        started_at=None,
    )


def invoice_for(sr, snapshot=None):
    return SimpleNamespace(
        service_request=sr,
        facility=None,
        status=SimpleNamespace(value="pending"),
        invoice_number="SRV-1",
        issue_date=date(2026, 11, 21),
        due_date=date(2026, 12, 21),
        customer_name="Clinic",
        customer_address=None,
        customer_phone=None,
        customer_email="c@x.test",
        service_work_entries=snapshot,
        subtotal=D("700"), tax_amount=D("0"), discount_amount=D("0"), card_fee_amount=D("0"),
        total_amount=D("700"), amount_paid=D("0"), balance_due=D("700"),
    )


def hours_of(rows):
    return [row["hours"] for row in rows if row.get("hours") is not None]


print("The reported case: one visit of 6.67 hrs, corrected to 4")
one = request([visit("s1", "2026-11-18", "09:00:00", "15:40:12", 6.67), correction(6.67, 4)], 4)
logged = service_work_entries(one)
billed = billed_work_entries(one, logged)
ok("the visit shows the 4 hrs billed", hours_of(billed) == [4.0], billed)
ok("  its check-out moves to 1:00 PM, check-in unchanged",
   billed[0]["check_in"] == "2026-11-18T09:00:00" and billed[0]["check_out"] == "2026-11-18T13:00:00",
   billed[0]["check_out"])
ok("  Billing sees the technician logged 6.67", billed[0]["logged_hours"] == 6.67)
ok("the work order rows are not touched", hours_of(logged) == [6.67] and "logged_hours" not in logged[0])
ok("the history is not touched", one.history[0]["changes"]["duration_hours"] == 6.67)

document = build_service_invoice_document(invoice_for(one), [])
ok("the customer's invoice: visit 4, Total Hours 4", hours_of(document["work_entries"]) == [4.0] and document["total_hours"] == 4.0, document["work_entries"])
ok("  and it never carries the logged hours", all("logged_hours" not in row for row in document["work_entries"]))

snap = copy.deepcopy(logged)
snap[0]["work_done"] = "Worded by Billing"
document = build_service_invoice_document(invoice_for(one, snap), [])
ok("an invoice's saved rows are billed the same way, wording kept",
   hours_of(document["work_entries"]) == [4.0] and document["work_entries"][0]["work_done"] == "Worded by Billing")
ok("  the saved rows themselves stay as saved", snap[0]["hours"] == 6.67)

print("Check-out moves by the change, so a break inside the visit is kept")
brk = request([visit("s1", "2026-11-18", "08:00:00", "17:00:00", 8.5, break_minutes=30), correction(8.5, 6)], 6)
row = billed_work_entries(brk, service_work_entries(brk))[0]
ok("8.5 hrs with a 30 min break, billed 6: 8:00 to 2:30", row["hours"] == 6.0 and row["check_out"] == "2026-11-18T14:30:00", row)

print("Times written with Z keep it")
z = request([visit("s1", "2026-11-18", "09:00:00Z", "15:00:00Z", 6), correction(6, 4)], 4)
row = billed_work_entries(z, service_work_entries(z))[0]
ok("15:00Z less 2 hrs is 13:00Z", row["check_out"] == "2026-11-18T13:00:00Z", row["check_out"])

print("Several visits: the last one shows the difference")
many = request([
    visit("s1", "2026-11-17", "09:00:00", "12:00:00", 3),
    visit("s2", "2026-11-18", "09:00:00", "12:40:12", 3.67),
    correction(6.67, 4),
], 4)
rows = billed_work_entries(many, service_work_entries(many))
ok("3 + 3.67 billed 4: 3 + 1", hours_of(rows) == [3.0, 1.0], rows)
ok("  only the last visit is marked as changed", "logged_hours" not in rows[0] and rows[1]["logged_hours"] == 3.67)

big = request([
    visit("s1", "2026-11-17", "09:00:00", "12:00:00", 3),
    visit("s2", "2026-11-18", "09:00:00", "11:00:00", 2),
    correction(5, 1.5),
], 1.5)
rows = billed_work_entries(big, service_work_entries(big))
ok("a reduction larger than the last visit carries on: 3 + 2 billed 1.5 -> 1.5 + 0", hours_of(rows) == [1.5, 0.0], rows)
ok("  the rows add up to the hours billed", sum(hours_of(rows)) == 1.5)

up = request([visit("s1", "2026-11-18", "09:00:00", "13:00:00", 4), correction(4, 6, "Forgot the second trip")], 6)
row = billed_work_entries(up, service_work_entries(up))[0]
ok("an increase, 4 -> 6: the visit shows 6, out at 3:00 PM", row["hours"] == 6.0 and row["check_out"] == "2026-11-18T15:00:00", row)

print("A visit after the correction is billed as logged")
later = request([
    visit("s1", "2026-11-17", "09:00:00", "15:40:12", 6.67),
    correction(6.67, 4),
    visit("s2", "2026-11-19", "09:00:00", "11:00:00", 2),
], 6)
rows = billed_work_entries(later, service_work_entries(later))
ok("corrected to 4, then a 2 hr visit (total 6): the corrected visit shows 4, the new one 2",
   hours_of(rows) == [4.0, 2.0], rows)
ok("  only the corrected visit is marked as changed", rows[0]["logged_hours"] == 6.67 and "logged_hours" not in rows[1])

print("Nothing changes without an hours correction")
plain = request([visit("s1", "2026-11-18", "09:00:00", "15:40:12", 6.67)], 6.67)
rows = billed_work_entries(plain, service_work_entries(plain))
ok("rows as logged", hours_of(rows) == [6.67] and "logged_hours" not in rows[0])
legacy = request([visit("s1", "2026-11-18", "09:00:00", "15:00:00", 6)], 9)
ok("old records whose total differs from the visits are left as they were",
   hours_of(billed_work_entries(legacy, service_work_entries(legacy))) == [6.0])
ok("no correction: latest_hours_correction is None", latest_hours_correction(plain) is None)

manual = request([visit("s1", "2026-11-18", None, None, 6.67), correction(6.67, 4)], 4)
row = billed_work_entries(manual, service_work_entries(manual))[0]
ok("a visit logged as hours only, no times: hours 4, no times made up", row["hours"] == 4.0 and row["check_in"] is None and row["check_out"] is None, row)

notes_only = request([
    {"timestamp": "2026-11-18T10:00:00", "action": "work_order_addition", "user": "Tech",
     "changes": {"addition_id": "a1", "work_done": "Left a note"}},
    correction(0, 2),
], 2)
rows = billed_work_entries(notes_only, service_work_entries(notes_only))
ok("rows without hours (additions) are never given hours", all(r["hours"] is None for r in rows), rows)

broken = request(["not a dict", {"action": "hours_correction", "changes": "bad"}, visit("s1", "2026-11-18", "09:00:00", "15:00:00", 6)], 4)
try:
    rows = billed_work_entries(broken, service_work_entries(broken))
    ok("a malformed history does not stop the invoice", hours_of(rows) == [4.0], rows)
except Exception as error:  # noqa: BLE001
    ok("a malformed history does not stop the invoice", False, repr(error))

print("The latest correction is the one shown to Billing")
twice = request([visit("s1", "2026-11-18", "09:00:00", "15:00:00", 6), correction(6, 5, "first"), correction(5, 4, "second")], 4)
c = latest_hours_correction(twice)
ok("from 5 to 4, 'second', by Billing Admin", c == {"from_hours": 5.0, "to_hours": 4.0, "reason": "second", "user": "Billing Admin", "timestamp": "2026-11-20T10:00:00"}, c)

print()
print(f"{len(failures)} failed" if failures else "All billed-hours checks passed")
sys.exit(1 if failures else 0)
