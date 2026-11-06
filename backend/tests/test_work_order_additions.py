"""Adding to a work order without time, and correcting hours - through the app.

    A. Something left out of a work session - a part, a note - is added with no
       hours: labour, cost and status stay exactly as they were, the part
       comes out of stock once (retries included), and only the assigned
       technician or an administrator can do it.
    B. After completion it is still possible, until the request is invoiced.
    C. Once invoiced, nothing more is added and hours are not corrected.
    D. An administrator corrects total hours with a reason, until invoiced;
       the new total is what the invoice bills, sessions stay as logged.
    E. What existed is unchanged: a work session still needs hours, a
       completed request still takes no work session, parts still reach the
       invoice only through a quotation, and the plain hours edit is closed.

    DATABASE_URL=sqlite:// python backend/tests/test_work_order_additions.py
"""
from __future__ import annotations

import os
import pathlib
import sys
from decimal import Decimal as D

os.environ.setdefault("DATABASE_URL", "sqlite://")
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))

from fastapi.testclient import TestClient  # noqa: E402
from sqlalchemy import create_engine, event  # noqa: E402
from sqlalchemy.orm import sessionmaker  # noqa: E402
from sqlalchemy.pool import StaticPool  # noqa: E402

import app.models  # noqa: E402,F401
from app.core.deps import get_current_user  # noqa: E402
from app.db.base import Base, get_db  # noqa: E402
from app.main import app  # noqa: E402
from app.models.equipment import Equipment  # noqa: E402
from app.models.facility import Facility  # noqa: E402
from app.models.inventory import InventoryPart, InventoryTransaction  # noqa: E402
from app.models.invoice import Invoice, InvoiceStatus  # noqa: E402
from app.models.modality import Modality, ModalityCategory  # noqa: E402
from app.models.service_request import Priority, ServiceRequest, ServiceRequestStatus  # noqa: E402
from app.models.tier import Tier  # noqa: E402
from app.models.user import User, UserRole, UserType  # noqa: E402
from app.utils import read_cache  # noqa: E402

read_cache.settings.READ_CACHE_ENABLED = False
failures: list[str] = []


def ok(label: str, condition: bool, detail: str = "") -> None:
    print("{}  {}{}".format("PASS" if condition else "FAIL", label, "  " + detail if detail else ""))
    if not condition:
        failures.append(label)


def section(title: str) -> None:
    print()
    print(title)


engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)


@event.listens_for(engine, "connect")
def _no_driver_transactions(dbapi_connection, _record):
    dbapi_connection.isolation_level = None


@event.listens_for(engine, "begin")
def _begin(connection):
    connection.exec_driver_sql("BEGIN")


def _sqlite_buildable(table) -> bool:
    from sqlalchemy.schema import CreateTable
    try:
        CreateTable(table).compile(dialect=engine.dialect)
        return True
    except Exception:
        return False


Base.metadata.create_all(engine, tables=[t for t in Base.metadata.sorted_tables if _sqlite_buildable(t)])
Session = sessionmaker(bind=engine)

seed = Session()
clinic = Facility(name="Clinic A", phone="555-0101", email="a@clinic.test", address="1 A St", city="Plano",
                  state="TX", zip_code="75024", country="US")
seed.add(clinic)
seed.flush()


def person(username, role, user_type=UserType.EMPLOYEE, facility=None):
    user = User(username=username, email=username + "@medrad.test", full_name=username.title(), hashed_password="x",
                user_type=user_type, role=role, is_active=True, facility_id=facility.id if facility else None)
    seed.add(user)
    seed.flush()
    return user


PEOPLE = {
    "superadmin": person("superadmin", UserRole.SUPERADMIN),
    "admin": person("admin", UserRole.ADMIN),
    "tech": person("tech", UserRole.TECHNICIAN),
    "othertech": person("othertech", UserRole.TECHNICIAN),
    "employee": person("employee", UserRole.EMPLOYEE),
    "facadmin": person("facadmin", UserRole.FACILITY_ADMIN, facility=clinic),
    "client": person("client", UserRole.CLIENT, UserType.CLIENT, facility=clinic),
}
tier = Tier(tier_code="T-GOLD", name="Gold", labor_rate_per_hour=D("100.00"), service_call_fee=D("0"),
            preventive_maintenance_fee=D("0"), mileage_rate=D("1.00"))
