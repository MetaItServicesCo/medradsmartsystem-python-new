from datetime import datetime

from sqlalchemy import Boolean, CheckConstraint, Column, Date, DateTime, ForeignKey, Index, Integer, JSON, Numeric, String, Text, UniqueConstraint
from sqlalchemy.orm import relationship

from app.db.base import Base


class SalesQuotation(Base):
    __tablename__ = "sales_quotations"
    __table_args__ = (
        Index("ix_sales_quotations_status_requested_created", "status", "requested_date", "created_at"),
    )

    id = Column(Integer, primary_key=True, index=True)
    quotation_number = Column(String, unique=True, nullable=False, index=True)
    work_order = Column(String, unique=True, nullable=False, index=True)
    facility_id = Column(Integer, ForeignKey("facilities.id"), nullable=True, index=True)
    created_by_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    converted_invoice_id = Column(Integer, ForeignKey("invoices.id"), nullable=True)
    accepted_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)

    customer_name = Column(String, nullable=False)
    customer_email = Column(String, nullable=True)
    customer_phone = Column(String, nullable=True)
    customer_address = Column(Text, nullable=True)
    # Quotations and directly-created Sales invoices share the same immutable
    # pricing/recipient source model.  document_kind keeps the two user-facing
    # workflows separate while reusing signature, payment, and stock controls.
    document_kind = Column(String, nullable=False, default="quotation", index=True)
    quotation_type = Column(String, nullable=False, default="standard")
    status = Column(String, nullable=False, default="pending", index=True)
    paid_status = Column(String, nullable=False, default="unpaid", index=True)
    requested_date = Column(Date, nullable=True)
    notes = Column(Text, nullable=True)
    worked_hours = Column(Numeric(10, 2), nullable=False, default=0)
    setup_fee = Column(Numeric(10, 2), nullable=False, default=0)
    service_fee = Column(Numeric(10, 2), nullable=False, default=0)
    shipping_fee = Column(Numeric(10, 2), nullable=False, default=0)
    application_fee = Column(Numeric(10, 2), nullable=False, default=0)
    tax_rate = Column(Numeric(10, 2), nullable=False, default=0)
    payment_method = Column(String, nullable=True)
    subtotal = Column(Numeric(10, 2), nullable=False, default=0)
    tax_amount = Column(Numeric(10, 2), nullable=False, default=0)
    discount_amount = Column(Numeric(10, 2), nullable=False, default=0)
    total_amount = Column(Numeric(10, 2), nullable=False, default=0)
    history = Column(JSON, nullable=True)
    selection_status = Column(String, nullable=False, default="pending", index=True)
    selection_channel = Column(String, nullable=True)
    selection_snapshot = Column(JSON, nullable=True)
    accepted_at = Column(DateTime, nullable=True)
    sent_at = Column(DateTime, nullable=True)
    expires_at = Column(DateTime, nullable=True)
    revision = Column(Integer, nullable=False, default=1)

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    facility = relationship("Facility")
    created_by = relationship("User", foreign_keys=[created_by_id])
    accepted_by = relationship("User", foreign_keys=[accepted_by_id])
    # Sales quotations and invoices intentionally reference one another:
    # invoices.sales_quotation_id identifies the source quotation, while this
    # field records the invoice produced by an accepted quotation.  Defer this
    # side to a second UPDATE so SQLAlchemy can flush both dirty records without
    # a circular dependency (notably during payment/inventory notifications).
    converted_invoice = relationship(
        "Invoice",
        foreign_keys=[converted_invoice_id],
        post_update=True,
    )
    line_items = relationship("SalesQuotationLineItem", back_populates="quotation", cascade="all, delete-orphan")
    recipients = relationship("SalesQuotationRecipient", back_populates="quotation", cascade="all, delete-orphan")
    acceptance = relationship("SalesQuotationAcceptance", back_populates="quotation", cascade="all, delete-orphan", uselist=False)
    payment_authorizations = relationship(
        "SalesPaymentAuthorization",
        back_populates="quotation",
        cascade="all, delete-orphan",
        order_by="SalesPaymentAuthorization.created_at.desc()",
    )
    inventory_reservations = relationship(
        "SalesInventoryReservation",
        back_populates="quotation",
        cascade="all, delete-orphan",
    )


class SalesQuotationLineItem(Base):
    __tablename__ = "sales_quotation_line_items"

    id = Column(Integer, primary_key=True, index=True)
    quotation_id = Column(Integer, ForeignKey("sales_quotations.id", ondelete="CASCADE"), nullable=False, index=True)
    part_id = Column(Integer, ForeignKey("inventory_parts.id"), nullable=True, index=True)
    item_kind = Column(String, nullable=False, default="product", index=True)
    is_default = Column(Boolean, nullable=False, default=False)
    is_selected = Column(Boolean, nullable=False, default=False)
    item_metadata = Column(JSON, nullable=True)
    description = Column(Text, nullable=False)
    quantity = Column(Integer, nullable=False, default=1)
    unit_price = Column(Numeric(10, 2), nullable=False, default=0)
    shipping_fee = Column(Numeric(10, 2), nullable=False, default=0)
    setup_fee = Column(Numeric(10, 2), nullable=False, default=0)
    labor_fee = Column(Numeric(10, 2), nullable=False, default=0)
    condition = Column(String, nullable=True)
    total = Column(Numeric(10, 2), nullable=False, default=0)
    created_at = Column(DateTime, default=datetime.utcnow)

    quotation = relationship("SalesQuotation", back_populates="line_items")
    part = relationship("InventoryPart")


