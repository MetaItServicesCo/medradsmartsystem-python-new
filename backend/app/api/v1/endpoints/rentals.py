from datetime import date, datetime, timedelta
from decimal import Decimal
from typing import Any, Optional
from math import ceil

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, EmailStr
from sqlalchemy import or_
from sqlalchemy.orm import Session, joinedload

from app.db.base import get_db
from app.core.deps import get_current_user
from app.models.facility import Facility
from app.models.inventory import InventoryPart
from app.models.invoice import Invoice, InvoiceStatus, InvoiceType
from app.models.rental import Rental, RentalStatus, BillingFrequency
from app.models.user import User, UserRole
from app.utils.facility_access import require_facility_access, scope_query_to_user_facilities
from app.utils.invoice_ledger import record_invoice_created, record_payment_delta, record_status_change, transaction_response
from app.utils.logging import log_activity

router = APIRouter()


class RentalCreate(BaseModel):
    part_id: int
    customer_name: str
    customer_email: EmailStr
    customer_phone: str
    customer_address: str
    billing_frequency: BillingFrequency
    rental_rate: Decimal
    security_deposit: Decimal
    quantity: int = 1
    shipping_fee: Decimal = Decimal("0")
    setup_fee: Decimal = Decimal("0")
    item_condition: Optional[str] = None
    start_date: date
    end_date: date
    initial_condition: Optional[str] = None
    initial_meter_reading: Optional[int] = None
    terms_and_conditions: Optional[str] = None


class RentalUpdate(BaseModel):
    customer_name: Optional[str] = None
    customer_email: Optional[EmailStr] = None
    customer_phone: Optional[str] = None
    customer_address: Optional[str] = None
    billing_frequency: Optional[BillingFrequency] = None
    rental_rate: Optional[Decimal] = None
    security_deposit: Optional[Decimal] = None
    quantity: Optional[int] = None
    shipping_fee: Optional[Decimal] = None
    setup_fee: Optional[Decimal] = None
    item_condition: Optional[str] = None
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    status: Optional[RentalStatus] = None
    initial_condition: Optional[str] = None
    terms_and_conditions: Optional[str] = None


class RentalReturnPayload(BaseModel):
    actual_return_date: date
    return_condition: str
    final_meter_reading: Optional[int] = None


class RentalInvoiceCreate(BaseModel):
    labour_hours: Decimal = Decimal("0")
    worked_hours: Decimal = Decimal("0")
    setup_fee: Decimal = Decimal("0")
    service_fee: Decimal = Decimal("0")
    shipping_fee: Decimal = Decimal("0")
    application_fee: Decimal = Decimal("0")
    tax_rate: Decimal = Decimal("0")
    discount_type: str = "fixed"
    discount_amount: Optional[Decimal] = None
    payment_method: Optional[str] = None
    action: Optional[str] = None
    due_date: Optional[date] = None
    notes: Optional[str] = None


class RentalInvoiceUpdate(BaseModel):
    amount_paid: Optional[Decimal] = None
    due_date: Optional[date] = None
    status: Optional[InvoiceStatus] = None
    payment_method: Optional[str] = None
    notes: Optional[str] = None


def _money(value: Any) -> Decimal:
    if value in (None, ""):
        return Decimal("0")
    return Decimal(str(value))


def _next_number(db: Session, model: Any, field: str, prefix: str, start: int = 1) -> str:
    last = db.query(model).order_by(model.id.desc()).first()
    next_num = (last.id + 1) if last else start
    while True:
        value = f"{prefix}-{next_num:06d}"
        if not db.query(model).filter(getattr(model, field) == value).first():
            return value
        next_num += 1


def _next_invoice_number(db: Session) -> str:
    last = db.query(Invoice).order_by(Invoice.id.desc()).first()
    next_num = (last.id + 1) if last else 1
    return f"INV-RENTAL-{next_num:06d}"


def _history_entry(action: str, user: User, details: Optional[dict[str, Any]] = None) -> dict[str, Any]:
    return {
        "action": action,
        "by": user.full_name or user.username,
        "user_id": user.id,
        "at": datetime.utcnow().isoformat(),
        "details": details or {},
    }


def _append_history(rental: Rental, action: str, user: User, details: Optional[dict[str, Any]] = None) -> None:
    history = list(rental.history or [])
    history.append(_history_entry(action, user, details))
    rental.history = history