modality = Modality(name="Monitor", category=ModalityCategory.PATIENT_MONITORING)
seed.add_all([tier, modality])
seed.flush()
monitor = Equipment(asset_tag="A-1", make="Acme", model="M1", serial_number="SN-1", modality_id=modality.id,
                    facility_id=clinic.id, tier_id=tier.id)
seed.add(monitor)
seed.flush()
monitor_modality, clinic_id, client_id, tech_id = modality.id, clinic.id, PEOPLE["client"].id, PEOPLE["tech"].id
part = InventoryPart(part_number="P-100", part_type="part", description="Power board", unit_price=D("50.00"),
                     quantity_on_hand=10, reorder_level=1, status="active")
seed.add(part)
seed.flush()
PART = part.id


def request(number, status, hours="2.00"):
    row = ServiceRequest(request_number=number, facility_id=clinic.id, equipment_id=monitor.id,
                         requester_id=PEOPLE["client"].id, problem_description="Display flickers",
                         priority=Priority.MEDIUM, status=status, assigned_technician_id=PEOPLE["tech"].id,
                         time_spent_hours=D(hours), total_cost=D(hours) * D("100"), history=[])
    seed.add(row)
    seed.flush()
    return row.id


ACTIVE = request("SR-ACTIVE", ServiceRequestStatus.IN_PROGRESS)
DONE = request("SR-DONE", ServiceRequestStatus.COMPLETED)
INVOICED = request("SR-INVOICED", ServiceRequestStatus.COMPLETED)
CANCELLED = request("SR-CANCELLED", ServiceRequestStatus.CANCELLED)
WITH_STATUS = request("SR-STATUS", ServiceRequestStatus.IN_PROGRESS)
NO_HOURS = request("SR-NO-HOURS", ServiceRequestStatus.IN_PROGRESS, hours="0")
NEW = ServiceRequest(request_number="SR-NEW", facility_id=clinic.id, equipment_id=monitor.id,
                     requester_id=PEOPLE["client"].id, problem_description="x", priority=Priority.MEDIUM,
                     status=ServiceRequestStatus.NEW, history=[])
seed.add(NEW)
seed.commit()
NEW = NEW.id
IDS = {name: user.id for name, user in PEOPLE.items()}
seed.close()

current = {"who": "superadmin"}


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


def as_user(who):
    current["who"] = who
    return client


def add(request_id, who="tech", **body):
    return as_user(who).post(f"/api/v1/service-requests/{request_id}/work-order-additions", json=body)


def correct(request_id, who="superadmin", **body):
    return as_user(who).post(f"/api/v1/service-requests/{request_id}/hours-corrections", json=body)


def state(request_id):
    db = Session()
    try:
        sr = db.get(ServiceRequest, request_id)
        return {
            "hours": D(str(sr.time_spent_hours or 0)), "cost": D(str(sr.total_cost or 0)),
            "status": sr.status, "history": list(sr.history or []),
        }
    finally:
        db.close()


def stock():
    db = Session()
    try:
        return db.get(InventoryPart, PART).quantity_on_hand
    finally:
        db.close()


def additions(request_id):
    return [e for e in state(request_id)["history"] if e.get("action") == "work_order_addition"]


print("Work order additions and hours corrections")
print("=" * 72)

# ── A. Adding without time ─────────────────────────────────────────────────────
section("A. Adding to a work order without time")
before = state(ACTIVE)
r = add(ACTIVE, addition_id="addition-0001", notes="Forgot to log the power board",
        part_usages=[{"part_id": PART, "quantity": 2}])
