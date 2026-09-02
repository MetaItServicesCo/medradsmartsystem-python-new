"""Read-only business tools for the Super Admin assistant.

These are the only way the assistant reaches operational data. Each one owns its
joins, so the model never resolves a foreign key or invents a filter value.
Every query is SELECT-only; nothing here writes.
"""
from __future__ import annotations

from datetime import date
from typing import Any, Optional

from sqlalchemy import func, or_

from app.assistant.tools.base import (
    ToolContext,
    ToolInputError,
    ToolResult,
    clamp_limit,
    datetime_bounds,
    money,
    validate_date_range,
)
from app.models.equipment import Equipment
from app.models.facility import Facility
from app.models.inspection import Inspection, InspectionStatus
from app.models.invoice import Invoice, InvoiceStatus, InvoiceType
from app.models.service_request import ServiceRequest, ServiceRequestStatus
from app.models.user import User
from app.utils.invoice_approval import scope_invoice_approval_visibility


RESOLVABLE_KINDS = ("facility", "user", "service_request", "inspection", "invoice")


def resolve_entity(
    ctx: ToolContext,
    kind: str,
    query: str,
    limit: int = 5,
) -> ToolResult:
    """Turn a human-typed name or number into candidate records.

    Almost every question names an entity in words ("xyz facility", "the Miller
    service request"), so this is the first hop for most queries. Ambiguity is
    returned as multiple candidates rather than silently resolved -- the caller
    must ask which one was meant.
    """
    kind = (kind or "").strip().lower()
    if kind not in RESOLVABLE_KINDS:
        raise ToolInputError(
            "kind must be one of: {}".format(", ".join(RESOLVABLE_KINDS))
        )
    needle = (query or "").strip()
    if len(needle) < 2:
        raise ToolInputError("query must be at least 2 characters.")
    pattern = "%{}%".format(needle.replace("%", r"\%").replace("_", r"\_"))
    take = clamp_limit(limit)
    items: list[dict[str, Any]] = []

    if kind == "facility":
        ctx.require_module("facilities")
        base = ctx.scope_to_facilities(ctx.db.query(Facility), Facility.id)
        base = base.filter(Facility.name.ilike(pattern, escape="\\"))
        total = base.count()
        for facility in base.order_by(Facility.name).limit(take).all():
            items.append({
                "facility_id": facility.id,
                "name": facility.name,
                "city": facility.city,
                "state": facility.state,
                "status": facility.status,
                "route": "/facilities/{}".format(facility.id),
            })

    elif kind == "user":
        ctx.require_module("users")
        base = ctx.db.query(User).filter(or_(
            User.full_name.ilike(pattern, escape="\\"),
            User.username.ilike(pattern, escape="\\"),
        ))
        total = base.count()
        for user in base.order_by(User.full_name).limit(take).all():
            items.append({
                "user_id": user.id,
                "full_name": user.full_name,
                "username": user.username,
                "role": getattr(user.role, "value", str(user.role)),
                "is_active": bool(getattr(user, "is_active", True)),
                "route": "/users/{}".format(user.id),
            })

    elif kind == "service_request":
        ctx.require_module("service-requests")
        base = ctx.scope_to_facilities(
            ctx.db.query(ServiceRequest), ServiceRequest.facility_id
        ).filter(or_(
            ServiceRequest.request_number.ilike(pattern, escape="\\"),
            ServiceRequest.problem_description.ilike(pattern, escape="\\"),
        ))
        total = base.count()
        for request in base.order_by(ServiceRequest.created_at.desc()).limit(take).all():
            items.append({
                "service_request_id": request.id,
                "request_number": request.request_number,
                "status": getattr(request.status, "value", str(request.status)),
                "priority": getattr(request.priority, "value", str(request.priority)),
                "route": "/service-requests/{}".format(request.id),
            })

    elif kind == "inspection":
        ctx.require_module("inspections")
        base = ctx.scope_to_facilities(
            ctx.db.query(Inspection), Inspection.facility_id
        ).filter(Inspection.inspection_number.ilike(pattern, escape="\\"))
        total = base.count()
        for inspection in base.order_by(Inspection.scheduled_date.desc()).limit(take).all():
            items.append({
                "inspection_id": inspection.id,
                "inspection_number": inspection.inspection_number,
                "status": getattr(inspection.status, "value", str(inspection.status)),
                "route": "/inspections/{}".format(inspection.id),
            })

    else:  # invoice
        ctx.require_module("billing")
        base = scope_invoice_approval_visibility(
            ctx.scope_to_facilities(ctx.db.query(Invoice), Invoice.facility_id), ctx.user
        ).filter(Invoice.invoice_number.ilike(pattern, escape="\\"))
        total = base.count()
        for invoice in base.order_by(Invoice.issue_date.desc()).limit(take).all():
            items.append({
                "invoice_id": invoice.id,
                "invoice_number": invoice.invoice_number,
                "status": getattr(invoice.status, "value", str(invoice.status)),
                "balance_due": money(invoice.balance_due),
                "route": "/billing/invoices/{}".format(invoice.id),
            })

    notes: list[str] = []
    if total == 0:
        notes.append("No {} matched '{}'.".format(kind.replace("_", " "), needle))
    elif total > 1:
        notes.append(
            "{} candidates matched; confirm which one is meant before answering.".format(total)
        )
    return ToolResult(
        tool="resolve_entity",
        total_count=total,
        items=items,
        applied_filters={"kind": kind, "query": needle},
        notes=notes,
    )


