"""Session renewal (POST /auth/refresh), from five users' side and an attacker's.

Every check goes through the full application with real logins and tokens.

    A. Five people - superadmin, admin, technician, employee, facility admin -
       sign in, keep working through renewals, and sign out. A renewed token
       must be the same person with exactly the same rights: every endpoint
       answers it as it answered their sign-in token. A session ends on
       sign-out, password change or deactivation, and at SESSION_MAX_HOURS.
    B. Abuse: no, forged, tampered, expired or revoked tokens; asking for
       someone else's token; moving the token out of the header; trying to
       keep a session past its limit; impersonation; a changed role.

Redis is replaced by an in-memory stand-in, so logout revocation runs exactly
as in production.

    DATABASE_URL=sqlite:// python backend/tests/test_session_renewal.py
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
from app.core.config import settings  # noqa: E402
from app.core.security import get_password_hash, password_token_version  # noqa: E402
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
rate_limit._redis_client = lambda: memory_redis
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

PEOPLE = {
    "boss": UserRole.SUPERADMIN,
    "admin": UserRole.ADMIN,
    "tech": UserRole.TECHNICIAN,
    "staff": UserRole.EMPLOYEE,
    "facadmin": UserRole.FACILITY_ADMIN,
}
for name, role in list(PEOPLE.items()) + [("changer", UserRole.EMPLOYEE), ("leaver", UserRole.EMPLOYEE),
                                          ("promoted", UserRole.TECHNICIAN)]:
    seed.add(User(username=name, email=name + "@medrad.test", full_name=name.title(),
                  hashed_password=get_password_hash(PASSWORD), user_type=UserType.EMPLOYEE, role=role,
                  is_active=True, facility_id=clinic.id if role == UserRole.FACILITY_ADMIN else None))
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


def token_for(username):
    r = client.post("/api/v1/auth/login", data={"username": username, "password": PASSWORD})
    assert r.status_code == 200, (username, r.status_code, r.text)
    memory_redis.data = {k: v for k, v in memory_redis.data.items() if "auth-login" not in k}
    return r.json()["access_token"]


def bearer(token):
    return {"Authorization": "Bearer " + token}


def me(token):
    return client.get("/api/v1/users/me", headers=bearer(token))


def refresh(token, **kwargs):
    return client.post("/api/v1/auth/refresh", headers=bearer(token), **kwargs)


def claims(token):
    return jwt.get_unverified_claims(token)


def version(username):
    db = Session()
    try:
        return password_token_version(db.query(User).filter(User.username == username).one().hashed_password)
    finally:
        db.close()


def forge(username, iat, exp, **extra):
    """A token signed with the real key - what only the server can mint - for
    times a test cannot wait for (a session hours old)."""
    body = {"sub": username, "ver": version(username), "iat": iat, "nbf": iat, "exp": exp,
            "iss": settings.JWT_ISSUER, "aud": settings.JWT_AUDIENCE, "jti": "forged-{}".format(time.time_ns()),
            "token_type": "access", **extra}
    return jwt.encode({k: v for k, v in body.items() if v is not None}, settings.SECRET_KEY, algorithm="HS256")


# What each person's token is allowed to see: the rights a renewed token must
# keep, no more and no less.
PROBES = [
    ("GET", "/api/v1/users/me"),
    ("GET", "/api/v1/users/"),
    ("GET", "/api/v1/users/{}".format(IDS["staff"])),
    ("GET", "/api/v1/audit-logs/"),
    ("GET", "/api/v1/facilities/"),
    ("GET", "/api/v1/tiers/"),
    ("GET", "/api/v1/inspections/forms"),
    ("GET", "/api/v1/notifications/"),
]


def rights(token):
    return {path: client.request(method, path, headers=bearer(token)).status_code for method, path in PROBES}


print("Session renewal: five users, then abuse")
print("=" * 72)
HOURS = settings.SESSION_MAX_HOURS
now = lambda: datetime.now(timezone.utc)  # noqa: E731

# ── A. Five users ─────────────────────────────────────────────────────────────
section("A. Five users keep working, then sign out")
all_rights = {}
for name, role in PEOPLE.items():
    signed_in = token_for(name)
    before = rights(signed_in)
    all_rights[name] = before
    r = refresh(signed_in)
    fresh = r.json().get("access_token", "") if r.status_code == 200 else ""
    ok("{}: renewal gives a fresh token".format(name), r.status_code == 200 and bool(fresh) and fresh != signed_in,
       str(r.status_code))
    who = me(fresh).json() if fresh else {}
    ok("  the same person ({}), same role".format(role.value),
       who.get("username") == name and who.get("role") == role.value, str(who.get("username")))
    after = rights(fresh)
    ok("  exactly the same rights on every endpoint", after == before,
       "" if after == before else "{} -> {}".format(before, after))
    ok("  the response carries only the token", set(r.json()) == {"access_token", "token_type"}
       and "hashed_password" not in r.text and "$2b$" not in r.text)
    chain = [fresh]
    for _ in range(3):
        chain.append(refresh(chain[-1]).json()["access_token"])
    anchored = {claims(t).get("auth_time") for t in chain}
    ok("  three more renewals stay anchored to the sign-in", anchored == {claims(signed_in)["iat"]},
       str(anchored))
    ok("  and each is a new token", len({claims(t)["jti"] for t in chain}) == len(chain))
    ok("  and none lives longer than a normal token",
       all(claims(t)["exp"] - claims(t)["iat"] == settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60 for t in chain))
    client.post("/api/v1/auth/logout", headers=bearer(chain[-1]))
    ok("  signing out ends the session", me(chain[-1]).status_code == 401)
    ok("  and it cannot be renewed after", refresh(chain[-1]).status_code == 401)

restricted = [path for _, path in PROBES if len({all_rights[n][path] for n in PEOPLE}) > 1]
ok("the five users really do have different rights (so 'same rights' means something)",
   len(restricted) >= 2, ", ".join(restricted))

# ── B. Abuse ──────────────────────────────────────────────────────────────────
section("B. Abuse")
staff = token_for("staff")
ok("no token: refused", client.post("/api/v1/auth/refresh").status_code == 401)
ok("a garbage token: refused", refresh("not.a.token").status_code == 401)
header, payload, signature = staff.split(".")
ok("a token with its signature stripped: refused", refresh(header + "." + payload + ".").status_code == 401)
ok("an unsigned 'alg: none' token: refused",
   refresh("eyJhbGciOiJub25lIiwidHlwIjoiSldUIn0." + payload + ".").status_code == 401)
ok("a token signed with a guessed key: refused",
   refresh(jwt.encode({**claims(staff), "jti": "guess"}, "guessed-secret", algorithm="HS256")).status_code == 401)
tampered = jwt.encode({**claims(staff), "sub": "boss"}, "guessed-secret", algorithm="HS256")
ok("a token edited to name someone else: refused", refresh(tampered).status_code == 401)
past = int((now() - timedelta(hours=1)).timestamp())
ok("an expired token: refused", refresh(forge("staff", past - 1800, past)).status_code == 401)
ok("a token of another type: refused",
   refresh(forge("staff", int(now().timestamp()), int(now().timestamp()) + 600, token_type="refresh")).status_code == 401)
ok("a token without the password binding: refused",
   refresh(jwt.encode({**claims(staff), "ver": None, "jti": "nover"}, settings.SECRET_KEY, algorithm="HS256")).status_code == 401)

r = refresh(staff, json={"sub": "boss", "username": "boss", "role": "superadmin"}, params={"username": "boss"})
ok("asking in the body or query for another user's token still returns your own",
   r.status_code == 200 and claims(r.json()["access_token"])["sub"] == "staff"
   and me(r.json()["access_token"]).json()["role"] == "employee")
ok("the token in the query string instead of the header: refused",
   client.post("/api/v1/auth/refresh", params={"token": staff, "access_token": staff}).status_code == 401)
ok("the token in a cookie instead of the header: refused",
   client.post("/api/v1/auth/refresh", cookies={"access_token": staff}).status_code == 401)
ok("renewal only answers POST", client.get("/api/v1/auth/refresh", headers=bearer(staff)).status_code == 405)

section("B. Abuse: keeping a session alive past its limit")
fresh_now = int(now().timestamp())
young = forge("staff", fresh_now - (HOURS * 3600 - 600), fresh_now + 600)
r = refresh(young)
ok("a session within {}h is renewed".format(HOURS), r.status_code == 200, str(r.status_code))
ok("  and the renewal keeps its original sign-in time",
   r.status_code == 200 and claims(r.json()["access_token"])["auth_time"] == fresh_now - (HOURS * 3600 - 600))
old = forge("staff", fresh_now - HOURS * 3600 - 1, fresh_now + 600)
r = refresh(old)
ok("a sign-in older than {}h cannot be renewed, however valid its token".format(HOURS), r.status_code == 401,
   str(r.status_code))
ok("  and says to sign in again", "sign in again" in r.text)
chained = forge("staff", fresh_now - 60, fresh_now + 600, auth_time=fresh_now - HOURS * 3600 - 1)
ok("a recently issued token from an old sign-in cannot be renewed either", refresh(chained).status_code == 401)
ok("  though it still works until its own expiry (renewal never cuts a session short)", me(chained).status_code == 200)

section("B. Abuse: a session that has been ended")
r = refresh(staff)
renewed = r.json()["access_token"]
client.post("/api/v1/auth/logout", headers=bearer(renewed))
ok("a signed-out renewed token cannot be renewed", refresh(renewed).status_code == 401)
changer = token_for("changer")
changer_renewed = refresh(changer).json()["access_token"]
client.put("/api/v1/users/me", json={"password": "a-brand-new-password-1", "current_password": PASSWORD},
           headers=bearer(changer_renewed))
ok("after a password change, no token of the old sign-in works or renews",
   all(me(t).status_code == 401 and refresh(t).status_code == 401 for t in (changer, changer_renewed)))
leaver = token_for("leaver")
boss = token_for("boss")
client.put("/api/v1/users/{}/deactivate".format(IDS["leaver"]), headers=bearer(boss))
ok("a deactivated user cannot renew", refresh(leaver).status_code in (401, 403), str(refresh(leaver).status_code))

section("B. Abuse: rights cannot be carried or raised by renewing")
staff_token = token_for("staff")
forged_role = jwt.encode({**claims(staff_token), "role": "superadmin", "jti": "role-claim"},
                         settings.SECRET_KEY, algorithm="HS256")
r = refresh(forged_role)
ok("a 'role: superadmin' claim is not carried into the renewed token",
   r.status_code == 200 and claims(r.json()["access_token"])["role"] == "employee")
ok("  nor does it grant anything", rights(r.json()["access_token"]) == all_rights["staff"])
promoted = token_for("promoted")
db = Session()
db.query(User).filter(User.username == "promoted").update({User.role: UserRole.EMPLOYEE})
db.commit()
db.close()
r = refresh(promoted)
ok("a role taken away is gone from the renewed token", r.status_code == 200
   and claims(r.json()["access_token"])["role"] == "employee" and me(r.json()["access_token"]).json()["role"] == "employee")

section("B. Abuse: impersonation")
boss = token_for("boss")
r = client.post("/api/v1/users/{}/impersonate".format(IDS["staff"]), headers=bearer(boss))
ok("a superadmin can impersonate", r.status_code == 200, str(r.status_code))
as_staff = r.json().get("access_token", "")
r = refresh(as_staff)
ok("renewing an impersonation stays that user, not the superadmin",
   r.status_code == 200 and me(r.json()["access_token"]).json()["username"] == "staff"
   and rights(r.json()["access_token"]) == all_rights["staff"])
staff_again = token_for("staff")
ok("an employee cannot impersonate, renewed token or not",
   client.post("/api/v1/users/{}/impersonate".format(IDS["boss"]),
               headers=bearer(refresh(staff_again).json()["access_token"])).status_code == 403)

print()
if failures:
    print("{} check(s) failed".format(len(failures)))
    for failure in failures:
        print("  - " + failure)
    sys.exit(1)
print("All session renewal checks passed")
