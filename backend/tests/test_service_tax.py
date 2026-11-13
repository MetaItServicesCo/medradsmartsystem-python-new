"""Sales tax on service quotations and service invoices: 8.25%.

A quotation paid on its own is taxed on its part and other lines, not labor:
Part $150 + Labor $100 is $250 + $12.38 tax = $262.38.

A service invoice is taxed only when it includes a quotation, and then on the
whole invoice but travel, with each quotation at its amount before its own
tax: Service Fee $150 + Labor $150 + quotation $150 = $450 + $37.13 tax.
Travel is never taxed. Without a quotation there is no tax. Quotations from
before service tax keep their amounts.

    cd backend
    DATABASE_URL=sqlite:// venv312/Scripts/python.exe tests/test_service_tax.py
"""
from __future__ import annotations

import logging
import os
import pathlib
import sys
from datetime import datetime
from decimal import Decimal as D

os.environ.setdefault("DATABASE_URL", "sqlite://")
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))
logging.disable(logging.CRITICAL)

from cryptography.fernet import Fernet  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from sqlalchemy import create_engine, event  # noqa: E402
from sqlalchemy.orm import sessionmaker  # noqa: E402
from sqlalchemy.pool import StaticPool  # noqa: E402

import app.models  # noqa: E402,F401
from app.api.v1.endpoints import service_requests  # noqa: E402
from app.core.config import settings  # noqa: E402
from app.core.deps import get_current_user  # noqa: E402
from app.db.base import Base, get_db  # noqa: E402
from app.main import app  # noqa: E402
from app.models.equipment import Equipment  # noqa: E402
from app.models.facility import Facility  # noqa: E402
from app.models.invoice import Invoice  # noqa: E402
from app.models.modality import Modality, ModalityCategory  # noqa: E402
from app.models.service_request import (  # noqa: E402
    Priority,
    QuotationAuthorization,
    QuotationLedgerEntry,
    QuotationPayment,
    ServiceRequest,
    ServiceRequestQuotation,
    ServiceRequestStatus,
)
from app.models.tier import Tier  # noqa: E402
from app.models.user import User, UserRole, UserType  # noqa: E402
from app.utils import read_cache  # noqa: E402
from app.utils.service_tax import quotation_tax, service_invoice_taxable_amount, tax_on  # noqa: E402

settings.PAYMENT_DATA_ENCRYPTION_KEYS = Fernet.generate_key().decode()
settings.SQUARE_ENVIRONMENT, settings.SQUARE_APPLICATION_ID = "sandbox", "sandbox-app"
settings.SQUARE_ACCESS_TOKEN, settings.SQUARE_LOCATION_ID, settings.SQUARE_CURRENCY = "server-token", "LOC", "USD"
settings.CARD_PROCESSING_FEE_PERCENT = "3.5"
read_cache.settings.READ_CACHE_ENABLED = False

failures: list[str] = []


def ok(label: str, condition: bool, detail: object = "") -> None:
    print("{}  {}{}".format("PASS" if condition else "FAIL", label, f"  {detail}" if not condition and detail != "" else ""))
    if not condition:
        failures.append(label)


print("\nThe tax rule")
ok("8.25% of $450.00 is $37.13 (rounded half up)", tax_on("450") == D("37.13"), tax_on("450"))
ok("8.25% of $150.00 is $12.38", tax_on("150") == D("12.38"), tax_on("150"))
ok("8.25% of $100.00 is $8.25", tax_on("100") == D("8.25"))
ok("no tax on nothing", tax_on("0") == D("0.00") and tax_on(None) == D("0.00"))
sub, taxable, tax = quotation_tax([{"item_type": "part", "total": "150"}, {"item_type": "labor", "total": "100"}])
ok("a quotation: Part $150 + Labor $100 is taxed on the $150 part only", (sub, taxable, tax) == (D("250.00"), D("150.00"), D("12.38")), (sub, taxable, tax))
sub, taxable, tax = quotation_tax([{"item_type": "other", "total": "40"}, {"item_type": "Labor", "total": "60"}])
ok("  other lines are taxed, labor in any case is not", (taxable, tax) == (D("40.00"), D("3.30")), (taxable, tax))
ok("  labor alone: no tax", quotation_tax([{"item_type": "labor", "total": "300"}])[2] == D("0.00"))
ok("an invoice without a quotation is taxed on nothing",
   service_invoice_taxable_amount("150", "150", "0", includes_quotation=False) == D("0.00"))
ok("an invoice with one: the Service Fee, labor and quotations",
   service_invoice_taxable_amount("150", "150", "150", includes_quotation=True) == D("450.00"))


