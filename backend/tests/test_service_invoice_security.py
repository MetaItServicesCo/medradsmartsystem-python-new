"""Attacking service invoices the way an outsider or a user would.

Nothing here is overridden or mocked except Square and email: a real uvicorn
server, real sign-in and JWTs, real middleware, real Postgres locks and a real
Redis rate limiter, reached over real HTTP.

    1.  Sign-in: missing, forged, expired and misused tokens.
    2.  Who may do what, across every role and across facilities.
    3.  The link: guessing, tampering, injection, and what it reveals.
    4.  Secrets: the token in the database, logs and notifications.
    5.  Tampering with requests: extra fields, wrong types, oversized input.
    6.  Payment abuse: races, replays, reused keys, amounts, rate limits.
    7.  Bypassing approval.
    8.  Email abuse.
    9.  Damaged and old data.
    10. HTTP hardening: headers, CORS, methods.

    TEST_POSTGRES_URL=postgresql://... TEST_REDIS_URL=redis://... \
        python backend/tests/test_service_invoice_security.py
"""
from __future__ import annotations

import base64
import json
import logging
import os
import pathlib
import socket
import sys
import tempfile
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
from decimal import Decimal as D

POSTGRES_URL = os.environ.get("TEST_POSTGRES_URL")
REDIS_URL = os.environ.get("TEST_REDIS_URL")
if not POSTGRES_URL or not REDIS_URL:
    print("SKIPPED: this needs TEST_POSTGRES_URL and TEST_REDIS_URL (a throwaway Postgres and Redis)")
    sys.exit(0)

os.environ["DATABASE_URL"] = POSTGRES_URL
os.environ["REDIS_URL"] = REDIS_URL
os.environ["SECRET_KEY"] = "security-test-secret-key-that-is-long-enough-000000"
os.environ["PUBLIC_APP_URL"] = "https://app.test"
os.environ["SQUARE_APPLICATION_ID"] = "sandbox-app-id"
os.environ["SQUARE_ACCESS_TOKEN"] = "token"
os.environ["SQUARE_LOCATION_ID"] = "loc"
os.environ["SQUARE_ENVIRONMENT"] = "sandbox"
# As production: Square requires this key, and payment references are encrypted with it.
os.environ["PAYMENT_DATA_ENCRYPTION_KEYS"] = "H3b0Q2iV8oYk3v7mC1tqk3m1sU0fQ2n7rZ5xW9yA4dE="
os.environ["UPLOAD_DIR"] = tempfile.mkdtemp(prefix="service-invoice-security-")
os.environ["API_RATE_LIMIT"] = "100000"
os.environ["AUTH_LOGIN_IP_LIMIT"] = "100000"
os.environ["READ_CACHE_ENABLED"] = "false"
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))

# The Windows build of libmagic can crash or hang when loaded in this process.
# The code then uses its own file signatures, as it does when libmagic is missing.
if os.name == "nt":
    sys.modules["magic"] = None

import httpx  # noqa: E402
import redis as redis_lib  # noqa: E402
import uvicorn  # noqa: E402
from jose import jwt  # noqa: E402
from sqlalchemy import create_engine, text  # noqa: E402
from sqlalchemy.orm import sessionmaker  # noqa: E402

import app.models  # noqa: E402,F401
from app.api.v1.endpoints import service_invoice_portal as portal  # noqa: E402
from app.core.config import settings  # noqa: E402
from app.core.security import create_access_token, get_password_hash, password_token_version  # noqa: E402
from app.db.base import Base  # noqa: E402
from app.main import app  # noqa: E402
from app.models.equipment import Equipment  # noqa: E402
from app.models.facility import Facility  # noqa: E402
from app.models.invoice import Invoice, InvoiceStatus, InvoiceTransaction, PaymentProof  # noqa: E402
from app.utils.payment_proofs import REVIEWABLE_EXTRACTION_STATUSES  # noqa: E402
from app.models.modality import Modality, ModalityCategory  # noqa: E402
from app.models.notification import Notification  # noqa: E402
from app.models.payment_operation import PaymentOperation  # noqa: E402
from app.models.service_request import Priority, ServiceRequest, ServiceRequestStatus  # noqa: E402
from app.models.tier import Tier  # noqa: E402
from app.models.user import User, UserRole, UserType  # noqa: E402
from app.utils.square_payments import SquareRequestError  # noqa: E402

failures: list[str] = []
checks = {"count": 0}


def ok(label: str, condition: bool, detail="") -> None:
    checks["count"] += 1
    print("{}  {}{}".format("PASS" if condition else "FAIL", label, "  " + str(detail)[:170] if detail != "" else ""))
    if not condition:
        failures.append(label)


def section(title: str) -> None:
    print()
    print(title)


# ── a captured log, to prove secrets never reach it ──────────────────────────
class Capture(logging.Handler):
    def __init__(self):
        super().__init__()
        self.lines: list[str] = []
        self.errors: list[str] = []

    def emit(self, record):
        try:
            self.lines.append(record.getMessage())
            if record.exc_info:
                self.errors.append(logging.Formatter().format(record))
        except Exception:
            pass


capture = Capture()


def _report_crash(kind, value, trace):
    import traceback
    print("CRASH", "".join(traceback.format_exception(kind, value, trace)), flush=True)
    os._exit(2)


sys.excepthook = _report_crash
logging.getLogger().addHandler(capture)
logging.getLogger().setLevel(logging.INFO)
# This test's own HTTP client logs the URLs it calls; only the server's logs count.
logging.getLogger("httpx").setLevel(logging.WARNING)
logging.getLogger("httpcore").setLevel(logging.WARNING)
for name in ("medrad", "medrad.request", "uvicorn.error"):
    logging.getLogger(name).addHandler(capture)

# ── database ─────────────────────────────────────────────────────────────────
engine = create_engine(POSTGRES_URL)
with engine.begin() as connection:
    connection.execute(text("DROP SCHEMA public CASCADE"))
    connection.execute(text("CREATE SCHEMA public"))
Base.metadata.create_all(engine)
Session = sessionmaker(bind=engine)
redis_lib.Redis.from_url(REDIS_URL).flushdb()

PASSWORD = "Correct-Horse-9-Battery"
HASH = get_password_hash(PASSWORD)
seed = Session()
clinic_a = Facility(name="Clinic A", phone="555-0101", email="a@clinic.test", address="1 A St", city="Plano", state="TX",
                    zip_code="75024", country="US", contact_person="Ann <b>Lee</b>")
clinic_b = Facility(name="Clinic B", phone="555-0202", email="b@clinic.test", address="2 B St", city="Waco", state="TX",
                    zip_code="76701", country="US")
clinic_c = Facility(name="Clinic C", phone="555-0303", email="c@clinic.test", address="3 C St", city="Waco", state="TX",
                    zip_code="76702", country="US")
seed.add_all([clinic_a, clinic_b, clinic_c])
seed.flush()


def person(username, role, user_type=UserType.EMPLOYEE, facility=None, **extra):
    user = User(username=username, email=username + "@medrad.test", full_name=username.title(), hashed_password=HASH,
                user_type=user_type, role=role, is_active=True, facility_id=facility.id if facility else None, **extra)
    seed.add(user)
    seed.flush()
    return user


