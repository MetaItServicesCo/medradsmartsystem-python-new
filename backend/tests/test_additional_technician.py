"""Any staff user can also work as a technician, on top of their own role.

The flag only ever adds. These checks pin down what it adds and, as much,
what it must not: an HR manager who also does technician work sees the jobs
assigned to them and never every service request; an employee sees their own
requests plus their assigned jobs; a facility account is only ever given jobs
at its own facilities; a client can never be flagged; and nobody who is not
flagged sees any difference at all.

Scoping and the user endpoints run through a real FastAPI app and database,
because that is where a scope that silently widened would actually show.

    DATABASE_URL=sqlite:// python backend/tests/test_additional_technician.py
"""
from __future__ import annotations

import importlib.util
import os
import pathlib
import sys
from types import SimpleNamespace

os.environ.setdefault("DATABASE_URL", "sqlite://")
ROOT = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

import sqlalchemy as sa  # noqa: E402
from alembic.migration import MigrationContext  # noqa: E402
from alembic.operations import Operations  # noqa: E402
from fastapi import FastAPI, HTTPException  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from sqlalchemy.orm import sessionmaker  # noqa: E402
from sqlalchemy.pool import StaticPool  # noqa: E402

import app.models  # noqa: E402,F401
from app.api.v1.endpoints import service_requests, users  # noqa: E402
from app.core.deps import get_current_user  # noqa: E402
from app.db.base import Base, get_db  # noqa: E402
from app.models.facility import Facility  # noqa: E402
from app.models.service_request import Priority, ServiceRequest, ServiceRequestStatus  # noqa: E402
from app.models.user import User, UserRole, UserType  # noqa: E402
from app.models.user_facility import UserFacility  # noqa: E402
from app.utils import read_cache  # noqa: E402
from app.utils.facility_access import require_assignable_technician  # noqa: E402
from app.utils.permissions import (  # noqa: E402
    acts_as_technician, also_assigned, assigned_only, has_module_permission, is_additional_technician,
)

failures: list[str] = []


def ok(label: str, condition: bool, detail: str = "") -> None:
    print("{}  {}{}".format("PASS" if condition else "FAIL", label,
                            "  " + detail if detail else ""))
    if not condition:
        failures.append(label)


def person(role: UserRole, flagged: bool = False, permissions=None):
    return SimpleNamespace(role=role, is_technician=flagged, permissions=permissions or {})


print("Also working as a technician")
print("=" * 72)

# ── The permission rules, on their own ─────────────────────────────────────
hr = person(UserRole.HR_MANAGER, flagged=True)
ok("a flagged HR manager acts as a technician", acts_as_technician(hr))
ok("  and gains the technician's service-request access", has_module_permission(hr, "service-requests", "view"))
ok("  and inspection access", has_module_permission(hr, "inspections", "edit"))
ok("  but only for the jobs assigned to them", assigned_only(hr, "service-requests"))
ok("  while keeping every right of their own role", has_module_permission(hr, "hr", "view")
   == has_module_permission(person(UserRole.HR_MANAGER), "hr", "view"))
ok("  and gaining nothing a technician lacks", not has_module_permission(hr, "service-requests", "delete"))

plain_hr = person(UserRole.HR_MANAGER)
ok("an HR manager who is not flagged is exactly as before",
   not acts_as_technician(plain_hr) and not has_module_permission(plain_hr, "service-requests", "view")
   and not assigned_only(plain_hr, "service-requests"))

emp = person(UserRole.EMPLOYEE, flagged=True)
ok("a flagged employee keeps their own requests and adds assigned jobs",
   also_assigned(emp, "service-requests") and not assigned_only(emp, "service-requests"))
ok("  and sees only assigned inspections, which their role never had", assigned_only(emp, "inspections"))

restricted = person(UserRole.HR_MANAGER, flagged=True, permissions={"service-requests": {"view": False}})
ok("a saved permission matrix still wins over the flag", not has_module_permission(restricted, "service-requests", "view"))

client = person(UserRole.CLIENT, flagged=True)
ok("a client is never treated as a technician, even if the flag were set",
   not is_additional_technician(client) and not acts_as_technician(client))

tech = person(UserRole.TECHNICIAN)
ok("a technician is unchanged: a technician, assigned work only",
   acts_as_technician(tech) and assigned_only(tech, "service-requests") and not is_additional_technician(tech))

boss = person(UserRole.SUPERADMIN, flagged=True)
ok("a flagged super admin is not narrowed to assigned work",
   not assigned_only(boss, "service-requests") and not assigned_only(boss, "inspections"))

# ── Through the real app ───────────────────────────────────────────────────
read_cache.settings.READ_CACHE_ENABLED = False
engine = sa.create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
Base.metadata.create_all(engine)
Session = sessionmaker(bind=engine)

seed = Session()
north = Facility(name="North Clinic", phone="555-0100", email="n@medrad.test", address="1 North St",
                 city="Plano", state="TX", zip_code="75024", country="US")
south = Facility(name="South Clinic", phone="555-0200", email="s@medrad.test", address="2 South St",
                 city="Plano", state="TX", zip_code="75024", country="US")
