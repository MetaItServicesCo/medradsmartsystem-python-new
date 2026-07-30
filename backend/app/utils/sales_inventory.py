from __future__ import annotations

from datetime import date, datetime
from typing import Any, Optional

from fastapi import HTTPException, status
from sqlalchemy import func
from sqlalchemy.orm import Session
from sqlalchemy.orm.attributes import flag_modified

from app.models.inventory import InventoryPart, InventoryTransaction
from app.models.invoice import Invoice, InvoiceStatus, InvoiceTransaction, InvoiceType
from app.models.sales import SalesInventoryReservation, SalesQuotation, SalesQuotationLineItem
from app.models.user import User
from app.utils.invoice_ledger import add_invoice_transaction
from app.utils.notifications import notify_admins


SALES_INVENTORY_FULFILLED = "sales_inventory_fulfilled"
SALES_INVENTORY_RESERVED = "sales_inventory_reserved"
SALES_INVENTORY_RESERVATION_RELEASED = "sales_inventory_reservation_released"
ACTIVE_RESERVATION = "active"


def _lock_invoice(db: Session, invoice: Invoice) -> Invoice:
    if invoice.id is None:
        db.flush()
    return (
        db.query(Invoice)
        .filter(Invoice.id == invoice.id)
        .with_for_update()
        .one()
    )


def _required_stock(quotation: SalesQuotation) -> dict[int, int]:
    required: dict[int, int] = {}
    for line in quotation.line_items or []:
        if (line.item_kind or "product") != "product" or line.part_id is None:
            continue
        if quotation.quotation_type in {"choice_single", "choice_multiple"} and not line.is_selected:
            continue
        required[line.part_id] = required.get(line.part_id, 0) + int(line.quantity or 0)
    return {part_id: quantity for part_id, quantity in required.items() if quantity > 0}


def _trade_in_specs(quotation: SalesQuotation) -> list[tuple[Any, dict[str, Any]]]:
    trade_ins: list[tuple[Any, dict[str, Any]]] = []
    for line in quotation.line_items or []:
        if line.item_kind != "trade_in":
            continue
        metadata = line.item_metadata or {}
        part_data = metadata.get("inventory_part")
        if not isinstance(part_data, dict):
            # Legacy trade-in credits remain valid financial adjustments but
            # cannot create inventory because they did not capture part data.
            continue
        part_number = str(part_data.get("part_number") or "").strip()
        description = str(part_data.get("description") or "").strip()
        if not part_number or not description:
            raise HTTPException(
                status_code=409,
                detail="Trade-in part number and description are required before payment",
            )
        trade_ins.append((line, {**part_data, "part_number": part_number, "description": description}))
    return trade_ins


def _optional_date(value: Any) -> Optional[date]:
    if value in (None, ""):
        return None
    if isinstance(value, date):
        return value
    try:
        return date.fromisoformat(str(value))
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=f"Invalid trade-in inventory date: {value}") from exc


def _validate_trade_ins(db: Session, quotation: SalesQuotation) -> list[tuple[Any, dict[str, Any]]]:
    trade_ins = _trade_in_specs(quotation)
    serials: set[str] = set()
    for _line, data in trade_ins:
        serial = str(data.get("serial_number") or "").strip()
        if not serial:
            continue
        serial_key = serial.casefold()
        if serial_key in serials:
            raise HTTPException(status_code=409, detail=f"Duplicate trade-in serial number: {serial}")
        serials.add(serial_key)
        existing = (
            db.query(InventoryPart.id)
            .filter(
                InventoryPart.facility_id.is_(None),
                func.lower(InventoryPart.serial_number) == serial_key,
            )
            .first()
        )
        if existing:
            raise HTTPException(
                status_code=409,
                detail=f"A global inventory part with serial number {serial} already exists",
            )
    return trade_ins


