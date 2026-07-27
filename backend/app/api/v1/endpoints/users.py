import os
import uuid
from datetime import datetime
from typing import Any, Optional, List
from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File, status
from sqlalchemy import or_, text
from sqlalchemy.orm import Session

from app.core.deps import get_current_user, get_admin_user, require_roles
from app.utils.permission_deps import require_module_access
from app.db.base import get_db
from app.models.user import User, UserRole, UserType
from app.models.user_facility import UserFacility
from app.models.facility import Facility
from app.crud.crud_user import user as crud_user
from app.schemas.user import (
    UserCreate, UserUpdate, UserResponse, UserListResponse,
    UserProfileUpdate, UserRoleUpdate, UserSearchResponse, FacilityBrief,
    UserPermissionsUpdate, PermissionCatalogResponse,
)
from app.core.security import create_access_token, get_password_hash
from app.utils.logging import log_activity
from app.utils.notifications import create_notification
from app.utils.facility_access import get_user_facility_ids, is_facility_scoped_user, require_facility_access
from app.utils.list_search import contains_ci, normalize_list_search, predicates_for_field, value_contains_ci

router = APIRouter()

get_superadmin_user = require_roles("superadmin")
get_superadmin_or_hr = require_roles("superadmin", "hr_manager")
PROFILE_UPLOAD_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "..", "..", "uploads", "profile_pictures")
ALLOWED_PROFILE_IMAGE_TYPES = {"image/jpeg", "image/png", "image/gif", "image/webp"}
MAX_PROFILE_IMAGE_SIZE = 5 * 1024 * 1024
PERMISSION_ACTIONS = ["index", "view", "add", "edit", "delete"]
PERMISSION_SCOPES = ["all", "facility", "assigned", "own", "none"]
PERMISSION_MODULES = [
    {"key": "dashboard", "label": "Dashboard"},
    {"key": "facilities", "label": "Facilities"},
    {"key": "users", "label": "Users"},
    {"key": "service-requests", "label": "Service Requests"},
    {"key": "inspections", "label": "Inspections"},
    {"key": "sales", "label": "Sales"},
    {"key": "rentals", "label": "Rentals"},
    {"key": "facility-inventory", "label": "Facility Inventory"},
    {"key": "inventory", "label": "Parts Inventory"},
    {"key": "test-equipment", "label": "Test Equipment"},
    {"key": "reports", "label": "Reports"},
    {"key": "billing", "label": "Billing"},
    {"key": "hr", "label": "HR"},
    {"key": "attendance", "label": "Smart Attendance"},
    {"key": "my-timesheets", "label": "My Timesheets"},
    {"key": "my-leave", "label": "My Leave"},
    {"key": "calendar", "label": "Calendar"},
    {"key": "chat", "label": "Chat"},
]
PERMISSION_MODULE_ALIASES = {
    "service_requests": "service-requests",
    "test_equipment": "test-equipment",
    "facility_inventory": "facility-inventory",
    "equipment": "facility-inventory",
    "inventory_parts": "inventory",
    "inventory_tiers": "inventory",
    "modalities": "inventory",
    "inspection_quotations": "inspections",
    "notifications": "dashboard",
    "audit_logs": "dashboard",
}


def _build_user_response(
    db_user: User,
    db: Session,
    assigned_facilities: Optional[list[Facility]] = None,
) -> dict:
    """Build a UserResponse dict including the user's assigned facilities."""
    if assigned_facilities is None:
        user_facs = (
            db.query(Facility)
            .join(UserFacility, UserFacility.facility_id == Facility.id)
            .filter(UserFacility.user_id == db_user.id)
            .all()
        )
        if db_user.facility_id and not any(f.id == db_user.facility_id for f in user_facs):
            primary_fac = db.query(Facility).filter(Facility.id == db_user.facility_id).first()
            if primary_fac:
                user_facs.append(primary_fac)
    else:
        user_facs = assigned_facilities
                
    facilities = [FacilityBrief(id=f.id, name=f.name) for f in user_facs]
    return UserResponse(
        id=db_user.id,
        username=db_user.username,
        email=db_user.email,
        full_name=db_user.full_name,
        phone=db_user.phone,
        avatar_url=db_user.avatar_url,
        user_type=db_user.user_type.value if db_user.user_type else "employee",
        role=db_user.role.value if db_user.role else "employee",
        is_active=db_user.is_active,
        facility_id=db_user.facility_id,
        permissions=db_user.permissions or {},
        created_at=db_user.created_at,
        updated_at=db_user.updated_at,
        facilities=facilities,
    )


