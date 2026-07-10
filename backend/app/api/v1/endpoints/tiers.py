from typing import Any, Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app import crud
from app.core.deps import get_current_user, get_admin_user
from app.db.base import get_db
from app.models.user import User
from app.models.tier import Tier
from app.models.facility import Facility
from app.models.facility_tier import FacilityTier
from app.models.inventory import InventoryPart
from app.schemas.tier import (
    Tier as TierSchema, TierCreate, TierUpdate, TierListResponse
)

router = APIRouter()


@router.get("/", response_model=TierListResponse)
def read_tiers(
    db: Session = Depends(get_db),
    search: Optional[str] = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=2000),
    current_user: User = Depends(get_current_user),
) -> Any:
    """Retrieve tiers, optionally paginated for large assignment lists."""
    query = db.query(Tier)
    if search:
        term = f"%{search}%"
        query = query.filter(
            or_(
                Tier.tier_code.ilike(term),
                Tier.name.ilike(term),
                Tier.description.ilike(term),
            )
        )
    total = query.count()
    query = query.order_by(Tier.created_at.desc(), Tier.id.desc()).offset(skip).limit(limit)
    return {"items": query.all(), "total": total}


@router.get("/{id}", response_model=TierSchema)
def read_tier(
    id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Any:
    """Get a single tier by ID."""
    tier = crud.tier.get(db=db, id=id)
    if not tier:
        raise HTTPException(status_code=404, detail="Tier not found")
    return tier


@router.post("/", response_model=TierSchema, status_code=201)
def create_tier(
    tier_in: TierCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_admin_user),
) -> Any:
    """Create a new tier — admin only."""
    # Check unique tier_code
    existing = db.query(Tier).filter(Tier.tier_code == tier_in.tier_code).first()
    if existing:
        raise HTTPException(status_code=400, detail="Tier code already exists")
    # Check unique name
    existing_name = db.query(Tier).filter(Tier.name == tier_in.name).first()
    if existing_name:
        raise HTTPException(status_code=400, detail="Tier name already exists")
    tier = crud.tier.create(db=db, obj_in=tier_in)
    return tier


@router.put("/{id}", response_model=TierSchema)
def update_tier(
    id: int,
    tier_in: TierUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_admin_user),
) -> Any:
    """Update a tier — admin only."""
    tier = crud.tier.get(db=db, id=id)
    if not tier:
        raise HTTPException(status_code=404, detail="Tier not found")
    # Check unique constraints if changing
    if tier_in.tier_code and tier_in.tier_code != tier.tier_code:
        existing = db.query(Tier).filter(Tier.tier_code == tier_in.tier_code).first()
        if existing:
            raise HTTPException(status_code=400, detail="Tier code already exists")
    if tier_in.name and tier_in.name != tier.name:
        existing = db.query(Tier).filter(Tier.name == tier_in.name).first()
        if existing:
            raise HTTPException(status_code=400, detail="Tier name already exists")
    updated = crud.tier.update(db=db, db_obj=tier, obj_in=tier_in)
    return updated


@router.post("/{id}/duplicate", response_model=TierSchema, status_code=201)
def duplicate_tier(
    id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_admin_user),
) -> Any:
    """Duplicate an existing tier with a new code and name."""
    tier = crud.tier.get(db=db, id=id)
    if not tier:
        raise HTTPException(status_code=404, detail="Tier not found")

    # Generate unique code and name
    base_code = tier.tier_code
    base_name = tier.name
    suffix = 1
    while True:
        new_code = f"{base_code}-COPY{suffix}"
        new_name = f"{base_name} (Copy {suffix})"
        code_exists = db.query(Tier).filter(Tier.tier_code == new_code).first()
        name_exists = db.query(Tier).filter(Tier.name == new_name).first()
        if not code_exists and not name_exists:
            break
        suffix += 1

    new_tier_data = TierCreate(
        tier_code=new_code,
        name=new_name,
        description=tier.description,
        response_time_hours=tier.response_time_hours,
        labor_rate_per_hour=tier.labor_rate_per_hour,
        service_call_fee=tier.service_call_fee,
        preventive_maintenance_fee=tier.preventive_maintenance_fee,
        mileage_rate=tier.mileage_rate,
        status=tier.status,
    )
    new_tier = crud.tier.create(db=db, obj_in=new_tier_data)
    return new_tier


@router.delete("/{id}")
def delete_tier(
    id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_admin_user),
) -> Any:
    """Delete a tier — admin only. Unlinks any assigned facilities first."""
    tier = crud.tier.get(db=db, id=id)
    if not tier:
        raise HTTPException(status_code=404, detail="Tier not found")
    # Unlink facilities and inventory parts that reference this tier
    db.query(Facility).filter(Facility.tier_id == id).update(
        {"tier_id": None}, synchronize_session="fetch"
    )
    db.query(FacilityTier).filter(FacilityTier.tier_id == id).delete()
    db.query(InventoryPart).filter(InventoryPart.tier_id == id).update(
        {"tier_id": None}, synchronize_session="fetch"
    )
    db.commit()
    crud.tier.remove(db=db, id=id)
    return {"detail": "Tier deleted"}
