"""Read-only: where production differs from what the legacy system recorded.

Compares, through ``legacy_migration.id_map``, every migrated record with the
legacy database (``legacy_records`` holds the rules):

* invoices: amount paid, balance and status;
* service requests: the technician work sessions (one per legacy session,
  with its technician, work date, hours, diagnosis and work done), the
  resolution summary, and leftover legacy list text such as ``["Daniel"]``
  or ``[null]``;
* inspections: the billing figures the report adds up (Parts, Inspection
  Charges, Others).

A record changed in the new app since the migration is counted separately:
the correction never touches it. Nothing is written::

    LEGACY_DATABASE_URL=mysql+pymysql://root:PASSWORD@legacy_src:3306/admin_medrad \\
    python -m scripts.legacy_migration.audit_legacy_records

Exits 1 when anything differs.
"""
from __future__ import annotations

import argparse
import collections
import json
import os
import sys
from typing import Any

from sqlalchemy import bindparam, create_engine, text

from . import legacy_records as lr

RAW_LIST_MARKERS = ('["', "[null]", "['")


def _dict(value: Any) -> dict[str, Any]:
    if isinstance(value, dict):
        return value
    try:
        parsed = json.loads(value) if isinstance(value, str) and value.strip() else {}
    except ValueError:
        return {}
    return parsed if isinstance(parsed, dict) else {}


def _list(value: Any) -> list[Any]:
    if isinstance(value, list):
        return value
    try:
        parsed = json.loads(value) if isinstance(value, str) and value.strip() else []
    except ValueError:
        return []
    return parsed if isinstance(parsed, list) else []


def _raw(value: Any) -> bool:
    """Legacy list text left in a field: ``["Daniel"]``, ``[null]``, ``[null,"Replaced ..."]``."""
    if not isinstance(value, str):
        return False
    text_value = value.strip()
    if text_value.startswith(RAW_LIST_MARKERS):
        return True
    if text_value.startswith("[") and text_value.endswith("]"):
        try:
            return isinstance(json.loads(text_value), list)
        except ValueError:
            return False
    return False


def legacy_data(legacy) -> dict[str, Any]:
    with legacy.connect() as c:
        rows = lambda sql: [dict(r._mapping) for r in c.execute(text(sql))]  # noqa: E731
        data = {
            "invoices": rows("SELECT * FROM invoices"),
            "payments": rows("SELECT * FROM partial_payments ORDER BY id"),
            "logs": rows("SELECT invoice_no, action FROM invoice_logs"),
            "reports": rows("SELECT * FROM service_reports ORDER BY id"),
            "services": {int(r["id"]): r for r in rows("SELECT id, user_name FROM services")},
            "activity_services": {r["service_id"] for r in rows("SELECT DISTINCT service_id FROM service_activities")},
            "charges": rows("SELECT * FROM inspection_charges ORDER BY id"),
        }
    return data


def id_map(conn, entity: str) -> dict[int, int]:
    return {int(legacy): int(target) for legacy, target in conn.execute(text(
        "SELECT legacy_id, target_id FROM legacy_migration.id_map WHERE entity = :e"), {"e": entity})}


def new_report() -> dict[str, Any]:
    return {"counts": collections.Counter(), "examples": collections.defaultdict(list), "money": collections.Counter()}


def note(report, kind: str, example: str) -> None:
    report["counts"][kind] += 1
    if len(report["examples"][kind]) < 8:
        report["examples"][kind].append(example)


def audit_invoices(conn, data, report) -> None:
    payments = collections.defaultdict(list)
    for row in data["payments"]:
        payments[int(row["invoice_id"])].append(row)
    logs = collections.defaultdict(set)
    for row in data["logs"]:
        logs[str(row["invoice_no"] or "").strip()].add(str(row["action"] or ""))
    targets = id_map(conn, "invoice")
    app_activity = {int(i) for (i,) in conn.execute(text(
        "SELECT DISTINCT invoice_id FROM invoice_transactions WHERE transaction_type IN ('payment', 'refund') "
        "AND coalesce(description, '') NOT IN :mine").bindparams(bindparam("mine", expanding=True)),
        {"mine": sorted(lr.MIGRATION_TRANSACTIONS)})}
    current = {int(r.id): r for r in conn.execute(text(
        "SELECT id, invoice_number, status, total_amount, amount_paid, balance_due, due_date FROM invoices"))}
    ledger = collections.Counter()
    for invoice_id, amount in conn.execute(text(
            "SELECT invoice_id, amount FROM invoice_transactions WHERE transaction_type = 'payment' "
            "AND description IN :mine").bindparams(bindparam("mine", expanding=True)),
            {"mine": sorted(lr.MIGRATION_TRANSACTIONS)}):
        ledger[int(invoice_id)] += lr.money(amount)
    for row in data["invoices"]:
        target = targets.get(int(row["id"]))
        if target is None or target not in current:
            continue
        expected = lr.invoice_payment(row, payments[int(row["id"])], logs[str(row["invoice_no"] or "").strip()])
        if expected is None:
            report["counts"]["invoices left as they are (credit note, zero total or refund)"] += 1
            continue
        paid, owed = expected
        now = current[target]
        status = lr.invoice_status(paid, lr.money(now.total_amount), now.due_date)
        same = lr.money(now.amount_paid) == paid and lr.money(now.balance_due) == owed and str(now.status) == status             and (target in app_activity or lr.money(ledger[target]) == paid)
        if same:
            report["counts"]["invoices matching the legacy record"] += 1
            continue
        if target in app_activity:
            note(report, "invoices that differ but were paid or changed in the new app (not touched)",
                 f"{now.invoice_number}: {now.status} paid {now.amount_paid}")
            continue
        detail = f"{now.invoice_number}: {now.status} paid {lr.money(now.amount_paid)} owed {lr.money(now.balance_due)}" \
                 f"  ->  {status} paid {paid} owed {owed}"
        if paid > lr.money(now.amount_paid):
            note(report, "invoices the legacy system shows as paid (more) than production does", detail)
        else:
            note(report, "invoices production shows as paid that the legacy system shows as owed", detail)
        report["money"]["outstanding balance change"] += float(owed - lr.money(now.balance_due))


