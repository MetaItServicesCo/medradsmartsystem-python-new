from datetime import date, datetime, time, timedelta
from decimal import Decimal
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy import and_, case, func, or_
from sqlalchemy.orm import Session, joinedload, selectinload

from app.core.deps import get_admin_user, get_current_user
from app.utils.permission_deps import require_module_access
from app.db.base import get_db
from app.models.facility import Facility
from app.models.facility_tier import FacilityTier
from app.models.equipment import Equipment, EquipmentStatus
from app.models.inspection import Inspection, InspectionBatch, InspectionResult, InspectionStatus
from app.models.inspection_form import InspectionForm
from app.models.inventory import InventoryPart
from app.models.invoice import Invoice, InvoiceStatus, InvoiceTransaction, InvoiceType
from app.models.modality import Modality
from app.models.tier import Tier
from app.models.user import User, UserRole
from app.utils.inspection_schedule import inspection_frequency_from_schedule, next_inspection_date
from app.utils.invoice_editing import compose_invoice_edit_notes, editable_labels, editable_line_items, editable_summary_rows, parse_invoice_edit_metadata, strip_invoice_edit_metadata
from app.utils.invoice_ledger import add_invoice_transaction, record_invoice_created, record_payment_delta, record_status_change, transaction_response
from app.utils.invoice_approval import (
    BILLING_APPROVAL_APPROVED,
    approval_response,
    ensure_financial_edit_allowed,
    has_financial_edits,
    invalidate_invoice_approval,
    is_facility_billing_user,
    is_invoice_approver,
    require_invoice_approved,
    require_invoice_payer,
    scope_invoice_approval_visibility,
    validate_requested_payment_status,
)
from app.utils.logging import log_activity
from app.utils.notifications import notify_admins, notify_facility_users
from app.utils.facility_access import require_facility_access, scope_query_to_user_facilities
from app.utils.permissions import has_module_permission, require_module_permission
from app.utils.list_search import (
    contains_ci,
    normalize_list_search,
    parsed_date_bounds,
    parsed_date_value,
    predicates_for_field,
    value_contains_ci,
)

router = APIRouter(dependencies=[Depends(require_module_access("inspections"))])


ADVANCED_REPORT_SCHEMA = {
    "title": "Advanced Facility Inventory Inspection Report",
    "sections": [
        {
            "key": "identity",
            "label": "Inventory Identity",
            "fields": ["asset_number", "description", "make", "model", "serial_number", "location", "risk_ranking", "pm_schedule"],
        },
        {
            "key": "checks",
            "label": "Inspection Checks",
            "fields": [
                {"key": "physical_inspection", "label": "Physical Inspection", "type": "radio", "options": ["pass", "fail", "na"]},
                {"key": "cleaning", "label": "Cleaning", "type": "radio", "options": ["pass", "fail", "na"]},
                {"key": "display", "label": "Display", "type": "radio", "options": ["pass", "fail", "na"]},
                {"key": "lubrication", "label": "Lubrication", "type": "radio", "options": ["pass", "fail", "na"]},
                {"key": "functional", "label": "Functional", "type": "radio", "options": ["pass", "fail", "na"]},
                {"key": "calibration", "label": "Calibration", "type": "radio", "options": ["pass", "fail", "na"]},
                {"key": "electrical_safety", "label": "Electrical Safety", "type": "radio", "options": ["pass", "fail", "na"]},
                {"key": "battery", "label": "Battery", "type": "radio", "options": ["pass", "fail", "na"]},
                {"key": "pm_kit", "label": "PM Kit", "type": "radio", "options": ["pass", "fail", "na"]},
            ],
        },
        {
            "key": "diagnostics",
            "label": "Diagnostics",
            "fields": ["reported_problem", "problem_found", "corrective_action_taken", "summary"],
        },
        {
            "key": "measurements",
            "label": "Measurements",
            "fields": ["name", "set_value", "read_value", "unit", "status", "notes"],
        },
        {
            "key": "photo_documentation",
            "label": "Photo Documentation",
            "fields": ["label", "url", "notes"],
        },
        {
            "key": "compliance",
            "label": "Compliance Certification",
            "fields": ["certified", "standard", "certificate_notes", "recommendations"],
        },
        {
            "key": "parts",
            "label": "Parts Used",
            "fields": ["description", "part_number", "price", "condition"],
        },
        {
            "key": "test_equipment",
            "label": "Test Equipment",
            "fields": ["description", "make", "serial_number"],
        },
        {
            "key": "billing",
            "label": "Invoicing",
            "fields": ["parts", "inspection_charges", "others"],
        },
        {
            "key": "dates",
            "label": "Inspector & Due Dates",
            "fields": ["inspected_by", "inspection_date", "inspection_due_date", "next_inspection_due_date"],
        },
    ],
}


class InstantInspectionCreate(BaseModel):
    facility_id: int
    equipment_ids: Optional[list[int]] = None
    frequency: str = "instant"
    scheduled_date: Optional[datetime] = None
    notes: Optional[str] = None


class InspectionScheduleCreate(BaseModel):
    facility_id: int
    equipment_ids: Optional[list[int]] = None
    frequency: str = "annual"
    scheduled_date: datetime
    compliance_requirement: Optional[str] = None
    criticality: Optional[str] = None
    notes: Optional[str] = None


class UpcomingGenerationRequest(BaseModel):
    facility_id: Optional[int] = None
    days_ahead: int = 90


class InspectionComplete(BaseModel):
    result: InspectionResult = InspectionResult.PASS
    form_data: dict[str, Any]
    form_template_id: Optional[int] = None
    corrective_actions: Optional[str] = None
    labor_hours: Decimal = Decimal("0")
    parts_amount: Optional[Decimal] = None
    inspection_charge: Optional[Decimal] = None
    other_charges: Optional[Decimal] = None
    tax_amount: Decimal = Decimal("0")
    discount_amount: Decimal = Decimal("0")
    notes: Optional[str] = None


class InspectionReportUpdate(InspectionComplete):
    status: InspectionStatus = InspectionStatus.COMPLETED


class InspectionTechnicianUpdate(BaseModel):
    inspector_id: Optional[int] = None


class InspectionDetailsUpdate(BaseModel):
    scheduled_date: Optional[datetime] = None
    inspection_frequency: Optional[str] = None
    compliance_requirement: Optional[str] = None
    criticality: Optional[str] = None
    inspector_id: Optional[int] = None
    form_template_id: Optional[int] = None


class InspectionReopen(BaseModel):
    scheduled_date: Optional[datetime] = None


class BatchAssetCreate(BaseModel):
    asset_tag: str
    make: str
    model: str
    serial_number: str
    modality_id: int
    tier_id: Optional[int] = None
    inspection_form_id: Optional[int] = None
    description: Optional[str] = None
    risk_priority: Optional[str] = None
    risk_name: Optional[str] = None
    location: Optional[str] = None
    pm_scheduling: Optional[str] = None
    last_pm_date: Optional[date] = None
    installation_date: Optional[date] = None
    inventory_date: Optional[date] = None


class BatchExistingAssetsCreate(BaseModel):
    equipment_ids: list[int]


class InspectionInvoiceUpdate(BaseModel):
    customer_name: Optional[str] = None
    customer_email: Optional[str] = None
    customer_phone: Optional[str] = None
    customer_address: Optional[str] = None
    subtotal: Optional[Decimal] = None
    tax_amount: Optional[Decimal] = None
    discount_amount: Optional[Decimal] = None
    total_amount: Optional[Decimal] = None
    amount_paid: Optional[Decimal] = None
    issue_date: Optional[date] = None
    due_date: Optional[date] = None
    payment_terms: Optional[str] = None
    payment_method: Optional[str] = None
    notes: Optional[str] = None
    status: Optional[InvoiceStatus] = None
    travel_charges: Optional[Decimal] = None
    service_charges: Optional[Decimal] = None
    line_items: Optional[list[dict[str, Any]]] = None
    labels: Optional[dict[str, Any]] = None
    summary_rows: Optional[list[dict[str, Any]]] = None


class InspectionFormUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    modality_id: Optional[int] = None
    schema: Optional[dict[str, Any]] = None


class InspectionFormCreate(BaseModel):
    name: str
    description: Optional[str] = None
    modality_id: Optional[int] = None
    schema: dict[str, Any]


def _value(value: Any) -> Any:
    if hasattr(value, "value"):
        return value.value
    return value


def _money(value: Any) -> Decimal:
    if value in (None, ""):
        return Decimal("0")
    return Decimal(str(value))


def _parse_inspection_fees(notes: Optional[str]) -> tuple[Optional[Decimal], Optional[Decimal]]:
    """Parse __FEES__:travel=X,service=Y:: prefix from inspection invoice notes."""
    if not notes or not notes.startswith("__FEES__:"):
        return None, None
    fee_part, _, _ = notes[len("__FEES__:"):].partition("::")
    travel: Optional[Decimal] = None
    service: Optional[Decimal] = None
    for kv in fee_part.split(","):
        k, _, v = kv.partition("=")
        try:
            if k.strip() == "travel":
                travel = _money(v.strip())
            elif k.strip() == "service":
                service = _money(v.strip())
        except Exception:
            pass
    return travel, service


def _strip_inspection_fee_prefix(notes: Optional[str]) -> Optional[str]:
    notes = strip_invoice_edit_metadata(notes)
    if not notes or not notes.startswith("__FEES__:"):
        return notes
    _, _, rest = notes.partition("::")
    return rest or None


def _part_name(part: Optional[InventoryPart]) -> str:
    if not part:
        return "Inventory item"
    bits = [part.part_number, part.make, part.model]
    return " ".join(str(bit) for bit in bits if bit) or part.description or f"Inventory #{part.id}"


def _equipment_name(equipment: Optional[Equipment]) -> str:
    if not equipment:
        return "Equipment"
    bits = [equipment.asset_tag, equipment.make, equipment.model]
    return " ".join(str(bit) for bit in bits if bit) or f"Equipment #{equipment.id}"


def _frequency_days(frequency: str) -> int:
    return {
        "instant": 0,
        "quarterly": 90,
        "semi_annual": 182,
        "annual": 365,
    }.get((frequency or "annual").lower(), 365)


def _equipment_criticality(equipment: Equipment) -> str:
    modality_name = (equipment.modality.name if equipment.modality else "").lower()
    asset_text = f"{equipment.asset_tag} {equipment.make} {equipment.model}".lower()
    critical_words = ["ct", "mri", "x-ray", "xray", "defib", "ventilator", "anesthesia", "monitor", "infusion"]
    if any(word in modality_name or word in asset_text for word in critical_words):
        return "high"
    if equipment.warranty_expiration and equipment.warranty_expiration <= date.today() + timedelta(days=90):
        return "medium"
    return "standard"


def _frequency_for_criticality(criticality: str) -> str:
    if criticality == "high":
        return "quarterly"
    if criticality == "medium":
        return "semi_annual"
    return "annual"


def _compliance_requirement(equipment: Equipment, criticality: str) -> str:
    modality_name = equipment.modality.name if equipment.modality else "General biomedical equipment"
    if criticality == "high":
        return f"High criticality {modality_name} compliance inspection"
    return f"Preventive maintenance and safety inspection for {modality_name}"


def _customer_address(facility: Facility) -> str:
    billing_parts = [
        facility.billing_street,
        facility.billing_suite,
        facility.billing_city,
        facility.billing_state,
        facility.billing_zip_code,
    ]
    general_parts = [facility.address, facility.suite, facility.city, facility.state, facility.zip_code]
    return ", ".join(part for part in billing_parts if part) or ", ".join(part for part in general_parts if part)


def _get_default_form(db: Session) -> InspectionForm:
    form = db.query(InspectionForm).filter(InspectionForm.name == ADVANCED_REPORT_SCHEMA["title"]).first()
    if form:
        check_section = next((section for section in (form.schema or {}).get("sections", []) if section.get("key") == "checks"), None)
        if check_section and any(isinstance(field, str) for field in check_section.get("fields", [])):
            form.schema = ADVANCED_REPORT_SCHEMA
            db.flush()
        return form
    form = InspectionForm(
        name=ADVANCED_REPORT_SCHEMA["title"],
        description="Facility inventory inspection report based on identity, checks, diagnostics, parts, test equipment, billing, and due dates.",
        schema=ADVANCED_REPORT_SCHEMA,
    )
    db.add(form)
    db.flush()
    return form


def _form_response(form: InspectionForm) -> dict[str, Any]:
    return {
        "id": form.id,
        "name": form.name,
        "description": form.description,
        "modality_id": form.modality_id,
        "modality_name": form.modality.name if form.modality else None,
        "schema": form.schema,
        "created_at": form.created_at,
        "updated_at": form.updated_at,
    }


def _get_billable_tier(
    facility: Facility,
    part: Optional[InventoryPart],
    equipment: Optional[Equipment] = None,
) -> Optional[Tier]:
    if part and part.tier:
        return part.tier
    if equipment and equipment.tier:
        return equipment.tier
    if not part:
        return facility.tier
    if facility.tier:
        return facility.tier
    for facility_tier in facility.facility_tiers or []:
        if facility_tier.tier:
            return facility_tier.tier
    return None


def _next_inspection_number(db: Session) -> str:
    last = db.query(Inspection).order_by(Inspection.id.desc()).first()
    next_num = (last.id + 1) if last else 1
    return f"INSP-{next_num:06d}"


def _next_batch_number(db: Session) -> str:
    last_inspection = db.query(Inspection).order_by(Inspection.id.desc()).first()
    last_batch = db.query(InspectionBatch).order_by(InspectionBatch.id.desc()).first()
    next_num = max(last_inspection.id if last_inspection else 0, last_batch.id if last_batch else 0) + 1
    while True:
        batch_number = f"INSP-{next_num:06d}"
        if (
            not db.query(InspectionBatch.id).filter(InspectionBatch.batch_number == batch_number).first()
            and not db.query(Inspection.id).filter(Inspection.inspection_number == batch_number).first()
        ):
            return batch_number
        next_num += 1


