"""Create the assistant_actions table when Alembic cannot be run.

The migration ``o0a1b2c3d4e5`` is the proper home for this table and should be
used wherever Alembic works. On this deployment it currently does not: the
database records a revision that is not present in the checked-out code, so
``alembic current`` and ``alembic upgrade`` both stop with "Can't locate
revision". Until that is reconciled, a migration cannot run at all.

The assistant's write tools need the table to exist or every change fails on a
missing relation. So this creates it directly from the model -- the same
definition the migration emits -- and does nothing when it is already there.

Safe to run repeatedly. It creates one table and touches nothing else.

    docker compose exec backend python scripts/ensure_assistant_actions.py
"""
from __future__ import annotations

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


def main() -> int:
    from sqlalchemy import inspect

    from app.db.base import engine
    from app.models.assistant_action import AssistantAction

    table = AssistantAction.__table__.name
    inspector = inspect(engine)

    if table in inspector.get_table_names():
        columns = {c["name"] for c in inspector.get_columns(table)}
        expected = {c.name for c in AssistantAction.__table__.columns}
        missing = expected - columns
        if missing:
            # Worth refusing rather than guessing: a half-built table from an
            # older attempt needs a person to decide what to do with its rows.
            print("{} exists but is missing {}.".format(
                table, ", ".join(sorted(missing))))
            print("Drop it and run this again if it holds nothing worth keeping.")
            return 1
        print("{} already exists with all {} columns. Nothing to do.".format(
            table, len(expected)))
        return 0

    AssistantAction.__table__.create(bind=engine, checkfirst=True)
    print("Created {}.".format(table))
    print("The assistant can now record what it proposes and what it changes.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
