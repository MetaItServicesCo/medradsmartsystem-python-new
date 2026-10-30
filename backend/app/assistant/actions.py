"""Changes the assistant is allowed to make, and the agreement it needs first.

Every tool here is two-phase, and both phases are the same function call.

Called without ``confirm_token`` nothing is written. The request is validated in
full -- permissions, facility scope, the records existing, the transition being
legal -- and then the exact change is recorded as a proposal and handed back
with a token and a sentence describing it. Called again with that token, and
only then, the change is applied.

This is not ceremony. The same assistant answers by voice, where "cancel
SR-000412" and "cancel SR-000420" differ by one syllable over a plant-room
microphone. Confirming a sentence the person can hear in full is the difference
between a question and an incident.

Three further properties, none of them optional:

* **Permissions are the user's.**  Writes go through the same module matrix as
  the API, with ``add`` for creation and ``edit`` for changes. The assistant
  never widens what its operator can already do.
* **Facility scope is enforced on the row.**  A facility-scoped user cannot
  change a request belonging to a site they cannot see, even by id.
* **A proposal is only valid against the state it was made on.**  The before
  image is compared when applying, so a request somebody else has modified in
  the meantime is refused rather than silently overwritten.
"""
from __future__ import annotations

import secrets
from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Any, Callable, Optional

from fastapi import HTTPException
from sqlalchemy.orm.attributes import flag_modified

from app.assistant.tools.base import ToolContext, ToolInputError, ToolResult
from app.models.assistant_action import ActionStatus, AssistantAction
from app.models.equipment import Equipment
from app.models.facility import Facility
from app.models.service_request import Priority, ServiceRequest, ServiceRequestStatus
from app.models.user import User
from app.utils.facility_access import require_assignable_technician
from app.utils.numbering import assign_unique_number
from app.utils.service_access import can_work_on_service_request


# Long enough to read a sentence back and answer it, short enough that a token
# left behind in a transcript is not still loaded an hour later.
PROPOSAL_TTL_MINUTES = 10

# Statuses the assistant may set. Completion and cancellation are included
# because they are what people most often ask for out loud. The quotation and
# approval states are not: they are driven by documents and money, and moving
# them from a sentence would skip the paperwork that gives them meaning.
SETTABLE_STATUSES: tuple[str, ...] = (
    ServiceRequestStatus.ASSIGNED.value,
    ServiceRequestStatus.IN_PROGRESS.value,
    ServiceRequestStatus.WAITING_ON_PARTS.value,
    ServiceRequestStatus.COMPLETED.value,
    ServiceRequestStatus.CANCELLED.value,
)

PRIORITIES: tuple[str, ...] = tuple(member.value for member in Priority)


# ---------------------------------------------------------------------------
# The two-phase machinery
# ---------------------------------------------------------------------------

@dataclass
class _Change:
    """One pending change: what it touches, how it reads, and how to do it."""

    entity_type: str
    entity_id: Optional[int]
    summary: str
    before: dict[str, Any]
    after: dict[str, Any]
    apply: Callable[[], int]


def _history_entry(action: str, user: User, changes: dict[str, Any]) -> dict[str, Any]:
    """The same shape the module writes, so one timeline shows both."""
    return {
        "timestamp": datetime.utcnow().isoformat(),
        "action": action,
        "user_id": user.id,
        "user": user.full_name or user.username,
        "changes": changes or {},
    }


def _record_history(sr: ServiceRequest, action: str, user: User,
                    changes: dict[str, Any]) -> None:
    history = list(sr.history or [])
    history.append(_history_entry(action, user, changes))
    sr.history = history
    flag_modified(sr, "history")


def _envelope(tool: str, action: dict[str, Any],
              item: Optional[dict] = None) -> ToolResult:
    return ToolResult(
        tool=tool,
        total_count=1 if item else 0,
        items=[item] if item else [],
        action=action,
    )


def _propose(ctx: ToolContext, tool: str, change: _Change) -> ToolResult:
    """Write down what would happen. Nothing is changed."""
    expires = datetime.utcnow() + timedelta(minutes=PROPOSAL_TTL_MINUTES)
    row = AssistantAction(
        token=secrets.token_urlsafe(32),
        tool=tool,
        user_id=ctx.user.id,
        status=ActionStatus.PROPOSED,
        entity_type=change.entity_type,
        entity_id=change.entity_id,
        summary=change.summary,
        before=change.before,
        after=change.after,
        expires_at=expires,
    )
    ctx.db.add(row)
    ctx.db.commit()
    return _envelope(tool, {
        "status": "proposed",
        "confirmation_token": row.token,
        "summary": change.summary,
        "entity_type": change.entity_type,
        "entity_id": change.entity_id,
        "before": change.before,
        "after": change.after,
        "expires_at": expires.isoformat() + "Z",
        "instruction": (
            "Nothing has changed yet. Read the summary back to the person and "
            "ask them to confirm. If they agree, call this same tool again "
            "with confirm_token set to the value above and every other "
            "argument identical."
        ),
    })


