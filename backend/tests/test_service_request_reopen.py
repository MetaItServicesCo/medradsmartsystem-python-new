"""Reopening a completed service request, and the invoice following its work.

The case behind it: request 2026-002057 was invoiced at $120/hr and a $120
Service Fee because its asset was on another tier that night; the asset was
moved to T-1 twelve minutes later, nobody could see that it had been, and
the request -- completed -- could not be corrected. "Delete this invoice"
only set a flag, leaving the invoice live.

* An Admin or Super Admin reopens a completed request, with a reason. Never
  once its invoice is paid or partly paid, or while a payment is on its way.
  The invoice leaves approval (so it cannot be paid) and keeps its number.
* While reopened, the work order is open again; every other invoiced request
  stays locked, as before.
* Closed again, the request is priced at its current tier, and generating the
  invoice updates that same invoice -- number unchanged -- with the change in
  its ledger. Any other request's invoice is returned unchanged, as before.
* "Delete this invoice" cancels the invoice for real, never once paid.
* Moving an asset to another tier, and editing a tier's rates, are logged
  with old and new values, and re-price open requests only.

    DATABASE_URL=sqlite:// venv312/Scripts/python.exe tests/test_service_request_reopen.py
"""
from __future__ import annotations

import json
import logging
import os
import pathlib
import sys
from datetime import datetime
from decimal import Decimal as D

os.environ.setdefault("DATABASE_URL", "sqlite://")
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))
logging.disable(logging.CRITICAL)

from fastapi.testclient import TestClient  # noqa: E402
from sqlalchemy import create_engine, event  # noqa: E402
from sqlalchemy.orm import sessionmaker  # noqa: E402
from sqlalchemy.pool import StaticPool  # noqa: E402

import app.models  # noqa: E402,F401
from app.core.deps import get_current_user  # noqa: E402
from app.db.base import Base, get_db  # noqa: E402
from app.main import app  # noqa: E402
from app.models.audit_log import AuditLog  # noqa: E402
from app.models.equipment import Equipment  # noqa: E402
from app.models.facility import Facility  # noqa: E402
from app.models.invoice import Invoice, InvoiceStatus, InvoiceTransaction, PaymentProof  # noqa: E402
from app.models.modality import Modality, ModalityCategory  # noqa: E402
from app.models.service_request import (  # noqa: E402
    Priority, QuotationAuthorization, ServiceRequest, ServiceRequestQuotation, ServiceRequestStatus,
)
from app.models.tier import Tier  # noqa: E402
from app.models.user import User, UserRole, UserType  # noqa: E402
from app.utils import read_cache  # noqa: E402

read_cache.settings.READ_CACHE_ENABLED = False
failures: list[str] = []


def ok(label: str, condition: bool, detail: object = "") -> None:
    print("{}  {}{}".format("PASS" if condition else "FAIL", label, f"  {detail}" if not condition and detail != "" else ""))
    if not condition:
        failures.append(label)


# REOPEN_TEST_DB runs the same checks on a throwaway Postgres, as production uses.
if os.environ.get("REOPEN_TEST_DB"):
    engine = create_engine(os.environ["REOPEN_TEST_DB"])
else:
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)

    @event.listens_for(engine, "connect")
    def _no_driver_transactions(dbapi_connection, _record):
        dbapi_connection.isolation_level = None

    @event.listens_for(engine, "begin")
    def _begin(connection):
        connection.exec_driver_sql("BEGIN")


def _buildable(table) -> bool:
    from sqlalchemy.schema import CreateTable
    try:
        CreateTable(table).compile(dialect=engine.dialect)
        return True
    except Exception:
        return False


Base.metadata.create_all(engine, tables=[t for t in Base.metadata.sorted_tables if _buildable(t)])
Session = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)

seed = Session()
clinic = Facility(name="Purposeful Healing DPC", contact_person="C", phone="1", email="c@x.test", address="1 St",
                  city="Dallas", state="TX", zip_code="75206", country="US")
seed.add(clinic)
seed.flush()


def person(username, role):
    user = User(username=username, email=f"{username}@x.test", full_name=username.title(), hashed_password="x",
                user_type=UserType.EMPLOYEE, role=role, is_active=True)
    seed.add(user)
    seed.flush()
    return user