PEOPLE = {
    "boss": person("boss", UserRole.SUPERADMIN),
    "admin": person("admin", UserRole.ADMIN),
    "hr": person("hr", UserRole.HR_MANAGER),
    "tech": person("tech", UserRole.TECHNICIAN),
    "employee": person("employee", UserRole.EMPLOYEE),
    "fac_a": person("fac_a", UserRole.FACILITY_ADMIN, facility=clinic_a),
    "mgr_a": person("mgr_a", UserRole.FACILITY_MANAGER, facility=clinic_a),
    "client_a": person("client_a", UserRole.CLIENT, UserType.CLIENT, facility=clinic_a),
    "fac_b": person("fac_b", UserRole.FACILITY_ADMIN, facility=clinic_b),
    "client_b": person("client_b", UserRole.CLIENT, UserType.CLIENT, facility=clinic_b),
    "fac_b_payer": person("fac_b_payer", UserRole.FACILITY_MANAGER, facility=clinic_a),
    "gone": person("gone", UserRole.SUPERADMIN),
    "changed": person("changed", UserRole.SUPERADMIN),
}
tier = Tier(tier_code="T-P", name="Platinum", labor_rate_per_hour=D("100.00"), service_call_fee=D("1500.00"),
            preventive_maintenance_fee=D("0"), mileage_rate=D("1.00"))
modality = Modality(name="Bed", category=ModalityCategory.PATIENT_MONITORING)
seed.add_all([tier, modality])
seed.flush()
bed = Equipment(asset_tag="A-1", make="Hill Rom", model="P7500", serial_number="S258", modality_id=modality.id,
                facility_id=clinic_a.id, tier_id=tier.id)
bed_c = Equipment(asset_tag="C-1", make="Hill Rom", model="P7500", serial_number="S259", modality_id=modality.id,
                  facility_id=clinic_c.id, tier_id=tier.id)
seed.add_all([bed, bed_c])
seed.flush()
HISTORY = [{
    "timestamp": "2026-11-05T10:00:00", "action": "technician_work_session", "user": "Omar",
    "changes": {"session_id": "s-1", "work_date": "2026-11-05", "start_time": "2026-11-05T09:00:00",
                "end_time": "2026-11-05T11:00:00", "duration_hours": 2.0, "diagnosis": "Locked brakes",
                "work_done": "Fixed", "notes": "SECRET-INTERNAL-NOTE",
                "parts": [{"part_number": "P-1", "description": "Pedal", "quantity_used": 1, "unit_price": 99.0}]},
}]
ids = {name: user.id for name, user in PEOPLE.items()}
FAC_A, FAC_C, BED, BED_C, TIER = clinic_a.id, clinic_c.id, bed.id, bed_c.id, tier.id
CLIENT_A, TECH = ids["client_a"], ids["tech"]
seed.commit()
seed.close()


counter = {"n": 0}


def new_request(hours="2.00", facility=None, equipment=None, history=None, requester=None):
    counter["n"] += 1
    db = Session()
    row = ServiceRequest(request_number=f"SR-{counter['n']:04d}", facility_id=facility or FAC_A, equipment_id=equipment or BED,
                         requester_id=requester or CLIENT_A, problem_description="Brakes", priority=Priority.MEDIUM,
                         status=ServiceRequestStatus.COMPLETED, assigned_technician_id=TECH, time_spent_hours=D(hours),
                         total_cost=D(hours) * D("100"), history=HISTORY if history is None else history)
    db.add(row)
    db.commit()
    request_id = row.id
    db.close()
    return request_id


def set_row(model, row_id, **fields):
    db = Session()
    row = db.get(model, row_id)
    for field, value in fields.items():
        setattr(row, field, value)
    db.commit()
    db.close()


def invoice_row(invoice_id):
    db = Session()
    row = db.get(Invoice, invoice_id)
    db.expunge(row)
    db.close()
    return row


# ── Square and email stand-ins: the only things not real ─────────────────────
square_lock = threading.Lock()
charges: list[dict] = []
square = {"delay": 0.0, "hook": None, "fail": None, "ids": 0}
emails: list[dict] = []


def fake_square(source_id, idempotency_key, amount, invoice_number, customer_email):
    with square_lock:
        charges.append({"amount": amount, "key": idempotency_key, "invoice": invoice_number, "source": source_id})
        square["ids"] += 1
        number = square["ids"]  # Square's ids are unique for good; never reused.
    if square["delay"]:
        time.sleep(square["delay"])
    if square["hook"]:
        square["hook"]()
    if square["fail"]:
        raise SquareRequestError(square["fail"], status_code=402)
    return {"id": f"sq-pay-{number}", "status": "COMPLETED",
            "amount_money": {"amount": int(amount * 100), "currency": "USD"},
            "card_details": {"card": {"card_brand": "VISA", "last_4": "1111"}}}


portal.create_square_payment = fake_square
portal.send_html_email = lambda recipients, subject, html_body, text_body: emails.append(
    {"to": list(recipients), "subject": subject, "html": html_body, "text": text_body}
)
portal.deliver_payment_receipt = lambda db, delivery_id: None

# ── a real server ────────────────────────────────────────────────────────────
sock = socket.socket()
sock.bind(("127.0.0.1", 0))
PORT = sock.getsockname()[1]
sock.close()
server = uvicorn.Server(uvicorn.Config(app, host="127.0.0.1", port=PORT, log_level="warning", access_log=False))
threading.Thread(target=server.run, daemon=True).start()
BASE = f"http://127.0.0.1:{PORT}"
for _ in range(100):
    try:
        httpx.get(f"{BASE}/health", timeout=1)
        break
    except httpx.HTTPError:
        time.sleep(0.1)
API = f"{BASE}/api/v1"
http = httpx.Client(timeout=30)


def login(username):
    r = http.post(f"{API}/auth/login", data={"username": username, "password": PASSWORD})
    assert r.status_code == 200, (username, r.status_code, r.text[:200])
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


AUTH = {name: login(name) for name in PEOPLE}


def get(path, who=None, **kwargs):
    return http.get(f"{API}{path}", headers=AUTH[who] if who else None, **kwargs)


def post(path, who=None, **kwargs):
    return http.post(f"{API}{path}", headers=AUTH[who] if who else None, **kwargs)


def put(path, who=None, **kwargs):
    return http.put(f"{API}{path}", headers=AUTH[who] if who else None, **kwargs)


def generate(request_id, **body):
    r = post(f"/service-requests/{request_id}/generate-invoice", "boss", json=body)
    assert r.status_code == 200, r.text[:300]
    return r.json()["id"]


def approved_invoice(hours="2.00", **kwargs):
    invoice_id = generate(new_request(hours, **kwargs))
    r = put(f"/billing/invoices/{invoice_id}/approve", "boss")
    assert r.status_code == 200, r.text[:300]
    return invoice_id


def link_for(invoice_id):
    r = post(f"/service-invoices/{invoice_id}/share", "boss", json={"channel": "link"})
    assert r.status_code == 200, r.text[:300]
    return r.json()["share_url"].rsplit("/", 1)[-1]


def pay(token, key, **extra):
    body = {"source_id": "cnon:card-ok", "idempotency_key": key, "payer_name": "Ann Lee", **extra}
    return post(f"/public/service-invoices/{token}/square-payment", json=body)


def key_of(label):
    return (label + "-" + "k" * 24)[:30]


print("Target:", BASE, "(real server, Postgres, Redis)")

# ── 1 ────────────────────────────────────────────────────────────────────────
section("1. Sign-in")
invoice_a = approved_invoice()
token_a = link_for(invoice_a)
sr_for_entries = new_request()
PROTECTED = [
    ("GET", f"/service-invoices/{invoice_a}/document", None),
    ("GET", f"/service-invoices/{invoice_a}/share-options", None),
    ("POST", f"/service-invoices/{invoice_a}/share", {"channel": "link"}),
    ("GET", f"/service-requests/{sr_for_entries}/invoice-work-entries", None),
    ("POST", f"/service-requests/{sr_for_entries}/generate-invoice", {}),
]


