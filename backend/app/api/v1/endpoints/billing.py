from datetime import datetime
from decimal import Decimal
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sqlalchemy.orm.attributes import flag_modified

from app.core.deps import get_current_user
from app.db.base import get_db
from app.models.inspection import Inspection, InspectionBatch, InspectionStatus
from app.models.invoice import Invoice, InvoiceStatus
from app.models.sales import SalesPaymentAuthorization
from app.models.user import User, UserRole
from app.models.user_facility import UserFacility
from app.utils.invoice_approval import (
    approval_response,
    approve_invoice_for_billing,
    is_facility_billing_user,
    is_invoice_approver,
    require_invoice_approved,
    require_invoice_payer,
)
from app.utils.facility_access import get_user_facility_ids, require_facility_access
from app.utils.invoice_ledger import (
    record_payment_delta,
    record_status_change,
    transaction_response,
)
from app.utils.notifications import create_notifications
from app.utils.permission_deps import require_module_access
from app.utils.permissions import has_module_permission


router = APIRouter(dependencies=[Depends(require_module_access("billing"))])


class InvoicePaymentCreate(BaseModel):
    amount: Decimal
    payment_method: str
    notes: Optional[str] = None


def _money(value: Any) -> Decimal:
    if value in (None, ""):
        return Decimal("0")
    return Decimal(str(value))


def _require_invoice_facility_access(db: Session, user: User, invoice: Invoice) -> None:
    if is_facility_billing_user(user):
        if (
            invoice.facility_id is None
            or invoice.facility_id not in get_user_facility_ids(db, user)
        ):
            raise HTTPException(status_code=403, detail="You do not have access to this invoice")
        return
    require_facility_access(db, user, invoice.facility_id)


def _append_source_payment_history(
    invoice: Invoice,
    user: User,
    amount: Decimal,
    payment_method: str,
) -> None:
    actor = user.full_name or user.username
    at = datetime.utcnow().isoformat()
    details = {
        "invoice_id": invoice.id,
        "invoice_number": invoice.invoice_number,
        "amount": str(amount),
        "payment_method": payment_method,
        "status": invoice.status.value if hasattr(invoice.status, "value") else invoice.status,
    }
    if invoice.service_request:
        history = list(invoice.service_request.history or [])
        history.append({
            "timestamp": at,
            "action": "service_invoice_payment_recorded",
            "user_id": user.id,
            "user": actor,
            "changes": details,
        })
        invoice.service_request.history = history
        invoice.service_request.billing_status = "approved"
        flag_modified(invoice.service_request, "history")
    if invoice.sales_quotation:
        history = list(invoice.sales_quotation.history or [])
        history.append({
            "action": "invoice_payment_recorded",
            "by": actor,
            "user_id": user.id,
            "at": at,
            "details": details,
        })
        invoice.sales_quotation.history = history
        invoice.sales_quotation.paid_status = (
            "paid" if invoice.status == InvoiceStatus.PAID else "unpaid"
        )
        invoice.sales_quotation.payment_method = payment_method
        if (
            invoice.status == InvoiceStatus.PAID
            and invoice.sales_quotation.status == "in_progress"
        ):
            invoice.sales_quotation.status = "completed"
    if invoice.rental:
        history = list(invoice.rental.history or [])
        history.append({
            "action": "invoice_paid" if invoice.status == InvoiceStatus.PAID else "invoice_payment_recorded",
            "by": actor,
            "user_id": user.id,
            "at": at,
            "details": details,
        })
        invoice.rental.history = history


