import csv
import io
from typing import Any, Optional
from datetime import date, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import StreamingResponse
from sqlalchemy import case, func, or_
from sqlalchemy.orm import Session, joinedload

from app.core.deps import get_current_user, get_admin_user, get_superadmin_user
from app.utils.permission_deps import require_module_access
from app.db.base import get_db
from app.models.facility import Facility
from app.models.inspection_form import InspectionForm
from app.models.inventory import InventoryPart, InventoryTransaction
from app.models.modality import Modality
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
from app.utils.facility_access import require_facility_access, scope_query_to_user_facilities
from app.utils.list_search import (
    contains_ci,
    normalize_list_search,
    parsed_date_value,
    predicates_for_field,
    value_contains_ci,
)

router = APIRouter(dependencies=[Depends(require_module_access("inventory"))])

STOCK_IN = {"receiving"}
STOCK_OUT = {"issuance"}
STOCK_ADJUST = {"adjustment"}
STOCK_TRANSFER = {"transfer"}
VALID_TRANSACTIONS = STOCK_IN | STOCK_OUT | STOCK_ADJUST | STOCK_TRANSFER


def _part_response(part: InventoryPart) -> dict:
    data = {c.name: getattr(part, c.name) for c in part.__table__.columns}
    data["facility_name"] = part.facility.name if part.facility else None
    data["tier_name"] = part.tier.name if part.tier else None
    data["modality_name"] = part.modality.name if part.modality else None
    data["inspection_form_name"] = part.inspection_form.name if part.inspection_form else None
    return data


def _transaction_response(txn: InventoryTransaction) -> dict:
    data = {c.name: getattr(txn, c.name) for c in txn.__table__.columns}
    data["created_by_name"] = txn.created_by.full_name if txn.created_by else None
    return data


def _apply_inventory_filters(
    query,
    facility_id: Optional[int] = None,
    tier_id: Optional[int] = None,
    part_type: Optional[str] = None,
    search: Optional[str] = None,
    search_field: Optional[str] = None,
    low_stock: bool = False,
    expiring_days: Optional[int] = None,
):
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
    search_term = normalize_list_search(search)
    if search_term:
        identifier_term = search_term.lstrip("#")
        facility_match = (
            query.session.query(Facility.id)
            .filter(
                Facility.id == InventoryPart.facility_id,
                contains_ci(Facility.name, search_term),
            )
            .exists()
        )
        tier_match = (
            query.session.query(Tier.id)
            .filter(
                Tier.id == InventoryPart.tier_id,
                contains_ci(Tier.name, search_term),
            )
            .exists()
        )
        modality_match = (
            query.session.query(Modality.id)
            .filter(
                Modality.id == InventoryPart.modality_id,
                contains_ci(Modality.name, search_term),
            )
            .exists()
        )
        search_by_field = {
            "id": [value_contains_ci(InventoryPart.id, identifier_term)],
            "part_number": [contains_ci(InventoryPart.part_number, search_term)],
            "asset_tag": [contains_ci(InventoryPart.asset_tag, search_term)],
            "type": [contains_ci(InventoryPart.part_type, search_term)],
            "description": [contains_ci(InventoryPart.description, search_term)],
            "make_model": [
                contains_ci(InventoryPart.make, search_term),
                contains_ci(InventoryPart.model, search_term),
            ],
            "serial": [
                contains_ci(InventoryPart.serial_number, search_term),
                contains_ci(InventoryPart.batch_number, search_term),
            ],
            "supplier": [
                contains_ci(InventoryPart.supplier_name, search_term),
                contains_ci(InventoryPart.supplier_contact, search_term),
                contains_ci(InventoryPart.supplier_email, search_term),
                contains_ci(InventoryPart.supplier_phone, search_term),
            ],
            "location": [contains_ci(InventoryPart.location, search_term)],
            "condition": [contains_ci(InventoryPart.condition, search_term)],
            "status": [contains_ci(InventoryPart.status, search_term)],
            "stock": [
                value_contains_ci(InventoryPart.quantity_on_hand, search_term),
                value_contains_ci(InventoryPart.reorder_level, search_term),
            ],
            "price": [value_contains_ci(InventoryPart.unit_price, search_term)],
            "expiry": [value_contains_ci(InventoryPart.expiry_date, search_term)],
            "facility": [facility_match],
            "tier": [tier_match],
            "modality": [modality_match],
        }
        searched_date = parsed_date_value(search_term)
        if searched_date:
            search_by_field["expiry"].extend(
                [
                    InventoryPart.expiry_date == searched_date,
                    InventoryPart.inventory_date == searched_date,
                ]
            )
        query = query.filter(or_(*predicates_for_field(search_field, search_by_field)))
    return query


