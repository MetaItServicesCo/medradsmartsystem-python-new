"""Phase 3: what HR and the super admin see, and live screen view.

    A. The overview and a person's day: super admin and HR only.
    B. The overview flags what needs attention: no consent, no device, a device
       silent while the person is checked in; totals and top app for the day;
       the last saved position stands in when there is no tracking Redis.
    C. A person's day: shifts, apps, timeline and route in their time zone;
       every look is in the audit log.
    D. Live screen view through a real Redis: only a consented, checked-in
       person's desktop may stream; only the super admin may watch; the agent
       captures only while someone watches; frames reach the viewer; every view
       is audited; switching it off or the agent leaving ends it.

    Needs a Redis for part D, at TEST_TRACKING_REDIS_URL
    (default redis://127.0.0.1:56379/15); part D is skipped without one.

    DATABASE_URL=sqlite:// python backend/tests/test_tracking_review.py
"""
from __future__ import annotations

import os
import pathlib
import sys
import tempfile
import time
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

os.environ.setdefault("DATABASE_URL", "sqlite://")
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))

import redis  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from sqlalchemy import create_engine, event  # noqa: E402
from sqlalchemy.orm import sessionmaker  # noqa: E402
from starlette.websockets import WebSocketDisconnect  # noqa: E402

import app.models  # noqa: E402,F401
from app.api.v1.endpoints import tracking_screen, websocket as realtime  # noqa: E402
from app.core.config import settings  # noqa: E402
from app.core.deps import get_current_user  # noqa: E402
from app.core.security import create_access_token, get_password_hash, password_token_version  # noqa: E402
from app.db.base import Base, get_db  # noqa: E402
from app.main import app  # noqa: E402
from app.models.attendance import (  # noqa: E402
    AttendanceEvent, AttendanceEventType, AttendanceSource, AttendanceVerificationStatus,
)
from app.models.audit_log import AuditLog  # noqa: E402
from app.models.facility import Facility  # noqa: E402
from app.models.tracking import (  # noqa: E402
    TRACKING_CONSENT_VERSION, TrackingActivityBlock, TrackingDevice, TrackingLocationSample, TrackingSetting,
)
from app.api.v1.endpoints.tracking import _hash_token  # noqa: E402
from app.models.user import User, UserRole, UserType  # noqa: E402
from app.utils import read_cache, tracking_live  # noqa: E402

read_cache.settings.READ_CACHE_ENABLED = False
settings.API_RATE_LIMIT = 100000
settings.TRACKING_REDIS_URL = None
tracking_live._client.cache_clear()
failures: list[str] = []


def ok(label: str, condition: bool, detail: str = "") -> None:
    print("{}  {}{}".format("PASS" if condition else "FAIL", label, "  " + str(detail) if detail else ""))
    if not condition:
        failures.append(label)


def section(title: str) -> None:
    print()
    print(title)


# A file, not one shared in-memory connection: the screen-view sockets check
# permissions from worker threads while the test reads, as Postgres would allow.
_db_file = os.path.join(tempfile.mkdtemp(prefix="tracking-review-"), "test.db")
engine = create_engine(f"sqlite:///{_db_file}", connect_args={"check_same_thread": False, "timeout": 30})


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
# The sockets open their own sessions; point them at the test database.
tracking_screen.SessionLocal = Session
realtime.SessionLocal = Session

HASH = get_password_hash("Correct-Horse-9")
NOW = datetime.utcnow()
KARACHI = ZoneInfo("Asia/Karachi")
TODAY_LOCAL = NOW.replace(tzinfo=timezone.utc).astimezone(KARACHI).date()

seed = Session()
clinic = Facility(name="Clinic A", phone="555-0101", email="a@clinic.test", address="1 A St", city="Plano",
                  state="TX", zip_code="75024", country="US")
seed.add(clinic)
seed.flush()


def person(username, role, user_type=UserType.EMPLOYEE, facility=None):
    user = User(username=username, email=username + "@medrad.test", full_name=username.title(), hashed_password=HASH,
                user_type=user_type, role=role, is_active=True, facility_id=facility.id if facility else None)
    seed.add(user)
    seed.flush()
    return user


