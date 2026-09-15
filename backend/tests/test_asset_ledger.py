"""The asset ledger: depreciation maths, basis changes, disposal, and timeline.

Depreciation is arithmetic, and arithmetic that is quietly wrong is the worst
kind of wrong — nothing crashes, a plausible number appears on a report, and
finance builds a replacement budget on it. So the sums are checked against
figures worked by hand rather than against the implementation.

The other property under test is that the timeline is *derived*. Nothing copies
a service visit into an event table, so a work order edited after the fact
shows its new state in the ledger rather than a stale snapshot.

    DATABASE_URL=sqlite:// python backend/tests/test_asset_ledger.py
"""
from __future__ import annotations

import os
import pathlib
import sys
from datetime import date, datetime, timedelta
from decimal import Decimal

os.environ.setdefault("DATABASE_URL", "sqlite://")
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))

from sqlalchemy import create_engine  # noqa: E402
from sqlalchemy.orm import sessionmaker  # noqa: E402

import app.models  # noqa: E402,F401
from app.db.base import Base  # noqa: E402
from app.models.asset_ledger import AssetLedgerEntry, DepreciationMethod, LedgerEntryType  # noqa: E402
from app.models.discipline import Discipline  # noqa: E402
from app.models.equipment import Equipment  # noqa: E402
from app.models.facility import Facility  # noqa: E402
from app.models.inspection import Inspection, InspectionResult, InspectionStatus  # noqa: E402
from app.models.inspection_form import InspectionForm  # noqa: E402
from app.models.modality import Modality, ModalityCategory  # noqa: E402
from app.models.service_request import Priority, ServiceRequest, ServiceRequestStatus  # noqa: E402
from app.services import asset_ledger as ledger_service, depreciation as dep  # noqa: E402


def _session():
    engine = create_engine("sqlite://")
    Base.metadata.create_all(engine)
    return sessionmaker(bind=engine, autoflush=False)()


def _facility(db):
    f = Facility(name="H", phone="1", email="a@b.c", address="1", city="Austin",
                 state="TX", zip_code="78701", country="United States")
    db.add(f)
    db.flush()
    return f


def _asset(db, facility, **kwargs):
    m = Modality(name=f"M{id(kwargs) % 100000}", category=ModalityCategory.IMAGING)
    db.add(m)
    db.flush()
    e = Equipment(
        asset_tag=kwargs.pop("tag", "AHU-1"), make="Acme", model="X",
        serial_number="SN1", modality_id=m.id, facility_id=facility.id, **kwargs,
    )
    db.add(e)
    db.flush()
    return e


# ── Straight line ────────────────────────────────────────────────────────────

def test_straight_line_matches_hand_arithmetic():
    # $100,000, $10,000 salvage, 10 years -> $9,000 a year.
    result = dep.compute(
        cost=100_000, salvage_value=10_000, useful_life_years=10,
        method=DepreciationMethod.STRAIGHT_LINE.value,
        in_service_date=date(2020, 1, 1), as_of=date(2025, 1, 1),
    )

    assert result.depreciable_amount == Decimal("90000.00")
    assert result.annual_depreciation == Decimal("9000.00")
    assert result.monthly_depreciation == Decimal("750.00")

    # Five full years in: 5 x 9,000 = 45,000 accumulated, 55,000 left.
    assert result.accumulated_depreciation == Decimal("45000.00")
    assert result.net_book_value == Decimal("55000.00")
    assert result.is_fully_depreciated is False
    assert round(result.percent_depreciated) == 50
    print("ok  straight line matches hand arithmetic")


def test_depreciation_never_runs_below_salvage():
    # Well past the end of life.
    result = dep.compute(
        cost=50_000, salvage_value=5_000, useful_life_years=5,
        method=DepreciationMethod.STRAIGHT_LINE.value,
        in_service_date=date(2010, 1, 1), as_of=date(2026, 1, 1),
    )
    # An asset written below its salvage value is a register bug that shows up
    # as negative book value on a balance sheet.
    assert result.net_book_value == Decimal("5000.00")
    assert result.accumulated_depreciation == Decimal("45000.00")
    assert result.is_fully_depreciated is True
    print("ok  depreciation never runs below salvage")


