"""Foundations for read-only assistant tools.

Every tool runs under the *requesting* user's identity, reusing the same
permission and facility-scoping helpers the API endpoints use. The agent
microservice never receives database credentials; it calls these tools through
the internal API, so authorization is enforced in exactly one place.

Three invariants make the assistant's numbers trustworthy:

1. ``total_count`` is a SQL COUNT over every match, independent of the returned
   page. The model reports totals it was given, never totals it counted.
2. Aggregates are computed by PostgreSQL. The model formats them; it never does
   arithmetic.
3. Filters are echoed back in ``applied_filters`` so the answer can state the
   exact question that was asked of the database.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date, datetime, timedelta
from typing import Any, Optional

from fastapi import HTTPException, status
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.models.user import User
from app.utils.facility_access import get_user_facility_ids, is_facility_scoped_user
from app.utils.permissions import has_module_permission


# Hard ceilings. The assistant may never request more than this regardless of
# what the model asks for.
MAX_ROWS = 100
DEFAULT_ROWS = 25
MAX_DATE_SPAN_DAYS = 731

# Per-tool database budget. A runaway analytical query must not hold a worker
# or compete with user-facing traffic.
STATEMENT_TIMEOUT_MS = 4000


class ToolPermissionError(HTTPException):
    def __init__(self, module: str) -> None:
        super().__init__(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Your account does not have access to the {} module.".format(module),
        )


class ToolInputError(HTTPException):
    def __init__(self, message: str) -> None:
        super().__init__(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=message)


@dataclass
class ToolResult:
    """Uniform envelope returned by every tool."""

    tool: str
    total_count: int
    items: list[dict[str, Any]] = field(default_factory=list)
    aggregates: dict[str, Any] = field(default_factory=dict)
    applied_filters: dict[str, Any] = field(default_factory=dict)
    notes: list[str] = field(default_factory=list)
    generated_at: datetime = field(default_factory=datetime.utcnow)

    @property
    def truncated(self) -> bool:
        return self.total_count > len(self.items)

    def to_dict(self) -> dict[str, Any]:
        return {
            "tool": self.tool,
            "total_count": self.total_count,
            "returned_count": len(self.items),
            "truncated": self.truncated,
            "items": self.items,
            "aggregates": self.aggregates,
            "applied_filters": self.applied_filters,
            "notes": self.notes,
            "generated_at": self.generated_at.isoformat() + "Z",
        }


@dataclass
class ToolContext:
    """Who is asking, and the database session their queries run in."""

    db: Session
    user: User

    def require_module(self, module: str, action: str = "index") -> None:
        if not has_module_permission(self.user, module, action):
            raise ToolPermissionError(module)

    def facility_ids(self) -> Optional[set[int]]:
        """Facility allow-list, or None when the user is unrestricted."""
        if not is_facility_scoped_user(self.user):
            return None
        return get_user_facility_ids(self.db, self.user)

    def scope_to_facilities(self, query, facility_column):
        allowed = self.facility_ids()
        if allowed is None:
            return query
        if not allowed:
            return query.filter(text("1=0"))
        return query.filter(facility_column.in_(allowed))

    def apply_statement_timeout(self) -> None:
        """Bound this transaction's query time inside PostgreSQL itself."""
        try:
            self.db.execute(text("SET LOCAL statement_timeout = :ms"),
                            {"ms": STATEMENT_TIMEOUT_MS})
        except Exception:
            # A missing timeout must not break the tool; the app-level timeout
            # in the agent service still applies.
            pass


def clamp_limit(limit: Optional[int]) -> int:
    if limit is None:
        return DEFAULT_ROWS
    return max(1, min(int(limit), MAX_ROWS))


def validate_date_range(date_from: Optional[date], date_to: Optional[date]) -> None:
    if date_from and date_to:
        if date_from > date_to:
            raise ToolInputError("date_from cannot be after date_to.")
        if (date_to - date_from).days > MAX_DATE_SPAN_DAYS:
            raise ToolInputError(
                "Date range cannot exceed {} days.".format(MAX_DATE_SPAN_DAYS)
            )


def datetime_bounds(date_from: Optional[date], date_to: Optional[date]):
    """Half-open [start, end) bounds so the end date is fully included."""
    start = datetime.combine(date_from, datetime.min.time()) if date_from else None
    end = (
        datetime.combine(date_to + timedelta(days=1), datetime.min.time())
        if date_to
        else None
    )
    return start, end


def money(value: Any) -> float:
    """Render a Numeric as a plain float for transport, rounded to cents."""
    return round(float(value or 0), 2)