PEOPLE = {
    "boss": person("boss", UserRole.SUPERADMIN),
    "hr": person("hr", UserRole.HR_MANAGER),
    "admin": person("admin", UserRole.ADMIN),
    "tech": person("tech", UserRole.TECHNICIAN),      # everything on, agreed, checked in, devices reporting
    "staff": person("staff", UserRole.EMPLOYEE),      # desktop on, has not agreed
    "field": person("field", UserRole.TECHNICIAN),    # location on, agreed, checked in, phone silent
    "idle": person("idle", UserRole.EMPLOYEE),        # desktop on, agreed, no device at all
    "off": person("off", UserRole.EMPLOYEE),          # screen view on, agreed, not checked in
    "plain": person("plain", UserRole.EMPLOYEE),      # not tracked
    "client": person("client", UserRole.CLIENT, UserType.CLIENT, facility=clinic),
}
IDS = {name: user.id for name, user in PEOPLE.items()}


def track(who, consent=True, **features):
    enabled = [f for f, on in features.items() if on]
    seed.add(TrackingSetting(
        user_id=IDS[who], desktop_activity=features.get("desktop_activity", False),
        location=features.get("location", False), screen_view=features.get("screen_view", False),
        consent_version=TRACKING_CONSENT_VERSION if consent else None,
        consent_features=enabled if consent else None, consent_at=NOW if consent else None,
    ))


track("tech", desktop_activity=True, location=True, screen_view=True)
track("staff", consent=False, desktop_activity=True)
track("field", location=True)
track("idle", desktop_activity=True)
track("off", screen_view=True)

TOKENS = {}


def device(who, kind, seen_ago_minutes=0, name=None):
    raw = f"trk_test_{who}_{kind}"
    TOKENS[(who, kind)] = raw
    row = TrackingDevice(user_id=IDS[who], kind=kind, name=name or f"{who} {kind}", token_hash=_hash_token(raw),
                         password_version=password_token_version(HASH), created_at=NOW - timedelta(days=1),
                         last_seen_at=NOW - timedelta(minutes=seen_ago_minutes))
    seed.add(row)
    seed.flush()
    return row


tech_desktop = device("tech", "desktop")
device("tech", "phone")
device("staff", "desktop")
device("field", "phone", seen_ago_minutes=120)
device("off", "desktop")


def mark(who, event_type, minutes_ago):
    seed.add(AttendanceEvent(user_id=IDS[who], event_type=event_type, event_time=NOW - timedelta(minutes=minutes_ago),
                             source=AttendanceSource.FACE, verification_status=AttendanceVerificationStatus.VERIFIED))


mark("tech", AttendanceEventType.CHECK_IN, 120)
mark("field", AttendanceEventType.CHECK_IN, 180)
mark("idle", AttendanceEventType.CHECK_IN, 60)


def block(who, start_ago, end_ago, app_name, keys, active=5, samples=10):
    seed.add(TrackingActivityBlock(
        user_id=IDS[who], device_id=tech_desktop.id, local_day=TODAY_LOCAL,
        started_at=NOW - timedelta(minutes=start_ago), ended_at=NOW - timedelta(minutes=end_ago), app=app_name,
        titles=[f"{app_name} window"], minutes=start_ago - end_ago, tz="Asia/Karachi", keys=keys, clicks=2,
        scrolls=1, mouse_px=10, active_samples=active, samples=samples,
    ))


block("tech", 100, 70, "Excel", 300)
block("tech", 60, 50, "Chrome", 40)
block("tech", 40, 20, "Excel", 200)
seed.add(TrackingLocationSample(user_id=IDS["field"], lat=24.86, lon=67.01, recorded_at=NOW - timedelta(minutes=3),
                                received_at=NOW))
seed.add(TrackingLocationSample(user_id=IDS["field"], lat=24.80, lon=67.00, recorded_at=NOW - timedelta(minutes=40),
                                received_at=NOW))
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
API = "/api/v1/tracking"


def as_user(who):
    current["who"] = who
    return client


def overview(who="boss"):
    return as_user(who).get(f"{API}/overview", params={"date": TODAY_LOCAL.isoformat()})


def row_of(body, who):
    return next((p for p in body["people"] if p["user_id"] == IDS[who]), None)


