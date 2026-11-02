"""Convert legacy ``pm_descs`` HTML inspection forms into the application's
native custom-grid form schema.

The legacy system stored each inspection form as an HTML checklist table: test
items, each with Pass/Fail/N/A radio inputs (``name="1".."N"``) and occasional
free-text inputs.  Completed inspections stored the *same* table in
``inspection_reports.tests`` with ``checked="checked"`` marking the answers.

This module produces:

* :func:`build_grid_schema` - the ``inspection_forms.schema`` JSON that the
  frontend renders and fills through its existing custom-grid engine (no app
  code changes required).
* :func:`extract_answers` - the ``{value_key: answer}`` map for a completed
  report, keyed identically to the schema so migrated inspections open with
  their original answers populated.

Both share :func:`parse_form`, so a form template and its completed reports are
guaranteed to use the same field keys.
"""
from __future__ import annotations

import re
from html.parser import HTMLParser
from typing import Any

# Answer block id shared by every item cell.  Value key is ``<cell_id>__ans``.
ANSWER_BLOCK_ID = "ans"
GRID_COLUMNS = 2

# The report screen always shows its own Inspection Report table with these
# nine checks, and its own Biomed Notes boxes. Every legacy form repeated them,
# so they are left out of the converted form (the answers go to the report's
# own fields instead) rather than appearing twice.
STANDARD_CHECKS = {
    "physicalinsp": "physical_inspection",
    "physicalinspection": "physical_inspection",
    "cleaning": "cleaning",
    "display": "display",
    "lubrication": "lubrication",
    "functional": "functional",
    "calibration": "calibration",
    "electricalsafety": "electrical_safety",
    "battery": "battery",
    "pmkit": "pm_kit",
}
# Captions of the legacy notes block, plus the builder's untitled placeholder.
NOTE_CAPTIONS = {
    "biomed notes", "reported problem", "problem found", "corrective action taken",
    "summary", "set title",
}
# The legacy notes block's own text boxes (Reported Problem, Problem Found,
# Corrective action taken, Summary), named or identified only by their id.
NOTE_INPUT_NAMES = {"temp_r_fault", "temp_p_fault", "temp_c_fault", "temp_summary"}
# The standard table's own reading boxes: Set / Read on the Electrical Safety
# row, Replaced on / Due on the Battery and PM Kit rows. The report's table
# has the same boxes, so these belong to it as well.
READING_ROWS = {"electrical_safety", "battery", "pm_kit"}
READING_LABELS = {"set": "set", "read": "read", "replaced on": "replaced_on", "due": "due"}
# A label longer than this does not fit beside its box in a half-width cell.
LONG_INPUT_LABEL = 18


def standard_check_key(label: str) -> str | None:
    """The report's own check key for a legacy item label, if it is one."""
    return STANDARD_CHECKS.get("".join(ch for ch in (label or "").lower() if ch.isalnum()))


def note_input_name(key: str) -> str | None:
    """The legacy notes box a field key stands for, if it is one."""
    name = key[len("id_"):] if key.startswith("id_") else key
    return name if name in NOTE_INPUT_NAMES else None


def _is_report_owned(item: dict[str, Any]) -> bool:
    """True for items the report screen already provides natively."""
    if item["kind"] == "heading":
        return item["label"].strip().lower() in NOTE_CAPTIONS
    if item["kind"] == "input":
        return bool(item.get("report_field")) or note_input_name(item.get("name") or "") is not None
    return item["kind"] == "radio" and standard_check_key(item["label"]) is not None


# Column-header words that are never real item labels.
_HEADER_WORDS = {"test", "pass", "fail", "n/a", "na", "result", "check", ""}

# Raw radio ``value`` -> display option label (also the stored answer value).
_OPTION_LABELS = {
    "pass": "Pass",
    "fail": "Fail",
    "na": "N/A",
    "n/a": "N/A",
    "yes": "Yes",
    "no": "No",
    "ok": "OK",
    "good": "Good",
    "bad": "Bad",
    "true": "Yes",
    "false": "No",
    "1": "Yes",
    "0": "No",
}


def _option_label(raw: str) -> str:
    cleaned = (raw or "").strip()
    return _OPTION_LABELS.get(cleaned.lower(), cleaned.title() or cleaned or "Option")


