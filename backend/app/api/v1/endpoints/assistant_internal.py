"""Internal tool API consumed by the agent microservice.

Two credentials are required on every call: the shared internal key, which
proves the caller is the agent service on the private network, and the end
user's own bearer token, which decides what the tool may see. The agent has no
identity of its own and no database access -- authorization is enforced here by
the same helpers the public API uses.
"""
from __future__ import annotations

import logging
import secrets
import time
from datetime import date, datetime
from typing import Any, Optional

from fastapi import APIRouter, Body, Depends, Header, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.assistant.kb.retrieval import search_knowledge_for_user
from app.assistant.tools.base import ToolContext
from app.assistant.tools.registry import (
    TOOLS_BY_NAME,
    anthropic_tool_schemas,
    dispatch,
)
from app.core.config import settings
from app.core.deps import get_current_user
from app.db.base import get_db
from app.models.facility import Facility
from app.models.user import User, UserRole
from app.utils.logging import log_activity


logger = logging.getLogger("medrad.assistant.internal")

router = APIRouter()

# Parameters the model sends as ISO strings that the tools expect as dates.
_DATE_ARGUMENTS = frozenset({"date_from", "date_to"})


def require_internal_caller(
    x_internal_key: Optional[str] = Header(None, alias="X-Internal-Key"),
) -> None:
    """Constant-time check that the caller is the agent service."""
    configured = (settings.ASSISTANT_INTERNAL_KEY or "").strip()
    if not settings.ASSISTANT_ENABLED or not configured:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="The assistant is not enabled on this deployment.",
        )
    if not x_internal_key or not secrets.compare_digest(x_internal_key, configured):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid internal credentials.",
        )


def require_assistant_user(current_user: User = Depends(get_current_user)) -> User:
    """Anyone signed in may run tools -- as themselves.

    This endpoint never widens what the caller can do. Every tool checks
    the module permission it needs against this user, rows are scoped to
    the facilities they may see, and the tool list they are offered is
    filtered to what they could actually run. The role gate that used to
    sit here was a blunt second copy of all that.
    """
    if not current_user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="This account is not active.",
        )
    return current_user


class ToolCallRequest(BaseModel):
    arguments: dict[str, Any] = Field(default_factory=dict)


class KnowledgeSearchRequest(BaseModel):
    query: str = Field(min_length=2, max_length=500)
    module: Optional[str] = Field(default=None, max_length=40)
    limit: int = Field(default=6, ge=1, le=12)


def _coerce_dates(arguments: dict[str, Any]) -> dict[str, Any]:
    coerced = dict(arguments or {})
    for key in _DATE_ARGUMENTS & set(coerced):
        value = coerced[key]
        if isinstance(value, str) and value:
            try:
                coerced[key] = date.fromisoformat(value[:10])
            except ValueError:
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail="{} must be an ISO date (YYYY-MM-DD).".format(key),
                )
        elif value in ("", None):
            coerced.pop(key, None)
    return coerced


# How each role reads in a sentence. The enum value is a database key and
# saying "hr_manager" out loud is nobody's idea of a conversation.
_ROLE_LABELS = {
    "superadmin": "Super Admin",
    "admin": "Administrator",
    "facility_admin": "Facility Administrator",
    "facility_manager": "Facility Manager",
    "technician": "Technician",
    "hr_manager": "HR Manager",
    "employee": "Employee",
    "client": "Client",
}


@router.get("/whoami", dependencies=[Depends(require_internal_caller)])
def whoami(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_assistant_user),
) -> Any:
    """Who the agent is talking to, derived from their own token.

    The agent asks for this rather than being told it by the caller. There
    are two paths into a conversation -- the streaming text endpoint and the
    voice socket -- and threading an identity through both would be two
    copies of the same thing, free to drift. More importantly it would be an
    identity the agent was handed, where this one it has to present the
    user's token to obtain.

    This exists to shape behaviour, not to grant anything. Every tool still
    checks its own permission against this user, and the tool list is
    filtered before the model ever sees it, so an agent that ignored all of
    this entirely could not reach a single row it should not.
    """
    from app.utils.facility_access import (
        get_user_facility_ids, is_facility_scoped_user,
    )
    from app.utils.permissions import ALL_MODULES, has_module_permission

    role = getattr(current_user.role, "value", str(current_user.role))

    # Only the actions they actually hold, so the agent can tell "you can
    # read this but not change it" from "you cannot see this at all".
    modules: dict[str, list[str]] = {}
    for module in ALL_MODULES:
        actions = [
            action for action in ("view", "add", "edit", "delete")
            if has_module_permission(current_user, module, action)
        ]
        if actions:
            modules[module] = actions

    scope: Any = "all"
    if is_facility_scoped_user(current_user):
        ids = sorted(get_user_facility_ids(db, current_user))
        names = [
            name for (name,) in db.query(Facility.name)
            .filter(Facility.id.in_(ids)).all()
        ] if ids else []
        scope = {"facility_ids": ids, "facilities": sorted(names)}

    return {
        "name": current_user.full_name or current_user.username,
        "role": role,
        "role_label": _ROLE_LABELS.get(role, role.replace("_", " ").title()),
        "facility_scope": scope,
        "modules": modules,
    }

