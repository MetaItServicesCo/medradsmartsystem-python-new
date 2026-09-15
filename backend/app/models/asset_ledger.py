"""Financial and custody events in an asset's life.

The obvious way to build an asset ledger is one big event table that everything
writes to. That is the wrong shape here, because most of an asset's history is
*already* recorded and would have to be duplicated to get into it: every
service visit is a `ServiceRequest`, every inspection an `Inspection`, every
regulatory test a `ComplianceTask`, every measurement a `Reading`. Copying
those into a second table means two records of the same fact, and the copy goes
stale the first time somebody edits the original.

So the split is: the operational timeline is **derived** at read time from the
tables that already own it, and this table holds only what nothing else does —
the money and the custody.

  * what it cost, and what has been spent on it since
  * improvements that change what there is to depreciate
  * revaluations and impairments
  * where it went, and when
  * how it left, and what was recovered

`AssetLedgerEntry` is append-only in spirit. An asset's financial history is
the sort of thing an auditor reads, and a row that can be edited after the fact
is a row they cannot rely on — corrections are made by posting a reversing
entry, not by rewriting one.
"""
from sqlalchemy import (
    Boolean, Column, Date, DateTime, ForeignKey, Index, Integer, Numeric, String, Text,
)
from sqlalchemy.orm import relationship
from datetime import datetime
import enum

from app.db.base import Base


class LedgerEntryType(str, enum.Enum):
    """What happened. Each of these affects either the depreciable basis, the
    location, or the asset's existence — which is precisely why none of them can
    be derived from the operational tables."""

    ACQUISITION = "acquisition"        # bought; establishes the original cost
    CAPITALISATION = "capitalisation"  # placed in service; depreciation starts
    IMPROVEMENT = "improvement"        # capital work that adds to the basis
    REVALUATION = "revaluation"        # basis restated upward
    IMPAIRMENT = "impairment"          # basis written down
    TRANSFER = "transfer"              # moved between locations or facilities
    DISPOSAL = "disposal"              # sold, scrapped, or traded in
    WRITE_OFF = "write_off"            # removed with no proceeds
    REVERSAL = "reversal"              # corrects an earlier entry


LEDGER_ENTRY_TYPES: tuple[str, ...] = tuple(e.value for e in LedgerEntryType)

# Entry types that move the depreciable basis. Everything else is a record of
# something that happened without changing what there is left to depreciate.
BASIS_AFFECTING: frozenset[str] = frozenset({
    LedgerEntryType.ACQUISITION.value,
    LedgerEntryType.IMPROVEMENT.value,
    LedgerEntryType.REVALUATION.value,
    LedgerEntryType.IMPAIRMENT.value,
    LedgerEntryType.REVERSAL.value,
})

# Entry types after which the asset is no longer depreciated.
TERMINAL: frozenset[str] = frozenset({
    LedgerEntryType.DISPOSAL.value,
    LedgerEntryType.WRITE_OFF.value,
})


class DepreciationMethod(str, enum.Enum):
    """Book methods. Tax depreciation (MACRS in the US) is a separate schedule
    kept by finance and deliberately not modelled here — a maintenance system
    that offered a tax number would be offering an opinion it is not qualified
    to have."""

    STRAIGHT_LINE = "straight_line"
    DECLINING_BALANCE = "declining_balance"          # 150% declining
    DOUBLE_DECLINING = "double_declining"            # 200% declining
    SUM_OF_YEARS_DIGITS = "sum_of_years_digits"
    # For assets whose life is measured in hours rather than years — a
    # generator is the obvious case, and it is why runtime readings exist.
    UNITS_OF_PRODUCTION = "units_of_production"
    NONE = "none"                                    # land, or fully expensed


DEPRECIATION_METHODS: tuple[str, ...] = tuple(m.value for m in DepreciationMethod)