def _part_response(part: InventoryPart) -> dict[str, Any]:
    return {
        "id": part.id,
        "part_number": part.part_number,
        "part_type": part.part_type,
        "description": part.description,
        "make": part.make,
        "model": part.model,
        "serial_number": part.serial_number,
        "condition": part.condition,
        "quantity_on_hand": part.quantity_on_hand,
        "unit_price": part.unit_price,
        "facility_id": part.facility_id,
        "facility_name": part.facility.name if part.facility else None,
        "status": part.status,
    }


def _invoice_response(invoice: Invoice) -> dict[str, Any]:
    return {
        "id": invoice.id,
        "invoice_number": invoice.invoice_number,
        "invoice_type": invoice.invoice_type.value if hasattr(invoice.invoice_type, "value") else invoice.invoice_type,
        "rental_id": invoice.rental_id,
        "rental_number": invoice.rental.rental_number if invoice.rental else None,
        "customer_name": invoice.customer_name,
        "customer_email": invoice.customer_email,
        "facility_id": invoice.facility_id,
        "facility_name": invoice.facility.name if invoice.facility else None,
        "subtotal": invoice.subtotal,
        "tax_amount": invoice.tax_amount,
        "discount_amount": invoice.discount_amount,
        "total_amount": invoice.total_amount,
        "amount_paid": invoice.amount_paid,
        "balance_due": invoice.balance_due,
        "status": invoice.status.value if hasattr(invoice.status, "value") else invoice.status,
        "issue_date": invoice.issue_date,
        "due_date": invoice.due_date,
        "payment_method": invoice.payment_method,
        "notes": invoice.notes,
        "created_at": invoice.created_at,
        "updated_at": invoice.updated_at,
        "transactions": [transaction_response(item) for item in invoice.transactions or []],
    }


def _rental_response(rental: Rental) -> dict[str, Any]:
    return {
        "id": rental.id,
        "rental_number": rental.rental_number,
        "equipment_id": rental.equipment_id,
        "part_id": rental.part_id,
        "part_number": rental.part.part_number if rental.part else None,
        "part_description": rental.part.description if rental.part else None,
        "customer_name": rental.customer_name,
        "customer_email": rental.customer_email,
        "customer_phone": rental.customer_phone,
        "customer_address": rental.customer_address,
        "billing_frequency": rental.billing_frequency.value if hasattr(rental.billing_frequency, "value") else rental.billing_frequency,
        "rental_rate": rental.rental_rate,
        "security_deposit": rental.security_deposit,
        "quantity": rental.quantity,
        "shipping_fee": rental.shipping_fee,
        "setup_fee": rental.setup_fee,
        "item_condition": rental.item_condition,
        "start_date": rental.start_date,
        "end_date": rental.end_date,
        "actual_return_date": rental.actual_return_date,
        "status": rental.status.value if hasattr(rental.status, "value") else rental.status,
        "initial_condition": rental.initial_condition,
        "return_condition": rental.return_condition,
        "initial_meter_reading": rental.initial_meter_reading,
        "final_meter_reading": rental.final_meter_reading,
        "terms_and_conditions": rental.terms_and_conditions,
        "converted_invoice_id": rental.converted_invoice_id,
        "converted_invoice_number": rental.converted_invoice.invoice_number if rental.converted_invoice else None,
        "converted_invoice_status": (
            rental.converted_invoice.status.value
            if rental.converted_invoice and hasattr(rental.converted_invoice.status, "value")
            else rental.converted_invoice.status
            if rental.converted_invoice
            else None
        ),
        "converted_invoice_amount_paid": rental.converted_invoice.amount_paid if rental.converted_invoice else None,
        "converted_invoice_balance_due": rental.converted_invoice.balance_due if rental.converted_invoice else None,
        "converted_invoice_payment_method": rental.converted_invoice.payment_method if rental.converted_invoice else None,
        "created_by_id": rental.created_by_id,
        "created_by_name": rental.created_by.full_name if rental.created_by else None,
        "created_at": rental.created_at,
        "updated_at": rental.updated_at,
        "history": rental.history or [],
    }


def _rental_part_query(db: Session, current_user: User):
    return (
        scope_query_to_user_facilities(db.query(InventoryPart), InventoryPart.facility_id, db, current_user)
        .options(joinedload(InventoryPart.facility))
        .filter(
            InventoryPart.part_type.ilike("rental"),
            InventoryPart.status == "active",
        )
    )


