"""Lease-to-own: a sale paid for in installments, with ownership at the end.

Kept apart from rentals on purpose. A rental is returned; a lease-to-own item
leaves stock for good and becomes the customer's. Folding it into the rental
tables would put the recurring billing that live rental customers are charged
by one edit away from a feature it has nothing to do with.

Statuses are plain strings checked in code rather than database enums, so a
new state never needs an ALTER TYPE on a live table:

    draft       being prepared by staff; nothing has been offered
    sent        the customer has a link to review and sign
    active      signed and in force; installments are being collected
    in_default  enough installments missed that charging has stopped
    completed   paid in full, by schedule or buyout; the customer owns it
    cancelled   withdrawn before completion
"""
from datetime import datetime

from sqlalchemy import (
    Boolean, Column, Date, DateTime, ForeignKey, Index, Integer, JSON, Numeric,
    String, Text, UniqueConstraint,
)
from sqlalchemy.orm import relationship

from app.db.base import Base
from app.utils.payment_data_security import EncryptedPaymentReference

LEASE_STATUSES = ("draft", "sent", "active", "in_default", "completed", "cancelled")
LEASE_OPEN_STATUSES = ("draft", "sent", "active", "in_default")
INSTALLMENT_STATUSES = ("scheduled", "invoiced", "paid", "cancelled")


class LeaseAgreement(Base):
    __tablename__ = "lease_agreements"
    __table_args__ = (
        Index("ix_lease_agreements_status_created", "status", "created_at"),
    )

    id = Column(Integer, primary_key=True, index=True)
    agreement_number = Column(String(40), unique=True, nullable=False, index=True)
    status = Column(String(20), nullable=False, default="draft", index=True)
    revision = Column(Integer, nullable=False, default=1)

    facility_id = Column(Integer, ForeignKey("facilities.id", ondelete="SET NULL"), nullable=True, index=True)
    customer_user_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    customer_name = Column(String, nullable=False)
    customer_email = Column(String, nullable=False)
    customer_phone = Column(String, nullable=True)
    customer_address = Column(Text, nullable=True)

    # What is being leased, with a snapshot of how it was described when the
    # terms were set, so a later edit to the catalogue cannot rewrite them.
    part_id = Column(Integer, ForeignKey("inventory_parts.id", ondelete="SET NULL"), nullable=True, index=True)
    quantity = Column(Integer, nullable=False, default=1)
    item_part_number = Column(String, nullable=True)
    item_description = Column(Text, nullable=False)
    unit_cash_price = Column(Numeric(12, 2), nullable=False)

    # The disclosed terms. Every money figure here comes from lease_math, and
    # terms_snapshot holds the full schedule exactly as the customer saw it.
    cash_price = Column(Numeric(12, 2), nullable=False)
    markup_percent = Column(Numeric(6, 2), nullable=False, default=0)
    markup_amount = Column(Numeric(12, 2), nullable=False, default=0)
    lease_price = Column(Numeric(12, 2), nullable=False)
    down_payment = Column(Numeric(12, 2), nullable=False, default=0)
    down_payment_tax = Column(Numeric(12, 2), nullable=False, default=0)
    tax_rate_percent = Column(Numeric(5, 2), nullable=False)
    installment_count = Column(Integer, nullable=False)
    frequency = Column(String(20), nullable=False, default="monthly")
    first_due_date = Column(Date, nullable=False)
    regular_installment = Column(Numeric(12, 2), nullable=False)
    total_tax = Column(Numeric(12, 2), nullable=False)
    total_of_payments = Column(Numeric(12, 2), nullable=False)
    terms_snapshot = Column(JSON, nullable=True)

    # Collection policy, set per agreement.
    grace_days = Column(Integer, nullable=False, default=5)
    late_fee_amount = Column(Numeric(10, 2), nullable=False, default=0)
    default_after_missed = Column(Integer, nullable=False, default=3)
    invoice_lead_days = Column(Integer, nullable=False, default=7)

    # The customer's link. Only the hash is stored.
    access_token_hash = Column(String(64), nullable=True, unique=True, index=True)
    token_expires_at = Column(DateTime, nullable=True)
    sent_at = Column(DateTime, nullable=True)

    # Signature evidence.
    signed_at = Column(DateTime, nullable=True)
    signed_by_name = Column(String(200), nullable=True)
    signed_terms_revision = Column(Integer, nullable=True)
    signature_ip = Column(String(120), nullable=True)
    signature_user_agent = Column(Text, nullable=True)

    down_payment_invoice_id = Column(Integer, ForeignKey("invoices.id", ondelete="SET NULL"), nullable=True)
    activated_at = Column(DateTime, nullable=True)
    stock_committed = Column(Boolean, nullable=False, default=False)
    stock_committed_at = Column(DateTime, nullable=True)

    # Saved card for automatic collection. Provider references are encrypted;
    # only masked display details sit in the clear.
    auto_charge = Column(Boolean, nullable=False, default=False)
    square_customer_id = Column(EncryptedPaymentReference(), nullable=True)
    square_card_id = Column(EncryptedPaymentReference(), nullable=True)
    square_card_brand = Column(String(40), nullable=True)
    square_card_last4 = Column(String(4), nullable=True)
    square_card_exp_month = Column(Integer, nullable=True)
    square_card_exp_year = Column(Integer, nullable=True)
    auto_charge_authorized_at = Column(DateTime, nullable=True)
    card_cleanup_pending = Column(Boolean, nullable=False, default=False)
    card_cleanup_reference = Column(EncryptedPaymentReference(), nullable=True)
    failed_charge_count = Column(Integer, nullable=False, default=0)

    # Early buyout in progress: while this is set, scheduled collection pauses.
    buyout_invoice_id = Column(Integer, ForeignKey("invoices.id", ondelete="SET NULL"), nullable=True)
    buyout_quoted_total = Column(Numeric(12, 2), nullable=True)
    buyout_requested_at = Column(DateTime, nullable=True)
    # Money paid twice for the same slice of the price -- an installment
    # settled while a buyout covering it was outstanding. Shown to staff for
    # a refund; never silently kept.
    overpayment_amount = Column(Numeric(12, 2), nullable=False, default=0)

    defaulted_at = Column(DateTime, nullable=True)
    completed_at = Column(DateTime, nullable=True)
    completion_method = Column(String(20), nullable=True)   # schedule | buyout
    cancelled_at = Column(DateTime, nullable=True)
    cancellation_reason = Column(Text, nullable=True)
    stock_returned = Column(Boolean, nullable=False, default=False)

    notes = Column(Text, nullable=True)
    history = Column(JSON, nullable=True)
    created_by_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    facility = relationship("Facility")
    part = relationship("InventoryPart")
    customer_user = relationship("User", foreign_keys=[customer_user_id])
    created_by = relationship("User", foreign_keys=[created_by_id])
    down_payment_invoice = relationship("Invoice", foreign_keys=[down_payment_invoice_id])
    buyout_invoice = relationship("Invoice", foreign_keys=[buyout_invoice_id])
    installments = relationship(
        "LeaseInstallment",
        back_populates="agreement",
        cascade="all, delete-orphan",
        order_by="LeaseInstallment.number",
    )
    authorizations = relationship(
        "LeasePaymentAuthorization",
        back_populates="agreement",
        cascade="all, delete-orphan",
        order_by="LeasePaymentAuthorization.created_at.desc()",
    )


