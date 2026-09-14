"""Prove bulk editing does what the preview says, and nothing the ledger forbids.

The situation: a floor's chairs came from the building setup with no cost, and
the invoice has arrived. Set the cost once, for all of them.

    DATABASE_URL=sqlite:// python backend/tests/test_asset_bulk_edit.py
"""
from __future__ import annotations

import os
import pathlib
import sys
from datetime import date
from decimal import Decimal

os.environ.setdefault("DATABASE_URL", "sqlite://")
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))

from fastapi import HTTPException  # noqa: E402
from pydantic import ValidationError  # noqa: E402
from sqlalchemy import create_engine  # noqa: E402
from sqlalchemy.orm import sessionmaker  # noqa: E402

import app.models  # noqa: E402,F401
from app.api.v1.endpoints import equipment as routes  # noqa: E402
from app.db.base import Base  # noqa: E402
from app.models.asset_ledger import AssetLedgerEntry  # noqa: E402
from app.models.discipline import Discipline  # noqa: E402
from app.models.equipment import Equipment, EquipmentStatus  # noqa: E402
from app.models.facility import Facility  # noqa: E402
from app.models.location import Location  # noqa: E402
from app.models.user import User, UserRole, UserType  # noqa: E402
from app.models.user_facility import UserFacility  # noqa: E402
from app.schemas.equipment import AssetBulkUpdate, AssetSelection  # noqa: E402
from app.services import depreciation, room_assets  # noqa: E402

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
    for code in ("building_envelope", "it_low_voltage", "mechanical"):
        db.add(Discipline(code=code, name=code, sort_order=1))
    db.flush()

    def room(code, facility, parent=None):
        loc = Location(facility_id=facility.id, location_type="room" if parent else "floor",
                       code=code, name=code, parent_id=parent.id if parent else None,
                       path="/", depth=1 if parent else 0)
        db.add(loc)
        db.flush()
        loc.path = f"{parent.path if parent else '/'}{loc.id}/"
        return loc

    floor = room("111-00", lahore)
    office1, office2 = room("ITO-0001", lahore, floor), room("ITO-0002", lahore, floor)
    lounge = room("LNG-1", lahore)
    theirs = room("K-1", karachi)

    def person(username, role, facility=None):
        u = User(username=username, email=f"{username}@x.c", full_name=username, hashed_password="x",
                 user_type=UserType.EMPLOYEE, role=role, facility_id=facility.id if facility else None)
        db.add(u)
        db.flush()
        if facility:
            db.add(UserFacility(user_id=u.id, facility_id=facility.id))
        return u

    people = {"manager": person("fm", UserRole.FACILITY_MANAGER, lahore),
              "karachi_manager": person("kfm", UserRole.FACILITY_MANAGER, karachi),
              "tech": person("tech", UserRole.TECHNICIAN, lahore)}

    chairs = (room_assets.create_in_room(db, location=office1, asset_type="chair", count=6)
              + room_assets.create_in_room(db, location=office2, asset_type="chair", count=4))
    lounge_chairs = room_assets.create_in_room(db, location=lounge, asset_type="chair", count=2)
    screens = room_assets.create_in_room(db, location=office1, asset_type="display_screen", count=2)
    their_chairs = room_assets.create_in_room(db, location=theirs, asset_type="chair", count=3)
    db.commit()
    return db, dict(lahore=lahore, karachi=karachi, floor=floor), people, dict(
        chairs=chairs, lounge=lounge_chairs, screens=screens, theirs=their_chairs)


def bulk(db, user, selection, changes, dry_run=True):
    return routes.bulk_update(AssetBulkUpdate(selection=selection, changes=changes, dry_run=dry_run),
                              db=db, current_user=user)


def by_field(result):
    return {f.field if hasattr(f, "field") else f["field"]: f for f in result["fields"]}


def refused(call, status):
    try:
        call()
    except HTTPException as exc:
        assert exc.status_code == status, f"expected {status}, got {exc.status_code}: {exc.detail}"
        return exc.detail
    raise AssertionError(f"expected a {status} refusal")


