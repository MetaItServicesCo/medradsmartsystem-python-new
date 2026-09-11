"""Disciplines, technician trades, and the asset dependency graph.

Two things that look unrelated live together here because they answer the same
operational question — who and what does this job touch. Routing needs the
trade; impact analysis needs the graph; the dispatch screen calls both.
"""
from typing import Any, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.deps import get_admin_user, get_current_user
from app.db.base import get_db
from app.models.asset_link import (
    SERVICE_TYPES, AssetServesAsset, AssetServesLocation, ServiceType,
)
from app.models.discipline import Discipline, UserDiscipline
from app.models.equipment import Equipment
from app.models.service_request import ServiceRequest, ServiceRequestStatus
from app.models.user import User, UserRole
from app.schemas.discipline import (
    Discipline as DisciplineSchema, DisciplineCreate, DisciplineListResponse,
    DisciplineUpdate, TechnicianCandidate, UserDisciplineAssign,
)
from app.services import impact, work_order as work_order_service
from app.utils.facility_access import require_facility_access

router = APIRouter()


@router.get("/", response_model=DisciplineListResponse)
def list_disciplines(
    db: Session = Depends(get_db),
    include_inactive: bool = Query(False),
    current_user: User = Depends(get_current_user),
) -> Any:
    query = db.query(Discipline)
    if not include_inactive:
        query = query.filter(Discipline.is_active.is_(True))
    items = query.order_by(Discipline.sort_order.asc(), Discipline.name.asc()).all()
    return {"items": items, "total": len(items)}


@router.post("/", response_model=DisciplineSchema, status_code=201)
def create_discipline(
    payload: DisciplineCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_admin_user),
) -> Any:
    if db.query(Discipline.id).filter(Discipline.code == payload.code).first():
        raise HTTPException(status_code=409, detail=f"Discipline '{payload.code}' already exists")
    discipline = Discipline(**payload.model_dump())
    db.add(discipline)
    db.commit()
    db.refresh(discipline)
    return discipline


@router.put("/{id}", response_model=DisciplineSchema)
def update_discipline(
    id: int,
    payload: DisciplineUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_admin_user),
) -> Any:
    discipline = db.query(Discipline).filter(Discipline.id == id).first()
    if discipline is None:
        raise HTTPException(status_code=404, detail="Discipline not found")
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(discipline, field, value)
    db.commit()
    db.refresh(discipline)
    return discipline


@router.delete("/{id}")
def deactivate_discipline(
    id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_admin_user),
) -> Any:
    """Always a deactivate, never a delete.

    Assets and work orders point at disciplines. Removing one would either be
    refused by Postgres or silently null out the trade on historical work,
    which is the field a report groups by.
    """
    discipline = db.query(Discipline).filter(Discipline.id == id).first()
    if discipline is None:
        raise HTTPException(status_code=404, detail="Discipline not found")
    discipline.is_active = False
    db.commit()
    return {"detail": f"{discipline.name} deactivated"}


# ── Technician trades ────────────────────────────────────────────────────────

@router.get("/users/{user_id}", response_model=List[int])
def get_user_disciplines(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Any:
    return [
        row.discipline_id
        for row in db.query(UserDiscipline).filter(UserDiscipline.user_id == user_id).all()
    ]


@router.put("/users/{user_id}")
def set_user_disciplines(
    user_id: int,
    payload: UserDisciplineAssign,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_admin_user),
) -> Any:
    """Replace a technician's trades wholesale.

    The whole set is sent rather than individual add/remove calls, because the
    editing surface is a set of checkboxes and diffing them on the client is
    how two admins editing at once end up with the union of both.
    """
    user = db.query(User).filter(User.id == user_id).first()
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")

    valid_ids = {
        row.id for row in db.query(Discipline.id).filter(Discipline.id.in_(payload.discipline_ids)).all()
    } if payload.discipline_ids else set()
    unknown = set(payload.discipline_ids) - valid_ids
    if unknown:
        raise HTTPException(status_code=400, detail=f"Unknown discipline ids: {sorted(unknown)}")

    db.query(UserDiscipline).filter(UserDiscipline.user_id == user_id).delete(
        synchronize_session=False,
    )
    for discipline_id in payload.discipline_ids:
        db.add(UserDiscipline(
            user_id=user_id,
            discipline_id=discipline_id,
            is_primary=(discipline_id == payload.primary_discipline_id),
        ))
    db.commit()
    return {"detail": "Trades updated", "count": len(payload.discipline_ids)}