@router.get("/parts")
def list_rental_parts(
    db: Session = Depends(get_db),
    search: Optional[str] = Query(None),
    current_user: User = Depends(get_current_user),
) -> Any:
    query = _rental_part_query(db, current_user)
    if search:
        query = query.filter(
            or_(
                InventoryPart.part_number.ilike(f"%{search}%"),
                InventoryPart.description.ilike(f"%{search}%"),
                InventoryPart.make.ilike(f"%{search}%"),
                InventoryPart.model.ilike(f"%{search}%"),
                InventoryPart.serial_number.ilike(f"%{search}%"),
            )
        )
    parts = query.order_by(InventoryPart.updated_at.desc()).limit(500).all()
    return {"items": [_part_response(part) for part in parts], "total": len(parts)}


@router.get("")
def list_rentals(
    db: Session = Depends(get_db),
    status_filter: Optional[str] = Query(None, alias="status"),
    search: Optional[str] = Query(None),
    current_user: User = Depends(get_current_user),
) -> Any:
    query = (
        scope_query_to_user_facilities(db.query(Rental), InventoryPart.facility_id, db, current_user)
        .select_from(Rental)
        .join(InventoryPart, Rental.part_id == InventoryPart.id)
        .options(
            joinedload(Rental.part).joinedload(InventoryPart.facility),
            joinedload(Rental.created_by),
            joinedload(Rental.converted_invoice),
        )
    )
    if status_filter:
        query = query.filter(Rental.status == status_filter)
    if search:
        query = query.filter(
            or_(
                Rental.rental_number.ilike(f"%{search}%"),
                Rental.customer_name.ilike(f"%{search}%"),
                InventoryPart.part_number.ilike(f"%{search}%"),
                InventoryPart.description.ilike(f"%{search}%"),
            )
        )
    rentals = query.order_by(Rental.created_at.desc()).all()
    return {"items": [_rental_response(item) for item in rentals], "total": len(rentals)}


