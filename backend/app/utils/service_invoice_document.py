"""What a service invoice shows: the service report and the charges on one page.

Built from the service request's work order. The diagnosis and work done are
copied onto the invoice when it is generated, as the administrator left them;
an invoice from before that has no copy and reads the work order instead. A
work order is closed to changes once invoiced, so the two cannot drift apart.

Technician notes are internal and never appear here. Parts are listed for the
record and carry no amounts: they are billed only through a quotation.
"""
from __future__ import annotations

from types import SimpleNamespace
from typing import Any, Optional

from app.api.v1.endpoints.reports import _service_session_entries
from app.models.invoice import Invoice
from app.models.service_request import ServiceRequest
from app.utils.service_charges import invoice_charges

MAX_WORK_TEXT = 5000


def _text(value: Any) -> str:
    return value.strip() if isinstance(value, str) else ""


def _history(sr: ServiceRequest) -> list[dict[str, Any]]:
    """The request's history with anything malformed set aside. Old
    records came across from the previous system; one bad entry must not stop an
    invoice from being generated or opened."""
    entries = sr.history if isinstance(sr.history, list) else []
    clean = []
    for entry in entries:
        if isinstance(entry, dict):
            changes = entry.get("changes")
            clean.append({**entry, "changes": changes if isinstance(changes, dict) else {}})
    return clean


def _sessions(sr: ServiceRequest) -> list[dict[str, Any]]:
    return _service_session_entries(SimpleNamespace(history=_history(sr), assigned_technician=sr.assigned_technician))


def _dicts(value: Any) -> list[dict[str, Any]]:
    return [item for item in value if isinstance(item, dict)] if isinstance(value, list) else []


def _number(value: Any) -> Optional[float]:
    try:
        return float(value) if value is not None and not isinstance(value, bool) else None
    except (TypeError, ValueError):
        return None


def _day(*values: Any) -> Optional[str]:
    for value in values:
        if value:
            return str(value)[:10]
    return None


def service_work_entries(sr: ServiceRequest, edits: Optional[dict[str, dict[str, Any]]] = None) -> list[dict[str, Any]]:
    """One row per visit or addition, in the order they happened. `edits` holds
    the administrator's wording by row key; hours and times are never edited."""
    rows: list[dict[str, Any]] = []
    for index, session in enumerate(_sessions(sr)):
        rows.append({
            "key": session.get("session_id") or f"session-{index}",
            "date": _day(session.get("work_date"), session.get("start_time"), session.get("timestamp")),
            "diagnosis": _text(session.get("diagnosis")),
            "work_done": _text(session.get("work_done")),
            "technician": _text(session.get("user")),
            "check_in": session.get("start_time"),
            "check_out": session.get("end_time"),
            "hours": _number(session.get("duration_hours")),
        })
    for index, entry in enumerate(_history(sr)):
        if entry.get("action") != "work_order_addition":
            continue
        changes = entry["changes"]
        # An addition with only a part or a note has nothing to say here.
        if not _text(changes.get("diagnosis")) and not _text(changes.get("work_done")):
            continue
        rows.append({
            "key": changes.get("addition_id") or f"addition-{index}",
            "date": _day(entry.get("timestamp")),
            "diagnosis": _text(changes.get("diagnosis")),
            "work_done": _text(changes.get("work_done")),
            "technician": _text(entry.get("user")),
            "check_in": None,
            "check_out": None,
            "hours": None,
        })
    rows.sort(key=lambda row: row["date"] or "")
    # Requests carried over from the previous system kept one resolution text.
    if not rows and _text(sr.resolution_description):
        technician = sr.assigned_technician.full_name if sr.assigned_technician else ""
        rows.append({
            "key": "resolution",
            "date": _day(sr.completed_at, sr.updated_at),
            "diagnosis": "",
            "work_done": _text(sr.resolution_description),
            "technician": technician,
            "check_in": None,
            "check_out": None,
            "hours": None,
        })
    for row in rows:
        edit = (edits or {}).get(str(row["key"]))
        if edit:
            for field in ("diagnosis", "work_done"):
                if edit.get(field) is not None:
                    row[field] = _text(edit[field])[:MAX_WORK_TEXT]
    return rows


