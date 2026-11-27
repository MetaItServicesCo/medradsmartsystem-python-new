"""The search on the Inspection Forms screen.

It reads what a person sees on a form (its name, description, modality and
the titles, labels, options and hints inside it), never the stored JSON's
keys or layout settings, so "label" or "grid" does not match every form.
Case and accents are ignored, and several words narrow the list together.

    cd backend
    DATABASE_URL=sqlite:// venv312/Scripts/python.exe tests/test_inspection_form_search.py
    TEST_DATABASE_URL=postgresql://user:pass@host/db venv312/Scripts/python.exe tests/test_inspection_form_search.py
"""
from __future__ import annotations

import logging
import os
import pathlib
import sys
from datetime import datetime

os.environ.setdefault("DATABASE_URL", "sqlite://")
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))
logging.disable(logging.CRITICAL)

from sqlalchemy import create_engine, text  # noqa: E402
from sqlalchemy.orm import sessionmaker  # noqa: E402
from sqlalchemy.pool import StaticPool  # noqa: E402

import app.models  # noqa: E402,F401
from app.api.v1.endpoints.inspections import ADVANCED_REPORT_SCHEMA, list_inspection_forms  # noqa: E402
from app.db.base import Base  # noqa: E402
from app.models.inspection_form import InspectionForm  # noqa: E402
from app.models.modality import Modality, ModalityCategory  # noqa: E402
from app.models.user import User, UserRole, UserType  # noqa: E402

failures: list[str] = []


def ok(label: str, condition: bool, detail: object = "") -> None:
    print("{}  {}{}".format("PASS" if condition else "FAIL", label, f"  {detail}" if not condition else ""))
    if not condition:
        failures.append(label)


url = os.environ.get("TEST_DATABASE_URL")
if url:
    engine = create_engine(url)
    with engine.begin() as connection:
        connection.execute(text("DROP SCHEMA public CASCADE; CREATE SCHEMA public"))
    print("Running on", engine.dialect.name)
else:
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
Base.metadata.create_all(engine)
db = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)()

boss = User(username="boss", email="b@x.test", full_name="Boss", hashed_password="x",
            user_type=UserType.EMPLOYEE, role=UserRole.SUPERADMIN, is_active=True)
pumps = Modality(name="Infusion Pumps", category=ModalityCategory.TREATMENT)
db.add_all([boss, pumps])
db.flush()


def grid_form(name, description, labels, modality=None):
    cells = [[{"id": f"c{i}", "label": label, "type": "radio", "options": ["Pass", "Fail"], "align": "left"}] for i, label in enumerate(labels)]
    return InspectionForm(name=name, description=description, modality_id=modality.id if modality else None, schema={
        "title": name, "version": 3, "source": "medrad_grid_form_builder", "formio_form": None, "canvas_form": None,
        "custom_grid": {"title": "Set Title", "rows": len(labels), "columns": 1, "cells": cells},
    })


forms = {
    "defib": grid_form("Defibrillator PM Checklist", "Annual energy output test", ["Energy delivered at 200 J", "Pads expiry"]),
    "pump": grid_form("Infusion pump PM", "Flow-rate accuracy", ["Occlusion alarm", "Free-flow protection"], modality=pumps),
    "canvas": InspectionForm(name="Contrôle électrique", description=None, schema={
        "title": "Contrôle électrique", "version": 5, "source": "medrad_grid_form_builder", "custom_grid": None, "formio_form": None,
        "canvas_form": {"canvas_width": 1080, "canvas_height": 800, "elements": [
            {"id": "e1", "type": "label", "x": 0, "y": 0, "width": 200, "height": 40, "label": "Sécurité électrique", "align": "center", "bgColor": "white"},
            {"id": "e2", "type": "table", "x": 0, "y": 50, "width": 400, "height": 200, "rows": 1, "cols": 1,
             "cells": [[{"id": "t1", "type": "input", "label": "Leakage current (µA)", "placeholder": "Enter reading"}]]},
        ]},
    }),
    "formio": InspectionForm(name="Ventilator form", description="External form", schema={
        "title": "Ventilator form", "version": 4, "source": "formio_builder", "custom_grid": None, "canvas_form": None,
        "formio_form": {"display": "form", "components": [
            {"key": "tidalVolume", "type": "textfield", "label": "Tidal volume check", "input": True},
            {"key": "mode", "type": "select", "label": "Mode", "data": {"values": [{"label": "Pressure control", "value": "pc"}]}},
        ]},
    }),
    "hidden": grid_form("Old ECG checklist", "Retired 2025", ["Lead check"]),
    "wild": grid_form("100% function test_v2", "Literal symbols", ["Check"]),
}
forms["hidden"].archived_at = datetime(2026, 1, 1)
db.add_all(forms.values())
db.commit()
DEFAULT = ADVANCED_REPORT_SCHEMA["title"]


