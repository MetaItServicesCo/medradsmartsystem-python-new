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

from html.parser import HTMLParser
from typing import Any

# Answer block id shared by every item cell.  Value key is ``<cell_id>__ans``.
ANSWER_BLOCK_ID = "ans"
GRID_COLUMNS = 2

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

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.items: list[dict[str, Any]] = []
        self._by_name: dict[str, dict[str, Any]] = {}
        self._order: list[str] = []
        self._last_label = ""
        self._text_buf: list[str] = []
        self._capture_depth = 0

    # -- text capture (td / th / heading cells) --------------------------------
    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag in ("td", "th", "h1", "h2", "h3", "h4", "h5", "h6", "strong", "label"):
            self._capture_depth += 1
            self._text_buf = []
        elif tag == "input":
            self._handle_input(dict(attrs))

    def handle_startendtag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag == "input":
            self._handle_input(dict(attrs))

    def handle_endtag(self, tag: str) -> None:
        if tag in ("td", "th", "h1", "h2", "h3", "h4", "h5", "h6", "strong", "label"):
            if self._capture_depth > 0:
                self._capture_depth -= 1
            text = " ".join("".join(self._text_buf).split()).strip()
            self._text_buf = []
            if not text:
                return
            if tag in ("h1", "h2", "h3", "h4", "h5", "h6", "strong"):
                # Section heading: only keep if it is not a stray column header.
                if text.lower() not in _HEADER_WORDS and len(text) > 1:
                    self.items.append({"kind": "heading", "label": text})
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
        if not name:
            return
        input_type = (attrs.get("type") or "text").strip().lower()
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
        elif input_type in ("text", "number", ""):
            item = self._by_name.get(name)
            if item is None:
                item = {
                    "name": name,
                    "kind": "input",
                    "label": self._last_label or f"Field {name}",
                    "raw_options": [],
                    "value": value or None,
                }
                self._by_name[name] = item
                self._order.append(name)
                self.items.append(item)
            elif value:
                item["value"] = value


def parse_form(html: str) -> list[dict[str, Any]]:
    """Parse legacy form/report HTML into ordered items + headings."""
    parser = _FormParser()
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

    drifted = [extra_by_name[name] for name in extra_order if name not in base_names]
    if drifted:
        merged_items.append({"kind": "heading", "label": "Additional recorded items"})
        merged_items.extend(drifted)
    return merged_items


def build_grid_schema_from_items(
    items: list[dict[str, Any]], title: str, legacy_id: int
) -> dict[str, Any]:
    """Return the ``inspection_forms.schema`` JSON for parsed/merged items."""
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
        current.append(cell)
        if len(current) == GRID_COLUMNS:
            flush()
    flush()

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
        if item["kind"] == "radio" and item.get("checked"):
            answers[f"item_{item['name']}__{ANSWER_BLOCK_ID}"] = _option_label(item["checked"])
        elif item["kind"] == "input" and item.get("value"):
            answers[f"item_{item['name']}__{ANSWER_BLOCK_ID}"] = item["value"]
    return answers
