"""The migrated inspection forms: converted cleanly, and corrected in place.

The legacy migration copied each old form's whole page into the converted
form, including the nine standard checks and the Biomed Notes block the
report screen already shows itself. Technicians saw those twice, and the note
captions had no box to type in. These checks hold the fix to its promises:

* a fresh conversion leaves those out, keeps every device-specific question
  and its answer key, and gives long labels room;
* the one-off correction script changes only what the migration produced:
  forms edited in the app, canvas forms and app inspections' own answers are
  untouched; nothing a technician entered is lost; a recorded "fail" is never
  turned into a pass; a dry run writes nothing; and a second run finds
  nothing to do.

    DATABASE_URL=sqlite:// python backend/tests/test_fix_inspection_forms.py
"""
from __future__ import annotations

import copy
import os
import pathlib
import sys
import tempfile
from datetime import datetime

os.environ.setdefault("DATABASE_URL", "sqlite://")
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))

import sqlalchemy as sa  # noqa: E402
from sqlalchemy.orm import sessionmaker  # noqa: E402

import app.models  # noqa: E402,F401
import scripts.legacy_migration.form_convert as fc  # noqa: E402
from app.db.base import Base  # noqa: E402
from app.models.facility import Facility  # noqa: E402
from app.models.inspection import Inspection  # noqa: E402
from app.models.inspection_form import InspectionForm  # noqa: E402
from scripts.legacy_migration import fix_inspection_forms as fix  # noqa: E402
from scripts.legacy_migration.operational import LEGACY_REPORT_SCHEMA, OperationalWriter  # noqa: E402

failures: list[str] = []


def ok(label: str, condition: bool, detail: str = "") -> None:
    print("{}  {}{}".format("PASS" if condition else "FAIL", label,
                            "  " + detail if detail else ""))
    if not condition:
        failures.append(label)


def radio_row(name: str, label: str, checked: str | None = None) -> str:
    def opt(value: str) -> str:
        mark = " checked='checked'" if checked == value else ""
        return "<td><input type='radio' name='{}' value='{}'{}></td>".format(name, value, mark)
    return "<tr><td>{}</td>{}{}{}</tr>".format(label, opt("pass"), opt("fail"), opt("na"))


def legacy_page(answers: dict[str, str] | None = None, problem: str = "N/A") -> str:
    """A legacy checklist page shaped like the real ones in the dump."""
    answers = answers or {}
    rows = [("1", "Physical Insp."), ("2", "Cleaning"), ("3", "Display"), ("4", "Lubrication"),
            ("5", "Functional"), ("6", "Calibration"), ("7", "Electrical Safety"), ("8", "Battery"),
            ("9", "PM Kit"), ("101", "EKG Cable"), ("102", "SpO2 Sensor")]
    body = "".join(radio_row(name, label, answers.get(name)) for name, label in rows)
    return (
        "<h3>Set Title</h3><table><thead><tr><th>Test</th><th>Pass</th><th>Fail</th><th>N/A</th></tr></thead>"
        "<tbody>{}</tbody></table>"
        "<h5>Functional Test</h5><table><tr><td>EKG Set</td>"
        "<td><input type='text' name='fav_language' value='70/20'></td></tr></table>"
        "<table><tr><td>Image Storage Capacity (200, 5,000 Etc.):</td>"
        "<td><input type='text' name='303' value=''></td></tr></table>"
        "<strong>Biomed Notes</strong><table>"
        "<tr><td><strong>Reported Problem</strong></td><td><input id='temp_r_fault' type='text' value='N/A'></td></tr>"
        "<tr><td><strong>Problem Found</strong></td><td><input id='temp_p_fault' name='temp_p_fault' type='text' value='{}'></td></tr>"
        "<tr><td><strong>Corrective action taken</strong></td><td></td></tr>"
        "<tr><td><strong>Summary</strong></td><td></td></tr></table>"
    ).format(body, problem)


def old_schema(html: str, title: str, legacy_id: int) -> dict:
    """What production holds today: the pre-fix conversion, nothing filtered."""
    saved_filter, saved_cap = fc._without_report_owned, fc.LONG_INPUT_LABEL
    fc._without_report_owned = lambda items: items
    fc.LONG_INPUT_LABEL = 10 ** 6
    try:
        return fc.build_grid_schema_from_items(fc.parse_form(html), title, legacy_id)
    finally:
        fc._without_report_owned, fc.LONG_INPUT_LABEL = saved_filter, saved_cap


def labels(schema: dict) -> list[str]:
    return [c["blocks"][0]["label"] for row in schema["custom_grid"]["cells"] for c in row]


def item_ids(schema: dict) -> set[str]:
    return {c["id"] for row in schema["custom_grid"]["cells"] for c in row if c["id"].startswith("item_")}


print("Migrated inspection forms")
print("=" * 72)

