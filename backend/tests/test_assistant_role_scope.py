"""The assistant shows each person only the service work the screens show them.

Facility scoping alone let a technician ask the assistant for other
technicians' service requests, quotes and inspections, and see them ranked.
The Service Requests and Inspections screens never allowed that: a
technician sees the work assigned to them; an employee sees the requests they
raised (plus their assigned work if they also work as a technician) and no
inspections. Every reading tool now applies exactly those rules, and says so
when an answer covers only the asker's own work. Administrators and facility
staff see what they saw before.

    DATABASE_URL=sqlite:// venv312/Scripts/python.exe tests/test_assistant_role_scope.py
"""
from __future__ import annotations

import os
import pathlib
import sys
from datetime import datetime, timedelta
from decimal import Decimal

os.environ.setdefault("DATABASE_URL", "sqlite://")
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))

from sqlalchemy import create_engine  # noqa: E402
from sqlalchemy.orm import sessionmaker  # noqa: E402
from sqlalchemy.pool import StaticPool  # noqa: E402

import app.models  # noqa: E402,F401
from app.assistant.tools import analytics, commerce, entities  # noqa: E402
from app.assistant.tools.base import ToolContext  # noqa: E402
from app.assistant.tools.scope import OWN_INSPECTIONS_NOTE, OWN_SERVICE_WORK_NOTE  # noqa: E402
from app.db.base import Base  # noqa: E402
from app.models.equipment import Equipment  # noqa: E402
from app.models.facility import Facility  # noqa: E402
from app.models.inspection import Inspection, InspectionBatch, InspectionStatus  # noqa: E402
from app.models.inspection_form import InspectionForm  # noqa: E402
from app.models.modality import Modality, ModalityCategory  # noqa: E402
from app.models.service_request import (  # noqa: E402
    Priority, ServiceRequest, ServiceRequestQuotation, ServiceRequestStatus,
)
from app.models.user import User, UserRole, UserType  # noqa: E402

failures: list[str] = []


def ok(label: str, condition: bool, detail: object = "") -> None:
    print("{}  {}{}".format("PASS" if condition else "FAIL", label, f"  {detail}" if not condition and detail != "" else ""))
    if not condition:
        failures.append(label)


# ROLE_SCOPE_TEST_DB runs the same checks on a throwaway Postgres, as production uses.
if os.environ.get("ROLE_SCOPE_TEST_DB"):
    engine = create_engine(os.environ["ROLE_SCOPE_TEST_DB"])
else:
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)


def _buildable(table) -> bool:
    from sqlalchemy.schema import CreateTable
    try:
        CreateTable(table).compile(dialect=engine.dialect)
        return True
    except Exception:
        return False


Base.metadata.create_all(engine, tables=[t for t in Base.metadata.sorted_tables if _buildable(t)])
db = sessionmaker(bind=engine)()

north = Facility(name="North Hospital", phone="0", email="n@x.test", address="1 Rd", city="Dallas", state="TX",
                 zip_code="75201", country="US")
south = Facility(name="South Clinic", phone="0", email="s@x.test", address="2 Rd", city="Dallas", state="TX",
                 zip_code="75201", country="US")
db.add_all([north, south])
db.flush()
modality = Modality(name="Imaging", category=ModalityCategory.IMAGING)
db.add(modality)
db.flush()
form = InspectionForm(name="Annual", schema={})
db.add(form)
db.flush()
pump = Equipment(asset_tag="AT-1", make="Acme", model="P1", serial_number="S1", modality_id=modality.id, facility_id=north.id)
db.add(pump)
db.flush()


def person(name: str, role: UserRole, *, facility: Facility | None = None, technician: bool = False) -> User:
    user = User(username=name.lower().replace(" ", "_"), email=f"{name.lower().replace(' ', '.')}@x.test",
                full_name=name, hashed_password="x", user_type=UserType.EMPLOYEE, role=role, is_active=True,
                facility_id=facility.id if facility else None, is_technician=technician)
    db.add(user)
    db.flush()
    return user


admin = person("Ada Admin", UserRole.ADMIN)
alex = person("Alex Tech", UserRole.TECHNICIAN)
blake = person("Blake Tech", UserRole.TECHNICIAN)
erin = person("Erin Employee", UserRole.EMPLOYEE)
evan = person("Evan Both", UserRole.EMPLOYEE, technician=True)           # an employee who also works as a technician
fran = person("Fran Facility", UserRole.FACILITY_ADMIN, facility=south)
_n = [0]
NOW = datetime.utcnow()


