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


def legacy_page(answers: dict[str, str] | None = None, problem: str = "N/A",
                readings: dict[str, str] | None = None) -> str:
    """A legacy checklist page shaped like the real ones in the dump."""
    answers, readings = answers or {}, readings or {}
    rows = [("1", "Physical Insp."), ("2", "Cleaning"), ("3", "Display"), ("4", "Lubrication"),
            ("5", "Functional"), ("6", "Calibration"), ("7", "Electrical Safety"), ("8", "Battery"),
            ("9", "PM Kit"), ("101", "EKG Cable"), ("102", "SpO2 Sensor")]
    box = "<td>{}</td><td><input id='{}' type='text' value='{}'></td>"
    extras = {  # the standard table's own reading boxes
        "7": box.format("Set:", "s1", readings.get("set", "")) + box.format("Read:", "s2", readings.get("read", "")),
        "8": box.format("Replaced on", "s3", readings.get("replaced", "")) + box.format("Due", "s4", readings.get("due", "")),
    }
    body = "".join(radio_row(name, label, answers.get(name)).replace("</tr>", extras.get(name, "") + "</tr>")
                   for name, label in rows)
    measurement = (  # Set boxes all named fav_language; Actual boxes unnamed
        "<h5>Functional Test</h5><table>"
        "<tr><td>Test</td><td>Pass</td><td>Fail</td><td>N/A</td><td>Test</td><td>Set</td><td>Actual</td></tr>"
        "<tr><td>EKG Leads</td>{r1}<td>EKG Set</td><td><input type='text' name='fav_language' value='70/20'></td>"
        "<td><input id='incolumn3611' type='text' value='{a1}'></td></tr>"
        "<tr><td>SpO2 Cable</td>{r2}<td>SpO2</td><td><input type='text' id='incolumn352' name='fav_language' value='98%'></td>"
        "<td><input id='incolumn3612' type='text' value='{a2}'></td></tr></table>"
    ).format(
        r1="".join("<td><input type='radio' name='col1' value='{}'></td>".format(v) for v in ("pass", "fail", "na")),
        r2="".join("<td><input type='radio' name='col2' value='{}'></td>".format(v) for v in ("pass", "fail", "na")),
        a1=readings.get("ekg_actual", ""), a2=readings.get("spo2_actual", ""),
    )
    notes = (
        "<strong>Biomed Notes</strong><table>"
        "<tr><td><strong>Reported Problem</strong></td><td><input id='temp_r_fault' type='text' value='N/A'></td></tr>"
        "<tr><td><strong>Problem Found</strong></td><td><input id='temp_p_fault' name='temp_p_fault' type='text' value='{}'></td></tr>"
        "<tr><td><strong>Corrective action taken</strong></td><td><input id='temp_c_fault' type='text' value=''></td></tr>"
        "<tr><td><strong>Summary</strong></td><td><input id='temp_summary' type='text' value=''></td></tr></table>"
    ).format(problem)
    return (
        "<h3>Set Title</h3><table><thead><tr><th>Test</th><th>Pass</th><th>Fail</th><th>N/A</th></tr></thead>"
        "<tbody>" + body + "</tbody></table>" + measurement
        + "<table><tr><td>Image Storage Capacity (200, 5,000 Etc.):</td>"
        "<td><input type='text' name='303' value=''></td></tr></table>" + notes
    )


def old_schema(html: str, title: str, legacy_id: int) -> dict:
    """What production holds today: the pre-fix conversion, nothing filtered.

    The old parser keyed boxes by name only, so the boxes keyed by element id
    or position (``id_`` / ``pos_``) did not exist then.
    """
    saved_filter, saved_cap = fc._without_report_owned, fc.LONG_INPUT_LABEL
    fc._without_report_owned = lambda items: items
    fc.LONG_INPUT_LABEL = 10 ** 6
    try:
        items = [item for item in fc.parse_form(html)
                 if item["kind"] == "heading" or not item["name"].startswith(("id_", "pos_", "lbl_"))]
        return fc.build_grid_schema_from_items(items, title, legacy_id)
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
ok("the old conversion repeated the standard checks and the notes box (the reported problem)",
   "Physical Insp." in labels(before) and "item_temp_p_fault" in item_ids(before))
ok("a fresh conversion leaves the nine standard checks to the report's own table",
   not {"Physical Insp.", "Cleaning", "Display", "Lubrication", "Functional", "Calibration",
        "Electrical Safety", "Battery", "PM Kit"} & set(labels(fresh)), str(labels(fresh)))
