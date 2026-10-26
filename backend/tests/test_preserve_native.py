"""Prove the re-import cannot quietly take anyone's access away.

Medrad is being rebuilt from the legacy database, which has been the system
of record since August. Nearly everything comes back identically. Three
things do not, and of those the permission matrices are the dangerous one: a
saved matrix overrides the role table completely, so losing one produces no
error at all. The person simply has different access than they had yesterday,
and nothing says why.

So this does the whole round trip against two real databases -- one standing
in for production, one for the rebuilt system with entirely different ids --
and checks that what comes out the far side is what went in. Matching is by
username and name throughout, because every id changes.

    DATABASE_URL=sqlite:// python backend/tests/test_preserve_native.py
"""
from __future__ import annotations

import json
import os
import pathlib
import sys
import tempfile

os.environ.setdefault("DATABASE_URL", "sqlite://")
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))

from sqlalchemy import create_engine, text  # noqa: E402
from sqlalchemy.orm import sessionmaker  # noqa: E402
from sqlalchemy.pool import StaticPool  # noqa: E402

import app.models  # noqa: E402,F401
from app.db.base import Base  # noqa: E402
from app.models.facility import Facility  # noqa: E402
from app.models.inspection_form import InspectionForm  # noqa: E402
from app.models.modality import Modality, ModalityCategory  # noqa: E402
from app.models.user import User, UserRole, UserType  # noqa: E402
from scripts import preserve_native  # noqa: E402


failures: list[str] = []


def ok(label: str, condition: bool, detail: str = "") -> None:
    print("{}  {}{}".format("PASS" if condition else "FAIL", label,
                            "  " + detail if detail else ""))
    if not condition:
        failures.append(label)


def fresh_db():
    """A database with the id_map schema SQLite would otherwise refuse."""
    eng = create_engine("sqlite://", connect_args={"check_same_thread": False},
                        poolclass=StaticPool)
    Base.metadata.create_all(eng)
    with eng.begin() as conn:
        conn.execute(text("ATTACH DATABASE ':memory:' AS legacy_migration"))
        conn.execute(text(
            "CREATE TABLE legacy_migration.id_map ("
            " source_system TEXT, entity TEXT, legacy_id BIGINT, target_id BIGINT)"))
    return eng, sessionmaker(bind=eng)


def point_at(eng, factory):
    """Aim the script at one of our databases."""
    preserve_native.engine = eng
    preserve_native.SessionLocal = factory


def make_user(db, username, role, permissions, facility_id=None):
    user = User(username=username, email=username + "@x.test",
                full_name=username.replace("_", " ").title(),
                hashed_password="hash-of-" + username,
                user_type=UserType.EMPLOYEE, role=role, is_active=True,
                permissions=permissions, facility_id=facility_id)
    db.add(user)
    db.flush()
    return user


def mark_imported(db, entity, target_id):
    db.execute(text(
        "INSERT INTO legacy_migration.id_map (source_system, entity, legacy_id,"
        " target_id) VALUES ('legacy', :e, :l, :t)"),
        {"e": entity, "l": target_id * 1000, "t": target_id})


# Two shapes, so "tuned" means something.
STANDARD_EMPLOYEE = {"service-requests": {"index": True, "view": True}}
TUNED_EMPLOYEE = {"service-requests": {"index": True, "view": True},
                  "billing": {"index": True, "view": True}}
STANDARD_MANAGER = {"facilities": {"index": True, "view": True}}
TUNED_MANAGER = {"facilities": {"index": True, "view": True},
                 "chat": {"index": True, "view": True, "add": False}}


print("Preserving what a re-import would destroy")
print("=" * 72)

# ---------------------------------------------------------------------------
# Production as it stands
# ---------------------------------------------------------------------------
prod_engine, ProdSession = fresh_db()
prod = ProdSession()

imaging = Modality(name="Imaging", category=ModalityCategory.IMAGING)
prod.add(imaging)
site = Facility(name="North Hospital", phone="0", email="n@x.test",
                address="1 Road", city="Houston", state="TX",
                zip_code="77001", country="US")
prod.add(site)
prod.flush()
mark_imported(prod, "modality", imaging.id)

# Thirty employees on the generated matrix, one tuned.
for i in range(30):
    mark_imported(prod, "user", make_user(prod, "emp_{}".format(i),
                                          UserRole.EMPLOYEE, STANDARD_EMPLOYEE).id)
mark_imported(prod, "user", make_user(prod, "a_rehman", UserRole.EMPLOYEE,
                                      TUNED_EMPLOYEE).id)
