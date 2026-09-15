"""One asset's whole life, assembled from the tables that already hold it.

The timeline is derived, not stored. Every service visit is already a
`ServiceRequest`, every inspection an `Inspection`, every regulatory test a
`ComplianceTask`, every measurement a `Reading` — copying those into an event
table would mean two records of the same fact, and the copy goes stale the
first time somebody edits the original.

What `AssetLedgerEntry` holds is only what nothing else does: the money and the
custody. Those two sources are merged here into a single chronology.

The cost of deriving is a handful of queries per asset. That is the right
trade: this is a detail view somebody opens for one asset at a time, not a list
query, and correctness that cannot drift is worth more than a millisecond.
"""
from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal

from sqlalchemy.orm import Session

from app.models.asset_ledger import (
    BASIS_AFFECTING, TERMINAL, AssetLedgerEntry, DepreciationMethod, LedgerEntryType,
)
from app.models.compliance import ComplianceTask
from app.models.equipment import Equipment
from app.models.inspection import Inspection
from app.models.reading import Reading, ReadingPoint
from app.models.service_request import ServiceRequest, ServiceRequestStatus
from app.services import depreciation as depreciation_service
from app.utils.clock import utc_today


# What kind of thing an entry is, so the UI can group and colour without
# re-deriving it from the source table name.
EVENT_KINDS = (
    "acquisition", "installation", "warranty", "service", "preventive",
    "inspection", "compliance", "reading", "financial", "custody", "disposal",
)


def _as_date(value) -> date | None:
    if value is None:
        return None
    return value.date() if isinstance(value, datetime) else value


def _event(
    *, kind: str, occurred_on: date | None, title: str,
    detail: str | None = None, amount=None, reference: str | None = None,
    source: str | None = None, source_id: int | None = None,
    outcome: str | None = None,
) -> dict:
    return {
        "kind": kind,
        "occurred_on": occurred_on,
        "title": title,
        "detail": detail,
        "amount": Decimal(str(amount)) if amount is not None else None,
        "reference": reference,
        "source": source,
        "source_id": source_id,
        "outcome": outcome,
    }


def basis_changes(entries: list[AssetLedgerEntry]) -> list[depreciation_service.BasisChange]:
    """Ledger entries that move the depreciable basis, in the form the
    depreciation engine wants. Acquisition is excluded — it *is* the cost, and
    counting it again would double the basis."""
    changes: list[depreciation_service.BasisChange] = []
    for entry in entries:
        if entry.entry_type == LedgerEntryType.ACQUISITION.value:
            continue
        # A reversal is recorded as its own negative row, and the entry it
        # reverses is marked reversed and drops out below. Counting the
        # negative row as well would take the amount off twice: reversing a
        # $20,000 improvement would leave the asset $20,000 below where it began.
        if entry.entry_type == LedgerEntryType.REVERSAL.value:
            continue
        if entry.entry_type not in BASIS_AFFECTING or entry.is_reversed:
            continue
        if entry.amount is None:
            continue
        changes.append(depreciation_service.BasisChange(
            effective_date=entry.effective_date,
            amount=Decimal(str(entry.amount)),
            extends_life_years=Decimal(str(entry.extends_useful_life_years or 0)),
            description=entry.description,
        ))
    return changes


def disposal_date(entries: list[AssetLedgerEntry]) -> date | None:
    for entry in entries:
        if entry.entry_type in TERMINAL and not entry.is_reversed:
            return entry.effective_date
    return None


def in_service_date(equipment: Equipment, entries: list[AssetLedgerEntry]) -> date | None:
    """When depreciation starts.

    An explicit capitalisation entry wins; otherwise the installation date,
    which is when the thing actually started working. Acquisition date is the
    last resort — kit can sit in a crate for months, and depreciating it while
    it does is wrong.
    """
    for entry in entries:
        if entry.entry_type == LedgerEntryType.CAPITALISATION.value and not entry.is_reversed:
            return entry.effective_date
    return equipment.installation_date or equipment.acquisition_date or equipment.purchase_date


def spend_to_date(db: Session, equipment_id: int) -> dict:
    """What has been spent keeping it running, against what it cost.

    The ratio is the number a capital planner actually wants: an asset whose
    cumulative repair cost is approaching its replacement cost is telling you
    something a depreciation schedule cannot.
    """
    rows = (
        db.query(ServiceRequest)
        .filter(
            ServiceRequest.equipment_id == equipment_id,
            ServiceRequest.status == ServiceRequestStatus.COMPLETED,
            # Major work is capital: it is in the depreciable basis through its
            # improvement entry, and counting it here as well would add it twice.
            ServiceRequest.is_major_work.is_(False),
        )
        .all()
    )
    total = sum(Decimal(str(row.total_cost or 0)) for row in rows)
    hours = sum(Decimal(str(row.time_spent_hours or 0)) for row in rows)
    corrective = [r for r in rows if r.work_order_type == "corrective"]
    preventive = [r for r in rows if r.work_order_type == "preventive"]

    return {
        "completed_work_orders": len(rows),
        "corrective_count": len(corrective),
        "preventive_count": len(preventive),
        "total_service_cost": total,
        "total_labour_hours": hours,
    }


