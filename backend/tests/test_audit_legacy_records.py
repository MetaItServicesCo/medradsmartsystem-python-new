"""The read-only audit of migrated records against the legacy database.

Builds a small legacy database and a small production one (with the
migration's id map) holding every case the audit must tell apart, runs the
audit, and checks what it reports and that it writes nothing:

* invoices: paid in the legacy system but shown unpaid; shown paid but still
  owed; part-paid; already right; paid in the new app since (never touched);
  a zero-total invoice (left alone);
* service requests: several legacy work sessions squashed into one, with the
  legacy list text (["Daniel"], [null]) left in; a technician kept as list
  text; one already right;
* inspection billing: legacy charges stored under keys the report does not
  add up; one saved in the app since; one already right.

    DATABASE_URL=sqlite:// python backend/tests/test_audit_legacy_records.py
"""
from __future__ import annotations

import contextlib
import json
import io
import os
import pathlib
import sys
import tempfile
from datetime import date, datetime

os.environ.setdefault("DATABASE_URL", "sqlite://")
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))

import sqlalchemy as sa  # noqa: E402

import app.models  # noqa: E402,F401
from decimal import Decimal as D  # noqa: E402
from sqlalchemy.orm import Session  # noqa: E402
from app.db.base import Base  # noqa: E402
from app.models.inspection import Inspection  # noqa: E402
from app.models.invoice import Invoice, InvoiceStatus, InvoiceTransaction, InvoiceType  # noqa: E402
from app.models.service_request import Priority, ServiceRequest, ServiceRequestStatus  # noqa: E402
from scripts.legacy_migration import audit_legacy_records as audit  # noqa: E402
from scripts.legacy_migration import fix_legacy_records as fix  # noqa: E402
from scripts.legacy_migration import legacy_records as lr  # noqa: E402

failures: list[str] = []


def ok(label: str, condition: bool, detail: str = "") -> None:
    print("{}  {}{}".format("PASS" if condition else "FAIL", label, "  " + detail if detail else ""))
    if not condition:
        failures.append(label)


folder = pathlib.Path(tempfile.mkdtemp())
legacy_url = "sqlite:///{}".format(folder / "legacy.db")
prod_url = "sqlite:///{}".format(folder / "prod.db")
map_path = folder / "map.db"