east = Facility(name="East Clinic", phone="555-0300", email="e@medrad.test", address="3 East St",
                city="Plano", state="TX", zip_code="75024", country="US")
seed.add_all([north, south, east])
seed.flush()


def make(username, role, flagged=False):
    u = User(username=username, email="{}@medrad.test".format(username), full_name=username.title(),
             hashed_password="x", user_type=UserType.CLIENT if role == UserRole.CLIENT else UserType.EMPLOYEE,
             role=role, is_active=True, is_technician=flagged)
    seed.add(u)
    seed.flush()
    return u


u_boss = make("boss", UserRole.SUPERADMIN)
u_tech = make("tech", UserRole.TECHNICIAN)
u_hr = make("hrtech", UserRole.HR_MANAGER, flagged=True)
u_emp = make("emptech", UserRole.EMPLOYEE, flagged=True)
u_plain = make("plain", UserRole.EMPLOYEE)
u_fadmin = make("fadmin", UserRole.FACILITY_ADMIN, flagged=True)
u_client = make("client", UserRole.CLIENT)
# Employees belong to facilities and only ever see work there, like real ones.
seed.add_all([UserFacility(user_id=u_fadmin.id, facility_id=north.id),
              UserFacility(user_id=u_emp.id, facility_id=north.id),
              UserFacility(user_id=u_emp.id, facility_id=south.id),
              UserFacility(user_id=u_plain.id, facility_id=south.id)])

number = iter(range(1, 100))


def request(facility, requester, technician=None):
    sr = ServiceRequest(request_number="SR-{:06d}".format(next(number)), facility_id=facility.id,
                        equipment_id=1, requester_id=requester.id, problem_description="Fault",
                        priority=Priority.MEDIUM, status=ServiceRequestStatus.NEW, history=[],
                        assigned_technician_id=technician.id if technician else None)
    seed.add(sr)
    seed.flush()
    return sr.id


SR_HR = request(north, u_boss, u_hr)          # assigned to the HR manager
SR_EMP_JOB = request(north, u_boss, u_emp)    # assigned to the flagged employee
SR_EMP_OWN = request(south, u_emp)            # submitted by the flagged employee
SR_TECH = request(south, u_plain, u_tech)     # submitted by a plain employee, a technician's job
seed.commit()
IDS = {u.username: u.id for u in seed.query(User).all()}
NORTH, SOUTH, EAST = north.id, south.id, east.id
seed.close()

current = {"user_id": IDS["boss"]}


def override_db():
    db = Session()
    try:
        yield db
    finally:
        db.close()


def override_user():
    db = Session()
    try:
        yield db.query(User).filter(User.id == current["user_id"]).one()
    finally:
        db.close()


api = FastAPI()
api.include_router(service_requests.router, prefix="/service-requests")
api.include_router(users.router, prefix="/users")
api.dependency_overrides[get_db] = override_db
api.dependency_overrides[get_current_user] = override_user
http = TestClient(api)


def as_user(username):
    current["user_id"] = IDS[username]


def listed(username):
    as_user(username)
    response = http.get("/service-requests/")
    if response.status_code != 200:
        return response.status_code, response.text[:200]
    return {item["id"] for item in response.json()["items"]}


ok("the flagged HR manager lists only the job assigned to them", listed("hrtech") == {SR_HR}, str(listed("hrtech")))
ok("the flagged employee lists their own request and their assigned job",
   listed("emptech") == {SR_EMP_JOB, SR_EMP_OWN}, str(listed("emptech")))
ok("a plain employee still lists only their own requests", listed("plain") == {SR_TECH}, str(listed("plain")))
ok("a technician still lists only their own jobs", listed("tech") == {SR_TECH}, str(listed("tech")))
ok("the super admin still lists everything",
   listed("boss") == {SR_HR, SR_EMP_JOB, SR_EMP_OWN, SR_TECH}, str(listed("boss")))


def opens(username, sr_id):
    as_user(username)
    return http.get("/service-requests/{}".format(sr_id)).status_code


ok("the flagged HR manager can open their assigned job", opens("hrtech", SR_HR) == 200, str(opens("hrtech", SR_HR)))
ok("  but not anyone else's", opens("hrtech", SR_TECH) == 403, str(opens("hrtech", SR_TECH)))
ok("the flagged employee can open a job assigned to them", opens("emptech", SR_EMP_JOB) == 200,
   str(opens("emptech", SR_EMP_JOB)))
ok("  and still their own request", opens("emptech", SR_EMP_OWN) == 200)
ok("  but not someone else's unassigned request", opens("emptech", SR_TECH) == 403)
ok("a plain employee still cannot open a job that is not theirs", opens("plain", SR_EMP_JOB) == 403)

as_user("boss")
pickers = {u["username"] for u in http.get("/users/", params={"role": "technician", "limit": 500}).json()["items"]}
ok("the technician picker offers technicians and flagged staff",
   {"tech", "hrtech", "emptech", "fadmin"} <= pickers, str(sorted(pickers)))
