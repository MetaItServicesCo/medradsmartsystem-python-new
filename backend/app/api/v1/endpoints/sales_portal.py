from datetime import datetime
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session, joinedload, selectinload

from app.core.config import settings
from app.core.deps import get_current_user
from app.db.base import get_db
from app.models.invoice import Invoice, InvoiceStatus
from app.models.sales import (
    SalesPaymentAuthorization,
    SalesQuotation,
    SalesQuotationAcceptance,
    SalesQuotationLineItem,
    SalesQuotationRecipient,
)
from app.models.user import User
from app.utils.notifications import create_notifications, notify_admins
from app.api.v1.endpoints.sales import (
    _accept_quotation_selection,
    _append_history,
    _create_invoice_for_accepted_quotation,
    _line_response,
    _money,
    _recipient_response,
    _selection_snapshot,
    _token_hash,
)
from app.utils.invoice_editing import editable_line_items
from app.utils.invoice_ledger import add_invoice_transaction


router = APIRouter()


class PortalAcceptanceIn(BaseModel):
    selected_line_item_ids: list[int] = Field(default_factory=list)
    signature_name: str
    terms_accepted: bool


class PortalDecisionIn(BaseModel):
    action: str
    comments: Optional[str] = None


class PortalPaymentAuthorizationIn(BaseModel):
    cardholder_name: str = Field(min_length=2, max_length=200)
    card_brand: str = Field(min_length=2, max_length=50)
    card_last_four: str = Field(pattern=r"^\d{4}$")
    card_expiration: str = Field(min_length=4, max_length=7)
    submitted_by_name: str = Field(min_length=2, max_length=200)
    submitted_by_email: Optional[str] = Field(default=None, max_length=320)
    terms_accepted: bool
    notes: Optional[str] = Field(default=None, max_length=2000)


def _recipient_options():
    return (
        joinedload(SalesQuotationRecipient.user),
        joinedload(SalesQuotationRecipient.quotation).joinedload(SalesQuotation.facility),
        joinedload(SalesQuotationRecipient.quotation).joinedload(SalesQuotation.created_by),
        joinedload(SalesQuotationRecipient.quotation).joinedload(SalesQuotation.accepted_by),
        joinedload(SalesQuotationRecipient.quotation).joinedload(SalesQuotation.converted_invoice),
        joinedload(SalesQuotationRecipient.quotation).joinedload(SalesQuotation.acceptance),
        joinedload(SalesQuotationRecipient.quotation)
        .joinedload(SalesQuotation.line_items)
        .joinedload(SalesQuotationLineItem.part),
        joinedload(SalesQuotationRecipient.quotation)
        .selectinload(SalesQuotation.recipients)
        .joinedload(SalesQuotationRecipient.user),
    )


def _portal_response(recipient: SalesQuotationRecipient) -> dict[str, Any]:
    quotation = recipient.quotation
    acceptance = quotation.acceptance
    invoice = quotation.converted_invoice
    return {
        "company_name": settings.PROJECT_NAME,
        "quotation": {
            "id": quotation.id,
            "quotation_number": quotation.quotation_number,
            "work_order": quotation.work_order,
            "revision": quotation.revision or 1,
            "quotation_type": quotation.quotation_type,
            "status": quotation.status,
            "selection_status": quotation.selection_status,
            "facility_name": quotation.facility.name if quotation.facility else None,
            "customer_name": quotation.customer_name,
            "customer_address": quotation.customer_address,
            "requested_date": quotation.requested_date,
            "sent_at": quotation.sent_at,
            "expires_at": quotation.expires_at,
            "notes": quotation.notes,
            "subtotal": quotation.subtotal,
            "tax_amount": quotation.tax_amount,
            "discount_amount": quotation.discount_amount,
            "total_amount": quotation.total_amount,
            "line_items": [_line_response(line) for line in quotation.line_items or []],
        },
        "recipient": _recipient_response(recipient),
        "can_accept": (
            recipient.recipient_type == "primary"
            and quotation.status in {"sent", "viewed"}
            and quotation.selection_status != "accepted"
        ),
        "acceptance": (
            {
                "accepted_by_name": acceptance.accepted_by_name,
                "signature_name": acceptance.signature_name,
                "accepted_at": acceptance.accepted_at,
                "quotation_revision": acceptance.quotation_revision,
                "selection_snapshot": acceptance.selection_snapshot,
                "pricing_snapshot": acceptance.pricing_snapshot,
            }
            if acceptance
            else None
        ),
        "invoice": (
            {
                "id": invoice.id,
                "invoice_number": invoice.invoice_number,
                "status": invoice.status.value if hasattr(invoice.status, "value") else invoice.status,
                "billing_approval_status": invoice.billing_approval_status,
                "total_amount": invoice.total_amount,
                "balance_due": invoice.balance_due,
            }
            if invoice
            else None
        ),
    }


