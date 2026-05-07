from sqlalchemy import Column, Integer, String, DateTime, Date, ForeignKey, Enum as SQLEnum
from sqlalchemy.orm import relationship
from datetime import datetime
import enum
from app.db.base import Base

class EquipmentStatus(str, enum.Enum):
    ACTIVE = "active"
    RENTED = "rented"
    IN_MAINTENANCE = "in_maintenance"
    RETIRED = "retired"

class Equipment(Base):
    __tablename__ = "equipment"
    
    id = Column(Integer, primary_key=True, index=True)
    asset_tag = Column(String, nullable=False, index=True)
    make = Column(String, nullable=False)
    model = Column(String, nullable=False)
    serial_number = Column(String, nullable=False, index=True)
    modality_id = Column(Integer, ForeignKey("modalities.id"), nullable=False)
    facility_id = Column(Integer, ForeignKey("facilities.id"), nullable=False)
    tier_id = Column(Integer, ForeignKey("tiers.id"), nullable=True)
    purchase_date = Column(Date, nullable=True)
    warranty_expiration = Column(Date, nullable=True)
    status = Column(SQLEnum(EquipmentStatus), default=EquipmentStatus.ACTIVE)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Relationships
    facility = relationship("Facility", back_populates="equipment")
    modality = relationship("Modality", back_populates="equipment")
    tier = relationship("Tier")
    service_requests = relationship("ServiceRequest", back_populates="equipment")
    inspections = relationship("Inspection", back_populates="equipment")
    equipment_facilities = relationship("EquipmentFacility", back_populates="equipment", cascade="all, delete-orphan")