# One wording for every rejected token. Which of the reasons applies is not
# something a caller should be able to probe for.
_UNKNOWN_TOKEN = "That confirmation is not recognised. Propose the change again."


def _apply(ctx: ToolContext, tool: str, change: _Change, token: str) -> ToolResult:
    """Apply a change already agreed to, if it is still the same change."""
    row = ctx.db.query(AssistantAction).filter(AssistantAction.token == token).first()
    if row is None or row.user_id != ctx.user.id:
        raise ToolInputError(_UNKNOWN_TOKEN)
    if row.tool != tool:
        raise ToolInputError(
            "That confirmation was for a different change ({}). Propose this "
            "one again.".format(row.tool)
        )
    if row.status != ActionStatus.PROPOSED:
        raise ToolInputError(
            "That change was already {}. Propose it again if it needs "
            "repeating.".format(row.status.value)
        )
    if row.expires_at < datetime.utcnow():
        row.status = ActionStatus.EXPIRED
        ctx.db.commit()
        raise ToolInputError(
            "That confirmation has expired. Propose the change again so the "
            "person sees the current state before agreeing."
        )
    if row.before != change.before:
        # Somebody else moved it. Applying now would quietly undo their work.
        row.status = ActionStatus.FAILED
        row.error = "state changed between proposal and confirmation"
        ctx.db.commit()
        raise ToolInputError(
            "This record changed after the change was proposed, so nothing was "
            "applied. Look at it again and propose the change afresh."
        )

    try:
        entity_id = change.apply()
    except Exception as exc:  # noqa: BLE001 - recorded, then re-raised unchanged
        ctx.db.rollback()
        row = ctx.db.query(AssistantAction).filter(
            AssistantAction.token == token).first()
        if row is not None:
            row.status = ActionStatus.FAILED
            row.error = str(exc)[:500]
            ctx.db.commit()
        raise

    row.status = ActionStatus.APPLIED
    row.entity_id = entity_id
    row.applied_at = datetime.utcnow()
    ctx.db.commit()
    return _envelope(tool, {
        "status": "applied",
        "summary": change.summary,
        "entity_type": change.entity_type,
        "entity_id": entity_id,
        "before": change.before,
        "after": change.after,
        "applied_at": row.applied_at.isoformat() + "Z",
    })


def _run(ctx: ToolContext, tool: str, change: _Change,
         confirm_token: Optional[str]) -> ToolResult:
    token = (confirm_token or "").strip()
    return _apply(ctx, tool, change, token) if token else _propose(ctx, tool, change)


# ---------------------------------------------------------------------------
# Loading, scoped to what this user may touch
# ---------------------------------------------------------------------------

def _load_request(
    ctx: ToolContext,
    service_request_id: int,
    to_change: bool = True,
) -> ServiceRequest:
    sr = (
        ctx.db.query(ServiceRequest)
        .filter(ServiceRequest.id == int(service_request_id))
        .first()
    )
    missing = "No service request with id {}.".format(service_request_id)
    if sr is None:
        raise ToolInputError(missing)
    allowed = ctx.facility_ids()
    if allowed is not None and sr.facility_id not in allowed:
        # Same wording as "not found": telling a scoped user that a record
        # exists at a site they cannot see is itself a disclosure.
        raise ToolInputError(missing)
    if to_change and not can_work_on_service_request(ctx.user, sr):
        # Holding "edit" on the module is not the same as being allowed
        # to change this particular request. Employees and clients hold
        # edit so they can raise and track their own work; the module
        # itself only lets the assigned technician or a service operator
        # act on one, and the assistant must not be a way round that.
        raise ToolInputError(
            "{} is not assigned to you, so you cannot change it. Ask the "
            "technician it is assigned to, or an administrator."
            .format(sr.request_number)
        )
    return sr


def _load_active_user(ctx: ToolContext, user_id: int, what: str) -> User:
    person = ctx.db.query(User).filter(User.id == int(user_id)).first()
    if person is None or not person.is_active:
        raise ToolInputError(
            "No active user with id {} to {}.".format(user_id, what)
        )
    return person


def _state(sr: ServiceRequest) -> dict[str, Any]:
    """The fields these tools can change, as the proposal saw them."""
    return {
        "status": sr.status.value if sr.status else None,
        "priority": sr.priority.value if sr.priority else None,
        "assigned_technician_id": sr.assigned_technician_id,
        "resolution_description": sr.resolution_description,
    }


def _person(person: Optional[User]) -> str:
    if person is None:
        return "nobody"
    return person.full_name or person.username


