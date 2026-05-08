from sqlalchemy import Column, DateTime, ForeignKey, Integer, String
from sqlalchemy.orm import relationship
from datetime import datetime

from app.db.base import Base


class FacilityTier(Base):
    __tablename__ = "facility_tiers"

    id = Column(Integer, primary_key=True, index=True)
    facility_id = Column(Integer, ForeignKey("facilities.id", ondelete="CASCADE"), nullable=False, index=True)
    tier_id = Column(Integer, ForeignKey("tiers.id", ondelete="CASCADE"), nullable=False, index=True)
    usage_context = Column(String, default="service")
    assigned_at = Column(DateTime, default=datetime.utcnow)

    facility = relationship("Facility", back_populates="facility_tiers")
    tier = relationship("Tier", back_populates="facility_tiers")