def facility_detail(ctx: ToolContext, facility_id: int) -> ToolResult:
    """Full profile for one facility, including contact and address."""
    ctx.require_module("facilities", "view")
    facility = ctx.scope_to_facilities(
        ctx.db.query(Facility), Facility.id
    ).filter(Facility.id == facility_id).first()
    if facility is None:
        return ToolResult(
            tool="facility_detail",
            total_count=0,
            applied_filters={"facility_id": facility_id},
            notes=["No facility with id {} is visible to this account.".format(facility_id)],
        )

    physical = ", ".join(part for part in [
        facility.address, facility.suite, facility.city,
        facility.state, facility.zip_code, facility.country,
    ] if part)
    billing = ", ".join(part for part in [
        facility.billing_street, facility.billing_suite, facility.billing_city,
        facility.billing_state, facility.billing_zip_code,
    ] if part)

    notes: list[str] = []
    if billing and billing != physical:
        notes.append("Billing address differs from the physical address.")

    return ToolResult(
        tool="facility_detail",
        total_count=1,
        items=[{
            "facility_id": facility.id,
            "name": facility.name,
            "address": physical,
            "billing_address": billing or None,
            "phone": facility.phone,
            "email": facility.email,
            "contact_person": facility.contact_person,
            "website": facility.website,
            "status": facility.status,
            "timezone": facility.timezone,
            "operating_hours": facility.operating_hours,
            "route": "/facilities/{}".format(facility.id),
        }],
        applied_filters={"facility_id": facility_id},
        notes=notes,
    )


