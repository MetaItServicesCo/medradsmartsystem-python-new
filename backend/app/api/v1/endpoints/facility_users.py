from typing import Any, Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.core.deps import get_current_user, get_admin_user, require_roles
from app.db.base import get_db
from app.models.user import User, UserRole
from app.models.facility import Facility
from app.models.user_facility import UserFacility
from app.schemas.facility_user import FacilityManagerRoleUpdate, FacilityUserResponse, FacilityUserListResponse, FacilityUserUpdate, FacilityUserBulkAssign
from app.utils.notifications import create_notification
from app.utils.facility_access import get_user_facility_ids, is_facility_scoped_user, require_facility_access
from app.utils.permission_deps import require_module_access

router = APIRouter()
get_superadmin_user = require_roles("superadmin")
FACILITY_MANAGER_ROLES = {UserRole.FACILITY_ADMIN, UserRole.FACILITY_MANAGER}


@router.get("/", response_model=FacilityUserListResponse)
def list_facility_users(
    db: Session = Depends(get_db),
    facility_id: Optional[int] = Query(None),
    roles: Optional[str] = Query(None),
    current_user: User = Depends(get_current_user),
) -> Any:
    """List users, optionally filtered by facility_id and comma-separated roles."""
    query = db.query(User)
    if is_facility_scoped_user(current_user):
        allowed_facility_ids = get_user_facility_ids(db, current_user)
        secondary_user_ids = db.query(UserFacility.user_id).filter(UserFacility.facility_id.in_(allowed_facility_ids))
        query = query.filter(or_(User.facility_id.in_(allowed_facility_ids), User.id.in_(secondary_user_ids)))
    if facility_id is not None:
        require_facility_access(db, current_user, facility_id)
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
    items = query.order_by(User.created_at.desc(), User.id.desc()).all()
    return {"items": items, "total": len(items)}


@router.get("/manager-candidates", response_model=FacilityUserListResponse)
def list_facility_manager_candidates(
    db: Session = Depends(get_db),
    facility_id: int = Query(...),
    search: Optional[str] = Query(None),
    limit: int = Query(50, ge=1, le=100),
    current_user: User = Depends(get_superadmin_user),
) -> Any:
    """Search active users who can be assigned as facility admin/manager.

    The assignment action itself attaches the user to the facility if needed,
    so this endpoint intentionally is not limited to already-attached users.
    """
    facility = db.query(Facility.id).filter(Facility.id == facility_id).first()
    if not facility:
        raise HTTPException(status_code=404, detail="Facility not found")

    query = db.query(User).filter(
        User.is_active.is_(True),
        User.role.notin_([UserRole.SUPERADMIN, UserRole.ADMIN]),
    )
    if search and search.strip():
        like = f"%{search.strip()}%"
        query = query.filter(
            or_(
                User.full_name.ilike(like),
                User.username.ilike(like),
                User.email.ilike(like),
            )
        )

    items = query.order_by(User.full_name.asc(), User.id.asc()).limit(limit).all()
    return {"items": items, "total": len(items)}


@router.get("/assignment-candidates", response_model=FacilityUserListResponse)
def list_facility_assignment_candidates(
    facility_id: int = Query(..., ge=1),
    search: Optional[str] = Query(None),
    limit: int = Query(50, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_module_access("users")),
) -> Any:
    """Search active non-system users not already attached to a facility."""
    facility = db.query(Facility.id).filter(Facility.id == facility_id).first()
    if not facility:
        raise HTTPException(status_code=404, detail="Facility not found")
    require_facility_access(db, current_user, facility_id)

    secondary_user_ids = db.query(UserFacility.user_id).filter(UserFacility.facility_id == facility_id)
    query = db.query(User).filter(
        User.is_active.is_(True),
        User.role.notin_([UserRole.SUPERADMIN, UserRole.ADMIN]),
        or_(User.facility_id.is_(None), User.facility_id != facility_id),
        User.id.notin_(secondary_user_ids),
    )
    if search and search.strip():
        like = f"%{search.strip()}%"
        query = query.filter(or_(
            User.full_name.ilike(like),
            User.username.ilike(like),
            User.email.ilike(like),
        ))

    total = query.count()
    items = query.order_by(User.full_name.asc(), User.id.asc()).limit(limit).all()
    return {"items": items, "total": total}


