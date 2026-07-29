from datetime import datetime
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session, joinedload, selectinload

from app.core.config import settings
from app.core.deps import get_current_user
from app.db.base import get_db
from app.models.sales import (
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


router = APIRouter()


class PortalAcceptanceIn(BaseModel):
    selected_line_item_ids: list[int] = Field(default_factory=list)
    signature_name: str
    terms_accepted: bool


class PortalDecisionIn(BaseModel):
    action: str
    comments: Optional[str] = None


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
