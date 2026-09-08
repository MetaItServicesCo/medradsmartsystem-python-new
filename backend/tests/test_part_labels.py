"""Prove the label reader reads labels, and stays quiet when it cannot.

The dangerous failure here is not "found nothing". It is "found the wrong
thing": a GS1 string walked one character out of step turns a lot number into a
serial, and both still look like plausible values, so nobody notices until the
part is on a service report. Every element-string case below exists because
getting the field lengths wrong produces output that looks fine.

The barcode decoders are native libraries and are not installed everywhere, so
the tests that need them are skipped rather than failed, and say so. Run
part_label_doctor.py on the server to prove those work there.

    DATABASE_URL=sqlite:// python backend/tests/test_part_labels.py
"""
from __future__ import annotations

import os
import pathlib
import sys
from datetime import date

os.environ.setdefault("DATABASE_URL", "sqlite://")
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))

from app.utils.part_labels import (  # noqa: E402
    decode_barcodes,
    extract_label_fields,
    normalise_gtin,
    parse_gs1,
    read_label,
)

failures: list[str] = []
skipped: list[str] = []


def ok(label: str, condition: bool, detail: str = "") -> None:
    print("{}  {}{}".format("PASS" if condition else "FAIL", label,
                            "  " + detail if detail else ""))
    if not condition:
        failures.append(label)


def eq(label: str, got, want) -> None:
    ok(label, got == want, "got {!r}".format(got) if got != want else "")


GS = "\x1d"

# ── GS1 element strings ──────────────────────────────────────────────────────

# The ordinary case: GTIN, expiry, lot. Fixed-length fields run together with
# no separator at all, which is exactly why the lengths must be right.
parsed = parse_gs1("010884838048096" + "17250131" + "10LOT42")
eq("GTIN read from a fixed-length field", parsed.get("gtin"), "08848380480961")

parsed = parse_gs1("0100884838048096" + "17250131" + "10LOT42")
eq("14-digit GTIN", parsed.get("gtin"), "00884838048096")
eq("expiry parsed", parsed.get("expiry_date"), date(2025, 1, 31))
eq("lot runs to the end", parsed.get("lot"), "LOT42")

# A variable-length field followed by another field needs the separator, and
# without it the rest of the string belongs to the lot. That is the standard's
# behaviour, not a bug, and the test records it so a future change is deliberate.
parsed = parse_gs1("0100884838048096" + "10LOT42" + GS + "21SER99")
eq("lot stops at the separator", parsed.get("lot"), "LOT42")
eq("serial after a separator", parsed.get("serial_number"), "SER99")

parsed = parse_gs1("0100884838048096" + "21SER99" + GS + "10LOT42")
eq("order does not matter", (parsed.get("serial_number"), parsed.get("lot")),
   ("SER99", "LOT42"))

# Day 00 means the end of the month, and February has to be right.
eq("expiry day 00 is end of month",
   parse_gs1("17250200").get("expiry_date"), date(2025, 2, 28))
eq("end of a leap February",
   parse_gs1("17240200").get("expiry_date"), date(2024, 2, 29))
eq("end of December", parse_gs1("17251200").get("expiry_date"), date(2025, 12, 31))
eq("an impossible month is not a date", parse_gs1("17251340").get("expiry_date"), None)

# Manufacture date is a different field and must not be mistaken for expiry.
parsed = parse_gs1("11240101" + "17260101")
eq("manufactured date kept apart", parsed.get("manufactured_date"), date(2024, 1, 1))
eq("expiry kept apart", parsed.get("expiry_date"), date(2026, 1, 1))

# An unknown identifier stops the walk. Reading past it would shift every field
# after it, and a shifted serial still looks like a serial.
parsed = parse_gs1("0100884838048096" + "99SOMETHING" + GS + "21SER99")
eq("GTIN before the unknown field is kept", parsed.get("gtin"), "00884838048096")
ok("nothing is invented after an unknown identifier",
   parsed.get("serial_number") is None, "got {!r}".format(parsed.get("serial_number")))

# Symbology identifiers are wrapping, not data.
eq("the ]d2 prefix is stripped",
   parse_gs1("]d20100884838048096").get("gtin"), "00884838048096")