boss = person("boss", UserRole.SUPERADMIN)
admin = person("admin", UserRole.ADMIN)
tech = person("sam", UserRole.TECHNICIAN)
old_tier = Tier(tier_code="T-OLD", name="Old", labor_rate_per_hour=D("120"), service_call_fee=D("120"),
                preventive_maintenance_fee=D("0"), mileage_rate=D("1"))
t1 = Tier(tier_code="T-1", name="T-1", labor_rate_per_hour=D("130"), service_call_fee=D("150"),
          preventive_maintenance_fee=D("50"), mileage_rate=D("2.5"))
seed.add_all([old_tier, t1])
seed.flush()
modality = Modality(name="Table", category=list(ModalityCategory)[0])
seed.add(modality)
seed.flush()


def asset(tag, tier):
    item = Equipment(asset_tag=tag, make="EarthLite", model="Elloha Vista", serial_number=f"S-{tag}",
                     modality_id=modality.id, facility_id=clinic.id, tier_id=tier.id)
    seed.add(item)
    seed.flush()
    return item


bed = asset("ph-001", old_tier)
other_bed = asset("ph-002", t1)
spare_bed = asset("ph-003", t1)


def request(number, equipment, status=ServiceRequestStatus.COMPLETED, hours="2.50", cost="300"):
    sr = ServiceRequest(request_number=number, facility_id=clinic.id, equipment_id=equipment.id, requester_id=boss.id,
                        assigned_technician_id=tech.id, problem_description="The examination bed is not working",
                        priority=Priority.MEDIUM, status=status, time_spent_hours=D(hours), total_cost=D(cost),
                        completed_at=datetime(2026, 11, 16, 19, 2) if status == ServiceRequestStatus.COMPLETED else None,
                        history=[])
    seed.add(sr)
    seed.flush()
    return sr.id


MAIN = request("2026-002057", bed)                                   # invoiced at the old tier, then moved
PAID = request("2026-002058", other_bed, cost="325")
PARTLY = request("2026-002059", other_bed, cost="325")
REVIEW = request("2026-002060", other_bed, cost="325")
UNTOUCHED = request("2026-002061", other_bed, cost="325")              # invoiced; never reopened
CANCEL = request("2026-002062", spare_bed, cost="325")
OPEN_ON_BED = request("2026-002063", bed, status=ServiceRequestStatus.IN_PROGRESS, hours="2.00", cost="240")
OPEN_ON_T1 = request("2026-002064", spare_bed, status=ServiceRequestStatus.IN_PROGRESS, hours="1.00", cost="130")
NOT_DONE = request("2026-002065", spare_bed, status=ServiceRequestStatus.IN_PROGRESS, hours="1.00", cost="130")
QUOTED = request("2026-002066", spare_bed, cost="325")              # has an authorized quotation
_quote = ServiceRequestQuotation(service_request_id=QUOTED, created_by_id=boss.id, quotation_number="2026-002066-Q01",
                                 amount=D("200"), description="Control box", status="authorized")
seed.add(_quote)
seed.flush()
seed.add(QuotationAuthorization(quotation_id=_quote.id, status="authorized", authorized_amount=D("200")))
seed.flush()
QUOTE = _quote.id
IDS = {"boss": boss.id, "admin": admin.id, "tech": tech.id}
BED, T1, OLD = bed.id, t1.id, old_tier.id
seed.commit()
seed.close()

current = {"who": "boss"}


def db_override():
    db = Session()
    try:
        yield db
    finally:
        db.close()


def user_override():
    db = Session()
    try:
        user = db.get(User, IDS[current["who"]])
        db.expunge(user)
        return user
    finally:
        db.close()


app.dependency_overrides[get_db] = db_override
app.dependency_overrides[get_current_user] = user_override
client = TestClient(app, raise_server_exceptions=False, base_url="http://localhost")
API = "/api/v1"


def as_user(who):
    current["who"] = who
    return client


def generate(request_id, **body):
    return as_user("boss").post(f"{API}/service-requests/{request_id}/generate-invoice", json=body)


def sr_row(request_id) -> ServiceRequest:
    db = Session()
    try:
        return db.get(ServiceRequest, request_id)
    finally:
        db.close()


def invoice_row(invoice_id) -> Invoice:
    db = Session()
    try:
        return db.get(Invoice, invoice_id)
    finally:
        db.close()


def ledger(invoice_id) -> list[str]:
    db = Session()
    try:
        return [t.transaction_type for t in db.query(InvoiceTransaction)
                .filter(InvoiceTransaction.invoice_id == invoice_id).order_by(InvoiceTransaction.id)]
    finally:
        db.close()


