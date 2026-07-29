from datetime import datetime
from decimal import Decimal
import json
from typing import Any

from fastapi import HTTPException, status
from sqlalchemy.orm import Query, Session

from app.models.invoice import Invoice, InvoiceStatus
from app.models.user import User, UserRole
from app.utils.invoice_editing import parse_invoice_edit_metadata
from app.utils.invoice_ledger import add_invoice_transaction


BILLING_APPROVAL_PENDING = "pending"
BILLING_APPROVAL_APPROVED = "approved"

FACILITY_BILLING_ROLES = {
    UserRole.FACILITY_ADMIN,
    UserRole.FACILITY_MANAGER,
    UserRole.CLIENT,
}
INVOICE_PAYER_ROLES = {
    UserRole.SUPERADMIN,
    UserRole.FACILITY_ADMIN,
    UserRole.FACILITY_MANAGER,
    UserRole.CLIENT,
}
SCALAR_FINANCIAL_EDIT_FIELDS = {
    "subtotal",
    "tax_amount",
    "discount_amount",
    "total_amount",
}
STRUCTURED_FINANCIAL_EDIT_FIELDS = {
    "line_items",
    "summary_rows",
}
SOURCE_FINANCIAL_EDIT_FIELDS = {
    "travel_charges",
    "service_charges",
}


def _money(value: Any) -> Decimal:
    if value in (None, ""):
        return Decimal("0")
    return Decimal(str(value))


def is_invoice_approver(user: User) -> bool:
    return user.role == UserRole.SUPERADMIN or (
        user.role == UserRole.ADMIN and user.facility_id is None
    )


def is_invoice_payer(user: User) -> bool:
    return user.role in INVOICE_PAYER_ROLES or (
        user.role == UserRole.ADMIN and user.facility_id is not None
    )


def is_facility_billing_user(user: User) -> bool:
    return user.role in FACILITY_BILLING_ROLES or (
        user.role == UserRole.ADMIN and user.facility_id is not None
    )


def scope_invoice_approval_visibility(query: Query, user: User) -> Query:
    """Hide unapproved invoices from customer-facing facility accounts."""
    if is_facility_billing_user(user):
        return query.filter(Invoice.billing_approval_status == BILLING_APPROVAL_APPROVED)
    return query


def approval_response(invoice: Invoice) -> dict[str, Any]:
    approver = getattr(invoice, "approved_for_billing_by", None)
    return {
        "billing_approval_status": invoice.billing_approval_status or BILLING_APPROVAL_PENDING,
        "approved_for_billing_by_id": invoice.approved_for_billing_by_id,
        "approved_for_billing_by_name": approver.full_name if approver else None,
        "approved_for_billing_at": invoice.approved_for_billing_at,
        "approved_total_amount": invoice.approved_total_amount,
        "approval_invalidated_at": invoice.approval_invalidated_at,
    }


def require_invoice_approved(invoice: Invoice) -> None:
    if invoice.billing_approval_status != BILLING_APPROVAL_APPROVED:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Invoice must be approved for billing before payment can be recorded",
        )


def require_invoice_payer(user: User) -> None:
    if not is_invoice_payer(user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="This role cannot record an invoice payment",
        )


def _canonical_json(value: Any) -> str:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), default=str)


def has_financial_edits(invoice: Invoice, update_data: dict[str, Any]) -> bool:
    """Return true only when submitted financial content actually changes."""
    for field in SCALAR_FINANCIAL_EDIT_FIELDS.intersection(update_data):
        if _money(update_data[field]) != _money(getattr(invoice, field, None)):
            return True

    metadata = parse_invoice_edit_metadata(getattr(invoice, "notes", None))
    for field in STRUCTURED_FINANCIAL_EDIT_FIELDS.intersection(update_data):
        submitted = update_data[field] or []
        existing = metadata.get(field)
        if not isinstance(existing, list):
            existing = []
        if _canonical_json(submitted) != _canonical_json(existing):
            return True

    # These source-specific fees are not first-class invoice columns. When
    # supplied, the source endpoint is intentionally recalculating pricing.
    return bool(SOURCE_FINANCIAL_EDIT_FIELDS.intersection(update_data))


