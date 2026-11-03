"""Migrated legacy forms look like the legacy pages.

The legacy system drew each inspection form as tables: a heading, a row of
column headings ("Test | Pass | Fail | N/A | Note"), and one line per test
with its choice under those columns. The first migration packed the
questions two to a row instead, without the column headings, dropped the
checkbox questions (C Arm), and its longest forms ran past the 30 rows the
screens kept. These checks hold the rebuilt forms to the legacy layout, and
to everything that must not change:

* every field keeps its cell id, so every recorded answer stays attached;
* the standard checks and the Biomed Notes stay on the report, not the form;
* rows and cells the legacy page hid stay hidden;
* checkbox questions appear, with their answers;
* a question recorded under an older name shows in its row on the page, only
  when that is unambiguous; anything else is listed below, never dropped;
* the shipped definitions rebuild all 36 legacy forms within 12 columns.

    DATABASE_URL=sqlite:// python backend/tests/test_form_layout.py
"""
from __future__ import annotations

import os
import pathlib
import sys

os.environ.setdefault("DATABASE_URL", "sqlite://")
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))

import scripts.legacy_migration.form_convert as fc  # noqa: E402
from scripts.legacy_migration import fix_inspection_forms as fix  # noqa: E402
from scripts.legacy_migration import verify_inspection_reports as verifier  # noqa: E402

failures: list[str] = []


def ok(label: str, condition: bool, detail: str = "") -> None:
    print("{}  {}{}".format("PASS" if condition else "FAIL", label, "  " + detail if detail else ""))
    if not condition:
        failures.append(label)


def radio(name, checked=None):
    return "".join("<td><input type='radio' name='{}' value='{}'{}></td>".format(
        name, value, " checked='checked'" if value == checked else "") for value in ("pass", "fail", "na"))


def page(checked=None, value="", hardware=(), legacy_names=False):
    """A legacy page in the shape the real ones have (blank, or as a completed report)."""
    a, b = ("column311", "column261") if not legacy_names else ("column3115", "column2615")
    return f"""
    <table><thead><tr><th>Test</th><th>Pass</th><th>Fail</th><th>N/A</th><th>Test</th><th>Pass</th><th>Fail</th><th>N/A</th></tr></thead>
    <tbody><tr><td>Physical Insp.</td>{radio('1', 'pass')}<td>Cleaning</td>{radio('2')}</tr>
    <tr><td>Electrical Safety</td>{radio('7')}<td>Set:</td><td><input id='1' type='text'></td><td>Read:</td><td><input id='2' type='text'></td></tr></tbody></table>
    <table id='employee_table'><tbody><tr id='row1' style='display: none;'><td></td></tr></tbody></table>
    <h3>Functional Test</h3>
    <table><tbody><tr style='display: none;'><td></td></tr>
    <tr><td>Test</td><td>Pass</td><td>Fail</td><td>N/A</td><td>Note</td><td>Test</td><td>Pass</td><td>Fail</td><td>N/A</td><td>Note</td><td style='display: none;'>x</td></tr>
    <tr><td>EKG Cable</td>{radio(a, checked)}<td><input type='text' name='fav_language' value='{value}'></td>
        <td>Floor Unlock</td>{radio(b)}<td><input type='text' name='fav_language'></td></tr>
    <tr><td>Temp Sensor</td>{radio('column319')}<td>view</td><td>view</td></tr></tbody></table>
    <h5>General Information</h5>
    <table><tbody><tr>
      <td><strong>Hardware Configuration:</strong>
          <input type='checkbox'{" checked='checked'" if 0 in hardware else ""}><span>Standard</span>
          <input type='checkbox'{" checked='checked'" if 1 in hardware else ""}><span>MD</span></td>
      <td><strong>Hours on System</strong><input id='11' type='text'>
          <strong>Software Version</strong><input id='12' type='text'></td></tr></tbody></table>
    <h5>Biomed Notes</h5>
    <table><tr><td>Reported Problem</td><td><input id='temp_r_fault' type='text'></td></tr></table>
    """


def item_cells(schema):
    return {cell["id"]: cell for row in schema["custom_grid"]["cells"] for cell in row if cell["id"].startswith("item_")}


def words(schema):
    return [((cell.get("blocks") or [{}])[0].get("label") if cell.get("blocks") else "")
            for row in schema["custom_grid"]["cells"] for cell in row if cell["id"].startswith(("txt_", "section_"))]


blank = page()
items = fc.parse_form(blank)
layout = fc.parse_layout(blank)
schema = fc.build_grid_schema_from_items(items, "Monitor", 958, layout=layout)
grid = schema["custom_grid"]
cells = item_cells(schema)

print("Layout")
print("=" * 72)
ok("every question is a field with the cell id it always had",
   {"item_column311", "item_column261", "item_column319", "item_fav_language", "item_lbl_floor_unlock_note"} <= set(cells),
   str(sorted(cells)))
ok("the standard checks and their readings stay on the report", not {"item_1", "item_2", "item_7"} & set(cells)
   and not any(key.startswith("item_id_") for key in cells))
ok("the Biomed Notes stay on the report", "item_id_temp_r_fault" not in cells and "Biomed Notes" not in words(schema))
ok("the legacy column headings are kept, in order",
   ["Test", "Pass", "Fail", "N/A", "Note", "Test", "Pass", "Fail", "N/A", "Note"] == [w for w in words(schema)
   if w in ("Test", "Pass", "Fail", "N/A", "Note")][:10], str(words(schema)))
