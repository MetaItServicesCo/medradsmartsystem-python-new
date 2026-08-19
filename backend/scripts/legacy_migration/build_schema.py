"""Create the target schema from the SQLAlchemy models.

The Alembic chain cannot build a database from scratch (no migration creates the
``quotation_payments`` table, yet a later migration alters it), so the migration's
target schema is defined by the model metadata. This creates every model table in
an empty target database.

Point it at the target with ``TARGET_DATABASE_URL`` (falls back to ``DATABASE_URL``)::

    TARGET_DATABASE_URL=postgresql+psycopg2://user:pass@127.0.0.1:5432/medrad_migration \
        python -m scripts.legacy_migration.build_schema
"""
from __future__ import annotations

import os

from sqlalchemy import create_engine, inspect

from app.db.base import Base
from app.models import *  # noqa: F401,F403  (registers every model on Base.metadata)


def main() -> None:
    url = os.environ.get("TARGET_DATABASE_URL") or os.environ.get("DATABASE_URL")
    if not url:
        raise SystemExit("TARGET_DATABASE_URL (or DATABASE_URL) is required")
    engine = create_engine(url)
    Base.metadata.create_all(engine)
    tables = inspect(engine).get_table_names()
    print(f"Created/verified {len(tables)} tables in database '{engine.url.database}'")


if __name__ == "__main__":
    main()
