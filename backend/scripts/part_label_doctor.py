"""Prove the label readers work on this machine, one run, no guessing.

The barcode decoders wrap native libraries. They import fine and return nothing
when the library is missing, which is the right behaviour for a capture and the
worst possible behaviour for a diagnosis: everything looks healthy and no label
is ever read. So this encodes a barcode, decodes it back, and says plainly
which readers are actually working.

Run it inside the backend container after deploying:

    docker compose exec backend python scripts/part_label_doctor.py

Optionally point it at a real photograph to see what that photograph yields:

    docker compose exec backend python scripts/part_label_doctor.py /path/to/photo.jpg
"""
from __future__ import annotations

import io
import os
import pathlib
import sys
import time

os.environ.setdefault("DATABASE_URL", "sqlite://")
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))

problems: list[str] = []


def line(status: str, label: str, detail: str = "") -> None:
    print("{:<5} {}{}".format(status, label, "  " + detail if detail else ""))
    if status == "FAIL":
        problems.append(label)


print("Label readers")
print("=" * 62)

# ── the native libraries ─────────────────────────────────────────────────────

try:
    from PIL import Image
    line("ok", "Pillow")
except Exception as exc:  # noqa: BLE001
    line("FAIL", "Pillow", repr(exc))
    Image = None  # type: ignore[assignment]

try:
    import pytesseract
    version = str(pytesseract.get_tesseract_version())
    line("ok", "tesseract binary", "v" + version)
except Exception as exc:  # noqa: BLE001
    line("FAIL", "tesseract binary", "{} -- install tesseract-ocr".format(type(exc).__name__))

try:
    # Importing pyzbar.pyzbar is what loads libzbar, so a clean import is
    # already most of the proof; decoding a blank image runs the rest of the
    # path. There is no version function to call -- an earlier draft of this
    # script called one that does not exist and would have reported a failure
    # on a perfectly healthy machine, which is the exact opposite of the job.
    from pyzbar import pyzbar

    if Image is not None:
        pyzbar.decode(Image.new("L", (32, 32), 255))
    line("ok", "pyzbar / libzbar", "1D and QR readable")
except Exception as exc:  # noqa: BLE001
    line("FAIL", "pyzbar / libzbar",
         "{} -- apt install libzbar0".format(type(exc).__name__))

try:
    from pylibdmtx import pylibdmtx
    line("ok", "pylibdmtx / libdmtx", "DataMatrix readable")
    HAVE_DMTX = True
except Exception as exc:  # noqa: BLE001
    line("FAIL", "pylibdmtx / libdmtx",
         "{} -- apt install libdmtx0b".format(type(exc).__name__))
    HAVE_DMTX = False

print()
print("Round trip")
print("=" * 62)

# ── encode a real UDI payload and read it back ───────────────────────────────

from app.utils.part_labels import read_label  # noqa: E402

# GTIN 00884838048096, expires 2025-01-31, lot LOT42, serial SER99.
PAYLOAD = "0100884838048096" + "17250131" + "10LOT42" + "\x1d" + "21SER99"

if HAVE_DMTX and Image is not None:
    try:
        encoded = pylibdmtx.encode(PAYLOAD.encode("ascii"))
        image = Image.frombytes("RGB", (encoded.width, encoded.height), encoded.pixels)
        # Scaled up the way a photograph of a label would be, rather than a
        # pixel-perfect render nothing in the field ever produces.
        image = image.resize((encoded.width * 4, encoded.height * 4), Image.NEAREST)
        buffer = io.BytesIO()
        image.save(buffer, format="PNG")

        started = time.time()
        reading = read_label(buffer.getvalue(), with_ocr=False)
        elapsed = time.time() - started

        line("ok" if reading.gtin == "00884838048096" else "FAIL",
             "GTIN decoded", str(reading.gtin))
        line("ok" if str(reading.expiry_date) == "2025-01-31" else "FAIL",
             "expiry decoded", str(reading.expiry_date))
        line("ok" if reading.lot == "LOT42" else "FAIL", "lot decoded", str(reading.lot))
        line("ok" if reading.serial_number == "SER99" else "FAIL",
             "serial decoded", str(reading.serial_number))
        line("ok", "decode time", "{:.0f} ms".format(elapsed * 1000))
    except Exception as exc:  # noqa: BLE001
        line("FAIL", "DataMatrix round trip", repr(exc))
else:
    line("skip", "DataMatrix round trip", "decoder unavailable")

print()
print("UDI database")
print("=" * 62)

from app.core.config import settings  # noqa: E402
from app.utils.gudid import lookup_gtin  # noqa: E402

if not settings.UDI_LOOKUP_ENABLED:
    line("skip", "GUDID lookup", "UDI_LOOKUP_ENABLED is false")
else:
    started = time.time()
    # A GTIN that is registered, checked to prove the call reaches openFDA and
    # comes back with the fields the capture path reads.
    found = lookup_gtin("50888439821251")
    elapsed = time.time() - started
    if found is None:
        line("FAIL", "GUDID lookup",
             "no result -- network blocked, or openFDA is unreachable from here")
    else:
        line("ok", "GUDID lookup", "{:.0f} ms".format(elapsed * 1000))
        for key in ("brand_name", "company_name", "model", "description"):
            line("ok" if found.get(key) else "warn", "  " + key, str(found.get(key)))

print()
print("Settings")
print("=" * 62)
for name in ("CAPTURE_LABEL_READING_ENABLED", "CAPTURE_LABEL_OCR_ENABLED",
             "UDI_LOOKUP_ENABLED", "UDI_LOOKUP_TIMEOUT_SECONDS"):
    line("ok", name, str(getattr(settings, name, "<missing>")))

# ── an actual photograph, if one was given ───────────────────────────────────

if len(sys.argv) > 1:
    path = sys.argv[1]
    print()
    print("Photograph: {}".format(path))
    print("=" * 62)
    try:
        with open(path, "rb") as handle:
            data = handle.read()
    except OSError as exc:
        line("FAIL", "read photograph", repr(exc))
        data = b""
    if data:
        started = time.time()
        reading = read_label(data)
        elapsed = time.time() - started
        line("ok", "read in", "{:.0f} ms".format(elapsed * 1000))
        for name, value in reading.readers.items():
            line("ok", "  reader " + name, value)
        for name in ("gtin", "lot", "expiry_date", "serial_number"):
            value = getattr(reading, name)
            line("ok" if value else "warn", "  " + name, str(value))
        line("ok" if reading.fields else "warn", "  text fields", str(reading.fields))
        if reading.ocr_text:
            print()
            print("  --- what OCR saw ---")
            for text_line in reading.ocr_text.splitlines()[:25]:
                if text_line.strip():
                    print("  | " + text_line)
        if reading.gtin:
            found = lookup_gtin(reading.gtin)
            line("ok" if found else "warn", "  registered as",
                 str(found.get("brand_name")) if found else "not in GUDID")

print()
if problems:
    print("{} problem(s): {}".format(len(problems), ", ".join(problems)))
    raise SystemExit(1)
print("Label reading is working on this machine.")
