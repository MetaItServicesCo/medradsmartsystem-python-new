from datetime import date, datetime, timedelta
from decimal import Decimal
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy import or_
from sqlalchemy.orm import Session, joinedload

from app.core.deps import get_current_user
from app.db.base import get_db
from app.models.facility import Facility
from app.models.facility_tier import FacilityTier
from app.models.equipment import Equipment, EquipmentStatus
from app.models.inspection import Inspection, InspectionResult, InspectionStatus
from app.models.inspection_form import InspectionForm
from app.models.inventory import InventoryPart
from app.models.invoice import Invoice, InvoiceStatus, InvoiceType
from app.models.tier import Tier
from app.models.user import User
from app.utils.logging import log_activity
from app.utils.notifications import notify_admins, notify_facility_users

router = APIRouter()


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
            "fields": ["physical_inspection", "cleaning", "display", "lubrication", "functional", "calibration", "electrical_safety", "battery", "pm_kit"],
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
    inventory_part_ids: Optional[list[int]] = None
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
    corrective_actions: Optional[str] = None
    labor_hours: Decimal = Decimal("0")
    parts_amount: Optional[Decimal] = None
    inspection_charge: Optional[Decimal] = None
    other_charges: Optional[Decimal] = None
    tax_amount: Decimal = Decimal("0")
    discount_amount: Decimal = Decimal("0")
    notes: Optional[str] = None


class InspectionInvoiceUpdate(BaseModel):
    subtotal: Optional[Decimal] = None
    tax_amount: Optional[Decimal] = None
    discount_amount: Optional[Decimal] = None
    total_amount: Optional[Decimal] = None
    amount_paid: Optional[Decimal] = None
    due_date: Optional[date] = None
    payment_terms: Optional[str] = None
    notes: Optional[str] = None
    status: Optional[InvoiceStatus] = None


def _value(value: Any) -> Any:
    if hasattr(value, "value"):
        return value.value
    return value


def _money(value: Any) -> Decimal:
    if value in (None, ""):
        return Decimal("0")
    return Decimal(str(value))


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
        return form
    form = InspectionForm(
        name=ADVANCED_REPORT_SCHEMA["title"],
        description="Facility inventory inspection report based on identity, checks, diagnostics, parts, test equipment, billing, and due dates.",
        schema=ADVANCED_REPORT_SCHEMA,
    )
    db.add(form)
    db.flush()
    return form


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
    return data


def _inspection_response(inspection: Inspection) -> dict[str, Any]:
    invoice = getattr(inspection, "_inspection_invoice", None)
    if invoice is None:
        invoice = next((item for item in getattr(inspection, "invoices", []) or []), None)
    data = {c.name: getattr(inspection, c.name) for c in inspection.__table__.columns}
    data["status"] = _value(data.get("status"))
    data["result"] = _value(data.get("result"))
    data["facility_name"] = inspection.facility.name if inspection.facility else None
    data["inventory_part_name"] = _part_name(inspection.inventory_part) if inspection.inventory_part else None
    data["equipment_name"] = _equipment_name(inspection.equipment) if inspection.equipment else None
    data["asset_name"] = data["inventory_part_name"] or data["equipment_name"] or "Inspection asset"
    data["part_number"] = inspection.inventory_part.part_number if inspection.inventory_part else None
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
    data["invoice"] = _invoice_response(invoice)
    return data


def _create_inspection_invoice(
    db: Session,
    inspection: Inspection,
    complete_in: InspectionComplete,
) -> Invoice:
    existing = db.query(Invoice).filter(Invoice.inspection_id == inspection.id).first()
    if existing:
        return existing

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
        tax_amount=complete_in.tax_amount,
        discount_amount=complete_in.discount_amount,
        total_amount=total,
        amount_paid=Decimal("0"),
        balance_due=total,
        status=InvoiceStatus.PENDING,
        issue_date=date.today(),
        due_date=date.today() + timedelta(days=30),
        payment_terms="Net 30",
        notes=complete_in.notes
        or f"Inspection invoice for {_part_name(part) if part else _equipment_name(equipment)}. Tier: {tier.name if tier else 'No tier assigned'}.",
    )
    db.add(invoice)
    db.flush()
    inspection.quotation_notes = invoice.notes
    return invoice


@router.get("/report-template")
def get_report_template(current_user: User = Depends(get_current_user)) -> Any:
    return ADVANCED_REPORT_SCHEMA