ok("  and the notes captions, the stray notes box and 'Set Title' to the report's Biomed Notes",
   not {"Biomed Notes", "Reported Problem", "Problem Found", "Corrective action taken", "Summary", "Set Title"}
   & set(labels(fresh)) and "item_temp_p_fault" not in item_ids(fresh))
ok("  while every device-specific question stays", {"EKG Cable", "SpO2 Sensor", "EKG Leads", "Functional Test"} <= set(labels(fresh)))
ok("  under the same answer keys as before", item_ids(before) - item_ids(fresh) <= {
    "item_1", "item_2", "item_3", "item_4", "item_5", "item_6", "item_7", "item_8", "item_9", "item_temp_p_fault"},
   str(sorted(item_ids(before) - item_ids(fresh))))
ok("every measurement reading gets its own field, labelled by its row and column",
   {"EKG Set \u2013 Set", "EKG Set \u2013 Actual", "SpO2 \u2013 Set", "SpO2 \u2013 Actual"} <= set(labels(fresh)), str(labels(fresh)))
ok("  the first Set reading keeps its existing key, so recorded answers stay attached",
   "item_fav_language" in item_ids(fresh)
   and {"item_lbl_ekg_set_actual", "item_lbl_spo2_set", "item_lbl_spo2_actual"} <= item_ids(fresh), str(sorted(item_ids(fresh))))
ok("the standard table's own Set/Read and Replaced on/Due boxes go to the report's table",
   not any(label.startswith(("Electrical Safety", "Battery")) for label in labels(fresh)), str(labels(fresh)))
long_cell = next(c for row in fresh["custom_grid"]["cells"] for c in row if c["id"] == "item_303")
ok("a long label gets the whole row instead of spilling into its neighbour",
   long_cell["colSpan"] == 2 and long_cell["blocks"][0]["width"] > 400)
only_standard = fc.build_grid_schema_from_items(fc.parse_form(radio_row("1", "Physical Insp.") + radio_row("2", "Battery")), "Plain", 7)
ok("a form of only standard checks says so rather than showing an empty grid",
   "No device-specific checks" in str(labels(only_standard)), str(labels(only_standard)))
ok("a truly empty legacy form keeps its existing notes placeholder",
   fc.build_grid_schema_from_items([], "Stub", 4)["custom_grid"]["cells"][0][0]["id"] == "item_note")

answers = fc.extract_answers(legacy_page({"1": "fail", "101": "pass"}, readings={"ekg_actual": "72", "set": "0.2"}))
ok("recorded answers keep only the form's own questions, each reading on its own key",
   answers == {"item_101__ans": "Pass", "item_fav_language__ans": "70/20", "item_lbl_ekg_set_actual__ans": "72",
               "item_lbl_spo2_set__ans": "98%"}, str(answers))
ok("the standard readings are read for the report's own table",
   fc.extract_standard_readings(legacy_page(readings={"set": "0.2", "read": "0.1", "due": "2027-01"}))
   == {"electrical_safety": {"set": "0.2", "read": "0.1"}, "battery": {"due": "2027-01"}})
ok("the standard answers are read for the report's own table",
   fc.extract_standard_checks(legacy_page({"1": "fail", "7": "na", "101": "pass"})) == {"physical_inspection": "fail", "electrical_safety": "na"})
fields = OperationalWriter._report_fields({"tests": legacy_page({"2": "pass"}), "r_fault": "No power", "f_fault": "Blown fuse",
                                            "action": "Replaced fuse", "summary": ""})
ok("a migrated inspection gets its notes in the report's Biomed Notes fields",
   fields.get("diagnostics") == {"reported_problem": "No power", "problem_found": "Blown fuse",
                                 "corrective_action_taken": "Replaced fuse", "summary": ""}
   and fields.get("checks") == {"cleaning": "pass"}, str(fields))
ok("  and nothing is invented when the legacy report recorded nothing", OperationalWriter._report_fields({}) == {})
with_readings = OperationalWriter._report_fields({"tests": legacy_page(readings={"set": "0.2", "read": "0.1", "replaced": "2026-01"})})
ok("its standard readings land where the report screen shows them (measurements rows 0-2)",
   with_readings["measurements"][0]["set_value"] == "0.2" and with_readings["measurements"][0]["read_value"] == "0.1"
   and with_readings["measurements"][1]["set_value"] == "2026-01", str(with_readings.get("measurements")))
ok("  and where the printout reads them", with_readings.get("battery") == {"replaced_on": "2026-01", "due": ""})
ok("the generated legacy template uses the sections the report screen reads",
   all(isinstance(section, dict) and section.get("key") for section in LEGACY_REPORT_SCHEMA["sections"]))

