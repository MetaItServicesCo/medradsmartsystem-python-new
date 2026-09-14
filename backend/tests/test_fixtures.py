"""Prove the room register and the fault path behave.

The thing being tested is the one the system was asked for first: a socket in
an operating theatre stops working, and a ticket reaches the right trade
without anybody choosing one.

    DATABASE_URL=sqlite:// python backend/tests/test_fixtures.py
"""
from __future__ import annotations

import os
import pathlib
import sys
from datetime import datetime

os.environ.setdefault("DATABASE_URL", "sqlite://")
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))

from sqlalchemy import create_engine  # noqa: E402
from sqlalchemy.orm import sessionmaker  # noqa: E402

import app.models  # noqa: E402,F401
from app.db.base import Base  # noqa: E402
from app.models.discipline import Discipline  # noqa: E402
from app.models.facility import Facility  # noqa: E402
from app.models.fixture import Fixture, FixtureStatus  # noqa: E402
from app.models.location import Location  # noqa: E402
from app.models.service_request import ServiceRequest  # noqa: E402
from app.models.user import User, UserRole, UserType  # noqa: E402
from app.services import fixture as fixture_service  # noqa: E402
from app.services import fixture_catalog  # noqa: E402

engine = create_engine("sqlite://", connect_args={"check_same_thread": False})
Base.metadata.create_all(engine)
Session = sessionmaker(bind=engine)


def build():
    # Each test gets the schema back empty. They share one in-memory engine,
    # and the disciplines seeded below are unique by code.
    Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)
    db = Session()
    facility = Facility(
        name="Test Hospital", phone="1", email="a@b.c", address="1",
        city="X", state="GA", zip_code="1", country="USA",
    )
    db.add(facility)
    db.flush()

    for code, name, order in (
        ("electrical", "Electrical", 20), ("mechanical", "Mechanical", 10),
        ("plumbing", "Plumbing", 30), ("medical_gas", "Medical Gas", 60),
    ):
        db.add(Discipline(code=code, name=name, sort_order=order))
    db.flush()

    user = User(
        username="nurse", email="n@b.c", full_name="A Nurse",
        hashed_password="x", user_type=UserType.EMPLOYEE, role=UserRole.EMPLOYEE,
    )
    db.add(user)
    db.flush()

    theatre = Location(
        facility_id=facility.id, location_type="room", code="OR-2",
        name="Operating Room 2", space_use="operating_room",
        criticality="critical", path="/1/", depth=0,
    )
    db.add(theatre)
    db.flush()
    return db, facility, user, theatre


def test_catalog_routes_every_type_to_a_trade():
    for key, entry in fixture_catalog.BY_TYPE.items():
        assert entry["discipline"], f"{key} has no trade"
        assert entry["prefix"], f"{key} has no code prefix"
        assert entry["spec"], f"{key} asks for nothing"
    # The routing that matters: these must not drift into the wrong trade.
    assert fixture_catalog.discipline_for("receptacle") == "electrical"
    assert fixture_catalog.discipline_for("supply_diffuser") == "mechanical"
    assert fixture_catalog.discipline_for("sink") == "plumbing"
    assert fixture_catalog.discipline_for("med_gas_outlet") == "medical_gas"
    print("ok  every fixture type routes to a trade")


def test_specs_are_us_customary():
    units = {
        f.get("unit")
        for entry in fixture_catalog.BY_TYPE.values()
        for f in entry["spec"] if f.get("unit")
    }
    # Nothing metric should have crept in: no millimetres of water, no litres
    # per minute, no degrees Celsius.
    for banned in ("mm w.c.", "L/min", "degC", "m3/h", "kPa", "bar"):
        assert banned not in units, f"{banned} is not US customary"
    for expected in ("V", "A", "CFM", "GPM", "PSI", "in. w.c.", "degF", "in"):
        assert expected in units, f"{expected} missing from the catalogue"
    print(f"ok  specs are US customary ({len(units)} distinct units)")


def test_bulk_create_numbers_sequentially():
    db, facility, user, theatre = build()
    made = fixture_service.bulk_create(
        db, location=theatre, fixture_type="receptacle", count=12,
        spec={"branch": "critical"}, created_by_id=user.id,
    )
    assert len(made) == 12
    assert [f.code for f in made][:3] == ["SKT-01", "SKT-02", "SKT-03"]
    assert made[-1].code == "SKT-12"
    # Catalogue defaults fill in around what the form supplied.
    assert made[0].spec["branch"] == "critical"
    assert made[0].spec["amperage_a"] == 20
    assert made[0].spec["hospital_grade"] is True

    # A second batch continues rather than restarting.
    more = fixture_service.bulk_create(
        db, location=theatre, fixture_type="receptacle", count=2,
    )
    assert [f.code for f in more] == ["SKT-13", "SKT-14"]
    db.close()
    print("ok  bulk create numbers sequentially and continues")


