"""Agent microservice HTTP surface.

Never exposed publicly. The MedRad backend proxies browser requests here over
the private Docker network after authenticating the user and confirming the
Super Admin role.
"""
from __future__ import annotations

import json
import logging

from fastapi import FastAPI, Header, HTTPException, status
from pydantic import BaseModel, Field
from sse_starlette.sse import EventSourceResponse

from app.config import settings
from app.graph import run_agent


logging.basicConfig(level=getattr(logging, settings.LOG_LEVEL.upper(), logging.INFO))
logger = logging.getLogger("agent.main")

app = FastAPI(
    title="MedRad Assistant",
    version="1.0.0",
    docs_url=None,
    redoc_url=None,
    openapi_url=None,
)


class RunRequest(BaseModel):
    question: str = Field(min_length=2, max_length=2000)
    user_token: str = Field(min_length=10)


@app.get("/health")
async def health() -> dict[str, object]:
    return {
        "status": "ok",
        "service": settings.SERVICE_NAME,
        "model": settings.AGENT_MODEL,
        "model_configured": bool(settings.ANTHROPIC_API_KEY.strip()),
        "backend_configured": bool(settings.MEDRAD_INTERNAL_KEY.strip()),
    }


def _require_internal(key: str | None) -> None:
    import secrets

    expected = settings.MEDRAD_INTERNAL_KEY.strip()
    if not expected or not key or not secrets.compare_digest(key, expected):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid internal credentials.",
        )


@app.post("/internal/v1/runs/stream")
async def stream_run(
    payload: RunRequest,
    x_internal_key: str | None = Header(None, alias="X-Internal-Key"),
) -> EventSourceResponse:
    """Run one question, streaming progress then the final answer over SSE."""
    _require_internal(x_internal_key)
    if not settings.ANTHROPIC_API_KEY.strip():
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="The assistant model is not configured.",
        )

    async def event_source():
        try:
            async for event in run_agent(payload.question, payload.user_token):
                yield {"event": event.get("event", "message"), "data": json.dumps(event)}
        except Exception as exc:  # noqa: BLE001 - surface as a stream error, never a 500 mid-stream
            logger.exception("Agent run failed")
            yield {
                "event": "error",
                "data": json.dumps({"error": "The assistant failed: {}".format(exc)}),
            }

    return EventSourceResponse(event_source())
