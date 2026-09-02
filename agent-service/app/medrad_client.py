"""Client for the MedRad internal tool API.

The agent never touches PostgreSQL. It forwards the end user's own bearer token
alongside the internal shared key, so every tool executes under that user's
permissions and facility scope, enforced by the MedRad backend.
"""
from __future__ import annotations

import logging
from typing import Any, Optional

import httpx

from app.config import settings


logger = logging.getLogger("agent.medrad")


class MedRadError(RuntimeError):
    """A tool call failed in a way the model should be told about."""

    def __init__(self, message: str, *, recoverable: bool = True) -> None:
        super().__init__(message)
        self.recoverable = recoverable


class MedRadClient:
    def __init__(self, user_token: str) -> None:
        self._headers = {
            "X-Internal-Key": settings.MEDRAD_INTERNAL_KEY,
            "Authorization": "Bearer {}".format(user_token),
            "Accept": "application/json",
        }
        self._base = settings.MEDRAD_INTERNAL_URL.rstrip("/")

    async def __aenter__(self) -> "MedRadClient":
        self._client = httpx.AsyncClient(
            base_url=self._base,
            headers=self._headers,
            timeout=settings.MEDRAD_TIMEOUT_SECONDS,
        )
        return self

    async def __aexit__(self, *exc_info: Any) -> None:
        await self._client.aclose()

    async def list_tools(self) -> tuple[list[dict[str, Any]], dict[str, str]]:
        """Return the tool schemas and the module each one belongs to."""
        response = await self._client.get("/tools")
        self._raise_for_status(response, "list tools")
        payload = response.json()
        return payload.get("tools", []), payload.get("tool_modules", {})

    async def call_tool(self, name: str, arguments: dict[str, Any]) -> dict[str, Any]:
        response = await self._client.post(
            "/tools/{}".format(name), json={"arguments": arguments or {}}
        )
        # 422 means the model built a bad call. That is recoverable: hand the
        # message back so it can correct itself rather than failing the run.
        if response.status_code == 422:
            raise MedRadError(self._detail(response), recoverable=True)
        if response.status_code == 403:
            raise MedRadError(self._detail(response), recoverable=False)
        self._raise_for_status(response, "call tool {}".format(name))
        return response.json()

    async def search_knowledge(
        self, query: str, *, module: Optional[str] = None, limit: int = 6
    ) -> dict[str, Any]:
        payload: dict[str, Any] = {"query": query, "limit": limit}
        if module:
            payload["module"] = module
        response = await self._client.post("/knowledge/search", json=payload)
        self._raise_for_status(response, "search knowledge")
        return response.json()

    @staticmethod
    def _detail(response: httpx.Response) -> str:
        try:
            body = response.json()
        except ValueError:
            return response.text[:300]
        detail = body.get("detail", body)
        return detail if isinstance(detail, str) else str(detail)[:300]

    def _raise_for_status(self, response: httpx.Response, action: str) -> None:
        if response.is_success:
            return
        message = "Could not {} ({}): {}".format(action, response.status_code, self._detail(response))
        logger.warning(message)
        raise MedRadError(message, recoverable=response.status_code < 500)
