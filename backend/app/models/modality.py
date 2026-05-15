from sqlalchemy import Column, Integer, String, Text, ForeignKey, Enum as SQLEnum
from sqlalchemy.orm import relationship
from datetime import datetime
import enum
from app.db.base import Base

class ModalityCategory(str, enum.Enum):
    IMAGING = "imaging"
    PATIENT_MONITORING = "patient_monitoring"
    LABORATORY = "laboratory"
    TREATMENT = "treatment"

class Modality(Base):
    __tablename__ = "modalities"
    
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False, unique=True)
    category = Column(SQLEnum(ModalityCategory), nullable=False)
    description = Column(Text, nullable=True)
    inspection_frequency_days = Column(Integer, nullable=True)
    parent_id = Column(Integer, ForeignKey("modalities.id"), nullable=True)
    
    # Relationships
    parent = relationship("Modality", remote_side=[id], back_populates="children")
    children = relationship("Modality", back_populates="parent", cascade="all, delete-orphan")
    equipment = relationship("Equipment", back_populates="modality")
    inspection_forms = relationship("InspectionForm", back_populates="modality")
