"""Correct migrated records to what the legacy system recorded.

Applies, to the records ``audit_legacy_records`` reports as different, the
values the migration should have written (``legacy_records`` holds the rules):

* invoices: amount paid, balance and status from the legacy payment records,
  and the migration's own payment ledger rows ("Imported legacy ...") replaced
  by the legacy payments; an invoice with any payment or refund recorded in
  the new app is never touched;
* service requests: the history entries the migration wrote from legacy
  service reports replaced, in their place, by one entry per legacy work
  session (technician, work date, hours - none when none were recorded -,
  diagnosis, work done); entries the new app added are kept as they are; the
  resolution summary set where it still holds legacy list text or is empty;
* inspections: the billing Parts / Inspection Charges / Others the report
  adds up, from the legacy charge (the legacy breakdown is kept beside them);
  an inspection saved in the app since is never touched.

One transaction; nothing is written without ``--apply``::

    LEGACY_DATABASE_URL=mysql+pymysql://root:PASSWORD@legacy_src:3306/admin_medrad \\
    python -m scripts.legacy_migration.fix_legacy_records            # dry run
    ... --apply                                                      # write

Back the database up first; run ``audit_legacy_records`` after. A second run
finds nothing left to change.
"""
from __future__ import annotations

import argparse
import collections
import os
import sys
from datetime import datetime
from typing import Any

from sqlalchemy import MetaData, create_engine, delete, insert, select, update

from . import legacy_records as lr
from .audit_legacy_records import _dict, _list, _raw, expected_entries, id_map, legacy_data


def new_report() -> dict[str, Any]:
    return {"counts": collections.Counter(), "examples": collections.defaultdict(list)}


def note(report, kind: str, example: str) -> None:
    report["counts"][kind] += 1
    if len(report["examples"][kind]) < 100:
        report["examples"][kind].append(example)


def fix_invoices(conn, tables, data, report) -> None:
    invoices, transactions = tables["invoices"], tables["invoice_transactions"]
    payments = collections.defaultdict(list)
    for row in data["payments"]:
        payments[int(row["invoice_id"])].append(row)
    logs = collections.defaultdict(set)
    for row in data["logs"]:
        logs[str(row["invoice_no"] or "").strip()].add(str(row["action"] or ""))
    targets = id_map(conn, "invoice")
    mine = sorted(lr.MIGRATION_TRANSACTIONS)
    app_activity = {int(i) for (i,) in conn.execute(
        select(transactions.c.invoice_id).distinct().where(
            transactions.c.transaction_type.in_(["payment", "refund"]),
            ~transactions.c.description.in_(mine) | transactions.c.description.is_(None)))}
    ledger = collections.Counter()
    for invoice_id, amount in conn.execute(select(transactions.c.invoice_id, transactions.c.amount).where(
            transactions.c.transaction_type == "payment", transactions.c.description.in_(mine))):
        ledger[int(invoice_id)] += lr.money(amount)
    current = {int(r.id): r for r in conn.execute(select(
        invoices.c.id, invoices.c.invoice_number, invoices.c.status, invoices.c.total_amount, invoices.c.amount_paid,
        invoices.c.balance_due, invoices.c.due_date, invoices.c.facility_id, invoices.c.updated_at))}
    for row in data["invoices"]:
        target = targets.get(int(row["id"]))
        now = current.get(target) if target is not None else None
        if now is None:
            continue
        legacy_payments = payments[int(row["id"])]
        expected = lr.invoice_payment(row, legacy_payments, logs[str(row["invoice_no"] or "").strip()])
        if expected is None:
            continue
        paid, owed = expected
        status = lr.invoice_status(paid, lr.money(now.total_amount), now.due_date)
        current_status = getattr(now.status, "name", None) or str(now.status)
        if (lr.money(now.amount_paid), lr.money(now.balance_due), current_status, lr.money(ledger[target])) \
                == (paid, owed, status, paid):
            continue
        if target in app_activity or lr.edited_since_migration(now.updated_at, row):
            report["counts"]["invoices left as they are: paid or changed in the new app"] += 1
            continue
        conn.execute(delete(transactions).where(transactions.c.invoice_id == target,
                                                transactions.c.transaction_type == "payment",
                                                transactions.c.description.in_(mine)))
        for payment in lr.payment_rows(row, legacy_payments, paid):
            conn.execute(insert(transactions).values(
                invoice_id=target, facility_id=now.facility_id, transaction_type="payment", amount=payment["amount"],
                payment_method=payment["method"], reference_number=payment["reference"],
                description=payment["description"], created_at=lr.as_datetime(payment["when"]) or datetime.utcnow()))
        conn.execute(update(invoices).where(invoices.c.id == target).values(
            amount_paid=paid, balance_due=owed, status=status))
        note(report, "invoices set to the legacy payment record",
             f"{now.invoice_number}: {current_status} paid {lr.money(now.amount_paid)} owed {lr.money(now.balance_due)}"
             f"  ->  {status} paid {paid} owed {owed}")


