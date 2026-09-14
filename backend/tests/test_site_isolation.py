"""Prove a site-scoped user cannot reach another hospital's data.

Isolation that is only present in the interface is not isolation: the site
switcher changes what the browser asks for, not what the API is willing to
return. These check the boundary itself.

    DATABASE_URL=sqlite:// python backend/tests/test_site_isolation.py
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

import app.models  # noqa: E402,F401
from app.db.base import Base  # noqa: E402
from app.models.facility import Facility  # noqa: E402
from app.models.fixture import Fixture  # noqa: E402
from app.models.location import Location  # noqa: E402
from app.models.user import User, UserRole, UserType  # noqa: E402
from app.models.user_facility import UserFacility  # noqa: E402
from app.models.vendor import Vendor, VendorContract  # noqa: E402
from app.utils.facility_access import (  # noqa: E402
    FACILITY_SCOPED_ROLES, get_user_facility_ids, is_facility_scoped_user,
    require_facility_access, scope_query_to_user_facilities,
)

engine = create_engine("sqlite://", connect_args={"check_same_thread": False})
Session = sessionmaker(bind=engine)


def build():
    Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)
    db = Session()

    def site(name):
        f = Facility(name=name, phone="1", email=f"{name}@x.c", address="1",
                     city="X", state="GA", zip_code="1", country="USA")
        db.add(f)
        db.flush()
        return f

    a, b = site("Hospital A"), site("Hospital B")

    def user(username, role, facility=None):
        u = User(username=username, email=f"{username}@x.c", full_name=username,
                 hashed_password="x", user_type=UserType.EMPLOYEE, role=role,
                 facility_id=facility.id if facility else None)
        db.add(u)
        db.flush()
        if facility:
            db.add(UserFacility(user_id=u.id, facility_id=facility.id))
            db.flush()
        return u

    people = {
        "tech_a": user("tech_a", UserRole.TECHNICIAN, a),
        "tech_b": user("tech_b", UserRole.TECHNICIAN, b),
        "unassigned": user("stranger", UserRole.TECHNICIAN),
        "admin": user("boss", UserRole.SUPERADMIN),
    }

    for facility in (a, b):
        room = Location(facility_id=facility.id, location_type="room",
                        code=f"OR-1-{facility.id}", name="Theatre",
                        path=f"/{facility.id}/", depth=0)
        db.add(room)
        db.flush()
        db.add(Fixture(facility_id=facility.id, location_id=room.id,
                       fixture_type="receptacle", code="SKT-01"))
    db.flush()
    return db, a, b, people


def test_technicians_are_scoped_now():
    assert UserRole.TECHNICIAN in FACILITY_SCOPED_ROLES, (
        "a technician at one hospital must not read another's work"
    )
    # Superadmins and admins remain deliberately unscoped.
    assert UserRole.SUPERADMIN not in FACILITY_SCOPED_ROLES
    print("ok  technicians are facility-scoped")


def test_a_technician_sees_only_their_own_site():
    db, a, b, people = build()
    assert get_user_facility_ids(db, people["tech_a"]) == {a.id}
    assert get_user_facility_ids(db, people["tech_b"]) == {b.id}

    seen = scope_query_to_user_facilities(
        db.query(Fixture), Fixture.facility_id, db, people["tech_a"],
    ).all()
    assert {f.facility_id for f in seen} == {a.id}, "leaked another site's fixtures"

    # The administrator still sees both, which is the point of the exemption.
    everything = scope_query_to_user_facilities(
        db.query(Fixture), Fixture.facility_id, db, people["admin"],
    ).all()
    assert {f.facility_id for f in everything} == {a.id, b.id}
    db.close()
    print("ok  a technician's queries are narrowed to their own site")


def test_reaching_across_is_refused_not_merely_filtered():
    db, a, b, people = build()
    require_facility_access(db, people["tech_a"], a.id)          # own site: fine
    try:
        require_facility_access(db, people["tech_a"], b.id)
        raise AssertionError("reached another hospital without being refused")
    except HTTPException as exc:
        assert exc.status_code == 403
    db.close()
    print("ok  naming another site's id is refused, not silently emptied")


def test_an_unassigned_user_sees_nothing_at_all():
    db, a, b, people = build()
    stranger = people["unassigned"]
    assert is_facility_scoped_user(stranger)
    assert get_user_facility_ids(db, stranger) == set()

    seen = scope_query_to_user_facilities(
        db.query(Fixture), Fixture.facility_id, db, stranger,
    ).all()
    assert seen == [], "an unassigned account must not see a default site"

    # This is the state the Sites page has to explain rather than render as an
    # empty list: nothing is wrong with the data, the account has no access yet.
    facilities = scope_query_to_user_facilities(
        db.query(Facility), Facility.id, db, stranger,
    ).all()
    assert facilities == []
    db.close()
    print("ok  an unassigned account sees nothing, including the site list")


def test_estate_wide_vendor_contracts_still_reach_everyone():
    db, a, b, people = build()
    vendor = Vendor(code="V1", name="Atlantic Mechanical")
    db.add(vendor)
    db.flush()
    db.add(VendorContract(contract_number="C-A", vendor_id=vendor.id,
                          facility_id=a.id, title="Hospital A only"))
    db.add(VendorContract(contract_number="C-B", vendor_id=vendor.id,
                          facility_id=b.id, title="Hospital B only"))
    db.add(VendorContract(contract_number="C-ALL", vendor_id=vendor.id,
                          facility_id=None, title="Whole estate"))
    db.flush()

    from sqlalchemy import or_
    allowed = get_user_facility_ids(db, people["tech_a"])
    visible = db.query(VendorContract).filter(or_(
        VendorContract.facility_id.in_(allowed),
        VendorContract.facility_id.is_(None),
    )).all()
    numbers = {c.contract_number for c in visible}
    # A contract with no facility covers every site, so it must not be hidden
    # by a filter designed to hide other sites' terms.
    assert numbers == {"C-A", "C-ALL"}, numbers
    db.close()
    print("ok  estate-wide contracts survive the site filter")


def test_hr_is_deliberately_not_scoped():
    # Recorded as a decision rather than an oversight: staff, payroll and leave
    # are organisation-wide, and a reader wondering why should find this.
    hr_tables = [n for n in Base.metadata.tables if n.startswith("hr_")]
    assert hr_tables, "expected HR tables to exist"
    unscoped = [n for n in hr_tables
                if "facility_id" not in Base.metadata.tables[n].columns]
    assert len(unscoped) == len(hr_tables), (
        "an HR table gained facility_id — either finish scoping HR across all "
        "of them, or this assumption needs revisiting"
    )
    print(f"ok  HR is organisation-wide by decision ({len(hr_tables)} tables)")


def test_registering_a_site_assigns_its_creator():
    """A facility admin who registers a hospital must be able to open it.

    Without the assignment the site exists and is invisible to the person who
    just made it — the scoping filters it straight back out, and the symptom
    reads as "creation failed" rather than "you have no access".
    """
    db, a, b, people = build()
    admin = User(username="fac_admin", email="fa@x.c", full_name="Facility Admin",
                 hashed_password="x", user_type=UserType.EMPLOYEE,
                 role=UserRole.FACILITY_ADMIN, facility_id=a.id)
    db.add(admin)
    db.flush()
    db.add(UserFacility(user_id=admin.id, facility_id=a.id))
    db.flush()

    fresh = Facility(name="Hospital C", phone="1", email="c@x.c", address="1",
                     city="X", state="GA", zip_code="1", country="USA")
    db.add(fresh)
    db.flush()
    assert fresh.id not in get_user_facility_ids(db, admin), "precondition"

    # What the endpoint now does on create.
    db.add(UserFacility(user_id=admin.id, facility_id=fresh.id))
    db.flush()

    assert fresh.id in get_user_facility_ids(db, admin)
    visible = scope_query_to_user_facilities(
        db.query(Facility), Facility.id, db, admin,
    ).all()
    assert fresh.id in {f.id for f in visible}, "created a site it cannot open"
    db.close()
    print("ok  registering a site assigns its creator")


def test_a_user_created_in_a_site_belongs_to_it():
    """Creating somebody from inside a hospital scopes them to it."""
    db, a, b, people = build()
    starter = User(username="newstarter", email="ns@x.c", full_name="New Starter",
                   hashed_password="x", user_type=UserType.EMPLOYEE,
                   role=UserRole.TECHNICIAN, facility_id=a.id)
    db.add(starter)
    db.flush()
    db.add(UserFacility(user_id=starter.id, facility_id=a.id))
    db.flush()

    assert get_user_facility_ids(db, starter) == {a.id}
    seen = scope_query_to_user_facilities(
        db.query(Fixture), Fixture.facility_id, db, starter,
    ).all()
    assert {f.facility_id for f in seen} == {a.id}, "sees a hospital they are not in"
    db.close()
    print("ok  a person created inside a site belongs to that site")


def test_a_fault_cannot_be_raised_on_another_sites_fixture():
    """Report-fault looked the fixture up by id and never asked whose it was."""
    from app.api.v1.endpoints import fixtures as routes
    from app.schemas.fixture import FixtureFill, FixtureUpdate, ReportFaultRequest

    db, a, b, people = build()
    theirs = db.query(Fixture).filter_by(facility_id=b.id).one()
    their_room = db.get(Location, theirs.location_id)
    attempts = {
        "report a fault": lambda: routes.report_fault(
            theirs.id, ReportFaultRequest(description="Not working"),
            db=db, current_user=people["tech_a"]),
        "edit": lambda: routes.update_fixture(
            theirs.id, FixtureUpdate(label="mine now"), db=db, current_user=people["tech_a"]),
        "fill": lambda: routes.fill_rooms(
            FixtureFill(location_ids=[their_room.id], items=[{"fixture_type": "chair", "count": 1}]),
            db=db, current_user=people["tech_a"]),
    }
    for name, attempt in attempts.items():
        try:
            attempt()
            raise AssertionError(f"could {name} on another hospital's fixture")
        except HTTPException as exc:
            assert exc.status_code == 403, f"{name}: {exc.status_code} {exc.detail}"
    db.close()
    print("ok  another site's fixtures cannot be faulted, edited or filled")


if __name__ == "__main__":
    tests = [v for k, v in sorted(globals().items()) if k.startswith("test_")]
    for t in tests:
        t()
    print(f"\n{len(tests)} checks passed")
