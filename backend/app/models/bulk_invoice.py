"""A bulk invoice: several invoices, of one or more facilities, sent and paid as one.

The bulk invoice is what the customer pays. Its total is what its invoices owe;
payments -- by card, ACH, MBMTS ACH, cheque, or recorded by a Super Admin -- are
recorded on the bulk invoice only, so a part payment leaves it "partially paid"
and its invoices untouched. When it is paid in full, each of its invoices is
marked paid through the same path as any invoice payment, referencing it.

While an invoice is in a bulk invoice (not cancelled) it is paid only through
the bulk invoice: to pay it on its own, it is removed from the bulk invoice.
"""
from datetime import datetime

from sqlalchemy import Column, Date, DateTime, ForeignKey, Integer, JSON, Numeric, String, Text
from sqlalchemy.orm import relationship

from app.db.base import Base


class BulkInvoiceStatus:
    DRAFT = "draft"
    SENT = "sent"
    PARTIALLY_PAID = "partially_paid"
    PAID = "paid"
    CANCELLED = "cancelled"


class BulkInvoice(Base):
    __tablename__ = "bulk_invoices"

    id = Column(Integer, primary_key=True, index=True)
    bulk_number = Column(String(40), unique=True, nullable=False, index=True)
    status = Column(String(24), nullable=False, default=BulkInvoiceStatus.DRAFT, index=True)

    # Who it is addressed to: by default a facility's billing contact, as staff left it.
    bill_to_facility_id = Column(Integer, ForeignKey("facilities.id", ondelete="SET NULL"), nullable=True, index=True)
    bill_to_name = Column(String(200), nullable=False)
    bill_to_email = Column(String(320), nullable=True)
    bill_to_address = Column(Text, nullable=True)
    note = Column(Text, nullable=True)

    # What its invoices owed when it was paid in full; while open the total is
    # always worked out from its invoices, so it is never out of date.
    total_amount = Column(Numeric(12, 2), nullable=False, default=0)
    amount_paid = Column(Numeric(12, 2), nullable=False, default=0)
    card_fee_amount = Column(Numeric(12, 2), nullable=False, default=0)
    # {invoice_id: amount} recorded on each invoice when it was paid in full.
    settled_amounts = Column(JSON, nullable=True)
    # Paid in full, but its invoices could not all be marked paid: for staff to look at.
    settlement_error = Column(Text, nullable=True)

    public_link_nonce = Column(String(64), nullable=True)
    public_link_hash = Column(String(64), nullable=True, unique=True, index=True)
    public_link_expires_at = Column(DateTime, nullable=True)
    public_link_sent_at = Column(DateTime, nullable=True)
    public_link_email = Column(String(320), nullable=True)

    issue_date = Column(Date, nullable=True)
    created_by_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)
    paid_at = Column(DateTime, nullable=True)
    cancelled_at = Column(DateTime, nullable=True)

    invoices = relationship("Invoice", back_populates="bulk_invoice")
    payments = relationship(
        "BulkInvoicePayment",
        back_populates="bulk_invoice",
        cascade="all, delete-orphan",
        order_by="BulkInvoicePayment.created_at",
    )
    bill_to_facility = relationship("Facility")
    created_by = relationship("User", foreign_keys=[created_by_id])


class BulkInvoicePayment(Base):
    """One payment on a bulk invoice: its own record, as an invoice's ledger is for an invoice."""

    __tablename__ = "bulk_invoice_payments"

    id = Column(Integer, primary_key=True, index=True)
    bulk_invoice_id = Column(Integer, ForeignKey("bulk_invoices.id", ondelete="CASCADE"), nullable=False, index=True)
    # Toward the balance; a card payment's processing fee is kept apart.
    amount = Column(Numeric(12, 2), nullable=False)
    card_fee_amount = Column(Numeric(12, 2), nullable=False, default=0)
    payment_method = Column(String(40), nullable=False)
    reference_number = Column(String(255), nullable=True, index=True)
    payer_name = Column(String(200), nullable=True)
    notes = Column(Text, nullable=True)
    card_brand = Column(String(40), nullable=True)
    card_last4 = Column(String(4), nullable=True)
    payment_proof_id = Column(Integer, ForeignKey("payment_proofs.id", ondelete="SET NULL"), nullable=True)
    created_by_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False, index=True)

    bulk_invoice = relationship("BulkInvoice", back_populates="payments")
    created_by = relationship("User", foreign_keys=[created_by_id])
