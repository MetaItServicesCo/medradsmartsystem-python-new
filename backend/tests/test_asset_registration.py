"""Prove registering, placing and moving an asset behaves as agreed.

Tags are issued unless an existing one is given, and never repeat within a site.
Make, model and serial are required for clinical equipment only. An asset can
sit anywhere, serve any spaces, and takes the criticality of the most critical
of those unless somebody sets it — and a move follows the new room only when
nobody did.

    DATABASE_URL=sqlite:// python backend/tests/test_asset_registration.py
"""
from __future__ import annotations

import os
import pathlib
import sys

os.environ.setdefault("DATABASE_URL", "sqlite://")
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))

from fastapi import HTTPException  # noqa: E402
from pydantic import ValidationError  # noqa: E402
from sqlalchemy import create_engine  # noqa: E402
from sqlalchemy.orm import sessionmaker  # noqa: E402

import app.models  # noqa: E402,F401
from app.api.v1.endpoints import equipment as routes  # noqa: E402
from app.db.base import Base  # noqa: E402
from app.models.asset_link import AssetServesLocation  # noqa: E402
from app.models.discipline import Discipline  # noqa: E402
from app.models.equipment import Equipment  # noqa: E402
from app.models.facility import Facility  # noqa: E402
from app.models.location import Location  # noqa: E402
from app.models.user import User, UserRole, UserType  # noqa: E402
from app.models.user_facility import UserFacility  # noqa: E402
from app.schemas.equipment import (  # noqa: E402
    EquipmentCreate, EquipmentUpdate, RoomAssetsCreate, ServesSpace,
)

engine = create_engine("sqlite://", connect_args={"check_same_thread": False})
Session = sessionmaker(bind=engine)


def build():
    Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)
    db = Session()

    def site(name):
        f = Facility(name=name, phone="1", email=f"{name[:3]}@x.c", address="1",
                     city="X", state="GA", zip_code="1", country="USA")
        db.add(f)
        db.flush()
        return f

    lahore, other = site("Lahore Office"), site("Karachi Hospital")
    for code in ("mechanical", "building_envelope", "electrical"):
        db.add(Discipline(code=code, name=code, sort_order=1))
    db.flush()

    def space(code, kind, parent=None, crit="standard", facility=lahore):
        loc = Location(facility_id=facility.id, location_type=kind, code=code, name=code,
                       parent_id=parent.id if parent else None, criticality=crit,
                       path="/", depth=(parent.depth + 1) if parent else 0)
        db.add(loc)
        db.flush()
        loc.path = f"{parent.path if parent else '/'}{loc.id}/"
        return loc

    roof = space("ROOF", "floor", crit="low")
    plant_room = space("MR-01", "mech_room", roof, crit="standard")
    theatres = space("SURG-01", "floor", crit="standard")
    or1 = space("OR-1", "room", theatres, crit="critical")
    office = space("OFF-1", "room", theatres, crit="low")
    elsewhere = space("K-OR", "room", crit="critical", facility=other)

    def person(username, role, facility=None):
        u = User(username=username, email=f"{username}@x.c", full_name=username,
                 hashed_password="x", user_type=UserType.EMPLOYEE, role=role,
                 facility_id=facility.id if facility else None)
        db.add(u)
        db.flush()
        if facility:
            db.add(UserFacility(user_id=u.id, facility_id=facility.id))
        return u

    people = {
        "admin": person("boss", UserRole.SUPERADMIN),
        "manager": person("fm", UserRole.FACILITY_MANAGER, lahore),
        "tech": person("tech", UserRole.TECHNICIAN, lahore),
    }
    db.commit()
    trade = {d.code: d.id for d in db.query(Discipline).all()}
    places = dict(roof=roof, plant_room=plant_room, theatres=theatres, or1=or1,
                  office=office, elsewhere=elsewhere)
    return db, lahore, other, places, people, trade


def register(db, user, **fields):
    return routes.create_equipment(EquipmentCreate(**fields), db=db, current_user=user)


def refused(call, status):
    try:
        call()
    except HTTPException as exc:
        assert exc.status_code == status, f"expected {status}, got {exc.status_code}: {exc.detail}"
        return exc.detail
    raise AssertionError(f"expected a {status} refusal")


