"""Actions the assistant can prepare for a person to confirm.

Four, deliberately: report a fault, book an asset for service, schedule an
inspection, and update a work order. Each is reversible in the product and
touches one record. Deleting, bulk changes, anything financial and anything
about users or permissions stay on their own screens, with their own previews.

Every action has two halves:

* ``prepare`` checks the target exists within the person's sites and that they
  may do this, resolves everything to ids, and builds the confirmation card.
  Nothing is written except the proposal itself.
* ``execute`` runs on Confirm by calling the endpoint function the screen
  calls, as that person. Numbering, response deadlines, notifications and
  history therefore happen exactly as they would from the screen, and there is
  no second write path to drift out of step.
"""
from __future__ import annotations

import hashlib
import json
import uuid
from dataclasses import dataclass
from datetime import date, datetime, timedelta
from typing import Any, Callable, Optional

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.assistant.tools.base import ToolContext, ToolInputError
from app.models.assistant_action import ActionStatus, AssistantAction
from app.models.discipline import Discipline
from app.models.equipment import Equipment
from app.models.fixture import Fixture
from app.models.location import Location
from app.models.service_request import Priority, ServiceRequest, ServiceRequestStatus
from app.models.user import User, UserRole

PROPOSAL_LIFETIME = timedelta(minutes=10)
PRIORITIES = [p.value for p in Priority]


@dataclass
class Prepared:
    payload: dict[str, Any]
    title: str
    lines: list[tuple[str, str]]
    facility_id: Optional[int]
    warnings: list[str]


@dataclass(frozen=True)
class ActionDefinition:
    name: str
    description: str
    parameters: dict[str, Any]
    module: str
    permission: str
    prepare: Callable[[ToolContext, dict[str, Any]], Prepared]
    execute: Callable[[Session, User, dict[str, Any]], dict[str, Any]]

    def tool_schema(self) -> dict[str, Any]:
        return {"name": self.name, "description": self.description, "input_schema": self.parameters}


# ── shared lookups ───────────────────────────────────────────────────────────

def _within_sites(ctx: ToolContext, facility_id: int, what: str) -> None:
    allowed = ctx.facility_ids()
    if allowed is not None and facility_id not in allowed:
        raise ToolInputError("No {} with that id.".format(what))


def _space(ctx: ToolContext, location_id: Optional[int]) -> Optional[Location]:
    if not location_id:
        return None
    space = ctx.db.get(Location, location_id)
    if space is None or not space.is_active:
        raise ToolInputError("No space with id {}.".format(location_id))
    _within_sites(ctx, space.facility_id, "space")
    return space


def _label(space: Optional[Location]) -> str:
    if space is None:
        return "Not placed"
    return "{} · {}".format(space.code, space.name) if space.name else space.code


def _trade_name(ctx: ToolContext, discipline_id: Optional[int]) -> str:
    if not discipline_id:
        return "Not set"
    row = ctx.db.query(Discipline.name).filter(Discipline.id == discipline_id).first()
    return row[0] if row else "Not set"


def _trade_id(ctx: ToolContext, code: Optional[str]) -> Optional[int]:
    if not code:
        return None
    row = ctx.db.query(Discipline.id).filter(Discipline.code == code).first()
    if row is None:
        raise ToolInputError("Unknown trade '{}'.".format(code))
    return row[0]


def _technician(ctx: ToolContext, user_id: Optional[int]) -> Optional[User]:
    if not user_id:
        return None
    person = ctx.db.get(User, user_id)
    if person is None or not person.is_active or person.role != UserRole.TECHNICIAN:
        raise ToolInputError("No active technician with id {}. Find one with search_users.".format(user_id))
    return person


def _priority(value: Optional[str]) -> Optional[str]:
    if value in (None, ""):
        return None
    if value not in PRIORITIES:
        raise ToolInputError("Priority must be one of: {}.".format(", ".join(PRIORITIES)))
    return value


def _description(value: Optional[str]) -> str:
    text = (value or "").strip()
    if len(text) < 5:
        raise ToolInputError("Say what is wrong in a few words (at least 5 characters).")
    return text[:2000]


def _asset(ctx: ToolContext, asset_id: Optional[int]) -> Equipment:
    asset = ctx.db.get(Equipment, asset_id) if asset_id else None
    if asset is None:
        raise ToolInputError("No asset with that id. Resolve it with resolve_entity(kind=asset).")
    _within_sites(ctx, asset.facility_id, "asset")
    return asset