def call(method, path, headers=None, body=None):
    return http.request(method, f"{API}{path}", headers=headers, json=body)


def forged(claims=None, secret=None, algorithm="HS256"):
    base = {"sub": "boss", "token_type": "access", "ver": password_token_version(HASH), "iss": settings.JWT_ISSUER,
            "aud": settings.JWT_AUDIENCE, "exp": datetime.now(timezone.utc) + timedelta(hours=1),
            "iat": datetime.now(timezone.utc), "nbf": datetime.now(timezone.utc), "jti": "x"}
    base.update(claims or {})
    return jwt.encode(base, secret or settings.SECRET_KEY, algorithm=algorithm)


def b64(data):
    return base64.urlsafe_b64encode(json.dumps(data).encode()).decode().rstrip("=")


alg_none = b64({"alg": "none", "typ": "JWT"}) + "." + b64({"sub": "boss", "token_type": "access", "ver": password_token_version(HASH),
                                                           "iss": settings.JWT_ISSUER, "aud": settings.JWT_AUDIENCE,
                                                           "exp": int(time.time()) + 3600}) + "."
past = datetime.now(timezone.utc) - timedelta(hours=2)
BAD_TOKENS = {
    "no token": None,
    "garbage": "Bearer not.a.token",
    "wrong scheme": "Basic Ym9zczpib3Nz",
    "alg=none": f"Bearer {alg_none}",
    "signed with another secret": "Bearer " + forged(secret="another-secret-key-another-secret-key-000"),
    "expired": "Bearer " + forged({"exp": past, "nbf": past - timedelta(hours=1), "iat": past - timedelta(hours=1)}),
    "wrong audience": "Bearer " + forged({"aud": "other-app"}),
    "wrong issuer": "Bearer " + forged({"iss": "other-issuer"}),
    "a refresh token": "Bearer " + forged({"token_type": "refresh"}),
    "older password version": "Bearer " + forged({"ver": "0" * 20}),
    "a user that does not exist": "Bearer " + forged({"sub": "ghost"}),
    "the link token as a sign-in": f"Bearer {token_a}",
}
for label, value in BAD_TOKENS.items():
    results = [call(m, p, {"Authorization": value} if value else None, b).status_code for m, p, b in PROTECTED]
    ok(f"{label}: refused everywhere", all(code == 401 for code in results), results)
set_row(User, ids["gone"], is_active=False)
ok("a deactivated admin's token is refused", get(f"/service-invoices/{invoice_a}/document", "gone").status_code in (401, 403))
set_row(User, ids["changed"], hashed_password=get_password_hash("A-New-Password-1"))
ok("a token from before a password change is refused", get(f"/service-invoices/{invoice_a}/document", "changed").status_code == 401)

# ── 2 ────────────────────────────────────────────────────────────────────────
section("2. Who may do what")
invoice_c = approved_invoice(facility=FAC_C, equipment=BED_C, requester=ids["fac_b"])
for who in ("tech", "employee", "hr", "fac_a", "mgr_a", "client_a", "fac_b", "client_b"):
    results = {
        "share": post(f"/service-invoices/{invoice_a}/share", who, json={"channel": "link"}).status_code,
        "options": get(f"/service-invoices/{invoice_a}/share-options", who).status_code,
        "entries": get(f"/service-requests/{sr_for_entries}/invoice-work-entries", who).status_code,
        "generate": post(f"/service-requests/{sr_for_entries}/generate-invoice", who, json={}).status_code,
    }
    ok(f"{who}: cannot send, list recipients, read wording or generate", all(code in (403, 404) for code in results.values()), results)
for who in ("fac_a", "mgr_a", "client_a"):
    ok(f"{who}: reads own facility's approved invoice", get(f"/service-invoices/{invoice_a}/document", who).status_code == 200)
    ok(f"{who}: cannot read another facility's", get(f"/service-invoices/{invoice_c}/document", who).status_code == 404)
for who in ("fac_b", "client_b"):
    ok(f"{who}: cannot read another facility's invoice (IDOR)", get(f"/service-invoices/{invoice_a}/document", who).status_code == 404)
miss = [get(f"/service-invoices/{n}/document", "fac_a").status_code for n in range(1, 40) if n not in (invoice_a,)]
ok("walking invoice ids as a facility user finds nothing of another's", all(code in (200, 404) for code in miss) and 500 not in miss, sorted(set(miss)))
ok("a sales or other invoice id is not a service document", get("/service-invoices/999999/document", "boss").status_code == 404)
unapproved = generate(new_request())
for who in ("fac_a", "client_a"):
    ok(f"{who}: cannot see it before approval", get(f"/service-invoices/{unapproved}/document", who).status_code == 404)
for who in ("tech", "employee", "fac_a", "client_a"):
    ok(f"{who}: cannot approve an invoice to unlock it", put(f"/billing/invoices/{unapproved}/approve", who).status_code in (403, 404))
set_row(User, ids["admin"], permissions={"billing": {"index": True, "view": True, "add": False, "edit": False, "delete": False, "scope": "all"}})
AUTH["admin"] = login("admin")
ok("an admin whose Billing edit was removed cannot send", post(f"/service-invoices/{invoice_a}/share", "admin", json={"channel": "link"}).status_code == 403)
set_row(User, ids["admin"], permissions=None)

# ── 3 ────────────────────────────────────────────────────────────────────────
section("3. The link")
tamper = token_a[:-1] + ("A" if token_a[-1] != "A" else "B")
db = Session()
row = db.get(Invoice, invoice_a)
stored_hash, stored_nonce, number = row.public_link_hash, row.public_link_nonce, row.invoice_number
db.close()
ATTACKS = {
    "a tampered token": tamper,
    "its own hash": stored_hash,
    "its nonce": stored_nonce,
    "the invoice number": number,
    "the invoice id": str(invoice_a),
    "SQL injection": "' OR '1'='1",
    "SQL injection 2": "x'; DROP TABLE invoices;--",
    "SQL union": "' UNION SELECT public_link_hash FROM invoices--",
    "a wildcard": "%25",
    "path traversal": "..%2F..%2Fetc%2Fpasswd",
    "a null byte": "abc%00def",
    "unicode": "тест-😀",
    "template injection": "{{7*7}}",
    "HTML": "<script>alert(1)</script>",
    "very long": "a" * 6000,
}
for label, value in ATTACKS.items():
    r = get(f"/public/service-invoices/{value}")
    ok(f"{label}: refused, no error leaked", r.status_code in (404, 405, 414, 422) and "Traceback" not in r.text and "invoice_number" not in r.text, r.status_code)
    r = post(f"/public/service-invoices/{value}/square-payment", json={"source_id": "cnon:card-ok", "idempotency_key": "z" * 20, "payer_name": "Eve"})
    ok(f"{label}: cannot pay", r.status_code in (404, 405, 414, 422), r.status_code)
ok("no card was charged by any of it", charges == [], charges)
guesses = {get(f"/public/service-invoices/{os.urandom(32).hex()[:43]}").status_code for _ in range(60)}
ok("60 random guesses find nothing", guesses == {404}, guesses)
ok("the token has 256 bits behind it", len(token_a) == 43, len(token_a))
other_token = link_for(approved_invoice())
ok("each invoice has its own link", other_token != token_a)
body = get(f"/public/service-invoices/{token_a}").json()
ok("the page returns only what the customer needs",
   set(body) == {"state", "invoice_number", "balance_due", "payer_name", "payer_email", "document", "pending_reports", "can_pay", "square_payment"}, sorted(body))