class _FormParser(HTMLParser):
    """Walk the legacy form HTML into ordered items and section headings.

    Item structure produced::

        {"name": "1", "kind": "radio", "label": "Physical Insp.",
         "raw_options": ["pass", "fail", "na"],
         "checked": "pass" | None}          # only meaningful for reports
    """

    def __init__(self, duplicate_ids: set[str] | None = None) -> None:
        super().__init__(convert_charrefs=True)
        # Element ids used more than once in the page cannot key a field.
        self._duplicate_ids = duplicate_ids or set()
        self._table_index = -1
        self._row_index = -1
        self.items: list[dict[str, Any]] = []
        self._by_name: dict[str, dict[str, Any]] = {}
        self._order: list[str] = []
        self._last_label = ""
        self._text_buf: list[str] = []
        self._capture_depth = 0
        # Column tracking, so a reading box knows its column's header
        # ("Set", "Actual") in measurement tables.
        self._column = -1
        self._row_texts: dict[int, str] = {}
        self._header: dict[int, str] = {}
        self._cell_depth = 0

    # -- text capture (td / th / heading cells) --------------------------------
    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag == "table":
            self._header = {}
            self._table_index += 1
            self._row_index = -1
        elif tag == "tr":
            self._column = -1
            self._row_texts = {}
            self._row_index += 1
        if tag in ("td", "th"):
            self._column += 1
            self._cell_depth += 1
        if tag in ("td", "th", "h1", "h2", "h3", "h4", "h5", "h6", "strong", "label"):
            self._capture_depth += 1
            self._text_buf = []
        elif tag == "input":
            self._handle_input(dict(attrs))

    def handle_startendtag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag == "input":
            self._handle_input(dict(attrs))

    def handle_endtag(self, tag: str) -> None:
        if tag == "tr":
            # The row naming Pass/Fail is a table's header row.
            words = {text.lower() for text in self._row_texts.values()}
            if {"pass", "fail"} <= words:
                self._header = dict(self._row_texts)
            return
        if tag in ("td", "th", "h1", "h2", "h3", "h4", "h5", "h6", "strong", "label"):
            if self._capture_depth > 0:
                self._capture_depth -= 1
            text = " ".join("".join(self._text_buf).split()).strip()
            self._text_buf = []
            if tag in ("td", "th"):
                self._cell_depth = max(0, self._cell_depth - 1)
                if text or self._column not in self._row_texts:
                    self._row_texts[self._column] = text
            if not text:
                return
            if tag in ("h1", "h2", "h3", "h4", "h5", "h6", "strong"):
                # Section heading: only keep if it is not a stray column header.
                if text.lower() not in _HEADER_WORDS and len(text) > 1:
                    heading = {"kind": "heading", "label": text}
                    if self._cell_depth > 0:
                        # Bold text in a table cell may be the caption of a
                        # box in the same row; remember where it was.
                        heading["_row"] = (self._table_index, self._row_index)
                        self._row_texts[self._column] = text
                    self.items.append(heading)
                return
            # A normal cell's text becomes the label for the next input group.
            if text.lower() not in _HEADER_WORDS:
                self._last_label = text

    def handle_data(self, data: str) -> None:
        if self._capture_depth > 0:
            self._text_buf.append(data)

    # -- inputs ----------------------------------------------------------------
    def _handle_input(self, attrs: dict[str, str | None]) -> None:
        name = (attrs.get("name") or "").strip()
        input_type = (attrs.get("type") or "text").strip().lower()
        if input_type in ("text", "number", ""):
            self._handle_text_input(name, (attrs.get("id") or "").strip(), (attrs.get("value") or "").strip())
            return
        if not name:
            return
        value = (attrs.get("value") or "").strip()
        checked = "checked" in attrs

        if input_type == "radio":
            item = self._by_name.get(name)
            if item is None:
                item = {
                    "name": name,
                    "kind": "radio",
                    "label": self._last_label or f"Item {name}",
                    "raw_options": [],
                    "checked": None,
                }
                self._by_name[name] = item
                self._order.append(name)
                self.items.append(item)
            if value and value not in item["raw_options"]:
                item["raw_options"].append(value)
            if checked and value:
                item["checked"] = value

    def _handle_text_input(self, name: str, element_id: str, value: str) -> None:
        """One field per text box.

        Measurement tables gave every row's Set box the same name and left the
        Actual and Note boxes unnamed, so keying by name alone merged all the
        Set readings into one field and dropped the rest. A box keeps its name
        when that is free, so existing answers stay attached. An unnamed box is
        keyed by its label ("SpO2 - Actual"), numbered when a page repeats a
        label: the legacy pages reused element ids across layouts (id 5 was
        PM Kit's date in one and an EKG reading in another), but the label is
        what the technician read and wrote against, so the same reading lines
        up across every report. Only a box with no label at all falls back to
        its id or its table position. Derived keys carry a prefix, so they
        never collide with a question's name; the legacy notes boxes keep their
        id, which is how they are recognised.
        """
        label = self._last_label
        row_name = self._row_texts.get(0, "")
        captioned = bool(self.items) and self.items[-1].get("kind") == "heading" \
            and self.items[-1].get("_row") == (self._table_index, self._row_index)
        if captioned:
            # A bold caption in this row ("Asset Tag#", "Make") names this box;
            # it is the box's label, not a section heading.
            label = self.items.pop()["label"].strip().rstrip(":").strip() or label
        elif (label.strip().rstrip(":").strip().lower() in READING_LABELS
                and row_name and row_name.lower() != label.lower()):
            # A bare "Read:" or "Due" says which reading, not which test.
            label = f"{row_name} \u2013 {label.strip().rstrip(':').strip()}"
        column = self._header.get(self._column, "")
        if label and not captioned and column and column.lower() not in _HEADER_WORDS \
                and column.lower() != label.lower():
            label = f"{label} \u2013 {column}"

        slug = "_".join(re.findall(r"[a-z0-9]+", label.lower()))
        if name and name not in self._by_name:
            key = name
        elif element_id in NOTE_INPUT_NAMES:
            key = f"id_{element_id}"
        elif slug:
            key, number = f"lbl_{slug}", 2
            while key in self._by_name:
                key, number = f"lbl_{slug}_{number}", number + 1
        elif element_id and element_id not in self._duplicate_ids:
            key = f"id_{element_id}"
        elif self._column >= 0:
            key = f"pos_t{self._table_index}_r{self._row_index}_c{self._column}"
        else:
            return
        if key in self._by_name:
            return
        item = {"name": key, "kind": "input", "label": label or f"Field {key}", "raw_options": [], "value": value or None}
        row_owner = standard_check_key(self._row_texts.get(0, ""))
        reading = READING_LABELS.get(self._last_label.strip().rstrip(":").strip().lower())
        if row_owner in READING_ROWS and reading:
            item["report_field"] = (row_owner, reading)
        self._by_name[key] = item
        self._order.append(key)
        self.items.append(item)


