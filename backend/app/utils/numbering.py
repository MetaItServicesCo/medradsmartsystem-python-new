"""Human-readable reference numbers that survive two people pressing save.

SR-000413 and INV-SERVICE-000087 were each produced the same way: read the
last row's id, add one, format it. That is a read and a write with a gap in
between, and the gap is where two technicians filing from the van at the same
moment both get 413. The column is unique, so the second insert raises
IntegrityError, nothing catches it, and one of them gets a 500 for doing
something entirely ordinary.

A database sequence would be the textbook answer and cannot be used here: it
needs a migration, and this deployment's Alembic chain is broken, so no
migration can run. What follows works on the schema as it stands.

Two changes. The candidate comes from the highest number actually in use
rather than from the last row's id -- those agree today only because nothing
has ever been deleted or imported, which is not a property worth relying on.
And the insert is attempted inside a SAVEPOINT, so a collision rolls back
just that attempt, picks the next number and tries again, leaving the
surrounding transaction intact. The unique constraint stops being a crash and
becomes the arbiter it was always meant to be: whoever commits first keeps
the number, and the loser quietly takes the next one.
"""
from __future__ import annotations

import logging
import re
from typing import Any, Optional

from fastapi import HTTPException, status
from sqlalchemy import func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session


logger = logging.getLogger("medrad.numbering")

# Enough to outlast any realistic burst. Every retry means somebody else
# committed in between, so needing eight is a different problem entirely.
MAX_ATTEMPTS = 8


def _highest(db: Session, column: Any, prefix: str) -> int:
    """The largest number already issued under this prefix, or zero."""
    pattern = prefix.replace("%", r"\%").replace("_", r"\_") + "%"
    highest = (
        db.query(func.max(column))
        .filter(column.like(pattern))
        .scalar()
    )
    if not highest:
        return 0
    match = re.search(r"(\d+)\s*$", str(highest))
    return int(match.group(1)) if match else 0


def assign_unique_number(
    db: Session,
    instance: Any,
    attribute: str,
    *,
    prefix: str,
    width: int = 6,
    attempts: int = MAX_ATTEMPTS,
) -> str:
    """Give *instance* the next free reference and insert it, retrying on clash.

    The instance must not already have been added to the session: each attempt
    adds it inside its own SAVEPOINT so a failed one leaves nothing behind.

    Returns the number that was actually used. Raises 503 only if every
    attempt collided, which means sustained contention rather than a race.
    """
    model = type(instance)
    column = getattr(model, attribute)

    for attempt in range(attempts):
        number = "{}{:0{}d}".format(prefix, _highest(db, column, prefix) + 1, width)
        setattr(instance, attribute, number)

        savepoint = db.begin_nested()
        db.add(instance)
        try:
            db.flush()
        except IntegrityError:
            savepoint.rollback()
            if attempt == 0:
                # Worth one line: it is the signature of real concurrency and
                # otherwise completely invisible, because the retry works.
                logger.info("Reference %s was taken; retrying", number)
            continue
        savepoint.commit()
        return number

    logger.error("Could not allocate a reference under %s after %d attempts",
                 prefix, attempts)
    raise HTTPException(
        status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
        detail="The system is busy issuing reference numbers. Please try again.",
    )


def peek_next_number(db: Session, column: Any, prefix: str,
                     width: int = 6) -> str:
    """The number that would be issued next. For display only.

    Deliberately separate from assigning one. Nothing may create a record from
    this: by the time it is used somebody else may hold it, which is the bug
    this module exists to remove.
    """
    return "{}{:0{}d}".format(prefix, _highest(db, column, prefix) + 1, width)
