"""Authentication, attacked: what an intruder or a dishonest user tries.

Every check is sent through the full application with real logins and real
tokens -- nothing stands in for the signed-in user -- and asserts the secure
outcome:

    1. signing in: guessing, enumeration, throttling, disabled accounts
    2. tokens: forged, tampered, expired, replayed after logout or a
       password change, belonging to deleted or disabled users -- and
       refreshed: only a token that could sign a request gets a new one
    3. signing up: what a stranger who registers can reach
    4. privilege: users raising their own rights or taking over others'

Redis is replaced by an in-memory stand-in, so login throttling and logout
revocation run exactly as they do in production.

    DATABASE_URL=sqlite:// python backend/tests/test_auth_abuse.py
"""
from __future__ import annotations

import os
import pathlib
import sys
import time
from datetime import datetime, timedelta, timezone

os.environ.setdefault("DATABASE_URL", "sqlite://")
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))

from fastapi.testclient import TestClient  # noqa: E402
from jose import jwt  # noqa: E402
from sqlalchemy import create_engine, event  # noqa: E402
from sqlalchemy.orm import sessionmaker  # noqa: E402
from sqlalchemy.pool import StaticPool  # noqa: E402

import app.models  # noqa: E402,F401
from app.api.v1.endpoints import auth  # noqa: E402
from app.core.config import settings  # noqa: E402
from app.core.security import create_access_token, get_password_hash, password_token_version  # noqa: E402
from app.db.base import Base, get_db  # noqa: E402
from app.main import app  # noqa: E402
from app.models.facility import Facility  # noqa: E402
from app.models.user import User, UserRole, UserType  # noqa: E402
from app.utils import rate_limit, read_cache  # noqa: E402

read_cache.settings.READ_CACHE_ENABLED = False
failures: list[str] = []


def ok(label: str, condition: bool, detail: str = "") -> None:
    print("{}  {}{}".format("PASS" if condition else "FAIL", label, "  " + detail if detail else ""))
    if not condition:
        failures.append(label)


def section(title: str) -> None:
    print()
    print(title)


class MemoryRedis:
    """Just the Redis commands the limiter and token revocation use."""

    def __init__(self):
        self.data: dict[str, tuple[str, float]] = {}

    def _live(self, key):
        value = self.data.get(key)
        if value and value[1] < time.time():
            self.data.pop(key, None)
            return None
        return value

    def get(self, key):
        value = self._live(key)
        return value[0] if value else None

    def exists(self, key):
        return 1 if self._live(key) else 0

    def setex(self, key, ttl, value):
        self.data[key] = (str(value), time.time() + ttl)

    def delete(self, key):
        self.data.pop(key, None)

    def pipeline(self, transaction=True):
        redis_ = self

        class Pipe:
            def __init__(self):
                self.ops = []

            def __enter__(self):
                return self

            def __exit__(self, *exc):
                return False

            def incr(self, key):
                self.ops.append(("incr", key))

            def expire(self, key, ttl):
                self.ops.append(("expire", key, ttl))

            def execute(self):
                results = []
                for op in self.ops:
                    if op[0] == "incr":
                        current = int(redis_.get(op[1]) or 0) + 1
                        expiry = (redis_._live(op[1]) or (None, time.time() + 3600))[1]
                        redis_.data[op[1]] = (str(current), expiry)
                        results.append(current)
                    else:
                        value = redis_._live(op[1])
                        if value:
                            redis_.data[op[1]] = (value[0], time.time() + op[2])
                        results.append(True)
                return results

        return Pipe()


memory_redis = MemoryRedis()
rate_limit._redis_client.cache_clear()
rate_limit._redis_client = lambda: memory_redis  # token_revocation imports it from here at call time
import app.utils.token_revocation as token_revocation  # noqa: E402
token_revocation._redis_client = lambda: memory_redis

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

PASSWORD = "correct-horse-battery"
seed = Session()
clinic = Facility(name="Clinic A", phone="555-0101", email="a@clinic.test", address="1 A St", city="Plano",
                  state="TX", zip_code="75024", country="US")