def money(value) -> D:
    return D(str(value)).quantize(D("0.01"))


print("\nThe night it happened: invoiced at the old tier, then the asset moved to T-1")
first = generate(MAIN).json()
INVOICE_ID, NUMBER = first["id"], first["invoice_number"]
ok("invoiced at the old tier: $120 fee + $300 labour = $420", money(first["total_amount"]) == D("420.00"), first.get("total_amount"))
moved = as_user("boss").put(f"{API}/equipment/{BED}", json={"tier_id": T1})
ok("the asset is moved to T-1", moved.status_code == 200 and moved.json().get("tier_id") == T1, moved.text[:200])
db = Session()
log = db.query(AuditLog).filter(AuditLog.table_name == "equipment", AuditLog.record_id == BED).order_by(AuditLog.id.desc()).first()
db.close()
change = json.loads(log.changes_json) if log else {}
ok("  and it is on record: who, from which tier to which, with the rates",
   log is not None and log.changed_by_username == "boss" and change["tier"]["from"]["tier_code"] == "T-OLD"
   and change["tier"]["to"]["tier_code"] == "T-1" and change["tier"]["from"]["labor_rate_per_hour"] == "120.00"
   and change["tier"]["to"]["service_call_fee"] == "150.00", change)
ok("  its open request is re-priced at T-1 ($240 -> 2 hrs x $130 = $260), and the screen is told",
   money(sr_row(OPEN_ON_BED).total_cost) == D("260.00") and moved.headers.get("X-Repriced-Open-Requests") == "1",
   (sr_row(OPEN_ON_BED).total_cost, moved.headers.get("X-Repriced-Open-Requests")))
ok("  its completed request keeps its figure: completed work is changed only by reopening",
   money(sr_row(MAIN).total_cost) == D("300.00"))
again = as_user("boss").put(f"{API}/equipment/{BED}", json={"serial_number": "S158283"})
ok("an edit that does not change the tier logs nothing and re-prices nothing",
   again.status_code == 200 and "X-Repriced-Open-Requests" not in again.headers)

print("\nThe old \"Delete this invoice\" flag, as it was left")
db = Session()
row = db.get(ServiceRequest, MAIN)
row.invoice_deleted = True                    # set as the old button did: the invoice stayed live
db.commit()
db.close()

print("\nWho may reopen, and when")
ok("a technician may not reopen", as_user("tech").post(f"{API}/service-requests/{MAIN}/reopen", json={"reason": "tier corrected"}).status_code == 403)
ok("a reason is required", as_user("boss").post(f"{API}/service-requests/{MAIN}/reopen", json={"reason": ""}).status_code == 422)
ok("a request that is not completed cannot be reopened",
   as_user("boss").post(f"{API}/service-requests/{NOT_DONE}/reopen", json={"reason": "why"}).status_code == 409)
approved = as_user("boss").patch(f"{API}/service-requests/{MAIN}", json={"billing_status": "approved"})
ok("(the invoice is approved for billing first)", approved.status_code == 200 and invoice_row(INVOICE_ID).billing_approval_status == "approved")

for label, number_id, setup in (
    ("paid", PAID, lambda inv: setattr(inv, "amount_paid", inv.total_amount)),
    ("partly paid", PARTLY, lambda inv: setattr(inv, "amount_paid", D("50"))),
):
    made = generate(number_id).json()
    db = Session()
    inv = db.get(Invoice, made["id"])
    setup(inv)
    if label == "paid":
        inv.status = InvoiceStatus.PAID
    db.commit()
    db.close()
    refused = as_user("admin").post(f"{API}/service-requests/{number_id}/reopen", json={"reason": "check"})
    ok(f"a request whose invoice is {label} is never reopened, and says why",
       refused.status_code == 409 and "paid or partly paid" in refused.json().get("detail", ""), refused.text[:200])
    ok(f"  nor its {label} invoice cancelled",
       as_user("boss").patch(f"{API}/service-requests/{number_id}", json={"invoice_deleted": True}).status_code == 409)
made = generate(REVIEW).json()
db = Session()
db.add(PaymentProof(invoice_id=made["id"], submitted_by_id=IDS["boss"], claimed_amount=D("100"),
                    payment_method="ach", status="pending_verification"))
db.commit()
db.close()
refused = as_user("boss").post(f"{API}/service-requests/{REVIEW}/reopen", json={"reason": "check"})
ok("nor while a payment waits for review", refused.status_code == 409 and "waiting for review" in refused.json().get("detail", "").lower()
   or "in progress" in refused.json().get("detail", "").lower(), refused.text[:200])

