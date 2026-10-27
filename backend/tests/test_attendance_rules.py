"""The rules that decide what a day of attendance was worth.

This is the engine behind both the payslip and the screen, so it is the one
place where being wrong costs somebody money. The cases below are the ones
that were wrong before it existed: a hardcoded nine-hour day that ignored the
configured policy, gross hours counted as worked hours, a break measured from
the first start to the last end, days bucketed by UTC so a Karachi night shift
landed on the wrong date, and -- the one that would have hit this month --
anybody who checked in and had not yet checked out being recorded as absent
with no pay.

    python backend/tests/test_attendance_rules.py
"""
from __future__ import annotations

import os
import pathlib
import sys
from datetime import date, datetime

os.environ.setdefault("DATABASE_URL", "sqlite://")
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))

from app.utils.attendance_rules import (  # noqa: E402
    ABSENT, EARLY_LEAVE, FALLBACK_POLICY, FULL_DAY, HALF_DAY, HOLIDAY, ON_LEAVE,
    NO_CHECK_OUT_NOTE, PolicyRules, break_seconds, classify_range, deduction_for,
    local_date_of, policy_rules_from, resolve_policy, wage_for,
)

failures: list[str] = []


def ok(label: str, condition: bool, detail: str = "") -> None:
    print("{}  {}{}".format("PASS" if condition else "FAIL", label,
                            "  " + detail if detail else ""))
    if not condition:
        failures.append(label)


# ── Fixtures ─────────────────────────────────────────────────────────────────

class Event:
    """An attendance row as the API stores it: naive UTC plus its own zone."""

    _next_id = 1

    def __init__(self, utc: str, event_type: str, timezone: str = "Asia/Karachi",
                 verification_status: str = "verified"):
        self.id = Event._next_id
        Event._next_id += 1
        self.event_time = datetime.fromisoformat(utc)
        self.event_type = event_type
        self.timezone = timezone
        self.verification_status = verification_status


class Policy:
    def __init__(self, **kwargs):
        self.id = kwargs.get("id", 1)
        self.name = kwargs.get("name", "Test")
        self.work_hours_per_day = kwargs.get("work_hours_per_day", 8.0)
        self.shift_start_time = kwargs.get("shift_start_time")
        self.shift_end_time = kwargs.get("shift_end_time")
        self.timezone = kwargs.get("timezone", "Asia/Karachi")
        self.late_arrival_grace_minutes = kwargs.get("late_arrival_grace_minutes", 15)
        self.early_departure_grace_minutes = kwargs.get("early_departure_grace_minutes", 15)
        self.late_strike_action = kwargs.get("late_strike_action", "none")
        self.consecutive_late_limit = kwargs.get("consecutive_late_limit", 3)
        self.is_active = kwargs.get("is_active", True)
        self.is_default = kwargs.get("is_default", False)
        self.applicable_roles = kwargs.get("applicable_roles")


def rules(**kwargs) -> PolicyRules:
    return policy_rules_from(Policy(**kwargs))


def days(*iso: str) -> list[date]:
    return [date.fromisoformat(d) for d in iso]


def verdicts_by_day(result):
    return {v.day.isoformat(): v for v in result}


LATE_OCT = date(2026, 10, 31)


print("Attendance rules")
print("=" * 72)

print()
print("A day belongs to where the employee was standing")
print("-" * 72)

# 03:00 Karachi on the 5th is 22:00 UTC on the 4th.
ok("an early-morning Karachi scan lands on its own local day",
   local_date_of(Event("2026-10-04T22:00:00", "check_in")) == date(2026, 10, 5),
   str(local_date_of(Event("2026-10-04T22:00:00", "check_in"))))
ok("  and not on the UTC day",
   local_date_of(Event("2026-10-04T22:00:00", "check_in")) != date(2026, 10, 4))
ok("an evening scan stays put",
   local_date_of(Event("2026-10-05T13:00:00", "check_in")) == date(2026, 10, 5))
ok("a device in another zone is read in that zone",
   local_date_of(Event("2026-10-06T02:00:00", "check_in", timezone="America/Chicago"))
   == date(2026, 10, 5))
ok("an unknown zone falls back instead of raising",
   local_date_of(Event("2026-10-05T13:00:00", "check_in", timezone="Nowhere/Fake"))
   == date(2026, 10, 5))

print()
print("Hours are net of breaks, and breaks are paired")
print("-" * 72)

