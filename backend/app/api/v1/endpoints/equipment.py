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
    AssetBulkResult, AssetBulkUpdate, AssetSelection,
    Equipment as EquipmentSchema, EquipmentListResponse, RoomAssetsCreate, ServesLink, ServesSpace,
)
from app.services import asset_bulk
from app.models.asset_link import SERVICE_TYPES, AssetServesLocation
from app.services import asset_tags
from app.models.discipline import Discipline
from app.models.location import Location
from app.services import asset_catalog, location_tree, room_assets
from app.utils.permissions import require_module_permission
from app.utils.inspection_schedule import next_inspection_date
from app.services import asset as asset_service
from app.utils.facility_access import require_facility_access, scope_query_to_user_facilities
from app.utils.permission_deps import require_module_access
from app.utils.read_cache import cached_read

router = APIRouter(dependencies=[Depends(require_module_access("facility-inventory"))])


def _register_query(
    db: Session, current_user: User, *, facility_id: Optional[int], search: Optional[str],
    location_id: Optional[int], kind: Optional[str], asset_type: Optional[str],
    discipline_id: Optional[int],
):
    """The register's filters, shared by the list and by bulk changes.

    One definition, so "select all 340 matching" in the browser and the 340 a
    bulk change touches cannot drift apart.
    """
    query = scope_query_to_user_facilities(db.query(Equipment), Equipment.facility_id, db, current_user)
    if facility_id is not None:
        require_facility_access(db, current_user, facility_id)
        query = query.filter(Equipment.facility_id == facility_id)
    if location_id is not None:
        anchor = db.get(Location, location_id)
        if anchor is None:
            raise HTTPException(status_code=404, detail="Location not found")
        require_facility_access(db, current_user, anchor.facility_id)
        inside = db.query(Location.id).filter(location_tree.subtree_filter(anchor))
        query = query.filter(or_(Equipment.location_id == anchor.id,
                                 Equipment.location_id.in_(inside)))
    if kind == "room_items":
        query = query.filter(Equipment.asset_type.isnot(None))
    elif kind == "equipment":
        query = query.filter(Equipment.asset_type.is_(None))
    if asset_type:
        query = query.filter(Equipment.asset_type == asset_type)
    if discipline_id is not None:
        query = query.filter(Equipment.discipline_id == discipline_id)
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
                Equipment.asset_type.ilike(like.replace(" ", "_")),
            )
        )
    return query