def test_a_blank_tag_is_issued_and_a_typed_one_is_kept():
    db, site, _, places, people, trade = build()
    preview = routes.next_tag(facility_id=site.id, db=db, current_user=people["admin"])["tag"]
    first = register(db, people["admin"], facility_id=site.id, discipline_id=trade["mechanical"])
    assert first.asset_tag == preview == "LO-000001", (first.asset_tag, preview)

    kept = register(db, people["admin"], facility_id=site.id, discipline_id=trade["mechanical"],
                    asset_tag="ELEV-3", make="Otis", model="Gen2", serial_number="S-1")
    assert kept.asset_tag == "ELEV-3"
    # A sticker already in use at this site is refused, however it is typed.
    detail = refused(lambda: register(db, people["admin"], facility_id=site.id,
                                      discipline_id=trade["mechanical"], asset_tag=" elev-3 "), 409)
    assert "ELEV-3" in detail
    assert register(db, people["admin"], facility_id=site.id,
                    discipline_id=trade["mechanical"]).asset_tag == "LO-000002"
    db.close()
    print("ok  tags are issued when blank, kept when typed, and never repeat in a site")


def test_the_same_tag_may_exist_at_another_site():
    db, site, other, places, people, trade = build()
    register(db, people["admin"], facility_id=site.id, discipline_id=trade["mechanical"],
             asset_tag="AHU-1")
    theirs = register(db, people["admin"], facility_id=other.id, discipline_id=trade["mechanical"],
                      asset_tag="AHU-1")
    assert theirs.asset_tag == "AHU-1"
    db.close()
    print("ok  uniqueness is per site: two hospitals may both have an AHU-1")


def test_only_clinical_equipment_must_be_identified():
    db, site, _, places, people, trade = build()
    pump = register(db, people["admin"], facility_id=site.id, discipline_id=trade["mechanical"])
    assert (pump.make, pump.model, pump.serial_number) == ("", "", "")
    try:
        EquipmentCreate(facility_id=site.id, modality_id=1, make="GE")
        raise AssertionError("clinical equipment without model and serial was accepted")
    except ValidationError as exc:
        assert "model" in str(exc) and "serial number" in str(exc)
    EquipmentCreate(facility_id=site.id, modality_id=1, make="GE", model="Optima", serial_number="X1")
    db.close()
    print("ok  plant may be registered bare; clinical equipment needs make, model and serial")


def test_an_asset_can_sit_anywhere():
    db, site, _, places, people, trade = build()
    for where in ("roof", "theatres", "plant_room", "or1"):
        asset = register(db, people["admin"], facility_id=site.id,
                         discipline_id=trade["mechanical"], location_id=places[where].id)
        assert asset.location_id == places[where].id
    unplaced = register(db, people["admin"], facility_id=site.id, discipline_id=trade["mechanical"])
    assert unplaced.location_id is None
    db.close()
    print("ok  an asset can be placed on a floor, a plant room, a room, or nowhere yet")


def test_what_it_serves_decides_how_critical_it_is():
    db, site, _, places, people, trade = build()
    # Sits in a standard plant room; serves the theatre floor, which holds OR-1.
    ahu = register(db, people["admin"], facility_id=site.id, discipline_id=trade["mechanical"],
                   asset_tag="AHU-2", location_id=places["plant_room"].id,
                   serves=[ServesSpace(location_id=places["theatres"].id, service_type="supply_air")])
    assert ahu.criticality == "critical", ahu.criticality
    links = db.query(AssetServesLocation).filter_by(equipment_id=ahu.id).all()
    assert [(l.location_id, l.service_type) for l in links] == [(places["theatres"].id, "supply_air")]

    # Somebody who knows better still wins.
    stated = register(db, people["admin"], facility_id=site.id, discipline_id=trade["mechanical"],
                      location_id=places["plant_room"].id, criticality="high",
                      serves=[ServesSpace(location_id=places["or1"].id, service_type="supply_air")])
    assert stated.criticality == "high"

    refused(lambda: register(db, people["admin"], facility_id=site.id,
                             discipline_id=trade["mechanical"],
                             serves=[ServesSpace(location_id=places["elsewhere"].id,
                                                 service_type="supply_air")]), 400)
    refused(lambda: register(db, people["admin"], facility_id=site.id,
                             discipline_id=trade["mechanical"],
                             serves=[ServesSpace(location_id=places["or1"].id,
                                                 service_type="lemonade")]), 422)
    assert db.query(Equipment).filter_by(facility_id=site.id).count() == 2, "refusals wrote nothing"
    db.close()
    print("ok  an air handler serving theatres is critical, wherever it sits")


