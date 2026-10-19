"""Prove the assistant will not teach a module somebody cannot open.

The live-data tools were always filtered by the asker's permissions. The
knowledge base was not, which produced an assistant that would refuse to say
how many sales invoices were overdue and then explain, step by step, how to
raise one. The documentation is generated from the software, so nothing
confidential leaked -- but describing a screen to somebody who is barred from
it is incoherent, and the incoherence is the bug.

What is checked here is the scoping layer, which is the new code. Retrieval
itself is PostgreSQL full-text search (``to_tsquery``, ``ts_rank_cd``) and
cannot run on SQLite, so the candidate hits are supplied directly: this is a
test of which of them survive and what gets reported, not of ranking.

    python backend/tests/test_knowledge_scope.py
"""
from __future__ import annotations

import os
import pathlib
import sys

os.environ.setdefault("DATABASE_URL", "sqlite://")
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))

from app.assistant.kb import retrieval  # noqa: E402
from app.assistant.kb.retrieval import (  # noqa: E402
    RetrievedChunk, search_knowledge_for_user,
)
from app.models.user import User, UserRole  # noqa: E402


failures: list[str] = []


def ok(label: str, condition: bool, detail: str = "") -> None:
    print("{}  {}{}".format("PASS" if condition else "FAIL", label,
                            "  " + detail if detail else ""))
    if not condition:
        failures.append(label)


def chunk(module: str, title: str) -> RetrievedChunk:
    return RetrievedChunk(
        chunk_id=module + "-1", doc_id=module, title=title, heading="",
        module=module, kind="module", text="Steps for " + title,
        score=1.0, legs=("lexical",),
    )


CANDIDATES = [
    chunk("sales", "Creating a sales invoice"),
    chunk("billing", "Recording a payment"),
    chunk("service-requests", "Raising a service request"),
    chunk("platform", "Signing in"),
]


def fake_search(db, query, *, module=None, limit=6, embedding=None,
                preferred_kinds=None):
    """Stand in for PostgreSQL retrieval, honouring the module filter."""
    if module:
        return [c for c in CANDIDATES if c.module == module]
    return list(CANDIDATES)


retrieval.search_knowledge = fake_search  # noqa: E305


# Super Admin, full access by role.
boss = User(username="boss", role=UserRole.SUPERADMIN)
# Super Admin whose saved matrix removes sales. The saved matrix overrides the
# role table entirely, so this is a real account shape, not a contrivance.
narrowed = User(username="narrowed", role=UserRole.SUPERADMIN, permissions={
    "sales": {"index": False, "view": False, "add": False, "edit": False},
})
# Sales and billing removed, everything else left alone. Spelled out rather
# than borrowed from a role, so the test states its own premise: an earlier
# version used hr_manager and then asserted service requests survived, which
# hr_manager cannot see either. The code was right and the test was wrong.
_DENIED = {"index": False, "view": False, "add": False, "edit": False}
limited = User(username="limited", role=UserRole.SUPERADMIN, permissions={
    "sales": dict(_DENIED),
    "billing": dict(_DENIED),
})


print("Knowledge scoping")
print("=" * 72)

print()
print("Somebody with access sees everything")
print("-" * 72)

full = search_knowledge_for_user(None, "how do I create a sales invoice", boss)
ok("all candidates survive", len(full.hits) == 4, "{} hits".format(len(full.hits)))
ok("nothing is withheld", full.withheld_modules == ())
ok("the sales passage is there",
   any(h.module == "sales" for h in full.hits))

print()
print("Somebody without access is told so, not told nothing exists")
print("-" * 72)

named = search_knowledge_for_user(
    None, "how do I create a sales invoice", narrowed, module="sales")
ok("no sales passage comes back", named.hits == [])
ok("sales is named as withheld", named.withheld_modules == ("sales",),
   str(named.withheld_modules))

# The short-circuit must not depend on the knowledge base having a match, or
# the answer degrades to "no documentation" exactly when it matters.
def explode(*args, **kwargs):  # noqa: D401
    raise AssertionError("retrieval ran for a module the user cannot read")


saved, retrieval.search_knowledge = retrieval.search_knowledge, explode
try:
    short = search_knowledge_for_user(None, "anything", narrowed, module="sales")
    ok("a blocked module is answered without searching at all",
       short.withheld_modules == ("sales",))
except AssertionError as exc:
    ok("a blocked module is answered without searching at all", False, str(exc))
finally:
    retrieval.search_knowledge = saved

print()
print("Without a module hint, blocked passages are dropped and reported")
print("-" * 72)

mixed = search_knowledge_for_user(None, "how do I invoice", limited)
modules = sorted({h.module for h in mixed.hits})
ok("sales and billing are gone", "sales" not in modules and "billing" not in modules,
   "left with " + ", ".join(modules))
ok("both are reported as withheld",
   sorted(mixed.withheld_modules) == ["billing", "sales"],
   str(mixed.withheld_modules))
ok("what they can see still comes back",
   any(h.module == "service-requests" for h in mixed.hits))

print()
print("Documentation about the application itself stays readable")
print("-" * 72)

ok("platform passages survive for everyone",
   any(h.module == "platform" for h in mixed.hits))
ok("platform is never reported as withheld",
   "platform" not in mixed.withheld_modules)

print()
print("The limit still applies after filtering")
print("-" * 72)

capped = search_knowledge_for_user(None, "anything", boss, limit=2)
ok("no more than the limit is returned", len(capped.hits) == 2,
   "{} hits".format(len(capped.hits)))

print()
print("=" * 72)
if failures:
    print("{} failing: {}".format(len(failures), ", ".join(failures)))
    sys.exit(1)
print("All knowledge scoping checks passed.")
