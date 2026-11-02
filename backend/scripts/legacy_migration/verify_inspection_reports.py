"""Read-only check that every migrated inspection report matches its legacy original.

Each migrated inspection keeps the complete legacy report row it came from in
``form_data.legacy_report``. This compares what the report screen and the
printout show against that original, field by field:

* the nine standard checks and the device checklist answers,
* the Biomed Notes (reported problem, problem found, corrective action, summary),
* the standard readings (Set / Read, Battery and PM Kit Replaced on / Due),
* every measurement reading,
* the corrective-actions column, and that the compliance field holds no raw HTML,
* that every recorded answer has a field on its form, so it can be seen.

Reports a technician has opened and saved in the app since the migration are
counted separately and not compared, because their content is now the
technician's. Nothing is written::

    python -m scripts.legacy_migration.verify_inspection_reports

Run it after ``fix_inspection_forms --apply``; it exits 1 if anything differs.
"""
from __future__ import annotations

import argparse
import collections
import json
import os
import sys
from typing import Any, Iterable

from sqlalchemy import MetaData, create_engine, select

from .form_convert import ANSWER_BLOCK_ID, extract_answers
from .operational import OperationalWriter
from .writer import SOURCE_SYSTEM


def _as_dict(value: Any) -> dict[str, Any]:
    if isinstance(value, dict):
        return value
    if isinstance(value, str) and value.strip():
        try:
            parsed = json.loads(value)
        except ValueError:
            return {}
        return parsed if isinstance(parsed, dict) else {}
    return {}


def _norm(value: Any) -> str:
    return " ".join(str(value or "").split())


def form_field_keys(schema: dict[str, Any]) -> set[str] | None:
    """Answer keys a grid form can show, or None for a form that is not a grid."""
    grid = (schema or {}).get("custom_grid") or {}
    if not isinstance(grid.get("cells"), list):
        return None
    keys: set[str] = set()
    for row in grid["cells"]:
        for cell in row:
            for block in cell.get("blocks") or []:
                keys.add("{}__{}".format(cell.get("id"), block.get("id") or ANSWER_BLOCK_ID))
            keys.add(str(cell.get("id")))
    return keys


def compare(form_data: dict[str, Any], corrective_actions: Any, compliance: Any,
            form_keys: set[str] | None) -> tuple[list[tuple[str, str]], list[str]]:
    """Differences between a migrated report and its legacy original.

    Returns ``(problems, unseen)``: each problem is ``(kind, detail)``; unseen
    are recorded answer keys that have no field on the form (their values are
    still stored, in the report and in the legacy original).
    """
    legacy = form_data.get("legacy_report") or {}
    tests = legacy.get("tests") or ""
    expected = OperationalWriter._report_fields(legacy)
    problems: list[tuple[str, str]] = []

    checks = form_data.get("checks") or {}
    for key, value in (expected.get("checks") or {}).items():
        if checks.get(key) != value:
            problems.append(("standard check", "{}: legacy {} / report {}".format(key, value, checks.get(key))))

    notes = form_data.get("diagnostics") or {}
    for key, value in (expected.get("diagnostics") or {}).items():
        if value and _norm(notes.get(key)) != _norm(value):
            problems.append(("biomed note", "{}: legacy {!r} / report {!r}".format(key, value[:60], str(notes.get(key) or "")[:60])))

    rows = form_data.get("measurements") or []
    for index, row in enumerate(expected.get("measurements") or []):
        actual = rows[index] if index < len(rows) and isinstance(rows[index], dict) else {}
        for field in ("set_value", "read_value"):
            if row[field] and _norm(actual.get(field)) != _norm(row[field]):
                problems.append(("standard reading", "{} {}: legacy {!r} / report {!r}".format(
                    row["name"], field, row[field], actual.get(field))))
    for section in ("battery", "pm_kit"):
        for field, value in (expected.get(section) or {}).items():
            if value and _norm((form_data.get(section) or {}).get(field)) != _norm(value):
                problems.append(("standard reading", "{} {}: legacy {!r} / report {!r}".format(
                    section, field, value, (form_data.get(section) or {}).get(field))))

    values = form_data.get("custom_grid_values") or {}
    unseen: list[str] = []
    for key, value in extract_answers(tests).items():
        if _norm(values.get(key)) != _norm(value):
            problems.append(("checklist answer", "{}: legacy {!r} / report {!r}".format(key, value, values.get(key))))
        if form_keys is not None and key not in form_keys:
            unseen.append(key)

    legacy_action = legacy.get("action") or legacy.get("f_fault")
    if _norm(legacy_action) and _norm(corrective_actions) != _norm(legacy_action):
        problems.append(("corrective actions", "legacy {!r} / report {!r}".format(
            str(legacy_action)[:60], str(corrective_actions or "")[:60])))
    if compliance and tests and compliance == tests:
        problems.append(("compliance field", "still holds the raw legacy checklist HTML"))
    return problems, unseen