# Nine managers standard, one tuned.
for i in range(9):
    mark_imported(prod, "user", make_user(prod, "mgr_{}".format(i),
                                          UserRole.FACILITY_MANAGER,
                                          STANDARD_MANAGER).id)
mark_imported(prod, "user", make_user(prod, "Rooshan Mirza",
                                      UserRole.FACILITY_MANAGER,
                                      TUNED_MANAGER, facility_id=site.id).id)
# Created in Medrad, so no id_map row.
make_user(prod, "built_here", UserRole.TECHNICIAN, STANDARD_EMPLOYEE,
          facility_id=site.id)
# Created by the import from a facility contact. It lives in the users
# table but is recorded under its own entity, and reporting it as native
# would have had the restore recreate 613 accounts that already exist.
mark_imported(prod, "facility_contact",
              make_user(prod, "contact_person", UserRole.CLIENT, None,
                        facility_id=site.id).id)

imported_form = InspectionForm(name="Legacy Annual", schema={"legacy": True},
                               modality_id=imaging.id)
prod.add(imported_form)
prod.flush()
mark_imported(prod, "inspection_form", imported_form.id)
prod.add(InspectionForm(name="Pump Safety Check", description="Built on site",
                        schema={"sections": [{"title": "Electrical"}]},
                        modality_id=imaging.id))
prod.add(InspectionForm(name="Ward Round", schema={"sections": []}))
prod.commit()

point_at(prod_engine, ProdSession)
out = pathlib.Path(tempfile.mkdtemp()) / "native.json"
preserve_native.export(out)
saved = json.loads(out.read_text(encoding="utf-8"))

print()
print("Export picks out exactly what is native")
print("-" * 72)

form_names = sorted(f["name"] for f in saved["inspection_forms"])
ok("only forms built in Medrad are saved",
   form_names == ["Pump Safety Check", "Ward Round"], str(form_names))
ok("the imported form is left behind",
   "Legacy Annual" not in form_names)
ok("a form's modality travels by name, not id",
   saved["inspection_forms"][0]["modality"] == "Imaging"
   or saved["inspection_forms"][1]["modality"] == "Imaging")

held = {r["username"]: r["permissions"] for r in saved["saved_permissions"]}
ok("every user who has a matrix is saved, individually",
   len(held) == 42, "{} saved".format(len(held)))
ok("including the ones who share a shape with others",
   held.get("emp_7") == STANDARD_EMPLOYEE and held.get("mgr_3") == STANDARD_MANAGER)
ok("and the two who differ from everyone else",
   held.get("a_rehman") == TUNED_EMPLOYEE
   and held.get("Rooshan Mirza") == TUNED_MANAGER)
ok("a user with no matrix is not in the file",
   "contact_person" not in held)
ok("a native user keeps their own matrix in their record",
   saved["native_users"][0]["permissions"] == STANDARD_EMPLOYEE)

natives = [u["username"] for u in saved["native_users"]]
ok("users created in Medrad are saved", natives == ["built_here"], str(natives))
ok("a user the import made from a facility contact is not called native",
   "contact_person" not in natives, str(natives))
ok("their password hash travels so they can still sign in",
   saved["native_users"][0]["hashed_password"] == "hash-of-built_here")
ok("their site travels by name",
   saved["native_users"][0]["facility"] == "North Hospital")

# ---------------------------------------------------------------------------
# The rebuilt database: same people, different ids, no native anything
# ---------------------------------------------------------------------------
new_engine, NewSession = fresh_db()
new = NewSession()

# Ids deliberately start elsewhere, so anything keyed on an id will break.
for i in range(40):
    new.add(Modality(name="filler-{}".format(i), category=ModalityCategory.IMAGING))
new.flush()
new.add(Modality(name="Imaging", category=ModalityCategory.IMAGING))
new.add(Facility(name="North Hospital", phone="0", email="n@x.test",
                 address="1 Road", city="Houston", state="TX",
                 zip_code="77001", country="US"))
new.flush()
# permissions=None throughout: this is exactly what the migration writes,
# so after a re-import nobody has a saved matrix at all.
for i in range(30):
    make_user(new, "emp_{}".format(i), UserRole.EMPLOYEE, None)
make_user(new, "a_rehman", UserRole.EMPLOYEE, None)
for i in range(9):
    make_user(new, "mgr_{}".format(i), UserRole.FACILITY_MANAGER, None)
make_user(new, "Rooshan Mirza", UserRole.FACILITY_MANAGER, None)
# Nobody saved a matrix for this one, and the restore must not invent
# one. An earlier design derived a "role default" from whoever happened
# to hold a matrix and applied it to the whole role -- which, with only
# three holders in production, would have handed one person's access to
# about forty others.
make_user(new, "no_matrix_emp", UserRole.EMPLOYEE, None)
new.add(InspectionForm(name="Legacy Annual", schema={"legacy": True}))
new.commit()

