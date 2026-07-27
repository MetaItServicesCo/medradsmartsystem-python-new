from sqlalchemy import Column, Integer, String, DateTime, Date, ForeignKey, Enum as SQLEnum, Text, Numeric
from sqlalchemy.orm import relationship
from datetime import datetime
import enum
from app.db.base import Base

class EquipmentStatus(str, enum.Enum):
    ACTIVE = "active"
    INACTIVE = "inactive"
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
    facility_id = Column(Integer, ForeignKey("facilities.id"), nullable=False, index=True)
    tier_id = Column(Integer, ForeignKey("tiers.id"), nullable=True)
    inspection_form_id = Column(Integer, ForeignKey("inspection_forms.id"), nullable=True)
    default_picture_url = Column(Text, nullable=True)
    description = Column(Text, nullable=True)
    risk_priority = Column(String, nullable=True)
    risk_name = Column(String, nullable=True)
    location = Column(String, nullable=True)
    inventory_date = Column(Date, nullable=True)
    acquisition_authorized_by = Column(String, nullable=True)
    department = Column(String, nullable=True)
    po_no = Column(String, nullable=True)
    requester_first_name = Column(String, nullable=True)
    requester_last_name = Column(String, nullable=True)
    requester_phone = Column(String, nullable=True)
    requester_fax = Column(String, nullable=True)
    requester_mailing_address = Column(Text, nullable=True)
    requester_email = Column(String, nullable=True)
    owning_department = Column(String, nullable=True)
    acquisition_method = Column(String, nullable=True)
    acquired_company_name = Column(String, nullable=True)
    acquired_account_number = Column(String, nullable=True)
    acquired_sales_person = Column(String, nullable=True)
    acquired_phone = Column(String, nullable=True)
    acquired_email = Column(String, nullable=True)
    acquired_mailing_address = Column(Text, nullable=True)
    cost = Column(Numeric(10, 2), nullable=True)
    acquisition_date = Column(Date, nullable=True)
    capital_equipment = Column(String, nullable=True)
    warranty_duration = Column(String, nullable=True)
    parts_duration = Column(String, nullable=True)
    labor_duration = Column(String, nullable=True)
    coverage_start_date = Column(Date, nullable=True)
    coverage_type = Column(String, nullable=True)
    part_warranty_end_date = Column(Date, nullable=True)
    labor_warranty_end_date = Column(Date, nullable=True)
    pm_scheduling = Column(String, nullable=True)
    installation_date = Column(Date, nullable=True)
    last_pm_date = Column(Date, nullable=True)
    next_generated_pm_date = Column(Date, nullable=True)
    purchase_date = Column(Date, nullable=True)
    warranty_expiration = Column(Date, nullable=True)
    status = Column(SQLEnum(EquipmentStatus), default=EquipmentStatus.ACTIVE)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Relationships
    facility = relationship("Facility", back_populates="equipment")
    modality = relationship("Modality", back_populates="equipment")
    tier = relationship("Tier")
    inspection_form = relationship("InspectionForm")
    service_requests = relationship("ServiceRequest", back_populates="equipment")
    inspections = relationship("Inspection", back_populates="equipment")
    equipment_facilities = relationship("EquipmentFacility", back_populates="equipment", cascade="all, delete-orphan")
