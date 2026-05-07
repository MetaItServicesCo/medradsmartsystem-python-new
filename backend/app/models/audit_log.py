from sqlalchemy import Column, Integer, String, DateTime, Text, ForeignKey
from datetime import datetime
from app.db.base import Base


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id = Column(Integer, primary_key=True, index=True)
    table_name = Column(String, nullable=False, index=True)
    record_id = Column(Integer, nullable=False, index=True)
    action = Column(String, nullable=False)  # CREATE, UPDATE, DELETE
    changed_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    changed_by_username = Column(String, nullable=True)
    changes_json = Column(Text, nullable=True)  # JSON string of old/new values
    timestamp = Column(DateTime, default=datetime.utcnow, index=True)
