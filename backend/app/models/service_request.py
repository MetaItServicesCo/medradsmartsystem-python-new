from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey, Enum as SQLEnum, Numeric, Boolean, JSON

from sqlalchemy.orm import relationship
from datetime import datetime
import enum
from app.db.base import Base

# ── Quotation models ─────────────────────────────────────────────────────────

class QuotationStatus(str, enum.Enum):
    DRAFT = "draft"
    SENT = "sent"
    APPROVED = "approved"
    REJECTED = "rejected"
    PAID = "paid"

class PaymentMethod(str, enum.Enum):
    CREDIT_CARD = "credit_card"
    ACH = "ach"
    MBMTS_ACH = "mbmts_ach"

class LineItemType(str, enum.Enum):
    PART = "part"
    LABOR = "labor"
    OTHER = "other"


class QuotationLineItem(Base):
    __tablename__ = "quotation_line_items"

    id = Column(Integer, primary_key=True, index=True)
    quotation_id = Column(Integer, ForeignKey("service_request_quotations.id", ondelete="CASCADE"), nullable=False)
    item_type = Column(String, default=LineItemType.PART.value)  # part / labor / other
    description = Column(String, nullable=False)
    quantity = Column(Numeric(10, 2), default=1)
    unit_price = Column(Numeric(10, 2), nullable=False)
    total = Column(Numeric(10, 2), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    # Relationships
    quotation = relationship("ServiceRequestQuotation", back_populates="line_items")


class QuotationPayment(Base):
    __tablename__ = "quotation_payments"

    id = Column(Integer, primary_key=True, index=True)
    quotation_id = Column(Integer, ForeignKey("service_request_quotations.id", ondelete="CASCADE"), nullable=False)
    payment_method = Column(String, nullable=False)  # credit_card / ach / mbmts_ach
    amount = Column(Numeric(10, 2), nullable=False)
    reference_number = Column(String, nullable=True)
    status = Column(String, default="pending")  # pending / completed / failed
    notes = Column(Text, nullable=True)
    # ACH specific fields
    bank_name = Column(String, nullable=True)
    account_last_four = Column(String(4), nullable=True)
    routing_number_last_four = Column(String(4), nullable=True)
    # MBMTS ACH specific fields
    mbmts_account_name = Column(String, nullable=True)
    mbmts_routing_number = Column(String, nullable=True)
    mbmts_account_number = Column(String, nullable=True)
    mbmts_bank_name = Column(String, nullable=True)
    mbmts_bank_address = Column(Text, nullable=True)

    paid_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    created_by_id = Column(Integer, ForeignKey("users.id"), nullable=False)

    # Relationships
    quotation = relationship("ServiceRequestQuotation", back_populates="payments")
    created_by = relationship("User", foreign_keys=[created_by_id])


class ServiceRequestQuotation(Base):
    __tablename__ = "service_request_quotations"

    id = Column(Integer, primary_key=True, index=True)
    service_request_id = Column(Integer, ForeignKey("service_requests.id"), nullable=False)
    created_by_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    quotation_number = Column(String, nullable=False, index=True)
    amount = Column(Numeric(10, 2), nullable=False, default=0)
    description = Column(Text, nullable=False)
    status = Column(String, default=QuotationStatus.DRAFT.value)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    revision_history = Column(JSON, default=list)

    # Relationships
    service_request = relationship("ServiceRequest", back_populates="quotations")
    created_by = relationship("User", foreign_keys=[created_by_id])
    line_items = relationship("QuotationLineItem", back_populates="quotation", cascade="all, delete-orphan", lazy="joined")
    payments = relationship("QuotationPayment", back_populates="quotation", cascade="all, delete-orphan", lazy="joined")


# ── Service Request models ───────────────────────────────────────────────────

class Priority(str, enum.Enum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"

class ServiceRequestStatus(str, enum.Enum):
    NEW = "new"
    ASSIGNED = "assigned"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    CANCELLED = "cancelled"

class BillingStatus(str, enum.Enum):
    PENDING = "pending"
    APPROVED = "approved"
    NOT_APPROVED = "not_approved"

class ServiceRequest(Base):
    __tablename__ = "service_requests"

    id = Column(Integer, primary_key=True, index=True)
    request_number = Column(String, unique=True, nullable=False, index=True)
    facility_id = Column(Integer, ForeignKey("facilities.id"), nullable=False)
    equipment_id = Column(Integer, ForeignKey("equipment.id"), nullable=False)
    requester_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    assigned_technician_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    problem_description = Column(Text, nullable=False)
    priority = Column(SQLEnum(Priority), nullable=False)
    status = Column(SQLEnum(ServiceRequestStatus), default=ServiceRequestStatus.NEW)
    resolution_description = Column(Text, nullable=True)
    time_spent_hours = Column(Numeric(5, 2), nullable=True)
    total_cost = Column(Numeric(10, 2), nullable=True)
    assigned_at = Column(DateTime, nullable=True)
    started_at = Column(DateTime, nullable=True)
    completed_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # New flags
    billing_status = Column(String, default=BillingStatus.PENDING.value)
    cc_auth_requested = Column(Boolean, default=False)
    invoice_deleted = Column(Boolean, default=False)

    # Relationships
    facility = relationship("Facility", back_populates="service_requests")
    equipment = relationship("Equipment", back_populates="service_requests")
    requester = relationship("User", foreign_keys=[requester_id], back_populates="service_requests")
    assigned_technician = relationship("User", foreign_keys=[assigned_technician_id])
    quotations = relationship("ServiceRequestQuotation", back_populates="service_request", cascade="all, delete-orphan", order_by="ServiceRequestQuotation.created_at.desc()")