@router.get("/forms")
def list_inspection_forms(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Any:
    form = _get_default_form(db)
    forms = db.query(InspectionForm).order_by(InspectionForm.name.asc()).all()
    if form not in forms:
        forms.append(form)
    return {
        "items": [
            {
                "id": item.id,
                "name": item.name,
                "description": item.description,
                "created_at": item.created_at,
                "updated_at": item.updated_at,
            }
            for item in forms
        ],
        "total": len(forms),
    }


@router.get("/facilities")
def inspection_facilities(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Any:
    facilities = (
        db.query(Facility)
        .options(
            joinedload(Facility.tier),
            joinedload(Facility.inventory_parts),
            joinedload(Facility.facility_tiers).joinedload(FacilityTier.tier),
        )
        .order_by(Facility.name.asc())
        .all()
    )
    return [
        {
            "id": facility.id,
            "name": facility.name,
            "city": facility.city,
            "state": facility.state,
            "tier_name": facility.tier.name if facility.tier else None,
            "inventory_count": len(facility.inventory_parts or []),
        }
        for facility in facilities
    ]


@router.get("/facilities/{facility_id}/inventory")
def facility_inventory_for_inspection(
    facility_id: int,
    db: Session = Depends(get_db),
    search: Optional[str] = Query(None),
    current_user: User = Depends(get_current_user),
) -> Any:
    query = (
        db.query(InventoryPart)
        .options(joinedload(InventoryPart.facility), joinedload(InventoryPart.tier))
        .filter(InventoryPart.facility_id == facility_id)
    )
    if search:
        query = query.filter(
            or_(
                InventoryPart.part_number.ilike(f"%{search}%"),
                InventoryPart.description.ilike(f"%{search}%"),
                InventoryPart.make.ilike(f"%{search}%"),
                InventoryPart.model.ilike(f"%{search}%"),
                InventoryPart.serial_number.ilike(f"%{search}%"),
            )
        )
    parts = query.order_by(InventoryPart.part_number.asc()).all()
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
            "is_critical": part.is_critical,
            "status": part.status,
        }
        for part in parts
    ]


