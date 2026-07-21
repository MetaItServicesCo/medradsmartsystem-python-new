from __future__ import annotations

from datetime import date, datetime, time
from decimal import Decimal
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import or_
from sqlalchemy.orm import Session, joinedload

from app.core.deps import get_current_user
from app.db.base import get_db
from app.models.equipment import Equipment
from app.models.facility import Facility
from app.models.inspection import Inspection, InspectionStatus
from app.models.inventory import InventoryPart
from app.models.invoice import Invoice, InvoiceType
from app.models.service_request import ServiceRequest, ServiceRequestStatus
from app.models.user import User, UserRole
from app.utils.facility_access import scope_query_to_user_facilities
from app.utils.permission_deps import require_module_access

router = APIRouter(dependencies=[Depends(require_module_access("reports"))])


def _value(value: Any) -> Any:
    return value.value if hasattr(value, "value") else value


def _money(value: Any) -> float:
    if value in (None, ""):
        return 0.0
    return float(Decimal(str(value)))


def _dt(value: Any) -> Any:
    return value.isoformat() if isinstance(value, (datetime, date)) else value


def _equipment_name(equipment: Optional[Equipment]) -> Optional[str]:
    if not equipment:
        return None
    return " ".join(str(part) for part in [equipment.asset_tag, equipment.make, equipment.model] if part).strip() or None


def _part_name(part: Optional[InventoryPart]) -> Optional[str]:
    if not part:
        return None
    return " ".join(str(item) for item in [part.part_number, part.description] if item).strip() or None


def _service_session_entries(sr: ServiceRequest) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for entry in sr.history or []:
        if entry.get("action") not in {"technician_clock_out", "technician_work_session"}:
            continue
        changes = entry.get("changes") or {}
        rows.append({
            "user": entry.get("user") or (sr.assigned_technician.full_name if sr.assigned_technician else "Technician"),
            "timestamp": entry.get("timestamp"),
            "session_id": changes.get("session_id"),
            "start_time": changes.get("start_time") or changes.get("clocked_in_at"),
            "end_time": changes.get("end_time") or changes.get("clocked_out_at"),
            "break_minutes": changes.get("break_minutes"),
            "duration_hours": changes.get("duration_hours"),
            "total_mileage": changes.get("total_mileage"),
            "diagnosis": changes.get("diagnosis"),
            "work_done": changes.get("work_done"),
            "notes": changes.get("notes"),
            "test_equipment": changes.get("test_equipment") or [],
        })
    return rows


def _service_report_row(sr: ServiceRequest, invoice: Optional[Invoice] = None) -> dict[str, Any]:
    sessions = _service_session_entries(sr)
    latest_session = sessions[-1] if sessions else {}
    return {
        "id": sr.id,
        "request_number": sr.request_number,
        "facility_id": sr.facility_id,
        "facility_name": sr.facility.name if sr.facility else None,
        "equipment_id": sr.equipment_id,
        "equipment_name": _equipment_name(sr.equipment),
        "asset_tag": sr.equipment.asset_tag if sr.equipment else None,
        "serial_number": sr.equipment.serial_number if sr.equipment else None,
        "technician_id": sr.assigned_technician_id,
        "technician_name": sr.assigned_technician.full_name if sr.assigned_technician else None,
        "status": _value(sr.status),
        "priority": _value(sr.priority),
        "problem_description": sr.problem_description,
        "service_required": sr.service_required,
        "resolution_description": sr.resolution_description,
        "time_spent_hours": _money(sr.time_spent_hours),
        "total_cost": _money(sr.total_cost),
        "billing_status": sr.billing_status,
        "created_at": _dt(sr.created_at),
        "started_at": _dt(sr.started_at),
        "completed_at": _dt(sr.completed_at),
        "diagnosis": latest_session.get("diagnosis"),
        "work_done": latest_session.get("work_done"),
        "notes": latest_session.get("notes"),
        "sessions": sessions,
        "invoice": {
            "id": invoice.id,
            "invoice_number": invoice.invoice_number,
            "status": _value(invoice.status),
            "total_amount": _money(invoice.total_amount),
            "balance_due": _money(invoice.balance_due),
        } if invoice else None,
    }


