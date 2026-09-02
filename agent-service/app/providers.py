"""Model provider abstraction.

The agent's real dependency is not a vendor but three capabilities: pick a tool
with valid arguments, follow a structured schema, and write prose from supplied
evidence. Anything exposing those can drive it.

Two backends are implemented:

* ``anthropic``  - the Claude SDK, using native tool_use.
* ``openai``     - any OpenAI-compatible ``/chat/completions`` endpoint. That one
                   name covers Groq, OpenRouter, Together, vLLM and a local
                   Ollama, so self-hosting and hosted inference are the same
                   code path with a different base URL.

Tool schemas are written once in Anthropic's shape and converted here, because
that is the shape the backend's tool registry already emits.
"""
from __future__ import annotations

import json
import logging
from dataclasses import dataclass, field
from typing import Any, AsyncIterator, Optional

from app.config import settings


logger = logging.getLogger("agent.providers")


@dataclass
class ToolCall:
    """One tool the model asked to run, normalised across providers."""

    id: str
    name: str
    arguments: dict[str, Any]


@dataclass
class ModelReply:
    """A single completion: any prose, plus any tools requested."""

    text: str = ""
    tool_calls: list[ToolCall] = field(default_factory=list)
    # Provider-native assistant turn, replayed verbatim when continuing a tool
    # conversation. Each provider expects its own shape here.
    raw_assistant: Any = None


def provider_name() -> str:
    return (settings.AGENT_PROVIDER or "anthropic").strip().lower()


def is_configured() -> bool:
    if provider_name() == "openai":
        # A local endpoint legitimately needs no key, so only the URL is required.
        return bool(settings.agent_base_url())
    return bool(settings.agent_api_key())


# --------------------------------------------------------------------------
# Schema conversion
# --------------------------------------------------------------------------

