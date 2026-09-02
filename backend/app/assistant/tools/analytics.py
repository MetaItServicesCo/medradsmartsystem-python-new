"""Ranking tools: who and what is performing, not just how many.

These answer the comparative questions a business owner asks — busiest
technician, best facility, best-selling product — which counting tools cannot.

Every ranking is computed and ordered by PostgreSQL. The model receives an
ordered list and reports it; it never sorts, compares or picks a winner itself.
Each result states the measure used, because "busiest" and "best" are opinions
until the measure is named.
"""
from __future__ import annotations

from datetime import date
from typing import Any, Optional

from sqlalchemy import func

from app.assistant.tools.base import (
    ToolContext,
    ToolInputError,
    ToolResult,
    clamp_limit,
    datetime_bounds,
    money,
    validate_date_range,
)
from app.assistant.tools.entities import _deep_link
from app.models.facility import Facility
from app.models.inspection import Inspection, InspectionBatch, InspectionStatus
from app.models.inventory import InventoryPart
from app.models.invoice import Invoice, InvoiceStatus
from app.models.rental import Rental, RentalItem
from app.models.sales import SalesQuotation, SalesQuotationLineItem
from app.models.service_request import ServiceRequest, ServiceRequestStatus
from app.models.user import User, UserRole
from app.utils.invoice_approval import scope_invoice_approval_visibility


TECHNICIAN_MEASURES = ("assigned", "completed")
REVENUE_MEASURES = ("collected", "invoiced", "outstanding")
PRODUCT_BASES = ("sales", "rental")


def rank_technicians(
    ctx: ToolContext,
    measure: str = "completed",
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    limit: int = 10,
) -> ToolResult:
    """Rank technicians by workload, combining service requests and inspections.

    "Busiest" is ambiguous, so the measure is explicit: ``completed`` counts
    finished work, ``assigned`` counts everything on their plate including work
    still open. Both are reported per person so the ranking can be read either
    way.
    """
    ctx.require_module("service-requests")
    if measure not in TECHNICIAN_MEASURES:
        raise ToolInputError(
            "measure must be one of: {}".format(", ".join(TECHNICIAN_MEASURES))
        )
    validate_date_range(date_from, date_to)
    ctx.apply_statement_timeout()
    take = clamp_limit(limit)
    start, end = datetime_bounds(date_from, date_to)

    def tally(model, person_column, date_column, completed_value):
        query = ctx.scope_to_facilities(ctx.db.query(model), model.facility_id)
        query = query.filter(person_column.isnot(None))
        if measure == "completed":
            query = query.filter(model.status == completed_value)
        if start is not None:
            query = query.filter(date_column >= start)
        if end is not None:
            query = query.filter(date_column < end)
        rows = query.with_entities(
            person_column.label("person"), func.count().label("count")
        ).group_by(person_column).all()
        return {row.person: int(row.count) for row in rows}

    service_date = ServiceRequest.completed_at if measure == "completed" else ServiceRequest.created_at
    services = tally(
        ServiceRequest, ServiceRequest.assigned_technician_id,
        service_date, ServiceRequestStatus.COMPLETED,
    )
    inspection_date = InspectionBatch.completed_at if measure == "completed" else InspectionBatch.scheduled_date
    inspections = {}
    if ctx.user and True:
        inspections = tally(
            InspectionBatch, InspectionBatch.inspector_id,
            inspection_date, InspectionStatus.COMPLETED,
        )

    combined: dict[int, dict[str, int]] = {}
    for person_id, count in services.items():
        combined.setdefault(person_id, {"service_requests": 0, "inspections": 0})
        combined[person_id]["service_requests"] = count
    for person_id, count in inspections.items():
        combined.setdefault(person_id, {"service_requests": 0, "inspections": 0})
        combined[person_id]["inspections"] = count

    if not combined:
        return ToolResult(
            tool="rank_technicians",
            total_count=0,
            applied_filters={"measure": measure},
            notes=["No technician activity matched these filters."],
        )

    names = {
        row.id: (row.full_name, getattr(row.role, "value", str(row.role)), bool(row.is_active))
        for row in ctx.db.query(User.id, User.full_name, User.role, User.is_active)
        .filter(User.id.in_(combined.keys())).all()
    }

    ranked = sorted(
        combined.items(),
        key=lambda entry: entry[1]["service_requests"] + entry[1]["inspections"],
        reverse=True,
    )
    items: list[dict[str, Any]] = []
    for rank, (person_id, counts) in enumerate(ranked[:take], start=1):
        name, role, active = names.get(person_id, ("Unknown", "unknown", False))
        items.append({
            "rank": rank,
            "user_id": person_id,
            "full_name": name,
            "role": role,
            "is_active": active,
            "service_requests": counts["service_requests"],
            "inspection_visits": counts["inspections"],
            "total": counts["service_requests"] + counts["inspections"],
            "route": _deep_link("/users", search=name),
        })

    return ToolResult(
        tool="rank_technicians",
        total_count=len(ranked),
        items=items,
        aggregates={
            "measure": measure,
            "leader": items[0]["full_name"] if items else None,
            "leader_total": items[0]["total"] if items else 0,
        },
        applied_filters={
            "measure": measure,
            "date_from": date_from.isoformat() if date_from else None,
            "date_to": date_to.isoformat() if date_to else None,
        },
        notes=[
            "Ranked by {} work: service requests plus inspection visits.".format(measure),
            "Includes anyone assigned work, not only accounts with the technician role.",
        ],
    )


