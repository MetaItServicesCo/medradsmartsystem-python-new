"""Measure whether the local model can serve this agent, on this hardware.

The question keeps coming up and has never been answered with a number. An
earlier attempt sent a thirteen-token prompt and reported how fast tokens came
out, which flatters a CPU badly: the agent's real prompts carry thirteen tool
schemas or several thousand characters of evidence, and reading a prompt that
size is usually the dominant cost on a machine with no GPU.

This sends prompts the shape the agent actually sends, and reports both halves
separately -- time spent reading, and time spent writing -- because only the
sum decides whether a spoken conversation is possible.

    docker compose --profile local-llm up -d ollama
    docker compose exec backend python -m scripts.benchmark_local_llm

Nothing here changes configuration. It only asks the model to answer twice.
"""
from __future__ import annotations

import asyncio
import json
import os
import sys
from typing import Any, Optional

import httpx


OLLAMA_URL = os.environ.get("OLLAMA_URL", "http://ollama:11434")
MODEL = os.environ.get("BENCHMARK_MODEL", "qwen2.5:7b-instruct")

# What the hosted model currently costs per turn, measured from the agent's own
# logs, so the comparison is against reality rather than against a hope.
HOSTED_GATHER_MS = 5000
HOSTED_SYNTHESIS_MS = 6000


def _tool_schemas(count: int = 13) -> str:
    """Roughly the JSON the agent puts in front of the model to choose a tool."""
    tools = []
    for index in range(count):
        tools.append({
            "name": "search_records_{}".format(index),
            "description": (
                "Search operational records with filters. Returns totals and a "
                "page of rows, each with identifiers and a deep link. Use this "
                "when the question asks how many, which, or for a list."
            ),
            "input_schema": {
                "type": "object",
                "properties": {
                    "facility_id": {"type": "integer", "description": "Restrict to one facility."},
                    "status": {"type": "string", "description": "One of the documented statuses."},
                    "date_from": {"type": "string", "description": "ISO date, inclusive."},
                    "date_to": {"type": "string", "description": "ISO date, inclusive."},
                    "assigned_user_id": {"type": "integer", "description": "Restrict to one person."},
                    "limit": {"type": "integer", "description": "Rows to return, max 50."},
                },
                "required": [],
            },
        })
    return json.dumps(tools)


def _evidence(rows: int = 40) -> str:
    """Roughly what synthesis reads back after the tools have run."""
    items = [{
        "id": 1000 + index,
        "name": "Facility {}".format(index),
        "city": "Riyadh",
        "status": "active",
        "open_requests": index % 7,
        "revenue": 10000 + index * 137,
        "route": "/facilities?search=Facility+{}".format(index),
    } for index in range(rows)]
    return json.dumps({"live_data": [{"tool": "search_facilities", "result": {
        "total_count": rows, "items": items,
    }}], "knowledge_base": [], "errors": []})


TOOL_PROMPT = (
    "You answer questions about live operational data by calling read-only "
    "tools. Every figure must come from a tool result. Never estimate.\n\n"
    "Tools available:\n{}\n\n"
    "Question: How many facilities are active, and which has the most open "
    "service requests?"
).format(_tool_schemas())

SYNTHESIS_PROMPT = (
    "You are speaking this answer aloud. Two or three sentences, answer first, "
    "numbers spoken as words, no field names.\n\n"
    "Evidence:\n<evidence>{}</evidence>\n\n"
    "Question: How many facilities are active, and which has the most open "
    "service requests?"
).format(_evidence())


async def _run(client: httpx.AsyncClient, prompt: str, max_tokens: int) -> Optional[dict[str, Any]]:
    try:
        response = await client.post(
            "{}/api/generate".format(OLLAMA_URL.rstrip("/")),
            json={
                "model": MODEL,
                "prompt": prompt,
                "stream": False,
                "options": {"num_predict": max_tokens},
            },
        )
    except Exception as exc:
        print("  could not reach Ollama at {}: {}".format(OLLAMA_URL, exc))
        return None
    if response.status_code != 200:
        print("  HTTP {}: {}".format(response.status_code, response.text[:200]))
        return None
    return response.json()


def _report(label: str, data: dict[str, Any]) -> int:
    read_tokens = data.get("prompt_eval_count") or 0
    read_secs = (data.get("prompt_eval_duration") or 0) / 1e9
    wrote_tokens = data.get("eval_count") or 0
    wrote_secs = (data.get("eval_duration") or 0) / 1e9

    total_ms = int((read_secs + wrote_secs) * 1000)
    print("  {}".format(label))
    if read_secs:
        print("    read  {:>5} tokens in {:>6.1f}s  ({:.0f} tok/s)".format(
            read_tokens, read_secs, read_tokens / read_secs))
    if wrote_secs:
        print("    wrote {:>5} tokens in {:>6.1f}s  ({:.1f} tok/s)".format(
            wrote_tokens, wrote_secs, wrote_tokens / wrote_secs))
    print("    total {:.1f}s".format(total_ms / 1000))
    return total_ms


async def main() -> int:
    print("Local model benchmark")
    print("  model : {}".format(MODEL))
    print("  host  : {}".format(OLLAMA_URL))
    print()

    async with httpx.AsyncClient(timeout=900) as client:
        print("Warming the model (first load pulls several GB into memory)...")
        if await _run(client, "Say OK.", 4) is None:
            print("\nOllama is not reachable. Start it with:")
            print("  docker compose --profile local-llm up -d ollama")
            return 1
        print()

        print("Measuring the two calls a spoken question actually makes:")
        tool_data = await _run(client, TOOL_PROMPT, 120)
        if tool_data is None:
            return 1
        tool_ms = _report("choosing a tool (large schema prompt, short answer)", tool_data)

        synth_data = await _run(client, SYNTHESIS_PROMPT, 200)
        if synth_data is None:
            return 1
        synth_ms = _report("writing the answer (evidence prompt, spoken length)", synth_data)

    # A real turn makes at least two tool-loop calls plus the synthesis.
    turn_ms = tool_ms * 2 + synth_ms
    hosted_ms = HOSTED_GATHER_MS + HOSTED_SYNTHESIS_MS

    print()
    print("-" * 68)
    print("Estimated per turn : {:.0f}s local  vs  ~{:.0f}s on the hosted model".format(
        turn_ms / 1000, hosted_ms / 1000))
    print()
    if turn_ms <= hosted_ms * 1.3:
        print("VERDICT: competitive. Point AGENT_BASE_URL at http://ollama:11434/v1")
        print("         and keep the data on this machine.")
    elif turn_ms < 25000:
        print("VERDICT: slower, but perhaps worth it. Everything stays on this")
        print("         machine, which is the real argument for local inference:")
        print("         tool results carry real facility names and revenue.")
        print("         Consider local for routing and chitchat only.")
    else:
        print("VERDICT: too slow for a spoken conversation on this hardware.")
        print("         Reading the prompt is the bottleneck, not writing the")
        print("         answer, so a smaller model helps more than a shorter one.")
    print("-" * 68)
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
