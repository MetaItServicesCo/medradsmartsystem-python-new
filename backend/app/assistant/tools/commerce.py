"""Rentals and sales tools.

Both count the unit their module lists — rental agreements and sales
quotations — rather than any underlying line-item table, and both link to the
module tab that actually resolves. Neither page reads query parameters, so the
links carry no filter.
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
    money,
    validate_date_range,
)
from app.assistant.tools.entities import _facility_names
from app.models.rental import Rental, RentalStatus
from app.models.sales import SalesQuotation


# Sales quotation status is a free-text column rather than an enum, so the
# accepted vocabulary comes from the values the sales endpoints actually write.
# Restricting it to the values currently present in data would reject
# legitimate states that simply have no rows yet.
SALES_QUOTATION_STATUSES: tuple[str, ...] = (
    "draft", "pending", "sent", "submitted", "in_progress", "approved",
    "accepted", "rejected", "completed", "paid", "superseded",
)
SALES_PAID_STATUSES: tuple[str, ...] = ("paid", "unpaid")


def _like(value: str) -> str:
    return "%{}%".format(value.replace("%", r"\%").replace("_", r"\_"))


def search_rentals(
    ctx: ToolContext,
    status: Optional[list[str]] = None,
    facility_id: Optional[int] = None,
    customer: Optional[str] = None,
    failed_payments_only: bool = False,
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    limit: int = 25,
) -> ToolResult:
    """Find rental agreements, the unit the Rentals module lists.

    Dates filter on the agreement start date. ``failed_payments_only`` matches
    the dashboard's rental payment-retry alert.
    """
    ctx.require_module("rentals")
    validate_date_range(date_from, date_to)
    ctx.apply_statement_timeout()
    take = clamp_limit(limit)

    query = ctx.scope_to_facilities(ctx.db.query(Rental), Rental.facility_id)

    normalized: list[RentalStatus] = []
    for value in status or []:
        try:
            normalized.append(RentalStatus(value))
        except ValueError:
            raise ToolInputError(
                "'{}' is not a valid rental status. Valid values: {}".format(
                    value, ", ".join(s.value for s in RentalStatus)
                )
            )
    if normalized:
        query = query.filter(Rental.status.in_(normalized))
    if facility_id is not None:
        query = query.filter(Rental.facility_id == facility_id)
    if customer:
        query = query.filter(Rental.customer_name.ilike(_like(customer), escape="\\"))
    if failed_payments_only:
        query = query.filter(Rental.failed_charge_count > 0)
    if date_from:
        query = query.filter(Rental.start_date >= date_from)
    if date_to:
        query = query.filter(Rental.start_date <= date_to)

    totals = query.with_entities(
        func.count().label("count"),
        func.coalesce(func.sum(Rental.security_deposit), 0).label("deposits"),
        func.coalesce(func.sum(Rental.rental_rate), 0).label("rates"),
    ).one()

    rows = query.order_by(Rental.start_date.desc()).limit(take).all()
    facility_names = _facility_names(ctx, {r.facility_id for r in rows if r.facility_id})

    items: list[dict[str, Any]] = [{
        "rental_id": row.id,
        "rental_number": row.rental_number,
        "status": getattr(row.status, "value", str(row.status)),
        "customer_name": row.customer_name,
        "facility_name": facility_names.get(row.facility_id),
        "billing_frequency": getattr(
            row.billing_frequency, "value", str(row.billing_frequency)
        ),
        "rental_rate": money(row.rental_rate),
        "security_deposit": money(row.security_deposit),
        "start_date": row.start_date.isoformat() if row.start_date else None,
        "end_date": row.end_date.isoformat() if row.end_date else None,
        "failed_charge_count": int(row.failed_charge_count or 0),
        "route": "/rentals/agreements",
    } for row in rows]

    return ToolResult(
        tool="search_rentals",
        total_count=int(totals.count or 0),
        items=items,
        aggregates={
            "total_security_deposits": money(totals.deposits),
            "total_rental_rate": money(totals.rates),
        },
        applied_filters={
            "status": [s.value for s in normalized] or None,
            "facility_id": facility_id,
            "customer": customer,
            "failed_payments_only": failed_payments_only,
            "date_field": "start_date",
            "date_from": date_from.isoformat() if date_from else None,
            "date_to": date_to.isoformat() if date_to else None,
        },
        notes=["Counted rental agreements, the unit the Rentals module lists."],
    )


def search_sales_quotations(
    ctx: ToolContext,
    status: Optional[list[str]] = None,
    paid_status: Optional[str] = None,
    facility_id: Optional[int] = None,
    customer: Optional[str] = None,
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    limit: int = 25,
) -> ToolResult:
    """Find sales quotations, the unit the Sales module lists.

    A quotation is not an invoice: it becomes revenue only once converted, so
    quoted value and billed revenue are different figures and must never be
    presented as the same number.
    """
    ctx.require_module("sales")
    validate_date_range(date_from, date_to)
    ctx.apply_statement_timeout()
    take = clamp_limit(limit)

    query = ctx.scope_to_facilities(
        ctx.db.query(SalesQuotation), SalesQuotation.facility_id
    )

    for value in status or []:
        if value not in SALES_QUOTATION_STATUSES:
            raise ToolInputError(
                "'{}' is not a valid quotation status. Valid values: {}".format(
                    value, ", ".join(SALES_QUOTATION_STATUSES)
                )
            )
    if status:
        query = query.filter(SalesQuotation.status.in_(list(status)))
    if paid_status:
        if paid_status not in SALES_PAID_STATUSES:
            raise ToolInputError(
                "'{}' is not a valid paid status. Valid values: {}".format(
                    paid_status, ", ".join(SALES_PAID_STATUSES)
                )
            )
        query = query.filter(SalesQuotation.paid_status == paid_status)
    if facility_id is not None:
        query = query.filter(SalesQuotation.facility_id == facility_id)
    if customer:
        query = query.filter(
            SalesQuotation.customer_name.ilike(_like(customer), escape="\\")
        )
    if date_from:
        query = query.filter(SalesQuotation.requested_date >= date_from)
    if date_to:
        query = query.filter(SalesQuotation.requested_date <= date_to)

    totals = query.with_entities(
        func.count().label("count"),
        func.coalesce(func.sum(SalesQuotation.total_amount), 0).label("value"),
    ).one()

    rows = query.order_by(SalesQuotation.id.desc()).limit(take).all()
    facility_names = _facility_names(ctx, {r.facility_id for r in rows if r.facility_id})

    items: list[dict[str, Any]] = [{
        "quotation_id": row.id,
        "quotation_number": row.quotation_number,
        "work_order": row.work_order,
        "status": row.status,
        "paid_status": row.paid_status,
        "customer_name": row.customer_name,
        "facility_name": facility_names.get(row.facility_id),
        "total_amount": money(row.total_amount),
        "converted_invoice_id": row.converted_invoice_id,
        "requested_date": row.requested_date.isoformat() if row.requested_date else None,
        "route": "/sales/quotations",
    } for row in rows]

    return ToolResult(
        tool="search_sales_quotations",
        total_count=int(totals.count or 0),
        items=items,
        aggregates={"total_quoted_value": money(totals.value)},
        applied_filters={
            "status": list(status) if status else None,
            "paid_status": paid_status,
            "facility_id": facility_id,
            "customer": customer,
            "date_field": "requested_date",
            "date_from": date_from.isoformat() if date_from else None,
            "date_to": date_to.isoformat() if date_to else None,
        },
        notes=[
            "Counted sales quotations. Quoted value is not billed revenue: a "
            "quotation becomes revenue only once converted to an invoice.",
        ],
    )
