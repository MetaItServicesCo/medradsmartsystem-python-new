from collections.abc import Iterable

from fastapi import HTTPException, status
from sqlalchemy.orm import Query, Session

from app.models.user import User, UserRole
from app.models.user_facility import UserFacility


FACILITY_SCOPED_ROLES = {UserRole.FACILITY_ADMIN, UserRole.FACILITY_MANAGER, UserRole.CLIENT}


def is_facility_scoped_user(user: User) -> bool:
    return user.role in FACILITY_SCOPED_ROLES


def get_user_facility_ids(db: Session, user: User) -> set[int]:
    facility_ids = {
        facility_id
        for (facility_id,) in db.query(UserFacility.facility_id)
        .filter(UserFacility.user_id == user.id)
        .all()
        if facility_id is not None
    }
    if user.facility_id is not None:
        facility_ids.add(user.facility_id)
    return facility_ids


def require_facility_access(db: Session, user: User, facility_id: int | None) -> None:
    if not is_facility_scoped_user(user):
        return
    if facility_id is None or facility_id not in get_user_facility_ids(db, user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have access to this facility",
        )


def scope_query_to_user_facilities(
    query: Query,
    facility_column,
    db: Session,
    user: User,
) -> Query:
    if not is_facility_scoped_user(user):
        return query
    return query.filter(facility_column.in_(get_user_facility_ids(db, user)))


def restrict_facility_ids(db: Session, user: User, facility_ids: Iterable[int]) -> set[int]:
    requested = set(facility_ids)
    if not is_facility_scoped_user(user):
        return requested
    return requested & get_user_facility_ids(db, user)
