"""Which service requests and inspections a person may see -- as the screens decide.

The assistant must never be a way round the module's own rules. Facility
scoping alone is not those rules: within their sites, a technician sees only
the work assigned to them, and an employee only the requests they raised (plus
their assigned work if they also work as a technician). Every assistant tool
that reads service requests, their quotations, inspections or inspection
visits starts from these, which mirror exactly what the Service Requests and
Inspections screens apply (service_requests.list_service_requests,
reports._scope_service_query, inspections.list_inspections and
list_inspection_batches).
"""
from __future__ import annotations

from sqlalchemy import false, or_

from app.assistant.tools.base import ToolContext
from app.models.service_request import ServiceRequest
from app.models.user import UserRole
from app.utils.permissions import also_assigned, assigned_only


def scope_service_requests(ctx: ToolContext, query):
    """``query`` over ServiceRequest (or joined to it), limited to what this
    person may see in the Service Requests module."""
    query = ctx.scope_to_facilities(query, ServiceRequest.facility_id)
    user = ctx.user
    if assigned_only(user, "service-requests"):
        return query.filter(ServiceRequest.assigned_technician_id == user.id)
    if user.role == UserRole.EMPLOYEE:
        if also_assigned(user, "service-requests"):
            return query.filter(or_(
                ServiceRequest.requester_id == user.id,
                ServiceRequest.assigned_technician_id == user.id,
            ))
        return query.filter(ServiceRequest.requester_id == user.id)
    return query


def scope_inspections(ctx: ToolContext, query, model):
    """``query`` over Inspection or InspectionBatch (``model``), limited to what
    this person may see in the Inspections module."""
    query = ctx.scope_to_facilities(query, model.facility_id)
    user = ctx.user
    if assigned_only(user, "inspections"):
        return query.filter(model.inspector_id == user.id)
    if user.role == UserRole.EMPLOYEE:
        return query.filter(false())
    return query


OWN_SERVICE_WORK_NOTE = (
    "You can see only your own service work -- what is assigned to you, or "
    "what you raised -- so this covers only that, not anyone else's."
)
OWN_INSPECTIONS_NOTE = (
    "You can see only the inspections assigned to you, so this covers only "
    "those, not anyone else's."
)


def sees_only_own_inspections(ctx: ToolContext) -> bool:
    return assigned_only(ctx.user, "inspections")


def sees_only_own_service_work(ctx: ToolContext) -> bool:
    """True when the answer covers only this person's own service work, which an
    answer about "everyone" or "other technicians" must then say."""
    user = ctx.user
    return assigned_only(user, "service-requests") or user.role == UserRole.EMPLOYEE