def _lock_sales_parts(
    db: Session,
    invoice: Invoice,
) -> tuple[SalesQuotation, dict[int, int], dict[int, InventoryPart]]:
    quotation = invoice.sales_quotation
    if not quotation and invoice.sales_quotation_id:
        quotation = db.query(SalesQuotation).filter(SalesQuotation.id == invoice.sales_quotation_id).first()
    if not quotation:
        raise HTTPException(status_code=409, detail="Sales invoice is not linked to a quotation")

    required = _required_stock(quotation)
    parts = (
        db.query(InventoryPart)
        .filter(InventoryPart.id.in_(sorted(required)))
        .order_by(InventoryPart.id.asc())
        .with_for_update()
        .all()
        if required
        else []
    )
    parts_by_id = {part.id: part for part in parts}
    reservations = (
        db.query(SalesInventoryReservation)
        .filter(
            SalesInventoryReservation.part_id.in_(sorted(required)),
            SalesInventoryReservation.status == ACTIVE_RESERVATION,
        )
        .order_by(SalesInventoryReservation.part_id.asc(), SalesInventoryReservation.id.asc())
        .with_for_update()
        .all()
        if required
        else []
    )
    reserved_totals: dict[int, int] = {}
    invoice_reservations: dict[int, int] = {}
    for reservation in reservations:
        reserved_totals[reservation.part_id] = (
            reserved_totals.get(reservation.part_id, 0) + int(reservation.quantity or 0)
        )
        if reservation.invoice_id == invoice.id:
            invoice_reservations[reservation.part_id] = (
                invoice_reservations.get(reservation.part_id, 0)
                + int(reservation.quantity or 0)
            )
    for part_id, quantity in required.items():
        part = parts_by_id.get(part_id)
        if not part:
            raise HTTPException(status_code=404, detail=f"Sales inventory part #{part_id} was not found")
        own_reserved = invoice_reservations.get(part_id, 0)
        if own_reserved and own_reserved != quantity:
            raise HTTPException(
                status_code=409,
                detail=(
                    f"Inventory reservation for {part.part_number} is inconsistent. "
                    "Cancel and recreate the invoice before payment."
                ),
            )
        reserved_elsewhere = max(reserved_totals.get(part_id, 0) - own_reserved, 0)
        available = max(int(part.quantity_on_hand or 0) - reserved_elsewhere, 0)
        if available < quantity:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=(
                    f"Insufficient stock for {part.part_number}. "
                    f"Available: {available}, reserved for unpaid invoices: "
                    f"{reserved_elsewhere}, required: {quantity}"
                ),
            )
    return quotation, required, parts_by_id


def reserve_sales_inventory(
    db: Session,
    quotation: SalesQuotation,
    invoice: Invoice,
    accepted_lines: list[SalesQuotationLineItem],
    actor: Optional[User],
) -> list[SalesInventoryReservation]:
    """Atomically reserve selected Sales products for an accepted quotation."""
    required: dict[int, int] = {}
    for line in accepted_lines:
        if (line.item_kind or "product") != "product" or line.part_id is None:
            continue
        required[line.part_id] = required.get(line.part_id, 0) + int(line.quantity or 0)
    required = {part_id: quantity for part_id, quantity in required.items() if quantity > 0}
    if not required:
        return []

    parts = (
        db.query(InventoryPart)
        .filter(InventoryPart.id.in_(sorted(required)))
        .order_by(InventoryPart.id.asc())
        .with_for_update()
        .all()
    )
    parts_by_id = {part.id: part for part in parts}
    active = (
        db.query(SalesInventoryReservation)
        .filter(
            SalesInventoryReservation.part_id.in_(sorted(required)),
            SalesInventoryReservation.status == ACTIVE_RESERVATION,
        )
        .order_by(SalesInventoryReservation.part_id.asc(), SalesInventoryReservation.id.asc())
        .with_for_update()
        .all()
    )
    existing_for_quote = {
        reservation.part_id: reservation
        for reservation in active
        if reservation.quotation_id == quotation.id
    }
    if existing_for_quote:
        if (
            set(existing_for_quote) == set(required)
            and all(
                reservation.invoice_id == invoice.id
                and int(reservation.quantity or 0) == required[part_id]
                for part_id, reservation in existing_for_quote.items()
            )
        ):
            return list(existing_for_quote.values())
        raise HTTPException(
            status_code=409,
            detail="This quotation already has a different active inventory reservation",
        )

    reserved_totals: dict[int, int] = {}
    for reservation in active:
        reserved_totals[reservation.part_id] = (
            reserved_totals.get(reservation.part_id, 0) + int(reservation.quantity or 0)
        )
    for part_id, quantity in required.items():
        part = parts_by_id.get(part_id)
        if not part:
            raise HTTPException(status_code=404, detail=f"Sales inventory part #{part_id} was not found")
        reserved = reserved_totals.get(part_id, 0)
        available = max(int(part.quantity_on_hand or 0) - reserved, 0)
        if available < quantity:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=(
                    f"{part.part_number} cannot be invoiced because only {available} "
                    f"unit(s) are available and {reserved} unit(s) are reserved "
                    "for unpaid Sales invoices."
                ),
            )

    now = datetime.utcnow()
    reservations: list[SalesInventoryReservation] = []
    for part_id, quantity in required.items():
        reservation = SalesInventoryReservation(
            quotation_id=quotation.id,
            invoice_id=invoice.id,
            part_id=part_id,
            quantity=quantity,
            status=ACTIVE_RESERVATION,
            created_at=now,
            updated_at=now,
        )
        db.add(reservation)
        reservations.append(reservation)
    db.flush()
    add_invoice_transaction(
        db,
        invoice,
        SALES_INVENTORY_RESERVED,
        0,
        invoice.payment_method,
        (
            f"Reserved {sum(required.values())} Sales inventory unit(s) for "
            f"{quotation.quotation_number} pending payment"
        ),
        actor,
        "RSV",
    )
    return reservations


