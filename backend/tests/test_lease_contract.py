"""The lease screens and the lease API describe the same fields.

The UI's TypeScript interfaces are its contract with the server, and a field
name that does not match fails silently in a browser -- an empty cell, a
button that never appears -- not at compile time. This compares them
mechanically: every field the UI declares must be one the server sends, and
every field the server sends must be declared.

    DATABASE_URL=sqlite:// python backend/tests/test_lease_contract.py
"""
import os, re, sys, pathlib
os.environ.setdefault("DATABASE_URL", "sqlite://")
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))
from datetime import date, timedelta
from decimal import Decimal as D
from cryptography.fernet import Fernet
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
import app.models  # noqa: F401  (registers every model)
from app.core.config import settings
settings.PAYMENT_DATA_ENCRYPTION_KEYS = Fernet.generate_key().decode()
from app.db.base import Base
from app.models.inventory import InventoryPart
from app.models.user import User, UserRole, UserType
from app.utils import lease_service as svc
from app.utils.lease_presenter import lease_detail, lease_summary
svc.send_html_email = lambda *a, **k: True
e = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
Base.metadata.create_all(e)
db = sessionmaker(bind=e)()
u = User(username="a", email="a@x.t", full_name="A", hashed_password="x", user_type=UserType.EMPLOYEE, role=UserRole.ADMIN, is_active=True)
p = InventoryPart(part_number="P", part_type="sales", description="D", unit_price=D("1000"), condition="new", quantity_on_hand=5, status="active")
db.add_all([u, p]); db.commit()
a = svc.create_agreement(db, svc.LeaseInput(customer_name="C", customer_email="c@x.t", part_id=p.id, quantity=1,
    markup_percent=D("10"), down_payment=D("100"), installment_count=3, frequency="monthly",
    first_due_date=date.today() + timedelta(days=30)), u)
db.commit()
staff = set(lease_detail(a, staff=True)); customer = set(lease_detail(a, staff=False)) | {"square"}
summary = set(lease_summary(a))

ts = pathlib.Path(__file__).resolve().parents[2].joinpath("frontend", "src", "api", "leases.ts").read_text(encoding="utf-8")
def iface(name):
    m = re.search(r"export interface %s(?: extends (\w+))? \{(.*?)\n\}" % name, ts, re.S)
    own = set(re.findall(r"^\s{2}(\w+)\??:", m.group(2), re.M))
    return own | (iface(m.group(1)) if m.group(1) else set())
ts_summary = iface("LeaseSummary"); ts_detail = iface("LeaseDetail")
failures = []


def ok(label, condition, detail=""):
    print("{}  {}{}".format("PASS" if condition else "FAIL", label, "  " + detail if detail else ""))
    if not condition:
        failures.append(label)


print("Lease contract")
print("=" * 72)
ok("every list field the UI reads is sent", not (ts_summary - summary), str(sorted(ts_summary - summary)))
ok("every list field sent is declared", not (summary - ts_summary), str(sorted(summary - ts_summary)))
ok("every detail field the UI reads is sent to someone", not (ts_detail - (staff | customer)),
   str(sorted(ts_detail - (staff | customer))))
ok("every field staff are sent is declared", not (staff - ts_detail), str(sorted(staff - ts_detail)))
ok("every field the customer is sent is declared", not (customer - ts_detail), str(sorted(customer - ts_detail)))
ok("the customer view carries no staff-only field",
   not ({"history", "authorizations", "notes", "overpayment_amount", "customer_user_id", "created_by"} & customer))
print()
print("=" * 72)
if failures:
    print("{} failing: {}".format(len(failures), ", ".join(failures)))
    sys.exit(1)
print("All lease contract checks passed.")