def facility_business_summary(
    ctx: ToolContext,
    facility_id: int,
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
) -> ToolResult:
    """Total business done with one facility, split by invoice stream.

    "Total business" is reported three ways -- invoiced, collected and
    outstanding -- because the phrase is ambiguous and a single number would
    silently pick one meaning. Cancelled invoices are excluded from totals and
    reported separately.
    """
    ctx.require_module("billing")
    validate_date_range(date_from, date_to)
    ctx.apply_statement_timeout()

    facility = ctx.scope_to_facilities(
        ctx.db.query(Facility), Facility.id
    ).filter(Facility.id == facility_id).first()
    if facility is None:
        return ToolResult(
            tool="facility_business_summary",
            total_count=0,
            applied_filters={"facility_id": facility_id},
            notes=["No facility with id {} is visible to this account.".format(facility_id)],
        )

    base = scope_invoice_approval_visibility(
        ctx.db.query(Invoice).filter(Invoice.facility_id == facility_id), ctx.user
    )
    if date_from:
        base = base.filter(Invoice.issue_date >= date_from)
    if date_to:
        base = base.filter(Invoice.issue_date <= date_to)

    active = base.filter(Invoice.status != InvoiceStatus.CANCELLED)

    # One grouped aggregate rather than four round-trips.
    rows = active.with_entities(
        Invoice.invoice_type.label("stream"),
        func.count().label("count"),
        func.coalesce(func.sum(Invoice.total_amount), 0).label("invoiced"),
        func.coalesce(func.sum(Invoice.amount_paid), 0).label("collected"),
        func.coalesce(func.sum(Invoice.balance_due), 0).label("outstanding"),
    ).group_by(Invoice.invoice_type).all()

    by_stream: list[dict[str, Any]] = []
    totals = {"invoiced": 0.0, "collected": 0.0, "outstanding": 0.0, "count": 0}
    row_map = {getattr(r.stream, "value", r.stream): r for r in rows}
    for stream in (InvoiceType.SALES, InvoiceType.RENTAL, InvoiceType.SERVICE, InvoiceType.INSPECTION):
        row = row_map.get(stream.value)
        entry = {
            "stream": stream.value,
            "invoice_count": int(row.count) if row else 0,
            "invoiced": money(row.invoiced) if row else 0.0,
            "collected": money(row.collected) if row else 0.0,
            "outstanding": money(row.outstanding) if row else 0.0,
        }
        by_stream.append(entry)
        totals["invoiced"] += entry["invoiced"]
        totals["collected"] += entry["collected"]
        totals["outstanding"] += entry["outstanding"]
        totals["count"] += entry["invoice_count"]

    overdue_count = active.filter(
        Invoice.status.in_([
            InvoiceStatus.PENDING, InvoiceStatus.PARTIALLY_PAID, InvoiceStatus.OVERDUE
        ]),
        Invoice.due_date < date.today(),
    ).count()
    cancelled_count = base.filter(Invoice.status == InvoiceStatus.CANCELLED).count()

    notes = ["Totals exclude cancelled invoices."]
    if cancelled_count:
        notes.append("{} cancelled invoice(s) were excluded.".format(cancelled_count))
    if not date_from and not date_to:
        notes.append("Covers all time; no date range was applied.")

    return ToolResult(
        tool="facility_business_summary",
        total_count=totals["count"],
        items=by_stream,
        aggregates={
            "facility_id": facility.id,
            "facility_name": facility.name,
            "total_invoiced": round(totals["invoiced"], 2),
            "total_collected": round(totals["collected"], 2),
            "total_outstanding": round(totals["outstanding"], 2),
            "invoice_count": totals["count"],
            "overdue_invoice_count": overdue_count,
            "cancelled_invoice_count": cancelled_count,
        },
        applied_filters={
            "facility_id": facility_id,
            "date_from": date_from.isoformat() if date_from else None,
            "date_to": date_to.isoformat() if date_to else None,
        },
        notes=notes,
    )


