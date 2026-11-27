"""The Leads module: records, rules, search, permissions, and its migration.

    cd backend
    DATABASE_URL=sqlite:// venv312/Scripts/python.exe tests/test_leads.py
    # on Postgres, as production runs (adds the HTTP and migration checks):
    TEST_DATABASE_URL=postgresql://user:pass@host/db venv312/Scripts/python.exe tests/test_leads.py
"""
from __future__ import annotations

import json
import logging
import os
import pathlib
import sys
from datetime import datetime, timedelta

os.environ.setdefault("DATABASE_URL", "sqlite://")
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))
logging.disable(logging.CRITICAL)

from fastapi import HTTPException  # noqa: E402
from pydantic import ValidationError  # noqa: E402
from sqlalchemy import create_engine, inspect, text  # noqa: E402
from sqlalchemy.orm import sessionmaker  # noqa: E402
from sqlalchemy.pool import StaticPool  # noqa: E402

import app.models  # noqa: E402,F401
from app.api.v1.endpoints.leads import create_lead, delete_lead, get_lead, list_leads, update_lead  # noqa: E402
from app.db.base import Base  # noqa: E402
from app.models.audit_log import AuditLog  # noqa: E402
from app.models.lead import LEAD_SOURCES, LEAD_STATUSES, Lead  # noqa: E402
from app.models.user import User, UserRole, UserType  # noqa: E402
from app.schemas.lead import LeadCreate, LeadUpdate  # noqa: E402
from app.utils.permissions import has_module_permission  # noqa: E402

failures: list[str] = []


def ok(label: str, condition: bool, detail: object = "") -> None:
    print("{}  {}{}".format("PASS" if condition else "FAIL", label, f"  {detail}" if not condition else ""))
    if not condition:
        failures.append(label)


def refused(call, code: int) -> bool:
    try:
        call()
    except HTTPException as error:
        db.rollback()
        return error.status_code == code
    return False


def invalid(model, **data) -> str:
    try:
        model(**data)
    except ValidationError as error:
        return " ".join(item["msg"] for item in error.errors())
    return ""


url = os.environ.get("TEST_DATABASE_URL")
if url:
    engine = create_engine(url)
    with engine.begin() as connection:
        connection.execute(text("DROP SCHEMA public CASCADE; CREATE SCHEMA public"))
    print("Running on", engine.dialect.name)
else:
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
Base.metadata.create_all(engine)
Session = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)
db = Session()


def person(username: str, role: UserRole, permissions=None) -> User:
    user = User(username=username, email=f"{username}@x.test", full_name=username.title(), hashed_password="x",
                user_type=UserType.EMPLOYEE, role=role, is_active=True, permissions=permissions)
    db.add(user)
    db.commit()
    return user


boss = person("boss", UserRole.SUPERADMIN)
admin = person("admin", UserRole.ADMIN)
tech = person("tech", UserRole.TECHNICIAN)
seller = person("seller", UserRole.TECHNICIAN, {"leads": {"index": True, "view": True, "add": True, "edit": True, "delete": False, "scope": "all"}})
IDS = {"boss": boss.id, "admin": admin.id, "tech": tech.id, "seller": seller.id}

print("Who may work with leads")
for user, expected in [(boss, {"index", "view", "add", "edit", "delete"}), (admin, {"index", "view", "add", "edit", "delete"}),
                       (tech, set()), (seller, {"index", "view", "add", "edit"})]:
    allowed = {action for action in ("index", "view", "add", "edit", "delete") if has_module_permission(user, "leads", action)}
    ok(f"{user.role.value if hasattr(user.role, 'value') else user.role} ({user.username}): {sorted(expected) or 'nothing'}", allowed == expected, sorted(allowed))
for role in (UserRole.EMPLOYEE, UserRole.CLIENT, UserRole.FACILITY_ADMIN, UserRole.HR_MANAGER):
    other = User(username=f"r-{role.value}", role=role)
    ok(f"{role.value}: no leads by default", not has_module_permission(other, "leads", "index"))