@router.post("", status_code=status.HTTP_201_CREATED)
def create_rental(
    payload: RentalCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Any:
    # Look up inventory part and enforce facility access
    part = _rental_part_query(db, current_user).filter(InventoryPart.id == payload.part_id).first()
    if not part:
        raise HTTPException(status_code=404, detail="Rental product not found in active inventory")

    if payload.quantity <= 0:
        raise HTTPException(status_code=400, detail="Quantity must be greater than zero")

    if part.quantity_on_hand < payload.quantity:
        raise HTTPException(status_code=400, detail=f"No stock available for {part.part_number}")

    # Generate rental record
    rental = Rental(
        rental_number=_next_number(db, Rental, "rental_number", "RNT"),
        part_id=payload.part_id,
        created_by_id=current_user.id,
        customer_name=payload.customer_name,
        customer_email=str(payload.customer_email),
        customer_phone=payload.customer_phone,
        customer_address=payload.customer_address,
        billing_frequency=payload.billing_frequency,
        rental_rate=payload.rental_rate,
        security_deposit=payload.security_deposit,
        quantity=payload.quantity,
        shipping_fee=payload.shipping_fee,
        setup_fee=payload.setup_fee,
        item_condition=payload.item_condition or part.condition,
        start_date=payload.start_date,
        end_date=payload.end_date,
        status=RentalStatus.ACTIVE,
        initial_condition=payload.initial_condition,
        initial_meter_reading=payload.initial_meter_reading,
        terms_and_conditions=payload.terms_and_conditions,
        history=[],
    )
    
    # Deduct stock
    part.quantity_on_hand -= payload.quantity
    part.updated_at = datetime.utcnow()

    _append_history(rental, "created", current_user)
    db.add(rental)
    db.flush()
    
    log_activity(db, "rentals", rental.id, "CREATE", current_user, {"rental_number": rental.rental_number})
    db.commit()
    db.refresh(rental)
    return _rental_response(rental)


@router.put("/{rental_id}")
def update_rental(
    rental_id: int,
    payload: RentalUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Any:
    rental = (
        db.query(Rental)
        .options(joinedload(Rental.part), joinedload(Rental.converted_invoice))
        .filter(Rental.id == rental_id)
        .first()
    )
    if not rental:
        raise HTTPException(status_code=404, detail="Rental agreement not found")
        
    if rental.part and rental.part.facility_id is not None:
        require_facility_access(db, current_user, rental.part.facility_id)

    update_data = payload.model_dump(exclude_unset=True)
    if "quantity" in update_data:
        next_quantity = int(update_data["quantity"] or 0)
        if next_quantity <= 0:
            raise HTTPException(status_code=400, detail="Quantity must be greater than zero")
        if rental.status == RentalStatus.ACTIVE and rental.part:
            current_quantity = rental.quantity or 1
            quantity_delta = next_quantity - current_quantity
            if quantity_delta > 0 and rental.part.quantity_on_hand < quantity_delta:
                raise HTTPException(status_code=400, detail=f"Not enough stock for {rental.part.part_number}")
            rental.part.quantity_on_hand -= quantity_delta
            rental.part.updated_at = datetime.utcnow()
    for field, value in update_data.items():
        if field == "customer_email" and value is not None:
            value = str(value)
        setattr(rental, field, value)
        
    rental.updated_at = datetime.utcnow()
    _append_history(rental, "updated", current_user, update_data)
    log_activity(db, "rentals", rental.id, "UPDATE", current_user, update_data)
    db.commit()
    db.refresh(rental)
    return _rental_response(rental)


@router.delete("/{rental_id}")
def delete_rental(
    rental_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Any:
    rental = db.query(Rental).filter(Rental.id == rental_id).first()
    if not rental:
        raise HTTPException(status_code=404, detail="Rental agreement not found")
        
    if rental.part and rental.part.facility_id is not None:
        require_facility_access(db, current_user, rental.part.facility_id)
        
    if rental.converted_invoice_id:
        raise HTTPException(status_code=400, detail="Cannot delete a rental already converted to invoice")

    # If the agreement was active, return the stock to inventory
    if rental.status == RentalStatus.ACTIVE and rental.part:
        rental.part.quantity_on_hand += rental.quantity or 1
        rental.part.updated_at = datetime.utcnow()

    log_activity(db, "rentals", rental.id, "DELETE", current_user, {"rental_number": rental.rental_number})
    db.delete(rental)
    db.commit()
    return {"detail": "Rental agreement deleted"}


@router.post("/{rental_id}/return")
def return_rental(
    rental_id: int,
    payload: RentalReturnPayload,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Any:
    rental = (
        db.query(Rental)
        .options(joinedload(Rental.part), joinedload(Rental.converted_invoice))
        .filter(Rental.id == rental_id)
        .first()
    )
    if not rental:
        raise HTTPException(status_code=404, detail="Rental agreement not found")
        
    if rental.part and rental.part.facility_id is not None:
        require_facility_access(db, current_user, rental.part.facility_id)

    if rental.status == RentalStatus.COMPLETED:
        raise HTTPException(status_code=400, detail="Rental is already completed/returned")

    rental.status = RentalStatus.COMPLETED
    rental.actual_return_date = payload.actual_return_date
    rental.return_condition = payload.return_condition
    rental.final_meter_reading = payload.final_meter_reading
    rental.updated_at = datetime.utcnow()

    # Restore stock to inventory
    if rental.part:
        rental.part.quantity_on_hand += rental.quantity or 1
        rental.part.updated_at = datetime.utcnow()

    _append_history(
        rental, 
        "returned", 
        current_user, 
        {
            "actual_return_date": str(payload.actual_return_date),
            "return_condition": payload.return_condition,
            "final_meter_reading": payload.final_meter_reading
        }
    )
    log_activity(db, "rentals", rental.id, "RETURN", current_user, {})
    db.commit()
    db.refresh(rental)
    return _rental_response(rental)


@router.post("/{rental_id}/convert-to-invoice")
def convert_to_invoice(
    rental_id: int,
    payload: RentalInvoiceCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Any:
    rental = (
        db.query(Rental)
        .options(joinedload(Rental.part), joinedload(Rental.converted_invoice))
        .filter(Rental.id == rental_id)
        .first()
    )
    if not rental:
        raise HTTPException(status_code=404, detail="Rental agreement not found")
        
    if rental.part and rental.part.facility_id is not None:
        require_facility_access(db, current_user, rental.part.facility_id)

    action = (payload.action or "convert_to_invoice").lower()
    if action in {"approve", "approved"}:
        _append_history(rental, "approved", current_user)
        rental.updated_at = datetime.utcnow()
        log_activity(db, "rentals", rental.id, "APPROVE", current_user, {})
        db.commit()
        return _rental_response(rental)
    if action in {"reject", "rejected"}:
        _append_history(rental, "rejected", current_user)
        if rental.status == RentalStatus.ACTIVE and rental.part:
            rental.part.quantity_on_hand += rental.quantity or 1
            rental.part.updated_at = datetime.utcnow()
        rental.status = RentalStatus.CANCELLED
        rental.updated_at = datetime.utcnow()
        log_activity(db, "rentals", rental.id, "REJECT", current_user, {})
        db.commit()
        return _rental_response(rental)
    if action in {"mark_pending", "pending"}:
        _append_history(rental, "marked_pending", current_user)
        rental.updated_at = datetime.utcnow()
        log_activity(db, "rentals", rental.id, "MARK_PENDING", current_user, {})
        db.commit()
        return _rental_response(rental)
        
    if rental.converted_invoice:
        return _invoice_response(rental.converted_invoice)

    # Calculate base rental cost
    # Calculate duration
    end_date = rental.actual_return_date if rental.actual_return_date else rental.end_date
    days = (end_date - rental.start_date).days
    if days < 1:
        days = 1

    rate = Decimal(str(rental.rental_rate))
    freq = rental.billing_frequency.value if hasattr(rental.billing_frequency, "value") else str(rental.billing_frequency).lower()
    
    if freq == "daily":
        base_rental_amount = Decimal(days) * rate * Decimal(rental.quantity or 1)
    elif freq == "weekly":
        base_rental_amount = Decimal(ceil(days / 7.0)) * rate * Decimal(rental.quantity or 1)
    elif freq == "monthly":
        base_rental_amount = Decimal(ceil(days / 30.0)) * rate * Decimal(rental.quantity or 1)
    else:
        base_rental_amount = Decimal(days) * rate * Decimal(rental.quantity or 1)

    worked_hours = _money(payload.worked_hours)
    setup_fee = _money(payload.setup_fee) + _money(rental.setup_fee)
    service_fee = _money(payload.service_fee)
    shipping_fee = _money(payload.shipping_fee) + _money(rental.shipping_fee)
    application_fee = _money(payload.application_fee)
    raw_discount = _money(payload.discount_amount)
    tax_rate = _money(payload.tax_rate)
    tax_amount = (base_rental_amount * tax_rate / Decimal("100")).quantize(Decimal("0.01"))
    
    subtotal = base_rental_amount + worked_hours + setup_fee + service_fee + shipping_fee + application_fee
    discount_amount = (subtotal * raw_discount / Decimal("100")).quantize(Decimal("0.01")) if payload.discount_type == "percent" else raw_discount
    total_amount = subtotal + tax_amount - discount_amount

    # Create Invoice
    invoice = Invoice(
        invoice_number=_next_invoice_number(db),
        invoice_type=InvoiceType.RENTAL,
        customer_name=rental.customer_name,
        customer_email=rental.customer_email or "billing@example.com",
        customer_phone=rental.customer_phone,
        customer_address=rental.customer_address,
        facility_id=rental.part.facility_id if rental.part else None,
        rental_id=rental.id,
        subtotal=subtotal,
        tax_amount=tax_amount,
        discount_amount=discount_amount,
        total_amount=total_amount,
        amount_paid=Decimal("0"),
        balance_due=total_amount,
        status=InvoiceStatus.PENDING,
        issue_date=date.today(),
        due_date=payload.due_date or date.today() + timedelta(days=30),
        payment_terms="Net 30",
        payment_method=payload.payment_method,
        notes=payload.notes or f"Rental invoice for agreement {rental.rental_number}.",
    )
    
    db.add(invoice)
    db.flush()
    record_invoice_created(db, invoice, current_user, f"Rental invoice created from agreement {rental.rental_number}")
    
    rental.converted_invoice_id = invoice.id
    rental.updated_at = datetime.utcnow()
    
    _append_history(
        rental,
        "converted_to_invoice",
        current_user,
        {
            "invoice_id": invoice.id,
            "invoice_number": invoice.invoice_number,
            "payment_method": payload.payment_method,
            "action": action,
            "discount_type": payload.discount_type,
            "total_amount": str(total_amount),
        },
    )
    log_activity(db, "rentals", rental.id, "CONVERT_TO_INVOICE", current_user, {"invoice_id": invoice.id})
    db.commit()
    db.refresh(invoice)
    return _invoice_response(invoice)


@router.get("/invoices")
def list_rental_invoices(
    db: Session = Depends(get_db),
    status_filter: Optional[InvoiceStatus] = Query(None, alias="status"),
    search: Optional[str] = Query(None),
    current_user: User = Depends(get_current_user),
) -> Any:
    query = (
        scope_query_to_user_facilities(db.query(Invoice), Invoice.facility_id, db, current_user)
        .options(joinedload(Invoice.facility), joinedload(Invoice.rental), joinedload(Invoice.transactions))
        .filter(Invoice.invoice_type == InvoiceType.RENTAL)
    )
    if status_filter:
        query = query.filter(Invoice.status == status_filter)
    if search and search.strip():
        like = f"%{search.strip()}%"
        query = (
            query
            .outerjoin(Facility, Invoice.facility_id == Facility.id)
            .outerjoin(Rental, Invoice.rental_id == Rental.id)
            .filter(
                or_(
                    Invoice.invoice_number.ilike(like),
                    Invoice.customer_name.ilike(like),
                    Invoice.customer_email.ilike(like),
                    Invoice.notes.ilike(like),
                    Facility.name.ilike(like),
                    Rental.rental_number.ilike(like),
                )
            )
        )
    invoices = query.order_by(Invoice.created_at.desc()).all()
    return {"items": [_invoice_response(invoice) for invoice in invoices], "total": len(invoices)}


@router.put("/invoices/{invoice_id}")
def update_rental_invoice(
    invoice_id: int,
    payload: RentalInvoiceUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Any:
    invoice = (
        db.query(Invoice)
        .options(joinedload(Invoice.rental), joinedload(Invoice.facility), joinedload(Invoice.transactions))
        .filter(invoice_id == Invoice.id, Invoice.invoice_type == InvoiceType.RENTAL)
        .first()
    )
    if not invoice:
        raise HTTPException(status_code=404, detail="Rental invoice not found")
        
    if invoice.facility_id is not None:
        require_facility_access(db, current_user, invoice.facility_id)
    if current_user.role not in {UserRole.SUPERADMIN, UserRole.FACILITY_ADMIN, UserRole.FACILITY_MANAGER, UserRole.CLIENT}:
        raise HTTPException(status_code=403, detail="Not enough permissions to update payment")

    previous_paid = invoice.amount_paid
    previous_status = invoice.status
    update_data = payload.model_dump(exclude_unset=True)
    for field in ["amount_paid", "due_date", "notes", "status", "payment_method"]:
        if field in update_data:
            setattr(invoice, field, update_data[field])
            
    invoice.balance_due = _money(invoice.total_amount) - _money(invoice.amount_paid)
    if invoice.balance_due <= 0:
        invoice.status = InvoiceStatus.PAID
    elif _money(invoice.amount_paid) > 0 and invoice.status != InvoiceStatus.CANCELLED:
        invoice.status = InvoiceStatus.PARTIALLY_PAID
        
    if invoice.rental:
        if invoice.status == InvoiceStatus.PAID:
            _append_history(invoice.rental, "invoice_paid", current_user, {"invoice_id": invoice.id})
        else:
            _append_history(invoice.rental, "invoice_updated", current_user, {"invoice_id": invoice.id, "status": invoice.status.value})
            
    invoice.updated_at = datetime.utcnow()
    record_payment_delta(db, invoice, previous_paid, invoice.amount_paid, current_user, invoice.payment_method, update_data.get("notes"))
    record_status_change(db, invoice, previous_status, current_user)
    log_activity(db, "invoices", invoice.id, "UPDATE_RENTAL_INVOICE", current_user, update_data)
    db.commit()
    db.refresh(invoice)
    return _invoice_response(invoice)


@router.get("/history")
def list_rental_history(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Any:
    rentals = (
        scope_query_to_user_facilities(db.query(Rental), InventoryPart.facility_id, db, current_user)
        .select_from(Rental)
        .join(InventoryPart, Rental.part_id == InventoryPart.id)
        .options(joinedload(Rental.part).joinedload(InventoryPart.facility))
        .order_by(Rental.updated_at.desc())
        .all()
    )
    rows: list[dict[str, Any]] = []
    for rental in rentals:
        for item in rental.history or []:
            rows.append(
                {
                    **item,
                    "rental_id": rental.id,
                    "rental_number": rental.rental_number,
                    "facility_name": rental.part.facility.name if rental.part and rental.part.facility else None,
                    "customer_name": rental.customer_name,
                    "part_number": rental.part.part_number if rental.part else None,
                    "part_description": rental.part.description if rental.part else None,
                }
            )
    rows.sort(key=lambda item: item.get("at") or "", reverse=True)
    return {"items": rows, "total": len(rows)}
