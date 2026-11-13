from datetime import datetime
from decimal import Decimal
from typing import Any, Optional
from uuid import uuid4

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, Response, UploadFile
from fastapi.concurrency import run_in_threadpool
from pydantic import BaseModel, Field
from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload, selectinload
from sqlalchemy.orm.attributes import flag_modified

from app.core.config import settings
from app.core.deps import get_current_user
from app.db.base import get_db
from app.models.inspection import Inspection, InspectionBatch, InspectionStatus
from app.models.invoice import Invoice, InvoiceStatus, InvoiceTransaction, InvoiceType, PaymentProof
from app.models.payment_operation import PaymentOperation
from app.models.sales import SalesPaymentAuthorization
from app.models.service_request import ServiceRequest, ServiceRequestQuotation
from app.models.user import User, UserRole
from app.models.user_facility import UserFacility
from app.utils.invoice_approval import (
    approval_response,
    approve_invoice_for_billing,
    invoice_requires_billing_approval,
    is_facility_billing_user,
    is_invoice_approver,
    require_invoice_approved,
    require_invoice_payer,
)
from app.utils.facility_access import get_user_facility_ids, require_facility_access
from app.utils.invoice_ledger import (
    add_invoice_transaction,
    record_payment_delta,
    record_status_change,
    transaction_response,
)
from app.utils.invoice_payment_evidence import invoice_payment_evidence_response
from app.utils.payment_receipts import deliver_payment_receipt, queue_payment_receipt, queue_rental_payment_receipt
from app.utils.card_fee import apply_card_fee, card_charge, card_fee_label, remember_card_charge, succeeded_response
from app.utils.square_payments import (
    SquareConfigurationError,
    SquareRequestError,
    create_square_payment,
    minor_units_to_amount,
    square_public_config,
)
from app.utils.notifications import create_notification, create_notifications, notify_admins
from app.utils.permission_deps import require_module_access
from app.utils.permissions import has_module_permission
from app.utils.payment_idempotency import (
    get_or_create_operation,
    mark_operation_failed,
    mark_operation_succeeded,
    payment_fingerprint,
    replay_or_raise,
)
from app.utils.sales_inventory import (
    ensure_sales_inventory_available,
    fulfill_sales_invoice_inventory,
)
from app.utils.payment_proofs import (
    NON_CARD_METHODS,
    REVIEWABLE_EXTRACTION_STATUSES,
    card_claim_details,
    delete_payment_proof_file,
    is_card_claim,
    load_payment_proof,
    normalize_non_card_method,
    payment_proof_response,
    payment_proof_sha256,
    read_and_validate_payment_proof,
    new_card_claim,
    require_no_other_service_payment,
    store_encrypted_payment_proof,
)
from app.utils.rate_limit import enforce_rate_limit
from app.utils.logging import log_activity


router = APIRouter(dependencies=[Depends(require_module_access("billing"))])


class InvoicePaymentCreate(BaseModel):
    amount: Decimal
    payment_method: str
    notes: Optional[str] = None
    idempotency_key: Optional[str] = None
    card_brand: Optional[str] = None
    card_last4: Optional[str] = None


# How a Super Admin says an invoice was paid when marking it paid.
MARK_PAID_METHODS = {
    "cash": "Cash",
    "cheque": "Cheque",
    "ach": "ACH",
    "bank_transfer": "Bank transfer",
    "credit_card": "Card",
    "other": "Other",
}


class InvoiceMarkPaid(BaseModel):
    payment_method: str
    reference: Optional[str] = None
    notes: Optional[str] = None


class PaymentProofReview(BaseModel):
    notes: Optional[str] = None


def _money(value: Any) -> Decimal:
    if value in (None, ""):
        return Decimal("0")
    return Decimal(str(value))


CARD_THROUGH_SQUARE = "Card payments are taken through the secure card form, with the card processing fee"


def _is_card_method(method: Optional[str]) -> bool:
    normalized = (method or "").strip().lower().replace(" ", "_")
    return "card" in normalized or "square" in normalized


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


def _invoice_payment_response(invoice: Invoice) -> dict[str, Any]:
    return {
        "id": invoice.id,
        "invoice_number": invoice.invoice_number,
        "total_amount": invoice.total_amount,
        "card_fee_amount": invoice.card_fee_amount,
        "amount_paid": invoice.amount_paid,
        "balance_due": invoice.balance_due,
        "status": invoice.status.value if hasattr(invoice.status, "value") else invoice.status,
        "payment_method": invoice.payment_method,
        **approval_response(invoice),
        "transactions": [transaction_response(item) for item in invoice.transactions or []],
    }


