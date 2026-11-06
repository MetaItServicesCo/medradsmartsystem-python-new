"""Self check-in, the manual fallback, and attendance that cannot be faked.

Through the full application, with the face engine replaced by a stand-in
whose verdicts the test chooses (the real one needs OpenCV models):

    A. Who may mark: staff yes, customers' accounts (facility, client) no.
    B. By face: verified only when the photo matches the person's OWN enrolment
       and passes liveness; otherwise nothing is recorded and a manual mark is
       offered. Location, photo and server time are kept.
    C. By hand: needs a note; counts, flagged for HR, with the photo.
    D. The loophole: an employee can no longer give themselves a back-dated,
       "face" or "verified" record through the plain attendance endpoint.
    E. A record HR rejects no longer counts towards worked hours.

    DATABASE_URL=sqlite:// python backend/tests/test_attendance_self_checkin.py
"""
from __future__ import annotations

import os
import pathlib
import sys
import tempfile
from datetime import date, datetime, timedelta

os.environ.setdefault("DATABASE_URL", "sqlite://")
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))

from fastapi.testclient import TestClient  # noqa: E402
from sqlalchemy import create_engine, event  # noqa: E402
from sqlalchemy.orm import sessionmaker  # noqa: E402
from sqlalchemy.pool import StaticPool  # noqa: E402

import app.models  # noqa: E402,F401
from app.api.v1.endpoints import attendance  # noqa: E402
from app.core.config import settings  # noqa: E402
from app.core.deps import get_current_user  # noqa: E402
from app.db.base import Base, get_db  # noqa: E402
from app.main import app  # noqa: E402
from app.models.attendance import AttendanceEvent, AttendanceFaceStatus, AttendanceProfile  # noqa: E402
from app.models.facility import Facility  # noqa: E402
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
    "boss": person("boss", UserRole.SUPERADMIN),
    "hr": person("hr", UserRole.HR_MANAGER),
    "tech": person("tech", UserRole.TECHNICIAN),
    "staff": person("staff", UserRole.EMPLOYEE),
    "newbie": person("newbie", UserRole.EMPLOYEE),
    "facadmin": person("facadmin", UserRole.FACILITY_ADMIN, facility=clinic),
    "client": person("client", UserRole.CLIENT, UserType.CLIENT, facility=clinic),
}
# tech and staff have enrolled faces; newbie does not.
TECH_FACE, STAFF_FACE = [1.0, 0.0, 0.0], [0.0, 1.0, 0.0]
for name, face in (("tech", TECH_FACE), ("staff", STAFF_FACE)):
    # Enrolled long ago: the register counts days only from enrolment.
    seed.add(AttendanceProfile(user_id=PEOPLE[name].id, employee_code=name, face_status=AttendanceFaceStatus.ENROLLED,
                               face_samples_count=3, face_embedding=face, created_at=datetime(2026, 1, 1)))
seed.commit()
IDS = {name: user.id for name, user in PEOPLE.items()}
seed.close()

# ── a face engine whose verdicts the test chooses ──────────────────────────────
# The "photo" bytes name whose face is in it: b"face:tech", b"face:staff",
# b"noface", b"face:tech:spoof" (a screen or print, which fails liveness).
FACES = {"tech": TECH_FACE, "staff": STAFF_FACE}
photo_dir = tempfile.mkdtemp(prefix="attendance-test-")
attendance.ATTENDANCE_UPLOAD_DIR = photo_dir
attendance._read_upload_image = lambda file: (file.file.read().decode(), b"stored-photo")


def fake_extract(image):
    if not image.startswith("face:"):
        return None, None, [], None
    who = image.split(":")[1]
    return FACES[who], {"x": 0, "y": 0, "width": 10, "height": 10, "confidence": 0.99}, [], image


attendance._extract_embedding = fake_extract
attendance.face_engine.similarity = lambda a, b: float(sum(x * y for x, y in zip(a, b)))
attendance.face_engine.liveness = lambda image, face: 0.0 if str(face).endswith(":spoof") else 1.0
settings.FACE_LIVENESS_MODE = "advisory"

current = {"who": "tech"}


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


def check(who, event_type="check_in", photo=None, **form):
    files = {"file": ("photo.jpg", photo, "image/jpeg")} if photo is not None else None
    data = {"event_type": event_type, **{k: str(v) for k, v in form.items()}}
    return as_user(who).post("/api/v1/attendance/me/check", data=data, files=files)