after = state(ACTIVE)
ok("the assigned technician adds a forgotten part and a note", r.status_code == 200, f"{r.status_code} {r.text[:120]}")
ok("  hours are unchanged", after["hours"] == before["hours"], f"{before['hours']} -> {after['hours']}")
ok("  the labour cost is unchanged", after["cost"] == before["cost"], f"{before['cost']} -> {after['cost']}")
ok("  the status is unchanged", after["status"] == before["status"])
ok("  the part comes out of stock", stock() == 8, str(stock()))
entry = additions(ACTIVE)[-1] if additions(ACTIVE) else {}
ok("  the history records it as an addition, with the part and note",
   entry.get("changes", {}).get("notes") == "Forgot to log the power board"
   and entry.get("changes", {}).get("parts", [{}])[0].get("quantity_used") == 2
   and "duration_hours" not in entry.get("changes", {}))
db = Session()
movement = db.query(InventoryTransaction).filter(InventoryTransaction.part_id == PART).order_by(InventoryTransaction.id.desc()).first()
db.close()
ok("  the stock movement says it was a work order addition",
   movement is not None and movement.authorization_details == "Work order addition addition-0001",
   movement.authorization_details if movement else "none")
r = add(ACTIVE, addition_id="addition-0001", notes="Forgot to log the power board",
        part_usages=[{"part_id": PART, "quantity": 2}])
ok("a retry of the same addition is accepted once: no second deduction, no second entry",
   r.status_code == 200 and stock() == 8 and len(additions(ACTIVE)) == 1, f"stock {stock()}, entries {len(additions(ACTIVE))}")
ok("an empty addition is refused", add(ACTIVE, notes="  ").status_code == 400)
r = add(ACTIVE, part_usages=[{"part_id": PART, "quantity": 50}])
ok("more parts than are in stock is refused, and nothing is taken", r.status_code == 409 and stock() == 8, f"{r.status_code}")
ok("a zero quantity is refused", add(ACTIVE, part_usages=[{"part_id": PART, "quantity": 0}]).status_code == 422)
ok("an administrator can add", add(ACTIVE, who="superadmin", notes="Checked by admin").status_code == 200)
ok("an unscoped admin can add", add(ACTIVE, who="admin", notes="Checked by admin 2").status_code == 200)
for who in ("othertech", "employee", "facadmin", "client"):
    r = add(ACTIVE, who=who, notes="not mine")
    ok(f"{who} cannot add to someone else's work order", r.status_code in (403, 404), str(r.status_code))
ok("a new (unassigned) request cannot be added to", add(NEW, who="superadmin", notes="x").status_code == 400)
ok("a cancelled request cannot be added to", add(CANCELLED, notes="x").status_code == 400)

# ── A2. Changing status with an addition ─────────────────────────────────────
section("A2. Changing the status with an addition")
r = add(WITH_STATUS, notes="Board on order", status="waiting_on_parts")
after = state(WITH_STATUS)
ok("the technician sets Waiting on Parts with an addition", r.status_code == 200
   and after["status"] == ServiceRequestStatus.WAITING_ON_PARTS, f"{r.status_code} {after['status']}")
ok("  hours and cost unchanged", after["hours"] == D("2.00") and after["cost"] == D("200.00"))
ok("  the history records the change", additions(WITH_STATUS)[-1]["changes"]["status"]
   == {"from": "in_progress", "to": "waiting_on_parts"}, str(additions(WITH_STATUS)[-1]["changes"]["status"]))
r = add(WITH_STATUS, notes="Still waiting", status="waiting_on_parts")
ok("choosing the current status changes nothing", r.status_code == 200
   and additions(WITH_STATUS)[-1]["changes"]["status"] == "waiting_on_parts")
r = add(WITH_STATUS, notes="x", status="not-a-status")
ok("an unknown status is refused", r.status_code == 400 and state(WITH_STATUS)["status"] == ServiceRequestStatus.WAITING_ON_PARTS)
# Closing with no hours logged: allowed through an addition.
ok("closing still needs something recorded", add(NO_HOURS, notes="  ", status="completed").status_code == 400
   and state(NO_HOURS)["status"] == ServiceRequestStatus.IN_PROGRESS)
for who in ("employee", "facadmin", "client"):
    r = add(NO_HOURS, who=who, notes="Close it", status="completed")
    ok(f"{who} cannot close it this way", r.status_code in (403, 404)
       and state(NO_HOURS)["status"] == ServiceRequestStatus.IN_PROGRESS, str(r.status_code))
