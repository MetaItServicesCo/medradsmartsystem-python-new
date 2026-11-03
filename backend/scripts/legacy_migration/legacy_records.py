"""What the legacy system recorded, read the way the legacy system meant it.

The first migration read a few legacy columns by their names, and the names
did not mean what they said. This module holds the corrected readings, so the
read-only audit (``audit_legacy_records``) and the correction that follows it
use exactly the same rules.

Invoices
    ``status`` 1 is a paid invoice: it always has ``paid_at``, the activity log
    records "paid", and the money received is ``confirm_paid_amount`` (plus the
    card fee the gateway added); ``balance`` is what was still owed, so a few
    are part-paid. ``paid_amount`` is *not* money received: on unpaid invoices
    (status 0, 2, 3) it equals ``net_amount`` and ``balance``. An unpaid status
    is still paid when the legacy records show a payment (``paid_at``, a "paid"
    log entry, or payment rows), which happens once.

Service reports
    ``technician``, ``date``, ``hours``, ``fault`` and ``action`` are JSON lists,
    one entry per work session (``["Omar","Omar"]``, ``["6","5"]``); ``null``
    means nothing was recorded. ``worked_hours`` is their total.

Inspection charges
    ``net_charges`` = parts + labour + service + travel + other + tax - discount,
    on every legacy row. The report shows Parts, Inspection Charges (labour +
    service + travel) and Others (other + tax - discount), which add up to it.
"""
from __future__ import annotations

import json
from datetime import date
from decimal import Decimal, ROUND_HALF_UP
from typing import Any, Iterable

CENT = Decimal("0.01")


def money(value: Any) -> Decimal:
    try:
        return Decimal(str(value if value not in (None, "") else 0).strip() or "0").quantize(CENT, ROUND_HALF_UP)
    except Exception:
        return Decimal("0.00")


def _text(value: Any) -> str:
    return "" if value is None else str(value).strip()


# --- invoices -------------------------------------------------------------------------------------
def invoice_payment(row: dict[str, Any], payment_rows: Iterable[dict[str, Any]], log_actions: Iterable[str]
                    ) -> tuple[Decimal, Decimal] | None:
    """``(amount_paid, balance_due)`` the legacy invoice recorded, or None to leave it alone.

    None for invoices whose figures the rules do not cover: a credit note
    (zero or negative total) or one with a refund recorded.
    """
    total = money(row.get("net_amount"))
    if total <= 0 or money(row.get("refund")) > 0:
        return None
    status = int(_text(row.get("status")) or 0)
    rows = list(payment_rows)
    paid_evidence = status == 1 or bool(_text(row.get("paid_at"))) or "paid" in {a.strip().lower() for a in log_actions} \
        or bool(rows)
    if not paid_evidence:
        return Decimal("0.00"), total
    if status == 1:
        owed = min(max(money(row.get("balance")), Decimal("0.00")), total)
        return total - owed, owed
    received = sum((money(r.get("paid_amount")) for r in rows), Decimal("0.00"))
    received = min(received, total) if received > 0 else total
    return received, total - received


def invoice_status(amount_paid: Decimal, total: Decimal, due: date | str | None, today: date | None = None) -> str:
    today = today or date.today()
    if isinstance(due, str):
        due = date.fromisoformat(due[:10]) if due.strip() else None
    if amount_paid >= total:
        return "PAID"
    if amount_paid > 0:
        return "PARTIALLY_PAID"
    return "OVERDUE" if due and due < today else "PENDING"


# The payment rows the migration wrote; any other row means the invoice was
# paid or changed in the new app, which the correction never touches.
MIGRATION_TRANSACTIONS = {
    "Imported legacy partial payment",
    "Imported legacy payment balance",
}


# --- service reports ------------------------------------------------------------------------------
def legacy_list(value: Any) -> list[Any]:
    """A legacy JSON list column as a list (a plain value becomes a one-item list)."""
    text = _text(value)
    if not text:
        return []
    if text.startswith("["):
        try:
            parsed = json.loads(text)
            return parsed if isinstance(parsed, list) else [parsed]
        except ValueError:
            return [text]
    return [text]


def _entry(value: Any) -> str | None:
    text = _text(value)
    return None if text.lower() in ("", "null", "none") else text


def _hours(value: Any) -> float | None:
    text = _entry(value)
    if text is None:
        return None
    try:
        return float(Decimal(text))
    except Exception:
        return None


def report_sessions(report: dict[str, Any]) -> list[dict[str, Any]]:
    """The work sessions one legacy service report recorded, in order."""
    columns = {key: legacy_list(report.get(key)) for key in ("technician", "date", "hours", "fault", "action")}
    count = max((len(values) for values in columns.values()), default=0)
    sessions = []
    for index in range(count):
        pick = lambda key: columns[key][index] if index < len(columns[key]) else None  # noqa: E731
        sessions.append({
            "technician": _entry(pick("technician")),
            "work_date": _entry(pick("date")),
            "duration_hours": _hours(pick("hours")),
            "diagnosis": _entry(pick("fault")),
            "work_done": _entry(pick("action")),
        })
    total = _hours(report.get("worked_hours"))
    if not sessions and total:
        # A few reports recorded only their total hours: one session holds them.
        sessions.append({"technician": None, "work_date": None, "duration_hours": total,
                         "diagnosis": None, "work_done": None})
    elif len(sessions) == 1 and sessions[0]["duration_hours"] is None and total:
        # A one-session report often kept its hours only in the total.
        sessions[0]["duration_hours"] = total
    return sessions


def resolution_summary(reports: list[dict[str, Any]]) -> str | None:
    """The latest report's last recorded work done, else its last recorded fault."""
    if not reports:
        return None
    sessions = report_sessions(reports[-1])
    for key in ("work_done", "diagnosis"):
        for session in reversed(sessions):
            if session[key]:
                return session[key]
    return None