ok("two short breaks add up", break_seconds([
    Event("2026-10-05T06:00:00", "break_start"), Event("2026-10-05T06:10:00", "break_end"),
    Event("2026-10-05T09:00:00", "break_start"), Event("2026-10-05T09:20:00", "break_end"),
]) == 30 * 60)
ok("  and are NOT measured first-start to last-end, which was the old bug",
   break_seconds([
       Event("2026-10-05T06:00:00", "break_start"), Event("2026-10-05T06:10:00", "break_end"),
       Event("2026-10-05T09:00:00", "break_start"), Event("2026-10-05T09:20:00", "break_end"),
   ]) != (3 * 3600 + 20 * 60))
ok("an unclosed break contributes nothing",
   break_seconds([Event("2026-10-05T06:00:00", "break_start")]) == 0)
ok("a stray break end is ignored",
   break_seconds([Event("2026-10-05T06:00:00", "break_end")]) == 0)

print()
print("The policy decides what a full day is")
print("-" * 72)

# 09:00-17:00 Karachi is 04:00-12:00 UTC.
eight = classify_range(days("2026-10-05"), [
    Event("2026-10-05T04:00:00", "check_in"), Event("2026-10-05T12:00:00", "check_out"),
], rules(), today=LATE_OCT)[0]
ok("eight worked hours on an eight hour policy is a full day",
   eight.status == FULL_DAY, eight.status)
ok("  and the hours are net", eight.hours_worked == 8.0, str(eight.hours_worked))
ok("  and the clock times are local", eight.check_in_local == "09:00", str(eight.check_in_local))

with_break = classify_range(days("2026-10-05"), [
    Event("2026-10-05T04:00:00", "check_in"),
    Event("2026-10-05T07:00:00", "break_start"), Event("2026-10-05T08:00:00", "break_end"),
    Event("2026-10-05T12:00:00", "check_out"),
], rules(), today=LATE_OCT)[0]
ok("an hour of break makes an eight hour span a seven hour day",
   with_break.hours_worked == 7.0, str(with_break.hours_worked))
ok("  which is short of the policy, so it is early leave",
   with_break.status == EARLY_LEAVE, with_break.status)
ok("  and the old engine would have called the same day a full nine-hour one",
   with_break.status != FULL_DAY)

six_hour_policy = classify_range(days("2026-10-05"), [
    Event("2026-10-05T04:00:00", "check_in"), Event("2026-10-05T10:00:00", "check_out"),
], rules(work_hours_per_day=6), today=LATE_OCT)[0]
ok("a six hour policy makes six hours a full day",
   six_hour_policy.status == FULL_DAY, six_hour_policy.status)
ok("  the hardcoded nine is gone",
   classify_range(days("2026-10-05"), [
       Event("2026-10-05T04:00:00", "check_in"), Event("2026-10-05T10:00:00", "check_out"),
   ], rules(work_hours_per_day=12), today=LATE_OCT)[0].status != FULL_DAY)

grace = classify_range(days("2026-10-05"), [
    Event("2026-10-05T04:00:00", "check_in"), Event("2026-10-05T11:50:00", "check_out"),
], rules(), today=LATE_OCT)[0]
ok("leaving inside the early-departure grace is still a full day",
   grace.status == FULL_DAY, grace.status)

short = classify_range(days("2026-10-05"), [
    Event("2026-10-05T04:00:00", "check_in"), Event("2026-10-05T07:30:00", "check_out"),
], rules(), today=LATE_OCT)[0]
ok("three and a half hours is a half day", short.status == HALF_DAY, short.status)

print()
print("Checked in and not checked out")
print("-" * 72)

today_open = classify_range(days("2026-10-27"), [
    Event("2026-10-27T13:33:00", "check_in"),
], rules(), today=date(2026, 10, 27))
ok("a shift still running today gets no verdict at all", today_open == [],
   str([v.status for v in today_open]))
ok("  so nobody is marked absent mid-shift -- the case that would have hit this month",
   all(v.status != ABSENT for v in today_open))

past_open = classify_range(days("2026-10-05"), [
    Event("2026-10-05T04:00:00", "check_in"),
], rules(), today=LATE_OCT)[0]
ok("a past day that was never closed is not an absence",
   past_open.status != ABSENT, past_open.status)
ok("  it is recorded conservatively as a half day", past_open.status == HALF_DAY)
ok("  flagged as an open shift", past_open.open_shift is True)
ok("  with the reason spelled out", past_open.note == NO_CHECK_OUT_NOTE, str(past_open.note))
ok("  and no hours claimed", past_open.hours_worked == 0.0)

