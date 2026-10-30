"""The arithmetic of lease-to-own, to the cent.

These are the numbers a customer signs up to and is charged. Each headline
case is a worked example that can be checked with a calculator, written out
in the comment above it, so a reviewer does not have to trust the code to
trust the test.

    python backend/tests/test_lease_math.py
"""
from __future__ import annotations

import pathlib
import sys
from datetime import date
from decimal import Decimal as D

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))

from app.utils.lease_math import (  # noqa: E402
    InstallmentState, LeaseTerms, all_paid, build_schedule, buyout_quote, due_date_for,
    is_missed, missed_installments, money, should_default, split_evenly, validate_terms,
)

failures: list[str] = []


def ok(label: str, condition: bool, detail: str = "") -> None:
    print("{}  {}{}".format("PASS" if condition else "FAIL", label,
                            "  " + detail if detail else ""))
    if not condition:
        failures.append(label)


def terms(**over) -> LeaseTerms:
    base = dict(cash_price=D("10000"), markup_percent=D("15"), down_payment=D("1000"),
                installment_count=12, tax_rate_percent=D("8.25"), frequency="monthly",
                first_due_date=date(2026, 11, 1))
    base.update(over)
    return LeaseTerms(**base)


print("Lease math")
print("=" * 72)

print()
print("The headline example")
print("-" * 72)
# Cash price $10,000, 15% markup, $1,000 down, 12 monthly payments, 8.25% tax.
#   markup        = 10,000 x 15%            = 1,500.00
#   lease price   = 10,000 + 1,500          = 11,500.00
#   principal     = (10,000 - 1,000) / 12   =    750.00 each
#   markup share  = 1,500 / 12              =    125.00 each
#   pre-tax       = 750 + 125               =    875.00 each
#   tax           = 875 x 8.25% = 72.1875   =     72.19 each
#   installment   = 875 + 72.19             =    947.19
#   down payment  = 1,000 + 82.50 tax       =  1,082.50
#   total tax     = 82.50 + 12 x 72.19      =    948.78
#   all payments  = 1,082.50 + 12 x 947.19  = 12,448.78  (= 11,500 + 948.78)
q = build_schedule(terms())
ok("markup is 15% of the cash price", q.markup_amount == D("1500.00"), str(q.markup_amount))
ok("lease price is cash price plus markup", q.lease_price == D("11500.00"), str(q.lease_price))
ok("the down payment comes off the cash price, leaving 750.00 principal a month",
   all(i.principal == D("750.00") for i in q.installments))
ok("the markup is spread evenly, 125.00 a month",
   all(i.markup == D("125.00") for i in q.installments))
ok("tax is charged on each payment: 72.19", all(i.tax == D("72.19") for i in q.installments),
   str(q.installments[0].tax))
ok("each installment is 947.19", q.regular_installment == D("947.19"), str(q.regular_installment))
ok("the down payment carries its own tax: 1,082.50",
   q.down_payment_total == D("1082.50"), str(q.down_payment_total))
ok("total tax is 948.78", q.total_tax == D("948.78"), str(q.total_tax))
ok("everything the customer pays is 12,448.78", q.total_of_payments == D("12448.78"),
   str(q.total_of_payments))
ok("  which is exactly the lease price plus the tax",
   q.total_of_payments == q.lease_price + q.total_tax)
ok("the amount financed is lease price less the down payment",
   q.financed_amount == D("10500.00"), str(q.financed_amount))
ok("there are 12 installments", len(q.installments) == 12)
ok("the last falls due a year on, less a month", q.final_due_date == date(2027, 10, 1),
   str(q.final_due_date))

print()
print("Rounding never loses or invents a cent")
print("-" * 72)
# $1,000 at 10% over 3: principal 333.33 + 333.33 + 333.34, markup 33.33 +
# 33.33 + 33.34. The last installment takes the odd cent so the total is
# exactly the 1,100.00 that was disclosed.
q3 = build_schedule(terms(cash_price=D("1000"), markup_percent=D("10"),
                          down_payment=D("0"), installment_count=3))
ok("principal sums back to the cash price exactly",
   sum(i.principal for i in q3.installments) == D("1000.00"),
   str([str(i.principal) for i in q3.installments]))
ok("markup sums back to the markup exactly",
   sum(i.markup for i in q3.installments) == D("100.00"))
ok("the visible installments are equal and the last absorbs the cent",
   q3.installments[0].amount == q3.installments[1].amount == D("366.66")
   and q3.installments[2].amount == D("366.68"))
ok("split_evenly sums exactly for an awkward amount",
   sum(split_evenly(D("100.00"), 7)) == D("100.00"), str(split_evenly(D("100.00"), 7)))