seed.add(clinic)
seed.flush()


def person(username, role, user_type=UserType.EMPLOYEE, active=True, facility=None):
    user = User(username=username, email=username + "@medrad.test", full_name=username.title(),
                hashed_password=get_password_hash(PASSWORD), user_type=user_type, role=role, is_active=active,
                facility_id=facility.id if facility else None)
    seed.add(user)
    return user


for name, role in (("boss", UserRole.SUPERADMIN), ("admin", UserRole.ADMIN), ("hr", UserRole.HR_MANAGER),
                   ("tech", UserRole.TECHNICIAN), ("staff", UserRole.EMPLOYEE), ("leaver", UserRole.EMPLOYEE),
                   ("victim", UserRole.EMPLOYEE), ("changer", UserRole.EMPLOYEE), ("gone", UserRole.EMPLOYEE)):
    person(name, role)
person("dormant", UserRole.EMPLOYEE, active=False)
person("facadmin", UserRole.FACILITY_ADMIN, facility=clinic)
seed.commit()
IDS = {user.username: user.id for user in seed.query(User)}
seed.close()


def db_override():
    db = Session()
    try:
        yield db
    finally:
        db.close()


app.dependency_overrides[get_db] = db_override
client = TestClient(app, raise_server_exceptions=False, base_url="http://localhost")


def login(username, password=PASSWORD):
    return client.post("/api/v1/auth/login", data={"username": username, "password": password})


def token_for(username, password=PASSWORD):
    r = login(username, password)
    assert r.status_code == 200, (username, r.status_code, r.text)
    memory_redis.data = {k: v for k, v in memory_redis.data.items() if "auth-login" not in k}
    return r.json()["access_token"]


def bearer(token):
    return {"Authorization": "Bearer " + token}


def me(token):
    return client.get("/api/v1/users/me", headers=bearer(token))


def forge(**overrides):
    """A token signed with the real key, with chosen claims: what a key-holder could mint."""
    now = datetime.now(timezone.utc)
    claims = {"sub": "staff", "ver": password_token_version(get_password_hash("x")), "exp": now + timedelta(minutes=5),
              "iat": now, "nbf": now, "iss": settings.JWT_ISSUER, "aud": settings.JWT_AUDIENCE,
              "jti": "forged-1", "token_type": "access"}
    claims.update(overrides)
    claims = {k: v for k, v in claims.items() if v is not None}
    return jwt.encode(claims, settings.SECRET_KEY, algorithm="HS256")


def staff_version():
    db = Session()
    try:
        return password_token_version(db.get(User, IDS["staff"]).hashed_password)
    finally:
        db.close()


print("Authentication abuse, end to end")
print("=" * 72)

# --- 1. signing in -------------------------------------------------------------------------------
section("1. Signing in")
r = login("staff")
ok("the right password signs in", r.status_code == 200 and r.json().get("access_token"))
ok("  and the response carries no password hash", "hashed_password" not in r.text and "$2b$" not in r.text)
wrong, unknown = login("staff", "wrong-password-123"), login("nobody-here", "wrong-password-123")
ok("a wrong password is refused", wrong.status_code == 401)
ok("an unknown user gets exactly the same answer (no username discovery)",
   unknown.status_code == 401 and unknown.json()["detail"] == wrong.json()["detail"])

checked = []
original_verify = auth.verify_password
auth.verify_password = lambda plain, hashed: checked.append(1) or original_verify(plain, hashed)
login("nobody-at-all", "wrong-password-123")
auth.verify_password = original_verify
ok("an unknown user still costs a password check (no discovery by timing)", len(checked) == 1, str(len(checked)))

for attempt in ("staff' OR '1'='1", "staff'--", "' OR 1=1 --", "STAFF\x00", "*"):
    ok("an injection-style username {!r} is refused".format(attempt), login(attempt, "x" * 12).status_code in (401, 422))
ok("a disabled account cannot sign in, even with the right password", login("dormant").status_code == 403
   and "access_token" not in login("dormant").text)