# ── report a fault ───────────────────────────────────────────────────────────

def _prepare_fault(ctx: ToolContext, args: dict[str, Any]) -> Prepared:
    from app.services import fixture_catalog
    from app.services import work_order as work_order_service

    description = _description(args.get("description"))
    priority = _priority(args.get("priority"))
    out_of_service = bool(args.get("takes_room_out_of_service", False))
    targets = [k for k in ("fixture_id", "asset_id", "location_id") if args.get(k)]
    if len(targets) != 1:
        raise ToolInputError("Name exactly one of fixture_id, asset_id or location_id.")

    warnings: list[str] = []
    if args.get("fixture_id"):
        fixture = ctx.db.get(Fixture, args["fixture_id"])
        if fixture is None or not fixture.is_active:
            raise ToolInputError("No fixture with that id. Find it with search_fixtures.")
        _within_sites(ctx, fixture.facility_id, "fixture")
        space = ctx.db.get(Location, fixture.location_id)
        label = fixture_catalog.BY_TYPE.get(fixture.fixture_type, {}).get("label") or fixture.fixture_type
        if fixture.work_order_id:
            open_order = ctx.db.get(ServiceRequest, fixture.work_order_id)
            if open_order and open_order.status not in (ServiceRequestStatus.COMPLETED, ServiceRequestStatus.CANCELLED):
                warnings.append("{} already has an open work order, {}.".format(fixture.code, open_order.request_number))
        payload = {"kind": "fixture", "fixture_id": fixture.id, "description": description,
                   "priority": priority, "takes_room_out_of_service": out_of_service}
        what = "{} · {}".format(fixture.code, label)
        trade = _trade_name(ctx, fixture.discipline_id)
        facility_id = fixture.facility_id
    elif args.get("asset_id"):
        asset = _asset(ctx, args["asset_id"])
        space = ctx.db.get(Location, asset.location_id) if asset.location_id else None
        payload = {"kind": "asset", "asset_id": asset.id, "description": description,
                   "priority": priority, "takes_room_out_of_service": out_of_service}
        what = "{} · {}".format(asset.asset_tag, asset.type_label or " ".join(
            p for p in (asset.make, asset.model) if p) or "asset")
        trade = _trade_name(ctx, asset.discipline_id)
        facility_id = asset.facility_id
    else:
        space = _space(ctx, args["location_id"])
        trade_id = _trade_id(ctx, args.get("trade"))
        if trade_id is None:
            raise ToolInputError("A fault on a room needs the trade it goes to (trade).")
        payload = {"kind": "space", "location_id": space.id, "discipline_id": trade_id,
                   "description": description, "priority": priority,
                   "takes_room_out_of_service": out_of_service}
        what = "The room itself"
        trade = _trade_name(ctx, trade_id)
        facility_id = space.facility_id

    shown_priority = priority or "{} (from the room)".format(work_order_service.default_priority(space))
    return Prepared(
        payload=payload,
        title="Raise a work order",
        lines=[("What", what), ("Where", _label(space)), ("Goes to", trade),
               ("Priority", shown_priority), ("Problem", description),
               ("Takes the room out of service", "Yes" if out_of_service else "No")],
        facility_id=facility_id,
        warnings=warnings,
    )


def _execute_fault(db: Session, user: User, payload: dict[str, Any]) -> dict[str, Any]:
    if payload["kind"] == "fixture":
        from app.api.v1.endpoints.fixtures import report_fault
        from app.schemas.fixture import ReportFaultRequest

        created = report_fault(payload["fixture_id"], ReportFaultRequest(
            description=payload["description"], priority=payload.get("priority"),
            takes_out_of_service=payload["takes_room_out_of_service"],
        ), db=db, current_user=user)
        return _work_order_result(created.work_order_id, created.request_number, "raised")

    from app.api.v1.endpoints.service_requests import create_service_request
    from app.schemas.service_request import ServiceRequestCreate

    if payload["kind"] == "asset":
        asset = db.get(Equipment, payload["asset_id"])
        body = ServiceRequestCreate(
            facility_id=asset.facility_id, equipment_id=asset.id,
            problem_description=payload["description"], priority=payload.get("priority"),
            takes_space_out_of_service=payload["takes_room_out_of_service"],
        )
    else:
        space = db.get(Location, payload["location_id"])
        body = ServiceRequestCreate(
            facility_id=space.facility_id, location_id=space.id, discipline_id=payload["discipline_id"],
            problem_description=payload["description"], priority=payload.get("priority"),
            takes_space_out_of_service=payload["takes_room_out_of_service"],
        )
    created = create_service_request(body, db=db, current_user=user)
    return _work_order_result(_get(created, "id"), _get(created, "request_number"), "raised")


