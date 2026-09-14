"""Prove the building wizard's import works the way the wizard calls it.

The first verification of the wizard called the import with dry_run=False and
passed. The wizard does not do that: it dry-runs first and refuses to commit if
the dry run reports errors. The dry run had a bug that made every structure
deeper than one level fail, so the wizard could never create a building — and
the test that "proved" it worked had skipped the step that broke.

So these call it in the same order the browser does.

    DATABASE_URL=sqlite:// python backend/tests/test_building_setup.py
"""
from __future__ import annotations

import os
import pathlib
import sys

os.environ.setdefault("DATABASE_URL", "sqlite://")
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))

from sqlalchemy import create_engine  # noqa: E402
from sqlalchemy.orm import sessionmaker  # noqa: E402

import app.models  # noqa: E402,F401
from app.api.v1.endpoints.locations import bulk_import  # noqa: E402
from app.db.base import Base  # noqa: E402
from app.models.facility import Facility  # noqa: E402
from app.models.location import Location  # noqa: E402
from app.models.user import User, UserRole, UserType  # noqa: E402
from app.schemas.location import BulkLocationImport, BulkLocationRow  # noqa: E402

engine = create_engine("sqlite://", connect_args={"check_same_thread": False})
Session = sessionmaker(bind=engine)

# The code the user's building actually has — with a space in it — so the test
# exercises the same parent strings the wizard produced in the failing run.
BUILDING = "Building A"


def build():
    Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)
    db = Session()
    facility = Facility(name="H", phone="1", email="h@x.c", address="1",
                        city="X", state="GA", zip_code="1", country="USA")
    db.add(facility)
    db.flush()
    db.add(Location(facility_id=facility.id, location_type="building",
                    code=BUILDING, name="Surgery Building", path="/1/", depth=0))
    admin = User(username="a", email="a@x.c", full_name="A", hashed_password="x",
                 user_type=UserType.EMPLOYEE, role=UserRole.SUPERADMIN)
    db.add(admin)
    db.commit()
    return db, facility, admin


def wizard_rows() -> list[dict]:
    """What the wizard emits for the structure in the failing screenshot."""
    b1, g = f"{BUILDING}-B1", f"{BUILDING}-00"
    rows = [
        dict(parent_code=BUILDING, location_type="floor", code=b1, name="Basement"),
        dict(parent_code=BUILDING, location_type="floor", code=g, name="Ground Floor"),
        # A custom department, the same shape "Parking" produced.
        dict(parent_code=b1, location_type="wing", code=f"{b1}-PARK", name="Parking"),
        dict(parent_code=g, location_type="wing", code=f"{g}-IT", name="IT and Communications"),
        dict(parent_code=g, location_type="wing", code=f"{g}-ED", name="Emergency"),
        # Rooms two levels below something that does not exist until this batch.
        dict(parent_code=f"{g}-IT", location_type="room", code="DC-0001",
             name="Data centre 1", space_use="data", criticality="critical"),
        dict(parent_code=f"{g}-IT", location_type="room", code="COM-0001",
             name="Comms room 1", space_use="data", criticality="critical"),
        dict(parent_code=f"{g}-ED", location_type="room", code="ED-0001",
             name="Treatment bay 1", space_use="emergency", bed_count=1),
        # Three levels down: a bed in a room in a department on a new floor.
        dict(parent_code="ED-0001", location_type="bed", code="ED-0001-A", name="Bed A"),
    ]
    return rows


def run(db, facility, admin, dry_run):
    payload = BulkLocationImport(
        facility_id=facility.id,
        rows=[BulkLocationRow(**r) for r in wizard_rows()],
        dry_run=dry_run,
    )
    return bulk_import(payload, db=db, current_user=admin)


def test_the_dry_run_accepts_parents_created_in_the_same_batch():
    db, facility, admin = build()
    result = run(db, facility, admin, dry_run=True)
    errors = [i for i in result.issues if i.severity == "error"]
    assert not errors, "dry run rejected its own structure:\n" + "\n".join(
        f"  {e.code}: {e.message}" for e in errors)
    assert result.created == len(wizard_rows())
    db.close()
    print(f"ok  the dry run resolves parents from the same batch ({result.created} rows)")


def test_the_dry_run_writes_nothing():
    db, facility, admin = build()
    before = db.query(Location).count()
    run(db, facility, admin, dry_run=True)
    after = db.query(Location).count()
    # It now inserts in order to validate, so this is the property that has to
    # hold for that to be safe.
    assert after == before, f"dry run left {after - before} rows behind"
    db.close()
    print("ok  the dry run inserts to validate and leaves nothing behind")


def test_dry_run_then_commit_builds_the_tree():
    """The whole sequence, exactly as the wizard runs it."""
    db, facility, admin = build()

    check = run(db, facility, admin, dry_run=True)
    assert not [i for i in check.issues if i.severity == "error"]

    result = run(db, facility, admin, dry_run=False)
    assert result.created == len(wizard_rows()), result
    assert not result.issues

    by_code = {l.code: l for l in db.query(Location).all()}
    bed = by_code["ED-0001-A"]
    room = by_code["ED-0001"]
    dept = by_code[f"{BUILDING}-00-ED"]
    floor = by_code[f"{BUILDING}-00"]
    building = by_code[BUILDING]

    # Each node sits under the one it named, and its path proves the chain.
    assert bed.parent_id == room.id
    assert room.parent_id == dept.id
    assert dept.parent_id == floor.id
    assert floor.parent_id == building.id
    assert bed.path == f"{building.path}{floor.id}/{dept.id}/{room.id}/{bed.id}/"
    assert bed.depth == 4
    db.close()
    print("ok  dry run then commit builds a four-level tree")


def test_a_genuinely_missing_parent_is_still_reported():
    """The fix must not turn a real error into a silent pass."""
    db, facility, admin = build()
    payload = BulkLocationImport(
        facility_id=facility.id,
        rows=[BulkLocationRow(parent_code="Nowhere", location_type="room",
                              code="X-01", name="Orphan")],
        dry_run=True,
    )
    result = bulk_import(payload, db=db, current_user=admin)
    errors = [i for i in result.issues if i.severity == "error"]
    assert errors and "not found" in errors[0].message
    db.close()
    print("ok  a parent that truly does not exist is still refused")


if __name__ == "__main__":
    tests = [v for k, v in sorted(globals().items()) if k.startswith("test_")]
    for t in tests:
        t()
    print(f"\n{len(tests)} checks passed")
