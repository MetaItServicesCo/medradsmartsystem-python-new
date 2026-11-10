"""Put the current modality list in place: modalities, sub-modalities and the
inspection form each gives a new asset.

The modalities there today become the old list: every existing asset keeps
its modality exactly as it is, and the old list is no longer offered for new
assets. The list below becomes the one new assets are added with. Nothing
else changes: no asset, inspection, report or invoice is touched.

Run it twice. First as it is, which only reads and reports, then with
--apply once the report is clean:

    docker compose exec -T backend python scripts/apply_modality_list.py
    docker compose exec -T backend python scripts/apply_modality_list.py --apply

It refuses to apply, and changes nothing, when any form below is not found
exactly once among the visible inspection forms, or when the list has
already been put in place. Applying is one transaction: all of it, or none.
"""
from __future__ import annotations

import sys
import warnings
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
# Model set-up warnings from elsewhere in the app would only bury the report.
warnings.filterwarnings("ignore")

from sqlalchemy import func  # noqa: E402
from sqlalchemy.orm import Session  # noqa: E402

GENERAL = "General Form"

# (modality, category, [(sub-modality, form name or names to accept)]).
# Names are as given, including their spelling. A tuple of form names means
# "whichever of these exists": the list says "BP Monitor", which may be named
# "BP Monitor Form".
MODALITY_LIST: list[tuple[str, str, list[tuple[str, object]]]] = [
    ("Bed & Stretchers", "treatment", [
        ("Birthing Beds", "Hospital Bed Form"),
        ("Stretcher", "Hospital Bed Form"),
        ("Patient Recliner", "Hospital Bed Form"),
        ("Patient Beds", "Hospital Bed Form"),
        ("Infant Cribs", "Hospital Bed Form"),
        ("Hospital Beds", "Hospital Bed Form"),
    ]),
    ("Infusion", "treatment", [
        ("Infusion Pump", GENERAL), ("PCA Pump", GENERAL), ("Feeding Pump", GENERAL),
        ("Syringe Pump", GENERAL), ("Compression Pump", GENERAL), ("Pump", GENERAL),
    ]),
    ("Patient Exam & Support", "treatment", [
        ("Patient Lifts", GENERAL), ("Patient Warmer", GENERAL), ("Ice Machine", GENERAL),
        ("Mini Fridge", "Freezer & Refrigerator Form"), ("Blanket Warmer", GENERAL),
        ("Refrigerator", "Freezer & Refrigerator Form"),
        ("Aspirator (Suction Pump) (Wall Suction Regulator)", "Aspirator Form"),
        ("Dehumidifier", GENERAL), ("Disinfector", GENERAL),
        ("Drug Refrigerator", "Freezer & Refrigerator Form"), ("Freezer", "Freezer & Refrigerator Form"),
        ("Power Supply (UPS)", GENERAL), ("Glucometer", GENERAL), ("Power Bank", GENERAL),
        ("Hydro collator", GENERAL), ("Ambient Temperature Sensor", GENERAL), ("Infant Warmer", GENERAL),
        ("Infant Incubators", GENERAL), ("Procedure Chair", GENERAL), ("Power Exam Table", "Exam Table Form"),
        ("Exam Light", "Exam Light Form"), ("Exam Table", "Exam Table Form"), ("Thermometer", GENERAL),
        ("Patient Scale", GENERAL), ("Otoscope", "Otoscope Form"), ("UV Lights", GENERAL),
        ("Audiometer", GENERAL), ("Infant Scale", GENERAL), ("Vital-Sign Monitors", "Vital Sign Monitor Form"),
        ("Pulse Oximeter Monitor", GENERAL), ("NIBP Monitor", ("BP Monitor", "BP Monitor Form")),
        ("Color Printer", GENERAL), ("Printers", GENERAL), ("Label Printers", GENERAL),
    ]),
    ("Ventilators", "treatment", [
        ("Ventilator", GENERAL), ("Oxygen Concentrator", GENERAL), ("ByPap", GENERAL), ("Flow Meter", GENERAL),
    ]),
    ("Lab", "laboratory", [
        ("Hematology Analyzers", GENERAL), ("Analyzers", GENERAL), ("Coagulation Analyzer", GENERAL),
        ("Lab Analyzer", GENERAL), ("Array System", GENERAL), ("Thrombelastography Analyzer", GENERAL),
        ("Centrifuges", GENERAL), ("Microscope", GENERAL), ("Differential Analyzer", GENERAL),
        ("Urine Analyzer", GENERAL), ("Breathalyzer", GENERAL), ("Vacum hood/vent", GENERAL),
    ]),
    ("Dialysis", "treatment", [
        ("Transfusion System", GENERAL), ("Auto transfusion System", GENERAL),
    ]),
    ("Surgery", "treatment", [
        ("Phaco Systems", GENERAL), ("RF Generators", "RF Generator Form"), ("Tourniquet System", GENERAL),
        ("ESU System (Also for RF System)", "RF Generator Form"), ("Cryosurgical System", GENERAL),
        ("Footswitch", GENERAL), ("Surgery General-NO2 delivery system", GENERAL),
        ("Spinal Surgery Table", GENERAL), ("Positioner System", GENERAL), ("Surgery Table", "Surgical Table Form"),
        ("Surgical Light", "Surgical Light Form"), ("General Surgical Microscope", GENERAL),
        ("Ophthalmology Surgical Microscope", GENERAL), ("Plastic Vac", GENERAL),
        ("Powered Instrument set", GENERAL), ("Drill reamer", GENERAL), ("Drill Set", GENERAL),
        ("Handpiece", GENERAL), ("Instrument Set", GENERAL),
        ("Suction Regulator (Vacum Regulator)", "Aspirator Form"), ("Video Monitor", GENERAL),
    ]),
    ("Endoscopy", "treatment", [
        ("Video Laryngoscopes", GENERAL), ("Light Sources", GENERAL), ("Endoscopy System", GENERAL),
        ("Video Processor", GENERAL), ("Clono scope", GENERAL), ("Bronchoscope", GENERAL),
        ("Power Consoles", GENERAL), ("Camera Control-Unit", GENERAL), ("Endo-cam", GENERAL),
        ("Endoscope Monitor", GENERAL), ("Endoscope Flushing-Pump", GENERAL),
        ("Endoscope Leakage-Tester", GENERAL), ("Endoscope Washer", GENERAL), ("Endo-light", GENERAL),
        ("video system center", GENERAL),
    ]),
    ("Cardiology", "treatment", [
        ("Stress Test", GENERAL), ("Ecg-ekg Machine", "EKG Form"), ("Defibrillator", "Defibrillator Form"),
        ("AED", "AED Form"),
    ]),
    ("Sterilization", "treatment", [
        ("Free Standing Sterilizer", "Autoclave Form"), ("Ultrasonic Cleaner", GENERAL),
        ("Low temp Sterilizer", GENERAL), ("Tabletop Sterilizer", "Autoclave Form"),
    ]),
    ("Therapy Equipment", "treatment", [
        ("Pt Table", GENERAL), ("Cross training Machine", GENERAL), ("Elliptical", GENERAL),
        ("Treadmill", GENERAL), ("Exercise Machine", GENERAL),
    ]),
    ("Anesthesia", "treatment", [
        ("Anesthesia Machines", "Anesthesia Machine Form"), ("Sevoflurane Vaporizer", GENERAL),
        ("Isoflurane Vaporizer", GENERAL), ("Desflurane Vaporizer", GENERAL), ("Vaporizer", GENERAL),
        ("Anesthesia Monitor", "Anesthesia Monitor Form"), ("Co2 Gas module", GENERAL),
        ("Multi Agent Gas Module", "Multi Agent Gas Module Form"),
    ]),
    ("Radiology and Imaging", "imaging", [
        ("CT Scanner", GENERAL), ("C Arm", "C Arm Form"), ("MRI", GENERAL), ("Dexa", GENERAL),
        ("C Arm table", "C Arm Table Form"), ("CR Systems", GENERAL), ("DR Systems", GENERAL),
        ("Portable X-ray", GENERAL), ("Rad Room", GENERAL), ("Bladder Scanner", GENERAL),
        ("UltraSound", GENERAL), ("CT Injector", GENERAL), ("Transducer", GENERAL),
        ("Ultrasound Printer", GENERAL),
    ]),
    ("Lasers & Cosmetics", "treatment", [
        ("Laser System", GENERAL), ("D Laser system", GENERAL), ("SI Laser System", GENERAL),
        ("Shock wave/ pressure wave", GENERAL),
    ]),
    ("Ophthalmology", "treatment", [
        ("EyeLite Laser Photocoagulator", GENERAL), ("Retinal Camera", GENERAL),
        ("Polarimeter Ophthalmology", GENERAL), ("Fundus Camera", GENERAL), ("Tomographic", GENERAL),
        ("Field Analyzer", GENERAL), ("Laser System", GENERAL),
    ]),
]


