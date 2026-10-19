"""Who may act on one particular service request.

Module permissions answer "may this person touch service requests at all".
They do not answer "may this person touch *this* one", and for service
requests those are very different questions: the matrix grants add and edit on
the module to technicians, employees and clients alike, because all three
legitimately raise requests and track their own.

Working on a request is narrower. An employee who reported a broken pump may
raise it and watch it; they may not reassign it, re-prioritise it or close it.
That rule lived as a private function inside the service-requests endpoint,
which was fine while the endpoint was the only way in. The assistant's write
tools are a second way in, and a second copy of an authorization rule is a
rule that will eventually disagree with itself -- so it lives here now and
both callers import it.
"""
from __future__ import annotations

from app.models.service_request import ServiceRequest
from app.models.user import User, UserRole


def is_internal_service_user(user: User) -> bool:
    """A global service operator, as opposed to a facility portal account."""
    if user.role == UserRole.SUPERADMIN:
        return True
    # Migrated installations can contain legacy `admin` records that are
    # explicitly facility-bound. Those accounts are facility portal users;
    # only an unscoped admin is a global service operator.
    return user.role == UserRole.ADMIN and user.facility_id is None


def can_work_on_service_request(user: User, sr: ServiceRequest) -> bool:
    """Whether this person may change the state of this request."""
    if is_internal_service_user(user):
        return True
    return sr.assigned_technician_id == user.id
