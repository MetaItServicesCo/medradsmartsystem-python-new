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
        # The page as the technician saw it: each table under its heading, row
        # by row, cell by cell, with the fields each cell held. Hidden rows and
        # cells (``display: none``) are marked, because the page never showed them.
        self.layout: list[dict[str, Any]] = []
        self._section_heading: str | None = None
        self._layout_cell: dict[str, Any] | None = None
        # A checkbox group is every checkbox in one cell; its options are the
        # words printed after each box.
        self._checkbox_cell: tuple[int, int, int] | None = None
        self._pending_option: tuple[dict[str, Any], int] | None = None
        self._th_header: dict[int, str] = {}

    # -- text capture (td / th / heading cells) --------------------------------
    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        hidden = "display:none" in "".join((dict(attrs).get("style") or "").split()).lower()
        if tag == "table":
            self._header = {}
            self._th_header = {}
            self._table_index += 1
            self._row_index = -1
            self.layout.append({"heading": self._section_heading, "rows": []})
            self._section_heading = None
        elif tag == "tr":
            self._column = -1
            self._row_texts = {}
            self._row_index += 1
            if self.layout:
                self.layout[-1]["rows"].append({"hidden": hidden, "cells": []})
        if tag in ("td", "th"):
            self._column += 1
            self._cell_depth += 1
            if self.layout and self.layout[-1]["rows"]:
                self._layout_cell = {"th": tag == "th", "hidden": hidden, "text": [], "items": []}
                self.layout[-1]["rows"][-1]["cells"].append(self._layout_cell)
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
            row = self.layout[-1]["rows"][-1] if self.layout and self.layout[-1]["rows"] else None
            if row and row["cells"] and all(cell["th"] for cell in row["cells"]):
                self._th_header = dict(self._row_texts)
            return
        if tag in ("td", "th"):
            self._finish_open_checkboxes()
        if tag in ("td", "th", "h1", "h2", "h3", "h4", "h5", "h6", "strong", "label"):
            if self._capture_depth > 0:
                self._capture_depth -= 1
            text = " ".join("".join(self._text_buf).split()).strip()
            self._text_buf = []
            if tag in ("td", "th"):
                self._cell_depth = max(0, self._cell_depth - 1)
                if text or self._column not in self._row_texts:
                    self._row_texts[self._column] = text
                if self._layout_cell is not None:
                    self._layout_cell["text"] = " ".join("".join(self._layout_cell["text"]).split())
                    self._layout_cell = None
            if not text:
                return
            if tag in ("h1", "h2", "h3", "h4", "h5", "h6", "strong"):
                # Section heading: only keep if it is not a stray column header.
                if text.lower() not in _HEADER_WORDS and len(text) > 1:
                    heading = {"kind": "heading", "label": text}
                    if self._cell_depth == 0:
                        self._section_heading = text
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
        if self._layout_cell is not None and isinstance(self._layout_cell["text"], list):
            self._layout_cell["text"].append(data)
        if self._pending_option is not None and data.strip():
            item, index = self._pending_option
            item["raw_options"][index] = " ".join(data.split())
            self._pending_option = None

    def _note_item(self, item: dict[str, Any]) -> None:
        """Remember that the current cell holds ``item``."""
        if self._layout_cell is not None and item["name"] not in self._layout_cell["items"]:
            self._layout_cell["items"].append(item["name"])

    # -- inputs ----------------------------------------------------------------
    def _handle_input(self, attrs: dict[str, str | None]) -> None:
        name = (attrs.get("name") or "").strip()
        input_type = (attrs.get("type") or "text").strip().lower()
        if input_type != "checkbox":
            self._finish_open_checkboxes()
        if input_type in ("text", "number", ""):
            self._handle_text_input(name, (attrs.get("id") or "").strip(), (attrs.get("value") or "").strip())
            return
        if input_type == "checkbox":
            self._handle_checkbox("checked" in attrs)
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
            self._note_item(item)

    def _handle_checkbox(self, checked: bool) -> None:
        """Every checkbox in one cell is one question with several options.

        The legacy pages printed each box's option after it ("Standard", "MD",
        "Super C") under a bold caption ("Hardware Configuration:"); a lone box
        is named by its own words ("Gamma Correction") or, with none, by its
        column ("Present"). The boxes carry no name, so the question is keyed
        by its label, like an unnamed text box.
        """
        position = (self._table_index, self._row_index, self._column)
        item = self.items[-1] if self.items else None
        if self._checkbox_cell != position or not item or item.get("kind") != "checkbox":
            label = ""
            if self.items and self.items[-1].get("kind") == "heading" \
                    and self.items[-1].get("_row") == (self._table_index, self._row_index):
                label = self.items.pop()["label"].strip().rstrip(":").strip()
            column = self._header.get(self._column, "") or self._th_header.get(self._column, "") or ""
            item = {"name": "", "kind": "checkbox", "label": label, "raw_options": [], "checked_options": [],
                    "_column_label": column}
            self._checkbox_cell = position
            self.items.append(item)
        item["raw_options"].append("")
        index = len(item["raw_options"]) - 1
        if checked:
            item["checked_options"].append(index)
        self._pending_option = (item, index)

    def _finish_open_checkboxes(self) -> None:
        self._pending_option = None
        for item in self.items[-3:]:
            if item.get("kind") == "checkbox" and not item.get("name"):
                self._finish_checkbox(item)

    def _finish_checkbox(self, item: dict[str, Any]) -> None:
        """Name a checkbox question once its options' words are known."""
        if item.get("name"):
            return
        column = item.pop("_column_label", "") or ""
        row_label = self._row_texts.get(0, "") if self._column > 0 else ""
        options = item["raw_options"]
        label = item["label"] or (options[0] if len(options) == 1 and options[0] else "") \
            or " \u2013 ".join(part for part in (row_label, column) if part) or column or "Checkbox"
        item["label"] = label
        item["raw_options"] = [option or column or "Checked" for option in options]
        slug = "_".join(re.findall(r"[a-z0-9]+", label.lower())) or "checkbox"
        key, number = f"cb_{slug}", 2
        while key in self._by_name:
            key, number = f"cb_{slug}_{number}", number + 1
        item["name"] = key
        self._by_name[key] = item
        self._order.append(key)
        self._note_item(item)

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
        self._note_item(item)


