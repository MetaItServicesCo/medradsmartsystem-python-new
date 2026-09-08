"""Read what the manufacturer wrote on the part.

Recognition answers "is this the same as something you captured before". It
cannot answer "what is this", because it knows your photographs and nothing
about the world. The answer to "what is this" is printed on the device: a
rating plate carrying the maker, a model or catalogue number, a serial, and on
anything sold as a medical device a UDI barcode that encodes it exactly.

So this reads the label, best source first:

  1. A barcode. A GS1 DataMatrix carries the GTIN, expiry, lot and serial as
     structured fields. There is no interpretation involved -- it is the
     manufacturer's own identifier, and it is either decoded or it is not.
  2. The printed text. REF, MODEL, SN and LOT are conventional enough to find
     with patterns, and wrong often enough that what is found is offered, never
     asserted.

Nothing here decides anything. It returns what it read and how it read it, and
something else decides what to do with that -- because a model number nobody
checked is worse on a medical part than no model number at all.
"""
from __future__ import annotations

import logging
import re
from dataclasses import dataclass, field
from datetime import date
from typing import Any, Optional

logger = logging.getLogger("medrad.part_labels")


# ── what came back ───────────────────────────────────────────────────────────

@dataclass
class LabelReading:
    """Everything the label gave up, and where each part of it came from."""

    barcode_raw: Optional[str] = None
    symbologies: list[str] = field(default_factory=list)
    gtin: Optional[str] = None
    lot: Optional[str] = None
    expiry_date: Optional[date] = None
    serial_number: Optional[str] = None
    ocr_text: Optional[str] = None
    # ref / model / manufacturer / part_number, whichever the text yielded.
    fields: dict[str, str] = field(default_factory=dict)
    # Which readers actually ran, so a missing result can be told apart from a
    # reader that was never able to run at all.
    readers: dict[str, str] = field(default_factory=dict)

    @property
    def found_anything(self) -> bool:
        return bool(
            self.gtin or self.lot or self.expiry_date
            or self.serial_number or self.fields
        )


# ── GS1 element strings ──────────────────────────────────────────────────────
#
# A UDI barcode is a run of (AI, value) pairs with no separators. Fixed-length
# AIs are consumed by length; variable ones run to the next group separator or
# the end. Getting this wrong silently mangles a serial into a lot, so the
# lengths are spelled out rather than assumed.

_GS = "\x1d"

# AI -> total value length, for the fixed-length identifiers a device label uses.
_GS1_FIXED = {
    "00": 18, "01": 14, "02": 14,
    "11": 6, "12": 6, "13": 6, "15": 6, "16": 6, "17": 6,
    "20": 2,
}
# AI -> maximum value length, for the variable ones.
_GS1_VARIABLE = {
    "10": 20,   # lot / batch
    "21": 20,   # serial
    "22": 20,
    "240": 30,  # additional product identification
    "241": 30,  # customer part number
    "30": 8,
    "251": 30,
    "400": 30, "401": 30,
    "10D": 30,
}

_GS1_MEANING = {
    "01": "gtin",
    "10": "lot",
    "17": "expiry_date",
    "11": "manufactured_date",
    "21": "serial_number",
    "240": "additional_id",
    "241": "customer_part_number",
}


def _gs1_date(value: str) -> Optional[date]:
    """YYMMDD, where DD of 00 means 'end of that month'."""
    if len(value) != 6 or not value.isdigit():
        return None
    year = 2000 + int(value[:2])
    month = int(value[2:4])
    day = int(value[4:6])
    if not 1 <= month <= 12:
        return None
    if day == 0:
        # The last day of the month, which is what an unspecified day means.
        if month == 12:
            return date(year, 12, 31)
        return date(year, month + 1, 1) - __import__("datetime").timedelta(days=1)
    try:
        return date(year, month, day)
    except ValueError:
        return None


