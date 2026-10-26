"""Prove the two checks that stand between a re-import and trusting it.

`validate-operational` reconciles money and operational counts well, and does
not look at the foundation phase at all -- facilities, users and 7,258
equipment records go unverified. These are the two checks that close that,
and both have to be shown to fail when they should, not merely to pass on
good data. A check that cannot fail is the most expensive kind.

Two properties matter most here and neither is obvious:

* equipment totals can match exactly while every asset sits at the wrong
  hospital, so the foundation check compares the per-facility distribution
  and not just the count
* a re-import legitimately differs from production in thousands of places,
  because the legacy system kept running, so the comparison separates a
  record that *moved on* from a record that the import got *wrong*

    DATABASE_URL=sqlite:// python backend/tests/test_import_verification.py
"""
from __future__ import annotations

import os
import pathlib
import sys

os.environ.setdefault("DATABASE_URL", "sqlite://")
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))

from sqlalchemy import create_engine, text  # noqa: E402
from sqlalchemy.pool import StaticPool  # noqa: E402

from scripts.compare_imports import compare  # noqa: E402
# The same constant the writer stamps rows with. Spelling it out here
# instead is how the real tools came to filter on a value nothing had
# ever written, and report every entity as zero.
from scripts.legacy_migration.writer import SOURCE_SYSTEM  # noqa: E402
from scripts.legacy_migration.foundation_validation import (  # noqa: E402
    build_foundation_validation,
)


failures: list[str] = []


def ok(label: str, condition: bool, detail: str = "") -> None:
    print("{}  {}{}".format("PASS" if condition else "FAIL", label,
                            "  " + detail if detail else ""))
    if not condition:
        failures.append(label)


def sqlite_engine():
    return create_engine("sqlite://", connect_args={"check_same_thread": False},
                         poolclass=StaticPool)


def run(engine, *statements):
    with engine.begin() as conn:
        for statement in statements:
            conn.execute(text(statement))


# ---------------------------------------------------------------------------
# A legacy database, and a target built from it
# ---------------------------------------------------------------------------

def legacy_db(inventory_rows, orphan_rows=0):
    eng = sqlite_engine()
    run(eng,
        "CREATE TABLE facilities (id INTEGER PRIMARY KEY)",
        "CREATE TABLE facility_tiers (id INTEGER PRIMARY KEY)",
        "CREATE TABLE modalities (id INTEGER PRIMARY KEY)",
        "CREATE TABLE sub_modalities (id INTEGER PRIMARY KEY)",
        "CREATE TABLE users (id INTEGER PRIMARY KEY)",
        "CREATE TABLE facility_users (id INTEGER PRIMARY KEY, facility_id INTEGER)",
        "CREATE TABLE parts (id INTEGER PRIMARY KEY)",
        "CREATE TABLE inventories (id INTEGER PRIMARY KEY, facility_id INTEGER)")
    with eng.begin() as conn:
        for fid in (1, 2):
            conn.execute(text("INSERT INTO facilities (id) VALUES (:i)"), {"i": fid})
        for table in ("facility_tiers", "modalities", "sub_modalities",
                      "users", "parts"):
            conn.execute(text("INSERT INTO {} (id) VALUES (1)".format(table)))
        # A contact at a real facility: bounded, not required, because the
        # migration also drops contacts whose user cannot be resolved.
        conn.execute(text(
            "INSERT INTO facility_users (id, facility_id) VALUES (1, 1)"))
        inv = 0
        for facility_id, count in inventory_rows.items():
            for _ in range(count):
                inv += 1
                conn.execute(
                    text("INSERT INTO inventories (id, facility_id) VALUES (:i,:f)"),
                    {"i": inv, "f": facility_id})
        # Inventories whose facility never migrated: dropped by the import on
        # purpose, and the check must report rather than fail on them.
        for _ in range(orphan_rows):
            inv += 1
            conn.execute(
                text("INSERT INTO inventories (id, facility_id) VALUES (:i, 99)"),
                {"i": inv})
    return eng


