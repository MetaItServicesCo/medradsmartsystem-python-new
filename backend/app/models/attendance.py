from datetime import datetime
import enum

from sqlalchemy import Column, DateTime, Enum as SQLEnum, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import relationship

from app.db.base import Base


class AttendanceFaceStatus(str, enum.Enum):
    NOT_ENROLLED = "not_enrolled"
    ENROLLED = "enrolled"
    NEEDS_RETRAIN = "needs_retrain"


class AttendanceEventType(str, enum.Enum):
    CHECK_IN = "check_in"
    CHECK_OUT = "check_out"
    BREAK_START = "break_start"
    BREAK_END = "break_end"


class AttendanceSource(str, enum.Enum):
    MANUAL = "manual"
    FACE = "face"
    ADMIN = "admin"


class AttendanceVerificationStatus(str, enum.Enum):
    VERIFIED = "verified"
    NEEDS_REVIEW = "needs_review"
    REJECTED = "rejected"


class AttendanceProfile(Base):
    __tablename__ = "attendance_profiles"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), unique=True, nullable=False, index=True)
    facility_id = Column(Integer, ForeignKey("facilities.id", ondelete="SET NULL"), nullable=True, index=True)
    employee_code = Column(String, unique=True, nullable=True, index=True)
    face_status = Column(SQLEnum(AttendanceFaceStatus), default=AttendanceFaceStatus.NOT_ENROLLED, nullable=False)
    face_samples_count = Column(Integer, default=0, nullable=False)
    face_model_version = Column(String, nullable=True)
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    user = relationship("User")
    facility = relationship("Facility")
    face_samples = relationship("AttendanceFaceSample", back_populates="profile", cascade="all, delete-orphan")
    events = relationship("AttendanceEvent", back_populates="profile")


class AttendanceFaceSample(Base):
    __tablename__ = "attendance_face_samples"

    id = Column(Integer, primary_key=True, index=True)
    profile_id = Column(Integer, ForeignKey("attendance_profiles.id", ondelete="CASCADE"), nullable=False, index=True)
    image_url = Column(String, nullable=False)
    quality_score = Column(Float, nullable=True)
    captured_by_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    captured_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    profile = relationship("AttendanceProfile", back_populates="face_samples")
    captured_by = relationship("User")


class AttendanceEvent(Base):
    __tablename__ = "attendance_events"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    profile_id = Column(Integer, ForeignKey("attendance_profiles.id", ondelete="SET NULL"), nullable=True, index=True)
    facility_id = Column(Integer, ForeignKey("facilities.id", ondelete="SET NULL"), nullable=True, index=True)
    event_type = Column(SQLEnum(AttendanceEventType), nullable=False, index=True)
    event_time = Column(DateTime, default=datetime.utcnow, nullable=False, index=True)
    timezone = Column(String, default="Asia/Karachi", nullable=False)
    source = Column(SQLEnum(AttendanceSource), default=AttendanceSource.MANUAL, nullable=False)
    verification_status = Column(
        SQLEnum(AttendanceVerificationStatus),
        default=AttendanceVerificationStatus.VERIFIED,
        nullable=False,
    )
    confidence = Column(Float, nullable=True)
    remark = Column(String, nullable=True)
    device_label = Column(String, nullable=True)
    image_url = Column(String, nullable=True)
    created_by_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    user = relationship("User", foreign_keys=[user_id])
    profile = relationship("AttendanceProfile", back_populates="events")
    facility = relationship("Facility")
    created_by = relationship("User", foreign_keys=[created_by_id])