def search_inspections(
    ctx: ToolContext,
    inspector_id: Optional[int] = None,
    facility_id: Optional[int] = None,
    status: Optional[list[str]] = None,
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    limit: int = 25,
) -> ToolResult:
    """Find inspections. Completed work is filtered on ``completed_at``.

    Filtering completed inspections by their scheduled date rather than their
    completion date is a common and silent source of wrong counts, so the date
    range deliberately follows the status being asked about.
    """
    ctx.require_module("inspections")
    validate_date_range(date_from, date_to)
    ctx.apply_statement_timeout()
    take = clamp_limit(limit)

    query = ctx.scope_to_facilities(ctx.db.query(Inspection), Inspection.facility_id)
    if inspector_id is not None:
        query = query.filter(Inspection.inspector_id == inspector_id)
    if facility_id is not None:
        query = query.filter(Inspection.facility_id == facility_id)

    normalized_status: list[InspectionStatus] = []
    for value in status or []:
        try:
            normalized_status.append(InspectionStatus(value))
        except ValueError:
            raise ToolInputError(
                "'{}' is not a valid inspection status. Valid values: {}".format(
                    value, ", ".join(s.value for s in InspectionStatus)
                )
            )
    if normalized_status:
        query = query.filter(Inspection.status.in_(normalized_status))

    completed_only = normalized_status == [InspectionStatus.COMPLETED]
    date_column = Inspection.completed_at if completed_only else Inspection.scheduled_date
    start, end = datetime_bounds(date_from, date_to)
    if start is not None:
        query = query.filter(date_column >= start)
    if end is not None:
        query = query.filter(date_column < end)

    total = query.count()
    rows = (
        query.order_by(Inspection.scheduled_date.desc()).limit(take).all()
    )
    facility_names = _facility_names(ctx, {r.facility_id for r in rows})
    inspector_names = _user_names(ctx, {r.inspector_id for r in rows if r.inspector_id})

    items = [{
        "inspection_id": row.id,
        "inspection_number": row.inspection_number,
        "status": getattr(row.status, "value", str(row.status)),
        "result": getattr(row.result, "value", str(row.result)) if row.result else None,
        "facility_id": row.facility_id,
        "facility_name": facility_names.get(row.facility_id),
        "inspector_id": row.inspector_id,
        "inspector_name": inspector_names.get(row.inspector_id),
        "scheduled_date": row.scheduled_date.isoformat() if row.scheduled_date else None,
        "completed_at": row.completed_at.isoformat() if row.completed_at else None,
        "route": "/inspections/{}".format(row.id),
    } for row in rows]

    return ToolResult(
        tool="search_inspections",
        total_count=total,
        items=items,
        applied_filters={
            "inspector_id": inspector_id,
            "facility_id": facility_id,
            "status": [s.value for s in normalized_status] or None,
            "date_field": "completed_at" if completed_only else "scheduled_date",
            "date_from": date_from.isoformat() if date_from else None,
            "date_to": date_to.isoformat() if date_to else None,
        },
    )


def service_request_detail(
    ctx: ToolContext,
    service_request_id: Optional[int] = None,
    request_number: Optional[str] = None,
) -> ToolResult:
    """One service request, including who it is assigned to."""
    ctx.require_module("service-requests", "view")
    if service_request_id is None and not request_number:
        raise ToolInputError("Provide either service_request_id or request_number.")

    query = ctx.scope_to_facilities(ctx.db.query(ServiceRequest), ServiceRequest.facility_id)
    if service_request_id is not None:
        query = query.filter(ServiceRequest.id == service_request_id)
    else:
        query = query.filter(ServiceRequest.request_number == request_number)
    request = query.first()

    if request is None:
        return ToolResult(
            tool="service_request_detail",
            total_count=0,
            applied_filters={
                "service_request_id": service_request_id,
                "request_number": request_number,
            },
            notes=["No matching service request is visible to this account."],
        )

    names = _user_names(ctx, {request.assigned_technician_id, request.requester_id})
    facility_names = _facility_names(ctx, {request.facility_id})
    equipment = (
        ctx.db.query(Equipment).filter(Equipment.id == request.equipment_id).first()
        if request.equipment_id else None
    )

    assigned_name = names.get(request.assigned_technician_id)
    notes = [] if assigned_name else ["This request has no assigned technician."]

    return ToolResult(
        tool="service_request_detail",
        total_count=1,
        items=[{
            "service_request_id": request.id,
            "request_number": request.request_number,
            "status": getattr(request.status, "value", str(request.status)),
            "priority": getattr(request.priority, "value", str(request.priority)),
            "assigned_technician_id": request.assigned_technician_id,
            "assigned_technician_name": assigned_name,
            "requester_name": names.get(request.requester_id),
            "facility_id": request.facility_id,
            "facility_name": facility_names.get(request.facility_id),
            "equipment": getattr(equipment, "asset_tag", None),
            "problem_description": (request.problem_description or "")[:600],
            "created_at": request.created_at.isoformat() if request.created_at else None,
            "completed_at": request.completed_at.isoformat() if request.completed_at else None,
            "route": "/service-requests/{}".format(request.id),
        }],
        applied_filters={
            "service_request_id": service_request_id,
            "request_number": request_number,
        },
        notes=notes,
    )