def release_sales_inventory_reservations(
    db: Session,
    invoice: Invoice,
    reason: str,
    actor: Optional[User],
) -> int:
    """Release an unpaid invoice's stock commitment without changing on-hand stock."""
    part_ids = [
        row[0]
        for row in (
            db.query(SalesInventoryReservation.part_id)
            .filter(
                SalesInventoryReservation.invoice_id == invoice.id,
                SalesInventoryReservation.status == ACTIVE_RESERVATION,
            )
            .all()
        )
    ]
    if not part_ids:
        return 0
    (
        db.query(InventoryPart.id)
        .filter(InventoryPart.id.in_(sorted(set(part_ids))))
        .order_by(InventoryPart.id.asc())
        .with_for_update()
        .all()
    )
    reservations = (
        db.query(SalesInventoryReservation)
        .filter(
            SalesInventoryReservation.invoice_id == invoice.id,
            SalesInventoryReservation.status == ACTIVE_RESERVATION,
        )
        .order_by(SalesInventoryReservation.part_id.asc(), SalesInventoryReservation.id.asc())
        .with_for_update()
        .all()
    )
    now = datetime.utcnow()
    quantity = 0
    for reservation in reservations:
        quantity += int(reservation.quantity or 0)
        reservation.status = "released"
        reservation.released_at = now
        reservation.release_reason = reason[:255]
        reservation.updated_at = now
    if quantity:
        add_invoice_transaction(
            db,
            invoice,
            SALES_INVENTORY_RESERVATION_RELEASED,
            0,
            invoice.payment_method,
            f"Released {quantity} Sales inventory unit(s): {reason}",
            actor,
            "REL",
        )
    return quantity


def ensure_sales_inventory_available(db: Session, invoice: Invoice) -> None:
    """Lock and validate outgoing and incoming Sales stock before a charge."""
    invoice = _lock_invoice(db, invoice)
    if invoice.invoice_type != InvoiceType.SALES:
        return
    if (
        db.query(InvoiceTransaction.id)
        .filter(
            InvoiceTransaction.invoice_id == invoice.id,
            InvoiceTransaction.transaction_type == SALES_INVENTORY_FULFILLED,
        )
        .first()
    ):
        return
    quotation, _required, _parts = _lock_sales_parts(db, invoice)
    _validate_trade_ins(db, quotation)


