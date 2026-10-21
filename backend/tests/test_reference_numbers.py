"""Two people pressing save at the same moment must both get a number.

SR-000413 was produced by reading the last row's id and adding one. That is a
read and a write with a gap between them, and in the gap two technicians
filing from the van both computed 413. The column is unique, so the second
insert raised IntegrityError, nothing caught it, and somebody got a 500 for
doing the most ordinary thing in the product.

The race itself cannot be reproduced on a single-threaded SQLite test, and a
test that spawned threads would prove only that this machine happened to
interleave them. What it reproduces instead is the exact observable condition
the race creates: the number a caller computed is already taken by the time
it inserts. That is the whole bug, and it is deterministic.

    DATABASE_URL=sqlite:// python backend/tests/test_reference_numbers.py
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
from app.db.base import Base  # noqa: E402
from app.models.equipment import Equipment  # noqa: E402
from app.models.facility import Facility  # noqa: E402
from app.models.modality import Modality, ModalityCategory  # noqa: E402
from app.models.service_request import (  # noqa: E402
    Priority, ServiceRequest, ServiceRequestStatus,
)
from app.models.user import User, UserRole, UserType  # noqa: E402
from app.utils import numbering  # noqa: E402
from app.utils.numbering import assign_unique_number, peek_next_number  # noqa: E402


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

site = Facility(name="North", phone="0", email="n@x.test", address="1 Road",
                city="Houston", state="TX", zip_code="77001", country="US")
db.add(site)
db.flush()
modality = Modality(name="Imaging", category=ModalityCategory.IMAGING)
db.add(modality)
db.flush()
kit = Equipment(asset_tag="A1", make="Acme", model="M", serial_number="S1",
                modality_id=modality.id, facility_id=site.id)
db.add(kit)
db.flush()
who = User(username="raiser", email="r@x.test", full_name="Raiser",
           hashed_password="x", user_type=UserType.EMPLOYEE,
           role=UserRole.TECHNICIAN, is_active=True)
db.add(who)
db.commit()


def new_request() -> ServiceRequest:
    return ServiceRequest(
        facility_id=site.id, equipment_id=kit.id, requester_id=who.id,
        problem_description="Alarm", priority=Priority.LOW,
        status=ServiceRequestStatus.NEW, history=[])


def raise_one() -> str:
    number = assign_unique_number(db, new_request(), "request_number", prefix="SR-")
    db.commit()
    return number


print("Reference numbers under contention")
print("=" * 72)

print()
print("Ordinary use")
print("-" * 72)

first = raise_one()
second = raise_one()
ok("the first is SR-000001", first == "SR-000001", first)
ok("the next follows it", second == "SR-000002", second)
ok("peeking agrees", peek_next_number(db, ServiceRequest.request_number, "SR-")
   == "SR-000003")

print()
print("The number this caller computed is already taken")
print("-" * 72)

# Exactly what the race produces: a stale read of the highest number. The
# first attempt therefore proposes one that somebody else already holds.
real_highest = numbering._highest
calls = {"n": 0}


def stale_once(db_, column, prefix):
    calls["n"] += 1
    if calls["n"] == 1:
        return real_highest(db_, column, prefix) - 1   # the other person's read
    return real_highest(db_, column, prefix)


numbering._highest = stale_once
try:
    third = raise_one()
finally:
    numbering._highest = real_highest

ok("the insert still succeeds", bool(third), third)
ok("it took the next free number, not the taken one", third == "SR-000003", third)
ok("it had to retry", calls["n"] >= 2, "{} attempts".format(calls["n"]))
ok("no duplicate reached the table",
   db.query(ServiceRequest).filter(
       ServiceRequest.request_number == "SR-000002").count() == 1)

print()
print("The surrounding transaction survives a collision")
print("-" * 72)

ok("the session is still usable", db.query(ServiceRequest).count() == 3,
   str(db.query(ServiceRequest).count()))
fourth = raise_one()
ok("and numbering carries on", fourth == "SR-000004", fourth)

print()
print("Numbers follow the numbers, not the row ids")
print("-" * 72)

# The old scheme read the last row's *id*. Those agree only while nothing has
# ever been deleted, which is not a property worth depending on.
victim = db.query(ServiceRequest).filter(
    ServiceRequest.request_number == "SR-000002").one()
db.delete(victim)
db.commit()

fifth = raise_one()
ok("a deleted row does not rewind the sequence", fifth == "SR-000005", fifth)
ok("and does not reissue its number",
   db.query(ServiceRequest).filter(
       ServiceRequest.request_number == "SR-000002").count() == 0)

print()
print("Sustained contention fails cleanly, not with a 500")
print("-" * 72)

numbering._highest = lambda db_, column, prefix: 0   # every attempt collides
try:
    raise_one()
    ok("it refuses rather than raising IntegrityError", False, "was allowed")
except HTTPException as exc:
    ok("it refuses rather than raising IntegrityError",
       exc.status_code == 503, "HTTP {}".format(exc.status_code))
    ok("and says something a person can act on",
       "try again" in str(exc.detail).lower(), str(exc.detail))
except Exception as exc:  # noqa: BLE001
    ok("it refuses rather than raising IntegrityError", False,
       "raised {}".format(type(exc).__name__))
finally:
    numbering._highest = real_highest

db.rollback()
ok("the session recovers afterwards", db.query(ServiceRequest).count() == 4,
   str(db.query(ServiceRequest).count()))

print()
print("A prefix only sees its own numbers")
print("-" * 72)

ok("an unused prefix starts at one",
   peek_next_number(db, ServiceRequest.request_number, "QR-") == "QR-000001")


print()
print("=" * 72)
if failures:
    print("{} failing: {}".format(len(failures), ", ".join(failures)))
    sys.exit(1)
print("All reference number checks passed.")
