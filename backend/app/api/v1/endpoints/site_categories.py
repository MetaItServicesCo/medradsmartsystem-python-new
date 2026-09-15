"""A site's equipment under Electrical, Plumbing, Mechanical and HVAC.

See app/services/site_categories.py for why these are equipment rows and what
marks one as entered here.
"""
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from app.core.deps import get_current_user
from app.db.base import get_db
from app.models.equipment import Equipment
from app.models.facility import Facility
from app.models.inspection import Inspection
from app.models.service_request import ServiceRequest
from app.models.user import User
from app.schemas.site_categories import CategoryEquipmentCreate, CategoryEquipmentUpdate
from app.services import asset_tags, site_categories
from app.utils.facility_access import require_facility_access
from app.utils.permission_deps import require_module_access
from app.utils.permissions import require_module_permission

router = APIRouter(dependencies=[Depends(require_module_access("facility-inventory"))])


def _site_or_404(db: Session, user: User, facility_id: int) -> Facility:
    facility = db.get(Facility, facility_id)
    if facility is None:
        raise HTTPException(status_code=404, detail="Site not found")
    require_facility_access(db, user, facility_id)
    return facility


def _item_or_404(db: Session, user: User, equipment_id: int) -> Equipment:
    asset = db.get(Equipment, equipment_id)
    if asset is None or asset.name is None:
        raise HTTPException(status_code=404, detail="Equipment not found")
    require_facility_access(db, user, asset.facility_id)
    return asset


def _category_of(db: Session, asset: Equipment) -> site_categories.Category:
    ids = site_categories.ensure_disciplines(db)
    code = next((code for code, pk in ids.items() if pk == asset.discipline_id), None)
    if code is None:
        raise HTTPException(status_code=404, detail="Equipment not found")
    return site_categories.BY_CODE[code]


def _response(db: Session, asset: Equipment, category: site_categories.Category) -> dict:
    return site_categories.serialise(asset, category, site_categories.job_facts(db, [asset.id]).get(asset.id))


