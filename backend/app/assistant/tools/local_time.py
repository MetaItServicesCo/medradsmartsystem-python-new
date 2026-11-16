"""Days and times where they happened, for the assistant.

Every timestamp is stored in UTC. A day is not: a job booked for 7 pm on
Tuesday in Texas is stored as 1 am Wednesday, and a check-in at 6 pm in
Karachi is 1 pm UTC. Counting either by the UTC date answers about the
wrong day, so each kind of record is counted on its own local day:

* jobs (service requests, inspections) on their facility's day, from the
  facility's time zone (Texas facilities: US Central);
* attendance on the day where the person checked in, from the time zone the
  device recorded with each check-in -- exactly as the Attendance module
  counts it;
* "today" for the person asking on their own day, from the time zone their
  browser sends with the question.
"""
from __future__ import annotations

from datetime import date, datetime, time, timedelta, timezone as dt_timezone
from typing import Iterable, Optional

from sqlalchemy import and_, false, or_
from sqlalchemy.orm import Session

try:  # Python 3.9+
    from zoneinfo import ZoneInfo, ZoneInfoNotFoundError
except ImportError:  # pragma: no cover
    ZoneInfo = None  # type: ignore[assignment]
    ZoneInfoNotFoundError = Exception  # type: ignore[assignment,misc]

# Where a facility has no zone of its own, and where nothing at all is known
# about the person asking: the business's facilities are in Texas.
DEFAULT_TIMEZONE = "America/Chicago"


def valid_zone(name: Optional[str]) -> Optional[str]:
    """The zone name if it is a real IANA zone ("Asia/Karachi"), else None."""
    if not name or not isinstance(name, str) or len(name) > 64 or ZoneInfo is None:
        return None
    try:
        ZoneInfo(name.strip())
    except (ZoneInfoNotFoundError, ValueError, KeyError):
        return None
    return name.strip()


def _zone(name: Optional[str]):
    return ZoneInfo(valid_zone(name) or DEFAULT_TIMEZONE)


def _as_utc(instant: datetime) -> datetime:
    return instant if instant.tzinfo else instant.replace(tzinfo=dt_timezone.utc)


def to_local(instant: datetime, zone: Optional[str]) -> datetime:
    """A stored (UTC) instant as wall-clock time in ``zone``."""
    return _as_utc(instant).astimezone(_zone(zone))


def local_date(instant: datetime, zone: Optional[str]) -> date:
    return to_local(instant, zone).date()


def today_in(zone: Optional[str], now: Optional[datetime] = None) -> date:
    moment = now or datetime.now(dt_timezone.utc)
    return _as_utc(moment).astimezone(_zone(zone)).date()


def utc_bounds(date_from: date, date_to: date, zone: Optional[str]) -> tuple[datetime, datetime]:
    """[start, end) in naive UTC covering local days date_from..date_to in ``zone``.

    Daylight saving makes local days 23 or 25 hours long; working from local
    midnights rather than adding 24 hours keeps that right.
    """
    tz = _zone(zone)
    start = datetime.combine(date_from, time.min, tzinfo=tz)
    end = datetime.combine(date_to + timedelta(days=1), time.min, tzinfo=tz)
    return (start.astimezone(dt_timezone.utc).replace(tzinfo=None),
            end.astimezone(dt_timezone.utc).replace(tzinfo=None))


def widened_utc_bounds(date_from: date, date_to: date) -> tuple[datetime, datetime]:
    """UTC range certain to hold every local day date_from..date_to in any zone.

    Zones run from UTC-12 to UTC+14, so a day anywhere starts no earlier than
    14 hours before its UTC midnight and ends no later than 12 hours after.
    """
    start = datetime.combine(date_from, time.min) - timedelta(hours=14)
    end = datetime.combine(date_to + timedelta(days=1), time.min) + timedelta(hours=12)
    return start, end


def day_label(day: date) -> str:
    """'Monday, Nov 16, 2026': a date as an answer should say it."""
    return "{}, {} {}, {}".format(day.strftime("%A"), day.strftime("%b"), day.day, day.year)


def range_label(date_from: date, date_to: date) -> str:
    if date_from == date_to:
        return day_label(date_from)
    return "{} to {}".format(day_label(date_from), day_label(date_to))


