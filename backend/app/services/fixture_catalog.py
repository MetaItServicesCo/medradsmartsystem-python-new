"""What kinds of fixture exist, which trade owns them, and what a spec needs.

This is the part that makes a fixture worth recording. "Socket not working" is
a callout; "20 A hospital-grade critical-branch receptacle, NEMA 5-20R, panel
EM-3 breaker 14" is a diagnosis with a part number attached. The catalogue is
what turns the first into the second, by asking the four or five questions that
actually determine the repair and refusing to ask anything else.

Every quantity is US customary — volts, amps, CFM, GPM, PSI, inches of water
column, degrees Fahrenheit, square feet. That is what the nameplate reads, what
the code references are written in, and what the supplier quotes against.

The `discipline` on each type is the routing key. Report a fault on a diffuser
and it reaches mechanical; report one on a scrub sink and it reaches plumbing.
Nobody picks a trade from a dropdown.

Defaults are the common case in a US hospital, not a guess — a sprinkler head
in a patient room is ordinarily 155 degF quick-response, a medical air outlet
ordinarily runs at 50 psi. They are starting values, and every one is editable.
"""
from __future__ import annotations

from typing import Any


def _num(key: str, label: str, unit: str | None = None, **kw: Any) -> dict:
    return {"key": key, "label": label, "type": "number", "unit": unit, **kw}


def _sel(key: str, label: str, options: list[str], **kw: Any) -> dict:
    return {"key": key, "label": label, "type": "select", "options": options, **kw}


def _bool(key: str, label: str, **kw: Any) -> dict:
    return {"key": key, "label": label, "type": "boolean", **kw}


def _text(key: str, label: str, **kw: Any) -> dict:
    return {"key": key, "label": label, "type": "text", **kw}


# ── Electrical ──────────────────────────────────────────────────────────────
# Branch matters more than anything else here. NFPA 99 divides the essential
# electrical system into life-safety, critical and equipment branches, and
# which one a receptacle sits on decides whether it is live when the utility
# fails. A technician who does not know that will test a dead socket during a
# generator run and conclude wrongly.
_BRANCHES = ["normal", "critical", "life_safety", "equipment"]

ELECTRICAL = [
    {
        "key": "receptacle", "label": "Receptacle / socket", "prefix": "SKT",
        "spec": [
            _sel("branch", "Branch", _BRANCHES, default="normal"),
            _num("voltage_v", "Voltage", "V", default=120),
            _num("amperage_a", "Amperage", "A", default=20),
            _sel("nema_config", "NEMA configuration",
                 ["5-15R", "5-20R", "6-20R", "L5-20R", "L6-30R", "5-20R twist"],
                 default="5-20R"),
            _bool("hospital_grade", "Hospital grade (green dot)", default=True),
            _bool("gfci", "GFCI protected", default=False),
            _num("gang", "Gang / outlets", None, default=2),
        ],
    },
    {
        "key": "light_fixture", "label": "Light fixture", "prefix": "LT",
        "spec": [
            _sel("lamp_type", "Lamp", ["LED", "fluorescent", "halogen"], default="LED"),
            _num("wattage_w", "Wattage", "W"),
            _num("lumens", "Output", "lm"),
            _sel("mounting", "Mounting",
                 ["recessed", "surface", "pendant", "troffer", "surgical boom"],
                 default="recessed"),
            _bool("on_emergency", "On emergency branch", default=False),
            _bool("sealed", "Sealed / cleanroom rated", default=False),
        ],
    },
    {
        "key": "light_switch", "label": "Switch / dimmer", "prefix": "SW",
        "spec": [
            _sel("switch_type", "Type",
                 ["toggle", "dimmer", "occupancy sensor", "keyed", "three-way"],
                 default="toggle"),
            _num("amperage_a", "Rating", "A", default=15),
        ],
    },
    {
        "key": "emergency_light", "label": "Emergency light", "prefix": "EM",
        # NFPA 101 requires 90 minutes on battery. Recording it makes the
        # monthly and annual tests checkable rather than assumed.
        "spec": [
            _num("battery_minutes", "Battery duration", "min", default=90),
            _sel("test_type", "Test", ["self-testing", "manual"], default="self-testing"),
        ],
    },
    {
        "key": "exit_sign", "label": "Exit sign", "prefix": "EX",
        "spec": [
            _bool("battery_backup", "Battery backup", default=True),
            _sel("face", "Face", ["single", "double"], default="single"),
        ],
    },
    {
        "key": "isolation_monitor", "label": "Line isolation monitor", "prefix": "LIM",
        # Required in wet procedure locations under NFPA 99. The alarm
        # threshold is the number anybody asks about.
        "spec": [
            _num("alarm_ma", "Alarm threshold", "mA", default=5),
            _num("voltage_v", "System voltage", "V", default=120),
        ],
    },
]