# --- the legacy database ---------------------------------------------------------------------------
legacy = sa.create_engine(legacy_url)
with legacy.begin() as c:
    c.exec_driver_sql("CREATE TABLE invoices (id INT, invoice_no TEXT, invoice_order TEXT, net_amount TEXT, paid_amount TEXT,"
                      " confirm_paid_amount TEXT, balance TEXT, refund TEXT, status INT, paid_at TEXT, due_date TEXT,"
                      " created_at TEXT, updated_at TEXT)")
    c.exec_driver_sql("CREATE TABLE inspections (id INT, created_at TEXT, updated_at TEXT)")
    for inspection_id in (201, 202, 203, 204):
        c.execute(sa.text("INSERT INTO inspections VALUES (:i, '2024-01-01 09:00:00', '2024-01-02 09:00:00')"),
                  dict(i=inspection_id))
    c.exec_driver_sql("CREATE TABLE partial_payments (id INT, invoice_id INT, paid_amount TEXT, paid_at TEXT, created_at TEXT,"
                      " payment_type TEXT, charge_id TEXT)")
    c.exec_driver_sql("CREATE TABLE services (id INT, user_name TEXT, created_at TEXT, updated_at TEXT)")
    for service_id in (101, 102, 103, 104):
        c.execute(sa.text("INSERT INTO services VALUES (:i, 'Front Desk', '2023-01-01 09:00:00', '2023-03-01 09:00:00')"),
                  dict(i=service_id))
    c.exec_driver_sql("CREATE TABLE invoice_logs (invoice_no TEXT, action TEXT)")
    c.exec_driver_sql("CREATE TABLE service_reports (id INT, service_id INT, technician TEXT, date TEXT, hours TEXT,"
                      " fault TEXT, action TEXT, worked_hours TEXT, file TEXT, po TEXT, trips TEXT, trip_price TEXT,"
                      " milage_amount TEXT, fixed_amount TEXT, created_at TEXT, updated_at TEXT)")
    c.exec_driver_sql("CREATE TABLE service_activities (id INT, service_id INT)")
    c.exec_driver_sql("CREATE TABLE inspection_charges (id INT, inspection_id INT, parts TEXT, discount TEXT, tax TEXT,"
                      " labour TEXT, service TEXT, travel TEXT, other TEXT, net_charges TEXT)")
    invoices = [
        # id, no, net, paid_amount, confirm, balance, refund, status, paid_at
        (1, "2021-000388", "790", "0", "790", "0", "0", 1, "2022-01-25 22:05:23"),   # paid, shown unpaid
        (2, "2021-000501", "230", "230", "0", "230", "0", 2, None),                  # owed, shown paid
        (3, "2021-000600", "100", "0", "100", "0", "0", 1, "2022-02-01 10:00:00"),   # already right
        (4, "2021-000700", "300", "300", "0", "300", "0", 2, None),                  # paid in the new app since
        (5, "2021-000800", "0", "0", "0", "0", "0", 1, "2022-03-01 10:00:00"),       # zero total: left alone
        (6, "2024-001343", "4975", "0", "175", "4800", "0", 1, "2024-05-01 10:00:00"),  # part-paid
        (7, "2021-000900", "500", "0", "500", "0", "0", 1, "2022-04-01 10:00:00"),   # paid, but edited in the new app
    ]
    for i, no, net, pa, conf, bal, ref, status, paid_at in invoices:
        c.execute(sa.text("INSERT INTO invoices VALUES (:i, :no, :no, :net, :pa, :conf, :bal, :ref, :st, :pat, '2022-01-01',"
                          " '2021-12-01 09:00:00', '2022-06-01 09:00:00')"),
                  dict(i=i, no=no, net=net, pa=pa, conf=conf, bal=bal, ref=ref, st=status, pat=paid_at))
        c.execute(sa.text("INSERT INTO invoice_logs VALUES (:no, :a)"), dict(no=no, a="paid" if status == 1 else "viewed"))
    c.execute(sa.text("INSERT INTO service_reports VALUES (1, 101, :t, :d, :h, :f, :a, '3', NULL, NULL, '0', '0', NULL,"
                      " NULL, '2023-02-06 10:00:00', '2023-02-09 10:00:00')"), dict(
        t='["Daniel","Daniel"]', d='["2023-02-06","2023-02-09"]', h='["1","2"]',
        f='["Pre-amp error",null]', a='["Ordered supply","Replaced supply"]'))
    c.execute(sa.text("INSERT INTO service_reports VALUES (2, 102, :t, :d, '[null]', '[null]', '[null]', '0', NULL, NULL,"
                      " '0', '0', NULL, NULL, '2026-10-23 13:55:00', '2026-10-23 13:57:00')"),
              dict(t='["Omar"]', d='["2026-10-23"]'))
    c.execute(sa.text("INSERT INTO service_activities VALUES (1, 102)"))
    c.execute(sa.text("INSERT INTO service_reports VALUES (4, 104, '[\"Ann\"]', '[\"2023-02-01\"]', '[\"1\"]', '[null]',"
                      " '[\"Done\"]', '1', NULL, NULL, '0', '0', NULL, NULL, '2023-02-01 09:00:00', '2023-02-01 10:00:00')"))
    c.execute(sa.text("INSERT INTO service_reports VALUES (3, 103, :t, :d, '[\"2\"]', '[\"Noise\"]', '[\"Tightened\"]', '2',"
                      " NULL, NULL, '0', '0', NULL, NULL, '2024-01-01 09:00:00', '2024-01-01 11:00:00')"),
              dict(t='["Sam"]', d='["2024-01-01"]'))
    for i, insp in ((1, 201), (2, 202), (3, 203), (4, 204)):
        c.execute(sa.text("INSERT INTO inspection_charges VALUES (:i, :insp, '10', '1', '2', '20', '30', '0', '5', '66')"),
                  dict(i=i, insp=insp))

# --- production, as the migration left it --------------------------------------------------------
prod = sa.create_engine(prod_url)


@sa.event.listens_for(prod, "connect")
def _attach(dbapi_connection, _record):
    dbapi_connection.execute("ATTACH DATABASE '{}' AS legacy_migration".format(map_path.as_posix()))


Base.metadata.create_all(prod, tables=[Base.metadata.tables[n] for n in
                                       ("invoices", "invoice_transactions", "service_requests", "inspections")])
with prod.begin() as c:
    c.exec_driver_sql("CREATE TABLE legacy_migration.id_map (source_system TEXT, entity TEXT, legacy_id INT, target_id INT)")
db = Session(prod)


def mapped(entity, legacy_id, row):
    db.add(row)
    db.flush()
    db.execute(sa.text("INSERT INTO legacy_migration.id_map VALUES ('admin_medrad', :e, :l, :t)"),
               dict(e=entity, l=legacy_id, t=row.id))
    return row


