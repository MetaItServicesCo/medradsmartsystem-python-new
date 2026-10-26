"""Diff a freshly imported database against the one already in production.

Every other check compares the import against the legacy system. This one
compares it against the last import, which is a different and in some ways
better question: production has been accepted since August, so anything the
new run does differently is either explained by ten weeks of legacy activity
or is a regression in the import itself.

Rows are matched on their *legacy* id, read from ``legacy_migration.id_map``
on both sides, because every target id changes between runs.

Three outcomes, and they mean different things:

* **missing** -- present in production, absent from the new import. Always a
  failure. Legacy rows do not disappear, so the import lost something it
  managed to carry last time.
* **new** -- absent from production, present now. Expected: it is what ten
  weeks of work in the legacy system looks like, and roughly the number the
  audit predicts.
* **changed** -- present in both with different values. Which is fine depends
  entirely on the column. A service request that moved from open to closed is
  the whole point of re-importing. A serial number or an invoice number that
  changed is the import deciding something different about the same row, and
  that is a fault.

So columns are declared as identity or mutable, and only identity drift
fails. Treating every difference as a failure would bury the one that matters
under three thousand that do not.

    BASELINE_DATABASE_URL=postgresql://...  # production, known good
    CANDIDATE_DATABASE_URL=postgresql://... # the rebuilt database
    python scripts/compare_imports.py --output /tmp/compare.json
"""
from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path
from typing import Any

from sqlalchemy import create_engine, text
from sqlalchemy.engine import Engine

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from scripts.legacy_migration.writer import SOURCE_SYSTEM  # noqa: E402


class Subject:
    """One entity, and what it means for its columns to differ."""

    def __init__(self, entity: str, table: str,
                 identity: tuple[str, ...], mutable: tuple[str, ...] = ()):
        self.entity = entity
        self.table = table
        self.identity = identity
        self.mutable = mutable

    @property
    def columns(self) -> tuple[str, ...]:
        return self.identity + self.mutable


SUBJECTS: tuple[Subject, ...] = (
    Subject("facility", "facilities", ("name",), ("city", "state", "status")),
    Subject("user", "users", ("username", "email"), ("role", "is_active")),
    Subject("equipment", "equipment",
            ("asset_tag", "serial_number"), ("make", "model", "facility_id")),
    Subject("part", "inventory_parts", ("part_number",), ("name",)),
    Subject("service_request", "service_requests",
            ("request_number",), ("status", "priority")),
    Subject("inspection", "inspections",
            ("inspection_number",), ("status", "result")),
    Subject("invoice", "invoices",
            ("invoice_number",), ("status", "total_amount", "amount_paid")),
)


def _by_legacy_id(engine: Engine, subject: Subject) -> dict[int, tuple[Any, ...]]:
    """Every mapped row of this entity, keyed on the legacy id it came from."""
    columns = ", ".join("t.{}".format(c) for c in subject.columns)
    sql = text(
        "SELECT m.legacy_id, {} FROM {} t "
        "JOIN legacy_migration.id_map m ON m.target_id = t.id "
        " AND m.entity = :entity AND m.source_system = :source"
        .format(columns, subject.table)
    )
    with engine.connect() as connection:
        rows = connection.execute(
            sql, {"entity": subject.entity, "source": SOURCE_SYSTEM}).all()
    # str() throughout: the two databases can disagree about Decimal scale or
    # enum representation without disagreeing about the value, and a report
    # full of 10.00 vs 10.0 is a report nobody reads twice.
    return {int(r[0]): tuple("" if v is None else str(v) for v in r[1:]) for r in rows}


def compare(baseline: Engine, candidate: Engine) -> dict[str, Any]:
    results: dict[str, Any] = {}
    failed = False

    for subject in SUBJECTS:
        try:
            old = _by_legacy_id(baseline, subject)
            new = _by_legacy_id(candidate, subject)
        except Exception as exc:  # noqa: BLE001
            results[subject.entity] = {
                "error": "{}: {}".format(type(exc).__name__, str(exc)[:200])}
            failed = True
            continue

        missing = sorted(set(old) - set(new))
        added = sorted(set(new) - set(old))

        identity_drift: list[dict[str, Any]] = []
        changed_counts: dict[str, int] = {c: 0 for c in subject.mutable}
        identity_width = len(subject.identity)

        for legacy_id in set(old) & set(new):
            before, after = old[legacy_id], new[legacy_id]
            for index, column in enumerate(subject.identity):
                if before[index] != after[index]:
                    if len(identity_drift) < 20:
                        identity_drift.append({
                            "legacy_id": legacy_id, "column": column,
                            "production": before[index], "rebuilt": after[index],
                        })
            for offset, column in enumerate(subject.mutable):
                index = identity_width + offset
                if before[index] != after[index]:
                    changed_counts[column] += 1

        entity_ok = not missing and not identity_drift
        failed = failed or not entity_ok
        results[subject.entity] = {
            "ok": entity_ok,
            "in_production": len(old),
            "in_rebuild": len(new),
            "missing_from_rebuild": len(missing),
            "missing_examples": missing[:20],
            "new_since_production": len(added),
            "identity_columns_that_drifted": len(identity_drift),
            "identity_drift_examples": identity_drift,
            "mutable_columns_that_changed": {
                c: n for c, n in changed_counts.items() if n},
        }

    return {"status": "failed" if failed else "passed", "entities": results}


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()

    baseline_url = os.environ.get("BASELINE_DATABASE_URL", "").strip()
    candidate_url = os.environ.get("CANDIDATE_DATABASE_URL", "").strip()
    if not baseline_url or not candidate_url:
        raise SystemExit(
            "Set BASELINE_DATABASE_URL (production) and CANDIDATE_DATABASE_URL "
            "(the rebuilt database). Both are read with SELECT only."
        )
    if baseline_url == candidate_url:
        raise SystemExit(
            "Both URLs point at the same database, which would compare it "
            "with itself and pass."
        )

    report = compare(create_engine(baseline_url, pool_pre_ping=True),
                     create_engine(candidate_url, pool_pre_ping=True))

    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, indent=2, default=str),
                           encoding="utf-8")

    print("Comparison: {}".format(report["status"].upper()))
    print("{:<18} {:>10} {:>10} {:>9} {:>7} {:>8}".format(
        "entity", "production", "rebuilt", "missing", "new", "drifted"))
    for entity, info in report["entities"].items():
        if "error" in info:
            print("{:<18} {}".format(entity, info["error"]))
            continue
        print("{:<18} {:>10} {:>10} {:>9} {:>7} {:>8}".format(
            entity, info["in_production"], info["in_rebuild"],
            info["missing_from_rebuild"], info["new_since_production"],
            info["identity_columns_that_drifted"]))
    print()
    print("Wrote {}".format(args.output))
    print("'new' is expected -- it is ten weeks of legacy activity.")
    print("'missing' and 'drifted' are not, and are what this exists to find.")
    return 0 if report["status"] == "passed" else 1


if __name__ == "__main__":
    sys.exit(main())
