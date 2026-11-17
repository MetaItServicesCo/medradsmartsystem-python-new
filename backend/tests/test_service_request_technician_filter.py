"""The service request list can be searched by its Technician column.

* "Technician" finds requests by the assigned technician's name, username or
  email; "Unassigned" (as the column shows it) finds those with nobody.
* "All fields" now includes the technician too.
* The other fields, and who sees what, are as before: a technician still
  sees only their own requests whatever they search for.

    DATABASE_URL=sqlite:// venv312/Scripts/python.exe tests/test_service_request_technician_filter.py
"""
from __future__ import annotations

import logging
import os
import pathlib
import sys
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
from app.models.tier import Tier  # noqa: E402
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
clinic = Facility(name="Life Path", contact_person="C", phone="1", email="lp@x.test", address="1 St", city="Waco",
                  state="TX", zip_code="76701", country="US")
seed.add(clinic)
seed.flush()


def person(username, full_name, role):
    user = User(username=username, email=f"{username}@x.test", full_name=full_name, hashed_password="x",
                user_type=UserType.EMPLOYEE, role=role, is_active=True)
    seed.add(user)
    seed.flush()
    return user


boss = person("boss", "Boss", UserRole.SUPERADMIN)
daniel = person("dperez", "Daniel Perez", UserRole.TECHNICIAN)
sam = person("sam", "Shahryar Ahmed (SAM)", UserRole.TECHNICIAN)
tier = Tier(tier_code="T-1", name="T-1", labor_rate_per_hour=D("130"), service_call_fee=D("150"),
            preventive_maintenance_fee=D("0"), mileage_rate=D("1"))
modality = Modality(name="Bed", category=list(ModalityCategory)[0])
seed.add_all([tier, modality])
seed.flush()
bed = Equipment(asset_tag="B-1", make="Hill Rom", model="P7500", serial_number="S1", modality_id=modality.id,
                facility_id=clinic.id, tier_id=tier.id)
seed.add(bed)
seed.flush()


def request(number, technician):
    row = ServiceRequest(request_number=number, facility_id=clinic.id, equipment_id=bed.id, requester_id=boss.id,
                         assigned_technician_id=technician.id if technician else None, problem_description="Broken",
                         priority=Priority.MEDIUM, status=ServiceRequestStatus.ASSIGNED if technician else ServiceRequestStatus.NEW,
                         history=[])
    seed.add(row)
    seed.flush()


request("SR-1", daniel)
request("SR-2", daniel)
request("SR-3", sam)
request("SR-4", None)
IDS = {"boss": boss.id, "daniel": daniel.id, "sam": sam.id}
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


def found(search, field="technician", who="boss"):
    current["who"] = who
    r = client.get("/api/v1/service-requests/", params={"search": search, "search_field": field, "limit": 50})
    assert r.status_code == 200, r.text[:300]
    return sorted(item["request_number"] for item in r.json()["items"])


print("Searching the Technician column")
ok("by name", found("Daniel") == ["SR-1", "SR-2"], found("Daniel"))
ok("  by part of a name, any case", found("perez") == ["SR-1", "SR-2"])
ok("  by username", found("dperez") == ["SR-1", "SR-2"])
ok("  by email", found("sam@x") == ["SR-3"])
ok("  by the name as shown, nickname included", found("(SAM)") == ["SR-3"])
ok('"Unassigned" finds those with nobody, as the column shows them', found("Unassigned") == ["SR-4"] and found("unassign") == ["SR-4"])
ok("nobody by that name: nothing", found("Zed") == [])
ok("the request totals follow the search", (lambda: (current.update(who="boss"), client.get(
    "/api/v1/service-requests/", params={"search": "Daniel", "search_field": "technician"}).json()["total"])[1])() == 2)

print("\nThe rest, as before")
ok("All fields now includes the technician", found("Daniel", "all") == ["SR-1", "SR-2"])
ok("Request # still finds by number only", found("SR-3", "request_number") == ["SR-3"])
ok("Created By still finds the creator, not the technician", found("Boss", "requester") == ["SR-1", "SR-2", "SR-3", "SR-4"]
   and found("Daniel", "requester") == [])
ok("a technician still sees only their own requests, whatever the search", found("Daniel", who="sam") == []
   and found("SAM", who="sam") == ["SR-3"] and found("", "all", who="sam") == ["SR-3"])

print(f"\n{len(failures)} FAILED: {failures}" if failures else "\nALL PASSED")
sys.exit(1 if failures else 0)