def _to_openai_tools(tools: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return [{
        "type": "function",
        "function": {
            "name": tool["name"],
            "description": tool.get("description", ""),
            "parameters": tool.get("input_schema") or {"type": "object", "properties": {}},
        },
    } for tool in tools]


def _to_openai_messages(
    system: str, messages: list[dict[str, Any]]
) -> list[dict[str, Any]]:
    """Translate the Anthropic-shaped conversation into OpenAI's shape.

    Anthropic carries tool results as user-turn content blocks; OpenAI uses
    dedicated ``tool`` role messages. Flattening that difference here keeps the
    graph free of provider conditionals.
    """
    converted: list[dict[str, Any]] = [{"role": "system", "content": system}]
    for message in messages:
        role = message.get("role")
        content = message.get("content")

        if isinstance(content, str):
            converted.append({"role": role, "content": content})
            continue

        if role == "assistant":
            text_parts: list[str] = []
            calls: list[dict[str, Any]] = []
            for block in content or []:
                if block.get("type") == "text":
                    text_parts.append(block.get("text", ""))
                elif block.get("type") == "tool_use":
                    calls.append({
                        "id": block["id"],
                        "type": "function",
                        "function": {
                            "name": block["name"],
                            "arguments": json.dumps(block.get("input") or {}),
                        },
                    })
            entry: dict[str, Any] = {"role": "assistant", "content": " ".join(text_parts).strip() or None}
            if calls:
                entry["tool_calls"] = calls
            converted.append(entry)
            continue

        # A user turn carrying tool results becomes one tool message per result.
        results = [b for b in (content or []) if b.get("type") == "tool_result"]
        if results:
            for block in results:
                converted.append({
                    "role": "tool",
                    "tool_call_id": block.get("tool_use_id"),
                    "content": str(block.get("content", ""))[:12000],
                })
            continue

        text_parts = [b.get("text", "") for b in (content or []) if b.get("type") == "text"]
        converted.append({"role": "user", "content": " ".join(text_parts).strip()})
    return converted


# --------------------------------------------------------------------------
# Clients
# --------------------------------------------------------------------------

def _anthropic_client():
    import anthropic

    return anthropic.AsyncAnthropic(
        api_key=settings.agent_api_key(),
        timeout=settings.AGENT_TIMEOUT_SECONDS,
        max_retries=1,
    )


def _openai_client():
    from openai import AsyncOpenAI

    return AsyncOpenAI(
        api_key=settings.agent_api_key() or "not-required",
        base_url=settings.agent_base_url(),
        timeout=settings.AGENT_TIMEOUT_SECONDS,
        max_retries=1,
    )


def _cached_system(text: str) -> list[dict[str, Any]]:
    return [{"type": "text", "text": text, "cache_control": {"type": "ephemeral"}}]


async def complete(
    *,
    system: str,
    messages: list[dict[str, Any]],
    max_tokens: int,
    tools: Optional[list[dict[str, Any]]] = None,
    force_tool: Optional[str] = None,
) -> ModelReply:
    """One completion, optionally with tools. ``force_tool`` requires that tool."""
    if provider_name() == "openai":
        client = _openai_client()
        request: dict[str, Any] = {
            "model": settings.AGENT_MODEL,
            "max_tokens": max_tokens,
            "messages": _to_openai_messages(system, messages),
        }
        if tools:
            request["tools"] = _to_openai_tools(tools)
            request["tool_choice"] = (
                {"type": "function", "function": {"name": force_tool}}
                if force_tool else "auto"
            )
        response = await client.chat.completions.create(**request)
        choice = response.choices[0].message
        calls: list[ToolCall] = []
        for call in (choice.tool_calls or []):
            try:
                arguments = json.loads(call.function.arguments or "{}")
            except (TypeError, ValueError):
                # A malformed argument blob is the model's error to correct, not
                # a reason to abandon the run.
                logger.warning("Discarding unparsable arguments for %s", call.function.name)
                arguments = {}
            calls.append(ToolCall(id=call.id, name=call.function.name, arguments=arguments))
        return ModelReply(
            text=(choice.content or "").strip(),
            tool_calls=calls,
            raw_assistant=_assistant_blocks(choice.content, calls),
        )

    client = _anthropic_client()
    request = {
        "model": settings.AGENT_MODEL,
        "max_tokens": max_tokens,
        "system": _cached_system(system),
        "messages": messages,
    }
    if tools:
        request["tools"] = tools
        if force_tool:
            request["tool_choice"] = {"type": "tool", "name": force_tool}
    message = await client.messages.create(**request)

    text_parts: list[str] = []
    calls = []
    blocks: list[dict[str, Any]] = []
    for block in message.content:
        kind = getattr(block, "type", None)
        if kind == "text":
            text_parts.append(block.text)
            blocks.append({"type": "text", "text": block.text})
        elif kind == "tool_use":
            arguments = dict(block.input or {})
            calls.append(ToolCall(id=block.id, name=block.name, arguments=arguments))
            blocks.append({
                "type": "tool_use", "id": block.id,
                "name": block.name, "input": arguments,
            })
    return ModelReply(
        text="".join(text_parts).strip(), tool_calls=calls, raw_assistant=blocks
    )


def _assistant_blocks(content: Optional[str], calls: list[ToolCall]) -> list[dict[str, Any]]:
    """Anthropic-shaped assistant turn, so the graph stores one format only."""
    blocks: list[dict[str, Any]] = []
    if content:
        blocks.append({"type": "text", "text": content})
    for call in calls:
        blocks.append({
            "type": "tool_use", "id": call.id,
            "name": call.name, "input": call.arguments,
        })
    return blocks


async def stream_text(
    *, system: str, messages: list[dict[str, Any]], max_tokens: int
) -> AsyncIterator[str]:
    """Stream a prose completion, yielding text deltas as they arrive."""
    if provider_name() == "openai":
        client = _openai_client()
        stream = await client.chat.completions.create(
            model=settings.AGENT_MODEL,
            max_tokens=max_tokens,
            messages=_to_openai_messages(system, messages),
            stream=True,
        )
        async for chunk in stream:
            if not chunk.choices:
                continue
            delta = chunk.choices[0].delta
            if delta and delta.content:
                yield delta.content
        return

    client = _anthropic_client()
    async with client.messages.stream(
        model=settings.AGENT_MODEL,
        max_tokens=max_tokens,
        system=_cached_system(system),
        messages=messages,
    ) as stream:
        async for delta in stream.text_stream:
            if delta:
                yield delta
