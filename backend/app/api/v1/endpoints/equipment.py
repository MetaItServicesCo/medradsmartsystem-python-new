from typing import Any, Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app import crud
from app.core.deps import get_current_user, get_admin_user
from app.db.base import get_db
from app.models.user import User
from app.models.equipment import Equipment
from app.models.facility import Facility
from app.schemas.equipment import (
    EquipmentCreate, EquipmentUpdate,
    Equipment as EquipmentSchema, EquipmentListResponse
)

router = APIRouter()


@router.get("/", response_model=EquipmentListResponse)
def list_equipment(
    db: Session = Depends(get_db),
    facility_id: Optional[int] = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
    current_user: User = Depends(get_current_user),
) -> Any:
    """List equipment/inventory, optionally filtered by facility_id."""
    query = db.query(Equipment)
    if facility_id is not None:
        query = query.filter(Equipment.facility_id == facility_id)
    total = query.count()
    items = query.offset(skip).limit(limit).all()
    return {"items": items, "total": total}


@router.get("/{id}", response_model=EquipmentSchema)
def get_equipment(
    id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Any:
    """Get a single equipment item."""
    item = crud.equipment.get(db=db, id=id)
    if not item:
        raise HTTPException(status_code=404, detail="Equipment not found")
    return item


@router.post("/", response_model=EquipmentSchema, status_code=201)
def create_equipment(
    equip_in: EquipmentCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_admin_user),
) -> Any:
    """Create a new equipment/inventory item."""
    # Validate facility exists
    facility = db.query(Facility).filter(Facility.id == equip_in.facility_id).first()
    if not facility:
        raise HTTPException(status_code=404, detail="Facility not found")
    return crud.equipment.create(db=db, obj_in=equip_in)


@router.put("/{id}", response_model=EquipmentSchema)
def update_equipment(
    id: int,
    equip_in: EquipmentUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_admin_user),
) -> Any:
    """Update an equipment item."""
    item = crud.equipment.get(db=db, id=id)
    if not item:
        raise HTTPException(status_code=404, detail="Equipment not found")
    return crud.equipment.update(db=db, db_obj=item, obj_in=equip_in)


@router.delete("/{id}")
def delete_equipment(
    id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_admin_user),
) -> Any:
    """Delete an equipment item."""
    item = crud.equipment.get(db=db, id=id)
    if not item:
        raise HTTPException(status_code=404, detail="Equipment not found")
    crud.equipment.remove(db=db, id=id)
    return {"detail": "Equipment deleted"}