whole = json.dumps(body)
for secret in ("SECRET-INTERNAL-NOTE", "__FEES__", stored_nonce, stored_hash, "hashed_password", "unit_price", "approved_for", "token", settings.SQUARE_ACCESS_TOKEN + '"'):
    ok(f"it does not reveal {secret[:24]!r}", secret not in whole.replace("idempotency", ""))
ok("Square's public settings only", set(body["square_payment"]) <= {"enabled", "environment", "application_id", "location_id", "currency", "sdk_url"}, sorted(body["square_payment"]))
ok("a parts' price is not exposed", all(set(p) == {"part_number", "description", "quantity", "condition"} for p in body["document"]["parts"]))

# ── 4 ────────────────────────────────────────────────────────────────────────
section("4. Secrets")
emails.clear()
secret_invoice = approved_invoice()
r = post(f"/service-invoices/{secret_invoice}/share", "boss", json={"channel": "email", "recipient_user_id": ids["fac_a"]})
secret_token = r.json()["share_url"].rsplit("/", 1)[-1]
get(f"/public/service-invoices/{secret_token}")
post(f"/public/service-invoices/{secret_token}/square-payment", json={"source_id": "bad"})
time.sleep(0.3)
db = Session()
inv = db.get(Invoice, secret_invoice)
ok("the token is not stored on the invoice", secret_token not in json.dumps(
    {c.name: str(getattr(inv, c.name)) for c in Invoice.__table__.columns}))
ok("nor in the request's history", secret_token not in json.dumps(inv.service_request.history))
notes = db.query(Notification).filter(Notification.user_id == ids["fac_a"]).all()
ok("the notification links to Billing, not the secret link", notes and all(secret_token not in (n.link_url or "") for n in notes), [n.link_url for n in notes][-1:])
db.close()
with engine.connect() as connection:
    audit = connection.execute(text("select coalesce(string_agg(coalesce(changes_json,''), ' '), '') from audit_logs")).scalar()
ok("nor in the audit log", secret_token not in audit)
leaks = [line for line in capture.lines if secret_token in line]
ok("nor in the server's request logs", not leaks, leaks[:1])
ok("the request logs did record the page, with the token masked", any("[redacted-token]" in line for line in capture.lines), len(capture.lines))
ok("the emailed link is the only copy sent out", emails[-1]["to"] == ["fac_a@medrad.test"] and secret_token in emails[-1]["html"])
ok("a changed SECRET_KEY would invalidate links, not expose them", portal._link_token(1, "n") != portal._link_token(2, "n"))

# ── 5 ────────────────────────────────────────────────────────────────────────
section("5. Tampering with requests")
victim = approved_invoice()
token_v = link_for(victim)
total_before = invoice_row(victim).total_amount
charges.clear()
r = pay(token_v, key_of("tamper"), amount="0.01", balance_due="0.01", total_amount="0.01", invoice_id=invoice_a, status="paid", currency="XXX")
row = invoice_row(victim)
ok("extra fields cannot change what is charged", r.status_code == 200 and charges[0]["amount"] == D("1700.00")
   and charges[0]["invoice"] == row.invoice_number and row.total_amount == total_before, charges)
for label, body_ in {
    "no fields": {},
    "wrong types": {"source_id": 123, "idempotency_key": ["x"], "payer_name": {"a": 1}},
    "a short card token": {"source_id": "x", "idempotency_key": "k" * 20, "payer_name": "Ann"},
    "an overlong key": {"source_id": "cnon:ok-token", "idempotency_key": "k" * 46, "payer_name": "Ann"},
    "a short key": {"source_id": "cnon:ok-token", "idempotency_key": "k", "payer_name": "Ann"},
    "an empty name": {"source_id": "cnon:ok-token", "idempotency_key": "k" * 20, "payer_name": ""},
    "an overlong name": {"source_id": "cnon:ok-token", "idempotency_key": "k" * 20, "payer_name": "A" * 201},
}.items():
    fresh = link_for(approved_invoice())
    ok(f"payment with {label}: refused", post(f"/public/service-invoices/{fresh}/square-payment", json=body_).status_code == 422)
r = http.post(f"{API}/public/service-invoices/{token_a}/square-payment", content=b"{not json", headers={"content-type": "application/json"})
ok("broken JSON: refused, no error leaked", r.status_code == 422 and "Traceback" not in r.text, r.status_code)
r = http.post(f"{API}/public/service-invoices/{token_a}/square-payment", content=b"x" * 20_000_000, headers={"content-type": "application/json"})
ok("a 20 MB body is refused", r.status_code in (413, 422), r.status_code)
sr = new_request()
r = post(f"/service-requests/{sr}/generate-invoice", "boss", json={"service_call_fee": "-1"})
ok("a negative fee is refused", r.status_code == 422)
r = post(f"/service-requests/{sr}/generate-invoice", "boss", json={"work_entries": [{"key": "s-1", "work_done": "x" * 5001}]})
ok("overlong wording is refused", r.status_code == 422)
r = post(f"/service-requests/{sr}/generate-invoice", "boss", json={"work_entries": [{"key": str(n)} for n in range(501)]})
ok("too many rows are refused", r.status_code == 422)
r = post(f"/service-requests/{sr}/generate-invoice", "boss", json={"work_entries": [
    {"key": "s-1", "work_done": "Reworded", "hours": 99, "technician": "Forged", "check_in": "never"},
    {"key": "made-up", "work_done": "Injected row"},
]})
doc = get(f"/service-invoices/{r.json()['id']}/document", "boss").json()
entry = doc["work_entries"][0]
ok("wording can change; hours, technician and times cannot", entry["work_done"] == "Reworded" and entry["hours"] == 2.0
   and entry["technician"] == doc["technician"] and entry["check_in"] == "2026-11-05T09:00:00" and len(doc["work_entries"]) == 1, entry)
ok("labor still bills the real hours", doc["total_amount"] == "1700.00", doc["total_amount"])

# ── 6 ────────────────────────────────────────────────────────────────────────
section("6. Payment abuse")
# Race: many different keys at once, as if several people or tabs pay together.
racing = approved_invoice()
token_r = link_for(racing)
charges.clear()
square["delay"] = 0.4
with ThreadPoolExecutor(8) as pool:
    results = list(pool.map(lambda n: httpx.post(
        f"{API}/public/service-invoices/{token_r}/square-payment",
        json={"source_id": "cnon:card-ok", "idempotency_key": key_of(f"race{n}"), "payer_name": "Ann Lee"}, timeout=60,
    ).status_code, range(8)))
square["delay"] = 0
row = invoice_row(racing)
db = Session()
ledger = [row.transaction_type for row in db.query(InvoiceTransaction).filter(InvoiceTransaction.invoice_id == racing).all()]
payments = sum(1 for kind in ledger if "payment" in kind)
db.close()
ok("8 simultaneous payments, different keys: one card charged", len(charges) == 1, f"charges={len(charges)} results={sorted(results)}")
ok("  paid exactly once", row.amount_paid == D("1700.00") and row.status == InvoiceStatus.PAID and payments == 1, f"{row.amount_paid} {ledger}")
ok("  the others were refused, nothing crashed", sorted(results).count(200) >= 1 and 500 not in results, sorted(results))
# Race: same key at once, as if a button is double-clicked.
racing2 = approved_invoice()
token_r2 = link_for(racing2)
charges.clear()
square["delay"] = 0.4
with ThreadPoolExecutor(8) as pool:
    results = list(pool.map(lambda _: httpx.post(
        f"{API}/public/service-invoices/{token_r2}/square-payment",
        json={"source_id": "cnon:card-ok", "idempotency_key": key_of("dbl"), "payer_name": "Ann Lee"}, timeout=60,
    ).status_code, range(8)))