class SalesQuotationRecipient(Base):
    __tablename__ = "sales_quotation_recipients"
    __table_args__ = (
        Index("ix_sales_quote_recipients_user_status", "user_id", "status"),
        Index("ix_sales_quote_recipients_quote_type", "quotation_id", "recipient_type"),
    )

    id = Column(Integer, primary_key=True, index=True)
    quotation_id = Column(Integer, ForeignKey("sales_quotations.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    recipient_type = Column(String, nullable=False, default="additional")
    name = Column(String, nullable=False)
    email = Column(String, nullable=False)
    status = Column(String, nullable=False, default="draft", index=True)
    access_token_hash = Column(String, nullable=True, unique=True, index=True)
    token_expires_at = Column(DateTime, nullable=True)
    sent_at = Column(DateTime, nullable=True)
    viewed_at = Column(DateTime, nullable=True)
    accepted_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    quotation = relationship("SalesQuotation", back_populates="recipients")
    user = relationship("User")


class SalesQuotationAcceptance(Base):
    __tablename__ = "sales_quotation_acceptances"
    __table_args__ = (
        UniqueConstraint("quotation_id", name="uq_sales_quote_acceptance_quotation"),
    )

    id = Column(Integer, primary_key=True, index=True)
    quotation_id = Column(Integer, ForeignKey("sales_quotations.id", ondelete="CASCADE"), nullable=False, index=True)
    recipient_id = Column(Integer, ForeignKey("sales_quotation_recipients.id", ondelete="SET NULL"), nullable=True)
    accepted_by_user_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    accepted_by_name = Column(String, nullable=False)
    signature_name = Column(String, nullable=False)
    terms_accepted = Column(Boolean, nullable=False, default=False)
    quotation_revision = Column(Integer, nullable=False)
    selection_snapshot = Column(JSON, nullable=False)
    pricing_snapshot = Column(JSON, nullable=False)
    ip_address = Column(String, nullable=True)
    user_agent = Column(Text, nullable=True)
    accepted_at = Column(DateTime, default=datetime.utcnow, nullable=False, index=True)

    quotation = relationship("SalesQuotation", back_populates="acceptance")
    recipient = relationship("SalesQuotationRecipient")
    accepted_by = relationship("User")


class SalesPaymentAuthorization(Base):
    """Auditable, PCI-minimized authorization against an accepted sales invoice.

    The application deliberately stores only the card brand and last four digits.
    Full card numbers and security codes must be handled by a PCI-compliant payment
    processor and are never persisted here.
    """

    __tablename__ = "sales_payment_authorizations"
    __table_args__ = (
        Index("ix_sales_payment_auth_invoice_status", "invoice_id", "status"),
        Index("ix_sales_payment_auth_quotation_created", "quotation_id", "created_at"),
    )

    id = Column(Integer, primary_key=True, index=True)
    invoice_id = Column(Integer, ForeignKey("invoices.id", ondelete="CASCADE"), nullable=False, index=True)
    quotation_id = Column(Integer, ForeignKey("sales_quotations.id", ondelete="CASCADE"), nullable=False, index=True)
    recipient_id = Column(Integer, ForeignKey("sales_quotation_recipients.id", ondelete="SET NULL"), nullable=True)
    requested_by_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    submitted_by_user_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)

    status = Column(String, nullable=False, default="requested", index=True)
    amount = Column(Numeric(10, 2), nullable=False)
    currency = Column(String, nullable=False, default="USD")
    payment_method = Column(String, nullable=False, default="credit_card")
    channel = Column(String, nullable=False, default="public_link")
    submitted_by_name = Column(String, nullable=True)
    submitted_by_email = Column(String, nullable=True)
    cardholder_name = Column(String, nullable=True)
    card_brand = Column(String, nullable=True)
    card_last_four = Column(String, nullable=True)
    card_expiration = Column(String, nullable=True)
    authorization_reference = Column(String, nullable=True, unique=True, index=True)
    notes = Column(Text, nullable=True)

    access_token_hash = Column(String, nullable=False, unique=True, index=True)
    token_expires_at = Column(DateTime, nullable=False)
    requested_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    submitted_at = Column(DateTime, nullable=True)
    processed_at = Column(DateTime, nullable=True)
    ip_address = Column(String, nullable=True)
    user_agent = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    invoice = relationship("Invoice")
    quotation = relationship("SalesQuotation", back_populates="payment_authorizations")
    recipient = relationship("SalesQuotationRecipient")
    requested_by = relationship("User", foreign_keys=[requested_by_id])
    submitted_by = relationship("User", foreign_keys=[submitted_by_user_id])


class SalesInventoryReservation(Base):
    """Hard stock commitment created only after a Sales quotation is accepted."""

    __tablename__ = "sales_inventory_reservations"
    __table_args__ = (
        UniqueConstraint("quotation_id", "part_id", name="uq_sales_inventory_reservation_quote_part"),
        CheckConstraint("quantity > 0", name="ck_sales_inventory_reservation_quantity_positive"),
        CheckConstraint(
            "status IN ('active', 'released', 'fulfilled')",
            name="ck_sales_inventory_reservation_status",
        ),
        Index("ix_sales_inventory_reservation_part_status", "part_id", "status"),
        Index("ix_sales_inventory_reservation_invoice_status", "invoice_id", "status"),
    )

    id = Column(Integer, primary_key=True, index=True)
    quotation_id = Column(
        Integer,
        ForeignKey("sales_quotations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    invoice_id = Column(
        Integer,
        ForeignKey("invoices.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    part_id = Column(
        Integer,
        ForeignKey("inventory_parts.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    quantity = Column(Integer, nullable=False)
    status = Column(String, nullable=False, default="active", index=True)
    released_at = Column(DateTime, nullable=True)
    fulfilled_at = Column(DateTime, nullable=True)
    release_reason = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    quotation = relationship("SalesQuotation", back_populates="inventory_reservations")
    invoice = relationship("Invoice")
    part = relationship("InventoryPart")
