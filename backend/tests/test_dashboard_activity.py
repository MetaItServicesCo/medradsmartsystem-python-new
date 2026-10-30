"""The dashboard's recent-activity feed, through FastAPI's real serialiser.

This endpoint returned raw AuditLog rows inside a plain dict. FastAPI cannot
serialise an ORM object without a response model, so every request that
missed the read cache was a 500 -- and the cache could never fill to hide it,
because storing those same rows failed as well, silently, as a store_errors
metric. Production logged it as:

    PydanticSerializationError: Unable to serialize unknown type:
    <class 'app.models.audit_log.AuditLog'>
    path=/api/v1/dashboard/activity status=500

Calling the function directly does not reproduce that: the failure is in the
response pipeline. So these checks go through a real FastAPI app and a real
HTTP request, which is the only place it could ever have been caught.

    DATABASE_URL=sqlite:// python backend/tests/test_dashboard_activity.py
"""
from __future__ import annotations

import json
import os
import pathlib
import sys
from datetime import datetime

os.environ.setdefault("DATABASE_URL", "sqlite://")
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))

from fastapi import FastAPI  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from sqlalchemy import create_engine  # noqa: E402
from sqlalchemy.orm import sessionmaker  # noqa: E402
from sqlalchemy.pool import StaticPool  # noqa: E402

import app.models  # noqa: E402,F401
from app.api.v1.endpoints import dashboard  # noqa: E402
from app.core.deps import get_current_user  # noqa: E402
from app.db.base import Base, get_db  # noqa: E402
from app.models.audit_log import AuditLog  # noqa: E402
from app.models.user import User, UserRole, UserType  # noqa: E402
from app.utils import read_cache  # noqa: E402

failures: list[str] = []


def ok(label: str, condition: bool, detail: str = "") -> None:
    print("{}  {}{}".format("PASS" if condition else "FAIL", label,
                            "  " + detail if detail else ""))
    if not condition:
        failures.append(label)


engine = create_engine("sqlite://", connect_args={"check_same_thread": False},
                       poolclass=StaticPool)
Base.metadata.create_all(engine)
Session = sessionmaker(bind=engine)

seed = Session()
boss = User(username="boss", email="boss@medrad.test", full_name="Boss",
            hashed_password="x", user_type=UserType.EMPLOYEE,
            role=UserRole.SUPERADMIN, is_active=True)
worker = User(username="worker", email="worker@medrad.test", full_name="Worker",
              hashed_password="x", user_type=UserType.EMPLOYEE,
              role=UserRole.EMPLOYEE, is_active=True)
seed.add_all([boss, worker])
seed.commit()
for index, actor in enumerate([boss, worker, worker]):
    seed.add(AuditLog(table_name="facilities", record_id=index + 1, action="UPDATE",
                      changed_by_id=actor.id, changed_by_username=actor.username,
                      changes_json='{"name": "x"}',
                      timestamp=datetime(2026, 10, 27, 9, index)))
seed.commit()
BOSS_ID, WORKER_ID = boss.id, worker.id
seed.close()

current = {"user_id": BOSS_ID}


def override_db():
    db = Session()
    try:
        yield db
    finally:
        db.close()


def override_user():
    db = Session()
    try:
        user = db.get(User, current["user_id"])
        db.expunge(user)
        return user
    finally:
        db.close()


api = FastAPI()
api.include_router(dashboard.router, prefix="/api/v1/dashboard")
api.dependency_overrides[get_db] = override_db
api.dependency_overrides[get_current_user] = override_user
# The router also carries require_module_access("dashboard"), which resolves
# through get_current_user and so sees the overridden account.
client = TestClient(api, raise_server_exceptions=False)

print("Dashboard activity")
print("=" * 72)

print()
print("An uncached request is served, not a 500")
print("-" * 72)

# The cache off is the miss path: the function's raw return value goes
# straight to FastAPI, which is where production broke.
read_cache.settings.READ_CACHE_ENABLED = False

response = client.get("/api/v1/dashboard/activity")
ok("the request succeeds", response.status_code == 200,
   "{} {}".format(response.status_code, response.text[:160]))