def test_serials_land_positionally():
    db, facility, user, theatre = build()
    made = fixture_service.bulk_create(
        db, location=theatre, fixture_type="med_gas_outlet", count=3,
        serial_numbers=["SN-A", "SN-B"],
    )
    assert [f.serial_number for f in made] == ["SN-A", "SN-B", None]
    # Eight of twelve serials beats no register at all.
    assert made[0].spec["gas"] == "oxygen"
    assert made[0].spec["pressure_psi"] == 50
    db.close()
    print("ok  serial numbers land positionally, shortfall allowed")


def test_fault_reaches_the_right_trade_without_being_asked():
    db, facility, user, theatre = build()
    sockets = fixture_service.bulk_create(
        db, location=theatre, fixture_type="receptacle", count=4,
        spec={"branch": "critical"}, circuit_ref="EM-3/14",
    )
    socket = sockets[3]

    request = fixture_service.report_fault(
        db, fixture=socket, reported_by_id=user.id,
        description="Dead, confirmed with a second device",
    )

    electrical = db.query(Discipline).filter_by(code="electrical").first()
    assert request.discipline_id == electrical.id, "should route to electrical unasked"
    assert request.location_id == theatre.id
    assert request.equipment_id is None
    # The theatre is critical, so the work order must not land as medium.
    # Still a plain string here: SQLAlchemy coerces to the enum on flush.
    priority = getattr(request.priority, "value", request.priority)
    assert str(priority).lower() == "high"
    # The title has to tell a technician what to bring.
    title = request.problem_description
    assert "SKT-04" in title
    assert "critical" in title.lower()
    assert "Operating Room 2" in title
    # Unit casing survives: amps are A, volts are V. str.capitalize() would
    # have lowercased both, and "20 a" is a different unit from "20 A".
    assert "20 A" in title and "120 V" in title
    assert title.startswith("Critical")

    assert socket.status == FixtureStatus.FAULTY.value
    assert socket.work_order_id == request.id
    db.close()
    print("ok  a faulty socket routes to electrical unasked")


def test_one_dead_socket_does_not_close_the_theatre():
    db, facility, user, theatre = build()
    sockets = fixture_service.bulk_create(
        db, location=theatre, fixture_type="receptacle", count=12,
    )
    fixture_service.report_fault(
        db, fixture=sockets[0], reported_by_id=user.id, description="Dead",
    )
    from app.models.space_status import SpaceStatus
    assert db.query(SpaceStatus).count() == 0, "must not close the room on its own"

    # ...but the reporter can say it does.
    fixture_service.report_fault(
        db, fixture=sockets[1], reported_by_id=user.id,
        description="Arcing", takes_out_of_service=True,
    )
    state = db.query(SpaceStatus).filter_by(location_id=theatre.id).first()
    assert state is not None and state.availability == "out_of_service"
    db.close()
    print("ok  a fault closes the room only when the reporter says so")


def test_summary_groups_by_type_and_counts_faults():
    db, facility, user, theatre = build()
    sockets = fixture_service.bulk_create(
        db, location=theatre, fixture_type="receptacle", count=6)
    fixture_service.bulk_create(
        db, location=theatre, fixture_type="light_fixture", count=4)
    fixture_service.bulk_create(
        db, location=theatre, fixture_type="med_gas_outlet", count=2)
    fixture_service.report_fault(
        db, fixture=sockets[0], reported_by_id=user.id, description="Dead")
    db.flush()

    rows = {r["fixture_type"]: r for r in fixture_service.summarise_location(db, theatre.id)}
    assert rows["receptacle"]["total"] == 6
    assert rows["receptacle"]["faulty"] == 1
    assert rows["receptacle"]["working"] == 5
    assert rows["light_fixture"]["total"] == 4
    assert rows["med_gas_outlet"]["discipline"] == "medical_gas"
    db.close()
    print("ok  the room summary groups by type and counts faults")


