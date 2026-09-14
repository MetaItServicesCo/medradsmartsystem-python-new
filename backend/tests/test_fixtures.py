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


if __name__ == "__main__":
    tests = [v for k, v in sorted(globals().items()) if k.startswith("test_")]
    for t in tests:
        t()
    print(f"\n{len(tests)} checks passed")