# ── Mechanical ──────────────────────────────────────────────────────────────
MECHANICAL = [
    {
        "key": "supply_diffuser", "label": "Supply diffuser", "prefix": "SD",
        "spec": [
            _num("airflow_cfm", "Design airflow", "CFM"),
            _num("neck_size_in", "Neck size", "in"),
            _sel("pattern", "Pattern",
                 ["4-way", "3-way", "2-way", "linear slot", "laminar array"],
                 default="4-way"),
            _bool("hepa", "HEPA terminal", default=False),
        ],
    },
    {
        "key": "return_grille", "label": "Return / exhaust grille", "prefix": "RG",
        "spec": [
            _num("airflow_cfm", "Design airflow", "CFM"),
            _num("size_in", "Face size", "in"),
            _sel("service", "Service", ["return", "exhaust", "transfer"], default="return"),
        ],
    },
    {
        "key": "thermostat", "label": "Thermostat / room sensor", "prefix": "TSTAT",
        "spec": [
            _num("setpoint_f", "Setpoint", "degF", default=70),
            _num("min_f", "Minimum", "degF", default=68),
            _num("max_f", "Maximum", "degF", default=75),
            _bool("humidity", "Reads humidity", default=False),
        ],
    },
    {
        "key": "vav_box", "label": "VAV / terminal box", "prefix": "VAV",
        "spec": [
            _num("min_cfm", "Minimum airflow", "CFM"),
            _num("max_cfm", "Maximum airflow", "CFM"),
            _num("inlet_size_in", "Inlet size", "in"),
            _bool("reheat", "Reheat coil", default=True),
        ],
    },
    {
        "key": "pressure_monitor", "label": "Room pressure monitor", "prefix": "RPM",
        # ASHRAE 170 calls for positive pressure in an OR and negative in an
        # AIIR. The differential in inches of water column is the compliance
        # figure, and 0.01 in. w.c. is the usual minimum.
        "spec": [
            _sel("required_polarity", "Required", ["positive", "negative", "neutral"],
                 default="positive"),
            _num("setpoint_inwc", "Differential setpoint", "in. w.c.", default=0.01),
            _bool("alarms_locally", "Local alarm", default=True),
        ],
    },
    {
        "key": "damper", "label": "Fire / smoke damper", "prefix": "DMP",
        "spec": [
            _sel("damper_type", "Type", ["fire", "smoke", "combination", "balancing"],
                 default="combination"),
            _num("size_in", "Size", "in"),
            _num("rating_hours", "Rating", "hr", default=1.5),
        ],
    },
]

