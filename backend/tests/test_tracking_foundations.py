"""Tracking merged in from Tracker: switches, consent, devices, evidence.

Through the full application:

    A. Only a super admin sets who is tracked; customers' accounts cannot be.
    B. The person sees what is on and must consent; a newly switched-on
       feature, or a new notice, asks again.
    C. A device signs in with the person's password, only when something it
       collects is switched on; customers and wrong passwords are refused.
    D. A device token dies when revoked, signed out, the person deactivated or
       locked, or their password changed.
    E. Desktop activity: only with the switch and consent, only from a desktop,
       only while checked in (breaks excluded); idempotent; a day resent
       replaces only recent days and only this device's blocks.
    F. Location: only from a phone, only while checked in, thinned to one point
       per few minutes; a resent batch adds nothing; the live point goes to the
       tracking Redis, and without it nothing breaks.
    G. A rejected check-in does not open a shift.
    H. Evidence past its retention is deleted.

    DATABASE_URL=sqlite:// python backend/tests/test_tracking_foundations.py
"""
from __future__ import annotations

import os
import pathlib
import sys
from datetime import date, datetime, timedelta, timezone

os.environ.setdefault("DATABASE_URL", "sqlite://")
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))

from fastapi.testclient import TestClient  # noqa: E402
from sqlalchemy import create_engine, event  # noqa: E402
from sqlalchemy.orm import sessionmaker  # noqa: E402
from sqlalchemy.pool import StaticPool  # noqa: E402

import app.models  # noqa: E402,F401
from app.core.config import settings  # noqa: E402
from app.core.deps import get_current_user  # noqa: E402
from app.core.security import get_password_hash  # noqa: E402
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
from app.models.user import User, UserRole, UserType  # noqa: E402
from app.utils import read_cache, tracking_live  # noqa: E402

read_cache.settings.READ_CACHE_ENABLED = False
settings.API_RATE_LIMIT = 100000
failures: list[str] = []


def ok(label: str, condition: bool, detail: str = "") -> None:
    print("{}  {}{}".format("PASS" if condition else "FAIL", label, "  " + str(detail) if detail else ""))
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

PASSWORD = "Correct-Horse-9"
HASH = get_password_hash(PASSWORD)

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
    "admin": person("admin", UserRole.ADMIN),
    "hr": person("hr", UserRole.HR_MANAGER),
    "tech": person("tech", UserRole.TECHNICIAN),
    "staff": person("staff", UserRole.EMPLOYEE),
    "facadmin": person("facadmin", UserRole.FACILITY_ADMIN, facility=clinic),
    "client": person("client", UserRole.CLIENT, UserType.CLIENT, facility=clinic),
}
seed.commit()
IDS = {name: user.id for name, user in PEOPLE.items()}

NOW = datetime.utcnow()


def mark(who, event_type, minutes_ago, status=AttendanceVerificationStatus.VERIFIED):
    seed.add(AttendanceEvent(
        user_id=IDS[who], event_type=event_type, event_time=NOW - timedelta(minutes=minutes_ago),
        source=AttendanceSource.FACE, verification_status=status,
    ))


# tech: checked in 3 hours ago, on a break from 90 to 80 minutes ago, still in.
mark("tech", AttendanceEventType.CHECK_IN, 180)
mark("tech", AttendanceEventType.BREAK_START, 90)
mark("tech", AttendanceEventType.BREAK_END, 80)
# staff: a check-in HR rejected - no shift.
mark("staff", AttendanceEventType.CHECK_IN, 120, AttendanceVerificationStatus.REJECTED)
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


def switches(who, by="boss", **features):
    body = {"desktop_activity": False, "location": False, "screen_view": False, **features}
    return as_user(by).put(f"{API}/people/{IDS[who]}", json=body)


def device_login(who, kind, password=PASSWORD, name="Laptop"):
    return client.post(f"{API}/device/login", json={
        "username": who, "password": password, "kind": kind, "name": name, "os_name": "Windows 11",
    })