# Typical book lives in years, by discipline code. Seeded onto an asset when it
# is created so nobody types a useful life four hundred times; always
# overridable, and finance will have opinions about some of them.
DEFAULT_USEFUL_LIFE_YEARS: dict[str, int] = {
    "vertical_transport": 20,     # elevators, escalators
    "mechanical": 20,             # boilers, compressors, pumps
    "hvac": 15,                   # chillers, air handlers, AC units
    "electrical": 20,             # switchgear, generators, transfer switches
    "plumbing": 20,
    "fire_life_safety": 15,
    "medical_gas": 20,
    "building_envelope": 25,
    "it_low_voltage": 7,
    "biomedical": 7,              # clinical equipment turns over faster
}
FALLBACK_USEFUL_LIFE_YEARS = 10


class AssetLedgerEntry(Base):
    __tablename__ = "asset_ledger_entries"
    __table_args__ = (
        Index("ix_ledger_equipment_date", "equipment_id", "effective_date"),
        Index("ix_ledger_facility_type_date", "facility_id", "entry_type", "effective_date"),
    )

    id = Column(Integer, primary_key=True, index=True)
    facility_id = Column(Integer, ForeignKey("facilities.id", ondelete="CASCADE"), nullable=False, index=True)
    equipment_id = Column(Integer, ForeignKey("equipment.id", ondelete="CASCADE"), nullable=False, index=True)

    entry_type = Column(String(32), nullable=False, index=True)
    # The date the event actually happened, which is what depreciation and any
    # period report key off. Distinct from `created_at`, the date somebody got
    # round to recording it — an improvement completed in March and entered in
    # June depreciates from March.
    effective_date = Column(Date, nullable=False, index=True)

    description = Column(String(255), nullable=False)
    # Positive adds to the basis, negative reduces it. Signed rather than a
    # separate direction column because every consumer wants to sum it.
    amount = Column(Numeric(14, 2), nullable=True)

    # Disposal only.
    proceeds = Column(Numeric(14, 2), nullable=True)
    # Book value minus proceeds at disposal, banked at the time rather than
    # recomputed: the schedule it was derived from may later be edited, and a
    # realised gain or loss is a historical fact.
    gain_loss = Column(Numeric(14, 2), nullable=True)

    # Transfer only. Both sides kept so the move reads in one row.
    from_location_id = Column(Integer, ForeignKey("locations.id", ondelete="SET NULL"), nullable=True)
    to_location_id = Column(Integer, ForeignKey("locations.id", ondelete="SET NULL"), nullable=True)
    from_facility_id = Column(Integer, ForeignKey("facilities.id", ondelete="SET NULL"), nullable=True)
    to_facility_id = Column(Integer, ForeignKey("facilities.id", ondelete="SET NULL"), nullable=True)

    # An improvement can extend the life it is improving — a re-roof or a lift
    # modernisation is the classic case. Applied from the entry's effective date
    # forward, never retroactively.
    extends_useful_life_years = Column(Numeric(5, 2), nullable=True)

    reference = Column(String(128), nullable=True)      # PO, invoice, disposal certificate
    vendor_id = Column(Integer, ForeignKey("vendors.id", ondelete="SET NULL"), nullable=True)
    work_order_id = Column(Integer, ForeignKey("service_requests.id", ondelete="SET NULL"), nullable=True)

    # A reversal points at what it corrects. Corrections are posted, not edited,
    # because a financial row an auditor cannot rely on is not worth keeping.
    reverses_entry_id = Column(Integer, ForeignKey("asset_ledger_entries.id", ondelete="SET NULL"), nullable=True)
    is_reversed = Column(Boolean, nullable=False, default=False)

    notes = Column(Text, nullable=True)
    created_by_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    facility = relationship("Facility", foreign_keys=[facility_id])
    equipment = relationship("Equipment", back_populates="ledger_entries")
    from_location = relationship("Location", foreign_keys=[from_location_id])
    to_location = relationship("Location", foreign_keys=[to_location_id])
    vendor = relationship("Vendor")
    work_order = relationship("ServiceRequest")
    reverses = relationship("AssetLedgerEntry", remote_side=[id])

    @property
    def affects_basis(self) -> bool:
        return self.entry_type in BASIS_AFFECTING and not self.is_reversed

    @property
    def is_terminal(self) -> bool:
        return self.entry_type in TERMINAL and not self.is_reversed