production_invoices = {
    # legacy id: (status, paid, balance, total)
    1: (InvoiceStatus.OVERDUE, "0", "790", "790"),
    2: (InvoiceStatus.PAID, "230", "0", "230"),
    3: (InvoiceStatus.PAID, "100", "0", "100"),
    4: (InvoiceStatus.PAID, "300", "0", "300"),
    5: (InvoiceStatus.PAID, "0", "0", "0"),
    6: (InvoiceStatus.OVERDUE, "0", "4975", "4975"),
    7: (InvoiceStatus.OVERDUE, "0", "500", "500"),
}
MIGRATED_AT = datetime(2022, 6, 1, 9, 0, 0)  # the legacy updated_at the migration copied
EDITED_AT = datetime(2026, 11, 2, 15, 30, 0)  # a save in the new app
for legacy_id, (status, paid, balance, total) in production_invoices.items():
    invoice = mapped("invoice", legacy_id, Invoice(
        invoice_number=f"INV-{legacy_id}", invoice_type=InvoiceType.SERVICE, customer_name="Clinic",
        customer_email="c@x.com", subtotal=D(total), total_amount=D(total), amount_paid=D(paid), balance_due=D(balance),
        status=status, issue_date=date(2022, 1, 1), due_date=date(2022, 1, 1),
        updated_at=EDITED_AT if legacy_id == 7 else MIGRATED_AT))
    if D(paid) > 0:
        db.add(InvoiceTransaction(invoice_id=invoice.id, transaction_type="payment", amount=D(paid),
                                  description="Imported legacy payment balance"))
    if legacy_id == 4:
        db.add(InvoiceTransaction(invoice_id=invoice.id, transaction_type="payment", amount=D("300"),
                                  description="Square card payment"))


def service(legacy_id, number, history, resolution, edited=False):
    mapped("service_request", legacy_id, ServiceRequest(
        request_number=number, facility_id=1, equipment_id=1, requester_id=1, problem_description="x",
        priority=Priority.MEDIUM, status=ServiceRequestStatus.COMPLETED, history=history,
        resolution_description=resolution, updated_at=EDITED_AT if edited else datetime(2023, 3, 1, 9, 0, 0)))


service(101, "2023-000101", [{"action": "technician_clock_out", "user": '["Daniel","Daniel"]', "changes": {
    "session_id": "legacy-report-1", "duration_hours": 3.0, "diagnosis": '["Pre-amp error",null]',
    "work_done": '["Ordered supply","Replaced supply"]', "notes": '["2023-02-06","2023-02-09"]'}},
    {"action": "status_change", "user": "Admin", "changes": {"to": "completed"}}],
    '["Ordered supply","Replaced supply"]')
service(102, "2026-002064", [{"action": "legacy_service_report", "user": '["Omar"]',
                               "changes": {"legacy_report_id": 2, "diagnosis": "[null]"}}], "[null]")
service(103, "2024-000103", [{"action": "technician_clock_out", "user": "Sam", "timestamp": "2024-01-01 11:00:00",
    "changes": {"session_id": "legacy-report-3", "work_date": "2024-01-01", "duration_hours": 2.0, "diagnosis": "Noise",
                "work_done": "Tightened", "legacy_report_file": None, "po": None, "trips": "0", "trip_price": "0"}}],
    "Tightened")


def inspection(legacy_id, number, form_data, edited=False):
    mapped("inspection", legacy_id, Inspection(inspection_number=number, facility_id=1, form_template_id=1,
                                               scheduled_date=datetime(2024, 1, 1), form_data=form_data,
                                               updated_at=EDITED_AT if edited else datetime(2024, 1, 2, 9, 0, 0)))


legacy_keys = {"parts": 10, "discount": 1, "tax": 2, "labor": 20, "service": 30, "travel": 0, "other": 5, "net_charges": 66}
inspection(201, "INSP-2026-000923-1", {"source": "admin_medrad", "billing": legacy_keys})
inspection(202, "INSP-2026-000923-2", {"source": "admin_medrad", "billing": legacy_keys, "form_template": {"name": "x"}})
inspection(203, "INSP-2026-000923-3", {"source": "admin_medrad", "billing": {"parts": 10, "inspection_charges": 50, "others": 6}})
inspection(204, "INSP-2026-000923-4", {"source": "admin_medrad", "billing": legacy_keys}, edited=True)
service(104, "2023-000104", [{"action": "technician_clock_out", "user": '["Ann"]', "changes": {
    "session_id": "legacy-report-4", "duration_hours": 1.0, "diagnosis": "[null]", "work_done": '["Done"]'}}],
    '["Done"]', edited=True)
