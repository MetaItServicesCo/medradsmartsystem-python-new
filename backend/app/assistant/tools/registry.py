"""Tool registry: one definition drives dispatch, validation and model schemas.

The JSON Schema emitted here is handed to Claude verbatim as its tool
definitions, and the same entry is used to dispatch the call. Keeping both from
a single source means the model can never be offered a tool the backend cannot
execute, or a parameter the backend would reject.

Enum values are inlined into the schema so an invalid status is refused during
schema validation, before any query runs.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Callable

from app.assistant.tools import commerce, entities
from app.assistant.tools.base import ToolContext, ToolResult
from app.models.inspection import InspectionStatus
from app.models.invoice import InvoiceStatus, InvoiceType
from app.models.rental import RentalStatus
from app.models.service_request import Priority, ServiceRequestStatus


def _values(enum_class: Any) -> list[str]:
    return [member.value for member in enum_class]


_DATE = {"type": "string", "format": "date", "description": "ISO date, YYYY-MM-DD"}


@dataclass(frozen=True)
class ToolDefinition:
    name: str
    description: str
    parameters: dict[str, Any]
    handler: Callable[..., ToolResult]
    module: str

    def anthropic_schema(self) -> dict[str, Any]:
        return {
            "name": self.name,
            "description": self.description,
            "input_schema": self.parameters,
        }


TOOL_DEFINITIONS: tuple[ToolDefinition, ...] = (
    ToolDefinition(
        name="resolve_entity",
        module="platform",
        description=(
            "Resolve a name, number or phrase typed by a person into concrete "
            "records. Use this FIRST whenever the question names a facility, "
            "person, service request, inspection or invoice in words rather than "
            "by id. If more than one candidate is returned, ask which was meant "
            "instead of guessing."
        ),
        parameters={
            "type": "object",
            "properties": {
                "kind": {
                    "type": "string",
                    "enum": list(entities.RESOLVABLE_KINDS),
                    "description": "Type of record to look for.",
                },
                "query": {
                    "type": "string",
                    "description": "The name, number or phrase to match.",
                },
                "limit": {"type": "integer", "minimum": 1, "maximum": 20, "default": 5},
            },
            "required": ["kind", "query"],
        },
        handler=entities.resolve_entity,
    ),
    ToolDefinition(
        name="facility_detail",
        module="facilities",
        description=(
            "Full profile for one facility: physical address, billing address, "
            "phone, email, contact person, status and operating hours."
        ),
        parameters={
            "type": "object",
            "properties": {"facility_id": {"type": "integer"}},
            "required": ["facility_id"],
        },
        handler=entities.facility_detail,
    ),
    ToolDefinition(
        name="facility_business_summary",
        module="billing",
        description=(
            "Total business done with one facility, split into sales, rental, "
            "service and inspection streams. Reports invoiced, collected and "
            "outstanding separately. Use for questions like 'how much business "
            "have we done with X'. Cancelled invoices are excluded."
        ),
        parameters={
            "type": "object",
            "properties": {
                "facility_id": {"type": "integer"},
                "date_from": _DATE,
                "date_to": _DATE,
            },
            "required": ["facility_id"],
        },
        handler=entities.facility_business_summary,
    ),
    ToolDefinition(
        name="search_inspections",
        module="inspections",
        description=(
            "Find or count inspections, optionally by inspector, facility, status "
            "and date. Counts inspection VISITS (batches) by default, which is "
            "what the Inspections module displays and what people mean by 'how "
            "many inspections'. Each visit covers many assets, so the per-asset "
            "figure is much larger and is always returned alongside in "
            "aggregates. Only set count_assets when the question is explicitly "
            "about individual assets or devices. Read total_count for 'how many' "
            "questions."
        ),
        parameters={
            "type": "object",
            "properties": {
                "inspector_id": {"type": "integer"},
                "facility_id": {"type": "integer"},
                "status": {
                    "type": "array",
                    "items": {"type": "string", "enum": _values(InspectionStatus)},
                },
                "date_from": _DATE,
                "date_to": _DATE,
                "count_assets": {
                    "type": "boolean",
                    "default": False,
                    "description": (
                        "Count individual asset inspections instead of visits. "
                        "Leave false unless the question names assets or devices."
                    ),
                },
                "limit": {"type": "integer", "minimum": 1, "maximum": 100, "default": 25},
            },
        },
        handler=entities.search_inspections,
    ),
    ToolDefinition(
        name="service_request_detail",
        module="service-requests",
        description=(
            "One service request in full, including who it is assigned to, who "
            "raised it, the facility and the equipment. Accepts either the "
            "numeric id or the request number."
        ),
        parameters={
            "type": "object",
            "properties": {
                "service_request_id": {"type": "integer"},
                "request_number": {"type": "string"},
            },
        },
        handler=entities.service_request_detail,
    ),
    ToolDefinition(
        name="search_service_requests",
        module="service-requests",
        description=(
            "Find or count service requests by facility, assigned technician, "
            "status or priority. For anything described as open, active or "
            "completed, use status_group rather than listing statuses by hand: "
            "'open' means different things on different screens and the groups "
            "match them exactly. Read total_count for 'how many' questions."
        ),
        parameters={
            "type": "object",
            "properties": {
                "facility_id": {"type": "integer"},
                "assigned_technician_id": {"type": "integer"},
                "status_group": {
                    "type": "string",
                    "enum": ["new_open", "active", "completed", "open_all"],
                    "description": (
                        "new_open = new and assigned (the module's Open tab); "
                        "active = in progress or waiting; completed = completed; "
                        "open_all = everything not yet completed (the dashboard's "
                        "Open Requests). Prefer this over status."
                    ),
                },
                "status": {
                    "type": "array",
                    "items": {"type": "string", "enum": _values(ServiceRequestStatus)},
                },
                "priority": {"type": "string", "enum": _values(Priority)},
                "date_from": _DATE,
                "date_to": _DATE,
                "limit": {"type": "integer", "minimum": 1, "maximum": 100, "default": 25},
            },
        },
        handler=entities.search_service_requests,
    ),
    ToolDefinition(
        name="search_invoices",
        module="billing",
        description=(
            "Find invoices with balances and ageing. Returns SQL-computed totals "
            "for the whole match set in aggregates, independent of the rows "
            "returned. Use overdue_only for questions about late payment."
        ),
        parameters={
            "type": "object",
            "properties": {
                "facility_id": {"type": "integer"},
                "status": {
                    "type": "array",
                    "items": {"type": "string", "enum": _values(InvoiceStatus)},
                },
                "invoice_type": {
                    "type": "array",
                    "items": {"type": "string", "enum": _values(InvoiceType)},
                },
                "overdue_only": {"type": "boolean", "default": False},
                "date_from": _DATE,
                "date_to": _DATE,
                "limit": {"type": "integer", "minimum": 1, "maximum": 100, "default": 25},
            },
        },
        handler=entities.search_invoices,
    ),
    ToolDefinition(
        name="search_rentals",
        module="rentals",
        description=(
            "Find or count rental agreements, the unit the Rentals module "
            "lists. Use failed_payments_only for questions about failed or "
            "retrying rental payments. Read total_count for 'how many'."
        ),
        parameters={
            "type": "object",
            "properties": {
                "status": {
                    "type": "array",
                    "items": {"type": "string", "enum": _values(RentalStatus)},
                },
                "facility_id": {"type": "integer"},
                "customer": {"type": "string", "description": "Customer name, partial match."},
                "failed_payments_only": {"type": "boolean", "default": False},
                "date_from": _DATE,
                "date_to": _DATE,
                "limit": {"type": "integer", "minimum": 1, "maximum": 100, "default": 25},
            },
        },
        handler=commerce.search_rentals,
    ),
    ToolDefinition(
        name="search_sales_quotations",
        module="sales",
        description=(
            "Find or count sales quotations, the unit the Sales module lists. "
            "A quotation is NOT an invoice: total_quoted_value is pipeline "
            "value, not billed or collected revenue, and must never be "
            "reported as revenue. For revenue use search_invoices or "
            "facility_business_summary."
        ),
        parameters={
            "type": "object",
            "properties": {
                "status": {
                    "type": "array",
                    "items": {
                        "type": "string",
                        "enum": list(commerce.SALES_QUOTATION_STATUSES),
                    },
                },
                "paid_status": {
                    "type": "string",
                    "enum": list(commerce.SALES_PAID_STATUSES),
                },
                "facility_id": {"type": "integer"},
                "customer": {"type": "string", "description": "Customer name, partial match."},
                "date_from": _DATE,
                "date_to": _DATE,
                "limit": {"type": "integer", "minimum": 1, "maximum": 100, "default": 25},
            },
        },
        handler=commerce.search_sales_quotations,
    ),
)

TOOLS_BY_NAME: dict[str, ToolDefinition] = {tool.name: tool for tool in TOOL_DEFINITIONS}


def anthropic_tool_schemas(modules: tuple[str, ...] | None = None) -> list[dict[str, Any]]:
    """Tool schemas for the model, optionally narrowed to one module's tools.

    Narrowing matters: binding every tool at once measurably degrades selection
    accuracy, so the graph exposes only the tools relevant to the classified
    intent.
    """
    tools = TOOL_DEFINITIONS
    if modules:
        allowed = set(modules) | {"platform"}
        tools = tuple(t for t in tools if t.module in allowed)
    return [tool.anthropic_schema() for tool in tools]


def dispatch(name: str, ctx: ToolContext, arguments: dict[str, Any]) -> ToolResult:
    """Execute a registered tool. Unknown names and stray arguments are refused."""
    definition = TOOLS_BY_NAME.get(name)
    if definition is None:
        raise KeyError("Unknown tool: {}".format(name))

    allowed = set(definition.parameters.get("properties", {}).keys())
    unexpected = set(arguments or {}) - allowed
    if unexpected:
        raise ValueError(
            "Unexpected argument(s) for {}: {}".format(name, ", ".join(sorted(unexpected)))
        )
    return definition.handler(ctx, **(arguments or {}))