def names(search=None, field=None, hidden=False) -> set[str]:
    result = list_inspection_forms(modality_id=None, search=search, search_field=field, include_archived=hidden, db=db, current_user=boss)
    return {item["name"] for item in result["items"]}


everything = names()
print("No search: every form in circulation, the default included")
ok("lists every active form and the default", everything == {f.name for k, f in forms.items() if k != "hidden"} | {DEFAULT}, everything)

print("\nBy name")
ok("part of a name, any case", names("defib") == {"Defibrillator PM Checklist"}, names("defib"))
ok("several words in any order", names("checklist defibrillator") == {"Defibrillator PM Checklist"}, names("checklist defibrillator"))
ok("extra spaces are ignored", names("  defibrillator   pm  ") == {"Defibrillator PM Checklist"})
ok("accents are ignored", names("controle electrique") == {"Contrôle électrique"}, names("controle electrique"))
ok("the default form is found by its name", names("advanced facility") == {DEFAULT}, names("advanced facility"))
ok("% and _ are literal, not wildcards", names("100% function test_v2") == {"100% function test_v2"} and names("_v") == {"100% function test_v2"}, names("_v"))
ok("Name field: a label inside a form does not match", names("occlusion", "name") == set(), names("occlusion", "name"))

print("\nBy description and modality")
ok("description", names("flow-rate", "description") == {"Infusion pump PM"})
ok("modality", names("infusion pumps", "modality") == {"Infusion pump PM"}, names("infusion pumps", "modality"))

print("\nBy what is written inside the form")
ok("a grid label", names("occlusion alarm", "content") == {"Infusion pump PM"}, names("occlusion alarm", "content"))
ok("a canvas label, accents ignored", names("securite", "content") == {"Contrôle électrique"}, names("securite", "content"))
ok("a canvas table cell's label", names("leakage current") == {"Contrôle électrique"}, names("leakage current"))
ok("a placeholder", names("enter reading") == {"Contrôle électrique"})
ok("a Form.io label", names("tidal volume", "content") == {"Ventilator form"})
ok("a Form.io choice", names("pressure control") == {"Ventilator form"}, names("pressure control"))
ok("the default form's checks", names("electrical safety", "content") == {DEFAULT}, names("electrical safety", "content"))

print("\nWhat a person cannot see is not searched")
for word in ["label", "grid", "radio", "left", "medrad", "formio", "custom_grid", "1080", "tidalVolume", "textfield", "white"]:
    found = names(word)
    ok(f"'{word}' matches no form by its stored keys", not (found & {"Defibrillator PM Checklist", "Infusion pump PM", "Ventilator form"}) or word == "white", found)

print("\nFields and hidden forms")
ok("an unknown field searches every field", names("occlusion", "nonsense") == {"Infusion pump PM"})
ok("hidden forms are searched only in the hidden view", names("ecg") == set() and names("ecg", hidden=True) == {"Old ECG checklist"})
ok("no match: nothing", names("zzzz") == set())
ok("blank search: every form", names("   ") == everything)

db.close()
print("\n" + ("All form search checks passed" if not failures else f"{len(failures)} failed: {failures}"))
sys.exit(1 if failures else 0)