def _apply_user_list_search(
    query,
    search: Optional[str],
    search_field: Optional[str] = None,
):
    search_term = normalize_list_search(search)
    if not search_term:
        return query

    identifier_term = search_term.lstrip("#")
    normalized_value = search_term.lower().replace("-", "_").replace(" ", "_")
    # SQLAlchemy's correlated EXISTS keeps the user result set unique while
    # searching both primary and additional facility assignments.
    primary_facility_match = (
        Facility.id == User.facility_id
    ) & contains_ci(Facility.name, search_term)
    primary_facility_exists = query.session.query(Facility.id).filter(primary_facility_match).exists()
    secondary_facility_exists = (
        query.session.query(UserFacility.id)
        .join(Facility, Facility.id == UserFacility.facility_id)
        .filter(
            UserFacility.user_id == User.id,
            contains_ci(Facility.name, search_term),
        )
        .exists()
    )
    status_predicates = []
    if "active".startswith(search_term.lower()):
        status_predicates.append(User.is_active.is_(True))
    if "inactive".startswith(search_term.lower()) or "disabled".startswith(search_term.lower()):
        status_predicates.append(User.is_active.is_(False))

    search_by_field = {
        "id": [value_contains_ci(User.id, identifier_term)],
        "user": [
            contains_ci(User.full_name, search_term),
            contains_ci(User.email, search_term),
            contains_ci(User.phone, search_term),
        ],
        "username": [contains_ci(User.username, search_term)],
        "email": [contains_ci(User.email, search_term)],
        "phone": [contains_ci(User.phone, search_term)],
        "role": [value_contains_ci(User.role, normalized_value)],
        "type": [value_contains_ci(User.user_type, normalized_value)],
        "facility": [primary_facility_exists, secondary_facility_exists],
        "status": status_predicates,
    }
    return query.filter(or_(*predicates_for_field(search_field, search_by_field)))