@router.get("/tools", dependencies=[Depends(require_internal_caller)])
def list_tools(
    current_user: User = Depends(require_assistant_user),
) -> Any:
    """Tool schemas the agent may offer, filtered to what this user can use.

    Filtered per tool rather than per module. A write tool asks for "add"
    or "edit" where a search in the same module asks for "index", so
    somebody who may read service requests but not change them is offered
    the searches and not the actions -- and the model never sees a tool it
    would only be refused for calling.
    """
    from app.utils.permissions import has_module_permission

    usable = frozenset(
        definition.name
        for definition in TOOLS_BY_NAME.values()
        if definition.module == "platform"
        or has_module_permission(
            current_user, definition.module, definition.permission)
    )
    allowed = tuple(
        TOOLS_BY_NAME[name].module for name in usable
    )
    schemas = anthropic_tool_schemas(allowed, names=usable)
    # The module each tool belongs to travels with the schema so the agent can
    # narrow by module without maintaining its own copy of the mapping, which
    # would silently drift as tools are added.
    modules = {name: definition.module for name, definition in TOOLS_BY_NAME.items()}
    return {
        "tools": schemas,
        "tool_modules": {schema["name"]: modules[schema["name"]] for schema in schemas},
    }


@router.post("/tools/{tool_name}", dependencies=[Depends(require_internal_caller)])
def execute_tool(
    tool_name: str,
    payload: ToolCallRequest = Body(default_factory=ToolCallRequest),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_assistant_user),
) -> Any:
    """Run one tool as the requesting user.

    Most tools only read. The write tools are two-phase and enforce their
    own confirmation; this endpoint does not need to know which is which
    beyond recording it, because the permission each one requires is
    declared on its definition and checked inside the tool.
    """
    if tool_name not in TOOLS_BY_NAME:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Unknown tool: {}".format(tool_name),
        )

    arguments = _coerce_dates(payload.arguments)
    started = time.perf_counter()
    ctx = ToolContext(db=db, user=current_user)
    try:
        result = dispatch(tool_name, ctx, arguments)
    except HTTPException:
        raise
    except (KeyError, ValueError, TypeError) as exc:
        # Surfaced back to the model so it can correct its own call rather than
        # failing the whole run.
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)
        )
    elapsed_ms = int((time.perf_counter() - started) * 1000)

    # Every tool call is auditable: what was asked, of which data, by whom.
    log_activity(
        db,
        "assistant_tool_call",
        0,
        "ASSISTANT_TOOL",
        current_user,
        {
            "tool": tool_name,
            # The confirmation token is the thing that authorises a
            # change, so it is never written to the audit log -- a log
            # reader must not be able to replay an action from it.
            "arguments": {
                k: ("<redacted>" if k == "confirm_token" else str(v)[:120])
                for k, v in arguments.items()
            },
            "total_count": result.total_count,
            "returned": len(result.items),
            "writes": TOOLS_BY_NAME[tool_name].writes,
            "action": (result.action or {}).get("status"),
            "entity_id": (result.action or {}).get("entity_id"),
            "elapsed_ms": elapsed_ms,
        },
    )
    db.commit()

    payload_out = result.to_dict()
    payload_out["elapsed_ms"] = elapsed_ms
    return payload_out


@router.post("/knowledge/search", dependencies=[Depends(require_internal_caller)])
def knowledge_search(
    payload: KnowledgeSearchRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_assistant_user),
) -> Any:
    """Retrieve supporting passages this user is allowed to read.

    Returns an empty list when nothing matches. The agent must treat that
    as "no evidence" and say so rather than answering from the model's own
    prior knowledge.

    Empty with a non-empty ``withheld_modules`` means something different,
    and the two must not be confused: documentation exists, and this person
    may not read it. Saying "I have no documentation on that" there would be
    a lie that sends somebody hunting for a gap which does not exist.
    """
    started = time.perf_counter()
    found = search_knowledge_for_user(
        db, payload.query, current_user,
        module=payload.module, limit=payload.limit,
    )
    if found.withheld_modules:
        # Worth an audit line: it is the only record that somebody asked
        # about a part of the system they cannot see.
        logger.info(
            "Knowledge withheld from %s: %s",
            current_user.username, ", ".join(found.withheld_modules),
        )
    return {
        "query": payload.query,
        "count": len(found.hits),
        "results": [hit.as_evidence() for hit in found.hits],
        "withheld_modules": list(found.withheld_modules),
        "elapsed_ms": int((time.perf_counter() - started) * 1000),
        "generated_at": datetime.utcnow().isoformat() + "Z",
    }