# ── A fresh conversion ─────────────────────────────────────────────────────
page = legacy_page()
fresh = fc.build_grid_schema_from_items(fc.parse_form(page), "Patient Monitor1", 958)
before = old_schema(page, "Patient Monitor1", 958)
ok("the old conversion repeated the standard checks and notes (the reported problem)",
   "Physical Insp." in labels(before) and "Reported Problem" in labels(before))
ok("a fresh conversion leaves the nine standard checks to the report's own table",
   not {"Physical Insp.", "Cleaning", "Display", "Lubrication", "Functional", "Calibration",
        "Electrical Safety", "Battery", "PM Kit"} & set(labels(fresh)), str(labels(fresh)))
ok("  and the notes captions, the stray notes box and 'Set Title' to the report's Biomed Notes",
   not {"Biomed Notes", "Reported Problem", "Problem Found", "Corrective action taken", "Summary", "Set Title"}
   & set(labels(fresh)) and "item_temp_p_fault" not in item_ids(fresh))
ok("  while every device-specific question stays", {"EKG Cable", "SpO2 Sensor", "EKG Set", "Functional Test"} <= set(labels(fresh)))
ok("  under the same answer keys as before", item_ids(fresh) <= item_ids(before))
long_cell = next(c for row in fresh["custom_grid"]["cells"] for c in row if c["id"] == "item_303")
ok("a long label gets the whole row instead of spilling into its neighbour",
   long_cell["colSpan"] == 2 and long_cell["blocks"][0]["width"] > 400)
only_standard = fc.build_grid_schema_from_items(fc.parse_form(radio_row("1", "Physical Insp.") + radio_row("2", "Battery")), "Plain", 7)
ok("a form of only standard checks says so rather than showing an empty grid",
   "No device-specific checks" in str(labels(only_standard)), str(labels(only_standard)))
ok("a truly empty legacy form keeps its existing notes placeholder",
   fc.build_grid_schema_from_items([], "Stub", 4)["custom_grid"]["cells"][0][0]["id"] == "item_note")

answers = fc.extract_answers(legacy_page({"1": "fail", "101": "pass"}))
ok("recorded answers keep only the form's own questions", answers == {"item_101__ans": "Pass", "item_fav_language__ans": "70/20"}, str(answers))
ok("the standard answers are read for the report's own table",
   fc.extract_standard_checks(legacy_page({"1": "fail", "7": "na", "101": "pass"})) == {"physical_inspection": "fail", "electrical_safety": "na"})
fields = OperationalWriter._report_fields({"tests": legacy_page({"2": "pass"}), "r_fault": "No power", "f_fault": "Blown fuse",
                                            "action": "Replaced fuse", "summary": ""})
ok("a migrated inspection gets its notes in the report's Biomed Notes fields",
   fields.get("diagnostics") == {"reported_problem": "No power", "problem_found": "Blown fuse",
                                 "corrective_action_taken": "Replaced fuse", "summary": ""}
   and fields.get("checks") == {"cleaning": "pass"}, str(fields))
ok("  and nothing is invented when the legacy report recorded nothing", OperationalWriter._report_fields({}) == {})
ok("the generated legacy template uses the sections the report screen reads",
   all(isinstance(section, dict) and section.get("key") for section in LEGACY_REPORT_SCHEMA["sections"]))

# ── The correction script, on a database shaped like production ────────────
db_file = pathlib.Path(tempfile.mkdtemp()) / "fix.db"
url = "sqlite:///{}".format(db_file.as_posix())
engine = sa.create_engine(url)
Base.metadata.create_all(engine)
Session = sessionmaker(bind=engine)
seed = Session()
clinic = Facility(name="North Clinic", phone="555", email="n@x.example.com", address="1 St", city="Plano",
                  state="TX", zip_code="75024", country="US")
seed.add(clinic)
seed.flush()
migrated_form = InspectionForm(name=" Patient Monitor1", schema=old_schema(page, " Patient Monitor1", 958))
edited = copy.deepcopy(old_schema(page, "Edited", 959))
edited["source"] = "medrad_grid_form_builder"
edited_form = InspectionForm(name="Edited in the app", schema=edited)
canvas_form = InspectionForm(name="C Arm", schema={"version": 5, "canvas_form": {"canvas_width": 1080, "canvas_height": 600, "elements": [
    {"id": "e1", "type": "radio", "x": 0, "y": 0, "width": 200, "height": 60, "label": "Cleaning", "options": ["Pass", "Fail"]}]}})
template = InspectionForm(name="Legacy Clinical Engineering Report", schema={
    "version": 1, "source": "admin_medrad", "sections": ["tests", "observations", "corrective_actions", "recommendations", "billing"]})
seed.add_all([migrated_form, edited_form, canvas_form, template])
seed.flush()

legacy_tests = legacy_page({"1": "fail", "2": "pass", "101": "pass"}, problem="Blown fuse")


def inspection(number, form, form_data, compliance=None):
    row = Inspection(inspection_number=number, facility_id=clinic.id, form_template_id=form.id,
                     scheduled_date=datetime(2026, 10, 1), form_data=form_data, compliance_requirement=compliance)
    seed.add(row)
    seed.flush()
    return row.id