def _get(record: Any, key: str) -> Any:
    """A field from an endpoint response, whether it returned a model or a dict."""
    return record.get(key) if isinstance(record, dict) else getattr(record, key, None)


def _work_order_result(order_id: int, number: str, verb: str) -> dict[str, Any]:
    return {"message": "Work order {} {}.".format(number, verb), "record": number,
            "route": "/service-requests/{}".format(order_id), "work_order_id": order_id}


# ── book an asset for service ────────────────────────────────────────────────

def _prepare_booking(ctx: ToolContext, args: dict[str, Any]) -> Prepared:
    asset = _asset(ctx, args.get("asset_id"))
    description = _description(args.get("description"))
    priority = _priority(args.get("priority")) or "medium"
    technician = _technician(ctx, args.get("assigned_technician_id"))
    space = ctx.db.get(Location, asset.location_id) if asset.location_id else None
    warnings = []
    if technician is None:
        warnings.append("No technician named: it will wait in the queue to be assigned.")
    return Prepared(
        payload={"asset_id": asset.id, "description": description, "priority": priority,
                 "assigned_technician_id": technician.id if technician else None},
        title="Book {} in for service".format(asset.asset_tag),
        lines=[("Asset", "{} · {}".format(asset.asset_tag, asset.type_label or " ".join(
                   p for p in (asset.make, asset.model) if p) or "asset")),
               ("Where", _label(space)), ("Trade", _trade_name(ctx, asset.discipline_id)),
               ("What needs doing", description), ("Priority", priority),
               ("Assigned to", technician.full_name if technician else "Not yet")],
        facility_id=asset.facility_id,
        warnings=warnings,
    )


def _execute_booking(db: Session, user: User, payload: dict[str, Any]) -> dict[str, Any]:
    from app.api.v1.endpoints.service_requests import create_service_request, update_service_request
    from app.schemas.service_request import ServiceRequestCreate, ServiceRequestUpdate

    asset = db.get(Equipment, payload["asset_id"])
    created = create_service_request(ServiceRequestCreate(
        facility_id=asset.facility_id, equipment_id=asset.id, location_id=asset.location_id,
        problem_description=payload["description"], priority=payload["priority"],
    ), db=db, current_user=user)
    result = _work_order_result(_get(created, "id"), _get(created, "request_number"), "booked")
    if payload.get("assigned_technician_id"):
        # The same two steps the asset page takes: create, then assign. The work
        # order exists once the first succeeds, so a failed assignment is said
        # plainly rather than reported as the booking having failed.
        try:
            update_service_request(_get(created, "id"), ServiceRequestUpdate(
                assigned_technician_id=payload["assigned_technician_id"], status="assigned",
            ), db=db, current_user=user)
        except HTTPException as exc:
            db.rollback()
            result["message"] = "Work order {} booked, but not assigned: {}".format(
                _get(created, "request_number"), exc.detail)
    return result


# ── schedule an inspection ───────────────────────────────────────────────────

def _prepare_plan(ctx: ToolContext, args: dict[str, Any]) -> Prepared:
    asset = _asset(ctx, args.get("asset_id"))
    name = (args.get("name") or "").strip()
    if len(name) < 3:
        raise ToolInputError("Give the plan a name, e.g. 'Quarterly filter change'.")
    interval = args.get("interval_days")
    if not isinstance(interval, int) or not 1 <= interval <= 3650:
        raise ToolInputError("interval_days must be a whole number of days between 1 and 3650.")
    priority = _priority(args.get("priority")) or "medium"
    technician = _technician(ctx, args.get("assigned_technician_id"))
    first_due = args.get("first_due_date")
    if first_due:
        try:
            first_due_date = date.fromisoformat(str(first_due))
        except ValueError:
            raise ToolInputError("first_due_date must be YYYY-MM-DD.")
    else:
        first_due_date = date.today() + timedelta(days=interval)
    task = (args.get("task_description") or "").strip()[:2000] or None
    return Prepared(
        payload={"asset_id": asset.id, "name": name[:255], "task_description": task,
                 "interval_days": interval, "priority": priority,
                 "assigned_technician_id": technician.id if technician else None,
                 "first_due_date": first_due_date.isoformat()},
        title="Schedule an inspection plan",
        lines=[("Asset", asset.asset_tag), ("Plan", name), ("Every", "{} days".format(interval)),
               ("First due", first_due_date.isoformat()), ("What the technician does", task or "Not described"),
               ("Priority", priority), ("Usually done by", technician.full_name if technician else "Not set")],
        facility_id=asset.facility_id,
        warnings=[],
    )