@router.get("/technicians/candidates", response_model=List[TechnicianCandidate])
def technician_candidates(
    db: Session = Depends(get_db),
    facility_id: int = Query(...),
    discipline_id: Optional[int] = Query(None),
    current_user: User = Depends(get_current_user),
) -> Any:
    """Who could take this job, best match first.

    Current open workload is included because the right answer is rarely just
    "someone qualified" — it is the qualified person who is not already holding
    nine open tickets.
    """
    require_facility_access(db, current_user, facility_id)

    candidates = work_order_service.candidate_technicians(
        db, facility_id=facility_id, discipline_id=discipline_id,
    )
    if not candidates:
        return []

    ids = [user.id for user in candidates]
    open_counts = dict(
        db.query(ServiceRequest.assigned_technician_id, func.count(ServiceRequest.id))
        .filter(
            ServiceRequest.assigned_technician_id.in_(ids),
            ServiceRequest.status.notin_([
                ServiceRequestStatus.COMPLETED, ServiceRequestStatus.CANCELLED,
            ]),
        )
        .group_by(ServiceRequest.assigned_technician_id)
        .all()
    )

    held = {}
    if discipline_id is not None:
        held = {
            row.user_id: row.is_primary
            for row in db.query(UserDiscipline).filter(
                UserDiscipline.user_id.in_(ids),
                UserDiscipline.discipline_id == discipline_id,
            ).all()
        }

    results = [
        TechnicianCandidate(
            id=user.id,
            full_name=user.full_name,
            username=user.username,
            holds_discipline=user.id in held if discipline_id is not None else False,
            is_primary_discipline=bool(held.get(user.id)),
            open_work_orders=int(open_counts.get(user.id, 0)),
        )
        for user in candidates
    ]
    results.sort(key=lambda c: (not c.is_primary_discipline, not c.holds_discipline, c.open_work_orders))
    return results


# ── Asset dependency graph ───────────────────────────────────────────────────

@router.get("/service-types")
def list_service_types(current_user: User = Depends(get_current_user)) -> Any:
    return [
        {"value": s, "label": s.replace("_", " ").title()} for s in SERVICE_TYPES
    ]


@router.get("/equipment/{equipment_id}/impact")
def equipment_impact(
    equipment_id: int,
    db: Session = Depends(get_db),
    service_type: Optional[str] = Query(None),
    include_redundant: bool = Query(
        False, description="Include assets that survive on a second feed",
    ),
    current_user: User = Depends(get_current_user),
) -> Any:
    """What goes dark if this asset stops.

    The question asked before touching anything, and the one that justifies
    holding plant and clinical assets in the same database: walking downstream
    from an electrical panel reaches the receptacle, and then the anaesthesia
    machine plugged into it.
    """
    equipment = db.query(Equipment).filter(Equipment.id == equipment_id).first()
    if equipment is None:
        raise HTTPException(status_code=404, detail="Equipment not found")
    require_facility_access(db, current_user, equipment.facility_id)

    if service_type and service_type not in SERVICE_TYPES:
        raise HTTPException(status_code=400, detail=f"Unknown service type '{service_type}'")

    return impact.assess(
        db, equipment_id, service_type=service_type, include_redundant=include_redundant,
    )


@router.get("/equipment/{equipment_id}/upstream")
def equipment_upstream(
    equipment_id: int,
    db: Session = Depends(get_db),
    service_type: Optional[str] = Query(None),
    current_user: User = Depends(get_current_user),
) -> Any:
    """What this asset depends on — the diagnosis direction."""
    equipment = db.query(Equipment).filter(Equipment.id == equipment_id).first()
    if equipment is None:
        raise HTTPException(status_code=404, detail="Equipment not found")
    require_facility_access(db, current_user, equipment.facility_id)

    rows = impact.upstream_assets(db, equipment_id, service_type=service_type)
    ids = [row["equipment_id"] for row in rows]
    assets = {
        asset.id: asset
        for asset in db.query(Equipment).filter(Equipment.id.in_(ids or [-1])).all()
    }
    for row in rows:
        asset = assets.get(row["equipment_id"])
        row["asset_tag"] = getattr(asset, "asset_tag", None)
        row["make"] = getattr(asset, "make", None)
        row["model"] = getattr(asset, "model", None)
    return {"items": rows, "total": len(rows)}


