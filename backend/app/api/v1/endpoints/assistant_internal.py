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

from app.assistant.kb.retrieval import search_knowledge
from app.assistant.tools.base import ToolContext
from app.assistant.tools.registry import (
    TOOLS_BY_NAME,
    anthropic_tool_schemas,
    dispatch,
)
from app.core.config import settings
from app.core.deps import get_current_user
from app.db.base import get_db
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


def require_superadmin(current_user: User = Depends(get_current_user)) -> User:
    """The assistant is a Super Admin capability in this release."""
    if current_user.role != UserRole.SUPERADMIN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="The assistant is available to Super Admin accounts only.",
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


@router.get("/tools", dependencies=[Depends(require_internal_caller)])
def list_tools(
    current_user: User = Depends(require_superadmin),
) -> Any:
    """Tool schemas the agent may offer the model, filtered to what this user can use."""
    from app.utils.permissions import has_module_permission

    allowed = tuple(
        definition.module
        for definition in TOOLS_BY_NAME.values()
        if definition.module == "platform"
        or has_module_permission(current_user, definition.module, "index")
    )
    schemas = anthropic_tool_schemas(allowed)
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
    current_user: User = Depends(require_superadmin),
) -> Any:
    """Run one read-only tool as the requesting user."""
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
            "arguments": {k: str(v)[:120] for k, v in arguments.items()},
            "total_count": result.total_count,
            "returned": len(result.items),
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
    current_user: User = Depends(require_superadmin),
) -> Any:
    """Retrieve supporting passages from the generated knowledge base.

    Returns an empty list when nothing matches. The agent must treat that as
    "no evidence" and say so rather than answering from the model's own prior
    knowledge.
    """
    started = time.perf_counter()
    hits = search_knowledge(db, payload.query, module=payload.module, limit=payload.limit)
    return {
        "query": payload.query,
        "count": len(hits),
        "results": [hit.as_evidence() for hit in hits],
        "elapsed_ms": int((time.perf_counter() - started) * 1000),
        "generated_at": datetime.utcnow().isoformat() + "Z",
    }