memory_redis.data.clear()
results = [login("victim", "guess-number-{:02d}".format(n)).status_code for n in range(12)]
ok("guessing one account's password is throttled", 429 in results, str(results))
ok("  while its owner can still sign in with the right password", login("victim").status_code == 200)

memory_redis.data.clear()
sprayed = [login("spray-target-{}".format(n), "guess-password-1").status_code for n in range(35)]
ok("guessing across many accounts from one place is throttled", 429 in sprayed, str(sprayed[-6:]))
memory_redis.data.clear()

# --- 2. tokens -----------------------------------------------------------------------------------
section("2. Tokens")
staff = token_for("staff")
ok("a valid token works", me(staff).status_code == 200 and me(staff).json()["username"] == "staff")
ok("no token is refused", client.get("/api/v1/users/me").status_code == 401)
ok("a garbage token is refused", me("not.a.token").status_code == 401)
header, payload, _sig = staff.split(".")
ok("a token with its signature stripped is refused", me(header + "." + payload + ".").status_code == 401)
none_header = "eyJhbGciOiJub25lIiwidHlwIjoiSldUIn0"
ok("an unsigned 'alg: none' token is refused", me(none_header + "." + payload + ".").status_code == 401)
version = staff_version()
ok("a token signed with a guessed key is refused",
   me(jwt.encode({"sub": "staff", "ver": version, "exp": datetime.now(timezone.utc) + timedelta(minutes=5),
                  "iat": datetime.now(timezone.utc), "iss": settings.JWT_ISSUER, "aud": settings.JWT_AUDIENCE,
                  "jti": "x", "token_type": "access"}, "guessed-secret", algorithm="HS256")).status_code == 401)
past = datetime.now(timezone.utc) - timedelta(hours=1)
ok("an expired token is refused", me(forge(ver=version, exp=past, iat=past - timedelta(minutes=30),
                                           nbf=past - timedelta(minutes=30))).status_code == 401)
future = datetime.now(timezone.utc) + timedelta(hours=1)
ok("a token not yet valid is refused", me(forge(ver=version, nbf=future)).status_code == 401)
ok("a token for another audience is refused", me(forge(ver=version, aud="someone-else")).status_code == 401)
ok("a token from another issuer is refused", me(forge(ver=version, iss="someone-else")).status_code == 401)
ok("a token of another type is refused", me(forge(ver=version, token_type="refresh")).status_code == 401)
ok("a token without an id cannot dodge revocation", me(forge(ver=version, jti=None)).status_code == 401)
ok("a token without the password binding is refused", me(forge(ver=None)).status_code == 401)
ok("a token whose 'role' claim says superadmin grants nothing",
   client.put("/api/v1/users/{}/permissions".format(IDS["staff"]), json={"permissions": {}},
              headers=bearer(forge(ver=version, role="superadmin"))).status_code == 403)
for claim in ("superadmin", "admin"):
    r = client.put("/api/v1/users/{}/role".format(IDS["staff"]), json={"role": "superadmin"},
                   headers=bearer(forge(ver=version, role=claim)))
    ok("  nor lets its holder change roles ({})".format(claim), r.status_code == 403)



def refresh(token):
    return client.post("/api/v1/auth/refresh", headers=bearer(token))


# Refreshing keeps a working session alive; nothing that cannot sign a request
# may use it to extend one.
r = refresh(staff)
fresh = r.json().get("access_token", "") if r.status_code == 200 else ""
ok("a working session gets a fresh token", r.status_code == 200 and bool(fresh) and fresh != staff, str(r.status_code))
ok("  which signs requests as the same user", me(fresh).status_code == 200 and me(fresh).json()["username"] == "staff")
fresh_claims, staff_claims = jwt.get_unverified_claims(fresh), jwt.get_unverified_claims(staff)
ok("  bound to the same password, with an id of its own",
   fresh_claims.get("ver") == version and fresh_claims.get("jti") != staff_claims.get("jti"))
ok("  for the normal lifetime, no longer",
   fresh_claims["exp"] - fresh_claims["iat"] == settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
   str(fresh_claims["exp"] - fresh_claims["iat"]))