def dev(token):
    return {"Authorization": f"Bearer {token}"}


def iso(moment: datetime) -> str:
    return moment.replace(tzinfo=timezone.utc).isoformat()


def block(start_ago, end_ago, app_name="Excel", keys=10):
    started = NOW - timedelta(minutes=start_ago)
    ended = NOW - timedelta(minutes=end_ago)
    return {
        "started_at": iso(started), "ended_at": iso(ended), "app": app_name, "titles": ["Q3 budget.xlsx"],
        "minutes": int((ended - started).total_seconds() // 60), "tz": "Asia/Karachi",
        "local_day": started.date().isoformat(), "keys": keys, "clicks": 4, "scrolls": 2, "mouse_px": 900,
        "active_samples": 5, "samples": 6,
    }


def ping(minutes_ago, lat=24.86, lon=67.0):
    return {"lat": lat, "lon": lon, "accuracy_m": 8, "speed_mps": 1.2, "heading_deg": 90,
            "recorded_at": iso(NOW - timedelta(minutes=minutes_ago))}


def rows(model, who):
    db = Session()
    try:
        return db.query(model).filter(model.user_id == IDS[who]).all()
    finally:
        db.close()


# ── A ──────────────────────────────────────────────────────────────────────────
section("A. Who sets the switches")
for who in ("admin", "hr", "tech", "client"):
    ok(f"{who} cannot list tracked people", as_user(who).get(f"{API}/people").status_code == 403)
    ok(f"{who} cannot switch tracking on", switches("tech", by=who, location=True).status_code == 403)
response = as_user("boss").get(f"{API}/people")
listed = {row["username"] for row in response.json()} if response.status_code == 200 else set()
ok("super admin lists staff", response.status_code == 200 and {"tech", "staff", "hr", "boss"} <= listed, response.status_code)
ok("customers' accounts are not listed", not ({"facadmin", "client"} & listed))
ok("search narrows the list", [r["username"] for r in as_user("boss").get(f"{API}/people?search=TEC").json()] == ["tech"])
response = switches("tech", desktop_activity=True, location=True)
ok("super admin switches tech's desktop activity and location on",
   response.status_code == 200 and response.json()["desktop_activity"] and response.json()["location"]
   and not response.json()["screen_view"], response.text[:200])
ok("...and tech now needs to consent", response.json().get("consent_required") is True)
ok("a facility admin cannot be tracked", switches("facadmin", location=True).status_code == 400)
ok("a client cannot be tracked", switches("client", location=True).status_code == 400)
ok("an unknown person is 404", as_user("boss").put(f"{API}/people/99999", json={}).status_code == 404)
db = Session()
logs = db.query(AuditLog).filter(AuditLog.action == "TRACKING_SETTINGS_UPDATED").all()
db.close()
ok("the change is in the audit log with before and after", len(logs) == 1 and '"before"' in logs[0].changes_json)
switches("tech", desktop_activity=True, location=True)
db = Session()
ok("saving the same switches again logs nothing", db.query(AuditLog).filter(AuditLog.action == "TRACKING_SETTINGS_UPDATED").count() == 1)
db.close()

# ── B ──────────────────────────────────────────────────────────────────────────
section("B. Seeing it and consenting")
me = as_user("tech").get(f"{API}/me").json()
ok("tech sees what is on", me["features"] == {"desktop_activity": True, "location": True, "screen_view": False})
ok("tech must consent", me["consent_required"] is True and me["consent_version"] == TRACKING_CONSENT_VERSION)
ok("the notice names what is on, and not what is off",
   "Desktop activity" in me["consent_text"] and "Location" in me["consent_text"] and "Screen view" not in me["consent_text"])
ok("the notice says pay is not affected and nothing is collected off shift",
   "does not affect your pay" in me["consent_text"] and "not checked in" in me["consent_text"])
ok("tech is on shift", me["on_shift"] is True)
staff_me = as_user("staff").get(f"{API}/me").json()
ok("someone not tracked has nothing to consent to", staff_me["tracked"] is False and staff_me["consent_required"] is False)
ok("a client's own view is simply not tracked", as_user("client").get(f"{API}/me").json()["tracked"] is False)
ok("consenting with nothing on is refused",
   as_user("staff").post(f"{API}/me/consent", json={"version": TRACKING_CONSENT_VERSION}).status_code == 400)
ok("a client cannot consent", as_user("client").post(f"{API}/me/consent", json={"version": TRACKING_CONSENT_VERSION}).status_code == 403)
ok("consenting to an old notice is refused",
   as_user("tech").post(f"{API}/me/consent", json={"version": "2020-01"}).status_code == 409)
response = as_user("tech").post(f"{API}/me/consent", json={"version": TRACKING_CONSENT_VERSION})
ok("tech consents", response.status_code == 200 and response.json()["consent_required"] is False, response.text[:200])
switches("tech", desktop_activity=True, location=True, screen_view=True)
ok("switching on screen view asks again", as_user("tech").get(f"{API}/me").json()["consent_required"] is True)
as_user("tech").post(f"{API}/me/consent", json={"version": TRACKING_CONSENT_VERSION})
ok("...and consenting covers it", as_user("tech").get(f"{API}/me").json()["consent_required"] is False)
switches("tech", desktop_activity=True, location=True)
ok("switching something off does not ask again", as_user("tech").get(f"{API}/me").json()["consent_required"] is False)

# ── C ──────────────────────────────────────────────────────────────────────────
section("C. Signing a device in")
ok("a wrong password is refused", device_login("tech", "phone", password="nope").status_code == 401)
ok("an unknown person is refused", device_login("ghost", "phone").status_code == 401)
ok("nothing switched on: refused", device_login("staff", "desktop").status_code == 403)
ok("a facility admin is refused", device_login("facadmin", "desktop").status_code == 403)
switches("hr", location=True)
ok("only location on: a desktop is refused", device_login("hr", "desktop").status_code == 403)
switches("hr")
response = device_login("tech", "phone", name="Tech's phone")
phone = response.json().get("device_token", "")
ok("tech's phone signs in", response.status_code == 200 and phone.startswith("trk_"), response.text[:200])
ok("...told it should track now", response.json().get("should_track") is True and response.json().get("on_shift") is True)
ok("the token is kept only as a hash", all(phone not in (d.token_hash or "") for d in rows(TrackingDevice, "tech")))
desktop = device_login("tech", "desktop").json()["device_token"]
ok("tech's laptop signs in", desktop.startswith("trk_") and desktop != phone)
db = Session()
ok("each sign-in is in the audit log", db.query(AuditLog).filter(AuditLog.action == "TRACKING_DEVICE_LOGIN").count() == 2)
db.close()
ok("a device reads its state", client.get(f"{API}/device/state", headers=dev(phone)).json().get("kind") == "phone")
extra = [device_login("tech", "desktop", name=f"Spare {n}").json()["device_token"] for n in range(4)]
ok("a sixth device retires the oldest", client.get(f"{API}/device/state", headers=dev(phone)).status_code == 401)
ok("...and the others still work", client.get(f"{API}/device/state", headers=dev(desktop)).status_code == 200)
ok("at most five active devices", sum(1 for d in rows(TrackingDevice, "tech") if d.revoked_at is None) == 5)
phone = device_login("tech", "phone", name="Tech's phone").json()["device_token"]
devices = as_user("boss").get(f"{API}/people/{IDS['tech']}/devices").json()
ok("the super admin sees tech's devices", len(devices) == 7 and "token_hash" not in devices[0])
ok("tech cannot see the device list", as_user("tech").get(f"{API}/people/{IDS['tech']}/devices").status_code == 403)

# ── D ──────────────────────────────────────────────────────────────────────────
section("D. When a device token stops working")
ok("no token: refused", client.get(f"{API}/device/state").status_code == 401)
ok("a made-up token: refused", client.get(f"{API}/device/state", headers=dev("trk_madeup")).status_code == 401)
ok("a web session token is not a device token",
   client.get(f"{API}/device/state", headers=dev("eyJhbGciOiJIUzI1NiJ9.e30.x")).status_code == 401)
spare = extra[-1]
spare_id = next(d["id"] for d in devices if d["name"] == "Spare 3")
ok("only the super admin revokes", as_user("tech").post(f"{API}/devices/{spare_id}/revoke").status_code == 403)
ok("super admin revokes a device", as_user("boss").post(f"{API}/devices/{spare_id}/revoke").json()["revoked_at"] is not None)
ok("...and it is signed out", client.get(f"{API}/device/state", headers=dev(spare)).status_code == 401)
ok("a device signs itself out", client.post(f"{API}/device/logout", headers=dev(extra[-2])).status_code == 200)
ok("...and stays signed out", client.get(f"{API}/device/state", headers=dev(extra[-2])).status_code == 401)
def set_tech(**fields):
    db = Session()
    user = db.get(User, IDS["tech"])
    for field, value in fields.items():
        setattr(user, field, value)
    db.commit()
    db.close()


ok("re-signing the phone in retired the oldest device, the first laptop",
   client.get(f"{API}/device/state", headers=dev(desktop)).status_code == 401)
desktop = device_login("tech", "desktop").json()["device_token"]
ok("a freshly signed-in laptop works", client.get(f"{API}/device/state", headers=dev(desktop)).status_code == 200)
set_tech(is_active=False)
ok("deactivating tech signs every device out", client.get(f"{API}/device/state", headers=dev(desktop)).status_code == 401)
set_tech(is_active=True, is_locked=True)
ok("locking tech does too", client.get(f"{API}/device/state", headers=dev(desktop)).status_code == 401)
set_tech(is_locked=False)
ok("unlocked, the device works again", client.get(f"{API}/device/state", headers=dev(desktop)).status_code == 200)
set_tech(hashed_password=get_password_hash("A-New-Password-7"))
ok("a password change signs every device out", client.get(f"{API}/device/state", headers=dev(desktop)).status_code == 401)
ok("...and the phone too", client.get(f"{API}/device/state", headers=dev(phone)).status_code == 401)
set_tech(hashed_password=HASH)
phone = device_login("tech", "phone", name="Tech's phone").json()["device_token"]
desktop = device_login("tech", "desktop").json()["device_token"]

# ── E ──────────────────────────────────────────────────────────────────────────
section("E. Desktop activity")
on_shift = block(60, 50, "Excel")
in_break = block(88, 82, "Chrome")
before_shift = block(240, 210, "Steam")
response = client.post(f"{API}/device/activity", headers=dev(desktop), json={"blocks": [on_shift, in_break, before_shift]})
body = response.json()
ok("only the block worked on shift is kept", response.status_code == 200 and body.get("stored") == 1
   and body.get("skipped_off_shift") == 2, body)
kept = rows(TrackingActivityBlock, "tech")
ok("...it is the Excel block, with counts and titles",
   len(kept) == 1 and kept[0].app == "Excel" and kept[0].keys == 10 and kept[0].titles == ["Q3 budget.xlsx"])
body = client.post(f"{API}/device/activity", headers=dev(desktop), json={"blocks": [on_shift]}).json()
ok("resending it changes nothing", body.get("stored") == 0 and body.get("updated") == 0, body)
grown = block(60, 45, "Excel", keys=25)
body = client.post(f"{API}/device/activity", headers=dev(desktop), json={"blocks": [grown]}).json()
ok("a block that grew is updated", body.get("updated") == 1 and rows(TrackingActivityBlock, "tech")[0].keys == 25, body)
ok("a phone cannot send desktop activity",
   client.post(f"{API}/device/activity", headers=dev(phone), json={"blocks": [on_shift]}).status_code == 400)
too_many = {"blocks": [on_shift] * 2001}
ok("an oversized batch is refused", client.post(f"{API}/device/activity", headers=dev(desktop), json=too_many).status_code == 422)
bad = dict(on_shift, ended_at=iso(NOW - timedelta(minutes=70)))
ok("a block ending before it starts is refused",
   client.post(f"{API}/device/activity", headers=dev(desktop), json={"blocks": [bad]}).status_code == 422)
future = block(-60, -70)
body = client.post(f"{API}/device/activity", headers=dev(desktop), json={"blocks": [future]}).json()
ok("a block in the future is not stored", body.get("stored") == 0, body)

# another laptop's block today, and an old block, to prove what a resent day may remove
desktop_id = client.get(f"{API}/device/state", headers=dev(desktop)).json()["device_id"]
db = Session()
other = TrackingDevice(user_id=IDS["tech"], kind="desktop", name="Other laptop", token_hash="0" * 64,
                       password_version="x", created_at=NOW)
db.add(other)
db.flush()
today = (NOW - timedelta(minutes=30)).date()
db.add(TrackingActivityBlock(user_id=IDS["tech"], device_id=other.id, local_day=today,
                             started_at=NOW - timedelta(minutes=30), ended_at=NOW - timedelta(minutes=20), app="Word",
                             titles=[], minutes=10, keys=0, clicks=0, scrolls=0, mouse_px=0, active_samples=0, samples=0))
old_day = (NOW - timedelta(days=10)).date()
db.add(TrackingActivityBlock(user_id=IDS["tech"], device_id=desktop_id, local_day=old_day,
                             started_at=NOW - timedelta(days=10), ended_at=NOW - timedelta(days=10) + timedelta(minutes=5),
                             app="Old", titles=[], minutes=5, keys=0, clicks=0, scrolls=0, mouse_px=0,
                             active_samples=0, samples=0))
db.commit()
db.close()
body = client.post(f"{API}/device/activity", headers=dev(desktop),
                   json={"blocks": [], "days": [today.isoformat(), old_day.isoformat()]}).json()
apps = sorted(row.app for row in rows(TrackingActivityBlock, "tech"))
ok("a resent day removes this laptop's block no longer reported", body.get("removed") == 1 and "Excel" not in apps, body)
ok("...but not another laptop's block", "Word" in apps)
ok("...and an older day cannot be rewritten", "Old" in apps)

switches("staff", desktop_activity=True)
staff_desktop = device_login("staff", "desktop").json()["device_token"]
ok("without consent nothing is accepted",
   client.post(f"{API}/device/activity", headers=dev(staff_desktop), json={"blocks": [on_shift]}).status_code == 403)
response = client.post(f"{API}/device/consent", headers=dev(staff_desktop), json={"version": TRACKING_CONSENT_VERSION})
ok("the person can consent from the device", response.status_code == 200 and response.json()["consent_required"] is False)

# ── G ──────────────────────────────────────────────────────────────────────────
section("G. A rejected check-in is not a shift")
body = client.post(f"{API}/device/activity", headers=dev(staff_desktop), json={"blocks": [on_shift]}).json()
ok("staff's block is skipped: their only check-in was rejected", body.get("stored") == 0 and body.get("skipped_off_shift") == 1, body)
state = client.get(f"{API}/device/state", headers=dev(staff_desktop)).json()
ok("...and their device is told not to track", state["on_shift"] is False and state["should_track"] is False)

switches("tech", location=True)
ok("switching desktop activity off stops uploads",
   client.post(f"{API}/device/activity", headers=dev(desktop), json={"blocks": [on_shift]}).status_code == 403)
switches("tech", desktop_activity=True, location=True)

# ── F ──────────────────────────────────────────────────────────────────────────
section("F. Location")
pings = [ping(minutes) for minutes in range(25, 5, -1)]  # every minute from 25 to 6 minutes ago
body = client.post(f"{API}/device/location", headers=dev(phone), json={"pings": pings}).json()
ok("twenty fixes a minute apart keep one point per five minutes", body.get("stored") == 4, body)
body = client.post(f"{API}/device/location", headers=dev(phone), json={"pings": pings}).json()
ok("resending the batch adds nothing", body.get("stored") == 0, body)
body = client.post(f"{API}/device/location", headers=dev(phone), json={"pings": [ping(85), ping(200)]}).json()
ok("fixes during the break and before check-in are dropped", body.get("stored") == 0 and body.get("skipped_off_shift") == 2, body)
ok("a laptop cannot send location",
   client.post(f"{API}/device/location", headers=dev(desktop), json={"pings": pings}).status_code == 400)
ok("a fix off the globe is refused",
   client.post(f"{API}/device/location", headers=dev(phone), json={"pings": [ping(3, lat=95)]}).status_code == 422)
ok("more than 500 fixes is refused",
   client.post(f"{API}/device/location", headers=dev(phone), json={"pings": [ping(3)] * 501}).status_code == 422)
ok("no tracking Redis: live position is skipped, nothing breaks", tracking_live.live_locations([IDS["tech"]]) == {})


class FakeRedis:
    def __init__(self):
        self.data = {}

    def setex(self, key, ttl, value):
        self.data[key] = value

    def mget(self, keys):
        return [self.data.get(key) for key in keys]

    def delete(self, key):
        self.data.pop(key, None)

    def set(self, key, value, nx=False, ex=None):
        if nx and key in self.data:
            return None
        self.data[key] = value
        return True


fake = FakeRedis()
original_client = tracking_live._client
tracking_live._client = lambda: fake
body = client.post(f"{API}/device/location", headers=dev(phone), json={"pings": [ping(2, lat=24.9)]}).json()
live = tracking_live.live_locations([IDS["tech"]])
ok("with the tracking Redis the latest point is live", live.get(IDS["tech"], {}).get("lat") == 24.9, live)
switches("tech", desktop_activity=True)
ok("switching location off clears the live point", tracking_live.live_locations([IDS["tech"]]) == {})
ok("...and stops uploads", client.post(f"{API}/device/location", headers=dev(phone), json={"pings": [ping(1)]}).status_code == 403)
tracking_live._client = original_client
switches("tech", desktop_activity=True, location=True)

# ── H ──────────────────────────────────────────────────────────────────────────
section("H. Retention")
phone_id = client.get(f"{API}/device/state", headers=dev(phone)).json()["device_id"]
db = Session()
ancient = NOW - timedelta(days=settings.TRACKING_ACTIVITY_RETENTION_DAYS + 5)
db.add(TrackingActivityBlock(user_id=IDS["tech"], device_id=desktop_id, local_day=ancient.date(), started_at=ancient,
                             ended_at=ancient + timedelta(minutes=5), app="Ancient", titles=[], minutes=5, keys=0,
                             clicks=0, scrolls=0, mouse_px=0, active_samples=0, samples=0))
db.add(TrackingLocationSample(user_id=IDS["tech"], device_id=phone_id, lat=1, lon=1,
                              recorded_at=NOW - timedelta(days=settings.TRACKING_LOCATION_RETENTION_DAYS + 2),
                              received_at=NOW))
db.commit()
db.close()
tracking_live._last_local_prune = 0.0
client.post(f"{API}/device/location", headers=dev(phone), json={"pings": [ping(1)]})
ok("activity past its retention is deleted", "Ancient" not in [row.app for row in rows(TrackingActivityBlock, "tech")])
ok("location past its retention is deleted",
   all(row.lat != 1 for row in rows(TrackingLocationSample, "tech")) and len(rows(TrackingLocationSample, "tech")) >= 4)
ok("recent evidence is kept", "Old" in [row.app for row in rows(TrackingActivityBlock, "tech")])

print()
if failures:
    print(f"{len(failures)} FAILED")
    for label in failures:
        print("  -", label)
    sys.exit(1)
print("ALL PASSED")
