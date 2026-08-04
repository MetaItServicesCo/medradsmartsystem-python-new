"""Public, token-authenticated rental portal — mirrors the Sales client flow.

A customer opens the secure link emailed by staff, views their agreement and
invoices, saves a card on file for auto-charge, and pays invoices online.
No login required; access is granted only by the agreement's hashed token.
"""

import hashlib
from datetime import datetime
from decimal import Decimal
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session, selectinload, joinedload

from app.db.base import get_db
from app.models.invoice import Invoice, InvoiceStatus
from app.models.rental import Rental, RentalItem
from app.utils.invoice_editing import editable_line_items, strip_invoice_edit_metadata
from app.utils.invoice_ledger import record_payment_delta
from app.utils.square_payments import (
    square_public_config,
    square_is_configured,
    create_square_card_on_file,
    create_square_payment,
    SquareRequestError,
)

router = APIRouter()


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
        "item_condition": item.item_condition,
        "item_status": item.item_status,
    }


def _invoice_view(invoice: Invoice) -> dict[str, Any]:
    return {
        "id": invoice.id,
        "invoice_number": invoice.invoice_number,
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


def _portal_response(db: Session, rental: Rental) -> dict[str, Any]:
    invoices = (
        db.query(Invoice)
        .filter(Invoice.rental_id == rental.id)
        .order_by(Invoice.id.asc())
        .all()
    )
    return {
        "company_name": "Mr. BioMed Tech Services",
        "agreement": {
            "rental_number": rental.rental_number,
            "customer_name": rental.customer_name,
            "customer_email": rental.customer_email,
            "customer_address": rental.customer_address,
            "billing_frequency": rental.billing_frequency.value if hasattr(rental.billing_frequency, "value") else rental.billing_frequency,
            "start_date": rental.start_date,
            "end_date": rental.end_date,
            "security_deposit": rental.security_deposit,
            "status": rental.status.value if hasattr(rental.status, "value") else rental.status,
            "auto_charge": rental.auto_charge,
            "terms_and_conditions": rental.terms_and_conditions,
            "items": [_item_view(item) for item in rental.items or []],
            "has_card_on_file": bool(rental.square_card_id),
        },
        "invoices": [_invoice_view(invoice) for invoice in invoices],
        "square": square_public_config(),
    }


@router.get("/rentals/public/{token}")
def public_view_rental(token: str, db: Session = Depends(get_db)) -> Any:
    rental = _find_rental_by_token(db, token)
    return _portal_response(db, rental)


class SaveCardIn(BaseModel):
    source_id: str


@router.post("/rentals/public/{token}/save-card")
def public_save_rental_card(token: str, payload: SaveCardIn, db: Session = Depends(get_db)) -> Any:
    if not square_is_configured():
        raise HTTPException(status_code=400, detail="Card payments are not available")
    rental = _find_rental_by_token(db, token, for_update=True)
    try:
        result = create_square_card_on_file(
            source_id=payload.source_id,
            idempotency_key=f"rental-card-{rental.id}-{int(datetime.utcnow().timestamp())}",
            customer_name=rental.customer_name,
            customer_email=rental.customer_email,
        )
    except SquareRequestError as exc:
        raise HTTPException(status_code=exc.status_code, detail=str(exc))
    rental.square_card_id = result["card_id"]
    rental.square_customer_id = result["customer_id"]
    rental.failed_charge_count = 0
    rental.updated_at = datetime.utcnow()
    history = list(rental.history or [])
    history.append({
        "action": "card_saved",
        "by": rental.customer_name,
        "user_id": None,
        "at": datetime.utcnow().isoformat(),
        "details": {"last_4": result.get("last_4"), "brand": result.get("card_brand")},
    })
    rental.history = history
    db.commit()
    db.refresh(rental)
    return _portal_response(db, rental)


class PayInvoiceIn(BaseModel):
    invoice_id: int
    source_id: str
    idempotency_key: Optional[str] = None


@router.post("/rentals/public/{token}/pay-invoice")
def public_pay_rental_invoice(token: str, payload: PayInvoiceIn, db: Session = Depends(get_db)) -> Any:
    if not square_is_configured():
        raise HTTPException(status_code=400, detail="Card payments are not available")
    rental = _find_rental_by_token(db, token, for_update=True)
    invoice = (
        db.query(Invoice)
        .filter(Invoice.id == payload.invoice_id, Invoice.rental_id == rental.id)
        .with_for_update()
        .first()
    )
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")
    if invoice.status == InvoiceStatus.PAID or Decimal(str(invoice.balance_due or 0)) <= 0:
        raise HTTPException(status_code=400, detail="This invoice is already paid")
    try:
        payment = create_square_payment(
            source_id=payload.source_id,
            idempotency_key=payload.idempotency_key or f"rental-pay-{invoice.id}-{int(datetime.utcnow().timestamp())}",
            amount=invoice.balance_due,
            invoice_number=invoice.invoice_number,
            customer_email=rental.customer_email,
        )
    except SquareRequestError as exc:
        raise HTTPException(status_code=exc.status_code, detail=str(exc))
    previous_paid = invoice.amount_paid
    invoice.amount_paid = invoice.total_amount
    invoice.balance_due = Decimal("0")
    invoice.status = InvoiceStatus.PAID
    invoice.payment_method = "credit_card"
    record_payment_delta(db, invoice, previous_paid, invoice.total_amount, None, "credit_card", f"Online card payment ({payment.get('id')})")
    db.commit()
    db.refresh(rental)
    return _portal_response(db, rental)
