from typing import Any, Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.core.deps import get_current_user, get_admin_user
from app.db.base import get_db
from app.models.user import User, UserRole
from app.models.facility import Facility
from app.models.user_facility import UserFacility
from app.schemas.facility_user import FacilityUserResponse, FacilityUserListResponse, FacilityUserUpdate, FacilityUserBulkAssign
from app.utils.notifications import create_notification

router = APIRouter()


@router.get("/", response_model=FacilityUserListResponse)
def list_facility_users(
    db: Session = Depends(get_db),
    facility_id: Optional[int] = Query(None),
    roles: Optional[str] = Query(None),
    current_user: User = Depends(get_current_user),
) -> Any:
    """List users, optionally filtered by facility_id and comma-separated roles."""
    query = db.query(User)
    if facility_id is not None:
        secondary_user_ids = db.query(UserFacility.user_id).filter(UserFacility.facility_id == facility_id)
        query = query.filter(or_(User.facility_id == facility_id, User.id.in_(secondary_user_ids)))
    if roles:
        requested_roles = []
        for role in roles.split(","):
            role = role.strip()
            if not role:
                continue
            try:
                requested_roles.append(UserRole(role))
            except ValueError:
                continue
        if requested_roles:
            query = query.filter(User.role.in_(requested_roles))
    items = query.all()
    return {"items": items, "total": len(items)}


@router.put("/{user_id}/facility", response_model=FacilityUserResponse)
def assign_user_to_facility(
    user_id: int,
    update_in: FacilityUserUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_admin_user),
) -> Any:
    """Assign or reassign a user to a facility."""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    user.facility_id = update_in.facility_id
    facility = db.query(Facility).filter(Facility.id == update_in.facility_id).first() if update_in.facility_id else None
    create_notification(
        db,
        user_id=user.id,
        title="Facility assignment updated",
        message=f"You were assigned to {facility.name if facility else 'a facility'}.",
        notification_type="facility",
        link_url="/facilities",
        actor_id=current_user.id,
    )
    db.commit()
    db.refresh(user)
    return user


@router.delete("/{user_id}/facility", response_model=FacilityUserResponse)
def remove_user_from_facility(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_admin_user),
) -> Any:
    """Remove a user from their facility (set facility_id to null)."""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    user.facility_id = None
    create_notification(
        db,
        user_id=user.id,
        title="Facility assignment removed",
        message="You were removed from your assigned facility.",
        notification_type="facility",
        link_url="/facilities",
        actor_id=current_user.id,
    )
    db.commit()
    db.refresh(user)
    return user
@router.post("/bulk-assign", response_model=dict)
def bulk_assign_users_to_facility(
    assign_in: FacilityUserBulkAssign,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_admin_user),
) -> Any:
    """Bulk assign many users to one facility."""
    from app.models.user_facility import UserFacility
    facility = db.query(Facility).filter(Facility.id == assign_in.facility_id).first()
    
    new_assignments = 0
    for uid in assign_in.user_ids:
        # Check if already assigned
        exists = db.query(UserFacility).filter(
            UserFacility.user_id == uid,
            UserFacility.facility_id == assign_in.facility_id
        ).first()
        
        if not exists:
            assignment = UserFacility(
                user_id=uid,
                facility_id=assign_in.facility_id,
                role_at_facility=None # optional
            )
            db.add(assignment)
            new_assignments += 1
            
            # If user has no primary facility, set this one
            user = db.query(User).filter(User.id == uid).first()
            if user and user.facility_id is None:
                user.facility_id = assign_in.facility_id
            if user:
                create_notification(
                    db,
                    user_id=user.id,
                    title="Facility assignment added",
                    message=f"You were assigned to {facility.name if facility else 'a facility'}.",
                    notification_type="facility",
                    link_url="/facilities",
                    actor_id=current_user.id,
                )
    
    db.commit()
    return {"detail": f"Successfully assigned {new_assignments} new users to facility."}
