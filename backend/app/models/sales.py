from datetime import datetime

from sqlalchemy import Boolean, Column, Date, DateTime, ForeignKey, Index, Integer, JSON, Numeric, String, Text
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

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    facility = relationship("Facility")
    created_by = relationship("User", foreign_keys=[created_by_id])
    accepted_by = relationship("User", foreign_keys=[accepted_by_id])
    converted_invoice = relationship("Invoice", foreign_keys=[converted_invoice_id])
    line_items = relationship("SalesQuotationLineItem", back_populates="quotation", cascade="all, delete-orphan")


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
    condition = Column(String, nullable=True)
    total = Column(Numeric(10, 2), nullable=False, default=0)
    created_at = Column(DateTime, default=datetime.utcnow)

    quotation = relationship("SalesQuotation", back_populates="line_items")
    part = relationship("InventoryPart")
