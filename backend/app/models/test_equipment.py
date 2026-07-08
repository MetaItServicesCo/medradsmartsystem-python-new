from datetime import datetime

from sqlalchemy import Column, DateTime, ForeignKey, Index, Integer, String, Text
from sqlalchemy.orm import relationship

from app.db.base import Base


class TestEquipment(Base):
    __tablename__ = "test_equipment"

    id = Column(Integer, primary_key=True, index=True)
    tem = Column(String, nullable=False, index=True)
    mrf = Column(String, nullable=True, index=True)
    model = Column(String, nullable=True, index=True)
    serial_number = Column(String, nullable=True, index=True)
    description = Column(Text, nullable=True)
    asset = Column(String, nullable=True, index=True)
    technician_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    status = Column(String, nullable=False, default="active", index=True)
    image_url = Column(Text, nullable=True)
    created_by_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, index=True)

    technician = relationship("User", foreign_keys=[technician_id])
    created_by = relationship("User", foreign_keys=[created_by_id])


Index("ix_test_equipment_status_updated", TestEquipment.status, TestEquipment.updated_at.desc())