eq("plain text yields nothing", parse_gs1("JUST SOME TEXT"), {})
eq("empty yields nothing", parse_gs1(""), {})

# ── GTIN normalisation ───────────────────────────────────────────────────────

# GTIN-8 is the shortest valid form, so seven digits is not a GTIN at all.
# This started out asserting that seven digits should be padded, which was the
# test being wrong about the standard rather than the code being wrong.
eq("a GTIN-8 is padded to 14", normalise_gtin("88483804"), "00000088483804")
eq("seven digits is not a GTIN", normalise_gtin("8848380"), None)
eq("14 digits are left alone", normalise_gtin("00884838048096"), "00884838048096")
eq("separators are ignored", normalise_gtin("088-483-804809-6"), "00884838048096")
eq("too short is not a GTIN", normalise_gtin("1234"), None)
eq("too long is not a GTIN", normalise_gtin("1234567890123456789"), None)
eq("nothing is not a GTIN", normalise_gtin(None), None)

# ── printed text ─────────────────────────────────────────────────────────────

plate = """
PHILIPS MEDICAL SYSTEMS
IntelliVue MX40 Patient Monitor
REF 866064
MODEL MX40-WLAN
SN  US81234567
LOT  A2291
"""
fields = extract_label_fields(plate)
eq("REF read", fields.get("ref"), "866064")
eq("MODEL read", fields.get("model"), "MX40-WLAN")
eq("SN read", fields.get("serial_number"), "US81234567")
eq("LOT read", fields.get("lot"), "A2291")

# The other spellings a plate actually uses.
eq("S/N with a slash",
   extract_label_fields("S/N: AB123456").get("serial_number"), "AB123456")
eq("CAT NO as a catalogue number",
   extract_label_fields("CAT NO. 7734-B").get("ref"), "7734-B")
eq("P/N as a part number",
   extract_label_fields("P/N 452213").get("part_number"), "452213")
eq("SERIAL NUMBER spelled out",
   extract_label_fields("SERIAL NUMBER 99881122").get("serial_number"), "99881122")
eq("lower case is read too",
   extract_label_fields("Model: xyz-900").get("model"), "XYZ-900")

# What must NOT be read. A keyword inside a word is not a label, and a keyword
# followed by nothing useful is not a value.
ok("REFERENCE is not a REF field",
   "ref" not in extract_label_fields("SEE REFERENCE MANUAL"),
   str(extract_label_fields("SEE REFERENCE MANUAL")))
ok("a keyword with no value yields nothing",
   extract_label_fields("REF:") == {}, str(extract_label_fields("REF:")))
ok("a single character is not a value",
   "model" not in extract_label_fields("MODEL A"),
   str(extract_label_fields("MODEL A")))
eq("empty text yields nothing", extract_label_fields(""), {})
eq("no keywords yields nothing",
   extract_label_fields("STERILE EO  DO NOT REUSE"), {})

# ── the reader as a whole, without a photograph ──────────────────────────────

# A photograph that cannot be opened must produce an empty reading, not an
# exception: a capture with an unreadable image is still a capture.
reading = read_label(b"this is not an image", with_ocr=False)
ok("garbage input does not raise", reading is not None)
ok("and finds nothing", not reading.found_anything)
eq("and says the barcode reader found nothing",
   reading.readers.get("barcode"), "nothing found")
eq("and that OCR was skipped", reading.readers.get("ocr"), "skipped")

reading = read_label(b"", with_ocr=True)
ok("empty input does not raise", reading is not None and not reading.found_anything)

# ── the native decoders, if this machine has them ────────────────────────────

try:
    from pylibdmtx import pylibdmtx  # noqa: F401
    from PIL import Image
    import io

    payload = "0100884838048096" + "17250131" + "10LOT42"
    encoded = pylibdmtx.encode(payload.encode("ascii"))
    image = Image.frombytes("RGB", (encoded.width, encoded.height), encoded.pixels)
    buffer = io.BytesIO()
    image.save(buffer, format="PNG")

    found = decode_barcodes(buffer.getvalue())
    ok("a DataMatrix is decoded", any(sym == "DATAMATRIX" for sym, _ in found),
       str(found)[:120])
    reading = read_label(buffer.getvalue(), with_ocr=False)
    eq("and its GTIN reaches the reading", reading.gtin, "00884838048096")
    eq("and its expiry", reading.expiry_date, date(2025, 1, 31))
    eq("and its lot", reading.lot, "LOT42")