ok("the section heading is kept", "Functional Test" in words(schema))
ok("each test name has its own cell beside its choice", "EKG Cable" in words(schema) and "Floor Unlock" in words(schema))
ekg = cells["item_column311"]
ok("a choice spans its Pass / Fail / N/A columns", ekg["colSpan"] == 3 and ekg["blocks"][0]["options"] == ["Pass", "Fail", "N/A"])
ok("  with its options side by side and no repeated label",
   ekg["blocks"][0]["optionLayout"] == "horizontal" and ekg["blocks"][0]["label"] == "")
ok("  while the cell still knows its question", ekg["itemLabel"] == "EKG Cable")
ok("two tests share a row, as on the legacy page",
   any({"item_column311", "item_column261"} <= {cell["id"] for cell in row} for row in grid["cells"]))
ok("hidden legacy rows and cells stay hidden", "x" not in words(schema)
   and all(len([c for c in row if not c.get("hidden")]) <= grid["columns"] for row in grid["cells"]))
ok("the legacy page's visible words are kept", words(schema).count("view") == 2)
ok("the grid fits the screens (at most 12 columns)", grid["columns"] == 10)
hardware = cells.get("item_cb_hardware_configuration")
ok("a checkbox question appears, named by its caption, with its options",
   hardware is not None and hardware["blocks"][0]["type"] == "checkbox"
   and hardware["blocks"][0]["options"] == ["Standard", "MD"]
   and hardware["blocks"][0]["label"] == "Hardware Configuration", str(hardware and hardware["blocks"][0]))
hours, version = cells.get("item_lbl_hours_on_system"), cells.get("item_lbl_software_version")
ok("two fields in one legacy cell are stacked in that cell's column",
   hours and version and hours["blocks"][0]["label"] == "Hours on System"
   and version["blocks"][0]["label"] == "Software Version")
ok("rows under a stacked cell are covered, not shifted",
   any(cell["id"].startswith("cover_") and cell["hidden"] for row in grid["cells"] for cell in row))

section = "Answers"
print()
print(section)
report = page(checked="fail", value="loose", hardware=(1,))
answers = fc.extract_answers(report)
ok("a completed report's answers use the same keys", answers.get("item_column311__ans") == "Fail"
   and answers.get("item_fav_language__ans") == "loose")
ok("a ticked checkbox is recorded under its option", answers.get("item_cb_hardware_configuration__ans__1") is True
   and "item_cb_hardware_configuration__ans__0" not in answers, str(answers))
keys = verifier.form_field_keys(schema)
ok("every recorded answer has a field on the form", set(answers) <= keys, str(set(answers) - keys))
ok("the form's items can be read back from the new layout",
   {item.get("name") for item in fc._items_from_grid(grid["cells"]) or []} >= {"column311", "cb_hardware_configuration"})

print()
print("Older names")
older = page(checked="pass", legacy_names=True)
recorded = [item for item in fc.parse_form(older) if item["kind"] != "heading"]
aliases = fc.legacy_aliases(layout, items, recorded, [{item["name"] for item in recorded}])
ok("a question recorded under an older name is matched to its page question",
   aliases.get("column3115") == "column311" and aliases.get("column2615") == "column261", str(aliases))
merged = fc.merge_item_lists(fc.parse_form(blank), recorded)
with_aliases = fc.build_grid_schema_from_items(merged, "Monitor", 958, layout=layout, aliases=aliases)
ok("  so it is shown in that row, not listed again below",
   "item_column3115" not in item_cells(with_aliases) and "Additional recorded items" not in words(with_aliases))
ok("  and the form remembers the match", with_aliases.get("legacy_aliases", {}).get("item_column3115") == "item_column311")
moved = fc.alias_answers(fc.extract_answers(older), with_aliases["legacy_aliases"])
ok("  so that report's answer shows in the page question's row",
   moved.get("item_column311__ans") == "Pass" and moved.get("item_column3115__ans") == "Pass")
ok("  and the verifier sees it", set(fc.extract_answers(older)) <= verifier.form_field_keys(with_aliases))
both = fc.legacy_aliases(layout, items, recorded, [{"column3115", "column311"}])
ok("a report that recorded both names is never merged", "column3115" not in both)
kept = fc.build_grid_schema_from_items(merged, "Monitor", 958, layout=layout, aliases=both)
ok("  and the older one stays visible under Additional recorded items",
   "item_column3115" in item_cells(kept) and "Additional recorded items" in words(kept))
ok("an answer the page question already has is never replaced",
   fc.alias_answers({"item_column3115__ans": "Pass", "item_column311__ans": "Fail"},
                    {"item_column3115": "item_column311"})["item_column311__ans"] == "Fail")

print()
print("The 36 legacy forms")
definitions = fix._legacy_form_items()
ok("all 36 definitions ship their layout", len(definitions) == 36 and all("layout" in d for d in definitions.values()))
for legacy_id, definition in sorted(definitions.items(), key=lambda kv: int(kv[0])):
    built = fc.build_grid_schema_from_items(definition["items"], definition["title"], int(legacy_id),
                                            layout=definition["layout"])
    page_fields = {"item_" + i["name"] for i in definition["items"]
                   if i["kind"] != "heading" and not fc._is_report_owned(i)}
    if not (built["custom_grid"]["columns"] <= 12 and page_fields <= set(item_cells(built))):
        ok("form {} keeps every field within 12 columns".format(legacy_id), False)
ok("every form keeps every one of its fields within 12 columns", not any("form " in f for f in failures))

print()
if failures:
    print("{} check(s) failed".format(len(failures)))
    sys.exit(1)
print("All legacy form layout checks passed")