# ── Plumbing ────────────────────────────────────────────────────────────────
PLUMBING = [
    {
        "key": "sink", "label": "Sink", "prefix": "SNK",
        "spec": [
            _sel("sink_type", "Type",
                 ["scrub", "hand wash", "clinical", "utility", "cup"], default="hand wash"),
            _sel("faucet_control", "Control",
                 ["sensor", "wrist blade", "knee", "foot pedal", "lever"], default="sensor"),
            _num("flow_gpm", "Flow", "GPM", default=1.5),
            _bool("thermostatic_mixing", "Thermostatic mixing valve", default=True),
        ],
    },
    {
        "key": "water_closet", "label": "WC / toilet", "prefix": "WC",
        "spec": [
            _num("flush_gpf", "Flush volume", "gal/flush", default=1.28),
            _sel("flush_type", "Flush", ["flushometer", "tank", "sensor"], default="flushometer"),
            _bool("bariatric", "Bariatric rated", default=False),
        ],
    },
    {
        "key": "floor_drain", "label": "Floor drain", "prefix": "FD",
        "spec": [
            _num("size_in", "Size", "in", default=3),
            _bool("trap_primer", "Trap primer fitted", default=True),
        ],
    },
    {
        "key": "eyewash", "label": "Eyewash / safety shower", "prefix": "EW",
        # ANSI Z358.1: 0.4 GPM for 15 minutes, tepid, weekly activation.
        "spec": [
            _sel("unit_type", "Type", ["eyewash", "drench shower", "combination"],
                 default="eyewash"),
            _num("flow_gpm", "Flow", "GPM", default=0.4),
            _bool("tepid_supply", "Tepid supply", default=True),
        ],
    },
    {
        "key": "backflow_preventer", "label": "Backflow preventer", "prefix": "BFP",
        "spec": [
            _sel("device_type", "Device", ["RPZ", "DCVA", "PVB", "AVB"], default="RPZ"),
            _num("size_in", "Size", "in"),
            _text("serves", "Serves"),
        ],
    },
    {
        "key": "shower", "label": "Shower", "prefix": "SHR",
        "spec": [
            _num("flow_gpm", "Flow", "GPM", default=2.0),
            _bool("accessible", "Accessible / roll-in", default=False),
        ],
    },
]

# ── Medical gas and vacuum ──────────────────────────────────────────────────
MEDICAL_GAS = [
    {
        "key": "med_gas_outlet", "label": "Medical gas outlet", "prefix": "MGO",
        # Gas type drives everything: the connector is keyed so the wrong hose
        # will not fit, and the working pressure differs by service.
        "spec": [
            _sel("gas", "Gas",
                 ["oxygen", "medical air", "vacuum", "nitrous oxide",
                  "nitrogen", "carbon dioxide", "WAGD"], default="oxygen"),
            _sel("connector", "Connector",
                 ["DISS", "Ohmeda", "Chemetron", "Puritan"], default="DISS"),
            _num("pressure_psi", "Working pressure", "PSI", default=50),
            _sel("mounting", "Mounting",
                 ["wall", "ceiling column", "bed head unit", "boom"], default="wall"),
        ],
    },
    {
        "key": "zone_valve", "label": "Zone valve box", "prefix": "ZV",
        "spec": [
            _text("gases", "Gases served"),
            _num("size_in", "Line size", "in"),
            _text("serves", "Area served"),
        ],
    },
    {
        "key": "area_alarm", "label": "Area alarm panel", "prefix": "AA",
        "spec": [
            _text("gases", "Gases monitored"),
            _bool("master", "Master alarm", default=False),
        ],
    },
]

# ── Fire and life safety ────────────────────────────────────────────────────
FIRE = [
    {
        "key": "sprinkler_head", "label": "Sprinkler head", "prefix": "SPK",
        "spec": [
            _num("temperature_f", "Temperature rating", "degF", default=155),
            _sel("response", "Response", ["quick", "standard"], default="quick"),
            _sel("orientation", "Orientation",
                 ["pendent", "upright", "sidewall", "concealed"], default="concealed"),
            _num("k_factor", "K-factor", None, default=5.6),
            _num("coverage_sqft", "Coverage", "sq ft", default=130),
        ],
    },
    {
        "key": "smoke_detector", "label": "Smoke / heat detector", "prefix": "SMK",
        "spec": [
            _sel("detector_type", "Type",
                 ["photoelectric", "ionization", "heat", "duct", "aspirating"],
                 default="photoelectric"),
            _text("addressable_id", "Loop address"),
        ],
    },
    {
        "key": "pull_station", "label": "Manual pull station", "prefix": "MPS",
        "spec": [_text("addressable_id", "Loop address")],
    },
    {
        "key": "fire_extinguisher", "label": "Fire extinguisher", "prefix": "FE",
        "spec": [
            _sel("class_rating", "Class", ["ABC", "BC", "K", "CO2", "water mist"],
                 default="ABC"),
            _num("size_lb", "Size", "lb", default=10),
        ],
    },
    {
        "key": "fire_alarm_device", "label": "Notification device", "prefix": "NAC",
        "spec": [
            _sel("device_type", "Type", ["horn/strobe", "strobe", "speaker"],
                 default="horn/strobe"),
            _num("candela", "Candela", "cd", default=75),
        ],
    },
]

