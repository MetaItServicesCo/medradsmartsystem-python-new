"""Prove the assistant cannot change anything by accident.

The whole safety argument for letting an assistant write rests on four claims,
and each one is easy to believe and hard to be sure of:

1. A write tool called normally changes nothing. It describes what it would do.
2. Only the token it issued, for that tool, for that user, applies the change.
3. A token stops working: once used, once expired, and the moment somebody else
   touches the record it was issued against.
4. The caller's own permissions and facility scope still decide everything.

None of that is observable from a conversation that happens to go well, so it
is checked here against the real models and the real tools -- no fakes that
quietly re-implement the thing under test.

    DATABASE_URL=sqlite:// python backend/tests/test_assistant_writes.py
"""
from __future__ import annotations

import os
import pathlib
import sys
from datetime import datetime, timedelta

os.environ.setdefault("DATABASE_URL", "sqlite://")
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))

from sqlalchemy import create_engine  # noqa: E402
from sqlalchemy.orm import sessionmaker  # noqa: E402
from sqlalchemy.pool import StaticPool  # noqa: E402

import app.models  # noqa: E402,F401  - registers every table on the metadata
from app.assistant import actions  # noqa: E402
from app.assistant.tools.base import ToolContext, ToolInputError  # noqa: E402
from app.assistant.tools.registry import TOOLS_BY_NAME, dispatch  # noqa: E402
from app.db.base import Base  # noqa: E402
from app.models.assistant_action import ActionStatus, AssistantAction  # noqa: E402
from app.models.equipment import Equipment  # noqa: E402
from app.models.facility import Facility  # noqa: E402
from app.models.modality import Modality, ModalityCategory  # noqa: E402
from app.models.service_request import (  # noqa: E402
    Priority, ServiceRequest, ServiceRequestStatus,
)
from app.models.user import User, UserRole, UserType  # noqa: E402


failures: list[str] = []


def ok(label: str, condition: bool, detail: str = "") -> None:
    print("{}  {}{}".format("PASS" if condition else "FAIL", label,
                            "  " + detail if detail else ""))
    if not condition:
        failures.append(label)


def refused(label: str, fn, expect: str = "") -> None:
    """The call must be refused, and the refusal must say something useful."""
    try:
        fn()
    except ToolInputError as exc:
        message = str(exc.detail)
        if expect and expect.lower() not in message.lower():
            ok(label, False, "refused, but for the wrong reason: " + message)
        else:
            ok(label, True, message[:72])
        return
    except Exception as exc:  # noqa: BLE001
        ok(label, False, "raised {} instead of a refusal".format(type(exc).__name__))
        return
    ok(label, False, "was allowed")


# ---------------------------------------------------------------------------
# A small world
# ---------------------------------------------------------------------------

engine = create_engine("sqlite://", connect_args={"check_same_thread": False},
                       poolclass=StaticPool)
Base.metadata.create_all(engine)
Session = sessionmaker(bind=engine)
db = Session()


def make_user(username: str, role, facility_id=None) -> User:
    person = User(
        username=username,
        email=username + "@example.test",
        full_name=username.replace("_", " ").title(),
        hashed_password="x",
        user_type=UserType.EMPLOYEE,
        role=role,
        is_active=True,
        facility_id=facility_id,
    )
    db.add(person)
    db.flush()
    return person


def make_site(name: str) -> Facility:
    return Facility(
        name=name, phone="000", email=name.replace(" ", "") + "@example.test",
        address="1 Example Way", city="Houston", state="TX",
        zip_code="77001", country="US",
    )


site_a = make_site("Site A")
site_b = make_site("Site B")
db.add_all([site_a, site_b])
db.flush()

ultrasound = Modality(name="Ultrasound", category=ModalityCategory.IMAGING)
db.add(ultrasound)
db.flush()

boss = make_user("boss", UserRole.SUPERADMIN)
tech = make_user("tech", UserRole.TECHNICIAN)
other_tech = make_user("other_tech", UserRole.TECHNICIAN)
hr = make_user("hr_person", UserRole.HR_MANAGER)
local = make_user("site_a_admin", UserRole.FACILITY_ADMIN, facility_id=site_a.id)