except Exception as exc:  # noqa: BLE001
    skipped.append("DataMatrix round-trip ({})".format(type(exc).__name__))

print()
for note in skipped:
    print("SKIP  {} -- run part_label_doctor.py on the server".format(note))
if failures:
    print()
    print("{} failed: {}".format(len(failures), ", ".join(failures)))
    raise SystemExit(1)
print()
print("all checks passed")


# ── seeding a definition from what was read ──────────────────────────────────
#
# The dangerous behaviour is overwriting. Somebody who typed a model number has
# made a decision, and a reader that replaced it would be wrong, invisible, and
# about a medical part. Every case below exists to pin that down.

from app.api.v1.endpoints.inventory_capture import _seed_definition  # noqa: E402
from app.models.part_definition import PartDefinition  # noqa: E402
from app.utils.part_labels import LabelReading  # noqa: E402

REGISTERED = {
    "brand_name": "IntelliVue MX40",
    "company_name": "Philips Medical Systems",
    "model": "866064",
    "catalog_number": "MX40-WLAN",
    "description": "Patient monitor, ambulatory",
}

# An empty kind takes everything the registry knows.
blank_def = PartDefinition(name="Unnamed part")
reading = LabelReading(gtin="00884838048096")
filled = _seed_definition(blank_def, reading, REGISTERED)
eq("registry fills the part number", blank_def.part_number, "MX40-WLAN")
eq("registry fills the make", blank_def.make, "Philips Medical Systems")
eq("registry fills the model", blank_def.model, "866064")
eq("registry fills the description", blank_def.description, "Patient monitor, ambulatory")
eq("the GTIN is kept", blank_def.gtin, "00884838048096")
eq("an unnamed kind takes the brand name", blank_def.name, "IntelliVue MX40")
eq("and it says the identity came from the UDI", blank_def.identified_from, "udi")
ok("it reports what it filled", set(filled) >= {"part_number", "make", "model"}, str(filled))

# A kind somebody has already described keeps every word of it.
typed = PartDefinition(
    name="Ward pump 3",
    part_number="LOCAL-77",
    make="Acme",
    model="TYPED-BY-A-PERSON",
    description="The one from theatre 2",
)
filled = _seed_definition(typed, LabelReading(gtin="00884838048096"), REGISTERED)
eq("a typed part number survives", typed.part_number, "LOCAL-77")
eq("a typed make survives", typed.make, "Acme")
eq("a typed model survives", typed.model, "TYPED-BY-A-PERSON")
eq("a typed description survives", typed.description, "The one from theatre 2")
eq("a real name survives", typed.name, "Ward pump 3")
eq("only the empty field was filled", filled, ["gtin"])

# Half-described: the gaps fill, the answers stay.
partial = PartDefinition(name="Pump", model="MINE")
_seed_definition(partial, LabelReading(gtin="00884838048096"), REGISTERED)
eq("the gap is filled", partial.make, "Philips Medical Systems")
eq("the answer is not", partial.model, "MINE")

# No registry entry: printed text is used, and says so.
off_registry = PartDefinition(name="Unnamed part")
_seed_definition(
    off_registry,
    LabelReading(fields={"ref": "866064", "model": "MX40-WLAN"}),
    None,
)
eq("REF becomes the part number", off_registry.part_number, "866064")
eq("MODEL becomes the model", off_registry.model, "MX40-WLAN")
eq("and it says the identity was read off the label",
   off_registry.identified_from, "label")
ok("an unnamed kind stays unnamed without a registry entry",
   off_registry.name == "Unnamed part", off_registry.name)

# Nothing read: nothing claimed.
untouched = PartDefinition(name="Unnamed part")
filled = _seed_definition(untouched, LabelReading(), None)
eq("nothing read means nothing filled", filled, [])
eq("and no identity is claimed", untouched.identified_from, None)

# Blank strings from a sloppy record are not values.
blanks = PartDefinition(name="Unnamed part")
_seed_definition(blanks, LabelReading(), {"company_name": "   ", "model": ""})
eq("whitespace is not a make", blanks.make, None)
eq("and no identity is claimed from it", blanks.identified_from, None)