def test_the_preview_changes_nothing_and_says_what_will():
    db, where, people, assets = build()
    ids = [a.id for a in assets["chairs"]]
    preview = bulk(db, people["manager"], AssetSelection(ids=ids),
                   {"cost": "180.00", "installation_date": "2026-09-01"})
    fields = by_field(preview)
    assert preview["dry_run"] and preview["matched"] == 10 and preview["assets_changed"] == 10
    assert fields["cost"]["will_change"] == 10 and fields["installation_date"]["will_change"] == 10
    db.expire_all()
    assert all(a.cost is None for a in db.query(Equipment).filter(Equipment.id.in_(ids)))
    db.close()
    print("ok  the preview reports ten changes and writes none")


def test_applying_sets_only_what_was_filled_in():
    db, where, people, assets = build()
    ids = [a.id for a in assets["chairs"]]
    # Something already recorded on one chair must survive a bulk change that leaves it blank.
    first = db.get(Equipment, ids[0])
    first.model = "Aeron"
    db.commit()

    result = bulk(db, people["manager"], AssetSelection(ids=ids),
                  {"cost": "180", "make": "Herman Miller", "model": "  "}, dry_run=False)
    assert result["assets_changed"] == 10
    assert "model" not in by_field(result), "a blank field is not a change"
    db.expire_all()
    rows = db.query(Equipment).filter(Equipment.id.in_(ids)).all()
    assert {r.cost for r in rows} == {Decimal("180.00")}
    assert {r.make for r in rows} == {"Herman Miller"}
    assert db.get(Equipment, ids[0]).model == "Aeron"
    # Untouched: the screens and the other site's chairs.
    assert all(s.cost is None for s in db.query(Equipment).filter(Equipment.asset_type == "display_screen"))
    assert all(c.cost is None for c in db.query(Equipment).filter(Equipment.facility_id == where["karachi"].id))

    again = bulk(db, people["manager"], AssetSelection(ids=ids), {"cost": "180.00"})
    assert by_field(again)["cost"]["unchanged"] == 10 and again["assets_changed"] == 0
    db.close()
    print("ok  only filled-in fields change, and repeating it changes nothing")


def test_all_matching_means_what_the_list_said():
    db, where, people, assets = build()
    selection = AssetSelection(facility_id=where["lahore"].id, location_id=where["floor"].id,
                               kind="room_items", asset_type="chair")
    listed = routes.list_equipment.__wrapped__(
        db=db, facility_id=where["lahore"].id, search=None, location_id=where["floor"].id,
        kind="room_items", asset_type="chair", discipline_id=None, skip=0, limit=100,
        current_user=people["manager"])
    result = bulk(db, people["manager"], selection, {"cost": 95}, dry_run=False)
    assert result["matched"] == listed["total"] == 10, (result["matched"], listed["total"])
    db.expire_all()
    assert all(c.cost is None for c in db.query(Equipment).filter(
        Equipment.id.in_([a.id for a in assets["lounge"]]))), "chairs outside the floor are untouched"
    db.close()
    print("ok  'all matching' changes exactly the assets the register listed")


def test_the_ledger_wins_and_says_why():
    db, where, people, assets = build()
    bought, installed, sold, free = (a.id for a in assets["chairs"][:4])
    today = date(2026, 1, 1)
    for asset_id, entry_type in ((bought, "acquisition"), (installed, "capitalisation"), (sold, "disposal")):
        db.add(AssetLedgerEntry(facility_id=where["lahore"].id, equipment_id=asset_id,
                                entry_type=entry_type, effective_date=today,
                                amount=Decimal("100"), description="recorded"))
    db.commit()

    result = bulk(db, people["manager"], AssetSelection(ids=[bought, installed, sold, free]),
                  {"cost": 180, "installation_date": "2026-09-01", "make": "Steelcase"}, dry_run=False)
    fields = by_field(result)
    cost_skipped = {s["id"]: s["reason"] for s in fields["cost"]["skipped"]}
    date_skipped = {s["id"]: s["reason"] for s in fields["installation_date"]["skipped"]}
    assert set(cost_skipped) == {bought, sold}, cost_skipped
    assert "acquisition" in cost_skipped[bought] and "disposed" in cost_skipped[sold]
    assert set(date_skipped) == {installed, sold}, date_skipped
    assert fields["make"]["will_change"] == 4, "descriptive details are never locked"

    db.expire_all()
    assert db.get(Equipment, bought).cost is None and db.get(Equipment, installed).cost == Decimal("180.00")
    assert db.get(Equipment, installed).installation_date is None
    assert db.get(Equipment, bought).installation_date == date(2026, 9, 1)
    assert db.get(Equipment, free).cost == Decimal("180.00")
    db.close()
    print("ok  cost and dates behind ledger entries are skipped with the reason")


