from typing import Any, Dict, List, Optional
from datetime import date, datetime
from decimal import Decimal

from pydantic import BaseModel, Field, field_validator

from app.models.asset_ledger import DEPRECIATION_METHODS, LEDGER_ENTRY_TYPES


class LedgerEntryCreate(BaseModel):
    equipment_id: int
    entry_type: str
    # The date the event happened, not the date it was recorded. An improvement
    # completed in March and entered in June depreciates from March.
    effective_date: date
    description: str = Field(min_length=1, max_length=255)
    amount: Optional[Decimal] = None
    proceeds: Optional[Decimal] = None
    from_location_id: Optional[int] = None
    to_location_id: Optional[int] = None
    to_facility_id: Optional[int] = None
    extends_useful_life_years: Optional[Decimal] = None
    reference: Optional[str] = None
    vendor_id: Optional[int] = None
    work_order_id: Optional[int] = None
    notes: Optional[str] = None

    @field_validator("entry_type")
    @classmethod
    def _known_type(cls, value: str) -> str:
        if value not in LEDGER_ENTRY_TYPES:
            raise ValueError(
                f"Unknown entry type '{value}'. Allowed: {', '.join(LEDGER_ENTRY_TYPES)}"
            )
        return value


class LedgerEntryReverse(BaseModel):
    """Corrections are posted, not edited.

    A financial row an auditor can see was rewritten is a row they cannot rely
    on, so the original stays and a reversing entry is posted against it.
    """

    reason: str = Field(min_length=1, max_length=255)


class LedgerEntry(BaseModel):
    id: int
    facility_id: int
    equipment_id: int
    entry_type: str
    effective_date: date
    description: str
    amount: Optional[Decimal] = None
    proceeds: Optional[Decimal] = None
    gain_loss: Optional[Decimal] = None
    from_location_id: Optional[int] = None
    to_location_id: Optional[int] = None
    extends_useful_life_years: Optional[Decimal] = None
    reference: Optional[str] = None
    vendor_id: Optional[int] = None
    work_order_id: Optional[int] = None
    reverses_entry_id: Optional[int] = None
    is_reversed: bool
    notes: Optional[str] = None
    created_by_id: Optional[int] = None
    created_at: datetime

    class Config:
        from_attributes = True


class LedgerEntryListResponse(BaseModel):
    items: List[LedgerEntry]
    total: int


class PeriodRow(BaseModel):
    year: int
    opening_book_value: Decimal
    depreciation: Decimal
    accumulated: Decimal
    closing_book_value: Decimal
    # Non-zero where an improvement or impairment landed in this year, so a
    # reader can see why the curve bends.
    basis_change: Decimal = Decimal("0")
    note: str = ""


class Depreciation(BaseModel):
    method: str
    cost: Decimal
    salvage_value: Decimal
    useful_life_years: Decimal
    in_service_date: Optional[date] = None
    as_of: date
    depreciable_amount: Decimal
    accumulated_depreciation: Decimal
    net_book_value: Decimal
    annual_depreciation: Decimal
    monthly_depreciation: Decimal
    months_elapsed: int
    months_remaining: int
    percent_depreciated: float
    is_fully_depreciated: bool
    schedule: List[PeriodRow] = []
    # Says why a figure is missing rather than returning a silent zero, which
    # reads identically to an asset that cost nothing.
    message: Optional[str] = None


class ServiceSpend(BaseModel):
    completed_work_orders: int
    corrective_count: int
    preventive_count: int
    total_service_cost: Decimal
    total_labour_hours: Decimal


class TimelineEvent(BaseModel):
    kind: str
    occurred_on: Optional[date] = None
    title: str
    detail: Optional[str] = None
    amount: Optional[Decimal] = None
    reference: Optional[str] = None
    source: Optional[str] = None
    source_id: Optional[int] = None
    outcome: Optional[str] = None


class AssetLedgerSummary(BaseModel):
    equipment_id: int
    asset_tag: Optional[str] = None
    in_service_date: Optional[date] = None
    disposed_on: Optional[date] = None
    age_months: Optional[int] = None
    depreciation: Depreciation
    service: ServiceSpend
    # An asset whose cumulative repair cost approaches its original cost is
    # telling you something the depreciation schedule cannot.
    service_cost_as_percent_of_cost: Optional[float] = None
    ledger_entry_count: int


class AssetLedger(BaseModel):
    summary: AssetLedgerSummary
    timeline: List[TimelineEvent]
    entries: List[LedgerEntry]


class DisciplineValuation(BaseModel):
    asset_count: int
    cost: Decimal
    accumulated_depreciation: Decimal
    net_book_value: Decimal


class FleetValuation(BaseModel):
    as_of: date
    asset_count: int
    total_cost: Decimal
    accumulated_depreciation: Decimal
    net_book_value: Decimal
    # Kit still in service with no book value left is kit whose replacement
    # nobody has budgeted for.
    fully_depreciated_count: int
    by_discipline: Dict[str, DisciplineValuation]


class LedgerMeta(BaseModel):
    entry_types: List[Dict[str, str]]
    depreciation_methods: List[Dict[str, str]]
    default_useful_life_years: Dict[str, int]
