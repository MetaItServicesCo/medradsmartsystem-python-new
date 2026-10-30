"""The lease-to-own migration builds exactly what the models describe.

This database has been built both ways -- migrated through, and create_all()
then stamped -- so a migration that drifts from its model produces two
different production schemas depending on history. The check that catches
that is mechanical: run the migration, then compare every column, its
nullability and its type family against the SQLAlchemy model.

It also proves the migration is idempotent (a second run is a no-op, which is
what a stamped database needs) and that downgrade removes only its own tables.

    DATABASE_URL=sqlite:// python backend/tests/test_lease_migration.py
"""
from __future__ import annotations

import importlib.util
import os
import pathlib
import sys

os.environ.setdefault("DATABASE_URL", "sqlite://")
ROOT = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

import sqlalchemy as sa  # noqa: E402
from alembic.migration import MigrationContext  # noqa: E402
from alembic.operations import Operations  # noqa: E402
from alembic.config import Config  # noqa: E402
from alembic.script import ScriptDirectory  # noqa: E402

import app.models  # noqa: E402,F401
from app.db.base import Base  # noqa: E402

failures: list[str] = []


def ok(label: str, condition: bool, detail: str = "") -> None:
    print("{}  {}{}".format("PASS" if condition else "FAIL", label,
                            "  " + detail if detail else ""))
    if not condition:
        failures.append(label)


LEASE_TABLES = ("lease_agreements", "lease_installments", "lease_payment_authorizations")

spec = importlib.util.spec_from_file_location(
    "lease_migration", ROOT / "alembic" / "versions" / "c7d1e5a9b3f2_lease_to_own.py")
migration = importlib.util.module_from_spec(spec)
spec.loader.exec_module(migration)


def run(fn, engine):
    with engine.begin() as conn:
        ctx = MigrationContext.configure(conn)
        op = Operations(ctx)
        original = migration.op
        migration.op = op
        try:
            fn()
        finally:
            migration.op = original


def family(column_type) -> str:
    text = str(column_type).upper()
    for name in ("NUMERIC", "INTEGER", "BOOLEAN", "DATETIME", "DATE", "JSON", "TEXT", "VARCHAR"):
        if name in text:
            return "STRING" if name == "VARCHAR" else name
    return text


print("Lease migration")
print("=" * 72)

engine = sa.create_engine("sqlite://")
# Everything the lease tables point at, but not the lease tables themselves,
# so the migration has to create them.
Base.metadata.create_all(
    engine, tables=[t for t in Base.metadata.sorted_tables if t.name not in LEASE_TABLES])

print()
print("It creates the three tables")
print("-" * 72)
run(migration.upgrade, engine)
present = set(sa.inspect(engine).get_table_names())
for table in LEASE_TABLES:
    ok("{} exists".format(table), table in present)

print()
print("And every column matches the model")
print("-" * 72)
inspector = sa.inspect(engine)
for table in LEASE_TABLES:
    model_cols = {c.name: c for c in Base.metadata.tables[table].columns}
    db_cols = {c["name"]: c for c in inspector.get_columns(table)}
    missing = sorted(set(model_cols) - set(db_cols))
    extra = sorted(set(db_cols) - set(model_cols))
    ok("{}: no column the model has is missing".format(table), not missing, str(missing))
    ok("{}: no column the model lacks was added".format(table), not extra, str(extra))
    nullability = [
        name for name, col in model_cols.items()
        if name in db_cols and bool(col.nullable) != bool(db_cols[name]["nullable"])
        and not col.primary_key
    ]
    ok("{}: nullability agrees on every column".format(table), not nullability, str(nullability))
    types = [
        "{} model={} db={}".format(name, family(col.type), family(db_cols[name]["type"]))
        for name, col in model_cols.items()
        if name in db_cols and family(col.type) != family(db_cols[name]["type"])
        # Encrypted provider references are Text in the database by design.
        and not (family(db_cols[name]["type"]) == "TEXT" and "Encrypted" in type(col.type).__name__)
    ]
    ok("{}: type families agree".format(table), not types, "; ".join(types))

print()
print("Constraints that protect money are real")
print("-" * 72)
uniques = {tuple(u["column_names"]) for u in inspector.get_unique_constraints("lease_installments")}
ok("an installment number is unique per agreement", ("agreement_id", "number") in uniques, str(uniques))
ok("an invoice can back only one installment", ("invoice_id",) in uniques)
ok("a late-fee invoice can back only one installment", ("late_fee_invoice_id",) in uniques)
agreement_indexes = {i["name"]: i for i in inspector.get_indexes("lease_agreements")}
ok("agreement numbers are unique",
   agreement_indexes.get("ix_lease_agreements_agreement_number", {}).get("unique") in (1, True))
ok("a customer link token is unique",
   agreement_indexes.get("ix_lease_agreements_access_token_hash", {}).get("unique") in (1, True))
fks = {(f["referred_table"], tuple(f["constrained_columns"])) for f in inspector.get_foreign_keys("lease_installments")}
ok("installments belong to an agreement", ("lease_agreements", ("agreement_id",)) in fks)

print()
print("Running it again changes nothing")
print("-" * 72)
try:
    run(migration.upgrade, engine)
    ok("a second upgrade on a database that already has the tables is a no-op", True)
except Exception as exc:
    ok("a second upgrade on a database that already has the tables is a no-op", False, str(exc))

print()
print("It touches nothing that already existed")
print("-" * 72)
invoice_cols = {c["name"] for c in sa.inspect(engine).get_columns("invoices")}
ok("the invoices table is not altered",
   invoice_cols == {c.name for c in Base.metadata.tables["invoices"].columns})

print()
print("Downgrade removes only its own tables")
print("-" * 72)
before = set(sa.inspect(engine).get_table_names())
run(migration.downgrade, engine)
after = set(sa.inspect(engine).get_table_names())
ok("the three lease tables are gone", not (after & set(LEASE_TABLES)))
ok("  and nothing else was dropped", before - after == set(LEASE_TABLES), str(sorted(before - after)))

print()
print("The revision chain stays linear")
print("-" * 72)
script = ScriptDirectory.from_config(Config(str(ROOT / "alembic.ini")))
heads = script.get_heads()
ok("there is exactly one head", len(heads) == 1, str(heads))
ok("  and it is this migration", heads == ["c7d1e5a9b3f2"], str(heads))
ok("it follows the previous head", migration.down_revision == "o0a1b2c3d4e5")

print()
print("=" * 72)
if failures:
    print("{} failing: {}".format(len(failures), ", ".join(failures)))
    sys.exit(1)
print("All lease migration checks passed.")
