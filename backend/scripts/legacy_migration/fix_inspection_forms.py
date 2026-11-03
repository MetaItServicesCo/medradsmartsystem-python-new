"""One-off correction of the migrated legacy inspection forms already in a database.

The legacy migration copied each old form's whole page into the converted
form, including the nine standard checks and the Biomed Notes block that the
report screen already provides itself. So those appeared twice, and the note
captions had no box to type in. The migration code is fixed; this applies the
same correction to the data a past run produced. It changes only:

* forms the migration produced that nobody has edited since
  (``schema.source == "legacy_pm_desc"``): rebuilt from their legacy
  definition (``legacy_form_items.json``) and the questions their inspections
  recorded, so the duplicated cells are removed and every measurement reading
  (each row's Set / Actual / Note box) gets its own field instead of all
  sharing one; laid out as the legacy page showed it (each table under its
  heading, with its column headings and one row per line), with the legacy
  checkbox questions; every existing cell keeps its id, so recorded answers
  still line up, and no field a form has today is dropped;
* the generated "Legacy Clinical Engineering Report" template: its sections
  are given the format the report screen reads;
* inspections migrated from the legacy system: their standard checks, notes
  and standard readings (Set / Read, Replaced on / Due) are filled into the
  report's own fields from the preserved legacy report, and their recorded
  measurement readings into the new fields, only where those are empty; the
  raw checklist HTML is removed from the compliance field when that is
  exactly what it holds;
* any inspection on a corrected form: an answer recorded in a removed
  duplicate cell is carried to the report's own field, so nothing a
  technician entered disappears. It replaces only an empty field or the
  table's starting "pass"; a "fail" or "n/a" already there is kept. Each case
  is listed in the dry run.

* migrated inspections nobody has opened and saved in the app since the
  migration: a standard check or recorded answer that differs from the
  preserved legacy report is set back to it. The first migration stored some
  readings under a box they did not belong to (several legacy boxes shared a
  name), and an earlier correction could carry a stale removed-cell answer
  over a recorded "pass"; the legacy report is what the technician recorded.
  An inspection saved in the app since is never touched. Each change is
  listed in the dry run.

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

from pathlib import Path

from sqlalchemy import MetaData, create_engine, select, update

from .form_convert import (
    ANSWER_BLOCK_ID,
    NOTE_INPUT_NAMES,
    _items_from_grid,
    build_grid_schema_from_items,
    clean_grid_schema,
    extract_answers,
    legacy_aliases,
    merge_item_lists,
    note_input_name,
    parse_form,
    standard_check_key,
)
from .operational import LEGACY_REPORT_SCHEMA, OperationalWriter
from .writer import SOURCE_SYSTEM

# The legacy notes boxes and the report field each one belongs to.
NOTE_INPUT_FIELDS = {
    "temp_r_fault": "reported_problem",
    "temp_p_fault": "problem_found",
    "temp_c_fault": "corrective_action_taken",
    "temp_summary": "summary",
}
assert set(NOTE_INPUT_FIELDS) == NOTE_INPUT_NAMES

# The 36 legacy form definitions (their questions only, parsed from the legacy
# dump), so a migrated form can be rebuilt with every reading box even though
# the legacy HTML is not in the live database.
LEGACY_FORM_ITEMS = Path(__file__).with_name("legacy_form_items.json")


def _legacy_form_items() -> dict[str, Any]:
    try:
        return json.loads(LEGACY_FORM_ITEMS.read_text(encoding="utf-8"))
    except FileNotFoundError:
        return {}


def _add_recorded(union: dict[str, dict[str, Any]], html: str) -> set[str]:
    """Union a completed legacy report's questions into ``union`` (by name); returns their names."""
    names: set[str] = set()
    for item in parse_form(html):
        if item["kind"] == "heading":
            continue
        names.add(item["name"])
        existing = union.get(item["name"])
        if existing is None:
            entry = {"name": item["name"], "kind": item["kind"], "label": item["label"],
                     "raw_options": list(item.get("raw_options", []))}
            if item.get("report_field"):
                entry["report_field"] = item["report_field"]
            union[item["name"]] = entry
            continue
        if item["kind"] == "radio":
            existing["kind"] = "radio"
        for option in item.get("raw_options", []):
            if option not in existing["raw_options"]:
                existing["raw_options"].append(option)
    return names


