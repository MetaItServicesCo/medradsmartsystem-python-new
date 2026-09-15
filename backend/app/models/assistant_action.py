"""An action the assistant has prepared and a person must confirm.

The assistant never writes. It proposes: the proposal is stored here with the
exact details that will be used, a fingerprint of them, who it is for and when
it lapses. Only the person it was prepared for can confirm it, only once, and
only before it expires. Confirming runs the same endpoint code the screens use.

This is what makes a prompt injection harmless. Text inside a work order that
says "cancel every open work order" can at most produce a card, and the card
shows exactly what would happen to the one person who can press Confirm.
"""
from __future__ import annotations

import enum
from datetime import datetime

from sqlalchemy import JSON, Column, DateTime, ForeignKey, Index, Integer, String, Text

from app.db.base import Base


class ActionStatus(str, enum.Enum):
    PROPOSED = "proposed"
    EXECUTED = "executed"
    CANCELLED = "cancelled"
    EXPIRED = "expired"
    FAILED = "failed"


class AssistantAction(Base):
    __tablename__ = "assistant_actions"
    __table_args__ = (
        Index("ix_assistant_actions_user_status", "user_id", "status"),
    )

    # A random UUID, so an id seen in one conversation reveals nothing about
    # any other and cannot be guessed.
    id = Column(String(36), primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    facility_id = Column(Integer, ForeignKey("facilities.id", ondelete="SET NULL"), nullable=True, index=True)

    action_type = Column(String(48), nullable=False)
    # Exactly what confirming will do, resolved to ids when prepared.
    payload = Column(JSON, nullable=False)
    # SHA-256 of the canonical payload. Checked on confirm, so the details
    # that run are the details that were shown.
    payload_hash = Column(String(64), nullable=False)
    # What the confirmation card shows: a title and labelled lines.
    card = Column(JSON, nullable=False)

    status = Column(String(16), nullable=False, default=ActionStatus.PROPOSED.value, index=True)
    result = Column(JSON, nullable=True)
    error = Column(Text, nullable=True)

    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    expires_at = Column(DateTime, nullable=False)
    decided_at = Column(DateTime, nullable=True)