@router.get("/facilities/{facility_id}/equipment")
def facility_equipment_for_inspection(
    facility_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Any:
    equipment = (
        db.query(Equipment)
        .options(joinedload(Equipment.facility), joinedload(Equipment.tier), joinedload(Equipment.modality))
        .filter(Equipment.facility_id == facility_id)
        .order_by(Equipment.asset_tag.asc())
        .all()
    )
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


@router.get("/")
def list_inspections(
    db: Session = Depends(get_db),
    status_filter: Optional[InspectionStatus] = Query(None, alias="status"),
    facility_id: Optional[int] = Query(None),
    current_user: User = Depends(get_current_user),
) -> Any:
    query = (
        db.query(Inspection)
        .options(
            joinedload(Inspection.facility).joinedload(Facility.tier),
            joinedload(Inspection.facility).joinedload(Facility.facility_tiers).joinedload(FacilityTier.tier),
            joinedload(Inspection.inventory_part).joinedload(InventoryPart.tier),
            joinedload(Inspection.equipment).joinedload(Equipment.tier),
            joinedload(Inspection.inspector),
        )
    )
    if status_filter:
        query = query.filter(Inspection.status == status_filter)
    if facility_id:
        query = query.filter(Inspection.facility_id == facility_id)

    inspections = query.order_by(Inspection.created_at.desc()).all()
    invoice_map = {
        invoice.inspection_id: invoice
        for invoice in db.query(Invoice).filter(Invoice.inspection_id.in_([item.id for item in inspections])).all()
        if invoice.inspection_id
    }
    for inspection in inspections:
        inspection._inspection_invoice = invoice_map.get(inspection.id)
    return {"items": [_inspection_response(item) for item in inspections], "total": len(inspections)}


@router.post("/schedule", status_code=status.HTTP_201_CREATED)
def schedule_inspections(
    payload: InspectionScheduleCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Any:
    facility = db.query(Facility).filter(Facility.id == payload.facility_id).first()
    if not facility:
        raise HTTPException(status_code=404, detail="Facility not found")

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
    created: list[Inspection] = []
    for equipment in equipment_items:
        criticality = payload.criticality or _equipment_criticality(equipment)
        inspection = Inspection(
            inspection_number=_next_inspection_number(db),
            equipment_id=equipment.id,
            inventory_part_id=None,
            facility_id=facility.id,
            inspector_id=current_user.id,
            form_template_id=form.id,
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
    return {"items": [_inspection_response(item) for item in created], "total": len(created)}


@router.post("/generate-upcoming", status_code=status.HTTP_201_CREATED)
def generate_upcoming_inspections(
    payload: UpcomingGenerationRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Any:
    horizon = datetime.utcnow() + timedelta(days=max(payload.days_ahead, 1))
    query = (
        db.query(Equipment)
        .options(joinedload(Equipment.tier), joinedload(Equipment.modality), joinedload(Equipment.facility))
        .filter(Equipment.status == EquipmentStatus.ACTIVE)
    )
    if payload.facility_id:
        query = query.filter(Equipment.facility_id == payload.facility_id)

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
        frequency = _frequency_for_criticality(criticality)
        last_completed = (
            db.query(Inspection)
            .filter(Inspection.equipment_id == equipment.id, Inspection.status == InspectionStatus.COMPLETED)
            .order_by(Inspection.completed_at.desc())
            .first()
        )
        base_date = last_completed.completed_at if last_completed and last_completed.completed_at else datetime.utcnow()
        due_date = base_date + timedelta(days=_frequency_days(frequency))
        if due_date > horizon:
            continue

        inspection = Inspection(
            inspection_number=_next_inspection_number(db),
            equipment_id=equipment.id,
            facility_id=equipment.facility_id,
            inspector_id=current_user.id,
            form_template_id=form.id,
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
    inspection = (
        db.query(Inspection)
        .options(
            joinedload(Inspection.facility).joinedload(Facility.tier),
            joinedload(Inspection.inventory_part).joinedload(InventoryPart.tier),
            joinedload(Inspection.equipment).joinedload(Equipment.tier),
            joinedload(Inspection.inspector),
        )
        .filter(Inspection.id == inspection_id)
        .first()
    )
    if not inspection:
        raise HTTPException(status_code=404, detail="Inspection not found")
    if inspection.status != InspectionStatus.UPCOMING:
        raise HTTPException(status_code=400, detail="Only upcoming inspections can be started")

    inspection.status = InspectionStatus.IN_PROGRESS
    inspection.started_at = datetime.utcnow()
    inspection.inspector_id = current_user.id
    inspection.updated_at = datetime.utcnow()
    log_activity(db, "inspections", inspection.id, "START", current_user, {"status": "in_progress"})
    db.commit()
    db.refresh(inspection)
    return _inspection_response(inspection)


@router.post("/instant", status_code=status.HTTP_201_CREATED)
def create_instant_inspection(
    payload: InstantInspectionCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Any:
    facility = (
        db.query(Facility)
        .options(joinedload(Facility.tier), joinedload(Facility.facility_tiers).joinedload(FacilityTier.tier))
        .filter(Facility.id == payload.facility_id)
        .first()
    )
    if not facility:
        raise HTTPException(status_code=404, detail="Facility not found")

    parts_query = (
        db.query(InventoryPart)
        .options(joinedload(InventoryPart.tier), joinedload(InventoryPart.facility))
        .filter(InventoryPart.facility_id == payload.facility_id)
    )
    if payload.inventory_part_ids:
        parts_query = parts_query.filter(InventoryPart.id.in_(payload.inventory_part_ids))
    parts = parts_query.order_by(InventoryPart.part_number.asc()).all()
    if not parts:
        raise HTTPException(status_code=400, detail="No facility inventory items found for inspection")

    form = _get_default_form(db)
    created: list[Inspection] = []
    for part in parts:
        inspection = Inspection(
            inspection_number=_next_inspection_number(db),
            equipment_id=None,
            inventory_part_id=part.id,
            facility_id=facility.id,
            inspector_id=current_user.id,
            form_template_id=form.id,
            status=InspectionStatus.IN_PROGRESS,
            result=InspectionResult.PENDING,
            scheduled_date=payload.scheduled_date or datetime.utcnow(),
            started_at=datetime.utcnow(),
            inspection_scope="facility_inventory",
            inspection_frequency=payload.frequency,
            compliance_requirement="On-demand facility inventory inspection",
            criticality="instant" if payload.frequency == "instant" else payload.frequency,
            corrective_actions=payload.notes,
            is_instant=True,
        )
        db.add(inspection)
        db.flush()
        log_activity(db, "inspections", inspection.id, "INITIATE", current_user, {"inventory_part_id": part.id})
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

    return {"items": [_inspection_response(item) for item in created], "total": len(created)}


@router.put("/{inspection_id}/complete")
def complete_inspection(
    inspection_id: int,
    payload: InspectionComplete,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Any:
    inspection = (
        db.query(Inspection)
        .options(
            joinedload(Inspection.facility).joinedload(Facility.tier),
            joinedload(Inspection.facility).joinedload(Facility.facility_tiers).joinedload(FacilityTier.tier),
            joinedload(Inspection.inventory_part).joinedload(InventoryPart.tier),
            joinedload(Inspection.equipment).joinedload(Equipment.tier),
            joinedload(Inspection.inspector),
        )
        .filter(Inspection.id == inspection_id)
        .first()
    )
    if not inspection:
        raise HTTPException(status_code=404, detail="Inspection not found")

    inspection.status = InspectionStatus.COMPLETED
    inspection.result = payload.result
    inspection.form_data = payload.form_data
    inspection.corrective_actions = payload.corrective_actions
    inspection.completed_at = datetime.utcnow()
    inspection.updated_at = datetime.utcnow()
    if not inspection.inspector_id:
        inspection.inspector_id = current_user.id

    invoice = _create_inspection_invoice(db, inspection, payload)
    log_activity(
        db,
        "inspections",
        inspection.id,
        "COMPLETE",
        current_user,
        {"result": payload.result.value, "invoice_id": invoice.id, "inventory_part_id": inspection.inventory_part_id},
    )
    notify_admins(
        db,
        title="Inspection completed",
        message=f"{inspection.inspection_number} was completed and invoice {invoice.invoice_number} was generated.",
        notification_type="inspection",
        link_url="/inspections",
        actor_id=current_user.id,
    )
    db.commit()
    db.refresh(inspection)
    inspection._inspection_invoice = invoice
    return _inspection_response(inspection)


@router.get("/quotations")
def list_inspection_quotations(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Any:
    invoices = (
        db.query(Invoice)
        .options(
            joinedload(Invoice.facility),
            joinedload(Invoice.inspection).joinedload(Inspection.inventory_part),
            joinedload(Invoice.inspection).joinedload(Inspection.equipment),
            joinedload(Invoice.inspection).joinedload(Inspection.inspector),
        )
        .filter(Invoice.invoice_type == InvoiceType.INSPECTION)
        .order_by(Invoice.created_at.desc())
        .all()
    )
    return {
        "items": [
            {
                **_invoice_response(invoice),
                "inspection_number": invoice.inspection.inspection_number if invoice.inspection else None,
                "inventory_part_name": (
                    _part_name(invoice.inspection.inventory_part)
                    if invoice.inspection and invoice.inspection.inventory_part
                    else _equipment_name(invoice.inspection.equipment)
                    if invoice.inspection and invoice.inspection.equipment
                    else None
                ),
                "inspector_name": invoice.inspection.inspector.full_name if invoice.inspection and invoice.inspection.inspector else None,
            }
            for invoice in invoices
        ],
        "total": len(invoices),
    }


@router.put("/invoices/{invoice_id}")
def update_inspection_invoice(
    invoice_id: int,
    payload: InspectionInvoiceUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Any:
    invoice = (
        db.query(Invoice)
        .options(joinedload(Invoice.facility), joinedload(Invoice.inspection))
        .filter(Invoice.id == invoice_id, Invoice.invoice_type == InvoiceType.INSPECTION)
        .first()
    )
    if not invoice:
        raise HTTPException(status_code=404, detail="Inspection invoice not found")

    before = {c.name: getattr(invoice, c.name) for c in invoice.__table__.columns}
    update_data = payload.model_dump(exclude_unset=True)
    for field in ["subtotal", "tax_amount", "discount_amount", "amount_paid", "due_date", "payment_terms", "notes", "status"]:
        if field in update_data:
            setattr(invoice, field, update_data[field])

    if "total_amount" in update_data and update_data["total_amount"] is not None:
        invoice.total_amount = update_data["total_amount"]
    else:
        invoice.total_amount = _money(invoice.subtotal) + _money(invoice.tax_amount) - _money(invoice.discount_amount)

    invoice.balance_due = _money(invoice.total_amount) - _money(invoice.amount_paid)
    invoice.updated_at = datetime.utcnow()
    db.flush()
    log_activity(db, "invoices", invoice.id, "UPDATE", current_user, {"before": before, "after": update_data})
    db.commit()
    db.refresh(invoice)
    return _invoice_response(invoice)