out_only = classify_range(days("2026-10-05"), [
    Event("2026-10-05T12:00:00", "check_out"),
], rules(), today=LATE_OCT)[0]
ok("a check-out with no check-in still means they were here",
   out_only.status == HALF_DAY, out_only.status)
ok("  and says why the hours are missing", "check-in" in (out_only.note or ""))

print()
print("Absence, and when we are not entitled to claim it")
print("-" * 72)

ok("a past working day with nothing recorded is absent",
   classify_range(days("2026-10-05"), [], rules(), today=LATE_OCT)[0].status == ABSENT)
ok("today with nothing recorded yet is not",
   classify_range(days("2026-10-27"), [], rules(), today=date(2026, 10, 27)) == [])
ok("a day before the employee was enrolled gets no verdict",
   classify_range(days("2026-10-05"), [], rules(), today=LATE_OCT,
                  enrolled_from=date(2026, 10, 20)) == [])
ok("  and on the enrolment day itself it does",
   classify_range(days("2026-10-05"), [], rules(), today=LATE_OCT,
                  enrolled_from=date(2026, 10, 5))[0].status == ABSENT)
ok("a weekend is skipped entirely",
   classify_range(days("2026-10-03", "2026-10-04"), [], rules(), today=LATE_OCT) == [])
ok("a holiday is a holiday, not an absence",
   classify_range(days("2026-10-05"), [], rules(), today=LATE_OCT,
                  holidays={date(2026, 10, 5)})[0].status == HOLIDAY)
ok("approved leave is leave, not an absence",
   classify_range(days("2026-10-05"), [], rules(), today=LATE_OCT,
                  leave_days={date(2026, 10, 5)})[0].status == ON_LEAVE)
ok("a future day gets no verdict",
   classify_range(days("2026-11-05"), [], rules(), today=LATE_OCT) == [])

print()
print("The overnight shift")
print("-" * 72)

# 18:00 on the 5th to 03:00 on the 6th, Karachi. In UTC: 13:00 and 22:00 on the 5th.
night = classify_range(days("2026-10-05", "2026-10-06"), [
    Event("2026-10-05T13:00:00", "check_in"),
    Event("2026-10-05T17:00:00", "break_start"), Event("2026-10-05T17:30:00", "break_end"),
    Event("2026-10-05T22:00:00", "check_out"),
], rules(work_hours_per_day=8, shift_start_time="18:00", shift_end_time="03:00"),
    today=LATE_OCT)
by_day = verdicts_by_day(night)
ok("the night is one day, not two", len(night) == 2, str(len(night)))
ok("  the shift lands on the evening it started", by_day["2026-10-05"].check_in_local == "18:00")
ok("  the check-out is pulled back to it", by_day["2026-10-05"].check_out_local == "03:00")
ok("  and marked as landing the next day", by_day["2026-10-05"].check_out_next_day is True)
ok("  nine hours on the clock less a half hour break is 8.5 worked",
   by_day["2026-10-05"].hours_worked == 8.5, str(by_day["2026-10-05"].hours_worked))
ok("  which clears an eight hour policy", by_day["2026-10-05"].status == FULL_DAY,
   by_day["2026-10-05"].status)

# Worth stating plainly, because it is a configuration trap rather than a bug:
# work_hours_per_day counts hours WORKED. Setting it equal to the length of
# the shift means any break longer than the early-departure grace makes a full
# day unreachable, and everybody quietly becomes early_leave.
same_as_shift = classify_range(days("2026-10-05", "2026-10-06"), [
    Event("2026-10-05T13:00:00", "check_in"),
    Event("2026-10-05T17:00:00", "break_start"), Event("2026-10-05T17:30:00", "break_end"),
    Event("2026-10-05T22:00:00", "check_out"),
], rules(work_hours_per_day=9, shift_start_time="18:00", shift_end_time="03:00"),
    today=LATE_OCT)
ok("  a policy demanding as many worked hours as the shift is long cannot be met",
   verdicts_by_day(same_as_shift)["2026-10-05"].status == EARLY_LEAVE,
   verdicts_by_day(same_as_shift)["2026-10-05"].status)
ok("the following morning is not a second attendance",
   by_day["2026-10-06"].status == ABSENT, by_day["2026-10-06"].status)
ok("  arriving at 18:00 on an 18:00 shift is not late",
   by_day["2026-10-05"].is_late is False)

