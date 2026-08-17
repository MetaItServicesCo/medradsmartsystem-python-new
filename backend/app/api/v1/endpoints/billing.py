from datetime import datetime
from decimal import Decimal
from typing import Any, Optional
from uuid import uuid4

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, Response, UploadFile
from pydantic import BaseModel
from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload
from sqlalchemy.orm.attributes import flag_modified

from app.core.deps import get_current_user
from app.db.base import get_db
from app.models.inspection import Inspection, InspectionBatch, InspectionStatus
from app.models.invoice import Invoice, InvoiceStatus, InvoiceType, PaymentProof
from app.models.sales import SalesPaymentAuthorization
from app.models.service_request import ServiceRequest, ServiceRequestQuotation
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
    add_invoice_transaction,
    record_payment_delta,
    record_status_change,
    transaction_response,
)
from app.utils.payment_receipts import deliver_payment_receipt, queue_rental_payment_receipt
from app.utils.notifications import create_notification, create_notifications, notify_admins
from app.utils.permission_deps import require_module_access
from app.utils.permissions import has_module_permission
from app.utils.payment_idempotency import (
    get_or_create_operation,
    mark_operation_succeeded,
    payment_fingerprint,
    replay_or_raise,
)
from app.utils.sales_inventory import (
    ensure_sales_inventory_available,
    fulfill_sales_invoice_inventory,
)
from app.utils.payment_proofs import (
    delete_payment_proof_file,
    load_payment_proof,
    normalize_non_card_method,
    payment_proof_response,
    payment_proof_sha256,
    read_and_validate_payment_proof,
    store_encrypted_payment_proof,
)
from app.utils.rate_limit import enforce_rate_limit


router = APIRouter(dependencies=[Depends(require_module_access("billing"))])


class InvoicePaymentCreate(BaseModel):
    amount: Decimal
    payment_method: str
    notes: Optional[str] = None
    idempotency_key: Optional[str] = None


class PaymentProofReview(BaseModel):
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


def _invoice_payment_response(invoice: Invoice) -> dict[str, Any]:
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


def _apply_invoice_payment_locked(
    db: Session,
    invoice: Invoice,
    *,
    amount: Decimal,
    payment_method: str,
    notes: Optional[str],
    user: User,
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
        )
    return payment_transaction, receipt_delivery


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

    payment_transaction, receipt_delivery = _apply_invoice_payment_locked(
        db,
        invoice,
        amount=payload.amount,
        payment_method=normalized_method,
        notes=payload.notes,
        user=current_user,
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
    if proof.extraction_status not in {"completed", "failed"}:
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
