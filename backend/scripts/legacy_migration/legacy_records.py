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