def _payment_authorization_options():
    return (
        joinedload(SalesPaymentAuthorization.invoice).joinedload(Invoice.facility),
        joinedload(SalesPaymentAuthorization.quotation).joinedload(SalesQuotation.acceptance),
        joinedload(SalesPaymentAuthorization.quotation)
        .joinedload(SalesQuotation.line_items)
        .joinedload(SalesQuotationLineItem.part),
        joinedload(SalesPaymentAuthorization.recipient).joinedload(SalesQuotationRecipient.user),
        joinedload(SalesPaymentAuthorization.requested_by),
    )


def _payment_authorization_response(authorization: SalesPaymentAuthorization) -> dict[str, Any]:
    invoice = authorization.invoice
    quotation = authorization.quotation
    acceptance = quotation.acceptance
    stored_lines = editable_line_items(invoice.notes)
    line_items = stored_lines or [
        {
            "item_number": line.part.part_number if line.part else line.item_kind.upper(),
            "description": line.description,
            "quantity": line.quantity,
            "unit_price": line.unit_price,
            "shipping_fee": line.shipping_fee,
            "setup_fee": line.setup_fee,
            "condition": line.condition,
            "total": line.total,
        }
        for line in quotation.line_items or []
        if line.is_selected
    ]
    return {
        "company_name": settings.PROJECT_NAME,
        "authorization": {
            "id": authorization.id,
            "status": authorization.status,
            "amount": authorization.amount,
            "currency": authorization.currency,
            "payment_method": authorization.payment_method,
            "channel": authorization.channel,
            "cardholder_name": authorization.cardholder_name,
            "card_brand": authorization.card_brand,
            "card_last_four": authorization.card_last_four,
            "card_expiration": authorization.card_expiration,
            "authorization_reference": authorization.authorization_reference,
            "submitted_by_name": authorization.submitted_by_name,
            "submitted_at": authorization.submitted_at,
            "requested_at": authorization.requested_at,
            "token_expires_at": authorization.token_expires_at,
        },
        "invoice": {
            "id": invoice.id,
            "invoice_number": invoice.invoice_number,
            "status": invoice.status.value if hasattr(invoice.status, "value") else invoice.status,
            "billing_approval_status": invoice.billing_approval_status,
            "customer_name": invoice.customer_name,
            "customer_email": invoice.customer_email,
            "customer_phone": invoice.customer_phone,
            "customer_address": invoice.customer_address,
            "facility_name": invoice.facility.name if invoice.facility else None,
            "subtotal": invoice.subtotal,
            "tax_amount": invoice.tax_amount,
            "discount_amount": invoice.discount_amount,
            "total_amount": invoice.total_amount,
            "amount_paid": invoice.amount_paid,
            "balance_due": invoice.balance_due,
            "issue_date": invoice.issue_date,
            "due_date": invoice.due_date,
            "line_items": line_items,
        },
        "quotation": {
            "id": quotation.id,
            "quotation_number": quotation.quotation_number,
            "revision": quotation.revision or 1,
        },
        "acceptance": (
            {
                "accepted_by_name": acceptance.accepted_by_name,
                "signature_name": acceptance.signature_name,
                "accepted_at": acceptance.accepted_at,
                "quotation_revision": acceptance.quotation_revision,
            }
            if acceptance
            else None
        ),
        "can_submit": (
            authorization.status == "requested"
            and authorization.token_expires_at >= datetime.utcnow()
            and invoice.billing_approval_status == "approved"
            and invoice.status not in {InvoiceStatus.PAID, InvoiceStatus.CANCELLED}
            and _money(invoice.balance_due) > 0
        ),
        "payment_note": (
            "This form authorizes payment processing. It does not store a full card number "
            "or security code, and it does not mark the invoice paid until payment is processed."
        ),
    }


