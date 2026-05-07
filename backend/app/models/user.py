from sqlalchemy import Column, Integer, String, Boolean, DateTime, ForeignKey, Enum as SQLEnum
from sqlalchemy.orm import relationship
from datetime import datetime
import enum
from app.db.base import Base

class UserType(str, enum.Enum):
    EMPLOYEE = "employee"
    CLIENT = "client"

class UserRole(str, enum.Enum):
    SUPERADMIN = "superadmin"
    ADMIN = "admin"
    FACILITY_ADMIN = "facility_admin"
    TECHNICIAN = "technician"
    HR_MANAGER = "hr_manager"
    FACILITY_MANAGER = "facility_manager"
    EMPLOYEE = "employee"
    CLIENT = "client"

class User(Base):
    __tablename__ = "users"
    
    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, index=True, nullable=False)
    email = Column(String, unique=True, index=True, nullable=False)
    full_name = Column(String, nullable=False)
    hashed_password = Column(String, nullable=False)
    phone = Column(String, nullable=True)
    avatar_url = Column(String, nullable=True)
    user_type = Column(SQLEnum(UserType), nullable=False)
    role = Column(SQLEnum(UserRole), nullable=False)
    is_active = Column(Boolean, default=True)
    is_locked = Column(Boolean, default=False)
    failed_login_attempts = Column(Integer, default=0)
    last_login = Column(DateTime, nullable=True)
    facility_id = Column(Integer, ForeignKey("facilities.id"), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Relationships
    facility = relationship("Facility", back_populates="users")
    user_facilities = relationship("UserFacility", back_populates="user", cascade="all, delete-orphan")
    service_requests = relationship("ServiceRequest", foreign_keys="ServiceRequest.requester_id", back_populates="requester")
    assigned_service_requests = relationship("ServiceRequest", foreign_keys="ServiceRequest.assigned_technician_id")
