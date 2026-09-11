"""Prove the MEP migration and the MEP models describe the same schema.

Model/migration drift is the classic silent failure: everything imports,
every test that builds tables from `Base.metadata` passes, and the first
symptom is a production query against a column that only ever existed in
SQLAlchemy. `create_all` is never run against the real database, so nothing
else in this repository would catch it.

Read structurally from the migration source rather than by executing it, so
this runs without a database and without alembic installed.

    DATABASE_URL=sqlite:// python backend/tests/test_mep_migration_matches_models.py
"""
from __future__ import annotations

import ast
import os
import pathlib
import sys

os.environ.setdefault("DATABASE_URL", "sqlite://")
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))

import app.models  # noqa: E402,F401  (register every mapper)
from app.db.base import Base  # noqa: E402

VERSIONS = pathlib.Path(__file__).resolve().parents[1] / "alembic" / "versions"

# Both facilities migrations are checked together, because the drift they guard
# against does not care which one introduced a table.
MIGRATIONS = (
    VERSIONS / "o0f1a2b3c4d5_facilities_mep_foundation.py",
    VERSIONS / "p1a2b3c4d5e6_permits_compliance_pm.py",
    VERSIONS / "q2b3c4d5e6f7_asset_ledger_depreciation.py",
)

# Tables these migrations introduce.
NEW_TABLES = {
    # Foundation
    "disciplines", "user_disciplines", "locations", "floor_plans",
    "vendors", "vendor_contacts", "vendor_credentials", "vendor_contracts",
    "vendor_contract_assets", "asset_serves_asset", "asset_serves_location",
    "space_statuses", "space_status_history", "reading_points", "readings",
    # Permits, compliance, planned maintenance
    "work_permits", "permit_approvals", "compliance_programs",
    "compliance_tasks", "maintenance_schedules",
    # Asset ledger
    "asset_ledger_entries",
}

# Existing tables it adds columns to.
EXTENDED_TABLES = {"equipment", "service_requests", "locations"}


def _function_body(path: pathlib.Path, name: str) -> list[ast.stmt]:
    tree = ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
    for node in tree.body:
        if isinstance(node, ast.FunctionDef) and node.name == name:
            return node.body
    raise AssertionError(f"{path.name} declares no {name}()")


def _upgrade_body() -> list[ast.stmt]:
    """Both migrations' upgrades, concatenated in revision order."""
    body: list[ast.stmt] = []
    for path in MIGRATIONS:
        body.extend(_function_body(path, "upgrade"))
    return body


def _calls(body: list[ast.stmt], func_name: str) -> list[ast.Call]:
    found: list[ast.Call] = []
    for node in ast.walk(ast.Module(body=body, type_ignores=[])):
        if not isinstance(node, ast.Call):
            continue
        func = node.func
        if isinstance(func, ast.Attribute) and func.attr == func_name:
            found.append(node)
    return found


def _literal(node: ast.expr):
    try:
        return ast.literal_eval(node)
    except (ValueError, TypeError, SyntaxError):
        return None


def _created_tables() -> dict[str, set[str]]:
    """Table name -> column names, from every op.create_table in upgrade()."""
    tables: dict[str, set[str]] = {}
    for call in _calls(_upgrade_body(), "create_table"):
        if not call.args:
            continue
        name = _literal(call.args[0])
        if not isinstance(name, str):
            continue
        columns: set[str] = set()
        for arg in call.args[1:]:
            if (
                isinstance(arg, ast.Call)
                and isinstance(arg.func, ast.Attribute)
                and arg.func.attr == "Column"
                and arg.args
            ):
                column = _literal(arg.args[0])
                if isinstance(column, str):
                    columns.add(column)
        tables[name] = columns
    return tables


def _added_columns() -> dict[str, set[str]]:
    """Table name -> column names, from every op.add_column in upgrade()."""
    added: dict[str, set[str]] = {}
    for call in _calls(_upgrade_body(), "add_column"):
        if len(call.args) < 2:
            continue
        table = _literal(call.args[0])
        column_call = call.args[1]
        if not isinstance(table, str) or not isinstance(column_call, ast.Call):
            continue
        if not column_call.args:
            continue
        column = _literal(column_call.args[0])
        if isinstance(column, str):
            added.setdefault(table, set()).add(column)
    return added


def test_every_new_table_is_created():
    created = _created_tables()
    missing = NEW_TABLES - set(created)
    assert not missing, f"migration never creates: {sorted(missing)}"

    # And every table it creates is one the models actually declare.
    unknown = set(created) - set(Base.metadata.tables)
    assert not unknown, f"migration creates tables no model declares: {sorted(unknown)}"
    print(f"ok  all {len(NEW_TABLES)} new tables are created")