def _find_payment_authorization(
    db: Session,
    token: str,
    *,
    for_update: bool = False,
) -> SalesPaymentAuthorization:
    query = (
        db.query(SalesPaymentAuthorization)
        .options(*_payment_authorization_options())
        .filter(SalesPaymentAuthorization.access_token_hash == _token_hash(token))
    )
    if for_update:
        query = query.with_for_update(of=SalesPaymentAuthorization)
    authorization = query.first()
    if not authorization:
        raise HTTPException(status_code=404, detail="Payment authorization link not found")
    if authorization.token_expires_at < datetime.utcnow():
        if authorization.status == "requested":
            authorization.status = "expired"
            db.commit()
        raise HTTPException(status_code=410, detail="This payment authorization link has expired")
    return authorization


def _mark_viewed(
    db: Session,
    recipient: SalesQuotationRecipient,
    actor: Optional[User],
) -> None:
    quotation = recipient.quotation
    if recipient.viewed_at is None:
        now = datetime.utcnow()
        recipient.viewed_at = now
        recipient.status = "viewed"
        if quotation.status == "sent":
            quotation.status = "viewed"
        _append_history(
            quotation,
            "viewed",
            actor,
            {
                "recipient_id": recipient.id,
                "recipient_type": recipient.recipient_type,
                "email": recipient.email,
            },
            recipient.name,
        )
        db.commit()


def _ensure_recipient_available(recipient: Optional[SalesQuotationRecipient]) -> SalesQuotationRecipient:
    if not recipient:
        raise HTTPException(status_code=404, detail="Quotation link not found")
    if recipient.token_expires_at and recipient.token_expires_at < datetime.utcnow():
        raise HTTPException(status_code=410, detail="This quotation link has expired")
    if recipient.quotation.status in {"draft", "cancelled"}:
        raise HTTPException(status_code=410, detail="This quotation is no longer available")
    return recipient


def _accept_recipient_quotation(
    db: Session,
    recipient: SalesQuotationRecipient,
    payload: PortalAcceptanceIn,
    request: Request,
    actor: Optional[User],
) -> dict[str, Any]:
    quotation = recipient.quotation
    if recipient.recipient_type != "primary":
        raise HTTPException(status_code=403, detail="Only the primary recipient can accept this quotation")
    if not payload.terms_accepted:
        raise HTTPException(status_code=400, detail="Accept the quotation terms before continuing")
    signature_name = payload.signature_name.strip()
    if not signature_name:
        raise HTTPException(status_code=400, detail="Signature name is required")
    if quotation.acceptance or quotation.converted_invoice:
        return _portal_response(recipient)
    if quotation.status not in {"sent", "viewed"}:
        raise HTTPException(status_code=409, detail="This quotation cannot be accepted in its current status")
    if quotation.expires_at and quotation.expires_at < datetime.utcnow():
        raise HTTPException(status_code=410, detail="This quotation has expired")

    accepted_lines = _accept_quotation_selection(
        quotation,
        payload.selected_line_item_ids,
        "client_portal",
        actor,
        recipient.name,
    )
    accepted_at = datetime.utcnow()
    pricing_snapshot = {
        "subtotal": str(sum((_money(line.total) for line in accepted_lines), _money(0))),
        "tax_amount": str(_money(quotation.tax_amount)),
        "discount_amount": str(_money(quotation.discount_amount)),
        "total_amount": str(
            sum((_money(line.total) for line in accepted_lines), _money(0))
            + _money(quotation.tax_amount)
            - _money(quotation.discount_amount)
        ),
    }
    acceptance = SalesQuotationAcceptance(
        quotation_id=quotation.id,
        recipient_id=recipient.id,
        accepted_by_user_id=actor.id if actor else recipient.user_id,
        accepted_by_name=recipient.name,
        signature_name=signature_name,
        terms_accepted=True,
        quotation_revision=quotation.revision or 1,
        selection_snapshot=_selection_snapshot(accepted_lines),
        pricing_snapshot=pricing_snapshot,
        ip_address=request.client.host if request.client else None,
        user_agent=(request.headers.get("user-agent") or "")[:1000],
        accepted_at=accepted_at,
    )
    db.add(acceptance)
    quotation.acceptance = acceptance
    quotation.accepted_at = accepted_at
    quotation.status = "accepted"
    recipient.status = "accepted"
    recipient.accepted_at = accepted_at
    invoice = _create_invoice_for_accepted_quotation(db, quotation, accepted_lines, actor or recipient.user)
    _append_history(
        quotation,
        "invoice_generated_pending_billing_approval",
        actor,
        {
            "invoice_id": invoice.id,
            "invoice_number": invoice.invoice_number,
            "total_amount": str(invoice.total_amount),
        },
        recipient.name,
    )
    notify_admins(
        db,
        title="Sales quotation accepted",
        message=(
            f"{quotation.quotation_number} was accepted by {recipient.name}; "
            f"{invoice.invoice_number} is pending billing approval."
        ),
        notification_type="billing",
        link_url=f"/sales/invoices?search={invoice.invoice_number}",
        actor_id=actor.id if actor else recipient.user_id,
    )
    create_notifications(
        db,
        user_ids=[item.user_id for item in quotation.recipients if item.user_id],
        title="Quotation accepted",
        message=f"{quotation.quotation_number} was accepted and its invoice is pending billing approval.",
        notification_type="billing",
        link_url=f"/quotation/account/{quotation.id}",
        actor_id=actor.id if actor else recipient.user_id,
    )
    db.commit()
    db.refresh(recipient)
    return _portal_response(recipient)


