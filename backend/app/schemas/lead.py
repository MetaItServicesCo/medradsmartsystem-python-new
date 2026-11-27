import re
from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field, field_validator

from app.models.lead import LEAD_SOURCES, LEAD_STATUSES

# Deliberately plain: an address a person typed is kept if it has the shape
# name@domain.tld. (EmailStr also refuses reserved domains such as .local,
# which a real company's internal address can use.)
_EMAIL_SHAPE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


def _clean(value: Optional[str]) -> Optional[str]:
    """A one-line field: spaces collapsed, blank read as empty."""
    if value is None:
        return None
    return " ".join(str(value).split()) or None


def _required_name(value: Optional[str]) -> str:
    cleaned = _clean(value)
    if not cleaned:
        raise ValueError("Lead name is required")
    if len(cleaned) > 200:
        raise ValueError("Lead name must be 200 characters or fewer")
    return cleaned


def _optional_text(limit: int, label: str):
    def check(value: Optional[str]) -> Optional[str]:
        cleaned = _clean(value)
        if cleaned and len(cleaned) > limit:
            raise ValueError(f"{label} must be {limit} characters or fewer")
        return cleaned
    return check


def _email(value: Optional[str]) -> Optional[str]:
    cleaned = _clean(value)
    if not cleaned:
        return None
    if len(cleaned) > 320 or not _EMAIL_SHAPE.match(cleaned):
        raise ValueError("Enter a valid email address")
    return cleaned


def _notes(value: Optional[str]) -> Optional[str]:
    if value is None:
        return None
    cleaned = str(value).strip()
    if len(cleaned) > 5000:
        raise ValueError("Notes must be 5,000 characters or fewer")
    return cleaned or None


def _source(value: Optional[str]) -> str:
    key = (value or "").strip().lower()
    if key not in LEAD_SOURCES:
        raise ValueError("Choose a lead source from the list")
    return key


def _status(value: Optional[str]) -> str:
    key = (value or "").strip().lower()
    if key not in LEAD_STATUSES:
        raise ValueError("Choose a status from the list")
    return key


class LeadCreate(BaseModel):
    name: str = Field(default=None, validate_default=True)
    company: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    # Checked even when missing, so the reason reads as the rule, not "Field required".
    source: str = Field(default=None, validate_default=True)
    status: str = "new"
    notes: Optional[str] = None

    _name = field_validator("name", mode="before")(_required_name)
    _company = field_validator("company", mode="before")(_optional_text(200, "Company"))
    _phone = field_validator("phone", mode="before")(_optional_text(40, "Phone"))
    _email_v = field_validator("email", mode="before")(_email)
    _notes_v = field_validator("notes", mode="before")(_notes)
    _source_v = field_validator("source", mode="before")(_source)
    _status_v = field_validator("status", mode="before")(_status)


class LeadUpdate(BaseModel):
    """Only the fields sent change. Name, source and status cannot be emptied."""

    name: Optional[str] = None
    company: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    source: Optional[str] = None
    status: Optional[str] = None
    notes: Optional[str] = None

    _name = field_validator("name", mode="before")(_required_name)
    _company = field_validator("company", mode="before")(_optional_text(200, "Company"))
    _phone = field_validator("phone", mode="before")(_optional_text(40, "Phone"))
    _email_v = field_validator("email", mode="before")(_email)
    _notes_v = field_validator("notes", mode="before")(_notes)
    _source_v = field_validator("source", mode="before")(_source)
    _status_v = field_validator("status", mode="before")(_status)


class LeadResponse(BaseModel):
    id: int
    name: str
    company: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    source: str
    status: str
    notes: Optional[str] = None
    created_by_id: Optional[int] = None
    created_by_name: Optional[str] = None
    created_at: datetime
    updated_at: datetime


class LeadListResponse(BaseModel):
    items: list[LeadResponse]
    total: int
    # How many leads match the search and source in each status (the status
    # filter itself left out), so the status tabs show their counts.
    status_counts: dict[str, int]
