"""The arithmetic of a lease-to-own agreement.

Pure functions over Decimal: no database, no Square, no clock that was not
passed in. Everything that decides what a customer owes lives here, so it can
be tested to the cent in isolation and so the staff screen, the customer
portal and the billing job can never compute it three different ways.

The model, as agreed:

  * Lease price is the cash price plus a markup percentage, fixed up front.
    No interest, nothing compounds.
  * A down payment, if any, is applied to the cash price first.
  * What is left of the cash price, and the whole markup, are each split
    evenly across the installments. The last installment absorbs the rounding
    so the schedule always sums to the exact figure that was disclosed.
  * Sales tax is charged on each payment as it falls due, at the agreement's
    rate. Late fees are not taxed.
  * Early buyout costs the unpaid cash price only. The markup that has not
    yet been earned is waived; that is the point of paying early.

Every amount is rounded half-up to the cent, the way a receipt is.
"""
from __future__ import annotations

import calendar
from dataclasses import dataclass
from datetime import date, timedelta
from decimal import ROUND_HALF_UP, Decimal
from typing import Iterable, Sequence

CENT = Decimal("0.01")
ZERO = Decimal("0.00")
HUNDRED = Decimal("100")

FREQUENCIES = ("weekly", "biweekly", "monthly", "quarterly")
MIN_INSTALLMENTS = 1
MAX_INSTALLMENTS = 120
MAX_MARKUP_PERCENT = Decimal("200")
MAX_TAX_PERCENT = Decimal("25")


def money(value: object) -> Decimal:
    """A cent-exact Decimal. Anything empty is zero; floats go via str."""
    if value is None or value == "":
        return ZERO
    if isinstance(value, Decimal):
        return value.quantize(CENT, rounding=ROUND_HALF_UP)
    return Decimal(str(value)).quantize(CENT, rounding=ROUND_HALF_UP)


def percent_of(amount: Decimal, percent: Decimal) -> Decimal:
    return money(money(amount) * Decimal(str(percent)) / HUNDRED)


def split_evenly(amount: Decimal, parts: int) -> list[Decimal]:
    """Split into `parts` cent-exact pieces that sum to exactly `amount`.

    Every piece is the rounded share except the last, which takes whatever
    is left. That keeps the visible installments equal and the total honest.
    """
    if parts < 1:
        raise ValueError("parts must be at least 1")
    amount = money(amount)
    share = money(amount / parts)
    pieces = [share] * (parts - 1)
    pieces.append(amount - share * (parts - 1))
    return pieces


# ── Dates ────────────────────────────────────────────────────────────────────

def _add_months(anchor: date, months: int) -> date:
    """Anchor-based, so 31 Jan -> 28 Feb -> 31 Mar rather than drifting to 28."""
    month_index = anchor.month - 1 + months
    year = anchor.year + month_index // 12
    month = month_index % 12 + 1
    day = min(anchor.day, calendar.monthrange(year, month)[1])
    return date(year, month, day)


def due_date_for(first_due: date, index: int, frequency: str) -> date:
    """Due date of installment `index`, counting from 1."""
    if frequency not in FREQUENCIES:
        raise ValueError("Unsupported frequency: {}".format(frequency))
    step = index - 1
    if frequency == "weekly":
        return first_due + timedelta(days=7 * step)
    if frequency == "biweekly":
        return first_due + timedelta(days=14 * step)
    if frequency == "quarterly":
        return _add_months(first_due, 3 * step)
    return _add_months(first_due, step)


# ── Terms and the schedule they produce ──────────────────────────────────────

@dataclass(frozen=True)
class LeaseTerms:
    cash_price: Decimal                 # pre-tax price of everything being leased
    markup_percent: Decimal
    down_payment: Decimal
    installment_count: int
    tax_rate_percent: Decimal
    frequency: str
    first_due_date: date