db = Session()
clocked = db.get(ServiceRequest, NO_HOURS)
clocked.history = [{"action": "technician_clock_in", "user": "Tech", "changes": {}}]
db.commit()
db.close()
r = add(NO_HOURS, notes="Close it", status="completed")
ok("a running work session must still be ended first", r.status_code == 400 and "active work session" in r.text
   and state(NO_HOURS)["status"] == ServiceRequestStatus.IN_PROGRESS, f"{r.status_code} {r.text[:80]}")
db = Session()
clocked = db.get(ServiceRequest, NO_HOURS)
clocked.history = []
db.commit()
db.close()
taken = stock()
r = add(NO_HOURS, notes="Fitted the board", status="completed", part_usages=[{"part_id": PART, "quantity": 1}])
after = state(NO_HOURS)
ok("an addition closes a request with no hours logged", r.status_code == 200
   and after["status"] == ServiceRequestStatus.COMPLETED, f"{r.status_code} {r.text[:80]}")
ok("  hours and labour stay at zero", after["hours"] == D("0") and after["cost"] == D("0"), f"{after['hours']} / {after['cost']}")
ok("  the part came out of stock", stock() == taken - 1, str(stock()))
ok("  the history records it", additions(NO_HOURS)[-1]["changes"]["status"] == {"from": "in_progress", "to": "completed"})
db = Session()
completed_at = db.get(ServiceRequest, NO_HOURS).completed_at
db.close()
ok("  completion is time-stamped", completed_at is not None)
r = add(NO_HOURS, notes="Reopen?", status="in_progress")
ok("  it cannot be moved back", r.status_code == 400 and state(NO_HOURS)["status"] == ServiceRequestStatus.COMPLETED)
r = correct(NO_HOURS, total_hours="1.50", reason="Forgot to log the visit")
ok("  an administrator can still correct the hours", r.status_code == 200 and state(NO_HOURS)["cost"] == D("150.00"),
   f"{r.status_code} {state(NO_HOURS)['cost']}")
r = correct(NO_HOURS, total_hours="0", reason="No labour on this one after all")
ok("  and back to none, for the test below", r.status_code == 200 and state(NO_HOURS)["hours"] == D("0"), f"{r.status_code} {r.text[:80]}")
r = as_user("superadmin").post(f"/api/v1/service-requests/{NO_HOURS}/generate-invoice", json={})
labour = next((row for row in (r.json().get("line_items", []) if r.status_code == 200 else [])
               if str(row.get("description", "")).startswith("Service labor")), {})
ok("  it can be invoiced, with no labour billed", r.status_code == 200 and D(str(labour.get("total_amount", -1))) == D("0"),
   f"{r.status_code} {r.text[:120]}")
r = add(NO_HOURS, notes="After the invoice")
ok("  and once invoiced nothing more is added", r.status_code == 409, str(r.status_code))
r = add(WITH_STATUS, notes="Board fitted, all tests pass", status="completed")
after = state(WITH_STATUS)
ok("with hours logged, an addition can complete the request", r.status_code == 200
   and after["status"] == ServiceRequestStatus.COMPLETED, f"{r.status_code} {after['status']}")
db = Session()
completed_at = db.get(ServiceRequest, WITH_STATUS).completed_at
db.close()
ok("  completion is time-stamped, hours unchanged", completed_at is not None and after["hours"] == D("2.00"))
r = add(WITH_STATUS, notes="Reopen?", status="in_progress")
ok("a completed request cannot be moved back by an addition", r.status_code == 400
   and state(WITH_STATUS)["status"] == ServiceRequestStatus.COMPLETED, str(r.status_code))
ok("  but can still be added to without a status", add(WITH_STATUS, notes="Late note").status_code == 200)

# ── B. After completion, before invoicing ────────────────────────────────────
section("B. After completion, until invoiced")
before = state(DONE)
r = add(DONE, notes="Replaced the fuse as well", part_usages=[{"part_id": PART, "quantity": 1}])
ok("the technician can add after completion", r.status_code == 200, f"{r.status_code} {r.text[:100]}")
ok("  the request stays completed, hours and cost unchanged",
   state(DONE)["status"] == ServiceRequestStatus.COMPLETED and state(DONE)["hours"] == before["hours"]
   and state(DONE)["cost"] == before["cost"])