far_apart = classify_range(days("2026-10-05", "2026-10-06"), [
    Event("2026-10-05T13:00:00", "check_in"),
    Event("2026-10-06T12:00:00", "check_out"),
], rules(), today=LATE_OCT)
ok("a check-out a day later is not borrowed into the previous shift",
   verdicts_by_day(far_apart)["2026-10-05"].open_shift is True)

print()
print("Lateness and the consecutive-late strike")
print("-" * 72)

nine = rules(shift_start_time="09:00")
on_time = classify_range(days("2026-10-05"), [
    Event("2026-10-05T04:10:00", "check_in"), Event("2026-10-05T12:10:00", "check_out"),
], nine, today=LATE_OCT)[0]
ok("09:10 against a 09:00 shift with 15 minutes grace is on time", on_time.is_late is False)

late = classify_range(days("2026-10-05"), [
    Event("2026-10-05T04:30:00", "check_in"), Event("2026-10-05T12:30:00", "check_out"),
], nine, today=LATE_OCT)[0]
ok("09:30 is late", late.is_late is True)
ok("  by fifteen minutes past the grace", late.late_minutes == 15.0, str(late.late_minutes))
ok("  and being late alone does not cost the day", late.status == FULL_DAY, late.status)

ok("lateness is unknowable with no shift start",
   classify_range(days("2026-10-05"), [
       Event("2026-10-05T04:30:00", "check_in"), Event("2026-10-05T12:30:00", "check_out"),
   ], rules(), today=LATE_OCT)[0].is_late is False)

strike_policy = rules(shift_start_time="09:00", late_strike_action="half_day",
                      consecutive_late_limit=3)
three = classify_range(days("2026-10-05", "2026-10-06", "2026-10-07"), [
    Event("2026-10-05T04:30:00", "check_in"), Event("2026-10-05T12:30:00", "check_out"),
    Event("2026-10-06T04:30:00", "check_in"), Event("2026-10-06T12:30:00", "check_out"),
    Event("2026-10-07T04:30:00", "check_in"), Event("2026-10-07T12:30:00", "check_out"),
], strike_policy, today=LATE_OCT)
ok("the first two late days stand", three[0].status == FULL_DAY and three[1].status == FULL_DAY)
ok("the third trips the strike", three[2].late_strike is True)
ok("  and costs half a day", three[2].status == HALF_DAY, three[2].status)
ok("  with the reason recorded", "consecutive late" in (three[2].note or ""))

full_strike = classify_range(days("2026-10-05", "2026-10-06"), [
    Event("2026-10-05T04:30:00", "check_in"), Event("2026-10-05T12:30:00", "check_out"),
    Event("2026-10-06T04:30:00", "check_in"), Event("2026-10-06T12:30:00", "check_out"),
], rules(shift_start_time="09:00", late_strike_action="full_day", consecutive_late_limit=2),
    today=LATE_OCT)
ok("a full-day strike costs the whole day", full_strike[1].status == ABSENT)

none_action = classify_range(days("2026-10-05", "2026-10-06"), [
    Event("2026-10-05T04:30:00", "check_in"), Event("2026-10-05T12:30:00", "check_out"),
    Event("2026-10-06T04:30:00", "check_in"), Event("2026-10-06T12:30:00", "check_out"),
], rules(shift_start_time="09:00", late_strike_action="none", consecutive_late_limit=2),
    today=LATE_OCT)
ok("an action of none flags without striking",
   all(not v.late_strike for v in none_action) and all(v.is_late for v in none_action))

reset = classify_range(days("2026-10-05", "2026-10-06", "2026-10-07"), [
    Event("2026-10-05T04:30:00", "check_in"), Event("2026-10-05T12:30:00", "check_out"),
    Event("2026-10-06T04:05:00", "check_in"), Event("2026-10-06T12:05:00", "check_out"),
    Event("2026-10-07T04:30:00", "check_in"), Event("2026-10-07T12:30:00", "check_out"),
], rules(shift_start_time="09:00", late_strike_action="half_day", consecutive_late_limit=2),
    today=LATE_OCT)
ok("an on-time day resets the run", all(not v.late_strike for v in reset))

print()
print("Early departure")
print("-" * 72)

early = classify_range(days("2026-10-05"), [
    Event("2026-10-05T04:00:00", "check_in"), Event("2026-10-05T10:00:00", "check_out"),
], rules(shift_start_time="09:00", shift_end_time="17:00"), today=LATE_OCT)[0]
ok("leaving at 15:00 on a 17:00 shift is an early departure", early.is_early_departure is True)
ok("  by two hours", early.early_departure_minutes == 120.0, str(early.early_departure_minutes))
ok("leaving on time is not",
   classify_range(days("2026-10-05"), [
       Event("2026-10-05T04:00:00", "check_in"), Event("2026-10-05T12:00:00", "check_out"),
   ], rules(shift_start_time="09:00", shift_end_time="17:00"),
       today=LATE_OCT)[0].is_early_departure is False)