def _work_order_items(sr: ServiceRequest) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    """Parts and test equipment recorded across the sessions and additions."""
    sources = [*_sessions(sr)]
    sources += [entry["changes"] for entry in _history(sr) if entry.get("action") == "work_order_addition"]
    parts: list[dict[str, Any]] = []
    equipment: dict[str, dict[str, Any]] = {}
    for source in sources:
        for part in _dicts(source.get("parts")):
            parts.append({
                "part_number": part.get("part_number"),
                "description": part.get("description"),
                "quantity": part.get("quantity_used") or part.get("quantity"),
                "condition": part.get("condition"),
            })
        for item in _dicts(source.get("test_equipment")):
            key = str(item.get("id") or item.get("serial_number") or item.get("description"))
            equipment[key] = {
                "description": item.get("description"),
                "make": item.get("mrf") or item.get("make"),
                "model": item.get("model"),
                "serial_number": item.get("serial_number"),
            }
    return parts, list(equipment.values())


def _facility_address(facility: Any) -> Optional[str]:
    if not facility:
        return None
    parts = [facility.address, facility.suite, facility.city, facility.state, facility.zip_code]
    return ", ".join(str(part) for part in parts if part) or None


def _money_text(value: Any) -> str:
    return f"{float(value or 0):.2f}"


def build_service_invoice_document(
    invoice: Invoice,
    line_items: list[dict[str, Any]],
) -> dict[str, Any]:
    sr: Optional[ServiceRequest] = invoice.service_request
    facility = invoice.facility
    equipment = sr.equipment if sr else None
    entries = invoice.service_work_entries if isinstance(invoice.service_work_entries, list) else (
        service_work_entries(sr) if sr else []
    )
    parts, test_equipment = _work_order_items(sr) if sr else ([], [])
    status = invoice.status.value if hasattr(invoice.status, "value") else invoice.status
    technician = sr.assigned_technician.full_name if sr and sr.assigned_technician else None
    return {
        "invoice_number": invoice.invoice_number,
        "request_number": sr.request_number if sr else None,
        "status": status,
        "issue_date": invoice.issue_date,
        "due_date": invoice.due_date,
        "installment_plan": (facility.installment_type if facility else None) or "No",
        "po": sr.reference_number if sr else None,
        "facility": {
            "name": facility.name if facility else invoice.customer_name,
            "address": _facility_address(facility) or invoice.customer_address,
            "contact_name": (facility.contact_person if facility else None) or invoice.customer_name,
            "phone": (facility.phone if facility else None) or invoice.customer_phone,
            "email": (facility.email if facility else None) or invoice.customer_email,
        },
        "equipment": {
            "service_required": (sr.service_required or sr.problem_description) if sr else None,
            "serial_number": equipment.serial_number if equipment else None,
            "asset_tag": equipment.asset_tag if equipment else None,
            "make": equipment.make if equipment else None,
            "model": equipment.model if equipment else None,
        },
        # The customer sees one technician: the one assigned to the request. Who
        # logged each visit stays on the work order and in the invoice's saved rows.
        "work_entries": [
            {**row, "technician": technician or ""} if isinstance(row, dict) else row for row in entries
        ],
        "total_hours": float(sr.time_spent_hours or 0) if sr else 0,
        "parts": parts,
        "test_equipment": test_equipment,
        "technician": technician,
        "client": facility.name if facility else invoice.customer_name,
        "preferred_date": sr.preferred_datetime if sr else None,
        "actual_date": (sr.completed_at or sr.started_at) if sr else None,
        # Each line with how it was worked out: Labor (4.00 hrs × $175.00/hr).
        "charges": invoice_charges(line_items),
        "subtotal": _money_text(invoice.subtotal),
        "tax_amount": _money_text(invoice.tax_amount),
        "discount_amount": _money_text(invoice.discount_amount),
        "total_amount": _money_text(invoice.total_amount),
        "amount_paid": _money_text(invoice.amount_paid),
        "balance_due": _money_text(invoice.balance_due),
    }
