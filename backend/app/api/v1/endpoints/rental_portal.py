"""Public, token-authenticated rental portal — mirrors the Sales client flow.

A customer opens the secure link emailed by staff, views their agreement and
invoices, saves a card on file for auto-charge, and pays invoices online.
No login required; access is granted only by the agreement's hashed token.
"""

import hashlib
from datetime import date, datetime
from decimal import Decimal
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.encoders import jsonable_encoder
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session, selectinload, joinedload

from app.db.base import get_db
from app.core.config import settings
from app.core.deps import get_current_user
from app.models.invoice import Invoice, InvoiceStatus
from app.models.payment_operation import PaymentOperation
from app.models.rental import (
    Rental, RentalItem, RentalAgreementAcceptance,
    RentalExtensionRequest, RentalExtensionStatus, RentalStatus,
)
from app.models.user import User, UserRole
from app.utils.facility_access import get_user_facility_ids
from app.utils.invoice_editing import editable_line_items, strip_invoice_edit_metadata
from app.utils.invoice_ledger import add_invoice_transaction, record_payment_delta
from app.utils.rental_billing import (
    _initial_invoice_amounts, advance_billing_date, billing_period_date,
    effective_period_count, projected_billing_schedule,
    invoice_amounts_for_period, apply_projected_discount_to_unpaid_invoice,
)
from app.utils.rental_extensions import OPEN_EXTENSION_STATUSES, current_extension, extension_response
from app.utils.notifications import notify_admins
from app.utils.square_payments import (
    square_public_config,
    square_is_configured,
    create_square_card_on_file,
    create_square_payment,
    SquareRequestError,
    minor_units_to_amount,
)
from app.utils.payment_idempotency import (
    get_or_create_operation,
    mark_operation_failed,
    mark_operation_succeeded,
    payment_fingerprint,
    replay_or_raise,
)

router = APIRouter()

RENTAL_ACCOUNT_ROLES = {
    UserRole.FACILITY_ADMIN,
    UserRole.FACILITY_MANAGER,
    UserRole.CLIENT,
}


def _is_rental_account_user(current_user: User) -> bool:
    return current_user.role in RENTAL_ACCOUNT_ROLES or (
        current_user.role == UserRole.ADMIN and current_user.facility_id is not None
    )


