"""The rules that keep "what is assigned to me for <day>" answered correctly.

An administrator who also works as a technician asked "What service requests
are assigned to me for 16 November?" and was told none: the model searched for
their own ID with the general search, which read the 16th as the day requests
were raised, and then showed them that internal ID. These are the instructions
that send the asker's own work to my_schedule, keep the two dates of a request
apart, and keep internal numbers out of answers.

    python agent-service/tests/test_schedule_rules.py
"""
from __future__ import annotations

import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))

from app.prompts import SYNTHESIS_PROMPT, TOOL_PROMPT  # noqa: E402

failures: list[str] = []


def ok(label: str, condition: bool) -> None:
    print("{}  {}".format("PASS" if condition else "FAIL", label))
    if not condition:
        failures.append(label)


flat_tools = " ".join(TOOL_PROMPT.split())
flat_answer = " ".join(SYNTHESIS_PROMPT.split())

ok("\"assigned to me for the 16th\" is named as a my_schedule question",
   "what service requests are assigned to me for the 16th" in flat_tools)
ok("  whatever the person's role", "whatever the person's role" in flat_tools)
ok("  and the general search with their own id is ruled out",
   "search_service_requests with their own id answers a different question" in flat_tools)
ok("the old rule sending everyone's workload to the search is gone",
   "counting someone's assigned work is search_service_requests" not in flat_tools)
ok("  it now covers other people only, and sends the asker to my_schedule",
   "counting another person's assigned work is search_service_requests" in flat_tools
   and "their own work is my_schedule" in flat_tools)
ok("the booked day and the raised day are told apart, with date_basis",
   "Preferred Date / Time" in flat_tools and "date_basis" in flat_tools
   and "never answer a question about one with the other" in flat_tools)
ok("answers never show internal numbers such as user IDs",
   "Never show internal database numbers: user IDs" in flat_answer)
ok("  people are \"you\" or their name, records their own number",
   "Refer to the person asking as \"you\"" in flat_answer and "SR-000024" in flat_answer)

print(f"\n{len(failures)} FAILED: {failures}" if failures else "\nALL PASSED")
sys.exit(1 if failures else 0)