def timeline(db: Session, equipment: Equipment, *, limit: int = 500) -> list[dict]:
    """Everything that has happened to this asset, newest first."""
    events: list[dict] = []

    # ── From the asset record itself ────────────────────────────────────────
    if equipment.acquisition_date or equipment.purchase_date:
        events.append(_event(
            kind="acquisition",
            occurred_on=equipment.acquisition_date or equipment.purchase_date,
            title="Acquired",
            detail=equipment.acquired_company_name or equipment.acquisition_method,
            amount=equipment.cost,
            reference=equipment.po_no,
        ))
    if equipment.installation_date:
        events.append(_event(
            kind="installation",
            occurred_on=equipment.installation_date,
            title="Installed and placed in service",
            detail=equipment.location or None,
        ))
    for label, when in (
        ("Parts warranty ends", equipment.part_warranty_end_date),
        ("Labour warranty ends", equipment.labor_warranty_end_date),
        ("Warranty expires", equipment.warranty_expiration),
    ):
        if when:
            events.append(_event(
                kind="warranty", occurred_on=when, title=label,
                detail=equipment.coverage_type,
            ))

    # ── Financial and custody ───────────────────────────────────────────────
    for entry in db.query(AssetLedgerEntry).filter(
        AssetLedgerEntry.equipment_id == equipment.id,
    ).all():
        kind = (
            "disposal" if entry.entry_type in TERMINAL
            else "custody" if entry.entry_type == LedgerEntryType.TRANSFER.value
            else "financial"
        )
        events.append(_event(
            kind=kind,
            occurred_on=entry.effective_date,
            title=entry.description,
            detail=entry.entry_type.replace("_", " ").title()
            + (" (reversed)" if entry.is_reversed else ""),
            amount=entry.amount,
            reference=entry.reference,
            source="ledger_entry",
            source_id=entry.id,
        ))

    # ── Service history ─────────────────────────────────────────────────────
    for row in db.query(ServiceRequest).filter(
        ServiceRequest.equipment_id == equipment.id,
    ).order_by(ServiceRequest.created_at.desc()).limit(limit).all():
        when = _as_date(row.completed_at or row.created_at)
        is_pm = row.work_order_type == "preventive"
        events.append(_event(
            kind="preventive" if is_pm else "service",
            occurred_on=when,
            title=row.problem_description or row.request_number,
            detail=row.resolution_description,
            amount=row.total_cost,
            reference=row.request_number,
            source="service_request",
            source_id=row.id,
            outcome=getattr(row.status, "value", row.status),
        ))

    # ── Inspections ─────────────────────────────────────────────────────────
    for row in db.query(Inspection).filter(
        Inspection.equipment_id == equipment.id,
    ).order_by(Inspection.scheduled_date.desc()).limit(limit).all():
        events.append(_event(
            kind="inspection",
            occurred_on=_as_date(row.completed_at or row.scheduled_date),
            title="Inspection",
            detail=row.corrective_actions,
            reference=row.inspection_number,
            source="inspection",
            source_id=row.id,
            outcome=getattr(row.result, "value", row.result),
        ))

    # ── Regulatory tests ────────────────────────────────────────────────────
    for row in db.query(ComplianceTask).filter(
        ComplianceTask.equipment_id == equipment.id,
    ).order_by(ComplianceTask.due_date.desc()).limit(limit).all():
        program = row.program
        events.append(_event(
            kind="compliance",
            occurred_on=_as_date(row.completed_at) or row.due_date,
            title=program.name if program else "Compliance task",
            detail=(
                f"Certificate {row.certificate_number}" if row.certificate_number
                else (program.citation if program else None)
            ),
            reference=row.certificate_number,
            source="compliance_task",
            source_id=row.id,
            outcome=row.result or row.status,
        ))

    # ── Out-of-spec readings only ───────────────────────────────────────────
    # Every in-spec reading would bury everything else — a daily check produces
    # 365 rows a year that say "fine". The exceptions are the history.
    for reading, point in (
        db.query(Reading, ReadingPoint)
        .join(ReadingPoint, ReadingPoint.id == Reading.point_id)
        .filter(
            ReadingPoint.equipment_id == equipment.id,
            Reading.in_spec.is_(False),
        )
        .order_by(Reading.recorded_at.desc())
        .limit(100)
        .all()
    ):
        events.append(_event(
            kind="reading",
            occurred_on=_as_date(reading.recorded_at),
            title=f"{point.name} out of spec",
            detail=f"{reading.value:g} {reading.unit}",
            source="reading",
            source_id=reading.id,
            outcome="out_of_spec",
        ))

    # Undated events sort last rather than crashing the comparison.
    events.sort(key=lambda e: (e["occurred_on"] is not None, e["occurred_on"]), reverse=True)
    return events[:limit]