def request(owner: User | None, raised_by: User, site: Facility = north,
            status=ServiceRequestStatus.ASSIGNED) -> str:
    _n[0] += 1
    number = f"SR-{_n[0]:06d}"
    db.add(ServiceRequest(request_number=number, facility_id=site.id, equipment_id=pump.id, requester_id=raised_by.id,
                          assigned_technician_id=owner.id if owner else None, problem_description="Alarm sounding",
                          priority=Priority.HIGH, status=status, preferred_datetime=NOW + timedelta(days=1),
                          completed_at=NOW - timedelta(days=1) if status == ServiceRequestStatus.COMPLETED else None,
                          history=[]))
    db.flush()
    return number


def quote(number: str) -> str:
    sr = db.query(ServiceRequest).filter(ServiceRequest.request_number == number).one()
    db.add(ServiceRequestQuotation(service_request_id=sr.id, created_by_id=admin.id, quotation_number=f"{number}-Q01",
                                   amount=Decimal("100"), description="Parts", status="draft"))
    db.flush()
    return f"{number}-Q01"


def visit(owner: User, site: Facility = north) -> tuple[str, str]:
    _n[0] += 1
    batch = InspectionBatch(batch_number=f"IB-{_n[0]:04d}", facility_id=site.id, inspector_id=owner.id,
                            form_template_id=form.id, scheduled_date=NOW + timedelta(days=2), status=InspectionStatus.UPCOMING)
    db.add(batch)
    db.flush()
    number = f"INS-{_n[0]:04d}"
    db.add(Inspection(inspection_number=number, facility_id=site.id, equipment_id=pump.id, inspector_id=owner.id,
                      form_template_id=form.id, status=InspectionStatus.UPCOMING, scheduled_date=NOW + timedelta(days=2),
                      batch_id=batch.id))
    db.flush()
    return batch.batch_number, number


ALEX_JOB = request(alex, admin)
ALEX_DONE = request(alex, admin, status=ServiceRequestStatus.COMPLETED)
BLAKE_JOB = request(blake, admin)
BLAKE_DONE = request(blake, admin, status=ServiceRequestStatus.COMPLETED)
ERIN_RAISED = request(blake, erin)                       # Erin raised it; Blake works it
EVAN_RAISED = request(None, evan)
EVAN_ASSIGNED = request(evan, admin)
SOUTH_JOB = request(blake, admin, site=south)
ALEX_QUOTE = quote(ALEX_JOB)
BLAKE_QUOTE = quote(BLAKE_JOB)
ALEX_BATCH, ALEX_VISIT = visit(alex)
BLAKE_BATCH, BLAKE_VISIT = visit(blake)
db.commit()

ALL = {ALEX_JOB, ALEX_DONE, BLAKE_JOB, BLAKE_DONE, ERIN_RAISED, EVAN_RAISED, EVAN_ASSIGNED, SOUTH_JOB}


def ctx(user: User) -> ToolContext:
    return ToolContext(db=db, user=user, timezone="America/Chicago")


def numbers(result, key="request_number") -> set[str]:
    return {item[key] for item in result.items}


print("\nsearch_service_requests: what each person can see")
seen = {who.full_name: numbers(entities.search_service_requests(ctx(who), limit=100))
        for who in (admin, alex, blake, erin, evan, fran)}
ok("an administrator: everything", seen["Ada Admin"] == ALL, seen["Ada Admin"])
ok("a technician: only the work assigned to them", seen["Alex Tech"] == {ALEX_JOB, ALEX_DONE}, seen["Alex Tech"])
ok("  the other technician the same", seen["Blake Tech"] == {BLAKE_JOB, BLAKE_DONE, ERIN_RAISED, SOUTH_JOB}, seen["Blake Tech"])
ok("an employee: only what they raised", seen["Erin Employee"] == {ERIN_RAISED}, seen["Erin Employee"])
ok("an employee who also works as a technician: raised plus assigned", seen["Evan Both"] == {EVAN_RAISED, EVAN_ASSIGNED}, seen["Evan Both"])
ok("a facility admin: everything at their own facility, as before", seen["Fran Facility"] == {SOUTH_JOB}, seen["Fran Facility"])
asked = entities.search_service_requests(ctx(alex), assigned_technician_id=blake.id)
ok("a technician asking for another technician's work gets none", asked.total_count == 0, numbers(asked))
ok("  and is told the answer covers only their own work", OWN_SERVICE_WORK_NOTE in asked.notes, asked.notes)
ok("an administrator is not told that", OWN_SERVICE_WORK_NOTE not in entities.search_service_requests(ctx(admin)).notes)
grouped = entities.search_service_requests(ctx(alex), status_group="new_open")
ok("the 'for comparison' count is scoped the same way",
   all("gives 1." in note or "gives 0." in note for note in grouped.notes if note.startswith("For comparison")), grouped.notes)

