"""Prove a captured kind reaches the stock list once, with the right count.

The claim this feature makes is narrow and easy to get wrong: ten photographed
pumps are *one* inventory row with a quantity of ten, that row is created the
first time somebody describes the kind, and every later save updates it rather
than adding another row saying the same thing. Each of those is checked here,
because "it looked right on my screen once" is not evidence that describing the
same part twice will not double your stock.

Runs on SQLite, against the real models and the real _sync_part -- no fixtures
that quietly re-implement what is being tested:

    DATABASE_URL=sqlite:// python backend/tests/test_capture_publish.py
"""
from __future__ import annotations

import os
import pathlib
import sys

# The engine is built at import time, so it has to point somewhere harmless
# before anything from the app is imported.
os.environ.setdefault("DATABASE_URL", "sqlite://")

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))

from sqlalchemy import create_engine  # noqa: E402
from sqlalchemy.orm import sessionmaker  # noqa: E402

from app.api.v1.endpoints.inventory_capture import (  # noqa: E402
    _sync_part,
    _unit_count,
)
from app.models.audit_log import AuditLog  # noqa: E402
from app.models.inventory import InventoryPart, InventoryTransaction  # noqa: E402
from app.models.inventory_capture import CaptureStatus, InventoryCapture  # noqa: E402
from app.models.part_definition import PartDefinition  # noqa: E402


failures: list[str] = []


def ok(label: str, condition: bool, detail: str = "") -> None:
    print("{}  {}{}".format("PASS" if condition else "FAIL", label,
                            "  " + detail if detail else ""))
    if not condition:
        failures.append(label)


class FakeUser:
    """log_activity only ever reads an id off the actor."""

    id = 1
    username = "tester"
    role = "admin"


def session():
    engine = create_engine("sqlite://")
    # AuditLog too: _sync_part writes an activity row, and a test that
    # skipped the table would not be exercising the real path.
    for model in (InventoryPart, InventoryTransaction, PartDefinition,
                  InventoryCapture, AuditLog):
        model.__table__.create(engine)
    return sessionmaker(bind=engine, autoflush=False)()


def capture(db, definition, code):
    row = InventoryCapture(
        code=code,
        definition_id=definition.id,
        status=CaptureStatus.DRAFT,
        photo_path="x/y.jpg",
    )
    db.add(row)
    return row


def described(**overrides):
    values = dict(
        name="Philips MX40 pump",
        part_number="MX40-001",
        part_type="sales",
        description="Infusion pump",
        condition="new",
    )
    values.update(overrides)
    return PartDefinition(**values)


user = FakeUser()

# ── 1. An undescribed kind stays out of the stock list ───────────────────────
db = session()
bare = PartDefinition(name="Unnamed part")
db.add(bare)
db.flush()
capture(db, bare, "MRP-AAAA")
db.flush()
ok("a photograph alone creates no part", _sync_part(db, bare, user) is None)
ok("and nothing lands in inventory", db.query(InventoryPart).count() == 0)

# Missing any one of the three required fields is still not enough.
for index, missing in enumerate(("part_number", "part_type", "description")):
    partial = described(**{missing: None})
    db.add(partial)
    db.flush()
    capture(db, partial, "MRP-MISS{}".format(index))
    db.flush()
    ok("no {} means no part".format(missing), _sync_part(db, partial, user) is None)
db.close()

# ── 2. Ten items become one row with a quantity of ten ───────────────────────
db = session()
pump = described()
db.add(pump)
db.flush()
for index in range(10):
    capture(db, pump, "MRP-P{:03d}".format(index))
db.flush()

part = _sync_part(db, pump, user)
db.flush()
ok("describing the kind creates a part", part is not None)
ok("one row, not ten", db.query(InventoryPart).count() == 1)
ok("quantity is the number of items", part.quantity_on_hand == 10,
   "got {}".format(part.quantity_on_hand))
ok("the definition remembers its row", pump.part_id == part.id)
ok("the details came from the definition",
   (part.part_number, part.part_type, part.description, part.condition)
   == ("MX40-001", "sales", "Infusion pump", "new"))
ok("every unit points at that row",
   db.query(InventoryCapture).filter(InventoryCapture.part_id == part.id).count() == 10)
ok("and none is still waiting to be described",
   db.query(InventoryCapture)
     .filter(InventoryCapture.status == CaptureStatus.DRAFT).count() == 0)

# ── 3. Saving the form again updates the row it already has ──────────────────
pump.description = "Infusion pump, corrected"
again = _sync_part(db, pump, user)
db.flush()
ok("saving twice does not create a second row", db.query(InventoryPart).count() == 1)
ok("it is the same row", again.id == part.id)
ok("the correction reached it", again.description == "Infusion pump, corrected")

# ── 4. Capturing more of a published kind raises the count ───────────────────
for index in range(5):
    capture(db, pump, "MRP-Q{:03d}".format(index))
db.flush()
ok("_unit_count sees the new items", _unit_count(db, pump.id) == 15)
_sync_part(db, pump, user)
db.flush()
ok("five more items is a count of fifteen", part.quantity_on_hand == 15,
   "got {}".format(part.quantity_on_hand))
ok("still one row", db.query(InventoryPart).count() == 1)

# ── 5. Discarded units are not stock ─────────────────────────────────────────
dropped = db.query(InventoryCapture).filter(
    InventoryCapture.code == "MRP-Q004").first()
dropped.status = CaptureStatus.DISCARDED
db.flush()
_sync_part(db, pump, user)
db.flush()
ok("a discarded item leaves the count", part.quantity_on_hand == 14,
   "got {}".format(part.quantity_on_hand))
ok("and is not re-confirmed by the next save",
   db.query(InventoryCapture).filter(
       InventoryCapture.code == "MRP-Q004").first().status == CaptureStatus.DISCARDED)

# ── 6. A deleted part is replaced, not silently ignored ──────────────────────
# Deleting the part sets part_definitions.part_id to NULL in Postgres; here the
# same state is reached by hand, plus the harder case of a dangling id.
db.delete(part)
db.flush()
pump.part_id = 9999  # the row is gone; the definition still points at it
replacement = _sync_part(db, pump, user)
db.flush()
ok("a deleted row is rebuilt", replacement is not None)
ok("and there is exactly one again", db.query(InventoryPart).count() == 1)
ok("the definition follows it", pump.part_id == replacement.id)
ok("with the count intact", replacement.quantity_on_hand == 14,
   "got {}".format(replacement.quantity_on_hand))
# SQLite hands out the freed primary key again, so identity is checked by what
# the definition points at rather than by the number itself.
ok("nothing still points at the dangling id", pump.part_id != 9999)
db.close()

# ── 7. Two kinds are two rows ────────────────────────────────────────────────
db = session()
first = described(name="Pump A", part_number="A-1")
second = described(name="Pump B", part_number="B-1")
db.add_all([first, second])
db.flush()
capture(db, first, "MRP-A001")
for index in range(3):
    capture(db, second, "MRP-B{:03d}".format(index))
db.flush()
row_a = _sync_part(db, first, user)
row_b = _sync_part(db, second, user)
db.flush()
ok("different kinds do not share a row", row_a.id != row_b.id)
ok("each carries its own count",
   (row_a.quantity_on_hand, row_b.quantity_on_hand) == (1, 3),
   "got {} and {}".format(row_a.quantity_on_hand, row_b.quantity_on_hand))
db.close()

print()
if failures:
    print("{} failed: {}".format(len(failures), ", ".join(failures)))
    raise SystemExit(1)
print("all checks passed")