def _parse(html: str) -> _FormParser:
    counts: dict[str, int] = {}
    for match in re.finditer(r"""\bid\s*=\s*['"]([^'"]+)['"]""", html or ""):
        counts[match.group(1).strip()] = counts.get(match.group(1).strip(), 0) + 1
    parser = _FormParser({element_id for element_id, count in counts.items() if count > 1})
    try:
        parser.feed(html or "")
    except Exception:
        # Malformed markup should degrade to whatever was parsed, never raise.
        pass
    parser._finish_open_checkboxes()
    return parser


def parse_layout(html: str) -> list[dict[str, Any]]:
    """The legacy page's tables as shown: ``[{"heading", "rows": [{"hidden", "cells": [...]}]}]``.

    Each cell is ``{"th", "hidden", "text", "items": [field names]}``; field
    names are the same keys :func:`parse_form` gives.
    """
    return _parse(html).layout


def parse_form(html: str) -> list[dict[str, Any]]:
    """Parse legacy form/report HTML into ordered items + headings."""
    return _parse(html).items


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


def _checkbox_cell(item: dict[str, Any]) -> dict[str, Any]:
    """A checkbox question: one box per option, each answer ``<cell>__ans__<n>``."""
    return {
        "id": f"item_{item['name']}",
        "label": "",
        "type": "text",
        "blocks": [{
            "id": ANSWER_BLOCK_ID, "type": "checkbox", "label": item["label"],
            "options": list(item["raw_options"]) or ["Checked"], "optionLayout": "wrap",
            "width": 220, "height": 40,
        }],
        "rowSpan": 1, "colSpan": 1, "width": 240, "height": 80,
        "align": "left", "verticalAlign": "middle", "hidden": False,
    }


