"""Run the evaluation questions against a live deployment and report what went wrong.

Uses the real graph, the configured models and the real backend, as a real
Super Admin. Nothing is confirmed, so prepared actions expire unused.

    docker compose exec agent python scripts/run_evals.py --token <super admin access token> [--site 3]

Get a token by signing in and copying it from the browser's local storage, or
from POST /api/v1/auth/login. Exit status is non-zero when any case fails, so
it can gate a model or prompt change.
"""
from __future__ import annotations

import argparse
import asyncio
import json
import pathlib
import sys
import time

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))

from app.graph import run_agent  # noqa: E402

CASES = pathlib.Path(__file__).resolve().parents[1] / "evals" / "questions.json"


async def run_case(case: dict, token: str, site: int | None) -> dict:
    started = time.perf_counter()
    final: dict = {}
    async for event in run_agent(case["question"], token, facility_id=site):
        if event.get("event") == "answer":
            final = event
    problems: list[str] = []
    if final.get("intent") not in case.get("intent", [final.get("intent")]):
        problems.append("routed {} (wanted {})".format(final.get("intent"), "/".join(case["intent"])))
    wanted_tools = case.get("tools_any")
    if wanted_tools and not set(wanted_tools) & set(final.get("tools_used") or []):
        problems.append("used {} (wanted any of {})".format(final.get("tools_used"), wanted_tools))
    if case.get("action"):
        prepared = [card.get("action_type") for card in final.get("actions") or []]
        if case["action"] not in prepared:
            problems.append("prepared {} (wanted {})".format(prepared, case["action"]))
    answer = (final.get("answer") or "").lower()
    for phrase in case.get("must_not_say", []):
        if phrase.lower() in answer:
            problems.append("claimed it was done: '{}'".format(phrase))
    if not answer.strip():
        problems.append("empty answer")
    return {"id": case["id"], "ok": not problems, "problems": problems,
            "seconds": round(time.perf_counter() - started, 1), "errors": final.get("errors") or []}


async def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--token", required=True, help="A Super Admin access token")
    parser.add_argument("--site", type=int, default=None, help="facility_id to ask from")
    parser.add_argument("--only", default="", help="Comma-separated case ids")
    args = parser.parse_args()

    cases = json.loads(CASES.read_text(encoding="utf-8"))["cases"]
    if args.only:
        wanted = set(args.only.split(","))
        cases = [c for c in cases if c["id"] in wanted]

    failures = 0
    for case in cases:
        result = await run_case(case, args.token, args.site)
        mark = "ok  " if result["ok"] else "FAIL"
        print("{} {:<18} {:>5}s  {}".format(mark, result["id"], result["seconds"],
                                             "; ".join(result["problems"] + result["errors"])))
        failures += 0 if result["ok"] else 1
    print("\n{} of {} passed".format(len(cases) - failures, len(cases)))
    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
