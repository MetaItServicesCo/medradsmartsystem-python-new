from sqlalchemy import Column, Integer, String, Numeric, Text, DateTime
from sqlalchemy.orm import relationship
from datetime import datetime
from app.db.base import Base

class Tier(Base):
    __tablename__ = "tiers"
    
    id = Column(Integer, primary_key=True, index=True)
    tier_code = Column(String, nullable=False, unique=True)  # Custom user-provided ID
    name = Column(String, nullable=False, unique=True)  # Silver, Gold, Platinum
    description = Column(Text, nullable=True)
    response_time_hours = Column(Integer, nullable=True)  # SLA response time
    labor_rate_per_hour = Column(Numeric(10, 2), nullable=False)
    service_call_fee = Column(Numeric(10, 2), nullable=False)
    preventive_maintenance_fee = Column(Numeric(10, 2), nullable=False)
    mileage_rate = Column(Numeric(10, 2), nullable=False)
    status = Column(String, nullable=False, default="active")  # active / inactive
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Relationships
    facilities = relationship("Facility", back_populates="tier")
    facility_tiers = relationship("FacilityTier", back_populates="tier", cascade="all, delete-orphan")
    assigned_facilities = relationship("Facility", secondary="facility_tiers", viewonly=True)
    inventory_parts = relationship("InventoryPart", back_populates="tier")