# ── IT and low voltage ──────────────────────────────────────────────────────
IT_LOW_VOLTAGE = [
    {
        "key": "data_port", "label": "Data outlet", "prefix": "DP",
        "spec": [
            _sel("category", "Category", ["Cat5e", "Cat6", "Cat6A", "fibre"], default="Cat6A"),
            _num("ports", "Ports", None, default=2),
            _text("patch_panel_ref", "Patch panel / port"),
        ],
    },
    {
        "key": "nurse_call", "label": "Nurse call station", "prefix": "NC",
        "spec": [
            _sel("station_type", "Type",
                 ["bedside", "bathroom pull", "code blue", "staff duty", "dome light"],
                 default="bedside"),
            _bool("pull_cord", "Pull cord", default=False),
        ],
    },
    {
        "key": "access_reader", "label": "Access control reader", "prefix": "ACR",
        "spec": [
            _sel("reader_type", "Type", ["card", "fob", "biometric", "keypad"], default="card"),
            _bool("fail_safe", "Fail safe (unlocks on power loss)", default=True),
        ],
    },
    {
        "key": "camera", "label": "Camera", "prefix": "CAM",
        "spec": [
            _sel("camera_type", "Type", ["fixed", "PTZ", "dome"], default="dome"),
            _bool("records_audio", "Records audio", default=False),
        ],
    },
]

# ── Building and envelope ───────────────────────────────────────────────────
BUILDING = [
    {
        "key": "door", "label": "Door", "prefix": "DR",
        "spec": [
            _sel("door_type", "Type",
                 ["swing", "double swing", "sliding", "automatic", "lead lined"],
                 default="swing"),
            _num("width_in", "Clear width", "in", default=44),
            _num("height_in", "Height", "in", default=84),
            _num("fire_rating_min", "Fire rating", "min"),
            _num("lead_equivalent_mm", "Lead equivalent", "mm"),
            _bool("closer", "Self-closing", default=True),
        ],
    },
    {
        "key": "window", "label": "Window / vision panel", "prefix": "WIN",
        "spec": [
            _num("width_in", "Width", "in"),
            _num("height_in", "Height", "in"),
            _bool("leaded", "Leaded glass", default=False),
        ],
    },
    {
        "key": "casework", "label": "Casework / bench", "prefix": "CW",
        "spec": [
            _num("length_in", "Length", "in"),
            _sel("surface", "Surface",
                 ["stainless", "solid surface", "epoxy resin", "laminate"],
                 default="solid surface"),
        ],
    },
]

# ── Furniture and room equipment ────────────────────────────────────────────
# Not MEP, but what a conference room, an office or a waiting area is actually
# made of, and it breaks: a chair with a failed gas lift, a table with a loose
# leg, a dead display. Maintained by the building trade unless a site says
# otherwise; displays sit with IT.
FURNITURE = [
    {
        "key": "chair", "label": "Chair", "prefix": "CHR",
        "spec": [
            _sel("chair_type", "Type",
                 ["task", "conference", "visitor", "stacking", "recliner", "bariatric"],
                 default="conference"),
            _bool("height_adjustable", "Height adjustable", default=False),
            _bool("wipe_clean", "Wipe-clean upholstery", default=True),
            _num("weight_rating_lb", "Weight rating", "lb", default=300),
        ],
    },
    {
        "key": "table", "label": "Table", "prefix": "TBL",
        "spec": [
            _sel("table_type", "Type",
                 ["conference", "meeting", "dining", "overbed", "procedure", "side"],
                 default="conference"),
            _num("length_in", "Length", "in", default=96),
            _num("width_in", "Width", "in", default=42),
            _num("seats", "Seats", None, default=8),
        ],
    },
    {
        "key": "desk", "label": "Desk / workstation", "prefix": "DSK",
        "spec": [
            _sel("desk_type", "Type", ["fixed", "sit-stand", "reception counter", "nurse station"],
                 default="fixed"),
            _num("width_in", "Width", "in", default=60),
        ],
    },
    {
        "key": "cabinet", "label": "Cabinet / storage", "prefix": "CAB",
        "spec": [
            _sel("cabinet_type", "Type",
                 ["filing", "lockable", "medication", "supply", "shelving", "locker"],
                 default="supply"),
            _bool("lockable", "Lockable", default=True),
        ],
    },
    {
        "key": "whiteboard", "label": "Whiteboard / notice board", "prefix": "WB",
        "spec": [
            _num("width_in", "Width", "in", default=72),
            _num("height_in", "Height", "in", default=48),
        ],
    },
    {
        "key": "privacy_curtain", "label": "Privacy curtain / screen", "prefix": "CUR",
        "spec": [
            _sel("curtain_type", "Type", ["ceiling track", "mobile screen", "disposable"],
                 default="ceiling track"),
            _num("track_length_ft", "Track length", "ft"),
        ],
    },
    {
        "key": "stretcher", "label": "Stretcher / trolley", "prefix": "STR",
        "spec": [
            _sel("stretcher_type", "Type", ["transport", "procedure", "bariatric"],
                 default="transport"),
            _num("weight_rating_lb", "Weight rating", "lb", default=500),
        ],
    },
]

