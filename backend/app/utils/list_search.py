"""Shared, side-effect-free helpers for paginated list searches.

The list endpoints deliberately keep authorization and workflow filtering in
their own modules.  These helpers only normalize user input and build safe
case-insensitive predicates so every list has the same search semantics.
"""

from __future__ import annotations

from datetime import date, datetime, time, timedelta
from typing import Any, Optional

from sqlalchemy import String, cast


MAX_LIST_SEARCH_LENGTH = 160
_DATE_FORMATS = (
    "%m/%d/%Y",
    "%m/%d/%y",
    "%Y-%m-%d",
    "%b %d %Y",
    "%B %d %Y",
)


def normalize_list_search(value: Optional[str]) -> str:
    """Trim/collapse whitespace and cap pathological search input."""
    return " ".join((value or "").split())[:MAX_LIST_SEARCH_LENGTH]


def _escaped_like_pattern(term: str) -> str:
    escaped = term.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
    return f"%{escaped}%"


def contains_ci(column: Any, term: str):
    """Case-insensitive literal substring matching (wildcards are escaped)."""
    return column.ilike(_escaped_like_pattern(term), escape="\\")


def value_contains_ci(column: Any, term: str):
    """Search enum, numeric, boolean, date, or timestamp values as text."""
    return cast(column, String).ilike(_escaped_like_pattern(term), escape="\\")


def parsed_date_bounds(term: str) -> Optional[tuple[datetime, datetime]]:
    """Return a one-day range when a displayed US/ISO date was entered."""
    candidate = " ".join(term.replace(",", " ").split())
    for date_format in _DATE_FORMATS:
        try:
            parsed = datetime.strptime(candidate, date_format).date()
            start = datetime.combine(parsed, time.min)
            return start, start + timedelta(days=1)
        except ValueError:
            continue
    return None


def parsed_date_value(term: str) -> Optional[date]:
    bounds = parsed_date_bounds(term)
    return bounds[0].date() if bounds else None