def ensure_financial_edit_allowed(invoice: Invoice, update_data: dict[str, Any]) -> None:
    if has_financial_edits(invoice, update_data) and (
        _money(invoice.amount_paid) > 0 or invoice.status == InvoiceStatus.PAID
    ):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Financial details cannot be changed after a payment has been recorded",
        )


def validate_requested_payment_status(
    invoice: Invoice,
    update_data: dict[str, Any],
    requested_paid: Decimal,
) -> None:
    requested_status = update_data.get("status")
    if hasattr(requested_status, "value"):
        requested_status = requested_status.value
    if requested_status == InvoiceStatus.PAID.value and requested_paid < _money(invoice.total_amount):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="A paid invoice must have its full total recorded as paid",
        )
    if requested_status == InvoiceStatus.PARTIALLY_PAID.value and not (
        Decimal("0") < requested_paid < _money(invoice.total_amount)
    ):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="A partially paid invoice must have a payment below its total",
        )
    if requested_status == InvoiceStatus.CANCELLED.value and _money(invoice.amount_paid) > 0:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An invoice with recorded payments cannot be cancelled",
        )


def invalidate_invoice_approval(
    db: Session,
    invoice: Invoice,
    user: User,
    *,
    reason: str = "Invoice financial details changed",
) -> bool:
    if invoice.billing_approval_status != BILLING_APPROVAL_APPROVED:
        return False
    invoice.billing_approval_status = BILLING_APPROVAL_PENDING
    invoice.approved_for_billing_by_id = None
    invoice.approved_for_billing_at = None
    invoice.approved_total_amount = None
    invoice.approval_invalidated_at = datetime.utcnow()
    if getattr(invoice, "sales_quotation_id", None):
        # Authorization is consent for one exact approved balance. Financial
        # edits invalidate that consent so it can never drift to a new amount.
        from app.models.sales import SalesPaymentAuthorization

        (
            db.query(SalesPaymentAuthorization)
            .filter(
                SalesPaymentAuthorization.invoice_id == invoice.id,
                SalesPaymentAuthorization.status.in_(["requested", "submitted"]),
            )
            .update(
                {
                    SalesPaymentAuthorization.status: "invalidated",
                    SalesPaymentAuthorization.updated_at: datetime.utcnow(),
                },
                synchronize_session=False,
            )
        )
    add_invoice_transaction(
        db,
        invoice,
        "billing_approval_invalidated",
        invoice.total_amount,
        description=reason,
        user=user,
        reference_prefix="BIL",
    )
    return True


def approve_invoice_for_billing(db: Session, invoice: Invoice, user: User) -> None:
    if not is_invoice_approver(user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only a super admin or admin can approve an invoice for billing",
        )
    if invoice.status == InvoiceStatus.CANCELLED:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A cancelled invoice cannot be approved for billing",
        )
    if (
        invoice.billing_approval_status == BILLING_APPROVAL_APPROVED
        and _money(invoice.approved_total_amount) == _money(invoice.total_amount)
    ):
        return

    invoice.billing_approval_status = BILLING_APPROVAL_APPROVED
    invoice.approved_for_billing_by_id = user.id
    invoice.approved_for_billing_at = datetime.utcnow()
    invoice.approved_total_amount = _money(invoice.total_amount)
    invoice.approval_invalidated_at = None
    invoice.updated_at = datetime.utcnow()
    add_invoice_transaction(
        db,
        invoice,
        "billing_approved",
        invoice.total_amount,
        description=f"Invoice {invoice.invoice_number} approved for billing",
        user=user,
        reference_prefix="BIL",
    )