AV_EQUIPMENT = [
    {
        "key": "display_screen", "label": "Display screen / TV", "prefix": "DSP",
        "spec": [
            _num("size_in", "Screen size", "in", default=65),
            _sel("mounting", "Mounting", ["wall", "ceiling", "cart", "desk"], default="wall"),
            _bool("video_conferencing", "Video conferencing", default=False),
        ],
    },
    {
        "key": "projector", "label": "Projector", "prefix": "PRJ",
        "spec": [
            _num("lumens", "Brightness", "lm", default=4000),
            _sel("mounting", "Mounting", ["ceiling", "table"], default="ceiling"),
        ],
    },
]

# Discipline code -> the types that trade owns. The key is the `code` on the
# disciplines table, so re-routing a whole trade is a data change.
CATALOG: dict[str, list[dict]] = {
    "electrical": ELECTRICAL,
    "mechanical": MECHANICAL,
    "plumbing": PLUMBING,
    "medical_gas": MEDICAL_GAS,
    "fire_life_safety": FIRE,
    "it_low_voltage": IT_LOW_VOLTAGE + AV_EQUIPMENT,
    "building_envelope": BUILDING + FURNITURE,
}

# Flat lookup: fixture type -> its definition plus the trade that owns it.
BY_TYPE: dict[str, dict] = {
    entry["key"]: {**entry, "discipline": discipline}
    for discipline, entries in CATALOG.items()
    for entry in entries
}


def discipline_for(fixture_type: str) -> str | None:
    """Which trade a fault on this fixture type belongs to."""
    entry = BY_TYPE.get(fixture_type)
    return entry["discipline"] if entry else None


def prefix_for(fixture_type: str) -> str:
    entry = BY_TYPE.get(fixture_type)
    return entry["prefix"] if entry else "FX"


def defaults_for(fixture_type: str) -> dict:
    """The spec a new fixture of this type starts with."""
    entry = BY_TYPE.get(fixture_type)
    if not entry:
        return {}
    return {
        field["key"]: field["default"]
        for field in entry["spec"] if "default" in field
    }


def describe(fixture_type: str, spec: dict | None) -> str:
    """A one-line summary for a work order title.

    "20 A critical receptacle" reads better on a dispatch list than
    "receptacle", and is the difference between a technician bringing the right
    part and making a second trip.
    """
    entry = BY_TYPE.get(fixture_type)
    if not entry:
        return fixture_type.replace("_", " ")
    values = spec or {}
    parts: list[str] = []
    for field in entry["spec"][:3]:
        value = values.get(field["key"])
        if value in (None, "", False):
            continue
        if value is True:
            parts.append(field["label"].lower())
        else:
            unit = field.get("unit")
            parts.append(f"{value} {unit}" if unit else str(value))
    label = entry["label"].split(" / ")[0].lower()
    return f"{' '.join(parts)} {label}".strip() if parts else label


def catalog_payload(discipline_ids: dict[str, int] | None = None) -> list[dict]:
    """The whole catalogue, shaped for the form builder in the browser."""
    out: list[dict] = []
    for discipline, entries in CATALOG.items():
        for entry in entries:
            out.append({
                **entry,
                "discipline": discipline,
                "discipline_id": (discipline_ids or {}).get(discipline),
            })
    return out
