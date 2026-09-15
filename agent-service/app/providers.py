"""Model access for the agent, on LangChain chat models.

The agent's real dependency is not a vendor but three capabilities: pick a tool
with valid arguments, follow a structured schema, and write prose from supplied
evidence. Three roles use them differently, so each resolves to its own model:

* ``router``    - one structured word in front of every question. Small and fast.
* ``tools``     - chooses tools and arguments. Accuracy matters most here.
* ``synthesis`` - writes the answer from evidence. Fluency matters most here.

Every role has a primary and a fallback model, normally on different providers.
A rate limit, a timeout or an outage on the primary continues the same turn on
the fallback instead of ending the conversation. Groq is the default primary
because it is fast; OpenRouter is the default fallback because it reaches
almost everything else.

Conversation shape: the graph stores turns in Anthropic's block shape, because
that is the shape the backend's tool registry already emits. Both directions
are translated here, so the graph carries one format and knows nothing about
any provider.
"""
from __future__ import annotations

import json
import logging
from dataclasses import dataclass, field
from typing import Any, AsyncIterator, Literal, Optional

from langchain_core.messages import (
    AIMessage, BaseMessage, HumanMessage, SystemMessage, ToolMessage,
)

from app.config import settings

logger = logging.getLogger("agent.providers")

Role = Literal["router", "tools", "synthesis"]

# Tool results can be long. This is the most any single one may contribute to
# the context, applied on the way into the model rather than after.
MAX_TOOL_RESULT_CHARS = 12000


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
    # The assistant turn in the shape the graph stores, replayed verbatim when
    # continuing a tool conversation.
    raw_assistant: Any = None


def is_configured() -> bool:
    """Whether the primary provider has something to call."""
    return settings.provider_ready(settings.AGENT_PROVIDER)


def describe() -> dict[str, Any]:
    """What the health endpoint reports: who answers, and with what."""
    roles = ("router", "tools", "synthesis")
    return {
        "provider": settings.AGENT_PROVIDER,
        "fallback_provider": settings.AGENT_FALLBACK_PROVIDER or None,
        "models": {role: settings.model_for(role) for role in roles},
        "fallback_models": (
            {role: settings.model_for(role, fallback=True) for role in roles}
            if settings.fallback_configured() else {}
        ),
        "configured": is_configured(),
    }


# --------------------------------------------------------------------------
# Building chat models
# --------------------------------------------------------------------------

# One question costs three or more model calls, and a chat model owns its HTTP
# client. Building one per call throws away the connection pool and pays a
# fresh TLS handshake every time, so they are cached by what makes them differ.
_models: dict[tuple, Any] = {}


def _build(provider: str, model: str, max_tokens: int, temperature: float):
    key = (provider, model, max_tokens, temperature)
    if key in _models:
        return _models[key]

    api_key, base_url = settings.provider_credentials(provider)
    if provider == "anthropic":
        from langchain_anthropic import ChatAnthropic

        chat = ChatAnthropic(
            model=model,
            api_key=api_key,
            max_tokens=max_tokens,
            temperature=temperature,
            timeout=settings.AGENT_TIMEOUT_SECONDS,
            max_retries=1,
        )
    else:
        # Groq, OpenRouter, Together, vLLM and a local Ollama are all an
        # OpenAI-compatible /chat/completions endpoint with a different URL.
        from langchain_openai import ChatOpenAI

        chat = ChatOpenAI(
            model=model,
            api_key=api_key or "not-required",   # a local endpoint needs none
            base_url=base_url or None,
            max_tokens=max_tokens,
            temperature=temperature,
            timeout=settings.AGENT_TIMEOUT_SECONDS,
            max_retries=1,
        )
    _models[key] = chat
    return chat


def _for_role(role: Role, max_tokens: int, temperature: float):
    """The model for a role, with its fallback attached when one is configured."""
    primary = _build(settings.AGENT_PROVIDER, settings.model_for(role), max_tokens, temperature)
    if not settings.fallback_configured():
        return primary
    secondary = _build(
        settings.AGENT_FALLBACK_PROVIDER,
        settings.model_for(role, fallback=True),
        max_tokens,
        temperature,
    )
    # Anything the primary raises - rate limit, timeout, 5xx - continues on the
    # fallback rather than failing the turn.
    return primary.with_fallbacks([secondary])


# --------------------------------------------------------------------------
# Shape conversion
# --------------------------------------------------------------------------