def _batch_asset_number(batch_number: str, position: int) -> str:
    return f"{batch_number}-{position:03d}"


def _next_batch_asset_number(db: Session, batch: InspectionBatch) -> str:
    position = len(batch.inspections or []) + 1
    while True:
        inspection_number = _batch_asset_number(batch.batch_number, position)
        if not db.query(Inspection.id).filter(Inspection.inspection_number == inspection_number).first():
            return inspection_number
        position += 1


def _next_invoice_number(db: Session) -> str:
    last = db.query(Invoice).order_by(Invoice.id.desc()).first()
    next_num = (last.id + 1) if last else 1
    return f"INV-INSP-{next_num:06d}"


def _invoice_response(invoice: Optional[Invoice]) -> Optional[dict[str, Any]]:
    if not invoice:
        return None
    data = {c.name: getattr(invoice, c.name) for c in invoice.__table__.columns}
    data["invoice_type"] = _value(data.get("invoice_type"))
    data["status"] = _value(data.get("status"))
    data["facility_name"] = invoice.facility.name if invoice.facility else None
    data["inspection_batch_number"] = invoice.inspection_batch.batch_number if getattr(invoice, "inspection_batch", None) else None
    batch = getattr(invoice, "inspection_batch", None)
    batch_count = getattr(invoice, "_batch_asset_count", None)
    data["batch_asset_count"] = (
        batch_count
        if batch_count is not None
        else len(batch.inspections or [])
        if batch
        else None
    )
    data["batch_items"] = getattr(invoice, "_batch_items", _stored_batch_invoice_items(invoice.notes))
    data["line_items"] = editable_line_items(invoice.notes)
    data["labels"] = editable_labels(invoice.notes)
    data["summary_rows"] = editable_summary_rows(invoice.notes)
    data["transactions"] = [transaction_response(item) for item in invoice.transactions or []]
    travel, service = _parse_inspection_fees(invoice.notes)
    data["travel_charges"] = travel
    data["service_charges"] = service
    data["notes"] = _strip_inspection_fee_prefix(invoice.notes)
    data.update(approval_response(invoice))
    return data


def _stored_batch_invoice_items(notes: Optional[str]) -> list[dict[str, Any]]:
    items = parse_invoice_edit_metadata(notes).get("batch_items")
    return items if isinstance(items, list) else []


def _batch_invoice_items_for_listing(invoice: Invoice) -> list[dict[str, Any]]:
    """Return a stable snapshot and safely support invoices created before snapshots."""
    stored_items = _stored_batch_invoice_items(invoice.notes)
    if stored_items or not invoice.inspection_batch:
        return stored_items
    try:
        return _batch_invoice_line_items(invoice.inspection_batch, strict=False)
    except (HTTPException, ArithmeticError, TypeError, ValueError):
        # A malformed legacy report must not make the entire Billing list unavailable.
        return []


def _batch_invoice_notes(
    current_notes: Optional[str],
    visible_notes: str,
    line_items: list[dict[str, Any]],
) -> Optional[str]:
    """Persist the generated batch breakdown so list requests stay lightweight."""
    return compose_invoice_edit_notes(
        current_notes,
        visible_notes,
        {"batch_items": line_items},
    )


def _inspection_invoice_line_item(inspection: Inspection, invoice: Optional[Invoice]) -> dict[str, Any]:
    return {
        "inspection_id": inspection.id,
        "inspection_number": inspection.inspection_number,
        "asset_name": _part_name(inspection.inventory_part) if inspection.inventory_part else _equipment_name(inspection.equipment),
        "asset_tag": inspection.equipment.asset_tag if inspection.equipment else inspection.inventory_part.part_number if inspection.inventory_part else None,
        "serial_number": inspection.equipment.serial_number if inspection.equipment else inspection.inventory_part.serial_number if inspection.inventory_part else None,
        "subtotal": float(invoice.subtotal or 0) if invoice else 0,
        "tax_amount": float(invoice.tax_amount or 0) if invoice else 0,
        "discount_amount": float(invoice.discount_amount or 0) if invoice else 0,
        "total_amount": float(invoice.total_amount or 0) if invoice else 0,
    }


def _inspection_response(inspection: Inspection) -> dict[str, Any]:
    invoice = getattr(inspection, "_inspection_invoice", None)
    if invoice is None and not hasattr(inspection, "_inspection_invoice"):
        invoice = next((item for item in getattr(inspection, "invoices", []) or []), None)
    data = {c.name: getattr(inspection, c.name) for c in inspection.__table__.columns}
    data["status"] = _value(data.get("status"))
    data["result"] = _value(data.get("result"))
    data["facility_name"] = inspection.facility.name if inspection.facility else None
    data["batch_id"] = inspection.batch_id
    data["batch_number"] = inspection.batch.batch_number if inspection.batch else None
    data["inventory_part_name"] = _part_name(inspection.inventory_part) if inspection.inventory_part else None
    data["equipment_name"] = _equipment_name(inspection.equipment) if inspection.equipment else None
    data["asset_name"] = data["inventory_part_name"] or data["equipment_name"] or "Inspection asset"
    data["part_number"] = inspection.inventory_part.part_number if inspection.inventory_part else None
    data["asset_tag"] = inspection.equipment.asset_tag if inspection.equipment else None
    data["serial_number"] = (
        inspection.inventory_part.serial_number
        if inspection.inventory_part
        else inspection.equipment.serial_number
        if inspection.equipment
        else None
    )
    data["make"] = (
        inspection.inventory_part.make
        if inspection.inventory_part
        else inspection.equipment.make
        if inspection.equipment
        else None
    )
    data["model"] = (
        inspection.inventory_part.model
        if inspection.inventory_part
        else inspection.equipment.model
        if inspection.equipment
        else None
    )
    data["tier_name"] = (
        inspection.inventory_part.tier.name
        if inspection.inventory_part and inspection.inventory_part.tier
        else inspection.equipment.tier.name
        if inspection.equipment and inspection.equipment.tier
        else inspection.facility.tier.name
        if inspection.facility and inspection.facility.tier
        else None
    )
    data["inspector_name"] = inspection.inspector.full_name if inspection.inspector else None
    data["form_template_name"] = inspection.form_template.name if inspection.form_template else None
    data["form_template_schema"] = inspection.form_template.schema if inspection.form_template else None
    attached_form = (
        inspection.inventory_part.inspection_form
        if inspection.inventory_part and inspection.inventory_part.inspection_form
        else inspection.equipment.inspection_form
        if inspection.equipment and inspection.equipment.inspection_form
        else None
    )
    data["attached_form_id"] = attached_form.id if attached_form else None
    data["attached_form_name"] = attached_form.name if attached_form else None
    data["attached_form_schema"] = attached_form.schema if attached_form else None
    data["invoice"] = _invoice_response(invoice)
    return data


def _batch_response(
    batch: InspectionBatch,
    include_assets: bool = False,
    counts: Optional[dict[str, int]] = None,
) -> dict[str, Any]:
    inspections = (
        sorted(list(batch.inspections or []), key=lambda item: item.inspection_number or "")
        if include_assets or counts is None
        else []
    )
    completed_count = counts["completed"] if counts is not None else sum(
        1 for item in inspections if item.status == InspectionStatus.COMPLETED
    )
    in_progress_count = counts["in_progress"] if counts is not None else sum(
        1 for item in inspections if item.status == InspectionStatus.IN_PROGRESS
    )
    closed_count = counts.get("closed", 0) if counts is not None else sum(
        1 for item in inspections if item.status == InspectionStatus.CLOSED
    )
    asset_count = counts["total"] if counts is not None else len(inspections)
    data = {c.name: getattr(batch, c.name) for c in batch.__table__.columns}
    data["status"] = _value(data.get("status"))
    data["facility_name"] = batch.facility.name if batch.facility else None
    data["inspector_name"] = batch.inspector.full_name if batch.inspector else None
    data["asset_count"] = asset_count
    data["completed_count"] = completed_count
    data["in_progress_count"] = in_progress_count
    data["closed_count"] = closed_count
    data["pending_count"] = max(asset_count - completed_count - closed_count, 0)
    data["batch_invoice"] = _invoice_response(getattr(batch, "_batch_invoice", None))
    if include_assets:
        data["assets"] = [_inspection_response(item) for item in inspections]
    return data


def _batch_counts(db: Session, batch_ids: list[int]) -> dict[int, dict[str, int]]:
    if not batch_ids:
        return {}
    rows = (
        db.query(
            Inspection.batch_id,
            func.count(Inspection.id),
            func.sum(case((Inspection.status == InspectionStatus.COMPLETED, 1), else_=0)),
            func.sum(case((Inspection.status == InspectionStatus.IN_PROGRESS, 1), else_=0)),
            func.sum(case((Inspection.status == InspectionStatus.CLOSED, 1), else_=0)),
        )
        .filter(Inspection.batch_id.in_(batch_ids))
        .group_by(Inspection.batch_id)
        .all()
    )
    return {
        int(batch_id): {
            "total": int(total or 0),
            "completed": int(completed or 0),
            "in_progress": int(in_progress or 0),
            "closed": int(closed or 0),
        }
        for batch_id, total, completed, in_progress, closed in rows
        if batch_id is not None
    }


def _sync_batch_status(batch: Optional[InspectionBatch]) -> None:
    if not batch:
        return
    inspections = list(batch.inspections or [])
    if not inspections:
        return
    if all(item.status == InspectionStatus.COMPLETED for item in inspections):
        batch.status = InspectionStatus.COMPLETED
        batch.completed_at = datetime.utcnow()
    elif any(item.status == InspectionStatus.IN_PROGRESS for item in inspections):
        batch.status = InspectionStatus.IN_PROGRESS
        batch.completed_at = None
        if not batch.started_at:
            batch.started_at = datetime.utcnow()
    elif all(item.status in {InspectionStatus.COMPLETED, InspectionStatus.CLOSED} for item in inspections):
        # A batch containing a closed asset is intentionally not considered a
        # fully completed/billable inspection batch.
        batch.status = InspectionStatus.CLOSED
        batch.completed_at = None
    else:
        batch.status = InspectionStatus.UPCOMING
        batch.completed_at = None
    batch.updated_at = datetime.utcnow()


def _require_batch_invoice_mutable(
    invoice: Optional[Invoice],
    *,
    action: str,
) -> None:
    """Protect an approved or paid batch invoice from scope/financial changes."""
    if not invoice:
        return
    if invoice.billing_approval_status == BILLING_APPROVAL_APPROVED:
        raise HTTPException(
            status_code=409,
            detail=f"{action} after the batch invoice is approved for billing",
        )
    if _money(invoice.amount_paid) > 0 or invoice.status == InvoiceStatus.PAID:
        raise HTTPException(
            status_code=409,
            detail=f"{action} after a payment has been recorded for the batch invoice",
        )


def _require_batch_invoice_allows_asset_changes(invoice: Optional[Invoice]) -> None:
    _require_batch_invoice_mutable(invoice, action="Assets cannot be added")


def _lock_active_batch_invoice(
    db: Session,
    batch_id: int,
) -> Optional[Invoice]:
    return (
        db.query(Invoice)
        .filter(
            Invoice.invoice_type == InvoiceType.INSPECTION,
            Invoice.inspection_batch_id == batch_id,
            Invoice.status != InvoiceStatus.CANCELLED,
        )
        .with_for_update(of=Invoice)
        .first()
    )


def _require_upcoming_inspection(inspection: Inspection, action: str) -> None:
    if inspection.status != InspectionStatus.UPCOMING:
        raise HTTPException(
            status_code=409,
            detail=f"Only upcoming inspections can be {action}",
        )


def _inspection_invoice_amounts(
    inspection: Inspection,
    complete_in: InspectionComplete,
) -> tuple[Decimal, Decimal, Decimal, Decimal, str]:
    facility = inspection.facility
    part = inspection.inventory_part
    equipment = inspection.equipment
    tier = _get_billable_tier(facility, part, equipment)
    billing = complete_in.form_data.get("billing") or {}

    tier_inspection_fee = _money(tier.preventive_maintenance_fee if tier else 0)
    labor_rate = _money(tier.labor_rate_per_hour if tier else 0)
    parts_amount = complete_in.parts_amount if complete_in.parts_amount is not None else _money(billing.get("parts"))
    raw_inspection_charge = (
        complete_in.inspection_charge
        if complete_in.inspection_charge is not None
        else _money(billing.get("inspection_charges"))
    )
    inspection_charge = _money(raw_inspection_charge)
    if inspection_charge <= 0:
        inspection_charge = tier_inspection_fee
    other_charges = complete_in.other_charges if complete_in.other_charges is not None else _money(billing.get("others"))
    labor_amount = _money(complete_in.labor_hours) * labor_rate
    subtotal = parts_amount + inspection_charge + other_charges + labor_amount
    total = subtotal + _money(complete_in.tax_amount) - _money(complete_in.discount_amount)
    invoice_notes = (
        complete_in.notes
        or f"Inspection invoice for {_part_name(part) if part else _equipment_name(equipment)}. Tier: {tier.name if tier else 'No tier assigned'}."
    )
    return subtotal, _money(complete_in.tax_amount), _money(complete_in.discount_amount), total, invoice_notes


