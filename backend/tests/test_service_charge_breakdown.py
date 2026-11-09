"""How a service charge was worked out, on the invoice and the service report.

Labor is hours × the tier's hourly rate, so $700 reads "4.00 hrs × $175.00/hr".
A line billed by quantity reads "2 × $45.00". Labor typed in by hand at
invoicing reads "adjusted", never a sum that does not give the amount. The
amounts themselves never change.

    cd backend
    DATABASE_URL=sqlite:// venv312/Scripts/python.exe tests/test_service_charge_breakdown.py
"""
from __future__ import annotations

import logging
import os
import pathlib
import sys
from datetime import date, datetime
from decimal import Decimal as D

os.environ.setdefault("DATABASE_URL", "sqlite://")
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))
logging.disable(logging.CRITICAL)

from sqlalchemy import create_engine  # noqa: E402
from sqlalchemy.orm import sessionmaker  # noqa: E402
from sqlalchemy.pool import StaticPool  # noqa: E402

import app.models  # noqa: E402,F401
from app.api.v1.endpoints.reports import _service_report_row  # noqa: E402
from app.api.v1.endpoints.service_requests import _enrich, _service_invoice_line_items  # noqa: E402
from app.db.base import Base  # noqa: E402
from app.models.equipment import Equipment  # noqa: E402
from app.models.facility import Facility  # noqa: E402
from app.models.invoice import Invoice, InvoiceStatus, InvoiceType  # noqa: E402
from app.models.modality import Modality, ModalityCategory  # noqa: E402
from app.models.service_request import (  # noqa: E402
    Priority, QuotationLineItem, ServiceRequest, ServiceRequestQuotation, ServiceRequestStatus,
)
from app.models.tier import Tier  # noqa: E402
from app.models.user import User, UserRole, UserType  # noqa: E402
from app.schemas.service_request import ServiceRequestResponse  # noqa: E402
from app.utils.invoice_editing import compose_invoice_edit_notes  # noqa: E402
from app.utils.service_charges import charge_breakdown, labor_breakdown  # noqa: E402
from app.utils.service_invoice_document import build_service_invoice_document  # noqa: E402

failures: list[str] = []


def ok(label: str, condition: bool, detail: object = "") -> None:
    print("{}  {}{}".format("PASS" if condition else "FAIL", label, f"  {detail}" if not condition else ""))
    if not condition:
        failures.append(label)


print("The rule, on its own")
ok("4 hrs at $175: 4.00 hrs × $175.00/hr", labor_breakdown(4, 175, 700) == "4.00 hrs × $175.00/hr", labor_breakdown(4, 175, 700))
ok("part hours: 2.5 hrs at $175 is $437.50", labor_breakdown("2.50", "175.00", "437.50") == "2.50 hrs × $175.00/hr")
ok("thousands are written with commas", labor_breakdown(10, 1250, 12500) == "10.00 hrs × $1,250.00/hr")
ok("labor typed in by hand: adjusted", labor_breakdown(4, 175, 600) == "4.00 hrs, adjusted")
ok("  and on the report, nothing rather than adjusted", labor_breakdown(4, 175, 600, adjusted=False) is None)
ok("no hours: nothing to explain", labor_breakdown(0, 175, 0) is None and labor_breakdown(None, 175, 0) is None)
ok("no tier, no rate, $0: 4.00 hrs × $0.00/hr", labor_breakdown(4, None, 0) == "4.00 hrs, adjusted" or labor_breakdown(4, 0, 0) == "4.00 hrs × $0.00/hr")
ok("a rate of $0 and $0 billed adds up", labor_breakdown(4, 0, 0) == "4.00 hrs × $0.00/hr")
ok("a cent of rounding still adds up", labor_breakdown("1.33", "100", "133.00") == "1.33 hrs × $100.00/hr")
ok("2 × $45.00 for $90", charge_breakdown({"description": "Filter", "quantity": 2, "unit_price": 45, "total_amount": 90}) == "2 × $45.00")
ok("1.5 × $10.00 for $15", charge_breakdown({"description": "Wire", "quantity": "1.50", "unit_price": "10", "total_amount": "15"}) == "1.5 × $10.00")
ok("one of something: nothing to explain", charge_breakdown({"description": "Service Fee", "quantity": 1, "unit_price": 150, "total_amount": 150}) is None)
ok("a quantity line that does not add up: nothing", charge_breakdown({"description": "Kit", "quantity": 2, "unit_price": 45, "total_amount": 80}) is None)
ok("an edited line with junk in it: nothing, no crash", charge_breakdown({"description": "X", "quantity": "two", "unit_price": None, "total_amount": "abc"}) is None)
ok("not a line at all: nothing, no crash", charge_breakdown("nonsense") is None)

engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
Base.metadata.create_all(engine)
db = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)()

boss = User(username="boss", email="b@x.test", full_name="Boss", hashed_password="x",
            user_type=UserType.EMPLOYEE, role=UserRole.SUPERADMIN, is_active=True)
t1 = Tier(tier_code="T-1", name="T-1", labor_rate_per_hour=D("175.00"), service_call_fee=D("150.00"),
          preventive_maintenance_fee=D("250"), mileage_rate=D("1"))
bed = Modality(name="Bed", category=ModalityCategory.PATIENT_MONITORING)
clinic = Facility(name="Clinic", contact_person="C", phone="1", email="c@x.test", address="1 St", city="Waco",
                  state="TX", zip_code="76701", country="US")
db.add_all([boss, t1, bed, clinic])
db.flush()
n = {"i": 0}


def request(hours: str, tier: Tier | None = t1) -> ServiceRequest:
    n["i"] += 1
    equipment = Equipment(asset_tag=f"A-{n['i']}", make="Hill Rom", model="P7500", serial_number=f"S{n['i']}",
                          modality_id=bed.id, facility_id=clinic.id, tier_id=tier.id if tier else None)
    db.add(equipment)
    db.flush()
    hours_d = D(hours)
    rate = tier.labor_rate_per_hour if tier else D("0")
    sr = ServiceRequest(request_number=f"SR-{n['i']}", facility_id=clinic.id, equipment_id=equipment.id, requester_id=boss.id,
                        assigned_technician_id=boss.id, problem_description="Broken", priority=Priority.MEDIUM,
                        status=ServiceRequestStatus.COMPLETED, time_spent_hours=hours_d,
                        total_cost=(hours_d * rate).quantize(D("0.01")), history=[], completed_at=datetime(2026, 11, 5))
    db.add(sr)
    db.flush()
    return sr


def invoice(sr: ServiceRequest, labor: str, service_call: str = "150.00", travel: str = "0", extra_notes: str | None = None) -> Invoice:
    notes = f"__FEES__:labor={labor},travel={travel},service_call={service_call}::"
    if extra_notes:
        notes = extra_notes
    total = D(labor) + D(service_call) + D(travel)
    row = Invoice(invoice_number=f"INV-{sr.id}", invoice_type=InvoiceType.SERVICE, service_request_id=sr.id, facility_id=clinic.id,
                  customer_name="Clinic", customer_email="c@x.test", customer_phone="1", customer_address="1 St", subtotal=total, tax_amount=D("0"), discount_amount=D("0"), total_amount=total,
                  amount_paid=D("0"), balance_due=total, status=InvoiceStatus.PENDING, issue_date=date(2026, 11, 5),
                  due_date=date(2026, 12, 5), notes=notes)
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def charges(inv: Invoice) -> dict[str, dict]:
    document = build_service_invoice_document(inv, _service_invoice_line_items(inv))
    return {row["label"]: row for row in document["charges"]}


print("\nThe invoice: 4 hours at $175")
sr = request("4")
inv = invoice(sr, "700.00")
c = charges(inv)
ok("Labor $700.00 reads 4.00 hrs × $175.00/hr", c["Labor"]["amount"] == "700.00" and c["Labor"]["breakdown"] == "4.00 hrs × $175.00/hr", c["Labor"])
ok("the Service Fee has nothing to explain", c["Service Fee"]["amount"] == "150.00" and c["Service Fee"]["breakdown"] is None, c["Service Fee"])
ok("labels and amounts are as before", [(r["label"], r["amount"]) for r in build_service_invoice_document(inv, _service_invoice_line_items(inv))["charges"]] == [("Service Fee", "150.00"), ("Labor", "700.00")])
ok("the invoice total is untouched", build_service_invoice_document(inv, _service_invoice_line_items(inv))["total_amount"] == "850.00")

print("\nLabor typed in by hand")
c = charges(invoice(request("4"), "600.00"))
ok("$600 for 4 hrs reads 4.00 hrs, adjusted", c["Labor"]["amount"] == "600.00" and c["Labor"]["breakdown"] == "4.00 hrs, adjusted", c["Labor"])

print("\nPart hours, no tier, no hours")
c = charges(invoice(request("2.5"), "437.50"))
ok("2.5 hrs: 2.50 hrs × $175.00/hr for $437.50", c["Labor"]["breakdown"] == "2.50 hrs × $175.00/hr", c["Labor"])
c = charges(invoice(request("4", tier=None), "0.00", service_call="0"))
ok("no tier: 4.00 hrs × $0.00/hr for $0.00", c["Labor"]["amount"] == "0.00" and c["Labor"]["breakdown"] == "4.00 hrs × $0.00/hr", c["Labor"])
c = charges(invoice(request("0"), "0.00"))
ok("no hours: no Labor line, as before; the Service Fee alone", list(c) == ["Service Fee"] and c["Service Fee"]["breakdown"] is None, c)