print("\nservice_request_detail and resolve_entity")
detail = entities.service_request_detail(ctx(alex), request_number=BLAKE_JOB)
ok("a technician cannot open another technician's request", detail.total_count == 0, detail.notes)
ok("  but can open their own", entities.service_request_detail(ctx(alex), request_number=ALEX_JOB).total_count == 1)
found = entities.resolve_entity(ctx(alex), kind="service_request", query=BLAKE_JOB)
ok("looking another technician's request up by number finds nothing", found.total_count == 0, found.items)
ok("  the administrator finds it", entities.resolve_entity(ctx(admin), kind="service_request", query=BLAKE_JOB).total_count == 1)
found = entities.resolve_entity(ctx(alex), kind="inspection", query=BLAKE_VISIT)
ok("the same for an inspection", found.total_count == 0
   and entities.resolve_entity(ctx(alex), kind="inspection", query=ALEX_VISIT).total_count == 1)

print("\nsearch_service_quotations")
quotes = commerce.search_service_quotations(ctx(alex))
ok("a technician sees only the quotes on their own requests", numbers(quotes, "quotation_number") == {ALEX_QUOTE},
   numbers(quotes, "quotation_number"))
ok("  told so", OWN_SERVICE_WORK_NOTE in quotes.notes)
ok("the administrator sees both", numbers(commerce.search_service_quotations(ctx(admin)), "quotation_number") == {ALEX_QUOTE, BLAKE_QUOTE})

print("\nsearch_inspections")
visits = entities.search_inspections(ctx(alex))
ok("a technician: only their own inspection visits", numbers(visits, "batch_number") == {ALEX_BATCH}, numbers(visits, "batch_number"))
assets = entities.search_inspections(ctx(alex), count_assets=True)
ok("  and asset inspections", numbers(assets, "inspection_number") == {ALEX_VISIT}, numbers(assets, "inspection_number"))
ok("  with both totals scoped alike", visits.aggregates["batch_count"] == 1 and visits.aggregates["asset_inspection_count"] == 1,
   visits.aggregates)
ok("  told so", OWN_INSPECTIONS_NOTE in visits.notes)
ok("asking for another technician's inspections gets none", entities.search_inspections(ctx(alex), inspector_id=blake.id).total_count == 0)
ok("the administrator sees both", numbers(entities.search_inspections(ctx(admin)), "batch_number") == {ALEX_BATCH, BLAKE_BATCH})

print("\nrank_technicians")
ranked = analytics.rank_technicians(ctx(alex), measure="assigned")
ok("a technician sees only themselves in the ranking", {item["full_name"] for item in ranked.items} == {"Alex Tech"},
   [item["full_name"] for item in ranked.items])
ok("  with their own counts", ranked.items[0]["service_requests"] == 2 and ranked.items[0]["inspection_visits"] == 1, ranked.items)
ok("  told so", OWN_SERVICE_WORK_NOTE in ranked.notes)
full = analytics.rank_technicians(ctx(admin), measure="assigned")
ok("the administrator sees everyone", {item["full_name"] for item in full.items} >= {"Alex Tech", "Blake Tech", "Evan Both"},
   [item["full_name"] for item in full.items])
site_rank = analytics.rank_technicians(ctx(fran), measure="assigned")
ok("a facility admin without the Inspections module: no inspection counts, and told why",
   all(item["inspection_visits"] == 0 for item in site_rank.items)
   and any("Inspections are not counted" in note for note in site_rank.notes), site_rank.notes)
ok("  and only their facility's work", {item["full_name"] for item in site_rank.items} == {"Blake Tech"}
   and site_rank.items[0]["service_requests"] == 1, site_rank.items)

print(f"\n{len(failures)} FAILED: {failures}" if failures else "\nALL PASSED")
sys.exit(1 if failures else 0)