def test_describe_reads_like_a_dispatch_line():
    assert fixture_catalog.describe(
        "receptacle", {"branch": "critical", "voltage_v": 120, "amperage_a": 20},
    ) == "critical 120 V 20 A receptacle"
    assert "oxygen" in fixture_catalog.describe("med_gas_outlet", {"gas": "oxygen"})
    # An unspecified fixture still names itself rather than returning blank.
    assert fixture_catalog.describe("light_fixture", None) == "light fixture"
    print("ok  the summary line reads like a dispatch note")


def test_codes_are_unique_within_a_room_not_globally():
    db, facility, user, theatre = build()
    other = Location(
        facility_id=facility.id, location_type="room", code="OR-3",
        name="Operating Room 3", space_use="operating_room", path="/2/", depth=0,
    )
    db.add(other)
    db.flush()

    a = fixture_service.bulk_create(db, location=theatre, fixture_type="receptacle", count=2)
    b = fixture_service.bulk_create(db, location=other, fixture_type="receptacle", count=2)
    db.commit()
    # Both rooms have SKT-01. That is correct: people say "SKT-01 in OR-3".
    assert a[0].code == b[0].code == "SKT-01"
    assert db.query(Fixture).filter_by(code="SKT-01").count() == 2
    db.close()
    print("ok  codes repeat across rooms and are unique within one")


def test_a_fixture_the_catalogue_does_not_know_needs_a_trade():
    """A sump pump is not catalogued. It is still a fixture somebody maintains."""
    db, facility, user, theatre = build()
    try:
        fixture_service.bulk_create(db, location=theatre, fixture_type="sump_pump", count=1)
        raise AssertionError("an uncatalogued type with no trade was accepted")
    except ValueError as exc:
        assert "trade" in str(exc)

    made = fixture_service.bulk_create(
        db, location=theatre, fixture_type="sump_pump", count=2,
        discipline_code="plumbing", code_prefix="sump", spec={"flow_gpm": 40},
    )
    plumbing = db.query(Discipline).filter_by(code="plumbing").first()
    assert [f.code for f in made] == ["SUMP-01", "SUMP-02"], [f.code for f in made]
    assert all(f.discipline_id == plumbing.id for f in made)
    # A fault on it routes by the trade it was given, like any catalogued type.
    wo = fixture_service.report_fault(db, fixture=made[0], reported_by_id=user.id,
                                      description="Not starting on high level")
    assert wo.discipline_id == plumbing.id
    db.close()
    print("ok  an uncatalogued fixture is accepted with a trade and routes by it")


def test_custom_values_in_a_catalogued_spec_are_kept():
    """Choices are suggestions: a NEMA configuration not in the list survives."""
    db, facility, user, theatre = build()
    made = fixture_service.bulk_create(
        db, location=theatre, fixture_type="receptacle", count=1,
        spec={"nema_config": "L14-30R", "voltage_v": 277, "colour_temperature": "4000 K"},
    )
    spec = made[0].spec
    assert spec["nema_config"] == "L14-30R"
    assert spec["voltage_v"] == 277
    assert spec["colour_temperature"] == "4000 K", "an extra detail must be stored"
    assert spec["hospital_grade"] is True, "defaults still fill what was not given"
    db.close()
    print("ok  custom and extra spec values are kept alongside the defaults")


def test_no_two_fixture_types_share_a_code_prefix():
    """A code is how a fault is reported out loud, so it has to name one kind of thing.

    SD was once both a supply diffuser and a smoke detector, and DP both a data
    outlet and a room pressure monitor. In a room with both, "SD-05 is faulty"
    could send a mechanic to a life-safety device.
    """
    from collections import defaultdict
    seen = defaultdict(list)
    for key, entry in fixture_catalog.BY_TYPE.items():
        seen[entry["prefix"]].append(key)
    shared = {prefix: keys for prefix, keys in seen.items() if len(keys) > 1}
    assert not shared, f"prefixes used by more than one type: {shared}"
    print(f"ok  every fixture type has its own code prefix ({len(seen)} prefixes)")


def _admin(db):
    boss = User(username="boss", email="boss@b.c", full_name="Boss", hashed_password="x",
                user_type=UserType.EMPLOYEE, role=UserRole.SUPERADMIN)
    db.add(boss)
    db.flush()
    return boss