def _validate_references(
    db: Session,
    facility_id: Optional[int],
    tier_id: Optional[int],
    modality_id: Optional[int] = None,
    inspection_form_id: Optional[int] = None,
) -> None:
    if facility_id and not db.query(Facility).filter(Facility.id == facility_id).first():
        raise HTTPException(status_code=404, detail="Facility not found")
    if tier_id and not db.query(Tier).filter(Tier.id == tier_id).first():
        raise HTTPException(status_code=404, detail="Tier not found")
    if modality_id and not db.query(Modality).filter(Modality.id == modality_id).first():
        raise HTTPException(status_code=404, detail="Modality not found")
    if inspection_form_id and not db.query(InspectionForm).filter(InspectionForm.id == inspection_form_id).first():
        raise HTTPException(status_code=404, detail="Inspection form not found")


@router.get("/", response_model=InventoryPartListResponse)
def list_inventory_parts(
    db: Session = Depends(get_db),
    facility_id: Optional[int] = Query(None),
    tier_id: Optional[int] = Query(None),
    part_type: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    search_field: Optional[str] = Query(None),
    low_stock: bool = Query(False),
    expiring_days: Optional[int] = Query(None, ge=1, le=3650),
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=2000),
    current_user: User = Depends(get_current_user),
) -> Any:
    query = _apply_inventory_filters(
        scope_query_to_user_facilities(db.query(InventoryPart), InventoryPart.facility_id, db, current_user),
        facility_id=facility_id,
        tier_id=tier_id,
        part_type=part_type,
        search=search,
        search_field=search_field,
        low_stock=low_stock,
        expiring_days=expiring_days,
    )
    total = query.count()
    items = (
        query.options(
            joinedload(InventoryPart.facility),
            joinedload(InventoryPart.tier),
            joinedload(InventoryPart.modality),
            joinedload(InventoryPart.inspection_form),
        )
        .order_by(InventoryPart.updated_at.desc())
        .offset(skip)
        .limit(limit)
        .all()
    )
    return {"items": [_part_response(item) for item in items], "total": total}


@router.get("/summary")
def get_inventory_summary(
    db: Session = Depends(get_db),
    facility_id: Optional[int] = Query(None),
    tier_id: Optional[int] = Query(None),
    part_type: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    search_field: Optional[str] = Query(None),
    low_stock: bool = Query(False),
    expiring_days: Optional[int] = Query(None, ge=1, le=3650),
    current_user: User = Depends(get_current_user),
) -> Any:
    query = _apply_inventory_filters(
        scope_query_to_user_facilities(db.query(InventoryPart), InventoryPart.facility_id, db, current_user),
        facility_id=facility_id,
        tier_id=tier_id,
        part_type=part_type,
        search=search,
        search_field=search_field,
        low_stock=low_stock,
        expiring_days=expiring_days,
    )
    total_parts, total_units, low_stock_parts, critical_parts, stock_value = query.with_entities(
        func.count(InventoryPart.id),
        func.coalesce(func.sum(InventoryPart.quantity_on_hand), 0),
        func.coalesce(
            func.sum(case((InventoryPart.quantity_on_hand <= InventoryPart.reorder_level, 1), else_=0)),
            0,
        ),
        func.coalesce(func.sum(case((InventoryPart.is_critical.is_(True), 1), else_=0)), 0),
        func.coalesce(func.sum(InventoryPart.unit_price * InventoryPart.quantity_on_hand), 0),
    ).one()
    return {
        "total_parts": total_parts,
        "total_units": total_units,
        "low_stock": low_stock_parts,
        "critical": critical_parts,
        "stock_value": stock_value,
    }


