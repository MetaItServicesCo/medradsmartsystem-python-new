"""Space availability — the board, the history, and the capacity report.

See the PHI boundary at the top of `app.models.space_status`. Nothing in this
module accepts or returns patient identity, and a reviewer should treat any
proposal to add it as a change of the application's regulatory class rather
than as a feature.
"""
from typing import Any, List, Optional
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.core.deps import get_current_user
from app.db.base import get_db
from app.models.location import Location
from app.models.space_status import (
    AVAILABILITIES, OOS_REASONS, SpaceStatus as SpaceStatusModel, SpaceStatusHistory,
    legal_availabilities,
)
from app.models.user import User
from app.schemas.space_status import (
    BoardSummary, DowntimeReport, SpaceStatusHistoryResponse, SpaceStatusListResponse,
    SpaceStatusSet, SpaceStatusWithLocation,
)
from app.services import space_status as space_status_service
from app.utils.facility_access import (
    get_user_facility_ids, is_facility_scoped_user, require_facility_access,
)

router = APIRouter()


def _facility_ids(db: Session, current_user: User, facility_id: Optional[int]) -> List[int]:
    if facility_id is not None:
        require_facility_access(db, current_user, facility_id)
        return [facility_id]
    if is_facility_scoped_user(current_user):
        return list(get_user_facility_ids(db, current_user))
    from app.models.facility import Facility
    return [row.id for row in db.query(Facility.id).all()]


def _decorate(status: SpaceStatusModel, location: Location | None) -> SpaceStatusWithLocation:
    payload = SpaceStatusWithLocation.model_validate(status)
    if location is not None:
        payload.location_code = location.code
        payload.location_name = location.name
        payload.location_type = location.location_type
        payload.space_use = location.space_use
        payload.criticality = location.criticality
        payload.bed_count = int(location.bed_count or 0)
    if status.since:
        payload.hours_in_state = round(
            (datetime.utcnow() - status.since).total_seconds() / 3600.0, 2,
        )
    return payload


