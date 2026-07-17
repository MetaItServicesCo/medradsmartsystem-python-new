import json
from decimal import Decimal
from typing import Any, Optional


INVOICE_EDIT_MARKER = "__INVOICE_EDIT__:"


def strip_invoice_edit_metadata(notes: Optional[str]) -> Optional[str]:
    """Remove invoice-edit metadata from notes while preserving user-visible text."""
    if not notes or INVOICE_EDIT_MARKER not in notes:
        return notes
    visible, _, _ = notes.rpartition(INVOICE_EDIT_MARKER)
    return visible.rstrip() or None


def parse_invoice_edit_metadata(notes: Optional[str]) -> dict[str, Any]:
    """Read invoice-specific edit metadata stored at the end of notes."""
    if not notes or INVOICE_EDIT_MARKER not in notes:
        return {}
    _, _, raw = notes.rpartition(INVOICE_EDIT_MARKER)
    try:
        parsed = json.loads(raw.strip())
        return parsed if isinstance(parsed, dict) else {}
    except (TypeError, ValueError, json.JSONDecodeError):
        return {}


def compose_invoice_edit_notes(
    current_notes: Optional[str],
    user_notes: Optional[str],
    metadata: Optional[dict[str, Any]],
) -> Optional[str]:
    """Preserve internal fee prefixes, replace visible notes, and append metadata."""
    fee_prefix = ""
    existing_visible = strip_invoice_edit_metadata(current_notes) or ""

    if existing_visible.startswith("__FEES__:"):
        prefix, sep, rest = existing_visible.partition("::")
        if sep:
            fee_prefix = f"{prefix}{sep}"
            existing_visible = rest

    visible = existing_visible if user_notes is None else user_notes
    pieces = [f"{fee_prefix}{visible or ''}".rstrip()]
    if metadata:
        pieces.append(f"{INVOICE_EDIT_MARKER}{json.dumps(metadata, default=_json_default, separators=(',', ':'))}")
    return "\n".join(piece for piece in pieces if piece).strip() or None


def editable_line_items(notes: Optional[str]) -> list[dict[str, Any]]:
    metadata = parse_invoice_edit_metadata(notes)
    items = metadata.get("line_items")
    return items if isinstance(items, list) else []


def editable_labels(notes: Optional[str]) -> dict[str, str]:
    metadata = parse_invoice_edit_metadata(notes)
    labels = metadata.get("labels")
    if not isinstance(labels, dict):
        return {}
    return {
        str(key): str(value)
        for key, value in labels.items()
        if value is not None and str(value).strip()
    }


def _json_default(value: Any) -> Any:
    if isinstance(value, Decimal):
        return float(value)
    return str(value)
