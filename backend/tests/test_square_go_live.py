"""Switching Square from sandbox to production, safely.

* The app refuses to start with Square settings that do not belong together:
  an unknown environment, a sandbox application ID on production (or the
  reverse), or production payments without signed webhooks.
* square_saved_cards removes only the saved cards the connected Square account
  does not hold, leaves the ones it holds or could not check, and closes
  sandbox payments still awaiting confirmation only when told to.
* square_check reports a token Square refuses or a location that cannot take
  cards, and prints no secret.

    DATABASE_URL=sqlite:// python backend/tests/test_square_go_live.py
"""
from __future__ import annotations

import contextlib
import io
import os
import pathlib
import sys
from datetime import date, datetime
from decimal import Decimal

os.environ.setdefault("DATABASE_URL", "sqlite://")
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))

import sqlalchemy as sa  # noqa: E402
from cryptography.fernet import Fernet  # noqa: E402
from sqlalchemy.orm import sessionmaker  # noqa: E402
from sqlalchemy.pool import StaticPool  # noqa: E402

from app.core.config import Settings, settings  # noqa: E402

settings.PAYMENT_DATA_ENCRYPTION_KEYS = Fernet.generate_key().decode()

import app.models  # noqa: E402,F401
from app.db.base import Base  # noqa: E402
from app.models.lease import LeaseAgreement  # noqa: E402
from app.models.payment_operation import PaymentOperation  # noqa: E402
from app.models.rental import BillingFrequency, Rental  # noqa: E402
from scripts import square_check, square_saved_cards  # noqa: E402

failures: list[str] = []


def ok(label: str, condition: bool, detail: str = "") -> None:
    print("{}  {}{}".format("PASS" if condition else "FAIL", label, "  " + detail if detail else ""))
    if not condition:
        failures.append(label)


# --- configuration guard -------------------------------------------------------------------------
BASE = dict(SECRET_KEY="k" * 40, APP_ENV="development", DATABASE_URL="sqlite://")
PROD = dict(APP_ENV="production", PUBLIC_APP_URL="https://medcodesolution.com", TRUSTED_HOSTS=["medcodesolution.com"],
            BACKEND_CORS_ORIGINS=["https://medcodesolution.com"],
            PAYMENT_DATA_ENCRYPTION_KEYS=settings.PAYMENT_DATA_ENCRYPTION_KEYS)
LIVE = dict(SQUARE_ENVIRONMENT="production", SQUARE_APPLICATION_ID="sq0idp-live", SQUARE_ACCESS_TOKEN="live-token",
            SQUARE_LOCATION_ID="LIVE1", SQUARE_WEBHOOK_SIGNATURE_KEY="whsec",
            SQUARE_WEBHOOK_NOTIFICATION_URL="https://medcodesolution.com/api/v1/webhooks/square")


def refused(**values) -> str:
    try:
        Settings(_env_file=None, **{**BASE, **values})
    except Exception as exc:  # pydantic wraps the ValueError
        return str(exc)
    return ""


ok("the default sandbox settings start", refused() == "")
ok("a sandbox application ID on sandbox starts", refused(SQUARE_APPLICATION_ID="sandbox-sq0idb-abc") == "")
ok("a full live production configuration starts", refused(**PROD, **LIVE) == "", refused(**PROD, **LIVE))
ok("an unknown environment is refused", "must be 'sandbox' or 'production'" in refused(SQUARE_ENVIRONMENT="live"))
ok("a sandbox application ID on production is refused",
   "sandbox ID but SQUARE_ENVIRONMENT is production" in refused(**{**LIVE, "SQUARE_APPLICATION_ID": "sandbox-sq0idb-abc"}))
ok("a production application ID on sandbox is refused",
   "production ID but SQUARE_ENVIRONMENT is sandbox" in refused(SQUARE_APPLICATION_ID="sq0idp-live"))
ok("production payments without a webhook signature key are refused",
   "SQUARE_WEBHOOK_SIGNATURE_KEY is required" in refused(**PROD, **{**LIVE, "SQUARE_WEBHOOK_SIGNATURE_KEY": ""}))
ok("production payments with a plain-http webhook URL are refused",
   "must be an HTTPS URL" in refused(**PROD, **{**LIVE, "SQUARE_WEBHOOK_NOTIFICATION_URL": "http://x/api"}))
ok("a services container without the access token starts without webhook settings",
   refused(**PROD, SQUARE_ENVIRONMENT="production", SQUARE_APPLICATION_ID="sq0idp-live") == "")

# --- saved cards ---------------------------------------------------------------------------------
settings.SQUARE_ENVIRONMENT, settings.SQUARE_APPLICATION_ID = "production", "sq0idp-live"
settings.SQUARE_ACCESS_TOKEN, settings.SQUARE_LOCATION_ID = "live-token", "LIVE1"

engine = sa.create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
Base.metadata.create_all(engine)
Session = sessionmaker(bind=engine)
db = Session()


def rental(number, card, customer, auto=True):
    db.add(Rental(rental_number=number, customer_name="Dr. Jane Roe", customer_email="jane@clinic.test",
                  customer_phone="555-0100", customer_address="1 Main St, Plano, TX 75024",
                  secondary_recipients=[], billing_frequency=list(BillingFrequency)[0], security_deposit=0,
                  start_date=date(2026, 11, 1), end_date=date(2027, 11, 1), history=[],
                  square_card_id=card, square_customer_id=customer, square_card_brand="VISA" if card else None,
                  square_card_last4="1111" if card else None, square_card_exp_month=12 if card else None,
                  square_card_exp_year=2030 if card else None, auto_charge=auto))