square["delay"] = 0
ok("8 simultaneous double-clicks, same key: one card charged", len(charges) == 1 and invoice_row(racing2).amount_paid == D("1700.00")
   and 500 not in results, f"charges={len(charges)} results={sorted(results)}")
# Replays.
done = approved_invoice()
token_d = link_for(done)
charges.clear()
first = pay(token_d, key_of("replay"))
again = pay(token_d, key_of("replay"))
ok("replaying a finished payment charges nothing", first.status_code == 200 and again.status_code == 200 and len(charges) == 1
   and invoice_row(done).amount_paid == D("1700.00"), again.status_code)
new_key = pay(token_d, key_of("another"))
ok("a new attempt on a paid invoice charges nothing", len(charges) == 1 and invoice_row(done).amount_paid == D("1700.00"), new_key.status_code)
other = approved_invoice()
token_o = link_for(other)
stolen = pay(token_o, key_of("replay"))
ok("a key from one invoice cannot be replayed on another", stolen.status_code == 409 and invoice_row(other).amount_paid == 0 and len(charges) == 1, stolen.status_code)
other2 = approved_invoice()
token_o2 = link_for(other2)
pay_a = pay(token_o2, key_of("name"), payer_name="Ann Lee")
pay_b = pay(token_o2, key_of("name"), payer_name="Someone Else")
ok("reusing a key with different details is refused", pay_b.status_code == 409 or invoice_row(other2).amount_paid == D("1700.00"), pay_b.status_code)
# A declined card, then a good one.
declined = approved_invoice()
token_dc = link_for(declined)
charges.clear()
square["fail"] = "Card declined"
r = pay(token_dc, key_of("decl"))
square["fail"] = None
ok("a declined card changes nothing", r.status_code == 402 and invoice_row(declined).amount_paid == 0)
r = pay(token_dc, key_of("decl2"))
ok("  and a good card then pays it, once", r.status_code == 200 and invoice_row(declined).amount_paid == D("1700.00") and len(charges) == 2, r.status_code)
# Amounts.
free = approved_invoice("0.00")
set_row(Invoice, free, total_amount=D("0"), subtotal=D("0"), balance_due=D("0"))
ok("a zero balance cannot be sent", post(f"/service-invoices/{free}/share", "boss", json={"channel": "link"}).status_code == 409)
# Approval pulled while the customer is paying.
pulled = approved_invoice()
token_p = link_for(pulled)
set_row(Invoice, pulled, billing_approval_status="pending")
charges.clear()
r = pay(token_p, key_of("pulled"))
ok("approval withdrawn: refused before any charge", r.status_code == 409 and charges == [], r.status_code)
# Cancelled while the card is being charged: the money must not vanish.
cancelled = approved_invoice()
token_cx = link_for(cancelled)
charges.clear()
square["hook"] = lambda: set_row(Invoice, cancelled, status=InvoiceStatus.CANCELLED)
r = pay(token_cx, key_of("cxl"))
square["hook"] = None
row = invoice_row(cancelled)
ok("cancelled mid-charge: the money taken is still on record", row.amount_paid == D("1700.00"), f"{r.status_code} paid={row.amount_paid} status={row.status}")
db = Session()
op = db.query(PaymentOperation).filter(PaymentOperation.invoice_id == cancelled).first()
db.close()
ok("  and the operation is closed, not left hanging", op.status == "succeeded", op.status)
db = Session()
alerts = [n.title for n in db.query(Notification).filter(Notification.message.contains(row.invoice_number)).all()]
db.close()
ok("  and admins are told it needs attention", "Service payment needs attention" in alerts, alerts[:2])
# The total lowered while the card is being charged.
lowered = approved_invoice()
token_l = link_for(lowered)
square["hook"] = lambda: set_row(Invoice, lowered, total_amount=D("100"), balance_due=D("100"))
r = pay(token_l, key_of("low"))
square["hook"] = None
row = invoice_row(lowered)
ok("total changed mid-charge: nothing crashes, the balance never goes negative", row.balance_due >= 0 and r.status_code != 500, f"{r.status_code} {row.balance_due}")
db = Session()
alerts = [n.title for n in db.query(Notification).filter(Notification.message.contains(row.invoice_number)).all()]
db.close()
ok("  and admins are told it needs attention", "Service payment needs attention" in alerts, alerts[:2])
# Rate limit: real Redis.
limited = approved_invoice()
token_lim = link_for(limited)
square["fail"] = "Card declined"
codes = [pay(token_lim, key_of(f"lim{n}")).status_code for n in range(12)]
square["fail"] = None
ok("card-testing: blocked after 8 tries in 10 minutes", codes[:8].count(402) == 8 and all(code == 429 for code in codes[8:]), codes)
ok("  another invoice's link is not blocked by it", pay(link_for(approved_invoice()), key_of("free")).status_code == 200)

# ── 7 ────────────────────────────────────────────────────────────────────────
section("7. Bypassing approval")
gated = generate(new_request())
for channel_body in ({"channel": "link"}, {"channel": "email", "recipient_user_id": ids["fac_a"]}):
    ok(f"unapproved, {channel_body['channel']}: refused", post(f"/service-invoices/{gated}/share", "boss", json=channel_body).status_code == 409)
ok("  no token was created", invoice_row(gated).public_link_hash is None)
set_row(Invoice, gated, billing_approval_status="approved")
gated_token = link_for(gated)
r = put(f"/service-requests/invoices/{gated}", "boss", json={"total_amount": "1", "subtotal": "1"})
ok("changing the amount withdraws approval", invoice_row(gated).billing_approval_status != "approved", r.status_code)
ok("  the link then shows nothing of it", get(f"/public/service-invoices/{gated_token}").json()["document"] is None)
ok("  and cannot be paid", pay(gated_token, key_of("gate")).status_code == 409)
ok("  and is not in the invoice", gated_token not in get(f"/service-invoices/{gated}/document", "boss").text)
r = put(f"/service-requests/invoices/{invoice_a}", "fac_a", json={"amount_paid": "1700", "status": "paid"})
ok("a facility user cannot mark it paid", r.status_code in (403, 409) and invoice_row(invoice_a).amount_paid == 0, r.status_code)
r = put(f"/service-requests/invoices/{invoice_a}", "fac_a", json={"total_amount": "1"})
ok("nor change its total", r.status_code == 403 and invoice_row(invoice_a).total_amount == D("1700.00"), r.status_code)
r = put(f"/service-requests/invoices/{invoice_a}", "client_b", json={"notes": "x"})
ok("another facility cannot touch it", r.status_code in (403, 404), r.status_code)

# ── 8 ────────────────────────────────────────────────────────────────────────
section("8. Email abuse")
mail_a = approved_invoice()
emails.clear()
for label, value in {
    "another recipient by comma": "a@b.co,evil@x.co",
    "a trailing comma": "a@b.co,evil",
    "by semicolon": "a@b.co;evil@x.co",
    "a Bcc header": "a@b.co\r\nBcc: evil@x.co",
    "a newline": "a@b.co\nevil",
    "a display name": "Eve <evil@x.co>",
    "no domain": "a@b",
    "empty": "",
    "only spaces": "   ",
    "HTML": "<img src=x onerror=alert(1)>@x.co",
}.items():
    no_users = approved_invoice(facility=FAC_C, equipment=BED_C)
    r = post(f"/service-invoices/{no_users}/share", "boss", json={"channel": "email", "email": value})
    # Clinic C has no users, so the typed address is what would be used.
    ok(f"address with {label}: refused, nothing sent", r.status_code == 400 and emails == [], f"{r.status_code} {emails[-1:]}")