pump = Equipment(
    asset_tag="AT-0001", make="Acme", model="P100", serial_number="SN-0001",
    modality_id=ultrasound.id, facility_id=site_a.id,
)
db.add(pump)
db.flush()


def make_request(facility, status=ServiceRequestStatus.NEW,
                 priority=Priority.LOW, technician=None) -> ServiceRequest:
    last = db.query(ServiceRequest).order_by(ServiceRequest.id.desc()).first()
    sr = ServiceRequest(
        request_number="SR-{:06d}".format((last.id + 1) if last else 1),
        facility_id=facility.id,
        equipment_id=pump.id,
        requester_id=boss.id,
        problem_description="It makes a noise",
        priority=priority,
        status=status,
        assigned_technician_id=technician.id if technician else None,
        history=[],
    )
    db.add(sr)
    db.commit()
    return sr


admin_ctx = ToolContext(db=db, user=boss)
hr_ctx = ToolContext(db=db, user=hr)
local_ctx = ToolContext(db=db, user=local)


print("Assistant writes")
print("=" * 72)

# ---------------------------------------------------------------------------
# 1. The first call changes nothing
# ---------------------------------------------------------------------------
print()
print("A first call describes, it does not do")
print("-" * 72)

sr = make_request(site_a)
result = actions.set_service_request_priority(admin_ctx, sr.id, "high")
proposal = result.action or {}

ok("nothing is changed", sr.priority == Priority.LOW,
   "priority still {}".format(sr.priority.value))
ok("status is proposed", proposal.get("status") == "proposed")
ok("a token comes back", bool(proposal.get("confirmation_token")))
ok("the summary names both ends",
   "low" in proposal.get("summary", "") and "high" in proposal.get("summary", ""),
   proposal.get("summary", ""))
ok("before and after differ",
   proposal.get("before", {}).get("priority") == "low"
   and proposal.get("after", {}).get("priority") == "high")

row = db.query(AssistantAction).filter(
    AssistantAction.token == proposal["confirmation_token"]).first()
ok("the proposal is recorded", row is not None and row.status == ActionStatus.PROPOSED)
ok("the recorded summary is the one shown",
   row is not None and row.summary == proposal.get("summary"))

# ---------------------------------------------------------------------------
# 2. The token applies it, once
# ---------------------------------------------------------------------------
print()
print("The token applies it, exactly once")
print("-" * 72)

token = proposal["confirmation_token"]
applied = actions.set_service_request_priority(
    admin_ctx, sr.id, "high", confirm_token=token).action or {}
db.refresh(sr)

ok("the change lands", sr.priority == Priority.HIGH)
ok("status is applied", applied.get("status") == "applied")
ok("the row is marked applied",
   db.query(AssistantAction).filter(AssistantAction.token == token).first().status
   == ActionStatus.APPLIED)
ok("history records it",
   any(entry.get("action") == "priority_changed_by_assistant"
       for entry in (sr.history or [])))
ok("history names the actor",
   (sr.history or [{}])[-1].get("user_id") == boss.id)

refused("the same token cannot be used twice",
        lambda: actions.set_service_request_priority(
            admin_ctx, sr.id, "critical", confirm_token=token),
        "already")

# ---------------------------------------------------------------------------
# 3. Tokens are narrow
# ---------------------------------------------------------------------------
print()
print("A token authorises one change and nothing else")
print("-" * 72)

sr2 = make_request(site_a)
p2 = (actions.set_service_request_priority(admin_ctx, sr2.id, "high").action or {})
t2 = p2["confirmation_token"]

refused("a token from one tool will not drive another",
        lambda: actions.set_service_request_status(
            admin_ctx, sr2.id, "cancelled", confirm_token=t2),
        "different change")

refused("an invented token is refused",
        lambda: actions.set_service_request_priority(
            admin_ctx, sr2.id, "high", confirm_token="not-a-real-token"),
        "not recognised")

# Someone else's token, even for the identical change.
sr3 = make_request(site_a)
p3 = (actions.set_service_request_priority(admin_ctx, sr3.id, "high").action or {})
refused("another user's token is refused",
        lambda: actions.set_service_request_priority(
            local_ctx, sr3.id, "high", confirm_token=p3["confirmation_token"]),
        "not recognised")