rental("RA-SANDBOX", "sandbox-card", "sandbox-customer")
rental("RA-LIVE", "live-card", "live-customer")
rental("RA-DOWN", "flaky-card", "live-customer")
rental("RA-NONE", None, None, auto=False)
money = Decimal("100.00")
db.add(LeaseAgreement(agreement_number="LTO-1", customer_name="Clinic", customer_email="c@clinic.test",
                      item_description="Monitor", unit_cash_price=money, cash_price=money, lease_price=money,
                      tax_rate_percent=Decimal("8.25"), installment_count=12, first_due_date=date(2026, 12, 1),
                      regular_installment=money, total_tax=money, total_of_payments=money, history=[],
                      square_card_id="sandbox-card-2", square_customer_id="sandbox-customer-2", auto_charge=True))
db.add_all([
    PaymentOperation(idempotency_key="old", request_fingerprint="f", operation_type="rental_auto_charge",
                     status="unknown", provider="square", amount=money, created_at=datetime(2026, 10, 1)),
    PaymentOperation(idempotency_key="new", request_fingerprint="f", operation_type="rental_auto_charge",
                     status="processing", provider="square", amount=money, created_at=datetime(2026, 11, 20)),
    PaymentOperation(idempotency_key="manual", request_fingerprint="f", operation_type="manual",
                     status="unknown", provider="manual", amount=money, created_at=datetime(2026, 10, 1)),
])
db.commit()
db.close()

LIVE_ACCOUNT = {"live-card", "live-customer"}


def fake_lookup(kind, reference):
    if reference == "flaky-card":
        return square_saved_cards.UNKNOWN
    return square_saved_cards.PRESENT if reference in LIVE_ACCOUNT else square_saved_cards.MISSING


def run(argv):
    out = io.StringIO()
    with contextlib.redirect_stdout(out):
        code = square_saved_cards.main(argv, lookup=fake_lookup, session_factory=Session)
    return code, out.getvalue()


def snapshot():
    s = Session()
    try:
        rentals = {r.rental_number: (r.square_card_id, r.square_customer_id, r.square_card_last4, r.auto_charge,
                                     [h["action"] for h in r.history or []]) for r in s.query(Rental)}
        lease = s.query(LeaseAgreement).one()
        ops = {o.idempotency_key: o.status for o in s.query(PaymentOperation)}
        return rentals, (lease.square_card_id, lease.auto_charge, [h["action"] for h in lease.history or []]), ops
    finally:
        s.close()


before = snapshot()
code, out = run([])
ok("a dry run writes nothing", snapshot() == before)
ok("  and reports what it would remove", "removed with --apply): 2" in out and "RA-SANDBOX" in out and "LTO-1" in out, out)
ok("  and exits 1 while a card could not be checked", code == 1)

code, out = run(["--apply", "--retire-pending-before", "2026-11-04T09:00"])
rentals, lease, ops = snapshot()
ok("a sandbox card is removed and auto-charge turned off",
   rentals["RA-SANDBOX"] == (None, None, None, False, ["saved_card_removed"]), str(rentals["RA-SANDBOX"]))
ok("a card the live account holds is kept", rentals["RA-LIVE"][:4] == ("live-card", "live-customer", "1111", True))
ok("a card that could not be checked is left alone", rentals["RA-DOWN"][:4] == ("flaky-card", "live-customer", "1111", True))
ok("a rental without a card is untouched", rentals["RA-NONE"] == (None, None, None, False, []))
ok("a lease's sandbox card is removed too", lease == (None, False, ["saved_card_removed"]), str(lease))
ok("a Square payment awaiting confirmation from before the switch is closed", ops["old"] == "failed")
ok("  one started after the switch is left for Square to confirm", ops["new"] == "processing")
ok("  and non-Square operations are never touched", ops["manual"] == "unknown")

after = snapshot()
code, out = run(["--apply", "--retire-pending-before", "2026-11-04T09:00"])
ok("running it again changes nothing", snapshot() == after)

# --- square_check --------------------------------------------------------------------------------
class Response:
    def __init__(self, status, payload=None):
        self.status_code, self._payload = status, payload or {}

    def json(self):
        return self._payload


def check(response):
    original = square_check.httpx.get
    square_check.httpx.get = lambda *a, **k: response
    out = io.StringIO()
    try:
        with contextlib.redirect_stdout(out):
            code = square_check.main()
    finally:
        square_check.httpx.get = original
    return code, out.getvalue()


settings.SQUARE_WEBHOOK_SIGNATURE_KEY = "whsec"
settings.SQUARE_WEBHOOK_NOTIFICATION_URL = "https://medcodesolution.com/api/v1/webhooks/square"
ready = {"location": {"name": "MedRad", "status": "ACTIVE", "currency": "USD", "country": "US",
                      "capabilities": ["CREDIT_CARD_PROCESSING"]}}
code, out = check(Response(200, ready))
ok("square_check passes an active card-taking location", code == 0 and "READY" in out, out)
ok("  and never prints the access token", "live-token" not in out)
code, out = check(Response(401))
ok("square_check reports a token Square refuses", code == 1 and "not a valid production token" in out)
code, out = check(Response(200, {"location": {**ready["location"], "capabilities": []}}))
ok("square_check reports a location that cannot take cards yet", code == 1 and "cannot process cards" in out)

print()
if failures:
    print("{} check(s) failed".format(len(failures)))
    sys.exit(1)
print("All Square go-live checks passed")