@router.put("/{facility_id}/managers/{user_id}", response_model=FacilityUserResponse)
def assign_facility_manager_role(
    facility_id: int,
    user_id: int,
    role_in: FacilityManagerRoleUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_superadmin_user),
) -> Any:
    """Attach/promote a user to facility admin or facility manager."""
    facility = db.query(Facility).filter(Facility.id == facility_id).first()
    if not facility:
        raise HTTPException(status_code=404, detail="Facility not found")

    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if not user.is_active:
        raise HTTPException(status_code=400, detail="Inactive users cannot be assigned as facility managers")
    if user.role in {UserRole.SUPERADMIN, UserRole.ADMIN}:
        raise HTTPException(status_code=400, detail="System admins cannot be reassigned as facility managers")

    try:
        target_role = UserRole(role_in.role)
    except ValueError:
        raise HTTPException(status_code=400, detail=f"Invalid role: {role_in.role}")
    if target_role not in FACILITY_MANAGER_ROLES:
        raise HTTPException(status_code=400, detail="Role must be facility_admin or facility_manager")

    assignment = db.query(UserFacility).filter(
        UserFacility.user_id == user_id,
        UserFacility.facility_id == facility_id,
    ).first()
    if not assignment:
        assignment = UserFacility(
            user_id=user_id,
            facility_id=facility_id,
            role_at_facility=target_role.value,
        )
        db.add(assignment)
    else:
        assignment.role_at_facility = target_role.value

    if user.facility_id is None:
        user.facility_id = facility_id
    user.role = target_role
    user.permissions = None
    create_notification(
        db,
        user_id=user.id,
        title="Facility role updated",
        message=f"You are now {target_role.value.replace('_', ' ')} for {facility.name}.",
        notification_type="facility",
        link_url="/facilities",
        actor_id=current_user.id,
    )
    db.commit()
    db.refresh(user)
    return user


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
    current_user: User = Depends(require_module_access("users")),
) -> Any:
    """Attach existing users without changing their roles or other assignments."""
    facility = (
        db.query(Facility)
        .filter(Facility.id == assign_in.facility_id)
        .with_for_update()
        .first()
    )
    if not facility:
        raise HTTPException(status_code=404, detail="Facility not found")
    require_facility_access(db, current_user, facility.id)

    user_ids = sorted(set(assign_in.user_ids))
    users = (
        db.query(User)
        .filter(User.id.in_(user_ids))
        .order_by(User.id.asc())
        .with_for_update()
        .all()
    )
    users_by_id = {user.id: user for user in users}
    missing_ids = [user_id for user_id in user_ids if user_id not in users_by_id]
    if missing_ids:
        raise HTTPException(status_code=404, detail=f"Users not found: {', '.join(map(str, missing_ids))}")
    inactive_users = [user.full_name for user in users if not user.is_active]
    if inactive_users:
        raise HTTPException(status_code=400, detail=f"Inactive users cannot be assigned: {', '.join(inactive_users)}")
    system_users = [user.full_name for user in users if user.role in {UserRole.SUPERADMIN, UserRole.ADMIN}]
    if system_users:
        raise HTTPException(status_code=400, detail="System administrators cannot be attached to a facility")

    new_assignments = 0
    for user_id in user_ids:
        user = users_by_id[user_id]
        exists = db.query(UserFacility).filter(
            UserFacility.user_id == user_id,
            UserFacility.facility_id == facility.id,
        ).first()
        if exists or user.facility_id == facility.id:
            continue

        role_at_facility = user.role.value if user.role in FACILITY_MANAGER_ROLES else None
        db.add(UserFacility(
            user_id=user.id,
            facility_id=facility.id,
            role_at_facility=role_at_facility,
        ))
        new_assignments += 1

        if user.facility_id is None:
            user.facility_id = facility.id
        create_notification(
            db,
            user_id=user.id,
            title="Facility assignment added",
            message=f"You were assigned to {facility.name}.",
            notification_type="facility",
            link_url="/facilities",
            actor_id=current_user.id,
        )

    db.commit()
    return {
        "detail": f"Successfully assigned {new_assignments} new user{'s' if new_assignments != 1 else ''} to {facility.name}.",
        "assigned": new_assignments,
        "already_assigned": len(user_ids) - new_assignments,
    }