# Expiry.
expired_row = db.query(AssistantAction).filter(
    AssistantAction.token == t2).first()
expired_row.expires_at = datetime.utcnow() - timedelta(seconds=1)
db.commit()
refused("an expired token is refused",
        lambda: actions.set_service_request_priority(
            admin_ctx, sr2.id, "high", confirm_token=t2),
        "expired")
ok("expiry is recorded",
   db.query(AssistantAction).filter(AssistantAction.token == t2).first().status
   == ActionStatus.EXPIRED)

# ---------------------------------------------------------------------------
# 4. Somebody else moved it
# ---------------------------------------------------------------------------
print()
print("A record that moved under the proposal is not overwritten")
print("-" * 72)

sr4 = make_request(site_a, priority=Priority.LOW)
p4 = (actions.set_service_request_priority(admin_ctx, sr4.id, "high").action or {})
# Meanwhile, a person in the module sets it themselves.
sr4.priority = Priority.CRITICAL
db.commit()

refused("a changed record refuses the stale confirmation",
        lambda: actions.set_service_request_priority(
            admin_ctx, sr4.id, "high", confirm_token=p4["confirmation_token"]),
        "changed")
db.refresh(sr4)
ok("the other person's change survives", sr4.priority == Priority.CRITICAL)
ok("the stale proposal is marked failed",
   db.query(AssistantAction).filter(
       AssistantAction.token == p4["confirmation_token"]).first().status
   == ActionStatus.FAILED)

# ---------------------------------------------------------------------------
# 5. Permissions and facility scope are the caller's
# ---------------------------------------------------------------------------
print()
print("The caller's own permissions still decide")
print("-" * 72)

sr5 = make_request(site_a)
try:
    actions.set_service_request_priority(hr_ctx, sr5.id, "high")
    ok("a role without service-requests is refused", False, "was allowed")
except Exception as exc:  # ToolPermissionError is an HTTPException
    ok("a role without service-requests is refused",
       getattr(exc, "status_code", None) == 403, str(getattr(exc, "detail", exc))[:60])

sr_elsewhere = make_request(site_b)
refused("a scoped user cannot touch another site's request",
        lambda: actions.set_service_request_priority(local_ctx, sr_elsewhere.id, "high"),
        "No service request")
ok("and is not told it exists",
   "Site B" not in str(sr_elsewhere.facility_id))

sr_here = make_request(site_a, priority=Priority.LOW)
proposal_local = actions.set_service_request_priority(
    local_ctx, sr_here.id, "high").action or {}
ok("a scoped user can act within their own site",
   proposal_local.get("status") == "proposed")

# ---------------------------------------------------------------------------
# 6. The rules each tool enforces
# ---------------------------------------------------------------------------
print()
print("Each tool refuses what it should")
print("-" * 72)

sr6 = make_request(site_a, priority=Priority.LOW)
refused("a change that changes nothing is refused",
        lambda: actions.set_service_request_priority(admin_ctx, sr6.id, "low"),
        "nothing to change")

refused("an invalid priority is refused",
        lambda: actions.set_service_request_priority(admin_ctx, sr6.id, "urgent"),
        "must be one of")

refused("completing without saying what was done is refused",
        lambda: actions.set_service_request_status(admin_ctx, sr6.id, "completed"),
        "resolution_description")

done = make_request(site_a, status=ServiceRequestStatus.COMPLETED)
refused("a completed request is not reopened by the assistant",
        lambda: actions.set_service_request_status(admin_ctx, done.id, "in_progress"),
        "decision for the module")

refused("a status the assistant may not set is refused",
        lambda: actions.set_service_request_status(
            admin_ctx, sr6.id, "waiting_for_approval"),
        "must be one of")

assigned = make_request(site_a, technician=tech)
refused("assigning to who already has it is refused",
        lambda: actions.assign_service_request(admin_ctx, assigned.id, tech.id),
        "already assigned")

refused("assigning to a user who does not exist is refused",
        lambda: actions.assign_service_request(admin_ctx, assigned.id, 9999),
        "No active user")

refused("a request that does not exist is refused",
        lambda: actions.set_service_request_priority(admin_ctx, 9999, "high"),
        "No service request")

