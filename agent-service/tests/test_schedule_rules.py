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

from app.prompts import SYNTHESIS_PROMPT, TOOL_PROMPT, VOICE_SYNTHESIS_PROMPT  # noqa: E402

failures: list[str] = []


def ok(label: str, condition: bool) -> None:
    print("{}  {}".format("PASS" if condition else "FAIL", label))
    if not condition:
        failures.append(label)


flat_tools = " ".join(TOOL_PROMPT.split())
flat_answer = " ".join(SYNTHESIS_PROMPT.split())
flat_voice = " ".join(VOICE_SYNTHESIS_PROMPT.split())

ok("\"assigned to me for the 16th\" is named as a my_schedule question",
   "what service requests are assigned to me for the 16th" in flat_tools)
ok("  whatever the person's role", "whatever the person's role" in flat_tools)
ok("  and the general search with their own id is ruled out",
   "search_service_requests with their own id answers a different question" in flat_tools)
ok("the old rule sending everyone's workload to the search is gone",
   "counting someone's assigned work is search_service_requests" not in flat_tools)
ok("  another named person's day or jobs is person_schedule, after resolve_entity",
   "Another named person's day or jobs" in flat_tools and "then person_schedule with that user_id" in flat_tools
   and '"jobs" means both' in flat_tools)
ok("  and the asker's own work is still my_schedule", "their own work is my_schedule" in flat_tools)

# "Has Sultan marked attendance today?"
ok("one person's attendance: resolve_entity, then search_attendance with user_id; ask if several match",
   "search_attendance with that user_id" in flat_tools and "If several people match, ask which" in flat_tools)
ok("  answered on that person's own clock, with their day and place",
   "on that person's own clock" in flat_tools and "Today in Karachi" in flat_tools)
ok("  no check-in is not absent: leave and last check-in are repeated",
   "No check-in is not the same as absent" in flat_tools
   and "no check-in is not the same as absent" in flat_answer)
ok("times are local, with the place, never a stored UTC timestamp",
   "Times are local" in flat_tools and "Never restate a stored UTC timestamp" in flat_tools
   and "Never present a stored UTC timestamp as a time of day" in flat_answer)
ok("the booked day and the raised day are told apart, with date_basis",
   "Preferred Date / Time" in flat_tools and "date_basis" in flat_tools
   and "never answer a question about one with the other" in flat_tools)
ok("answers never show internal numbers such as user IDs",
   "Never show internal database numbers: user IDs" in flat_answer)
ok("  people are \"you\" or their name, records their own number",
   "Refer to the person asking as \"you\"" in flat_answer and "SR-000024" in flat_answer)

# "What are my inspections from now on?"
ok("\"from now on\" / \"moving forward\" / \"upcoming\" is my_schedule with no dates: today and the next six days",
   '"From now on", "moving forward", "upcoming"' in flat_tools and "today and the next six days" in flat_tools)
ok("  every schedule answer says the dates it covers", "Every schedule answer says the dates it covers" in flat_tools
   and 'Never answer "your upcoming inspections" without the dates' in flat_tools)
ok("  overdue items are named first", "Name them first, as overdue" in flat_tools)
ok("  and it offers to look further ahead rather than implying that is all", "offer to look further ahead" in flat_tools)
ok("the written answer opens with the dates and puts overdue first",
   "A schedule answer opens with the days it covers, as dates" in flat_answer and "Items marked overdue come first" in flat_answer)
ok("the spoken answer says the days naturally, overdue first",
   "from today through Sunday the 22nd" in flat_voice and "Anything overdue comes first" in flat_voice)

# A technician sees only their own work: the answer must not pass it off as everyone's.
ok("an answer covering only the asker's own work says so",
   "say so in the answer. Never present such a count or ranking as the whole team's" in flat_answer)

print(f"\n{len(failures)} FAILED: {failures}" if failures else "\nALL PASSED")
sys.exit(1 if failures else 0)
