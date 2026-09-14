"""Prove the things in a room are assets, each with its own tag, and stay in their site.

Fixtures are part of the room and stay fixtures. Chairs, tables and displays
are assets: one per item, a permanent tag that never names the room, and the
room recorded as where the asset currently is.

    DATABASE_URL=sqlite:// python backend/tests/test_room_assets.py
"""
from __future__ import annotations

import importlib.util
import os
import pathlib
import sys

os.environ.setdefault("DATABASE_URL", "sqlite://")
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))

from fastapi import HTTPException  # noqa: E402
from sqlalchemy import create_engine, text  # noqa: E402
from sqlalchemy.orm import sessionmaker  # noqa: E402

import app.models  # noqa: E402,F401
from app.db.base import Base  # noqa: E402
from app.models.discipline import Discipline  # noqa: E402
from app.models.equipment import Equipment, EquipmentStatus  # noqa: E402
from app.models.facility import Facility  # noqa: E402
from app.models.fixture import Fixture  # noqa: E402
from app.models.location import Location  # noqa: E402
from app.models.user import User, UserRole, UserType  # noqa: E402
from app.services import room_assets  # noqa: E402

engine = create_engine("sqlite://", connect_args={"check_same_thread": False})
Session = sessionmaker(bind=engine)


def build():
    Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)
    db = Session()
    site = Facility(name="Lahore Office", phone="1", email="l@x.c", address="1",
                    city="X", state="GA", zip_code="1", country="USA")
    db.add(site)
    db.flush()
    for code in ("building_envelope", "it_low_voltage", "biomedical", "electrical"):
        db.add(Discipline(code=code, name=code, sort_order=1))
    floor = Location(facility_id=site.id, location_type="floor", code="111-00",
                     name="Third Floor", path="/1/", depth=0)
    db.add(floor)
    db.flush()
    rooms = []
    for n, crit in ((1, "standard"), (2, "critical")):
        room = Location(facility_id=site.id, location_type="room", code=f"ITO-000{n}",
                        name=f"IT office {n}", parent_id=floor.id, criticality=crit,
                        path=f"/1/{10 + n}/", depth=1)
        db.add(room)
        rooms.append(room)
    boss = User(username="boss", email="b@x.c", full_name="Boss", hashed_password="x",
                user_type=UserType.EMPLOYEE, role=UserRole.SUPERADMIN)
    db.add(boss)
    db.commit()
    return db, site, floor, rooms, boss


def test_twelve_chairs_are_twelve_assets_with_their_own_tags():
    db, site, floor, (office, _), boss = build()
    chairs = room_assets.create_in_room(db, location=office, asset_type="chair", count=12)
    assert len(chairs) == 12
    assert [c.asset_tag for c in chairs][:2] == ["LO-000001", "LO-000002"]
    assert chairs[-1].asset_tag == "LO-000012"
    # The tag names the site, never the room, so it stays true when a chair moves.
    assert all("ITO" not in c.asset_tag for c in chairs)
    assert {c.location_id for c in chairs} == {office.id}
    assert {c.facility_id for c in chairs} == {site.id}
    trade = db.query(Discipline).filter_by(code="building_envelope").one()
    assert {c.discipline_id for c in chairs} == {trade.id}
    # Seeded so a book value can be computed once somebody enters a cost.
    assert all(c.useful_life_years for c in chairs)
    # Nothing invented: make, model and serial wait to be recorded.
    assert {(c.make, c.model, c.serial_number) for c in chairs} == {("", "", "")}
    assert chairs[0].type_label == "Chair"

    more = room_assets.create_in_room(db, location=office, asset_type="display_screen", count=1)
    assert more[0].asset_tag == "LO-000013", "the series continues across types"
    db.close()
    print("ok  twelve chairs are twelve assets with their own permanent tags")


def test_a_room_item_takes_the_rooms_criticality():
    db, site, floor, (_, server_room), boss = build()
    [screen] = room_assets.create_in_room(db, location=server_room, asset_type="computer", count=1)
    assert screen.criticality == "critical"
    db.close()
    print("ok  a room item inherits the room's criticality")


def test_sites_with_the_same_initials_do_not_share_tags():
    db, site, floor, (office, _), boss = build()
    room_assets.create_in_room(db, location=office, asset_type="chair", count=2)
    twin = Facility(name="Lakeside Orthopaedics", phone="1", email="t@x.c", address="1",
                    city="X", state="GA", zip_code="1", country="USA")
    db.add(twin)
    db.flush()
    ward = Location(facility_id=twin.id, location_type="room", code="W-1", name="Ward",
                    path="/9/", depth=0)
    db.add(ward)
    db.flush()
    [chair] = room_assets.create_in_room(db, location=ward, asset_type="chair", count=1)
    assert chair.asset_tag == "LO-000003", chair.asset_tag
    db.close()
    print("ok  two sites with the same initials never issue the same tag")


def test_what_is_not_an_asset_is_refused():
    db, site, floor, (office, _), boss = build()
    for asset_type, discipline, expect in (
        ("receptacle", None, "fixture"),       # part of the room
        ("Podium", None, "trade"),             # not catalogued, no trade given
        ("chair", "no_such_trade", "Unknown trade"),
    ):
        try:
            room_assets.create_in_room(db, location=office, asset_type=asset_type,
                                       count=1, discipline_code=discipline)
            raise AssertionError(f"{asset_type} was accepted")
        except ValueError as exc:
            assert expect in str(exc), exc
    [podium] = room_assets.create_in_room(db, location=office, asset_type="Podium",
                                          count=1, discipline_code="building_envelope")
    assert podium.asset_type == "podium" and podium.type_label == "Podium"
    db.close()
    print("ok  sockets and trade-less custom items are refused as assets")


