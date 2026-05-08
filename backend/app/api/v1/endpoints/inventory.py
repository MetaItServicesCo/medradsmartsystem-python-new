from typing import Any, Optional
from datetime import date, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import or_
from sqlalchemy.orm import Session, joinedload

from app.core.deps import get_current_user, get_admin_user
from app.db.base import get_db
from app.models.facility import Facility
from app.models.inventory import InventoryPart, InventoryTransaction
from app.models.tier import Tier
from app.models.user import User
from app.schemas.inventory import (
    InventoryPartCreate,
    InventoryPartListResponse,
    InventoryPartResponse,
    InventoryPartUpdate,
    InventoryTransactionCreate,
    InventoryTransactionListResponse,
    InventoryTransactionResponse,
)
from app.utils.logging import log_activity
from app.utils.notifications import notify_admins, notify_facility_users

router = APIRouter()

STOCK_IN = {"receiving"}
STOCK_OUT = {"issuance"}
STOCK_ADJUST = {"adjustment"}
STOCK_TRANSFER = {"transfer"}
VALID_TRANSACTIONS = STOCK_IN | STOCK_OUT | STOCK_ADJUST | STOCK_TRANSFER


def _part_response(part: InventoryPart) -> dict:
    data = {c.name: getattr(part, c.name) for c in part.__table__.columns}
    data["facility_name"] = part.facility.name if part.facility else None
    data["tier_name"] = part.tier.name if part.tier else None
    return data


def _transaction_response(txn: InventoryTransaction) -> dict:
    data = {c.name: getattr(txn, c.name) for c in txn.__table__.columns}
    data["created_by_name"] = txn.created_by.full_name if txn.created_by else None
    return data


def _validate_facility_and_tier(db: Session, facility_id: int, tier_id: Optional[int]) -> None:
    if not db.query(Facility).filter(Facility.id == facility_id).first():
        raise HTTPException(status_code=404, detail="Facility not found")
    if tier_id and not db.query(Tier).filter(Tier.id == tier_id).first():
        raise HTTPException(status_code=404, detail="Tier not found")


@router.get("/", response_model=InventoryPartListResponse)
def list_inventory_parts(
    db: Session = Depends(get_db),
    facility_id: Optional[int] = Query(None),
    tier_id: Optional[int] = Query(None),
    part_type: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    low_stock: bool = Query(False),
    expiring_days: Optional[int] = Query(None, ge=1, le=3650),
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
    current_user: User = Depends(get_current_user),
) -> Any:
    query = db.query(InventoryPart).options(joinedload(InventoryPart.facility), joinedload(InventoryPart.tier))
    if facility_id is not None:
        query = query.filter(InventoryPart.facility_id == facility_id)
    if tier_id is not None:
        query = query.filter(InventoryPart.tier_id == tier_id)
    if part_type:
        query = query.filter(InventoryPart.part_type == part_type)
    if low_stock:
        query = query.filter(InventoryPart.quantity_on_hand <= InventoryPart.reorder_level)
    if expiring_days:
        query = query.filter(InventoryPart.expiry_date <= date.today() + timedelta(days=expiring_days))
    if search:
        query = query.filter(
            or_(
                InventoryPart.part_number.ilike(f"%{search}%"),
                InventoryPart.description.ilike(f"%{search}%"),
                InventoryPart.make.ilike(f"%{search}%"),
                InventoryPart.model.ilike(f"%{search}%"),
                InventoryPart.serial_number.ilike(f"%{search}%"),
                InventoryPart.batch_number.ilike(f"%{search}%"),
            )
        )
    total = query.count()
    items = query.order_by(InventoryPart.updated_at.desc()).offset(skip).limit(limit).all()
    return {"items": [_part_response(item) for item in items], "total": total}


