"""Rentals and sales tools.

Both count the unit their module lists — rental agreements and sales
quotations — rather than any underlying line-item table, and both link to the
module tab that actually resolves. Neither page reads query parameters, so the
links carry no filter.
"""
from __future__ import annotations

import logging
import time
from datetime import date
from typing import Any, Optional

from sqlalchemy import func, text
from sqlalchemy.orm import Session

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


logger = logging.getLogger("medrad.assistant.commerce")


# Sales quotation status is a free-text column rather than an enum, so unlike
# every other status in the system it cannot be read from a Python enum. These
# are the values the sales endpoints are known to write; they are the floor, not
# the whole vocabulary.
KNOWN_SALES_QUOTATION_STATUSES: tuple[str, ...] = (
    "draft", "pending", "sent", "submitted", "in_progress", "approved",
    "accepted", "rejected", "completed", "paid", "superseded",
)
SALES_PAID_STATUSES: tuple[str, ...] = ("paid", "unpaid")

# How long an observed-vocabulary lookup is reused. Statuses change on the scale
# of releases, so a few minutes of staleness costs nothing and this keeps the
# query off the hot path.
_VOCABULARY_TTL_SECONDS = 300
_vocabulary_cache: dict[str, Any] = {"expires_at": 0.0, "values": KNOWN_SALES_QUOTATION_STATUSES}


def sales_quotation_statuses(db: Optional[Session] = None) -> tuple[str, ...]:
    """Known statuses plus any others actually present in the data.

    A hand-maintained list silently goes stale: introduce "on_hold" in the
    application and the assistant would reject it as invalid rather than
    adapting. Taking the union with what the table actually contains means new
    statuses become answerable as soon as a record uses one, while the curated
    list keeps valid-but-unused states available.
    """
    if db is None:
        return tuple(_vocabulary_cache["values"])

    now = time.monotonic()
    if now < _vocabulary_cache["expires_at"]:
        return tuple(_vocabulary_cache["values"])

    values = set(KNOWN_SALES_QUOTATION_STATUSES)
    try:
        observed = db.execute(
            text("SELECT DISTINCT status FROM sales_quotations WHERE status IS NOT NULL")
        ).scalars().all()
        values.update(v.strip() for v in observed if v and v.strip())
    except Exception:
        # The curated list is a safe fallback; never fail a question over this.
        logger.debug("Could not read observed quotation statuses; using known list")

    resolved = tuple(sorted(values))
    _vocabulary_cache["values"] = resolved
    _vocabulary_cache["expires_at"] = now + _VOCABULARY_TTL_SECONDS
    return resolved


# Backwards-compatible name for the registry's schema construction.
SALES_QUOTATION_STATUSES = KNOWN_SALES_QUOTATION_STATUSES


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

    allowed_statuses = sales_quotation_statuses(ctx.db)
    for value in status or []:
        if value not in allowed_statuses:
            raise ToolInputError(
                "'{}' is not a valid quotation status. Valid values: {}".format(
                    value, ", ".join(allowed_statuses)
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
