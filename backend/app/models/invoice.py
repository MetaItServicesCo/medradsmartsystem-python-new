from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey, Enum as SQLEnum, Numeric, Date, Index, UniqueConstraint
from sqlalchemy.orm import relationship
from datetime import datetime
import enum
from app.db.base import Base

class InvoiceStatus(str, enum.Enum):
    PENDING = "pending"
    PARTIALLY_PAID = "partially_paid"
    PAID = "paid"
    OVERDUE = "overdue"
    CANCELLED = "cancelled"

class InvoiceType(str, enum.Enum):
    SERVICE = "service"
    INSPECTION = "inspection"
    SALES = "sales"
    RENTAL = "rental"

class Invoice(Base):
    __tablename__ = "invoices"
    __table_args__ = (
        Index("ix_invoices_type_created", "invoice_type", "created_at"),
        Index("ix_invoices_facility_type_created", "facility_id", "invoice_type", "created_at"),
        Index("ix_invoices_type_approval_created", "invoice_type", "billing_approval_status", "created_at"),
        Index("ix_invoices_type_status_created", "invoice_type", "status", "created_at"),
        Index("ix_invoices_type_issue", "invoice_type", "issue_date"),
        UniqueConstraint("rental_id", "rental_period_number", name="uq_invoice_rental_period"),
    )
    
    id = Column(Integer, primary_key=True, index=True)
    invoice_number = Column(String, unique=True, nullable=False, index=True)
    invoice_type = Column(SQLEnum(InvoiceType), nullable=False)
    customer_name = Column(String, nullable=False)
    customer_email = Column(String, nullable=False)
    customer_phone = Column(String, nullable=True)
    customer_address = Column(Text, nullable=True)
    facility_id = Column(Integer, ForeignKey("facilities.id"), nullable=True)
    service_request_id = Column(Integer, ForeignKey("service_requests.id"), nullable=True)
    inspection_id = Column(Integer, ForeignKey("inspections.id"), nullable=True)
    inspection_batch_id = Column(Integer, ForeignKey("inspection_batches.id"), nullable=True, index=True)
    rental_id = Column(Integer, ForeignKey("rentals.id"), nullable=True)
    # Immutable rental-cycle identity. This makes recurring generation
    # idempotent even when schedulers overlap or retry after a process failure.
    rental_period_number = Column(Integer, nullable=True)
    rental_period_start = Column(Date, nullable=True)
    rental_period_end = Column(Date, nullable=True)
    payment_attempt_count = Column(Integer, nullable=False, default=0)
    last_payment_attempt_at = Column(DateTime, nullable=True)
    next_payment_retry_at = Column(DateTime, nullable=True, index=True)
    sales_quotation_id = Column(Integer, ForeignKey("sales_quotations.id"), nullable=True)
    subtotal = Column(Numeric(10, 2), nullable=False)
    tax_amount = Column(Numeric(10, 2), default=0)
    discount_amount = Column(Numeric(10, 2), default=0)
    total_amount = Column(Numeric(10, 2), nullable=False)
    amount_paid = Column(Numeric(10, 2), default=0)
    refunded_amount = Column(Numeric(10, 2), default=0, nullable=False)
    refund_status = Column(String, default="none", nullable=False)
    balance_due = Column(Numeric(10, 2), nullable=False)
    status = Column(SQLEnum(InvoiceStatus), default=InvoiceStatus.PENDING)
    issue_date = Column(Date, nullable=False)
    due_date = Column(Date, nullable=False)
    payment_terms = Column(String, nullable=True)
    payment_method = Column(String, nullable=True)
    notes = Column(Text, nullable=True)
    billing_approval_status = Column(String, nullable=False, default="pending", index=True)
    approved_for_billing_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    approved_for_billing_at = Column(DateTime, nullable=True)
    approved_total_amount = Column(Numeric(10, 2), nullable=True)
    approval_invalidated_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Relationships
    facility = relationship("Facility")
    service_request = relationship("ServiceRequest")
    inspection = relationship("Inspection")
    inspection_batch = relationship("InspectionBatch")
    rental = relationship("Rental", foreign_keys=[rental_id])
    sales_quotation = relationship("SalesQuotation", foreign_keys=[sales_quotation_id])
    approved_for_billing_by = relationship("User", foreign_keys=[approved_for_billing_by_id])
    transactions = relationship("InvoiceTransaction", back_populates="invoice", cascade="all, delete-orphan", order_by="InvoiceTransaction.created_at.desc()")


class InvoiceTransaction(Base):
    __tablename__ = "invoice_transactions"

    id = Column(Integer, primary_key=True, index=True)
    invoice_id = Column(Integer, ForeignKey("invoices.id", ondelete="CASCADE"), nullable=False, index=True)
    facility_id = Column(Integer, ForeignKey("facilities.id"), nullable=True, index=True)
    transaction_type = Column(String, nullable=False, index=True)
    amount = Column(Numeric(10, 2), default=0)
    payment_method = Column(String, nullable=True)
    reference_number = Column(String, nullable=True, index=True)
    description = Column(Text, nullable=True)
    created_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)

    invoice = relationship("Invoice", back_populates="transactions")
    facility = relationship("Facility")
    created_by = relationship("User")
