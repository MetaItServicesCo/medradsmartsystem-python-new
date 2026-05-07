from sqlalchemy import Column, Integer, String, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from datetime import datetime
from app.db.base import Base


class UserFacility(Base):
    __tablename__ = "user_facilities"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    facility_id = Column(Integer, ForeignKey("facilities.id", ondelete="CASCADE"), nullable=False)
    role_at_facility = Column(String, nullable=True)  # optional override role at this facility
    assigned_at = Column(DateTime, default=datetime.utcnow)

    # Relationships
    user = relationship("User", back_populates="user_facilities")
    facility = relationship("Facility", back_populates="facility_users")