class LeaseInstallment(Base):
    """One scheduled payment. Its invoice is the source of truth for paid.

    The status here is a cache for listing, refreshed by reconciliation; what
    a customer actually owes is always read from the linked invoice, which
    every payment route in the system already updates.
    """
    __tablename__ = "lease_installments"
    __table_args__ = (
        UniqueConstraint("agreement_id", "number", name="uq_lease_installment_number"),
        Index("ix_lease_installments_status_due", "status", "due_date"),
    )

    id = Column(Integer, primary_key=True, index=True)
    agreement_id = Column(Integer, ForeignKey("lease_agreements.id", ondelete="CASCADE"), nullable=False, index=True)
    number = Column(Integer, nullable=False)
    due_date = Column(Date, nullable=False, index=True)
    principal = Column(Numeric(12, 2), nullable=False)
    markup = Column(Numeric(12, 2), nullable=False)
    amount = Column(Numeric(12, 2), nullable=False)
    tax = Column(Numeric(12, 2), nullable=False)
    total = Column(Numeric(12, 2), nullable=False)
    status = Column(String(20), nullable=False, default="scheduled")
    invoice_id = Column(Integer, ForeignKey("invoices.id", ondelete="SET NULL"), nullable=True, unique=True)
    late_fee_invoice_id = Column(Integer, ForeignKey("invoices.id", ondelete="SET NULL"), nullable=True, unique=True)
    paid_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    agreement = relationship("LeaseAgreement", back_populates="installments")
    invoice = relationship("Invoice", foreign_keys=[invoice_id])
    late_fee_invoice = relationship("Invoice", foreign_keys=[late_fee_invoice_id])


class LeasePaymentAuthorization(Base):
    """Evidence for every saved-card and automatic-charge decision.

    Append-only. Masked card details and the exact consent wording the
    customer agreed to, so a disputed charge can be answered with what was
    actually authorised rather than with what the code does today.
    """
    __tablename__ = "lease_payment_authorizations"

    id = Column(Integer, primary_key=True, index=True)
    agreement_id = Column(Integer, ForeignKey("lease_agreements.id", ondelete="CASCADE"), nullable=False, index=True)
    event_type = Column(String(32), nullable=False, index=True)   # signed | card_saved | authorized | revoked
    consent_version = Column(String(40), nullable=False)
    consent_text = Column(Text, nullable=False)
    accepted_by_name = Column(String(200), nullable=False)
    channel = Column(String(24), nullable=False)                  # public_link | staff
    ip_address = Column(String(120), nullable=True)
    user_agent = Column(Text, nullable=True)
    card_brand = Column(String(40), nullable=True)
    card_last4 = Column(String(4), nullable=True)
    card_exp_month = Column(Integer, nullable=True)
    card_exp_year = Column(Integer, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    agreement = relationship("LeaseAgreement", back_populates="authorizations")
