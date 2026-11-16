"""The progress report of a service request that is not completed yet.

Open requests (new, assigned, in progress, any waiting status) give their
report so far: the work sessions and additions recorded until now, no invoice.
A completed request has its final report in Reports instead, and a cancelled one
has none. Who may read it is exactly who may read the completed report: the
Reports module, scoped to the same requests as the service report list.

    cd backend
    DATABASE_URL=sqlite:// venv312/Scripts/python.exe tests/test_service_progress_report.py
"""
from __future__ import annotations

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
from app.models.equipment import Equipment  # noqa: E402
from app.models.facility import Facility  # noqa: E402
from app.models.modality import Modality, ModalityCategory  # noqa: E402
from app.models.service_request import Priority, ServiceRequest, ServiceRequestStatus  # noqa: E402
from app.models.user import User, UserRole, UserType  # noqa: E402
from app.utils import read_cache  # noqa: E402

read_cache.settings.READ_CACHE_ENABLED = False
failures: list[str] = []


def ok(label: str, condition: bool, detail: object = "") -> None:
    print("{}  {}{}".format("PASS" if condition else "FAIL", label, f"  {detail}" if not condition and detail != "" else ""))
    if not condition:
        failures.append(label)


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
clinic = Facility(name="Life Path", contact_person="C", phone="1", email="c@x.test", address="1 St", city="Waco",
                  state="TX", zip_code="76701", country="US")
other = Facility(name="Other Clinic", contact_person="C", phone="1", email="o@x.test", address="2 St", city="Waco",
                 state="TX", zip_code="76701", country="US")
seed.add_all([clinic, other])
seed.flush()
REPORTS = {"reports": {"index": True, "view": True}}


def person(username, role, facility=None, permissions=None):
    user = User(username=username, email=f"{username}@x.test", full_name=username.title(), hashed_password="x",
                user_type=UserType.EMPLOYEE, role=role, is_active=True,
                facility_id=facility.id if facility else None, permissions=permissions or {})
    seed.add(user)
    return user


people = {
    "boss": person("boss", UserRole.SUPERADMIN),
    "admin": person("admin", UserRole.ADMIN),
    "facadmin": person("facadmin", UserRole.FACILITY_ADMIN, clinic, REPORTS),
    "facnoreports": person("facnoreports", UserRole.FACILITY_ADMIN, clinic),
    "outsider": person("outsider", UserRole.FACILITY_ADMIN, other, REPORTS),
    "tech": person("tech", UserRole.TECHNICIAN, None, REPORTS),
}
seed.flush()
modality = Modality(name="Monitor", category=list(ModalityCategory)[0])
seed.add(modality)
seed.flush()
monitor = Equipment(asset_tag="A-1", make="Acme", model="M1", serial_number="SN-1", modality_id=modality.id, facility_id=clinic.id)
seed.add(monitor)
seed.flush()

SESSION = {"action": "technician_work_session", "user": "Tech", "timestamp": "2026-11-10T12:00:00",
           "changes": {"session_id": "s-1", "start_time": "2026-11-10T09:00:00", "end_time": "2026-11-10T12:00:00",
                       "duration_hours": 3.0, "diagnosis": "Power board failing", "work_done": "Replaced fuse",
                       "notes": "Board on order"}}


def request(number: str, status: ServiceRequestStatus, technician=None) -> int:
    row = ServiceRequest(request_number=number, facility_id=clinic.id, equipment_id=monitor.id,
                         requester_id=people["facadmin"].id, problem_description="Display flickers",
                         priority=Priority.MEDIUM, status=status, time_spent_hours=D("3"), total_cost=D("300"),
                         assigned_technician_id=technician.id if technician else None, history=[SESSION],
                         completed_at=datetime(2026, 11, 12) if status == ServiceRequestStatus.COMPLETED else None)
    seed.add(row)
    seed.flush()
    return row.id