ok("  the response says it is not invoiced", r.json().get("is_invoiced") is False, str(r.json().get("is_invoiced")))
ok("an administrator can add after completion", add(DONE, who="superadmin", notes="Admin note").status_code == 200)
detail = as_user("tech").get(f"/api/v1/service-requests/{DONE}").json()
ok("the request's own page says it is not invoiced", detail.get("is_invoiced") is False)

# ── D. Hours correction (before invoicing) ───────────────────────────────────
section("D. Hours correction by an administrator")
sessions_before = [e for e in state(DONE)["history"] if e.get("action") in {"technician_work_session", "technician_clock_out"}]
r = correct(DONE, total_hours="3.50", reason="Technician forgot the second visit")
ok("an administrator corrects 2.00 to 3.50 hours with a reason", r.status_code == 200, f"{r.status_code} {r.text[:120]}")
ok("  the total and labour cost follow", state(DONE)["hours"] == D("3.50") and state(DONE)["cost"] == D("350.00"),
   f"{state(DONE)['hours']} / {state(DONE)['cost']}")
last = state(DONE)["history"][-1]
ok("  the history keeps from, to, reason and who",
   last.get("action") == "hours_correction" and last["changes"] == {"from_hours": 2.0, "to_hours": 3.5,
                                                                    "reason": "Technician forgot the second visit"}
   and last.get("user") == "Superadmin", str(last))
ok("  logged sessions are left as they were",
   [e for e in state(DONE)["history"] if e.get("action") in {"technician_work_session", "technician_clock_out"}] == sessions_before)
ok("a correction without a reason is refused", correct(DONE, total_hours="4", reason="").status_code == 422)
ok("a negative total is refused", correct(DONE, total_hours="-1", reason="typo fix").status_code == 422)
ok("a correction to the same total is refused", correct(DONE, total_hours="3.50", reason="no change").status_code == 400)
for who in ("tech", "employee", "facadmin", "client"):
    r = correct(DONE, who=who, total_hours="9", reason="trying")
    ok(f"{who} cannot correct hours", r.status_code in (403, 404), str(r.status_code))
ok("  and the hours did not move", state(DONE)["hours"] == D("3.50"))
ok("hours cannot be corrected on a new request", correct(NEW, total_hours="1", reason="early").status_code == 400)
ok("hours cannot be corrected on a cancelled request", correct(CANCELLED, total_hours="1", reason="late").status_code == 400)
r = as_user("superadmin").patch(f"/api/v1/service-requests/{DONE}", json={"time_spent_hours": 99})
ok("the plain hours edit is closed: it must be a correction with a reason",
   r.status_code == 400 and state(DONE)["hours"] == D("3.50"), str(r.status_code))

# ── C. Once invoiced ─────────────────────────────────────────────────────────
section("C. Once invoiced")
r = as_user("superadmin").post(f"/api/v1/service-requests/{DONE}/generate-invoice", json={})
invoice = r.json() if r.status_code == 200 else {}
ok("the invoice is generated", r.status_code == 200, f"{r.status_code} {r.text[:120]}")
labour = next((row for row in invoice.get("line_items", []) if str(row.get("description", "")).startswith("Service labor")), {})
ok("  it bills the corrected hours", D(str(labour.get("quantity", 0))) == D("3.50")
   and D(str(labour.get("total_amount", 0))) == D("350.00"), str(labour))
ok("  and no part used in the work order (parts bill only by quotation)",
   all("Power board" not in str(row.get("description", "")) for row in invoice.get("line_items", [])))
before_stock, before_state = stock(), state(DONE)
for who in ("tech", "superadmin"):
    r = add(DONE, who=who, notes="late note", part_usages=[{"part_id": PART, "quantity": 1}])
    ok(f"{who} can no longer add", r.status_code == 409 and "invoiced" in r.text, str(r.status_code))
