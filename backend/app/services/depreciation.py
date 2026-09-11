"""Book depreciation, computed rather than stored.

A depreciation schedule is a pure function of five inputs — cost, salvage,
life, method and in-service date — plus any basis changes posted against the
asset. Persisting the derived rows would mean a table that silently disagrees
with its inputs the first time somebody corrects a useful life, so nothing here
is written down. The schedule is generated on request and is always consistent
with what it was generated from.

Two things this deliberately does not do:

  * **Tax depreciation.** MACRS is finance's schedule, kept on finance's terms.
    A maintenance system offering a tax figure would be offering an opinion it
    is not qualified to have.
  * **Fractional-period conventions.** Half-year and mid-quarter conventions
    are tax constructs. Book depreciation here runs monthly from the in-service
    date, which is what a fixed-asset register actually shows.

Every figure is rounded to cents only at the end. Rounding each period and
summing produces a book value that drifts from cost minus accumulated by a few
cents over a twenty-year life, and somebody eventually files a ticket about it.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date
from decimal import Decimal, ROUND_HALF_UP

from app.models.asset_ledger import (
    DEFAULT_USEFUL_LIFE_YEARS, FALLBACK_USEFUL_LIFE_YEARS, DepreciationMethod,
)
from app.utils.clock import utc_today

_CENTS = Decimal("0.01")
MONTHS_PER_YEAR = 12


def _money(value) -> Decimal:
    return Decimal(str(value or 0)).quantize(_CENTS, rounding=ROUND_HALF_UP)


def default_useful_life(discipline_code: str | None) -> int:
    """A sensible book life for the trade, so nobody types one per asset."""
    if not discipline_code:
        return FALLBACK_USEFUL_LIFE_YEARS
    return DEFAULT_USEFUL_LIFE_YEARS.get(discipline_code, FALLBACK_USEFUL_LIFE_YEARS)


def months_between(start: date, end: date) -> int:
    """Completed months from `start` to `end`.

    Monthly-close semantics: depreciation for a month is recognised once that
    month ends. An asset placed in service on 15 January has January charged in
    full — the whole-month convention, rather than pro-rating by day, which is
    a tax nicety that makes book figures disagree with the general ledger — but
    that charge lands on 1 February, not on 16 January.

    The alternative, counting the month in progress as already complete, makes
    an asset show thirteen months of depreciation on its first anniversary.
    That is off by one against every fixed-asset register there is.
    """
    if end < start:
        return 0
    return (end.year - start.year) * MONTHS_PER_YEAR + (end.month - start.month)


@dataclass
class BasisChange:
    """A posted event that moves the depreciable basis."""

    effective_date: date
    amount: Decimal
    extends_life_years: Decimal = Decimal("0")
    description: str = ""


@dataclass
class PeriodRow:
    year: int
    opening_book_value: Decimal
    depreciation: Decimal
    accumulated: Decimal
    closing_book_value: Decimal
    # Set where an improvement or impairment landed in this year, so a reader
    # can see why the curve bends.
    basis_change: Decimal = Decimal("0")
    note: str = ""


@dataclass
class DepreciationResult:
    method: str
    cost: Decimal
    salvage_value: Decimal
    useful_life_years: Decimal
    in_service_date: date | None
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
    schedule: list[PeriodRow] = field(default_factory=list)
    # Says why a figure is missing rather than returning a silent zero, which
    # reads identically to "this asset cost nothing".
    message: str | None = None


def _straight_line_annual(depreciable: Decimal, life_years: Decimal) -> Decimal:
    if life_years <= 0:
        return Decimal("0")
    return depreciable / life_years


def _declining_rate(method: str, life_years: Decimal) -> Decimal:
    if life_years <= 0:
        return Decimal("0")
    factor = Decimal("2") if method == DepreciationMethod.DOUBLE_DECLINING.value else Decimal("1.5")
    return factor / life_years


def compute(
    *,
    cost,
    salvage_value=None,
    useful_life_years=None,
    method: str = DepreciationMethod.STRAIGHT_LINE.value,
    in_service_date: date | None,
    as_of: date | None = None,
    basis_changes: list[BasisChange] | None = None,
    units_used: Decimal | None = None,
    total_expected_units: Decimal | None = None,
    disposed_on: date | None = None,
) -> DepreciationResult:
    """Full schedule and current position for one asset.

    Refuses rather than guesses when a required input is missing: an asset with
    no cost or no in-service date has no book value, and reporting zero would be
    indistinguishable from an asset that is fully written down.
    """
    as_of = as_of or utc_today()
    # Depreciation stops the day an asset leaves. Continuing past disposal is a
    # classic register bug that quietly understates the fleet.
    if disposed_on and disposed_on < as_of:
        as_of = disposed_on

    cost_d = _money(cost)
    salvage_d = _money(salvage_value)
    life = Decimal(str(useful_life_years or 0))
    changes = sorted(basis_changes or [], key=lambda c: c.effective_date)

    empty = DepreciationResult(
        method=method, cost=cost_d, salvage_value=salvage_d, useful_life_years=life,
        in_service_date=in_service_date, as_of=as_of,
        depreciable_amount=Decimal("0"), accumulated_depreciation=Decimal("0"),
        net_book_value=cost_d, annual_depreciation=Decimal("0"),
        monthly_depreciation=Decimal("0"), months_elapsed=0, months_remaining=0,
        percent_depreciated=0.0, is_fully_depreciated=False,
    )

    if method == DepreciationMethod.NONE.value:
        empty.message = "This asset is not depreciated."
        return empty
    if cost_d <= 0:
        empty.message = "No acquisition cost recorded, so no book value can be computed."
        return empty
    if in_service_date is None:
        empty.message = (
            "No in-service date recorded. Set the installation date to start depreciation."
        )
        return empty
    if life <= 0:
        empty.message = "No useful life recorded, so no book value can be computed."
        return empty

    if method == DepreciationMethod.UNITS_OF_PRODUCTION.value:
        return _units_of_production(
            cost_d, salvage_d, units_used, total_expected_units,
            in_service_date, as_of, life, empty,
        )

    # Walk year by year from the in-service date. A loop rather than a closed
    # form because improvements, impairments and life extensions all land mid-
    # schedule and change what the following years look like.
    schedule: list[PeriodRow] = []
    basis = cost_d
    accumulated = Decimal("0")
    remaining_life = life
    year_start = in_service_date
    # Guard against a nonsensical life turning this into an infinite loop.
    max_periods = int(life) + 60

    for index in range(max_periods):
        if remaining_life <= 0:
            break

        year_end = date(
            year_start.year + 1, year_start.month, 1,
        ) if year_start.month != 1 or year_start.day != 1 else date(year_start.year + 1, 1, 1)

        applied_change = Decimal("0")
        note_parts: list[str] = []
        for change in changes:
            if year_start <= change.effective_date < year_end:
                basis += _money(change.amount)
                applied_change += _money(change.amount)
                if change.extends_life_years:
                    remaining_life += Decimal(str(change.extends_life_years))
                    note_parts.append(
                        f"life extended by {change.extends_life_years} yr"
                    )
                if change.description:
                    note_parts.append(change.description)

        book_value = basis - accumulated
        depreciable_now = book_value - salvage_d
        if depreciable_now < 0:
            depreciable_now = Decimal("0")

        if method == DepreciationMethod.STRAIGHT_LINE.value:
            charge = _straight_line_annual(depreciable_now, remaining_life)
        elif method in {
            DepreciationMethod.DECLINING_BALANCE.value,
            DepreciationMethod.DOUBLE_DECLINING.value,
        }:
            charge = book_value * _declining_rate(method, remaining_life)
            # Declining balance never reaches salvage on its own; registers
            # switch to straight line once that is the larger charge, which is
            # what makes the asset actually finish.
            straight = _straight_line_annual(depreciable_now, remaining_life)
            charge = max(charge, straight)
        elif method == DepreciationMethod.SUM_OF_YEARS_DIGITS.value:
            years_left = int(remaining_life)
            digits = Decimal(str(years_left * (years_left + 1) // 2)) if years_left > 0 else Decimal("0")
            charge = (
                depreciable_now * Decimal(str(years_left)) / digits if digits > 0 else Decimal("0")
            )
        else:
            charge = _straight_line_annual(depreciable_now, remaining_life)

        # Never depreciate below salvage.
        charge = min(charge, depreciable_now)
        if charge < 0:
            charge = Decimal("0")

        schedule.append(PeriodRow(
            year=year_start.year,
            opening_book_value=_money(book_value),
            depreciation=_money(charge),
            accumulated=_money(accumulated + charge),
            closing_book_value=_money(book_value - charge),
            basis_change=_money(applied_change),
            note="; ".join(note_parts),
        ))

        accumulated += charge
        remaining_life -= 1
        year_start = year_end

        if basis - accumulated <= salvage_d:
            break

    # Position as of the requested date: full years from the schedule, plus the
    # month-by-month share of the year in progress.
    months_elapsed = months_between(in_service_date, as_of)
    total_months = int(life * MONTHS_PER_YEAR)

    accumulated_to_date = Decimal("0")
    completed_years = 0
    for row in schedule:
        year_ends = date(in_service_date.year + completed_years + 1, in_service_date.month, 1)
        if year_ends <= as_of:
            accumulated_to_date += row.depreciation
            completed_years += 1
        else:
            months_into_year = months_between(
                date(in_service_date.year + completed_years, in_service_date.month, 1), as_of,
            )
            months_into_year = max(0, min(MONTHS_PER_YEAR, months_into_year))
            accumulated_to_date += row.depreciation * Decimal(months_into_year) / Decimal(MONTHS_PER_YEAR)
            break

    total_basis = basis
    accumulated_to_date = min(accumulated_to_date, total_basis - salvage_d)
    if accumulated_to_date < 0:
        accumulated_to_date = Decimal("0")

    net_book_value = total_basis - accumulated_to_date
    depreciable_amount = total_basis - salvage_d
    annual = schedule[0].depreciation if schedule else Decimal("0")

    return DepreciationResult(
        method=method,
        cost=cost_d,
        salvage_value=salvage_d,
        useful_life_years=life,
        in_service_date=in_service_date,
        as_of=as_of,
        depreciable_amount=_money(depreciable_amount),
        accumulated_depreciation=_money(accumulated_to_date),
        net_book_value=_money(net_book_value),
        annual_depreciation=_money(annual),
        monthly_depreciation=_money(annual / MONTHS_PER_YEAR) if annual else Decimal("0"),
        months_elapsed=months_elapsed,
        months_remaining=max(0, total_months - months_elapsed),
        percent_depreciated=(
            float(accumulated_to_date / depreciable_amount * 100) if depreciable_amount > 0 else 0.0
        ),
        is_fully_depreciated=net_book_value <= salvage_d,
        schedule=schedule,
    )


def _units_of_production(
    cost: Decimal, salvage: Decimal, units_used, total_units,
    in_service_date: date, as_of: date, life: Decimal, empty: DepreciationResult,
) -> DepreciationResult:
    """Depreciate on hours run rather than time elapsed.

    The reason this method is here at all: a standby generator that has run
    forty hours in six years is not six years' worth of worn out, and a
    calendar schedule says it is.
    """
    if not total_units or Decimal(str(total_units)) <= 0:
        empty.message = (
            "Units-of-production needs a total expected output (for a generator, "
            "its rated service hours)."
        )
        return empty

    total = Decimal(str(total_units))
    used = Decimal(str(units_used or 0))
    depreciable = cost - salvage
    rate = depreciable / total
    accumulated = min(rate * used, depreciable)
    net = cost - accumulated

    return DepreciationResult(
        method=DepreciationMethod.UNITS_OF_PRODUCTION.value,
        cost=cost, salvage_value=salvage, useful_life_years=life,
        in_service_date=in_service_date, as_of=as_of,
        depreciable_amount=_money(depreciable),
        accumulated_depreciation=_money(accumulated),
        net_book_value=_money(net),
        # There is no annual figure: consumption, not time, drives this.
        annual_depreciation=Decimal("0"),
        monthly_depreciation=Decimal("0"),
        months_elapsed=months_between(in_service_date, as_of),
        months_remaining=0,
        percent_depreciated=float(accumulated / depreciable * 100) if depreciable > 0 else 0.0,
        is_fully_depreciated=net <= salvage,
        schedule=[],
        message=(
            f"{used:g} of {total:g} units consumed "
            f"({rate.quantize(_CENTS)} per unit)."
        ),
    )


def gain_or_loss_on_disposal(net_book_value, proceeds) -> Decimal:
    """Positive is a gain, negative a loss. Banked at disposal rather than
    recomputed, because the schedule it came from may later be edited and a
    realised result is a historical fact."""
    return _money(Decimal(str(proceeds or 0)) - Decimal(str(net_book_value or 0)))