MIGRATED = inspection("WO-1-00001", migrated_form, {
    "source": "admin_medrad", "legacy_inspection_id": 1,
    "legacy_report": {"tests": legacy_tests, "r_fault": "No power", "f_fault": "Blown fuse", "action": "Replaced fuse", "summary": "OK"},
    "custom_grid_values": fc.extract_answers(legacy_tests),
}, compliance=legacy_tests)
APP_INSPECTION = inspection("INSP-012421", migrated_form, {
    "checks": {key: "pass" for key in ("physical_inspection", "cleaning", "display", "lubrication", "functional",
                                       "calibration", "electrical_safety", "battery", "pm_kit")} | {"display": "fail"},
    "diagnostics": {"reported_problem": "N/A", "problem_found": "N/A", "corrective_action_taken": "", "summary": ""},
    "custom_grid_values": {"item_1__ans": "Fail", "item_3__ans": "Pass", "item_101__ans": "Pass",
                           "item_temp_p_fault__ans": "Cracked screen"},
})
UNTOUCHED = inspection("INSP-012422", edited_form, {"checks": {"cleaning": "pass"}, "custom_grid_values": {"item_1__ans": "Fail"}})
CANVAS = inspection("INSP-012423", canvas_form, {"canvas_values": {"e1": "Fail"}})
EMPTY = inspection("INSP-012424", migrated_form, None)
seed.commit()
seed.close()


def snapshot():
    with engine.connect() as conn:
        forms = {row.name: row.schema for row in conn.execute(sa.text("SELECT name, schema FROM inspection_forms"))}
        rows = {row.inspection_number: (row.form_data, row.compliance_requirement)
                for row in conn.execute(sa.text("SELECT inspection_number, form_data, compliance_requirement FROM inspections"))}
    return forms, rows


baseline = snapshot()
fix.main(["--database-url", url])
ok("a dry run writes nothing", snapshot() == baseline)

fix.main(["--database-url", url, "--apply"])
forms_after, rows_after = snapshot()
import json  # noqa: E402

def as_obj(value):
    return json.loads(value) if isinstance(value, str) else value

cleaned = as_obj(forms_after[" Patient Monitor1"])
ok("the migrated form is cleaned", "Physical Insp." not in labels(cleaned) and "Reported Problem" not in labels(cleaned)
   and {"EKG Cable", "SpO2 Sensor", "EKG Set"} <= set(labels(cleaned)), str(labels(cleaned)))
ok("a form edited in the app is not touched", as_obj(forms_after["Edited in the app"]) == as_obj(baseline[0]["Edited in the app"]))
ok("a canvas form is not touched", as_obj(forms_after["C Arm"]) == as_obj(baseline[0]["C Arm"]))
ok("the legacy template gets the section format the report reads",
   as_obj(forms_after["Legacy Clinical Engineering Report"]) == LEGACY_REPORT_SCHEMA)

migrated_data, migrated_compliance = rows_after["WO-1-00001"]
migrated_data = as_obj(migrated_data)
ok("a migrated inspection's standard answers are in the report's own table",
   migrated_data.get("checks") == {"physical_inspection": "fail", "cleaning": "pass"}, str(migrated_data.get("checks")))
ok("  its legacy notes are in Biomed Notes", migrated_data.get("diagnostics", {}).get("reported_problem") == "No power"
   and migrated_data["diagnostics"].get("summary") == "OK", str(migrated_data.get("diagnostics")))
ok("  the raw checklist HTML is gone from the compliance field", migrated_compliance is None)
ok("  and the preserved legacy report is still there", migrated_data.get("legacy_report", {}).get("tests") == legacy_tests)

app_data = as_obj(rows_after["INSP-012421"][0])
ok("an answer given in a removed duplicate cell moves to the report's own table (pass -> fail)",
   app_data["checks"]["physical_inspection"] == "fail")
ok("a 'fail' already recorded in the report's table is never turned into a pass",
   app_data["checks"]["display"] == "fail")
ok("a note typed in the removed box lands in Biomed Notes", app_data["diagnostics"]["problem_found"] == "Cracked screen")
ok("the technician's grid answers are all still stored", app_data["custom_grid_values"]["item_101__ans"] == "Pass"
   and app_data["custom_grid_values"]["item_1__ans"] == "Fail")
ok("an inspection on an app-edited form is untouched", rows_after["INSP-012422"] == baseline[1]["INSP-012422"])
ok("a canvas inspection is untouched", rows_after["INSP-012423"] == baseline[1]["INSP-012423"])
ok("an inspection with no report yet is untouched", rows_after["INSP-012424"] == baseline[1]["INSP-012424"])

again = snapshot()
fix.main(["--database-url", url, "--apply"])
ok("a second run finds nothing left to change", snapshot() == again)
engine.dispose()

print()
if failures:
    print("{} check(s) failed:".format(len(failures)))
    for label in failures:
        print("  -", label)
    sys.exit(1)
print("All migrated inspection form checks passed")
