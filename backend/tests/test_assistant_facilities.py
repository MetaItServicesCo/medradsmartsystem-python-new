"""Prove the assistant's facilities tools return what the screens show, for the right site.

    DATABASE_URL=sqlite:// python backend/tests/test_assistant_facilities.py
"""
from __future__ import annotations

import inspect
import os
import pathlib
import sys
from datetime import date, datetime, timedelta

os.environ.setdefault("DATABASE_URL", "sqlite://")
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))

from sqlalchemy import create_engine  # noqa: E402
from sqlalchemy.orm import sessionmaker  # noqa: E402

import app.models  # noqa: E402,F401
from app.assistant.tools import entities, facilities  # noqa: E402
from app.assistant.tools.base import ToolContext, ToolInputError  # noqa: E402
from app.assistant.tools.registry import TOOL_DEFINITIONS, TOOLS_BY_NAME, dispatch  # noqa: E402
from app.db.base import Base  # noqa: E402
from app.models.asset_link import AssetServesLocation  # noqa: E402
from app.models.compliance import ComplianceProgram, ComplianceTask  # noqa: E402
from app.models.discipline import Discipline  # noqa: E402
from app.models.equipment import Equipment, EquipmentStatus  # noqa: E402
from app.models.facility import Facility  # noqa: E402
from app.models.location import Location  # noqa: E402
from app.models.maintenance_schedule import MaintenanceSchedule  # noqa: E402
from app.models.user import User, UserRole, UserType  # noqa: E402
from app.models.user_facility import UserFacility  # noqa: E402
from app.services import fixture as fixture_service  # noqa: E402
from app.services import room_assets  # noqa: E402

engine = create_engine("sqlite://", connect_args={"check_same_thread": False})
Session = sessionmaker(bind=engine)


def build():
    Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)
    db = Session()

    def site(name):
        f = Facility(name=name, phone="1", email=f"{name[:4]}@x.c", address="1",
                     city="X", state="GA", zip_code="1", country="USA")
        db.add(f)
        db.flush()
        return f

    lahore, karachi = site("Lahore Office"), site("Karachi Hospital")
    for code, name in (("electrical", "Electrical"), ("mechanical", "Mechanical / HVAC"),
                       ("building_envelope", "Building & Envelope"), ("it_low_voltage", "IT")):
        db.add(Discipline(code=code, name=name, sort_order=1))
    db.flush()

    def space(code, kind, facility, parent=None, name=None, crit="standard", use=None):
        loc = Location(facility_id=facility.id, location_type=kind, code=code, name=name or code,
                       parent_id=parent.id if parent else None, criticality=crit, space_use=use,
                       path="/", depth=(parent.depth + 1) if parent else 0)
        db.add(loc)
        db.flush()
        loc.path = f"{parent.path if parent else '/'}{loc.id}/"
        return loc

    building = space("B", "building", lahore, name="Main Building")
    floor = space("B-00", "floor", lahore, building, name="Ground Floor")
    surgery = space("B-00-SUR", "wing", lahore, floor, name="Surgery")
    or2 = space("OR-2", "room", lahore, surgery, name="Operating Room 2", crit="critical", use="operating_room")
    office = space("OFF-1", "room", lahore, floor, name="Admin Office", crit="low", use="office")
    plant = space("MR-01", "mech_room", lahore, building, name="Plant Room")
    theirs = space("OR-2K", "room", karachi, name="Operating Room 2")

    def person(username, role, facility=None):
        u = User(username=username, email=f"{username}@x.c", full_name=username, hashed_password="x",
                 user_type=UserType.EMPLOYEE, role=role, facility_id=facility.id if facility else None)
        db.add(u)
        db.flush()
        if facility:
            db.add(UserFacility(user_id=u.id, facility_id=facility.id))
        return u

    boss = person("boss", UserRole.SUPERADMIN)
    tech = person("tech", UserRole.FACILITY_MANAGER, lahore)

    sockets = fixture_service.bulk_create(db, location=or2, fixture_type="receptacle", count=6)
    fixture_service.bulk_create(db, location=or2, fixture_type="light_fixture", count=4)
    fixture_service.bulk_create(db, location=theirs, fixture_type="receptacle", count=9)
    fault = fixture_service.report_fault(db, fixture=sockets[0], reported_by_id=boss.id,
                                         description="Dead socket behind the boom")
    fault.sla_breached = True

    chairs = room_assets.create_in_room(db, location=office, asset_type="chair", count=5)
    ahu = Equipment(asset_tag="AHU-2", make="Trane", model="M-Series", serial_number="T1",
                    facility_id=lahore.id, location_id=plant.id, status=EquipmentStatus.ACTIVE,
                    discipline_id=db.query(Discipline).filter_by(code="mechanical").one().id,
                    cost=85000, installation_date=date(2024, 1, 1), useful_life_years=20)
    db.add(ahu)
    db.flush()
    db.add(AssetServesLocation(equipment_id=ahu.id, location_id=surgery.id, service_type="supply_air"))

    today = date.today()
    db.add_all([
        MaintenanceSchedule(facility_id=lahore.id, equipment_id=ahu.id, name="AHU quarterly PM",
                            next_due_date=today - timedelta(days=3)),
        MaintenanceSchedule(facility_id=lahore.id, equipment_id=ahu.id, name="AHU filter change",
                            next_due_date=today + timedelta(days=10)),
        MaintenanceSchedule(facility_id=lahore.id, name="Far future", next_due_date=today + timedelta(days=200)),
        MaintenanceSchedule(facility_id=karachi.id, name="Theirs", next_due_date=today - timedelta(days=1)),
    ])
    program = ComplianceProgram(facility_id=lahore.id, code="NFPA110-GEN", name="Generator load test",
                                authority="nfpa", frequency="monthly")
    db.add(program)
    db.flush()
    db.add_all([
        ComplianceTask(facility_id=lahore.id, program_id=program.id, due_date=today - timedelta(days=5),
                       status="scheduled"),
        ComplianceTask(facility_id=lahore.id, program_id=program.id, due_date=today + timedelta(days=20),
                       status="scheduled"),
    ])
    db.commit()
    return db, dict(lahore=lahore, karachi=karachi, building=building, floor=floor, surgery=surgery,
                    or2=or2, office=office, plant=plant, theirs=theirs), dict(boss=boss, tech=tech), \
        dict(ahu=ahu, chairs=chairs, fault=fault)