# ── A ──────────────────────────────────────────────────────────────────────────
section("A. Who sees it")
for who in ("admin", "tech", "plain", "client"):
    ok(f"{who} cannot see the overview", overview(who).status_code == 403)
    ok(f"{who} cannot see a person's day",
       as_user(who).get(f"{API}/people/{IDS['tech']}/day", params={"date": TODAY_LOCAL.isoformat()}).status_code == 403)
ok("HR sees the overview", overview("hr").status_code == 200)
ok("the super admin sees the overview", overview("boss").status_code == 200)
ok("HR still cannot change the switches", as_user("hr").put(f"{API}/people/{IDS['plain']}", json={}).status_code == 403)

# ── B ──────────────────────────────────────────────────────────────────────────
section("B. The overview")
body = overview().json()
names = [p["username"] for p in body["people"]]
ok("only tracked people are listed, by name", names == ["field", "idle", "off", "staff", "tech"], names)
tech = row_of(body, "tech")
ok("tech: on shift, nothing to flag", tech["on_shift"] is True and tech["warnings"] == [], tech["warnings"])
ok("tech: today's active time and input totals", tech["activity"]["minutes"] == 60 and tech["activity"]["keys"] == 540,
   tech["activity"])
ok("tech: the app used most", tech["activity"]["top_app"] == "Excel")
ok("tech: half the samples active", tech["activity"]["active_ratio"] == 0.5)
ok("staff: waiting for consent", row_of(body, "staff")["warnings"] == ["no_consent"], row_of(body, "staff")["warnings"])
ok("idle: tracked with no desktop app signed in", "no_desktop_device" in row_of(body, "idle")["warnings"])
field = row_of(body, "field")
ok("field: checked in for hours, phone silent", field["warnings"] == ["phone_silent"], field["warnings"])
ok("field: no tracking Redis, so the last saved point shows", field["position"] and field["position"]["source"] == "saved"
   and field["position"]["lat"] == 24.86, field["position"])
ok("the location switch is reported as a switch, not overwritten by the position",
   field["location"] is True and row_of(body, "staff")["location"] is False)
ok("someone with location off has no position", row_of(body, "staff")["position"] is None)
off = row_of(body, "off")
ok("off: not checked in, so a quiet device is not flagged", off["on_shift"] is False and off["warnings"] == [], off["warnings"])
ok("nobody's screen is live without the tracking Redis", not any(p["screen_live"] for p in body["people"]))

# ── C ──────────────────────────────────────────────────────────────────────────
section("C. A person's day")
response = as_user("hr").get(f"{API}/people/{IDS['tech']}/day", params={"date": TODAY_LOCAL.isoformat(), "tz": "Asia/Karachi"})
day = response.json()
ok("HR opens tech's day", response.status_code == 200, response.text[:200])
ok("apps, most used first", [a["app"] for a in day["apps"]] == ["Excel", "Chrome"] and day["apps"][0]["minutes"] == 50,
   day["apps"])
ok("the timeline in order, with titles", [b["app"] for b in day["blocks"]] == ["Excel", "Chrome", "Excel"]
   and day["blocks"][0]["titles"] == ["Excel window"])
ok("the shift is shown, still open", len(day["shifts"]) == 1 and day["shifts"][0]["open"] is True)
ok("the day's totals", day["totals"]["minutes"] == 60 and day["totals"]["keys"] == 540)
field_day = as_user("boss").get(f"{API}/people/{IDS['field']}/day", params={"date": TODAY_LOCAL.isoformat()}).json()
ok("field's route for the day, in order", [p["lat"] for p in field_day["points"]] == [24.80, 24.86], field_day["points"])
db = Session()
ok("each look is in the audit log", db.query(AuditLog).filter(AuditLog.action == "TRACKING_EVIDENCE_VIEWED").count() == 2)
db.close()
ok("an unknown time zone is refused",
   as_user("boss").get(f"{API}/people/{IDS['tech']}/day", params={"date": TODAY_LOCAL.isoformat(), "tz": "Mars/Base"}).status_code == 400)
ok("a customer's account has no day",
   as_user("boss").get(f"{API}/people/{IDS['client']}/day", params={"date": TODAY_LOCAL.isoformat()}).status_code == 404)

# ── D ──────────────────────────────────────────────────────────────────────────
section("D. Live screen view")


