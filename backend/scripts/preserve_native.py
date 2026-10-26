"""Save what a clean re-import would destroy, and put it back afterwards.

The legacy database has been the system of record since August, so Medrad is
being rebuilt from it rather than topped up. Almost everything in Medrad came
from that import and will come back identically. A short list did not, and
exists nowhere else:

* inspection forms built in the canvas builder
* permission matrices somebody tuned by hand
* user accounts created directly in Medrad

A saved permission matrix is the one that would hurt quietly. It overrides the
role table completely, so losing it does not produce an error -- the person
simply has different access on Monday than they had on Friday, and nothing
anywhere says why.

Which matrices were tuned is worked out rather than listed. Every user has
one, because the migration generated them in bulk per role, so the tuned ones
are exactly those that differ from the commonest matrix for their own role.
Hardcoding the three usernames that happen to differ today would be a list
that silently goes stale the first time somebody edits a fourth.

Nothing here is keyed on an id. A re-import issues new ids for everything, so
users are matched by username, modalities and facilities by name.

    # before the re-import, against production
    python scripts/preserve_native.py export --output /tmp/native.json

    # after the re-import, against the rebuilt database
    python scripts/preserve_native.py restore --input /tmp/native.json \\
        --apply --confirm-target medrad_db
"""
from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional

from sqlalchemy import bindparam, text
from sqlalchemy.orm import Session

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.db.base import SessionLocal, engine  # noqa: E402
from app.models.facility import Facility  # noqa: E402
from app.models.inspection_form import InspectionForm  # noqa: E402
from app.models.modality import Modality  # noqa: E402
from app.models.user import User  # noqa: E402


FORMAT_VERSION = 2


# ---------------------------------------------------------------------------
# Working out what is native
# ---------------------------------------------------------------------------

# Both of these write into the users table. The import creates an account
# for every facility contact as well as for every legacy user, and records
# it under its own entity name -- so asking only about "user" reports 613
# imported contacts as though somebody had typed them into Medrad by hand.
USER_ENTITIES = ("user", "facility_contact")


def _mapped_ids(db: Session, *entities: str) -> set[int]:
    """Target ids the legacy import created, across one or more entities.

    Anything not in here was made in Medrad. If the map is missing entirely
    the caller is told, rather than quietly concluding that every row is
    native and exporting the whole database.
    """
    try:
        rows = db.execute(
            text("SELECT target_id FROM legacy_migration.id_map "
                 "WHERE entity IN :entities").bindparams(
                     bindparam("entities", expanding=True)),
            {"entities": list(entities)},
        ).all()
    except Exception as exc:  # noqa: BLE001
        raise SystemExit(
            "Could not read legacy_migration.id_map ({}). Without it there is "
            "no way to tell imported rows from native ones, and this would "
            "export everything. Check you are pointed at the live database."
            .format(type(exc).__name__)
        )
    return {int(r[0]) for r in rows}


def _saved_matrices(db: Session) -> list[dict[str, Any]]:
    """Every user who has one, saved individually.

    An earlier version grouped these by role and treated the commonest
    matrix in each as that role's default, to be replayed to everybody.
    That was built on a miscount: a query had reported that all 6,767
    users carried a matrix, when in fact three do. SQLAlchemy writes a
    Python None into a JSON column as the JSON literal null, so testing
    "IS NOT NULL" counted everybody who has no matrix at all.

    With the real number known there is no role default to find -- every
    holder is an individual exception, and replaying one of them onto a
    whole role would have changed access for about forty people. So each
    is carried on its own and applied by username. This also behaves
    correctly if a future database does have matrices everywhere: the
    file is simply longer.
    """
    holders = [
        user for user in db.query(User).all()
        if user.permissions not in (None, {}, "")
    ]

    return sorted(
        ({"username": u.username,
          "role": str(getattr(u.role, "value", u.role)),
          "permissions": u.permissions}
         for u in holders),
        key=lambda r: (r["role"], r["username"]),
    )


# ---------------------------------------------------------------------------
# Export
# ---------------------------------------------------------------------------