@router.get("/export-csv")
def export_inventory_parts_csv(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_superadmin_user),
) -> Any:
    """Export independent parts inventory for super admins."""
    items = (
        db.query(InventoryPart)
        .options(
            joinedload(InventoryPart.facility),
            joinedload(InventoryPart.tier),
        )
        .order_by(InventoryPart.part_number.asc())
        .all()
    )
    buffer = io.StringIO()
    writer = csv.writer(buffer)
    writer.writerow([
        "id", "part_number", "part_type", "description", "make", "model", "condition", "facility",
        "tier", "quantity_on_hand", "reorder_level", "unit_price", "supplier_name", "batch_number",
        "serial_number", "expiry_date", "status", "created_at", "updated_at",
    ])
    for item in items:
        writer.writerow([
            item.id,
            item.part_number,
            item.part_type,
            item.description,
            item.make,
            item.model,
            item.condition,
            item.facility.name if item.facility else "",
            item.tier.name if item.tier else "",
            item.quantity_on_hand,
            item.reorder_level,
            item.unit_price,
            item.supplier_name,
            item.batch_number,
            item.serial_number,
            item.expiry_date,
            item.status,
            item.created_at,
            item.updated_at,
        ])

    return StreamingResponse(
        iter([buffer.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": 'attachment; filename="parts_inventory.csv"'},
    )


@router.get("/{part_id}", response_model=InventoryPartResponse)
def get_inventory_part(
    part_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Any:
    part = (
        db.query(InventoryPart)
        .options(
            joinedload(InventoryPart.facility),
            joinedload(InventoryPart.tier),
            joinedload(InventoryPart.modality),
            joinedload(InventoryPart.inspection_form),
        )
        .filter(InventoryPart.id == part_id)
        .first()
    )
    if not part:
        raise HTTPException(status_code=404, detail="Inventory part not found")
    require_facility_access(db, current_user, part.facility_id)
    return _part_response(part)


@router.post("/", response_model=InventoryPartResponse, status_code=status.HTTP_201_CREATED)
def create_inventory_part(
    part_in: InventoryPartCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Any:
    if part_in.facility_id is not None:
        require_facility_access(db, current_user, part_in.facility_id)
    _validate_references(db, part_in.facility_id, part_in.tier_id, part_in.modality_id, part_in.inspection_form_id)
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
    if part.facility_id:
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
    require_facility_access(db, current_user, part.facility_id)

    update_data = part_in.model_dump(exclude_unset=True)
    facility_id = update_data.get("facility_id", part.facility_id)
    require_facility_access(db, current_user, facility_id)
    tier_id = update_data.get("tier_id", part.tier_id)
    _validate_references(
        db,
        facility_id,
        tier_id,
        update_data.get("modality_id", part.modality_id),
        update_data.get("inspection_form_id", part.inspection_form_id),
    )

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
    current_user: User = Depends(get_current_user),
) -> Any:
    part = db.query(InventoryPart).filter(InventoryPart.id == part_id).first()
    if not part:
        raise HTTPException(status_code=404, detail="Inventory part not found")
    require_facility_access(db, current_user, part.facility_id)
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
    part = db.query(InventoryPart).filter(InventoryPart.id == part_id).first()
    if not part:
        raise HTTPException(status_code=404, detail="Inventory part not found")
    require_facility_access(db, current_user, part.facility_id)
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
    require_facility_access(db, current_user, part.facility_id)
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
        require_facility_access(db, current_user, txn_in.to_facility_id)
        if part.quantity_on_hand < txn_in.quantity:
            raise HTTPException(status_code=400, detail="Insufficient stock for transfer")
        _validate_references(db, txn_in.to_facility_id, part.tier_id, part.modality_id, part.inspection_form_id)
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
                modality_id=part.modality_id,
                inspection_form_id=part.inspection_form_id,
                asset_tag=part.asset_tag,
                part_number=part.part_number,
                part_type=part.part_type,
                description=part.description,
                make=part.make,
                model=part.model,
                default_picture_url=part.default_picture_url,
                risk_priority=part.risk_priority,
                risk_name=part.risk_name,
                inventory_date=part.inventory_date,
                unit_price=part.unit_price,
                condition=part.condition,
                supplier_name=part.supplier_name,
                supplier_contact=part.supplier_contact,
                supplier_email=part.supplier_email,
                supplier_phone=part.supplier_phone,
                supplier_address=part.supplier_address,
                vendor_name=part.vendor_name,
                purchase_location=part.purchase_location,
                shipping_method=part.shipping_method,
                warehouse_arrival_date=part.warehouse_arrival_date,
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
    if part.facility_id:
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