def parse_form(html: str) -> list[dict[str, Any]]:
    """Parse legacy form/report HTML into ordered items + headings."""
    counts: dict[str, int] = {}
    for match in re.finditer(r"""\bid\s*=\s*['"]([^'"]+)['"]""", html or ""):
        counts[match.group(1).strip()] = counts.get(match.group(1).strip(), 0) + 1
    parser = _FormParser({element_id for element_id, count in counts.items() if count > 1})
    try:
        parser.feed(html or "")
    except Exception:
        # Malformed markup should degrade to whatever was parsed, never raise.
        pass
    return parser.items


# ---------------------------------------------------------------------------
# Schema construction
# ---------------------------------------------------------------------------
def _radio_cell(item: dict[str, Any]) -> dict[str, Any]:
    options = [_option_label(v) for v in item["raw_options"]] or ["Pass", "Fail", "N/A"]
    # De-duplicate while preserving order.
    seen: set[str] = set()
    options = [o for o in options if not (o in seen or seen.add(o))]
    return {
        "id": f"item_{item['name']}",
        "label": "",
        "type": "text",
        "blocks": [
            {
                "id": ANSWER_BLOCK_ID,
                "type": "radio",
                "label": item["label"],
                "options": options,
                "inline": False,
                "layout": "stacked",
                "optionLayout": "wrap",
                "width": 200,
                "height": 40,
            }
        ],
        "rowSpan": 1,
        "colSpan": 1,
        "width": 240,
        "height": 96,
        "align": "left",
        "verticalAlign": "middle",
        "hidden": False,
    }


def _input_cell(item: dict[str, Any]) -> dict[str, Any]:
    if len(item["label"] or "") > LONG_INPUT_LABEL:
        # The label is drawn on one line beside its box, so a long one gets the
        # whole row instead of spilling into the neighbouring cell.
        return {
            "id": f"item_{item['name']}",
            "label": "",
            "type": "text",
            "blocks": [{
                "id": ANSWER_BLOCK_ID, "type": "input", "label": item["label"],
                "inline": True, "layout": "inline", "width": 460, "height": 40,
            }],
            "rowSpan": 1, "colSpan": GRID_COLUMNS, "width": 480, "height": 80,
            "align": "left", "verticalAlign": "middle", "hidden": False,
        }
    return {
        "id": f"item_{item['name']}",
        "label": "",
        "type": "text",
        "blocks": [
            {
                "id": ANSWER_BLOCK_ID,
                "type": "input",
                "label": item["label"],
                "inline": True,
                "layout": "inline",
                "width": 220,
                "height": 40,
            }
        ],
        "rowSpan": 1,
        "colSpan": 1,
        "width": 240,
        "height": 80,
        "align": "left",
        "verticalAlign": "middle",
        "hidden": False,
    }