ok("  and nobody who is not flagged", not pickers & {"plain", "client", "boss"}, str(sorted(pickers)))
others = {u["username"] for u in http.get("/users/", params={"role": "employee", "limit": 500}).json()["items"]}
ok("filtering by any other role is unchanged", others == {"emptech", "plain"}, str(sorted(others)))

response = http.put("/users/{}".format(IDS["client"]), json={"is_technician": True})
ok("a client cannot be made a technician", response.status_code == 422, response.text[:120])
response = http.put("/users/{}".format(IDS["plain"]), json={"is_technician": True})
ok("a staff user can be flagged from Edit User",
   response.status_code == 200 and response.json().get("is_technician") is True, response.text[:120])
response = http.put("/users/{}".format(IDS["plain"]), json={"full_name": "Plain Again"})
ok("  and editing something else leaves the flag alone",
   response.status_code == 200 and response.json().get("is_technician") is True, response.text[:120])
response = http.put("/users/{}".format(IDS["tech"]), json={"is_technician": True})
ok("a technician needs no flag, so none is stored",
   response.status_code == 200 and response.json().get("is_technician") is False, response.text[:120])
response = http.put("/users/{}".format(IDS["plain"]), json={"role": "client", "user_type": "client"})
ok("turning a flagged user into a client clears the flag",
   response.status_code == 200 and response.json().get("is_technician") is False, response.text[:120])
response = http.put("/users/{}/role".format(IDS["hrtech"]), json={"role": "technician"})
ok("changing the role to Technician clears the now-redundant flag",
   response.status_code == 200 and response.json().get("is_technician") is False, response.text[:120])

# ── Assignment keeps facility accounts inside their facilities ─────────────
db = Session()
try:
    require_assignable_technician(db, IDS["fadmin"], NORTH)
    ok("a flagged facility admin can be assigned a job at their own facility", True)
except HTTPException as exc:
    ok("a flagged facility admin can be assigned a job at their own facility", False, str(exc.detail))
try:
    require_assignable_technician(db, IDS["fadmin"], SOUTH)
    ok("  but not at another facility", False)
except HTTPException as exc:
    ok("  but not at another facility", exc.status_code == 422, str(exc.detail))
try:
    require_assignable_technician(db, IDS["emptech"], EAST)
    ok("a flagged employee cannot be given a job outside their facilities, which they could not open", False)
except HTTPException as exc:
    ok("a flagged employee cannot be given a job outside their facilities, which they could not open",
       exc.status_code == 422, str(exc.detail))
try:
    require_assignable_technician(db, IDS["emptech"], SOUTH)
    require_assignable_technician(db, IDS["hrtech"], EAST)
    require_assignable_technician(db, IDS["tech"], EAST)
    require_assignable_technician(db, IDS["boss"], EAST)
    ok("inside their facilities they can; staff without facilities, and technicians, are assigned as before", True)
except HTTPException as exc:
    ok("inside their facilities they can; staff without facilities, and technicians, are assigned as before",
       False, str(exc.detail))
finally:
    db.close()

as_user("boss")
response = http.patch("/service-requests/{}".format(SR_EMP_OWN), json={"assigned_technician_id": IDS["fadmin"]})
ok("the service-request screen enforces the same facility rule", response.status_code == 422, response.text[:160])

# ── The migration ──────────────────────────────────────────────────────────
spec = importlib.util.spec_from_file_location(
    "technician_migration", ROOT / "alembic" / "versions" / "d8e2f6b0a4c3_user_is_technician.py")
migration = importlib.util.module_from_spec(spec)
spec.loader.exec_module(migration)


def run(fn, target):
    with target.begin() as conn:
        original = migration.op
        migration.op = Operations(MigrationContext.configure(conn))
        try:
            fn()
        finally:
            migration.op = original


def has_column(target):
    return "is_technician" in {c["name"] for c in sa.inspect(target).get_columns("users")}


fresh = sa.create_engine("sqlite://")
Base.metadata.create_all(fresh)
run(migration.downgrade, fresh)
ok("downgrade removes the column", not has_column(fresh))
with fresh.begin() as conn:
    conn.execute(sa.text("INSERT INTO users (username, email, full_name, hashed_password, user_type, role, "
                         "is_active) VALUES ('old', 'old@medrad.test', 'Old', 'x', 'EMPLOYEE', 'EMPLOYEE', 1)"))
run(migration.upgrade, fresh)
ok("upgrade adds it back", has_column(fresh))
with fresh.connect() as conn:
    value = conn.execute(sa.text("SELECT is_technician FROM users WHERE username = 'old'")).scalar()
ok("  and every existing user starts unflagged", value in (0, False), repr(value))
run(migration.upgrade, fresh)
ok("a second upgrade is a no-op, as a stamped database needs", has_column(fresh))
ok("the migration follows lease-to-own", migration.down_revision == "c7d1e5a9b3f2")

print()
if failures:
    print("{} check(s) failed:".format(len(failures)))
    for label in failures:
        print("  -", label)
    sys.exit(1)
print("All additional-technician checks passed")
