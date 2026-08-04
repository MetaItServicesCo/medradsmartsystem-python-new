"""Public, token-authenticated rental portal — mirrors the Sales client flow.

A customer opens the secure link emailed by staff, views their agreement and
invoices, saves a card on file for auto-charge, and pays invoices online.
No login required; access is granted only by the agreement's hashed token.
"""

import hashlib
from datetime import datetime
from decimal import Decimal
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.encoders import jsonable_encoder
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session, selectinload, joinedload

from app.db.base import get_db
from app.models.invoice import Invoice, InvoiceStatus
from app.models.rental import Rental, RentalItem, RentalAgreementAcceptance
from app.utils.invoice_editing import editable_line_items, strip_invoice_edit_metadata
from app.utils.invoice_ledger import record_payment_delta
from app.utils.rental_billing import _initial_invoice_amounts
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
    taxable_rental = max(Decimal("0"), amounts["rental"] - amounts["discount"])
    taxable_total = taxable_rental + amounts["shipping"] + amounts["setup"]
    if taxable_total > 0:
        rental_tax = (tax * taxable_rental / taxable_total).quantize(Decimal("0.01"))
        shipping_tax = (tax * amounts["shipping"] / taxable_total).quantize(Decimal("0.01"))
        setup_tax = tax - rental_tax - shipping_tax
    else:
        rental_tax = shipping_tax = setup_tax = Decimal("0")
    return {
        **amounts,
        "tax": tax,
        "rental_tax": rental_tax,
        "shipping_tax": shipping_tax,
        "setup_tax": setup_tax,
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


def _portal_response(db: Session, rental: Rental) -> dict[str, Any]:
    invoices = (
        db.query(Invoice)
        .filter(Invoice.rental_id == rental.id)
        .order_by(Invoice.id.asc())
        .all()
    )
    initial_invoice = invoices[0] if invoices else None
    return {
        "company_name": "Mr. BioMed Tech Services",
        "agreement": _agreement_view(rental),
        "acceptance": _acceptance_view(rental.acceptance),
        "can_sign": rental.acceptance is None,
        "pricing": _pricing_view(rental, initial_invoice),
        "invoices": [_invoice_view(invoice) for invoice in invoices],
        "square": square_public_config(),
    }


@router.get("/rentals/public/{token}")
def public_view_rental(token: str, db: Session = Depends(get_db)) -> Any:
    rental = _find_rental_by_token(db, token)
    return _portal_response(db, rental)


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


@router.post("/rentals/public/{token}/accept")
def public_accept_rental(
    token: str,
    payload: AcceptRentalIn,
    request: Request,
    db: Session = Depends(get_db),
) -> Any:
    if not payload.terms_accepted:
        raise HTTPException(status_code=422, detail="Accept the rental terms before signing")
    rental = _find_rental_by_token(db, token, for_update=True)
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
        "user_id": None,
        "at": datetime.utcnow().isoformat(),
        "details": {"revision": rental.revision or 1},
    })
    rental.history = history
    db.commit()
    db.refresh(rental)
    return _portal_response(db, rental)


@router.post("/rentals/public/{token}/pay-invoice")
def public_pay_rental_invoice(token: str, payload: PayInvoiceIn, db: Session = Depends(get_db)) -> Any:
    if not square_is_configured():
        raise HTTPException(status_code=400, detail="Card payments are not available")
    rental = _find_rental_by_token(db, token, for_update=True)
    acceptance = _require_signed(rental)
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
        raise HTTPException(status_code=400, detail="This invoice is already paid")
    payment_source = payload.source_id
    saved_card: Optional[dict[str, Any]] = None
    try:
        if payload.save_card:
            card_key = hashlib.sha256(
                f"{rental.id}:{invoice.id}:{payload.idempotency_key or payload.source_id}".encode("utf-8")
            ).hexdigest()[:28]
            saved_card = create_square_card_on_file(
                source_id=payload.source_id,
                idempotency_key=f"rent-card-{card_key}",
                customer_name=rental.customer_name,
                customer_email=rental.customer_email,
            )
            payment_source = saved_card["card_id"]
        payment = create_square_payment(
            source_id=payment_source,
            idempotency_key=payload.idempotency_key or f"rental-pay-{invoice.id}-{int(datetime.utcnow().timestamp())}",
            amount=invoice.balance_due,
            invoice_number=invoice.invoice_number,
            customer_email=rental.customer_email,
            customer_id=saved_card.get("customer_id") if saved_card else None,
        )
    except SquareRequestError as exc:
        raise HTTPException(status_code=exc.status_code, detail=str(exc))
    previous_paid = invoice.amount_paid
    invoice.amount_paid = invoice.total_amount
    invoice.balance_due = Decimal("0")
    invoice.status = InvoiceStatus.PAID
    invoice.payment_method = "credit_card"
    record_payment_delta(db, invoice, previous_paid, invoice.total_amount, None, "credit_card", f"Online card payment ({payment.get('id')})")
    if saved_card:
        _store_card_result(rental, saved_card, payload.authorize_auto_charge, acceptance.accepted_by_name)
    first_invoice = (
        db.query(Invoice.id)
        .filter(Invoice.rental_id == rental.id)
        .order_by(Invoice.id.asc())
        .first()
    )
    history = list(rental.history or [])
    history.append({
        "action": "initial_invoice_paid" if first_invoice and invoice.id == first_invoice[0] else "invoice_paid",
        "by": acceptance.accepted_by_name,
        "user_id": None,
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
    db.commit()
    db.refresh(rental)
    return _portal_response(db, rental)
