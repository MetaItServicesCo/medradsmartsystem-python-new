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


def inspection_frequency_from_schedule(schedule: Optional[str]) -> Optional[str]:
    months = inspection_schedule_months(schedule)
    if not months:
        return None
    return INSPECTION_FREQUENCY_LABELS[months]