def fix_services(conn, tables, data, report) -> None:
    requests = tables["service_requests"]
    by_service = collections.defaultdict(list)
    for row in data["reports"]:
        by_service[int(row["service_id"])].append(row)
    targets = id_map(conn, "service_request")
    rows = {int(r.id): r for r in conn.execute(select(
        requests.c.id, requests.c.request_number, requests.c.history, requests.c.resolution_description,
        requests.c.updated_at))}
    for legacy_id, target in targets.items():
        sr, reports = rows.get(target), by_service.get(legacy_id) or []
        if sr is None or not reports:
            continue
        if lr.edited_since_migration(sr.updated_at, data["services"].get(legacy_id) or {}):
            report["counts"]["service requests left as they are: changed in the new app"] += 1
            continue
        history = _list(sr.history)
        expected = expected_entries(legacy_id, reports, data)
        values: dict[str, Any] = {}
        migrated = [e for e in history if lr.is_migrated_report_entry(e)]
        if migrated != expected:
            values["history"] = lr.corrected_history(history, expected)
        summary = lr.resolution_summary(reports)
        if (sr.resolution_description or None) != summary and (
                _raw(sr.resolution_description) or sr.resolution_description in (None, "")):
            values["resolution_description"] = summary
        if values:
            conn.execute(update(requests).where(requests.c.id == target).values(**values))
            sessions = sum(1 for e in expected if e["action"] == "technician_clock_out")
            note(report, "service requests set to the legacy service reports",
                 f"{sr.request_number}: {len(migrated)} -> {len(expected)} report entr(ies)"
                 + (f" ({sessions} work session(s))" if sessions else "")
                 + (f"; resolution {sr.resolution_description!r} -> {summary!r}" if "resolution_description" in values else ""))


def fix_inspection_billing(conn, tables, data, report) -> None:
    inspections = tables["inspections"]
    charges = {int(row["inspection_id"]): row for row in data["charges"]}
    targets = id_map(conn, "inspection")
    rows = {int(r.id): r for r in conn.execute(select(inspections.c.id, inspections.c.inspection_number,
                                                       inspections.c.form_data, inspections.c.updated_at))}
    for legacy_id, target in targets.items():
        row, charge = rows.get(target), charges.get(legacy_id)
        if row is None or charge is None:
            continue
        form_data = _dict(row.form_data)
        expected = lr.inspection_billing(charge)
        billing = form_data.get("billing") or {}
        if {key: float(lr.money(billing.get(key))) for key in expected} == expected:
            continue
        if "form_template" in form_data or lr.edited_since_migration(row.updated_at, data["inspections"].get(legacy_id) or {}):
            report["counts"]["inspection billing left as it is: saved in the new app"] += 1
            continue
        conn.execute(update(inspections).where(inspections.c.id == target).values(
            form_data={**form_data, "billing": {**billing, **expected}}))
        note(report, "inspection billing set to the legacy charge",
             f"{row.inspection_number}: {expected} (legacy net {lr.money(charge.get('net_charges'))})")


def print_report(report, applied: bool) -> None:
    print("APPLIED" if applied else "DRY RUN - nothing written")
    for kind in ("invoices set to the legacy payment record", "invoices left as they are: paid or changed in the new app",
                 "service requests set to the legacy service reports", "service requests left as they are: changed in the new app",
                 "inspection billing set to the legacy charge", "inspection billing left as it is: saved in the new app"):
        print(f"{kind}: {report['counts'][kind]}")
        for example in report["examples"].get(kind, [])[:100]:
            print(f"    {example}")
        if report["counts"][kind] > 100:
            print(f"    ... and {report['counts'][kind] - 100} more")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("--apply", action="store_true", help="write the corrections (default: dry run)")
    parser.add_argument("--database-url", default=os.environ.get("DATABASE_URL"))
    parser.add_argument("--legacy-url", default=os.environ.get("LEGACY_DATABASE_URL"))
    args = parser.parse_args(argv)
    if not args.database_url or not args.legacy_url:
        parser.error("set DATABASE_URL and LEGACY_DATABASE_URL (or pass --database-url / --legacy-url)")
    data = legacy_data(create_engine(args.legacy_url))
    report = new_report()
    with create_engine(args.database_url).connect() as conn:
        transaction = conn.begin()
        meta = MetaData()
        meta.reflect(conn, only=["invoices", "invoice_transactions", "service_requests", "inspections"], resolve_fks=False)
        try:
            fix_invoices(conn, meta.tables, data, report)
            fix_services(conn, meta.tables, data, report)
            fix_inspection_billing(conn, meta.tables, data, report)
        except Exception:
            transaction.rollback()
            raise
        if args.apply:
            transaction.commit()
        else:
            transaction.rollback()
    print_report(report, args.apply)
    return 0


if __name__ == "__main__":
    sys.exit(main())