@router.get("/", response_model=EquipmentListResponse)
@cached_read("equipment", ttl_seconds=20)
def list_equipment(
    db: Session = Depends(get_db),
    facility_id: Optional[int] = Query(None),
    search: Optional[str] = Query(None),
    location_id: Optional[int] = Query(None, description="This space and everything inside it"),
    kind: Optional[str] = Query(None, pattern="^(room_items|equipment)$"),
    asset_type: Optional[str] = Query(None),
    discipline_id: Optional[int] = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
    current_user: User = Depends(get_current_user),
) -> Any:
    """List equipment/inventory, optionally filtered by facility_id.

    Filtered on the server: once every chair is an asset a site has thousands,
    and a register that loads them all into the browser to filter them there
    stops working at exactly the size it becomes useful.
    """
    query = _register_query(
        db, current_user, facility_id=facility_id, search=search, location_id=location_id,
        kind=kind, asset_type=asset_type, discipline_id=discipline_id,
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


@router.post("/bulk-update", response_model=AssetBulkResult)
def bulk_update(
    payload: AssetBulkUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Any:
    """Set the same details on many assets: preview first, then apply.

    All or nothing within what is allowed: assets skipped for a field (see
    app/services/asset_bulk.py) are reported, and everything else changes in
    one transaction.
    """
    require_module_permission(current_user, "facility-inventory", "edit")
    selection: AssetSelection = payload.selection

    if selection.ids is not None:
        ids = sorted(set(selection.ids))
        assets = db.query(Equipment).filter(Equipment.id.in_(ids)).all()
        if len(assets) != len(ids):
            raise HTTPException(status_code=404, detail="Some of the selected assets no longer exist")
        sites = {a.facility_id for a in assets}
        if len(sites) > 1:
            raise HTTPException(status_code=400, detail="A bulk change applies within one site")
        require_facility_access(db, current_user, sites.pop())
    else:
        query = _register_query(
            db, current_user, facility_id=selection.facility_id, search=selection.search,
            location_id=selection.location_id, kind=selection.kind,
            asset_type=selection.asset_type, discipline_id=selection.discipline_id,
        )
        matched = query.count()
        if matched > asset_bulk.MAX_ASSETS:
            raise HTTPException(
                status_code=422,
                detail=f"That filter matches {matched} assets. Narrow it to {asset_bulk.MAX_ASSETS} or fewer.",
            )
        assets = query.order_by(Equipment.id).all()

    if not assets:
        raise HTTPException(status_code=422, detail="Nothing matches that selection")

    changes = payload.changes.model_dump(exclude_none=True)
    if "discipline_id" in changes:
        asset_service.validate_placement(
            db, facility_id=assets[0].facility_id, location_id=None, parent_equipment_id=None,
            discipline_id=changes["discipline_id"], service_vendor_id=None,
        )
    try:
        result = asset_bulk.apply(db, assets, changes, dry_run=payload.dry_run)
    except ValueError as exc:
        db.rollback()
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    if payload.dry_run:
        db.rollback()
    else:
        db.commit()
    return result


@router.get("/next-tag")
def next_tag(
    facility_id: int = Query(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """The tag the next registration at this site will be given, for the form to show."""
    require_facility_access(db, current_user, facility_id)
    facility = db.get(Facility, facility_id)
    if facility is None:
        raise HTTPException(status_code=404, detail="Facility not found")
    return {"tag": asset_tags.next_tags(db, facility, 1)[0]}


@router.get("/room-item-types")
def room_item_types(db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    """The items a room can hold as assets, and the trade each goes to."""
    ids = {code: pk for code, pk in db.query(Discipline.code, Discipline.id).all()}
    return {"types": asset_catalog.catalog_payload(ids)}


@router.post("/room-items", response_model=EquipmentListResponse, status_code=201)
def add_room_items(
    payload: RoomAssetsCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Any:
    """Put several of one item in a room: twelve chairs, twelve assets, twelve tags."""
    require_module_permission(current_user, "facility-inventory", "add")
    location = db.get(Location, payload.location_id)
    if location is None:
        raise HTTPException(status_code=404, detail="Location not found")
    require_facility_access(db, current_user, location.facility_id)
    try:
        created = room_assets.create_in_room(
            db, location=location, asset_type=payload.asset_type,
            count=payload.count, discipline_code=payload.discipline_code,
            asset_tag=payload.asset_tag, serial_number=payload.serial_number,
            make=payload.make, model=payload.model, cost=payload.cost,
            installation_date=payload.installation_date, description=payload.description,
        )
    except ValueError as exc:
        db.rollback()
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    db.commit()
    for asset in created:
        db.refresh(asset)
    return {"items": created, "total": len(created)}


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


def _validate_serves(db: Session, facility_id: int, serves: list[ServesSpace]) -> list[ServesSpace]:
    """Every served space exists, is at this site, and is supplied with something known."""
    seen: set[tuple[int, str]] = set()
    kept: list[ServesSpace] = []
    for item in serves:
        if item.service_type not in SERVICE_TYPES:
            raise HTTPException(status_code=422, detail=f"Unknown service type '{item.service_type}'")
        location = db.get(Location, item.location_id)
        if location is None:
            raise HTTPException(status_code=404, detail="A space it serves was not found")
        if location.facility_id != facility_id:
            raise HTTPException(status_code=400, detail=f"{location.code} belongs to a different site")
        key = (item.location_id, item.service_type)
        if key not in seen:
            seen.add(key)
            kept.append(item)
    return kept


def _issue_or_check_tag(db: Session, facility: Facility, tag: str, exclude_id: int | None = None) -> str:
    tag = (tag or "").strip()
    if not tag:
        return asset_tags.next_tags(db, facility, 1)[0]
    owner = asset_tags.tag_owner(db, facility.id, tag, exclude_id=exclude_id)
    if owner is not None:
        raise HTTPException(status_code=409, detail=asset_tags.describe_owner(owner))
    return tag


@router.post("/", response_model=EquipmentSchema, status_code=201)
def create_equipment(
    equip_in: EquipmentCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Any:
    """Register an asset: plant, clinical equipment, or anything else with a tag."""
    facility = db.query(Facility).filter(Facility.id == equip_in.facility_id).first()
    if not facility:
        raise HTTPException(status_code=404, detail="Facility not found")
    require_facility_access(db, current_user, equip_in.facility_id)
    create_data = equip_in.model_dump(exclude={"serves"})
    create_data["next_generated_pm_date"] = next_inspection_date(
        equip_in.last_pm_date,
        equip_in.pm_scheduling,
    )
    # Blank means issue the next one; typed means keep the sticker, if no other
    # asset at this site already carries it.
    create_data["asset_tag"] = _issue_or_check_tag(db, facility, equip_in.asset_tag)

    # The MEP foreign keys cross facility boundaries if nothing checks them, and
    # the payload goes through model_dump() wholesale.
    asset_service.validate_placement(
        db,
        facility_id=equip_in.facility_id,
        location_id=create_data.get("location_id"),
        parent_equipment_id=create_data.get("parent_equipment_id"),
        discipline_id=create_data.get("discipline_id"),
        service_vendor_id=create_data.get("service_vendor_id"),
    )
    serves = _validate_serves(db, equip_in.facility_id, equip_in.serves)
    # Criticality comes from the most critical of where it is and what it
    # serves, unless given: an air handler in an ordinary plant room serving
    # the theatres is as critical as the theatres.
    create_data["criticality"] = asset_service.inherit_criticality(
        db, location_id=create_data.get("location_id"), explicit=create_data.get("criticality"),
        served_location_ids=[s.location_id for s in serves],
    )
    # Seed the book life from the trade — a lift is twenty years, a clinical
    # monitor is seven — so nobody types one four hundred times. Overridable,
    # and finance will have opinions about some of them.
    if not create_data.get("useful_life_years") and create_data.get("discipline_id"):
        from app.models.discipline import Discipline
        from app.services import depreciation as depreciation_service

        row = db.query(Discipline.code).filter(
            Discipline.id == create_data["discipline_id"]
        ).first()
        create_data["useful_life_years"] = depreciation_service.default_useful_life(
            row[0] if row else None,
        )
    asset = Equipment(**create_data)
    db.add(asset)
    db.flush()
    for item in serves:
        db.add(AssetServesLocation(equipment_id=asset.id, location_id=item.location_id,
                                   service_type=item.service_type))
    db.commit()
    db.refresh(asset)
    return asset


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
    if "asset_tag" in update_data:
        tag = (update_data["asset_tag"] or "").strip()
        if not tag:
            raise HTTPException(status_code=422, detail="An asset keeps a tag; it cannot be cleared")
        facility = db.get(Facility, target_facility_id or item.facility_id)
        update_data["asset_tag"] = _issue_or_check_tag(db, facility, tag, exclude_id=item.id)
    for key in ("make", "model", "serial_number"):
        if key in update_data and update_data[key] is None:
            update_data[key] = ""
    if target_facility_id is not None and target_facility_id != item.facility_id:
        facility = db.query(Facility.id).filter(Facility.id == target_facility_id).first()
        if not facility:
            raise HTTPException(status_code=404, detail="Target facility not found")
        require_facility_access(db, current_user, target_facility_id)
    if "last_pm_date" in update_data or "pm_scheduling" in update_data:
        last_inspection_date = update_data.get("last_pm_date", item.last_pm_date)
        schedule = update_data.get("pm_scheduling", item.pm_scheduling)
        update_data["next_generated_pm_date"] = next_inspection_date(last_inspection_date, schedule)

    # Validate against the facility the asset will end up in, not the one it is
    # leaving — a move and a re-placement can arrive in the same request.
    if any(field in update_data for field in
           ("location_id", "parent_equipment_id", "discipline_id", "service_vendor_id")):
        asset_service.validate_placement(
            db,
            facility_id=target_facility_id or item.facility_id,
            location_id=update_data.get("location_id", item.location_id),
            parent_equipment_id=update_data.get("parent_equipment_id", item.parent_equipment_id),
            discipline_id=update_data.get("discipline_id", item.discipline_id),
            service_vendor_id=update_data.get("service_vendor_id", item.service_vendor_id),
            equipment_id=item.id,
        )
    before_location = item.location_id
    before_served = asset_service.served_location_ids(db, item.id)
    updated = crud.equipment.update(db=db, db_obj=item, obj_in=update_data)
    # A moved asset takes its new room's criticality, unless somebody set it.
    if "location_id" in update_data and "criticality" not in update_data \
            and update_data["location_id"] != before_location:
        asset_service.rederive_if_inherited(
            db, updated, before_location_id=before_location, before_served=before_served,
        )
        db.commit()
        db.refresh(updated)
    return updated


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


def _asset_or_404(db: Session, equipment_id: int, user: User) -> Equipment:
    asset = db.get(Equipment, equipment_id)
    if asset is None:
        raise HTTPException(status_code=404, detail="Equipment not found")
    require_facility_access(db, user, asset.facility_id)
    return asset


def _serves_rows(db: Session, equipment_id: int) -> list[ServesLink]:
    rows = (
        db.query(AssetServesLocation, Location)
        .join(Location, Location.id == AssetServesLocation.location_id)
        .filter(AssetServesLocation.equipment_id == equipment_id)
        .order_by(Location.path)
        .all()
    )
    return [ServesLink(id=link.id, location_id=loc.id, code=loc.code, name=loc.name,
                       location_type=loc.location_type, criticality=loc.criticality,
                       service_type=link.service_type) for link, loc in rows]


@router.get("/{equipment_id}/serves", response_model=list[ServesLink])
def list_serves(
    equipment_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """The spaces this asset supplies."""
    _asset_or_404(db, equipment_id, current_user)
    return _serves_rows(db, equipment_id)


@router.post("/{equipment_id}/serves", response_model=list[ServesLink], status_code=201)
def add_serves(
    equipment_id: int,
    payload: ServesSpace,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Record that this asset supplies a space, and raise its criticality to match.

    Open to anyone who can edit assets at the site. The general link endpoint
    is admin-only, which left a facility manager registering an air handler
    unable to say what it feeds.
    """
    require_module_permission(current_user, "facility-inventory", "edit")
    asset = _asset_or_404(db, equipment_id, current_user)
    [item] = _validate_serves(db, asset.facility_id, [payload])
    exists = db.query(AssetServesLocation.id).filter(
        AssetServesLocation.equipment_id == asset.id,
        AssetServesLocation.location_id == item.location_id,
        AssetServesLocation.service_type == item.service_type,
    ).first()
    if exists:
        raise HTTPException(status_code=409, detail="It already serves that space with that")
    before_served = asset_service.served_location_ids(db, asset.id)
    db.add(AssetServesLocation(equipment_id=asset.id, location_id=item.location_id,
                               service_type=item.service_type))
    db.flush()
    asset_service.rederive_if_inherited(db, asset, before_location_id=asset.location_id,
                                        before_served=before_served)
    db.commit()
    return _serves_rows(db, asset.id)


@router.delete("/{equipment_id}/serves/{link_id}", response_model=list[ServesLink])
def remove_serves(
    equipment_id: int,
    link_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    require_module_permission(current_user, "facility-inventory", "edit")
    asset = _asset_or_404(db, equipment_id, current_user)
    link = db.query(AssetServesLocation).filter(
        AssetServesLocation.id == link_id, AssetServesLocation.equipment_id == asset.id,
    ).first()
    if link is None:
        raise HTTPException(status_code=404, detail="Connection not found")
    before_served = asset_service.served_location_ids(db, asset.id)
    db.delete(link)
    db.flush()
    asset_service.rederive_if_inherited(db, asset, before_location_id=asset.location_id,
                                        before_served=before_served)
    db.commit()
    return _serves_rows(db, asset.id)