# ── The correction script, on a database shaped like production ────────────
# SQLite by default; FIX_FORMS_TEST_DB runs the same scenario against an empty
# PostgreSQL database, the engine production uses.
url = os.environ.get("FIX_FORMS_TEST_DB") or "sqlite:///{}".format(
    (pathlib.Path(tempfile.mkdtemp()) / "fix.db").as_posix())
engine = sa.create_engine(url)
Base.metadata.create_all(engine)
Session = sessionmaker(bind=engine)
seed = Session()
clinic = Facility(name="North Clinic", phone="555", email="n@x.example.com", address="1 St", city="Plano",
                  state="TX", zip_code="75024", country="US")
seed.add(clinic)
seed.flush()
# A migrated form with no legacy definition on file: it is cleaned only.
migrated_form = InspectionForm(name=" Patient Monitor1", schema=old_schema(page, " Patient Monitor1", 99001))
# A migrated form with its legacy definition on file (the real form 958), as
# production holds it today: built by the old, name-only parser.
definition_958 = fix._legacy_form_items()["958"]
old_items_958 = [item for item in copy.deepcopy(definition_958["items"])
                 if item["kind"] == "heading" or not item["name"].startswith(("id_", "pos_", "lbl_"))]
saved_filter, saved_cap = fc._without_report_owned, fc.LONG_INPUT_LABEL
fc._without_report_owned, fc.LONG_INPUT_LABEL = (lambda items: items), 10 ** 6
try:
    schema_958 = fc.build_grid_schema_from_items(old_items_958, "Patient Monitor (958)", 958)
finally:
    fc._without_report_owned, fc.LONG_INPUT_LABEL = saved_filter, saved_cap
form_958 = InspectionForm(name="Patient Monitor (958)", schema=schema_958)
# The same form as an earlier run of the correction left it: an id-keyed reading field.
earlier = copy.deepcopy(schema_958)
earlier["custom_grid"]["cells"].append([{"id": "item_id_incolumn3611", "label": "", "type": "text", "colSpan": 1,
                                         "blocks": [{"id": "ans", "type": "input", "label": "EKG Set \u2013 Actual"}]}])
form_earlier = InspectionForm(name="Patient Monitor (earlier run)", schema=earlier)
edited = copy.deepcopy(old_schema(page, "Edited", 959))
edited["source"] = "medrad_grid_form_builder"
edited_form = InspectionForm(name="Edited in the app", schema=edited)
canvas_form = InspectionForm(name="C Arm", schema={"version": 5, "canvas_form": {"canvas_width": 1080, "canvas_height": 600, "elements": [
    {"id": "e1", "type": "radio", "x": 0, "y": 0, "width": 200, "height": 60, "label": "Cleaning", "options": ["Pass", "Fail"]}]}})
template = InspectionForm(name="Legacy Clinical Engineering Report", schema={
    "version": 1, "source": "admin_medrad", "sections": ["tests", "observations", "corrective_actions", "recommendations", "billing"]})
seed.add_all([migrated_form, form_958, form_earlier, edited_form, canvas_form, template])
seed.flush()

legacy_tests = legacy_page({"1": "fail", "2": "pass", "101": "pass"}, problem="Blown fuse")


def inspection(number, form, form_data, compliance=None, corrective_actions=None):
    row = Inspection(inspection_number=number, facility_id=clinic.id, form_template_id=form.id,
                     scheduled_date=datetime(2026, 10, 1), form_data=form_data, compliance_requirement=compliance,
                     corrective_actions=corrective_actions)
    seed.add(row)
    seed.flush()
    return row.id


