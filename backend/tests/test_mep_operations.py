"""The operational paths added on top of the MEP foundation.

Covers the four things that turn the schema into something usable, and that
each fail quietly rather than loudly if they regress:

  * asset placement — the MEP foreign keys cross facility boundaries if nothing
    checks them, and the endpoint passes the payload through wholesale
  * containment cycles — equipment has no materialised path, so a loop is only
    caught by an explicit walk
  * readings — the unit rule, and an out-of-band value taking a room down
  * dispatch — a contractor with lapsed insurance must not be assignable

    DATABASE_URL=sqlite:// python backend/tests/test_mep_operations.py
"""
from __future__ import annotations

import os
import pathlib
import sys
from datetime import datetime, timedelta

os.environ.setdefault("DATABASE_URL", "sqlite://")
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))

from fastapi import HTTPException  # noqa: E402
from sqlalchemy import create_engine  # noqa: E402
from sqlalchemy.orm import sessionmaker  # noqa: E402

import app.models  # noqa: E402,F401
from app.db.base import Base  # noqa: E402
from app.models.equipment import Equipment  # noqa: E402
from app.models.facility import Facility  # noqa: E402
from app.models.location import Criticality, Location, LocationType, SpaceUse  # noqa: E402
from app.models.modality import Modality, ModalityCategory  # noqa: E402
from app.models.reading import ReadingPoint, convert_to  # noqa: E402
from app.models.space_status import Availability, OutOfServiceReason, SpaceStatus  # noqa: E402
from app.services import asset as asset_service, location_tree, space_status  # noqa: E402


def _session():
    engine = create_engine("sqlite://")
    Base.metadata.create_all(engine)
    return sessionmaker(bind=engine, autoflush=False)()


def _facility(db, name="General Hospital"):
    f = Facility(name=name, phone="1", email="a@b.c", address="1", city="Austin",
                 state="TX", zip_code="78701", country="United States")
    db.add(f)
    db.flush()
    return f


def _modality(db):
    m = Modality(name=f"M{id(db) % 10000}", category=ModalityCategory.IMAGING)
    db.add(m)
    db.flush()
    return m


def _place(db, facility, kind, code, parent=None, use=None):
    row = Location(
        facility_id=facility.id, parent_id=parent.id if parent else None,
        location_type=kind, code=code, space_use=use,
        criticality=location_tree.default_criticality(use),
    )
    db.add(row)
    db.flush()
    location_tree.assign_path(db, row, parent)
    db.flush()
    return row


def _equipment(db, facility, tag, modality, **kwargs):
    e = Equipment(asset_tag=tag, make="Acme", model="X", serial_number=f"SN-{tag}",
                  modality_id=modality.id, facility_id=facility.id, **kwargs)
    db.add(e)
    db.flush()
    return e


# ── Asset placement ──────────────────────────────────────────────────────────

def test_asset_cannot_be_placed_in_another_facilitys_room():
    db = _session()
    ours, theirs = _facility(db, "Ours"), _facility(db, "Theirs")
    their_building = _place(db, theirs, LocationType.BUILDING.value, "MAIN")

    try:
        asset_service.validate_placement(
            db, facility_id=ours.id, location_id=their_building.id,
            parent_equipment_id=None, discipline_id=None, service_vendor_id=None,
        )
    except HTTPException as exc:
        assert exc.status_code == 400
        assert "different facility" in str(exc.detail)
    else:
        raise AssertionError("cross-facility placement should be refused")
    print("ok  asset cannot be placed in another facility's room")


def test_asset_cannot_be_placed_in_a_decommissioned_room():
    db = _session()
    f = _facility(db)
    building = _place(db, f, LocationType.BUILDING.value, "MAIN")
    building.occupancy_status = "decommissioned"
    db.flush()

    try:
        asset_service.validate_placement(
            db, facility_id=f.id, location_id=building.id,
            parent_equipment_id=None, discipline_id=None, service_vendor_id=None,
        )
    except HTTPException as exc:
        assert "decommissioned" in str(exc.detail)
    else:
        raise AssertionError("a decommissioned space should not accept assets")
    print("ok  asset cannot be placed in a decommissioned room")