def search_service_requests(
    ctx: ToolContext,
    facility_id: Optional[int] = None,
    assigned_technician_id: Optional[int] = None,
    status: Optional[list[str]] = None,
    priority: Optional[str] = None,
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    limit: int = 25,
) -> ToolResult:
    """Find service requests by facility, technician, status or priority."""
    ctx.require_module("service-requests")
    validate_date_range(date_from, date_to)
    ctx.apply_statement_timeout()
    take = clamp_limit(limit)

    query = ctx.scope_to_facilities(ctx.db.query(ServiceRequest), ServiceRequest.facility_id)
    if facility_id is not None:
        query = query.filter(ServiceRequest.facility_id == facility_id)
    if assigned_technician_id is not None:
        query = query.filter(ServiceRequest.assigned_technician_id == assigned_technician_id)

    normalized: list[ServiceRequestStatus] = []
    for value in status or []:
        try:
            normalized.append(ServiceRequestStatus(value))
        except ValueError:
            raise ToolInputError(
                "'{}' is not a valid service request status. Valid values: {}".format(
                    value, ", ".join(s.value for s in ServiceRequestStatus)
                )
            )
    if normalized:
        query = query.filter(ServiceRequest.status.in_(normalized))
    if priority:
        query = query.filter(ServiceRequest.priority == priority)

    start, end = datetime_bounds(date_from, date_to)
    if start is not None:
        query = query.filter(ServiceRequest.created_at >= start)
    if end is not None:
        query = query.filter(ServiceRequest.created_at < end)

    total = query.count()
    rows = query.order_by(ServiceRequest.created_at.desc()).limit(take).all()
    facility_names = _facility_names(ctx, {r.facility_id for r in rows})
    tech_names = _user_names(ctx, {r.assigned_technician_id for r in rows if r.assigned_technician_id})

    items = [{
        "service_request_id": row.id,
        "request_number": row.request_number,
        "status": getattr(row.status, "value", str(row.status)),
        "priority": getattr(row.priority, "value", str(row.priority)),
        "facility_name": facility_names.get(row.facility_id),
        "assigned_technician_name": tech_names.get(row.assigned_technician_id),
        "created_at": row.created_at.isoformat() if row.created_at else None,
        "route": "/service-requests/{}".format(row.id),
    } for row in rows]

    return ToolResult(
        tool="search_service_requests",
        total_count=total,
        items=items,
        applied_filters={
            "facility_id": facility_id,
            "assigned_technician_id": assigned_technician_id,
            "status": [s.value for s in normalized] or None,
            "priority": priority,
            "date_from": date_from.isoformat() if date_from else None,
            "date_to": date_to.isoformat() if date_to else None,
        },
    )