def _row(sr: ServiceRequest) -> dict[str, Any]:
    return {
        "id": sr.id,
        "request_number": sr.request_number,
        "facility_id": sr.facility_id,
        "status": sr.status.value if sr.status else None,
        "priority": sr.priority.value if sr.priority else None,
        "assigned_technician_id": sr.assigned_technician_id,
    }


def _choice(value: str, allowed: tuple[str, ...], field: str) -> str:
    cleaned = (value or "").strip().lower()
    if cleaned not in allowed:
        raise ToolInputError(
            "{} must be one of: {}.".format(field, ", ".join(allowed))
        )
    return cleaned


# ---------------------------------------------------------------------------
# The tools
# ---------------------------------------------------------------------------

def create_service_request(
    ctx: ToolContext,
    facility_id: int,
    equipment_id: int,
    problem_description: str,
    priority: str,
    service_required: Optional[str] = None,
    assigned_technician_id: Optional[int] = None,
    confirm_token: Optional[str] = None,
) -> ToolResult:
    """Raise a new service request against one piece of equipment."""
    ctx.require_module("service-requests", "add")

    description = (problem_description or "").strip()
    if len(description) < 5:
        raise ToolInputError(
            "problem_description must say what is actually wrong, in at least "
            "a few words."
        )
    chosen_priority = _choice(priority, PRIORITIES, "priority")

    facility = ctx.db.query(Facility).filter(Facility.id == int(facility_id)).first()
    if facility is None:
        raise ToolInputError("No facility with id {}.".format(facility_id))
    allowed = ctx.facility_ids()
    if allowed is not None and facility.id not in allowed:
        raise ToolInputError("No facility with id {}.".format(facility_id))

    equipment = ctx.db.query(Equipment).filter(
        Equipment.id == int(equipment_id)).first()
    if equipment is None:
        raise ToolInputError("No equipment with id {}.".format(equipment_id))
    if equipment.facility_id != facility.id:
        raise ToolInputError(
            "That equipment belongs to a different facility, so a request for "
            "it cannot be raised at this one."
        )

    technician = None
    if assigned_technician_id is not None:
        technician = _load_active_user(ctx, assigned_technician_id, "assign it to")
        _require_assignable(ctx, technician, facility.id)

    after = {
        "facility_id": facility.id,
        "equipment_id": equipment.id,
        "problem_description": description,
        "service_required": (service_required or description).strip(),
        "priority": chosen_priority,
        "status": (
            ServiceRequestStatus.ASSIGNED.value if technician
            else ServiceRequestStatus.NEW.value
        ),
        "assigned_technician_id": technician.id if technician else None,
    }
    summary = (
        "Raise a {} priority service request at {} for equipment {}, "
        "\"{}\", assigned to {}.".format(
            chosen_priority, facility.name, equipment.id,
            description if len(description) <= 80 else description[:77] + "...",
            _person(technician),
        )
    )

    def apply() -> int:
        now = datetime.utcnow()
        sr = ServiceRequest(
            facility_id=facility.id,
            equipment_id=equipment.id,
            requester_id=ctx.user.id,
            assigned_technician_id=technician.id if technician else None,
            problem_description=description,
            service_required=after["service_required"],
            priority=Priority(chosen_priority),
            status=(
                ServiceRequestStatus.ASSIGNED if technician
                else ServiceRequestStatus.NEW
            ),
            assigned_at=now if technician else None,
            history=[],
        )
        # The same allocator the module uses, so numbers stay in one
        # sequence and a request raised by voice cannot collide with one
        # being filed on screen at the same moment.
        assign_unique_number(ctx.db, sr, "request_number", prefix="SR-")
        _record_history(sr, "created_by_assistant", ctx.user, {
            "priority": chosen_priority,
            "assigned_technician_id": technician.id if technician else None,
        })
        return sr.id

    return _run(ctx, "create_service_request", _Change(
        entity_type="service_request",
        entity_id=None,
        summary=summary,
        before={},
        after=after,
        apply=apply,
    ), confirm_token)


def _require_assignable(ctx: ToolContext, technician: User, facility_id: Optional[int]) -> None:
    """The same facility rule the service-request screen enforces.

    A facility account also working as a technician may only be given jobs at
    its own facilities; the assistant must not be a way around that.
    """
    try:
        require_assignable_technician(ctx.db, technician.id, facility_id)
    except HTTPException as exc:
        raise ToolInputError(str(exc.detail))