@dataclass(frozen=True)
class ScheduledInstallment:
    number: int
    due_date: date
    principal: Decimal                  # share of the cash price
    markup: Decimal                     # share of the markup
    amount: Decimal                     # principal + markup, before tax
    tax: Decimal
    total: Decimal                      # what the customer is actually charged


@dataclass(frozen=True)
class LeaseQuote:
    cash_price: Decimal
    markup_percent: Decimal
    markup_amount: Decimal
    lease_price: Decimal                # cash price + markup, before tax
    down_payment: Decimal
    down_payment_tax: Decimal
    down_payment_total: Decimal
    financed_amount: Decimal            # lease price - down payment, before tax
    installment_count: int
    frequency: str
    tax_rate_percent: Decimal
    installments: tuple[ScheduledInstallment, ...]
    total_tax: Decimal
    total_of_payments: Decimal          # down payment + every installment, with tax
    regular_installment: Decimal        # the figure a customer will recognise

    @property
    def final_due_date(self) -> date:
        return self.installments[-1].due_date


def validate_terms(terms: LeaseTerms) -> list[str]:
    """Every reason these terms cannot be offered, in plain language.

    An empty list means they are sound. The API turns a non-empty one into a
    422, so nothing downstream ever has to cope with nonsense terms.
    """
    problems: list[str] = []
    cash = money(terms.cash_price)
    if cash <= ZERO:
        problems.append("The cash price must be more than zero.")
    markup = Decimal(str(terms.markup_percent))
    if markup < 0:
        problems.append("The markup cannot be negative.")
    elif markup > MAX_MARKUP_PERCENT:
        problems.append("The markup cannot exceed {}%.".format(MAX_MARKUP_PERCENT))
    down = money(terms.down_payment)
    if down < ZERO:
        problems.append("The down payment cannot be negative.")
    elif cash > ZERO and down >= cash:
        # Anything at or above the cash price leaves nothing to lease; that is
        # a sale, and Sales already handles it.
        problems.append("The down payment must be less than the cash price.")
    if not MIN_INSTALLMENTS <= int(terms.installment_count) <= MAX_INSTALLMENTS:
        problems.append("The number of installments must be between {} and {}.".format(
            MIN_INSTALLMENTS, MAX_INSTALLMENTS))
    tax = Decimal(str(terms.tax_rate_percent))
    if tax < 0 or tax > MAX_TAX_PERCENT:
        problems.append("The tax rate must be between 0% and {}%.".format(MAX_TAX_PERCENT))
    if terms.frequency not in FREQUENCIES:
        problems.append("The payment frequency must be one of: {}.".format(", ".join(FREQUENCIES)))
    return problems


def build_schedule(terms: LeaseTerms) -> LeaseQuote:
    problems = validate_terms(terms)
    if problems:
        raise ValueError(" ".join(problems))

    cash = money(terms.cash_price)
    markup_percent = Decimal(str(terms.markup_percent))
    tax_rate = Decimal(str(terms.tax_rate_percent))
    markup_amount = percent_of(cash, markup_percent)
    lease_price = cash + markup_amount
    down = money(terms.down_payment)
    count = int(terms.installment_count)

    # The down payment comes off the cash price, so the markup is spread over
    # the installments untouched and the buyout figure is simply the cash
    # price still outstanding.
    principals = split_evenly(cash - down, count)
    markups = split_evenly(markup_amount, count)

    installments = []
    for index in range(1, count + 1):
        principal = principals[index - 1]
        markup_share = markups[index - 1]
        amount = principal + markup_share
        tax = percent_of(amount, tax_rate)
        installments.append(ScheduledInstallment(
            number=index,
            due_date=due_date_for(terms.first_due_date, index, terms.frequency),
            principal=principal,
            markup=markup_share,
            amount=amount,
            tax=tax,
            total=amount + tax,
        ))

    down_tax = percent_of(down, tax_rate)
    total_tax = down_tax + sum((i.tax for i in installments), ZERO)
    return LeaseQuote(
        cash_price=cash,
        markup_percent=markup_percent,
        markup_amount=markup_amount,
        lease_price=lease_price,
        down_payment=down,
        down_payment_tax=down_tax,
        down_payment_total=down + down_tax,
        financed_amount=lease_price - down,
        installment_count=count,
        frequency=terms.frequency,
        tax_rate_percent=tax_rate,
        installments=tuple(installments),
        total_tax=total_tax,
        total_of_payments=down + down_tax + sum((i.total for i in installments), ZERO),
        regular_installment=installments[0].total,
    )