db.commit()
db.close()


def snapshot():
    with prod.connect() as c:
        return [tuple(r) for r in c.execute(sa.text("SELECT * FROM invoices"))], \
               [tuple(r) for r in c.execute(sa.text("SELECT id, history, resolution_description FROM service_requests"))], \
               [tuple(r) for r in c.execute(sa.text("SELECT id, form_data FROM inspections"))]


# The audit opens its own connections; production's needs the attached id map.
audit.create_engine = lambda url: prod if url == prod_url else sa.create_engine(url)
before = snapshot()
out = io.StringIO()
with contextlib.redirect_stdout(out):
    code = audit.main(["--database-url", prod_url, "--legacy-url", legacy_url])
text_out = out.getvalue()
print(text_out)

print("The audit")
ok("writes nothing", snapshot() == before)
ok("exits 1 when anything differs", code == 1)
ok("an invoice paid in the legacy system but shown unpaid is found, with the right figures",
   "INV-1: OVERDUE paid 0.00 owed 790.00  ->  PAID paid 790.00 owed 0.00" in text_out)
ok("a part-paid invoice gets its exact remaining balance",
   "INV-6: OVERDUE paid 0.00 owed 4975.00  ->  PARTIALLY_PAID paid 175.00 owed 4800.00" in text_out)
ok("an invoice shown paid but still owed in the legacy system is found",
   "INV-2: PAID paid 230.00 owed 0.00  ->  OVERDUE paid 0.00 owed 230.00" in text_out)
ok("an invoice paid in the new app since is reported but not proposed for change",
   "not touched" in text_out and "INV-4: PAID paid 300" in text_out and "INV-4: PAID paid 300.00 owed" not in text_out)
ok("an invoice that already matches is counted as matching", "invoices matching the legacy record: 1" in text_out)
ok("a zero-total invoice is left as it is", "invoices left as they are (credit note, zero total or refund): 1" in text_out)
ok("squashed work sessions with legacy list text are found",
   "2023-000101: 1 report entr(ies) shown, legacy recorded 2; legacy list text left in" in text_out)
ok("a [null] resolution summary is found and read correctly",
   "2026-002064" in text_out and "resolution summary '[null]' -> None" in text_out)
ok("  as is a technician kept as list text", "2026-002064: legacy list text left in" in text_out)
ok("a service request already right counts as matching", "service requests matching the legacy record: 1" in text_out)
ok("billing that does not add up is found, with the legacy split",
   "INSP-2026-000923-1" in text_out and "'inspection_charges': 50.0, 'others': 6.0" in text_out)
ok("billing saved in the app since is not proposed for change",
   "inspection billing saved in the app since (not touched): 2" in text_out and "INSP-2026-000923-2" not in text_out)
ok("billing that already adds up counts as matching", "inspection billing matching the legacy charge: 1" in text_out)

print()
print("The correction")
fix.create_engine = audit.create_engine


def run(module, *extra):
    buffer = io.StringIO()
    with contextlib.redirect_stdout(buffer):
        result = module.main(["--database-url", prod_url, "--legacy-url", legacy_url, *extra])
    return result, buffer.getvalue()


code, dry = run(fix)
ok("a dry run writes nothing", snapshot() == before, dry[:200])
ok("  and lists what it would set", "invoices set to the legacy payment record: 3" in dry
   and "service requests set to the legacy service reports: 2" in dry and "inspection billing set to the legacy charge: 1" in dry,
   dry)
code, applied = run(fix, "--apply")
code, after_audit = run(audit)
ok("after --apply the audit finds every record matching the legacy system", code == 0, after_audit)
with prod.connect() as c:
    inv = {r.invoice_number: r for r in c.execute(sa.text("SELECT * FROM invoices"))}
    ledger = c.execute(sa.text("SELECT invoice_id, amount, description FROM invoice_transactions ORDER BY id")).fetchall()
    services_after = {r.request_number: r for r in c.execute(sa.text("SELECT * FROM service_requests"))}
    billing_after = {r.inspection_number: r for r in c.execute(sa.text("SELECT * FROM inspections"))}
ok("the paid invoice is paid, with its legacy payment on the ledger",
   inv["INV-1"].status == "PAID" and D(str(inv["INV-1"].amount_paid)) == D("790")
   and any(row.invoice_id == inv["INV-1"].id and D(str(row.amount)) == D("790") for row in ledger))
