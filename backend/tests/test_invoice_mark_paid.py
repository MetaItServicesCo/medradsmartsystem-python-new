"""A Super Admin marks an invoice paid.

Only a Super Admin can. The remaining balance is recorded as one payment
through the same path as every other payment, so the invoice and everything
linked to it is updated: its paid amount, balance and status, its ledger, and
the service request's or sales quotation's history (and a sales quotation's
paid status and completion). An invoice that needs billing approval is
approved first, under the same rule as approving it. Refused for a cancelled
or paid invoice, or while a reported payment awaits review.

    cd backend
    DATABASE_URL=sqlite:// venv312/Scripts/python.exe tests/test_invoice_mark_paid.py
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

from fastapi import HTTPException  # noqa: E402
from sqlalchemy import create_engine  # noqa: E402
from sqlalchemy.orm import sessionmaker  # noqa: E402
from sqlalchemy.pool import StaticPool  # noqa: E402

import app.models  # noqa: E402,F401
from app.api.v1.endpoints import billing  # noqa: E402
from app.db.base import Base  # noqa: E402
from app.models.audit_log import AuditLog  # noqa: E402
from app.models.equipment import Equipment  # noqa: E402
from app.models.facility import Facility  # noqa: E402
from app.models.inspection import Inspection, InspectionBatch, InspectionStatus  # noqa: E402
from app.models.inspection_form import InspectionForm  # noqa: E402
from app.models.invoice import Invoice, InvoiceStatus, InvoiceTransaction, InvoiceType, PaymentProof  # noqa: E402
from app.models.modality import Modality, ModalityCategory  # noqa: E402
from app.models.sales import SalesQuotation  # noqa: E402
from app.models.service_request import Priority, ServiceRequest  # noqa: E402
from app.models.user import User, UserRole, UserType  # noqa: E402

failures: list[str] = []


def ok(label: str, condition: bool, detail: object = "") -> None:
    print("{}  {}{}".format("PASS" if condition else "FAIL", label, f"  {detail}" if not condition else ""))
    if not condition:
        failures.append(label)


def refused(call, status: int, text: str = "") -> bool:
    try:
        call()
    except HTTPException as error:
        db.rollback()
        return error.status_code == status and text in str(error.detail)
    return False


# MARK_PAID_TEST_DB runs the same checks on a throwaway Postgres, as production uses.
if os.environ.get("MARK_PAID_TEST_DB"):
    engine = create_engine(os.environ["MARK_PAID_TEST_DB"])
    Base.metadata.drop_all(engine)
else:
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
Base.metadata.create_all(engine)
db = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)()

n = {"i": 0}


def person(name: str, role: UserRole, **extra) -> User:
    n["i"] += 1
    user = User(username=f"u{n['i']}", email=f"u{n['i']}@x.test", full_name=name, hashed_password="x",
                user_type=UserType.CLIENT if role == UserRole.CLIENT else UserType.EMPLOYEE, role=role, is_active=True, **extra)
    db.add(user)
    db.flush()
    return user


clinic = Facility(name="Life Path", contact_person="C", phone="1", email="c@x.test", address="1 St", city="Waco", state="TX", zip_code="76701", country="US")
db.add(clinic)
db.flush()
boss = person("Super Admin", UserRole.SUPERADMIN)
admin = person("Admin One", UserRole.ADMIN)
client = person("Clinic Client", UserRole.CLIENT, facility_id=clinic.id)
scales = Modality(name="Scales", category=ModalityCategory.TREATMENT)
db.add(scales)
db.flush()
asset = Equipment(asset_tag="A-1", make="Pelstar", model="500", serial_number="S-1", modality_id=scales.id, facility_id=clinic.id, description="Scale")
db.add(asset)
db.flush()
db.commit()

k = {"i": 0}


def invoice(invoice_type=InvoiceType.SERVICE, total="700.00", paid="0", status=InvoiceStatus.PENDING, approval="pending", **links) -> Invoice:
    k["i"] += 1
    item = Invoice(
        invoice_number=f"INV-{k['i']:04d}", invoice_type=invoice_type, customer_name="Life Path", customer_email="l@x.test",
        facility_id=clinic.id, subtotal=D(total), total_amount=D(total), amount_paid=D(paid), balance_due=D(total) - D(paid),
        status=status, issue_date=datetime(2026, 11, 1), due_date=datetime(2026, 12, 1), billing_approval_status=approval, **links,
    )
    db.add(item)
    db.commit()
    return item


def mark(item: Invoice, user: User = None, method="cheque", reference="CHK-1042", notes="Paid at the front desk"):
    return billing.mark_invoice_paid(item.id, billing.InvoiceMarkPaid(payment_method=method, reference=reference, notes=notes), db=db, current_user=user or boss)


print("A service invoice, not yet approved for billing")
request = ServiceRequest(request_number="SR-1", facility_id=clinic.id, equipment_id=asset.id, requester_id=boss.id,
                         problem_description="Noise", priority=Priority.MEDIUM, billing_status="pending")
db.add(request)
db.commit()
service = invoice(service_request_id=request.id)
result = mark(service)
db.expire_all()
service = db.get(Invoice, service.id)
ok("it is paid in full", service.status == InvoiceStatus.PAID and service.amount_paid == D("700.00") and service.balance_due == D("0"), (service.status, service.amount_paid, service.balance_due))
ok("  the answer says so", result["status"] == "paid" and D(str(result["balance_due"])) == D("0"))
ok("  with the method chosen", service.payment_method == "cheque")
ok("  approved for billing on the way, by the Super Admin", service.billing_approval_status == "approved" and service.approved_for_billing_by_id == boss.id)
kinds = [t.transaction_type for t in db.query(InvoiceTransaction).filter(InvoiceTransaction.invoice_id == service.id).order_by(InvoiceTransaction.id)]
ok("the ledger has the approval and the payment", "billing_approved" in kinds and any("payment" in kind for kind in kinds), kinds)
payment = [t for t in db.query(InvoiceTransaction).filter(InvoiceTransaction.invoice_id == service.id) if "payment" in t.transaction_type][-1]
ok("  the payment says who marked it, the reference and the note",
   "Marked as paid by Super Admin Super Admin" in (payment.description or "") and "Ref CHK-1042" in (payment.description or "") and "Paid at the front desk" in (payment.description or ""),
   payment.description)
ok("  for the whole $700", D(str(payment.amount)) == D("700.00"), payment.amount)
request = db.get(ServiceRequest, request.id)
ok("the service request records the payment", any(h.get("action") == "service_invoice_payment_recorded" for h in request.history or []))
ok("  and its billing is approved", request.billing_status == "approved")
log = db.query(AuditLog).filter(AuditLog.table_name == "invoices", AuditLog.record_id == service.id, AuditLog.action == "MARK_PAID").first()
ok("the activity log records it", log is not None and log.changed_by_id == boss.id)
ok("marking it again is refused: already paid", refused(lambda: mark(service), 409, "already paid"))

print("\nA partly paid invoice")
part = invoice(total="500.00", paid="200.00", status=InvoiceStatus.PARTIALLY_PAID, approval="approved")
mark(part, method="cash", reference="", notes="")
db.expire_all()
part = db.get(Invoice, part.id)
ok("the rest ($300) is recorded, and it is paid", part.status == InvoiceStatus.PAID and part.amount_paid == D("500.00") and part.balance_due == D("0"))
last = [t for t in db.query(InvoiceTransaction).filter(InvoiceTransaction.invoice_id == part.id).order_by(InvoiceTransaction.id) if "payment" in t.transaction_type][-1]
ok("  as a payment of $300", D(str(last.amount)) == D("300.00"), last.amount)

print("\nA sales invoice")
quote = SalesQuotation(quotation_number="Q-1", work_order="WO-1", facility_id=clinic.id, created_by_id=boss.id, customer_name="Life Path",
                       status="in_progress", paid_status="unpaid")
db.add(quote)
db.commit()
sale = invoice(InvoiceType.SALES, total="90.00", sales_quotation_id=quote.id)
mark(sale, method="ach", reference="ACH-77")
db.expire_all()
quote = db.get(SalesQuotation, quote.id)
ok("the sales invoice is paid", db.get(Invoice, sale.id).status == InvoiceStatus.PAID)
ok("  its quotation is marked paid and completed", quote.paid_status == "paid" and quote.status == "completed", (quote.paid_status, quote.status))
ok("  and records the payment", any(h.get("action") == "invoice_payment_recorded" for h in quote.history or []))

print("\nWho may, and when not")
other = invoice(approval="approved")
ok("an Admin cannot", refused(lambda: mark(other, admin), 403))
ok("a facility client cannot", refused(lambda: mark(other, client), 403))
ok("  and the invoice is untouched", db.get(Invoice, other.id).status == InvoiceStatus.PENDING)
ok("a method must be chosen from the list", refused(lambda: mark(other, method="bitcoin"), 422))
cancelled = invoice(status=InvoiceStatus.CANCELLED)
ok("a cancelled invoice is refused", refused(lambda: mark(cancelled), 409, "cancelled"))
proofed = invoice(approval="approved")
db.add(PaymentProof(invoice_id=proofed.id, submitted_by_id=client.id, claimed_amount=D("700.00"), payment_method="ach", status="pending_verification"))
db.commit()
ok("an invoice with a payment waiting for review is refused", refused(lambda: mark(proofed), 409, "waiting for review"))
ok("  and is untouched", db.get(Invoice, proofed.id).amount_paid == D("0"))
ok("an unknown invoice is not found", refused(lambda: billing.mark_invoice_paid(99999, billing.InvoiceMarkPaid(payment_method="cash"), db=db, current_user=boss), 404))

print("\nAn inspection batch invoice")
form = InspectionForm(name="Form", schema={})
db.add(form)
db.flush()
batch = InspectionBatch(batch_number="INSP-1", facility_id=clinic.id, inspector_id=boss.id, form_template_id=form.id, scheduled_date=datetime(2026, 11, 1),
                        status=InspectionStatus.IN_PROGRESS)
db.add(batch)
db.flush()
db.add(Inspection(inspection_number="INSP-1-1", batch_id=batch.id, equipment_id=asset.id, facility_id=clinic.id, form_template_id=form.id,
                  scheduled_date=datetime(2026, 11, 1), status=InspectionStatus.IN_PROGRESS))
db.commit()
inspection_invoice = invoice(InvoiceType.INSPECTION, total="250.00", inspection_batch_id=batch.id)
ok("not approved, with its batch unfinished: refused", refused(lambda: mark(inspection_invoice), 409, "Complete every inspection"))
ok("  and untouched, still awaiting approval", db.get(Invoice, inspection_invoice.id).billing_approval_status == "pending" and db.get(Invoice, inspection_invoice.id).amount_paid == D("0"))
db.query(Inspection).filter(Inspection.batch_id == batch.id).update({Inspection.status: InspectionStatus.COMPLETED})
db.get(InspectionBatch, batch.id).status = InspectionStatus.COMPLETED
db.commit()
mark(inspection_invoice, method="credit_card", reference="", notes="")
db.expire_all()
done = db.get(Invoice, inspection_invoice.id)
ok("once the batch is complete, it is approved and paid", done.billing_approval_status == "approved" and done.status == InvoiceStatus.PAID and done.balance_due == D("0"))

print()
if failures:
    print(f"{len(failures)} FAILED: {failures}")
    sys.exit(1)
print("ALL PASSED")