@router.get("/{part_id}", response_model=InventoryPartResponse)
def get_inventory_part(
    part_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Any:
    part = (
        db.query(InventoryPart)
        .options(joinedload(InventoryPart.facility), joinedload(InventoryPart.tier))
        .filter(InventoryPart.id == part_id)
        .first()
    )
    if not part:
        raise HTTPException(status_code=404, detail="Inventory part not found")
    return _part_response(part)


@router.post("/", response_model=InventoryPartResponse, status_code=status.HTTP_201_CREATED)
def create_inventory_part(
    part_in: InventoryPartCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Any:
    _validate_facility_and_tier(db, part_in.facility_id, part_in.tier_id)
    existing = (
        db.query(InventoryPart)
        .filter(
            InventoryPart.facility_id == part_in.facility_id,
            InventoryPart.part_number == part_in.part_number,
            InventoryPart.serial_number == part_in.serial_number,
        )
        .first()
    )
    if existing and part_in.serial_number:
        raise HTTPException(status_code=400, detail="A part with this serial number already exists at this facility")

    part = InventoryPart(**part_in.model_dump())
    db.add(part)
    db.flush()
    log_activity(db, "inventory_parts", part.id, "CREATE", current_user, part_in.model_dump())
    notify_facility_users(
        db,
        facility_id=part.facility_id,
        title="Inventory item added",
        message=f"{part.part_number} was added to facility inventory.",
        notification_type="inventory",
        link_url="/inventory",
        actor_id=current_user.id,
    )
    db.commit()
    db.refresh(part)
    return _part_response(part)


@router.put("/{part_id}", response_model=InventoryPartResponse)
def update_inventory_part(
    part_id: int,
    part_in: InventoryPartUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Any:
    part = db.query(InventoryPart).filter(InventoryPart.id == part_id).first()
    if not part:
        raise HTTPException(status_code=404, detail="Inventory part not found")

    update_data = part_in.model_dump(exclude_unset=True)
    facility_id = update_data.get("facility_id", part.facility_id)
    tier_id = update_data.get("tier_id", part.tier_id)
    _validate_facility_and_tier(db, facility_id, tier_id)

    before = {c.name: getattr(part, c.name) for c in part.__table__.columns}
    for field, value in update_data.items():
        setattr(part, field, value)
    db.flush()
    log_activity(db, "inventory_parts", part.id, "UPDATE", current_user, {"before": before, "after": update_data})
    db.commit()
    db.refresh(part)
    return _part_response(part)


@router.delete("/{part_id}")
def delete_inventory_part(
    part_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_admin_user),
) -> Any:
    part = db.query(InventoryPart).filter(InventoryPart.id == part_id).first()
    if not part:
        raise HTTPException(status_code=404, detail="Inventory part not found")
    data = {c.name: getattr(part, c.name) for c in part.__table__.columns}
    db.delete(part)
    log_activity(db, "inventory_parts", part_id, "DELETE", current_user, data)
    db.commit()
    return {"detail": "Inventory part deleted"}


@router.get("/{part_id}/transactions", response_model=InventoryTransactionListResponse)
def list_part_transactions(
    part_id: int,
    db: Session = Depends(get_db),
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
    current_user: User = Depends(get_current_user),
) -> Any:
    if not db.query(InventoryPart.id).filter(InventoryPart.id == part_id).first():
        raise HTTPException(status_code=404, detail="Inventory part not found")
    query = (
        db.query(InventoryTransaction)
        .options(joinedload(InventoryTransaction.created_by))
        .filter(InventoryTransaction.part_id == part_id)
    )
    total = query.count()
    items = query.order_by(InventoryTransaction.created_at.desc()).offset(skip).limit(limit).all()
    return {"items": [_transaction_response(item) for item in items], "total": total}


@router.post("/{part_id}/transactions", response_model=InventoryTransactionResponse, status_code=status.HTTP_201_CREATED)
def create_part_transaction(
    part_id: int,
    txn_in: InventoryTransactionCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Any:
    part = db.query(InventoryPart).filter(InventoryPart.id == part_id).first()
    if not part:
        raise HTTPException(status_code=404, detail="Inventory part not found")
    txn_type = txn_in.transaction_type.lower()
    if txn_type not in VALID_TRANSACTIONS:
        raise HTTPException(status_code=400, detail=f"Invalid transaction type. Allowed: {sorted(VALID_TRANSACTIONS)}")
    if txn_in.quantity <= 0:
        raise HTTPException(status_code=400, detail="Quantity must be greater than zero")

    if txn_type in STOCK_IN:
        part.quantity_on_hand += txn_in.quantity
    elif txn_type in STOCK_OUT:
        if part.quantity_on_hand < txn_in.quantity:
            raise HTTPException(status_code=400, detail="Insufficient stock for issuance")
        part.quantity_on_hand -= txn_in.quantity
    elif txn_type in STOCK_ADJUST:
        part.quantity_on_hand = txn_in.quantity
    elif txn_type in STOCK_TRANSFER:
        if not txn_in.to_facility_id:
            raise HTTPException(status_code=400, detail="Transfer requires a destination facility")
        if part.quantity_on_hand < txn_in.quantity:
            raise HTTPException(status_code=400, detail="Insufficient stock for transfer")
        _validate_facility_and_tier(db, txn_in.to_facility_id, part.tier_id)
        part.quantity_on_hand -= txn_in.quantity
        destination = (
            db.query(InventoryPart)
            .filter(
                InventoryPart.facility_id == txn_in.to_facility_id,
                InventoryPart.part_number == part.part_number,
                InventoryPart.serial_number == part.serial_number,
            )
            .first()
        )
        if not destination:
            destination = InventoryPart(
                facility_id=txn_in.to_facility_id,
                tier_id=part.tier_id,
                part_number=part.part_number,
                part_type=part.part_type,
                description=part.description,
                make=part.make,
                model=part.model,
                unit_price=part.unit_price,
                condition=part.condition,
                supplier_name=part.supplier_name,
                supplier_contact=part.supplier_contact,
                supplier_email=part.supplier_email,
                supplier_phone=part.supplier_phone,
                technical_specs=part.technical_specs,
                batch_number=part.batch_number,
                expiry_date=part.expiry_date,
                serial_number=part.serial_number,
                is_critical=part.is_critical,
                quantity_on_hand=0,
                reorder_level=part.reorder_level,
                location=part.location,
                status=part.status,
            )
            db.add(destination)
            db.flush()
        destination.quantity_on_hand += txn_in.quantity

    txn = InventoryTransaction(
        part_id=part.id,
        facility_id=part.facility_id,
        transaction_type=txn_type,
        quantity=txn_in.quantity,
        unit_cost=txn_in.unit_cost,
        balance_after=part.quantity_on_hand,
        from_facility_id=txn_in.from_facility_id or (part.facility_id if txn_type == "transfer" else None),
        to_facility_id=txn_in.to_facility_id,
        authorization_reference=txn_in.authorization_reference,
        authorization_details=txn_in.authorization_details,
        notes=txn_in.notes,
        created_by_id=current_user.id,
    )
    db.add(txn)
    db.flush()
    log_activity(db, "inventory_transactions", txn.id, txn_type.upper(), current_user, txn_in.model_dump())
    notify_facility_users(
        db,
        facility_id=part.facility_id,
        title="Inventory stock updated",
        message=f"{part.part_number} stock changed by {txn_in.quantity}.",
        notification_type="inventory",
        link_url="/inventory",
        actor_id=current_user.id,
    )
    if part.quantity_on_hand <= part.reorder_level:
        notify_admins(
            db,
            title="Low stock alert",
            message=f"{part.part_number} is at or below reorder level.",
            notification_type="inventory",
            link_url="/inventory",
            actor_id=current_user.id,
        )
    db.commit()
    db.refresh(txn)
    return _transaction_response(txn)