def export(output: Path) -> int:
    db = SessionLocal()
    try:
        imported_forms = _mapped_ids(db, "inspection_form")
        imported_users = _mapped_ids(db, *USER_ENTITIES)

        modality_names = dict(db.query(Modality.id, Modality.name).all())
        facility_names = dict(db.query(Facility.id, Facility.name).all())

        forms = [{
            "name": form.name,
            "description": form.description,
            "modality": modality_names.get(form.modality_id),
            "schema": form.schema,
            "archived": form.archived_at is not None,
        } for form in db.query(InspectionForm).all()
            if form.id not in imported_forms]

        natives = [{
            "username": user.username,
            "email": user.email,
            "full_name": user.full_name,
            # Carried so people can still sign in afterwards. It is already a
            # one-way hash; this file is no more sensitive than the table it
            # came from, and is still production data -- keep it off the repo
            # and delete it when the restore is verified.
            "hashed_password": user.hashed_password,
            "user_type": str(getattr(user.user_type, "value", user.user_type)),
            "role": str(getattr(user.role, "value", user.role)),
            "is_active": bool(user.is_active),
            "facility": facility_names.get(user.facility_id),
            "phone": user.phone,
            # Carried here too: a native user is recreated from scratch,
            # and their matrix would otherwise only survive if it
            # happened to differ from their role's.
            "permissions": user.permissions,
        } for user in db.query(User).all()
            if user.id not in imported_users]

        payload = {
            "format_version": FORMAT_VERSION,
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "source_database": engine.url.database,
            "inspection_forms": forms,
            "saved_permissions": _saved_matrices(db),
            "native_users": natives,
        }
    finally:
        db.close()

    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(payload, indent=2, default=str), encoding="utf-8")

    print("Wrote {}".format(output))
    print("  inspection forms built in Medrad : {}".format(len(payload["inspection_forms"])))
    print("  users with a saved matrix        : {}".format(
        len(payload["saved_permissions"])))
    for row in payload["saved_permissions"]:
        print("      {:<18} {}".format(row["role"], row["username"]))
    print("  users created in Medrad          : {}".format(len(payload["native_users"])))
    print()
    print("This file contains production data, including password hashes.")
    print("Keep it out of the repository and delete it once the restore is verified.")
    return 0


# ---------------------------------------------------------------------------
# Restore
# ---------------------------------------------------------------------------

def restore(source: Path, confirm_target: str) -> int:
    payload = json.loads(source.read_text(encoding="utf-8"))
    if payload.get("format_version") != FORMAT_VERSION:
        raise SystemExit("Unrecognised file format version.")

    target = engine.url.database
    if confirm_target != target:
        raise SystemExit(
            "--confirm-target {!r} does not match the database this is "
            "pointed at ({!r}).".format(confirm_target, target)
        )

    db = SessionLocal()
    notes: list[str] = []
    added_forms = added_users = applied = 0
    try:
        modalities = {name: mid for mid, name in db.query(Modality.id, Modality.name).all()}
        facilities = {name: fid for fid, name in db.query(Facility.id, Facility.name).all()}
        existing_forms = {f.name for f in db.query(InspectionForm).all()}

        for form in payload["inspection_forms"]:
            if form["name"] in existing_forms:
                notes.append("form already present, left alone: {}".format(form["name"]))
                continue
            modality_id = modalities.get(form["modality"])
            if form["modality"] and modality_id is None:
                notes.append("form {!r}: modality {!r} no longer exists, left unset"
                             .format(form["name"], form["modality"]))
            db.add(InspectionForm(
                name=form["name"], description=form["description"],
                modality_id=modality_id, schema=form["schema"],
                archived_at=datetime.utcnow() if form.get("archived") else None,
            ))
            added_forms += 1

        for person in payload["native_users"]:
            if db.query(User).filter(User.username == person["username"]).first():
                notes.append("user already present, left alone: {}".format(person["username"]))
                continue
            db.add(User(
                username=person["username"], email=person["email"],
                full_name=person["full_name"],
                hashed_password=person["hashed_password"],
                user_type=person["user_type"], role=person["role"],
                is_active=person["is_active"], phone=person.get("phone"),
                facility_id=facilities.get(person["facility"]),
            ))
            added_users += 1

        # Applied last, so a matrix for a user this file also creates lands
        # on the row it just made.
        db.flush()

        for row in payload["saved_permissions"]:
            user = db.query(User).filter(User.username == row["username"]).first()
            if user is None:
                notes.append("no account named {!r}; its tuned matrix was NOT "
                             "applied".format(row["username"]))
                continue
            user.permissions = row["permissions"]
            applied += 1

        db.commit()
    finally:
        db.close()

    print("Restored into {}".format(target))
    print("  inspection forms created   : {}".format(added_forms))
    print("  users created              : {}".format(added_users))
    print("  permission matrices applied: {}".format(applied))
    for note in notes:
        print("  ! {}".format(note))
    if applied != len(payload["saved_permissions"]):
        print()
        print("Not every saved matrix was applied. Those people will be on their")
        print("role's default access until it is sorted out -- see the notes above.")
        return 1
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="command", required=True)

    out = sub.add_parser("export", help="Save what a re-import would destroy")
    out.add_argument("--output", type=Path, required=True)

    back = sub.add_parser("restore", help="Put it back into a rebuilt database")
    back.add_argument("--input", type=Path, required=True)
    back.add_argument("--apply", action="store_true", required=True)
    back.add_argument("--confirm-target", required=True)

    args = parser.parse_args()
    if args.command == "export":
        return export(args.output)
    return restore(args.input, args.confirm_target)


if __name__ == "__main__":
    sys.exit(main())