def events_of(who):
    db = Session()
    try:
        return db.query(AttendanceEvent).filter(AttendanceEvent.user_id == IDS[who]).order_by(AttendanceEvent.id).all()
    finally:
        db.close()


def clear(who):
    db = Session()
    db.query(AttendanceEvent).filter(AttendanceEvent.user_id == IDS[who]).delete()
    db.commit()
    db.close()


# ── the address lookup: never the real OpenStreetMap from a test ────────────────
from app.utils import geocode  # noqa: E402

geocode.SessionLocal = Session
geocode._MIN_INTERVAL_SECONDS = 0
lookups: list[tuple[float, float]] = []
geocoder = {"fail": False}


class _FakeResponse:
    def __init__(self, lat, lon):
        self.lat, self.lon = lat, lon

    def raise_for_status(self):
        if geocoder["fail"]:
            raise RuntimeError("geocoder down")

    def json(self):
        return {"display_name": f"Place at {self.lat:.4f},{self.lon:.4f}"}


def _fake_get(url, params=None, headers=None, timeout=None):
    lookups.append((params["lat"], params["lon"]))
    assert headers and headers.get("User-Agent", "").startswith("MedRad/"), "the lookup must name the application"
    return _FakeResponse(params["lat"], params["lon"])


geocode.httpx.get = _fake_get
# The geocoding worker, run by hand once each request has returned.
queued: list = []
geocode._submit = lambda fn, *args: queued.append((fn, args))


def drain():
    while queued:
        fn, args = queued.pop(0)
        fn(*args)

print("Self check-in")
print("=" * 72)

# ── A. who may mark ──────────────────────────────────────────────────────────
section("A. Who may mark attendance")
for who in ("facadmin", "client"):
    ok(f"{who} (a customer account) cannot mark attendance", check(who, photo=b"face:tech").status_code == 403)
    ok(f"  nor read a status", as_user(who).get("/api/v1/attendance/me/status").status_code == 403)
r = as_user("tech").get("/api/v1/attendance/me/status")
ok("a technician sees their status: enrolled, nothing marked yet",
   r.status_code == 200 and r.json() == {"face_enrolled": True, "last_event": None}, r.text[:120])
ok("an employee without enrolment is told so", as_user("newbie").get("/api/v1/attendance/me/status").json()["face_enrolled"] is False)

# ── B. by face ───────────────────────────────────────────────────────────────
section("B. By face")
before = datetime.utcnow()
r = check("tech", photo=b"face:tech", latitude=33.6844, longitude=73.0479, location_accuracy_m=12.5,
          device_timezone="Asia/Karachi")
body = r.json()
ok("the technician's own face checks them in", r.status_code == 200 and body.get("recorded") is True
   and body.get("verification_status") == "verified", r.text[:160])
saved = events_of("tech")[-1] if events_of("tech") else None
ok("  verified, by face, with the confidence", saved is not None and saved.source.value == "face"
   and saved.verification_status.value == "verified" and saved.confidence == 1.0)
ok("  with where it was marked", saved is not None and (saved.latitude, saved.longitude, saved.location_accuracy_m) == (33.6844, 73.0479, 12.5))
ok("  with the photo kept", saved is not None and bool(saved.image_url) and os.listdir(photo_dir))
ok("  at the server's time, in the phone's time zone", saved is not None and saved.event_time >= before
   and saved.timezone == "Asia/Karachi")
r = check("tech", photo=b"face:tech")
ok("marking the same again within a minute is not a second record", r.json().get("duplicate") is True and len(events_of("tech")) == 1)
r = check("staff", photo=b"face:tech")
ok("someone else's face does NOT check you in", r.json().get("recorded") is False and r.json().get("reason") == "not_matched"
   and r.json().get("can_mark_manually") is True and events_of("staff") == [], r.text[:120])
r = check("tech", event_type="check_out", photo=b"face:tech:spoof")
ok("a photo of a screen or print is not accepted", r.json().get("recorded") is False and r.json().get("reason") == "liveness"
   and len(events_of("tech")) == 1, r.text[:120])
r = check("tech", event_type="check_out", photo=b"noface")
ok("a photo with no face is not accepted", r.json().get("reason") == "no_face" and len(events_of("tech")) == 1)
r = check("newbie", photo=b"face:staff")
ok("without an enrolment, the face path records nothing and offers a manual mark",
   r.json().get("reason") == "not_enrolled" and r.json().get("can_mark_manually") is True and events_of("newbie") == [])