def rebuild_legacy_form(schema: dict[str, Any], definitions: dict[str, Any],
                        recorded: list[dict[str, Any]], report_names: list[set[str]] | tuple = ()) -> dict[str, Any]:
    """A migrated form rebuilt the way the corrected migration builds it.

    Its legacy definition, plus every question its migrated inspections
    recorded, through the corrected converter: the standard checks, notes and
    standard readings go to the report, and every reading box gets its own
    field. A form without a legacy definition uses its own fields as the
    definition. No field the form has today is ever dropped, except the
    duplicated report-owned ones; a form edited in the app is not touched.
    Returns the schema unchanged when there is nothing to do.
    """
    grid = (schema or {}).get("custom_grid") or {}
    if (schema or {}).get("source") != "legacy_pm_desc" or not isinstance(grid.get("cells"), list):
        return schema
    legacy_id = schema.get("legacy_pm_desc_id")
    definition = definitions.get(str(legacy_id)) if legacy_id is not None else None
    current = _items_from_grid(grid["cells"])
    if not definition and current is None:
        cleaned, _ = clean_grid_schema(schema)
        return cleaned
    current = current or []
    # Without a legacy definition, the form's own fields are its definition.
    base = definition["items"] if definition else [item for item in current if not _derived_key(item.get("name", ""))]
    items = merge_item_lists(copy.deepcopy(base), copy.deepcopy(recorded))
    present = {item["name"] for item in items if item["kind"] != "heading"}
    # Fields keyed by element id or position came from an earlier run of this
    # correction; they are rebuilt by label now (see superseded_fields).
    missing = [item for item in current if item["kind"] != "heading" and item["name"] not in present
               and not _derived_key(item["name"])]
    if missing:
        items = merge_item_lists(items, missing)
    layout = (definition or {}).get("layout")
    aliases = legacy_aliases(layout, base, recorded + missing, report_names) if layout else {}
    rebuilt = build_grid_schema_from_items(items, schema.get("title") or grid.get("title") or "", legacy_id,
                                           layout=layout, aliases=aliases)
    if rebuilt["custom_grid"]["cells"] == grid["cells"] \
            and rebuilt.get("legacy_aliases") == schema.get("legacy_aliases"):
        return schema
    result = {**schema, "custom_grid": {**grid, **rebuilt["custom_grid"]}}
    result.pop("legacy_aliases", None)
    if rebuilt.get("legacy_aliases"):
        result["legacy_aliases"] = rebuilt["legacy_aliases"]
    return result


def _derived_key(name: str) -> bool:
    """A field key an earlier run derived from an element id or position."""
    return name.startswith(("id_", "pos_")) and note_input_name(name) is None


def superseded_fields(old: dict[str, Any], new: dict[str, Any]) -> dict[str, str]:
    """Earlier id/position-keyed cells -> the label-keyed cell that replaces them.

    So an answer typed into one of those fields after an earlier run is carried
    to the field that now shows the same reading.
    """
    new_cells = _item_cells(new)
    by_label: dict[str, str] = {}
    for cell_id, cell in new_cells.items():
        by_label.setdefault(_cell_label(cell), cell_id)
    mapping: dict[str, str] = {}
    for cell_id, cell in _item_cells(old).items():
        if cell_id in new_cells or not _derived_key(cell_id[len("item_"):]):
            continue
        label = _cell_label(cell)
        if label in by_label:
            mapping[cell_id] = by_label[label]
    return mapping


def _cell_label(cell: dict[str, Any]) -> str:
    """A field cell's question label (kept on the cell when the legacy page showed it beside it)."""
    label = cell.get("itemLabel") or ((cell.get("blocks") or [{}])[0]).get("label") or ""
    return " ".join(str(label).split()).lower()


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
        note = note_input_name(cell_id[len("item_"):])
        if block.get("type") == "radio" and standard_check_key(block.get("label") or ""):
            targets[cell_id] = ("check", standard_check_key(block.get("label") or ""))
        elif note:
            targets[cell_id] = ("note", NOTE_INPUT_FIELDS[note])
    return targets


def _same(a: Any, b: Any) -> bool:
    return " ".join(str(a if a is not None else "").split()) == " ".join(str(b if b is not None else "").split())


def _restore_legacy_values(data: dict[str, Any], legacy: dict[str, Any], aliases: dict[str, str],
                           number: str, report: dict[str, Any]) -> None:
    """Set the standard checks and recorded answers back to the legacy report's."""
    expected = OperationalWriter._report_fields(legacy).get("checks") or {}
    checks = dict(data.get("checks") or {})
    for key, value in expected.items():
        if checks.get(key) != value:
            report["checks_restored"].append((number, key, checks.get(key), value))
            checks[key] = value
    if checks != (data.get("checks") or {}):
        data["checks"] = checks
    grid_values = dict(data.get("custom_grid_values") or {})
    for key, value in extract_answers(legacy.get("tests") or "").items():
        stale = grid_values.get(key)
        if _same(stale, value):
            continue
        report["answers_restored"].append((number, key, stale, value))
        grid_values[key] = value
        # The page row showing this answer under its newer name.
        cell, _, rest = key.partition("__")
        target = aliases.get(cell)
        if target:
            shown = f"{target}__{rest}"
            if shown not in grid_values or _same(grid_values[shown], stale):
                grid_values[shown] = value
    if grid_values != (data.get("custom_grid_values") or {}):
        data["custom_grid_values"] = grid_values