if os.environ.get("SERVICE_TAX_TEST_DB"):
    engine = create_engine(os.environ["SERVICE_TAX_TEST_DB"])
    Base.metadata.drop_all(engine)
else:
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)

    @event.listens_for(engine, "connect")
    def _no_driver_transactions(dbapi_connection, _record):
        dbapi_connection.isolation_level = None

    @event.listens_for(engine, "begin")
    def _begin(connection):
        connection.exec_driver_sql("BEGIN")


def _buildable(table) -> bool:
    from sqlalchemy.schema import CreateTable
    try:
        CreateTable(table).compile(dialect=engine.dialect)
        return True
    except Exception:
        return False


Base.metadata.create_all(engine, tables=[t for t in Base.metadata.sorted_tables if _buildable(t)])
Session = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)

seed = Session()
clinic = Facility(name="Life Path", contact_person="C", phone="1", email="c@x.test", address="1 St", city="Waco",
                  state="TX", zip_code="76701", country="US")
seed.add(clinic)
seed.flush()
boss = User(username="boss", email="boss@x.test", full_name="Boss", hashed_password="x", user_type=UserType.EMPLOYEE,
            role=UserRole.SUPERADMIN, is_active=True)
seed.add(boss)
tier = Tier(tier_code="T1", name="Gold", labor_rate_per_hour=D("100"), service_call_fee=D("150"),
            preventive_maintenance_fee=D("0"), mileage_rate=D("1"))
seed.add(tier)
modality = Modality(name="Monitor", category=list(ModalityCategory)[0])
seed.add(modality)
seed.flush()
monitor = Equipment(asset_tag="A-1", make="Acme", model="M1", serial_number="SN-1", modality_id=modality.id,
                    facility_id=clinic.id, tier_id=tier.id)
seed.add(monitor)
seed.flush()


def service_request(number: str) -> int:
    """1.50 hours at $100 an hour: $150 of labor, on a $150 Service Fee tier."""
    row = ServiceRequest(request_number=number, facility_id=clinic.id, equipment_id=monitor.id, requester_id=boss.id,
                         problem_description="Broken", priority=Priority.MEDIUM, status=ServiceRequestStatus.IN_PROGRESS,
                         time_spent_hours=D("1.50"), total_cost=D("150"), history=[])
    seed.add(row)
    seed.flush()
    return row.id


SR_QUOTES, SR_TAXED, SR_PLAIN, SR_NONE_PICKED, SR_TYPED, SR_ZERO, SR_PAID, SR_LEGACY, SR_NEG = (
    service_request(f"SR-TAX-{i}") for i in range(1, 10))
BOSS = boss.id
seed.commit()
seed.close()


def db_override():
    db = Session()
    try:
        yield db
    finally:
        db.close()


def user_override():
    db = Session()
    try:
        user = db.get(User, BOSS)
        db.expunge(user)
        return user
    finally:
        db.close()


app.dependency_overrides[get_db] = db_override
app.dependency_overrides[get_current_user] = user_override
client = TestClient(app, raise_server_exceptions=False, base_url="http://localhost")
service_requests.enforce_rate_limit = lambda **_: None
API = "/api/v1/service-requests"

PART_150 = {"item_type": "part", "description": "Pump", "quantity": 2, "unit_price": 75, "total": 150}
LABOR_100 = {"item_type": "labor", "description": "Labor", "quantity": 1, "unit_price": 100, "total": 100}


def create_quotation(request_id: int, lines: list[dict]) -> dict:
    r = client.post(f"{API}/{request_id}/quotations", json={"description": "Repair", "line_items": lines})
    assert r.status_code == 201, r.text
    return r.json()


def complete(request_id: int) -> None:
    db = Session()
    try:
        db.get(ServiceRequest, request_id).status = ServiceRequestStatus.COMPLETED
        db.commit()
    finally:
        db.close()


def generate(request_id: int, **body):
    return client.post(f"{API}/{request_id}/generate-invoice", json=body)


def money(value) -> D:
    return D(str(value)).quantize(D("0.01"))


print("\nA quotation is taxed on its parts and other items")
q = create_quotation(SR_QUOTES, [PART_150, LABOR_100])
ok("Part $150 + Labor $100: subtotal $250.00, tax $12.38, amount $262.38",
   (money(q["subtotal"]), money(q["tax_amount"]), money(q["amount"])) == (D("250.00"), D("12.38"), D("262.38")), q)