ok("the face path needs a photo", check("tech", event_type="break_start").status_code == 400)
ok("a location out of range is refused", check("tech", event_type="break_start", photo=b"face:tech", latitude=123, longitude=0).status_code == 400)
r = as_user("tech").get("/api/v1/attendance/me/status")
ok("the status shows the last mark", r.json()["last_event"]["event_type"] == "check_in")

# ── C. by hand ───────────────────────────────────────────────────────────────
section("C. By hand when the face check does not pass")
ok("a manual mark needs a note", check("staff", photo=b"face:tech", manual="true").status_code == 400)
ok("  a one-letter note is not enough", check("staff", photo=b"face:tech", manual="true", note="x").status_code == 400)
r = check("staff", photo=b"face:tech", manual="true", note="Camera kept failing in the basement",
          latitude=33.7, longitude=73.1)
saved = events_of("staff")[-1] if events_of("staff") else None
ok("with a note it is marked, flagged for HR", r.json().get("recorded") is True and r.json().get("verification_status") == "needs_review", r.text[:160])
ok("  as manual, needing review", saved is not None and saved.source.value == "manual" and saved.verification_status.value == "needs_review")
ok("  with the employee's note kept apart from HR's remark", saved is not None and saved.employee_note == "Camera kept failing in the basement"
   and "needs HR review" in (saved.remark or ""))
ok("  with the photo for HR", saved is not None and bool(saved.image_url))
ok("  and how close the photo came, for HR", saved is not None and saved.confidence == 0.0)
r = check("newbie", manual="true", note="No camera on this laptop")
saved = events_of("newbie")[-1] if events_of("newbie") else None
ok("without any photo it can still be marked by hand, flagged", r.json().get("recorded") is True and saved is not None
   and saved.image_url is None and "without a photo" in (saved.remark or ""))

# ── C2. the photo is private ─────────────────────────────────────────────────
section("C2. Who may see a check-in photo")
staff_event = next(e for e in events_of("staff") if e.image_url)
newbie_event = events_of("newbie")[-1]


def photo(who, event_id):
    return as_user(who).get(f"/api/v1/attendance/events/{event_id}/photo")


r = photo("staff", staff_event.id)
ok("the employee sees their own photo", r.status_code == 200 and r.content == b"stored-photo"
   and "no-store" in r.headers.get("cache-control", ""), str(r.status_code))
ok("HR sees it", photo("hr", staff_event.id).status_code == 200)
ok("an admin sees it", photo("boss", staff_event.id).status_code == 200)
for who in ("newbie", "tech", "facadmin", "client"):
    ok(f"{who} cannot see someone else's photo (same 404 as a missing one)", photo(who, staff_event.id).status_code == 404)
ok("a mark without a photo has none to show", photo("hr", newbie_event.id).status_code == 404)
ok("an unknown mark is a 404", photo("hr", 999999).status_code == 404)
public = as_user("hr").get(staff_event.image_url)
ok("the public uploads address still never serves it", public.status_code == 404, f"{staff_event.image_url} -> {public.status_code}")

# ── D. the loophole ──────────────────────────────────────────────────────────
section("D. No more self-awarded verified hours")
yesterday = (datetime.utcnow() - timedelta(days=1)).replace(microsecond=0).isoformat()
r = as_user("staff").post("/api/v1/attendance/events", json={
    "event_type": "check_in", "event_time": yesterday, "source": "face", "verification_status": "verified",
    "remark": "I was here, trust me"})
saved = events_of("staff")[-1] if events_of("staff") else None
ok("an employee's own record is accepted", r.status_code == 200, str(r.status_code))
ok("  but as manual, needing review - not 'face', not 'verified'", saved is not None and saved.source.value == "manual"
   and saved.verification_status.value == "needs_review")
ok("  at the server's time, not the back-dated one", saved is not None and saved.event_time > datetime.utcnow() - timedelta(minutes=5))
ok("  with their text kept as their note", saved is not None and saved.employee_note == "I was here, trust me")
r = as_user("staff").post("/api/v1/attendance/events", json={"event_type": "check_in", "user_id": IDS["tech"]})
ok("an employee cannot mark attendance for someone else", r.status_code == 403, str(r.status_code))
r = as_user("hr").post("/api/v1/attendance/events", json={
    "event_type": "check_in", "user_id": IDS["tech"], "event_time": yesterday, "source": "admin",
    "verification_status": "verified", "remark": "Corrected by HR"})
