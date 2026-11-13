"""Sales, rental and service tax round half a cent up, as every screen shows it.

8.25% of $450.00 is exactly $37.125: charged as $37.13 everywhere, so a preview
never shows one cent more than the invoice charges.

    cd backend
    DATABASE_URL=sqlite:// venv312/Scripts/python.exe tests/test_tax_rounding.py
"""
from __future__ import annotations

import os
import pathlib
import sys
from decimal import Decimal as D
from types import SimpleNamespace

os.environ.setdefault("DATABASE_URL", "sqlite://")
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))

import app.models  # noqa: E402,F401
from app.api.v1.endpoints.sales import _quotation_pricing  # noqa: E402
from app.models.rental import Rental, RentalItem  # noqa: E402
from app.utils.rental_billing import _initial_invoice_amounts, _recurring_invoice_amounts  # noqa: E402
from app.utils.service_tax import tax_on  # noqa: E402

failures: list[str] = []


def ok(label: str, condition: bool, detail: object = "") -> None:
    print("{}  {}{}".format("PASS" if condition else "FAIL", label, f"  {detail}" if not condition and detail != "" else ""))
    if not condition:
        failures.append(label)


def sales_tax(price: str) -> D:
    line = SimpleNamespace(item_kind="product", quantity=1, unit_price=D(price), shipping_fee=D("0"),
                           setup_fee=D("0"), labor_fee=D("0"), total=None)
    return _quotation_pricing([line], D("0"))[2]


def rental(rate: str) -> Rental:
    return Rental(items=[RentalItem(rental_rate=D(rate), quantity=1, shipping_fee=D("0"), setup_fee=D("0"),
                                    labor_fee=D("0"), removal_fee=D("0"), security_deposit=D("0"))],
                  security_deposit=D("0"))


for amount, expected in (("450.00", "37.13"), ("150.00", "12.38"), ("1037.39", "85.58"), ("30.00", "2.48"), ("70.00", "5.78")):
    ok(f"Sales: 8.25% of ${amount} is ${expected}", sales_tax(amount) == D(expected), sales_tax(amount))
    first = _initial_invoice_amounts(rental(amount))["tax"]
    later = _recurring_invoice_amounts(rental(amount), 2)["tax"]
    ok(f"Rentals: first and later invoices, ${expected}", first == D(expected) and later == D(expected), (first, later))
    ok(f"Service: ${expected}", tax_on(amount) == D(expected), tax_on(amount))

print(f"\n{len(failures)} FAILED: {failures}" if failures else "\nALL PASSED")
sys.exit(1 if failures else 0)