@router.put("/invoices/{invoice_id}/approve")
def approve_invoice(
    invoice_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Any:
    if not is_invoice_approver(current_user) or not has_module_permission(
        current_user, "billing", "edit"
    ):
        raise HTTPException(
            status_code=403,
            detail="Billing edit permission and an internal admin role are required",
        )

    invoice = (
        db.query(Invoice)
        .filter(Invoice.id == invoice_id)
        .with_for_update()
        .first()
    )
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")

    if invoice.inspection_batch_id:
        batch_status = (
            db.query(InspectionBatch.status)
            .filter(InspectionBatch.id == invoice.inspection_batch_id)
            .scalar()
        )
        has_incomplete_asset = (
            db.query(Inspection.id)
            .filter(
                Inspection.batch_id == invoice.inspection_batch_id,
                Inspection.status != InspectionStatus.COMPLETED,
            )
            .first()
            is not None
        )
        if batch_status != InspectionStatus.COMPLETED or has_incomplete_asset:
            raise HTTPException(
                status_code=409,
                detail="Complete every inspection in the batch before approving its invoice for billing",
            )

    already_approved = invoice.billing_approval_status == "approved"
    approve_invoice_for_billing(db, invoice, current_user)

    if invoice.service_request:
        invoice.service_request.billing_status = "approved"

    if invoice.facility_id and not already_approved:
        recipient_roles = [
            UserRole.FACILITY_ADMIN,
            UserRole.FACILITY_MANAGER,
            UserRole.CLIENT,
        ]
        primary_users = (
            db.query(User.id)
            .filter(
                User.facility_id == invoice.facility_id,
                User.role.in_(recipient_roles),
                User.is_active.is_(True),
            )
            .all()
        )
        linked_users = (
            db.query(UserFacility.user_id)
            .join(User, User.id == UserFacility.user_id)
            .filter(
                UserFacility.facility_id == invoice.facility_id,
                User.role.in_(recipient_roles),
                User.is_active.is_(True),
            )
            .all()
        )
        create_notifications(
            db,
            user_ids=[row.id for row in primary_users] + [row.user_id for row in linked_users],
            title="Invoice ready for payment",
            message=f"{invoice.invoice_number} has been approved for billing.",
            notification_type="billing",
            link_url="/billing",
            actor_id=current_user.id,
        )

    db.commit()
    db.refresh(invoice)
    return {
        "id": invoice.id,
        "invoice_number": invoice.invoice_number,
        **approval_response(invoice),
        "transactions": [transaction_response(item) for item in invoice.transactions or []],
    }


@router.post("/invoices/{invoice_id}/payments")
def record_invoice_payment(
    invoice_id: int,
    payload: InvoicePaymentCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Any:
    if not has_module_permission(current_user, "billing", "edit"):
        raise HTTPException(status_code=403, detail="Billing edit permission is required")
    require_invoice_payer(current_user)
    if payload.amount <= 0:
        raise HTTPException(status_code=400, detail="Payment amount must be greater than zero")

    invoice = (
        db.query(Invoice)
        .filter(Invoice.id == invoice_id)
        .with_for_update()
        .first()
    )
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")
    _require_invoice_facility_access(db, current_user, invoice)
    require_invoice_approved(invoice)
    if invoice.status == InvoiceStatus.CANCELLED:
        raise HTTPException(status_code=409, detail="A cancelled invoice cannot receive payment")

    previous_paid = _money(invoice.amount_paid)
    previous_status = invoice.status
    balance = max(_money(invoice.total_amount) - previous_paid, Decimal("0"))
    if payload.amount > balance:
        raise HTTPException(status_code=400, detail="Payment cannot exceed the invoice balance")

    invoice.amount_paid = previous_paid + payload.amount
    invoice.balance_due = _money(invoice.total_amount) - _money(invoice.amount_paid)
    invoice.payment_method = payload.payment_method
    invoice.status = (
        InvoiceStatus.PAID
        if invoice.balance_due <= 0
        else InvoiceStatus.PARTIALLY_PAID
    )
    invoice.updated_at = datetime.utcnow()

    payment_transaction = record_payment_delta(
        db,
        invoice,
        previous_paid,
        invoice.amount_paid,
        current_user,
        payload.payment_method,
        payload.notes,
    )
    if invoice.sales_quotation_id:
        authorization = (
            db.query(SalesPaymentAuthorization)
            .filter(
                SalesPaymentAuthorization.invoice_id == invoice.id,
                SalesPaymentAuthorization.status == "submitted",
            )
            .order_by(SalesPaymentAuthorization.submitted_at.desc())
            .with_for_update()
            .first()
        )
        if authorization:
            authorization.status = (
                "processed"
                if invoice.status == InvoiceStatus.PAID
                else "partially_processed"
            )
            authorization.processed_at = datetime.utcnow()
            authorization.updated_at = datetime.utcnow()
            authorization.notes = " | ".join(
                item
                for item in [
                    authorization.notes,
                    (
                        f"Payment recorded as "
                        f"{payment_transaction.reference_number if payment_transaction else invoice.invoice_number}"
                    ),
                ]
                if item
            )
    record_status_change(db, invoice, previous_status, current_user)
    _append_source_payment_history(
        invoice,
        current_user,
        payload.amount,
        payload.payment_method,
    )
    db.commit()
    db.refresh(invoice)
    return {
        "id": invoice.id,
        "invoice_number": invoice.invoice_number,
        "amount_paid": invoice.amount_paid,
        "balance_due": invoice.balance_due,
        "status": invoice.status.value if hasattr(invoice.status, "value") else invoice.status,
        "payment_method": invoice.payment_method,
        **approval_response(invoice),
        "transactions": [transaction_response(item) for item in invoice.transactions or []],
    }