print("\nReopening 2026-002057")
reopened = as_user("admin").post(f"{API}/service-requests/{MAIN}/reopen", json={"reason": "Equipment tier corrected to T-1"})
body = reopened.json()
ok("an Admin reopens it: In Progress, completed cleared", reopened.status_code == 200 and body["status"] == "in_progress"
   and body["completed_at"] is None, reopened.text[:300])
ok("  marked for its invoice to be updated; the stale 'deleted' flag cleared",
   body["invoice_needs_revision"] is True and body["invoice_deleted"] is False)
inv = invoice_row(INVOICE_ID)
ok("  the invoice keeps its number and amount for now, and leaves approval, so it cannot be paid",
   inv.invoice_number == NUMBER and money(inv.total_amount) == D("420.00") and inv.billing_approval_status == "pending"
   and inv.status != InvoiceStatus.CANCELLED, (inv.billing_approval_status, inv.status))
ok("  its ledger says why", "revision_started" in ledger(INVOICE_ID) and "billing_approval_invalidated" in ledger(INVOICE_ID), ledger(INVOICE_ID))
entry = (sr_row(MAIN).history or [])[-1]
ok("  the request's history has who and the reason", entry["action"] == "request_reopened"
   and entry["changes"]["reason"] == "Equipment tier corrected to T-1", entry)
ok("  billing approval is back to pending on the request", sr_row(MAIN).billing_status == "pending")

print("\nWhile reopened, its work order is open again; others stay locked")
fixed = as_user("boss").post(f"{API}/service-requests/{MAIN}/hours-corrections", json={"total_hours": "2.75", "reason": "checked"})
back = as_user("boss").post(f"{API}/service-requests/{MAIN}/hours-corrections", json={"total_hours": "2.50", "reason": "rechecked"})
ok("hours can be corrected on the reopened request", fixed.status_code == 200 and back.status_code == 200, fixed.text[:200])
added = as_user("boss").post(f"{API}/service-requests/{MAIN}/work-order-additions", json={"notes": "Control box replaced"})
ok("  and the work order added to", added.status_code == 200, added.text[:200])
generate(UNTOUCHED)
locked = as_user("boss").post(f"{API}/service-requests/{UNTOUCHED}/hours-corrections", json={"total_hours": "3", "reason": "checked"})
ok("an invoiced request that was not reopened stays locked, as before", locked.status_code == 409, locked.status_code)
ok("generating while reopened is refused: it must be completed first", generate(MAIN).status_code == 400)

print("\nClosed again, and its invoice updated -- same number")
closed = as_user("boss").patch(f"{API}/service-requests/{MAIN}", json={"status": "completed"})
ok("closed again: Total Cost at T-1 now, 2.5 hrs x $130 = $325", closed.status_code == 200
   and money(sr_row(MAIN).total_cost) == D("325.00"), (closed.status_code, sr_row(MAIN).total_cost))
revised = generate(MAIN)
inv_body = revised.json()
ok("the invoice is updated, not replaced: same id and number", revised.status_code == 200 and inv_body["id"] == INVOICE_ID
   and inv_body["invoice_number"] == NUMBER, revised.text[:300])
ok("  $150 Service Fee + $325 labour = $475", money(inv_body["subtotal"]) == D("475.00") and money(inv_body["total_amount"]) == D("475.00")
   and money(inv_body["balance_due"]) == D("475.00"), (inv_body["subtotal"], inv_body["total_amount"]))
lines = {row["description"]: money(row["total_amount"]) for row in inv_body["line_items"]}
ok("  its lines say so", lines.get("Service Fee") == D("150.00") and any(v == D("325.00") for k, v in lines.items() if k.startswith("Service labor")), lines)
ok("  the change is in its ledger, $420 -> $475", ledger(INVOICE_ID)[-1] == "invoice_edited", ledger(INVOICE_ID))
row = sr_row(MAIN)
ok("  the request is no longer waiting for that update", row.invoice_needs_revision is False and row.invoice_deleted is False)
ok("  and the invoice must be approved again before it is paid", invoice_row(INVOICE_ID).billing_approval_status == "pending")
ok("  the request's history has the revision", (row.history or [])[-1]["action"] == "service_invoice_revised"
   and (row.history or [])[-1]["changes"]["previous_total"] == "420.00", (row.history or [])[-1])
