"""Check the sentence a person reads when they ask about a locked module.

The backend decides what to withhold; this is the other half, and the half
that is actually visible. The wording matters more than it looks. "I have no
documentation on that" is false when documentation exists and the person
simply may not read it, and it sends them hunting for a gap in the knowledge
base rather than asking for access.

    python agent-service/tests/test_no_access_message.py
"""
from __future__ import annotations

import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))

from app.prompts import no_access_message  # noqa: E402


failures: list[str] = []


def ok(label: str, condition: bool, detail: str = "") -> None:
    print("{}  {}{}".format("PASS" if condition else "FAIL", label,
                            "  " + detail if detail else ""))
    if not condition:
        failures.append(label)


print("No-access wording")
print("=" * 72)

one = no_access_message(["sales"])
two = no_access_message(["sales", "billing"])
three = no_access_message(["sales", "billing", "hr"])
hyphen = no_access_message(["service-requests"])
spoken = no_access_message(["service-requests"], voice=True)

print()
for label, text in (("one", one), ("two", two), ("three", three),
                    ("spoken", spoken)):
    print("  {:<8} {}".format(label, text))
print()

ok("it names the module as the screen does", "Sales" in one, one)
ok("it does not claim the documentation is missing",
   "no documentation" not in one.lower())
ok("it does not say nothing was found", "nothing" not in one.lower())
ok("it says what to do next", "administrator" in one.lower())
ok("two modules read as a sentence", "Sales and Billing" in two, two)
ok("three modules read as a sentence", "Sales, Billing and HR" in three, three)
ok("an acronym is not title cased into nonsense",
   "HR" in three and "Hr" not in three)
ok("a hyphenated key gets its screen name",
   "Service Requests" in hyphen, hyphen)
ok("the spoken form stays short enough to hear",
   len(spoken) < 110, "{} chars".format(len(spoken)))
ok("the spoken form has no instructions to read aloud",
   "administrator" not in spoken.lower(), spoken)
ok("an unknown module still produces a sentence",
   "Widgets" in no_access_message(["widgets"]),
   no_access_message(["widgets"]))

print()
print("=" * 72)
if failures:
    print("{} failing: {}".format(len(failures), ", ".join(failures)))
    sys.exit(1)
print("All no-access wording checks passed.")
