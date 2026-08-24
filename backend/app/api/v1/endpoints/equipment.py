import csv
import io
from typing import Any, Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy import or_
from sqlalchemy.orm import Session, joinedload

from app import crud
from app.core.deps import get_current_user, get_superadmin_user
from app.db.base import get_db
from app.models.user import User
from app.models.equipment import Equipment
from app.models.facility import Facility
from app.schemas.equipment import (
    EquipmentCreate, EquipmentUpdate,
    Equipment as EquipmentSchema, EquipmentListResponse
)
from app.utils.inspection_schedule import next_inspection_date
from app.utils.facility_access import require_facility_access, scope_query_to_user_facilities
from app.utils.permission_deps import require_module_access
from app.utils.read_cache import cached_read

router = APIRouter(dependencies=[Depends(require_module_access("facility-inventory"))])


@router.get("/", response_model=EquipmentListResponse)
@cached_read("equipment", ttl_seconds=20)
def list_equipment(
    db: Session = Depends(get_db),
    facility_id: Optional[int] = Query(None),
    search: Optional[str] = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
    current_user: User = Depends(get_current_user),
) -> Any:
    """List equipment/inventory, optionally filtered by facility_id."""
    query = scope_query_to_user_facilities(db.query(Equipment), Equipment.facility_id, db, current_user)
    if facility_id is not None:
        query = query.filter(Equipment.facility_id == facility_id)
    if search and search.strip():
        like = f"%{search.strip()}%"
        query = query.filter(
            or_(
                Equipment.asset_tag.ilike(like),
                Equipment.make.ilike(like),
                Equipment.model.ilike(like),
                Equipment.serial_number.ilike(like),
                Equipment.description.ilike(like),
                Equipment.location.ilike(like),
                Equipment.department.ilike(like),
            )
        )
    total = query.count()
    items = query.order_by(Equipment.created_at.desc(), Equipment.id.desc()).offset(skip).limit(limit).all()
    return {"items": items, "total": total}


@router.get("/export-csv")
def export_equipment_csv(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_superadmin_user),
) -> Any:
    """Export all facility equipment inventory for super admins."""
    items = (
        db.query(Equipment)
        .options(
            joinedload(Equipment.facility),
            joinedload(Equipment.modality),
            joinedload(Equipment.tier),
            joinedload(Equipment.inspection_form),
        )
        .order_by(Equipment.asset_tag.asc())
        .all()
    )
    buffer = io.StringIO()
    writer = csv.writer(buffer)
    writer.writerow([
        "id", "asset_tag", "facility", "tier", "make", "model", "serial_number", "modality",
        "inspection_form", "status", "risk_priority", "risk_name", "location", "pm_scheduling",
        "last_pm_date", "next_generated_pm_date", "created_at", "updated_at",
    ])
    for item in items:
        writer.writerow([
            item.id,
            item.asset_tag,
            item.facility.name if item.facility else "",
            item.tier.name if item.tier else "",
            item.make,
            item.model,
            item.serial_number,
            item.modality.name if item.modality else "",
            item.inspection_form.name if item.inspection_form else "",
            item.status.value if hasattr(item.status, "value") else item.status,
            item.risk_priority,
            item.risk_name,
            item.location,
            item.pm_scheduling,
            item.last_pm_date,
            item.next_generated_pm_date,
            item.created_at,
            item.updated_at,
        ])

    return StreamingResponse(
        iter([buffer.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": 'attachment; filename="facility_inventory.csv"'},
    )


@router.get("/{id}", response_model=EquipmentSchema)
@cached_read("equipment", ttl_seconds=30)
def get_equipment(
    id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Any:
    """Get a single equipment item."""
    item = crud.equipment.get(db=db, id=id)
    if not item:
        raise HTTPException(status_code=404, detail="Equipment not found")
    require_facility_access(db, current_user, item.facility_id)
    return item


@router.post("/", response_model=EquipmentSchema, status_code=201)
def create_equipment(
    equip_in: EquipmentCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Any:
    """Create a new equipment/inventory item."""
    # Validate facility exists
    facility = db.query(Facility).filter(Facility.id == equip_in.facility_id).first()
    if not facility:
        raise HTTPException(status_code=404, detail="Facility not found")
    require_facility_access(db, current_user, equip_in.facility_id)
    create_data = equip_in.model_dump()
    create_data["next_generated_pm_date"] = next_inspection_date(
        equip_in.last_pm_date,
        equip_in.pm_scheduling,
    )
    return crud.equipment.create(db=db, obj_in=create_data)


@router.put("/{id}", response_model=EquipmentSchema)
def update_equipment(
    id: int,
    equip_in: EquipmentUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Any:
    """Update an equipment item."""
    item = crud.equipment.get(db=db, id=id)
    if not item:
        raise HTTPException(status_code=404, detail="Equipment not found")
    require_facility_access(db, current_user, item.facility_id)
    update_data = equip_in.model_dump(exclude_unset=True)
    target_facility_id = update_data.get("facility_id")
    if target_facility_id is not None and target_facility_id != item.facility_id:
        facility = db.query(Facility.id).filter(Facility.id == target_facility_id).first()
        if not facility:
            raise HTTPException(status_code=404, detail="Target facility not found")
        require_facility_access(db, current_user, target_facility_id)
    if "last_pm_date" in update_data or "pm_scheduling" in update_data:
        last_inspection_date = update_data.get("last_pm_date", item.last_pm_date)
        schedule = update_data.get("pm_scheduling", item.pm_scheduling)
        update_data["next_generated_pm_date"] = next_inspection_date(last_inspection_date, schedule)
    return crud.equipment.update(db=db, db_obj=item, obj_in=update_data)


@router.delete("/{id}")
def delete_equipment(
    id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Any:
    """Delete an equipment item."""
    item = crud.equipment.get(db=db, id=id)
    if not item:
        raise HTTPException(status_code=404, detail="Equipment not found")
    require_facility_access(db, current_user, item.facility_id)
    crud.equipment.remove(db=db, id=id)
    return {"detail": "Equipment deleted"}