def _apply_invoice_payment_locked(
    db: Session,
    invoice: Invoice,
    *,
    amount: Decimal,
    payment_method: str,
    notes: Optional[str],
    user: User,
    card_brand: Optional[str] = None,
    card_last4: Optional[str] = None,
) -> tuple[Any, Any]:
    """Apply an authorized payment while the caller holds the invoice lock."""
    if invoice.invoice_type == InvoiceType.SALES:
        ensure_sales_inventory_available(db, invoice)

    previous_paid = _money(invoice.amount_paid)
    previous_status = invoice.status
    balance = max(_money(invoice.total_amount) - previous_paid, Decimal("0"))
    if amount > balance:
        raise HTTPException(status_code=400, detail="Payment cannot exceed the invoice balance")

    invoice.amount_paid = previous_paid + amount
    invoice.balance_due = _money(invoice.total_amount) - _money(invoice.amount_paid)
    invoice.payment_method = payment_method
    invoice.status = InvoiceStatus.PAID if invoice.balance_due <= 0 else InvoiceStatus.PARTIALLY_PAID
    invoice.updated_at = datetime.utcnow()

    payment_transaction = record_payment_delta(
        db,
        invoice,
        previous_paid,
        invoice.amount_paid,
        user,
        payment_method,
        notes,
    )
    if payment_transaction is not None:
        payment_transaction.card_brand = card_brand
        payment_transaction.card_last4 = card_last4
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
            authorization.status = "processed" if invoice.status == InvoiceStatus.PAID else "partially_processed"
            authorization.processed_at = datetime.utcnow()
            authorization.updated_at = datetime.utcnow()
            authorization.notes = " | ".join(
                item
                for item in [
                    authorization.notes,
                    f"Payment recorded as {payment_transaction.reference_number if payment_transaction else invoice.invoice_number}",
                ]
                if item
            )
    record_status_change(db, invoice, previous_status, user)
    _append_source_payment_history(invoice, user, amount, payment_method)
    if invoice.invoice_type == InvoiceType.SALES:
        fulfill_sales_invoice_inventory(db, invoice, user)
    receipt_delivery = None
    if invoice.invoice_type == InvoiceType.RENTAL and invoice.rental and payment_transaction is not None:
        receipt_delivery = queue_rental_payment_receipt(
            db,
            invoice.rental,
            invoice,
            payment_reference=payment_transaction.reference_number,
            amount=amount,
            payment_method=payment_method,
            card_brand=card_brand,
            card_last4=card_last4,
        )
    return payment_transaction, receipt_delivery


@router.post("/invoices/{invoice_id}/mark-paid")
def mark_invoice_paid(
    invoice_id: int,
    payload: InvoiceMarkPaid,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Any:
    """A Super Admin marks an invoice paid in full.

    The remaining balance is recorded as one payment through the same path as
    every other payment, so everything an invoice payment updates is updated:
    the invoice's paid amount, balance and status, its ledger, the service
    request's, sales quotation's or rental's history (and a sales quotation's
    paid status and completion, and its inventory), and a rental's receipt.
    An invoice that needs billing approval is approved first, under the same
    rule as approving it (a batch's inspections must all be complete).
    """
    if current_user.role != UserRole.SUPERADMIN:
        raise HTTPException(status_code=403, detail="Only a Super Admin can mark an invoice as paid")
    method = (payload.payment_method or "").strip().lower().replace(" ", "_")
    if method not in MARK_PAID_METHODS:
        raise HTTPException(status_code=422, detail="Choose how the invoice was paid")
    reference = (payload.reference or "").strip()
    notes = (payload.notes or "").strip()
    if len(reference) > 120 or len(notes) > 1000:
        raise HTTPException(status_code=422, detail="The reference or note is too long")

    invoice = db.query(Invoice).filter(Invoice.id == invoice_id).with_for_update().first()
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")
    if invoice.status == InvoiceStatus.CANCELLED:
        raise HTTPException(status_code=409, detail="A cancelled invoice cannot be marked as paid")
    balance = max(_money(invoice.total_amount) - _money(invoice.amount_paid), Decimal("0"))
    if invoice.status == InvoiceStatus.PAID or balance <= 0:
        raise HTTPException(status_code=409, detail="This invoice is already paid")
    # A payment someone has already reported would be counted twice.
    if (
        db.query(PaymentProof.id)
        .filter(PaymentProof.invoice_id == invoice.id, PaymentProof.status == "pending_verification")
        .first()
    ):
        raise HTTPException(
            status_code=409,
            detail="A payment for this invoice is waiting for review. Approve or reject it first.",
        )
    require_no_other_service_payment(db, invoice)

    if invoice_requires_billing_approval(invoice) and invoice.billing_approval_status != "approved":
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
                    detail="Complete every inspection in the batch before this invoice can be approved and marked as paid",
                )
        approve_invoice_for_billing(db, invoice, current_user)

    actor = current_user.full_name or current_user.username
    ledger_note = " · ".join(part for part in (
        f"Marked as paid by Super Admin {actor}",
        f"Ref {reference}" if reference else "",
        notes,
    ) if part)
    previous_status = invoice.status.value if hasattr(invoice.status, "value") else invoice.status
    payment_transaction, receipt_delivery = _apply_invoice_payment_locked(
        db,
        invoice,
        amount=balance,
        payment_method=method,
        notes=ledger_note,
        user=current_user,
    )
    log_activity(db, "invoices", invoice.id, "MARK_PAID", current_user, {
        "invoice_number": invoice.invoice_number,
        "amount": str(balance),
        "payment_method": method,
        "reference": reference or None,
        "notes": notes or None,
        "previous_status": previous_status,
        "transaction": payment_transaction.reference_number if payment_transaction else None,
    })
    db.commit()
    if receipt_delivery:
        deliver_payment_receipt(db, receipt_delivery.id)
    db.refresh(invoice)
    return _invoice_payment_response(invoice)


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