def ctx(db, user):
    return ToolContext(db=db, user=user)


def test_every_tool_schema_matches_its_function():
    """The model must never be offered an argument the backend would reject."""
    for tool in TOOL_DEFINITIONS:
        params = set(inspect.signature(tool.handler).parameters) - {"ctx"}
        offered = set(tool.parameters.get("properties", {}))
        assert offered <= params, f"{tool.name} offers {sorted(offered - params)} its function does not take"
        for required in tool.parameters.get("required", []):
            assert required in params, f"{tool.name} requires {required}"
    print(f"ok  all {len(TOOL_DEFINITIONS)} tool schemas match their functions")


def test_rooms_and_assets_resolve_by_what_people_call_them():
    db, where, people, things = build()
    c = ctx(db, people["tech"])
    by_code = entities.resolve_entity(c, kind="space", query="OR-2")
    assert [i["location_id"] for i in by_code.items] == [where["or2"].id], \
        "a site-scoped user does not see the other hospital's OR-2"
    by_name = entities.resolve_entity(c, kind="space", query="operating room")
    assert by_name.total_count == 1
    assert entities.resolve_entity(c, kind="asset", query="ahu-2").items[0]["asset_tag"] == "AHU-2"
    assert entities.resolve_entity(ctx(db, people["boss"]), kind="space", query="OR-2").total_count == 2
    db.close()
    print("ok  rooms resolve by door code or name, assets by tag, within the user's sites")


def test_space_contents_counts_everything_beneath():
    db, where, people, things = build()
    floor = facilities.space_contents(ctx(db, people["boss"]), location_id=where["floor"].id).items[0]
    assert floor["fixtures_by_type"] == {"Duplex receptacle": 6, "Light fixture": 4} or \
        sum(floor["fixtures_by_type"].values()) == 10, floor["fixtures_by_type"]
    assert sum(floor["fixtures_not_working"].values()) == 1, floor["fixtures_not_working"]
    assert floor["assets_by_type"] == {"Chair": 5}, floor["assets_by_type"]
    assert floor["open_work_orders"] == 1
    assert floor["spaces_directly_inside"] == {"wing": 1, "room": 1}, floor["spaces_directly_inside"]
    db.close()
    print("ok  a floor's contents include every room beneath it")


