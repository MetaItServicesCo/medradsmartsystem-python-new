"""Prove the facilities foundation behaves, against the real functions.

Four things here are easy to get subtly wrong and expensive to discover late:

  * the materialised path, which is silently wrong rather than loudly broken
    when a move rewrites a subtree badly
  * the SLA, whose whole point is that the space leads and the tier is a floor
  * the downtime intervals, which cannot be reconstructed after the fact if a
    transition ever fails to close the one behind it
  * the impact walk, which hangs on the first ring main if the visited set is
    wrong

Everything runs against SQLite with no fixtures beyond what each test builds.

    DATABASE_URL=sqlite:// python backend/tests/test_mep_foundation.py
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

import app.models  # noqa: E402,F401  (register every mapper)
from app.db.base import Base  # noqa: E402
from app.models.asset_link import AssetServesAsset, AssetServesLocation, ServiceType  # noqa: E402
from app.models.equipment import Equipment  # noqa: E402
from app.models.facility import Facility  # noqa: E402
from app.models.location import Criticality, Location, LocationType, SpaceUse  # noqa: E402
from app.models.modality import Modality, ModalityCategory  # noqa: E402
from app.models.service_request import Priority, ServiceRequest, WorkOrderType  # noqa: E402
from app.models.space_status import Availability, OutOfServiceReason, SpaceStatusHistory  # noqa: E402
from app.models.tier import Tier  # noqa: E402
from app.services import impact, location_tree, sla, space_status, work_order  # noqa: E402


def _session():
    engine = create_engine("sqlite://")
    Base.metadata.create_all(engine)
    return sessionmaker(bind=engine, autoflush=False)()


def _facility(db, name="General Hospital", tier=None):
    facility = Facility(
        name=name, phone="555-0100", email="plant@example.org",
        address="1 Hospital Way", city="Austin", state="TX",
        zip_code="78701", country="United States",
        tier_id=tier.id if tier else None,
    )
    db.add(facility)
    db.flush()
    return facility


def _place(db, facility, location_type, code, parent=None, **kwargs):
    """Create a location the way the endpoint does — flush, then assign path."""
    location = Location(
        facility_id=facility.id,
        parent_id=parent.id if parent else None,
        location_type=location_type,
        code=code,
        criticality=kwargs.pop("criticality", None) or location_tree.default_criticality(
            kwargs.get("space_use"),
        ),
        **kwargs,
    )
    db.add(location)
    db.flush()
    location_tree.assign_path(db, location, parent)
    db.flush()
    return location


def _equipment(db, facility, tag, modality, location=None):
    equipment = Equipment(
        asset_tag=tag, make="Acme", model="X", serial_number=f"SN-{tag}",
        modality_id=modality.id, facility_id=facility.id,
        location_id=location.id if location else None,
    )
    db.add(equipment)
    db.flush()
    return equipment


# ── Tree integrity ───────────────────────────────────────────────────────────

def test_path_is_built_from_ancestors():
    db = _session()
    facility = _facility(db)
    building = _place(db, facility, LocationType.BUILDING.value, "MAIN")
    floor = _place(db, facility, LocationType.FLOOR.value, "03", parent=building)
    room = _place(db, facility, LocationType.ROOM.value, "OR-3", parent=floor,
                  space_use=SpaceUse.OPERATING_ROOM.value)

    assert building.path == f"/{building.id}/"
    assert floor.path == f"/{building.id}/{floor.id}/"
    assert room.path == f"/{building.id}/{floor.id}/{room.id}/"
    assert (building.depth, floor.depth, room.depth) == (0, 1, 2)
    # The path has to contain the row's own id, or two siblings share a prefix
    # and a subtree query on one returns the other.
    assert room.ancestor_ids == [building.id, floor.id, room.id]
    print("ok  path is built from ancestors")


def test_illegal_placement_is_refused():
    db = _session()
    facility = _facility(db)
    building = _place(db, facility, LocationType.BUILDING.value, "MAIN")

    # A bed belongs to a room and nowhere else — this is what keeps the bed
    # count meaningful.
    try:
        location_tree.validate_placement(LocationType.BED.value, building)
    except HTTPException as exc:
        assert exc.status_code == 400
        assert "room" in str(exc.detail)
    else:
        raise AssertionError("a bed under a building should be refused")

    # And a building cannot hang off anything.
    try:
        location_tree.validate_placement(LocationType.BUILDING.value, building)
    except HTTPException:
        pass
    else:
        raise AssertionError("a building under a building should be refused")
    print("ok  illegal placement is refused")


def test_move_rewrites_the_whole_subtree():
    db = _session()
    facility = _facility(db)
    building = _place(db, facility, LocationType.BUILDING.value, "MAIN")
    floor_3 = _place(db, facility, LocationType.FLOOR.value, "03", parent=building)
    floor_4 = _place(db, facility, LocationType.FLOOR.value, "04", parent=building)
    wing = _place(db, facility, LocationType.WING.value, "WEST", parent=floor_3)
    room = _place(db, facility, LocationType.ROOM.value, "312", parent=wing)
    bed = _place(db, facility, LocationType.BED.value, "312-A", parent=room)

    rewritten = location_tree.move(db, wing, floor_4)
    db.flush()
    for row in (room, bed):
        db.refresh(row)

    assert rewritten == 2, f"expected room and bed rewritten, got {rewritten}"
    assert wing.path == f"/{building.id}/{floor_4.id}/{wing.id}/"
    assert room.path.startswith(wing.path), "descendant path must stay under its ancestor"
    assert bed.path.startswith(room.path)
    # Depth shifts by the same delta all the way down.
    assert (wing.depth, room.depth, bed.depth) == (2, 3, 4)
    print("ok  move rewrites the whole subtree")


def test_move_into_own_descendant_is_refused():
    db = _session()
    facility = _facility(db)
    building = _place(db, facility, LocationType.BUILDING.value, "MAIN")
    floor = _place(db, facility, LocationType.FLOOR.value, "03", parent=building)

    # Detaching a branch and parenting it circularly would make it invisible in
    # every list view and unreachable from any root — a corruption that does
    # not announce itself.
    try:
        location_tree.move(db, building, floor)
    except HTTPException as exc:
        assert exc.status_code == 400
        assert "descendants" in str(exc.detail)
    else:
        raise AssertionError("moving a node inside its own subtree should be refused")
    print("ok  move into own descendant is refused")


def test_sibling_codes_must_be_unique_including_at_the_root():
    db = _session()
    facility = _facility(db)
    _place(db, facility, LocationType.BUILDING.value, "MAIN")

    # The root case is the one a unique constraint cannot cover, because
    # Postgres treats NULL parent_ids as distinct.
    try:
        location_tree.ensure_unique_code(
            db, facility_id=facility.id, parent_id=None, code="MAIN",
        )
    except HTTPException as exc:
        assert exc.status_code == 409
    else:
        raise AssertionError("duplicate root code should be refused")
    print("ok  sibling codes are unique, roots included")


def test_criticality_and_volume_are_seeded():
    db = _session()
    facility = _facility(db)
    building = _place(db, facility, LocationType.BUILDING.value, "MAIN")
    floor = _place(db, facility, LocationType.FLOOR.value, "03", parent=building)

    theatre = _place(db, facility, LocationType.ROOM.value, "OR-3", parent=floor,
                     space_use=SpaceUse.OPERATING_ROOM.value)
    store = _place(db, facility, LocationType.ROOM.value, "S-1", parent=floor,
                   space_use=SpaceUse.STORAGE.value)

    # Nobody surveying four hundred rooms sets this by hand, and a blank field
    # on an operating theatre is the failure the whole design exists to prevent.
    assert theatre.criticality == Criticality.CRITICAL.value
    assert store.criticality == Criticality.LOW.value

    # Air changes per hour needs a volume, and US customary throughout.
    assert location_tree.derive_volume_cuft(600, 10) == 6000.0
    assert location_tree.derive_volume_cuft(600, None) is None
    print("ok  criticality and volume are seeded")


# ── SLA ──────────────────────────────────────────────────────────────────────

def test_space_criticality_beats_the_facility_tier():
    db = _session()
    tier = Tier(
        tier_code="GOLD", name="Gold", response_time_hours=24,
        labor_rate_per_hour=100, service_call_fee=50,
        preventive_maintenance_fee=0, mileage_rate=1,
    )
    db.add(tier)
    db.flush()
    facility = _facility(db, tier=tier)
    building = _place(db, facility, LocationType.BUILDING.value, "MAIN")
    floor = _place(db, facility, LocationType.FLOOR.value, "03", parent=building)
    theatre = _place(db, facility, LocationType.ROOM.value, "OR-3", parent=floor,
                     space_use=SpaceUse.OPERATING_ROOM.value)
    store = _place(db, facility, LocationType.ROOM.value, "S-1", parent=floor,
                   space_use=SpaceUse.STORAGE.value)

    theatre_hours = sla.resolve_response_hours(
        db, priority=Priority.HIGH.value, location=theatre, facility=facility,
    )
    store_hours = sla.resolve_response_hours(
        db, priority=Priority.HIGH.value, location=store, facility=facility,
    )

    # The same dead receptacle. This is the entire point.
    assert theatre_hours == 2, theatre_hours
    assert store_hours == 24, store_hours
    assert theatre_hours < store_hours

    # With no location at all, the tier is the floor rather than a guess.
    assert sla.resolve_response_hours(
        db, priority="unmapped", location=None, facility=facility,
    ) == 24
    print("ok  space criticality beats the facility tier")


def test_vendor_contract_response_wins_over_the_house_matrix():
    from app.models.vendor import Vendor, VendorContract

    db = _session()
    facility = _facility(db)
    building = _place(db, facility, LocationType.BUILDING.value, "MAIN")
    floor = _place(db, facility, LocationType.FLOOR.value, "03", parent=building)
    theatre = _place(db, facility, LocationType.ROOM.value, "OR-3", parent=floor,
                     space_use=SpaceUse.OPERATING_ROOM.value)

    vendor = Vendor(code="OTIS", name="Elevator Co")
    db.add(vendor)
    db.flush()
    contract = VendorContract(
        contract_number="C-1", vendor_id=vendor.id, title="Elevator full service",
        response_hours_by_priority={"high": 4},
    )
    db.add(contract)
    db.flush()

    assert sla.resolve_response_hours(
        db, priority=Priority.HIGH.value, location=theatre, contract=contract,
    ) == 4

    # A band the contract is silent on falls through to the house matrix rather
    # than being invented — the contract has agreed to nothing about it.
    assert sla.resolve_response_hours(
        db, priority=Priority.LOW.value, location=theatre, contract=contract,
    ) == 24
    print("ok  vendor contract response wins where it speaks")


def test_breach_is_measured_against_response_not_completion():
    db = _session()
    facility = _facility(db)
    created = datetime(2026, 3, 1, 9, 0)
    work_order_row = ServiceRequest(
        request_number="SR-1", facility_id=facility.id, requester_id=1,
        problem_description="socket dead", priority=Priority.HIGH,
        created_at=created, sla_due_at=created + timedelta(hours=2),
    )

    # Answered inside the window, still being worked on days later. Not a breach.
    work_order_row.responded_at = created + timedelta(hours=1)
    assert sla.is_breached(work_order_row, now=created + timedelta(days=3)) is False

    # Answered late. A breach, and it stays one regardless of how fast the
    # repair itself then went.
    work_order_row.responded_at = created + timedelta(hours=5)
    assert sla.is_breached(work_order_row, now=created + timedelta(hours=6)) is True

    # Never answered, clock past due.
    work_order_row.responded_at = None
    assert sla.is_breached(work_order_row, now=created + timedelta(hours=3)) is True

    # First response is the one that counts.
    sla.mark_responded(work_order_row, now=created + timedelta(hours=1))
    first = work_order_row.responded_at
    sla.mark_responded(work_order_row, now=created + timedelta(hours=9))
    assert work_order_row.responded_at == first
    print("ok  breach is measured against response, not completion")


def test_planned_work_carries_no_response_clock():
    db = _session()
    facility = _facility(db)
    work_order_row = ServiceRequest(
        request_number="SR-2", facility_id=facility.id, requester_id=1,
        problem_description="quarterly filter change", priority=Priority.LOW,
        work_order_type=WorkOrderType.PREVENTIVE.value, created_at=datetime.utcnow(),
        facility=facility,
    )
    sla.apply_sla(db, work_order_row)
    # A PM generated for next month has a date from its schedule; a response
    # clock on it would be noise that devalues every real one.
    assert work_order_row.sla_due_at is None
    assert work_order_row.sla_breached is False
    print("ok  planned work carries no response clock")


# ── Work order rules ─────────────────────────────────────────────────────────

def test_a_work_order_needs_a_subject():
    db = _session()
    facility = _facility(db)
    try:
        work_order.validate_subject(
            db, equipment_id=None, location_id=None, facility_id=facility.id,
        )
    except HTTPException as exc:
        assert exc.status_code == 400
        assert "equipment, a location, or both" in str(exc.detail)
    else:
        raise AssertionError("a work order with neither subject should be refused")
    print("ok  a work order needs a subject")


def test_location_only_work_order_is_accepted():
    db = _session()
    facility = _facility(db)
    building = _place(db, facility, LocationType.BUILDING.value, "MAIN")
    floor = _place(db, facility, LocationType.FLOOR.value, "03", parent=building)
    theatre = _place(db, facility, LocationType.ROOM.value, "OR-3", parent=floor,
                     space_use=SpaceUse.OPERATING_ROOM.value)

    # The socket in OR-3. No asset, and none should be demanded.
    equipment, location = work_order.validate_subject(
        db, equipment_id=None, location_id=theatre.id, facility_id=facility.id,
    )
    assert equipment is None
    assert location.id == theatre.id
    # And it inherits a priority from the space rather than defaulting to medium.
    assert work_order.default_priority(theatre) == Priority.HIGH.value
    print("ok  location-only work order is accepted")


def test_in_house_plant_work_is_not_billable_by_default():
    # Medical equipment service is billed to the facility; a house electrician
    # replacing a receptacle is not, and forcing in-house work through a
    # quotation flow is how a CMMS stops being used.
    assert work_order.resolve_billable(WorkOrderType.CORRECTIVE.value, None) is True
    assert work_order.resolve_billable(WorkOrderType.PREVENTIVE.value, None) is False
    assert work_order.resolve_billable(WorkOrderType.ROUNDS.value, None) is False
    # An explicit choice always wins: a contractor's visit on a PM is billable.
    assert work_order.resolve_billable(WorkOrderType.PREVENTIVE.value, True) is True
    print("ok  in-house plant work is not billable by default")


def test_lapsed_credentials_block_dispatch():
    from app.api.v1.endpoints.vendors import refresh_credential_status
    from app.models.vendor import CredentialType, Vendor, VendorCredential

    db = _session()
    vendor = Vendor(code="ACME", name="Acme Fire Protection")
    db.add(vendor)
    db.flush()

    # No credentials on file is NOT compliant — unknown is not the same as fine,
    # and treating it as fine is exactly what a survey looks for.
    refresh_credential_status(db, vendor)
    assert vendor.credentials_ok is False

    expired = VendorCredential(
        vendor_id=vendor.id, credential_type=CredentialType.GENERAL_LIABILITY.value,
        expires_on=datetime.utcnow().date() - timedelta(days=1), is_blocking=True,
    )
    db.add(expired)
    db.flush()
    db.refresh(vendor)
    refresh_credential_status(db, vendor)
    assert vendor.credentials_ok is False
    assert vendor.is_dispatchable is False

    try:
        work_order.assert_vendor_dispatchable(db, vendor.id)
    except HTTPException as exc:
        assert exc.status_code == 409
        assert "lapsed" in str(exc.detail)
    else:
        raise AssertionError("a vendor with a lapsed blocking credential must not be dispatchable")

    expired.expires_on = datetime.utcnow().date() + timedelta(days=90)
    db.flush()
    db.refresh(vendor)
    refresh_credential_status(db, vendor)
    assert vendor.credentials_ok is True
    work_order.assert_vendor_dispatchable(db, vendor.id)
    print("ok  lapsed credentials block dispatch")


# ── Space status and downtime ────────────────────────────────────────────────

def test_illegal_state_for_a_space_is_refused():
    db = _session()
    facility = _facility(db)
    building = _place(db, facility, LocationType.BUILDING.value, "MAIN")
    floor = _place(db, facility, LocationType.FLOOR.value, "03", parent=building)
    theatre = _place(db, facility, LocationType.ROOM.value, "OR-3", parent=floor,
                     space_use=SpaceUse.OPERATING_ROOM.value)
    room = _place(db, facility, LocationType.ROOM.value, "312", parent=floor,
                  space_use=SpaceUse.PATIENT_ROOM.value)

    # An operating theatre does not sit vacant-dirty; it sits in turnover.
    try:
        space_status.validate_transition(theatre, Availability.VACANT_DIRTY.value, None)
    except HTTPException as exc:
        assert exc.status_code == 400
        assert "turnover" in str(exc.detail)
    else:
        raise AssertionError("vacant_dirty is not a theatre state")

    # And a patient room is never mid-procedure.
    try:
        space_status.validate_transition(room, Availability.IN_PROCEDURE.value, None)
    except HTTPException:
        pass
    else:
        raise AssertionError("in_procedure is not a bedroom state")

    # Out of service without a reason leaves a hole in the only report this
    # table exists to produce.
    try:
        space_status.validate_transition(room, Availability.OUT_OF_SERVICE.value, None)
    except HTTPException as exc:
        assert "reason" in str(exc.detail)
    else:
        raise AssertionError("out of service must record a reason")
    print("ok  illegal state for a space is refused")


def test_transitions_close_the_interval_behind_them():
    db = _session()
    facility = _facility(db)
    building = _place(db, facility, LocationType.BUILDING.value, "MAIN")
    floor = _place(db, facility, LocationType.FLOOR.value, "03", parent=building)
    room = _place(db, facility, LocationType.ROOM.value, "312", parent=floor,
                  space_use=SpaceUse.PATIENT_ROOM.value)
    bed = _place(db, facility, LocationType.BED.value, "312-A", parent=room)

    t0 = datetime(2026, 3, 1, 8, 0)
    space_status.set_status(db, bed, availability=Availability.AVAILABLE.value, now=t0)
    space_status.set_status(
        db, bed, availability=Availability.OUT_OF_SERVICE.value,
        oos_reason=OutOfServiceReason.EQUIPMENT_FAILURE.value,
        now=t0 + timedelta(hours=2),
    )
    space_status.set_status(
        db, bed, availability=Availability.VACANT_DIRTY.value,
        now=t0 + timedelta(hours=8),
    )
    db.flush()

    rows = (
        db.query(SpaceStatusHistory)
        .filter(SpaceStatusHistory.location_id == bed.id)
        .order_by(SpaceStatusHistory.effective_from.asc())
        .all()
    )
    assert len(rows) == 3
    # Exactly one open interval, always. More than one means the downtime
    # report starts silently under-counting and nobody finds out for a quarter.
    assert sum(1 for row in rows if row.effective_to is None) == 1
    assert float(rows[0].duration_minutes) == 120.0
    assert float(rows[1].duration_minutes) == 360.0
    assert rows[2].effective_to is None
    print("ok  transitions close the interval behind them")


def test_reasserting_the_same_state_does_not_restart_the_clock():
    db = _session()
    facility = _facility(db)
    building = _place(db, facility, LocationType.BUILDING.value, "MAIN")
    floor = _place(db, facility, LocationType.FLOOR.value, "03", parent=building)
    room = _place(db, facility, LocationType.ROOM.value, "312", parent=floor,
                  space_use=SpaceUse.PATIENT_ROOM.value)

    t0 = datetime(2026, 3, 1, 8, 0)
    space_status.set_status(
        db, room, availability=Availability.OUT_OF_SERVICE.value,
        oos_reason=OutOfServiceReason.MAINTENANCE.value, now=t0,
    )
    current = space_status.set_status(
        db, room, availability=Availability.OUT_OF_SERVICE.value,
        oos_reason=OutOfServiceReason.MAINTENANCE.value,
        notes="still waiting on the part", now=t0 + timedelta(hours=6),
    )
    db.flush()

    # Editing a note must not move the moment the space went down.
    assert current.since == t0
    assert current.notes == "still waiting on the part"
    assert db.query(SpaceStatusHistory).filter(
        SpaceStatusHistory.location_id == room.id,
    ).count() == 1
    print("ok  reasserting the same state does not restart the clock")


def test_downtime_report_counts_beds_and_theatres_separately():
    db = _session()
    facility = _facility(db)
    building = _place(db, facility, LocationType.BUILDING.value, "MAIN")
    floor = _place(db, facility, LocationType.FLOOR.value, "03", parent=building)
    room = _place(db, facility, LocationType.ROOM.value, "312", parent=floor,
                  space_use=SpaceUse.PATIENT_ROOM.value)
    bed = _place(db, facility, LocationType.BED.value, "312-A", parent=room)
    theatre = _place(db, facility, LocationType.ROOM.value, "OR-3", parent=floor,
                     space_use=SpaceUse.OPERATING_ROOM.value)

    t0 = datetime(2026, 3, 1, 0, 0)
    # A bed down for a full day.
    space_status.set_status(
        db, bed, availability=Availability.OUT_OF_SERVICE.value,
        oos_reason=OutOfServiceReason.EQUIPMENT_FAILURE.value, now=t0,
    )
    space_status.set_status(
        db, bed, availability=Availability.VACANT_DIRTY.value, now=t0 + timedelta(days=1),
    )
    # A theatre down for six hours.
    space_status.set_status(
        db, theatre, availability=Availability.OUT_OF_SERVICE.value,
        oos_reason=OutOfServiceReason.EQUIPMENT_FAILURE.value, now=t0,
    )
    space_status.set_status(
        db, theatre, availability=Availability.TURNOVER.value, now=t0 + timedelta(hours=6),
    )
    # And a bed lost to staffing, which is not the plant's to answer for.
    space_status.set_status(
        db, room, availability=Availability.OUT_OF_SERVICE.value,
        oos_reason=OutOfServiceReason.STAFFING.value, now=t0,
    )
    space_status.set_status(
        db, room, availability=Availability.VACANT_CLEAN.value, now=t0 + timedelta(days=2),
    )
    db.flush()

    report = space_status.downtime_report(
        db, facility_ids=[facility.id], start=t0, end=t0 + timedelta(days=7),
    )
    assert report["bed_days_lost"] == 1.0, report
    assert report["procedure_room_hours_lost"] == 6.0, report
    # Staffing is somebody else's cost and must not be charged to plant ops.
    assert OutOfServiceReason.STAFFING.value not in report["minutes_by_reason"]

    everything = space_status.downtime_report(
        db, facility_ids=[facility.id], start=t0, end=t0 + timedelta(days=7),
        facilities_attributable_only=False,
    )
    assert OutOfServiceReason.STAFFING.value in everything["minutes_by_reason"]
    print("ok  downtime report separates beds, theatres and blame")


def test_downtime_intervals_are_clipped_to_the_window():
    db = _session()
    facility = _facility(db)
    building = _place(db, facility, LocationType.BUILDING.value, "MAIN")
    floor = _place(db, facility, LocationType.FLOOR.value, "03", parent=building)
    room = _place(db, facility, LocationType.ROOM.value, "312", parent=floor,
                  space_use=SpaceUse.PATIENT_ROOM.value)
    bed = _place(db, facility, LocationType.BED.value, "312-A", parent=room)

    # Down from late February to mid March, straddling the boundary.
    space_status.set_status(
        db, bed, availability=Availability.OUT_OF_SERVICE.value,
        oos_reason=OutOfServiceReason.MAINTENANCE.value,
        now=datetime(2026, 2, 26, 0, 0),
    )
    space_status.set_status(
        db, bed, availability=Availability.VACANT_DIRTY.value, now=datetime(2026, 3, 3, 0, 0),
    )
    db.flush()

    march = space_status.downtime_report(
        db, facility_ids=[facility.id],
        start=datetime(2026, 3, 1), end=datetime(2026, 4, 1),
    )
    # Only the March share. Without clipping, all seven days land in whichever
    # month the query happens to catch.
    assert march["bed_days_lost"] == 2.0, march
    print("ok  downtime intervals are clipped to the window")


def test_completing_a_work_order_returns_the_space_dirty():
    db = _session()
    facility = _facility(db)
    building = _place(db, facility, LocationType.BUILDING.value, "MAIN")
    floor = _place(db, facility, LocationType.FLOOR.value, "03", parent=building)
    room = _place(db, facility, LocationType.ROOM.value, "312", parent=floor,
                  space_use=SpaceUse.PATIENT_ROOM.value)

    job = ServiceRequest(
        request_number="SR-9", facility_id=facility.id, requester_id=1,
        problem_description="leak above the bed", priority=Priority.HIGH,
        location_id=room.id, work_order_type=WorkOrderType.CORRECTIVE.value,
    )
    db.add(job)
    db.flush()

    space_status.take_out_of_service_for_work_order(db, room, job)
    db.flush()
    restored = space_status.restore_spaces_for_work_order(db, job)
    db.flush()

    assert len(restored) == 1
    # Not clean. A room that has had a technician and a ladder in it needs
    # housekeeping before it takes a patient.
    assert restored[0].availability == Availability.VACANT_DIRTY.value
    assert restored[0].work_order_id is None
    print("ok  completing a work order returns the space dirty")


# ── Impact ───────────────────────────────────────────────────────────────────

def _modalities(db):
    imaging = Modality(name="Imaging", category=ModalityCategory.IMAGING)
    db.add(imaging)
    db.flush()
    return imaging


def test_impact_walk_reaches_clinical_assets_and_survives_a_ring():
    db = _session()
    facility = _facility(db)
    modality = _modalities(db)
    building = _place(db, facility, LocationType.BUILDING.value, "MAIN")
    floor = _place(db, facility, LocationType.FLOOR.value, "03", parent=building)
    theatre = _place(db, facility, LocationType.ROOM.value, "OR-3", parent=floor,
                     space_use=SpaceUse.OPERATING_ROOM.value, bed_count=0)

    switchgear = _equipment(db, facility, "SWGR-1", modality)
    panel = _equipment(db, facility, "IPP-3", modality)
    receptacle = _equipment(db, facility, "RCP-OR3-04", modality)
    anaesthesia = _equipment(db, facility, "ANES-7", modality, location=theatre)

    from app.models.discipline import Discipline
    electrical = Discipline(code="electrical", name="Electrical")
    db.add(electrical)
    db.flush()
    # The plant side carries a discipline; the clinical asset does not, which
    # is how the report tells them apart.
    for asset in (switchgear, panel, receptacle):
        asset.discipline_id = electrical.id
    db.flush()

    power = ServiceType.ESSENTIAL_POWER.value
    for upstream, downstream in (
        (switchgear, panel), (panel, receptacle), (receptacle, anaesthesia),
    ):
        db.add(AssetServesAsset(
            upstream_equipment_id=upstream.id,
            downstream_equipment_id=downstream.id,
            service_type=power,
        ))
    # A cross-tie back to the top. Real distribution has these, and a naive
    # recursive walk hangs on the first one.
    db.add(AssetServesAsset(
        upstream_equipment_id=receptacle.id,
        downstream_equipment_id=switchgear.id,
        service_type=power,
    ))
    db.add(AssetServesLocation(
        equipment_id=panel.id, location_id=theatre.id, service_type=power,
    ))
    db.flush()

    result = impact.assess(db, switchgear.id, service_type=power)

    assert result["found"] is True
    assert result["downstream_asset_count"] == 3, result["downstream_asset_count"]
    # The cross-domain hop: an electrical panel reaching the anaesthesia
    # machine. No single-domain system can make it.
    assert result["clinical_summary"]["clinical_assets_affected"] == 1
    assert result["clinical_summary"]["high_acuity_space_count"] == 1
    assert "operating room" in result["clinical_summary"]["headline"]
    print("ok  impact walk reaches clinical assets and survives a ring")


def test_redundant_feeds_are_excluded_by_default():
    db = _session()
    facility = _facility(db)
    modality = _modalities(db)
    panel = _equipment(db, facility, "P-1", modality)
    dual_fed = _equipment(db, facility, "P-2", modality)

    db.add(AssetServesAsset(
        upstream_equipment_id=panel.id, downstream_equipment_id=dual_fed.id,
        service_type=ServiceType.NORMAL_POWER.value, is_redundant=True,
    ))
    db.flush()

    # An asset on a second feed does not go down. Reporting it as impacted
    # trains people to ignore the report.
    assert impact.downstream_assets(db, panel.id) == []
    degraded = impact.downstream_assets(db, panel.id, include_redundant=True)
    assert len(degraded) == 1
    print("ok  redundant feeds are excluded by default")


def test_serving_a_floor_covers_rooms_added_later():
    db = _session()
    facility = _facility(db)
    modality = _modalities(db)
    building = _place(db, facility, LocationType.BUILDING.value, "MAIN")
    floor = _place(db, facility, LocationType.FLOOR.value, "03", parent=building)
    air_handler = _equipment(db, facility, "AHU-4", modality)

    db.add(AssetServesLocation(
        equipment_id=air_handler.id, location_id=floor.id,
        service_type=ServiceType.SUPPLY_AIR.value,
    ))
    db.flush()

    # A room created after the edge was drawn.
    _place(db, facility, LocationType.ROOM.value, "301", parent=floor)
    db.flush()

    affected = impact.affected_locations(db, [air_handler.id])
    codes = {location.code for location in affected}
    assert {"03", "301"} <= codes, codes
    print("ok  serving a floor covers rooms added later")


# ── Reading units ────────────────────────────────────────────────────────────

def test_readings_carry_their_unit():
    from app.models.reading import ReadingPoint, convert_to

    db = _session()
    facility = _facility(db)
    building = _place(db, facility, LocationType.BUILDING.value, "MAIN")
    floor = _place(db, facility, LocationType.FLOOR.value, "03", parent=building)
    theatre = _place(db, facility, LocationType.ROOM.value, "OR-3", parent=floor,
                     space_use=SpaceUse.OPERATING_ROOM.value)

    point = ReadingPoint(
        facility_id=facility.id, location_id=theatre.id,
        code="OR3-PRESS", name="Theatre pressure relationship",
        unit="in_wc", min_spec=0.01, spec_reference="ASHRAE 170",
        gates_space_availability=True,
    )
    db.add(point)
    db.flush()

    assert point.evaluate(0.02) is True
    assert point.evaluate(0.005) is False

    # The failure the unit column exists to prevent: 2.5 Pa is the requirement,
    # and 0.01 typed while a gauge read pascals is a quarter of one percent of
    # it — indistinguishable from compliance if the unit were implied.
    converted = convert_to(2.5, "pa", "in_wc")
    assert converted is not None and point.evaluate(converted) is True
    assert point.evaluate(0.01) is True
    assert convert_to(0.01, "pa", "in_wc") < 0.01

    # An undefined pair is refused rather than passed through unchanged.
    assert convert_to(5, "cfm", "gpm") is None
    print("ok  readings carry their unit")


if __name__ == "__main__":
    tests = [value for name, value in sorted(globals().items()) if name.startswith("test_")]
    for test in tests:
        test()
    print(f"\n{len(tests)} checks passed")
