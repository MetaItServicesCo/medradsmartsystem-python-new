"""Searching parts on a service request (the Parts Used picker).

    A. One word, or a phrase found whole in one field, matches as before.
    B. Several words match across fields in any order: "philips probe".
    C. Every word must match; a word of punctuation (a pasted " - ") is ignored.
    D. The part whose number was typed comes first, then numbers starting with it.
    E. % and _ are matched literally, not as wildcards.
    F. Unchanged: out-of-stock and inactive parts never show; no search lists all.

    DATABASE_URL=sqlite:// python backend/tests/test_service_part_search.py
"""
from __future__ import annotations

import os
import pathlib
import sys
from decimal import Decimal as D

os.environ.setdefault("DATABASE_URL", "sqlite://")
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))
sys.modules.setdefault("magic", None)

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
from app.models.inventory import InventoryPart  # noqa: E402
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
admin = User(username="admin", email="admin@medrad.test", full_name="Admin", hashed_password="x",
             user_type=UserType.EMPLOYEE, role=UserRole.ADMIN, is_active=True)
seed.add(admin)
tier = Tier(tier_code="T-GOLD", name="Gold", labor_rate_per_hour=D("100.00"), service_call_fee=D("0"),
            preventive_maintenance_fee=D("0"), mileage_rate=D("1.00"))
modality = Modality(name="Monitor", category=ModalityCategory.PATIENT_MONITORING)
seed.add_all([tier, modality])
seed.flush()
monitor = Equipment(asset_tag="A-1", make="Acme", model="M1", serial_number="SN-1", modality_id=modality.id,
                    facility_id=clinic.id, tier_id=tier.id)
seed.add(monitor)
seed.flush()
sr = ServiceRequest(request_number="SR-1", facility_id=clinic.id, equipment_id=monitor.id, requester_id=admin.id,
                    problem_description="x", priority=Priority.MEDIUM, status=ServiceRequestStatus.IN_PROGRESS,
                    assigned_technician_id=admin.id, history=[])
seed.add(sr)


def part(number, description, make=None, model=None, qty=5, status="active", serial=None):
    seed.add(InventoryPart(part_number=number, part_type="part", description=description, make=make, model=model,
                           serial_number=serial, unit_price=D("10"), quantity_on_hand=qty, reorder_level=1,
                           status=status))


part("PRB-100", "Ultrasound probe cover", make="Philips", model="L12-5")
part("PRB-1000", "Probe cable", make="GE")
part("BRD-7", "Power board", make="Philips", model="IntelliVue")
part("FLT_2", "Air filter 50% efficiency", make="Acme")
part("FLTX2", "Air filter", make="Acme")
part("OUT-1", "Probe holder", make="Philips", qty=0)
part("OLD-1", "Philips probe clip", make="Philips", status="inactive")
seed.flush()
SR_ID, ADMIN_ID = sr.id, admin.id
seed.commit()
seed.close()


def db_override():
    db = Session()
    try:
        yield db
    finally:
        db.close()


def user_override():
    db = Session()
    try:
        user = db.get(User, ADMIN_ID)
        db.expunge(user)
        return user
    finally:
        db.close()


app.dependency_overrides[get_db] = db_override
app.dependency_overrides[get_current_user] = user_override
client = TestClient(app, raise_server_exceptions=False, base_url="http://localhost")


def numbers(search=None):
    params = {"search": search} if search is not None else {}
    response = client.get(f"/api/v1/service-requests/{SR_ID}/available-parts", params=params)
    assert response.status_code == 200, response.text
    return [item["part_number"] for item in response.json()["items"]]


print("A. As before")
ok("one word matches any field", set(numbers("philips")) == {"PRB-100", "BRD-7"}, str(numbers("philips")))
ok("a phrase found whole in one field still matches", numbers("probe cover") == ["PRB-100"], str(numbers("probe cover")))
ok("case does not matter", numbers("ULTRASOUND") == ["PRB-100"])

print("\nB. Several words across fields")
ok("'philips probe' finds the Philips probe part", numbers("philips probe") == ["PRB-100"], str(numbers("philips probe")))
ok("  in any order", numbers("probe philips") == ["PRB-100"])
ok("  across make, model and description", numbers("L12-5 cover philips") == ["PRB-100"])

print("\nC. Every word must match")
ok("a word nothing matches returns nothing", numbers("philips monitor") == [])
ok("a pasted picker label finds its own part", numbers("PRB-100 - Ultrasound probe cover") == ["PRB-100"],
   str(numbers("PRB-100 - Ultrasound probe cover")))

print("\nD. The typed part number first")
ok("the exact number comes first, then numbers starting with it", numbers("prb-100")[:2] == ["PRB-100", "PRB-1000"],
   str(numbers("prb-100")))

print("\nE. Literal % and _")
ok("_ is a character, not a wildcard", numbers("FLT_2") == ["FLT_2"], str(numbers("FLT_2")))
ok("% is a character, not a wildcard", numbers("50%") == ["FLT_2"], str(numbers("50%")))

print("\nF. Unchanged")
listed = numbers()
ok("no search lists every in-stock active part", set(listed) == {"PRB-100", "PRB-1000", "BRD-7", "FLT_2", "FLTX2"}, str(listed))
ok("out-of-stock and inactive parts never show", "OUT-1" not in numbers("probe") and "OLD-1" not in numbers("clip"))
ok("a blank search lists everything", set(numbers("   ")) == set(listed))

print()
if failures:
    print(f"{len(failures)} check(s) failed")
    sys.exit(1)
print("All part search checks passed")