print("\nAn invoice from before fees were saved on it")
old_sr = request("4")
c = charges(invoice(old_sr, "0", extra_notes="Old invoice"))
ok("labor worked out from hours and rate: 4.00 hrs × $175.00/hr for $700.00", c["Labor"]["amount"] == "700.00" and c["Labor"]["breakdown"] == "4.00 hrs × $175.00/hr", c["Labor"])

print("\nA quotation included in the invoice")
q_sr = request("4")
quote = ServiceRequestQuotation(service_request_id=q_sr.id, created_by_id=boss.id, quotation_number="Q-1", amount=D("90"),
                                description="Filters", status="included_in_invoice")
db.add(quote)
db.flush()
db.add(QuotationLineItem(quotation_id=quote.id, item_type="part", description="Filter", quantity=D("2"), unit_price=D("45"), total=D("90")))
db.add(QuotationLineItem(quotation_id=quote.id, item_type="part", description="Gasket", quantity=D("1"), unit_price=D("30"), total=D("30")))
db.commit()
c = charges(invoice(q_sr, "700.00"))
ok("Filter $90.00 reads 2 × $45.00", c["Filter"]["amount"] == "90.00" and c["Filter"]["breakdown"] == "2 × $45.00", c["Filter"])
ok("one Gasket has nothing to explain", c["Gasket"]["breakdown"] is None, c["Gasket"])

print("\nAn invoice whose lines were edited by hand")
e_sr = request("4")
edited = compose_invoice_edit_notes("__FEES__:labor=700.00,travel=0,service_call=150.00::", None, {"line_items": [
    {"description": "Service labor - Hill Rom P7500", "quantity": 3, "unit_price": 175, "total_amount": 525},
    {"description": "Batteries", "quantity": 4, "unit_price": "12.50", "total_amount": "50.00"},
]})
c = charges(invoice(e_sr, "0", extra_notes=edited))
ok("edited labor: 3.00 hrs × $175.00/hr for $525.00", c["Labor"]["amount"] == "525.00" and c["Labor"]["breakdown"] == "3.00 hrs × $175.00/hr", c["Labor"])
ok("edited line: 4 × $12.50 for $50.00", c["Batteries"]["breakdown"] == "4 × $12.50", c["Batteries"])

print("\nThe service report")
row = _service_report_row(sr, inv)
ok("Recorded Service Cost $700.00 reads 4.00 hrs × $175.00/hr", row["total_cost"] == 700 and row["service_cost_breakdown"] == "4.00 hrs × $175.00/hr", row["service_cost_breakdown"])
ok("its Billing Page gets the invoice's own charge lines", [(r["label"], r["amount"], r["breakdown"]) for r in row["invoice"]["charges"]] == [("Service Fee", "150.00", None), ("Labor", "700.00", "4.00 hrs × $175.00/hr")], row["invoice"]["charges"])
ok("the invoice totals on it are untouched", row["invoice"]["total_amount"] == 850 and row["invoice"]["subtotal"] == 850)
ok("not invoiced: no charge lines, the cost still explained", _service_report_row(request("4"), None)["invoice"] is None)
stale = request("4")
stale.total_cost = D("650.00")  # recorded before the tier's rate changed
ok("a recorded cost that no longer adds up: no breakdown, not 'adjusted'", _service_report_row(stale, None)["service_cost_breakdown"] is None)
ok("no tier: the report says 4.00 hrs × $0.00/hr, as the invoice does", _service_report_row(request("4", tier=None), None)["service_cost_breakdown"] == "4.00 hrs × $0.00/hr")
ok("  and so does the service request", ServiceRequestResponse.model_validate(_enrich(request("4", tier=None))).model_dump()["service_cost_breakdown"] == "4.00 hrs × $0.00/hr")

print("\nThe service request itself (the report printed with an invoice)")
data = ServiceRequestResponse.model_validate(_enrich(sr)).model_dump()
ok("carries 4.00 hrs × $175.00/hr", data["service_cost_breakdown"] == "4.00 hrs × $175.00/hr", data.get("service_cost_breakdown"))
ok("and the same cost as before", data["calculated_service_cost"] == D("700.00") and data["total_cost"] == D("700.00"))

print()
if failures:
    print(f"{len(failures)} FAILED: {failures}")
    sys.exit(1)
print("ALL PASSED")