body = response.json() if response.status_code == 200 else {}
ok("it returns the rows", len(body.get("items", [])) == 3, str(len(body.get("items", []))))
ok("  newest first",
   [i["record_id"] for i in body.get("items", [])] == [3, 2, 1],
   str([i["record_id"] for i in body.get("items", [])]))
ok("  with the fields the dashboard reads",
   body.get("items") and set(body["items"][0]) >= {
       "id", "table_name", "record_id", "action", "changed_by_username", "timestamp"},
   str(sorted(body["items"][0])) if body.get("items") else "")
ok("  the total", body.get("total") == 3)
ok("  and the scope", body.get("scope") == "global")

print()
print("The value the cache stores is plain data")
print("-" * 72)

db = Session()
try:
    raw_return = dashboard.read_dashboard_activity.__wrapped__(
        db=db, current_user=db.get(User, BOSS_ID), skip=0, limit=10,
        search=None, action=None, from_date=None, to_date=None)
finally:
    db.close()

try:
    json.dumps(raw_return)
    plain = True
except TypeError:
    plain = False
ok("it serialises with the standard library alone, no ORM objects left",
   plain, type(raw_return["items"][0]).__name__ if raw_return.get("items") else "")
ok("  timestamps are already strings, so a cache hit and a miss look the same",
   isinstance(raw_return["items"][0]["timestamp"], str))

stored = {}


class FakeRedis:
    def setex(self, key, ttl, value):
        stored[key] = value

    def set(self, key, value, ex=None):
        stored[key] = value


try:
    read_cache._store(FakeRedis(), "k", raw_return, 60)
    stored_ok = bool(stored)
except Exception as exc:                      # pragma: no cover - diagnostic
    stored_ok = False
    print("    store raised:", type(exc).__name__, exc)
ok("the read cache can actually store it now", stored_ok)
if stored:
    found, decoded = read_cache._decode(next(iter(stored.values())))
    ok("  and reads back exactly what was served", found and decoded == raw_return)

print()
print("Scope is unchanged by the fix")
print("-" * 72)

current["user_id"] = WORKER_ID
mine = client.get("/api/v1/dashboard/activity")
ok("an ordinary user's request succeeds too", mine.status_code == 200,
   "{} {}".format(mine.status_code, mine.text[:160]))
mine_body = mine.json() if mine.status_code == 200 else {}
ok("  showing only their own activity", mine_body.get("total") == 2, str(mine_body.get("total")))
ok("  every row theirs",
   all(i["changed_by_id"] == WORKER_ID for i in mine_body.get("items", [])))
ok("  labelled as their own", mine_body.get("scope") == "own")

print()
print("Filters still work")
print("-" * 72)

current["user_id"] = BOSS_ID
narrowed = client.get("/api/v1/dashboard/activity", params={"search": "boss"})
ok("search narrows", narrowed.status_code == 200 and narrowed.json().get("total") == 1,
   "{} {}".format(narrowed.status_code, narrowed.text[:120]))
inverted = client.get("/api/v1/dashboard/activity",
                      params={"from_date": "2026-10-28", "to_date": "2026-10-01"})
ok("an inverted date range is a 422, not a 500", inverted.status_code == 422,
   str(inverted.status_code))

print()
print("The rest of the dashboard serialises too")
print("-" * 72)
# The same trap -- a cached endpoint with no response model -- exists on the
# three other dashboard reads. Each is exercised for real, uncached, as both
# kinds of account, because that is the path that returned 500 here.

for account, who in ((BOSS_ID, "a super admin"), (WORKER_ID, "an ordinary user")):
    current["user_id"] = account
    for path in ("/api/v1/dashboard/summary",
                 "/api/v1/dashboard/intelligence",
                 "/api/v1/dashboard/analysis"):
        reply = client.get(path)
        ok("{} for {} is not a 500".format(path.rsplit("/", 1)[-1], who),
           reply.status_code != 500,
           "{} {}".format(reply.status_code, reply.text[:140]))
        if reply.status_code == 200:
            try:
                json.dumps(reply.json())
                parsed = True
            except (TypeError, ValueError):
                parsed = False
            ok("  and returns plain JSON", parsed)

print()
print("=" * 72)
if failures:
    print("{} failing: {}".format(len(failures), ", ".join(failures)))
    sys.exit(1)
print("All dashboard activity checks passed.")