def target_db(equipment_placement):
    """equipment_placement: {legacy_equipment_id: legacy_facility_id}"""
    eng = sqlite_engine()
    run(eng,
        "ATTACH DATABASE ':memory:' AS legacy_migration",
        "CREATE TABLE legacy_migration.id_map (source_system TEXT, entity TEXT,"
        " legacy_id BIGINT, target_id BIGINT)",
        "CREATE TABLE facilities (id INTEGER PRIMARY KEY, name TEXT, city TEXT,"
        " state TEXT, status TEXT)",
        "CREATE TABLE users (id INTEGER PRIMARY KEY, username TEXT, email TEXT,"
        " role TEXT, is_active INTEGER)",
        "CREATE TABLE equipment (id INTEGER PRIMARY KEY, asset_tag TEXT,"
        " serial_number TEXT, make TEXT, model TEXT, facility_id INTEGER)",
        "CREATE TABLE legacy_migration.quarantine (source_system TEXT, entity TEXT)",
        # The comparison covers every entity, so a table it expects and cannot
        # find is a genuine error -- which means the fixture has to provide
        # them all, even empty.
        # Mirrors the real table: part_number and description, no "name".
        "CREATE TABLE inventory_parts (id INTEGER PRIMARY KEY, part_number TEXT,"
        " description TEXT)",
        "CREATE TABLE service_requests (id INTEGER PRIMARY KEY,"
        " request_number TEXT, status TEXT, priority TEXT)",
        "CREATE TABLE inspections (id INTEGER PRIMARY KEY,"
        " inspection_number TEXT, status TEXT, result TEXT)",
        "CREATE TABLE invoices (id INTEGER PRIMARY KEY, invoice_number TEXT,"
        " status TEXT, total_amount NUMERIC, amount_paid NUMERIC)")

    with eng.begin() as conn:
        def record(entity, legacy_id, target_id):
            conn.execute(text(
                "INSERT INTO legacy_migration.id_map VALUES (:s,:e,:l,:t)"),
                {"s": SOURCE_SYSTEM, "e": entity, "l": legacy_id,
                 "t": target_id})

        # Target ids deliberately offset, so anything keyed on them breaks.
        for legacy_fid, target_fid in ((1, 501), (2, 502)):
            conn.execute(text(
                "INSERT INTO facilities (id, name, city, state, status)"
                " VALUES (:i, :n, 'Houston', 'TX', 'active')"),
                {"i": target_fid, "n": "Site {}".format(legacy_fid)})
            record("facility", legacy_fid, target_fid)
        for table, entity in (("facility_tiers", "tier"),
                              ("modalities", "modality"),
                              ("sub_modalities", "sub_modality"),
                              ("parts", "part")):
            record(entity, 1, 900)
        conn.execute(text(
            "INSERT INTO users (id, username, email, role, is_active)"
            " VALUES (701, 'legacy_user', 'u@x.test', 'EMPLOYEE', 1)"))
        record("user", 1, 701)
        conn.execute(text(
            "INSERT INTO users (id, username, email, role, is_active)"
            " VALUES (702, 'a_contact', 'c@x.test', 'CLIENT', 1)"))
        record("facility_contact", 1, 702)

        for legacy_eid, legacy_fid in equipment_placement.items():
            target_eid = 800 + legacy_eid
            conn.execute(text(
                "INSERT INTO equipment (id, asset_tag, serial_number, make,"
                " model, facility_id) VALUES (:i,:a,:s,'Acme','M1',:f)"),
                {"i": target_eid, "a": "AT-{}".format(legacy_eid),
                 "s": "SN-{}".format(legacy_eid),
                 "f": 500 + legacy_fid})
            record("equipment", legacy_eid, target_eid)
    return eng


print("Verifying an import")
print("=" * 72)
print()
print("Foundation reconciliation, on a correct import")
print("-" * 72)

# Three assets at facility 1, two at facility 2.
placement = {1: 1, 2: 1, 3: 1, 4: 2, 5: 2}
good = build_foundation_validation(legacy_db({1: 3, 2: 2}), target_db(placement))

ok("it passes", good["status"] == "passed",
   str([k for k, v in good["checks"].items() if not v]))
ok("equipment is counted", good["target_mapped_counts"]["equipment"] == 5)
ok("users and contacts are counted separately",
   good["target_mapped_counts"]["user"] == 1
   and good["target_mapped_counts"]["facility_contact"] == 1)
ok("every facility's distribution was compared",
   good["equipment_distribution"]["facilities_compared"] == 2)

print()
print("It notices equipment that went missing")
print("-" * 72)

short = build_foundation_validation(
    legacy_db({1: 3, 2: 2}), target_db({1: 1, 2: 1, 3: 1, 4: 2}))
ok("the count check fails", short["checks"]["equipment_count"] is False)
ok("and the whole run fails", short["status"] == "failed")

print()
print("It notices equipment at the wrong hospital -- the point of the check")
print("-" * 72)

# Same five assets, same total. One moved from facility 1 to facility 2.
misplaced = build_foundation_validation(
    legacy_db({1: 3, 2: 2}), target_db({1: 1, 2: 1, 3: 2, 4: 2, 5: 2}))

ok("the total still matches, so counting alone would pass",
   misplaced["checks"]["equipment_count"] is True)
ok("the distribution check fails",
   misplaced["checks"]["equipment_sits_at_the_right_facility"] is False)
ok("and the run fails", misplaced["status"] == "failed")
ok("it names which facilities disagree",
   misplaced["equipment_distribution"]["facilities_with_a_different_count"] == 2,
   str(misplaced["equipment_distribution"]["examples"]))