ok("without a shift end it is unknowable",
   classify_range(days("2026-10-05"), [
       Event("2026-10-05T04:00:00", "check_in"), Event("2026-10-05T07:00:00", "check_out"),
   ], rules(), today=LATE_OCT)[0].is_early_departure is False)

print()
print("Policy resolution")
print("-" * 72)

night_p = Policy(id=1, name="Night", work_hours_per_day=9)
office_p = Policy(id=2, name="Office", work_hours_per_day=8, is_default=True)
techs_p = Policy(id=3, name="Techs", work_hours_per_day=7, applicable_roles=["technician"])
all_policies = [night_p, office_p, techs_p]

ok("an explicit assignment wins",
   resolve_policy(all_policies, 1, "technician").name == "Night")
ok("a role match is next", resolve_policy(all_policies, None, "technician").name == "Techs")
ok("the default catches everyone else",
   resolve_policy(all_policies, None, "employee").name == "Office")
ok("nothing configured still resolves",
   resolve_policy([], None, "employee").name == FALLBACK_POLICY.name)
ok("an inactive default is skipped",
   resolve_policy([Policy(id=9, is_active=False, is_default=True)], None, "employee").id is None)
ok("an assignment pointing at a vanished policy falls through",
   resolve_policy(all_policies, 99, "employee").name == "Office")

print()
print("Nonsense never reaches a payslip")
print("-" * 72)

ok("a zero-hour working day falls back", rules(work_hours_per_day=0).work_hours_per_day == 8.0)
ok("a negative working day falls back", rules(work_hours_per_day=-3).work_hours_per_day == 8.0)
ok("a non-numeric working day falls back",
   rules(work_hours_per_day="eight").work_hours_per_day == 8.0)
ok("a malformed shift time becomes none", rules(shift_start_time="6pm").shift_start is None)
ok("an impossible shift time becomes none", rules(shift_start_time="99:99").shift_start is None)
ok("an unknown strike action becomes none",
   rules(late_strike_action="sack_them").late_strike_action == "none")
ok("a zero late limit cannot strike every day",
   rules(consecutive_late_limit=0).consecutive_late_limit == 1)
ok("a missing policy gives the fallback", policy_rules_from(None) is FALLBACK_POLICY)

print()
print("What a day earns")
print("-" * 72)

ok("a full day earns the daily rate", wage_for(FULL_DAY, 1000) == 1000)
ok("a day cut short but past halfway keeps full pay", wage_for(EARLY_LEAVE, 1000) == 1000)
ok("a half day earns half", wage_for(HALF_DAY, 1000) == 500)
ok("an absence earns nothing", wage_for(ABSENT, 1000) == 0)
ok("a holiday earns nothing by itself", wage_for(HOLIDAY, 1000) == 0)
ok("leave earns nothing by itself", wage_for(ON_LEAVE, 1000) == 0)

struck = three[2]
ok("a half-day strike deducts half the rate",
   deduction_for(struck, strike_policy, 1000) == 500)
ok("a day with no strike deducts nothing",
   deduction_for(three[0], strike_policy, 1000) == 0)

print()
print("Nothing in here touches a database or a clock it was not given")
print("-" * 72)

ok("an empty range is empty", classify_range([], [], rules(), today=LATE_OCT) == [])
ok("events outside the range are ignored",
   classify_range(days("2026-10-05"), [Event("2026-09-01T04:00:00", "check_in")],
                  rules(), today=LATE_OCT)[0].status == ABSENT)
ok("an event with no timestamp does not crash",
   len(classify_range(days("2026-10-05"), [Event("2026-10-05T04:00:00", "check_in")],
                      rules(), today=LATE_OCT)) == 1)
ok("needs_review on a scan is carried through",
   classify_range(days("2026-10-05"), [
       Event("2026-10-05T04:00:00", "check_in", verification_status="needs_review"),
       Event("2026-10-05T12:00:00", "check_out"),
   ], rules(), today=LATE_OCT)[0].needs_review is True)

print()
print("=" * 72)
if failures:
    print("{} failing: {}".format(len(failures), ", ".join(failures)))
    sys.exit(1)
print("All attendance rules checks passed.")