@router.post("/links/asset-to-asset", status_code=201)
def link_asset_to_asset(
    upstream_equipment_id: int = Query(...),
    downstream_equipment_id: int = Query(...),
    service_type: str = Query(...),
    connection_ref: Optional[str] = Query(None),
    is_redundant: bool = Query(False),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_admin_user),
) -> Any:
    if upstream_equipment_id == downstream_equipment_id:
        raise HTTPException(status_code=400, detail="An asset cannot feed itself")
    if service_type not in SERVICE_TYPES:
        raise HTTPException(status_code=400, detail=f"Unknown service type '{service_type}'")

    for equipment_id in (upstream_equipment_id, downstream_equipment_id):
        equipment = db.query(Equipment).filter(Equipment.id == equipment_id).first()
        if equipment is None:
            raise HTTPException(status_code=404, detail=f"Equipment {equipment_id} not found")
        require_facility_access(db, current_user, equipment.facility_id)

    # A cycle is legal in a real distribution network — ring mains and
    # cross-ties exist — so this is not refused. The traversal carries a visited
    # set precisely so that it terminates on graphs like that.
    existing = db.query(AssetServesAsset).filter(
        AssetServesAsset.upstream_equipment_id == upstream_equipment_id,
        AssetServesAsset.downstream_equipment_id == downstream_equipment_id,
        AssetServesAsset.service_type == service_type,
    ).first()
    if existing is not None:
        raise HTTPException(status_code=409, detail="That connection already exists")

    link = AssetServesAsset(
        upstream_equipment_id=upstream_equipment_id,
        downstream_equipment_id=downstream_equipment_id,
        service_type=service_type,
        connection_ref=connection_ref,
        is_redundant=is_redundant,
    )
    db.add(link)
    db.commit()
    db.refresh(link)
    return {"id": link.id, "detail": "Connection created"}


@router.post("/links/asset-to-location", status_code=201)
def link_asset_to_location(
    equipment_id: int = Query(...),
    location_id: int = Query(...),
    service_type: str = Query(...),
    is_sole_source: bool = Query(True),
    connection_ref: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_admin_user),
) -> Any:
    """Record that an asset serves a space.

    Attach at the highest wholly-served location — an air handler feeding a
    floor gets one edge to the floor, not ninety to the rooms. Impact analysis
    expands down the tree from there, so a room added next year is covered
    without anybody remembering to wire it up.
    """
    from app.models.location import Location

    if service_type not in SERVICE_TYPES:
        raise HTTPException(status_code=400, detail=f"Unknown service type '{service_type}'")

    equipment = db.query(Equipment).filter(Equipment.id == equipment_id).first()
    if equipment is None:
        raise HTTPException(status_code=404, detail="Equipment not found")
    require_facility_access(db, current_user, equipment.facility_id)

    location = db.query(Location).filter(Location.id == location_id).first()
    if location is None:
        raise HTTPException(status_code=404, detail="Location not found")
    if location.facility_id != equipment.facility_id:
        raise HTTPException(
            status_code=400, detail="Asset and location belong to different facilities",
        )

    existing = db.query(AssetServesLocation).filter(
        AssetServesLocation.equipment_id == equipment_id,
        AssetServesLocation.location_id == location_id,
        AssetServesLocation.service_type == service_type,
    ).first()
    if existing is not None:
        raise HTTPException(status_code=409, detail="That connection already exists")

    link = AssetServesLocation(
        equipment_id=equipment_id,
        location_id=location_id,
        service_type=service_type,
        is_sole_source=is_sole_source,
        connection_ref=connection_ref,
    )
    db.add(link)
    db.commit()
    db.refresh(link)
    return {"id": link.id, "detail": "Connection created"}


@router.delete("/links/asset-to-asset/{link_id}")
def unlink_asset_to_asset(
    link_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_admin_user),
) -> Any:
    link = db.query(AssetServesAsset).filter(AssetServesAsset.id == link_id).first()
    if link is None:
        raise HTTPException(status_code=404, detail="Connection not found")
    db.delete(link)
    db.commit()
    return {"detail": "Connection removed"}


@router.delete("/links/asset-to-location/{link_id}")
def unlink_asset_to_location(
    link_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_admin_user),
) -> Any:
    link = db.query(AssetServesLocation).filter(AssetServesLocation.id == link_id).first()
    if link is None:
        raise HTTPException(status_code=404, detail="Connection not found")
    db.delete(link)
    db.commit()
    return {"detail": "Connection removed"}