def rank_facilities_by_revenue(
    ctx: ToolContext,
    measure: str = "collected",
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    limit: int = 10,
) -> ToolResult:
    """Rank facilities by revenue. Cancelled invoices are excluded.

    ``collected`` is cash actually received and is the default, because
    "revenue we get from" means money in hand. ``invoiced`` is billed value,
    which is larger wherever balances are outstanding.
    """
    ctx.require_module("billing")
    if measure not in REVENUE_MEASURES:
        raise ToolInputError(
            "measure must be one of: {}".format(", ".join(REVENUE_MEASURES))
        )
    validate_date_range(date_from, date_to)
    ctx.apply_statement_timeout()
    take = clamp_limit(limit)

    query = scope_invoice_approval_visibility(
        ctx.scope_to_facilities(ctx.db.query(Invoice), Invoice.facility_id), ctx.user
    ).filter(
        Invoice.status != InvoiceStatus.CANCELLED,
        Invoice.facility_id.isnot(None),
    )
    if date_from:
        query = query.filter(Invoice.issue_date >= date_from)
    if date_to:
        query = query.filter(Invoice.issue_date <= date_to)

    column = {
        "collected": Invoice.amount_paid,
        "invoiced": Invoice.total_amount,
        "outstanding": Invoice.balance_due,
    }[measure]

    rows = query.with_entities(
        Invoice.facility_id.label("facility_id"),
        func.count().label("invoice_count"),
        func.coalesce(func.sum(Invoice.total_amount), 0).label("invoiced"),
        func.coalesce(func.sum(Invoice.amount_paid), 0).label("collected"),
        func.coalesce(func.sum(Invoice.balance_due), 0).label("outstanding"),
    ).group_by(Invoice.facility_id).order_by(
        func.coalesce(func.sum(column), 0).desc()
    ).limit(take).all()

    if not rows:
        return ToolResult(
            tool="rank_facilities_by_revenue",
            total_count=0,
            applied_filters={"measure": measure},
            notes=["No invoices matched these filters."],
        )

    names = {
        row.id: row.name for row in
        ctx.db.query(Facility.id, Facility.name)
        .filter(Facility.id.in_([r.facility_id for r in rows])).all()
    }
    items = [{
        "rank": rank,
        "facility_id": row.facility_id,
        "facility_name": names.get(row.facility_id),
        "invoice_count": int(row.invoice_count),
        "invoiced": money(row.invoiced),
        "collected": money(row.collected),
        "outstanding": money(row.outstanding),
        "route": _deep_link("/facilities", search=names.get(row.facility_id) or ""),
    } for rank, row in enumerate(rows, start=1)]

    return ToolResult(
        tool="rank_facilities_by_revenue",
        total_count=len(items),
        items=items,
        aggregates={
            "measure": measure,
            "leader": items[0]["facility_name"],
            "leader_value": items[0][measure],
        },
        applied_filters={
            "measure": measure,
            "date_from": date_from.isoformat() if date_from else None,
            "date_to": date_to.isoformat() if date_to else None,
        },
        notes=[
            "Ranked by {}. Cancelled invoices are excluded.".format(measure),
            "Invoiced is billed value; collected is cash received.",
        ],
    )