def _item_cell(item: dict[str, Any]) -> dict[str, Any]:
    if item["kind"] == "radio":
        return _radio_cell(item)
    if item["kind"] == "checkbox":
        return _checkbox_cell(item)
    return _input_cell(item)


# ---------------------------------------------------------------------------
# The legacy page's own tables
# ---------------------------------------------------------------------------
# Option columns ("Pass", "Fail", "N/A") are narrow; everything else is wide.
_NARROW_COLUMNS = {"pass", "fail", "n/a", "na", "present", "missing", "yes", "no", "working"}
NARROW_WIDTH, WIDE_WIDTH = 72, 150
MAX_COLUMNS = 12  # the most columns the form screens keep


def _plain_cell(cell_id: str, text: str, *, span: int, width: int, bold: bool = False) -> dict[str, Any]:
    """A cell that shows the legacy page's words (a test name, a column heading)."""
    return {
        "id": cell_id, "label": "", "type": "text",
        "blocks": [{"id": "txt", "type": "label", "label": text, "width": 100, "height": 32}] if text else [],
        "rowSpan": 1, "colSpan": span, "width": width, "height": 48 if bold else 56,
        "align": "left" if not bold else "center", "verticalAlign": "middle", "hidden": False,
    }


def _covered_cell(cell_id: str, span: int) -> dict[str, Any]:
    """Placeholder under a cell that spans several rows."""
    return {"id": cell_id, "label": "", "type": "text", "blocks": [], "rowSpan": 1, "colSpan": span,
            "width": 0, "height": 0, "align": "left", "verticalAlign": "middle", "hidden": True}


def _spans(width: int, columns: int) -> list[int]:
    """Share ``columns`` grid columns among a table's ``width`` columns."""
    base, extra = divmod(columns, max(1, width))
    return [base + (1 if index < extra else 0) for index in range(width)]


def _is_captioned(cell: dict[str, Any], item: dict[str, Any]) -> bool:
    """True when the legacy cell printed its own caption beside the field."""
    text = cell["text"]
    for option in item.get("raw_options") or []:
        text = text.replace(option, "")
    return bool(text.strip(" :\u00a0"))