def _execute_plan(db: Session, user: User, payload: dict[str, Any]) -> dict[str, Any]:
    from app.api.v1.endpoints.maintenance import ScheduleCreate, create_schedule

    asset = db.get(Equipment, payload["asset_id"])
    plan = create_schedule(ScheduleCreate(
        facility_id=asset.facility_id, equipment_id=asset.id, name=payload["name"],
        task_description=payload.get("task_description"), discipline_id=asset.discipline_id,
        interval_days=payload["interval_days"], priority=payload["priority"],
        assigned_technician_id=payload.get("assigned_technician_id"),
        next_due_date=date.fromisoformat(payload["first_due_date"]),
    ), db=db, current_user=user)
    return {"message": "Plan '{}' scheduled; first due {}.".format(plan.name, payload["first_due_date"]),
            "record": plan.name, "route": "/assets?asset={}".format(asset.id)}


# ── update a work order ──────────────────────────────────────────────────────

def _prepare_update(ctx: ToolContext, args: dict[str, Any]) -> Prepared:
    from app.api.v1.endpoints.service_requests import VALID_TRANSITIONS

    order = ctx.db.get(ServiceRequest, args.get("work_order_id")) if args.get("work_order_id") else None
    if order is None:
        raise ToolInputError("No work order with that id. Resolve it with resolve_entity(kind=service_request).")
    _within_sites(ctx, order.facility_id, "work order")

    payload: dict[str, Any] = {"work_order_id": order.id}
    lines: list[tuple[str, str]] = [("Work order", "{} · {}".format(order.request_number,
                                                                     (order.problem_description or "")[:80]))]
    current = order.status if isinstance(order.status, ServiceRequestStatus) else ServiceRequestStatus(order.status)

    status = args.get("status")
    if status:
        try:
            wanted = ServiceRequestStatus(status)
        except ValueError:
            raise ToolInputError("Unknown status '{}'.".format(status))
        if wanted != current and wanted not in VALID_TRANSITIONS.get(current, []):
            allowed = ", ".join(s.value for s in VALID_TRANSITIONS.get(current, [])) or "none - it is closed"
            raise ToolInputError("A work order that is {} can move to: {}.".format(current.value, allowed))
        if wanted != current:
            payload["status"] = wanted.value
            lines.append(("Status", "{} → {}".format(current.value.replace("_", " "), wanted.value.replace("_", " "))))
    technician = _technician(ctx, args.get("assigned_technician_id"))
    if technician:
        payload["assigned_technician_id"] = technician.id
        lines.append(("Assign to", technician.full_name))
    priority = _priority(args.get("priority"))
    if priority and priority != getattr(order.priority, "value", order.priority):
        payload["priority"] = priority
        lines.append(("Priority", "{} → {}".format(getattr(order.priority, "value", order.priority), priority)))
    note = (args.get("note") or "").strip()
    if note:
        payload["note"] = note[:2000]
        lines.append(("Add note", note[:2000]))
    if len(payload) == 1:
        raise ToolInputError("Say what to change: status, assigned_technician_id, priority or a note.")
    return Prepared(payload=payload, title="Update {}".format(order.request_number), lines=lines,
                    facility_id=order.facility_id, warnings=[])