def rank_products(
    ctx: ToolContext,
    basis: str = "sales",
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    limit: int = 10,
) -> ToolResult:
    """Rank inventory parts by how often they are sold or rented.

    ``sales`` counts quotation line items; ``rental`` counts rental agreement
    items. Quantity and value are both returned, because the best-selling part
    by units is often not the highest earning one.
    """
    if basis not in PRODUCT_BASES:
        raise ToolInputError("basis must be one of: {}".format(", ".join(PRODUCT_BASES)))
    ctx.require_module("sales" if basis == "sales" else "rentals")
    validate_date_range(date_from, date_to)
    ctx.apply_statement_timeout()
    take = clamp_limit(limit)

    if basis == "sales":
        query = (
            ctx.db.query(SalesQuotationLineItem)
            .join(SalesQuotation, SalesQuotation.id == SalesQuotationLineItem.quotation_id)
            .filter(SalesQuotationLineItem.part_id.isnot(None))
        )
        query = ctx.scope_to_facilities(query, SalesQuotation.facility_id)
        if date_from:
            query = query.filter(SalesQuotation.requested_date >= date_from)
        if date_to:
            query = query.filter(SalesQuotation.requested_date <= date_to)
        part_column = SalesQuotationLineItem.part_id
        quantity_column = SalesQuotationLineItem.quantity
        value_expression = SalesQuotationLineItem.quantity * SalesQuotationLineItem.unit_price
        unit = "quotation line items"
    else:
        query = (
            ctx.db.query(RentalItem)
            .join(Rental, Rental.id == RentalItem.rental_id)
            .filter(RentalItem.part_id.isnot(None))
        )
        query = ctx.scope_to_facilities(query, Rental.facility_id)
        if date_from:
            query = query.filter(Rental.start_date >= date_from)
        if date_to:
            query = query.filter(Rental.start_date <= date_to)
        part_column = RentalItem.part_id
        quantity_column = RentalItem.quantity
        value_expression = RentalItem.quantity * RentalItem.rental_rate
        unit = "rental agreement items"

    rows = query.with_entities(
        part_column.label("part_id"),
        func.count().label("line_count"),
        func.coalesce(func.sum(quantity_column), 0).label("quantity"),
        func.coalesce(func.sum(value_expression), 0).label("value"),
    ).group_by(part_column).order_by(
        func.coalesce(func.sum(quantity_column), 0).desc()
    ).limit(take).all()

    if not rows:
        return ToolResult(
            tool="rank_products",
            total_count=0,
            applied_filters={"basis": basis},
            notes=[
                "No {} are recorded, so product demand cannot be ranked on this "
                "basis. This is an absence of data, not a product with zero "
                "demand.".format(unit),
            ],
        )

    parts = {
        row.id: (row.part_number, row.description)
        for row in ctx.db.query(
            InventoryPart.id, InventoryPart.part_number, InventoryPart.description
        ).filter(InventoryPart.id.in_([r.part_id for r in rows])).all()
    }
    items = [{
        "rank": rank,
        "part_id": row.part_id,
        "part_number": parts.get(row.part_id, (None, None))[0],
        "description": parts.get(row.part_id, (None, None))[1],
        "times_ordered": int(row.line_count),
        "total_quantity": int(row.quantity or 0),
        "total_value": money(row.value),
        "route": _deep_link("/inventory", search=parts.get(row.part_id, ("",))[0] or ""),
    } for rank, row in enumerate(rows, start=1)]

    return ToolResult(
        tool="rank_products",
        total_count=len(items),
        items=items,
        aggregates={
            "basis": basis,
            "leader": items[0]["description"] or items[0]["part_number"],
            "leader_quantity": items[0]["total_quantity"],
        },
        applied_filters={
            "basis": basis,
            "date_from": date_from.isoformat() if date_from else None,
            "date_to": date_to.isoformat() if date_to else None,
        },
        notes=[
            "Ranked by total quantity across {}.".format(unit),
            "Highest quantity is not always highest value; both are given.",
        ],
    )
