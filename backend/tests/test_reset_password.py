"""Prove the recovery script recovers, and refuses in every other case.

This is the way back in when the one superadmin cannot sign in, so it has to
work the first time somebody reaches for it -- which will be the worst
possible moment, and they will not have read it. Two properties matter more
than the happy path: a mistyped confirmation must change nothing at all, and
nothing must ever print or return the password.

Password hashing is substituted. What is under test is the surrounding
decision-making, and this machine pairs passlib 1.7.4 with bcrypt 4.x, which
cannot hash at all.

    DATABASE_URL=sqlite:// python backend/tests/test_reset_password.py
"""
from __future__ import annotations

import io
import os
import pathlib
import sys

os.environ.setdefault("DATABASE_URL", "sqlite://")
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))

from sqlalchemy import create_engine  # noqa: E402
from sqlalchemy.orm import sessionmaker  # noqa: E402
from sqlalchemy.pool import StaticPool  # noqa: E402

import app.models  # noqa: E402,F401
from app.db.base import Base  # noqa: E402
from app.models.user import User, UserRole, UserType  # noqa: E402
from scripts import reset_password  # noqa: E402


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

db = Session()
db.add(User(username="OmarAhmad", email="service@mbmts.com",
            full_name="Omar Ahmad", hashed_password="OLD-HASH",
            user_type=UserType.EMPLOYEE, role=UserRole.SUPERADMIN,
            is_active=False, is_locked=True, failed_login_attempts=7))
db.commit()
db.close()

reset_password.SessionLocal = Session
reset_password.get_password_hash = lambda raw: "HASHED:" + raw


class FakeTTY(io.StringIO):
    def isatty(self):
        return True


def run(username, *answers):
    """Run the script with scripted prompt answers; returns its exit code."""
    supplied = list(answers)
    reset_password.getpass.getpass = lambda prompt="": supplied.pop(0)
    argv, stdin = sys.argv, sys.stdin
    sys.argv = ["reset_password.py", username]
    sys.stdin = FakeTTY()
    try:
        return reset_password.main()
    finally:
        sys.argv, sys.stdin = argv, stdin


def stored():
    s = Session()
    try:
        user = s.query(User).filter(User.username == "OmarAhmad").one()
        return (user.hashed_password, user.is_locked, user.is_active,
                user.failed_login_attempts)
    finally:
        s.close()


print("Superadmin password recovery")
print("=" * 72)

print()
print("It refuses, and changes nothing")
print("-" * 72)

ok("an unknown account is refused", run("nobody", "x", "x") == 1)
ok("  and nothing was touched", stored()[0] == "OLD-HASH")

ok("a short password is refused", run("OmarAhmad", "short", "short") == 1)
ok("  and nothing was touched", stored()[0] == "OLD-HASH")

ok("a mistyped confirmation is refused",
   run("OmarAhmad", "a-long-enough-password", "a-long-enough-passwerd") == 1)
ok("  and nothing was touched -- the case that matters",
   stored()[0] == "OLD-HASH", stored()[0])

print()
print("Without a terminal there is nothing to prompt")
print("-" * 72)

argv, stdin = sys.argv, sys.stdin
sys.argv = ["reset_password.py", "OmarAhmad"]
sys.stdin = io.StringIO()          # isatty() is False
try:
    code = reset_password.main()
finally:
    sys.argv, sys.stdin = argv, stdin
ok("it exits rather than hanging or guessing", code == 2, "exit {}".format(code))
ok("  and nothing was touched", stored()[0] == "OLD-HASH")

print()
print("It sets the password, and clears the lockout with it")
print("-" * 72)

code = run("OmarAhmad", "a-properly-long-password", "a-properly-long-password")
hashed, locked, active, attempts = stored()
ok("it succeeds", code == 0)
ok("the hash changed", hashed == "HASHED:a-properly-long-password", hashed)
ok("the account is unlocked", locked is False)
ok("the account is active", active is True)
ok("the failed-attempt counter is cleared", attempts == 0, str(attempts))

print()
print("The username is matched the way login matches it")
print("-" * 72)

ok("lower case works", run("omarahmad", "another-long-password",
                           "another-long-password") == 0)
ok("and set the new one", stored()[0] == "HASHED:another-long-password")


print()
print("=" * 72)
if failures:
    print("{} failing: {}".format(len(failures), ", ".join(failures)))
    sys.exit(1)
print("All password recovery checks passed.")