def test_a_trade_change_skips_clinical_equipment_and_moves_seeded_lives():
    db, where, people, assets = build()
    it = db.query(Discipline).filter_by(code="it_low_voltage").one()
    screen, typed_life = assets["screens"]
    typed_life.useful_life_years = Decimal("12")
    monitor = Equipment(asset_tag="MON-1", make="GE", model="B40", serial_number="S", modality_id=1,
                        facility_id=where["lahore"].id, status=EquipmentStatus.ACTIVE)
    chair = assets["chairs"][0]
    db.add(monitor)
    db.commit()
    seeded = chair.useful_life_years
    assert seeded == depreciation.default_useful_life("building_envelope")

    result = bulk(db, people["manager"], AssetSelection(ids=[chair.id, typed_life.id, monitor.id]),
                  {"discipline_id": it.id}, dry_run=False)
    trade = by_field(result)["discipline_id"]
    assert [s["asset_tag"] for s in trade["skipped"]] == ["MON-1"]
    db.expire_all()
    chair, typed_life = db.get(Equipment, chair.id), db.get(Equipment, typed_life.id)
    assert chair.discipline_id == it.id
    assert chair.useful_life_years == depreciation.default_useful_life("it_low_voltage"), \
        "a life seeded from the old trade follows"
    assert typed_life.useful_life_years == Decimal("12"), "a life somebody typed stays"
    assert db.get(Equipment, monitor.id).discipline_id is None
    db.close()
    print("ok  a trade change skips clinical equipment and carries only seeded book lives")


def test_it_never_crosses_sites_or_permissions():
    db, where, people, assets = build()
    mixed = [assets["chairs"][0].id, assets["theirs"][0].id]
    refused(lambda: bulk(db, people["manager"], AssetSelection(ids=mixed), {"cost": 1}), 400)
    refused(lambda: bulk(db, people["manager"], AssetSelection(ids=[a.id for a in assets["theirs"]]),
                         {"cost": 1}), 403)
    refused(lambda: bulk(db, people["manager"], AssetSelection(facility_id=where["karachi"].id),
                         {"cost": 1}), 403)
    refused(lambda: bulk(db, people["tech"], AssetSelection(ids=[assets["chairs"][0].id]),
                         {"cost": 1}), 403)
    db.close()
    print("ok  a bulk change stays within one site the user may edit")


def test_bad_requests_are_refused_before_anything_changes():
    db, where, people, assets = build()
    ids = [a.id for a in assets["chairs"]]
    refused(lambda: bulk(db, people["manager"], AssetSelection(ids=ids), {"make": "  "}), 422)
    refused(lambda: bulk(db, people["manager"], AssetSelection(ids=ids + [999999]), {"cost": 1}), 404)
    refused(lambda: bulk(db, people["manager"], AssetSelection(ids=ids), {"discipline_id": 999}), 404)
    for bad in (dict(ids=ids, facility_id=where["lahore"].id), dict(), dict(ids=[])):
        try:
            AssetSelection(**bad)
            raise AssertionError(f"accepted {bad}")
        except ValidationError:
            pass
    try:
        AssetBulkUpdate(selection=AssetSelection(ids=ids), changes={"cost": -5})
        raise AssertionError("a negative cost was accepted")
    except ValidationError:
        pass
    db.expire_all()
    assert all(a.cost is None for a in db.query(Equipment))
    db.close()
    print("ok  empty, unknown, mixed and negative requests are refused and write nothing")


if __name__ == "__main__":
    tests = [v for k, v in sorted(globals().items()) if k.startswith("test_")]
    for t in tests:
        t()
    print(f"\n{len(tests)} checks passed")