def test_a_missing_input_says_so_rather_than_reporting_zero():
    no_cost = dep.compute(
        cost=None, useful_life_years=10, in_service_date=date(2020, 1, 1),
    )
    # Zero is indistinguishable from an asset that is fully written down, which
    # is why this returns a message instead.
    assert no_cost.message and "cost" in no_cost.message.lower()

    no_date = dep.compute(cost=1000, useful_life_years=10, in_service_date=None)
    assert no_date.message and "in-service" in no_date.message.lower()
    assert no_date.net_book_value == Decimal("1000.00")

    no_life = dep.compute(
        cost=1000, useful_life_years=None, in_service_date=date(2020, 1, 1),
    )
    assert no_life.message and "useful life" in no_life.message.lower()

    not_depreciated = dep.compute(
        cost=1000, useful_life_years=10, in_service_date=date(2020, 1, 1),
        method=DepreciationMethod.NONE.value,
    )
    assert not_depreciated.message and "not depreciated" in not_depreciated.message.lower()
    print("ok  a missing input says so rather than reporting zero")


def test_declining_balance_front_loads_then_finishes():
    straight = dep.compute(
        cost=60_000, salvage_value=0, useful_life_years=5,
        method=DepreciationMethod.STRAIGHT_LINE.value,
        in_service_date=date(2020, 1, 1), as_of=date(2021, 1, 1),
    )
    accelerated = dep.compute(
        cost=60_000, salvage_value=0, useful_life_years=5,
        method=DepreciationMethod.DOUBLE_DECLINING.value,
        in_service_date=date(2020, 1, 1), as_of=date(2021, 1, 1),
    )
    # Double declining at 40% of 60,000 is 24,000 in year one, against 12,000
    # straight line.
    assert accelerated.accumulated_depreciation == Decimal("24000.00")
    assert accelerated.accumulated_depreciation > straight.accumulated_depreciation

    # And it must actually finish. Declining balance never reaches zero on its
    # own, so the schedule switches to straight line once that charges more.
    finished = dep.compute(
        cost=60_000, salvage_value=0, useful_life_years=5,
        method=DepreciationMethod.DOUBLE_DECLINING.value,
        in_service_date=date(2020, 1, 1), as_of=date(2026, 1, 1),
    )
    assert finished.net_book_value == Decimal("0.00"), finished.net_book_value
    assert finished.is_fully_depreciated is True
    print("ok  declining balance front-loads then finishes")


def test_units_of_production_tracks_hours_not_years():
    # A standby generator six years old that has run forty hours is not six
    # years' worth of worn out, and a calendar schedule says it is.
    result = dep.compute(
        cost=200_000, salvage_value=20_000, useful_life_years=20,
        method=DepreciationMethod.UNITS_OF_PRODUCTION.value,
        in_service_date=date(2020, 1, 1), as_of=date(2026, 1, 1),
        units_used=Decimal("40"), total_expected_units=Decimal("10000"),
    )
    # 180,000 depreciable over 10,000 hours = $18/hour; 40 hours = $720.
    assert result.accumulated_depreciation == Decimal("720.00")
    assert result.net_book_value == Decimal("199280.00")

    calendar = dep.compute(
        cost=200_000, salvage_value=20_000, useful_life_years=20,
        method=DepreciationMethod.STRAIGHT_LINE.value,
        in_service_date=date(2020, 1, 1), as_of=date(2026, 1, 1),
    )
    assert calendar.accumulated_depreciation > result.accumulated_depreciation

    # Without a rating there is nothing to divide by, and it says so.
    missing = dep.compute(
        cost=200_000, useful_life_years=20,
        method=DepreciationMethod.UNITS_OF_PRODUCTION.value,
        in_service_date=date(2020, 1, 1), units_used=40, total_expected_units=None,
    )
    assert missing.message and "total expected output" in missing.message
    print("ok  units of production tracks hours, not years")


def test_an_improvement_adds_to_the_basis_and_can_extend_life():
    plain = dep.compute(
        cost=100_000, salvage_value=0, useful_life_years=10,
        in_service_date=date(2020, 1, 1), as_of=date(2026, 1, 1),
    )
    improved = dep.compute(
        cost=100_000, salvage_value=0, useful_life_years=10,
        in_service_date=date(2020, 1, 1), as_of=date(2026, 1, 1),
        basis_changes=[dep.BasisChange(
            effective_date=date(2023, 1, 1), amount=Decimal("50000"),
            extends_life_years=Decimal("5"), description="Lift modernisation",
        )],
    )

    # More to depreciate, and the remaining life is longer, so book value is
    # higher than the un-improved asset rather than lower.
    assert improved.net_book_value > plain.net_book_value
    year_of_change = next(r for r in improved.schedule if r.year == 2023)
    assert year_of_change.basis_change == Decimal("50000.00")
    assert "life extended" in year_of_change.note
    print("ok  an improvement adds to the basis and can extend life")