def parse_gs1(raw: str) -> dict[str, Any]:
    """Split a GS1 element string into the fields a capture stores.

    Unknown identifiers stop the walk rather than being guessed at: reading
    past one would shift every field after it, and a shifted serial looks
    exactly like a real serial.
    """
    text = (raw or "").strip()
    if text.startswith("]d2") or text.startswith("]C1") or text.startswith("]e0"):
        text = text[3:]  # symbology identifier, not data
    text = text.replace("\\x1d", _GS)

    out: dict[str, Any] = {}
    index = 0
    while index < len(text):
        if text[index] == _GS:
            index += 1
            continue
        ai = None
        for width in (2, 3, 4):
            candidate = text[index:index + width]
            if candidate in _GS1_FIXED or candidate in _GS1_VARIABLE:
                ai = candidate
                break
        if ai is None:
            break

        index += len(ai)
        if ai in _GS1_FIXED:
            value = text[index:index + _GS1_FIXED[ai]]
            index += _GS1_FIXED[ai]
        else:
            end = text.find(_GS, index)
            if end == -1:
                end = min(len(text), index + _GS1_VARIABLE[ai])
            value = text[index:end]
            index = end

        name = _GS1_MEANING.get(ai)
        if not name or not value:
            continue
        if name.endswith("_date"):
            parsed = _gs1_date(value)
            if parsed:
                out[name] = parsed
        else:
            out[name] = value.strip()
    return out


def normalise_gtin(value: Optional[str]) -> Optional[str]:
    """Digits only, padded to 14 -- the form GUDID and GS1 both use."""
    if not value:
        return None
    digits = re.sub(r"\D", "", value)
    if not 8 <= len(digits) <= 14:
        return None
    return digits.rjust(14, "0")


# ── barcodes ────────────────────────────────────────────────────────────────

def decode_barcodes(data: bytes) -> list[tuple[str, str]]:
    """Every barcode in the photograph, as (symbology, payload).

    The decoders are native libraries. On a machine without them this returns
    nothing rather than raising: a capture whose barcode could not be read is
    still a capture, and refusing the photograph would be a worse outcome than
    a missing field.
    """
    results: list[tuple[str, str]] = []
    try:
        from PIL import Image
    except Exception:
        return results

    import io

    try:
        image = Image.open(io.BytesIO(data))
        image.load()
        image = image.convert("L")
    except Exception:
        logger.warning("barcode: photograph could not be opened")
        return results

    try:
        from pyzbar import pyzbar

        for found in pyzbar.decode(image):
            payload = found.data.decode("utf-8", "replace").strip()
            if payload:
                results.append((str(found.type), payload))
    except ImportError:
        logger.info("barcode: pyzbar unavailable, 1D and QR codes not read")
    except Exception:
        logger.warning("barcode: pyzbar failed on this photograph", exc_info=True)

    # DataMatrix separately: it is what medical UDI actually uses, and zbar
    # does not read it.
    try:
        from pylibdmtx import pylibdmtx

        # A bounded timeout: an unreadable photograph must not hold a worker
        # while the decoder searches it exhaustively.
        for found in pylibdmtx.decode(image, timeout=3000, max_count=4):
            payload = found.data.decode("utf-8", "replace").strip()
            if payload:
                results.append(("DATAMATRIX", payload))
    except ImportError:
        logger.info("barcode: pylibdmtx unavailable, DataMatrix not read")
    except Exception:
        logger.warning("barcode: pylibdmtx failed on this photograph", exc_info=True)

    return results


# ── printed text ────────────────────────────────────────────────────────────

# The conventions a rating plate actually follows. Anchored to a line start or
# a symbol boundary so that "REF" inside a word does not start a match.
_TEXT_PATTERNS: tuple[tuple[str, str], ...] = (
    ("ref", r"(?:^|[\s|])(?:REF|CAT(?:ALOG(?:UE)?)?(?:\s*(?:NO|NUM|#))?)\b[\s.:#-]*([A-Z0-9][A-Z0-9./-]{2,24})"),
    ("model", r"(?:^|[\s|])(?:MODEL|MODEL\s*NO|MDL|TYPE)\b[\s.:#-]*([A-Z0-9][A-Z0-9./-]{1,24})"),
    ("serial_number", r"(?:^|[\s|])(?:SN|S/N|SER(?:IAL)?(?:\s*(?:NO\.?|NUM(?:BER)?|#))?)\b[\s.:#-]*([A-Z0-9][A-Z0-9./-]{3,24})"),
    ("lot", r"(?:^|[\s|])(?:LOT|BATCH)\b[\s.:#-]*([A-Z0-9][A-Z0-9./-]{2,24})"),
    ("part_number", r"(?:^|[\s|])(?:P/N|PN|PART\s*(?:NO|NUM|#))\b[\s.:#-]*([A-Z0-9][A-Z0-9./-]{2,24})"),
)