ok("  of the normal type", fresh_claims.get("token_type") == "access")
ok("no token gets no fresh one", client.post("/api/v1/auth/refresh").status_code == 401)
ok("an expired token cannot be refreshed", refresh(forge(ver=version, exp=past, iat=past - timedelta(minutes=30),
                                                         nbf=past - timedelta(minutes=30))).status_code == 401)
ok("a token signed with a guessed key cannot be refreshed",
   refresh(jwt.encode({"sub": "staff", "ver": version, "exp": datetime.now(timezone.utc) + timedelta(minutes=5),
                       "iat": datetime.now(timezone.utc), "iss": settings.JWT_ISSUER, "aud": settings.JWT_AUDIENCE,
                       "jti": "x2", "token_type": "access"}, "guessed-secret", algorithm="HS256")).status_code == 401)
ok("a token of another type cannot be refreshed", refresh(forge(ver=version, token_type="refresh")).status_code == 401)
ok("a token without the password binding cannot be refreshed", refresh(forge(ver=None)).status_code == 401)

r = client.post("/api/v1/auth/logout", headers=bearer(staff))
ok("signing out revokes the token", r.status_code == 204 and me(staff).status_code == 401)
ok("  and a signed-out token cannot be refreshed", refresh(staff).status_code == 401)
client.post("/api/v1/auth/logout", headers=bearer(fresh))
ok("signing out with a refreshed token ends it too", me(fresh).status_code == 401 and refresh(fresh).status_code == 401)

changer = token_for("changer")
client.put("/api/v1/users/me", json={"password": "a-brand-new-password-1", "current_password": PASSWORD},
           headers=bearer(changer))
ok("changing the password ends every earlier session", me(changer).status_code == 401)
ok("  and none of them can be refreshed", refresh(changer).status_code == 401)

leaver = token_for("leaver")
boss = token_for("boss")
r = client.put("/api/v1/users/{}/deactivate".format(IDS["leaver"]), headers=bearer(boss))
ok("a deactivated user's live token stops working at once", r.status_code == 200 and me(leaver).status_code in (401, 403))
ok("  and cannot be refreshed", refresh(leaver).status_code in (401, 403))
gone = token_for("gone")
client.delete("/api/v1/users/{}".format(IDS["gone"]), headers=bearer(boss))
ok("a deleted user's live token stops working at once", me(gone).status_code in (401, 403))
ok("  and cannot be refreshed", refresh(gone).status_code in (401, 403))

# --- 3. signing up -------------------------------------------------------------------------------
section("3. Signing up")
r = client.post("/api/v1/auth/register", json={"username": "stranger", "email": "stranger@outside-mail.com",
                                               "full_name": "Stranger", "password": "stranger-password-1",
                                               "role": "superadmin", "user_type": "employee",
                                               "is_active": True, "permissions": {"users": {"edit": True}}})
ok("asking for a role or permissions at sign-up gets neither", r.status_code in (201, 403, 404))
db = Session()
stranger = db.query(User).filter(User.username == "stranger").first()
db.close()
ok("  a stranger is never a superadmin, admin or HR manager",
   stranger is None or stranger.role not in (UserRole.SUPERADMIN, UserRole.ADMIN, UserRole.HR_MANAGER))
ok("  and gets no saved permissions", stranger is None or not stranger.permissions)
r = client.post("/api/v1/auth/register", json={"username": "short", "email": "short@outside-mail.com",
                                               "full_name": "Short", "password": "short"})
ok("a weak password is refused at sign-up", r.status_code in (403, 404, 422))
r = client.post("/api/v1/auth/register", json={"username": "STAFF", "email": "dup@outside-mail.com", "full_name": "Dup",
                                               "password": "duplicate-password-1"})
ok("an existing username in other letter case cannot be taken", r.status_code in (400, 403, 404))
ok("signing up creates an account that is switched off until approved",
   stranger is not None and stranger.is_active is False)
r = login("stranger", "stranger-password-1")
ok("a stranger who signs up cannot sign in before approval", r.status_code == 403 and "access_token" not in r.text
   and "awaiting approval" in r.json().get("detail", ""), "{} {}".format(r.status_code, r.text[:80]))
