from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey, Enum as SQLEnum, Boolean, JSON
from sqlalchemy.orm import relationship
from datetime import datetime
import enum
from app.db.base import Base

class InspectionStatus(str, enum.Enum):
    UPCOMING = "upcoming"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    OVERDUE = "overdue"

class InspectionResult(str, enum.Enum):
    PASS = "pass"
    FAIL = "fail"
    PENDING = "pending"

class Inspection(Base):
    __tablename__ = "inspections"
    
    id = Column(Integer, primary_key=True, index=True)
    inspection_number = Column(String, unique=True, nullable=False, index=True)
    equipment_id = Column(Integer, ForeignKey("equipment.id"), nullable=True)
    inventory_part_id = Column(Integer, ForeignKey("inventory_parts.id"), nullable=True, index=True)
    facility_id = Column(Integer, ForeignKey("facilities.id"), nullable=False)
    inspector_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    form_template_id = Column(Integer, ForeignKey("inspection_forms.id"), nullable=False)
    status = Column(SQLEnum(InspectionStatus), default=InspectionStatus.UPCOMING)
    result = Column(SQLEnum(InspectionResult), default=InspectionResult.PENDING)
    scheduled_date = Column(DateTime, nullable=False)
    started_at = Column(DateTime, nullable=True)
    completed_at = Column(DateTime, nullable=True)
    form_data = Column(JSON, nullable=True)  # Inspection form responses
    corrective_actions = Column(Text, nullable=True)
    inspection_scope = Column(String, nullable=True, default="facility_inventory")
    inspection_frequency = Column(String, nullable=True, default="instant")
    compliance_requirement = Column(String, nullable=True)
    criticality = Column(String, nullable=True)
    quotation_notes = Column(Text, nullable=True)
    is_instant = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Relationships
    facility = relationship("Facility")
    equipment = relationship("Equipment", back_populates="inspections")
    inventory_part = relationship("InventoryPart")
    inspector = relationship("User")
    form_template = relationship("InspectionForm")