ok("  and no stock was taken", stock() == before_stock, str(stock()))
r = correct(DONE, total_hours="5", reason="after invoice")
ok("hours can no longer be corrected", r.status_code == 409 and "invoiced" in r.text, str(r.status_code))
ok("  and nothing about the request moved", state(DONE) == before_state)
ok("the request's page says it is invoiced", as_user("tech").get(f"/api/v1/service-requests/{DONE}").json().get("is_invoiced") is True)
db = Session()
db.query(Invoice).filter(Invoice.id == invoice["id"]).update({Invoice.status: InvoiceStatus.CANCELLED})
db.commit()
db.close()
ok("if that invoice is cancelled, the request is open again (as invoicing itself treats it)",
   add(DONE, notes="after cancelled invoice").status_code == 200)

# ── E. What existed is unchanged ─────────────────────────────────────────────
section("E. Existing work sessions are unchanged")
r = as_user("tech").post(f"/api/v1/service-requests/{ACTIVE}/work-sessions",
                         json={"session_id": "session-00001", "diagnosis": "x"})
ok("a work session without hours is still refused", r.status_code == 400, str(r.status_code))
hours_before = state(ACTIVE)["hours"]
r = as_user("tech").post(f"/api/v1/service-requests/{ACTIVE}/work-sessions",
                         json={"session_id": "session-00002", "total_work_hours": "1.25", "work_done": "Recalibrated"})
ok("a work session with hours still adds them", r.status_code == 200 and state(ACTIVE)["hours"] == hours_before + D("1.25"),
   f"{r.status_code} {state(ACTIVE)['hours']}")
r = as_user("tech").post(f"/api/v1/service-requests/{INVOICED}/work-sessions",
                         json={"session_id": "session-00003", "total_work_hours": "1", "work_done": "late"})
ok("a completed request still takes no work session (only additions)", r.status_code == 400, str(r.status_code))

section("Report")
as_user("superadmin")
# The service report lists completed requests.
r = client.get("/api/v1/reports/service-reports", params={"search": "SR-DONE"})
rows = [row for row in r.json().get("items", []) if row.get("request_number") == "SR-DONE"] if r.status_code == 200 else []
row = rows[0] if rows else {}
ok("the service report lists the additions apart from the sessions",
   r.status_code == 200 and len(row.get("additions", [])) == 3 and len(row.get("sessions", [])) == 0,
   f"{r.status_code} additions {len(row.get('additions', []))}, sessions {len(row.get('sessions', []))}")
ok("  with the forgotten part", any(p.get("part_number") == "P-100" for a in row.get("additions", []) for p in a.get("parts", [])))

# ── F. The tier's Service Call Fee on the invoice ────────────────────────────
section("F. Service Call Fee + hours x labour rate")
db = Session()
priced_tier = Tier(tier_code="T-PLAT", name="Platinum", labor_rate_per_hour=D("100.00"), service_call_fee=D("1500.00"),
                   preventive_maintenance_fee=D("999.00"), mileage_rate=D("1.00"))
db.add(priced_tier)
db.flush()
PRICED_TIER = priced_tier.id
priced = Equipment(asset_tag="A-2", make="Acme", model="M2", serial_number="SN-2", modality_id=monitor_modality,
                   facility_id=clinic_id, tier_id=PRICED_TIER)
tierless = Equipment(asset_tag="A-3", make="Acme", model="M3", serial_number="SN-3", modality_id=monitor_modality,
                     facility_id=clinic_id)
db.add_all([priced, tierless])
db.flush()
PRICED, TIERLESS = priced.id, tierless.id
db.commit()
db.close()


def priced_request(number, hours="0", status=ServiceRequestStatus.IN_PROGRESS, equipment=None):
    db = Session()
    row = ServiceRequest(request_number=number, facility_id=clinic_id, equipment_id=equipment or PRICED,
                         requester_id=client_id, problem_description="x", priority=Priority.MEDIUM, status=status,
                         assigned_technician_id=tech_id, time_spent_hours=D(hours), total_cost=D(hours) * D("100"), history=[])
    db.add(row)
    db.commit()
    request_id = row.id
    db.close()
    return request_id


def invoice_of(request_id, **body):
    return as_user("superadmin").post(f"/api/v1/service-requests/{request_id}/generate-invoice", json=body)


