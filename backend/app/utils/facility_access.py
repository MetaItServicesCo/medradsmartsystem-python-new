from collections.abc import Iterable

from fastapi import HTTPException, status
from sqlalchemy.orm import Query, Session

from app.models.user import User, UserRole
from app.models.user_facility import UserFacility
from app.models.facility import Facility


FACILITY_SCOPED_ROLES = {UserRole.FACILITY_ADMIN, UserRole.FACILITY_MANAGER, UserRole.CLIENT}


def is_facility_scoped_user(user: User) -> bool:
    return user.role in FACILITY_SCOPED_ROLES


def get_user_facility_ids(db: Session, user: User) -> set[int]:
    """Return facility ids a scoped user can access.

    Facility admins/managers assigned to a parent facility inherit access to
    its direct child facilities. Users assigned to a child facility do not
    inherit access upward to the parent or sideways to sibling facilities.
    """
    facility_ids = {
        facility_id
        for (facility_id,) in db.query(UserFacility.facility_id)
        .filter(UserFacility.user_id == user.id)
        .all()
        if facility_id is not None
    }
    if user.facility_id is not None:
        facility_ids.add(user.facility_id)

    if user.role in {UserRole.FACILITY_ADMIN, UserRole.FACILITY_MANAGER} and facility_ids:
        child_ids = {
            child_id
            for (child_id,) in db.query(Facility.id)
            .filter(Facility.parent_facility_id.in_(facility_ids))
            .all()
            if child_id is not None
        }
        facility_ids.update(child_ids)

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


def require_assignable_technician(db: Session, technician_id, facility_id) -> None:
    """A facility-bound user also working as a technician stays inside its facilities.

    Facility Admins, Facility Managers, Employees and facility-bound Admins only
    ever see work at their own facilities. Flagged to do technician work, they
    may only be assigned jobs there too -- otherwise they would be given a job
    they cannot open, and the flag must never widen which facilities anyone
    sees. Nobody else is affected: assignment otherwise behaves exactly as it
    always has. Used for service requests and inspections alike, so the rule
    cannot differ between them.
    """
    from app.utils.permissions import is_additional_technician

    if not technician_id:
        return
    technician = db.query(User).filter(User.id == technician_id).first()
    if not technician or not is_additional_technician(technician):
        return
    facility_bound = technician.role in (
        UserRole.FACILITY_ADMIN, UserRole.FACILITY_MANAGER, UserRole.EMPLOYEE,
    ) or (technician.role == UserRole.ADMIN and technician.facility_id is not None)
    if not facility_bound:
        return
    if facility_id is None or facility_id not in get_user_facility_ids(db, technician):
        raise HTTPException(
            status_code=422,
            detail="{} can only be assigned jobs at their own facilities".format(
                technician.full_name or technician.username),
        )
