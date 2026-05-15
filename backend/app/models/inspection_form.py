from sqlalchemy import Column, Integer, String, Text, DateTime, JSON, ForeignKey
from sqlalchemy.orm import relationship
from datetime import datetime
from app.db.base import Base

class InspectionForm(Base):
    __tablename__ = "inspection_forms"
    
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False, index=True)
    description = Column(Text, nullable=True)
    modality_id = Column(Integer, ForeignKey("modalities.id"), nullable=True, index=True)
    schema = Column(JSON, nullable=False) # JSON schema for form fields
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    modality = relationship("Modality", back_populates="inspection_forms")
