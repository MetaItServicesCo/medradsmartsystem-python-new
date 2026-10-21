"""Nobody should be able to lock somebody else out of their own account.

The login limiter counted failures per username and checked that count before
the password was verified. Ten wrong guesses against a name and its owner was
refused for fifteen minutes -- by a 429 raised before anybody looked at what
they typed. Knowing a colleague's username was enough to keep them out of the
system all day from a phone, and what they saw was an ordinary login failure
with nothing to suggest it was deliberate.

The limit still exists and still bounds guessing. What changed is when it is
consulted: after the password is checked, so it only ever applies to someone
who got it wrong. Anybody who gets it right is let in, because somebody who
has guessed correctly has by definition stopped guessing.

    DATABASE_URL=sqlite:// python backend/tests/test_login_lockout.py
"""
from __future__ import annotations

import os
import pathlib
import sys

os.environ.setdefault("DATABASE_URL", "sqlite://")
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))

from fastapi import HTTPException  # noqa: E402
from sqlalchemy import create_engine  # noqa: E402
from sqlalchemy.orm import sessionmaker  # noqa: E402
from sqlalchemy.pool import StaticPool  # noqa: E402

import app.models  # noqa: E402,F401
from app.api.v1.endpoints.auth import login  # noqa: E402
from app.core.config import settings  # noqa: E402
from app.db.base import Base  # noqa: E402
from app.models.user import User, UserRole, UserType  # noqa: E402
from app.utils import rate_limit  # noqa: E402


failures: list[str] = []


def ok(label: str, condition: bool, detail: str = "") -> None:
    print("{}  {}{}".format("PASS" if condition else "FAIL", label,
                            "  " + detail if detail else ""))
    if not condition:
        failures.append(label)


engine = create_engine("sqlite://", connect_args={"check_same_thread": False},
                       poolclass=StaticPool)
Base.metadata.create_all(engine)
db = sessionmaker(bind=engine)()

PASSWORD = "correct horse battery staple"

# Password comparison is substituted, not exercised. What is under test is
# WHEN the limiter is consulted relative to the password check, and bcrypt
# would only make 40-odd attempts slow. (It also cannot run here: this machine
# pairs passlib 1.7.4 with bcrypt 4.x, which no longer exposes __about__.)
auth_module = sys.modules["app.api.v1.endpoints.auth"]
auth_module.verify_password = lambda plain, hashed: plain == hashed

manager = User(username="omar", email="o@x.test", full_name="Omar Ahmad",
               hashed_password=PASSWORD,
               user_type=UserType.EMPLOYEE, role=UserRole.ADMIN, is_active=True)
db.add(manager)
db.commit()


class FakeClient:
    def __init__(self, host):
        self.host = host


class FakeRequest:
    def __init__(self, host):
        self.client = FakeClient(host)


class FakeForm:
    def __init__(self, username, password):
        self.username = username
        self.password = password


def attempt(username, password, ip):
    """Returns 200, or the HTTP status the endpoint refused with."""
    try:
        login(request=FakeRequest(ip), form_data=FakeForm(username, password), db=db)
        return 200
    except HTTPException as exc:
        db.rollback()
        return exc.status_code


# Force the limiter down its in-process path. Redis may well be reachable
# from a developer machine, and then counters survive between runs inside the
# fifteen-minute window: the second run starts already throttled and the test
# reports a lockout that is really yesterday's. The fallback implements the
# same fixed-window semantics, and what is under test here is the ORDER of
# the checks, which is identical either way.
import redis as _redis  # noqa: E402

rate_limit._redis_client = lambda: (_ for _ in ()).throw(_redis.RedisError("test"))


def reset_limits():
    with rate_limit._fallback_lock:
        rate_limit._fallback_counts.clear()


ACCOUNT_LIMIT = settings.AUTH_LOGIN_ACCOUNT_LIMIT
IP_LIMIT = settings.AUTH_LOGIN_IP_LIMIT

print("Login throttling")
print("=" * 72)
print("  account limit {}, ip limit {}, window {}s".format(
    ACCOUNT_LIMIT, IP_LIMIT, settings.AUTH_LOGIN_WINDOW_SECONDS))

print()
print("An attacker burns the account's failure budget")
print("-" * 72)

reset_limits()
codes = [attempt("omar", "wrong-{}".format(i), "198.51.100.7")
         for i in range(ACCOUNT_LIMIT + 2)]
ok("wrong passwords are refused", codes[0] == 401, "HTTP {}".format(codes[0]))
ok("and eventually throttled", 429 in codes,
   "first 429 at attempt {}".format(codes.index(429) + 1 if 429 in codes else "-"))

print()
print("The owner can still sign in -- this is the fix")
print("-" * 72)

owner = attempt("omar", PASSWORD, "203.0.113.42")
ok("the correct password is accepted while the account is throttled",
   owner == 200, "HTTP {}".format(owner))

print()
print("Signing in clears what the attacker accumulated")
print("-" * 72)

after = attempt("omar", "wrong-again", "198.51.100.7")
ok("the attacker is back to an ordinary refusal, not a lockout",
   after == 401, "HTTP {}".format(after))

print()
print("Guessing is still bounded")
print("-" * 72)

reset_limits()
codes = [attempt("omar", "guess-{}".format(i), "198.51.100.8")
         for i in range(ACCOUNT_LIMIT + 2)]
ok("a run of wrong guesses still ends in 429", codes[-1] == 429,
   "HTTP {}".format(codes[-1]))
ok("it takes more than one wrong guess to get there",
   codes.count(401) >= ACCOUNT_LIMIT - 1,
   "{} refusals before throttling".format(codes.count(401)))

print()
print("One source hammering many accounts is still stopped")
print("-" * 72)

reset_limits()
# Usernames that do not exist, so no password hashing happens and this stays
# a test of the limiter rather than of bcrypt.
codes = [attempt("ghost-{}".format(i), "x", "198.51.100.9")
         for i in range(IP_LIMIT + 2)]
ok("the per-source limit still fires", 429 in codes,
   "first 429 at attempt {}".format(codes.index(429) + 1 if 429 in codes else "-"))

print()
print("And the per-source limit cannot be aimed at somebody else")
print("-" * 72)

victim_from_elsewhere = attempt("omar", PASSWORD, "203.0.113.99")
ok("a different source is unaffected by it", victim_from_elsewhere == 200,
   "HTTP {}".format(victim_from_elsewhere))

print()
print("Unknown accounts give nothing away")
print("-" * 72)

reset_limits()
unknown = attempt("no-such-person", "whatever", "203.0.113.50")
wrong_pw = attempt("omar", "definitely-wrong", "203.0.113.51")
ok("both answer the same way", unknown == wrong_pw == 401,
   "{} vs {}".format(unknown, wrong_pw))


print()
print("=" * 72)
if failures:
    print("{} failing: {}".format(len(failures), ", ".join(failures)))
    sys.exit(1)
print("All login throttling checks passed.")