def assign_service_request(
    ctx: ToolContext,
    service_request_id: int,
    technician_id: int,
    confirm_token: Optional[str] = None,
) -> ToolResult:
    """Put a service request on a named technician."""
    ctx.require_module("service-requests", "edit")
    sr = _load_request(ctx, service_request_id)
    technician = _load_active_user(ctx, technician_id, "assign the request to")
    _require_assignable(ctx, technician, sr.facility_id)

    if sr.assigned_technician_id == technician.id:
        raise ToolInputError(
            "{} is already assigned to {}, so there is nothing to change."
            .format(sr.request_number, _person(technician))
        )

    before = _state(sr)
    previous = (
        ctx.db.query(User).filter(User.id == sr.assigned_technician_id).first()
        if sr.assigned_technician_id else None
    )
    after = dict(before)
    after["assigned_technician_id"] = technician.id
    # Assigning an untouched request is what moves it out of New, matching
    # what the module does when somebody picks it up.
    if sr.status == ServiceRequestStatus.NEW:
        after["status"] = ServiceRequestStatus.ASSIGNED.value

    summary = "Assign {} to {}, currently with {}.".format(
        sr.request_number, _person(technician), _person(previous))

    def apply() -> int:
        sr.assigned_technician_id = technician.id
        sr.assigned_at = datetime.utcnow()
        if sr.status == ServiceRequestStatus.NEW:
            sr.status = ServiceRequestStatus.ASSIGNED
        _record_history(sr, "assigned_by_assistant", ctx.user, {
            "assigned_technician_id": technician.id,
            "previous_technician_id": before["assigned_technician_id"],
        })
        return sr.id

    return _run(ctx, "assign_service_request", _Change(
        entity_type="service_request",
        entity_id=sr.id,
        summary=summary,
        before=before,
        after=after,
        apply=apply,
    ), confirm_token)


def set_service_request_status(
    ctx: ToolContext,
    service_request_id: int,
    status: str,
    resolution_description: Optional[str] = None,
    confirm_token: Optional[str] = None,
) -> ToolResult:
    """Move a service request to a new status."""
    ctx.require_module("service-requests", "edit")
    sr = _load_request(ctx, service_request_id)
    target = _choice(status, SETTABLE_STATUSES, "status")

    before = _state(sr)
    if before["status"] == target:
        raise ToolInputError(
            "{} is already {}, so there is nothing to change."
            .format(sr.request_number, target)
        )
    if before["status"] in (ServiceRequestStatus.COMPLETED.value,
                            ServiceRequestStatus.CANCELLED.value):
        raise ToolInputError(
            "{} is {} and reopening it is a decision for the module, not the "
            "assistant.".format(sr.request_number, before["status"])
        )

    resolution = (resolution_description or "").strip()
    if target == ServiceRequestStatus.COMPLETED.value and not resolution:
        raise ToolInputError(
            "Completing a request needs a resolution_description saying what "
            "was done."
        )

    after = dict(before)
    after["status"] = target
    if resolution:
        after["resolution_description"] = resolution

    summary = "Move {} from {} to {}{}.".format(
        sr.request_number, before["status"], target,
        ", recording \"{}\"".format(
            resolution if len(resolution) <= 80 else resolution[:77] + "..."
        ) if resolution else "")

    def apply() -> int:
        now = datetime.utcnow()
        sr.status = ServiceRequestStatus(target)
        if resolution:
            sr.resolution_description = resolution
        if target == ServiceRequestStatus.IN_PROGRESS.value and not sr.started_at:
            sr.started_at = now
        if target == ServiceRequestStatus.COMPLETED.value:
            sr.completed_at = now
        _record_history(sr, "status_changed_by_assistant", ctx.user, {
            "from": before["status"], "to": target,
        })
        return sr.id

    return _run(ctx, "set_service_request_status", _Change(
        entity_type="service_request",
        entity_id=sr.id,
        summary=summary,
        before=before,
        after=after,
        apply=apply,
    ), confirm_token)


def set_service_request_priority(
    ctx: ToolContext,
    service_request_id: int,
    priority: str,
    confirm_token: Optional[str] = None,
) -> ToolResult:
    """Raise or lower the priority of a service request."""
    ctx.require_module("service-requests", "edit")
    sr = _load_request(ctx, service_request_id)
    target = _choice(priority, PRIORITIES, "priority")

    before = _state(sr)
    if before["priority"] == target:
        raise ToolInputError(
            "{} is already {} priority, so there is nothing to change."
            .format(sr.request_number, target)
        )

    after = dict(before)
    after["priority"] = target
    summary = "Change {} from {} to {} priority.".format(
        sr.request_number, before["priority"], target)

    def apply() -> int:
        sr.priority = Priority(target)
        _record_history(sr, "priority_changed_by_assistant", ctx.user, {
            "from": before["priority"], "to": target,
        })
        return sr.id

    return _run(ctx, "set_service_request_priority", _Change(
        entity_type="service_request",
        entity_id=sr.id,
        summary=summary,
        before=before,
        after=after,
        apply=apply,
    ), confirm_token)
