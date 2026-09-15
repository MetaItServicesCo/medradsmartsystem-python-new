"""The asset ledger: what it cost, what it is worth, and everything done to it.

Read endpoints assemble rather than store. The operational history already
lives in the service, inspection, compliance and reading tables, so it is
derived at request time and cannot drift from its source.

Write endpoints touch only the financial and custody events, which nothing else
records. Those are append-only in practice — a posted entry is corrected by
posting a reversal, never by editing it, because a financial row an auditor can
see was rewritten is a row they cannot rely on.
"""
from dataclasses import asdict
from typing import Any, List, Optional
from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.core.deps import get_current_user
from app.db.base import get_db
from app.models.asset_ledger import (
    DEFAULT_USEFUL_LIFE_YEARS, DEPRECIATION_METHODS, LEDGER_ENTRY_TYPES, TERMINAL,
    AssetLedgerEntry, DepreciationMethod, LedgerEntryType,
)
from app.models.equipment import Equipment
from app.models.location import Location
from app.models.user import User
from app.schemas.asset_ledger import (
    AssetLedger, AssetLedgerSummary, Depreciation, FleetValuation, LedgerEntry,
    LedgerEntryCreate, LedgerEntryListResponse, LedgerEntryReverse, LedgerMeta,
    TimelineEvent,
)
from app.services import asset_ledger as ledger_service, depreciation as depreciation_service
from app.utils.clock import utc_today
from app.utils.facility_access import (
    get_user_facility_ids, is_facility_scoped_user, require_facility_access,
)

router = APIRouter()


def _equipment_or_404(db: Session, equipment_id: int, current_user: User) -> Equipment:
    equipment = db.query(Equipment).filter(Equipment.id == equipment_id).first()
    if equipment is None:
        raise HTTPException(status_code=404, detail="Equipment not found")
    require_facility_access(db, current_user, equipment.facility_id)
    return equipment


def _label(value: str) -> str:
    return value.replace("_", " ").title()


def _depreciation(result: depreciation_service.DepreciationResult) -> Depreciation:
    """The engine's result as the response model.

    The schedule rows are dataclasses. Pydantic 2.5, which the server runs,
    refuses a dataclass where a model is declared, so every asset with a
    computed schedule answered 500; they are handed over as plain dicts.
    """
    return Depreciation(**{**result.__dict__, "schedule": [asdict(row) for row in result.schedule]})


@router.get("/meta", response_model=LedgerMeta)
def ledger_metadata(current_user: User = Depends(get_current_user)) -> Any:
    return LedgerMeta(
        entry_types=[{"value": t, "label": _label(t)} for t in LEDGER_ENTRY_TYPES],
        depreciation_methods=[{"value": m, "label": _label(m)} for m in DEPRECIATION_METHODS],
        # Served rather than hardcoded client-side so the two cannot disagree
        # about how long a lift lasts.
        default_useful_life_years=DEFAULT_USEFUL_LIFE_YEARS,
    )


@router.get("/equipment/{equipment_id}", response_model=AssetLedger)
def asset_ledger(
    equipment_id: int,
    db: Session = Depends(get_db),
    as_of: Optional[date] = Query(None, description="Value the asset as at this date"),
    limit: int = Query(300, le=1000),
    current_user: User = Depends(get_current_user),
) -> Any:
    """One asset's whole life: acquisition, installation, every service visit,
    inspection, regulatory test and out-of-spec reading, plus its book value."""
    equipment = _equipment_or_404(db, equipment_id, current_user)

    summary = ledger_service.summary(db, equipment, as_of=as_of)
    events = ledger_service.timeline(db, equipment, limit=limit)
    entries = (
        db.query(AssetLedgerEntry)
        .filter(AssetLedgerEntry.equipment_id == equipment.id)
        .order_by(AssetLedgerEntry.effective_date.desc())
        .all()
    )

    return AssetLedger(
        summary=AssetLedgerSummary(
            **{**summary, "depreciation": _depreciation(summary["depreciation"])},
        ),
        timeline=[TimelineEvent(**event) for event in events],
        entries=[LedgerEntry.model_validate(entry) for entry in entries],
    )


