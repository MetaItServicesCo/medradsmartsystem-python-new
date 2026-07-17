from sqlalchemy import Column, Integer, String, Text, DateTime, Date, ForeignKey, Enum as SQLEnum, Numeric, JSON
from sqlalchemy.orm import relationship
from datetime import datetime
import enum
from app.db.base import Base

class RentalStatus(str, enum.Enum):
    ACTIVE = "active"
    COMPLETED = "completed"
    CANCELLED = "cancelled"

class BillingFrequency(str, enum.Enum):
    DAILY = "daily"
    WEEKLY = "weekly"
    MONTHLY = "monthly"

class Rental(Base):
    __tablename__ = "rentals"
    
    id = Column(Integer, primary_key=True, index=True)
    rental_number = Column(String, unique=True, nullable=False, index=True)
    equipment_id = Column(Integer, ForeignKey("equipment.id"), nullable=True)
    part_id = Column(Integer, ForeignKey("inventory_parts.id"), nullable=True, index=True)
    converted_invoice_id = Column(Integer, ForeignKey("invoices.id"), nullable=True)
    created_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    
    customer_name = Column(String, nullable=False)
    customer_email = Column(String, nullable=False)
    customer_phone = Column(String, nullable=False)
    customer_address = Column(Text, nullable=False)
    billing_frequency = Column(SQLEnum(BillingFrequency), nullable=False)
    rental_rate = Column(Numeric(10, 2), nullable=False)
    security_deposit = Column(Numeric(10, 2), nullable=False)
    quantity = Column(Integer, nullable=False, default=1)
    shipping_fee = Column(Numeric(10, 2), nullable=False, default=0)
    setup_fee = Column(Numeric(10, 2), nullable=False, default=0)
    item_condition = Column(String, nullable=True)
    start_date = Column(Date, nullable=False)
    end_date = Column(Date, nullable=False)
    actual_return_date = Column(Date, nullable=True)
    status = Column(SQLEnum(RentalStatus), default=RentalStatus.ACTIVE)
    initial_condition = Column(Text, nullable=True)
    return_condition = Column(Text, nullable=True)
    initial_meter_reading = Column(Text, nullable=True)
    final_meter_reading = Column(Integer, nullable=True)
    terms_and_conditions = Column(Text, nullable=True)
    history = Column(JSON, nullable=True)
    
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Relationships
    equipment = relationship("Equipment")
    part = relationship("InventoryPart")
    converted_invoice = relationship("Invoice", foreign_keys=[converted_invoice_id])
    created_by = relationship("User")