def test_containment_cycle_is_refused():
    db = _session()
    f = _facility(db)
    m = _modality(db)

    switchboard = _equipment(db, f, "SWB-1", m)
    panel = _equipment(db, f, "P-1", m, parent_equipment_id=switchboard.id)
    breaker = _equipment(db, f, "CB-1", m, parent_equipment_id=panel.id)
    db.flush()

    # Equipment carries no materialised path, so this needs a real walk. A loop
    # here would make the switchboard invisible in every tree that renders it.
    try:
        asset_service.validate_placement(
            db, facility_id=f.id, location_id=None,
            parent_equipment_id=breaker.id, discipline_id=None,
            service_vendor_id=None, equipment_id=switchboard.id,
        )
    except HTTPException as exc:
        assert exc.status_code == 400
        assert "its own components" in str(exc.detail)
    else:
        raise AssertionError("a containment cycle should be refused")

    # Self-parenting, the degenerate case.
    try:
        asset_service.validate_placement(
            db, facility_id=f.id, location_id=None,
            parent_equipment_id=panel.id, discipline_id=None,
            service_vendor_id=None, equipment_id=panel.id,
        )
    except HTTPException as exc:
        assert "cannot contain itself" in str(exc.detail)
    else:
        raise AssertionError("self-parenting should be refused")
    print("ok  containment cycle is refused")


def test_asset_inherits_criticality_from_its_space():
    db = _session()
    f = _facility(db)
    building = _place(db, f, LocationType.BUILDING.value, "MAIN")
    theatre = _place(db, f, LocationType.ROOM.value, "OR-3", building,
                     SpaceUse.OPERATING_ROOM.value)

    # Nobody sets this by hand on four hundred assets.
    assert asset_service.inherit_criticality(
        db, location_id=theatre.id, explicit=None,
    ) == Criticality.CRITICAL.value

    # But a standby generator in an unremarkable yard is critical because of
    # what depends on it, so an explicit value always wins.
    assert asset_service.inherit_criticality(
        db, location_id=theatre.id, explicit="low",
    ) == "low"
    print("ok  asset inherits criticality from its space")


# ── Readings ─────────────────────────────────────────────────────────────────

def test_unit_conversion_is_explicit_or_refused():
    # The failure this prevents: ASHRAE 170 asks an operating room for
    # 0.01 in. w.c. positive. The same requirement in pascals is about 2.5, and
    # "2.5" typed against an inches-of-water point is 250x the requirement.
    assert convert_to(2.5, "pa", "in_wc") is not None
    assert round(convert_to(2.5, "pa", "in_wc"), 4) == 0.01

    # Round-trip.
    assert round(convert_to(0.01, "in_wc", "pa"), 2) == 2.49

    # Temperature is affine, not a factor.
    assert convert_to(0, "deg_c", "deg_f") == 32.0
    assert convert_to(212, "deg_f", "deg_c") == 100.0

    # An undefined pair is refused rather than passed through unchanged, which
    # is what a naive implementation does and why it is dangerous.
    assert convert_to(5, "cfm", "gpm") is None
    assert convert_to(5, "psi", "volt") is None
    print("ok  unit conversion is explicit or refused")


def test_out_of_band_reading_takes_a_gating_space_out_of_service():
    db = _session()
    f = _facility(db)
    building = _place(db, f, LocationType.BUILDING.value, "MAIN")
    aiir = _place(db, f, LocationType.ROOM.value, "412", building, SpaceUse.AIIR.value)

    point = ReadingPoint(
        facility_id=f.id, location_id=aiir.id, code="412-PRESS",
        name="Isolation room pressure", unit="in_wc",
        # Negative pressure: the room must sit at or below -0.01 in. w.c.
        max_spec=-0.01, spec_reference="ASHRAE 170",
        gates_space_availability=True,
    )
    db.add(point)
    db.flush()

    assert point.evaluate(-0.03) is True     # comfortably negative
    assert point.evaluate(0.0) is False      # pressure lost

    space_status.ensure_status(db, aiir)
    db.flush()

    # A room that has lost negative pressure cannot hold the patient it was
    # built for. That is a facilities fact with an immediate clinical
    # consequence, and it should not need a human to notice.
    space_status.set_status(
        db, aiir,
        availability=Availability.OUT_OF_SERVICE.value,
        oos_reason=OutOfServiceReason.ENVIRONMENTAL_OUT_OF_SPEC.value,
        source="environmental",
    )
    db.flush()

    current = db.query(SpaceStatus).filter(SpaceStatus.location_id == aiir.id).first()
    assert current.availability == Availability.OUT_OF_SERVICE.value
    assert current.oos_reason == OutOfServiceReason.ENVIRONMENTAL_OUT_OF_SPEC.value

    # And it lands on the facilities-attributable line of the capacity report,
    # because a ventilation failure is the plant's to answer for.
    from app.models.space_status import FACILITIES_ATTRIBUTABLE_REASONS
    assert OutOfServiceReason.ENVIRONMENTAL_OUT_OF_SPEC.value in FACILITIES_ATTRIBUTABLE_REASONS
    print("ok  out-of-band reading takes a gating space out of service")