def _execute_update(db: Session, user: User, payload: dict[str, Any]) -> dict[str, Any]:
    from app.api.v1.endpoints.service_requests import add_service_request_note, update_service_request
    from app.schemas.service_request import ServiceRequestNoteCreate, ServiceRequestUpdate

    order_id = payload["work_order_id"]
    changes = {k: payload[k] for k in ("status", "assigned_technician_id", "priority") if k in payload}
    if "assigned_technician_id" in changes and "status" not in changes:
        order = db.get(ServiceRequest, order_id)
        if order.status == ServiceRequestStatus.NEW:
            changes["status"] = "assigned"
    updated = None
    if changes:
        updated = update_service_request(order_id, ServiceRequestUpdate(**changes), db=db, current_user=user)
    if payload.get("note"):
        updated = add_service_request_note(order_id, ServiceRequestNoteCreate(note=payload["note"]),
                                           db=db, current_user=user)
    number = _get(updated, "request_number") or db.get(ServiceRequest, order_id).request_number
    return _work_order_result(order_id, number, "updated")


# ── registry ─────────────────────────────────────────────────────────────────

_TRADE_CODES = ["mechanical", "electrical", "plumbing", "vertical_transport", "fire_life_safety",
                "medical_gas", "building_envelope", "it_low_voltage", "biomedical"]

ACTION_DEFINITIONS: tuple[ActionDefinition, ...] = (
    ActionDefinition(
        name="prepare_fault_report",
        module="service-requests", permission="add",
        description=(
            "Prepare a work order for something broken, for the person to confirm. "
            "Target exactly one of: a fixture (socket, light - find with search_fixtures), "
            "an asset (resolve_entity kind=asset), or a room itself with the trade it "
            "goes to. Priority defaults from the room. Nothing happens until confirmed."
        ),
        parameters={"type": "object", "properties": {
            "fixture_id": {"type": "integer"},
            "asset_id": {"type": "integer"},
            "location_id": {"type": "integer"},
            "trade": {"type": "string", "enum": _TRADE_CODES, "description": "Only for a fault on a room itself."},
            "description": {"type": "string", "description": "What is wrong, in the reporter's words."},
            "priority": {"type": "string", "enum": PRIORITIES},
            "takes_room_out_of_service": {"type": "boolean", "default": False},
        }, "required": ["description"]},
        prepare=_prepare_fault, execute=_execute_fault,
    ),
    ActionDefinition(
        name="prepare_service_booking",
        module="service-requests", permission="add",
        description=(
            "Prepare booking an asset in for service, optionally assigned to a technician "
            "(find one with search_users role=technician). Nothing happens until confirmed."
        ),
        parameters={"type": "object", "properties": {
            "asset_id": {"type": "integer"},
            "description": {"type": "string", "description": "What needs doing."},
            "priority": {"type": "string", "enum": PRIORITIES},
            "assigned_technician_id": {"type": "integer"},
        }, "required": ["asset_id", "description"]},
        prepare=_prepare_booking, execute=_execute_booking,
    ),
    ActionDefinition(
        name="prepare_inspection_plan",
        module="maintenance", permission="add",
        description=(
            "Prepare a recurring inspection or maintenance plan on an asset, every N "
            "days. Nothing happens until confirmed."
        ),
        parameters={"type": "object", "properties": {
            "asset_id": {"type": "integer"},
            "name": {"type": "string", "description": "e.g. 'Quarterly filter change'."},
            "task_description": {"type": "string"},
            "interval_days": {"type": "integer", "minimum": 1, "maximum": 3650},
            "first_due_date": {"type": "string", "format": "date"},
            "priority": {"type": "string", "enum": PRIORITIES},
            "assigned_technician_id": {"type": "integer"},
        }, "required": ["asset_id", "name", "interval_days"]},
        prepare=_prepare_plan, execute=_execute_plan,
    ),
    ActionDefinition(
        name="prepare_work_order_update",
        module="service-requests", permission="edit",
        description=(
            "Prepare a change to an existing work order: move its status along its "
            "workflow, assign a technician, change priority, or add a note. Resolve the "
            "work order first. Nothing happens until confirmed."
        ),
        parameters={"type": "object", "properties": {
            "work_order_id": {"type": "integer"},
            "status": {"type": "string", "enum": [s.value for s in ServiceRequestStatus]},
            "assigned_technician_id": {"type": "integer"},
            "priority": {"type": "string", "enum": PRIORITIES},
            "note": {"type": "string"},
        }, "required": ["work_order_id"]},
        prepare=_prepare_update, execute=_execute_update,
    ),
)

ACTIONS_BY_NAME: dict[str, ActionDefinition] = {a.name: a for a in ACTION_DEFINITIONS}