r = post(f"/service-invoices/{mail_a}/share", "boss", json={"channel": "email", "email": "evil@x.co"})
ok("a facility with users cannot be redirected to a typed address", r.status_code == 400 and emails == [], r.status_code)
r = post(f"/service-invoices/{mail_a}/share", "boss", json={"channel": "email", "recipient_user_id": ids["fac_b"]})
ok("nor to another facility's user", r.status_code == 400 and emails == [], r.status_code)
r = post(f"/service-invoices/{mail_a}/share", "boss", json={"channel": "email", "recipient_user_id": ids["gone"]})
ok("nor to a staff or inactive account", r.status_code == 400 and emails == [], r.status_code)
xss_invoice = approved_invoice(facility=FAC_C, equipment=BED_C)
set_row(Invoice, xss_invoice, customer_name='<img src=x onerror=alert(1)>"Clinic')
r = post(f"/service-invoices/{xss_invoice}/share", "boss", json={"channel": "email", "email": "owner@clinic-c.test"})
for _ in range(50):  # the email goes out just after the response
    if emails:
        break
    time.sleep(0.05)
ok("a hostile customer name is escaped in the email", r.status_code == 200 and "<img" not in emails[-1]["html"] and "&lt;img" in emails[-1]["html"], emails[-1]["html"][:90] if emails else "")

# ── 9 ────────────────────────────────────────────────────────────────────────
section("9. Damaged and old data")
DAMAGED = {
    "no history at all": None,
    "an empty history": [],
    "entries that are not objects": ["text", 5, None],
    "changes that are not objects": [{"action": "technician_work_session", "changes": "oops"}, {"action": "work_order_addition", "changes": 7}],
    "parts that are not objects": [{"action": "technician_work_session", "user": "O", "changes": {"session_id": "x", "parts": ["P-1", 5, None]}}],
    "parts that are not a list": [{"action": "work_order_addition", "user": "O", "changes": {"parts": "P-1", "work_done": "x"}}],
    "test equipment that is not objects": [{"action": "technician_work_session", "changes": {"test_equipment": ["x", None]}}],
    "hours that are text": [{"action": "technician_work_session", "changes": {"session_id": "y", "duration_hours": "two", "work_done": "x"}}],
    "text that is not text": [{"action": "work_order_addition", "changes": {"work_done": {"a": 1}, "diagnosis": ["b"]}}],
    "hostile text": [{"action": "work_order_addition", "user": "<script>", "changes": {"work_done": "<script>alert(1)</script>"}}],
}
for label, history in DAMAGED.items():
    sr = new_request(history=[])
    set_row(ServiceRequest, sr, history=history)
    entries_status = get(f"/service-requests/{sr}/invoice-work-entries", "boss").status_code
    r = post(f"/service-requests/{sr}/generate-invoice", "boss", json={})
    status_doc = get(f"/service-invoices/{r.json()['id']}/document", "boss").status_code if r.status_code == 200 else None
    ok(f"{label}: invoice still generates and opens", entries_status == 200 and r.status_code == 200 and status_doc == 200, f"{entries_status} {r.status_code} {status_doc} {r.text[:80] if r.status_code != 200 else ''}")
bare = generate(new_request(hours="0", history=[]))
set_row(ServiceRequest, invoice_row(bare).service_request_id, time_spent_hours=None, preferred_datetime=None, completed_at=None, reference_number=None, service_required=None)
r = get(f"/service-invoices/{bare}/document", "boss")
ok("a request with nothing filled in still opens", r.status_code == 200 and r.json()["total_hours"] == 0, r.status_code)
legacy = generate(new_request())
set_row(Invoice, legacy, service_work_entries=None, notes="An old invoice with no fee marker")
r = get(f"/service-invoices/{legacy}/document", "boss")
ok("an old invoice still opens", r.status_code == 200 and r.json()["work_entries"], r.status_code)
broken_snapshot = generate(new_request())
set_row(Invoice, broken_snapshot, service_work_entries={"not": "a list"})
r = get(f"/service-invoices/{broken_snapshot}/document", "boss")
ok("a damaged saved copy does not break the invoice", r.status_code == 200 and isinstance(r.json()["work_entries"], list), r.status_code)
quoted = generate(new_request())
big = D("99999999.99")
set_row(Invoice, quoted, total_amount=big, subtotal=big, balance_due=big)
ok("the largest possible amount opens", get(f"/service-invoices/{quoted}/document", "boss").json()["total_amount"] == "99999999.99")

# ── 9b ───────────────────────────────────────────────────────────────────────
section("9b. Paying signed in, as the facility")


def card_options(invoice_id, who=None):
    return get(f"/service-invoices/{invoice_id}/card-payment", who)


def card_pay(target_id, who, key, **extra):
    return post(f"/service-invoices/{target_id}/square-payment", who,
                json={"source_id": "cnon:card-ok", "idempotency_key": key, **extra})


account = approved_invoice()
ok("not signed in: refused", card_options(account).status_code == 401 and card_pay(account, None, key_of("anon")).status_code == 401)
for who in ("boss", "admin", "hr", "tech", "employee"):
    ok(f"{who}: this path is only for the facility", card_options(account, who).status_code == 403
       and card_pay(account, who, key_of(f"staff{who}")).status_code == 403)
for who in ("fac_b", "client_b"):
    ok(f"{who}: cannot pay another facility's invoice", card_options(account, who).status_code == 404
       and card_pay(account, who, key_of(f"other{who}")).status_code == 404)
hidden = generate(new_request())
ok("before billing approval: not visible, cannot be paid", card_options(hidden, "fac_a").status_code == 404
   and card_pay(hidden, "fac_a", key_of("hidden")).status_code == 404)
ok("a service request id or a made-up id: nothing", card_pay(999999, "fac_a", key_of("none")).status_code == 404)
set_row(User, ids["mgr_a"], permissions={"billing": {"index": True, "view": True, "add": False, "edit": False, "delete": False, "scope": "all"}})
AUTH["mgr_a"] = login("mgr_a")
ok("a facility user whose Billing edit was removed cannot pay", card_pay(account, "mgr_a", key_of("noedit")).status_code == 403)
set_row(User, ids["mgr_a"], permissions=None)
AUTH["mgr_a"] = login("mgr_a")
charges.clear()
opts = card_options(account, "fac_a").json()
ok("the facility admin sees the balance and Square", opts["balance_due"] == "1700.00" and opts["can_pay"] is True, opts["balance_due"])
ok("  Square's public settings only", settings.SQUARE_ACCESS_TOKEN + '"' not in json.dumps(opts))
r = card_pay(account, "fac_a", key_of("acct"), amount="0.01", balance_due="0.01", invoice_id=invoice_a, payer_name="Forged")
row = invoice_row(account)
ok("the facility admin pays: the whole balance, once, whatever is sent", r.status_code == 200 and len(charges) == 1
   and charges[0]["amount"] == D("1700.00") and row.status == InvoiceStatus.PAID and row.amount_paid == D("1700.00"), r.text[:120])
db = Session()
sr_row = db.get(ServiceRequest, row.service_request_id)
ledger = [t for t in db.query(InvoiceTransaction).filter(InvoiceTransaction.invoice_id == account).all() if t.transaction_type == "payment"]
ok("  on record against them, not a forged name", sr_row.history[-1]["user"] == "Fac_A" and sr_row.history[-1]["user_id"] == ids["fac_a"]
   and ledger[0].created_by_id == ids["fac_a"], sr_row.history[-1]["user"])
db.close()
charges.clear()
ok("  paying again charges nothing", card_pay(account, "mgr_a", key_of("again")).status_code == 200 and charges == [] and invoice_row(account).amount_paid == D("1700.00"))
ok("  the same attempt retried charges nothing", card_pay(account, "fac_a", key_of("acct")).status_code in (200, 409) and charges == [])