def test_depreciation_stops_at_disposal():
    running = dep.compute(
        cost=100_000, salvage_value=0, useful_life_years=10,
        in_service_date=date(2020, 1, 1), as_of=date(2026, 1, 1),
    )
    disposed = dep.compute(
        cost=100_000, salvage_value=0, useful_life_years=10,
        in_service_date=date(2020, 1, 1), as_of=date(2026, 1, 1),
        disposed_on=date(2023, 1, 1),
    )
    # Continuing to depreciate kit that left the building last year quietly
    # understates the fleet.
    assert disposed.accumulated_depreciation < running.accumulated_depreciation
    assert disposed.as_of == date(2023, 1, 1)
    print("ok  depreciation stops at disposal")


def test_gain_or_loss_on_disposal():
    # Sold above book: a gain.
    assert dep.gain_or_loss_on_disposal(30_000, 35_000) == Decimal("5000.00")
    # Scrapped below book: a loss.
    assert dep.gain_or_loss_on_disposal(30_000, 0) == Decimal("-30000.00")
    assert dep.gain_or_loss_on_disposal(0, 0) == Decimal("0.00")
    print("ok  gain or loss on disposal")


def test_useful_life_defaults_by_trade():
    # A lift outlasts a clinical monitor by a factor of three, and defaulting
    # both to the same number makes every replacement forecast wrong.
    assert dep.default_useful_life("vertical_transport") == 20
    assert dep.default_useful_life("biomedical") == 7
    assert dep.default_useful_life("building_envelope") == 25
    assert dep.default_useful_life("something_unknown") == dep.FALLBACK_USEFUL_LIFE_YEARS
    assert dep.default_useful_life(None) == dep.FALLBACK_USEFUL_LIFE_YEARS
    print("ok  useful life defaults by trade")


# ── The ledger ───────────────────────────────────────────────────────────────

def test_in_service_date_prefers_installation_over_acquisition():
    db = _session()
    f = _facility(db)

    # Kit can sit in a crate for months. Depreciating it while it does is wrong.
    crated = _asset(db, f, tag="A1", acquisition_date=date(2020, 1, 1),
                    installation_date=date(2020, 6, 1))
    assert ledger_service.in_service_date(crated, []) == date(2020, 6, 1)

    # Falls back when there is no installation date.
    uninstalled = _asset(db, f, tag="A2", acquisition_date=date(2020, 1, 1))
    assert ledger_service.in_service_date(uninstalled, []) == date(2020, 1, 1)

    # An explicit capitalisation entry beats both.
    entry = AssetLedgerEntry(
        facility_id=f.id, equipment_id=crated.id,
        entry_type=LedgerEntryType.CAPITALISATION.value,
        effective_date=date(2020, 9, 1), description="Placed in service",
    )
    assert ledger_service.in_service_date(crated, [entry]) == date(2020, 9, 1)
    print("ok  in-service date prefers installation over acquisition")


def test_acquisition_entry_does_not_double_the_basis():
    db = _session()
    f = _facility(db)
    asset = _asset(db, f, cost=100_000)

    entries = [
        AssetLedgerEntry(
            facility_id=f.id, equipment_id=asset.id,
            entry_type=LedgerEntryType.ACQUISITION.value,
            effective_date=date(2020, 1, 1), description="Purchased",
            amount=Decimal("100000"),
        ),
        AssetLedgerEntry(
            facility_id=f.id, equipment_id=asset.id,
            entry_type=LedgerEntryType.IMPROVEMENT.value,
            effective_date=date(2023, 1, 1), description="Coil replacement",
            amount=Decimal("20000"),
        ),
    ]
    changes = ledger_service.basis_changes(entries)

    # Acquisition *is* the cost. Counting it again would make a $100k asset
    # depreciate as a $200k one.
    assert len(changes) == 1
    assert changes[0].amount == Decimal("20000")
    print("ok  acquisition entry does not double the basis")