def test_the_fixture_routes_run_end_to_end():
    """Call the endpoints themselves, not only the service underneath them.

    Every other check here goes through the service, which is why a helper that
    called itself with a name it was never given shipped: editing or removing a
    fixture raised before reaching any code these checks exercise.
    """
    from app.api.v1.endpoints import fixtures as routes
    from app.schemas.fixture import FixtureUpdate, ReportFaultRequest

    db, facility, user, theatre = build()
    boss = _admin(db)
    sockets = fixture_service.bulk_create(db, location=theatre, fixture_type="receptacle", count=3)
    db.commit()

    edited = routes.update_fixture(sockets[0].id, FixtureUpdate(label="Behind the anaesthesia boom"),
                                   db=db, current_user=boss)
    assert edited.label == "Behind the anaesthesia boom"

    reported = routes.report_fault(sockets[1].id, ReportFaultRequest(description="No power"),
                                   db=db, current_user=boss)
    assert reported.fixture_status == FixtureStatus.FAULTY.value

    routes.deactivate_fixture(sockets[2].id, db=db, current_user=boss)
    assert db.get(Fixture, sockets[2].id).is_active is False

    from fastapi import HTTPException
    try:
        routes.update_fixture(999999, FixtureUpdate(label="x"), db=db, current_user=boss)
        raise AssertionError("a missing fixture should be a 404")
    except HTTPException as exc:
        assert exc.status_code == 404
    db.close()
    print("ok  edit, report fault and remove run through the real routes")


def test_topping_up_adds_only_what_a_room_is_missing():
    """Giving a room type 12 chairs has to reach rooms that already exist."""
    db, facility, user, theatre = build()
    db.add(Discipline(code="building_envelope", name="Building", sort_order=5))
    db.flush()
    fixture_service.bulk_create(db, location=theatre, fixture_type="chair", count=5)

    added = fixture_service.top_up(db, location=theatre, fixture_type="chair", count=12)
    assert len(added) == 7, len(added)
    assert [f.code for f in added][:1] == ["CHR-06"], "numbering carries on"

    # Asking again changes nothing, so saving the setup twice is harmless.
    assert fixture_service.top_up(db, location=theatre, fixture_type="chair", count=12) == []
    # And a smaller number never takes chairs away.
    assert fixture_service.top_up(db, location=theatre, fixture_type="chair", count=3) == []
    assert db.query(Fixture).filter_by(location_id=theatre.id, fixture_type="chair").count() == 12

    # A removed chair is not a chair in the room.
    gone = db.query(Fixture).filter_by(location_id=theatre.id, code="CHR-01").one()
    gone.is_active = False
    db.flush()
    again = fixture_service.top_up(db, location=theatre, fixture_type="chair", count=12)
    assert len(again) == 1 and again[0].code == "CHR-13", [f.code for f in again]
    db.close()
    print("ok  topping up adds the shortfall, is repeatable, and never removes")


def test_filling_rooms_through_the_route_is_all_or_nothing():
    from app.api.v1.endpoints import fixtures as routes
    from app.schemas.fixture import FixtureFill

    db, facility, user, theatre = build()
    boss = _admin(db)
    db.add(Discipline(code="building_envelope", name="Building", sort_order=5))
    second = Location(facility_id=facility.id, location_type="room", code="CONF-2",
                      name="Conference 2", path="/9/", depth=0)
    db.add(second)
    db.commit()

    result = routes.fill_rooms(FixtureFill(
        location_ids=[theatre.id, second.id],
        items=[{"fixture_type": "chair", "count": 12}, {"fixture_type": "table", "count": 2}],
    ), db=db, current_user=boss)
    assert result.created == 28 and result.rooms_changed == 2, result

    # One bad item refuses the lot rather than leaving half the rooms filled.
    third = Location(facility_id=facility.id, location_type="room", code="CONF-3",
                     name="Conference 3", path="/10/", depth=0)
    db.add(third)
    db.commit()
    from fastapi import HTTPException
    try:
        routes.fill_rooms(FixtureFill(
            location_ids=[third.id],
            items=[{"fixture_type": "chair", "count": 4}, {"fixture_type": "mystery", "count": 1}],
        ), db=db, current_user=boss)
        raise AssertionError("an uncatalogued item with no trade was accepted")
    except HTTPException as exc:
        assert exc.status_code == 422
    assert db.query(Fixture).filter_by(location_id=third.id).count() == 0
    db.close()
    print("ok  filling rooms is all or nothing")


if __name__ == "__main__":
    tests = [v for k, v in sorted(globals().items()) if k.startswith("test_")]
    for t in tests:
        t()
    print(f"\n{len(tests)} checks passed")