def search_invoices(
    ctx: ToolContext,
    facility_id: Optional[int] = None,
    status: Optional[list[str]] = None,
    invoice_type: Optional[list[str]] = None,
    overdue_only: bool = False,
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    limit: int = 25,
) -> ToolResult:
    """Find invoices with balances and aging, plus SQL-computed totals."""
    ctx.require_module("billing")
    validate_date_range(date_from, date_to)
    ctx.apply_statement_timeout()
    take = clamp_limit(limit)

    query = scope_invoice_approval_visibility(
        ctx.scope_to_facilities(ctx.db.query(Invoice), Invoice.facility_id), ctx.user
    )
    if facility_id is not None:
        query = query.filter(Invoice.facility_id == facility_id)

    normalized_status: list[InvoiceStatus] = []
    for value in status or []:
        try:
            normalized_status.append(InvoiceStatus(value))
        except ValueError:
            raise ToolInputError(
                "'{}' is not a valid invoice status. Valid values: {}".format(
                    value, ", ".join(s.value for s in InvoiceStatus)
                )
            )
    if normalized_status:
        query = query.filter(Invoice.status.in_(normalized_status))

    normalized_type: list[InvoiceType] = []
    for value in invoice_type or []:
        try:
            normalized_type.append(InvoiceType(value))
        except ValueError:
            raise ToolInputError(
                "'{}' is not a valid invoice type. Valid values: {}".format(
                    value, ", ".join(t.value for t in InvoiceType)
                )
            )
    if normalized_type:
        query = query.filter(Invoice.invoice_type.in_(normalized_type))

    if overdue_only:
        query = query.filter(
            Invoice.status.in_([
                InvoiceStatus.PENDING, InvoiceStatus.PARTIALLY_PAID, InvoiceStatus.OVERDUE
            ]),
            Invoice.due_date < date.today(),
        )
    if date_from:
        query = query.filter(Invoice.issue_date >= date_from)
    if date_to:
        query = query.filter(Invoice.issue_date <= date_to)

    totals = query.with_entities(
        func.count().label("count"),
        func.coalesce(func.sum(Invoice.total_amount), 0).label("invoiced"),
        func.coalesce(func.sum(Invoice.balance_due), 0).label("outstanding"),
    ).one()

    rows = query.order_by(Invoice.due_date.asc()).limit(take).all()
    facility_names = _facility_names(ctx, {r.facility_id for r in rows if r.facility_id})
    today = date.today()

    items = [{
        "invoice_id": row.id,
        "invoice_number": row.invoice_number,
        "invoice_type": getattr(row.invoice_type, "value", str(row.invoice_type)),
        "status": getattr(row.status, "value", str(row.status)),
        "facility_name": facility_names.get(row.facility_id),
        "total_amount": money(row.total_amount),
        "balance_due": money(row.balance_due),
        "due_date": row.due_date.isoformat() if row.due_date else None,
        "days_overdue": (today - row.due_date).days if row.due_date and row.due_date < today else 0,
        "route": "/billing/invoices/{}".format(row.id),
    } for row in rows]

    return ToolResult(
        tool="search_invoices",
        total_count=int(totals.count or 0),
        items=items,
        aggregates={
            "total_invoiced": money(totals.invoiced),
            "total_outstanding": money(totals.outstanding),
        },
        applied_filters={
            "facility_id": facility_id,
            "status": [s.value for s in normalized_status] or None,
            "invoice_type": [t.value for t in normalized_type] or None,
            "overdue_only": overdue_only,
            "date_from": date_from.isoformat() if date_from else None,
            "date_to": date_to.isoformat() if date_to else None,
        },
    )


def _facility_names(ctx: ToolContext, ids: set[Optional[int]]) -> dict[int, str]:
    clean = {i for i in ids if i}
    if not clean:
        return {}
    rows = ctx.db.query(Facility.id, Facility.name).filter(Facility.id.in_(clean)).all()
    return {row.id: row.name for row in rows}


def _user_names(ctx: ToolContext, ids: set[Optional[int]]) -> dict[int, str]:
    clean = {i for i in ids if i}
    if not clean:
        return {}
    rows = ctx.db.query(User.id, User.full_name).filter(User.id.in_(clean)).all()
    return {row.id: row.full_name for row in rows}