def _to_openai_tools(tools: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Anthropic-shaped tool definitions in the shape bind_tools expects."""
    return [{
        "type": "function",
        "function": {
            "name": tool["name"],
            "description": tool.get("description", ""),
            "parameters": tool.get("input_schema") or {"type": "object", "properties": {}},
        },
    } for tool in tools]


def _to_messages(system: str, messages: list[dict[str, Any]]) -> list[BaseMessage]:
    """The graph's stored turns as LangChain messages."""
    out: list[BaseMessage] = [SystemMessage(content=system)]
    for message in messages:
        role = message.get("role")
        content = message.get("content")

        if isinstance(content, str):
            out.append(HumanMessage(content=content) if role == "user"
                       else AIMessage(content=content))
            continue

        blocks = content or []
        if role == "assistant":
            text = "".join(b.get("text", "") for b in blocks if b.get("type") == "text")
            calls = [{
                "name": b["name"], "args": dict(b.get("input") or {}), "id": b["id"],
            } for b in blocks if b.get("type") == "tool_use"]
            out.append(AIMessage(content=text, tool_calls=calls))
            continue

        # A user turn carrying tool results becomes one tool message each.
        results = [b for b in blocks if b.get("type") == "tool_result"]
        if results:
            for block in results:
                out.append(ToolMessage(
                    content=str(block.get("content", ""))[:MAX_TOOL_RESULT_CHARS],
                    tool_call_id=block.get("tool_use_id") or "",
                ))
            continue
        out.append(HumanMessage(content="".join(
            b.get("text", "") for b in blocks if b.get("type") == "text")))
    return out


def _text_of(message: Any, *, strip: bool = True) -> str:
    """Prose from a reply, whether the provider returned a string or blocks.

    Streamed fragments must not be stripped: the space between two words
    arrives at the start of the next fragment, and trimming each one ran every
    word of a streamed answer together.
    """
    content = getattr(message, "content", "")
    if isinstance(content, str):
        return content.strip() if strip else content
    parts: list[str] = []
    for block in content or []:
        if isinstance(block, str):
            parts.append(block)
        elif isinstance(block, dict) and block.get("type") == "text":
            parts.append(block.get("text", ""))
    joined = "".join(parts)
    return joined.strip() if strip else joined


def _assistant_blocks(text: str, calls: list[ToolCall]) -> list[dict[str, Any]]:
    """The assistant turn in the one shape the graph stores."""
    blocks: list[dict[str, Any]] = []
    if text:
        blocks.append({"type": "text", "text": text})
    for call in calls:
        blocks.append({
            "type": "tool_use", "id": call.id, "name": call.name, "input": call.arguments,
        })
    return blocks


# --------------------------------------------------------------------------
# Calling
# --------------------------------------------------------------------------

async def complete(
    *,
    system: str,
    messages: list[dict[str, Any]],
    max_tokens: int,
    tools: Optional[list[dict[str, Any]]] = None,
    force_tool: Optional[str] = None,
    role: Role = "tools",
    temperature: float = 0.0,
) -> ModelReply:
    """One completion, optionally with tools. ``force_tool`` requires that tool."""
    model = _for_role(role, max_tokens, temperature)
    if tools:
        kwargs: dict[str, Any] = {}
        if force_tool:
            kwargs["tool_choice"] = (
                {"type": "tool", "name": force_tool}
                if settings.AGENT_PROVIDER == "anthropic"
                else {"type": "function", "function": {"name": force_tool}}
            )
        model = model.bind_tools(_to_openai_tools(tools), **kwargs)

    reply = await model.ainvoke(_to_messages(system, messages))
    calls: list[ToolCall] = []
    for call in getattr(reply, "tool_calls", None) or []:
        arguments = call.get("args")
        if isinstance(arguments, str):
            try:
                arguments = json.loads(arguments or "{}")
            except ValueError:
                # A malformed argument blob is the model to correct, not a
                # reason to abandon the run.
                logger.warning("Discarding unparsable arguments for %s", call.get("name"))
                arguments = {}
        calls.append(ToolCall(
            id=call.get("id") or "",
            name=call.get("name") or "",
            arguments=dict(arguments or {}),
        ))
    text = _text_of(reply)
    return ModelReply(text=text, tool_calls=calls, raw_assistant=_assistant_blocks(text, calls))


async def stream_text(
    *,
    system: str,
    messages: list[dict[str, Any]],
    max_tokens: int,
    role: Role = "synthesis",
    temperature: float = 0.3,
) -> AsyncIterator[str]:
    """Stream a prose completion, yielding text deltas as they arrive."""
    model = _for_role(role, max_tokens, temperature)
    async for chunk in model.astream(_to_messages(system, messages)):
        piece = _text_of(chunk, strip=False)
        if piece:
            yield piece
