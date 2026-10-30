"""A service request shows the asset tag of the equipment it is about.

The tag is how a unit is identified on site, so the Details panel shows it
beside the equipment name. Two places have to agree for it to reach the
screen: the serializer must add it, and the response schema must declare it,
because FastAPI silently drops any field the response model does not list.
Both are checked here, through the real schema.

    DATABASE_URL=sqlite:// python backend/tests/test_service_request_asset_tag.py
"""
from __future__ import annotations

import os
import pathlib
import sys

os.environ.setdefault("DATABASE_URL", "sqlite://")
ROOT = pathlib.Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "backend"))

import app.models  # noqa: E402,F401
from app.api.v1.endpoints.service_requests import _enrich  # noqa: E402
from app.models.equipment import Equipment  # noqa: E402
from app.models.facility import Facility  # noqa: E402
from app.models.service_request import Priority, ServiceRequest, ServiceRequestStatus  # noqa: E402
from app.schemas.service_request import ServiceRequestResponse  # noqa: E402

failures: list[str] = []


def ok(label: str, condition: bool, detail: str = "") -> None:
    print("{}  {}{}".format("PASS" if condition else "FAIL", label,
                            "  " + detail if detail else ""))
    if not condition:
        failures.append(label)


def request_for(equipment):
    # The ids a stored request always has, so the result can be validated
    # through the real response model rather than only inspected as a dict.
    sr = ServiceRequest(id=1, request_number="SR-000001", problem_description="No power", history=[],
                        facility_id=1, equipment_id=1, requester_id=1,
                        priority=Priority.MEDIUM, status=ServiceRequestStatus.NEW)
    sr.facility = Facility(name="Plano Plastic Surgery")
    sr.equipment = equipment
    sr.quotations = []
    return sr


print("Service request asset tag")
print("=" * 72)

unit = Equipment(asset_tag="PPS-00417", make="DRE", model="Torino EXL", serial_number="TX-88213",
                 description="Surgical table, electric, with remote")
data = _enrich(request_for(unit))
ok("the serializer adds the asset tag", data.get("equipment_asset_tag") == "PPS-00417",
   str(data.get("equipment_asset_tag")))
ok("  beside the equipment name, which is unchanged", data.get("equipment_name") == "DRE Torino EXL")
ok("the serializer adds the serial number", data.get("equipment_serial_number") == "TX-88213",
   str(data.get("equipment_serial_number")))
ok("the serializer adds the description",
   data.get("equipment_description") == "Surgical table, electric, with remote")

fields = ServiceRequestResponse.model_fields
for name in ("equipment_asset_tag", "equipment_serial_number", "equipment_description"):
    ok("the response schema declares {}, so FastAPI does not drop it".format(name), name in fields)
    ok("  and it is optional, so a request without equipment still serialises",
       name in fields and not fields[name].is_required())
validated = ServiceRequestResponse.model_validate(
    {k: v for k, v in data.items() if k in fields and v is not None} | {"history": [], "quotations": []}
).model_dump()
ok("all three survive validation through the real response model",
   validated["equipment_asset_tag"] == "PPS-00417"
   and validated["equipment_serial_number"] == "TX-88213"
   and validated["equipment_description"] == "Surgical table, electric, with remote")

none = _enrich(request_for(None))
ok("a request with no equipment has no tag, serial or description, not an error",
   none.get("equipment_asset_tag") is None and none.get("equipment_serial_number") is None
   and none.get("equipment_description") is None)
blank = _enrich(request_for(Equipment(asset_tag="A-1", make="M", model="N", serial_number="S-1")))
ok("equipment with no description recorded gives none, shown as a dash",
   blank.get("equipment_description") is None)

source = (ROOT / "frontend" / "src" / "pages" / "ServiceRequests" / "ServiceRequestDetail.tsx").read_text(
    encoding="utf-8", errors="replace")
ok("the Details panel shows it, labelled Asset # as it is entered in Facilities",
   "Asset #" in source and "sr.equipment_asset_tag" in source)
ok("the panel shows the serial number", "Serial #" in source and "sr.equipment_serial_number" in source)
ok("the panel shows the description", "sr.equipment_description" in source)
ok("  in order: Equipment, Asset #, Serial #, Description, then Requested By",
   source.index("sr.equipment_name || '—'") < source.index("sr.equipment_asset_tag")
   < source.index("sr.equipment_serial_number") < source.index("sr.equipment_description")
   < source.index("Requested By"))
ok("  Asset # directly after Equipment",
   source.index("Asset #") > source.index("sr.equipment_name || '—'")
   and source.index("Asset #") < source.index("Requested By"))

print()
print("=" * 72)
if failures:
    print("{} failing: {}".format(len(failures), ", ".join(failures)))
    sys.exit(1)
print("All service request asset tag checks passed.")
