"""The assistant never describes records it did not retrieve.

Asked "what is Daniel Perez doing over the next five days", the assistant
answered with a client meeting on Monday, a follow-up call on Tuesday, a site
visit, a training session -- none of which exist anywhere. With no records in
hand, the answer step had been handed only help text and wrote a plausible
week. These are the guards:

* a question about records that brought back none is never sent to the model
  to be written: it is answered plainly as not found, or as the lookup that
  failed;
* a question about a person's day is never small talk;
* the answer and small-talk prompts forbid stating events that are not in the
  data.

    python agent-service/tests/test_no_invention.py
"""
from __future__ import annotations

import asyncio
import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))

import app.graph as graph  # noqa: E402
from app.prompts import (  # noqa: E402
    CHITCHAT_PROMPT, CLASSIFIER_PROMPT, SYNTHESIS_PROMPT, lookup_failed_message, records_not_found_message,
)

failures: list[str] = []


def ok(label: str, condition: bool, detail: object = "") -> None:
    print("{}  {}{}".format("PASS" if condition else "FAIL", label, f"  {detail}" if not condition and detail != "" else ""))
    if not condition:
        failures.append(label)


written: list[str] = []


async def _fake_stream_text(system, user, max_tokens, history=None):
    written.append(user)
    return "WRITTEN BY THE MODEL"


graph._stream_text = _fake_stream_text
graph._emit_phase = lambda *_: None

QUESTION = "What is Daniel Perez doing over the next five days?"
HELP_TEXT = [{"title": "Calendar", "text": "Schedules show technicians' bookings."}]


def answer(**state) -> str:
    written.clear()
    result = asyncio.run(graph.synthesize_node({"question": QUESTION, "voice": False, **state}))
    return result["answer"]


print("\nA question about records, with no records retrieved")
for intent in ("database", "hybrid"):
    text = answer(intent=intent, tool_results=[], knowledge=HELP_TEXT)
    ok(f"{intent}: not written by the model from help text", not written and text == records_not_found_message(), text)
text = answer(intent="database", tool_results=[], knowledge=[], tool_errors=["person_schedule: 503 unavailable"])
ok("a failed lookup is said as one, with what failed", not written
   and text == lookup_failed_message("person_schedule: 503 unavailable"), text)
text = answer(intent="hybrid", tool_results=[], knowledge=[], errors=["The assistant model was unavailable: timeout"])
ok("  and so is a model that could not be reached", not written and "model was unavailable" in text, text)
text = answer(tool_results=[], knowledge=HELP_TEXT)
ok("a question whose routing failed (no intent) is treated as about records", not written
   and text == records_not_found_message(), text)
ok("spoken, the same, said briefly", answer(intent="database", tool_results=[], knowledge=[], voice=True)
   == records_not_found_message(voice=True))

print("\nWhere the model is still asked to write")
schedule = [{"tool": "person_schedule", "result": {"items": [{"title": "Texas Pain Physicians"}]}}]
ok("with records retrieved: written, from them", answer(intent="database", tool_results=schedule, knowledge=[])
   == "WRITTEN BY THE MODEL" and "Texas Pain Physicians" in written[0])
ok("a how-to question from the documentation: written from it",
   answer(intent="knowledge", tool_results=[], knowledge=HELP_TEXT) == "WRITTEN BY THE MODEL")

print("\nA person's day is never small talk")
for question in ("what is daniel perez doing today", "hi what is on sams schedule", "where is sam",
                 "is daniel booked tomorrow", "what meetings does omar have"):
    ok(f"\"{question}\" is not routed as small talk", graph.local_intent(question) != "chitchat", graph.local_intent(question))
for question in ("how are you doing", "hi", "thanks", "ok cool"):
    ok(f"\"{question}\" still is", graph.local_intent(question) == "chitchat")
flat_classifier = " ".join(CLASSIFIER_PROMPT.split())
ok("the router is told a person's day is a database question",
   "what is Daniel doing today" in flat_classifier and 'is "database", never "chitchat" or "knowledge"' in flat_classifier)

print("\nThe prompts forbid invented events")
flat_answer = " ".join(SYNTHESIS_PROMPT.split())
ok("every job, meeting, call, time and place must be in live_data",
   "Every job, meeting, event, call, visit, time and place you mention must be in live_data" in flat_answer)
ok("  never a typical day, never an empty day filled", "never fill an empty day with plausible activities" in flat_answer)
flat_chat = " ".join(CHITCHAT_PROMPT.split())
ok("small talk states nothing about people, schedules or records",
   "You have no data here. Never state anything about a person, their schedule" in flat_chat)

print(f"\n{len(failures)} FAILED: {failures}" if failures else "\nALL PASSED")
sys.exit(1 if failures else 0)