ok("split_evenly into one part is the whole", split_evenly(D("123.45"), 1) == [D("123.45")])
ok("every installment is positive even across a long term",
   all(i.total > 0 for i in build_schedule(terms(installment_count=120)).installments))
ok("money rounds half up like a receipt", money("2.345") == D("2.35") and money("2.344") == D("2.34"))
ok("money from a float does not inherit binary noise", money(0.1 + 0.2) == D("0.30"))

print()
print("A 0% plan, and no down payment")
print("-" * 72)
zero = build_schedule(terms(markup_percent=D("0"), down_payment=D("0"),
                            tax_rate_percent=D("0")))
ok("no markup means the customer pays exactly the cash price",
   zero.total_of_payments == D("10000.00"), str(zero.total_of_payments))
ok("  in equal parts", all(i.total == D("833.33") for i in zero.installments[:-1])
   and zero.installments[-1].total == D("833.37"), str(zero.installments[-1].total))
ok("no down payment means no down payment charge",
   zero.down_payment_total == D("0.00"))

print()
print("Due dates")
print("-" * 72)
ok("monthly from 31 January lands on 28 February, not 3 March",
   due_date_for(date(2026, 1, 31), 2, "monthly") == date(2026, 2, 28))
ok("  and returns to the 31st in March rather than drifting to the 28th",
   due_date_for(date(2026, 1, 31), 3, "monthly") == date(2026, 3, 31))
ok("  and the 30th in April", due_date_for(date(2026, 1, 31), 4, "monthly") == date(2026, 4, 30))
ok("a leap year gives 29 February", due_date_for(date(2028, 1, 31), 2, "monthly") == date(2028, 2, 29))
ok("the year rolls over", due_date_for(date(2026, 11, 15), 3, "monthly") == date(2027, 1, 15))
ok("weekly steps seven days", due_date_for(date(2026, 11, 2), 3, "weekly") == date(2026, 11, 16))
ok("biweekly steps fourteen", due_date_for(date(2026, 11, 2), 2, "biweekly") == date(2026, 11, 16))
ok("quarterly steps three months", due_date_for(date(2026, 11, 30), 2, "quarterly") == date(2027, 2, 28))
ok("the first installment is due on the first due date",
   due_date_for(date(2026, 11, 1), 1, "monthly") == date(2026, 11, 1))
try:
    due_date_for(date(2026, 11, 1), 2, "daily")
    ok("an unknown frequency is refused", False)
except ValueError:
    ok("an unknown frequency is refused", True)

print()
print("Terms that cannot be offered are refused, with the reason")
print("-" * 72)
for label, over, needle in (
    ("a zero cash price", dict(cash_price=D("0")), "cash price"),
    ("a negative markup", dict(markup_percent=D("-1")), "markup"),
    ("an absurd markup", dict(markup_percent=D("500")), "markup"),
    ("a negative down payment", dict(down_payment=D("-5")), "down payment"),
    ("a down payment equal to the price -- that is a sale", dict(down_payment=D("10000")), "less than"),
    ("a down payment above the price", dict(down_payment=D("12000")), "less than"),
    ("zero installments", dict(installment_count=0), "installments"),
    ("too many installments", dict(installment_count=500), "installments"),
    ("a negative tax rate", dict(tax_rate_percent=D("-1")), "tax"),
    ("an absurd tax rate", dict(tax_rate_percent=D("60")), "tax"),
    ("an unknown frequency", dict(frequency="daily"), "frequency"),
):
    problems = validate_terms(terms(**over))
    ok("{} is refused".format(label), any(needle in p for p in problems), "; ".join(problems))
ok("sound terms raise nothing", validate_terms(terms()) == [])
try:
    build_schedule(terms(installment_count=0))
    ok("building a schedule from bad terms raises rather than guessing", False)
except ValueError:
    ok("building a schedule from bad terms raises rather than guessing", True)


def states_from(quote, paid_through: int = 0, partial: dict | None = None):
    partial = partial or {}
    return [
        InstallmentState(
            number=i.number, due_date=i.due_date, principal=i.principal, markup=i.markup,
            total=i.total,
            amount_paid=i.total if i.number <= paid_through else partial.get(i.number, D("0")),
            invoiced=i.number <= paid_through or i.number in partial,
        )
        for i in quote.installments
    ]


print()
print("Early buyout costs the unpaid cash price, with the markup waived")
print("-" * 72)
# Headline example after four of twelve payments:
#   remaining principal = 8 x 750  = 6,000.00
#   waived markup       = 8 x 125  = 1,000.00
#   tax                 = 6,000 x 8.25% = 495.00
#   buyout              = 6,495.00
b = buyout_quote(states_from(q, paid_through=4), q.tax_rate_percent)
ok("remaining principal is 6,000.00", b.remaining_principal == D("6000.00"), str(b.remaining_principal))
ok("the unearned markup, 1,000.00, is waived", b.waived_markup == D("1000.00"), str(b.waived_markup))
ok("tax on the buyout is 495.00", b.tax == D("495.00"), str(b.tax))
ok("the buyout is 6,495.00", b.total == D("6495.00"), str(b.total))
ok("  which saves the customer the markup and its tax against paying on",
   D("8") * q.regular_installment - b.total == D("1082.52"),
   str(D("8") * q.regular_installment - b.total))