@router.get("/equipment/{equipment_id}/depreciation", response_model=Depreciation)
def asset_depreciation(
    equipment_id: int,
    db: Session = Depends(get_db),
    as_of: Optional[date] = Query(None),
    method: Optional[str] = Query(None, description="Model a different method without saving it"),
    useful_life_years: Optional[float] = Query(None, description="Model a different life"),
    current_user: User = Depends(get_current_user),
) -> Any:
    """The schedule on its own, with optional what-if overrides.

    Finance asks "what would this look like over fifteen years instead of
    twenty" often enough that answering it without writing anything is worth
    the two query parameters.
    """
    equipment = _equipment_or_404(db, equipment_id, current_user)

    if method is not None and method not in DEPRECIATION_METHODS:
        raise HTTPException(
            status_code=400,
            detail=f"Unknown method '{method}'. Allowed: {', '.join(DEPRECIATION_METHODS)}",
        )

    entries = list(
        db.query(AssetLedgerEntry)
        .filter(AssetLedgerEntry.equipment_id == equipment.id)
        .order_by(AssetLedgerEntry.effective_date.asc())
        .all()
    )

    result = depreciation_service.compute(
        cost=equipment.cost,
        salvage_value=equipment.salvage_value,
        useful_life_years=useful_life_years or equipment.useful_life_years,
        method=method or equipment.depreciation_method or DepreciationMethod.STRAIGHT_LINE.value,
        in_service_date=ledger_service.in_service_date(equipment, entries),
        as_of=as_of,
        basis_changes=ledger_service.basis_changes(entries),
        total_expected_units=equipment.total_expected_units,
        disposed_on=ledger_service.disposal_date(entries),
    )
    return _depreciation(result)


@router.get("/valuation", response_model=FleetValuation)
def fleet_valuation(
    db: Session = Depends(get_db),
    facility_id: Optional[int] = Query(None),
    as_of: Optional[date] = Query(None),
    current_user: User = Depends(get_current_user),
) -> Any:
    """Book value across the estate, broken down by trade."""
    if facility_id is not None:
        require_facility_access(db, current_user, facility_id)
        facility_ids = [facility_id]
    elif is_facility_scoped_user(current_user):
        facility_ids = list(get_user_facility_ids(db, current_user))
    else:
        from app.models.facility import Facility
        facility_ids = [row.id for row in db.query(Facility.id).all()]

    if not facility_ids:
        return FleetValuation(
            as_of=as_of or utc_today(), asset_count=0, total_cost=0,
            accumulated_depreciation=0, net_book_value=0,
            fully_depreciated_count=0, by_discipline={},
        )

    return ledger_service.fleet_valuation(db, facility_ids=facility_ids, as_of=as_of)


# ── Financial and custody entries ────────────────────────────────────────────

@router.get("/entries", response_model=LedgerEntryListResponse)
def list_entries(
    db: Session = Depends(get_db),
    equipment_id: Optional[int] = Query(None),
    facility_id: Optional[int] = Query(None),
    entry_type: Optional[str] = Query(None),
    since: Optional[date] = Query(None),
    limit: int = Query(200, le=1000),
    current_user: User = Depends(get_current_user),
) -> Any:
    query = db.query(AssetLedgerEntry)

    if equipment_id is not None:
        _equipment_or_404(db, equipment_id, current_user)
        query = query.filter(AssetLedgerEntry.equipment_id == equipment_id)
    elif facility_id is not None:
        require_facility_access(db, current_user, facility_id)
        query = query.filter(AssetLedgerEntry.facility_id == facility_id)
    elif is_facility_scoped_user(current_user):
        query = query.filter(
            AssetLedgerEntry.facility_id.in_(get_user_facility_ids(db, current_user))
        )

    if entry_type:
        query = query.filter(AssetLedgerEntry.entry_type == entry_type)
    if since:
        query = query.filter(AssetLedgerEntry.effective_date >= since)

    total = query.count()
    rows = query.order_by(AssetLedgerEntry.effective_date.desc()).limit(limit).all()
    return {"items": rows, "total": total}