def test_a_reversed_entry_stops_counting():
    db = _session()
    f = _facility(db)
    asset = _asset(db, f, cost=100_000)

    improvement = AssetLedgerEntry(
        facility_id=f.id, equipment_id=asset.id,
        entry_type=LedgerEntryType.IMPROVEMENT.value,
        effective_date=date(2023, 1, 1), description="Entered twice by mistake",
        amount=Decimal("20000"), is_reversed=True,
    )
    assert ledger_service.basis_changes([improvement]) == []

    disposal = AssetLedgerEntry(
        facility_id=f.id, equipment_id=asset.id,
        entry_type=LedgerEntryType.DISPOSAL.value,
        effective_date=date(2024, 1, 1), description="Recorded in error",
        is_reversed=True,
    )
    # A reversed disposal must not keep the asset retired, or the register shows
    # kit as gone that is demonstrably still there.
    assert ledger_service.disposal_date([disposal]) is None

    # Together with the reversal row the endpoint posts, the pair cancels out:
    # the negative row must not be subtracted on top of the original dropping out.
    reversal = AssetLedgerEntry(
        facility_id=f.id, equipment_id=asset.id,
        entry_type=LedgerEntryType.REVERSAL.value,
        effective_date=date(2023, 2, 1), description="Reversal of Entered twice by mistake",
        amount=Decimal("-20000"),
    )
    assert ledger_service.basis_changes([improvement, reversal]) == []
    print("ok  a reversed entry stops counting, and its reversal does not count against it")


def test_timeline_is_assembled_from_the_existing_tables():
    db = _session()
    f = _facility(db)
    asset = _asset(
        db, f, cost=80_000,
        acquisition_date=date(2021, 3, 1), installation_date=date(2021, 4, 1),
        warranty_expiration=date(2024, 4, 1),
    )

    form = InspectionForm(name="Annual", schema={})
    db.add(form)
    db.flush()

    db.add(ServiceRequest(
        request_number="SR-001", facility_id=f.id, equipment_id=asset.id,
        requester_id=1, problem_description="Bearing noise",
        resolution_description="Bearing replaced", priority=Priority.HIGH,
        status=ServiceRequestStatus.COMPLETED, work_order_type="corrective",
        total_cost=Decimal("2400"), time_spent_hours=Decimal("6"),
        completed_at=datetime(2023, 5, 1),
    ))
    db.add(Inspection(
        inspection_number="INS-001", facility_id=f.id, equipment_id=asset.id,
        form_template_id=form.id, status=InspectionStatus.COMPLETED,
        result=InspectionResult.PASS, scheduled_date=datetime(2023, 6, 1),
        completed_at=datetime(2023, 6, 1),
    ))
    db.add(AssetLedgerEntry(
        facility_id=f.id, equipment_id=asset.id,
        entry_type=LedgerEntryType.IMPROVEMENT.value,
        effective_date=date(2023, 8, 1), description="Coil replacement",
        amount=Decimal("15000"),
    ))
    db.flush()

    events = ledger_service.timeline(db, asset)
    kinds = {e["kind"] for e in events}

    # Every source contributes, and nothing had to be copied to get there.
    assert {"acquisition", "installation", "warranty", "service", "inspection", "financial"} <= kinds

    # Newest first, and undated events do not crash the sort.
    dated = [e["occurred_on"] for e in events if e["occurred_on"]]
    assert dated == sorted(dated, reverse=True)

    service_event = next(e for e in events if e["kind"] == "service")
    assert service_event["amount"] == Decimal("2400")
    assert service_event["reference"] == "SR-001"
    assert service_event["source"] == "service_request"
    print("ok  timeline is assembled from the existing tables")


def test_summary_reports_spend_against_cost():
    db = _session()
    f = _facility(db)
    asset = _asset(db, f, cost=10_000, installation_date=date(2020, 1, 1),
                   useful_life_years=Decimal("10"))

    for index, amount in enumerate([Decimal("1500"), Decimal("2000")]):
        db.add(ServiceRequest(
            request_number=f"SR-{index}", facility_id=f.id, equipment_id=asset.id,
            requester_id=1, problem_description="repair", priority=Priority.MEDIUM,
            status=ServiceRequestStatus.COMPLETED, work_order_type="corrective",
            total_cost=amount, time_spent_hours=Decimal("3"),
        ))
    # An open work order is not spend yet.
    db.add(ServiceRequest(
        request_number="SR-open", facility_id=f.id, equipment_id=asset.id,
        requester_id=1, problem_description="in progress", priority=Priority.MEDIUM,
        status=ServiceRequestStatus.IN_PROGRESS, work_order_type="corrective",
        total_cost=Decimal("9999"),
    ))
    db.flush()

    summary = ledger_service.summary(db, asset, as_of=date(2025, 1, 1))

    assert summary["service"]["completed_work_orders"] == 2
    assert summary["service"]["total_service_cost"] == Decimal("3500")
    assert summary["service"]["total_labour_hours"] == Decimal("6")
    # 3,500 spent against a 10,000 asset. The ratio a capital planner wants:
    # repair cost approaching replacement cost says something the depreciation
    # schedule cannot.
    assert summary["service_cost_as_percent_of_cost"] == 35.0
    assert summary["depreciation"].net_book_value == Decimal("5000.00")
    print("ok  summary reports spend against cost")