def lines(invoice):
    return [(str(row["description"]).split(" - ")[0], D(str(row["total_amount"]))) for row in invoice.get("line_items", [])]


money_of = lambda invoice, field: D(str(invoice.get(field, -1)))  # noqa: E731

request_id = priced_request("SR-FEE-0H")
detail = as_user("tech").get(f"/api/v1/service-requests/{request_id}").json()
ok("the request shows the tier's Service Call Fee", D(str(detail.get("tier_service_call_fee"))) == D("1500.00"))
add(request_id, notes="Advice only, nothing to fix", status="completed")
r = invoice_of(request_id)
invoice = r.json()
ok("0 hours, closed through an addition: only the service cost, 1500", r.status_code == 200
   and lines(invoice) == [("Service Call Fee", D("1500.00"))], f"{r.status_code} {lines(invoice)}")
ok("  the totals and balance agree", money_of(invoice, "subtotal") == D("1500.00") and money_of(invoice, "total_amount") == D("1500.00")
   and money_of(invoice, "balance_due") == D("1500.00"), f"{invoice.get('total_amount')}")
ok("  the fee is in the request's history",
   [e for e in state(request_id)["history"] if e.get("action") == "service_invoice_generated"][-1]["changes"]["service_call_fee"] == "1500.00")
ok("  and the fee note does not reach the customer", "__FEES__" not in str(invoice.get("notes")), str(invoice.get("notes")))
again = invoice_of(request_id).json()
ok("generating again returns the same invoice, not a second fee", again["id"] == invoice["id"]
   and money_of(again, "total_amount") == D("1500.00"))

request_id = priced_request("SR-FEE-2H", hours="2.00", status=ServiceRequestStatus.COMPLETED)
invoice = invoice_of(request_id).json()
ok("2 hours: service cost + labour = 1500 + 200 = 1700",
   lines(invoice) == [("Service Call Fee", D("1500.00")), ("Service labor", D("200.00"))]
   and money_of(invoice, "total_amount") == D("1700.00"), str(lines(invoice)))
ok("  the labour figure on the request stays labour", state(request_id)["cost"] == D("200.00"))
ok("  PM Cost stays out of it", all("999" not in str(row["total_amount"]) for row in invoice["line_items"]))

request_id = priced_request("SR-FEE-MIX", hours="2.00")
add(request_id, notes="Closed with a note after the visit", status="completed")
invoice = invoice_of(request_id).json()
ok("hours logged earlier, closed through an addition: the hours stay billed, 1700",
   money_of(invoice, "total_amount") == D("1700.00"), str(lines(invoice)))

request_id = priced_request("SR-FEE-FIX")
add(request_id, notes="Closed", status="completed")
correct(request_id, total_hours="2.00", reason="Visit was not logged")
invoice = invoice_of(request_id).json()
ok("closed with 0 hours, corrected to 2 before invoicing: 1700", money_of(invoice, "total_amount") == D("1700.00"), str(lines(invoice)))

request_id = priced_request("SR-FEE-ALL", hours="2.00", status=ServiceRequestStatus.COMPLETED)
invoice = invoice_of(request_id, travel_charges="50", tax_amount="10", discount_amount="20").json()
ok("travel, tax and discount apply on top", money_of(invoice, "subtotal") == D("1750.00")
   and money_of(invoice, "total_amount") == D("1740.00"), f"{invoice.get('subtotal')} {invoice.get('total_amount')}")

request_id = priced_request("SR-FEE-EDIT", hours="2.00", status=ServiceRequestStatus.COMPLETED)
invoice = invoice_of(request_id, service_call_fee="1000").json()
ok("the admin can change the fee for this invoice", lines(invoice)[0] == ("Service Call Fee", D("1000.00"))
   and money_of(invoice, "total_amount") == D("1200.00"), str(lines(invoice)))
request_id = priced_request("SR-FEE-OFF", hours="2.00", status=ServiceRequestStatus.COMPLETED)
invoice = invoice_of(request_id, service_call_fee="0").json()
ok("or leave it off with 0: labour only", lines(invoice) == [("Service labor", D("200.00"))]
   and money_of(invoice, "total_amount") == D("200.00"), str(lines(invoice)))