print("\nThe rules a lead must meet")
ok("a name is required", "Lead name is required" in invalid(LeadCreate, name="   ", source="website"))
ok("a missing name says so too", "Lead name is required" in invalid(LeadCreate, source="website"))
ok("a source is required", "Choose a lead source" in invalid(LeadCreate, name="Ann"))
ok("an unknown source is refused", "Choose a lead source" in invalid(LeadCreate, name="Ann", source="billboard"))
ok("an unknown status is refused", "Choose a status" in invalid(LeadCreate, name="Ann", source="website", status="maybe"))
ok("a malformed email is refused", "valid email" in invalid(LeadCreate, name="Ann", source="website", email="ann@"))
ok("a company's own .local address is kept", not invalid(LeadCreate, name="Ann", source="website", email="ann@corp.local"))
ok("a name over 200 characters is refused", "200 characters" in invalid(LeadCreate, name="x" * 201, source="website"))
ok("notes over 5,000 characters are refused", "5,000" in invalid(LeadCreate, name="Ann", source="website", notes="x" * 5001))
clean = LeadCreate(name="  Ann   Lee ", company=" ", email=" ann@acme.com ", phone="", source=" Referral ", status="NEW", notes="  line one\nline two  ")
ok("spaces are tidied, blanks become empty, choices are case-blind",
   (clean.name, clean.company, clean.email, clean.phone, clean.source, clean.status, clean.notes)
   == ("Ann Lee", None, "ann@acme.com", None, "referral", "new", "line one\nline two"),
   clean.model_dump())
ok("an edit cannot empty the name", "Lead name is required" in invalid(LeadUpdate, name=None))
ok("an edit cannot empty the source or status", "Choose a lead source" in invalid(LeadUpdate, source=None) and "Choose a status" in invalid(LeadUpdate, status=None))
ok("an edit may clear the company", LeadUpdate(company="").model_dump(exclude_unset=True) == {"company": None})

print("\nAdding, editing and deleting")
created = create_lead(LeadCreate(name="Dana Jones", company="Acme Clinic", email="dana@acme.com", phone="(214) 555-0101",
                                 source="website", notes="Asked about PM contracts"), db=db, current_user=admin)
ok("a new lead is New, and records who added it", created["status"] == "new" and created["created_by_name"] == "Admin", created)
audit = db.query(AuditLog).filter(AuditLog.table_name == "leads", AuditLog.record_id == created["id"]).all()
ok("adding is in the audit log", [a.action for a in audit] == ["CREATE"])
before_update = created["updated_at"]
edited = update_lead(created["id"], LeadUpdate(status="contacted", company=""), db=db, current_user=admin)
ok("an edit changes only what was sent", edited["status"] == "contacted" and edited["company"] is None and edited["email"] == "dana@acme.com" and edited["name"] == "Dana Jones", edited)
ok("an edit moves updated_at", edited["updated_at"] >= before_update)
logged = db.query(AuditLog).filter(AuditLog.table_name == "leads", AuditLog.action == "UPDATE").all()
ok("the edit is logged with before and after", len(logged) == 1 and json.loads(logged[0].changes_json)["after"] == {"status": "contacted", "company": None}, [a.changes_json for a in logged])
update_lead(created["id"], LeadUpdate(status="contacted"), db=db, current_user=admin)
ok("an edit that changes nothing writes no log", db.query(AuditLog).filter(AuditLog.action == "UPDATE").count() == 1)
ok("an unknown lead is 404", refused(lambda: get_lead(999999, db=db, current_user=admin), 404))
ok("editing an unknown lead is 404", refused(lambda: update_lead(999999, LeadUpdate(status="won"), db=db, current_user=admin), 404))