memory_redis.data = {k: v for k, v in memory_redis.data.items() if "auth-login" not in k}
pending = forge(sub="stranger", ver=password_token_version(stranger.hashed_password)) if stranger else ""
for path, what in (("/api/v1/facilities/", "the customer facility list"),
                   ("/api/v1/service-requests/", "service requests"),
                   ("/api/v1/equipment/", "customer equipment"),
                   ("/api/v1/users/", "the staff directory")):
    r = client.get(path, headers=bearer(pending))
    ok("an unapproved sign-up cannot read {}, even holding a valid token".format(what),
       r.status_code in (401, 403), "{} {}".format(r.status_code, r.text[:80]))
db = Session()
from app.models.notification import Notification  # noqa: E402
told = {n.user_id for n in db.query(Notification).filter(Notification.title == "New sign-up awaiting approval")}
db.close()
ok("the people who can approve it (Super Admins, HR Managers) are told",
   {IDS["boss"], IDS["hr"]} <= told and IDS["staff"] not in told, str(told))
boss = token_for("boss")
r = client.put("/api/v1/users/{}/activate".format(stranger.id), headers=bearer(boss))
ok("once a Super Admin activates it, the person can sign in", r.status_code == 200
   and login("stranger", "stranger-password-1").status_code == 200)
memory_redis.data = {k: v for k, v in memory_redis.data.items() if "auth-login" not in k}

# --- 4. privilege --------------------------------------------------------------------------------
section("4. Raising rights or taking over accounts")


def snapshot_people():
    db = Session()
    try:
        return {u.id: {c.key: getattr(u, c.key) for c in User.__table__.columns} for u in db.query(User)}
    finally:
        db.close()


SEEDED = snapshot_people()


def restore():
    """Undo whatever the last attack managed, so each check is judged on its own."""
    db = Session()
    try:
        for user in db.query(User):
            if user.id not in SEEDED:
                db.delete(user)
        for values in SEEDED.values():
            db.merge(User(**values))
        db.commit()
    finally:
        db.close()


def role_of(username):
    db = Session()
    try:
        return db.get(User, IDS[username]).role
    finally:
        db.close()


hr, admin, staff, facadmin, boss = (token_for(name) for name in ("hr", "admin", "staff", "facadmin", "boss"))

r = client.put("/api/v1/users/{}".format(IDS["hr"]), json={"role": "superadmin"}, headers=bearer(hr))
ok("an HR manager cannot make themselves a superadmin", role_of("hr") == UserRole.HR_MANAGER, str(r.status_code))
restore()
for role in ("superadmin", "admin"):
    r = client.put("/api/v1/users/{}".format(IDS["staff"]), json={"role": role}, headers=bearer(hr))
    ok("an HR manager cannot make someone else {}".format(role), role_of("staff") == UserRole.EMPLOYEE, str(r.status_code))
    restore()
    r = client.post("/api/v1/users/", json={"username": "hrpuppet", "email": "puppet@medrad-mail.com", "full_name": "Puppet",
                                            "password": "puppet-password-12", "role": role}, headers=bearer(hr))
    db = Session()
    puppet = db.query(User).filter(User.username == "hrpuppet").first()
    db.close()
    ok("an HR manager cannot create a new {}".format(role), puppet is None or puppet.role.value != role,
       str(r.status_code))
    restore()
r = client.put("/api/v1/users/{}".format(IDS["boss"]), json={"password": "hr-took-over-boss-1"}, headers=bearer(hr))
took_over = login("boss", "hr-took-over-boss-1").status_code == 200
ok("an HR manager cannot reset a superadmin's password", not took_over, str(r.status_code))
restore()
r = client.put("/api/v1/users/{}".format(IDS["boss"]), json={"role": "employee"}, headers=bearer(hr))
ok("an HR manager cannot demote a superadmin", role_of("boss") == UserRole.SUPERADMIN, str(r.status_code))
restore()
for verb, path in (("PUT", "/api/v1/users/{}/deactivate"), ("DELETE", "/api/v1/users/{}")):
    r = client.request(verb, path.format(IDS["boss"]), headers=bearer(hr))
    db = Session()
    still = db.get(User, IDS["boss"])
    alive = bool(still and still.is_active)
    db.close()
    ok("an HR manager cannot {} a superadmin".format("deactivate" if verb == "PUT" else "delete"), alive, str(r.status_code))
    restore()