ok("  the rate is kept with it: 8.25%", money(q["tax_rate"]) == D("8.25"), q["tax_rate"])
labor_only = create_quotation(SR_QUOTES, [LABOR_100])
ok("labor alone: no tax, $100.00", (money(labor_only["tax_amount"]), money(labor_only["amount"])) == (D("0.00"), D("100.00")), labor_only)
other = create_quotation(SR_QUOTES, [{"item_type": "other", "description": "Freight", "quantity": 1, "unit_price": 40, "total": 40}])
ok("an other line is taxed: $40 + $3.30", money(other["amount"]) == D("43.30"), other)

r = client.put(f"{API}/quotations/{q['id']}", json={"line_items": [{**PART_150, "quantity": 1, "unit_price": 100, "total": 100}]})
ok("changing the lines works the tax out again: Part $100 is $108.25", r.status_code == 200 and money(r.json()["amount"]) == D("108.25")
   and money(r.json()["tax_amount"]) == D("8.25") and money(r.json()["subtotal"]) == D("100.00"), r.text[:300])
ok("  the revision history records the new amount, tax included",
   (r.json().get("revision_history") or [{}])[-1].get("new_amount") == 108.25, r.json().get("revision_history"))
r = client.put(f"{API}/quotations/{q['id']}", json={"description": "Repair, revised"})
ok("changing only the description leaves the amount and tax", r.status_code == 200 and money(r.json()["amount"]) == D("108.25")
   and money(r.json()["tax_amount"]) == D("8.25"), r.text[:300])

detail = client.get(f"{API}/{SR_QUOTES}").json()
ok("the service request carries the 8.25% rate", money(detail.get("service_tax_rate")) == D("8.25"), detail.get("service_tax_rate"))
listed = next((x for x in detail.get("quotations", []) if x["id"] == q["id"]), {})
ok("  and its quotations their subtotal and tax", money(listed.get("subtotal")) == D("100.00") and money(listed.get("tax_amount")) == D("8.25"), listed)
everything = client.get(f"{API}/quotations/all").json()
in_billing = next((x for x in everything if x["id"] == q["id"]), {})
ok("Billing's quotation list has them too", money(in_billing.get("subtotal")) == D("100.00") and money(in_billing.get("tax_amount")) == D("8.25"), in_billing)

print("\nA quotation from before service tax keeps its amount")
db = Session()
legacy = ServiceRequestQuotation(service_request_id=SR_LEGACY, created_by_id=BOSS, quotation_number="SR-TAX-8-Q01",
                                 amount=D("300.00"), description="Old repair", status="draft")
db.add(legacy)
db.commit()
LEGACY = legacy.id
db.close()
r = client.put(f"{API}/quotations/{LEGACY}", json={"description": "Old repair, reworded"})
ok("its amount stays $300.00, with no tax", r.status_code == 200 and money(r.json()["amount"]) == D("300.00")
   and money(r.json()["tax_amount"]) == D("0.00") and money(r.json()["subtotal"]) == D("300.00"), r.text[:300])

print("\nAn invoice that includes a quotation is taxed as a whole, but travel")
included = create_quotation(SR_TAXED, [PART_150])
ok("the quotation alone would be $162.38", money(included["amount"]) == D("162.38"), included)
complete(SR_TAXED)
r = generate(SR_TAXED, include_quotations=True, quotation_ids=[included["id"]], travel_charges=40)
inv = r.json()
ok("Service Fee $150 + Labor $150 + Part $150 + Travel $40: subtotal $490.00",
   r.status_code == 200 and money(inv["subtotal"]) == D("490.00"), r.text[:400])
ok("  tax 8.25% of $450.00 (no travel) is $37.13", money(inv["tax_amount"]) == D("37.13"), inv.get("tax_amount"))
ok("  total $527.13, all of it due", money(inv["total_amount"]) == D("527.13") and money(inv["balance_due"]) == D("527.13"), inv.get("total_amount"))
quote_lines = [line for line in inv.get("line_items", []) if line.get("item_number") == included["quotation_number"]]
ok("  the quotation's line is on it at $150.00, before its own tax",
   len(quote_lines) == 1 and money(quote_lines[0]["total_amount"]) == D("150.00"), quote_lines)
db = Session()
row = db.get(ServiceRequestQuotation, included["id"])
entry = db.query(QuotationLedgerEntry).filter(QuotationLedgerEntry.quotation_id == included["id"],
                                              QuotationLedgerEntry.event_type == "included_in_service_invoice").first()