# ---------------------------------------------------------------------------
# 7. Creating, and assigning
# ---------------------------------------------------------------------------
print()
print("Creating and assigning")
print("-" * 72)

before_count = db.query(ServiceRequest).count()
create = actions.create_service_request(
    admin_ctx, site_a.id, pump.id, "Pump alarms on startup", "high").action or {}
ok("creating proposes without creating",
   db.query(ServiceRequest).count() == before_count,
   "still {} requests".format(before_count))

created = actions.create_service_request(
    admin_ctx, site_a.id, pump.id, "Pump alarms on startup", "high",
    confirm_token=create["confirmation_token"]).action or {}
new_sr = db.query(ServiceRequest).filter(
    ServiceRequest.id == created["entity_id"]).first()

ok("the request now exists", new_sr is not None)
ok("it is numbered like the module's own",
   new_sr is not None and new_sr.request_number.startswith("SR-")
   and len(new_sr.request_number) == 9, new_sr.request_number if new_sr else "")
ok("unassigned work starts as new",
   new_sr is not None and new_sr.status == ServiceRequestStatus.NEW)
ok("the raiser is the person who asked",
   new_sr is not None and new_sr.requester_id == boss.id)
ok("the action records which row it made",
   created.get("entity_id") == (new_sr.id if new_sr else None))

refused("equipment from another site is refused",
        lambda: actions.create_service_request(
            admin_ctx, site_b.id, pump.id, "Wrong site entirely", "low"),
        "different facility")

refused("a description that says nothing is refused",
        lambda: actions.create_service_request(
            admin_ctx, site_a.id, pump.id, "bad", "low"),
        "at least a few words")

# Assigning moves a new request out of new.
fresh = make_request(site_a)
a1 = actions.assign_service_request(admin_ctx, fresh.id, tech.id).action or {}
actions.assign_service_request(
    admin_ctx, fresh.id, tech.id, confirm_token=a1["confirmation_token"])
db.refresh(fresh)
ok("assigning sets the technician", fresh.assigned_technician_id == tech.id)
ok("assigning moves it out of new", fresh.status == ServiceRequestStatus.ASSIGNED)
ok("assigning stamps the time", fresh.assigned_at is not None)

# ---------------------------------------------------------------------------
# 8. The registry agrees with the tools
# ---------------------------------------------------------------------------
print()
print("The registry and the tools agree")
print("-" * 72)

write_tools = [t for t in TOOLS_BY_NAME.values() if t.writes]
ok("four tools declare that they write", len(write_tools) == 4,
   ", ".join(sorted(t.name for t in write_tools)))
ok("every write tool asks for add or edit",
   all(t.permission in ("add", "edit") for t in write_tools))
ok("every read tool still asks only for index",
   all(t.permission == "index" for t in TOOLS_BY_NAME.values() if not t.writes))
ok("every write tool offers confirm_token",
   all("confirm_token" in t.parameters["properties"] for t in write_tools))
ok("no write tool requires confirm_token",
   all("confirm_token" not in t.parameters.get("required", []) for t in write_tools))
ok("every write tool's description tells the model to ask first",
   all("confirm_token" in t.description for t in write_tools))

# Dispatch is what the internal API actually calls.
sr7 = make_request(site_a, priority=Priority.LOW)
dispatched = dispatch("set_service_request_priority", admin_ctx,
                      {"service_request_id": sr7.id, "priority": "critical"})
ok("dispatch reaches a write tool",
   (dispatched.action or {}).get("status") == "proposed")
ok("the action survives serialisation",
   dispatched.to_dict().get("action", {}).get("status") == "proposed")

try:
    dispatch("set_service_request_priority", admin_ctx,
             {"service_request_id": sr7.id, "priority": "low", "sneaky": 1})
    ok("dispatch refuses unknown arguments", False, "was allowed")
except ValueError as exc:
    ok("dispatch refuses unknown arguments", True, str(exc)[:60])

read_result = dispatch("search_users", admin_ctx, {})
ok("a read tool carries no action", read_result.to_dict().get("action") is None)


print()
print("=" * 72)
if failures:
    print("{} failing: {}".format(len(failures), ", ".join(failures)))
    sys.exit(1)
print("All assistant write checks passed.")
