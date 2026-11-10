from sqlalchemy import Column, Integer, String, DateTime, Boolean, ForeignKey, Text, Table, text
from sqlalchemy.orm import relationship
from datetime import datetime

from app.db.base import Base


# The technicians a schedule event is for. Deleting the event, or the user,
# removes the tag.
calendar_event_technicians = Table(
    "calendar_event_technicians",
    Base.metadata,
    Column("event_id", Integer, ForeignKey("calendar_events.id", ondelete="CASCADE"), primary_key=True),
    Column("user_id", Integer, ForeignKey("users.id", ondelete="CASCADE"), primary_key=True, index=True),
)


class CalendarEvent(Base):
    __tablename__ = "calendar_events"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    workspace_id = Column(Integer, ForeignKey("workspaces.id"), nullable=True)
    title = Column(String(100), nullable=False)
    description = Column(Text, nullable=True)
    start_time = Column(DateTime, nullable=False)
    end_time = Column(DateTime, nullable=False)
    is_meeting = Column(Boolean, default=False)
    color = Column(String(20), default="#7C3AED")
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    # A technician schedule: an event for one or more tagged technicians,
    # seen by them, by its creator and by every Admin and Super Admin. Kept
    # apart from every other module. Personal and workspace events leave it off.
    is_schedule = Column(Boolean, nullable=False, default=False, server_default=text("false"), index=True)
    all_day = Column(Boolean, nullable=False, default=False, server_default=text("false"))
    location = Column(String(200), nullable=True)

    # Relationships
    creator = relationship("User", backref="created_calendar_events")
    workspace = relationship("Workspace", backref="calendar_events")
    technicians = relationship("User", secondary=calendar_event_technicians, lazy="selectin")