def closed_with(connect) -> int | None:
    try:
        with connect() as ws:
            ws.receive_text()
    except WebSocketDisconnect as exc:
        return exc.code
    return None


def agent(who="tech", kind="desktop", token=None):
    raw = token or TOKENS[(who, kind)]
    return client.websocket_connect("/api/v1/ws/tracking/agent", headers={"Authorization": f"Bearer {raw}"})


def jwt(who):
    return create_access_token({"sub": who, "ver": password_token_version(HASH)})


def viewer(who="boss", target="tech"):
    return client.websocket_connect(f"/api/v1/ws/tracking/view/{IDS[target]}/{jwt(who)}")


ok("without the tracking Redis there is no live view", closed_with(agent) == 4503)

redis_url = os.environ.get("TEST_TRACKING_REDIS_URL", "redis://127.0.0.1:56379/15")
try:
    redis.Redis.from_url(redis_url, socket_connect_timeout=1).ping()
    have_redis = True
except redis.RedisError:
    have_redis = False
    print("SKIP  part D: no Redis at", redis_url)

if have_redis:
    settings.TRACKING_REDIS_URL = redis_url
    tracking_live._client.cache_clear()
    redis.Redis.from_url(redis_url).flushdb()
    tracking_screen.RECHECK_SECONDS = 1

    ok("a made-up device token is refused", closed_with(lambda: agent(token="trk_nope")) == 4401)
    ok("a phone cannot stream a screen", closed_with(lambda: agent("tech", "phone")) == 4403)
    ok("screen view off: refused", closed_with(lambda: agent("staff")) == 4403)
    ok("not checked in: refused", closed_with(lambda: agent("off")) == 4403)
    ok("nobody to watch yet: the viewer is told", closed_with(viewer) == 4404)

    with agent() as tech_agent:
        time.sleep(0.3)
        ok("the agent connects; the overview shows the screen live", row_of(overview().json(), "tech")["screen_live"] is True)
        ok("HR cannot watch a screen", closed_with(lambda: viewer("hr")) == 4403)
        ok("an admin cannot either", closed_with(lambda: viewer("admin")) == 4403)
        ok("someone whose screen view is off cannot be watched", closed_with(lambda: viewer("boss", "staff")) == 4403)
        with viewer() as boss_view:
            ok("the super admin is watching", boss_view.receive_json() == {"status": "viewing"})
            ok("...and only now is the agent told to capture", tech_agent.receive_text() == '{"cmd":"start"}')
            tech_agent.send_bytes(b"\xff\xd8frame-one")
            ok("a frame reaches the viewer as sent", boss_view.receive_bytes() == b"\xff\xd8frame-one")
        ok("the viewer leaves: the agent is told to stop", tech_agent.receive_text() == '{"cmd":"stop"}')
        db = Session()
        actions = [row.action for row in db.query(AuditLog).filter(AuditLog.action.like("TRACKING_SCREEN_VIEW_%")).all()]
        db.close()
        ok("the view is in the audit log, start and end",
           actions == ["TRACKING_SCREEN_VIEW_STARTED", "TRACKING_SCREEN_VIEW_ENDED"], actions)

    time.sleep(0.3)
    ok("the agent left: nothing live", row_of(overview().json(), "tech")["screen_live"] is False)

    with agent() as tech_agent:
        with viewer() as boss_view:
            boss_view.receive_json()
            tech_agent.receive_text()
            tech_agent.close()
            try:
                boss_view.receive_bytes()
                code = None
            except WebSocketDisconnect as exc:
                code = exc.code
            ok("the agent goes away mid-view: the viewer is told", code == 4410, code)

    with agent() as tech_agent:
        db = Session()
        db.query(TrackingSetting).filter(TrackingSetting.user_id == IDS["tech"]).update({"screen_view": False})
        db.commit()
        db.close()
        try:
            while True:
                tech_agent.receive_text()
        except WebSocketDisconnect as exc:
            ok("switching screen view off ends the stream", exc.code == 4403, exc.code)

    redis.Redis.from_url(redis_url).flushdb()

print()
if failures:
    print(f"{len(failures)} FAILED")
    for label in failures:
        print("  -", label)
    sys.exit(1)
print("ALL PASSED")