saved = events_of("tech")[-1]
ok("HR can still record a corrected, verified entry for someone", r.status_code == 200 and saved.source.value == "admin"
   and saved.verification_status.value == "verified" and saved.event_time.isoformat().startswith(yesterday[:13]), r.text[:120])

# ── E. rejected records do not count ─────────────────────────────────────────
section("E. A rejected record no longer counts")
clear("tech")
day = date.today() - timedelta(days=3)
for kind, hour in (("check_in", 4), ("check_out", 12)):
    as_user("hr").post("/api/v1/attendance/events", json={
        "event_type": kind, "user_id": IDS["tech"], "event_time": datetime(day.year, day.month, day.day, hour).isoformat(),
        "source": "admin", "verification_status": "verified", "timezone": "UTC"})


def worked():
    r = as_user("hr").get("/api/v1/attendance/register", params={
        "date_from": day.isoformat(), "date_to": day.isoformat(), "user_id": IDS["tech"], "enrolled_only": "false"})
    items = r.json().get("items", []) if r.status_code == 200 else []
    return items[0]["totals"]["hours_worked"] if items else None


hours_before = worked()
ok("a recorded day counts its hours", (hours_before or 0) > 0, str(hours_before))
check_out = events_of("tech")[-1]
r = as_user("hr").patch(f"/api/v1/attendance/events/{check_out.id}/review",
                        json={"verification_status": "rejected", "remark": "Check-out was a mistake"})
ok("HR rejects the check-out with a note", r.status_code == 200 and r.json()["remark"] == "Check-out was a mistake")
hours_after = worked()
ok("  and the rejected check-out no longer earns hours", hours_after is not None and hours_after < hours_before,
   f"{hours_before} -> {hours_after}")

# ── F. where a mark was made, as an address ──────────────────────────────────
section("F. Where it was marked, as an address")
clear("tech")
queued.clear()
lookups.clear()
geocode._cache.clear()
r = check("tech", photo=b"face:tech", latitude=24.8607, longitude=67.0011, location_accuracy_m=9)
ok("the mark is answered before any lookup is made", r.json().get("recorded") is True and lookups == [] and len(queued) == 1)
drain()
saved = events_of("tech")[-1]
ok("a located check-in is named once it is saved", saved.location_place == "Place at 24.8607,67.0011", saved.location_place)
ok("  with one lookup", lookups == [(24.8607, 67.0011)], str(lookups))
r = check("tech", event_type="check_out", photo=b"face:tech", latitude=24.86071, longitude=67.00112)
drain()
ok("a check-out a few metres away reuses the answer, no second lookup",
   events_of("tech")[-1].location_place == "Place at 24.8607,67.0011" and len(lookups) == 1, str(lookups))
listed = as_user("hr").get("/api/v1/attendance/events", params={"user_id": IDS["tech"]}).json()
items = listed.get("items", listed) if isinstance(listed, dict) else listed
ok("HR's list carries the address", any(item.get("location_place") == "Place at 24.8607,67.0011" for item in items))
clear("tech")
r = check("tech", photo=b"face:tech")
ok("no location: nothing is even queued", queued == [])
drain()
ok("no location: nothing is looked up, nothing named", events_of("tech")[-1].location_place is None and len(lookups) == 1)
clear("tech")
geocoder["fail"] = True
r = check("tech", photo=b"face:tech", latitude=31.5204, longitude=74.3587)
drain()
ok("the lookup failing never stops the mark", r.json().get("recorded") is True and events_of("tech")[-1].latitude == 31.5204)
ok("  it is simply not named", events_of("tech")[-1].location_place is None)
geocoder["fail"] = False
clear("tech")
settings.ATTENDANCE_GEOCODING_ENABLED = False
lookups.clear()
check("tech", photo=b"face:tech", latitude=33.0, longitude=73.0)
drain()
ok("switched off: the position is kept, no lookup made", events_of("tech")[-1].latitude == 33.0 and lookups == [])
settings.ATTENDANCE_GEOCODING_ENABLED = True

print()
if failures:
    print(f"{len(failures)} check(s) failed")
    for failure in failures:
        print("  - " + failure)
    sys.exit(1)
print("All self check-in checks passed")