def time_label(instant: Optional[datetime], zone: Optional[str]) -> Optional[str]:
    """'Mon, Nov 16, 9:00 AM CST': local wall-clock time, with the zone said."""
    if instant is None:
        return None
    local = to_local(instant, zone)
    hour = local.strftime("%I").lstrip("0") or "12"
    return "{}, {} {}, {}:{} {} {}".format(
        local.strftime("%a"), local.strftime("%b"), local.day, hour,
        local.strftime("%M"), local.strftime("%p"), local.strftime("%Z"),
    )


def zone_label(zone: Optional[str]) -> str:
    """'Asia/Karachi' -> 'Karachi time'; how an answer names a zone."""
    name = valid_zone(zone) or DEFAULT_TIMEZONE
    city = name.rsplit("/", 1)[-1].replace("_", " ")
    return "{} time".format(city)


# ── Facilities ───────────────────────────────────────────────────────────────

def facility_zones(db: Session, facility_ids: Optional[Iterable[int]] = None) -> dict[int, str]:
    """Facility id -> its time zone (the default where none is set)."""
    from app.models.facility import Facility

    query = db.query(Facility.id, Facility.timezone)
    if facility_ids is not None:
        ids = {i for i in facility_ids if i is not None}
        if not ids:
            return {}
        query = query.filter(Facility.id.in_(ids))
    return {fid: (valid_zone(tz) or DEFAULT_TIMEZONE) for fid, tz in query.all()}


def facility_local_day_filter(db: Session, date_column, facility_column, date_from: date, date_to: date):
    """SQL condition: the row's ``date_column`` falls on local days date_from..date_to
    of the row's own facility.

    One range per time zone in use. Facilities in the default zone -- nearly
    all of them -- are matched as "not in any other zone" rather than listed.
    """
    zones = facility_zones(db)
    others: dict[str, list[int]] = {}
    for fid, zone in zones.items():
        if zone != DEFAULT_TIMEZONE:
            others.setdefault(zone, []).append(fid)

    conditions = []
    start, end = utc_bounds(date_from, date_to, DEFAULT_TIMEZONE)
    elsewhere = [fid for ids in others.values() for fid in ids]
    default_rows = and_(date_column >= start, date_column < end)
    conditions.append(and_(~facility_column.in_(elsewhere), default_rows) if elsewhere else default_rows)
    for zone, ids in others.items():
        start, end = utc_bounds(date_from, date_to, zone)
        conditions.append(and_(facility_column.in_(ids), date_column >= start, date_column < end))
    return or_(*conditions) if conditions else false()


def facility_before_filter(db: Session, date_column, facility_column, day: date):
    """SQL condition: ``date_column`` is before local midnight starting ``day``
    at the row's facility -- "its day has passed" for overdue work."""
    zones = facility_zones(db)
    others: dict[str, list[int]] = {}
    for fid, zone in zones.items():
        if zone != DEFAULT_TIMEZONE:
            others.setdefault(zone, []).append(fid)
    start, _ = utc_bounds(day, day, DEFAULT_TIMEZONE)
    elsewhere = [fid for ids in others.values() for fid in ids]
    conditions = [and_(~facility_column.in_(elsewhere), date_column < start) if elsewhere else date_column < start]
    for zone, ids in others.items():
        start, _ = utc_bounds(day, day, zone)
        conditions.append(and_(facility_column.in_(ids), date_column < start))
    return or_(*conditions)


# ── People ───────────────────────────────────────────────────────────────────

def person_zone(db: Session, user_id: Optional[int]) -> Optional[str]:
    """Where somebody is: the zone their device recorded at their latest check-in."""
    if not user_id:
        return None
    from app.models.attendance import AttendanceEvent

    row = (
        db.query(AttendanceEvent.timezone)
        .filter(AttendanceEvent.user_id == user_id)
        .order_by(AttendanceEvent.event_time.desc(), AttendanceEvent.id.desc())
        .first()
    )
    return valid_zone(row[0]) if row else None


def asker_zone(db: Session, user_id: Optional[int], browser_zone: Optional[str]) -> str:
    """The zone "today" means for the person asking: their browser's, else where
    they last checked in, else the business's."""
    return valid_zone(browser_zone) or person_zone(db, user_id) or DEFAULT_TIMEZONE
