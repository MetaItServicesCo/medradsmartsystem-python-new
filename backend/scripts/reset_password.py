"""Set a user's password from the server, without it touching anything else.

There is one superadmin by design, and `admin` has view-only access to users.
So if that account's password is lost or the login screen is broken, nobody
can repair any account from inside the application -- which is a reasonable
position to be in only if there is a documented way out. This is it.

The password is read from a prompt, never echoed, never taken as an argument
and never printed. An argument would put it in shell history, in `ps` output
while the command runs, and in any shell that logs commands centrally.

Changing the hash also invalidates every existing session for that account:
tokens carry a version derived from the stored hash, so anything issued
before this runs stops being accepted. That is the behaviour you want when
the reason for running it is that somebody should not still be signed in.

    docker compose exec -it backend python scripts/reset_password.py OmarAhmad

Note the -it. Without a terminal there is nothing to prompt.

A re-import overwrites this. The migration copies username, email and the
password hash from the legacy row, so the next rebuild restores whatever
legacy holds. If this password needs to survive that, change it in the
legacy system as well -- or stop the import from carrying credentials for
this account.
"""
from __future__ import annotations

import getpass
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.core.security import get_password_hash  # noqa: E402
from app.db.base import SessionLocal  # noqa: E402
from app.models.user import User  # noqa: E402


MINIMUM = 12


def main() -> int:
    if len(sys.argv) != 2:
        print(__doc__)
        print("Usage: python scripts/reset_password.py <username>")
        return 2
    username = sys.argv[1]

    if not sys.stdin.isatty():
        print("No terminal attached, so the password cannot be prompted for.")
        print("Run it with: docker compose exec -it backend python "
              "scripts/reset_password.py <username>")
        return 2

    db = SessionLocal()
    try:
        # Matched case-insensitively, the way login does, so a capitalisation
        # that works at the login screen works here too.
        from sqlalchemy import func

        user = db.query(User).filter(
            func.lower(User.username) == username.strip().lower()).first()
        if user is None:
            print("No account with username {!r}.".format(username))
            return 1

        print("Account : {} ({})".format(user.username, user.email))
        print("Role    : {}".format(
            getattr(user.role, "value", user.role)))
        if not user.is_active or user.is_locked:
            print("Note    : this account is inactive or locked; both are "
                  "cleared below.")
        print()

        first = getpass.getpass("New password: ")
        if len(first) < MINIMUM:
            print("Too short -- {} characters minimum. Nothing changed."
                  .format(MINIMUM))
            return 1
        if first != getpass.getpass("Repeat it: "):
            print("They do not match. Nothing changed.")
            return 1

        user.hashed_password = get_password_hash(first)
        user.failed_login_attempts = 0
        user.is_locked = False
        user.is_active = True
        db.commit()
    finally:
        db.close()

    print()
    print("Password set for {}.".format(username))
    print("Every session that account already had is now invalid, because the")
    print("token version is derived from the stored hash.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