def _lock_service_invoice_for_proof(db: Session, invoice_id: int, amount: Decimal) -> Invoice:
    """Lock the invoice and re-check it, now the proof's file has been read."""
    invoice = db.query(Invoice).filter(Invoice.id == invoice_id).populate_existing().with_for_update().first()
    require_no_other_service_payment(db, invoice)
    balance = max(_money(invoice.total_amount) - _money(invoice.amount_paid), Decimal("0"))
    if amount > balance:
        raise HTTPException(status_code=400, detail="Payment cannot exceed the invoice balance")
    return invoice


@router.post("/invoices/{invoice_id}/payments")
def record_invoice_payment(
    invoice_id: int,
    payload: InvoicePaymentCreate,
    response: Response,
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
    if _is_card_method(payload.payment_method):
        # A card payment is taken through Square, never typed in: no card
        # payment is recorded without a completed charge.
        raise HTTPException(status_code=409, detail=CARD_THROUGH_SQUARE)
    if is_facility_billing_user(current_user):
        raise HTTPException(
            status_code=409,
            detail="Pay by card, or upload proof of an ACH, cheque or bank transfer payment",
        )
    require_no_other_service_payment(db, invoice)
    operation_key = payload.idempotency_key or f"legacy-manual-invoice-{invoice.id}-{uuid4()}"
    fingerprint = payment_fingerprint(
        "manual_invoice_payment",
        invoice_id=invoice.id,
        amount=payload.amount,
        attributes={
            "payment_method": payload.payment_method,
            "actor_id": current_user.id,
        },
    )
    operation, replay = get_or_create_operation(
        db,
        idempotency_key=operation_key,
        fingerprint=fingerprint,
        operation_type="manual_invoice_payment",
        invoice_id=invoice.id,
        amount=payload.amount,
        created_by_id=current_user.id,
    )
    if replay:
        replay_or_raise(operation)
        db.refresh(invoice)
        return _invoice_payment_response(invoice)

    normalized_method = (payload.payment_method or "").strip().lower().replace(" ", "_")
    if normalized_method in {"ach", "mbmts_ach", "cheque", "check", "bank_transfer"}:
        raise HTTPException(
            status_code=409,
            detail="Upload payment proof for non-card payments; the invoice will update after Admin or Super Admin approval",
        )

    card_brand = None
    card_last4 = None
    if "card" in normalized_method or "square" in normalized_method:
        if payload.card_last4:
            card_last4 = "".join(char for char in payload.card_last4 if char.isdigit())
            if len(card_last4) != 4:
                raise HTTPException(status_code=422, detail="Card last four must contain exactly four digits")
        if payload.card_brand:
            supported_brands = {
                "visa": "Visa",
                "mastercard": "Mastercard",
                "american express": "American Express",
                "discover": "Discover",
                "card": "Card",
            }
            card_brand = supported_brands.get(payload.card_brand.strip().lower(), "Card")
        if not card_last4:
            card_brand = None

    payment_transaction, receipt_delivery = _apply_invoice_payment_locked(
        db,
        invoice,
        amount=payload.amount,
        payment_method=normalized_method,
        notes=payload.notes,
        user=current_user,
        card_brand=card_brand,
        card_last4=card_last4,
    )
    mark_operation_succeeded(
        operation,
        provider_reference=payment_transaction.reference_number if payment_transaction else None,
        response_data={"invoice_id": invoice.id, "invoice_number": invoice.invoice_number},
    )
    db.commit()
    if receipt_delivery:
        deliver_payment_receipt(db, receipt_delivery.id)
    db.refresh(invoice)
    return _invoice_payment_response(invoice)


# ── Card payments through Square ────────────────────────────────────────────
# Any invoice, paid by card in full: its balance plus the card processing fee,
# in one Square charge. A Super Admin, or a facility's billing user for their
# own facility's invoices. Exactly-once: the charge is registered before Square
# is called, a retry with the same key never charges again, nothing is
# recorded unless Square completes that exact amount, and an uncertain result
# blocks any new charge until the webhook settles it.


class InvoiceSquarePayment(BaseModel):
    source_id: str = Field(min_length=8, max_length=500)
    idempotency_key: str = Field(min_length=16, max_length=64)
    # What the payer was shown. Charged only if it is still what is owed.
    charge_amount: Decimal


def _require_card_payer(user: User) -> None:
    if not has_module_permission(user, "billing", "edit"):
        raise HTTPException(status_code=403, detail="Billing edit permission is required")
    if user.role != UserRole.SUPERADMIN and not is_facility_billing_user(user):
        raise HTTPException(status_code=403, detail="This role cannot pay invoices by card")


def _card_payable_invoice(db: Session, invoice_id: int, user: User, *, for_update: bool = False) -> Invoice:
    """The invoice, if it can be paid by card now; else why not."""
    query = db.query(Invoice).filter(Invoice.id == invoice_id)
    if for_update:
        query = query.with_for_update()
    invoice = query.first()
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")
    _require_invoice_facility_access(db, user, invoice)
    require_invoice_approved(invoice)
    if invoice.status == InvoiceStatus.CANCELLED:
        raise HTTPException(status_code=409, detail="A cancelled invoice cannot receive payment")
    if invoice.status == InvoiceStatus.PAID or _money(invoice.balance_due) <= 0:
        raise HTTPException(status_code=409, detail="This invoice has no payable balance")
    if (
        db.query(PaymentProof.id)
        .filter(PaymentProof.invoice_id == invoice.id, PaymentProof.status == "pending_verification")
        .first()
    ):
        raise HTTPException(
            status_code=409,
            detail="A payment for this invoice is waiting for review. It must be approved or rejected first.",
        )
    require_no_other_service_payment(db, invoice)
    return invoice


def _card_payment_view(invoice: Invoice, user: User) -> dict[str, Any]:
    square = square_public_config()
    balance = max(_money(invoice.balance_due), Decimal("0"))
    return {
        "invoice_id": invoice.id,
        "invoice_number": invoice.invoice_number,
        "balance_due": f"{balance:.2f}",
        **card_charge(balance).as_dict(),
        "payer_name": user.full_name or user.username,
        "payer_email": user.email,
        "square_payment": square,
        "can_pay": balance > 0 and bool(square.get("enabled")),
    }


@router.get("/invoices/{invoice_id}/card-payment")
def read_invoice_card_payment(
    invoice_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Any:
    """What a card payment of this invoice charges, and the secure card form's settings."""
    _require_card_payer(current_user)
    return _card_payment_view(_card_payable_invoice(db, invoice_id, current_user), current_user)


@router.post("/invoices/{invoice_id}/square-payment")
def pay_invoice_by_card(
    invoice_id: int,
    payload: InvoiceSquarePayment,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Any:
    _require_card_payer(current_user)
    enforce_rate_limit(
        bucket="billing-card-payment",
        identity=f"user:{current_user.id}:invoice:{invoice_id}",
        limit=8,
        window_seconds=600,
    )
    enforce_rate_limit(
        bucket="billing-card-payment-all",
        identity=f"user:{current_user.id}",
        limit=30,
        window_seconds=600,
    )
    # The same payment sent again (a browser retrying after a dropped
    # connection): once it has succeeded, answer as it did, never charge again.
    completed = (
        db.query(PaymentOperation)
        .filter(PaymentOperation.idempotency_key == payload.idempotency_key)
        .first()
    )
    if completed is not None and completed.status == "succeeded":
        if completed.invoice_id != invoice_id:
            raise HTTPException(status_code=409, detail="This payment retry key was already used for different payment details")
        invoice = db.query(Invoice).filter(Invoice.id == invoice_id).first()
        _require_invoice_facility_access(db, current_user, invoice)
        return _invoice_payment_response(invoice)
    invoice = _card_payable_invoice(db, invoice_id, current_user, for_update=True)
    charge = card_charge(invoice.balance_due)
    if _money(payload.charge_amount).quantize(Decimal("0.01")) != charge.total:
        raise HTTPException(
            status_code=409,
            detail=f"The amount due has changed to ${charge.total:.2f}. Review it and pay again.",
        )
    if invoice.invoice_type == InvoiceType.SALES:
        ensure_sales_inventory_available(db, invoice)
    payer = current_user.full_name or current_user.username

    operation, replay = get_or_create_operation(
        db,
        idempotency_key=payload.idempotency_key,
        fingerprint=payment_fingerprint(
            "square_invoice_payment",
            invoice_id=invoice.id,
            amount=charge.total,
            currency=settings.SQUARE_CURRENCY,
            attributes={"card_fee": f"{charge.fee:.2f}", "payer_id": current_user.id},
        ),
        operation_type="square_invoice_payment",
        invoice_id=invoice.id,
        amount=charge.total,
        currency=settings.SQUARE_CURRENCY,
        provider="square",
        created_by_id=current_user.id,
    )
    if replay:
        replay_or_raise(operation)
        db.refresh(invoice)
        return _invoice_payment_response(invoice)
    remember_card_charge(operation, charge)

    # The charge is on record before Square is contacted, so an uncertain
    # answer can be settled later and never charged twice.
    invoice_number = invoice.invoice_number
    customer_email = invoice.customer_email
    operation_id = operation.id
    db.commit()
    try:
        square_payment = create_square_payment(
            source_id=payload.source_id,
            idempotency_key=payload.idempotency_key,
            amount=charge.total,
            invoice_number=invoice_number,
            customer_email=customer_email,
        )
    except SquareConfigurationError as exc:
        operation = db.query(PaymentOperation).filter(PaymentOperation.id == operation_id).with_for_update().first()
        mark_operation_failed(operation, str(exc))
        db.commit()
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except SquareRequestError as exc:
        operation = db.query(PaymentOperation).filter(PaymentOperation.id == operation_id).with_for_update().first()
        mark_operation_failed(operation, str(exc), unknown=exc.indeterminate)
        db.commit()
        raise HTTPException(status_code=exc.status_code, detail=str(exc)) from exc

    invoice = db.query(Invoice).filter(Invoice.id == invoice_id).populate_existing().with_for_update().first()
    operation = db.query(PaymentOperation).filter(PaymentOperation.id == operation_id).with_for_update().first()
    payment_id = str(square_payment.get("id") or "").strip()
    payment_status = str(square_payment.get("status") or "").upper()
    money_block = square_payment.get("amount_money") or {}
    square_amount = minor_units_to_amount(money_block.get("amount"))
    square_currency = str(money_block.get("currency") or "").upper()
    if payment_status != "COMPLETED":
        mark_operation_failed(operation, f"Square payment status was {payment_status or 'unknown'}", unknown=True)
        db.commit()
        raise HTTPException(status_code=409, detail=f"Square payment is {payment_status.lower() or 'not completed'}")
    if square_amount != charge.total or square_currency != (settings.SQUARE_CURRENCY.strip().upper() or "USD"):
        mark_operation_failed(operation, "Square returned an unexpected amount or currency", unknown=True)
        db.commit()
        raise HTTPException(status_code=409, detail="Square completed an unexpected amount or currency; the invoice was not changed")
    if db.query(InvoiceTransaction.id).filter(InvoiceTransaction.reference_number == payment_id).first():
        # Already recorded (the webhook got there first).
        mark_operation_succeeded(operation, provider_reference=payment_id,
                                 response_data=succeeded_response(operation, {"invoice_id": invoice.id, "payment_id": payment_id}))
        db.commit()
        db.refresh(invoice)
        return _invoice_payment_response(invoice)

    card = (square_payment.get("card_details") or {}).get("card") or {}
    apply_card_fee(db, invoice, charge.fee, current_user, base=charge.base)
    # The invoice can change while the card is charged; the money is taken and
    # recorded, and anything beyond the new balance is flagged for a refund.
    remaining = max(_money(invoice.total_amount) - _money(invoice.amount_paid), Decimal("0"))
    recorded = min(square_amount, remaining)
    excess = square_amount - recorded
    payment_transaction = None
    receipt_delivery = None
    if recorded > 0:
        payment_transaction, receipt_delivery = _apply_invoice_payment_locked(
            db,
            invoice,
            amount=recorded,
            payment_method="square_card",
            notes=(
                f"Card payment by {payer} through Square ({payment_id}): "
                f"${charge.base:.2f} + {card_fee_label()} ${charge.fee:.2f}"
            ),
            user=current_user,
            card_brand=card.get("card_brand"),
            card_last4=card.get("last_4"),
        )
        if payment_transaction is not None:
            payment_transaction.reference_number = payment_id
    if excess > 0:
        add_invoice_transaction(
            db, invoice, "overpayment_review", excess, "square_card",
            f"Square payment {payment_id} exceeded the balance by ${excess:.2f}; review for a refund",
            current_user, "OVR",
        )
    if is_facility_billing_user(current_user) or excess > 0:
        notify_admins(
            db,
            title="Card payment needs attention" if excess > 0 else "Card payment completed",
            message=(
                f"{payer} paid ${square_amount:.2f} by card through Square for {invoice.invoice_number}"
                + (f"; ${excess:.2f} is more than the balance and needs a refund review." if excess > 0 else ".")
            ),
            notification_type="billing",
            link_url=f"/billing?search={invoice.invoice_number}",
            actor_id=current_user.id,
        )
    if invoice.invoice_type != InvoiceType.RENTAL:
        receipt = queue_payment_receipt(
            db, invoice,
            payment_reference=payment_id,
            amount=square_amount,
            payment_method="square_card",
            recipients=[invoice.customer_email] if invoice.customer_email else None,
            card_brand=card.get("card_brand"),
            card_last4=card.get("last_4"),
        )
        receipt_delivery = receipt_delivery or receipt
    mark_operation_succeeded(operation, provider_reference=payment_id,
                             response_data=succeeded_response(operation, {"invoice_id": invoice.id, "payment_id": payment_id}))
    log_activity(db, "invoices", invoice.id, "CARD_PAYMENT", current_user, {
        "invoice_number": invoice.invoice_number,
        "amount": str(charge.base),
        "card_fee": str(charge.fee),
        "charged": str(square_amount),
        "square_payment_id": payment_id,
    })
    db.commit()
    if receipt_delivery:
        deliver_payment_receipt(db, receipt_delivery.id)
    db.refresh(invoice)
    return _invoice_payment_response(invoice)


@router.post("/invoices/{invoice_id}/payment-proofs", status_code=201)
async def submit_invoice_payment_proof(
    invoice_id: int,
    payment_method: str = Form(...),
    amount: Decimal = Form(...),
    notes: Optional[str] = Form(None),
    proof_file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Any:
    if not has_module_permission(current_user, "billing", "edit"):
        raise HTTPException(status_code=403, detail="Billing edit permission is required")
    require_invoice_payer(current_user)
    enforce_rate_limit(
        bucket="authenticated-payment-proof-upload",
        identity=f"user:{current_user.id}",
        limit=10,
        window_seconds=60,
        message="Too many payment proof uploads. Please wait before trying again.",
    )
    amount = _money(amount).quantize(Decimal("0.01"))
    if amount <= 0:
        raise HTTPException(status_code=400, detail="Payment amount must be greater than zero")
    method = normalize_non_card_method(payment_method)
    invoice = db.query(Invoice).filter(Invoice.id == invoice_id).first()
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")
    _require_invoice_facility_access(db, current_user, invoice)
    require_invoice_approved(invoice)
    if invoice.status == InvoiceStatus.CANCELLED:
        raise HTTPException(status_code=409, detail="A cancelled invoice cannot receive payment")
    balance = max(_money(invoice.total_amount) - _money(invoice.amount_paid), Decimal("0"))
    if amount > balance:
        raise HTTPException(status_code=400, detail="Payment cannot exceed the invoice balance")

    data, mime_type, original_name = await read_and_validate_payment_proof(proof_file)
    sha256 = payment_proof_sha256(data)
    duplicate = (
        db.query(PaymentProof)
        .filter(
            PaymentProof.invoice_id == invoice.id,
            PaymentProof.sha256 == sha256,
            PaymentProof.claimed_amount == amount,
            PaymentProof.status.in_(["pending_verification", "approved"]),
        )
        .order_by(PaymentProof.id.desc())
        .first()
    )
    if duplicate:
        return payment_proof_response(duplicate, include_ocr_text=is_invoice_approver(current_user))
    if invoice.invoice_type == InvoiceType.SERVICE:
        # In a worker thread: this endpoint runs on the event loop, and waiting
        # there for a lock would stop the request that holds it from finishing.
        invoice = await run_in_threadpool(_lock_service_invoice_for_proof, db, invoice_id, amount)

    stored_name, storage_backend = store_encrypted_payment_proof(data)
    proof = PaymentProof(
        invoice_id=invoice.id,
        submitted_by_id=current_user.id,
        payment_method=method,
        claimed_amount=amount,
        notes=notes,
        original_filename=original_name,
        stored_filename=stored_name,
        storage_backend=storage_backend,
        mime_type=mime_type,
        file_size=len(data),
        sha256=sha256,
        status="pending_verification",
        extraction_status="queued",
        extraction_next_attempt_at=datetime.utcnow(),
        extracted_data={},
        mismatch_flags=[],
        requires_manual_review=True,
    )
    try:
        db.add(proof)
        db.flush()
        add_invoice_transaction(
            db,
            invoice,
            "payment_proof_submitted",
            0,
            method,
            f"{method.replace('_', ' ').title()} proof #{proof.id} submitted for ${amount}; pending verification",
            current_user,
            "PRF",
        )
        notify_admins(
            db,
            title="Payment proof awaiting review",
            message=f"{invoice.invoice_number}: {method.replace('_', ' ').title()} proof for ${amount}",
            notification_type="billing",
            link_url=f"/billing?search={invoice.invoice_number}",
            actor_id=current_user.id,
        )
        db.commit()
        db.refresh(proof)
    except Exception:
        db.rollback()
        delete_payment_proof_file(stored_name, storage_backend)
        raise
    return payment_proof_response(proof, include_ocr_text=is_invoice_approver(current_user))


@router.get("/invoices/{invoice_id}/payment-proofs")
def list_invoice_payment_proofs(
    invoice_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Any:
    invoice = db.query(Invoice).filter(Invoice.id == invoice_id).first()
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")
    _require_invoice_facility_access(db, current_user, invoice)
    proofs = (
        db.query(PaymentProof)
        .filter(PaymentProof.invoice_id == invoice.id)
        .order_by(PaymentProof.created_at.desc())
        .all()
    )
    show_ocr = is_invoice_approver(current_user)
    return [payment_proof_response(proof, include_ocr_text=show_ocr) for proof in proofs]


@router.get("/invoices/{invoice_id}/payment-evidence")
def get_invoice_payment_evidence(
    invoice_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Any:
    """Return PCI-safe payment evidence already attached to an invoice.

    This is intentionally read-only and uses the same facility/account access
    policy as the invoice itself. OCR/reviewer metadata stays internal, while
    every authorized viewer can see proof status and masked card details.
    """
    invoice = (
        db.query(Invoice)
        .options(
            selectinload(Invoice.receipt_deliveries),
            selectinload(Invoice.transactions).joinedload(InvoiceTransaction.created_by),
            selectinload(Invoice.payment_proofs).joinedload(PaymentProof.submitted_by),
            selectinload(Invoice.payment_proofs).joinedload(PaymentProof.reviewed_by),
            selectinload(Invoice.payment_proofs).joinedload(PaymentProof.invoice_transaction),
        )
        .filter(Invoice.id == invoice_id)
        .first()
    )
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")
    _require_invoice_facility_access(db, current_user, invoice)
    return invoice_payment_evidence_response(
        invoice,
        include_internal_review=is_invoice_approver(current_user),
    )


@router.get("/payment-proofs")
def list_payment_proof_review_queue(
    review_status: Optional[str] = Query("pending_verification", alias="status"),
    limit: int = Query(100, ge=1, le=250),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Any:
    if not is_invoice_approver(current_user) or not has_module_permission(current_user, "billing", "view"):
        raise HTTPException(status_code=403, detail="Internal billing approval permission is required")
    query = db.query(PaymentProof).options(
        joinedload(PaymentProof.invoice),
        joinedload(PaymentProof.submitted_by),
        joinedload(PaymentProof.reviewed_by),
        joinedload(PaymentProof.service_quotation)
        .joinedload(ServiceRequestQuotation.service_request)
        .joinedload(ServiceRequest.facility),
    )
    if review_status:
        query = query.filter(PaymentProof.status == review_status)
    proofs = query.order_by(PaymentProof.created_at.desc()).limit(limit).all()
    return [payment_proof_response(proof, include_ocr_text=True) for proof in proofs]


@router.get("/payment-proofs/processing-metrics")
def payment_proof_processing_metrics(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Any:
    """Small indexed aggregate for worker monitoring; never exposes proof data."""
    if not is_invoice_approver(current_user) or not has_module_permission(current_user, "billing", "view"):
        raise HTTPException(status_code=403, detail="Internal billing approval permission is required")
    counts = dict(
        db.query(PaymentProof.extraction_status, func.count(PaymentProof.id))
        .group_by(PaymentProof.extraction_status)
        .all()
    )
    oldest_queued_at = (
        db.query(func.min(PaymentProof.created_at))
        .filter(PaymentProof.extraction_status.in_(["queued", "retry", "processing"]))
        .scalar()
    )
    return {
        "counts": counts,
        "oldest_queued_at": oldest_queued_at,
        "pending_review": db.query(func.count(PaymentProof.id))
        .filter(PaymentProof.status == "pending_verification")
        .scalar(),
    }


def _require_payment_proof_access(db: Session, current_user: User, proof: PaymentProof) -> None:
    if is_invoice_approver(current_user) or proof.submitted_by_id == current_user.id:
        return
    if proof.invoice:
        _require_invoice_facility_access(db, current_user, proof.invoice)
        return
    quotation = proof.service_quotation
    facility_id = quotation.service_request.facility_id if quotation and quotation.service_request else None
    if is_facility_billing_user(current_user):
        if facility_id is None or facility_id not in get_user_facility_ids(db, current_user):
            raise HTTPException(status_code=403, detail="You do not have access to this payment proof")
        return
    require_facility_access(db, current_user, facility_id)


@router.get("/payment-proofs/{proof_id}/file")
def download_payment_proof(
    proof_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Response:
    proof = db.query(PaymentProof).filter(PaymentProof.id == proof_id).first()
    if not proof:
        raise HTTPException(status_code=404, detail="Payment proof not found")
    _require_payment_proof_access(db, current_user, proof)
    if is_card_claim(proof):
        raise HTTPException(status_code=404, detail="A card payment claim has no document")
    data = load_payment_proof(proof)
    safe_name = "".join(
        character for character in proof.original_filename
        if character.isascii() and (character.isalnum() or character in {" ", ".", "-", "_"})
    ).strip() or "payment-proof"
    return Response(
        content=data,
        media_type=proof.mime_type,
        headers={
            "Cache-Control": "private, no-store, max-age=0",
            "Content-Disposition": f'inline; filename="{safe_name}"',
            "X-Content-Type-Options": "nosniff",
        },
    )


@router.post("/payment-proofs/{proof_id}/retry-ocr")
def retry_payment_proof_ocr(
    proof_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Any:
    """Queue a pending proof for a fresh OCR pass without changing money."""
    if not is_invoice_approver(current_user) or not has_module_permission(current_user, "billing", "edit"):
        raise HTTPException(status_code=403, detail="Only an Admin or Super Admin can retry payment-proof OCR")
    proof = db.query(PaymentProof).filter(PaymentProof.id == proof_id).with_for_update().first()
    if not proof:
        raise HTTPException(status_code=404, detail="Payment proof not found")
    if proof.status != "pending_verification":
        raise HTTPException(status_code=409, detail="Only a pending payment proof can be reprocessed")
    if proof.extraction_status in {"queued", "processing"}:
        return payment_proof_response(proof, include_ocr_text=True)

    proof.extraction_status = "queued"
    proof.extraction_attempt_count = 0
    proof.extraction_next_attempt_at = datetime.utcnow()
    proof.extraction_started_at = None
    proof.extraction_completed_at = None
    proof.extraction_last_error = None
    proof.ocr_provider = None
    proof.ocr_text = None
    proof.extracted_data_encrypted = None
    proof.extracted_data = {}
    proof.extraction_confidence = None
    proof.mismatch_flags = []
    proof.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(proof)
    return payment_proof_response(proof, include_ocr_text=True)


@router.post("/payment-proofs/{proof_id}/approve")
def approve_payment_proof(
    proof_id: int,
    payload: PaymentProofReview,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Any:
    if not is_invoice_approver(current_user) or not has_module_permission(current_user, "billing", "edit"):
        raise HTTPException(status_code=403, detail="Only an Admin or Super Admin can approve payment proof")
    proof = db.query(PaymentProof).filter(PaymentProof.id == proof_id).with_for_update().first()
    if not proof:
        raise HTTPException(status_code=404, detail="Payment proof not found")
    if proof.status == "approved":
        return payment_proof_response(proof, include_ocr_text=True)
    if proof.status != "pending_verification":
        raise HTTPException(status_code=409, detail=f"A {proof.status} payment proof cannot be approved")
    if proof.extraction_status not in REVIEWABLE_EXTRACTION_STATUSES:
        raise HTTPException(status_code=409, detail="OCR processing is still in progress. Review the proof when processing finishes")
    if not proof.invoice_id:
        raise HTTPException(status_code=409, detail="Use the service quotation review endpoint for this proof")
    invoice = db.query(Invoice).filter(Invoice.id == proof.invoice_id).with_for_update().first()
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")
    require_invoice_approved(invoice)
    if invoice.status == InvoiceStatus.CANCELLED:
        raise HTTPException(status_code=409, detail="A cancelled invoice cannot receive payment")

    payment_transaction, receipt_delivery = _apply_invoice_payment_locked(
        db,
        invoice,
        amount=_money(proof.claimed_amount),
        payment_method=proof.payment_method,
        notes=payload.notes or proof.notes or f"Approved payment proof #{proof.id}",
        user=current_user,
        card_brand=proof.card_brand,
        card_last4=proof.card_last4,
    )
    db.flush()
    proof.status = "approved"
    proof.reviewed_by_id = current_user.id
    proof.reviewed_at = datetime.utcnow()
    proof.review_notes = payload.notes
    proof.invoice_transaction_id = payment_transaction.id if payment_transaction else None
    proof.updated_at = datetime.utcnow()
    add_invoice_transaction(
        db,
        invoice,
        "payment_proof_approved",
        0,
        proof.payment_method,
        f"Payment proof #{proof.id} approved by {current_user.full_name or current_user.username}",
        current_user,
        "APR",
    )
    if proof.submitted_by_id != current_user.id:
        create_notification(
            db,
            user_id=proof.submitted_by_id,
            title="Payment proof approved",
            message=f"Payment proof #{proof.id} for {invoice.invoice_number} was approved.",
            notification_type="billing",
            link_url=f"/billing?search={invoice.invoice_number}",
            actor_id=current_user.id,
        )
    db.commit()
    if receipt_delivery:
        deliver_payment_receipt(db, receipt_delivery.id)
    db.refresh(proof)
    return payment_proof_response(proof, include_ocr_text=True)


@router.post("/payment-proofs/{proof_id}/reject")
def reject_payment_proof(
    proof_id: int,
    payload: PaymentProofReview,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Any:
    if not is_invoice_approver(current_user) or not has_module_permission(current_user, "billing", "edit"):
        raise HTTPException(status_code=403, detail="Only an Admin or Super Admin can reject payment proof")
    if not (payload.notes or "").strip():
        raise HTTPException(status_code=400, detail="A rejection reason is required")
    proof = db.query(PaymentProof).filter(PaymentProof.id == proof_id).with_for_update().first()
    if not proof:
        raise HTTPException(status_code=404, detail="Payment proof not found")
    if proof.status == "rejected":
        return payment_proof_response(proof, include_ocr_text=True)
    if proof.status != "pending_verification":
        raise HTTPException(status_code=409, detail=f"A {proof.status} payment proof cannot be rejected")
    proof.status = "rejected"
    if proof.extraction_status in {"queued", "retry", "processing"}:
        proof.extraction_status = "cancelled"
        proof.extraction_started_at = None
        proof.extraction_next_attempt_at = None
    proof.reviewed_by_id = current_user.id
    proof.reviewed_at = datetime.utcnow()
    proof.review_notes = payload.notes.strip()
    proof.updated_at = datetime.utcnow()
    if proof.invoice:
        add_invoice_transaction(
            db,
            proof.invoice,
            "payment_proof_rejected",
            0,
            proof.payment_method,
            f"Payment proof #{proof.id} rejected: {proof.review_notes}",
            current_user,
            "REJ",
        )
        if proof.submitted_by_id != current_user.id:
            create_notification(
                db,
                user_id=proof.submitted_by_id,
                title="Payment proof rejected",
                message=f"Payment proof #{proof.id} for {proof.invoice.invoice_number} was rejected: {proof.review_notes}",
                notification_type="billing",
                link_url=f"/billing?search={proof.invoice.invoice_number}",
                actor_id=current_user.id,
            )
    db.commit()
    db.refresh(proof)
    return payment_proof_response(proof, include_ocr_text=True)