@router.get("/me", response_model=UserResponse)
def get_own_profile(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Any:
    """Return the authenticated user's profile."""
    db.refresh(current_user)
    return _build_user_response(current_user, db)


@router.put("/me", response_model=UserResponse)
def update_own_profile(
    profile_in: UserProfileUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Any:
    """Allow any authenticated user to update their own profile details."""
    update_data = profile_in.model_dump(exclude_unset=True)
    if "email" in update_data and update_data["email"] != current_user.email:
        existing = crud_user.get_by_email(db, email=update_data["email"])
        if existing and existing.id != current_user.id:
            raise HTTPException(status_code=400, detail="Email already taken")

    before = {
        "email": current_user.email,
        "full_name": current_user.full_name,
        "phone": current_user.phone,
        "has_password_change": False,
    }

    if "email" in update_data:
        current_user.email = update_data["email"]
    if "full_name" in update_data:
        current_user.full_name = update_data["full_name"]
    if "phone" in update_data:
        current_user.phone = update_data["phone"]
    if update_data.get("password"):
        current_user.hashed_password = get_password_hash(update_data["password"])

    current_user.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(current_user)

    after = {
        "email": current_user.email,
        "full_name": current_user.full_name,
        "phone": current_user.phone,
        "has_password_change": bool(update_data.get("password")),
    }
    log_activity(db, "users", current_user.id, "PROFILE_UPDATED", current_user, {"before": before, "after": after})
    create_notification(
        db,
        user_id=current_user.id,
        title="Profile updated",
        message="Your profile settings were updated.",
        notification_type="profile",
        link_url="/profile",
        actor_id=current_user.id,
    )
    db.commit()
    return _build_user_response(current_user, db)


@router.post("/me/profile-picture", response_model=UserResponse)
async def upload_own_profile_picture(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Any:
    """Upload and assign the authenticated user's profile picture."""
    if file.content_type not in ALLOWED_PROFILE_IMAGE_TYPES:
        raise HTTPException(status_code=400, detail="Profile picture must be JPEG, PNG, GIF, or WebP")

    content = await file.read()
    if len(content) > MAX_PROFILE_IMAGE_SIZE:
        raise HTTPException(status_code=400, detail="Profile picture must be 5MB or smaller")

    os.makedirs(PROFILE_UPLOAD_DIR, exist_ok=True)
    file_ext = os.path.splitext(file.filename or "")[1].lower()
    if file_ext not in {".jpg", ".jpeg", ".png", ".gif", ".webp"}:
        file_ext = ".jpg"
    stored_name = f"{current_user.id}_{uuid.uuid4().hex}{file_ext}"
    file_path = os.path.join(PROFILE_UPLOAD_DIR, stored_name)

    with open(file_path, "wb") as f:
        f.write(content)

    before = {"avatar_url": current_user.avatar_url}
    current_user.avatar_url = f"/uploads/profile_pictures/{stored_name}"
    current_user.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(current_user)

    log_activity(db, "users", current_user.id, "PROFILE_PICTURE_UPDATED", current_user, {"before": before, "after": {"avatar_url": current_user.avatar_url}})
    create_notification(
        db,
        user_id=current_user.id,
        title="Profile picture updated",
        message="Your profile picture was changed.",
        notification_type="profile",
        link_url="/profile",
        actor_id=current_user.id,
    )
    db.commit()
    return _build_user_response(current_user, db)



@router.post("/", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
def create_user(
    user_in: UserCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_module_access("users")),
) -> Any:
    """Create a new user (requires users.add permission)."""
    # Check for duplicate username or email
    existing = crud_user.get_by_username(db, username=user_in.username)
    if existing:
        raise HTTPException(status_code=400, detail="Username already registered")
    existing = crud_user.get_by_email(db, email=user_in.email)
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")

    facility_ids = list(dict.fromkeys(user_in.facility_ids or []))
    for facility_id in facility_ids:
        facility = db.query(Facility).filter(Facility.id == facility_id).first()
        if not facility:
            raise HTTPException(status_code=400, detail=f"Facility #{facility_id} not found")
        require_facility_access(db, current_user, facility_id)

    db_user = crud_user.create(db, obj_in=user_in)

    # Assign facilities if provided
    if facility_ids:
        for fac_id in facility_ids:
            uf = UserFacility(user_id=db_user.id, facility_id=fac_id)
            db.add(uf)
        # Also set the first facility as primary
        db_user.facility_id = facility_ids[0]
        db.commit()
        db.refresh(db_user)

    create_notification(
        db,
        user_id=db_user.id,
        title="Your account was created",
        message=f"{current_user.full_name or current_user.username} created your Medrad account.",
        notification_type="user",
        link_url="/profile",
        actor_id=current_user.id,
    )
    log_activity(db, "users", db_user.id, "CREATE", current_user, user_in.model_dump(exclude={"password"}))
    db.commit()
    return _build_user_response(db_user, db)


@router.get("/", response_model=UserListResponse)
def list_users(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=500),
    role: Optional[str] = Query(None),
    is_active: Optional[bool] = Query(None),
    search: Optional[str] = Query(None),
    search_field: Optional[str] = Query(None),
    facility_id: Optional[int] = Query(None, ge=1),
) -> Any:
    """List all users with optional filters."""
    if facility_id is not None:
        facility = db.query(Facility.id).filter(Facility.id == facility_id).first()
        if not facility:
            raise HTTPException(status_code=404, detail="Facility not found")

        require_facility_access(db, current_user, facility_id)
        secondary_user_ids = db.query(UserFacility.user_id).filter(UserFacility.facility_id == facility_id)
        query = db.query(User).filter(
            (User.facility_id == facility_id) | (User.id.in_(secondary_user_ids))
        )
        if role:
            query = query.filter(User.role == role)
        if is_active is not None:
            query = query.filter(User.is_active == is_active)
        query = _apply_user_list_search(query, search, search_field)
        total = query.count()
        items = query.order_by(User.created_at.desc(), User.id.desc()).offset(skip).limit(limit).all()
    elif is_facility_scoped_user(current_user):
        allowed_facility_ids = get_user_facility_ids(db, current_user)
        secondary_user_ids = db.query(UserFacility.user_id).filter(UserFacility.facility_id.in_(allowed_facility_ids))
        query = db.query(User).filter(
            (User.facility_id.in_(allowed_facility_ids)) | (User.id.in_(secondary_user_ids))
        )
        if role:
            query = query.filter(User.role == role)
        if is_active is not None:
            query = query.filter(User.is_active == is_active)
        query = _apply_user_list_search(query, search, search_field)
        total = query.count()
        items = query.order_by(User.created_at.desc(), User.id.desc()).offset(skip).limit(limit).all()
    else:
        query = db.query(User)
        if role:
            query = query.filter(User.role == role)
        if is_active is not None:
            query = query.filter(User.is_active == is_active)
        query = _apply_user_list_search(query, search, search_field)
        total = query.count()
        items = query.order_by(User.created_at.desc(), User.id.desc()).offset(skip).limit(limit).all()

    user_ids = [item.id for item in items]
    facilities_by_user: dict[int, dict[int, Facility]] = {user_id: {} for user_id in user_ids}
    if user_ids:
        primary_facility_ids = {item.facility_id for item in items if item.facility_id}
        primary_facilities = {
            facility.id: facility
            for facility in db.query(Facility).filter(Facility.id.in_(primary_facility_ids)).all()
        } if primary_facility_ids else {}
        for item in items:
            if item.facility_id and item.facility_id in primary_facilities:
                facilities_by_user[item.id][item.facility_id] = primary_facilities[item.facility_id]
        for user_id, facility in (
            db.query(UserFacility.user_id, Facility)
            .join(Facility, Facility.id == UserFacility.facility_id)
            .filter(UserFacility.user_id.in_(user_ids))
            .all()
        ):
            facilities_by_user[user_id][facility.id] = facility

    user_responses = [
        _build_user_response(item, db, list(facilities_by_user.get(item.id, {}).values()))
        for item in items
    ]
    return {"items": user_responses, "total": total}


@router.get("/search", response_model=List[UserSearchResponse])
def search_users(
    q: str = Query(..., min_length=1),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=50),
) -> Any:
    """Search users by name, email, or username (for chat feature)."""
    if is_facility_scoped_user(current_user):
        allowed_facility_ids = get_user_facility_ids(db, current_user)
        secondary_user_ids = db.query(UserFacility.user_id).filter(UserFacility.facility_id.in_(allowed_facility_ids))
        like = f"%{q}%"
        results = (
            db.query(User)
            .filter(
                ((User.facility_id.in_(allowed_facility_ids)) | (User.id.in_(secondary_user_ids)))
                & ((User.full_name.ilike(like)) | (User.username.ilike(like)) | (User.email.ilike(like)))
            )
            .offset(skip)
            .limit(limit)
            .all()
        )
    else:
        results = crud_user.search(db, query=q, skip=skip, limit=limit)
    # Exclude the searching user from results
    return [u for u in results if u.id != current_user.id]


@router.get("/permissions/catalog", response_model=PermissionCatalogResponse)
def get_permission_catalog(
    current_user: User = Depends(get_superadmin_user),
) -> Any:
    """Return the modules/actions available in the permission editor."""
    return {
        "modules": PERMISSION_MODULES,
        "actions": PERMISSION_ACTIONS,
        "scopes": PERMISSION_SCOPES,
    }


@router.get("/{user_id}/permissions", response_model=UserResponse)
def get_user_permissions(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_superadmin_user),
) -> Any:
    """Return a user with their saved permissions (super admin only)."""
    db_user = crud_user.get(db, id=user_id)
    if not db_user:
        raise HTTPException(status_code=404, detail="User not found")
    return _build_user_response(db_user, db)