def _heading_cell(text: str, index: int) -> dict[str, Any]:
    return {
        "id": f"section_{index}",
        "label": "",
        "type": "text",
        "blocks": [{"id": "hdr", "type": "label", "label": text, "width": 100, "height": 40}],
        "rowSpan": 1,
        "colSpan": GRID_COLUMNS,
        "width": 480,
        "height": 48,
        "align": "left",
        "verticalAlign": "middle",
        "hidden": False,
    }


def merge_item_lists(
    base: list[dict[str, Any]], extra: list[dict[str, Any]]
) -> list[dict[str, Any]]:
    """Union a form's own items with items recorded in its inspections.

    The base form's structure and order are preserved; radio option sets are
    unioned for shared items, and item names that only ever appeared in
    completed reports (form drift since the template was authored) are appended
    under a trailing heading so those historical answers still have a field to
    render into.
    """
    extra_by_name: dict[str, dict[str, Any]] = {}
    extra_order: list[str] = []
    for item in extra:
        if item.get("kind") == "heading":
            continue
        name = item["name"]
        if name not in extra_by_name:
            extra_by_name[name] = {
                "name": name,
                "kind": item["kind"],
                "label": item["label"],
                "raw_options": list(item.get("raw_options", [])),
            }
            if item.get("report_field"):
                extra_by_name[name]["report_field"] = item["report_field"]
            extra_order.append(name)
        else:
            merged = extra_by_name[name]
            if item["kind"] == "radio":
                merged["kind"] = "radio"
            for option in item.get("raw_options", []):
                if option not in merged["raw_options"]:
                    merged["raw_options"].append(option)

    base_names = {item["name"] for item in base if item.get("kind") != "heading"}
    merged_items: list[dict[str, Any]] = []
    for item in base:
        if item.get("kind") != "heading":
            supplement = extra_by_name.get(item["name"])
            if supplement:
                for option in supplement["raw_options"]:
                    if option not in item["raw_options"]:
                        item["raw_options"].append(option)
        merged_items.append(item)

    # A box keyed by its position ("pos_") is only reliable within the page
    # layout it came from, so one seen only in completed reports is not added;
    # its value stays in the stored legacy report.
    drifted = [extra_by_name[name] for name in extra_order
               if name not in base_names and not name.startswith("pos_")]
    if drifted:
        merged_items.append({"kind": "heading", "label": "Additional recorded items"})
        merged_items.extend(drifted)
    return merged_items


def build_grid_schema_from_items(
    items: list[dict[str, Any]], title: str, legacy_id: int
) -> dict[str, Any]:
    """Return the ``inspection_forms.schema`` JSON for parsed/merged items."""
    had_items = any(item["kind"] != "heading" for item in items)
    items = _without_report_owned(items)
    rows: list[list[dict[str, Any]]] = []
    current: list[dict[str, Any]] = []

    def flush() -> None:
        nonlocal current
        if current:
            rows.append(current)
            current = []

    heading_index = 0
    for item in items:
        kind = item["kind"]
        if kind == "heading":
            flush()
            heading_index += 1
            rows.append([_heading_cell(item["label"], heading_index)])
            continue
        cell = _radio_cell(item) if kind == "radio" else _input_cell(item)
        if cell["colSpan"] == GRID_COLUMNS:
            flush()
            rows.append([cell])
            continue
        current.append(cell)
        if len(current) == GRID_COLUMNS:
            flush()
    flush()

    if not rows and had_items:
        # Everything this form held is already on the report itself.
        rows = [[_heading_cell("No device-specific checks beyond the standard inspection.", 1)]]
    if not rows:
        # Empty/stub legacy form (e.g. ids 4 & 6): valid single-note grid.
        rows = [[{
            "id": "item_note",
            "label": "",
            "type": "text",
            "blocks": [{
                "id": ANSWER_BLOCK_ID, "type": "textarea", "label": "Notes",
                "width": 480, "height": 120,
            }],
            "rowSpan": 1, "colSpan": GRID_COLUMNS, "width": 480, "height": 140,
            "align": "left", "verticalAlign": "top", "hidden": False,
        }]]

    return {
        "version": 3,
        "source": "legacy_pm_desc",
        "legacy_pm_desc_id": legacy_id,
        "title": title,
        "custom_grid": {
            "title": title,
            "rows": len(rows),
            "columns": GRID_COLUMNS,
            "cells": rows,
        },
    }


