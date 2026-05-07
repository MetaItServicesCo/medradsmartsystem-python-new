from sqlalchemy import Column, Integer, String, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from datetime import datetime
from app.db.base import Base


class EquipmentFacility(Base):
    __tablename__ = "equipment_facilities"

    id = Column(Integer, primary_key=True, index=True)
    equipment_id = Column(Integer, ForeignKey("equipment.id", ondelete="CASCADE"), nullable=False)
    facility_id = Column(Integer, ForeignKey("facilities.id", ondelete="CASCADE"), nullable=False)
    status = Column(String, default="active")  # active / transferred / retired
    assigned_at = Column(DateTime, default=datetime.utcnow)

    # Relationships
    equipment = relationship("Equipment", back_populates="equipment_facilities")
    facility = relationship("Facility", back_populates="facility_equipment")