@router.get("/meta")
def space_metadata(
    location_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Any:
    """The vocabulary, and — given a location — which of it actually applies.

    A bed never enters `in_procedure` and an operating room never sits
    `vacant_dirty`. Serving the legal subset means the client renders a picker
    that cannot produce a 400.
    """
    applicable = None
    if location_id is not None:
        location = db.query(Location).filter(Location.id == location_id).first()
        if location is None:
            raise HTTPException(status_code=404, detail="Location not found")
        require_facility_access(db, current_user, location.facility_id)
        applicable = sorted(legal_availabilities(location.space_use, location.location_type))

    return {
        "availabilities": [
            {"value": a, "label": a.replace("_", " ").title()} for a in AVAILABILITIES
        ],
        "out_of_service_reasons": [
            {"value": r, "label": r.replace("_", " ").title()} for r in OOS_REASONS
        ],
        "applicable_availabilities": applicable,
    }


@router.get("/board", response_model=BoardSummary)
def board_summary(
    db: Session = Depends(get_db),
    facility_id: Optional[int] = Query(None),
    under_location_id: Optional[int] = Query(None),
    current_user: User = Depends(get_current_user),
) -> Any:
    """Live counts — what is available right now."""
    facility_ids = _facility_ids(db, current_user, facility_id)
    if not facility_ids:
        return BoardSummary(total=0, available=0, unavailable=0, by_availability={})
    return space_status_service.current_board(
        db, facility_ids=facility_ids, location_id=under_location_id,
    )


@router.get("/", response_model=SpaceStatusListResponse)
def list_space_statuses(
    db: Session = Depends(get_db),
    facility_id: Optional[int] = Query(None),
    availability: Optional[str] = Query(None),
    oos_reason: Optional[str] = Query(None),
    space_use: Optional[str] = Query(None),
    unavailable_only: bool = Query(False),
    skip: int = 0,
    limit: int = Query(200, le=1000),
    current_user: User = Depends(get_current_user),
) -> Any:
    facility_ids = _facility_ids(db, current_user, facility_id)
    if not facility_ids:
        return {"items": [], "total": 0}

    query = (
        db.query(SpaceStatusModel, Location)
        .join(Location, Location.id == SpaceStatusModel.location_id)
        .filter(SpaceStatusModel.facility_id.in_(facility_ids))
    )
    if availability:
        query = query.filter(SpaceStatusModel.availability == availability)
    if oos_reason:
        query = query.filter(SpaceStatusModel.oos_reason == oos_reason)
    if space_use:
        query = query.filter(Location.space_use == space_use)
    if unavailable_only:
        query = query.filter(SpaceStatusModel.availability.in_(["out_of_service", "blocked"]))

    total = query.count()
    rows = (
        query.order_by(SpaceStatusModel.since.asc())
        .offset(skip).limit(limit).all()
    )
    return {"items": [_decorate(status, location) for status, location in rows], "total": total}


@router.get("/stale", response_model=SpaceStatusListResponse)
def stale_out_of_service(
    db: Session = Depends(get_db),
    facility_id: Optional[int] = Query(None),
    older_than_hours: int = Query(72, ge=1, le=8760),
    current_user: User = Depends(get_current_user),
) -> Any:
    """Spaces that have been down longer than anybody intended.

    The failure this catches: a room taken down for a two-hour job, forgotten,
    and still out of service six weeks later — quietly corrupting every
    capacity number until somebody happens to walk past it.
    """
    facility_ids = _facility_ids(db, current_user, facility_id)
    if not facility_ids:
        return {"items": [], "total": 0}

    rows = space_status_service.stale_out_of_service(
        db, facility_ids=facility_ids, older_than_hours=older_than_hours,
    )
    location_by_id = {
        location.id: location
        for location in db.query(Location).filter(
            Location.id.in_([row.location_id for row in rows] or [-1])
        ).all()
    }
    return {
        "items": [_decorate(row, location_by_id.get(row.location_id)) for row in rows],
        "total": len(rows),
    }


@router.get("/locations/{location_id}", response_model=SpaceStatusWithLocation)
def get_space_status(
    location_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Any:
    location = db.query(Location).filter(Location.id == location_id).first()
    if location is None:
        raise HTTPException(status_code=404, detail="Location not found")
    require_facility_access(db, current_user, location.facility_id)

    status = space_status_service.ensure_status(db, location)
    db.commit()
    db.refresh(status)
    return _decorate(status, location)


@router.put("/locations/{location_id}", response_model=SpaceStatusWithLocation)
def set_space_status(
    location_id: int,
    payload: SpaceStatusSet,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Any:
    """Move a space to a new state, closing the previous history interval."""
    location = db.query(Location).filter(Location.id == location_id).first()
    if location is None:
        raise HTTPException(status_code=404, detail="Location not found")
    require_facility_access(db, current_user, location.facility_id)

    if payload.work_order_id is not None:
        from app.models.service_request import ServiceRequest
        work_order = (
            db.query(ServiceRequest).filter(ServiceRequest.id == payload.work_order_id).first()
        )
        if work_order is None:
            raise HTTPException(status_code=404, detail="Work order not found")
        if work_order.facility_id != location.facility_id:
            raise HTTPException(
                status_code=400, detail="That work order belongs to a different facility",
            )

    status = space_status_service.set_status(
        db, location,
        availability=payload.availability,
        oos_reason=payload.oos_reason,
        work_order_id=payload.work_order_id,
        expected_return_at=payload.expected_return_at,
        notes=payload.notes,
        changed_by_id=current_user.id,
    )
    db.commit()
    db.refresh(status)
    return _decorate(status, location)


@router.get("/locations/{location_id}/history", response_model=SpaceStatusHistoryResponse)
def space_status_history(
    location_id: int,
    db: Session = Depends(get_db),
    since: Optional[datetime] = Query(None),
    limit: int = Query(200, le=1000),
    current_user: User = Depends(get_current_user),
) -> Any:
    location = db.query(Location).filter(Location.id == location_id).first()
    if location is None:
        raise HTTPException(status_code=404, detail="Location not found")
    require_facility_access(db, current_user, location.facility_id)

    query = db.query(SpaceStatusHistory).filter(SpaceStatusHistory.location_id == location_id)
    if since is not None:
        query = query.filter(SpaceStatusHistory.effective_from >= since)

    total = query.count()
    items = query.order_by(SpaceStatusHistory.effective_from.desc()).limit(limit).all()
    return {"items": items, "total": total}


@router.get("/reports/downtime", response_model=DowntimeReport)
def downtime(
    db: Session = Depends(get_db),
    facility_id: Optional[int] = Query(None),
    start: Optional[datetime] = Query(None),
    end: Optional[datetime] = Query(None),
    facilities_attributable_only: bool = Query(
        True, description="Exclude capacity lost to staffing and infection control",
    ),
    current_user: User = Depends(get_current_user),
) -> Any:
    """Capacity lost to spaces being unavailable.

    The number this whole design exists to produce, and one that neither a
    standalone CMMS nor a bed management system can compute on its own: the
    first does not know what the space was for, the second does not know why it
    went down.

    Defaults to the last 30 days and to facilities-attributable causes only,
    because charging plant operations for capacity lost to a staffing shortage
    would make the number worthless to the people who have to answer for it.
    """
    facility_ids = _facility_ids(db, current_user, facility_id)
    end = end or datetime.utcnow()
    start = start or (end - timedelta(days=30))

    if start >= end:
        raise HTTPException(status_code=400, detail="`start` must be before `end`")
    if not facility_ids:
        return DowntimeReport(
            start=start, end=end, incidents=0, bed_days_lost=0.0,
            procedure_room_hours_lost=0.0, other_space_hours_lost=0.0,
            minutes_by_reason={}, minutes_by_space_use={},
            facilities_attributable_only=facilities_attributable_only,
        )

    return space_status_service.downtime_report(
        db,
        facility_ids=facility_ids,
        start=start,
        end=end,
        facilities_attributable_only=facilities_attributable_only,
    )