def _inspection_report_row(inspection: Inspection, invoice: Optional[Invoice] = None) -> dict[str, Any]:
    asset_name = _part_name(inspection.inventory_part) if inspection.inventory_part else _equipment_name(inspection.equipment)
    serial_number = (
        inspection.inventory_part.serial_number
        if inspection.inventory_part
        else inspection.equipment.serial_number
        if inspection.equipment
        else None
    )
    make = inspection.inventory_part.make if inspection.inventory_part else inspection.equipment.make if inspection.equipment else None
    model = inspection.inventory_part.model if inspection.inventory_part else inspection.equipment.model if inspection.equipment else None
    tier_name = (
        inspection.inventory_part.tier.name
        if inspection.inventory_part and inspection.inventory_part.tier
        else inspection.equipment.tier.name
        if inspection.equipment and inspection.equipment.tier
        else inspection.facility.tier.name
        if inspection.facility and inspection.facility.tier
        else None
    )
    return {
        "id": inspection.id,
        "inspection_number": inspection.inspection_number,
        "batch_id": inspection.batch_id,
        "batch_number": inspection.batch.batch_number if inspection.batch else None,
        "facility_id": inspection.facility_id,
        "facility_name": inspection.facility.name if inspection.facility else None,
        "asset_name": asset_name or "Inspection asset",
        "equipment_name": _equipment_name(inspection.equipment) if inspection.equipment else None,
        "inventory_part_name": _part_name(inspection.inventory_part) if inspection.inventory_part else None,
        "asset_tag": inspection.equipment.asset_tag if inspection.equipment else inspection.inventory_part.part_number if inspection.inventory_part else None,
        "part_number": inspection.inventory_part.part_number if inspection.inventory_part else None,
        "serial_number": serial_number,
        "make": make,
        "model": model,
        "tier_name": tier_name,
        "technician_id": inspection.inspector_id,
        "technician_name": inspection.inspector.full_name if inspection.inspector else None,
        "status": _value(inspection.status),
        "result": _value(inspection.result),
        "form_template_id": inspection.form_template_id,
        "form_template_name": inspection.form_template.name if inspection.form_template else None,
        "scheduled_date": _dt(inspection.scheduled_date),
        "started_at": _dt(inspection.started_at),
        "completed_at": _dt(inspection.completed_at),
        "inspection_frequency": inspection.inspection_frequency,
        "compliance_requirement": inspection.compliance_requirement,
        "criticality": inspection.criticality,
        "corrective_actions": inspection.corrective_actions,
        "form_data": inspection.form_data or {},
        "invoice": {
            "id": invoice.id,
            "invoice_number": invoice.invoice_number,
            "status": _value(invoice.status),
            "total_amount": _money(invoice.total_amount),
            "balance_due": _money(invoice.balance_due),
        } if invoice else None,
    }


def _scope_service_query(query, db: Session, current_user: User):
    query = scope_query_to_user_facilities(query, ServiceRequest.facility_id, db, current_user)
    if current_user.role == UserRole.TECHNICIAN:
        query = query.filter(ServiceRequest.assigned_technician_id == current_user.id)
    elif current_user.role == UserRole.EMPLOYEE:
        query = query.filter(ServiceRequest.requester_id == current_user.id)
    return query


def _scope_inspection_query(query, db: Session, current_user: User):
    query = scope_query_to_user_facilities(query, Inspection.facility_id, db, current_user)
    if current_user.role == UserRole.TECHNICIAN:
        query = query.filter(Inspection.inspector_id == current_user.id)
    elif current_user.role == UserRole.EMPLOYEE:
        query = query.filter(False)
    return query