def test_top_up_counts_only_assets_still_in_the_room():
    db, site, floor, (office, _), boss = build()
    chairs = room_assets.create_in_room(db, location=office, asset_type="chair", count=5)
    assert len(room_assets.top_up(db, location=office, asset_type="chair", count=12)) == 7
    assert room_assets.top_up(db, location=office, asset_type="chair", count=12) == []
    assert room_assets.top_up(db, location=office, asset_type="chair", count=2) == []
    chairs[0].status = EquipmentStatus.RETIRED
    db.flush()
    assert len(room_assets.top_up(db, location=office, asset_type="chair", count=12)) == 1
    assert db.query(Equipment).filter_by(location_id=office.id).count() == 13
    db.close()
    print("ok  topping up counts chairs still in service, and never removes")


def test_the_register_filters_by_room_and_kind_on_the_server():
    from app.api.v1.endpoints.equipment import list_equipment
    db, site, floor, (office, server_room), boss = build()
    room_assets.create_in_room(db, location=office, asset_type="chair", count=3)
    room_assets.create_in_room(db, location=server_room, asset_type="computer", count=2)
    db.add(Equipment(asset_tag="LIFT-1", make="Otis", model="Gen2", serial_number="S",
                     facility_id=site.id, location_id=None, status=EquipmentStatus.ACTIVE))
    db.commit()

    def listed(**filters):
        args = dict(facility_id=site.id, search=None, location_id=None, kind=None,
                    asset_type=None, discipline_id=None, skip=0, limit=100)
        args.update(filters)
        return list_equipment.__wrapped__(db=db, current_user=boss, **args)

    assert listed()["total"] == 6
    assert listed(location_id=office.id)["total"] == 3
    # A floor includes every room on it.
    assert listed(location_id=floor.id)["total"] == 5
    assert listed(kind="room_items")["total"] == 5
    assert [e.asset_tag for e in listed(kind="equipment")["items"]] == ["LIFT-1"]
    assert listed(asset_type="computer")["total"] == 2
    assert listed(search="computer")["total"] == 2
    db.close()
    print("ok  the register filters by room, floor, kind and type on the server")


def test_location_changes_refresh_the_asset_list():
    from app.utils.read_cache import mutation_cache_namespaces
    # The building setup creates and retires assets through /locations; without
    # this the Assets page kept showing the old list for the cache lifetime.
    assert "equipment" in mutation_cache_namespaces("/api/v1/locations/bulk-import")
    assert "equipment" in mutation_cache_namespaces("/api/v1/locations/fill-contents")
    print("ok  location writes clear the cached asset list")


def _load_migration():
    path = (pathlib.Path(__file__).resolve().parents[1] / "alembic" / "versions"
            / "t5e6f7a8b9c0_room_items_are_assets.py")
    spec = importlib.util.spec_from_file_location("room_items_migration", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_the_migration_moves_furniture_fixtures_into_assets():
    """Chairs saved as fixtures before this change become assets, work orders included.

    Also run by hand against PostgreSQL 17 when written; this keeps the logic
    covered without one.
    """
    from alembic.migration import MigrationContext
    from alembic.operations import Operations
    from app.models.service_request import ServiceRequest

    db, site, floor, (office, _), boss = build()
    db.add(Equipment(asset_tag="LO-000007", make="Otis", model="Gen2", serial_number="S",
                     facility_id=site.id, status=EquipmentStatus.ACTIVE))
    trade = db.query(Discipline).filter_by(code="building_envelope").one()
    sockets = db.query(Discipline).filter_by(code="electrical").one()
    for code, kind, active, discipline in (("CHR-01", "chair", True, trade),
                                           ("CHR-02", "chair", False, trade),
                                           ("SKT-01", "receptacle", True, sockets)):
        db.add(Fixture(facility_id=site.id, location_id=office.id, discipline_id=discipline.id,
                       fixture_type=kind, code=code, is_active=active))
    db.flush()
    chair = db.query(Fixture).filter_by(code="CHR-01").one()
    from app.services import fixture as fixture_service
    wo = fixture_service.report_fault(db, fixture=chair, reported_by_id=boss.id,
                                      description="Gas lift gone")
    db.commit()
    assert chair.work_order_id == wo.id
    office_id, wo_id = office.id, wo.id
    db.close()

    migration = _load_migration()
    with engine.begin() as conn:
        # Back to the schema the migration starts from.
        conn.execute(text("DROP INDEX ix_equipment_asset_type"))
        conn.execute(text("ALTER TABLE equipment DROP COLUMN asset_type"))
        migration.op = Operations(MigrationContext.configure(conn))
        migration.upgrade()

    db = Session()
    assert [f.fixture_type for f in db.query(Fixture).all()] == ["receptacle"]
    moved = db.query(Equipment).filter(Equipment.asset_type == "chair").order_by(Equipment.id).all()
    assert [m.asset_tag for m in moved] == ["LO-000008", "LO-000009"]
    assert [m.status for m in moved] == [EquipmentStatus.ACTIVE, EquipmentStatus.INACTIVE]
    assert {m.location_id for m in moved} == {office_id}
    assert db.get(ServiceRequest, wo_id).equipment_id == moved[0].id
    db.close()
    print("ok  the migration moves furniture into assets and repoints its work orders")


if __name__ == "__main__":
    tests = [v for k, v in sorted(globals().items()) if k.startswith("test_")]
    for t in tests:
        t()
    print(f"\n{len(tests)} checks passed")