# Words that follow a label keyword but are plainly not the value.
_NOT_A_VALUE = {"NO", "NUM", "NUMBER", "AND", "THE", "FOR", "SEE", "USE"}


def extract_label_fields(text: str) -> dict[str, str]:
    """Pull REF, MODEL, SN, LOT and P/N out of whatever OCR produced."""
    if not text:
        return {}
    upper = text.upper()
    found: dict[str, str] = {}
    for name, pattern in _TEXT_PATTERNS:
        # Every match, not just the first: "SERIAL NUMBER 99881122" matches
        # once with "NUMBER" as the value, and stopping there would throw away
        # the real serial standing right behind it.
        for match in re.finditer(pattern, upper, re.MULTILINE):
            value = match.group(1).strip(".:#-/")
            if not value or value in _NOT_A_VALUE:
                continue
            # A value that is only punctuation or a single letter is noise.
            if len(re.sub(r"[^A-Z0-9]", "", value)) < 2:
                continue
            found[name] = value
            break
    return found


def read_label_text(data: bytes) -> Optional[str]:
    """OCR the photograph, upscaled and binarised the way plates read best."""
    try:
        import io

        import pytesseract
        from PIL import Image, ImageOps
    except ImportError:
        logger.info("label: pytesseract unavailable, printed text not read")
        return None

    try:
        image = Image.open(io.BytesIO(data))
        image.load()
        image = ImageOps.exif_transpose(image).convert("L")
        # A plate photographed from a distance is small in the frame; tesseract
        # wants roughly 300dpi-equivalent glyphs, so give it more pixels.
        if max(image.size) < 1400:
            scale = 1400 / max(image.size)
            image = image.resize(
                (int(image.width * scale), int(image.height * scale)),
                Image.LANCZOS,
            )
        image = ImageOps.autocontrast(image)
        return pytesseract.image_to_string(image, config="--psm 6").strip() or None
    except Exception:
        logger.warning("label: OCR failed on this photograph", exc_info=True)
        return None


# ── the whole reading ────────────────────────────────────────────────────────

def read_label(data: bytes, *, with_ocr: bool = True) -> LabelReading:
    """Read a captured photograph for everything the label will give up.

    Barcode first and text second, and the barcode always wins where they
    disagree: one is a decoded identifier, the other is a guess at smudged
    print seen at an angle.
    """
    reading = LabelReading()

    barcodes = decode_barcodes(data)
    reading.readers["barcode"] = "read" if barcodes else "nothing found"
    if barcodes:
        reading.symbologies = [symbology for symbology, _ in barcodes]
        reading.barcode_raw = "\n".join(payload for _, payload in barcodes)[:2000]
        for _, payload in barcodes:
            parsed = parse_gs1(payload)
            if not parsed:
                continue
            reading.gtin = reading.gtin or normalise_gtin(parsed.get("gtin"))
            reading.lot = reading.lot or parsed.get("lot")
            reading.serial_number = reading.serial_number or parsed.get("serial_number")
            reading.expiry_date = reading.expiry_date or parsed.get("expiry_date")
        if reading.gtin is None:
            # Not a GS1 string -- a plain product code, still worth keeping as
            # a candidate identifier rather than discarding.
            for _, payload in barcodes:
                candidate = normalise_gtin(payload)
                if candidate:
                    reading.gtin = candidate
                    break

    if with_ocr:
        text = read_label_text(data)
        reading.ocr_text = (text or "")[:4000] or None
        reading.readers["ocr"] = "read" if text else "nothing found"
        if text:
            fields = extract_label_fields(text)
            reading.fields = fields
            # Only where the barcode said nothing: printed text is the weaker
            # source and must not overwrite a decoded one.
            if not reading.serial_number and fields.get("serial_number"):
                reading.serial_number = fields["serial_number"]
            if not reading.lot and fields.get("lot"):
                reading.lot = fields["lot"]
    else:
        reading.readers["ocr"] = "skipped"

    return reading
