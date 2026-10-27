"""The zone recorded beside an attendance event should be where the device was.

Face check-ins stored datetime.utcnow() with timezone hardcoded to
"Asia/Karachi", whatever device took the photo. Storing UTC is right; naming
a zone that may be wrong is not, because the instant on its own cannot be
turned back into the wall-clock time somebody actually checked in at.

The default is kept, so a client that sends nothing behaves exactly as it did
before. That matters here: the deployed frontend does not send a zone yet,
and will not until it is rebuilt.

    DATABASE_URL=sqlite:// python backend/tests/test_attendance_timezone.py
"""
from __future__ import annotations

import os
import pathlib
import sys

os.environ.setdefault("DATABASE_URL", "sqlite://")
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))

from app.api.v1.endpoints.attendance import (  # noqa: E402
    DEFAULT_DEVICE_TIMEZONE, _device_timezone,
)


failures: list[str] = []


def ok(label: str, condition: bool, detail: str = "") -> None:
    print("{}  {}{}".format("PASS" if condition else "FAIL", label,
                            "  " + detail if detail else ""))
    if not condition:
        failures.append(label)


print("Attendance device timezone")
print("=" * 72)

ok("a reported zone is used", _device_timezone("Europe/London") == "Europe/London")
ok("whitespace is trimmed", _device_timezone("  Asia/Dubai \n") == "Asia/Dubai")

# The important one: the deployed frontend sends nothing yet, and must keep
# behaving as it did rather than storing an empty string.
ok("nothing reported falls back to the previous default",
   _device_timezone(None) == DEFAULT_DEVICE_TIMEZONE, _device_timezone(None))
ok("an empty string falls back too",
   _device_timezone("") == DEFAULT_DEVICE_TIMEZONE)
ok("so does whitespace",
   _device_timezone("   ") == DEFAULT_DEVICE_TIMEZONE)

ok("the default is unchanged from what was hardcoded",
   DEFAULT_DEVICE_TIMEZONE == "Asia/Karachi", DEFAULT_DEVICE_TIMEZONE)

# The column is varchar; a client sending something absurd should not be the
# reason an attendance event fails to save.
long_zone = "A" * 500
ok("an over-long value is capped rather than rejected",
   len(_device_timezone(long_zone)) == 64, str(len(_device_timezone(long_zone))))

print()
print("=" * 72)
if failures:
    print("{} failing: {}".format(len(failures), ", ".join(failures)))
    sys.exit(1)
print("All attendance timezone checks passed.")