def summary(db: Session, equipment: Equipment, *, as_of: date | None = None) -> dict:
    """The ledger header: what it is, what it cost, what it is worth, and what
    keeping it has cost so far."""
    as_of = as_of or utc_today()
    entries = list(
        db.query(AssetLedgerEntry)
        .filter(AssetLedgerEntry.equipment_id == equipment.id)
        .order_by(AssetLedgerEntry.effective_date.asc())
        .all()
    )

    started = in_service_date(equipment, entries)
    disposed = disposal_date(entries)

    result = depreciation_service.compute(
        cost=equipment.cost,
        salvage_value=equipment.salvage_value,
        useful_life_years=equipment.useful_life_years,
        method=equipment.depreciation_method or DepreciationMethod.STRAIGHT_LINE.value,
        in_service_date=started,
        as_of=as_of,
        basis_changes=basis_changes(entries),
        units_used=_runtime_units(db, equipment),
        total_expected_units=equipment.total_expected_units,
        disposed_on=disposed,
    )

    spend = spend_to_date(db, equipment.id)

    # The ratio a capital planner actually wants. An asset whose cumulative
    # repair cost approaches its original cost is telling you something the
    # depreciation schedule cannot.
    cost = Decimal(str(equipment.cost or 0))
    spend_ratio = (
        float(spend["total_service_cost"] / cost * 100) if cost > 0 else None
    )

    return {
        "equipment_id": equipment.id,
        "asset_tag": equipment.asset_tag,
        "in_service_date": started,
        "disposed_on": disposed,
        "age_months": depreciation_service.months_between(started, as_of) if started else None,
        "depreciation": result,
        "service": spend,
        "service_cost_as_percent_of_cost": round(spend_ratio, 1) if spend_ratio is not None else None,
        "ledger_entry_count": len(entries),
    }


def _runtime_units(db: Session, equipment: Equipment):
    """Latest runtime reading, for units-of-production depreciation.

    Reuses the runtime point that already drives runtime-based maintenance
    rather than asking anybody to keep a second number in step.
    """
    row = (
        db.query(Reading)
        .join(ReadingPoint, ReadingPoint.id == Reading.point_id)
        .filter(
            ReadingPoint.equipment_id == equipment.id,
            ReadingPoint.unit == "hours",
        )
        .order_by(Reading.recorded_at.desc())
        .first()
    )
    return Decimal(str(row.value)) if row else None


def fleet_valuation(db: Session, *, facility_ids: list[int], as_of: date | None = None) -> dict:
    """Book value across the estate, by discipline.

    One pass over the assets rather than a query per asset: this is the report
    a finance team runs across everything, and per-asset queries would make it
    a minutes-long request.
    """
    as_of = as_of or utc_today()

    assets = (
        db.query(Equipment)
        .filter(Equipment.facility_id.in_(facility_ids))
        .all()
    )
    if not assets:
        return {
            "as_of": as_of, "asset_count": 0, "total_cost": Decimal("0"),
            "accumulated_depreciation": Decimal("0"), "net_book_value": Decimal("0"),
            "fully_depreciated_count": 0, "by_discipline": {},
        }

    # One query for every basis change, grouped in memory.
    entries_by_asset: dict[int, list[AssetLedgerEntry]] = {}
    for entry in db.query(AssetLedgerEntry).filter(
        AssetLedgerEntry.equipment_id.in_([a.id for a in assets]),
    ).all():
        entries_by_asset.setdefault(entry.equipment_id, []).append(entry)

    from app.models.discipline import Discipline
    discipline_names = dict(db.query(Discipline.id, Discipline.name).all())

    total_cost = accumulated = net = Decimal("0")
    fully = 0
    by_discipline: dict[str, dict] = {}

    for asset in assets:
        entries = entries_by_asset.get(asset.id, [])
        result = depreciation_service.compute(
            cost=asset.cost,
            salvage_value=asset.salvage_value,
            useful_life_years=asset.useful_life_years,
            method=asset.depreciation_method or DepreciationMethod.STRAIGHT_LINE.value,
            in_service_date=in_service_date(asset, entries),
            as_of=as_of,
            basis_changes=basis_changes(entries),
            disposed_on=disposal_date(entries),
        )

        total_cost += result.cost
        accumulated += result.accumulated_depreciation
        net += result.net_book_value
        if result.is_fully_depreciated and result.cost > 0:
            fully += 1

        key = discipline_names.get(asset.discipline_id, "Unclassified")
        bucket = by_discipline.setdefault(key, {
            "asset_count": 0, "cost": Decimal("0"),
            "accumulated_depreciation": Decimal("0"), "net_book_value": Decimal("0"),
        })
        bucket["asset_count"] += 1
        bucket["cost"] += result.cost
        bucket["accumulated_depreciation"] += result.accumulated_depreciation
        bucket["net_book_value"] += result.net_book_value

    return {
        "as_of": as_of,
        "asset_count": len(assets),
        "total_cost": total_cost,
        "accumulated_depreciation": accumulated,
        "net_book_value": net,
        # The replacement-planning number: kit still in service with no book
        # value left is kit whose replacement nobody has budgeted for.
        "fully_depreciated_count": fully,
        "by_discipline": dict(sorted(by_discipline.items())),
    }