r = client.put("/api/v1/users/{}".format(IDS["tech"]), json={"password": "hr-reset-tech-pass1"}, headers=bearer(hr))
ok("an HR manager can still reset an ordinary employee's password (their job)", r.status_code == 200
   and login("tech", "hr-reset-tech-pass1").status_code == 200, str(r.status_code))
restore()

r = client.put("/api/v1/users/{}".format(IDS["tech"]), json={"role": "admin"}, headers=bearer(admin))
ok("an admin with read-only user access cannot change anyone", r.status_code == 403 and role_of("tech") == UserRole.TECHNICIAN)
restore()
r = client.put("/api/v1/users/me", json={"role": "superadmin", "is_active": True, "user_type": "employee",
                                         "permissions": {"users": {"edit": True}}, "facility_id": 1},
               headers=bearer(staff))
db = Session()
row = db.get(User, IDS["staff"])
ok("editing your own profile cannot change your role, access or facility",
   row.role == UserRole.EMPLOYEE and not row.permissions and row.facility_id is None)
db.close()
restore()
r = client.put("/api/v1/users/me", json={"password": "stolen-session-pass-1"}, headers=bearer(staff))
ok("changing your password requires your current password (a stolen session cannot take the account)",
   r.status_code in (400, 403, 422) and login("staff").status_code == 200, str(r.status_code))
restore()
staff = token_for("staff")
r = client.put("/api/v1/users/me", json={"password": "stolen-session-pass-1", "current_password": "wrong-guess-12345"},
               headers=bearer(staff))
ok("  and a wrong current password is refused", r.status_code in (400, 403) and login("staff").status_code == 200,
   str(r.status_code))
restore()
staff = token_for("staff")
r = client.put("/api/v1/users/me", json={"password": "my-new-password-123", "current_password": PASSWORD},
               headers=bearer(staff))
ok("  while the owner, who knows it, can change it", r.status_code == 200
   and login("staff", "my-new-password-123").status_code == 200, str(r.status_code))
restore()
staff = token_for("staff")

for path, body, what in (("/api/v1/users/{}/role".format(IDS["staff"]), {"role": "superadmin"}, "change roles"),
                         ("/api/v1/users/{}/permissions".format(IDS["staff"]), {"permissions": {}}, "change permissions"),
                         ("/api/v1/users/{}/impersonate".format(IDS["boss"]), None, "impersonate")):
    for who, token in (("an HR manager", hr), ("an admin", admin), ("an employee", staff), ("a facility admin", facadmin)):
        r = client.request("PUT" if body is not None else "POST", path, json=body, headers=bearer(token))
        ok("{} cannot {}".format(who, what), r.status_code == 403, str(r.status_code))
        restore()
r = client.post("/api/v1/users/{}/impersonate".format(IDS["dormant"]), headers=bearer(boss))
ok("not even a superadmin can impersonate a disabled account", r.status_code == 400, str(r.status_code))
r = client.get("/api/v1/users/", headers=bearer(facadmin))
seen = {item["username"] for item in r.json().get("items", [])} if r.status_code == 200 else set()
ok("a facility admin sees only their own facility's people", r.status_code in (200, 403) and seen <= {"facadmin"},
   str(sorted(seen)))
r = client.get("/api/v1/users/", headers=bearer(boss))
ok("the user list never carries password hashes", r.status_code == 200 and "hashed_password" not in r.text
   and "$2b$" not in r.text, str(r.status_code))

print()
if failures:
    print("{} check(s) failed:".format(len(failures)))
    for label in failures:
        print("  - " + label)
    sys.exit(1)
print("All authentication abuse checks passed")