@router.get("/public/quotations/{token}")
def get_public_quotation(
    token: str,
    db: Session = Depends(get_db),
) -> Any:
    recipient = (
        db.query(SalesQuotationRecipient)
        .options(*_recipient_options())
        .filter(SalesQuotationRecipient.access_token_hash == _token_hash(token))
        .first()
    )
    recipient = _ensure_recipient_available(recipient)
    _mark_viewed(db, recipient, recipient.user)
    return _portal_response(recipient)


@router.post("/public/quotations/{token}/accept")
def accept_public_quotation(
    token: str,
    payload: PortalAcceptanceIn,
    request: Request,
    db: Session = Depends(get_db),
) -> Any:
    recipient = (
        db.query(SalesQuotationRecipient)
        .options(*_recipient_options())
        .filter(SalesQuotationRecipient.access_token_hash == _token_hash(token))
        .with_for_update(of=SalesQuotationRecipient)
        .first()
    )
    recipient = _ensure_recipient_available(recipient)
    return _accept_recipient_quotation(db, recipient, payload, request, recipient.user)


@router.post("/public/quotations/{token}/decision")
def decide_public_quotation(
    token: str,
    payload: PortalDecisionIn,
    db: Session = Depends(get_db),
) -> Any:
    recipient = (
        db.query(SalesQuotationRecipient)
        .options(*_recipient_options())
        .filter(SalesQuotationRecipient.access_token_hash == _token_hash(token))
        .with_for_update(of=SalesQuotationRecipient)
        .first()
    )
    recipient = _ensure_recipient_available(recipient)
    if recipient.recipient_type != "primary":
        raise HTTPException(status_code=403, detail="Only the primary recipient can respond")
    action = payload.action.strip().lower()
    if action not in {"decline", "request_changes"}:
        raise HTTPException(status_code=400, detail="Action must be decline or request_changes")
    quotation = recipient.quotation
    if quotation.selection_status == "accepted" or quotation.converted_invoice_id:
        raise HTTPException(status_code=409, detail="An accepted quotation can no longer be changed")
    quotation.status = "declined" if action == "decline" else "changes_requested"
    recipient.status = quotation.status
    _append_history(
        quotation,
        quotation.status,
        recipient.user,
        {"comments": payload.comments or "", "recipient_id": recipient.id},
        recipient.name,
    )
    create_notifications(
        db,
        user_ids=[quotation.created_by_id],
        title="Sales quotation response",
        message=f"{recipient.name} {quotation.status.replace('_', ' ')} for {quotation.quotation_number}.",
        notification_type="billing",
        link_url=f"/sales/quotations?search={quotation.quotation_number}",
        actor_id=recipient.user_id,
    )
    db.commit()
    return _portal_response(recipient)