def fulfill_sales_invoice_inventory(
    db: Session,
    invoice: Invoice,
    actor: Optional[User],
) -> bool:
    """
    Deduct the accepted Sales products exactly once.

    The invoice row is locked by each calling workflow. The ledger marker and
    stock deductions are committed in the same transaction, so retries from
    Square, webhooks, or UI submissions cannot deduct inventory twice.
    """
    invoice = _lock_invoice(db, invoice)
    if invoice.invoice_type != InvoiceType.SALES:
        return False
    if invoice.status != InvoiceStatus.PAID:
        return False
    if (
        db.query(InvoiceTransaction.id)
        .filter(
            InvoiceTransaction.invoice_id == invoice.id,
            InvoiceTransaction.transaction_type == SALES_INVENTORY_FULFILLED,
        )
        .first()
    ):
        return False

    quotation, required, parts_by_id = _lock_sales_parts(db, invoice)
    trade_ins = _validate_trade_ins(db, quotation)
    reservations = (
        db.query(SalesInventoryReservation)
        .filter(
            SalesInventoryReservation.invoice_id == invoice.id,
            SalesInventoryReservation.status == ACTIVE_RESERVATION,
        )
        .order_by(SalesInventoryReservation.part_id.asc(), SalesInventoryReservation.id.asc())
        .with_for_update()
        .all()
    )
    now = datetime.utcnow()
    for part_id, quantity in required.items():
        part = parts_by_id[part_id]
        part.quantity_on_hand = int(part.quantity_on_hand or 0) - quantity
        part.updated_at = now
        db.add(
            InventoryTransaction(
                part_id=part.id,
                facility_id=invoice.facility_id,
                transaction_type="sale",
                quantity=quantity,
                unit_cost=part.unit_price,
                balance_after=part.quantity_on_hand,
                authorization_reference=invoice.invoice_number,
                authorization_details=f"Sales quotation {quotation.quotation_number}",
                notes=f"Sold through invoice {invoice.invoice_number}",
                created_by_id=actor.id if actor else None,
            )
        )
        if part.quantity_on_hand <= part.reorder_level:
            notify_admins(
                db,
                title="Low stock alert",
                message=(
                    f"{part.part_number} is at or below its reorder level after "
                    f"sales invoice {invoice.invoice_number}."
                ),
                notification_type="inventory",
                link_url="/inventory",
                actor_id=actor.id if actor else None,
            )
    for reservation in reservations:
        reservation.status = "fulfilled"
        reservation.fulfilled_at = now
        reservation.updated_at = now

    received_trade_ins: list[dict[str, Any]] = []
    for line, data in trade_ins:
        quantity = int(line.quantity or 0)
        if quantity <= 0:
            raise HTTPException(status_code=409, detail="Trade-in quantity must be greater than zero")
        part = InventoryPart(
            facility_id=None,
            part_number=data["part_number"],
            part_type="sales",
            description=data["description"],
            make=data.get("make"),
            model=data.get("model"),
            default_picture_url=data.get("default_picture_url"),
            inventory_date=now.date(),
            unit_price=line.unit_price or 0,
            condition=str(data.get("condition") or "used").lower(),
            acquisition_method="trade_in",
            acquired_company_name=data.get("supplier_name") or quotation.customer_name,
            acquisition_date=_optional_date(data.get("acquisition_date")) or now.date(),
            supplier_name=data.get("supplier_name") or quotation.customer_name,
            supplier_contact=data.get("supplier_contact"),
            supplier_email=data.get("supplier_email") or quotation.customer_email,
            supplier_phone=data.get("supplier_phone") or quotation.customer_phone,
            supplier_address=data.get("supplier_address") or quotation.customer_address,
            vendor_name=data.get("vendor_name"),
            purchase_location=data.get("purchase_location"),
            shipping_method=data.get("shipping_method"),
            warehouse_arrival_date=_optional_date(data.get("warehouse_arrival_date")),
            batch_number=data.get("batch_number"),
            serial_number=data.get("serial_number"),
            quantity_on_hand=quantity,
            reorder_level=max(int(data.get("reorder_level") or 0), 0),
            location=data.get("location"),
            status="active",
            created_at=now,
            updated_at=now,
        )
        db.add(part)
        db.flush()
        db.add(
            InventoryTransaction(
                part_id=part.id,
                facility_id=None,
                transaction_type="trade_in_receiving",
                quantity=quantity,
                unit_cost=line.unit_price,
                balance_after=quantity,
                authorization_reference=invoice.invoice_number,
                authorization_details=f"Sales quotation {quotation.quotation_number}",
                notes=f"Trade-in received through paid invoice {invoice.invoice_number}",
                created_by_id=actor.id if actor else None,
            )
        )
        received_trade_ins.append(
            {
                "part_id": part.id,
                "part_number": part.part_number,
                "serial_number": part.serial_number,
                "quantity": quantity,
                "balance_after": quantity,
            }
        )

    add_invoice_transaction(
        db,
        invoice,
        SALES_INVENTORY_FULFILLED,
        0,
        invoice.payment_method,
        (
            f"Sales inventory fulfilled for {invoice.invoice_number}; "
            f"{sum(required.values())} unit(s) deducted and "
            f"{sum(item['quantity'] for item in received_trade_ins)} trade-in unit(s) received"
        ),
        actor,
        "STK",
    )
    quotation.status = "completed"
    if invoice.status == InvoiceStatus.PAID:
        quotation.paid_status = "paid"
    quotation.updated_at = now
    history = list(quotation.history or [])
    history.append(
        {
            "action": SALES_INVENTORY_FULFILLED,
            "by": actor.full_name if actor else "System",
            "at": now.isoformat(),
            "details": {
                "invoice_id": invoice.id,
                "invoice_number": invoice.invoice_number,
                "parts": [
                    {
                        "part_id": part_id,
                        "part_number": parts_by_id[part_id].part_number,
                        "quantity": quantity,
                        "balance_after": parts_by_id[part_id].quantity_on_hand,
                    }
                    for part_id, quantity in required.items()
                ],
                "trade_in_parts": received_trade_ins,
            },
        }
    )
    quotation.history = history
    flag_modified(quotation, "history")
    return True
