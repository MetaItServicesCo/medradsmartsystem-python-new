"""One-off correction of the migrated legacy inspection forms already in a database.

The legacy migration copied each old form's whole page into the converted
form, including the nine standard checks and the Biomed Notes block that the
report screen already provides itself. So those appeared twice, and the note
captions had no box to type in. The migration code is fixed; this applies the
same correction to the data a past run produced. It changes only:

* forms the migration produced that nobody has edited since
  (``schema.source == "legacy_pm_desc"``): the duplicated cells are removed,
  every other cell keeps its id, so recorded answers still line up;
* the generated "Legacy Clinical Engineering Report" template: its sections
  are given the format the report screen reads;
* inspections migrated from the legacy system: their standard checks and
  notes are filled into the report's own fields from the preserved legacy
  report, only where those fields are empty, and the raw checklist HTML is
  removed from the compliance field when that is exactly what it holds;
* any inspection on a corrected form: an answer recorded in a removed
  duplicate cell is carried to the report's own field, so nothing a
  technician entered disappears. It replaces only an empty field or the
  table's starting "pass"; a "fail" or "n/a" already there is kept. Each case
  is listed in the dry run.

It runs in one transaction and writes nothing unless ``--apply`` is given::

    python -m scripts.legacy_migration.fix_inspection_forms            # dry run
    python -m scripts.legacy_migration.fix_inspection_forms --apply    # write

Back the database up first. Running it again after ``--apply`` finds nothing
left to change.
"""
from __future__ import annotations

import argparse
import copy
import json
import os
import sys
from typing import Any

from sqlalchemy import MetaData, create_engine, select, update

from .form_convert import (
    ANSWER_BLOCK_ID,
    NOTE_INPUT_NAMES,
    clean_grid_schema,
    extract_standard_checks,
    standard_check_key,
)
from .operational import LEGACY_REPORT_SCHEMA, OperationalWriter
from .writer import SOURCE_SYSTEM

# The legacy notes inputs and the report field each one belongs to.
NOTE_INPUT_FIELDS = {"temp_r_fault": "reported_problem", "temp_p_fault": "problem_found"}
assert set(NOTE_INPUT_FIELDS) == NOTE_INPUT_NAMES


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


def _check_value(raw: Any) -> str | None:
    value = str(raw or "").strip().lower()
    value = "na" if value in ("n/a", "na") else value
    return value if value in ("pass", "fail", "na") else None


def _item_cells(schema: dict[str, Any]) -> dict[str, dict[str, Any]]:
    grid = schema.get("custom_grid") or {}
    return {
        cell["id"]: cell
        for row in grid.get("cells") or []
        for cell in row
        if str(cell.get("id") or "").startswith("item_")
    }


def _removed_targets(old: dict[str, Any], new: dict[str, Any]) -> dict[str, tuple[str, str]]:
    """Removed cell id -> ("check", check key) or ("note", diagnostics key)."""
    old_cells, new_cells = _item_cells(old), _item_cells(new)
    targets: dict[str, tuple[str, str]] = {}
    for cell_id in set(old_cells) - set(new_cells):
        block = (old_cells[cell_id].get("blocks") or [{}])[0]
        name = cell_id[len("item_"):]
        if block.get("type") == "radio" and standard_check_key(block.get("label") or ""):
            targets[cell_id] = ("check", standard_check_key(block.get("label") or ""))
        elif name in NOTE_INPUT_FIELDS:
            targets[cell_id] = ("note", NOTE_INPUT_FIELDS[name])
    return targets


