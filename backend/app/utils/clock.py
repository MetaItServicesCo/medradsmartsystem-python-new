"""One definition of "today" for the facilities module.

Every timestamp in this codebase is written with `datetime.utcnow()`. A due
date computed from one of those and then compared against `date.today()` —
which is the *local* date — disagrees with itself for part of every day, on any
deployment whose server is not on UTC.

The consequences are small but real and entirely avoidable: a maintenance
schedule judged due a day early, a compliance task flipped overdue a day late,
a certificate reported expired before it is. Worse, they only show up during
the offset window, so they look like flakiness rather than a bug.

So the facilities code asks this module rather than the standard library, and
every part of it agrees on which day it is.
"""
from __future__ import annotations

from datetime import date, datetime


def utc_today() -> date:
    """The current date in UTC, matching how every timestamp here is written."""
    return datetime.utcnow().date()


def days_between(earlier: date, later: date) -> int:
    """Whole days from `earlier` to `later`; negative if the order is reversed."""
    return (later - earlier).days