def technician_names(report: dict[str, Any]) -> str | None:
    names = []
    for name in (_entry(value) for value in legacy_list(report.get("technician"))):
        if name and name not in names:
            names.append(name)
    return ", ".join(names) or None


# --- inspection charges ---------------------------------------------------------------------------
def inspection_billing(charge: dict[str, Any]) -> dict[str, float]:
    """The report's Parts / Inspection Charges / Others for a legacy charge row."""
    parts = money(charge.get("parts"))
    work = money(charge.get("labour")) + money(charge.get("service")) + money(charge.get("travel"))
    others = money(charge.get("other")) + money(charge.get("tax")) - money(charge.get("discount"))
    return {"parts": float(parts), "inspection_charges": float(work), "others": float(others)}


# --- what the migration should have written -------------------------------------------------------
def jsonable(value: Any) -> Any:
    """A legacy column value as JSON can store it (dates as ISO text, money as a number)."""
    if value is None or isinstance(value, (str, int, float, bool)):
        return value
    if isinstance(value, Decimal):
        return float(value)
    if hasattr(value, "isoformat"):
        return value.isoformat()
    return str(value)


def _when(report: dict[str, Any]) -> Any:
    return jsonable(report.get("updated_at") or report.get("created_at"))


def session_entries(reports: list[dict[str, Any]], fallback_user: str) -> list[dict[str, Any]]:
    """The service-history work sessions for legacy reports of a service with no activity records.

    One entry per session the report recorded; the first keeps the session id
    the migration gave the report, so nothing that already points at it moves.
    """
    entries = []
    for report in reports:
        for number, session in enumerate(report_sessions(report), 1):
            entries.append({
                "action": "technician_clock_out",
                "user": session["technician"] or fallback_user,
                "timestamp": _when(report),
                "changes": {
                    "session_id": f"legacy-report-{report['id']}" + ("" if number == 1 else f"-{number}"),
                    "work_date": session["work_date"],
                    "duration_hours": session["duration_hours"],
                    "diagnosis": session["diagnosis"],
                    "work_done": session["work_done"],
                    "legacy_report_file": jsonable(report.get("file")),
                    "po": jsonable(report.get("po")),
                    "trips": jsonable(report.get("trips")),
                    "trip_price": jsonable(report.get("trip_price")),
                },
            })
    return entries


def report_entry(report: dict[str, Any], fallback_user: str) -> dict[str, Any]:
    """The history entry for a legacy report of a service whose sessions came from activity records."""
    sessions = report_sessions(report)
    joined = lambda key: "\n".join(s[key] for s in sessions if s[key]) or None  # noqa: E731
    return {
        "action": "legacy_service_report",
        "user": technician_names(report) or fallback_user,
        "timestamp": _when(report),
        "changes": {
            "legacy_report_id": int(report["id"]),
            "diagnosis": joined("diagnosis"),
            "work_done": joined("work_done"),
            "worked_hours": jsonable(report.get("worked_hours")),
            "legacy_report_file": jsonable(report.get("file")),
            "po": jsonable(report.get("po")),
            "trips": jsonable(report.get("trips")),
            "trip_price": jsonable(report.get("trip_price")),
            "mileage_amount": jsonable(report.get("milage_amount")),
            "fixed_amount": jsonable(report.get("fixed_amount")),
        },
    }


def is_migrated_report_entry(entry: dict[str, Any]) -> bool:
    """A history entry the migration wrote from a legacy service report."""
    changes = entry.get("changes") or {}
    if entry.get("action") == "technician_clock_out":
        return str(changes.get("session_id") or "").startswith("legacy-report-")
    return entry.get("action") == "legacy_service_report" and "legacy_report_id" in changes


def corrected_history(history: list[dict[str, Any]], expected: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """``history`` with the migration's report entries replaced by ``expected``, in their place.

    Every entry the new app added stays exactly as it is.
    """
    result, placed = [], False
    for entry in history:
        if is_migrated_report_entry(entry):
            if not placed:
                result.extend(expected)
                placed = True
            continue
        result.append(entry)
    if not placed:
        result.extend(expected)
    return result


def payment_rows(row: dict[str, Any], legacy_payments: list[dict[str, Any]], amount_paid: Decimal) -> list[dict[str, Any]]:
    """The invoice's legacy payment ledger rows: its recorded payments, else one balance row."""
    if amount_paid <= 0:
        return []
    recorded = [p for p in legacy_payments if money(p.get("paid_amount")) > 0]
    if recorded and sum((money(p.get("paid_amount")) for p in recorded), Decimal("0.00")) == amount_paid:
        return [{"amount": money(p.get("paid_amount")), "description": "Imported legacy partial payment",
                 "when": p.get("paid_at") or p.get("created_at"), "method": _text(p.get("payment_type")) or None,
                 "reference": _text(p.get("charge_id")) or None} for p in recorded]
    return [{"amount": amount_paid, "description": "Imported legacy payment balance",
             "when": row.get("paid_at") or row.get("updated_at") or row.get("created_at"), "method": None,
             "reference": _text(row.get("charge_id")) or None}]


def as_datetime(value: Any):
    """A legacy timestamp (a datetime, or text such as ``2022-01-25 22:05:23``) as a datetime, else None."""
    from datetime import datetime as _datetime
    if value is None or isinstance(value, _datetime):
        return value
    if isinstance(value, date):
        return _datetime(value.year, value.month, value.day)
    text = _text(value)
    try:
        return _datetime.fromisoformat(text.replace("T", " ")[:19]) if text and not text.startswith("0000") else None
    except ValueError:
        return None
