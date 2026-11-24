"""An invoice in a bulk invoice is paid only through that bulk invoice.

Every way an invoice can be paid -- in Billing, through its own link, signed in
as the facility, a saved card, an edit of its paid amount or status -- checks
here first, before any money moves. To pay the invoice on its own, staff remove
it from the bulk invoice. Kept apart from the bulk invoice logic so the payment
paths can use it without importing anything else.
"""
from __future__ import annotations

from typing import Any, Optional

from fastapi import HTTPException, status

from app.models.bulk_invoice import BulkInvoice, BulkInvoiceStatus


def locking_bulk(invoice: Any) -> Optional[BulkInvoice]:
    """The bulk invoice this invoice is paid through, or None.

    A cancelled bulk invoice holds nothing. One paid in full holds nothing
    either, once its invoices have been marked paid; if that could not be done,
    they stay held until staff settle it, so they cannot be paid twice.
    """
    if getattr(invoice, "bulk_invoice_id", None) is None:
        return None
    bulk = getattr(invoice, "bulk_invoice", None)
    if bulk is None or bulk.status == BulkInvoiceStatus.CANCELLED:
        return None
    if bulk.status == BulkInvoiceStatus.PAID and not bulk.settlement_error:
        return None
    return bulk


def bulk_lock_message(invoice: Any, bulk: BulkInvoice) -> str:
    return (
        f"Invoice {invoice.invoice_number} is part of bulk invoice {bulk.bulk_number}. "
        "Pay it through the bulk invoice, or remove it from the bulk invoice first."
    )


def ensure_not_in_bulk(invoice: Any) -> None:
    """Refuse a payment of an invoice that is paid through a bulk invoice."""
    bulk = locking_bulk(invoice)
    if bulk is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=bulk_lock_message(invoice, bulk))