MIGRATED = inspection("WO-1-00001", migrated_form, {
    "source": "admin_medrad", "legacy_inspection_id": 1,
    "legacy_report": {"tests": legacy_tests, "r_fault": "No power", "f_fault": "Blown fuse", "action": "Replaced fuse", "summary": "OK"},
    "custom_grid_values": fc.extract_answers(legacy_tests),
}, compliance=legacy_tests, corrective_actions="Replaced fuse")
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
# A completed legacy report on form 958 with an Actual reading typed in.
page_958 = (
    "<table><tr><td>Test</td><td>Pass</td><td>Fail</td><td>N/A</td><td>Test</td><td>Set</td><td>Actual</td></tr>"
    "<tr><td>EKG Cable</td><td><input type='radio' name='column311' value='pass' checked='checked'></td>"
    "<td><input type='radio' name='column311' value='fail'></td><td><input type='radio' name='column311' value='na'></td>"
    "<td>EKG Set</td><td><input type='text' id='incolumn351' name='fav_language' value='70/20'></td>"
    "<td><input id='incolumn3611' type='text' value='72 bpm'></td></tr></table>"
)
TYPED_EARLIER = inspection("INSP-012430", form_earlier, {
    "checks": {}, "custom_grid_values": {"item_id_incolumn3611__ans": "75 bpm"},
})
MIGRATED_958 = inspection("WO-958-00001", form_958, {
    "source": "admin_medrad", "legacy_report": {"tests": page_958},
    "custom_grid_values": {"item_column311__ans": "Pass", "item_fav_language__ans": "70/20"},
})
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
with engine.connect() as conn:
    trial = conn.begin()
    fix.correct(conn, {"templates_fixed": [], "forms_cleaned": [], "inspections_filled": 0, "compliance_cleared": 0,
                       "notes_carried": 0, "readings_carried": 0, "check_overrides": [], "check_conflicts": []})
    # On PostgreSQL a connection left streaming runs its UPDATEs as server-side
    # cursors, which fails; streaming belongs to the one read query.
    ok("streaming is set on the read query, never left on the connection that writes",
       "stream_results" not in conn.get_execution_options())
    trial.rollback()

fix.main(["--database-url", url, "--apply"])
forms_after, rows_after = snapshot()
import json  # noqa: E402

def as_obj(value):
    return json.loads(value) if isinstance(value, str) else value

cleaned = as_obj(forms_after[" Patient Monitor1"])
ok("the migrated form is cleaned", "Physical Insp." not in labels(cleaned) and "Reported Problem" not in labels(cleaned)
   and {"EKG Cable", "SpO2 Sensor", "EKG Leads"} <= set(labels(cleaned)), str(labels(cleaned)))
rebuilt_958 = as_obj(forms_after["Patient Monitor (958)"])
ok("a form with its legacy definition gains every reading as its own field",
   {"item_lbl_ekg_set_actual", "item_lbl_spo2_set", "item_lbl_spo2_actual"} <= item_ids(rebuilt_958), str(sorted(item_ids(rebuilt_958))))
old_cells_958 = {c["id"]: c["blocks"][0] for row in schema_958["custom_grid"]["cells"] for c in row}
dropped_958 = item_ids(schema_958) - item_ids(rebuilt_958)
ok("  keeps every field it had except the report-owned ones",
   all(fc._is_report_owned({"kind": old_cells_958[cid]["type"], "label": old_cells_958[cid]["label"], "name": cid[5:]})
       for cid in dropped_958), str(sorted((cid, old_cells_958[cid]["label"]) for cid in dropped_958)))
ok("  and loses its duplicated standard checks", not {"Physical Insp.", "Cleaning", "Battery"} & set(labels(rebuilt_958)))
earlier_after = as_obj(forms_after["Patient Monitor (earlier run)"])
typed_after = as_obj(rows_after["INSP-012430"][0])
ok("a field from an earlier run is replaced by its label-keyed field",
   "item_id_incolumn3611" not in item_ids(earlier_after) and "item_lbl_ekg_set_actual" in item_ids(earlier_after))
ok("  and a reading typed into it is carried over, nothing lost",
   typed_after["custom_grid_values"].get("item_lbl_ekg_set_actual__ans") == "75 bpm"
   and typed_after["custom_grid_values"].get("item_id_incolumn3611__ans") == "75 bpm", str(typed_after["custom_grid_values"]))
data_958 = as_obj(rows_after["WO-958-00001"][0])
ok("its migrated inspection gets the Actual reading it recorded",
   data_958["custom_grid_values"].get("item_lbl_ekg_set_actual__ans") == "72 bpm", str(data_958["custom_grid_values"]))
ok("  without changing the answers it already had",
   data_958["custom_grid_values"]["item_column311__ans"] == "Pass" and data_958["custom_grid_values"]["item_fav_language__ans"] == "70/20")
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

from scripts.legacy_migration import verify_inspection_reports as verifier  # noqa: E402
ok("the read-only verifier finds every migrated report matching its legacy original",
   verifier.main(["--database-url", url]) == 0)
with engine.begin() as conn:
    conn.execute(sa.text("UPDATE inspections SET corrective_actions = 'tampered' WHERE inspection_number = 'WO-1-00001'"))
ok("  and reports a report that does not", verifier.main(["--database-url", url]) == 1)
with engine.begin() as conn:
    conn.execute(sa.text("UPDATE inspections SET corrective_actions = 'Replaced fuse' WHERE inspection_number = 'WO-1-00001'"))

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