@router.get("/public/sales-payment/{token}")
def get_public_sales_payment_authorization(
    token: str,
    db: Session = Depends(get_db),
) -> Any:
    return _payment_authorization_response(_find_payment_authorization(db, token))


@router.post("/public/sales-payment/{token}/authorize")
def submit_public_sales_payment_authorization(
    token: str,
    payload: PortalPaymentAuthorizationIn,
    request: Request,
    db: Session = Depends(get_db),
) -> Any:
    if not payload.terms_accepted:
        raise HTTPException(status_code=400, detail="Payment authorization consent is required")
    authorization = _find_payment_authorization(db, token, for_update=True)
    invoice = authorization.invoice
    quotation = authorization.quotation
    if authorization.status == "submitted":
        return _payment_authorization_response(authorization)
    if authorization.status != "requested":
        raise HTTPException(
            status_code=409,
            detail=f"This authorization is {authorization.status.replace('_', ' ')}",
        )
    if invoice.billing_approval_status != "approved":
        raise HTTPException(status_code=409, detail="This invoice is not approved for payment")
    if invoice.status in {InvoiceStatus.PAID, InvoiceStatus.CANCELLED}:
        raise HTTPException(
            status_code=409,
            detail="This invoice can no longer receive a payment authorization",
        )
    current_balance = max(_money(invoice.balance_due), _money(0))
    if current_balance <= 0:
        raise HTTPException(status_code=409, detail="This invoice has no outstanding balance")
    if current_balance != _money(authorization.amount):
        authorization.status = "superseded"
        authorization.updated_at = datetime.utcnow()
        db.commit()
        raise HTTPException(
            status_code=409,
            detail="The invoice balance changed. Ask the sender for a new authorization link.",
        )

    now = datetime.utcnow()
    authorization.status = "submitted"
    authorization.submitted_by_user_id = (
        authorization.recipient.user_id
        if authorization.recipient and authorization.recipient.user_id
        else None
    )
    authorization.submitted_by_name = payload.submitted_by_name.strip()
    authorization.submitted_by_email = (
        payload.submitted_by_email.strip()
        if payload.submitted_by_email
        else authorization.recipient.email
        if authorization.recipient
        else invoice.customer_email
    )
    authorization.cardholder_name = payload.cardholder_name.strip()
    authorization.card_brand = payload.card_brand.strip()
    authorization.card_last_four = payload.card_last_four
    authorization.card_expiration = payload.card_expiration.strip()
    authorization.authorization_reference = f"SAUTH-{authorization.id:06d}"
    authorization.notes = payload.notes
    authorization.submitted_at = now
    authorization.ip_address = request.client.host if request.client else None
    authorization.user_agent = (request.headers.get("user-agent") or "")[:1000]
    authorization.updated_at = now
    add_invoice_transaction(
        db,
        invoice,
        "payment_authorization_submitted",
        authorization.amount,
        "credit_card",
        (
            f"Payment authorization {authorization.authorization_reference} submitted by "
            f"{authorization.submitted_by_name}; card ending {authorization.card_last_four}"
        ),
        authorization.submitted_by,
        "SAUTH",
    )
    _append_history(
        quotation,
        "credit_card_authorization_submitted",
        authorization.submitted_by,
        {
            "authorization_id": authorization.id,
            "authorization_reference": authorization.authorization_reference,
            "invoice_id": invoice.id,
            "invoice_number": invoice.invoice_number,
            "amount": str(authorization.amount),
            "submitted_by_name": authorization.submitted_by_name,
            "card_brand": authorization.card_brand,
            "card_last_four": authorization.card_last_four,
            "channel": "public_link",
        },
        authorization.submitted_by_name,
    )
    notify_admins(
        db,
        title="Sales payment authorization submitted",
        message=(
            f"{authorization.submitted_by_name} authorized ${authorization.amount:.2f} "
            f"for {invoice.invoice_number}."
        ),
        notification_type="billing",
        link_url=f"/billing?search={invoice.invoice_number}",
        actor_id=authorization.submitted_by_user_id,
    )
    db.commit()
    db.refresh(authorization)
    return _payment_authorization_response(authorization)