@router.put("/{user_id}/permissions", response_model=UserResponse)
def update_user_permissions(
    user_id: int,
    permissions_in: UserPermissionsUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_superadmin_user),
) -> Any:
    """Update per-module permissions for a user (super admin only)."""
    db_user = crud_user.get(db, id=user_id)
    if not db_user:
        raise HTTPException(status_code=404, detail="User not found")

    allowed_modules = {module["key"] for module in PERMISSION_MODULES}
    sanitized = {}
    for module_key, rule in permissions_in.permissions.items():
        module_key = PERMISSION_MODULE_ALIASES.get(module_key, module_key)
        if module_key not in allowed_modules:
            continue
        rule_data = rule.model_dump()
        if rule_data["scope"] not in PERMISSION_SCOPES:
            rule_data["scope"] = "own"
        sanitized[module_key] = rule_data

    before = db_user.permissions or {}
    db_user.permissions = sanitized
    db_user.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(db_user)

    log_activity(db, "users", user_id, "UPDATE_PERMISSIONS", current_user, {"before": before, "after": sanitized})
    create_notification(
        db,
        user_id=user_id,
        title="Your permissions were updated",
        message=f"{current_user.full_name or current_user.username} updated your module access.",
        notification_type="user",
        link_url="/profile",
        actor_id=current_user.id,
    )
    db.commit()
    return _build_user_response(db_user, db)


