"""Employee activity tracking, merged in from the Tracker app.

Tracking is separate from pay: hours come only from attendance. What is kept
here is evidence for HR - which apps were in use, input counts (never what was
typed), where a field technician was - and only while the person is checked
in, only for the features a super admin switched on for them, and only after
they consented to it.
"""
from datetime import datetime

from sqlalchemy import (
    JSON, Boolean, Column, Date, DateTime, Float, ForeignKey, Index, Integer, String, UniqueConstraint,
)
from sqlalchemy.orm import relationship

from app.db.base import Base


# The text a person consents to. Changing what is collected means a new
# version, which asks everyone tracked to consent again.
TRACKING_CONSENT_VERSION = "2026-11-v1"
TRACKING_FEATURES = ("desktop_activity", "location", "screen_view")


class TrackingSetting(Base):
    """Which tracking a super admin has switched on for one person, and their consent."""

    __tablename__ = "tracking_settings"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), unique=True, nullable=False, index=True)
    desktop_activity = Column(Boolean, default=False, nullable=False)
    location = Column(Boolean, default=False, nullable=False)
    screen_view = Column(Boolean, default=False, nullable=False)
    # What the person agreed to: the consent text version and the features
    # that were on when they did. A feature switched on later needs consent again.
    consent_version = Column(String, nullable=True)
    consent_features = Column(JSON, nullable=True)
    consent_at = Column(DateTime, nullable=True)
    updated_by_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    user = relationship("User", foreign_keys=[user_id])


class TrackingDevice(Base):
    """A desktop agent or phone app signed in as one person.

    The token is shown once and kept only as a hash. It stops working when the
    device is revoked, the person is deactivated, or their password changes.
    """

    __tablename__ = "tracking_devices"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    kind = Column(String(16), nullable=False)  # desktop | phone
    name = Column(String(255), nullable=False)
    os_name = Column(String(64), nullable=True)
    token_hash = Column(String(64), unique=True, nullable=False, index=True)
    password_version = Column(String(32), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    last_seen_at = Column(DateTime, nullable=True)
    revoked_at = Column(DateTime, nullable=True)

    user = relationship("User", foreign_keys=[user_id])


class TrackingActivityBlock(Base):
    """One stretch of one app in use on a desktop: window titles and input
    counts (keys, clicks, scrolls - counts only, never content)."""

    __tablename__ = "tracking_activity_blocks"
    __table_args__ = (
        UniqueConstraint("user_id", "local_day", "started_at", "app", name="uq_tracking_block"),
        Index("ix_tracking_blocks_user_day", "user_id", "local_day"),
    )

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    device_id = Column(Integer, ForeignKey("tracking_devices.id", ondelete="SET NULL"), nullable=True)
    local_day = Column(Date, nullable=False)
    started_at = Column(DateTime, nullable=False)
    ended_at = Column(DateTime, nullable=False)
    app = Column(String(128), nullable=False)
    titles = Column(JSON, nullable=False, default=list)
    minutes = Column(Integer, nullable=False, default=0)
    tz = Column(String(64), nullable=True)
    keys = Column(Integer, nullable=False, default=0)
    clicks = Column(Integer, nullable=False, default=0)
    scrolls = Column(Integer, nullable=False, default=0)
    mouse_px = Column(Integer, nullable=False, default=0)
    active_samples = Column(Integer, nullable=False, default=0)
    samples = Column(Integer, nullable=False, default=0)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)


class TrackingLocationSample(Base):
    """Where a phone was, kept as evidence: thinned to one point per few
    minutes. The live position lives in Redis and is never kept."""

    __tablename__ = "tracking_location_samples"
    __table_args__ = (Index("ix_tracking_location_user_time", "user_id", "recorded_at"),)

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    device_id = Column(Integer, ForeignKey("tracking_devices.id", ondelete="SET NULL"), nullable=True)
    lat = Column(Float, nullable=False)
    lon = Column(Float, nullable=False)
    accuracy_m = Column(Float, nullable=True)
    speed_mps = Column(Float, nullable=True)
    heading_deg = Column(Float, nullable=True)
    recorded_at = Column(DateTime, nullable=False)
    received_at = Column(DateTime, default=datetime.utcnow, nullable=False)