def _create_inspection_invoice(
    db: Session,
    inspection: Inspection,
    complete_in: InspectionComplete,
    current_user: Optional[User] = None,
) -> Invoice:
    facility = inspection.facility
    subtotal, tax_amount, discount_amount, total, invoice_notes = _inspection_invoice_amounts(inspection, complete_in)

    existing = db.query(Invoice).filter(Invoice.inspection_id == inspection.id).first()
    if existing:
        financial_update = {
            "subtotal": subtotal,
            "tax_amount": tax_amount,
            "discount_amount": discount_amount,
            "total_amount": total,
        }
        ensure_financial_edit_allowed(existing, financial_update)
        existing.customer_name = facility.billing_name or facility.name
        existing.customer_email = facility.billing_email or facility.email
        existing.customer_phone = facility.phone
        existing.customer_address = _customer_address(facility)
        existing.subtotal = subtotal
        existing.tax_amount = tax_amount
        existing.discount_amount = discount_amount
        existing.total_amount = total
        existing.balance_due = total - _money(existing.amount_paid)
        if existing.status == InvoiceStatus.CANCELLED:
            existing.status = InvoiceStatus.PENDING
        existing.notes = invoice_notes
        existing.updated_at = datetime.utcnow()
        if current_user:
            invalidate_invoice_approval(
                db,
                existing,
                current_user,
                reason="Inspection invoice was regenerated with updated financial details",
            )
        db.flush()
        inspection.quotation_notes = existing.notes
        return existing

    invoice = Invoice(
        invoice_number=_next_invoice_number(db),
        invoice_type=InvoiceType.INSPECTION,
        customer_name=facility.billing_name or facility.name,
        customer_email=facility.billing_email or facility.email,
        customer_phone=facility.phone,
        customer_address=_customer_address(facility),
        facility_id=facility.id,
        inspection_id=inspection.id,
        subtotal=subtotal,
        tax_amount=tax_amount,
        discount_amount=discount_amount,
        total_amount=total,
        amount_paid=Decimal("0"),
        balance_due=total,
        status=InvoiceStatus.PENDING,
        issue_date=date.today(),
        due_date=date.today() + timedelta(days=30),
        payment_terms="Net 30",
        notes=invoice_notes,
    )
    db.add(invoice)
    db.flush()
    record_invoice_created(db, invoice, current_user, f"Inspection invoice created from {inspection.inspection_number}")
    inspection.quotation_notes = invoice.notes
    return invoice


def _invoice_payload_from_completed_inspection(inspection: Inspection) -> InspectionComplete:
    if inspection.status != InspectionStatus.COMPLETED:
        raise HTTPException(status_code=400, detail="Inspection must be completed before generating an invoice")
    if not inspection.form_data:
        raise HTTPException(status_code=400, detail="Inspection report data is required before generating an invoice")
    billing = inspection.form_data.get("billing") or {}
    return InspectionComplete(
        result=inspection.result if inspection.result != InspectionResult.PENDING else InspectionResult.PASS,
        form_data=inspection.form_data,
        form_template_id=inspection.form_template_id,
        corrective_actions=inspection.corrective_actions,
        parts_amount=_money(billing.get("parts")),
        inspection_charge=_money(billing.get("inspection_charges")),
        other_charges=_money(billing.get("others")),
        notes=f"Inspection invoice for {inspection.inspection_number}.",
    )


def _create_inspection_batch_invoice(
    db: Session,
    batch: InspectionBatch,
    current_user: Optional[User] = None,
) -> Invoice:
    inspections = list(batch.inspections or [])
    if not inspections:
        raise HTTPException(status_code=400, detail="Batch has no inspections to invoice")
    if any(item.status != InspectionStatus.COMPLETED for item in inspections):
        raise HTTPException(status_code=400, detail="All inspections in the batch must be completed before generating a batch invoice")
    if any(not item.form_data for item in inspections):
        raise HTTPException(status_code=400, detail="Every inspection in the batch must have report data before generating a batch invoice")

    existing_batch_invoice = _lock_active_batch_invoice(db, batch.id)
    line_items = _batch_invoice_line_items(batch)
    subtotal = sum(_money(item["subtotal"]) for item in line_items)
    tax = sum(_money(item["tax_amount"]) for item in line_items)
    discount = sum(_money(item["discount_amount"]) for item in line_items)
    total = subtotal + tax - discount
    facility = batch.facility
    visible_notes = (
        f"Inspection batch invoice for {batch.batch_number}. "
        f"Includes {len(inspections)} completed asset inspection(s)."
    )

    if existing_batch_invoice:
        if existing_batch_invoice.billing_approval_status == BILLING_APPROVAL_APPROVED:
            existing_batch_invoice._batch_items = line_items
            return existing_batch_invoice
        _require_batch_invoice_allows_asset_changes(existing_batch_invoice)
        previous_total = _money(existing_batch_invoice.total_amount)
        previous_notes = strip_invoice_edit_metadata(existing_batch_invoice.notes) or ""
        needs_refresh = previous_total != total or previous_notes != visible_notes

        existing_batch_invoice.customer_name = facility.billing_name or facility.name
        existing_batch_invoice.customer_email = facility.billing_email or facility.email
        existing_batch_invoice.customer_phone = facility.phone
        existing_batch_invoice.customer_address = _customer_address(facility)
        existing_batch_invoice.subtotal = subtotal
        existing_batch_invoice.tax_amount = tax
        existing_batch_invoice.discount_amount = discount
        existing_batch_invoice.total_amount = total
        existing_batch_invoice.balance_due = total - _money(existing_batch_invoice.amount_paid)
        existing_batch_invoice.status = (
            InvoiceStatus.PAID
            if existing_batch_invoice.balance_due <= 0
            else InvoiceStatus.PARTIALLY_PAID
            if _money(existing_batch_invoice.amount_paid) > 0
            else InvoiceStatus.PENDING
        )
        existing_batch_invoice.notes = _batch_invoice_notes(
            existing_batch_invoice.notes,
            visible_notes,
            line_items,
        )
        existing_batch_invoice.updated_at = datetime.utcnow()
        existing_batch_invoice._batch_items = line_items
        if needs_refresh:
            add_invoice_transaction(
                db,
                existing_batch_invoice,
                "invoice_recalculated",
                total,
                description=(
                    f"Batch invoice recalculated after inspection scope changed "
                    f"from {previous_total:.2f} to {total:.2f}"
                ),
                user=current_user,
                reference_prefix="CALC",
            )
        db.flush()
        return existing_batch_invoice

    existing_individual = (
        db.query(Invoice)
        .filter(
            Invoice.invoice_type == InvoiceType.INSPECTION,
            Invoice.inspection_id.in_([item.id for item in inspections]),
            Invoice.status != InvoiceStatus.CANCELLED,
        )
        .all()
    )
    if existing_individual:
        raise HTTPException(
            status_code=400,
            detail="One or more assets in this batch already have an individual invoice. Cancel those in Billing before generating a batch invoice.",
        )

    invoice = Invoice(
        invoice_number=_next_invoice_number(db),
        invoice_type=InvoiceType.INSPECTION,
        customer_name=facility.billing_name or facility.name,
        customer_email=facility.billing_email or facility.email,
        customer_phone=facility.phone,
        customer_address=_customer_address(facility),
        facility_id=facility.id,
        inspection_batch_id=batch.id,
        subtotal=subtotal,
        tax_amount=tax,
        discount_amount=discount,
        total_amount=total,
        amount_paid=Decimal("0"),
        balance_due=total,
        status=InvoiceStatus.PENDING,
        issue_date=date.today(),
        due_date=date.today() + timedelta(days=30),
        payment_terms="Net 30",
        notes=_batch_invoice_notes(None, visible_notes, line_items),
    )
    db.add(invoice)
    db.flush()
    invoice._batch_items = line_items
    record_invoice_created(db, invoice, current_user, f"Inspection batch invoice created from {batch.batch_number}")
    return invoice


def _refresh_existing_batch_invoice_if_complete(
    db: Session,
    batch: Optional[InspectionBatch],
    current_user: User,
) -> Optional[Invoice]:
    """Recalculate an existing unapproved batch invoice without replacing it."""
    if not batch or batch.status != InspectionStatus.COMPLETED:
        return None
    existing = _lock_active_batch_invoice(db, batch.id)
    if not existing:
        return None
    if existing.billing_approval_status == BILLING_APPROVAL_APPROVED:
        raise HTTPException(
            status_code=409,
            detail="An approved batch invoice cannot be recalculated",
        )
    _require_batch_invoice_mutable(
        existing,
        action="The batch invoice cannot be recalculated",
    )
    return _create_inspection_batch_invoice(db, batch, current_user)


def _batch_invoice_line_items(
    batch: InspectionBatch,
    *,
    strict: bool = True,
) -> list[dict[str, Any]]:
    """Build billable rows without letting an incomplete reopened batch break lists."""
    line_items: list[dict[str, Any]] = []
    inspections = list(batch.inspections or [])
    for inspection in inspections:
        if inspection.status != InspectionStatus.COMPLETED or not inspection.form_data:
            if strict:
                raise HTTPException(
                    status_code=400,
                    detail="Every inspection in the batch must be completed with report data before invoicing",
                )
            continue
        payload = _invoice_payload_from_completed_inspection(inspection)
        line_subtotal, line_tax, line_discount, line_total, _notes = _inspection_invoice_amounts(inspection, payload)
        line_items.append({
            "inspection_id": inspection.id,
            "inspection_number": inspection.inspection_number,
            "asset_name": _part_name(inspection.inventory_part) if inspection.inventory_part else _equipment_name(inspection.equipment),
            "asset_tag": inspection.equipment.asset_tag if inspection.equipment else inspection.inventory_part.part_number if inspection.inventory_part else None,
            "serial_number": inspection.equipment.serial_number if inspection.equipment else inspection.inventory_part.serial_number if inspection.inventory_part else None,
            "subtotal": float(line_subtotal),
            "tax_amount": float(line_tax),
            "discount_amount": float(line_discount),
            "total_amount": float(line_total),
        })
    return line_items


@router.get("/report-template")
def get_report_template(current_user: User = Depends(get_current_user)) -> Any:
    return ADVANCED_REPORT_SCHEMA


@router.get("/forms")
def list_inspection_forms(
    modality_id: Optional[int] = Query(None),
    search: Optional[str] = Query(None),
    search_field: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Any:
    form = _get_default_form(db)
    query = db.query(InspectionForm).options(joinedload(InspectionForm.modality))

    if modality_id is not None:
        modality = db.query(Modality).filter(Modality.id == modality_id).first()
        if not modality:
            raise HTTPException(status_code=404, detail="Modality not found")

        allowed_modality_ids = {modality.id}
        parent = modality.parent
        while parent:
            allowed_modality_ids.add(parent.id)
            parent = parent.parent

        query = query.filter(
            or_(
                InspectionForm.modality_id.is_(None),
                InspectionForm.modality_id.in_(allowed_modality_ids),
            )
        )

    search_term = normalize_list_search(search)
    if search_term:
        search_by_field = {
            "name": [contains_ci(InspectionForm.name, search_term)],
            "description": [contains_ci(InspectionForm.description, search_term)],
            "modality": [contains_ci(Modality.name, search_term)],
            "content": [value_contains_ci(InspectionForm.schema, search_term)],
        }
        query = query.outerjoin(Modality, InspectionForm.modality_id == Modality.id).filter(
            or_(*predicates_for_field(search_field, search_by_field))
        )

    forms = query.order_by(InspectionForm.name.asc()).all()
    if form not in forms and not search_term:
        forms.append(form)
    return {
        "items": [_form_response(item) for item in forms],
        "total": len(forms),
    }


@router.post("/forms", status_code=status.HTTP_201_CREATED)
def create_inspection_form(
    form_in: InspectionFormCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Any:
    require_module_permission(current_user, "inspections", "add")

    name = form_in.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="Form name is required")
    if form_in.modality_id is not None:
        modality = db.query(Modality).filter(Modality.id == form_in.modality_id).first()
        if not modality:
            raise HTTPException(status_code=404, detail="Modality not found")

    existing = db.query(InspectionForm.id).filter(InspectionForm.name == name).first()
    if existing:
        raise HTTPException(status_code=400, detail="An inspection form with this name already exists")

    form = InspectionForm(
        name=name,
        description=form_in.description,
        modality_id=form_in.modality_id,
        schema=form_in.schema,
    )
    db.add(form)
    db.flush()
    log_activity(db, "inspection_forms", form.id, "CREATE", current_user, {"name": form.name})
    db.commit()
    db.refresh(form)
    return _form_response(form)


@router.patch("/forms/{form_id}")
def update_inspection_form(
    form_id: int,
    form_in: InspectionFormUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_admin_user),
) -> Any:
    form = db.query(InspectionForm).filter(InspectionForm.id == form_id).first()
    if not form:
        raise HTTPException(status_code=404, detail="Inspection form not found")

    if form_in.modality_id is not None:
        modality = db.query(Modality).filter(Modality.id == form_in.modality_id).first()
        if not modality:
            raise HTTPException(status_code=404, detail="Modality not found")

    if form_in.name is not None:
        name = form_in.name.strip()
        if not name:
            raise HTTPException(status_code=400, detail="Form name is required")
        duplicate = db.query(InspectionForm.id).filter(InspectionForm.name == name, InspectionForm.id != form.id).first()
        if duplicate:
            raise HTTPException(status_code=400, detail="An inspection form with this name already exists")
        form.name = name
    if form_in.description is not None:
        form.description = form_in.description
    if "modality_id" in form_in.model_fields_set:
        form.modality_id = form_in.modality_id
    if form_in.schema is not None:
        form.schema = form_in.schema
    db.commit()
    db.refresh(form)
    return _form_response(form)