@router.get("/{user_id}", response_model=UserResponse)
def get_user(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Any:
    """Get a single user by ID."""
    db_user = crud_user.get(db, id=user_id)
    if not db_user:
        raise HTTPException(status_code=404, detail="User not found")
    if is_facility_scoped_user(current_user):
        allowed_facility_ids = get_user_facility_ids(db, current_user)
        target_facility_ids = get_user_facility_ids(db, db_user)
        if db_user.id != current_user.id and not (allowed_facility_ids & target_facility_ids):
            raise HTTPException(status_code=404, detail="User not found")
    return _build_user_response(db_user, db)


@router.put("/{user_id}", response_model=UserResponse)
def update_user(
    user_id: int,
    user_in: UserUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_module_access("users")),
) -> Any:
    """Update a user (super admin only)."""
    db_user = crud_user.get(db, id=user_id)
    if not db_user:
        raise HTTPException(status_code=404, detail="User not found")

    # Check for duplicate username/email if being changed
    if user_in.username and user_in.username != db_user.username:
        existing = crud_user.get_by_username(db, username=user_in.username)
        if existing:
            raise HTTPException(status_code=400, detail="Username already taken")
    if user_in.email and user_in.email != db_user.email:
        existing = crud_user.get_by_email(db, email=user_in.email)
        if existing:
            raise HTTPException(status_code=400, detail="Email already taken")

    db_user = crud_user.update_user(db, db_obj=db_user, obj_in=user_in)

    # Update facility assignments if provided
    if user_in.facility_ids is not None:
        # Remove existing assignments
        db.query(UserFacility).filter(UserFacility.user_id == db_user.id).delete()
        # Add new assignments
        for fac_id in user_in.facility_ids:
            fac = db.query(Facility).filter(Facility.id == fac_id).first()
            if fac:
                uf = UserFacility(user_id=db_user.id, facility_id=fac_id)
                db.add(uf)
        # Update primary facility
        db_user.facility_id = user_in.facility_ids[0] if user_in.facility_ids else None
        db.commit()
        db.refresh(db_user)

    log_activity(db, "users", user_id, "UPDATE", current_user, user_in.model_dump(exclude_unset=True, exclude={"password"}))
    create_notification(
        db,
        user_id=user_id,
        title="Your user profile was updated",
        message=f"{current_user.full_name or current_user.username} updated your user record.",
        notification_type="user",
        link_url="/profile",
        actor_id=current_user.id,
    )
    db.commit()
    return _build_user_response(db_user, db)


@router.put("/{user_id}/role", response_model=UserResponse)
def update_user_role(
    user_id: int,
    role_in: UserRoleUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_superadmin_user),
) -> Any:
    """Quick role change (super admin only)."""
    db_user = crud_user.get(db, id=user_id)
    if not db_user:
        raise HTTPException(status_code=404, detail="User not found")

    # Validate role value
    try:
        UserRole(role_in.role)
    except ValueError:
        raise HTTPException(status_code=400, detail=f"Invalid role: {role_in.role}")

    db_user = crud_user.update_role(db, db_obj=db_user, role=role_in.role)
    log_activity(db, "users", user_id, "UPDATE_ROLE", current_user, {"role": role_in.role})
    create_notification(
        db,
        user_id=user_id,
        title="Your role was changed",
        message=f"Your role is now {role_in.role.replace('_', ' ')}.",
        notification_type="user",
        link_url="/profile",
        actor_id=current_user.id,
    )
    db.commit()
    return _build_user_response(db_user, db)


@router.put("/{user_id}/deactivate", response_model=UserResponse)
def deactivate_user(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_module_access("users")),
) -> Any:
    """Deactivate a user (set is_active=False). Super admin only."""
    db_user = crud_user.get(db, id=user_id)
    if not db_user:
        raise HTTPException(status_code=404, detail="User not found")
    if db_user.id == current_user.id:
        raise HTTPException(status_code=400, detail="Cannot deactivate yourself")

    db_user.is_active = False
    db.commit()
    db.refresh(db_user)
    log_activity(db, "users", user_id, "DEACTIVATE", current_user)
    create_notification(
        db,
        user_id=user_id,
        title="Your account was deactivated",
        message="Your account access has been disabled.",
        notification_type="user",
        actor_id=current_user.id,
    )
    db.commit()
    return _build_user_response(db_user, db)