history = [h for h in (db.get(ServiceRequest, SR_TAXED).history or []) if h.get("action") == "service_invoice_generated"]
db.close()
ok("  the quotation is marked as on the invoice", row.status == "included_in_invoice", row.status)
ok("  its ledger records $150.00 billed", entry is not None and money(entry.amount) == D("150.00"), entry and entry.amount)
changes = history[-1].get("changes", {}) if history else {}
ok("  the request's history records how the tax was worked out",
   changes.get("taxable_amount") == "450.00" and changes.get("tax_amount") == "37.13" and changes.get("tax_entered") is False
   and changes.get("tax_rate") == "8.25", changes)

print("\nWithout a quotation, no tax")
complete(SR_PLAIN)
r = generate(SR_PLAIN, travel_charges=40)
ok("Service Fee $150 + Labor $150 + Travel $40: $340.00, no tax",
   r.status_code == 200 and money(r.json()["tax_amount"]) == D("0.00") and money(r.json()["total_amount"]) == D("340.00"), r.text[:300])
create_quotation(SR_NONE_PICKED, [PART_150])
complete(SR_NONE_PICKED)
r = generate(SR_NONE_PICKED, include_quotations=True, quotation_ids=[])
ok("quotations ticked but none picked: no tax, $300.00",
   r.status_code == 200 and money(r.json()["tax_amount"]) == D("0.00") and money(r.json()["total_amount"]) == D("300.00"), r.text[:300])

print("\nThe administrator can still set the tax")
typed = create_quotation(SR_TYPED, [PART_150])
complete(SR_TYPED)
r = generate(SR_TYPED, include_quotations=True, quotation_ids=[typed["id"]], tax_amount=10)
ok("a typed $10.00 is charged instead: $460.00", r.status_code == 200 and money(r.json()["tax_amount"]) == D("10.00")
   and money(r.json()["total_amount"]) == D("460.00"), r.text[:300])
zero = create_quotation(SR_ZERO, [PART_150])
complete(SR_ZERO)
r = generate(SR_ZERO, include_quotations=True, quotation_ids=[zero["id"]], tax_amount=0)
ok("$0.00 for a tax-exempt facility: $450.00", r.status_code == 200 and money(r.json()["tax_amount"]) == D("0.00")
   and money(r.json()["total_amount"]) == D("450.00"), r.text[:300])
complete(SR_NEG)
r = generate(SR_NEG, tax_amount=-5)
ok("a negative tax is refused", r.status_code == 422, r.status_code)
r = generate(SR_NEG, tax_amount=None)
ok("  null is the worked-out tax", r.status_code == 200 and money(r.json()["tax_amount"]) == D("0.00"), r.text[:300])

print("\nA quotation paid on its own keeps its tax; the invoice adds none for it")
paid = create_quotation(SR_PAID, [PART_150])
db = Session()
quote_row = db.get(ServiceRequestQuotation, paid["id"])
quote_row.status = "authorized"
db.add(QuotationAuthorization(quotation_id=paid["id"], status="authorized", authorized_amount=quote_row.amount))
db.commit()
db.close()
preview = client.get(f"{API}/quotations/{paid['id']}/card-payment").json()
ok("paid by card: $162.38 with tax, + 3.5% ($5.68) = $168.06",
   money(preview.get("base_amount")) == D("162.38") and money(preview.get("card_fee")) == D("5.68")
   and money(preview.get("charge_amount")) == D("168.06"), preview)
db = Session()
quote_row = db.get(ServiceRequestQuotation, paid["id"])
db.add(QuotationPayment(quotation_id=paid["id"], payment_method="ach", amount=D("162.38"), status="completed",
                        paid_at=datetime.utcnow(), created_by_id=BOSS))
quote_row.status = "paid"
db.commit()
db.close()
complete(SR_PAID)
r = generate(SR_PAID, include_quotations=True)
inv = r.json()
ok("the invoice leaves the paid quotation off: Service Fee + Labor, $300.00, no tax",
   r.status_code == 200 and money(inv["tax_amount"]) == D("0.00") and money(inv["total_amount"]) == D("300.00"), r.text[:300])
shown = inv.get("paid_quotations") or []
ok("  and lists it as paid, $162.38 with its tax", len(shown) == 1 and money(shown[0]["paid_amount"]) == D("162.38"), shown)

db = Session()
untouched = db.get(ServiceRequestQuotation, LEGACY)
ok("the quotation from before service tax still charges $300.00", money(untouched.amount) == D("300.00") and money(untouched.tax_amount) == D("0.00"))
ok("every invoice's total is its subtotal + tax - discount",
   all(money(i.total_amount) == money(i.subtotal) + money(i.tax_amount) - money(i.discount_amount) for i in db.query(Invoice)))
db.close()

print(f"\n{len(failures)} FAILED: {failures}" if failures else "\nALL PASSED")
sys.exit(1 if failures else 0)