@router.post("/entries", response_model=LedgerEntry, status_code=201)
def create_entry(
    payload: LedgerEntryCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Any:
    """Post a financial or custody event.

    A disposal does three things at once: it banks the realised gain or loss
    against the book value at that moment, it moves the asset to retired, and it
    stops depreciation. Doing any of those separately is how a register ends up
    depreciating equipment that left the building last year.
    """
    equipment = _equipment_or_404(db, payload.equipment_id, current_user)

    existing_terminal = (
        db.query(AssetLedgerEntry)
        .filter(
            AssetLedgerEntry.equipment_id == equipment.id,
            AssetLedgerEntry.entry_type.in_(TERMINAL),
            AssetLedgerEntry.is_reversed.is_(False),
        )
        .first()
    )
    if existing_terminal is not None:
        raise HTTPException(
            status_code=409,
            detail=(
                f"This asset was already disposed of on "
                f"{existing_terminal.effective_date.isoformat()}. "
                "Reverse that entry first if it was recorded in error."
            ),
        )

    for field_name, location_id in (
        ("from_location_id", payload.from_location_id),
        ("to_location_id", payload.to_location_id),
    ):
        if location_id is not None:
            location = db.query(Location).filter(Location.id == location_id).first()
            if location is None:
                raise HTTPException(status_code=404, detail=f"{field_name}: location not found")

    data = payload.model_dump()
    entry = AssetLedgerEntry(
        **data,
        facility_id=equipment.facility_id,
        created_by_id=current_user.id,
    )

    if payload.entry_type in TERMINAL:
        # Value the asset as it stood on the disposal date, then bank the
        # result. Recomputing it later would let an edited schedule rewrite a
        # realised gain, which is a historical fact.
        summary = ledger_service.summary(db, equipment, as_of=payload.effective_date)
        entry.gain_loss = depreciation_service.gain_or_loss_on_disposal(
            summary["depreciation"].net_book_value, payload.proceeds,
        )
        from app.models.equipment import EquipmentStatus
        equipment.status = EquipmentStatus.RETIRED

    if payload.entry_type == LedgerEntryType.TRANSFER.value and payload.to_location_id:
        # A transfer that does not move the asset is just a note. Applying it
        # keeps the register and the ledger telling the same story.
        entry.from_location_id = payload.from_location_id or equipment.location_id
        equipment.location_id = payload.to_location_id

    db.add(entry)
    db.commit()
    db.refresh(entry)
    return entry


@router.post("/entries/{entry_id}/reverse", response_model=LedgerEntry, status_code=201)
def reverse_entry(
    entry_id: int,
    payload: LedgerEntryReverse,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Any:
    """Correct an entry by posting its opposite.

    The original stays. Editing a posted financial row makes the whole ledger
    unciteable, which defeats the point of keeping one.
    """
    original = db.query(AssetLedgerEntry).filter(AssetLedgerEntry.id == entry_id).first()
    if original is None:
        raise HTTPException(status_code=404, detail="Entry not found")
    require_facility_access(db, current_user, original.facility_id)

    if original.is_reversed:
        raise HTTPException(status_code=409, detail="That entry has already been reversed")

    reversal = AssetLedgerEntry(
        facility_id=original.facility_id,
        equipment_id=original.equipment_id,
        entry_type=LedgerEntryType.REVERSAL.value,
        effective_date=utc_today(),
        description=f"Reversal of {original.description}",
        amount=-original.amount if original.amount is not None else None,
        reverses_entry_id=original.id,
        notes=payload.reason,
        created_by_id=current_user.id,
    )
    original.is_reversed = True

    # A reversed disposal puts the asset back in service, or the register keeps
    # showing retired kit that is demonstrably still there.
    if original.entry_type in TERMINAL:
        equipment = db.query(Equipment).filter(Equipment.id == original.equipment_id).first()
        if equipment is not None:
            from app.models.equipment import EquipmentStatus
            equipment.status = EquipmentStatus.ACTIVE

    db.add(reversal)
    db.commit()
    db.refresh(reversal)
    return reversal
