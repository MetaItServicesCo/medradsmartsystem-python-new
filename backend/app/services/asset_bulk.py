"""Set the same details on many assets at once.

The case it exists for: a floor's 120 chairs were created by the building
setup before anybody knew what they cost, and the invoice has now arrived.
Opening 120 assets one at a time is not a workflow.

Three rules keep it safe:

* A field left blank is left alone. Nothing is cleared in bulk.
* Every change is previewed before it is applied, per field: how many assets
  will change, how many already have that value, and which are skipped and
  why. The numbers on the confirm button are the numbers that happen.
* The ledger wins. An asset whose cost is recorded by an acquisition entry, or
  whose in-service date is fixed by a capitalisation entry, is skipped for that
  field: overwriting the record behind the ledger would leave the two
  disagreeing. A disposed or written-off asset is skipped for cost and date,
  because its book value is closed. Clinical equipment is classified by
  modality, so it is skipped for a change of trade.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date
from decimal import Decimal
from typing import Any, Callable

from sqlalchemy.orm import Session

from app.models.asset_ledger import AssetLedgerEntry, LedgerEntryType, TERMINAL
from app.models.discipline import Discipline
from app.models.equipment import Equipment
from app.services import depreciation as depreciation_service

SKIPPED_SHOWN = 20
MAX_ASSETS = 5000


def _ledger_types(db: Session, ids: list[int]) -> dict[int, set[str]]:
    """Unreversed ledger entry types per asset, fetched in chunks."""
    found: dict[int, set[str]] = {}
    for start in range(0, len(ids), 1000):
        chunk = ids[start:start + 1000]
        rows = (
            db.query(AssetLedgerEntry.equipment_id, AssetLedgerEntry.entry_type)
            .filter(AssetLedgerEntry.equipment_id.in_(chunk),
                    AssetLedgerEntry.is_reversed.is_(False))
            .all()
        )
        for equipment_id, entry_type in rows:
            found.setdefault(equipment_id, set()).add(entry_type)
    return found


def _closed(types: set[str]) -> str | None:
    if types & TERMINAL:
        return "disposed or written off, so its book value is closed"
    return None


def _cost_lock(asset: Equipment, types: set[str]) -> str | None:
    if LedgerEntryType.ACQUISITION.value in types:
        return "its cost is recorded by an acquisition entry in the ledger"
    return _closed(types)


def _date_lock(asset: Equipment, types: set[str]) -> str | None:
    if LedgerEntryType.CAPITALISATION.value in types:
        return "its in-service date is set by a capitalisation entry in the ledger"
    return _closed(types)


def _trade_lock(asset: Equipment, types: set[str]) -> str | None:
    if asset.modality_id is not None:
        return "clinical equipment is classified by modality, not trade"
    return None


def _no_lock(asset: Equipment, types: set[str]) -> str | None:
    return None


def _same(a: Any, b: Any) -> bool:
    if isinstance(a, Decimal) or isinstance(b, Decimal):
        try:
            return a is not None and b is not None and Decimal(str(a)) == Decimal(str(b))
        except Exception:  # noqa: BLE001
            return False
    return (a or None) == (b or None)


@dataclass(frozen=True)
class BulkField:
    key: str
    label: str
    lock: Callable[[Equipment, set[str]], str | None]


FIELDS: tuple[BulkField, ...] = (
    BulkField("cost", "Purchase cost", _cost_lock),
    BulkField("installation_date", "In service since", _date_lock),
    BulkField("make", "Make", _no_lock),
    BulkField("model", "Model", _no_lock),
    BulkField("discipline_id", "Trade", _trade_lock),
)


@dataclass
class FieldOutcome:
    field: str
    label: str
    value: Any
    will_change: int = 0
    unchanged: int = 0
    skipped_count: int = 0
    skipped: list[dict] = field(default_factory=list)


def normalise_changes(changes: dict) -> dict:
    """Drop blanks: a field left empty means leave it alone."""
    out: dict = {}
    for f in FIELDS:
        value = changes.get(f.key)
        if isinstance(value, str):
            value = value.strip()
        if value is None or value == "":
            continue
        out[f.key] = value
    return out


def apply(db: Session, assets: list[Equipment], changes: dict, *, dry_run: bool) -> dict:
    """Preview or apply `changes` to `assets`. Returns the per-field outcome."""
    changes = normalise_changes(changes)
    if not changes:
        raise ValueError("Fill in at least one detail to set.")
    if len(assets) > MAX_ASSETS:
        raise ValueError(f"That is {len(assets)} assets. Narrow the selection to {MAX_ASSETS} or fewer.")

    new_trade_code = None
    if "discipline_id" in changes:
        row = db.query(Discipline.code).filter(Discipline.id == changes["discipline_id"]).first()
        if row is None:
            raise ValueError("Unknown trade.")
        new_trade_code = row[0]
    trade_codes = {pk: code for pk, code in db.query(Discipline.id, Discipline.code).all()}

    types_by_asset = _ledger_types(db, [a.id for a in assets])
    outcomes = {f.key: FieldOutcome(f.key, f.label, changes[f.key]) for f in FIELDS if f.key in changes}
    changed_assets: set[int] = set()

    for asset in assets:
        types = types_by_asset.get(asset.id, set())
        for f in FIELDS:
            if f.key not in changes:
                continue
            outcome = outcomes[f.key]
            reason = f.lock(asset, types)
            if reason:
                outcome.skipped_count += 1
                if len(outcome.skipped) < SKIPPED_SHOWN:
                    outcome.skipped.append({"id": asset.id, "asset_tag": asset.asset_tag, "reason": reason})
                continue
            if _same(getattr(asset, f.key), changes[f.key]):
                outcome.unchanged += 1
                continue
            outcome.will_change += 1
            changed_assets.add(asset.id)
            if dry_run:
                continue
            if f.key == "discipline_id":
                # A book life seeded from the old trade follows to the new one;
                # a life somebody typed is theirs.
                old_default = depreciation_service.default_useful_life(trade_codes.get(asset.discipline_id))
                if asset.useful_life_years is None or _same(asset.useful_life_years, old_default):
                    asset.useful_life_years = depreciation_service.default_useful_life(new_trade_code)
            setattr(asset, f.key, changes[f.key])

    if not dry_run:
        db.flush()
    return {
        "dry_run": dry_run,
        "matched": len(assets),
        "assets_changed": len(changed_assets),
        "fields": [vars(o) for o in outcomes.values()],
    }