def correct(conn, report: dict[str, Any]) -> None:
    meta = MetaData()
    meta.reflect(conn, only=["inspection_forms", "inspections"])
    forms, inspections = meta.tables["inspection_forms"], meta.tables["inspections"]

    # The questions each form's migrated inspections recorded, as the migration
    # merged them. Streamed, so the legacy pages are never all held at once.
    recorded: dict[int, dict[str, dict[str, Any]]] = {}
    # The question names each report recorded, so a question is only shown in
    # a page row under an older name when no report holds both.
    report_names: dict[int, list[set[str]]] = {}
    # Streaming is set on this one query: set on the connection, it would turn
    # every later statement, the UPDATEs included, into a server-side cursor,
    # which PostgreSQL refuses for anything but a SELECT.
    stream = conn.execute(
        select(inspections.c.form_template_id, inspections.c.form_data).execution_options(stream_results=True))
    for form_id, raw_form_data in stream:
        form_data = _as_dict(raw_form_data)
        legacy = form_data.get("legacy_report") if form_data.get("source") == SOURCE_SYSTEM else None
        if isinstance(legacy, dict) and legacy.get("tests"):
            names = _add_recorded(recorded.setdefault(form_id, {}), legacy["tests"])
            report_names.setdefault(form_id, []).append(names)
    definitions = _legacy_form_items()

    removed_by_form: dict[int, dict[str, tuple[str, str]]] = {}
    # Each form's older-name matches, so a restored answer reaches its page row.
    aliases_by_form: dict[int, dict[str, str]] = {}
    superseded_by_form: dict[int, dict[str, str]] = {}
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
        cleaned = rebuild_legacy_form(schema, definitions, list(recorded.get(form_id, {}).values()),
                                      report_names.get(form_id, ()))
        aliases_by_form[form_id] = (cleaned or {}).get("legacy_aliases") or {}
        if cleaned is schema:
            continue
        removed_by_form[form_id] = _removed_targets(schema, cleaned)
        superseded_by_form[form_id] = {**superseded_fields(schema, cleaned), **(cleaned.get("legacy_aliases") or {})}
        before, after = set(_item_cells(schema)), set(_item_cells(cleaned))
        conn.execute(update(forms).where(forms.c.id == form_id).values(schema=cleaned))
        report["forms_cleaned"].append((form_id, name.strip(), len(before - after), len(after - before)))

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
            for key, value in OperationalWriter._report_fields(legacy).items():
                if key not in data:
                    data[key] = value
            # Answers for the reading boxes that now have their own fields.
            answers = extract_answers(legacy.get("tests") or "")
            existing = data.get("custom_grid_values") or {}
            added = {key: value for key, value in answers.items() if key not in existing}
            if added:
                data["custom_grid_values"] = {**existing, **added}
            if compliance and compliance == legacy.get("tests"):
                values["compliance_requirement"] = None
                report["compliance_cleared"] += 1

        grid_values = data.get("custom_grid_values") or {}
        carried = {}
        mapping = superseded_by_form.get(form_id, {})
        for key, answer in grid_values.items():
            cell, separator, rest = key.partition("__")
            new_cell = mapping.get(cell)
            if not new_cell or not separator:
                continue
            new_key = f"{new_cell}__{rest}"
            if str(answer or "").strip() and not str(grid_values.get(new_key) or "").strip():
                carried[new_key] = answer
        if carried:
            grid_values = {**grid_values, **carried}
            data["custom_grid_values"] = grid_values
            report["readings_carried"] += len(carried)
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

        # Last, so no step above can leave a stale value in place: a migrated
        # inspection nobody has saved in the app since shows what the legacy
        # report recorded.
        if isinstance(legacy, dict) and "form_template" not in data:
            _restore_legacy_values(data, legacy, aliases_by_form.get(form_id) or {}, number, report)

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
        "compliance_cleared": 0, "notes_carried": 0, "readings_carried": 0, "check_overrides": [], "check_conflicts": [],
        "checks_restored": [], "answers_restored": [],
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
    print("forms corrected: {}".format(len(report["forms_cleaned"])))
    for form_id, name, removed, added in report["forms_cleaned"]:
        print("  form {:>5}  {:<40}  {} duplicated cells removed, {} reading fields added".format(
            form_id, name[:40], removed, added))
    print("inspections given their checks / notes: {}".format(report["inspections_filled"]))
    print("raw HTML cleared from compliance field: {}".format(report["compliance_cleared"]))
    print("notes typed into a removed box, carried to Biomed Notes: {}".format(report["notes_carried"]))
    print("readings carried from fields of an earlier run to their label-keyed field: {}".format(report["readings_carried"]))
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
    for title, entries in (("standard checks set back to the legacy report's", report["checks_restored"]),
                           ("recorded answers set back to the legacy report's", report["answers_restored"])):
        print("{} (inspections not saved in the app since): {}".format(title, len(entries)))
        for number, key, stale, value in entries[:100]:
            print("  {:<24} {:<34} {!r} -> {!r}".format(number, key, stale, value))
        if len(entries) > 100:
            print("  ... and {} more".format(len(entries) - 100))
    return 0


if __name__ == "__main__":
    sys.exit(main())
