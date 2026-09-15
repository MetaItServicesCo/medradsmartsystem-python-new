"""The simple register: a site's equipment, filed under four categories.

Site → Electrical / Plumbing / Mechanical / HVAC → equipment, each with where
exactly it is. It replaces a register that wanted rooms, tags, criticality and
depreciation before anyone could write down that the basement has a generator.

The rows are ordinary `equipment` rows, because work orders, planned
maintenance, compliance and the assistant already point at that table. What
marks one as belonging here is a name: the older registration paths never set
one, so the lists start empty instead of filling with records nobody entered
through this screen.
"""
from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import date, datetime

from fastapi import HTTPException
from sqlalchemy import case, func
from sqlalchemy.orm import Session

from app.models.discipline import Discipline
from app.models.equipment import Equipment
from app.models.service_request import ServiceRequest, ServiceRequestStatus, WorkOrderType


@dataclass(frozen=True)
class Category:
    code: str
    name: str
    colour: str
    description: str
    sort_order: int
    # Offered in the Type dropdown. Anything else can be typed.
    types: tuple[str, ...]


# In the order they are shown. The codes are discipline codes.
CATEGORIES: tuple[Category, ...] = (
    Category(
        "electrical", "Electrical", "#F59E0B",
        "Distribution, panels, generators, transfer switches, lighting", 20,
        ("Generator", "Transformer", "Main switchboard", "Distribution board", "UPS",
         "Transfer switch", "Lighting", "Earthing"),
    ),
    Category(
        "plumbing", "Plumbing", "#3B82F6",
        "Domestic water, sanitary, storm, backflow, water heaters", 30,
        ("Water tank", "Water pump", "Water heater", "RO / filtration plant",
         "Drainage & sewage", "Taps & sanitary fittings"),
    ),
    Category(
        "mechanical", "Mechanical", "#0EA5E9",
        "Lifts, boilers, compressors, vacuum pumps, medical gas, fire pumps", 10,
        ("Lift", "Boiler", "Air compressor", "Vacuum pump", "Medical gas manifold", "Fire pump"),
    ),
    Category(
        "hvac", "HVAC", "#14B8A6",
        "Chillers, air handling, fan coils, AC units, cooling towers, exhaust", 15,
        ("Chiller", "Air handling unit", "Fan coil unit", "Split / package AC", "Cooling tower",
         "Exhaust fan"),
    ),
)
BY_CODE = {category.code: category for category in CATEGORIES}

CONDITIONS: dict[str, str] = {
    "working": "Working",
    "needs_attention": "Needs attention",
    "out_of_service": "Out of service",
}

# Work order statuses that still need doing.
OPEN_STATUSES = (
    ServiceRequestStatus.NEW, ServiceRequestStatus.ASSIGNED, ServiceRequestStatus.IN_PROGRESS,
    ServiceRequestStatus.WAITING_ON_PARTS, ServiceRequestStatus.WAITING_FOR_APPROVAL,
    ServiceRequestStatus.WAITING_FOR_DEPOT_REPAIR, ServiceRequestStatus.WAITING_FOR_VENDOR_REPAIR,
)


def category_or_404(code: str) -> Category:
    category = BY_CODE.get(code)
    if category is None:
        raise HTTPException(status_code=404, detail=f"No category called '{code}'")
    return category


def ensure_disciplines(db: Session) -> dict[str, int]:
    """Category code -> discipline id, creating any category row that is missing.

    The migration writes them, but a database built with create_all() has the
    table and not the rows, and a screen that 404s until someone runs a seed
    script is a broken screen. Flushes; the caller commits.
    """
    rows = {
        code: pk for code, pk in
        db.query(Discipline.code, Discipline.id).filter(Discipline.code.in_(list(BY_CODE))).all()
    }
    missing = [category for category in CATEGORIES if category.code not in rows]
    for category in missing:
        row = Discipline(code=category.code, name=category.name, color=category.colour,
                         description=category.description, sort_order=category.sort_order,
                         is_active=True)
        db.add(row)
        db.flush()
        rows[category.code] = row.id
    return rows


def tidy(value: str | None) -> str | None:
    """Trim and collapse spaces; blank becomes nothing."""
    if value is None:
        return None
    value = re.sub(r"\s+", " ", value).strip()
    return value or None


_PLACE_COLUMNS = {"building": Equipment.building, "floor": Equipment.floor, "spot": Equipment.location}


def match_existing_spelling(db: Session, facility_id: int, field: str, value: str | None) -> str | None:
    """Reuse how the site already spells a place, whatever the case typed.

    "main block" and "Main Block" are the same building, and a filter that
    shows both is the first thing that makes a register look untidy.
    """
    value = tidy(value)
    if value is None:
        return None
    column = _PLACE_COLUMNS[field]
    found = (
        db.query(column)
        .filter(Equipment.facility_id == facility_id, Equipment.name.isnot(None),
                func.lower(column) == value.lower())
        .order_by(Equipment.id)
        .first()
    )
    return found[0] if found else value