def _names(spec: object) -> tuple[str, ...]:
    return spec if isinstance(spec, tuple) else (str(spec),)


@dataclass
class Plan:
    forms: dict[str, Optional[int]] = field(default_factory=dict)   # form as listed -> visible form id
    form_notes: list[str] = field(default_factory=list)
    problems: list[str] = field(default_factory=list)
    old_modalities: int = 0
    old_assets: int = 0
    new_modalities: int = 0
    new_sub_modalities: int = 0

    @property
    def ok(self) -> bool:
        return not self.problems


def _find_form(db: Session, spec: object) -> tuple[Optional[int], str, Optional[str]]:
    """The one visible form for a listed name: exactly, or else ignoring case
    and spacing. Returns (id, what was found, a problem if any)."""
    from app.models.inspection_form import InspectionForm

    visible = db.query(InspectionForm).filter(InspectionForm.archived_at.is_(None))
    hidden = db.query(InspectionForm).filter(InspectionForm.archived_at.isnot(None))
    for name in _names(spec):
        exact = visible.filter(InspectionForm.name == name).all()
        if len(exact) == 1:
            return exact[0].id, f"{exact[0].name} (#{exact[0].id})", None
        if len(exact) > 1:
            return None, "", f"{name!r}: {len(exact)} visible forms have this name; which one is meant?"
    for name in _names(spec):
        loose = [f for f in visible.all() if " ".join(f.name.split()).lower() == " ".join(name.split()).lower()]
        if len(loose) == 1:
            return loose[0].id, f"{loose[0].name} (#{loose[0].id}), matched ignoring case/spacing", None
        if len(loose) > 1:
            return None, "", f"{name!r}: {len(loose)} visible forms match it ignoring case; which one is meant?"
    shown = " or ".join(repr(n) for n in _names(spec))
    if any(hidden.filter(func.lower(InspectionForm.name) == n.lower()).first() for n in _names(spec)):
        return None, "", f"{shown}: only a hidden form has this name"
    return None, "", f"{shown}: no visible form has this name"


