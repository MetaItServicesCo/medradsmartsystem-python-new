from datetime import datetime

from sqlalchemy import Column, DateTime, ForeignKey, Index, Integer, JSON, Numeric, String, Text, text
from sqlalchemy.orm import relationship

from app.db.base import Base


class PaymentOperation(Base):
    """Durable idempotency record for every money-moving command.

    The client key identifies the command while the fingerprint binds that key
    to its immutable financial intent.  Provider references are unique so a
    webhook and a synchronous response can never post the same transaction
    twice.
    """

    __tablename__ = "payment_operations"
    __table_args__ = (
        Index(
            "uq_payment_operations_active_invoice",
            "invoice_id",
            unique=True,
            postgresql_where=text("invoice_id IS NOT NULL AND status IN ('processing', 'unknown')"),
            sqlite_where=text("invoice_id IS NOT NULL AND status IN ('processing', 'unknown')"),
        ),
        Index(
            "uq_payment_operations_active_quotation",
            "quotation_id",
            unique=True,
            postgresql_where=text("quotation_id IS NOT NULL AND status IN ('processing', 'unknown')"),
            sqlite_where=text("quotation_id IS NOT NULL AND status IN ('processing', 'unknown')"),
        ),
    )

    id = Column(Integer, primary_key=True)
    idempotency_key = Column(String(255), nullable=False, unique=True, index=True)
    request_fingerprint = Column(String(64), nullable=False)
    operation_type = Column(String(40), nullable=False, index=True)
    status = Column(String(24), nullable=False, default="processing", index=True)
    invoice_id = Column(Integer, ForeignKey("invoices.id", ondelete="CASCADE"), nullable=True, index=True)
    quotation_id = Column(Integer, ForeignKey("service_request_quotations.id", ondelete="CASCADE"), nullable=True, index=True)
    provider = Column(String(32), nullable=True)
    provider_reference = Column(String(255), nullable=True, unique=True, index=True)
    amount = Column(Numeric(12, 2), nullable=False)
    currency = Column(String(3), nullable=False, default="USD")
    response_data = Column(JSON, nullable=True)
    error_message = Column(Text, nullable=True)
    created_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at = Column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)
    completed_at = Column(DateTime, nullable=True)

    invoice = relationship("Invoice")
    quotation = relationship("ServiceRequestQuotation")
    created_by = relationship("User")


class PaymentWebhookEvent(Base):
    """Provider webhook inbox with a database-enforced event identity."""

    __tablename__ = "payment_webhook_events"

    id = Column(Integer, primary_key=True)
    provider = Column(String(32), nullable=False, default="square")
    event_id = Column(String(255), nullable=False, unique=True, index=True)
    event_type = Column(String(120), nullable=False, index=True)
    payload_hash = Column(String(64), nullable=False)
    status = Column(String(24), nullable=False, default="received", index=True)
    error_message = Column(Text, nullable=True)
    received_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at = Column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)
    processed_at = Column(DateTime, nullable=True)