@router.get("/facilities")
def inspection_facilities(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Any:
    facilities = (
        scope_query_to_user_facilities(db.query(Facility), Facility.id, db, current_user)
        .options(joinedload(Facility.tier))
        .order_by(Facility.name.asc())
        .all()
    )
    facility_ids = [facility.id for facility in facilities]
    equipment_counts = {
        int(facility_id): int(count)
        for facility_id, count in (
            db.query(Equipment.facility_id, func.count(Equipment.id))
            .filter(Equipment.facility_id.in_(facility_ids))
            .group_by(Equipment.facility_id)
            .all()
            if facility_ids
            else []
        )
    }
    return [
        {
            "id": facility.id,
            "name": facility.name,
            "city": facility.city,
            "state": facility.state,
            "tier_name": facility.tier.name if facility.tier else None,
            "inventory_count": equipment_counts.get(facility.id, 0),
        }
        for facility in facilities
    ]


@router.get("/facilities/{facility_id}/inventory")
def facility_inventory_for_inspection(
    facility_id: int,
    db: Session = Depends(get_db),
    search: Optional[str] = Query(None),
    search_field: Optional[str] = Query(None),
    current_user: User = Depends(get_current_user),
) -> Any:
    require_facility_access(db, current_user, facility_id)
    query = (
        db.query(InventoryPart)
        .options(joinedload(InventoryPart.facility), joinedload(InventoryPart.tier))
        .filter(InventoryPart.facility_id == facility_id)
    )
    search_term = normalize_list_search(search)
    if search_term:
        search_by_field = {
            "part_number": [contains_ci(InventoryPart.part_number, search_term)],
            "description": [contains_ci(InventoryPart.description, search_term)],
            "make_model": [
                contains_ci(InventoryPart.make, search_term),
                contains_ci(InventoryPart.model, search_term),
            ],
            "serial": [contains_ci(InventoryPart.serial_number, search_term)],
        }
        query = query.filter(or_(*predicates_for_field(search_field, search_by_field)))
    parts = query.order_by(InventoryPart.updated_at.desc(), InventoryPart.id.desc()).all()
    return [
        {
            "id": part.id,
            "facility_id": part.facility_id,
            "facility_name": part.facility.name if part.facility else None,
            "tier_id": part.tier_id,
            "tier_name": part.tier.name if part.tier else None,
            "part_number": part.part_number,
            "part_type": part.part_type,
            "description": part.description,
            "make": part.make,
            "model": part.model,
            "serial_number": part.serial_number,
            "location": part.location,
            "condition": part.condition,
            "unit_price": float(part.unit_price or 0),
            "is_critical": part.is_critical,
            "status": part.status,
        }
        for part in parts
    ]


@router.get("/facilities/{facility_id}/equipment")
def facility_equipment_for_inspection(
    facility_id: int,
    search: Optional[str] = Query(None),
    search_field: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Any:
    require_facility_access(db, current_user, facility_id)
    query = (
        db.query(Equipment)
        .options(joinedload(Equipment.facility), joinedload(Equipment.tier), joinedload(Equipment.modality))
        .filter(Equipment.facility_id == facility_id)
    )
    search_term = normalize_list_search(search)
    if search_term:
        tier_match = (
            db.query(Tier.id)
            .filter(
                Tier.id == Equipment.tier_id,
                contains_ci(Tier.name, search_term),
            )
            .exists()
        )
        modality_match = (
            db.query(Modality.id)
            .filter(
                Modality.id == Equipment.modality_id,
                contains_ci(Modality.name, search_term),
            )
            .exists()
        )
        search_by_field = {
            "asset_tag": [contains_ci(Equipment.asset_tag, search_term)],
            "equipment": [
                contains_ci(Equipment.make, search_term),
                contains_ci(Equipment.model, search_term),
            ],
            "serial": [contains_ci(Equipment.serial_number, search_term)],
            "status": [value_contains_ci(Equipment.status, search_term)],
            "tier": [tier_match],
            "modality": [modality_match],
        }
        query = query.filter(or_(*predicates_for_field(search_field, search_by_field)))
    equipment = query.order_by(Equipment.created_at.desc(), Equipment.id.desc()).all()
    return [
        {
            "id": item.id,
            "facility_id": item.facility_id,
            "facility_name": item.facility.name if item.facility else None,
            "tier_name": item.tier.name if item.tier else None,
            "asset_tag": item.asset_tag,
            "make": item.make,
            "model": item.model,
            "serial_number": item.serial_number,
            "modality_name": item.modality.name if item.modality else None,
            "status": _value(item.status),
            "criticality": _equipment_criticality(item),
        }
        for item in equipment
    ]


@router.get("/summary")
def inspection_summary(
    date_from: Optional[date] = Query(None),
    date_to: Optional[date] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Any:
    if date_from and date_to and date_from > date_to:
        raise HTTPException(status_code=400, detail="From date cannot be later than To date")
    inspections = scope_query_to_user_facilities(
        db.query(Inspection), Inspection.facility_id, db, current_user
    )
    batches = scope_query_to_user_facilities(
        db.query(InspectionBatch), InspectionBatch.facility_id, db, current_user
    )
    if current_user.role == UserRole.TECHNICIAN:
        inspections = inspections.filter(Inspection.inspector_id == current_user.id)
        batches = batches.filter(InspectionBatch.inspector_id == current_user.id)
    elif current_user.role == UserRole.EMPLOYEE:
        inspections = inspections.filter(False)
        batches = batches.filter(False)
    equipment = scope_query_to_user_facilities(
        db.query(Equipment), Equipment.facility_id, db, current_user
    )
    invoices = scope_query_to_user_facilities(
        db.query(Invoice), Invoice.facility_id, db, current_user
    )
    invoices = scope_invoice_approval_visibility(invoices, current_user)
    def date_conditions(column) -> list[Any]:
        conditions: list[Any] = []
        if date_from:
            conditions.append(column >= datetime.combine(date_from, time.min))
        if date_to:
            conditions.append(column <= datetime.combine(date_to, time.max))
        return conditions

    inspection_counts = inspections.with_entities(
        func.coalesce(
            func.sum(
                case(
                    (
                        and_(
                            Inspection.status == InspectionStatus.UPCOMING,
                            *date_conditions(Inspection.scheduled_date),
                        ),
                        1,
                    ),
                    else_=0,
                )
            ),
            0,
        ),
        func.coalesce(
            func.sum(
                case(
                    (
                        and_(
                            Inspection.status == InspectionStatus.IN_PROGRESS,
                            Inspection.batch_id.is_(None),
                            *date_conditions(func.coalesce(Inspection.started_at, Inspection.scheduled_date)),
                        ),
                        1,
                    ),
                    else_=0,
                )
            ),
            0,
        ),
        func.coalesce(
            func.sum(
                case(
                    (
                        and_(
                            Inspection.status == InspectionStatus.COMPLETED,
                            Inspection.batch_id.is_(None),
                            *date_conditions(Inspection.completed_at),
                        ),
                        1,
                    ),
                    else_=0,
                )
            ),
            0,
        ),
    ).one()
    batch_counts = batches.with_entities(
        func.coalesce(
            func.sum(
                case(
                    (
                        and_(
                            InspectionBatch.status == InspectionStatus.IN_PROGRESS,
                            *date_conditions(func.coalesce(InspectionBatch.started_at, InspectionBatch.scheduled_date)),
                        ),
                        1,
                    ),
                    else_=0,
                )
            ),
            0,
        ),
        func.coalesce(
            func.sum(
                case(
                    (
                        and_(
                            InspectionBatch.status == InspectionStatus.COMPLETED,
                            *date_conditions(InspectionBatch.completed_at),
                        ),
                        1,
                    ),
                    else_=0,
                )
            ),
            0,
        ),
    ).one()
    return {
        "upcoming": int(inspection_counts[0] or 0),
        "in_progress": int(inspection_counts[1] or 0) + int(batch_counts[0] or 0),
        "completed": int(inspection_counts[2] or 0) + int(batch_counts[1] or 0),
        "assets": equipment.count(),
        "quotations": invoices.filter(Invoice.invoice_type == InvoiceType.INSPECTION).count(),
    }


@router.get("/")
def list_inspections(
    db: Session = Depends(get_db),
    status_filter: Optional[InspectionStatus] = Query(None, alias="status"),
    facility_id: Optional[int] = Query(None),
    unbatched_only: bool = Query(False),
    search: Optional[str] = Query(None),
    search_field: Optional[str] = Query(None),
    date_from: Optional[date] = Query(None),
    date_to: Optional[date] = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(25, ge=1, le=100),
    current_user: User = Depends(get_current_user),
) -> Any:
    query = (
        scope_query_to_user_facilities(db.query(Inspection), Inspection.facility_id, db, current_user)
        .options(
            joinedload(Inspection.facility).joinedload(Facility.tier),
            joinedload(Inspection.inventory_part).joinedload(InventoryPart.tier),
            joinedload(Inspection.inventory_part).joinedload(InventoryPart.inspection_form),
            joinedload(Inspection.equipment).joinedload(Equipment.tier),
            joinedload(Inspection.equipment).joinedload(Equipment.inspection_form),
            joinedload(Inspection.inspector),
            joinedload(Inspection.batch),
            joinedload(Inspection.form_template),
        )
    )
    if status_filter:
        query = query.filter(Inspection.status == status_filter)
    if facility_id:
        query = query.filter(Inspection.facility_id == facility_id)
    if unbatched_only:
        query = query.filter(Inspection.batch_id.is_(None))
    if date_from and date_to and date_from > date_to:
        raise HTTPException(status_code=400, detail="From date cannot be later than To date")
    inspection_date_column = Inspection.scheduled_date
    if status_filter == InspectionStatus.IN_PROGRESS:
        inspection_date_column = func.coalesce(Inspection.started_at, Inspection.scheduled_date)
    elif status_filter == InspectionStatus.COMPLETED:
        inspection_date_column = Inspection.completed_at
    if date_from:
        query = query.filter(inspection_date_column >= datetime.combine(date_from, time.min))
    if date_to:
        query = query.filter(inspection_date_column <= datetime.combine(date_to, time.max))
    search_term = normalize_list_search(search)
    if search_term:
        normalized_value = search_term.lower().replace("-", "_").replace(" ", "_")
        tier_match = (
            db.query(Tier.id)
            .filter(
                or_(Tier.id == Equipment.tier_id, Tier.id == InventoryPart.tier_id),
                contains_ci(Tier.name, search_term),
            )
            .exists()
        )
        modality_match = (
            db.query(Modality.id)
            .filter(
                Modality.id == Equipment.modality_id,
                contains_ci(Modality.name, search_term),
            )
            .exists()
        )
        search_by_field = {
            "inspection_number": [contains_ci(Inspection.inspection_number, search_term)],
            "frequency": [contains_ci(Inspection.inspection_frequency, normalized_value)],
            "requirement": [contains_ci(Inspection.compliance_requirement, search_term)],
            "criticality": [contains_ci(Inspection.criticality, search_term)],
            "status": [
                value_contains_ci(Inspection.status, normalized_value),
                value_contains_ci(Inspection.result, normalized_value),
            ],
            "date": [
                value_contains_ci(Inspection.scheduled_date, search_term),
                value_contains_ci(Inspection.started_at, search_term),
                value_contains_ci(Inspection.completed_at, search_term),
            ],
            "batch": [contains_ci(InspectionBatch.batch_number, search_term)],
            "facility": [contains_ci(Facility.name, search_term)],
            "asset": [
                contains_ci(Equipment.asset_tag, search_term),
                contains_ci(Equipment.make, search_term),
                contains_ci(Equipment.model, search_term),
                contains_ci(InventoryPart.part_number, search_term),
                contains_ci(InventoryPart.description, search_term),
                contains_ci(InventoryPart.make, search_term),
                contains_ci(InventoryPart.model, search_term),
            ],
            "serial": [
                contains_ci(Equipment.serial_number, search_term),
                contains_ci(InventoryPart.serial_number, search_term),
            ],
            "technician": [contains_ci(User.full_name, search_term)],
            "tier": [tier_match],
            "modality": [modality_match],
        }
        searched_date = parsed_date_bounds(search_term)
        if searched_date:
            search_by_field["date"].append(
                and_(
                    inspection_date_column >= searched_date[0],
                    inspection_date_column < searched_date[1],
                )
            )
        query = (
            query
            .outerjoin(Facility, Inspection.facility_id == Facility.id)
            .outerjoin(Equipment, Inspection.equipment_id == Equipment.id)
            .outerjoin(InventoryPart, Inspection.inventory_part_id == InventoryPart.id)
            .outerjoin(InspectionBatch, Inspection.batch_id == InspectionBatch.id)
            .outerjoin(User, Inspection.inspector_id == User.id)
            .filter(or_(*predicates_for_field(search_field, search_by_field)))
        )
    if current_user.role == UserRole.TECHNICIAN:
        query = query.filter(Inspection.inspector_id == current_user.id)
    elif current_user.role == UserRole.EMPLOYEE:
        query = query.filter(False)

    total = query.count()
    inspections = query.order_by(Inspection.created_at.desc()).offset(skip).limit(limit).all()
    inspection_ids = [item.id for item in inspections]
    invoice_map = {
        invoice.inspection_id: invoice
        for invoice in (
            scope_invoice_approval_visibility(db.query(Invoice), current_user)
            .options(
                joinedload(Invoice.facility),
                joinedload(Invoice.approved_for_billing_by),
                joinedload(Invoice.transactions),
            )
            .filter(Invoice.inspection_id.in_(inspection_ids))
            .all()
            if inspection_ids
            else []
        )
        if invoice.inspection_id
    }
    for inspection in inspections:
        inspection._inspection_invoice = invoice_map.get(inspection.id)
    return {
        "items": [_inspection_response(item) for item in inspections],
        "total": total,
        "skip": skip,
        "limit": limit,
    }


@router.get("/batches")
def list_inspection_batches(
    db: Session = Depends(get_db),
    status_filter: Optional[InspectionStatus] = Query(None, alias="status"),
    facility_id: Optional[int] = Query(None),
    search: Optional[str] = Query(None),
    search_field: Optional[str] = Query(None),
    date_from: Optional[date] = Query(None),
    date_to: Optional[date] = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(25, ge=1, le=100),
    current_user: User = Depends(get_current_user),
) -> Any:
    if date_from and date_to and date_from > date_to:
        raise HTTPException(status_code=400, detail="From date cannot be later than To date")
    query = (
        scope_query_to_user_facilities(db.query(InspectionBatch), InspectionBatch.facility_id, db, current_user)
        .options(
            joinedload(InspectionBatch.facility),
            joinedload(InspectionBatch.inspector),
        )
    )
    if status_filter:
        query = query.filter(InspectionBatch.status == status_filter)
    if facility_id:
        require_facility_access(db, current_user, facility_id)
        query = query.filter(InspectionBatch.facility_id == facility_id)
    search_term = normalize_list_search(search)
    if search_term:
        normalized_value = search_term.lower().replace("-", "_").replace(" ", "_")
        asset_match = (
            db.query(Inspection.id)
            .outerjoin(Equipment, Inspection.equipment_id == Equipment.id)
            .outerjoin(InventoryPart, Inspection.inventory_part_id == InventoryPart.id)
            .filter(
                Inspection.batch_id == InspectionBatch.id,
                or_(
                    contains_ci(Inspection.inspection_number, search_term),
                    contains_ci(Equipment.asset_tag, search_term),
                    contains_ci(Equipment.make, search_term),
                    contains_ci(Equipment.model, search_term),
                    contains_ci(Equipment.serial_number, search_term),
                    contains_ci(InventoryPart.part_number, search_term),
                    contains_ci(InventoryPart.description, search_term),
                    contains_ci(InventoryPart.make, search_term),
                    contains_ci(InventoryPart.model, search_term),
                    contains_ci(InventoryPart.serial_number, search_term),
                ),
            )
            .exists()
        )
        search_by_field = {
            "inspection_number": [asset_match],
            "batch": [contains_ci(InspectionBatch.batch_number, search_term)],
            "facility": [contains_ci(Facility.name, search_term)],
            "technician": [contains_ci(User.full_name, search_term)],
            "frequency": [contains_ci(InspectionBatch.inspection_frequency, normalized_value)],
            "status": [value_contains_ci(InspectionBatch.status, normalized_value)],
            "date": [
                value_contains_ci(InspectionBatch.scheduled_date, search_term),
                value_contains_ci(InspectionBatch.started_at, search_term),
                value_contains_ci(InspectionBatch.completed_at, search_term),
            ],
            "asset": [asset_match],
        }
        query = (
            query
            .outerjoin(Facility, InspectionBatch.facility_id == Facility.id)
            .outerjoin(User, InspectionBatch.inspector_id == User.id)
            .filter(or_(*predicates_for_field(search_field, search_by_field)))
        )
    batch_date_column = InspectionBatch.scheduled_date
    if status_filter == InspectionStatus.IN_PROGRESS:
        batch_date_column = func.coalesce(InspectionBatch.started_at, InspectionBatch.scheduled_date)
    elif status_filter == InspectionStatus.COMPLETED:
        batch_date_column = InspectionBatch.completed_at
    if date_from:
        query = query.filter(batch_date_column >= datetime.combine(date_from, time.min))
    if date_to:
        query = query.filter(batch_date_column <= datetime.combine(date_to, time.max))
    if current_user.role == UserRole.TECHNICIAN:
        query = query.filter(InspectionBatch.inspector_id == current_user.id)
    elif current_user.role == UserRole.EMPLOYEE:
        query = query.filter(False)

    total = query.count()
    batches = query.order_by(InspectionBatch.created_at.desc()).offset(skip).limit(limit).all()
    count_map = _batch_counts(db, [batch.id for batch in batches])
    return {
        "items": [
            _batch_response(
                batch,
                counts=count_map.get(batch.id, {"total": 0, "completed": 0, "in_progress": 0}),
            )
            for batch in batches
        ],
        "total": total,
        "skip": skip,
        "limit": limit,
    }


@router.get("/batches/{batch_id}")
def get_inspection_batch(
    batch_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Any:
    batch = (
        db.query(InspectionBatch)
        .options(
            joinedload(InspectionBatch.facility),
            joinedload(InspectionBatch.inspector),
            selectinload(InspectionBatch.inspections).joinedload(Inspection.facility).joinedload(Facility.tier),
            selectinload(InspectionBatch.inspections).joinedload(Inspection.equipment).joinedload(Equipment.tier),
            selectinload(InspectionBatch.inspections).joinedload(Inspection.equipment).joinedload(Equipment.modality),
            selectinload(InspectionBatch.inspections).joinedload(Inspection.equipment).joinedload(Equipment.inspection_form),
            selectinload(InspectionBatch.inspections).joinedload(Inspection.inventory_part).joinedload(InventoryPart.tier),
            selectinload(InspectionBatch.inspections).joinedload(Inspection.inventory_part).joinedload(InventoryPart.inspection_form),
            selectinload(InspectionBatch.inspections).joinedload(Inspection.inspector),
            selectinload(InspectionBatch.inspections).joinedload(Inspection.form_template),
        )
        .filter(InspectionBatch.id == batch_id)
        .first()
    )
    if not batch:
        raise HTTPException(status_code=404, detail="Inspection batch not found")
    require_facility_access(db, current_user, batch.facility_id)

    invoice_map = {
        invoice.inspection_id: invoice
        for invoice in scope_invoice_approval_visibility(
            db.query(Invoice), current_user
        ).filter(Invoice.inspection_id.in_([item.id for item in batch.inspections])).all()
        if invoice.inspection_id
    }
    for inspection in batch.inspections:
        inspection._inspection_invoice = invoice_map.get(inspection.id)
    batch._batch_invoice = (
        scope_invoice_approval_visibility(db.query(Invoice), current_user)
        .options(
            joinedload(Invoice.facility),
            joinedload(Invoice.inspection_batch),
            joinedload(Invoice.approved_for_billing_by),
            joinedload(Invoice.transactions),
        )
        .filter(
            Invoice.invoice_type == InvoiceType.INSPECTION,
            Invoice.inspection_batch_id == batch.id,
            Invoice.status != InvoiceStatus.CANCELLED,
        )
        .first()
    )
    return _batch_response(batch, include_assets=True)


@router.post("/batches/{batch_id}/assets", status_code=status.HTTP_201_CREATED)
def add_asset_to_inspection_batch(
    batch_id: int,
    payload: BatchAssetCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Any:
    require_module_permission(current_user, "inspections", "add")

    batch = (
        db.query(InspectionBatch)
        .options(joinedload(InspectionBatch.facility), joinedload(InspectionBatch.inspections))
        .filter(InspectionBatch.id == batch_id)
        .with_for_update(of=InspectionBatch)
        .first()
    )
    if not batch:
        raise HTTPException(status_code=404, detail="Inspection batch not found")
    require_facility_access(db, current_user, batch.facility_id)
    batch_invoice = _lock_active_batch_invoice(db, batch.id)
    _require_batch_invoice_allows_asset_changes(batch_invoice)
    reopening_completed_batch = batch.status == InspectionStatus.COMPLETED

    if not db.query(Modality.id).filter(Modality.id == payload.modality_id).first():
        raise HTTPException(status_code=404, detail="Modality not found")
    if payload.tier_id and not db.query(Tier.id).filter(Tier.id == payload.tier_id).first():
        raise HTTPException(status_code=404, detail="Tier not found")
    if payload.inspection_form_id and not db.query(InspectionForm.id).filter(InspectionForm.id == payload.inspection_form_id).first():
        raise HTTPException(status_code=404, detail="Inspection form not found")

    existing_asset = (
        db.query(Equipment.id)
        .filter(
            Equipment.facility_id == batch.facility_id,
            or_(Equipment.asset_tag == payload.asset_tag, Equipment.serial_number == payload.serial_number),
        )
        .first()
    )
    if existing_asset:
        raise HTTPException(status_code=400, detail="Asset tag or serial number already exists in this facility")

    equipment = Equipment(
        asset_tag=payload.asset_tag,
        make=payload.make,
        model=payload.model,
        serial_number=payload.serial_number,
        modality_id=payload.modality_id,
        facility_id=batch.facility_id,
        tier_id=payload.tier_id,
        inspection_form_id=payload.inspection_form_id,
        description=payload.description,
        risk_priority=payload.risk_priority,
        risk_name=payload.risk_name,
        location=payload.location,
        pm_scheduling=payload.pm_scheduling or batch.inspection_frequency or "annual",
        last_pm_date=payload.last_pm_date,
        next_generated_pm_date=next_inspection_date(payload.last_pm_date, payload.pm_scheduling or batch.inspection_frequency or "annual"),
        installation_date=payload.installation_date,
        inventory_date=payload.inventory_date,
        status=EquipmentStatus.ACTIVE,
    )
    db.add(equipment)
    db.flush()

    inspection_status = InspectionStatus.IN_PROGRESS if batch.status == InspectionStatus.COMPLETED else batch.status
    if inspection_status == InspectionStatus.COMPLETED:
        inspection_status = InspectionStatus.IN_PROGRESS
    inspection = Inspection(
        inspection_number=_next_batch_asset_number(db, batch),
        batch=batch,
        equipment_id=equipment.id,
        facility_id=batch.facility_id,
        inspector_id=batch.inspector_id or current_user.id,
        form_template_id=payload.inspection_form_id or batch.form_template_id,
        status=inspection_status,
        result=InspectionResult.PENDING,
        scheduled_date=batch.scheduled_date,
        started_at=datetime.utcnow() if inspection_status == InspectionStatus.IN_PROGRESS else None,
        inspection_scope=batch.inspection_scope or "facility_assets",
        inspection_frequency=batch.inspection_frequency,
        compliance_requirement="Runtime asset added to inspection batch",
        criticality=payload.risk_priority or batch.inspection_frequency or "standard",
        is_instant=batch.is_instant,
    )
    db.add(inspection)
    db.flush()
    if batch.status == InspectionStatus.COMPLETED:
        batch.status = InspectionStatus.IN_PROGRESS
        batch.completed_at = None
    _sync_batch_status(batch)
    if batch_invoice and reopening_completed_batch:
        batch_invoice.updated_at = datetime.utcnow()
        add_invoice_transaction(
            db,
            batch_invoice,
            "batch_scope_changed",
            batch_invoice.total_amount,
            description=(
                f"{equipment.asset_tag} was added to {batch.batch_number}; "
                "the existing invoice will be recalculated when the batch is completed"
            ),
            user=current_user,
            reference_prefix="SCOPE",
        )
    log_activity(db, "inspections", inspection.id, "ADD_BATCH_ASSET", current_user, {"batch_id": batch.id, "equipment_id": equipment.id})
    db.commit()
    db.refresh(batch)
    return get_inspection_batch(batch.id, db, current_user)


@router.post("/batches/{batch_id}/existing-assets", status_code=status.HTTP_201_CREATED)
def add_existing_assets_to_inspection_batch(
    batch_id: int,
    payload: BatchExistingAssetsCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Any:
    require_module_permission(current_user, "inspections", "add")

    equipment_ids = list(dict.fromkeys(payload.equipment_ids or []))
    if not equipment_ids:
        raise HTTPException(status_code=400, detail="Select at least one existing asset")
    if len(equipment_ids) > 250:
        raise HTTPException(status_code=400, detail="You can add up to 250 existing assets at a time")

    batch = (
        db.query(InspectionBatch)
        .options(joinedload(InspectionBatch.facility), joinedload(InspectionBatch.inspections))
        .filter(InspectionBatch.id == batch_id)
        .with_for_update(of=InspectionBatch)
        .first()
    )
    if not batch:
        raise HTTPException(status_code=404, detail="Inspection batch not found")
    require_facility_access(db, current_user, batch.facility_id)
    batch_invoice = _lock_active_batch_invoice(db, batch.id)
    _require_batch_invoice_allows_asset_changes(batch_invoice)
    reopening_completed_batch = batch.status == InspectionStatus.COMPLETED

    equipment_items = (
        db.query(Equipment)
        .filter(
            Equipment.facility_id == batch.facility_id,
            Equipment.id.in_(equipment_ids),
        )
        .all()
    )
    found_ids = {item.id for item in equipment_items}
    missing_ids = [item_id for item_id in equipment_ids if item_id not in found_ids]
    if missing_ids:
        raise HTTPException(status_code=404, detail="One or more selected assets were not found in this facility")

    already_added_ids = {
        equipment_id
        for (equipment_id,) in (
            db.query(Inspection.equipment_id)
            .filter(
                Inspection.batch_id == batch.id,
                Inspection.equipment_id.in_(equipment_ids),
            )
            .all()
        )
        if equipment_id is not None
    }
    if already_added_ids:
        raise HTTPException(status_code=400, detail="One or more selected assets are already in this inspection batch")

    inspection_status = InspectionStatus.IN_PROGRESS if batch.status == InspectionStatus.COMPLETED else batch.status
    if inspection_status == InspectionStatus.COMPLETED:
        inspection_status = InspectionStatus.IN_PROGRESS

    equipment_by_id = {item.id: item for item in equipment_items}
    for equipment_id in equipment_ids:
        equipment = equipment_by_id[equipment_id]
        inspection = Inspection(
            inspection_number=_next_batch_asset_number(db, batch),
            batch=batch,
            equipment_id=equipment.id,
            facility_id=batch.facility_id,
            inspector_id=batch.inspector_id or current_user.id,
            form_template_id=equipment.inspection_form_id or batch.form_template_id,
            status=inspection_status,
            result=InspectionResult.PENDING,
            scheduled_date=batch.scheduled_date,
            started_at=datetime.utcnow() if inspection_status == InspectionStatus.IN_PROGRESS else None,
            inspection_scope=batch.inspection_scope or "facility_assets",
            inspection_frequency=batch.inspection_frequency,
            compliance_requirement="Existing facility asset added to inspection batch",
            criticality=_equipment_criticality(equipment) or batch.inspection_frequency or "standard",
            is_instant=batch.is_instant,
        )
        db.add(inspection)
        db.flush()
        log_activity(
            db,
            "inspections",
            inspection.id,
            "ADD_EXISTING_BATCH_ASSET",
            current_user,
            {"batch_id": batch.id, "equipment_id": equipment.id},
        )

    if batch.status == InspectionStatus.COMPLETED:
        batch.status = InspectionStatus.IN_PROGRESS
        batch.completed_at = None
    db.expire(batch, ["inspections"])
    _sync_batch_status(batch)
    if batch_invoice and reopening_completed_batch:
        batch_invoice.updated_at = datetime.utcnow()
        add_invoice_transaction(
            db,
            batch_invoice,
            "batch_scope_changed",
            batch_invoice.total_amount,
            description=(
                f"{len(equipment_ids)} existing asset(s) were added to {batch.batch_number}; "
                "the existing invoice will be recalculated when the batch is completed"
            ),
            user=current_user,
            reference_prefix="SCOPE",
        )
    db.commit()
    db.refresh(batch)
    return get_inspection_batch(batch.id, db, current_user)


@router.delete("/batches/{batch_id}/assets/{inspection_id}")
def remove_asset_from_inspection_batch(
    batch_id: int,
    inspection_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Any:
    require_module_permission(current_user, "inspections", "delete")

    batch = db.query(InspectionBatch).options(joinedload(InspectionBatch.inspections)).filter(InspectionBatch.id == batch_id).first()
    if not batch:
        raise HTTPException(status_code=404, detail="Inspection batch not found")
    require_facility_access(db, current_user, batch.facility_id)

    inspection = db.query(Inspection).filter(Inspection.id == inspection_id, Inspection.batch_id == batch.id).first()
    if not inspection:
        raise HTTPException(status_code=404, detail="Batch asset inspection not found")
    if inspection.status == InspectionStatus.COMPLETED:
        raise HTTPException(status_code=400, detail="Completed assets cannot be removed from a batch")

    log_activity(db, "inspections", inspection.id, "REMOVE_BATCH_ASSET", current_user, {"batch_id": batch.id, "equipment_id": inspection.equipment_id})
    db.delete(inspection)
    db.flush()
    db.expire(batch, ["inspections"])
    if batch.inspections:
        _sync_batch_status(batch)
    else:
        batch.status = InspectionStatus.IN_PROGRESS
        batch.completed_at = None
        batch.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(batch)
    return get_inspection_batch(batch.id, db, current_user)


@router.patch("/{inspection_id}/technician")
def update_inspection_technician(
    inspection_id: int,
    payload: InspectionTechnicianUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Any:
    require_module_permission(current_user, "inspections", "edit")

    inspection = (
        db.query(Inspection)
        .options(joinedload(Inspection.facility), joinedload(Inspection.inspector), joinedload(Inspection.batch))
        .filter(Inspection.id == inspection_id)
        .first()
    )
    if not inspection:
        raise HTTPException(status_code=404, detail="Inspection not found")
    require_facility_access(db, current_user, inspection.facility_id)
    if payload.inspector_id:
        technician = db.query(User).filter(User.id == payload.inspector_id, User.is_active.is_(True)).first()
        if not technician:
            raise HTTPException(status_code=404, detail="Technician not found")
    inspection.inspector_id = payload.inspector_id
    inspection.updated_at = datetime.utcnow()
    log_activity(db, "inspections", inspection.id, "CHANGE_TECHNICIAN", current_user, {"inspector_id": payload.inspector_id})
    db.commit()
    db.refresh(inspection)
    return _inspection_response(inspection)


@router.post("/schedule", status_code=status.HTTP_201_CREATED)
def schedule_inspections(
    payload: InspectionScheduleCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Any:
    require_module_permission(current_user, "inspections", "add")

    facility = db.query(Facility).filter(Facility.id == payload.facility_id).first()
    if not facility:
        raise HTTPException(status_code=404, detail="Facility not found")
    require_facility_access(db, current_user, payload.facility_id)

    query = (
        db.query(Equipment)
        .options(joinedload(Equipment.tier), joinedload(Equipment.modality), joinedload(Equipment.facility))
        .filter(Equipment.facility_id == payload.facility_id)
    )
    if payload.equipment_ids:
        query = query.filter(Equipment.id.in_(payload.equipment_ids))
    equipment_items = query.all()
    if not equipment_items:
        raise HTTPException(status_code=400, detail="No equipment found for scheduling")

    form = _get_default_form(db)
    batch = InspectionBatch(
        batch_number=_next_batch_number(db),
        facility_id=facility.id,
        inspector_id=current_user.id,
        form_template_id=form.id,
        status=InspectionStatus.UPCOMING,
        scheduled_date=payload.scheduled_date,
        inspection_frequency=payload.frequency,
        inspection_scope="equipment_compliance",
        notes=payload.notes,
        is_instant=False,
    )
    db.add(batch)
    db.flush()
    created: list[Inspection] = []
    for index, equipment in enumerate(equipment_items, start=1):
        criticality = payload.criticality or _equipment_criticality(equipment)
        inspection = Inspection(
            inspection_number=_batch_asset_number(batch.batch_number, index),
            batch_id=batch.id,
            equipment_id=equipment.id,
            inventory_part_id=None,
            facility_id=facility.id,
            inspector_id=current_user.id,
            form_template_id=equipment.inspection_form_id or form.id,
            status=InspectionStatus.UPCOMING,
            result=InspectionResult.PENDING,
            scheduled_date=payload.scheduled_date,
            inspection_scope="equipment_compliance",
            inspection_frequency=payload.frequency,
            compliance_requirement=payload.compliance_requirement or _compliance_requirement(equipment, criticality),
            criticality=criticality,
            corrective_actions=payload.notes,
            is_instant=False,
        )
        db.add(inspection)
        db.flush()
        log_activity(db, "inspections", inspection.id, "SCHEDULE", current_user, {"equipment_id": equipment.id})
        created.append(inspection)

    notify_facility_users(
        db,
        facility_id=facility.id,
        title="Inspection scheduled",
        message=f"{len(created)} upcoming inspection(s) were scheduled for {facility.name}.",
        notification_type="inspection",
        link_url="/inspections",
        actor_id=current_user.id,
    )
    db.commit()
    db.refresh(batch)
    return {"items": [_batch_response(batch, include_assets=True)], "total": 1}


@router.post("/generate-upcoming", status_code=status.HTTP_201_CREATED)
def generate_upcoming_inspections(
    payload: UpcomingGenerationRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Any:
    require_module_permission(current_user, "inspections", "add")

    horizon = datetime.utcnow() + timedelta(days=max(payload.days_ahead, 1))
    query = (
        db.query(Equipment)
        .options(joinedload(Equipment.tier), joinedload(Equipment.modality), joinedload(Equipment.facility))
        .filter(Equipment.status == EquipmentStatus.ACTIVE)
    )
    if payload.facility_id:
        require_facility_access(db, current_user, payload.facility_id)
        query = query.filter(Equipment.facility_id == payload.facility_id)
    else:
        query = scope_query_to_user_facilities(query, Equipment.facility_id, db, current_user)

    form = _get_default_form(db)
    created: list[Inspection] = []
    for equipment in query.all():
        active_exists = (
            db.query(Inspection.id)
            .filter(
                Inspection.equipment_id == equipment.id,
                Inspection.status.in_([InspectionStatus.UPCOMING, InspectionStatus.IN_PROGRESS]),
            )
            .first()
        )
        if active_exists:
            continue

        criticality = _equipment_criticality(equipment)
        frequency = inspection_frequency_from_schedule(equipment.pm_scheduling) or _frequency_for_criticality(criticality)
        last_completed = (
            db.query(Inspection)
            .filter(Inspection.equipment_id == equipment.id, Inspection.status == InspectionStatus.COMPLETED)
            .order_by(Inspection.completed_at.desc())
            .first()
        )
        due_date = None
        if equipment.next_generated_pm_date:
            due_date = datetime.combine(equipment.next_generated_pm_date, datetime.min.time())
        elif equipment.last_pm_date and equipment.pm_scheduling:
            generated_due_date = next_inspection_date(equipment.last_pm_date, equipment.pm_scheduling)
            if generated_due_date:
                due_date = datetime.combine(generated_due_date, datetime.min.time())
        if due_date is None:
            base_date = last_completed.completed_at if last_completed and last_completed.completed_at else datetime.utcnow()
            due_date = base_date + timedelta(days=_frequency_days(frequency))
        if due_date > horizon:
            continue

        inspection = Inspection(
            inspection_number=_next_inspection_number(db),
            equipment_id=equipment.id,
            facility_id=equipment.facility_id,
            inspector_id=current_user.id,
            form_template_id=equipment.inspection_form_id or form.id,
            status=InspectionStatus.UPCOMING,
            result=InspectionResult.PENDING,
            scheduled_date=due_date,
            inspection_scope="equipment_compliance",
            inspection_frequency=frequency,
            compliance_requirement=_compliance_requirement(equipment, criticality),
            criticality=criticality,
            is_instant=False,
        )
        db.add(inspection)
        db.flush()
        log_activity(db, "inspections", inspection.id, "AUTO_SCHEDULE", current_user, {"equipment_id": equipment.id})
        created.append(inspection)

    db.commit()
    return {"items": [_inspection_response(item) for item in created], "total": len(created)}


@router.put("/{inspection_id}/start")
def start_scheduled_inspection(
    inspection_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Any:
    require_module_permission(current_user, "inspections", "edit")

    inspection = (
        db.query(Inspection)
        .options(
            joinedload(Inspection.facility).joinedload(Facility.tier),
            joinedload(Inspection.inventory_part).joinedload(InventoryPart.tier),
            joinedload(Inspection.equipment).joinedload(Equipment.tier),
            joinedload(Inspection.inspector),
            joinedload(Inspection.batch),
        )
        .filter(Inspection.id == inspection_id)
        .first()
    )
    if not inspection:
        raise HTTPException(status_code=404, detail="Inspection not found")
    require_facility_access(db, current_user, inspection.facility_id)
    if inspection.status != InspectionStatus.UPCOMING:
        raise HTTPException(status_code=400, detail="Only upcoming inspections can be started")

    inspection.status = InspectionStatus.IN_PROGRESS
    inspection.started_at = datetime.utcnow()
    inspection.inspector_id = current_user.id
    inspection.updated_at = datetime.utcnow()
    _sync_batch_status(inspection.batch)
    log_activity(db, "inspections", inspection.id, "START", current_user, {"status": "in_progress"})
    db.commit()
    db.refresh(inspection)
    return _inspection_response(inspection)


@router.patch("/{inspection_id}")
def update_upcoming_inspection(
    inspection_id: int,
    payload: InspectionDetailsUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Any:
    """Edit scheduling metadata without changing inspection identity or reports."""
    require_module_permission(current_user, "inspections", "edit")

    inspection = (
        db.query(Inspection)
        .options(
            joinedload(Inspection.facility).joinedload(Facility.tier),
            joinedload(Inspection.inventory_part).joinedload(InventoryPart.tier),
            joinedload(Inspection.equipment).joinedload(Equipment.tier),
            joinedload(Inspection.inspector),
            joinedload(Inspection.form_template),
            joinedload(Inspection.batch),
        )
        .filter(Inspection.id == inspection_id)
        .first()
    )
    if not inspection:
        raise HTTPException(status_code=404, detail="Inspection not found")
    require_facility_access(db, current_user, inspection.facility_id)
    _require_upcoming_inspection(inspection, "edited")

    update_data = payload.model_dump(exclude_unset=True)
    if not update_data:
        raise HTTPException(status_code=400, detail="No inspection changes were submitted")
    if "scheduled_date" in update_data and update_data["scheduled_date"] is None:
        raise HTTPException(status_code=400, detail="Scheduled date is required")
    if "inspection_frequency" in update_data:
        frequency = str(update_data["inspection_frequency"] or "").strip()
        if not frequency:
            raise HTTPException(status_code=400, detail="Inspection frequency is required")
        update_data["inspection_frequency"] = frequency
    if "form_template_id" in update_data:
        form_template_id = update_data["form_template_id"]
        if form_template_id is None:
            raise HTTPException(status_code=400, detail="Inspection form is required")
        if not db.query(InspectionForm.id).filter(InspectionForm.id == form_template_id).first():
            raise HTTPException(status_code=404, detail="Inspection form not found")
    if "inspector_id" in update_data and update_data["inspector_id"] is not None:
        technician = (
            db.query(User)
            .filter(User.id == update_data["inspector_id"], User.is_active.is_(True))
            .first()
        )
        if not technician:
            raise HTTPException(status_code=404, detail="Technician not found")

    tracked_fields = [
        "scheduled_date",
        "inspection_frequency",
        "compliance_requirement",
        "criticality",
        "inspector_id",
        "form_template_id",
    ]
    before = {field: getattr(inspection, field) for field in tracked_fields if field in update_data}
    for field, value in update_data.items():
        setattr(inspection, field, value)
    inspection.updated_at = datetime.utcnow()
    after = {field: getattr(inspection, field) for field in tracked_fields if field in update_data}
    action = "RESCHEDULE" if set(update_data) == {"scheduled_date"} else "UPDATE_DETAILS"
    log_activity(
        db,
        "inspections",
        inspection.id,
        action,
        current_user,
        {"before": before, "after": after},
    )
    db.commit()
    db.refresh(inspection)
    return _inspection_response(inspection)


@router.put("/{inspection_id}/close")
def close_upcoming_inspection(
    inspection_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Any:
    """Close an upcoming inspection without completing or deleting it."""
    require_module_permission(current_user, "inspections", "edit")

    inspection = (
        db.query(Inspection)
        .options(
            joinedload(Inspection.facility).joinedload(Facility.tier),
            joinedload(Inspection.inventory_part).joinedload(InventoryPart.tier),
            joinedload(Inspection.equipment).joinedload(Equipment.tier),
            joinedload(Inspection.inspector),
            joinedload(Inspection.form_template),
            joinedload(Inspection.batch).joinedload(InspectionBatch.inspections),
        )
        .filter(Inspection.id == inspection_id)
        .first()
    )
    if not inspection:
        raise HTTPException(status_code=404, detail="Inspection not found")
    require_facility_access(db, current_user, inspection.facility_id)
    _require_upcoming_inspection(inspection, "closed")

    previous_status = _value(inspection.status)
    inspection.status = InspectionStatus.CLOSED
    inspection.started_at = None
    inspection.completed_at = None
    inspection.updated_at = datetime.utcnow()
    _sync_batch_status(inspection.batch)
    log_activity(
        db,
        "inspections",
        inspection.id,
        "CLOSE",
        current_user,
        {
            "previous_status": previous_status,
            "status": InspectionStatus.CLOSED.value,
            "scheduled_date": inspection.scheduled_date,
            "batch_id": inspection.batch_id,
        },
    )
    db.commit()
    db.refresh(inspection)
    return _inspection_response(inspection)


@router.put("/{inspection_id}/reopen")
def reopen_closed_inspection(
    inspection_id: int,
    payload: InspectionReopen,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Any:
    """Return a closed inspection to Upcoming, optionally with a new schedule."""
    require_module_permission(current_user, "inspections", "edit")

    inspection = (
        db.query(Inspection)
        .options(
            joinedload(Inspection.facility).joinedload(Facility.tier),
            joinedload(Inspection.inventory_part).joinedload(InventoryPart.tier),
            joinedload(Inspection.equipment).joinedload(Equipment.tier),
            joinedload(Inspection.inspector),
            joinedload(Inspection.form_template),
            joinedload(Inspection.batch).joinedload(InspectionBatch.inspections),
        )
        .filter(Inspection.id == inspection_id)
        .first()
    )
    if not inspection:
        raise HTTPException(status_code=404, detail="Inspection not found")
    require_facility_access(db, current_user, inspection.facility_id)
    if inspection.status != InspectionStatus.CLOSED:
        raise HTTPException(status_code=409, detail="Only closed inspections can be reopened")

    previous_schedule = inspection.scheduled_date
    if payload.scheduled_date is not None:
        inspection.scheduled_date = payload.scheduled_date
    inspection.status = InspectionStatus.UPCOMING
    inspection.result = InspectionResult.PENDING
    inspection.started_at = None
    inspection.completed_at = None
    inspection.updated_at = datetime.utcnow()
    _sync_batch_status(inspection.batch)
    action = "RESCHEDULE_REOPEN" if payload.scheduled_date is not None else "REOPEN"
    log_activity(
        db,
        "inspections",
        inspection.id,
        action,
        current_user,
        {
            "previous_status": InspectionStatus.CLOSED.value,
            "status": InspectionStatus.UPCOMING.value,
            "previous_scheduled_date": previous_schedule,
            "scheduled_date": inspection.scheduled_date,
            "batch_id": inspection.batch_id,
        },
    )
    db.commit()
    db.refresh(inspection)
    return _inspection_response(inspection)


@router.post("/instant", status_code=status.HTTP_201_CREATED)
def create_instant_inspection(
    payload: InstantInspectionCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Any:
    require_module_permission(current_user, "inspections", "add")

    facility = (
        db.query(Facility)
        .options(joinedload(Facility.tier), joinedload(Facility.facility_tiers).joinedload(FacilityTier.tier))
        .filter(Facility.id == payload.facility_id)
        .first()
    )
    if not facility:
        raise HTTPException(status_code=404, detail="Facility not found")
    require_facility_access(db, current_user, payload.facility_id)

    equipment_query = (
        db.query(Equipment)
        .options(joinedload(Equipment.tier), joinedload(Equipment.modality), joinedload(Equipment.facility))
        .filter(Equipment.facility_id == payload.facility_id)
    )
    if payload.equipment_ids:
        equipment_query = equipment_query.filter(Equipment.id.in_(payload.equipment_ids))
    equipment_items = equipment_query.order_by(Equipment.asset_tag.asc()).all()
    if not equipment_items:
        raise HTTPException(status_code=400, detail="No facility assets found for inspection")

    form = _get_default_form(db)
    batch = InspectionBatch(
        batch_number=_next_batch_number(db),
        facility_id=facility.id,
        inspector_id=current_user.id,
        form_template_id=form.id,
        status=InspectionStatus.IN_PROGRESS,
        scheduled_date=payload.scheduled_date or datetime.utcnow(),
        started_at=datetime.utcnow(),
        inspection_frequency=payload.frequency,
        inspection_scope="facility_assets",
        notes=payload.notes,
        is_instant=True,
    )
    db.add(batch)
    db.flush()
    created: list[Inspection] = []
    for index, equipment in enumerate(equipment_items, start=1):
        inspection = Inspection(
            inspection_number=_batch_asset_number(batch.batch_number, index),
            batch_id=batch.id,
            equipment_id=equipment.id,
            inventory_part_id=None,
            facility_id=facility.id,
            inspector_id=current_user.id,
            form_template_id=equipment.inspection_form_id or form.id,
            status=InspectionStatus.IN_PROGRESS,
            result=InspectionResult.PENDING,
            scheduled_date=payload.scheduled_date or datetime.utcnow(),
            started_at=datetime.utcnow(),
            inspection_scope="facility_assets",
            inspection_frequency=payload.frequency,
            compliance_requirement="On-demand facility asset inspection",
            criticality="instant" if payload.frequency == "instant" else payload.frequency,
            corrective_actions=payload.notes,
            is_instant=True,
        )
        db.add(inspection)
        db.flush()
        log_activity(db, "inspections", inspection.id, "INITIATE", current_user, {"equipment_id": equipment.id})
        created.append(inspection)

    notify_facility_users(
        db,
        facility_id=facility.id,
        title="Inspection initiated",
        message=f"{len(created)} inspection(s) were started for {facility.name}.",
        notification_type="inspection",
        link_url="/inspections",
        actor_id=current_user.id,
    )
    db.commit()

    db.refresh(batch)
    return {"items": [_batch_response(batch, include_assets=True)], "total": 1}


@router.put("/{inspection_id}/complete")
def complete_inspection(
    inspection_id: int,
    payload: InspectionComplete,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Any:
    require_module_permission(current_user, "inspections", "edit")

    inspection = (
        db.query(Inspection)
        .options(
            joinedload(Inspection.facility).joinedload(Facility.tier),
            joinedload(Inspection.facility).joinedload(Facility.facility_tiers).joinedload(FacilityTier.tier),
            joinedload(Inspection.inventory_part).joinedload(InventoryPart.tier),
            joinedload(Inspection.equipment).joinedload(Equipment.tier),
            joinedload(Inspection.inspector),
            joinedload(Inspection.batch),
        )
        .filter(Inspection.id == inspection_id)
        .first()
    )
    if not inspection:
        raise HTTPException(status_code=404, detail="Inspection not found")
    require_facility_access(db, current_user, inspection.facility_id)
    if inspection.batch_id:
        _require_batch_invoice_mutable(
            _lock_active_batch_invoice(db, inspection.batch_id),
            action="Inspection reports cannot be changed",
        )
    if payload.form_template_id is not None:
        if not db.query(InspectionForm.id).filter(InspectionForm.id == payload.form_template_id).first():
            raise HTTPException(status_code=404, detail="Inspection form not found")
        inspection.form_template_id = payload.form_template_id

    inspection.status = InspectionStatus.COMPLETED
    inspection.result = payload.result
    inspection.form_data = payload.form_data
    inspection.corrective_actions = payload.corrective_actions
    inspection.completed_at = datetime.utcnow()
    inspection.updated_at = datetime.utcnow()
    if not inspection.inspector_id:
        inspection.inspector_id = current_user.id
    if inspection.equipment:
        inspection.equipment.last_pm_date = inspection.completed_at.date()
        inspection.equipment.next_generated_pm_date = next_inspection_date(
            inspection.equipment.last_pm_date,
            inspection.equipment.pm_scheduling,
        )
    _sync_batch_status(inspection.batch)
    _refresh_existing_batch_invoice_if_complete(db, inspection.batch, current_user)

    log_activity(
        db,
        "inspections",
        inspection.id,
        "COMPLETE",
        current_user,
        {"result": payload.result.value, "inventory_part_id": inspection.inventory_part_id},
    )
    notify_admins(
        db,
        title="Inspection completed",
        message=f"{inspection.inspection_number} was completed.",
        notification_type="inspection",
        link_url="/inspections",
        actor_id=current_user.id,
    )
    db.commit()
    db.refresh(inspection)
    return _inspection_response(inspection)


@router.put("/{inspection_id}/report")
def save_inspection_report(
    inspection_id: int,
    payload: InspectionReportUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Any:
    require_module_permission(current_user, "inspections", "edit")

    inspection = (
        db.query(Inspection)
        .options(
            joinedload(Inspection.facility).joinedload(Facility.tier),
            joinedload(Inspection.facility).joinedload(Facility.facility_tiers).joinedload(FacilityTier.tier),
            joinedload(Inspection.inventory_part).joinedload(InventoryPart.tier),
            joinedload(Inspection.equipment).joinedload(Equipment.tier),
            joinedload(Inspection.inspector),
            joinedload(Inspection.batch),
        )
        .filter(Inspection.id == inspection_id)
        .first()
    )
    if not inspection:
        raise HTTPException(status_code=404, detail="Inspection not found")
    require_facility_access(db, current_user, inspection.facility_id)
    if inspection.batch_id:
        _require_batch_invoice_mutable(
            _lock_active_batch_invoice(db, inspection.batch_id),
            action="Inspection reports cannot be changed",
        )
    if payload.form_template_id is not None:
        if not db.query(InspectionForm.id).filter(InspectionForm.id == payload.form_template_id).first():
            raise HTTPException(status_code=404, detail="Inspection form not found")
        inspection.form_template_id = payload.form_template_id

    inspection.form_data = payload.form_data
    inspection.corrective_actions = payload.corrective_actions
    inspection.updated_at = datetime.utcnow()
    if not inspection.inspector_id:
        inspection.inspector_id = current_user.id

    if payload.status == InspectionStatus.IN_PROGRESS:
        inspection.status = InspectionStatus.IN_PROGRESS
        inspection.result = InspectionResult.PENDING
        inspection.completed_at = None
        if not inspection.started_at:
            inspection.started_at = datetime.utcnow()
        existing_invoice = db.query(Invoice).filter(Invoice.inspection_id == inspection.id).first()
        if existing_invoice:
            existing_invoice.status = InvoiceStatus.CANCELLED
            existing_invoice.updated_at = datetime.utcnow()
        log_payload = {"status": "in_progress", "previous_result": _value(inspection.result)}
    elif payload.status == InspectionStatus.COMPLETED:
        inspection.status = InspectionStatus.COMPLETED
        inspection.result = payload.result
        inspection.completed_at = datetime.utcnow()
        if inspection.equipment:
            inspection.equipment.last_pm_date = inspection.completed_at.date()
            inspection.equipment.next_generated_pm_date = next_inspection_date(
                inspection.equipment.last_pm_date,
                inspection.equipment.pm_scheduling,
            )
        log_payload = {"status": "completed", "result": payload.result.value}
    else:
        raise HTTPException(status_code=400, detail="Report can only be saved as completed or in progress")

    _sync_batch_status(inspection.batch)
    if payload.status == InspectionStatus.COMPLETED:
        _refresh_existing_batch_invoice_if_complete(db, inspection.batch, current_user)
    log_activity(db, "inspections", inspection.id, "SAVE_REPORT", current_user, log_payload)
    db.commit()
    db.refresh(inspection)
    return _inspection_response(inspection)


@router.post("/{inspection_id}/invoice")
def generate_inspection_invoice(
    inspection_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Any:
    require_module_permission(current_user, "inspections", "edit")

    inspection = (
        db.query(Inspection)
        .options(
            joinedload(Inspection.facility).joinedload(Facility.tier),
            joinedload(Inspection.facility).joinedload(Facility.facility_tiers).joinedload(FacilityTier.tier),
            joinedload(Inspection.inventory_part).joinedload(InventoryPart.tier),
            joinedload(Inspection.equipment).joinedload(Equipment.tier),
            joinedload(Inspection.inspector),
            joinedload(Inspection.batch),
        )
        .filter(Inspection.id == inspection_id)
        .first()
    )
    if not inspection:
        raise HTTPException(status_code=404, detail="Inspection not found")
    require_facility_access(db, current_user, inspection.facility_id)

    if inspection.batch_id:
        batch_invoice = (
            db.query(Invoice.id)
            .filter(
                Invoice.invoice_type == InvoiceType.INSPECTION,
                Invoice.inspection_batch_id == inspection.batch_id,
                Invoice.status != InvoiceStatus.CANCELLED,
            )
            .first()
        )
        if batch_invoice:
            raise HTTPException(status_code=400, detail="A batch invoice already exists for this inspection's batch")

    payload = _invoice_payload_from_completed_inspection(inspection)
    invoice = _create_inspection_invoice(db, inspection, payload, current_user)
    log_activity(db, "inspections", inspection.id, "GENERATE_INVOICE", current_user, {"invoice_id": invoice.id})
    db.commit()
    db.refresh(invoice)
    invoice._batch_items = []
    return {
        **_invoice_response(invoice),
        "inspection_number": inspection.inspection_number,
        "inventory_part_name": _part_name(inspection.inventory_part) if inspection.inventory_part else _equipment_name(inspection.equipment),
        "inspector_name": inspection.inspector.full_name if inspection.inspector else None,
    }


@router.post("/batches/{batch_id}/invoice")
def generate_inspection_batch_invoice(
    batch_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Any:
    require_module_permission(current_user, "inspections", "edit")

    batch = (
        db.query(InspectionBatch)
        .options(
            joinedload(InspectionBatch.facility).joinedload(Facility.tier),
            joinedload(InspectionBatch.facility).joinedload(Facility.facility_tiers).joinedload(FacilityTier.tier),
            joinedload(InspectionBatch.inspections).joinedload(Inspection.facility).joinedload(Facility.tier),
            joinedload(InspectionBatch.inspections).joinedload(Inspection.facility).joinedload(Facility.facility_tiers).joinedload(FacilityTier.tier),
            joinedload(InspectionBatch.inspections).joinedload(Inspection.inventory_part).joinedload(InventoryPart.tier),
            joinedload(InspectionBatch.inspections).joinedload(Inspection.equipment).joinedload(Equipment.tier),
            joinedload(InspectionBatch.inspections).joinedload(Inspection.inspector),
        )
        .filter(InspectionBatch.id == batch_id)
        .first()
    )
    if not batch:
        raise HTTPException(status_code=404, detail="Inspection batch not found")
    require_facility_access(db, current_user, batch.facility_id)

    invoice = _create_inspection_batch_invoice(db, batch, current_user)
    invoice._batch_items = _batch_invoice_line_items(batch)
    log_activity(db, "inspections", batch.id, "GENERATE_BATCH_INVOICE", current_user, {"invoice_id": invoice.id})
    db.commit()
    db.refresh(invoice)
    invoice._batch_items = _batch_invoice_line_items(batch)
    return {
        **_invoice_response(invoice),
        "inspection_number": batch.batch_number,
        "inventory_part_name": f"{len(batch.inspections or [])} asset inspection batch",
        "inspector_name": batch.inspector.full_name if batch.inspector else None,
    }


@router.get("/quotations")
def list_inspection_quotations(
    db: Session = Depends(get_db),
    invoice_id: Optional[int] = Query(None),
    search: Optional[str] = Query(None),
    search_field: Optional[str] = Query(None),
    status_filter: Optional[str] = Query(None),
    balance_filter: Optional[str] = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(25, ge=1, le=100),
    current_user: User = Depends(get_current_user),
) -> Any:
    query = (
        scope_query_to_user_facilities(db.query(Invoice), Invoice.facility_id, db, current_user)
        .filter(Invoice.invoice_type == InvoiceType.INSPECTION)
    )
    query = scope_invoice_approval_visibility(query, current_user)
    if invoice_id is not None:
        query = query.filter(Invoice.id == invoice_id)
    search_term = normalize_list_search(search)
    if search_term:
        normalized_value = search_term.lower().replace("-", "_").replace(" ", "_")
        searched_date = parsed_date_value(search_term)
        search_by_field = {
            "billing_number": [contains_ci(Invoice.invoice_number, search_term)],
            "related_number": [
                contains_ci(Inspection.inspection_number, search_term),
                contains_ci(InspectionBatch.batch_number, search_term),
            ],
            "facility_customer": [
                contains_ci(Facility.name, search_term),
                contains_ci(Invoice.customer_name, search_term),
                contains_ci(Invoice.customer_email, search_term),
            ],
            "total": [value_contains_ci(Invoice.total_amount, search_term)],
            "paid": [value_contains_ci(Invoice.amount_paid, search_term)],
            "balance": [value_contains_ci(Invoice.balance_due, search_term)],
            "status": [value_contains_ci(Invoice.status, normalized_value)],
            "due": [
                value_contains_ci(Invoice.issue_date, search_term),
                value_contains_ci(Invoice.due_date, search_term),
            ],
            "description": [
                contains_ci(Invoice.notes, search_term),
                contains_ci(Invoice.payment_method, normalized_value),
            ],
        }
        if searched_date:
            search_by_field["due"].extend(
                [Invoice.issue_date == searched_date, Invoice.due_date == searched_date]
            )
        query = (
            query
            .outerjoin(Facility, Invoice.facility_id == Facility.id)
            .outerjoin(Inspection, Invoice.inspection_id == Inspection.id)
            .outerjoin(InspectionBatch, Invoice.inspection_batch_id == InspectionBatch.id)
            .filter(or_(*predicates_for_field(search_field, search_by_field)))
        )

    # Keep the KPI summary consistent with the existing UI: it reflects the
    # selected source/search, while status and balance controls only narrow the
    # table below it.
    summary_row = (
        query.with_entities(
            func.coalesce(func.sum(Invoice.balance_due), 0),
            func.coalesce(func.sum(Invoice.amount_paid), 0),
            func.coalesce(func.sum(Invoice.total_amount), 0),
            func.count(Invoice.id),
        )
        .order_by(None)
        .one()
    )

    normalized_status = (status_filter or "").strip().lower()
    if normalized_status == "billing_pending":
        query = query.filter(Invoice.billing_approval_status == "pending")
    elif normalized_status == "approved":
        query = query.filter(Invoice.billing_approval_status == BILLING_APPROVAL_APPROVED)
    elif normalized_status:
        try:
            query = query.filter(Invoice.status == InvoiceStatus(normalized_status))
        except ValueError as exc:
            raise HTTPException(status_code=422, detail="Unsupported invoice status filter") from exc

    normalized_balance = (balance_filter or "").strip().lower()
    if normalized_balance == "outstanding":
        query = query.filter(
            Invoice.balance_due > 0,
            Invoice.status != InvoiceStatus.CANCELLED,
        )
    elif normalized_balance == "paid":
        query = query.filter(
            or_(
                Invoice.status == InvoiceStatus.PAID,
                Invoice.balance_due <= 0,
            )
        )
    elif normalized_balance:
        raise HTTPException(status_code=422, detail="Unsupported invoice balance filter")

    total = query.count()
    include_details = invoice_id is not None
    load_options = [
        joinedload(Invoice.facility),
        joinedload(Invoice.approved_for_billing_by),
        selectinload(Invoice.transactions).joinedload(InvoiceTransaction.created_by),
        joinedload(Invoice.inspection).joinedload(Inspection.inventory_part),
        joinedload(Invoice.inspection).joinedload(Inspection.equipment),
        joinedload(Invoice.inspection).joinedload(Inspection.inspector),
    ]
    if include_details:
        load_options.extend([
            selectinload(Invoice.inspection_batch)
            .selectinload(InspectionBatch.inspections)
            .joinedload(Inspection.inventory_part)
            .joinedload(InventoryPart.tier),
            selectinload(Invoice.inspection_batch)
            .selectinload(InspectionBatch.inspections)
            .joinedload(Inspection.equipment)
            .joinedload(Equipment.tier),
            selectinload(Invoice.inspection_batch)
            .selectinload(InspectionBatch.inspections)
            .joinedload(Inspection.facility)
            .joinedload(Facility.tier),
        ])
    else:
        load_options.append(joinedload(Invoice.inspection_batch))
    invoices = (
        query.options(*load_options)
        .order_by(Invoice.created_at.desc())
        .offset(skip)
        .limit(limit)
        .all()
    )
    batch_counts = _batch_counts(
        db,
        [invoice.inspection_batch_id for invoice in invoices if invoice.inspection_batch_id],
    )
    for invoice in invoices:
        if invoice.inspection_batch_id:
            invoice._batch_asset_count = batch_counts.get(
                invoice.inspection_batch_id, {}
            ).get("total", 0)
            invoice._batch_items = (
                _batch_invoice_items_for_listing(invoice)
                if include_details
                else _stored_batch_invoice_items(invoice.notes)
            )
    return {
        "items": [
            {
                **_invoice_response(invoice),
                "inspection_number": invoice.inspection.inspection_number if invoice.inspection else None,
                "inspection_batch_number": invoice.inspection_batch.batch_number if invoice.inspection_batch else None,
                "batch_asset_count": getattr(invoice, "_batch_asset_count", None),
                "batch_items": getattr(invoice, "_batch_items", []),
                "inventory_part_name": (
                    _part_name(invoice.inspection.inventory_part)
                    if invoice.inspection and invoice.inspection.inventory_part
                    else _equipment_name(invoice.inspection.equipment)
                    if invoice.inspection and invoice.inspection.equipment
                    else f"{getattr(invoice, '_batch_asset_count', 0)} asset inspection batch"
                    if invoice.inspection_batch
                    else None
                ),
                "inspector_name": invoice.inspection.inspector.full_name if invoice.inspection and invoice.inspection.inspector else None,
            }
            for invoice in invoices
        ],
        "total": total,
        "skip": skip,
        "limit": limit,
        "summary": {
            "outstanding": float(summary_row[0] or 0),
            "paid": float(summary_row[1] or 0),
            "total": float(summary_row[2] or 0),
            "count": int(summary_row[3] or 0),
        },
    }


@router.put("/invoices/{invoice_id}")
def update_inspection_invoice(
    invoice_id: int,
    payload: InspectionInvoiceUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Any:
    can_edit_inspection_invoice = has_module_permission(current_user, "inspections", "edit")
    can_update_billing_payment = has_module_permission(current_user, "billing", "edit")
    if not (can_edit_inspection_invoice or can_update_billing_payment):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Insufficient permission: inspections.edit or billing.edit",
        )

    invoice = (
        db.query(Invoice)
        .options(
            joinedload(Invoice.facility),
            joinedload(Invoice.inspection),
            joinedload(Invoice.approved_for_billing_by),
            joinedload(Invoice.transactions),
        )
        .filter(Invoice.id == invoice_id, Invoice.invoice_type == InvoiceType.INSPECTION)
        .with_for_update(of=Invoice)
        .first()
    )
    if not invoice:
        raise HTTPException(status_code=404, detail="Inspection invoice not found")
    require_facility_access(db, current_user, invoice.facility_id)

    before = {c.name: getattr(invoice, c.name) for c in invoice.__table__.columns}
    previous_paid = invoice.amount_paid
    previous_status = invoice.status
    update_data = payload.model_dump(exclude_unset=True)
    internal_editor = is_invoice_approver(current_user)
    facility_payer = is_facility_billing_user(current_user)
    if not (internal_editor or facility_payer):
        raise HTTPException(status_code=403, detail="Not authorized to update this invoice")

    ensure_financial_edit_allowed(invoice, update_data)
    financial_edit = has_financial_edits(invoice, update_data)
    requested_paid = _money(update_data.get("amount_paid", invoice.amount_paid))
    validate_requested_payment_status(invoice, update_data, requested_paid)
    if requested_paid != _money(invoice.amount_paid):
        require_invoice_approved(invoice)
        require_invoice_payer(current_user)
    if facility_payer:
        require_invoice_approved(invoice)
        customer_fields = {"amount_paid", "status", "payment_method", "notes"}
        if set(update_data) - customer_fields:
            raise HTTPException(
                status_code=403,
                detail="Facility users can pay invoices but cannot edit invoice contents",
            )
        if requested_paid < _money(invoice.amount_paid):
            raise HTTPException(status_code=400, detail="Recorded payments cannot be reduced")
        if requested_paid > _money(invoice.total_amount):
            raise HTTPException(status_code=400, detail="Payment cannot exceed the invoice total")
        update_data.pop("status", None)
    if not can_edit_inspection_invoice:
        billing_only_fields = {
            "customer_name", "customer_email", "customer_phone", "customer_address",
            "subtotal", "tax_amount", "discount_amount", "total_amount",
            "amount_paid", "issue_date", "due_date", "payment_terms", "payment_method",
            "status", "notes", "line_items", "labels", "summary_rows",
        }
        disallowed_fields = set(update_data) - billing_only_fields
        if disallowed_fields:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Billing permission can only update invoice billing fields",
            )

    # Extract fee fields before standard field assignment, preserving current fees unless explicitly changed.
    existing_travel_charges, existing_service_charges = _parse_inspection_fees(invoice.notes)
    travel_charges_raw = update_data.pop("travel_charges", None)
    service_charges_raw = update_data.pop("service_charges", None)
    travel_charges = _money(travel_charges_raw) if travel_charges_raw is not None else _money(existing_travel_charges)
    service_charges = _money(service_charges_raw) if service_charges_raw is not None else _money(existing_service_charges)
    existing_metadata = parse_invoice_edit_metadata(invoice.notes)
    if "line_items" in update_data:
        existing_metadata["line_items"] = update_data.pop("line_items") or []
    if "labels" in update_data:
        existing_metadata["labels"] = update_data.pop("labels") or {}
    if "summary_rows" in update_data:
        existing_metadata["summary_rows"] = update_data.pop("summary_rows") or []

    for field in [
        "customer_name", "customer_email", "customer_phone", "customer_address",
        "subtotal", "tax_amount", "discount_amount", "amount_paid",
        "issue_date", "due_date", "payment_terms", "payment_method", "status",
    ]:
        if field in update_data:
            setattr(invoice, field, update_data[field])

    # Rebuild notes with fee prefix if any fee is set
    user_notes = update_data.get("notes", _strip_inspection_fee_prefix(invoice.notes)) or ""
    if travel_charges > Decimal("0") or service_charges > Decimal("0"):
        invoice.notes = compose_invoice_edit_notes(
            f"__FEES__:travel={travel_charges},service={service_charges}::{_strip_inspection_fee_prefix(invoice.notes) or ''}",
            user_notes,
            existing_metadata,
        )
    else:
        invoice.notes = compose_invoice_edit_notes(invoice.notes, user_notes, existing_metadata)

    if "total_amount" in update_data and update_data["total_amount"] is not None:
        invoice.total_amount = update_data["total_amount"]
    else:
        invoice.total_amount = (
            _money(invoice.subtotal) + travel_charges + service_charges
            + _money(invoice.tax_amount) - _money(invoice.discount_amount)
        )
    if financial_edit:
        invalidate_invoice_approval(db, invoice, current_user)

    invoice.balance_due = _money(invoice.total_amount) - _money(invoice.amount_paid)
    if invoice.balance_due <= 0:
        invoice.status = InvoiceStatus.PAID
    elif _money(invoice.amount_paid) > 0 and invoice.status != InvoiceStatus.CANCELLED:
        invoice.status = InvoiceStatus.PARTIALLY_PAID
    elif facility_payer:
        invoice.status = InvoiceStatus.PENDING
    invoice.updated_at = datetime.utcnow()
    record_payment_delta(db, invoice, previous_paid, invoice.amount_paid, current_user, invoice.payment_method, update_data.get("notes"))
    record_status_change(db, invoice, previous_status, current_user)
    db.flush()
    log_activity(db, "invoices", invoice.id, "UPDATE", current_user, {"before": before, "after": update_data})
    db.commit()
    db.refresh(invoice)
    return _invoice_response(invoice)