def test_fixtures_assets_and_work_orders_filter_like_the_screens():
    db, where, people, things = build()
    c = ctx(db, people["boss"])
    lahore = where["lahore"].id
    faulty = facilities.search_fixtures(c, facility_id=lahore, status="faulty")
    assert faulty.total_count == 1 and faulty.items[0]["space"].startswith("OR-2")
    assert facilities.search_fixtures(c, location_id=where["surgery"].id, trade="electrical").total_count == 10

    assert facilities.search_assets(c, facility_id=lahore, kind="room_items").total_count == 5
    assert facilities.search_assets(c, facility_id=lahore, kind="equipment").total_count == 1
    assert facilities.search_assets(c, location_id=where["floor"].id).total_count == 5
    try:
        facilities.search_assets(c, facility_id=lahore, status="broken")
        raise AssertionError("an invalid status was accepted")
    except ToolInputError as exc:
        assert "Valid values" in exc.detail

    orders = entities.search_service_requests(c, facility_id=lahore, trade="electrical",
                                              location_id=where["surgery"].id, sla_breached=True)
    assert orders.total_count == 1, orders.total_count
    assert orders.items[0]["trade"] == "Electrical" and orders.items[0]["space"].startswith("OR-2")
    assert entities.search_service_requests(c, facility_id=lahore, trade="mechanical").total_count == 0
    db.close()
    print("ok  fixtures, assets and work orders filter by site, space, trade and deadline")


def test_asset_detail_tells_the_whole_story():
    db, where, people, things = build()
    detail = facilities.asset_detail(ctx(db, people["boss"]), asset_tag="ahu-2").items[0]
    assert detail["serves"] == [{"space": "B-00-SUR · Surgery", "supplies": "supply_air"}], detail["serves"]
    assert [p["name"] for p in detail["maintenance_plans"]] == ["AHU quarterly PM", "AHU filter change"]
    assert detail["cost"] == 85000.0 and detail["net_book_value"] is not None
    assert detail["route"] == "/assets?asset={}".format(things["ahu"].id)
    missing = facilities.asset_detail(ctx(db, people["boss"]), asset_tag="NOPE-1")
    assert missing.total_count == 0 and missing.notes
    db.close()
    print("ok  an asset's detail covers where, what it serves, plans and value")


def test_due_work_counts_overdue_separately_and_stays_in_site():
    db, where, people, things = build()
    c = ctx(db, people["boss"])
    lahore = where["lahore"].id
    due = facilities.maintenance_due(c, facility_id=lahore, within_days=30)
    assert due.total_count == 2 and due.aggregates["overdue"] == 1, (due.total_count, due.aggregates)
    assert facilities.maintenance_due(c, facility_id=lahore, overdue_only=True).total_count == 1
    assert facilities.maintenance_due(ctx(db, people["tech"]), overdue_only=True).total_count == 1, \
        "the other hospital's overdue plan is not this user's"

    compliance = facilities.compliance_due(c, facility_id=lahore, overdue_only=True)
    assert compliance.total_count == 1 and compliance.items[0]["overdue"]
    assert facilities.compliance_due(c, facility_id=lahore, within_days=30).total_count == 2
    db.close()
    print("ok  maintenance and compliance due counts separate overdue and stay within site")


def test_site_overview_and_value_run():
    db, where, people, things = build()
    c = ctx(db, people["boss"])
    overview = facilities.site_overview(c, facility_id=where["lahore"].id)
    assert overview.items[0]["name"] == "Lahore Office" and overview.items[0]["overview"]
    value = facilities.asset_value(c, facility_id=where["lahore"].id)
    assert value.aggregates["asset_count"] == 6 and value.aggregates["total_cost"] == 85000.0
    try:
        facilities.site_overview(ctx(db, people["tech"]), facility_id=where["karachi"].id)
        raise AssertionError("reached another site's overview")
    except ToolInputError:
        pass
    db.close()
    print("ok  site overview and asset value work, and refuse another user's site")


def test_dispatch_refuses_arguments_a_tool_does_not_take():
    db, where, people, things = build()
    try:
        dispatch("search_assets", ctx(db, people["boss"]), {"facility_id": 1, "delete_everything": True})
        raise AssertionError("an unexpected argument was accepted")
    except ValueError as exc:
        assert "delete_everything" in str(exc)
    assert TOOLS_BY_NAME["search_assets"].module == "facility-inventory"
    db.close()
    print("ok  dispatch refuses arguments no tool declares")


if __name__ == "__main__":
    tests = [v for k, v in sorted(globals().items()) if k.startswith("test_")]
    for t in tests:
        t()
    print(f"\n{len(tests)} checks passed")