def test_fleet_valuation_totals_and_groups():
    db = _session()
    f = _facility(db)
    lifts = Discipline(code="vertical_transport", name="Vertical Transport")
    hvac = Discipline(code="mechanical", name="Mechanical")
    db.add_all([lifts, hvac])
    db.flush()

    _asset(db, f, tag="LIFT-1", cost=200_000, installation_date=date(2020, 1, 1),
           useful_life_years=Decimal("20"), discipline_id=lifts.id)
    _asset(db, f, tag="AHU-9", cost=100_000, installation_date=date(2020, 1, 1),
           useful_life_years=Decimal("10"), discipline_id=hvac.id)
    # No cost recorded: counted as an asset, contributes nothing to the money.
    _asset(db, f, tag="UNKNOWN", discipline_id=hvac.id)
    db.flush()

    valuation = ledger_service.fleet_valuation(
        db, facility_ids=[f.id], as_of=date(2025, 1, 1),
    )

    assert valuation["asset_count"] == 3
    assert valuation["total_cost"] == Decimal("300000.00")
    # Lift: 200k over 20y, 5 years in = 50k. AHU: 100k over 10y = 50k.
    assert valuation["accumulated_depreciation"] == Decimal("100000.00")
    assert valuation["net_book_value"] == Decimal("200000.00")

    assert valuation["by_discipline"]["Vertical Transport"]["asset_count"] == 1
    assert valuation["by_discipline"]["Mechanical"]["asset_count"] == 2
    assert valuation["by_discipline"]["Vertical Transport"]["net_book_value"] == Decimal("150000.00")
    print("ok  fleet valuation totals and groups")


def test_fully_depreciated_count_flags_unbudgeted_replacements():
    db = _session()
    f = _facility(db)
    # Written down, still in service — the replacement nobody has budgeted for.
    _asset(db, f, tag="OLD", cost=50_000, installation_date=date(2005, 1, 1),
           useful_life_years=Decimal("10"))
    _asset(db, f, tag="NEW", cost=50_000, installation_date=date(2024, 1, 1),
           useful_life_years=Decimal("10"))
    db.flush()

    valuation = ledger_service.fleet_valuation(
        db, facility_ids=[f.id], as_of=date(2025, 1, 1),
    )
    assert valuation["fully_depreciated_count"] == 1
    print("ok  fully depreciated count flags unbudgeted replacements")


def test_months_between_uses_monthly_close_semantics():
    """Depreciation for a month is recognised once that month ends.

    The alternative — counting the month in progress as complete — shows
    thirteen months of depreciation on an asset's first anniversary, which is
    off by one against every fixed-asset register there is. This test exists
    because that is exactly the bug it caught.
    """
    # Mid-month, same month: January has not closed yet.
    assert dep.months_between(date(2020, 1, 15), date(2020, 1, 20)) == 0
    # January charges in full on 1 February, not on 16 January.
    assert dep.months_between(date(2020, 1, 15), date(2020, 2, 1)) == 1
    # Eleven months closed at 31 December; December closes on 1 January.
    assert dep.months_between(date(2020, 1, 1), date(2020, 12, 31)) == 11
    # The anniversary is exactly twelve months, not thirteen.
    assert dep.months_between(date(2020, 1, 1), date(2021, 1, 1)) == 12
    # A date before the start is not negative months.
    assert dep.months_between(date(2021, 1, 1), date(2020, 1, 1)) == 0
    print("ok  months between uses monthly-close semantics")


if __name__ == "__main__":
    tests = [v for k, v in sorted(globals().items()) if k.startswith("test_")]
    for test in tests:
        test()
    print(f"\n{len(tests)} checks passed")