def _apply_service_filters(query, search: Optional[str], facility_id: Optional[int], technician_id: Optional[int], date_from: Optional[date], date_to: Optional[date]):
    if facility_id:
        query = query.filter(ServiceRequest.facility_id == facility_id)
    if technician_id:
        query = query.filter(ServiceRequest.assigned_technician_id == technician_id)
    if date_from:
        query = query.filter(ServiceRequest.completed_at >= datetime.combine(date_from, time.min))
    if date_to:
        query = query.filter(ServiceRequest.completed_at <= datetime.combine(date_to, time.max))
    if search and search.strip():
        like = f"%{search.strip()}%"
        query = (
            query.outerjoin(Facility, ServiceRequest.facility_id == Facility.id)
            .outerjoin(Equipment, ServiceRequest.equipment_id == Equipment.id)
            .outerjoin(User, ServiceRequest.assigned_technician_id == User.id)
            .filter(or_(
                ServiceRequest.request_number.ilike(like),
                ServiceRequest.problem_description.ilike(like),
                ServiceRequest.service_required.ilike(like),
                ServiceRequest.resolution_description.ilike(like),
                Facility.name.ilike(like),
                Equipment.asset_tag.ilike(like),
                Equipment.make.ilike(like),
                Equipment.model.ilike(like),
                Equipment.serial_number.ilike(like),
                User.full_name.ilike(like),
            ))
        )
    return query


def _apply_inspection_filters(query, search: Optional[str], facility_id: Optional[int], technician_id: Optional[int], result: Optional[str], date_from: Optional[date], date_to: Optional[date]):
    if facility_id:
        query = query.filter(Inspection.facility_id == facility_id)
    if technician_id:
        query = query.filter(Inspection.inspector_id == technician_id)
    if result:
        query = query.filter(Inspection.result == result)
    if date_from:
        query = query.filter(Inspection.completed_at >= datetime.combine(date_from, time.min))
    if date_to:
        query = query.filter(Inspection.completed_at <= datetime.combine(date_to, time.max))
    if search and search.strip():
        like = f"%{search.strip()}%"
        query = (
            query.outerjoin(Facility, Inspection.facility_id == Facility.id)
            .outerjoin(Equipment, Inspection.equipment_id == Equipment.id)
            .outerjoin(InventoryPart, Inspection.inventory_part_id == InventoryPart.id)
            .outerjoin(User, Inspection.inspector_id == User.id)
            .filter(or_(
                Inspection.inspection_number.ilike(like),
                Inspection.inspection_frequency.ilike(like),
                Inspection.compliance_requirement.ilike(like),
                Inspection.criticality.ilike(like),
                Facility.name.ilike(like),
                Equipment.asset_tag.ilike(like),
                Equipment.make.ilike(like),
                Equipment.model.ilike(like),
                Equipment.serial_number.ilike(like),
                InventoryPart.part_number.ilike(like),
                InventoryPart.description.ilike(like),
                InventoryPart.make.ilike(like),
                InventoryPart.model.ilike(like),
                InventoryPart.serial_number.ilike(like),
                User.full_name.ilike(like),
            ))
        )
    return query