OPEN = {status: request(f"SR-P-{status.value}", status, people["tech"]) for status in (
    ServiceRequestStatus.NEW,
    ServiceRequestStatus.ASSIGNED,
    ServiceRequestStatus.IN_PROGRESS,
    ServiceRequestStatus.WAITING_ON_PARTS,
    ServiceRequestStatus.WAITING_FOR_APPROVAL,
    ServiceRequestStatus.WAITING_FOR_DEPOT_REPAIR,
    ServiceRequestStatus.WAITING_FOR_VENDOR_REPAIR,
)}
DONE = request("SR-P-DONE", ServiceRequestStatus.COMPLETED, people["tech"])
CANCELLED = request("SR-P-CANCEL", ServiceRequestStatus.CANCELLED, people["tech"])
NOT_MINE = request("SR-P-OTHER-TECH", ServiceRequestStatus.IN_PROGRESS, people["admin"])
IDS = {name: user.id for name, user in people.items()}
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


def progress(request_id: int, who: str = "boss"):
    current["who"] = who
    return client.get(f"/api/v1/reports/service-reports/{request_id}/progress")


print("\nEvery open status gives the report so far")
for status, request_id in OPEN.items():
    r = progress(request_id)
    ok(f"{status.value}: 200", r.status_code == 200, r.text[:200])
r = progress(OPEN[ServiceRequestStatus.IN_PROGRESS])
body = r.json()
ok("it is the service report: request, facility, equipment, technician and status",
   body.get("request_number") == "SR-P-in_progress" and body.get("facility_name") == "Life Path"
   and body.get("asset_tag") == "A-1" and body.get("technician_name") == "Tech" and body.get("status") == "in_progress", body)
sessions = body.get("sessions") or []
ok("  with the work recorded so far", len(sessions) == 1 and sessions[0].get("diagnosis") == "Power board failing"
   and sessions[0].get("work_done") == "Replaced fuse", sessions)
ok("  hours and cost so far, not completed, no invoice",
   body.get("time_spent_hours") == 3.0 and body.get("total_cost") == 300.0 and body.get("completed_at") is None
   and body.get("invoice") is None, body)

print("\nCompleted and cancelled requests have none")
r = progress(DONE)
ok("completed: refused, its report is in Reports", r.status_code == 409 and "Reports" in r.json().get("detail", ""), r.text)
r = progress(CANCELLED)
ok("cancelled: refused", r.status_code == 409 and "cancelled" in r.json().get("detail", "").lower(), r.text)
ok("an unknown request: not found", progress(999999).status_code == 404)

print("\nThe same people as the completed report")
ok("Super Admin", progress(OPEN[ServiceRequestStatus.IN_PROGRESS], "boss").status_code == 200)
ok("Admin", progress(OPEN[ServiceRequestStatus.IN_PROGRESS], "admin").status_code == 200)
ok("a facility user given Reports, for their facility", progress(OPEN[ServiceRequestStatus.IN_PROGRESS], "facadmin").status_code == 200)
ok("a facility user without Reports: refused", progress(OPEN[ServiceRequestStatus.IN_PROGRESS], "facnoreports").status_code == 403)
ok("another facility's user: not found", progress(OPEN[ServiceRequestStatus.IN_PROGRESS], "outsider").status_code == 404)
ok("a technician given Reports: their own request", progress(OPEN[ServiceRequestStatus.IN_PROGRESS], "tech").status_code == 200)
ok("  but not someone else's", progress(NOT_MINE, "tech").status_code == 404)

current["who"] = "boss"
listed = client.get("/api/v1/reports/service-reports").json()
ok("the Reports list is unchanged: completed requests only",
   [item["request_number"] for item in listed.get("items", [])] == ["SR-P-DONE"], [i["request_number"] for i in listed.get("items", [])])

print(f"\n{len(failures)} FAILED: {failures}" if failures else "\nALL PASSED")
sys.exit(1 if failures else 0)