def items_query(db: Session, facility_id: int, discipline_id: int | None = None):
    """Equipment entered through the categories, at one site."""
    query = db.query(Equipment).filter(Equipment.facility_id == facility_id, Equipment.name.isnot(None))
    if discipline_id is not None:
        query = query.filter(Equipment.discipline_id == discipline_id)
    return query


def location_label(asset: Equipment) -> str:
    return " · ".join(part for part in (asset.building, asset.floor, asset.location) if part)


def job_facts(db: Session, equipment_ids: list[int]) -> dict[int, dict]:
    """For each piece of equipment: open jobs, and when its next service is due."""
    if not equipment_ids:
        return {}
    rows = (
        db.query(
            ServiceRequest.equipment_id,
            func.count(ServiceRequest.id),
            func.min(case(
                (ServiceRequest.work_order_type == WorkOrderType.PREVENTIVE.value, ServiceRequest.due_on),
                else_=None,
            )),
        )
        .filter(ServiceRequest.equipment_id.in_(equipment_ids),
                ServiceRequest.status.in_(OPEN_STATUSES))
        .group_by(ServiceRequest.equipment_id)
        .all()
    )
    return {equipment_id: {"open_jobs": count, "next_service_on": due}
            for equipment_id, count, due in rows}


def serialise(asset: Equipment, category: Category, facts: dict | None = None) -> dict:
    facts = facts or {}
    return {
        "id": asset.id,
        "asset_tag": asset.asset_tag,
        "category": category.code,
        "category_name": category.name,
        "name": asset.name,
        "type": asset.equipment_type,
        "building": asset.building,
        "floor": asset.floor,
        "spot": asset.location,
        "location_label": location_label(asset),
        "quantity": asset.quantity or 1,
        "condition": asset.condition or "working",
        "condition_label": CONDITIONS.get(asset.condition or "working", "Working"),
        "make": asset.make or None,
        "model": asset.model or None,
        "notes": asset.description,
        "open_jobs": facts.get("open_jobs", 0),
        "next_service_on": facts.get("next_service_on"),
        "created_at": asset.created_at,
        "updated_at": asset.updated_at,
    }


def overview(db: Session, facility_id: int, *, today: date | None = None) -> list[dict]:
    """The four tiles on a site's page: how much is there, and how much is wrong."""
    today = today or datetime.utcnow().date()
    ids = ensure_disciplines(db)
    by_discipline = {pk: code for code, pk in ids.items()}

    equipment_counts = (
        db.query(
            Equipment.discipline_id,
            func.count(Equipment.id),
            func.sum(case((Equipment.condition == "needs_attention", 1), else_=0)),
            func.sum(case((Equipment.condition == "out_of_service", 1), else_=0)),
        )
        .filter(Equipment.facility_id == facility_id, Equipment.name.isnot(None),
                Equipment.discipline_id.in_(list(by_discipline)))
        .group_by(Equipment.discipline_id)
        .all()
    )
    job_counts = (
        db.query(
            Equipment.discipline_id,
            func.count(ServiceRequest.id),
            func.sum(case((ServiceRequest.due_on < today, 1), else_=0)),
        )
        .join(Equipment, Equipment.id == ServiceRequest.equipment_id)
        .filter(ServiceRequest.facility_id == facility_id, Equipment.name.isnot(None),
                Equipment.discipline_id.in_(list(by_discipline)),
                ServiceRequest.status.in_(OPEN_STATUSES),
                ServiceRequest.work_order_type.in_([WorkOrderType.PREVENTIVE.value,
                                                    WorkOrderType.INSPECTION.value]))
        .group_by(Equipment.discipline_id)
        .all()
    )

    counts = {code: {"equipment": 0, "needs_attention": 0, "out_of_service": 0,
                     "open_jobs": 0, "overdue_jobs": 0} for code in BY_CODE}
    for discipline_id, total, attention, down in equipment_counts:
        code = by_discipline[discipline_id]
        counts[code].update(equipment=total, needs_attention=int(attention or 0),
                            out_of_service=int(down or 0))
    for discipline_id, open_jobs, overdue in job_counts:
        code = by_discipline[discipline_id]
        counts[code].update(open_jobs=open_jobs, overdue_jobs=int(overdue or 0))

    return [{"code": category.code, "name": category.name, "colour": category.colour,
             "description": category.description, "types": list(category.types),
             **counts[category.code]} for category in CATEGORIES]


def suggestions(db: Session, facility_id: int) -> dict[str, list[str]]:
    """Places already typed at this site, offered as someone types the next one."""
    def distinct(column) -> list[str]:
        rows = (
            db.query(column)
            .filter(Equipment.facility_id == facility_id, Equipment.name.isnot(None), column.isnot(None))
            .distinct()
            .all()
        )
        return sorted({value for (value,) in rows if value}, key=str.lower)

    return {"buildings": distinct(Equipment.building), "floors": distinct(Equipment.floor),
            "spots": distinct(Equipment.location)}