ok("the still-owed invoice is owed, and the migration's wrong payment row is gone",
   inv["INV-2"].status == "OVERDUE" and D(str(inv["INV-2"].balance_due)) == D("230")
   and not any(row.invoice_id == inv["INV-2"].id for row in ledger))
ok("the part-paid invoice owes exactly the legacy balance",
   inv["INV-6"].status == "PARTIALLY_PAID" and D(str(inv["INV-6"].balance_due)) == D("4800"))
ok("the invoice paid in the new app is untouched, ledger and all",
   inv["INV-4"].status == "PAID" and D(str(inv["INV-4"].amount_paid)) == D("300")
   and sum(1 for row in ledger if row.invoice_id == inv["INV-4"].id) == 2)
history_101 = json.loads(services_after["2023-000101"].history)
sessions_101 = [e for e in history_101 if e["action"] == "technician_clock_out"]
ok("each legacy work session is its own session, with its own hours and details",
   [(e["user"], e["changes"]["work_date"], e["changes"]["duration_hours"], e["changes"]["diagnosis"],
     e["changes"]["work_done"]) for e in sessions_101]
   == [("Daniel", "2023-02-06", 1.0, "Pre-amp error", "Ordered supply"),
       ("Daniel", "2023-02-09", 2.0, None, "Replaced supply")], str(sessions_101))
ok("  and the entry the app added is kept as it was",
   {"action": "status_change", "user": "Admin", "changes": {"to": "completed"}} in history_101)
ok("the resolution summary reads the legacy work done, not list text",
   services_after["2023-000101"].resolution_description == "Replaced supply"
   and services_after["2026-002064"].resolution_description is None)
entry_102 = json.loads(services_after["2026-002064"].history)[0]
ok("no [null] or list text is left on a service report entry",
   entry_102["user"] == "Omar" and entry_102["changes"]["diagnosis"] is None, str(entry_102))
ok("inspection billing adds up to the legacy charge, keeping the legacy breakdown",
   json.loads(billing_after["INSP-2026-000923-1"].form_data)["billing"] | {} ==
   {"parts": 10.0, "discount": 1, "tax": 2, "labor": 20, "service": 30, "travel": 0, "other": 5, "net_charges": 66,
    "inspection_charges": 50.0, "others": 6.0})
ok("billing saved in the app since is untouched",
   json.loads(billing_after["INSP-2026-000923-2"].form_data)["billing"] == legacy_keys)
ok("an invoice edited in the new app since the migration is left exactly as it is",
   inv["INV-7"].status == "OVERDUE" and D(str(inv["INV-7"].amount_paid)) == D("0"))
ok("a service request changed in the new app is left exactly as it is",
   json.loads(services_after["2023-000104"].history)[0]["user"] == '["Ann"]'
   and services_after["2023-000104"].resolution_description == '["Done"]')
ok("an inspection saved in the new app keeps its billing exactly",
   json.loads(billing_after["INSP-2026-000923-4"].form_data)["billing"] == legacy_keys)
ok("the dry run counts what it leaves alone because it was changed in the app",
   "invoices left as they are: paid or changed in the new app: 2" in dry
   and "service requests left as they are: changed in the new app: 1" in dry
   and "inspection billing left as it is: saved in the new app: 2" in dry, dry)
settled = snapshot()
code, again = run(fix, "--apply")
ok("a second run changes nothing", snapshot() == settled, again)

print()
print("The rules")
ok("legacy list columns become one session each, null hours staying unrecorded",
   lr.report_sessions({"technician": '["Omar"]', "date": '["2026-10-23"]', "hours": "[null]", "fault": "[null]",
                       "action": "[null]"}) == [{"technician": "Omar", "work_date": "2026-10-23", "duration_hours": None,
                                                 "diagnosis": None, "work_done": None}])
ok("a one-session report that kept its hours only in the total gets them on that session",
   lr.report_sessions({"technician": '["Sam"]', "date": '["2024-01-01"]', "hours": "[null]", "fault": "[null]",
                       "action": '["Fixed"]', "worked_hours": "2.5"})[0]["duration_hours"] == 2.5)
ok("  and a report that recorded nothing at all has no work session",
   lr.report_sessions({"technician": None, "date": None, "hours": None, "fault": None, "action": None,
                       "worked_hours": "0"}) == [])
ok("Parts + Inspection Charges + Others always equals the legacy net charge",
   sum(lr.inspection_billing({"parts": "10", "discount": "1", "tax": "2", "labour": "20", "service": "30", "travel": "0",
                              "other": "5"}).values()) == 66)

print()
if failures:
    print("{} check(s) failed".format(len(failures)))
    sys.exit(1)
print("All legacy record audit checks passed")