def test_serves_can_be_changed_from_the_asset_and_criticality_follows():
    db, site, _, places, people, trade = build()
    fan = register(db, people["manager"], facility_id=site.id, discipline_id=trade["mechanical"],
                   location_id=places["plant_room"].id)
    assert fan.criticality == "standard"

    rows = routes.add_serves(fan.id, ServesSpace(location_id=places["or1"].id,
                                                 service_type="exhaust_air"),
                             db=db, current_user=people["manager"])
    assert [r.code for r in rows] == ["OR-1"]
    db.refresh(fan)
    assert fan.criticality == "critical", "serving a theatre raises it"

    refused(lambda: routes.add_serves(fan.id, ServesSpace(location_id=places["or1"].id,
                                                          service_type="exhaust_air"),
                                      db=db, current_user=people["manager"]), 409)
    refused(lambda: routes.add_serves(fan.id, ServesSpace(location_id=places["office"].id,
                                                          service_type="exhaust_air"),
                                      db=db, current_user=people["tech"]), 403)

    assert routes.remove_serves(fan.id, rows[0].id, db=db, current_user=people["manager"]) == []
    db.refresh(fan)
    assert fan.criticality == "standard", "and no longer serving it lowers it back"
    db.close()
    print("ok  a facility manager can change what an asset serves, and criticality follows")


def test_a_move_follows_the_new_room_unless_criticality_was_set():
    db, site, _, places, people, trade = build()
    chair = register(db, people["admin"], facility_id=site.id, discipline_id=trade["building_envelope"],
                     location_id=places["office"].id)
    assert chair.criticality == "low"
    moved = routes.update_equipment(chair.id, EquipmentUpdate(location_id=places["or1"].id),
                                    db=db, current_user=people["admin"])
    assert moved.location_id == places["or1"].id and moved.criticality == "critical"

    pinned = register(db, people["admin"], facility_id=site.id, discipline_id=trade["building_envelope"],
                      location_id=places["office"].id, criticality="high")
    moved = routes.update_equipment(pinned.id, EquipmentUpdate(location_id=places["or1"].id),
                                    db=db, current_user=people["admin"])
    assert moved.criticality == "high", "a chosen criticality survives a move"

    refused(lambda: routes.update_equipment(pinned.id, EquipmentUpdate(
        location_id=places["elsewhere"].id), db=db, current_user=people["admin"]), 400)
    db.close()
    print("ok  a move takes the new room's criticality only if nobody set one")


def test_a_tag_cannot_be_changed_to_one_already_in_use():
    db, site, _, places, people, trade = build()
    a = register(db, people["admin"], facility_id=site.id, discipline_id=trade["mechanical"], asset_tag="P-1")
    b = register(db, people["admin"], facility_id=site.id, discipline_id=trade["mechanical"], asset_tag="P-2")
    refused(lambda: routes.update_equipment(b.id, EquipmentUpdate(asset_tag="p-1"),
                                            db=db, current_user=people["admin"]), 409)
    refused(lambda: routes.update_equipment(b.id, EquipmentUpdate(asset_tag="  "),
                                            db=db, current_user=people["admin"]), 422)
    same = routes.update_equipment(a.id, EquipmentUpdate(asset_tag="P-1", make="Grundfos"),
                                   db=db, current_user=people["admin"])
    assert same.make == "Grundfos", "keeping its own tag is not a clash"
    db.close()
    print("ok  a tag cannot be changed to one another asset already carries")


def test_a_room_item_can_keep_its_sticker_but_twelve_cannot_share_one():
    db, site, _, places, people, trade = build()
    [chair] = routes.add_room_items(RoomAssetsCreate(
        location_id=places["office"].id, asset_type="chair", count=1,
        asset_tag="OLD-77", serial_number="HM-1", make="Herman Miller", model="Aeron", cost=950,
    ), db=db, current_user=people["admin"])["items"]
    assert (chair.asset_tag, chair.serial_number, chair.make) == ("OLD-77", "HM-1", "Herman Miller")

    detail = refused(lambda: routes.add_room_items(RoomAssetsCreate(
        location_id=places["office"].id, asset_type="chair", count=2, asset_tag="OLD-78",
    ), db=db, current_user=people["admin"]), 422)
    assert "one item" in detail
    refused(lambda: routes.add_room_items(RoomAssetsCreate(
        location_id=places["office"].id, asset_type="chair", count=1, asset_tag="old-77",
    ), db=db, current_user=people["admin"]), 422)

    batch = routes.add_room_items(RoomAssetsCreate(
        location_id=places["office"].id, asset_type="table", count=3, make="Steelcase", cost=400,
    ), db=db, current_user=people["admin"])["items"]
    assert {t.make for t in batch} == {"Steelcase"} and len({t.asset_tag for t in batch}) == 3
    db.close()
    print("ok  one room item may keep its sticker; a batch shares make and cost, never a tag")


if __name__ == "__main__":
    tests = [v for k, v in sorted(globals().items()) if k.startswith("test_")]
    for t in tests:
        t()
    print(f"\n{len(tests)} checks passed")