def plan(db: Session) -> Plan:
    """Read only: what applying would do, and anything that stops it."""
    from app.models.equipment import Equipment
    from app.models.modality import Modality

    result = Plan()
    if db.query(Modality.id).filter(Modality.is_legacy.is_(True)).first():
        result.problems.append("The list is already in place (an old list exists). Nothing to do.")
    for spec in dict.fromkeys(spec for _, _, subs in MODALITY_LIST for _, spec in subs):
        form_id, found, problem = _find_form(db, spec)
        key = " or ".join(_names(spec))
        result.forms[key] = form_id
        if problem:
            result.problems.append(problem)
        else:
            result.form_notes.append(f"{key:<32} -> {found}")
    result.old_modalities = db.query(func.count(Modality.id)).filter(Modality.is_legacy.is_(False)).scalar() or 0
    result.old_assets = db.query(func.count(Equipment.id)).scalar() or 0
    result.new_modalities = len(MODALITY_LIST)
    result.new_sub_modalities = sum(len(subs) for _, _, subs in MODALITY_LIST)
    return result


def apply(db: Session) -> Plan:
    """Mark today's modalities as the old list and create the list above, in
    one transaction. Refuses, changing nothing, unless the plan is clean."""
    from app.models.modality import Modality, ModalityCategory
    from app.utils.logging import log_activity

    result = plan(db)
    if not result.ok:
        return result
    try:
        db.query(Modality).filter(Modality.is_legacy.is_(False)).update({Modality.is_legacy: True}, synchronize_session=False)
        db.flush()
        for name, category, subs in MODALITY_LIST:
            parent = Modality(name=name, category=ModalityCategory(category), is_legacy=False)
            db.add(parent)
            db.flush()
            for sub_name, spec in subs:
                db.add(Modality(
                    name=sub_name,
                    category=ModalityCategory(category),
                    parent_id=parent.id,
                    is_legacy=False,
                    inspection_form_id=result.forms[" or ".join(_names(spec))],
                ))
        db.flush()
        log_activity(db, "modalities", 0, "MODALITY_LIST_APPLIED", None, {
            "old_list_modalities": result.old_modalities,
            "new_modalities": result.new_modalities,
            "new_sub_modalities": result.new_sub_modalities,
        })
        db.commit()
    except Exception:
        db.rollback()
        raise
    return result


def _report(result: Plan, applied: bool) -> None:
    print("Forms, as listed -> the visible form that will be given:")
    for note in result.form_notes:
        print(f"  {note}")
    print()
    print(f"Modalities in use today, to become the old list : {result.old_modalities}")
    print(f"Assets, all keeping their modality as it is     : {result.old_assets}")
    print(f"New list                                        : {result.new_modalities} modalities, {result.new_sub_modalities} sub-modalities")
    print()
    if result.problems:
        print("STOPPED. Nothing was changed. To sort out first:")
        for problem in result.problems:
            print(f"  - {problem}")
    elif applied:
        print("APPLIED. New assets are now added with this list.")
    else:
        print("Clean. Nothing was changed. Run again with --apply to put the list in place.")


def main() -> int:
    from app.db.base import SessionLocal

    applying = "--apply" in sys.argv[1:]
    db = SessionLocal()
    try:
        result = apply(db) if applying else plan(db)
    finally:
        db.close()
    _report(result, applying and result.ok)
    if applying and result.ok:
        from app.utils.read_cache import invalidate_read_cache
        invalidate_read_cache("modalities")
    return 0 if result.ok else 1


if __name__ == "__main__":
    sys.exit(main())