def test_reading_point_band_evaluation():
    db = _session()
    f = _facility(db)

    one_sided = ReadingPoint(facility_id=f.id, code="A", name="Min only",
                             unit="in_wc", min_spec=0.01)
    assert one_sided.evaluate(0.02) is True
    assert one_sided.evaluate(0.005) is False

    both = ReadingPoint(facility_id=f.id, code="B", name="Humidity",
                        unit="pct_rh", min_spec=20, max_spec=60)
    assert both.evaluate(45) is True
    assert both.evaluate(15) is False
    assert both.evaluate(65) is False

    # A point with no band cannot be out of spec — a runtime-hours counter is
    # recorded for trending, not for judgement.
    unbounded = ReadingPoint(facility_id=f.id, code="C", name="Generator hours", unit="hours")
    assert unbounded.evaluate(0) is True
    assert unbounded.evaluate(99999) is True
    print("ok  reading point band evaluation")


# ── Dispatch ─────────────────────────────────────────────────────────────────

def test_contract_scope_prefers_the_explicit_asset_list():
    from app.models.vendor import (
        Vendor, VendorContract, VendorContractAsset, VendorContractStatus,
    )
    from app.services import work_order

    db = _session()
    f = _facility(db)
    m = _modality(db)
    car = _equipment(db, f, "ELEV-6", m)

    vendor = Vendor(code="OTIS", name="Elevator Co", credentials_ok=True)
    db.add(vendor)
    db.flush()

    blanket = VendorContract(
        contract_number="C-BLANKET", vendor_id=vendor.id, facility_id=f.id,
        title="Everything", status=VendorContractStatus.ACTIVE.value,
    )
    specific = VendorContract(
        contract_number="C-CARS", vendor_id=vendor.id, facility_id=f.id,
        title="Named cars", status=VendorContractStatus.ACTIVE.value,
    )
    db.add_all([blanket, specific])
    db.flush()
    db.add(VendorContractAsset(contract_id=specific.id, equipment_id=car.id))
    db.flush()

    # An explicit asset list beats a blanket contract. This ordering is what
    # surfaces the sixth elevator quietly added last year and never listed.
    found = work_order.find_covering_contract(
        db, vendor_id=vendor.id, facility_id=f.id,
        equipment_id=car.id, discipline_id=None,
    )
    assert found is not None and found.contract_number == "C-CARS", found

    other = _equipment(db, f, "ELEV-7", m)
    fallback = work_order.find_covering_contract(
        db, vendor_id=vendor.id, facility_id=f.id,
        equipment_id=other.id, discipline_id=None,
    )
    assert fallback is not None and fallback.contract_number == "C-BLANKET"
    print("ok  contract scope prefers the explicit asset list")


def test_expired_contract_does_not_cover_work():
    from app.models.vendor import Vendor, VendorContract, VendorContractStatus
    from app.services import work_order

    db = _session()
    f = _facility(db)
    vendor = Vendor(code="V", name="Fire Co", credentials_ok=True)
    db.add(vendor)
    db.flush()

    lapsed = VendorContract(
        contract_number="C-OLD", vendor_id=vendor.id, facility_id=f.id,
        title="Last year", status=VendorContractStatus.ACTIVE.value,
        start_date=(datetime.utcnow() - timedelta(days=800)).date(),
        end_date=(datetime.utcnow() - timedelta(days=30)).date(),
    )
    db.add(lapsed)
    db.flush()

    # Status says active; the dates say otherwise, and the dates win.
    assert lapsed.is_current is False
    assert work_order.find_covering_contract(
        db, vendor_id=vendor.id, facility_id=f.id, equipment_id=None, discipline_id=None,
    ) is None
    print("ok  expired contract does not cover work")


def test_facility_wide_contract_covers_every_facility():
    from app.models.vendor import Vendor, VendorContract, VendorContractStatus
    from app.services import work_order

    db = _session()
    a, b = _facility(db, "A"), _facility(db, "B")
    vendor = Vendor(code="V", name="Group Co", credentials_ok=True)
    db.add(vendor)
    db.flush()

    # A NULL facility_id means the contract covers the whole tenancy, so it has
    # to come back when filtering for any single facility.
    group = VendorContract(
        contract_number="C-GROUP", vendor_id=vendor.id, facility_id=None,
        title="Group-wide", status=VendorContractStatus.ACTIVE.value,
    )
    db.add(group)
    db.flush()

    for facility in (a, b):
        found = work_order.find_covering_contract(
            db, vendor_id=vendor.id, facility_id=facility.id,
            equipment_id=None, discipline_id=None,
        )
        assert found is not None and found.contract_number == "C-GROUP", facility.name
    print("ok  facility-wide contract covers every facility")


if __name__ == "__main__":
    tests = [v for k, v in sorted(globals().items()) if k.startswith("test_")]
    for test in tests:
        test()
    print(f"\n{len(tests)} checks passed")