@router.get("/overview")
def overview(
    facility_id: int = Query(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Any:
    """The four categories with how much equipment each has, and how much is wrong."""
    _site_or_404(db, current_user, facility_id)
    categories = site_categories.overview(db, facility_id)
    db.commit()  # ensure_disciplines may have written the category rows
    return {
        "categories": categories,
        "conditions": [{"value": key, "label": label} for key, label in site_categories.CONDITIONS.items()],
    }


@router.get("/suggestions")
def suggestions(
    facility_id: int = Query(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Any:
    """Buildings, floors and spots already used at this site, to suggest while typing."""
    _site_or_404(db, current_user, facility_id)
    return site_categories.suggestions(db, facility_id)


@router.get("/{code}/equipment")
def list_category_equipment(
    code: str,
    facility_id: int = Query(...),
    search: Optional[str] = Query(None),
    building: Optional[str] = Query(None),
    floor: Optional[str] = Query(None),
    condition: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Any:
    category = site_categories.category_or_404(code)
    _site_or_404(db, current_user, facility_id)
    ids = site_categories.ensure_disciplines(db)
    db.commit()

    query = site_categories.items_query(db, facility_id, ids[category.code])
    if building:
        query = query.filter(func.lower(Equipment.building) == building.strip().lower())
    if floor:
        query = query.filter(func.lower(Equipment.floor) == floor.strip().lower())
    if condition:
        if condition not in site_categories.CONDITIONS:
            raise HTTPException(status_code=422, detail="Unknown condition")
        query = query.filter(Equipment.condition == condition)
    if search and search.strip():
        like = f"%{search.strip()}%"
        query = query.filter(or_(
            Equipment.name.ilike(like), Equipment.equipment_type.ilike(like), Equipment.asset_tag.ilike(like),
            Equipment.building.ilike(like), Equipment.floor.ilike(like), Equipment.location.ilike(like),
            Equipment.make.ilike(like), Equipment.model.ilike(like),
        ))

    rows = query.order_by(
        func.lower(Equipment.building), func.lower(Equipment.floor), func.lower(Equipment.name), Equipment.id,
    ).all()
    facts = site_categories.job_facts(db, [row.id for row in rows])
    return {
        "category": {"code": category.code, "name": category.name, "colour": category.colour,
                     "types": list(category.types)},
        "items": [site_categories.serialise(row, category, facts.get(row.id)) for row in rows],
        "total": len(rows),
    }


@router.post("/{code}/equipment", status_code=201)
def add_category_equipment(
    code: str,
    payload: CategoryEquipmentCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Any:
    """Add equipment to a category. It is given the site's next asset tag."""
    require_module_permission(current_user, "facility-inventory", "add")
    category = site_categories.category_or_404(code)
    facility = _site_or_404(db, current_user, payload.facility_id)
    ids = site_categories.ensure_disciplines(db)

    name, kind = site_categories.tidy(payload.name), site_categories.tidy(payload.type)
    building = site_categories.match_existing_spelling(db, facility.id, "building", payload.building)
    if not (name and kind and building):
        raise HTTPException(status_code=422, detail="Name, type and building are required")

    asset = Equipment(
        facility_id=facility.id,
        discipline_id=ids[category.code],
        asset_tag=asset_tags.next_tags(db, facility, 1)[0],
        name=name,
        equipment_type=kind,
        quantity=payload.quantity,
        building=building,
        floor=site_categories.match_existing_spelling(db, facility.id, "floor", payload.floor),
        location=site_categories.tidy(payload.spot),
        condition=payload.condition,
        make=site_categories.tidy(payload.make) or "",
        model=site_categories.tidy(payload.model) or "",
        serial_number="",
        description=site_categories.tidy(payload.notes),
    )
    db.add(asset)
    db.commit()
    db.refresh(asset)
    return _response(db, asset, category)


@router.put("/equipment/{equipment_id}")
def update_category_equipment(
    equipment_id: int,
    payload: CategoryEquipmentUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Any:
    require_module_permission(current_user, "facility-inventory", "edit")
    asset = _item_or_404(db, current_user, equipment_id)
    category = _category_of(db, asset)
    changes = payload.model_dump(exclude_unset=True)

    if changes.get("category"):
        category = site_categories.category_or_404(changes["category"])
        asset.discipline_id = site_categories.ensure_disciplines(db)[category.code]
    for field, column in (("name", "name"), ("type", "equipment_type")):
        if field in changes:
            value = site_categories.tidy(changes[field])
            if not value:
                raise HTTPException(status_code=422, detail=f"{field.capitalize()} cannot be blank")
            setattr(asset, column, value)
    if "building" in changes:
        building = site_categories.match_existing_spelling(db, asset.facility_id, "building", changes["building"])
        if not building:
            raise HTTPException(status_code=422, detail="Building cannot be blank")
        asset.building = building
    if "floor" in changes:
        asset.floor = site_categories.match_existing_spelling(db, asset.facility_id, "floor", changes["floor"])
    if "spot" in changes:
        asset.location = site_categories.tidy(changes["spot"])
    if changes.get("quantity") is not None:
        asset.quantity = changes["quantity"]
    if changes.get("condition") is not None:
        asset.condition = changes["condition"]
    for field in ("make", "model"):
        if field in changes:
            setattr(asset, field, site_categories.tidy(changes[field]) or "")
    if "notes" in changes:
        asset.description = site_categories.tidy(changes["notes"])

    db.commit()
    db.refresh(asset)
    return _response(db, asset, category)


@router.delete("/equipment/{equipment_id}")
def delete_category_equipment(
    equipment_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Any:
    """Remove equipment entered by mistake. Equipment with jobs keeps its history."""
    require_module_permission(current_user, "facility-inventory", "delete")
    asset = _item_or_404(db, current_user, equipment_id)
    jobs = db.query(func.count(ServiceRequest.id)).filter(ServiceRequest.equipment_id == asset.id).scalar()
    inspections = db.query(func.count(Inspection.id)).filter(Inspection.equipment_id == asset.id).scalar()
    if jobs or inspections:
        count = (jobs or 0) + (inspections or 0)
        raise HTTPException(
            status_code=409,
            detail=f"{asset.name} has {count} job{'s' if count != 1 else ''} on record. "
                   "Mark it Out of service instead, so that history stays.",
        )
    db.delete(asset)
    db.commit()
    return {"detail": "Equipment removed"}
