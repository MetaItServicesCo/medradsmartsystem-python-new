"""A lead: a person or business that may become a customer.

The Leads module stands on its own: a lead links to no facility, request or
invoice, only to the user who added it.
"""
from datetime import datetime

from sqlalchemy import Column, DateTime, ForeignKey, Index, Integer, String, Text
from sqlalchemy.orm import relationship

from app.db.base import Base

# Where a lead came from, and where it stands. Stored as these keys; the
# screen shows them as labels (frontend/src/pages/Leads/leadOptions.ts).
LEAD_SOURCES: tuple[str, ...] = (
    "website", "referral", "phone_call", "email", "social_media",
    "trade_show", "walk_in", "advertisement", "other",
)
LEAD_STATUSES: tuple[str, ...] = ("new", "contacted", "qualified", "proposal_sent", "won", "lost")


class Lead(Base):
    __tablename__ = "leads"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(200), nullable=False)
    company = Column(String(200), nullable=True)
    email = Column(String(320), nullable=True)
    phone = Column(String(40), nullable=True)
    source = Column(String(40), nullable=False, index=True)
    status = Column(String(24), nullable=False, default="new", server_default="new", index=True)
    notes = Column(Text, nullable=True)
    created_by_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow, index=True)
    updated_at = Column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)

    created_by = relationship("User", foreign_keys=[created_by_id])


Index("ix_leads_status_created", Lead.status, Lead.created_at.desc())
