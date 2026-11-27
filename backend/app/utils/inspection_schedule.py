from calendar import monthrange
from datetime import date
from typing import Optional


INSPECTION_SCHEDULE_MONTHS = {
    "monthly": 1,
    "quarterly": 3,
    "semi-annual": 6,
    "semi annual": 6,
    "semi_annual": 6,
    "annual": 12,
}

INSPECTION_FREQUENCY_LABELS = {
    1: "monthly",
    3: "quarterly",
    6: "semi_annual",
    12: "annual",
}


def inspection_schedule_months(schedule: Optional[str]) -> Optional[int]:
    if not schedule:
        return None
    return INSPECTION_SCHEDULE_MONTHS.get(schedule.strip().lower())


def next_inspection_date(last_inspection_date: Optional[date], schedule: Optional[str]) -> Optional[date]:
    if not last_inspection_date:
        return None
    months = inspection_schedule_months(schedule)
    if not months:
        return None

    month_index = last_inspection_date.month - 1 + months
    year = last_inspection_date.year + month_index // 12
    month = month_index % 12 + 1
    day = min(last_inspection_date.day, monthrange(year, month)[1])
    return date(year, month, day)


# The spellings people type for an inspection frequency, each mapped to the value stored on an
# inspection or batch ("monthly", "quarterly", "semi_annual", "annual", "instant").
_FREQUENCY_SPELLINGS = {
    "monthly": "monthly", "month": "monthly", "every month": "monthly", "1 month": "monthly", "one month": "monthly",
    "quarterly": "quarterly", "quarter": "quarterly", "every quarter": "quarterly", "3 months": "quarterly",
    "every 3 months": "quarterly", "three months": "quarterly",
    "semi annual": "semi_annual", "semiannual": "semi_annual", "semi annually": "semi_annual", "biannual": "semi_annual",
    "bi annual": "semi_annual", "half yearly": "semi_annual", "half year": "semi_annual", "twice a year": "semi_annual",
    "6 months": "semi_annual", "every 6 months": "semi_annual", "six months": "semi_annual",
    "annual": "annual", "annually": "annual", "yearly": "annual", "year": "annual", "every year": "annual",
    "1 year": "annual", "one year": "annual", "12 months": "annual", "every 12 months": "annual",
    "instant": "instant", "on demand": "instant",
}


def canonical_inspection_frequency(value: Optional[str]) -> Optional[str]:
    """The stored frequency a typed value names ("Semi-Annual", "6 months" -> "semi_annual"), else None."""
    key = " ".join(str(value or "").lower().replace("-", " ").replace("_", " ").split())
    return _FREQUENCY_SPELLINGS.get(key)


def inspection_frequency_from_schedule(schedule: Optional[str]) -> Optional[str]:
    months = inspection_schedule_months(schedule)
    if not months:
        return None
    return INSPECTION_FREQUENCY_LABELS[months]