# A realistic set for the list
start = datetime(2026, 11, 1, 9)
rows = [
    ("Acme Hospital", "Acme Health", "ops@acme.com", "website", "new"),
    ("Brian Acme-Smith", None, "brian@b.com", "referral", "qualified"),
    ("Cedar Imaging", "Cedar Group", None, "trade_show", "won"),
    ("Delta 100% Care", None, None, "phone_call", "lost"),
    ("Eve Lee", "Jones & Sons", "eve@jones.com", "referral", "proposal_sent"),
]
for index, (name, company, email, source, state) in enumerate(rows):
    db.add(Lead(name=name, company=company, email=email, source=source, status=state, created_by_id=boss.id,
                created_at=start + timedelta(days=index), updated_at=start + timedelta(days=index)))
for index in range(30):
    db.add(Lead(name=f"Bulk lead {index:02d}", source="email", status="new", created_by_id=boss.id,
                created_at=start - timedelta(days=index + 1), updated_at=start - timedelta(days=index + 1)))
db.commit()


def listing(**params):
    base = dict(search=None, search_field=None, status_filter=None, source=None, sort="newest", skip=0, limit=100, db=db, current_user=admin)
    base.update(params)
    return list_leads(**base)


def names(**params) -> list[str]:
    return [item["name"] for item in listing(**params)["items"]]


print("\nThe list: search, filters, counts, order, pages")
everything = listing()
ok("every lead, newest first", everything["total"] == 36 and everything["items"][0]["name"] == "Dana Jones", everything["items"][0]["name"])
ok("counts per status", everything["status_counts"] == {"new": 31, "contacted": 1, "qualified": 1, "proposal_sent": 1, "won": 1, "lost": 1}, everything["status_counts"])
ok("search: part of a name, any case", set(names(search="acme")) == {"Acme Hospital", "Brian Acme-Smith", "Dana Jones"}, names(search="acme"))
ok("search: several words narrow together", names(search="acme dana") == ["Dana Jones"], names(search="acme dana"))
ok("search: words may come from different fields", names(search="jones eve") == ["Eve Lee"], names(search="jones eve"))
ok("search: one field only", set(names(search="acme", search_field="name")) == {"Acme Hospital", "Brian Acme-Smith"}, names(search="acme", search_field="name"))
ok("search: email", names(search="eve@jones", search_field="email") == ["Eve Lee"])
ok("search: phone", names(search="555-0101", search_field="phone") == ["Dana Jones"])
ok("search: notes", names(search="pm contracts") == ["Dana Jones"])
ok("search: % is a plain character", names(search="100%") == ["Delta 100% Care"], names(search="100%"))
ok("search: nothing matches", listing(search="zzzz")["total"] == 0)
ok("status filter", names(status_filter="qualified") == ["Brian Acme-Smith"])
ok("source filter", set(names(source="referral")) == {"Brian Acme-Smith", "Eve Lee"})
counts = listing(source="referral", status_filter="qualified")
ok("counts follow search and source, not the status filter", counts["total"] == 1 and counts["status_counts"]["proposal_sent"] == 1 and counts["status_counts"]["qualified"] == 1, counts["status_counts"])
ok("sort by name", names(sort="name")[:2] == ["Acme Hospital", "Brian Acme-Smith"], names(sort="name")[:2])
ok("sort oldest first", names(sort="oldest")[0] == "Bulk lead 29")
page = listing(skip=25, limit=25)
ok("paging: the total counts every lead, the page holds the rest", page["total"] == 36 and len(page["items"]) == 11, (page["total"], len(page["items"])))
ok("an unknown status filter is refused", refused(lambda: listing(status_filter="maybe"), 400))
ok("an unknown source filter is refused", refused(lambda: listing(source="billboard"), 400))
ok("an unknown sort falls back to newest", names(sort="sideways")[0] == "Dana Jones")
ok("the stored choices are the ones the screen offers",
   LEAD_SOURCES == ("website", "referral", "phone_call", "email", "social_media", "trade_show", "walk_in", "advertisement", "other")
   and LEAD_STATUSES == ("new", "contacted", "qualified", "proposal_sent", "won", "lost"))