ok("  and covers installments 5 to 12", b.installments_covered == tuple(range(5, 13)))

with_fees = buyout_quote(states_from(q, paid_through=4), q.tax_rate_percent, D("50"))
ok("outstanding late fees are added, untaxed", with_fees.total == D("6545.00")
   and with_fees.outstanding_fees == D("50.00"), str(with_fees.total))

# A part-paid installment is credited in proportion. Here a clean one: total
# 100.00 of which 80.00 principal, half paid, so half the principal remains.
half = buyout_quote([InstallmentState(number=1, due_date=date(2026, 11, 1),
                                      principal=D("80"), markup=D("20"),
                                      total=D("100"), amount_paid=D("50"))], D("0"))
ok("a half-paid installment leaves half its principal", half.remaining_principal == D("40.00"),
   str(half.remaining_principal))
ok("  and half its markup is waived", half.waived_markup == D("10.00"))

done = buyout_quote(states_from(q, paid_through=12), q.tax_rate_percent)
ok("nothing left to pay means a zero buyout", done.total == D("0.00") and done.installments_covered == ())

cancelled = [InstallmentState(number=1, due_date=date(2026, 11, 1), principal=D("80"),
                              markup=D("20"), total=D("100"), cancelled=True)]
ok("a cancelled installment is not charged again", buyout_quote(cancelled, D("8.25")).total == D("0.00"))

print()
print("Missed payments, late fees and default")
print("-" * 72)
due = InstallmentState(number=1, due_date=date(2026, 10, 5), principal=D("80"),
                       markup=D("20"), total=D("100"))
ok("not missed on the due date", not is_missed(due, date(2026, 10, 5), 5))
ok("not missed inside the grace period", not is_missed(due, date(2026, 10, 10), 5))
ok("missed the day after grace runs out", is_missed(due, date(2026, 10, 11), 5))
ok("a zero grace period means missed the next day", is_missed(due, date(2026, 10, 6), 0))
paid = InstallmentState(number=1, due_date=date(2026, 10, 5), principal=D("80"),
                        markup=D("20"), total=D("100"), amount_paid=D("100"))
ok("a paid installment is never missed", not is_missed(paid, date(2027, 1, 1), 0))
part = InstallmentState(number=1, due_date=date(2026, 10, 5), principal=D("80"),
                        markup=D("20"), total=D("100"), amount_paid=D("99.99"))
ok("a penny short is still missed", is_missed(part, date(2026, 11, 1), 5))
ok("  with exactly that penny outstanding", part.outstanding == D("0.01"))

overdue = [
    InstallmentState(number=n, due_date=date(2026, 7 + n, 1), principal=D("80"),
                     markup=D("20"), total=D("100"))
    for n in (1, 2, 3)
]
ok("three missed at once counts as three",
   len(missed_installments(overdue, date(2026, 11, 1), 5)) == 3)
ok("default after three missed", should_default(overdue, date(2026, 11, 1), 5, 3))
ok("not in default after two", not should_default(overdue[:2], date(2026, 11, 1), 5, 3))
caught_up = [overdue[0].__class__(**{**overdue[0].__dict__, "amount_paid": D("100")}),
             overdue[1], overdue[2]]
ok("catching up brings a customer out of default",
   not should_default(caught_up, date(2026, 11, 1), 5, 3))
ok("a default threshold of zero never defaults",
   not should_default(overdue, date(2026, 11, 1), 5, 0))

print()
print("Completion")
print("-" * 72)
ok("every installment paid is complete", all_paid(states_from(q, paid_through=12)))
ok("one short is not", not all_paid(states_from(q, paid_through=11)))
ok("an empty schedule is not complete", not all_paid([]))
superseded = [
    InstallmentState(number=1, due_date=date(2026, 11, 1), principal=D("80"), markup=D("20"),
                     total=D("100"), amount_paid=D("100")),
    InstallmentState(number=2, due_date=date(2026, 12, 1), principal=D("80"), markup=D("20"),
                     total=D("100"), cancelled=True),
]
ok("paid plus bought-out is complete", all_paid(superseded))

print()
print("=" * 72)
if failures:
    print("{} failing: {}".format(len(failures), ", ".join(failures)))
    sys.exit(1)
print("All lease math checks passed.")