@router.get("/client-sales/quotations")
def list_client_quotations(
    search: Optional[str] = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Any:
    query = (
        db.query(SalesQuotationRecipient)
        .options(*_recipient_options())
        .join(SalesQuotation, SalesQuotation.id == SalesQuotationRecipient.quotation_id)
        .filter(
            SalesQuotationRecipient.user_id == current_user.id,
            SalesQuotation.status.notin_(["draft", "cancelled"]),
        )
    )
    if search and search.strip():
        like = f"%{search.strip()}%"
        query = query.filter(
            SalesQuotation.quotation_number.ilike(like)
            | SalesQuotation.work_order.ilike(like)
            | SalesQuotation.customer_name.ilike(like)
        )
    total = query.count()
    recipients = (
        query.order_by(SalesQuotation.sent_at.desc(), SalesQuotation.id.desc())
        .offset(skip)
        .limit(limit)
        .all()
    )
    return {"items": [_portal_response(item) for item in recipients], "total": total}


@router.get("/client-sales/quotations/{quotation_id}")
def get_client_quotation(
    quotation_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Any:
    recipient = (
        db.query(SalesQuotationRecipient)
        .options(*_recipient_options())
        .filter(
            SalesQuotationRecipient.quotation_id == quotation_id,
            SalesQuotationRecipient.user_id == current_user.id,
        )
        .first()
    )
    if not recipient:
        raise HTTPException(status_code=404, detail="Quotation not found")
    _mark_viewed(db, recipient, current_user)
    return _portal_response(recipient)


@router.post("/client-sales/quotations/{quotation_id}/accept")
def accept_client_quotation(
    quotation_id: int,
    payload: PortalAcceptanceIn,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Any:
    recipient = (
        db.query(SalesQuotationRecipient)
        .options(*_recipient_options())
        .filter(
            SalesQuotationRecipient.quotation_id == quotation_id,
            SalesQuotationRecipient.user_id == current_user.id,
        )
        .with_for_update(of=SalesQuotationRecipient)
        .first()
    )
    if not recipient:
        raise HTTPException(status_code=404, detail="Quotation not found")
    return _accept_recipient_quotation(db, recipient, payload, request, current_user)


@router.post("/client-sales/quotations/{quotation_id}/decision")
def decide_client_quotation(
    quotation_id: int,
    payload: PortalDecisionIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Any:
    recipient = (
        db.query(SalesQuotationRecipient)
        .options(*_recipient_options())
        .filter(
            SalesQuotationRecipient.quotation_id == quotation_id,
            SalesQuotationRecipient.user_id == current_user.id,
        )
        .with_for_update(of=SalesQuotationRecipient)
        .first()
    )
    if not recipient:
        raise HTTPException(status_code=404, detail="Quotation not found")
    if recipient.recipient_type != "primary":
        raise HTTPException(status_code=403, detail="Only the primary recipient can respond")
    action = payload.action.strip().lower()
    if action not in {"decline", "request_changes"}:
        raise HTTPException(status_code=400, detail="Action must be decline or request_changes")
    quotation = recipient.quotation
    if quotation.selection_status == "accepted" or quotation.converted_invoice_id:
        raise HTTPException(status_code=409, detail="An accepted quotation can no longer be changed")
    quotation.status = "declined" if action == "decline" else "changes_requested"
    recipient.status = quotation.status
    _append_history(
        quotation,
        quotation.status,
        current_user,
        {"comments": payload.comments or "", "recipient_id": recipient.id},
    )
    create_notifications(
        db,
        user_ids=[quotation.created_by_id],
        title="Sales quotation response",
        message=f"{recipient.name} {quotation.status.replace('_', ' ')} for {quotation.quotation_number}.",
        notification_type="billing",
        link_url=f"/sales/quotations?search={quotation.quotation_number}",
        actor_id=current_user.id,
    )
    db.commit()
    return _portal_response(recipient)
