"""The one place that decides what a day of attendance was worth.

There used to be two. The timesheet generator classified days one way and
wrote the wage from it; the attendance screens classified the same days
another way and showed that to HR. They disagreed about hardcoded thresholds,
about gross versus net hours, about which timezone a day belongs to, and --
worst -- about whether somebody who checked in and never checked out had been
absent. One of those answers was on a payslip and the other was on a screen,
and nothing reconciled them.

So the rules live here, as pure functions over plain data, and both the
generator and the API that feeds the screens call them. No database, no
request, nothing to mock: give it events and a policy and it tells you what
the day was.

The verdicts are the DayStatus enum, decided in this order:

    holiday      a company holiday
    on_leave     approved leave covers the day
    absent       a working day, after enrolment, with nothing recorded
    full_day     net hours reached the policy's working day
    early_leave  more than half a day but short of a full one
    half_day     half a day or less

Nobody the system recorded on site is ever called absent. Absence means we
hold nothing at all for a day we could have held something.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime, time, timedelta
from typing import Any, Iterable, Optional, Sequence

try:                                    # pragma: no cover - import shim
    from zoneinfo import ZoneInfo
except ImportError:                     # pragma: no cover
    ZoneInfo = None                     # type: ignore[assignment]


# ── Policy ───────────────────────────────────────────────────────────────────

@dataclass(frozen=True)
class PolicyRules:
    """An attendance policy, normalised and safe to compute with."""

    id: Optional[int]
    name: str
    work_hours_per_day: float
    shift_start: Optional[str]          # "HH:MM" local to `timezone`
    shift_end: Optional[str]
    timezone: str
    late_grace_minutes: int
    early_departure_grace_minutes: int
    late_strike_action: str             # none | half_day | full_day
    consecutive_late_limit: int


FALLBACK_POLICY = PolicyRules(
    id=None,
    name="Default (no policy configured)",
    work_hours_per_day=8.0,
    shift_start=None,
    shift_end=None,
    timezone="UTC",
    late_grace_minutes=15,
    early_departure_grace_minutes=15,
    late_strike_action="none",
    consecutive_late_limit=3,
)

DEFAULT_EVENT_TIMEZONE = "Asia/Karachi"


def _positive(value: Any, fallback: float) -> float:
    try:
        number = float(value)
    except (TypeError, ValueError):
        return fallback
    return number if number >= 0 else fallback


def _clock(value: Any) -> Optional[str]:
    text = str(value or "").strip()
    if len(text) != 5 or text[2] != ":":
        return None
    try:
        hours, minutes = int(text[:2]), int(text[3:])
    except ValueError:
        return None
    return text if 0 <= hours <= 23 and 0 <= minutes <= 59 else None


def policy_rules_from(policy: Any) -> PolicyRules:
    """Normalise a policy row. Nonsense values fall back rather than spread.

    A zero-hour working day is the one that matters: left alone it would make
    every single attended day a full day, and every absence unremarkable.
    """
    if policy is None:
        return FALLBACK_POLICY

    hours = _positive(getattr(policy, "work_hours_per_day", None),
                      FALLBACK_POLICY.work_hours_per_day)
    action = str(getattr(policy, "late_strike_action", "") or "none")
    return PolicyRules(
        id=getattr(policy, "id", None),
        name=str(getattr(policy, "name", None) or FALLBACK_POLICY.name),
        work_hours_per_day=hours or FALLBACK_POLICY.work_hours_per_day,
        shift_start=_clock(getattr(policy, "shift_start_time", None)),
        shift_end=_clock(getattr(policy, "shift_end_time", None)),
        timezone=str(getattr(policy, "timezone", None) or "UTC"),
        late_grace_minutes=int(_positive(
            getattr(policy, "late_arrival_grace_minutes", None),
            FALLBACK_POLICY.late_grace_minutes)),
        early_departure_grace_minutes=int(_positive(
            getattr(policy, "early_departure_grace_minutes", None),
            FALLBACK_POLICY.early_departure_grace_minutes)),
        late_strike_action=action if action in {"none", "half_day", "full_day"} else "none",
        consecutive_late_limit=max(1, int(_positive(
            getattr(policy, "consecutive_late_limit", None),
            FALLBACK_POLICY.consecutive_late_limit))),
    )


def resolve_policy(
    policies: Sequence[Any],
    assignment_policy_id: Optional[int],
    role: Optional[str],
) -> PolicyRules:
    """Most specific policy first: assignment, then role, then the default.

    Inactive policies are never used, so switching one off takes effect
    without having to unpick every assignment pointing at it.
    """
    active = [p for p in policies if getattr(p, "is_active", True)]

    if assignment_policy_id is not None:
        for policy in active:
            if getattr(policy, "id", None) == assignment_policy_id:
                return policy_rules_from(policy)

    if role:
        for policy in active:
            if role in (getattr(policy, "applicable_roles", None) or []):
                return policy_rules_from(policy)

    for policy in active:
        if getattr(policy, "is_default", False):
            return policy_rules_from(policy)

    return FALLBACK_POLICY


# ── Reading events ───────────────────────────────────────────────────────────

CHECK_IN = "check_in"
CHECK_OUT = "check_out"
BREAK_START = "break_start"
BREAK_END = "break_end"


def event_type_of(event: Any) -> str:
    value = getattr(event, "event_type", None)
    return str(getattr(value, "value", value) or "")


def event_timezone_of(event: Any, fallback: str = DEFAULT_EVENT_TIMEZONE) -> str:
    return str(getattr(event, "timezone", None) or fallback)


def to_local(moment: datetime, timezone_name: str) -> datetime:
    """Read a stored naive-UTC timestamp in a given zone.

    An unknown zone falls back to UTC rather than raising: a mistyped label on
    one device must not take out a whole month's payroll run.
    """
    if moment is None:
        return moment
    if ZoneInfo is None:                                # pragma: no cover
        return moment
    try:
        zone = ZoneInfo(timezone_name)
    except Exception:
        try:
            zone = ZoneInfo("UTC")
        except Exception:                               # pragma: no cover
            return moment
    aware = moment if moment.tzinfo else moment.replace(tzinfo=ZoneInfo("UTC"))
    return aware.astimezone(zone)


def local_date_of(event: Any, fallback_timezone: str = DEFAULT_EVENT_TIMEZONE) -> Optional[date]:
    """The calendar day an event belongs to, where the employee was standing.

    Not the UTC day. Karachi is UTC+5, so bucketing by the stored instant puts
    anything before 05:00 local on the previous day -- squarely inside a
    6PM-3AM shift.
    """
    moment = getattr(event, "event_time", None)
    if not isinstance(moment, datetime):
        return None
    return to_local(moment, event_timezone_of(event, fallback_timezone)).date()


def group_by_local_date(
    events: Iterable[Any],
    fallback_timezone: str = DEFAULT_EVENT_TIMEZONE,
) -> dict[date, list[Any]]:
    grouped: dict[date, list[Any]] = {}
    for event in events:
        day = local_date_of(event, fallback_timezone)
        if day is None:
            continue
        grouped.setdefault(day, []).append(event)
    for bucket in grouped.values():
        bucket.sort(key=lambda e: getattr(e, "event_time", None) or datetime.min)
    return grouped


def break_seconds(day_events: Sequence[Any]) -> float:
    """Each break_start paired with the break_end that follows it.

    An unclosed break contributes nothing. Taking the span from the first
    start to the last end -- which is what the generator used to do -- turns
    two ten-minute breaks either side of lunch into a four-hour one.
    """
    total = 0.0
    opened_at: Optional[datetime] = None
    for event in day_events:
        moment = getattr(event, "event_time", None)
        if not isinstance(moment, datetime):
            continue
        kind = event_type_of(event)
        if kind == BREAK_START and opened_at is None:
            opened_at = moment
        elif kind == BREAK_END and opened_at is not None:
            total += max(0.0, (moment - opened_at).total_seconds())
            opened_at = None
    return total


# ── The verdict ──────────────────────────────────────────────────────────────

FULL_DAY = "full_day"
HALF_DAY = "half_day"
EARLY_LEAVE = "early_leave"
ABSENT = "absent"
ON_LEAVE = "on_leave"
HOLIDAY = "holiday"

#: Statuses that mean the employee was at work in some measure.
ATTENDED_STATUSES = frozenset({FULL_DAY, EARLY_LEAVE, HALF_DAY})

#: A shift is assumed to fit inside this; past it, a check-out is another day's.
MAX_SHIFT = timedelta(hours=16)

NO_CHECK_OUT_NOTE = "No check-out recorded; hours could not be verified"


@dataclass(frozen=True)
class DayVerdict:
    day: date
    status: str
    hours_worked: float
    is_late: bool
    late_minutes: float
    is_early_departure: bool
    early_departure_minutes: float
    late_strike: bool
    open_shift: bool
    check_in_local: Optional[str]
    check_out_local: Optional[str]
    check_out_next_day: bool
    event_count: int
    needs_review: bool
    note: Optional[str]

    @property
    def attended(self) -> bool:
        return self.status in ATTENDED_STATUSES


def _hhmm(moment: Optional[datetime], timezone_name: str) -> Optional[str]:
    if not isinstance(moment, datetime):
        return None
    return to_local(moment, timezone_name).strftime("%H:%M")


def _minutes_past_midnight(clock: Optional[str]) -> Optional[int]:
    if not clock:
        return None
    return int(clock[:2]) * 60 + int(clock[3:])


def classify_range(
    days: Sequence[date],
    events: Iterable[Any],
    policy: PolicyRules,
    *,
    holidays: Optional[set[date]] = None,
    leave_days: Optional[set[date]] = None,
    today: Optional[date] = None,
    enrolled_from: Optional[date] = None,
    weekend_weekdays: frozenset[int] = frozenset({5, 6}),
) -> list[DayVerdict]:
    """Classify every day in `days` for one employee.

    `days` should already exclude nothing: weekends come back as None so the
    caller can decide whether to store them. Days the employee could not have
    been recorded on -- before `enrolled_from`, or still in progress -- come
    back as None too, because a verdict we cannot justify is worse than no row.

    Returns one entry per day that has a verdict; days with no verdict are
    omitted, and the caller can tell which by date.
    """
    holidays = holidays or set()
    leave_days = leave_days or set()
    today = today or date.today()

    by_day = group_by_local_date(events, policy.timezone or DEFAULT_EVENT_TIMEZONE)
    ordered = sorted(days)

    # A check-out belonging to the previous evening's shift is moved back to
    # it, and withheld from the morning it physically happened on -- otherwise
    # a 6PM-3AM night is counted twice, once properly and once as a stray
    # morning with no check-in.
    borrowed: dict[date, Any] = {}
    lent: set[int] = set()
    for index, day in enumerate(ordered):
        day_events = by_day.get(day, [])
        check_in = next((e for e in day_events if event_type_of(e) == CHECK_IN), None)
        if check_in is None:
            continue
        if any(event_type_of(e) == CHECK_OUT for e in day_events):
            continue
        following = ordered[index + 1] if index + 1 < len(ordered) else day + timedelta(days=1)
        candidate = next(
            (e for e in by_day.get(following, [])
             if event_type_of(e) == CHECK_OUT and id(e) not in lent),
            None,
        )
        if candidate is None:
            continue
        started, ended = check_in.event_time, candidate.event_time
        if not isinstance(started, datetime) or not isinstance(ended, datetime):
            continue
        if ended <= started or (ended - started) > MAX_SHIFT:
            continue
        borrowed[day] = candidate
        lent.add(id(candidate))

    full_day_seconds = policy.work_hours_per_day * 3600.0
    early_grace_seconds = policy.early_departure_grace_minutes * 60.0
    shift_start_minutes = _minutes_past_midnight(policy.shift_start)

    verdicts: list[DayVerdict] = []
    late_run = 0

    for day in ordered:
        if day.weekday() in weekend_weekdays:
            continue
        if day > today:
            continue
        if enrolled_from and day < enrolled_from:
            continue

        day_events = [e for e in by_day.get(day, []) if id(e) not in lent]
        check_in = next((e for e in day_events if event_type_of(e) == CHECK_IN), None)
        own_out = next((e for e in reversed(day_events) if event_type_of(e) == CHECK_OUT), None)
        borrowed_out = borrowed.get(day)
        check_out = own_out or borrowed_out
        attended = check_in is not None or check_out is not None

        if day in holidays:
            verdicts.append(_plain(day, HOLIDAY, day_events))
            continue
        if day in leave_days:
            verdicts.append(_plain(day, ON_LEAVE, day_events))
            continue

        if not attended:
            # Still inside the day: nothing has been recorded yet, which is
            # not the same as not turning up.
            if day == today:
                continue
            verdicts.append(_plain(day, ABSENT, day_events))
            late_run = 0
            continue

        # A shift that is open while the day is still running is simply in
        # progress, and gets no verdict until it closes.
        if check_out is None and day >= today:
            continue

        zone = event_timezone_of(check_in or check_out, policy.timezone or DEFAULT_EVENT_TIMEZONE)
        check_in_local = _hhmm(getattr(check_in, "event_time", None), zone)
        check_out_local = _hhmm(getattr(check_out, "event_time", None), zone)

        note: Optional[str] = None
        open_shift = check_out is None

        if open_shift:
            # Past day, never closed. We know they came and nothing more, so
            # the day is recorded conservatively and flagged for HR rather
            # than guessed at in either direction.
            hours_worked = 0.0
            status = HALF_DAY
            note = NO_CHECK_OUT_NOTE
        else:
            gross = (check_out.event_time - check_in.event_time).total_seconds() \
                if check_in is not None else 0.0
            worked = max(0.0, gross - break_seconds(day_events))
            hours_worked = round(worked / 3600.0, 2)
            if check_in is None:
                # Checked out with no check-in: they were here, but the hours
                # cannot be trusted.
                status = HALF_DAY
                hours_worked = 0.0
                note = "No check-in recorded; hours could not be verified"
            elif worked + early_grace_seconds >= full_day_seconds:
                status = FULL_DAY
            elif worked > full_day_seconds / 2:
                status = EARLY_LEAVE
            else:
                status = HALF_DAY

        is_late, late_minutes = _lateness(check_in_local, shift_start_minutes,
                                          policy.late_grace_minutes)
        is_early, early_minutes = _early_departure(check_out, policy)

        late_strike = False
        if is_late:
            late_run += 1
            if late_run >= policy.consecutive_late_limit and policy.late_strike_action != "none":
                late_strike = True
                late_run = 0
        else:
            late_run = 0

        if late_strike:
            status = ABSENT if policy.late_strike_action == "full_day" else HALF_DAY
            note = (
                "Policy '{}': {} consecutive late arrivals reached the limit of {}"
                .format(policy.name, policy.consecutive_late_limit, policy.consecutive_late_limit)
            )

        verdicts.append(DayVerdict(
            day=day,
            status=status,
            hours_worked=hours_worked,
            is_late=is_late,
            late_minutes=late_minutes,
            is_early_departure=is_early,
            early_departure_minutes=early_minutes,
            late_strike=late_strike,
            open_shift=open_shift,
            check_in_local=check_in_local,
            check_out_local=check_out_local,
            check_out_next_day=borrowed_out is not None and check_out is borrowed_out,
            event_count=len(day_events) + (1 if borrowed_out is not None and check_out is borrowed_out else 0),
            needs_review=any(
                str(getattr(getattr(e, "verification_status", None), "value",
                            getattr(e, "verification_status", ""))) == "needs_review"
                for e in day_events
            ),
            note=note,
        ))

    return verdicts


def _plain(day: date, status: str, day_events: Sequence[Any]) -> DayVerdict:
    return DayVerdict(
        day=day, status=status, hours_worked=0.0,
        is_late=False, late_minutes=0.0,
        is_early_departure=False, early_departure_minutes=0.0,
        late_strike=False, open_shift=False,
        check_in_local=None, check_out_local=None, check_out_next_day=False,
        event_count=len(day_events), needs_review=False, note=None,
    )


def _lateness(
    check_in_local: Optional[str],
    shift_start_minutes: Optional[int],
    grace_minutes: int,
) -> tuple[bool, float]:
    """Late only when the shift start is pinned; otherwise unknowable."""
    if check_in_local is None or shift_start_minutes is None:
        return False, 0.0
    arrived = _minutes_past_midnight(check_in_local)
    if arrived is None:
        return False, 0.0
    deadline = shift_start_minutes + grace_minutes
    # An overnight shift starting at 18:00 is not "late" because somebody
    # arrived at 02:00 -- that is the far side of midnight, not 16 hours late.
    if arrived < shift_start_minutes - 720:
        return False, 0.0
    return (True, float(arrived - deadline)) if arrived > deadline else (False, 0.0)


def _early_departure(check_out: Any, policy: PolicyRules) -> tuple[bool, float]:
    if check_out is None or not policy.shift_end:
        return False, 0.0
    moment = getattr(check_out, "event_time", None)
    if not isinstance(moment, datetime):
        return False, 0.0

    zone = event_timezone_of(check_out, policy.timezone or DEFAULT_EVENT_TIMEZONE)
    local_out = to_local(moment, zone)
    end_hours, end_minutes = int(policy.shift_end[:2]), int(policy.shift_end[3:])
    shift_end = local_out.replace(hour=end_hours, minute=end_minutes,
                                  second=0, microsecond=0)

    # An overnight shift ends on the following day.
    if policy.shift_start:
        start_total = int(policy.shift_start[:2]) * 60 + int(policy.shift_start[3:])
        if (end_hours * 60 + end_minutes) < start_total and local_out.hour >= end_hours:
            shift_end += timedelta(days=1)

    deadline = shift_end - timedelta(minutes=policy.early_departure_grace_minutes)
    if local_out < deadline:
        return True, round((shift_end - local_out).total_seconds() / 60.0, 1)
    return False, 0.0


def wage_for(status: str, daily_rate: float) -> float:
    """What a day of each kind earns before policy deductions.

    Half pay for a half day; a day cut short but still past the halfway mark
    keeps full pay and carries the early-departure flag instead, which is the
    behaviour the generator already had.
    """
    if status == FULL_DAY or status == EARLY_LEAVE:
        return daily_rate
    if status == HALF_DAY:
        return daily_rate * 0.5
    return 0.0


def deduction_for(verdict: DayVerdict, policy: PolicyRules, daily_rate: float) -> float:
    if not verdict.late_strike:
        return 0.0
    if policy.late_strike_action == "full_day":
        return daily_rate
    if policy.late_strike_action == "half_day":
        return daily_rate * 0.5
    return 0.0