@router.delete("/{user_id}", response_model=UserResponse)
def delete_user(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_module_access("users")),
) -> Any:
    """Hard-delete a user (requires users.delete permission)."""
    db_user = crud_user.get(db, id=user_id)
    if not db_user:
        raise HTTPException(status_code=404, detail="User not found")
    if db_user.id == current_user.id:
        raise HTTPException(status_code=400, detail="Cannot delete yourself")

    userData = {"username": db_user.username, "email": db_user.email}

    # Before deleting the user, clear all FK references that don't have
    # ON DELETE CASCADE / SET NULL at the DB level.
    # Each statement runs in its own savepoint so a single failure (e.g., column
    # is still NOT NULL before the migration runs) does not roll back the others.
    cleanup_stmts = [
        "UPDATE audit_logs SET changed_by_id = NULL WHERE changed_by_id = :uid",
        "DELETE FROM calendar_events WHERE user_id = :uid",
        "UPDATE inspection_batches SET inspector_id = NULL WHERE inspector_id = :uid",
        "UPDATE inspections SET inspector_id = NULL WHERE inspector_id = :uid",
        "UPDATE inventory_transactions SET created_by_id = NULL WHERE created_by_id = :uid",
        "UPDATE invoices SET created_by_id = NULL WHERE created_by_id = :uid",
        "UPDATE notifications SET actor_id = NULL WHERE actor_id = :uid",
        "UPDATE rentals SET created_by_id = NULL WHERE created_by_id = :uid",
        "UPDATE sales_quotations SET created_by_id = NULL WHERE created_by_id = :uid",
        "UPDATE service_request_quotations SET created_by_id = NULL WHERE created_by_id = :uid",
        "UPDATE service_requests SET requester_id = NULL WHERE requester_id = :uid",
        "UPDATE service_requests SET assigned_technician_id = NULL WHERE assigned_technician_id = :uid",
    ]
    for stmt in cleanup_stmts:
        sp = db.begin_nested()  # savepoint — isolates each cleanup statement
        try:
            db.execute(text(stmt), {"uid": user_id})
            sp.commit()
        except Exception:
            sp.rollback()  # skip this one, keep going

    try:
        crud_user.remove(db, id=user_id)
    except Exception as exc:
        db.rollback()
        raise HTTPException(
            status_code=400,
            detail="Cannot delete this user — they still have references in the system. Run database migrations and try again.",
        ) from exc

    log_activity(db, "users", user_id, "DELETE", current_user, userData)
    
    return {
        "id": user_id,
        "username": userData["username"],
        "email": userData["email"],
        "is_active": False,
        "full_name": db_user.full_name,
        "phone": db_user.phone,
        "avatar_url": db_user.avatar_url,
        "user_type": db_user.user_type.value if db_user.user_type else "employee",
        "role": db_user.role.value if db_user.role else "employee",
    }


@router.put("/{user_id}/activate", response_model=UserResponse)
def activate_user(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_module_access("users")),
) -> Any:
    """Re-activate a deactivated user. Super admin only."""
    db_user = crud_user.get(db, id=user_id)
    if not db_user:
        raise HTTPException(status_code=404, detail="User not found")

    db_user.is_active = True
    db.commit()
    db.refresh(db_user)
    log_activity(db, "users", user_id, "ACTIVATE", current_user)
    create_notification(
        db,
        user_id=user_id,
        title="Your account was activated",
        message="Your account access has been restored.",
        notification_type="user",
        link_url="/",
        actor_id=current_user.id,
    )
    db.commit()
    return _build_user_response(db_user, db)


@router.post("/{user_id}/impersonate", response_model=dict)
def impersonate_user(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_superadmin_user),
) -> Any:
    """Login as another user (Super Admin only)."""
    target_user = crud_user.get(db, id=user_id)
    if not target_user:
        raise HTTPException(status_code=404, detail="User not found")
    
    if not target_user.is_active:
        raise HTTPException(status_code=400, detail="Cannot impersonate an inactive user")

    access_token = create_access_token(data={"sub": target_user.username, "role": target_user.role.value if hasattr(target_user.role, "value") else str(target_user.role)})
    
    log_activity(db, "users", user_id, "IMPERSONATE", current_user, {"target_username": target_user.username})
    
    # Return full user info using the helper to ensure all fields like user_type and facilities are included
    user_data = _build_user_response(target_user, db)
    return {
        "access_token": access_token,
        "token_type": "bearer",
        "user": user_data
    }