# ── Progress, late fees and default ──────────────────────────────────────────

@dataclass(frozen=True)
class InstallmentState:
    """One installment as it stands today, from its stored row and invoice."""
    number: int
    due_date: date
    principal: Decimal
    markup: Decimal
    total: Decimal
    amount_paid: Decimal = ZERO         # paid on its invoice, tax included
    invoiced: bool = False
    cancelled: bool = False             # superseded, e.g. by a buyout

    @property
    def outstanding(self) -> Decimal:
        if self.cancelled:
            return ZERO
        return max(money(self.total) - money(self.amount_paid), ZERO)

    @property
    def is_paid(self) -> bool:
        return not self.cancelled and self.outstanding == ZERO

    @property
    def paid_fraction(self) -> Decimal:
        total = money(self.total)
        if total <= ZERO:
            return Decimal("1")
        return min(Decimal("1"), money(self.amount_paid) / total)


def is_missed(state: InstallmentState, today: date, grace_days: int) -> bool:
    """Past its due date plus the grace period, and still not paid in full."""
    if state.cancelled or state.is_paid:
        return False
    return today > state.due_date + timedelta(days=max(0, int(grace_days)))


def missed_installments(
    states: Iterable[InstallmentState], today: date, grace_days: int,
) -> list[InstallmentState]:
    return [s for s in states if is_missed(s, today, grace_days)]


def should_default(
    states: Iterable[InstallmentState], today: date, grace_days: int, default_after: int,
) -> bool:
    """Default once this many installments are missed at the same time.

    Counting what is outstanding right now, not what was ever late, means a
    customer who catches up is no longer in default.
    """
    if default_after < 1:
        return False
    return len(missed_installments(states, today, grace_days)) >= default_after


def all_paid(states: Sequence[InstallmentState]) -> bool:
    live = [s for s in states if not s.cancelled]
    return bool(live) and all(s.is_paid for s in live)


# ── Early buyout ─────────────────────────────────────────────────────────────

@dataclass(frozen=True)
class BuyoutQuote:
    remaining_principal: Decimal        # unpaid cash price
    waived_markup: Decimal              # the markup the customer no longer owes
    tax: Decimal
    outstanding_fees: Decimal           # late fees still unpaid
    total: Decimal
    installments_covered: tuple[int, ...]


def buyout_quote(
    states: Sequence[InstallmentState],
    tax_rate_percent: Decimal,
    outstanding_fees: Decimal = ZERO,
) -> BuyoutQuote:
    """What it costs to own the item outright today.

    The unpaid share of the cash price, plus tax on it, plus any late fees
    already owed. A partly paid installment counts in proportion to what was
    paid against it, tax included, so a customer is never charged twice for
    the same slice of the price.
    """
    remaining_principal = ZERO
    waived = ZERO
    covered: list[int] = []
    for state in states:
        if state.cancelled or state.is_paid:
            continue
        unpaid = Decimal("1") - state.paid_fraction
        remaining_principal += money(money(state.principal) * unpaid)
        waived += money(money(state.markup) * unpaid)
        covered.append(state.number)

    tax = percent_of(remaining_principal, Decimal(str(tax_rate_percent)))
    fees = money(outstanding_fees)
    return BuyoutQuote(
        remaining_principal=remaining_principal,
        waived_markup=waived,
        tax=tax,
        outstanding_fees=fees,
        total=remaining_principal + tax + fees,
        installments_covered=tuple(covered),
    )