def fallback_user(service: dict[str, Any] | None) -> str:
    name = str((service or {}).get("user_name") or "").strip()
    return name or "Legacy Technician"


def expected_entries(legacy_id: int, reports: list[dict[str, Any]], data) -> list[dict[str, Any]]:
    """What the service's history should hold for its legacy reports (JSON-normalised)."""
    user = fallback_user(data["services"].get(legacy_id))
    if legacy_id in data["activity_services"]:
        entries = [lr.report_entry(r, user) for r in reports]
    else:
        entries = lr.session_entries(reports, user)
    return json.loads(json.dumps(entries))


def audit_services(conn, data, report) -> None:
    by_service = collections.defaultdict(list)
    for row in data["reports"]:
        by_service[int(row["service_id"])].append(row)
    targets = id_map(conn, "service_request")
    rows = {int(r.id): r for r in conn.execute(text(
        "SELECT id, request_number, history, resolution_description FROM service_requests"))}
    for legacy_id, target in targets.items():
        sr = rows.get(target)
        reports = by_service.get(legacy_id) or []
        if sr is None or not reports:
            continue
        history = _list(sr.history)
        migrated = [e for e in history if lr.is_migrated_report_entry(e)]
        expected = expected_entries(legacy_id, reports, data)
        problems = []
        if migrated != expected:
            if len(migrated) != len(expected):
                problems.append(f"{len(migrated)} report entr(ies) shown, legacy recorded {len(expected)}")
            if any(_raw(v) for e in migrated for v in (e.get("user"), *(e.get("changes") or {}).values())):
                problems.append("legacy list text left in")
            if not problems:
                problems.append("work-session details differ")
        expected_summary = lr.resolution_summary(reports)
        if (sr.resolution_description or None) != expected_summary:
            if _raw(sr.resolution_description) or sr.resolution_description in (None, ""):
                problems.append(f"resolution summary {sr.resolution_description!r} -> {expected_summary!r}")
            else:
                report["counts"]["service resolution summaries changed in the app (not touched)"] += 1
        if problems:
            note(report, "service requests whose report differs from the legacy record",
                 f"{sr.request_number}: " + "; ".join(problems))
        else:
            report["counts"]["service requests matching the legacy record"] += 1


def audit_inspection_billing(conn, data, report) -> None:
    charges = {int(row["inspection_id"]): row for row in data["charges"]}
    targets = id_map(conn, "inspection")
    rows = {int(r.id): r for r in conn.execute(text("SELECT id, inspection_number, form_data FROM inspections"))}
    for legacy_id, target in targets.items():
        row, charge = rows.get(target), charges.get(legacy_id)
        if row is None or charge is None:
            continue
        form_data = _dict(row.form_data)
        expected = lr.inspection_billing(charge)
        billing = form_data.get("billing") or {}
        shown = {key: float(lr.money(billing.get(key))) for key in expected}
        if shown == expected:
            report["counts"]["inspection billing matching the legacy charge"] += 1
        elif "form_template" in form_data:
            report["counts"]["inspection billing saved in the app since (not touched)"] += 1
        else:
            note(report, "inspection billing pages that do not add up to the legacy charge",
                 f"{row.inspection_number}: shows {shown} -> {expected} (legacy net {lr.money(charge.get('net_charges'))})")
            report["money"]["inspection billing added"] += sum(expected.values()) - sum(shown.values())


def print_report(report) -> None:
    for kind, count in report["counts"].items():
        print(f"{kind}: {count}")
        for example in report["examples"].get(kind, []):
            print(f"    {example}")
    for kind, amount in report["money"].items():
        print(f"{kind}: ${amount:,.2f}")


def differs(report) -> bool:
    return any(kind.startswith(("invoices the", "invoices production", "service requests whose", "inspection billing pages"))
               for kind in report["counts"])


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("--database-url", default=os.environ.get("DATABASE_URL"))
    parser.add_argument("--legacy-url", default=os.environ.get("LEGACY_DATABASE_URL"))
    args = parser.parse_args(argv)
    if not args.database_url or not args.legacy_url:
        parser.error("set DATABASE_URL and LEGACY_DATABASE_URL (or pass --database-url / --legacy-url)")
    data = legacy_data(create_engine(args.legacy_url))
    report = new_report()
    with create_engine(args.database_url).connect() as conn:
        audit_invoices(conn, data, report)
        audit_services(conn, data, report)
        audit_inspection_billing(conn, data, report)
    print("READ-ONLY AUDIT - nothing written")
    print_report(report)
    return 1 if differs(report) else 0


if __name__ == "__main__":
    sys.exit(main())