again = generate(MAIN).json()
ok("generating again returns it unchanged, as for any invoiced request", again["id"] == INVOICE_ID and money(again["total_amount"]) == D("475.00"))
untouched = generate(UNTOUCHED).json()
ok("a request never reopened: its invoice comes back as it was", money(untouched["total_amount"]) == D("475.00"))

print("\n\"Delete this invoice\" cancels it")
made = generate(CANCEL).json()
deleted = as_user("boss").patch(f"{API}/service-requests/{CANCEL}", json={"invoice_deleted": True})
ok("the button's request cancels the invoice for real", deleted.status_code == 200
   and invoice_row(made["id"]).status == InvoiceStatus.CANCELLED and deleted.json()["invoice_deleted"] is True, deleted.text[:200])
ok("  with its ledger saying so", ledger(made["id"])[-1] == "status_change", ledger(made["id"]))
fresh = generate(CANCEL).json()
ok("the request can then be invoiced again, with a new invoice", fresh["id"] != made["id"]
   and fresh["invoice_number"] != made["invoice_number"] and sr_row(CANCEL).invoice_deleted is False, fresh.get("invoice_number"))
ok("the dedicated cancel action does the same", as_user("boss").post(f"{API}/service-requests/{CANCEL}/cancel-invoice").status_code == 200
   and invoice_row(fresh["id"]).status == InvoiceStatus.CANCELLED)
ok("  and a technician may not cancel an invoice", as_user("tech").post(f"{API}/service-requests/{CANCEL}/cancel-invoice").status_code in (403, 409))

print("\nA quotation on a cancelled invoice is released, to be billed again")


def quote_state():
    db = Session()
    try:
        auth = db.query(QuotationAuthorization).filter(QuotationAuthorization.quotation_id == QUOTE).one()
        return db.get(ServiceRequestQuotation, QUOTE).status, auth.status
    finally:
        db.close()


with_quote = generate(QUOTED, include_quotations=True, quotation_ids=[QUOTE]).json()
ok("(the quotation is on the invoice)", quote_state() == ("included_in_invoice", "fulfilled_in_invoice")
   and money(with_quote["subtotal"]) > D("200"), (quote_state(), with_quote.get("subtotal")))
as_user("boss").patch(f"{API}/service-requests/{QUOTED}", json={"invoice_deleted": True})
ok("cancelling the invoice returns the quotation to authorized, its authorization live again",
   quote_state() == ("authorized", "authorized"), quote_state())
again = generate(QUOTED, include_quotations=True, quotation_ids=[QUOTE]).json()
ok("  so the new invoice bills it again", again["id"] != with_quote["id"]
   and money(again["subtotal"]) == money(with_quote["subtotal"]) and quote_state()[0] == "included_in_invoice",
   (again.get("subtotal"), quote_state()))

print("\nEditing a tier's rates")
edited = as_user("boss").put(f"{API}/tiers/{T1}", json={"labor_rate_per_hour": "140.00"})
db = Session()
log = db.query(AuditLog).filter(AuditLog.table_name == "tiers", AuditLog.record_id == T1).order_by(AuditLog.id.desc()).first()
db.close()
ok("is on record, old and new", edited.status_code == 200 and log is not None
   and json.loads(log.changes_json)["labor_rate_per_hour"] == {"from": "130.00", "to": "140.00"}, log and log.changes_json)
ok("  open requests on it are re-priced; completed ones are not",
   money(sr_row(OPEN_ON_T1).total_cost) == D("140.00") and money(sr_row(OPEN_ON_BED).total_cost) == D("280.00")
   and money(sr_row(MAIN).total_cost) == D("325.00") and int(edited.headers.get("X-Repriced-Open-Requests", "0")) >= 2,
   (sr_row(OPEN_ON_T1).total_cost, sr_row(OPEN_ON_BED).total_cost, edited.headers.get("X-Repriced-Open-Requests")))
ok("  issued invoices are not touched", money(invoice_row(INVOICE_ID).total_amount) == D("475.00"))
name_only = as_user("boss").put(f"{API}/tiers/{T1}", json={"description": "Standard"})
ok("a change to the description alone re-prices nothing", name_only.status_code == 200 and "X-Repriced-Open-Requests" not in name_only.headers)

print(f"\n{len(failures)} FAILED: {failures}" if failures else "\nALL PASSED")
sys.exit(1 if failures else 0)