request_id = priced_request("SR-FEE-NIL", status=ServiceRequestStatus.COMPLETED)
invoice = invoice_of(request_id, service_call_fee="0").json()
ok("no fee and no hours: the labour line still shows, at 0", lines(invoice) == [("Service labor", D("0.00"))], str(lines(invoice)))
request_id = priced_request("SR-FEE-TRV", status=ServiceRequestStatus.COMPLETED)
invoice = invoice_of(request_id, service_call_fee="0", travel_charges="50").json()
ok("no hours, no fee, but travel: no hours line, travel only", lines(invoice) == [("Travel Charges", D("50.00"))], str(lines(invoice)))
request_id = priced_request("SR-FEE-ZERO", hours="2.00", status=ServiceRequestStatus.COMPLETED)
invoice = invoice_of(request_id, labor_fee_override="0").json()
ok("hours logged but labour waived: the hours still show, at 0", lines(invoice)[1] == ("Service labor", D("0.00"))
   and D(str(invoice["line_items"][1]["quantity"])) == D("2.00"), str(lines(invoice)))
request_id = priced_request("SR-FEE-NEG", hours="2.00", status=ServiceRequestStatus.COMPLETED)
ok("a negative fee is refused", invoice_of(request_id, service_call_fee="-5").status_code == 422)
request_id = priced_request("SR-FEE-LAB", status=ServiceRequestStatus.COMPLETED)
invoice = invoice_of(request_id, labor_fee_override="300").json()
ok("a typed labour amount still adds to the fee", money_of(invoice, "total_amount") == D("1800.00"), str(lines(invoice)))

request_id = priced_request("SR-FEE-NOTIER", hours="2.00", status=ServiceRequestStatus.COMPLETED, equipment=TIERLESS)
r = invoice_of(request_id)
ok("equipment with no tier: no fee, nothing breaks", r.status_code == 200
   and money_of(r.json(), "total_amount") == D("0.00") and lines(r.json()) == [("Service labor", D("0.00"))], f"{r.status_code} {r.text[:100]}")

request_id = priced_request("SR-FEE-KEEP", hours="2.00", status=ServiceRequestStatus.COMPLETED)
invoice = invoice_of(request_id).json()
db = Session()
db.get(Tier, PRICED_TIER).service_call_fee = D("9000.00")
db.commit()
db.close()
detail = as_user("superadmin").get("/api/v1/service-requests/invoices").json()
kept = next(row for row in detail["items"] if row["id"] == invoice["id"])
ok("changing the tier later does not touch an issued invoice", lines(kept)[0] == ("Service Call Fee", D("1500.00"))
   and money_of(kept, "total_amount") == D("1700.00"), str(lines(kept)))
r = as_user("superadmin").put(f"/api/v1/service-requests/invoices/{invoice['id']}", json={"notes": "Thanks for your business"})
ok("editing the invoice's note keeps the fee", r.status_code == 200 and lines(r.json())[0] == ("Service Call Fee", D("1500.00"))
   and r.json()["notes"] == "Thanks for your business", f"{r.status_code} {r.text[:120]}")
db = Session()
db.get(Tier, PRICED_TIER).service_call_fee = D("1500.00")
db.commit()
db.close()

request_id = priced_request("SR-FEE-OLD", hours="2.00", status=ServiceRequestStatus.COMPLETED)
invoice = invoice_of(request_id).json()
db = Session()
old = db.get(Invoice, invoice["id"])
old.notes = "__FEES__:labor=200.00,travel=0.00::An invoice from before this change"
old.subtotal = old.total_amount = old.balance_due = D("200.00")
db.commit()
db.close()
detail = as_user("superadmin").get("/api/v1/service-requests/invoices").json()
kept = next(row for row in detail["items"] if row["id"] == invoice["id"])
ok("an invoice from before this change stays exactly as it was", lines(kept) == [("Service labor", D("200.00"))]
   and money_of(kept, "total_amount") == D("200.00"), str(lines(kept)))

print()
if failures:
    print(f"{len(failures)} check(s) failed")
    for failure in failures:
        print("  - " + failure)
    sys.exit(1)
print("All work order addition checks passed")