print()
print("A dropped inventory is reported, not failed")
print("-" * 72)

orphans = build_foundation_validation(
    legacy_db({1: 3, 2: 2}, orphan_rows=4), target_db(placement))
ok("the run still passes", orphans["status"] == "passed",
   str([k for k, v in orphans["checks"].items() if not v]))
ok("and the loss is counted for somebody to judge",
   orphans["known_losses"]["inventories_at_an_unmigrated_facility"] == 4)

print()
print("Contacts are bounded, not required")
print("-" * 72)

# The migration drops a facility contact whose user cannot be resolved, and
# that depends on duplicate-email handling no query here can predict. So the
# source is an upper bound: fewer is reported, more is a fault.
def legacy_with_contacts(count):
    eng = legacy_db({1: 3, 2: 2})
    with eng.begin() as conn:
        for extra in range(2, count + 1):
            conn.execute(text(
                "INSERT INTO facility_users (id, facility_id) VALUES (:i, 1)"),
                {"i": extra})
    return eng


short_contacts = build_foundation_validation(
    legacy_with_contacts(3), target_db(placement))
ok("fewer contacts than the source does not fail",
   short_contacts["status"] == "passed",
   str([k for k, v in short_contacts["checks"].items() if not v]))
ok("and the shortfall is reported",
   short_contacts["known_losses"]["bounded_entities_short_of_their_source"]
   == {"facility_contact": 2},
   str(short_contacts["known_losses"]["bounded_entities_short_of_their_source"]))

doubled = target_db(placement)
with doubled.begin() as conn:
    conn.execute(text(
        "INSERT INTO users (id, username, email, role, is_active)"
        " VALUES (703, 'dupe', 'd@x.test', 'CLIENT', 1)"))
    conn.execute(text(
        "INSERT INTO legacy_migration.id_map"
        " VALUES (:s,'facility_contact',2,703)"), {"s": SOURCE_SYSTEM})
too_many = build_foundation_validation(legacy_db({1: 3, 2: 2}), doubled)
ok("more contacts than the source does fail",
   too_many["checks"]["facility_contact_within_bound"] is False)


# ---------------------------------------------------------------------------
# Production vs a rebuild
# ---------------------------------------------------------------------------
print()
print("Comparing a rebuild against production")
print("-" * 72)

production = target_db({1: 1, 2: 1, 3: 2})


def rebuilt(**changes):
    eng = target_db({1: 1, 2: 1, 3: 2, 4: 2})     # one new asset since August
    if changes.get("drop"):
        with eng.begin() as conn:
            conn.execute(text("DELETE FROM equipment WHERE id = 802"))
            conn.execute(text(
                "DELETE FROM legacy_migration.id_map"
                " WHERE entity='equipment' AND legacy_id=2"))
    if changes.get("identity"):
        with eng.begin() as conn:
            conn.execute(text(
                "UPDATE equipment SET serial_number='CHANGED' WHERE id = 801"))
    if changes.get("mutable"):
        with eng.begin() as conn:
            conn.execute(text("UPDATE equipment SET model='M2' WHERE id = 801"))
    return eng


clean = compare(production, rebuilt())
eq = clean["entities"]["equipment"]
ok("a rebuild with only new rows passes", clean["status"] == "passed",
   str(eq))
ok("the new asset is reported as new", eq["new_since_production"] == 1)
ok("nothing is reported missing", eq["missing_from_rebuild"] == 0)

gone = compare(production, rebuilt(drop=True))
ok("a row production had and the rebuild lost fails",
   gone["status"] == "failed")
ok("and it says which legacy id",
   gone["entities"]["equipment"]["missing_examples"] == [2],
   str(gone["entities"]["equipment"]["missing_examples"]))

drifted = compare(production, rebuilt(identity=True))
ok("a changed serial number fails", drifted["status"] == "failed")
ok("and it shows both values",
   drifted["entities"]["equipment"]["identity_drift_examples"][0]["rebuilt"]
   == "CHANGED",
   str(drifted["entities"]["equipment"]["identity_drift_examples"][:1]))

moved_on = compare(production, rebuilt(mutable=True))
ok("a changed model does NOT fail -- legacy moved on",
   moved_on["status"] == "passed")
ok("but it is counted so somebody can look",
   moved_on["entities"]["equipment"]["mutable_columns_that_changed"]
   == {"model": 1},
   str(moved_on["entities"]["equipment"]["mutable_columns_that_changed"]))

print()
print("It will not compare a database with itself")
print("-" * 72)

same = compare(production, production)
ok("that passes, which is why the CLI refuses the same URL twice",
   same["status"] == "passed")


print()
print("=" * 72)
if failures:
    print("{} failing: {}".format(len(failures), ", ".join(failures)))
    sys.exit(1)
print("All import verification checks passed.")