@router.get("/summary")
def reports_summary(
    date_from: Optional[date] = Query(None),
    date_to: Optional[date] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict[str, Any]:
    if date_from and date_to and date_from > date_to:
        raise HTTPException(status_code=400, detail="From date cannot be later than To date")
    service_query = _scope_service_query(db.query(ServiceRequest), db, current_user).filter(ServiceRequest.status == ServiceRequestStatus.COMPLETED)
    inspection_query = _scope_inspection_query(db.query(Inspection), db, current_user).filter(Inspection.status == InspectionStatus.COMPLETED)
    history_query = _scope_service_query(db.query(ServiceRequest), db, current_user)
    service_query = _apply_service_filters(service_query, None, None, None, date_from, date_to)
    inspection_query = _apply_inspection_filters(inspection_query, None, None, None, None, date_from, date_to)

    history_start = datetime.combine(date_from, time.min) if date_from else None
    history_end = datetime.combine(date_to, time.max) if date_to else None
    if not history_start and not history_end:
        history_count = history_query.filter(ServiceRequest.history.isnot(None)).count()
    else:
        # Narrow candidates in SQL before inspecting the JSON ledger. A request
        # cannot contain an event before it was created or after its last update.
        if history_start:
            history_query = history_query.filter(ServiceRequest.updated_at >= history_start)
        if history_end:
            history_query = history_query.filter(ServiceRequest.created_at <= history_end)
        history_count = 0
        for (entries,) in history_query.with_entities(ServiceRequest.history).filter(ServiceRequest.history.isnot(None)).yield_per(500):
            if not entries:
                continue
            for entry in entries:
                timestamp_raw = entry.get("timestamp") if isinstance(entry, dict) else None
                if not timestamp_raw:
                    continue
                try:
                    timestamp = datetime.fromisoformat(str(timestamp_raw).replace("Z", "+00:00")).replace(tzinfo=None)
                except ValueError:
                    continue
                if history_start and timestamp < history_start:
                    continue
                if history_end and timestamp > history_end:
                    continue
                history_count += 1
                break
    return {
        "service_reports": service_query.count(),
        "inspection_reports": inspection_query.count(),
        "service_history": history_count,
    }


@router.get("/service-reports")
def get_service_reports(
    db: Session = Depends(get_db),
    search: Optional[str] = Query(None),
    facility_id: Optional[int] = Query(None),
    technician_id: Optional[int] = Query(None),
    date_from: Optional[date] = Query(None),
    date_to: Optional[date] = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(25, ge=1, le=100),
    current_user: User = Depends(get_current_user),
) -> dict[str, Any]:
    if date_from and date_to and date_from > date_to:
        raise HTTPException(status_code=400, detail="From date cannot be later than To date")
    query = (
        _scope_service_query(db.query(ServiceRequest), db, current_user)
        .options(
            joinedload(ServiceRequest.facility),
            joinedload(ServiceRequest.equipment),
            joinedload(ServiceRequest.assigned_technician),
        )
        .filter(ServiceRequest.status == ServiceRequestStatus.COMPLETED)
    )
    query = _apply_service_filters(query, search, facility_id, technician_id, date_from, date_to)
    total = query.count()
    items = query.order_by(ServiceRequest.completed_at.desc().nullslast(), ServiceRequest.id.desc()).offset(skip).limit(limit).all()
    invoice_map = {
        invoice.service_request_id: invoice
        for invoice in db.query(Invoice)
        .filter(Invoice.invoice_type == InvoiceType.SERVICE, Invoice.service_request_id.in_([item.id for item in items]))
        .all()
        if invoice.service_request_id
    } if items else {}
    return {
        "items": [_service_report_row(item, invoice_map.get(item.id)) for item in items],
        "total": total,
        "skip": skip,
        "limit": limit,
    }


@router.get("/inspection-reports")
def get_inspection_reports(
    db: Session = Depends(get_db),
    search: Optional[str] = Query(None),
    facility_id: Optional[int] = Query(None),
    technician_id: Optional[int] = Query(None),
    result: Optional[str] = Query(None),
    date_from: Optional[date] = Query(None),
    date_to: Optional[date] = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(25, ge=1, le=100),
    current_user: User = Depends(get_current_user),
) -> dict[str, Any]:
    if date_from and date_to and date_from > date_to:
        raise HTTPException(status_code=400, detail="From date cannot be later than To date")
    query = (
        _scope_inspection_query(db.query(Inspection), db, current_user)
        .options(
            joinedload(Inspection.facility).joinedload(Facility.tier),
            joinedload(Inspection.equipment).joinedload(Equipment.tier),
            joinedload(Inspection.inventory_part).joinedload(InventoryPart.tier),
            joinedload(Inspection.inspector),
            joinedload(Inspection.form_template),
            joinedload(Inspection.batch),
        )
        .filter(Inspection.status == InspectionStatus.COMPLETED)
    )
    query = _apply_inspection_filters(query, search, facility_id, technician_id, result, date_from, date_to)
    total = query.count()
    items = query.order_by(Inspection.completed_at.desc().nullslast(), Inspection.id.desc()).offset(skip).limit(limit).all()
    invoice_map = {
        invoice.inspection_id: invoice
        for invoice in db.query(Invoice)
        .filter(Invoice.invoice_type == InvoiceType.INSPECTION, Invoice.inspection_id.in_([item.id for item in items]))
        .all()
        if invoice.inspection_id
    } if items else {}
    return {
        "items": [_inspection_report_row(item, invoice_map.get(item.id)) for item in items],
        "total": total,
        "skip": skip,
        "limit": limit,
    }


@router.get("/service-history")
def get_service_request_history(
    db: Session = Depends(get_db),
    search: Optional[str] = Query(None),
    facility_id: Optional[int] = Query(None),
    technician_id: Optional[int] = Query(None),
    action: Optional[str] = Query(None),
    date_from: Optional[date] = Query(None),
    date_to: Optional[date] = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(25, ge=1, le=100),
    current_user: User = Depends(get_current_user),
) -> dict[str, Any]:
    if date_from and date_to and date_from > date_to:
        raise HTTPException(status_code=400, detail="From date cannot be later than To date")
    query = (
        _scope_service_query(db.query(ServiceRequest), db, current_user)
        .options(
            joinedload(ServiceRequest.facility),
            joinedload(ServiceRequest.equipment),
            joinedload(ServiceRequest.assigned_technician),
        )
    )
    query = _apply_service_filters(query, search, facility_id, technician_id, None, None)

    rows: list[dict[str, Any]] = []
    start_dt = datetime.combine(date_from, time.min) if date_from else None
    end_dt = datetime.combine(date_to, time.max) if date_to else None
    if start_dt:
        query = query.filter(ServiceRequest.updated_at >= start_dt)
    if end_dt:
        query = query.filter(ServiceRequest.created_at <= end_dt)
    for sr in query.order_by(ServiceRequest.updated_at.desc()).all():
        for index, entry in enumerate(sr.history or []):
            entry_action = str(entry.get("action") or "updated")
            if action and entry_action != action:
                continue
            timestamp_raw = entry.get("timestamp")
            timestamp = None
            if timestamp_raw:
                try:
                    timestamp = datetime.fromisoformat(str(timestamp_raw).replace("Z", "+00:00")).replace(tzinfo=None)
                except ValueError:
                    timestamp = None
            if (start_dt or end_dt) and timestamp is None:
                continue
            if start_dt and timestamp and timestamp < start_dt:
                continue
            if end_dt and timestamp and timestamp > end_dt:
                continue
            changes = entry.get("changes") or {}
            rows.append({
                "id": f"{sr.id}-{index}",
                "service_request_id": sr.id,
                "request_number": sr.request_number,
                "facility_id": sr.facility_id,
                "facility_name": sr.facility.name if sr.facility else None,
                "equipment_name": _equipment_name(sr.equipment),
                "technician_id": sr.assigned_technician_id,
                "technician_name": sr.assigned_technician.full_name if sr.assigned_technician else None,
                "timestamp": timestamp_raw,
                "action": entry_action,
                "user": entry.get("user"),
                "changes": changes,
                "summary": changes.get("notes") or changes.get("work_done") or changes.get("diagnosis") or "",
                "status": _value(sr.status),
            })

    rows.sort(key=lambda item: item.get("timestamp") or "", reverse=True)
    total = len(rows)
    return {
        "items": rows[skip: skip + limit],
        "total": total,
        "skip": skip,
        "limit": limit,
    }