point_at(new_engine, NewSession)
code = preserve_native.restore(out, preserve_native.engine.url.database)

print()
print("Restore puts it back")
print("-" * 72)

check = NewSession()
ok("it reported success", code == 0, "exit {}".format(code))
ok("both built forms are recreated",
   check.query(InspectionForm).filter(
       InspectionForm.name.in_(["Pump Safety Check", "Ward Round"])).count() == 2)
ok("the imported form was not duplicated",
   check.query(InspectionForm).filter(
       InspectionForm.name == "Legacy Annual").count() == 1)

rebuilt_imaging = check.query(Modality).filter(Modality.name == "Imaging").one()
pump = check.query(InspectionForm).filter(
    InspectionForm.name == "Pump Safety Check").one()
ok("the form points at the rebuilt modality's new id",
   pump.modality_id == rebuilt_imaging.id,
   "{} vs {}".format(pump.modality_id, rebuilt_imaging.id))
ok("its schema survived intact",
   pump.schema == {"sections": [{"title": "Electrical"}]})

rooshan = check.query(User).filter(User.username == "Rooshan Mirza").one()
rehman = check.query(User).filter(User.username == "a_rehman").one()
ok("Rooshan's tuned matrix is back", rooshan.permissions == TUNED_MANAGER,
   str(rooshan.permissions))
ok("a_rehman's tuned matrix is back", rehman.permissions == TUNED_EMPLOYEE)

ok("everyone who had a matrix gets theirs back",
   check.query(User).filter(User.username == "mgr_0").one().permissions
   == STANDARD_MANAGER
   and check.query(User).filter(User.username == "emp_17").one().permissions
   == STANDARD_EMPLOYEE)
# The inverse, and the one that matters: nobody acquires access that was
# never saved for them. Counted in Python because a JSON column holds
# Python None as the JSON literal null, so "IS NULL" matches nothing and
# an assertion built on it passes whatever the data says.
invented = check.query(User).filter(User.username == "no_matrix_emp").one()
ok("a user nobody saved a matrix for still has none",
   not invented.permissions, str(invented.permissions))
held_after = {u.username for u in check.query(User).all() if u.permissions}
ok("exactly the saved people hold a matrix afterwards",
   held_after == set(held), str(sorted(held_after - set(held))))

native = check.query(User).filter(User.username == "built_here").one_or_none()
ok("the user built in Medrad is recreated", native is not None)
if native:
    ok("they can still sign in", native.hashed_password == "hash-of-built_here")
    ok("they are back at their own site",
       native.facility_id == check.query(Facility).filter(
           Facility.name == "North Hospital").one().id)
check.close()

print()
print("Running it twice changes nothing")
print("-" * 72)

before = NewSession()
form_count = before.query(InspectionForm).count()
user_count = before.query(User).count()
before.close()

code2 = preserve_native.restore(out, preserve_native.engine.url.database)
after = NewSession()
ok("a second restore still succeeds", code2 == 0)
ok("no duplicate forms", after.query(InspectionForm).count() == form_count,
   "{} -> {}".format(form_count, after.query(InspectionForm).count()))
ok("no duplicate users", after.query(User).count() == user_count)
ok("a second run does not overwrite a tuned matrix with the role default",
   after.query(User).filter(User.username == "Rooshan Mirza").one()
   .permissions == TUNED_MANAGER)
after.close()

print()
print("It refuses to write to the wrong database")
print("-" * 72)

try:
    preserve_native.restore(out, "some-other-database")
    ok("a mismatched --confirm-target is refused", False, "was allowed")
except SystemExit as exc:
    ok("a mismatched --confirm-target is refused", True, str(exc)[:60])

print()
print("A matrix with nobody to apply it to is reported, not dropped")
print("-" * 72)

orphan = json.loads(out.read_text(encoding="utf-8"))
orphan["saved_permissions"].append(
    {"username": "left_the_company", "role": "EMPLOYEE",
     "permissions": TUNED_EMPLOYEE})
orphan_file = out.parent / "orphan.json"
orphan_file.write_text(json.dumps(orphan), encoding="utf-8")

code3 = preserve_native.restore(orphan_file, preserve_native.engine.url.database)
ok("it exits non-zero rather than claiming success", code3 == 1,
   "exit {}".format(code3))


print()
print("=" * 72)
if failures:
    print("{} failing: {}".format(len(failures), ", ".join(failures)))
    sys.exit(1)
print("All preservation checks passed.")