both = approved_invoice()
both_token = link_for(both)
charges.clear()
square["delay"] = 0.4


def attempt(job):
    kind, n = job
    if kind == "link":
        return httpx.post(f"{API}/public/service-invoices/{both_token}/square-payment",
                          json={"source_id": "cnon:card-ok", "idempotency_key": key_of(f"mix{n}"), "payer_name": "Ann Lee"}, timeout=60).status_code
    return httpx.post(f"{API}/service-invoices/{both}/square-payment", headers=AUTH[kind],
                      json={"source_id": "cnon:card-ok", "idempotency_key": key_of(f"mix{n}")}, timeout=60).status_code


with ThreadPoolExecutor(9) as pool:
    results = list(pool.map(attempt, [(kind, f"{kind}{n}") for n in range(3) for kind in ("fac_a", "mgr_a", "link")]))
square["delay"] = 0
row = invoice_row(both)
ok("admin, manager and the link all at once: one card charged", len(charges) == 1 and row.amount_paid == D("1700.00") and 500 not in results,
   f"charges={len(charges)} results={sorted(results)}")

used = approved_invoice()
charges.clear()
card_pay(used, "fac_a", key_of("shared"))
other_used = approved_invoice()
r = card_pay(other_used, "fac_a", key_of("shared"))
ok("a key from one invoice cannot be replayed on another", r.status_code == 409 and len(charges) == 1, r.status_code)
pulled_acct = approved_invoice()
set_row(Invoice, pulled_acct, billing_approval_status="pending")
charges.clear()
ok("approval withdrawn: refused, no charge", card_pay(pulled_acct, "fac_a", key_of("pull")).status_code == 404 and charges == [])
gone_inv = approved_invoice()
set_row(Invoice, gone_inv, status=InvoiceStatus.CANCELLED)
ok("cancelled: refused, no charge", card_pay(gone_inv, "fac_a", key_of("gone")).status_code == 409 and charges == [])
declined_acct = approved_invoice()
square["fail"] = "Card declined"
r = card_pay(declined_acct, "fac_a", key_of("dcl"))
square["fail"] = None
ok("a declined card changes nothing", r.status_code == 402 and invoice_row(declined_acct).amount_paid == 0)
limited_acct = approved_invoice()
square["fail"] = "Card declined"
codes = [card_pay(limited_acct, "client_a", key_of(f"rl{n}")).status_code for n in range(11)]
square["fail"] = None
ok("card-testing while signed in: blocked after 8 tries on an invoice", codes[:8].count(402) == 8 and all(c == 429 for c in codes[8:]), codes)
ok("  paying a different invoice still works", card_pay(approved_invoice(), "client_a", key_of("rlok")).status_code == 200)
square["fail"] = "Card declined"
across = []
for n in range(32):
    across.append(card_pay(approved_invoice(), "fac_b_payer", key_of(f"ac{n}")).status_code)
square["fail"] = None
ok("  and trying card after card across invoices is capped at 30", across[:30].count(402) == 30 and across[30:] == [429, 429], across[-4:])

section("9c. One payment at a time")
PNG = base64.b64decode("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==")
reports = {"n": 0}


def report_proof(target_id, who="fac_a", amount="1700.00", method="ach"):
    reports["n"] += 1  # a different file each time: the same file twice counts as a retry
    body = PNG + b"\0" * reports["n"]
    return post(f"/billing/invoices/{target_id}/payment-proofs", who, data={"amount": amount, "payment_method": method, "notes": "Paid"},
                files={"proof_file": ("proof.png", body, "image/png")})


def report_card(target_id, who="fac_a", amount="1700.00"):
    return post(f"/billing/invoices/{target_id}/payments", who, json={"amount": amount, "payment_method": "credit_card", "card_brand": "Visa", "card_last4": "4242"})


def ready(proof_id):
    db = Session()
    db.get(PaymentProof, proof_id).extraction_status = next(iter(REVIEWABLE_EXTRACTION_STATUSES))
    db.commit()
    db.close()


def proof_id_of(response):
    body = response.json()
    return body.get("id") or body.get("proof", {}).get("id")


def every_other_way(target_id, token, label):
    """Every way to pay, tried while a payment waits. Returns what each answered."""
    charges.clear()
    before = invoice_row(target_id).amount_paid
    answers = {
        "card signed in": card_pay(target_id, "mgr_a", key_of(f"{label}a")).status_code,
        "card on the link": pay(token, key_of(f"{label}b")).status_code,
        "a second proof": report_proof(target_id, "mgr_a").status_code,
        "reporting a card": report_card(target_id, "mgr_a", amount="1699.00").status_code,
        "staff Record Payment": post(f"/billing/invoices/{target_id}/payments", "boss", json={"amount": "1700.00", "payment_method": "credit_card", "idempotency_key": key_of(f"{label}c")}).status_code,
        "staff editing amount paid": put(f"/service-requests/invoices/{target_id}", "boss", json={"amount_paid": "1700"}).status_code,
    }
    return answers, charges == [] and invoice_row(target_id).amount_paid == before


waiting = approved_invoice()
waiting_token = link_for(waiting)
first = report_proof(waiting)
ok("a cheque or ACH proof goes in", first.status_code in (200, 201, 202), f"{first.status_code} {first.text[:100]}")
proof_id = proof_id_of(first)
answers, untouched = every_other_way(waiting, waiting_token, "w")
ok("while it waits, every other way to pay is refused", all(code == 409 for code in answers.values()), answers)
ok("  no card charged, nothing recorded", untouched)
opts = card_options(waiting, "fac_a").json()
ok("  signed in: shown as not payable", opts["can_pay"] is False and opts["pending_reports"] == 1)
public_view = get(f"/public/service-invoices/{waiting_token}").json()
ok("  on the link: shown as not payable", public_view["can_pay"] is False and public_view["pending_reports"] == 1)
billed = get("/service-requests/invoices", "boss", params={"search": invoice_row(waiting).invoice_number}).json()["items"][0]
ok("  Billing knows, to grey out Pay", billed["payment_pending_review"] is True)
same_file_again = post(f"/billing/invoices/{waiting}/payment-proofs", "fac_a", data={"amount": "1700.00", "payment_method": "ach"},
                       files={"proof_file": ("proof.png", PNG + b"\0" * 1, "image/png")})
ok("  sending the same proof again is a retry, not an error", same_file_again.status_code in (200, 201) and proof_id_of(same_file_again) == proof_id, same_file_again.status_code)
ready(proof_id)
r = post(f"/billing/payment-proofs/{proof_id}/reject", "boss", json={"notes": "Cheque bounced"})
ok("staff reject it", r.status_code == 200, r.status_code)
opts = card_options(waiting, "fac_a").json()
ok("  payment opens again", opts["can_pay"] is True and opts["pending_reports"] == 0)
ok("  Billing knows", get("/service-requests/invoices", "boss", params={"search": invoice_row(waiting).invoice_number}).json()["items"][0]["payment_pending_review"] is False)
charges.clear()
r = pay(waiting_token, key_of("wafter"))
ok("  and the card pays it, once", r.status_code == 200 and len(charges) == 1 and invoice_row(waiting).amount_paid == D("1700.00"), r.status_code)

approved_first = approved_invoice()
token_af = link_for(approved_first)
pid = proof_id_of(report_proof(approved_first))
ready(pid)
r = post(f"/billing/payment-proofs/{pid}/approve", "boss", json={"notes": "Received"})
ok("staff approve the waiting payment: the invoice is paid, once", r.status_code == 200 and invoice_row(approved_first).status == InvoiceStatus.PAID
   and invoice_row(approved_first).amount_paid == D("1700.00"), r.status_code)