def test_columns_match_the_models_exactly():
    created = _created_tables()
    added = _added_columns()

    problems: list[str] = []

    for table in sorted(NEW_TABLES):
        model_columns = {c.name for c in Base.metadata.tables[table].columns}
        migration_columns = set(created.get(table, set())) | added.get(table, set())

        only_in_model = model_columns - migration_columns
        only_in_migration = migration_columns - model_columns
        if only_in_model:
            problems.append(f"{table}: model has {sorted(only_in_model)}, migration does not")
        if only_in_migration:
            problems.append(f"{table}: migration has {sorted(only_in_migration)}, model does not")

    assert not problems, "model/migration drift:\n  " + "\n  ".join(problems)
    print("ok  new-table columns match the models exactly")


def test_extended_tables_gain_every_new_model_column():
    """The added columns must cover what the models gained, and no more.

    Compared against a hardcoded list rather than the whole table, because
    `equipment` and `service_requests` predate this migration and most of their
    columns rightly appear in earlier ones.
    """
    added = _added_columns()

    expected = {
        "equipment": {
            "discipline_id", "location_id", "parent_equipment_id",
            "criticality", "electrical_branch", "service_vendor_id",
        },
        "service_requests": {
            "location_id", "work_order_type", "discipline_id",
            "assigned_vendor_id", "vendor_contract_id", "is_billable",
            "cost_center", "sla_response_hours", "sla_due_at", "responded_at",
            "sla_breached", "takes_space_out_of_service",
        },
    }
    expected["locations"] = {"plan_polygon"}
    expected["equipment"] |= {
        "depreciation_method", "salvage_value", "useful_life_years",
        "total_expected_units",
    }

    for table in sorted(EXTENDED_TABLES):
        model_columns = {c.name for c in Base.metadata.tables[table].columns}
        # Every column the migration adds must exist on the model.
        stray = added.get(table, set()) - model_columns
        assert not stray, f"{table}: migration adds {sorted(stray)}, which no model declares"
        # And every column we expect to be new must be added.
        missing = expected[table] - added.get(table, set())
        assert not missing, f"{table}: migration never adds {sorted(missing)}"
        # And each must be on the model too, or the two have drifted.
        absent = expected[table] - model_columns
        assert not absent, f"{table}: model is missing {sorted(absent)}"

    print("ok  extended tables gain every new model column")


def test_equipment_id_is_made_nullable():
    """The one existing column this migration alters, and the whole point of it.

    A nurse reporting a dead socket in an operating theatre knows the room and
    not the receptacle's asset tag. If this alter ever disappears,
    location-only work orders start failing at the database.
    """
    altered = _calls(_upgrade_body(), "alter_column")
    matched = [
        call for call in altered
        if len(call.args) >= 2
        and _literal(call.args[0]) == "service_requests"
        and _literal(call.args[1]) == "equipment_id"
    ]
    assert matched, "migration never relaxes service_requests.equipment_id"

    nullable = [
        _literal(kw.value) for call in matched for kw in call.keywords if kw.arg == "nullable"
    ]
    assert nullable == [True], f"expected nullable=True, got {nullable}"

    # And the model must agree.
    column = Base.metadata.tables["service_requests"].columns["equipment_id"]
    assert column.nullable is True, "model still has equipment_id NOT NULL"
    print("ok  service_requests.equipment_id is nullable in both")


def test_no_duplicate_index_names():
    """Two indexes with one name is a hard failure at upgrade time.

    Easy to introduce, because a column declaring `index=True` on the model
    generates a name that an explicit Index in __table_args__ can collide with.
    """
    seen: dict[str, int] = {}
    for call in _calls(_upgrade_body(), "create_index"):
        if not call.args:
            continue
        name = _literal(call.args[0])
        if isinstance(name, str):
            seen[name] = seen.get(name, 0) + 1
    duplicates = sorted(name for name, count in seen.items() if count > 1)
    assert not duplicates, f"migration creates these index names twice: {duplicates}"

    # The same check against the models, where the collision originates.
    model_indexes: dict[str, int] = {}
    for table_name in NEW_TABLES:
        for index in Base.metadata.tables[table_name].indexes:
            model_indexes[index.name] = model_indexes.get(index.name, 0) + 1
    model_duplicates = sorted(name for name, count in model_indexes.items() if count > 1)
    assert not model_duplicates, f"models declare these index names twice: {model_duplicates}"
    print(f"ok  no duplicate index names ({len(seen)} indexes)")


def test_downgrade_drops_every_table_it_created():
    body: list[ast.stmt] = []
    for path in MIGRATIONS:
        body.extend(_function_body(path, "downgrade"))

    dropped = {
        _literal(call.args[0])
        for call in _calls(body, "drop_table")
        if call.args
    }
    missing = NEW_TABLES - dropped
    assert not missing, f"downgrade leaves these behind: {sorted(missing)}"
    print("ok  downgrade drops every table it created")


if __name__ == "__main__":
    tests = [value for name, value in sorted(globals().items()) if name.startswith("test_")]
    for test in tests:
        test()
    print(f"\n{len(tests)} checks passed")