delete_lead(created["id"], db=db, current_user=admin)
ok("delete removes the lead", refused(lambda: get_lead(created["id"], db=db, current_user=admin), 404))
ok("deleting is in the audit log", db.query(AuditLog).filter(AuditLog.table_name == "leads", AuditLog.action == "DELETE").count() == 1)
db.close()

if url:
    print("\nOver HTTP, with the permission check (Postgres)")
    from fastapi import Depends
    from fastapi.testclient import TestClient

    from app.core.deps import get_current_user
    from app.db.base import get_db
    from app.main import app

    acting = {"id": IDS["admin"]}

    def _db():
        session = Session()
        try:
            yield session
        finally:
            session.close()

    def _user(session=Depends(get_db)):
        return session.get(User, acting["id"])

    app.dependency_overrides[get_db] = _db
    app.dependency_overrides[get_current_user] = _user
    client = TestClient(app)
    response = client.post("/api/v1/leads/", json={"name": "Web Lead", "source": "website"})
    ok("admin can add over HTTP", response.status_code == 201 and response.json()["status"] == "new", response.text)
    new_id = response.json().get("id")
    response = client.post("/api/v1/leads/", json={"name": "", "source": "website"})
    ok("a blank name answers 422 with the reason", response.status_code == 422 and "Lead name is required" in response.text, response.text)
    ok("admin can list", client.get("/api/v1/leads/?status=new&limit=5").status_code == 200)
    acting["id"] = IDS["tech"]
    ok("a technician is refused (403)", client.get("/api/v1/leads/").status_code == 403)
    acting["id"] = IDS["seller"]
    ok("a user granted leads can list and edit", client.get("/api/v1/leads/").status_code == 200
       and client.put(f"/api/v1/leads/{new_id}", json={"status": "contacted"}).status_code == 200)
    ok("but not delete without delete permission", client.delete(f"/api/v1/leads/{new_id}").status_code == 403)
    acting["id"] = IDS["boss"]
    ok("superadmin can delete", client.delete(f"/api/v1/leads/{new_id}").status_code == 204)
    app.dependency_overrides.clear()

    print("\nThe migration (Postgres)")
    from alembic.migration import MigrationContext
    from alembic.operations import Operations
    import importlib.util

    spec = importlib.util.spec_from_file_location("leads_migration", str(pathlib.Path(__file__).resolve().parents[1] / "alembic" / "versions" / "c4d9e2f7a1b3_leads.py"))
    migration = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(migration)

    def run(step):
        with engine.begin() as connection:
            context = MigrationContext.configure(connection)
            with Operations.context(context):
                step()

    with engine.begin() as connection:
        connection.execute(text("DROP TABLE leads"))
    run(migration.upgrade)
    columns = {column["name"]: column for column in inspect(engine).get_columns("leads")}
    ok("upgrade creates the leads table with every column",
       set(columns) == {"id", "name", "company", "email", "phone", "source", "status", "notes", "created_by_id", "created_at", "updated_at"}, sorted(columns))
    ok("the table matches the model", {c.name for c in Lead.__table__.columns} == set(columns))
    indexes = {index["name"] for index in inspect(engine).get_indexes("leads")}
    ok("its indexes", {"ix_leads_status", "ix_leads_source", "ix_leads_created_at", "ix_leads_status_created", "ix_leads_created_by_id"} <= indexes, sorted(indexes))
    with engine.begin() as connection:
        connection.execute(text("INSERT INTO leads (name, source, created_at, updated_at) VALUES ('Raw', 'website', now(), now())"))
        ok("status defaults to new in the database", connection.execute(text("SELECT status FROM leads WHERE name = 'Raw'")).scalar() == "new")
    run(migration.upgrade)
    ok("running upgrade twice is harmless", "leads" in inspect(engine).get_table_names())
    run(migration.downgrade)
    ok("downgrade removes the table", "leads" not in inspect(engine).get_table_names())
    run(migration.upgrade)
    ok("and upgrade brings it back", "leads" in inspect(engine).get_table_names())

print("\n" + ("All lead checks passed" if not failures else f"{len(failures)} failed: {failures}"))
sys.exit(1 if failures else 0)