def _without_report_owned(items: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Drop report-owned items, then any heading left with nothing under it."""
    kept = [item for item in items if not _is_report_owned(item)]
    result: list[dict[str, Any]] = []
    for index, item in enumerate(kept):
        if item["kind"] == "heading":
            following = kept[index + 1] if index + 1 < len(kept) else None
            if following is None or following["kind"] == "heading":
                continue
        result.append(item)
    return result


def _items_from_grid(cells: list[list[dict[str, Any]]]) -> list[dict[str, Any]] | None:
    """Recover the item list a converted grid was built from (None if not one)."""
    items: list[dict[str, Any]] = []
    for row in cells:
        for cell in row:
            cell_id = str(cell.get("id") or "")
            blocks = cell.get("blocks") or []
            if not blocks:
                return None
            block = blocks[0]
            if cell_id.startswith("section_"):
                items.append({"kind": "heading", "label": str(block.get("label") or "")})
            elif cell_id.startswith("item_") and cell_id != "item_note" and block.get("type") in ("radio", "input"):
                items.append({
                    "name": cell_id[len("item_"):],
                    "kind": block["type"],
                    "label": str(block.get("label") or ""),
                    "raw_options": [str(o) for o in (block.get("options") or [])],
                })
            else:
                return None
    return items


def clean_grid_schema(schema: dict[str, Any]) -> tuple[dict[str, Any], list[str]]:
    """Rebuild an already-migrated legacy form without the report-owned items.

    Only a form the migration produced and nobody has edited since
    (``source == "legacy_pm_desc"``) is touched; anything else is returned
    unchanged. Rebuilding through the same builder as the migration keeps cell
    ids, and so every recorded answer key, exactly as they were. Returns the new
    schema and the labels that were removed.
    """
    grid = (schema or {}).get("custom_grid") or {}
    if (schema or {}).get("source") != "legacy_pm_desc" or not isinstance(grid.get("cells"), list):
        return schema, []
    items = _items_from_grid(grid["cells"])
    if items is None or not any(item["kind"] != "heading" for item in items):
        # Not a converted grid, or already reduced to its placeholder.
        return schema, []
    removed = [item["label"] for item in items if _is_report_owned(item)]
    rebuilt = build_grid_schema_from_items(
        items, schema.get("title") or grid.get("title") or "", schema.get("legacy_pm_desc_id"))
    if rebuilt["custom_grid"]["cells"] == grid["cells"]:
        return schema, []
    return {**schema, "custom_grid": {**grid, **rebuilt["custom_grid"]}}, removed


def extract_standard_checks(tests_html: str) -> dict[str, str]:
    """The report's own check answers (``pass`` / ``fail`` / ``na``) from a legacy report."""
    checks: dict[str, str] = {}
    for item in parse_form(tests_html or ""):
        if item["kind"] != "radio" or not item.get("checked"):
            continue
        key = standard_check_key(item["label"])
        value = item["checked"].strip().lower()
        value = "na" if value in ("n/a", "na") else value
        if key and value in ("pass", "fail", "na"):
            checks[key] = value
    return checks


def extract_standard_readings(tests_html: str) -> dict[str, dict[str, str]]:
    """The standard table's readings from a legacy report.

    ``{"electrical_safety": {"set": .., "read": ..}, "battery": {"replaced_on": .., "due": ..}, ...}``,
    only for boxes that were filled in.
    """
    readings: dict[str, dict[str, str]] = {}
    for item in parse_form(tests_html or ""):
        field = item.get("report_field")
        value = (item.get("value") or "").strip()
        if field and value:
            readings.setdefault(field[0], {})[field[1]] = value
    return readings


def build_grid_schema(html: str, title: str, legacy_id: int) -> dict[str, Any]:
    """Convenience wrapper: parse a single form's HTML and build its schema."""
    return build_grid_schema_from_items(parse_form(html), title, legacy_id)


def extract_answers(tests_html: str) -> dict[str, str]:
    """Return ``{value_key: answer}`` for a completed report's ``tests`` HTML.

    Keys match :func:`build_grid_schema` exactly (``item_<name>__ans``), so the
    answers populate the migrated form when the inspection is opened.
    """
    answers: dict[str, str] = {}
    for item in parse_form(tests_html):
        if _is_report_owned(item):
            continue  # recorded in the report's own fields instead
        if item["kind"] == "radio" and item.get("checked"):
            answers[f"item_{item['name']}__{ANSWER_BLOCK_ID}"] = _option_label(item["checked"])
        elif item["kind"] == "input" and item.get("value"):
            answers[f"item_{item['name']}__{ANSWER_BLOCK_ID}"] = item["value"]
    return answers
