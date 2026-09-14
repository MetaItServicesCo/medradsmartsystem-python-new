"""The things a room holds that are assets rather than fixtures.

A fixture is part of the room: a socket, a light, a gas outlet, a diffuser. It
is maintained where it is and never leaves. An asset is an object in the room:
a chair, a table, a display, a computer. It has its own tag, it can be moved,
repaired, written down and disposed of, so it lives in the asset register with
the room recorded as where it currently is.

Chairs and displays briefly lived in the fixture catalogue. They are here now,
and a type may be one or the other, never both, so a fault on "a chair" has one
place to go.
"""
from __future__ import annotations

# The trade a fault goes to. Furniture is the building trade's unless a site
# says otherwise; screens and computers sit with IT; anything a patient is moved
# on is biomedical, because clinical engineering inspects it.
ROOM_ASSET_TYPES: list[dict] = [
    {"key": "chair", "label": "Chair", "discipline": "building_envelope"},
    {"key": "table", "label": "Table", "discipline": "building_envelope"},
    {"key": "desk", "label": "Desk / workstation", "discipline": "building_envelope"},
    {"key": "cabinet", "label": "Cabinet / storage", "discipline": "building_envelope"},
    {"key": "whiteboard", "label": "Whiteboard / notice board", "discipline": "building_envelope"},
    {"key": "sofa", "label": "Sofa / bench seating", "discipline": "building_envelope"},
    {"key": "display_screen", "label": "Display screen / TV", "discipline": "it_low_voltage"},
    {"key": "projector", "label": "Projector", "discipline": "it_low_voltage"},
    {"key": "computer", "label": "Computer", "discipline": "it_low_voltage"},
    {"key": "printer", "label": "Printer", "discipline": "it_low_voltage"},
    {"key": "telephone", "label": "Telephone", "discipline": "it_low_voltage"},
    {"key": "stretcher", "label": "Stretcher / trolley", "discipline": "biomedical"},
    {"key": "wheelchair", "label": "Wheelchair", "discipline": "biomedical"},
]

BY_TYPE: dict[str, dict] = {entry["key"]: entry for entry in ROOM_ASSET_TYPES}


def label_for(asset_type: str | None) -> str:
    """"Chair" for a catalogued type, "Ceiling speaker" for one typed in."""
    if not asset_type:
        return ""
    entry = BY_TYPE.get(asset_type)
    if entry:
        return entry["label"]
    return asset_type.replace("_", " ").strip().capitalize()


def type_key(value: str) -> str:
    """The stored form of a type somebody typed: "Ceiling Speaker" -> ceiling_speaker."""
    cleaned = "".join(c if c.isalnum() else "_" for c in value.strip().lower())
    return "_".join(part for part in cleaned.split("_") if part)[:48]


def catalog_payload(discipline_ids: dict[str, int] | None = None) -> list[dict]:
    return [
        {**entry, "discipline_id": (discipline_ids or {}).get(entry["discipline"])}
        for entry in ROOM_ASSET_TYPES
    ]