def correct(conn, report: dict[str, Any]) -> None:
    meta = MetaData()
    meta.reflect(conn, only=["inspection_forms", "inspections"])
    forms, inspections = meta.tables["inspection_forms"], meta.tables["inspections"]

    removed_by_form: dict[int, dict[str, tuple[str, str]]] = {}
    for form_id, name, raw_schema in conn.execute(select(forms.c.id, forms.c.name, forms.c.schema)).all():
        schema = _as_dict(raw_schema)
        if (
            name == LEGACY_REPORT_SCHEMA["title"]
            and schema.get("source") == SOURCE_SYSTEM
            and any(isinstance(section, str) for section in schema.get("sections") or [])
        ):
            conn.execute(update(forms).where(forms.c.id == form_id).values(schema=copy.deepcopy(LEGACY_REPORT_SCHEMA)))
            report["templates_fixed"].append(name)
            continue
        cleaned, removed = clean_grid_schema(schema)
        if cleaned is schema:
            continue
        removed_by_form[form_id] = _removed_targets(schema, cleaned)
        conn.execute(update(forms).where(forms.c.id == form_id).values(schema=cleaned))
        report["forms_cleaned"].append((form_id, name.strip(), len(removed)))

    rows = conn.execute(select(
        inspections.c.id, inspections.c.inspection_number, inspections.c.form_template_id,
        inspections.c.form_data, inspections.c.compliance_requirement,
    )).all()
    for inspection_id, number, form_id, raw_form_data, compliance in rows:
        form_data = _as_dict(raw_form_data)
        if not form_data:
            continue
        data = copy.deepcopy(form_data)
        values: dict[str, Any] = {}
        legacy = data.get("legacy_report") if data.get("source") == SOURCE_SYSTEM else None

        if isinstance(legacy, dict):
            fields = OperationalWriter._report_fields(legacy)
            for key in ("checks", "diagnostics"):
                if key in fields and key not in data:
                    data[key] = fields[key]
            if compliance and compliance == legacy.get("tests"):
                values["compliance_requirement"] = None
                report["compliance_cleared"] += 1

        grid_values = data.get("custom_grid_values") or {}
        for cell_id, (kind, target) in removed_by_form.get(form_id, {}).items():
            answer = grid_values.get(f"{cell_id}__{ANSWER_BLOCK_ID}")
            if kind == "check":
                value = _check_value(answer)
                if value is None:
                    continue
                checks = dict(data.get("checks") or {})
                previous = checks.get(target)
                if previous == value:
                    continue
                # The report's own table starts every check at "pass", so only a
                # missing or starting value is replaced by the answer given in
                # the grid; a "fail" or "n/a" there was chosen deliberately and
                # is never overwritten, least of all a failure by a pass.
                if previous in (None, "", "pass"):
                    checks[target] = value
                    data["checks"] = checks
                    if previous:
                        report["check_overrides"].append((number, target, previous, value))
                else:
                    report["check_conflicts"].append((number, target, previous, value))
            elif str(answer or "").strip() not in ("", "N/A"):
                notes = dict(data.get("diagnostics") or {})
                if str(notes.get(target) or "").strip() in ("", "N/A"):
                    notes[target] = str(answer).strip()
                    data["diagnostics"] = notes
                    report["notes_carried"] += 1

        if data != form_data:
            values["form_data"] = data
            report["inspections_filled"] += 1
        if values:
            conn.execute(update(inspections).where(inspections.c.id == inspection_id).values(**values))


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("--apply", action="store_true", help="write the changes (default: dry run)")
    parser.add_argument("--database-url", default=os.environ.get("DATABASE_URL"),
                        help="defaults to $DATABASE_URL")
    args = parser.parse_args(argv)
    if not args.database_url:
        parser.error("set DATABASE_URL or pass --database-url")

    report: dict[str, Any] = {
        "templates_fixed": [], "forms_cleaned": [], "inspections_filled": 0,
        "compliance_cleared": 0, "notes_carried": 0, "check_overrides": [], "check_conflicts": [],
    }
    engine = create_engine(args.database_url)
    with engine.connect() as conn:
        transaction = conn.begin()
        try:
            correct(conn, report)
        except Exception:
            transaction.rollback()
            raise
        if args.apply:
            transaction.commit()
        else:
            transaction.rollback()

    print("APPLIED" if args.apply else "DRY RUN - nothing written")
    print("legacy template corrected: {}".format(report["templates_fixed"] or "none needed"))
    print("forms cleaned: {}".format(len(report["forms_cleaned"])))
    for form_id, name, count in report["forms_cleaned"]:
        print("  form {:>5}  {:<45}  {} duplicated cells removed".format(form_id, name[:45], count))
    print("inspections given their checks / notes: {}".format(report["inspections_filled"]))
    print("raw HTML cleared from compliance field: {}".format(report["compliance_cleared"]))
    print("notes typed into a removed box, carried to Biomed Notes: {}".format(report["notes_carried"]))
    overrides = report["check_overrides"]
    print("built-in checks updated from an answer given in a removed duplicate cell: {}".format(len(overrides)))
    for number, key, previous, value in overrides[:100]:
        print("  {:<24} {:<20} {} -> {}".format(number, key, previous, value))
    if len(overrides) > 100:
        print("  ... and {} more".format(len(overrides) - 100))
    conflicts = report["check_conflicts"]
    print("left as recorded (built-in 'fail'/'n/a' differs from the removed cell): {}".format(len(conflicts)))
    for number, key, kept, other in conflicts[:100]:
        print("  {:<24} {:<20} kept {} (grid said {})".format(number, key, kept, other))
    return 0


if __name__ == "__main__":
    sys.exit(main())