# ── lifecycle ────────────────────────────────────────────────────────────────

def fingerprint(payload: dict[str, Any]) -> str:
    return hashlib.sha256(json.dumps(payload, sort_keys=True, default=str).encode("utf-8")).hexdigest()


def card_of(action: AssistantAction) -> dict[str, Any]:
    """The confirmation card as the browser and the agent see it."""
    return {
        "action_id": action.id,
        "action_type": action.action_type,
        "status": action.status,
        "expires_at": action.expires_at.isoformat() + "Z",
        **(action.card or {}),
        "result": action.result,
        "error": action.error,
    }


def propose(db: Session, user: User, name: str, arguments: dict[str, Any]) -> AssistantAction:
    """Validate and store a proposal. Raises ToolInputError or a permission error."""
    definition = ACTIONS_BY_NAME.get(name)
    if definition is None:
        raise ToolInputError("Unknown action: {}".format(name))
    allowed = set(definition.parameters.get("properties", {}))
    unexpected = set(arguments or {}) - allowed
    if unexpected:
        raise ToolInputError("Unexpected argument(s) for {}: {}".format(name, ", ".join(sorted(unexpected))))

    ctx = ToolContext(db=db, user=user)
    ctx.require_module(definition.module, definition.permission)
    prepared = definition.prepare(ctx, dict(arguments or {}))
    now = datetime.utcnow()
    action = AssistantAction(
        id=str(uuid.uuid4()),
        user_id=user.id,
        facility_id=prepared.facility_id,
        action_type=name,
        payload=prepared.payload,
        payload_hash=fingerprint(prepared.payload),
        card={"title": prepared.title,
              "lines": [{"label": k, "value": v} for k, v in prepared.lines],
              "warnings": prepared.warnings},
        status=ActionStatus.PROPOSED.value,
        created_at=now,
        expires_at=now + PROPOSAL_LIFETIME,
    )
    db.add(action)
    db.commit()
    return action


def _load_for_decision(db: Session, user: User, action_id: str) -> AssistantAction:
    action = (
        db.query(AssistantAction)
        .filter(AssistantAction.id == action_id)
        .with_for_update()
        .first()
    )
    # Someone else's proposal is indistinguishable from none at all.
    if action is None or action.user_id != user.id:
        raise HTTPException(status_code=404, detail="No such action.")
    return action


def confirm(db: Session, user: User, action_id: str) -> AssistantAction:
    """Run a proposal, once. Confirming an already executed action returns it unchanged."""
    action = _load_for_decision(db, user, action_id)
    if action.status == ActionStatus.EXECUTED.value:
        return action
    if action.status != ActionStatus.PROPOSED.value:
        raise HTTPException(status_code=409, detail="This action was already {}.".format(action.status))
    if datetime.utcnow() > action.expires_at:
        action.status = ActionStatus.EXPIRED.value
        action.decided_at = datetime.utcnow()
        db.commit()
        raise HTTPException(status_code=410, detail="This expired. Ask again to prepare it afresh.")
    if fingerprint(action.payload) != action.payload_hash:
        raise HTTPException(status_code=409, detail="The details changed after they were shown. Ask again.")

    definition = ACTIONS_BY_NAME[action.action_type]
    ctx = ToolContext(db=db, user=user)
    ctx.require_module(definition.module, definition.permission)

    # Claimed before running, so a double click cannot run it twice.
    action.status = ActionStatus.EXECUTED.value
    action.decided_at = datetime.utcnow()
    db.commit()
    try:
        action.result = definition.execute(db, user, action.payload)
    except HTTPException as exc:
        db.rollback()
        action = db.get(AssistantAction, action_id)
        action.status = ActionStatus.FAILED.value
        action.error = exc.detail if isinstance(exc.detail, str) else str(exc.detail)
    except Exception as exc:  # noqa: BLE001 - reported on the card, never swallowed silently
        db.rollback()
        action = db.get(AssistantAction, action_id)
        action.status = ActionStatus.FAILED.value
        action.error = "It could not be completed: {}".format(exc)
    db.commit()
    return action


def cancel(db: Session, user: User, action_id: str) -> AssistantAction:
    action = _load_for_decision(db, user, action_id)
    if action.status == ActionStatus.PROPOSED.value:
        action.status = ActionStatus.CANCELLED.value
        action.decided_at = datetime.utcnow()
        db.commit()
    return action