def _layout_rows(layout: list[dict[str, Any]], items: list[dict[str, Any]],
                 aliases: dict[str, str] | None = None) -> tuple[list[list[dict[str, Any]]], int]:
    """The legacy page's tables as grid rows, and the grid's column count.

    Each table keeps its heading, its column headings and its rows: a test
    name in its own cell, the Pass / Fail / N/A choice under those columns, a
    Note box under Note. The nine standard checks and the Biomed Notes belong
    to the report screen, so their rows (and tables left empty) are dropped.
    Questions not on the page (only ever seen in completed reports) follow
    under "Additional recorded items". Every field keeps the cell id the
    converter always gave it, so recorded answers stay where they are.
    """
    aliases = aliases or {}
    by_name = {item["name"]: item for item in items if item["kind"] != "heading" and not _is_report_owned(item)
               and item["name"] not in aliases}
    for older, page_name in aliases.items():
        older_item = next((item for item in items if item.get("name") == older), None)
        if older_item and page_name in by_name:
            for option in older_item.get("raw_options") or []:
                if option not in by_name[page_name]["raw_options"]:
                    by_name[page_name]["raw_options"].append(option)
    sections = []
    for section in layout:
        rows = []
        for row in section["rows"]:
            if row["hidden"]:
                continue
            cells = [cell for cell in row["cells"] if not cell["hidden"]]
            fields = [name for cell in cells for name in cell["items"]]
            kept = [name for name in fields if name in by_name]
            if fields and not kept:
                continue  # a row of the report's own checks or notes
            if not fields and not any(cell["text"] for cell in cells):
                continue
            rows.append(cells)
        if any(name in by_name for cells in rows for cell in cells for name in cell["items"]):
            while rows and not any(cell["items"] for cell in rows[-1]) and not rows[-1][0]["th"] \
                    and len(rows) > 1 and any(cell["items"] for cell in rows[-2]):
                rows.pop()  # trailing rows of loose words under the last question
            sections.append((section.get("heading"), rows))
    placed = {name for _, rows in sections for cells in rows for cell in cells for name in cell["items"]}
    unplaced = [item for name, item in by_name.items() if name not in placed]
    columns = max([2] + [max(len(cells) for cells in rows) for _, rows in sections])
    columns = min(columns, MAX_COLUMNS)

    grid: list[list[dict[str, Any]]] = []
    heading_index = 0
    for heading, rows in sections:
        width = min(MAX_COLUMNS, max(len(cells) for cells in rows))
        spans = _spans(width, columns)
        header_words = [cell["text"].lower() for cell in rows[0]] if rows and not any(c["items"] for c in rows[0]) else []
        widths = [NARROW_WIDTH if index < len(header_words) and header_words[index] in _NARROW_COLUMNS else WIDE_WIDTH
                  for index in range(width)]
        if heading and heading.strip().lower() not in NOTE_CAPTIONS:
            heading_index += 1
            grid.append([_heading_cell(heading, heading_index) | {"colSpan": columns}])
        for cells in rows:
            cells = cells[:width]
            header = not any(cell["items"] for cell in cells)
            depth = max([1] + [len([n for n in cell["items"] if n in by_name]) for cell in cells])
            out_rows: list[list[dict[str, Any]]] = [[] for _ in range(depth)]
            index = 0
            while index < len(cells):
                cell = cells[index]
                names = [name for name in cell["items"] if name in by_name]
                span, cell_width, end = spans[index], widths[index], index + 1
                if len(names) == 1 and by_name[names[0]]["kind"] == "radio":
                    # One radio question laid across its Pass / Fail / N/A cells.
                    while end < len(cells) and cells[end]["items"] == cell["items"]:
                        span += spans[end]
                        cell_width += widths[end]
                        end += 1
                row_number = len(grid)
                if not names:
                    out_rows[0].append(_plain_cell(f"txt_{row_number}_{index}", cell["text"], span=span,
                                                   width=cell_width, bold=header or cell["th"]) | {"rowSpan": depth})
                    for level in range(1, depth):
                        out_rows[level].append(_covered_cell(f"cover_{row_number}_{index}_{level}", span))
                for level, name in enumerate(names):
                    item = by_name[name]
                    field = _item_cell(item)
                    block = field["blocks"][0]
                    if not _is_captioned(cell, item):
                        block["label"] = ""
                    if item["kind"] == "radio":
                        block["optionLayout"] = "horizontal"
                        field["align"] = "center"
                    field.update({"colSpan": span, "width": cell_width, "height": 56,
                                  "rowSpan": depth - len(names) + 1 if level == len(names) - 1 else 1,
                                  "itemLabel": item["label"]})
                    block["width"] = max(60, cell_width - 16)
                    out_rows[level].append(field)
                # A cell holding fewer fields than the row is deep is stretched by
                # its last field's rowSpan; cover the rows beneath it.
                if names and len(names) < depth:
                    for level in range(len(names), depth):
                        out_rows[level].append(_covered_cell(f"cover_{row_number}_{index}_{level}", span))
                index = end
            grid.extend(out_rows)
    if unplaced:
        heading_index += 1
        grid.append([_heading_cell("Additional recorded items", heading_index) | {"colSpan": columns}])
        label_span = max(1, columns // 2)
        for item in unplaced:
            row_number = len(grid)
            field = _item_cell(item)
            field["blocks"][0]["label"] = ""
            field.update({"colSpan": columns - label_span, "width": WIDE_WIDTH * max(1, columns - label_span),
                          "height": 56, "itemLabel": item["label"]})
            grid.append([_plain_cell(f"txt_{row_number}_0", item["label"], span=label_span,
                                     width=WIDE_WIDTH * label_span), field])
    return grid, columns


def _label_key(item: dict[str, Any]) -> tuple[str, str]:
    return item["kind"], " ".join(str(item.get("label") or "").split()).lower()


def legacy_aliases(
    layout: list[dict[str, Any]], page_items: list[dict[str, Any]], recorded: list[dict[str, Any]],
    report_names: list[set[str]] | tuple = (),
) -> dict[str, str]:
    """Questions seen only in completed reports that are a page question under an older name.

    The legacy forms were edited over the years, and each edit gave a question
    a new name, so older reports hold "EKG Cable" under a name the page no
    longer uses. Such a question is shown in its row on the page instead of in
    a list below it, when that is unambiguous: the page has exactly one
    question of that kind with that label, and no single report recorded both.
    Returns ``{older name: page name}``.
    """
    placed = {name for section in layout for row in section["rows"] for cell in row["cells"] for name in cell["items"]}
    on_page: dict[tuple[str, str], list[str]] = {}
    for item in page_items:
        if item["kind"] != "heading" and item["name"] in placed and not _is_report_owned(item):
            on_page.setdefault(_label_key(item), []).append(item["name"])
    aliases: dict[str, str] = {}
    for item in recorded:
        if item["kind"] == "heading" or item["name"] in placed or _is_report_owned(item):
            continue
        targets = on_page.get(_label_key(item)) or []
        if len(targets) != 1 or not _label_key(item)[1]:
            continue
        if any(item["name"] in names and targets[0] in names for names in report_names):
            continue
        aliases[item["name"]] = targets[0]
    return aliases


def alias_answers(answers: dict[str, Any], cell_aliases: dict[str, str] | None) -> dict[str, Any]:
    """``answers`` plus each older-named answer under the page question's key.

    ``cell_aliases`` is a schema's ``legacy_aliases`` (``{"item_old": "item_new"}``).
    Nothing is removed, and an answer the page question already has is kept.
    """
    if not cell_aliases:
        return answers
    result = dict(answers)
    for key, value in answers.items():
        cell, separator, rest = key.partition("__")
        target = cell_aliases.get(cell)
        if target and separator and f"{target}__{rest}" not in result:
            result[f"{target}__{rest}"] = value
    return result


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
    items: list[dict[str, Any]], title: str, legacy_id: int,
    layout: list[dict[str, Any]] | None = None, aliases: dict[str, str] | None = None,
) -> dict[str, Any]:
    """Return the ``inspection_forms.schema`` JSON for parsed/merged items.

    With the legacy page's ``layout`` (:func:`parse_layout`), the form is laid
    out as the legacy page showed it; without one, the questions are packed
    two to a row. ``aliases`` (:func:`legacy_aliases`) puts questions recorded
    under an older name in their row on the page; the schema keeps them as
    ``legacy_aliases`` so their answers can be shown there (:func:`alias_answers`).
    """
    had_items = any(item["kind"] != "heading" for item in items)
    if layout:
        grid, columns = _layout_rows(layout, items, aliases)
        if grid:
            schema = {
                "version": 3,
                "source": "legacy_pm_desc",
                "legacy_pm_desc_id": legacy_id,
                "title": title,
                "custom_grid": {"title": title, "rows": len(grid), "columns": columns, "cells": grid},
            }
            if aliases:
                schema["legacy_aliases"] = {f"item_{older}": f"item_{page}" for older, page in aliases.items()}
            return schema
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
        cell = _item_cell(item)
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
            if cell_id.startswith(("txt_", "cover_")):
                continue  # the legacy page's own words and span placeholders
            if not blocks:
                return None
            block = blocks[0]
            if cell_id.startswith("section_"):
                items.append({"kind": "heading", "label": str(block.get("label") or "")})
            elif cell_id.startswith("item_") and cell_id != "item_note" \
                    and block.get("type") in ("radio", "input", "checkbox"):
                items.append({
                    "name": cell_id[len("item_"):],
                    "kind": block["type"],
                    "label": str(cell.get("itemLabel") or block.get("label") or ""),
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
        elif item["kind"] == "checkbox":
            for index in item.get("checked_options") or []:
                answers[f"item_{item['name']}__{ANSWER_BLOCK_ID}__{index}"] = True
    return answers