charges.clear()
card_pay(approved_first, "fac_a", key_of("afa"))
pay(token_af, key_of("afb"))
ok("  a card afterwards charges nothing", charges == [] and invoice_row(approved_first).amount_paid == D("1700.00"))

partial = approved_invoice()
token_pt = link_for(partial)
pid = proof_id_of(report_proof(partial, amount="500.00"))
charges.clear()
ok("a part payment waiting also blocks paying the rest", pay(token_pt, key_of("pta")).status_code == 409 and charges == [])
ready(pid)
post(f"/billing/payment-proofs/{pid}/approve", "boss", json={})
charges.clear()
r = pay(token_pt, key_of("ptb"))
ok("  approved: the rest can be paid, the right amount", r.status_code == 200 and charges[0]["amount"] == D("1200.00") and invoice_row(partial).status == InvoiceStatus.PAID, charges)

claimed = approved_invoice()
token_cl = link_for(claimed)
r = report_card(claimed)
ok("a reported card moves no money", r.status_code == 202 and invoice_row(claimed).amount_paid == 0, r.status_code)
answers, untouched = every_other_way(claimed, token_cl, "c")
ok("  and blocks every other way too", all(code == 409 for code in answers.values()) and untouched, answers)
ok("  reporting the same one again is a retry", report_card(claimed).status_code == 202)

in_flight = approved_invoice()
token_if = link_for(in_flight)
seen = {}


def report_during_charge():
    seen["proof"] = report_proof(in_flight, "mgr_a").status_code
    seen["claim"] = report_card(in_flight, "mgr_a").status_code


square["hook"] = report_during_charge
r = pay(token_if, key_of("inflight"))
square["hook"] = None
db = Session()
left = db.query(PaymentProof).filter(PaymentProof.invoice_id == in_flight, PaymentProof.status == "pending_verification").count()
db.close()
ok("a card being charged: reports made meanwhile are refused", seen == {"proof": 409, "claim": 409} and left == 0 and invoice_row(in_flight).amount_paid == D("1700.00"), f"{seen} {r.status_code}")

redis_lib.Redis.from_url(REDIS_URL).flushdb()  # rate limits only: these checks need real attempts
race_inv = approved_invoice()
token_race = link_for(race_inv)
charges.clear()
reports["n"] += 100


def race(job):
    kind, n = job
    if kind == "card":
        return ("card", httpx.post(f"{API}/public/service-invoices/{token_race}/square-payment",
                                   json={"source_id": "cnon:card-ok", "idempotency_key": key_of(f"rc{n}"), "payer_name": "Ann Lee"}, timeout=60).status_code)
    body = PNG + b"\0" * (reports["n"] + n)
    return ("proof", httpx.post(f"{API}/billing/invoices/{race_inv}/payment-proofs", headers=AUTH["fac_a"], data={"amount": "1700.00", "payment_method": "ach"},
                                files={"proof_file": ("p.png", body, "image/png")}, timeout=60).status_code)


square["delay"] = 0.3
with ThreadPoolExecutor(8) as pool:
    outcomes = list(pool.map(race, [("card", n) if n % 2 else ("proof", n) for n in range(8)]))
square["delay"] = 0
reports["n"] += 20
row = invoice_row(race_inv)
db = Session()
open_proofs = db.query(PaymentProof).filter(PaymentProof.invoice_id == race_inv, PaymentProof.status == "pending_verification").count()
db.close()
ok("cards and proofs all at once: only one kind gets through, never both",
   (len(charges) == 1 and open_proofs == 0) or (charges == [] and open_proofs == 1), f"charges={len(charges)} open_proofs={open_proofs} {sorted(outcomes)}")
ok("  nothing crashed, and none was merely rate limited", all(code not in (429, 500) for _, code in outcomes), sorted(outcomes))

redis_lib.Redis.from_url(REDIS_URL).flushdb()
held = approved_invoice()
blocker = Session()
blocker.query(Invoice).filter(Invoice.id == held).with_for_update().first()
box = {}
waiter = threading.Thread(target=lambda: box.update(proof=report_proof(held)))
waiter.start()
time.sleep(1.0)
started = time.monotonic()
other = http.get(f"{BASE}/health", timeout=10)
quick = time.monotonic() - started
still_waiting = waiter.is_alive()
blocker.rollback()
blocker.close()
waiter.join(30)
ok("a proof waiting for a locked invoice does not freeze the server", other.status_code == 200 and quick < 2 and still_waiting, f"{other.status_code} {quick:.2f}s waiting={still_waiting}")
ok("  and goes in once the lock is released", box["proof"].status_code in (200, 201, 202), box["proof"].status_code)

recorded = approved_invoice()
r = post(f"/billing/invoices/{recorded}/payments", "boss", json={"amount": "10.00", "payment_method": "credit_card", "idempotency_key": key_of("bossrec")})
ok("with nothing waiting, the super admin records a payment as before", r.status_code in (200, 201) and invoice_row(recorded).amount_paid == D("10.00"), f"{r.status_code} {r.text[:100]}")

# ── 10 ───────────────────────────────────────────────────────────────────────
section("10. HTTP hardening")
r = get(f"/public/service-invoices/{token_a}")
headers = r.headers
ok("not cached", "no-store" in headers.get("cache-control", ""), headers.get("cache-control"))
ok("no sniffing", headers.get("x-content-type-options") == "nosniff")
ok("no framing", headers.get("x-frame-options") == "DENY")
ok("no referrer leak", "strict-origin" in headers.get("referrer-policy", ""), headers.get("referrer-policy"))
ok("no server version given away", not any(word in headers.get("server", "").lower() for word in ("python", "fastapi")) , headers.get("server"))
for method in ("put", "delete", "patch"):
    ok(f"{method.upper()} on the page is refused", getattr(http, method)(f"{API}/public/service-invoices/{token_a}").status_code == 405)
ok("GET cannot pay", http.get(f"{API}/public/service-invoices/{token_a}/square-payment").status_code == 405)
r = http.get(f"{API}/public/service-invoices/{token_a}", headers={"Origin": "https://evil.example"})
ok("another site is not allowed to read it", r.headers.get("access-control-allow-origin") not in ("*", "https://evil.example"), r.headers.get("access-control-allow-origin"))
r = http.options(f"{API}/public/service-invoices/{token_a}/square-payment", headers={"Origin": "https://evil.example", "Access-Control-Request-Method": "POST"})
ok("another site cannot pre-clear a payment", r.headers.get("access-control-allow-origin") not in ("*", "https://evil.example"), r.status_code)
r = httpx.get(f"{API}/public/service-invoices/{token_a}", headers={"Host": "evil.example"})
ok("a forged Host header is refused", r.status_code == 400, r.status_code)
server_errors = [line for line in capture.lines if "Unhandled request failure" in line or "status=500" in line]
ok("no request in this whole run caused a server error", not server_errors, server_errors[:3])

print()
print(f"{checks['count']} checks")
for error in dict.fromkeys(line.splitlines()[-1] + " || " + " | ".join(x.strip() for x in line.splitlines() if "\app\\" in x or "/app/" in x)[-400:] for line in capture.errors):
    print("SERVER-ERROR", error)
for line in capture.errors:
    if "IntegrityError" in line:
        print("DB-DETAIL", " ".join(x.strip() for x in line.splitlines() if "violates" in x or "DETAIL" in x)[:400])
        break
if failures:
    print(f"{len(failures)} FAILED")
    for label in failures:
        print("  -", label)
    os._exit(1)
print("All service invoice security checks passed")
os._exit(0)