def _token_hash(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def _find_rental_by_token(db: Session, token: str, for_update: bool = False) -> Rental:
    query = (
        db.query(Rental)
        .options(selectinload(Rental.items).joinedload(RentalItem.part))
        .filter(Rental.access_token_hash == _token_hash(token))
    )
    if for_update:
        query = query.with_for_update(of=Rental)
    rental = query.first()
    if not rental:
        raise HTTPException(status_code=404, detail="This rental link is invalid")
    if rental.token_expires_at and rental.token_expires_at < datetime.utcnow():
        raise HTTPException(status_code=410, detail="This rental link has expired")
    return rental


def _find_rental_for_account(
    db: Session,
    rental_id: int,
    current_user: User,
    for_update: bool = False,
) -> Rental:
    """Load a rental for the signed-in customer portal.

    This is intentionally role and facility scoped. Rental module permissions
    grant access to the page, but never grant a customer internal rental
    operations or visibility into another facility's agreement.
    """
    if not _is_rental_account_user(current_user):
        raise HTTPException(status_code=403, detail="Customer rental access is limited to facility accounts")
    accessible_facilities = get_user_facility_ids(db, current_user)
    query = (
        db.query(Rental)
        .options(selectinload(Rental.items).joinedload(RentalItem.part))
        .filter(Rental.id == rental_id)
    )
    if for_update:
        query = query.with_for_update(of=Rental)
    rental = query.first()
    legacy_item_access = bool(
        rental
        and rental.facility_id is None
        and any(
            item.part and item.part.facility_id in accessible_facilities
            for item in (rental.items or [])
        )
    )
    if not rental or (
        rental.facility_id not in accessible_facilities
        and not legacy_item_access
    ):
        raise HTTPException(status_code=404, detail="Rental agreement not found")
    return rental


def _require_primary_account_recipient(rental: Rental, current_user: User) -> None:
    """Keep agreement decisions and payments with the selected primary recipient."""
    if rental.customer_user_id != current_user.id:
        raise HTTPException(
            status_code=403,
            detail="Only the primary rental recipient can sign, pay, or manage this agreement",
        )


def _item_view(item: RentalItem) -> dict[str, Any]:
    return {
        "id": item.id,
        "part_number": item.part_number or (item.part.part_number if item.part else None),
        "part_description": item.part_description or (item.part.description if item.part else None),
        "quantity": item.quantity,
        "rental_rate": item.rental_rate,
        "shipping_fee": item.shipping_fee,
        "setup_fee": item.setup_fee,
        "labor_fee": item.labor_fee,
        "removal_fee": item.removal_fee,
        "security_deposit": item.security_deposit,
        "deposit_status": item.deposit_status,
        "deposit_settled_amount": item.deposit_settled_amount,
        "item_condition": item.item_condition,
        "item_status": item.item_status,
    }


def _invoice_view(invoice: Invoice) -> dict[str, Any]:
    return {
        "id": invoice.id,
        "invoice_number": invoice.invoice_number,
        "rental_period_number": invoice.rental_period_number,
        "rental_period_start": invoice.rental_period_start,
        "rental_period_end": invoice.rental_period_end,
        "payment_attempt_count": invoice.payment_attempt_count,
        "next_payment_retry_at": invoice.next_payment_retry_at,
        "subtotal": invoice.subtotal,
        "tax_amount": invoice.tax_amount,
        "discount_amount": invoice.discount_amount,
        "total_amount": invoice.total_amount,
        "amount_paid": invoice.amount_paid,
        "balance_due": invoice.balance_due,
        "status": invoice.status.value if hasattr(invoice.status, "value") else invoice.status,
        "issue_date": invoice.issue_date,
        "due_date": invoice.due_date,
        "notes": strip_invoice_edit_metadata(invoice.notes),
        "line_items": editable_line_items(invoice.notes),
    }


def _acceptance_view(acceptance: Optional[RentalAgreementAcceptance]) -> Optional[dict[str, Any]]:
    if not acceptance:
        return None
    return {
        "accepted_by_name": acceptance.accepted_by_name,
        "signature_name": acceptance.signature_name,
        "terms_accepted": acceptance.terms_accepted,
        "agreement_revision": acceptance.agreement_revision,
        "accepted_at": acceptance.accepted_at,
    }


def _agreement_view(rental: Rental) -> dict[str, Any]:
    return {
        "rental_number": rental.rental_number,
        "revision": rental.revision or 1,
        "customer_name": rental.customer_name,
        "customer_email": rental.customer_email,
        "customer_address": rental.customer_address,
        "billing_frequency": rental.billing_frequency.value if hasattr(rental.billing_frequency, "value") else rental.billing_frequency,
        "start_date": rental.start_date,
        "end_date": rental.end_date,
        "next_bill_date": rental.next_bill_date,
        "committed_periods": rental.committed_periods,
        "periods_billed": rental.periods_billed,
        "discount_type": rental.discount_type,
        "discount_value": rental.discount_value,
        "discount_application_mode": rental.discount_application_mode,
        "discount_invoice_number": rental.discount_invoice_number,
        "discount_continue": rental.discount_continue,
        "discount_requires_card": rental.discount_requires_card,
        "effective_periods": effective_period_count(rental),
        "security_deposit": rental.security_deposit,
        "status": rental.status.value if hasattr(rental.status, "value") else rental.status,
        "auto_charge": rental.auto_charge,
        "auto_charge_authorized": bool(rental.auto_charge_authorized_at),
        "auto_charge_authorized_at": rental.auto_charge_authorized_at,
        "auto_charge_authorized_by": rental.auto_charge_authorized_by,
        "terms_and_conditions": rental.terms_and_conditions,
        "items": [_item_view(item) for item in rental.items or []],
        "has_card_on_file": bool(rental.square_card_id),
        "saved_card": (
            {
                "brand": rental.square_card_brand,
                "last4": rental.square_card_last4,
                "exp_month": rental.square_card_exp_month,
                "exp_year": rental.square_card_exp_year,
            }
            if rental.square_card_id
            else None
        ),
    }


def _pricing_view(rental: Rental, initial_invoice: Optional[Invoice]) -> dict[str, Any]:
    amounts = _initial_invoice_amounts(rental)
    tax = Decimal(str(initial_invoice.tax_amount if initial_invoice else amounts["tax"]))
    # Rental discounts are applied after tax, matching Sales. Use the full
    # taxable rental amount when allocating the authoritative invoice tax
    # across the customer-facing breakdown.
    taxable_rental = max(Decimal("0"), amounts["rental"])
    taxable_total = taxable_rental + amounts["shipping"] + amounts["setup"] + amounts["removal"]
    if taxable_total > 0:
        rental_tax = (tax * taxable_rental / taxable_total).quantize(Decimal("0.01"))
        shipping_tax = (tax * amounts["shipping"] / taxable_total).quantize(Decimal("0.01"))
        removal_tax = (tax * amounts["removal"] / taxable_total).quantize(Decimal("0.01"))
        setup_tax = tax - rental_tax - shipping_tax - removal_tax
    else:
        rental_tax = shipping_tax = setup_tax = removal_tax = Decimal("0")
    return {
        **amounts,
        "tax": tax,
        "rental_tax": rental_tax,
        "shipping_tax": shipping_tax,
        "setup_tax": setup_tax,
        "removal_tax": removal_tax,
        "grand_total": Decimal(str(initial_invoice.total_amount if initial_invoice else amounts["total"])),
    }


def _require_signed(rental: Rental) -> RentalAgreementAcceptance:
    acceptance = rental.acceptance
    if not acceptance or acceptance.agreement_revision != (rental.revision or 1):
        raise HTTPException(status_code=409, detail="Sign and approve this rental agreement before continuing")
    return acceptance


def _store_card_result(rental: Rental, result: dict[str, Any], authorize_auto_charge: bool, authorized_by: str) -> None:
    rental.square_card_id = result["card_id"]
    rental.square_customer_id = result["customer_id"]
    rental.square_card_brand = result.get("card_brand")
    rental.square_card_last4 = result.get("last_4")
    rental.square_card_exp_month = result.get("exp_month")
    rental.square_card_exp_year = result.get("exp_year")
    rental.failed_charge_count = 0
    if authorize_auto_charge:
        rental.auto_charge = True
        rental.auto_charge_authorized_at = datetime.utcnow()
        rental.auto_charge_authorized_by = authorized_by


def _portal_response(
    db: Session,
    rental: Rental,
    *,
    can_transact: bool = True,
) -> dict[str, Any]:
    invoices = (
        db.query(Invoice)
        .filter(Invoice.rental_id == rental.id)
        .order_by(Invoice.id.asc())
        .all()
    )
    invoice_by_period = {
        int(invoice.rental_period_number): invoice
        for invoice in invoices
        if invoice.rental_period_number is not None
    }
    # Old invoices predate explicit period identity. Preserve their records and
    # map them by creation order only for display; new invoices carry immutable
    # period numbers enforced by the database.
    unassigned_periods = iter(
        period for period in range(1, effective_period_count(rental) + 1)
        if period not in invoice_by_period
    )
    invoice_period_by_id = {invoice.id: int(invoice.rental_period_number) for invoice in invoices if invoice.rental_period_number is not None}
    for invoice in invoices:
        if invoice.rental_period_number is None:
            inferred_period = next(unassigned_periods, None)
            if inferred_period is not None:
                invoice_by_period[inferred_period] = invoice
                invoice_period_by_id[invoice.id] = inferred_period
    schedule = []
    for projected in projected_billing_schedule(rental):
        invoice = invoice_by_period.get(int(projected["period"]))
        schedule.append({
            **projected,
            "billing_date": invoice.rental_period_start if invoice and invoice.rental_period_start else projected["billing_date"],
            "period_end": invoice.rental_period_end if invoice and invoice.rental_period_end else projected["period_end"],
            "discount": invoice.discount_amount if invoice else projected["discount"],
            "tax": invoice.tax_amount if invoice else projected["tax"],
            "total": invoice.total_amount if invoice else projected["total"],
            "status": (
                invoice.status.value if invoice and hasattr(invoice.status, "value") else invoice.status
            ) if invoice else "upcoming",
            "invoice_id": invoice.id if invoice else None,
            "invoice_number": invoice.invoice_number if invoice else None,
            "balance_due": invoice.balance_due if invoice else projected["total"],
        })

    outstanding = next(
        (
            invoice for invoice in invoices
            if invoice.status != InvoiceStatus.PAID and Decimal(str(invoice.balance_due or 0)) > 0
        ),
        None,
    )
    if outstanding:
        next_payment = {
            "period": invoice_period_by_id.get(outstanding.id),
            "billing_date": outstanding.due_date,
            "amount": outstanding.balance_due,
            "tax": outstanding.tax_amount,
            "discount": outstanding.discount_amount,
            "status": "due",
            "invoice_id": outstanding.id,
            "invoice_number": outstanding.invoice_number,
        }
    else:
        upcoming = next((period for period in schedule if period["status"] == "upcoming"), None)
        next_payment = ({
            "period": upcoming["period"],
            "billing_date": upcoming["billing_date"],
            "amount": upcoming["total"],
            "tax": upcoming["tax"],
            "discount": upcoming["discount"],
            "status": "scheduled",
            "invoice_id": None,
            "invoice_number": None,
        } if upcoming else None)

    return {
        "company_name": "Mr. BioMed Tech Services",
        "agreement": _agreement_view(rental),
        "acceptance": _acceptance_view(rental.acceptance),
        "can_transact": can_transact,
        "can_sign": can_transact and rental.acceptance is None,
        "invoices": [_invoice_view(invoice) for invoice in invoices],
        "billing_schedule": schedule,
        "next_payment": next_payment,
        "extension": extension_response(current_extension(rental)),
        "can_request_extension": bool(
            can_transact
            and rental.acceptance
            and rental.status == RentalStatus.ACTIVE
            and not any(item.status in OPEN_EXTENSION_STATUSES for item in (rental.extensions or []))
        ),
        "square": square_public_config(),
    }


class RequestExtensionIn(BaseModel):
    requested_end_date: Optional[date] = None
    additional_periods: Optional[int] = Field(default=None, ge=1, le=1200)
    reason: Optional[str] = Field(default=None, max_length=2000)


class AcceptExtensionIn(BaseModel):
    signature_name: str = Field(min_length=2, max_length=200)
    terms_accepted: bool
    continue_auto_charge: bool = False


def _request_extension(
    rental: Rental,
    payload: RequestExtensionIn,
    db: Session,
    requester_name: str,
    requester_user_id: Optional[int] = None,
) -> Any:
    _require_signed(rental)
    if rental.status != RentalStatus.ACTIVE:
        raise HTTPException(status_code=409, detail="Only an active rental agreement can be extended")
    if any(item.status in OPEN_EXTENSION_STATUSES for item in (rental.extensions or [])):
        raise HTTPException(status_code=409, detail="An extension request is already under review")
    if payload.requested_end_date is None and payload.additional_periods is None:
        raise HTTPException(status_code=422, detail="Enter a requested end date or number of additional periods")
    requested_end_date = payload.requested_end_date or advance_billing_date(
        rental.end_date,
        rental.billing_frequency.value if hasattr(rental.billing_frequency, "value") else str(rental.billing_frequency),
        int(payload.additional_periods or 0),
    )
    if requested_end_date <= rental.end_date:
        raise HTTPException(status_code=422, detail="The requested end date must be after the current agreement end date")

    sequence = max((item.sequence for item in (rental.extensions or [])), default=0) + 1
    extension = RentalExtensionRequest(
        rental_id=rental.id,
        sequence=sequence,
        status=RentalExtensionStatus.REQUESTED.value,
        requested_end_date=requested_end_date,
        requested_additional_periods=payload.additional_periods,
        request_reason=(payload.reason or "").strip() or None,
        requested_by_name=requester_name,
        requested_by_user_id=requester_user_id,
        original_end_date=rental.end_date,
        original_committed_periods=rental.committed_periods,
    )
    db.add(extension)
    db.flush()
    history = list(rental.history or [])
    history.append({
        "action": "extension_requested",
        "by": requester_name,
        "user_id": requester_user_id,
        "at": datetime.utcnow().isoformat(),
        "details": {
            "extension_id": extension.id,
            "requested_end_date": requested_end_date.isoformat(),
            "additional_periods": payload.additional_periods,
            "reason": extension.request_reason,
        },
    })
    rental.history = history
    notify_admins(
        db,
        title=f"Rental extension requested: {rental.rental_number}",
        message=f"{requester_name} requested an extension for {rental.rental_number}.",
        notification_type="rental_extension",
        link_url=f"/rentals/agreements?search={rental.rental_number}",
        actor_id=requester_user_id,
    )
    db.commit()
    db.refresh(rental)
    return _portal_response(db, rental)


def _find_extension_by_token(db: Session, token: str, for_update: bool = False) -> RentalExtensionRequest:
    query = (
        db.query(RentalExtensionRequest)
        .options(selectinload(RentalExtensionRequest.rental).selectinload(Rental.items))
        .filter(RentalExtensionRequest.access_token_hash == _token_hash(token))
    )
    if for_update:
        query = query.with_for_update(of=RentalExtensionRequest)
    extension = query.first()
    if not extension:
        raise HTTPException(status_code=404, detail="This rental extension link is invalid")
    if extension.token_expires_at and extension.token_expires_at < datetime.utcnow():
        raise HTTPException(status_code=410, detail="This rental extension link has expired")
    return extension


def _accept_extension(
    extension: RentalExtensionRequest,
    payload: AcceptExtensionIn,
    request: Request,
    db: Session,
    current_user: Optional[User] = None,
) -> Any:
    if extension.status == RentalExtensionStatus.ACCEPTED.value:
        return _portal_response(db, extension.rental)
    if extension.status != RentalExtensionStatus.OFFERED.value:
        raise HTTPException(status_code=409, detail="This extension offer is not available for acceptance")
    if not payload.terms_accepted:
        raise HTTPException(status_code=422, detail="Accept the extension terms before signing")
    rental = db.query(Rental).filter(Rental.id == extension.rental_id).with_for_update().first()
    if not rental or rental.status != RentalStatus.ACTIVE:
        raise HTTPException(status_code=409, detail="The rental agreement is no longer active")
    if not extension.offered_end_date or extension.offered_end_date <= rental.end_date:
        raise HTTPException(status_code=409, detail="The extension no longer increases the current agreement term")
    if payload.continue_auto_charge and not rental.square_card_id:
        raise HTTPException(status_code=422, detail="A saved card is required to continue automatic payments")

    old_end = rental.end_date
    old_periods = rental.committed_periods
    signer = payload.signature_name.strip()
    rental.end_date = extension.offered_end_date
    if extension.offered_total_periods is not None:
        rental.committed_periods = extension.offered_total_periods
    rental.auto_charge = bool(payload.continue_auto_charge and rental.square_card_id)
    if not rental.auto_charge:
        rental.auto_charge_authorized_at = None
        rental.auto_charge_authorized_by = None
    next_period = int(rental.periods_billed or 0) + 1
    if next_period <= effective_period_count(rental):
        rental.next_bill_date = billing_period_date(rental, next_period)

    now = datetime.utcnow()
    extension.status = RentalExtensionStatus.ACCEPTED.value
    extension.accepted_by_name = signer
    extension.signature_name = signer
    extension.terms_accepted = True
    extension.continue_auto_charge = rental.auto_charge
    extension.accepted_at = now
    extension.activated_at = now
    forwarded = request.headers.get("x-forwarded-for", "").split(",")[0].strip()
    extension.ip_address = forwarded or (request.client.host if request.client else None)
    extension.user_agent = request.headers.get("user-agent", "")[:2000] or None
    extension.amendment_snapshot = jsonable_encoder({
        "rental_number": rental.rental_number,
        "extension_sequence": extension.sequence,
        "previous_end_date": old_end,
        "new_end_date": rental.end_date,
        "previous_committed_periods": old_periods,
        "new_committed_periods": rental.committed_periods,
        "offered_terms": extension.offered_terms,
        "continue_auto_charge": rental.auto_charge,
        "signed_by": signer,
    })
    history = list(rental.history or [])
    history.append({
        "action": "extension_accepted",
        "by": signer,
        "user_id": current_user.id if current_user else None,
        "at": now.isoformat(),
        "details": extension.amendment_snapshot,
    })
    rental.history = history
    rental.updated_at = now
    notify_admins(
        db,
        title=f"Rental extension accepted: {rental.rental_number}",
        message=f"{signer} signed extension #{extension.sequence}.",
        notification_type="rental_extension",
        link_url=f"/rentals/agreements?search={rental.rental_number}",
        actor_id=current_user.id if current_user else None,
    )
    db.commit()
    db.refresh(rental)
    return _portal_response(db, rental)


def _cancel_extension(
    rental: Rental,
    extension: RentalExtensionRequest,
    db: Session,
    actor_name: str,
    actor_user_id: Optional[int] = None,
) -> Any:
    """Customer withdraws a pending extension (their own request, or an offer they decline).
    The live agreement is untouched; the signing link stops working immediately."""
    if extension.rental_id != rental.id:
        raise HTTPException(status_code=404, detail="Rental extension request not found")
    if extension.status not in OPEN_EXTENSION_STATUSES:
        raise HTTPException(status_code=409, detail="This extension request is no longer open")
    now = datetime.utcnow()
    extension.status = RentalExtensionStatus.CANCELLED.value
    extension.access_token_hash = None
    extension.updated_at = now
    history = list(rental.history or [])
    history.append({
        "action": "extension_cancelled",
        "by": actor_name,
        "user_id": actor_user_id,
        "at": now.isoformat(),
        "details": {"extension_id": extension.id, "by_role": "customer"},
    })
    rental.history = history
    notify_admins(
        db,
        title=f"Rental extension withdrawn: {rental.rental_number}",
        message=f"{actor_name} withdrew the extension for {rental.rental_number}.",
        notification_type="rental_extension",
        link_url=f"/rentals/agreements?search={rental.rental_number}",
        actor_id=actor_user_id,
    )
    db.commit()
    db.refresh(rental)
    return _portal_response(db, rental)


@router.get("/rentals/public/{token}")
def public_view_rental(token: str, db: Session = Depends(get_db)) -> Any:
    rental = _find_rental_by_token(db, token)
    return _portal_response(db, rental)


@router.post("/rentals/public/{token}/extensions")
def public_request_rental_extension(
    token: str,
    payload: RequestExtensionIn,
    db: Session = Depends(get_db),
) -> Any:
    rental = _find_rental_by_token(db, token, for_update=True)
    return _request_extension(rental, payload, db, rental.customer_name)


@router.post("/rentals/public/{token}/extensions/{extension_id}/accept")
def public_rental_link_accept_extension(
    token: str,
    extension_id: int,
    payload: AcceptExtensionIn,
    request: Request,
    db: Session = Depends(get_db),
) -> Any:
    rental = _find_rental_by_token(db, token, for_update=True)
    extension = (
        db.query(RentalExtensionRequest)
        .filter(RentalExtensionRequest.id == extension_id, RentalExtensionRequest.rental_id == rental.id)
        .with_for_update()
        .first()
    )
    if not extension:
        raise HTTPException(status_code=404, detail="Rental extension request not found")
    extension.rental = rental
    return _accept_extension(extension, payload, request, db)


@router.post("/rentals/public/{token}/extensions/{extension_id}/cancel")
def public_rental_link_cancel_extension(
    token: str,
    extension_id: int,
    db: Session = Depends(get_db),
) -> Any:
    rental = _find_rental_by_token(db, token, for_update=True)
    extension = (
        db.query(RentalExtensionRequest)
        .filter(RentalExtensionRequest.id == extension_id, RentalExtensionRequest.rental_id == rental.id)
        .with_for_update()
        .first()
    )
    if not extension:
        raise HTTPException(status_code=404, detail="Rental extension request not found")
    return _cancel_extension(rental, extension, db, rental.customer_name)


@router.get("/rentals/extensions/public/{token}")
def public_view_rental_extension(token: str, db: Session = Depends(get_db)) -> Any:
    extension = _find_extension_by_token(db, token)
    response = _portal_response(db, extension.rental)
    response["extension"] = extension_response(extension)
    return response


@router.post("/rentals/extensions/public/{token}/accept")
def public_accept_rental_extension(
    token: str,
    payload: AcceptExtensionIn,
    request: Request,
    db: Session = Depends(get_db),
) -> Any:
    extension = _find_extension_by_token(db, token, for_update=True)
    return _accept_extension(extension, payload, request, db)


@router.post("/rentals/extensions/public/{token}/cancel")
def public_cancel_rental_extension(
    token: str,
    db: Session = Depends(get_db),
) -> Any:
    extension = _find_extension_by_token(db, token, for_update=True)
    return _cancel_extension(extension.rental, extension, db, extension.rental.customer_name)


class SaveCardIn(BaseModel):
    source_id: str
    authorize_auto_charge: bool = False


@router.post("/rentals/public/{token}/save-card")
def public_save_rental_card(token: str, payload: SaveCardIn, db: Session = Depends(get_db)) -> Any:
    if not square_is_configured():
        raise HTTPException(status_code=400, detail="Card payments are not available")
    rental = _find_rental_by_token(db, token, for_update=True)
    acceptance = _require_signed(rental)
    try:
        result = create_square_card_on_file(
            source_id=payload.source_id,
            idempotency_key=f"rental-card-{rental.id}-{int(datetime.utcnow().timestamp())}",
            customer_name=rental.customer_name,
            customer_email=rental.customer_email,
        )
    except SquareRequestError as exc:
        raise HTTPException(status_code=exc.status_code, detail=str(exc))
    _store_card_result(rental, result, payload.authorize_auto_charge, acceptance.accepted_by_name)
    if payload.authorize_auto_charge:
        for invoice in db.query(Invoice).filter(Invoice.rental_id == rental.id).all():
            apply_projected_discount_to_unpaid_invoice(invoice, rental)
    rental.updated_at = datetime.utcnow()
    history = list(rental.history or [])
    history.append({
        "action": "card_saved",
        "by": rental.customer_name,
        "user_id": None,
        "at": datetime.utcnow().isoformat(),
        "details": {
            "last_4": result.get("last_4"),
            "brand": result.get("card_brand"),
            "auto_charge_authorized": payload.authorize_auto_charge,
        },
    })
    rental.history = history
    first_invoice = db.query(Invoice).filter(Invoice.rental_id == rental.id).order_by(Invoice.id.asc()).first()
    if first_invoice:
        add_invoice_transaction(
            db, first_invoice,
            "auto_charge_authorized" if payload.authorize_auto_charge else "card_saved",
            0, "credit_card",
            f"Card ending {result.get('last_4') or 'unknown'} saved"
            + (f"; automatic charges authorized by {acceptance.accepted_by_name}" if payload.authorize_auto_charge else ""),
            reference_prefix="AUTH" if payload.authorize_auto_charge else "CARD",
        )
    db.commit()
    db.refresh(rental)
    return _portal_response(db, rental)


class PayInvoiceIn(BaseModel):
    invoice_id: int
    source_id: str
    idempotency_key: Optional[str] = None
    save_card: bool = False
    authorize_auto_charge: bool = False


class AcceptRentalIn(BaseModel):
    signature_name: str = Field(min_length=2, max_length=200)
    terms_accepted: bool


def _accept_rental(
    rental: Rental,
    payload: AcceptRentalIn,
    request: Request,
    db: Session,
    current_user: Optional[User] = None,
) -> Any:
    if not payload.terms_accepted:
        raise HTTPException(status_code=422, detail="Accept the rental terms before signing")
    if rental.acceptance:
        if rental.acceptance.agreement_revision == (rental.revision or 1):
            return _portal_response(db, rental)
        raise HTTPException(status_code=409, detail="This rental agreement has a newer revision")

    invoices = db.query(Invoice).filter(Invoice.rental_id == rental.id).order_by(Invoice.id.asc()).all()
    initial_invoice = invoices[0] if invoices else None
    signer = payload.signature_name.strip()
    forwarded = request.headers.get("x-forwarded-for", "").split(",")[0].strip()
    acceptance = RentalAgreementAcceptance(
        rental_id=rental.id,
        accepted_by_name=signer,
        signature_name=signer,
        terms_accepted=True,
        agreement_revision=rental.revision or 1,
        agreement_snapshot=jsonable_encoder(_agreement_view(rental)),
        pricing_snapshot=jsonable_encoder(_pricing_view(rental, initial_invoice)),
        ip_address=forwarded or (request.client.host if request.client else None),
        user_agent=request.headers.get("user-agent", "")[:2000] or None,
        accepted_at=datetime.utcnow(),
    )
    db.add(acceptance)
    rental.acceptance = acceptance
    rental.updated_at = datetime.utcnow()
    history = list(rental.history or [])
    history.append({
        "action": "customer_signed",
        "by": signer,
        "user_id": current_user.id if current_user else None,
        "at": datetime.utcnow().isoformat(),
        "details": {"revision": rental.revision or 1},
    })
    rental.history = history
    if initial_invoice:
        add_invoice_transaction(
            db, initial_invoice, "agreement_signed", 0, None,
            f"Rental agreement revision {rental.revision or 1} signed by {signer}",
            current_user,
            reference_prefix="SIGN",
        )
    db.commit()
    db.refresh(rental)
    return _portal_response(db, rental)


def _pay_rental_invoice(
    rental: Rental,
    payload: PayInvoiceIn,
    db: Session,
    current_user: Optional[User] = None,
) -> Any:
    if not square_is_configured():
        raise HTTPException(status_code=400, detail="Card payments are not available")
    acceptance = _require_signed(rental)
    actor_name = current_user.full_name if current_user else acceptance.accepted_by_name
    if payload.authorize_auto_charge and not payload.save_card:
        raise HTTPException(status_code=422, detail="Save the card before authorizing automatic charges")
    invoice = (
        db.query(Invoice)
        .filter(Invoice.id == payload.invoice_id, Invoice.rental_id == rental.id)
        .with_for_update()
        .first()
    )
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")
    if invoice.status == InvoiceStatus.PAID or Decimal(str(invoice.balance_due or 0)) <= 0:
        return _portal_response(db, rental)
    payment_source = payload.source_id
    saved_card: Optional[dict[str, Any]] = None
    conditional_discount = bool(
        payload.save_card
        and payload.authorize_auto_charge
        and getattr(rental, "discount_requires_card", False)
    )
    payment_amount = Decimal(str(invoice.balance_due or 0))
    if conditional_discount:
        period_index = max(1, int(invoice.rental_period_number or 1))
        projected_amounts = invoice_amounts_for_period(rental, period_index, include_conditional=True)
        payment_amount = max(
            Decimal("0"),
            Decimal(str(projected_amounts["total"])) - Decimal(str(invoice.amount_paid or 0)),
        )
    operation_key = payload.idempotency_key or f"rental-payment-{rental.id}-{invoice.id}"
    operation, replay = get_or_create_operation(
        db,
        idempotency_key=operation_key,
        fingerprint=payment_fingerprint(
            "square_invoice_payment",
            invoice_id=invoice.id,
            amount=payment_amount,
            currency=settings.SQUARE_CURRENCY,
            attributes={
                "save_card": payload.save_card,
                "authorize_auto_charge": payload.authorize_auto_charge,
            },
        ),
        operation_type="square_invoice_payment",
        invoice_id=invoice.id,
        amount=payment_amount,
        currency=settings.SQUARE_CURRENCY,
        provider="square",
        created_by_id=current_user.id if current_user else None,
    )
    if replay:
        replay_or_raise(operation)
        db.refresh(rental)
        return _portal_response(db, rental)
    attempt = int(invoice.payment_attempt_count or 0) + 1
    invoice.payment_attempt_count = attempt
    invoice.last_payment_attempt_at = datetime.utcnow()
    add_invoice_transaction(
        db, invoice, "payment_attempt", invoice.balance_due, "credit_card",
        f"Customer online payment attempt {attempt} by {actor_name}", current_user, reference_prefix="ATT",
    )
    rental_id = rental.id
    invoice_id = invoice.id
    operation_id = operation.id
    invoice_number = invoice.invoice_number
    customer_name = rental.customer_name
    customer_email = rental.customer_email
    db.commit()
    try:
        if payload.save_card:
            card_key = hashlib.sha256(
                f"{rental.id}:{invoice.id}:{payload.idempotency_key or payload.source_id}".encode("utf-8")
            ).hexdigest()[:28]
            saved_card = create_square_card_on_file(
                source_id=payload.source_id,
                idempotency_key=f"rent-card-{card_key}",
                customer_name=customer_name,
                customer_email=customer_email,
            )
            payment_source = saved_card["card_id"]
        # A commitment catch-up discount can legitimately reduce a milestone
        # invoice to zero. Square rejects zero-dollar payments, but the saved
        # card authorization is still valid and the invoice must be settled.
        payment = (
            create_square_payment(
                source_id=payment_source,
                idempotency_key=operation_key,
                amount=payment_amount,
                invoice_number=invoice_number,
                customer_email=customer_email,
                customer_id=saved_card.get("customer_id") if saved_card else None,
            )
            if payment_amount > 0
            else {"id": f"discount-settled-{invoice.id}"}
        )
    except SquareRequestError as exc:
        rental = db.query(Rental).filter(Rental.id == rental_id).with_for_update().first()
        invoice = db.query(Invoice).filter(Invoice.id == invoice_id).with_for_update().first()
        operation = db.query(PaymentOperation).filter(PaymentOperation.id == operation_id).with_for_update().first()
        mark_operation_failed(operation, str(exc), unknown=exc.indeterminate)
        add_invoice_transaction(
            db, invoice, "payment_failed", invoice.balance_due, "credit_card",
            f"Customer online payment attempt {attempt} by {actor_name} failed: {exc}", current_user, reference_prefix="DEC",
        )
        history = list(rental.history or [])
        history.append({
            "action": "invoice_payment_failed",
            "by": actor_name,
            "user_id": current_user.id if current_user else None,
            "at": datetime.utcnow().isoformat(),
            "details": {"invoice": invoice.invoice_number, "attempt": attempt},
        })
        rental.history = history
        db.commit()
        raise HTTPException(status_code=exc.status_code, detail=str(exc))
    rental = db.query(Rental).filter(Rental.id == rental_id).with_for_update().first()
    invoice = db.query(Invoice).filter(Invoice.id == invoice_id).with_for_update().first()
    operation = db.query(PaymentOperation).filter(PaymentOperation.id == operation_id).with_for_update().first()
    payment_id = str(payment.get("id") or "").strip()
    if payment_amount > 0:
        payment_status = str(payment.get("status") or "").upper()
        paid_amount = minor_units_to_amount((payment.get("amount_money") or {}).get("amount"))
        paid_currency = str((payment.get("amount_money") or {}).get("currency") or "").upper()
        expected_currency = settings.SQUARE_CURRENCY.strip().upper() or "USD"
        if payment_status != "COMPLETED" or paid_amount != payment_amount or paid_currency != expected_currency:
            mark_operation_failed(operation, "Square returned an incomplete or mismatched rental payment", unknown=True)
            db.commit()
            raise HTTPException(
                status_code=409,
                detail="Square returned an incomplete or mismatched payment; the invoice was not changed",
            )
    previous_paid = invoice.amount_paid
    if saved_card:
        _store_card_result(rental, saved_card, payload.authorize_auto_charge, actor_name)
        if payload.authorize_auto_charge:
            apply_projected_discount_to_unpaid_invoice(invoice, rental)
    invoice.amount_paid = invoice.total_amount
    invoice.balance_due = Decimal("0")
    invoice.status = InvoiceStatus.PAID
    invoice.payment_method = "credit_card"
    invoice.next_payment_retry_at = None
    rental.failed_charge_count = 0
    payment_txn = record_payment_delta(db, invoice, previous_paid, invoice.total_amount, current_user, "credit_card", f"Online card payment by {actor_name} ({payment.get('id')})")
    if payment_txn is not None:
        payment_txn.reference_number = payment_id
    if saved_card:
        add_invoice_transaction(
            db, invoice,
            "auto_charge_authorized" if payload.authorize_auto_charge else "card_saved",
            0, "credit_card",
            f"Card ending {saved_card.get('last_4') or 'unknown'} saved"
            + (f"; automatic charges authorized by {actor_name}" if payload.authorize_auto_charge else ""),
            current_user,
            reference_prefix="AUTH" if payload.authorize_auto_charge else "CARD",
        )
    first_invoice = (
        db.query(Invoice.id)
        .filter(Invoice.rental_id == rental.id)
        .order_by(Invoice.id.asc())
        .first()
    )
    history = list(rental.history or [])
    history.append({
        "action": "initial_invoice_paid" if first_invoice and invoice.id == first_invoice[0] else "invoice_paid",
        "by": actor_name,
        "user_id": current_user.id if current_user else None,
        "at": datetime.utcnow().isoformat(),
        "details": {
            "invoice": invoice.invoice_number,
            "amount": str(invoice.total_amount),
            "card_saved": bool(saved_card),
            "auto_charge_authorized": bool(payload.authorize_auto_charge),
        },
    })
    rental.history = history
    rental.updated_at = datetime.utcnow()
    mark_operation_succeeded(
        operation,
        provider_reference=payment_id,
        response_data={"invoice_id": invoice.id, "payment_id": payment_id},
    )
    db.commit()
    db.refresh(rental)
    return _portal_response(db, rental)


@router.post("/rentals/public/{token}/accept")
def public_accept_rental(
    token: str,
    payload: AcceptRentalIn,
    request: Request,
    db: Session = Depends(get_db),
) -> Any:
    rental = _find_rental_by_token(db, token, for_update=True)
    return _accept_rental(rental, payload, request, db)


@router.post("/rentals/public/{token}/pay-invoice")
def public_pay_rental_invoice(token: str, payload: PayInvoiceIn, db: Session = Depends(get_db)) -> Any:
    rental = _find_rental_by_token(db, token, for_update=True)
    return _pay_rental_invoice(rental, payload, db)


@router.get("/rentals/account/{rental_id}")
def account_view_rental(
    rental_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Any:
    rental = _find_rental_for_account(db, rental_id, current_user)
    return _portal_response(
        db,
        rental,
        can_transact=rental.customer_user_id == current_user.id,
    )


@router.post("/rentals/account/{rental_id}/extensions")
def account_request_rental_extension(
    rental_id: int,
    payload: RequestExtensionIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Any:
    rental = _find_rental_for_account(db, rental_id, current_user, for_update=True)
    _require_primary_account_recipient(rental, current_user)
    return _request_extension(
        rental,
        payload,
        db,
        current_user.full_name or current_user.username,
        current_user.id,
    )


@router.post("/rentals/account/{rental_id}/extensions/{extension_id}/accept")
def account_accept_rental_extension(
    rental_id: int,
    extension_id: int,
    payload: AcceptExtensionIn,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Any:
    rental = _find_rental_for_account(db, rental_id, current_user, for_update=True)
    _require_primary_account_recipient(rental, current_user)
    extension = (
        db.query(RentalExtensionRequest)
        .filter(RentalExtensionRequest.id == extension_id, RentalExtensionRequest.rental_id == rental.id)
        .with_for_update()
        .first()
    )
    if not extension:
        raise HTTPException(status_code=404, detail="Rental extension request not found")
    extension.rental = rental
    return _accept_extension(extension, payload, request, db, current_user)


@router.post("/rentals/account/{rental_id}/extensions/{extension_id}/cancel")
def account_cancel_rental_extension(
    rental_id: int,
    extension_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Any:
    rental = _find_rental_for_account(db, rental_id, current_user, for_update=True)
    _require_primary_account_recipient(rental, current_user)
    extension = (
        db.query(RentalExtensionRequest)
        .filter(RentalExtensionRequest.id == extension_id, RentalExtensionRequest.rental_id == rental.id)
        .with_for_update()
        .first()
    )
    if not extension:
        raise HTTPException(status_code=404, detail="Rental extension request not found")
    return _cancel_extension(
        rental,
        extension,
        db,
        current_user.full_name or current_user.username,
        current_user.id,
    )


@router.post("/rentals/account/{rental_id}/accept")
def account_accept_rental(
    rental_id: int,
    payload: AcceptRentalIn,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Any:
    rental = _find_rental_for_account(db, rental_id, current_user, for_update=True)
    _require_primary_account_recipient(rental, current_user)
    return _accept_rental(rental, payload, request, db, current_user)


@router.post("/rentals/account/{rental_id}/pay-invoice")
def account_pay_rental_invoice(
    rental_id: int,
    payload: PayInvoiceIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Any:
    rental = _find_rental_for_account(db, rental_id, current_user, for_update=True)
    _require_primary_account_recipient(rental, current_user)
    return _pay_rental_invoice(rental, payload, db, current_user)