def verify(rows: Iterable[tuple], form_keys_by_id: dict[int, set[str] | None], report: dict[str, Any]) -> None:
    """Tally a run over ``(number, form_id, form_data, corrective_actions, compliance)`` rows."""
    for number, form_id, raw_form_data, corrective_actions, compliance in rows:
        form_data = _as_dict(raw_form_data)
        if form_data.get("source") != SOURCE_SYSTEM:
            continue
        report["migrated"] += 1
        if not isinstance(form_data.get("legacy_report"), dict):
            report["no_legacy_report"] += 1
            continue
        if "form_template" in form_data:
            # Saved through the app's report screen since the migration.
            report["edited_in_app"] += 1
            continue
        problems, unseen = compare(form_data, corrective_actions, compliance, form_keys_by_id.get(form_id))
        report["compared"] += 1
        if problems:
            report["mismatched"] += 1
            for kind, detail in problems:
                report["by_kind"][kind] += 1
                if len(report["examples"][kind]) < 10:
                    report["examples"][kind].append("{}  {}".format(number, detail))
        else:
            report["matched"] += 1
        if unseen:
            report["reports_with_unseen"] += 1
            report["unseen_answers"] += len(unseen)
            report["unseen_by_form"][form_id] += len(unseen)


def new_report() -> dict[str, Any]:
    return {
        "migrated": 0, "no_legacy_report": 0, "edited_in_app": 0, "compared": 0, "matched": 0,
        "mismatched": 0, "by_kind": collections.Counter(), "examples": collections.defaultdict(list),
        "reports_with_unseen": 0, "unseen_answers": 0, "unseen_by_form": collections.Counter(),
    }


def print_report(report: dict[str, Any], form_names: dict[int, str]) -> None:
    print("migrated inspections: {}".format(report["migrated"]))
    print("  without a legacy report (scheduled, never performed): {}".format(report["no_legacy_report"]))
    print("  opened and saved in the app since the migration (not compared): {}".format(report["edited_in_app"]))
    print("  compared with their legacy original: {}".format(report["compared"]))
    print("    match exactly: {}".format(report["matched"]))
    print("    differ: {}".format(report["mismatched"]))
    for kind, count in report["by_kind"].most_common():
        print("      {:<20} {}".format(kind, count))
        for example in report["examples"][kind]:
            print("        {}".format(example))
    print("  recorded answers with no field on their form: {} (in {} reports)".format(
        report["unseen_answers"], report["reports_with_unseen"]))
    for form_id, count in report["unseen_by_form"].most_common(10):
        print("      form {:>5} {:<40} {}".format(form_id, form_names.get(form_id, "")[:40], count))


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("--database-url", default=os.environ.get("DATABASE_URL"), help="defaults to $DATABASE_URL")
    args = parser.parse_args(argv)
    if not args.database_url:
        parser.error("set DATABASE_URL or pass --database-url")
    engine = create_engine(args.database_url)
    report = new_report()
    with engine.connect() as conn:
        meta = MetaData()
        meta.reflect(conn, only=["inspection_forms", "inspections"])
        forms, inspections = meta.tables["inspection_forms"], meta.tables["inspections"]
        form_keys, form_names = {}, {}
        for form_id, name, schema in conn.execute(select(forms.c.id, forms.c.name, forms.c.schema)):
            form_keys[form_id] = form_field_keys(_as_dict(schema))
            form_names[form_id] = (name or "").strip()
        stream = conn.execute(select(
            inspections.c.inspection_number, inspections.c.form_template_id, inspections.c.form_data,
            inspections.c.corrective_actions, inspections.c.compliance_requirement,
        ).execution_options(stream_results=True))
        verify(stream, form_keys, report)
    print_report(report, form_names)
    return 1 if report["mismatched"] else 0


if __name__ == "__main__":
    sys.exit(main())
