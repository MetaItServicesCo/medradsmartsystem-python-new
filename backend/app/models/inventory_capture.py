"""Captures: a photograph and a code now, a part record later.

Intake from a phone, standing in front of the thing. The capture exists the
moment the shutter fires and asks for nothing else, because anything it asks
for is typed one-handed in a corridor and will be wrong.

Separate from InventoryPart on purpose. A draft flag on the parts table would
appear in every list, count, summary and export that already exists, none of
which know to exclude it. A capture becomes a part only when somebody confirms
it, and until then nothing in the system counts it as stock.
"""
from __future__ import annotations

from datetime import datetime

from sqlalchemy import (
    Column,
    Date,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
)
from sqlalchemy.orm import relationship

from app.db.base import Base


class CaptureStatus:
    """Small enough to read, and it never reaches the database as an enum."""

    DRAFT = "draft"
    CONFIRMED = "confirmed"
    DISCARDED = "discarded"

    ALL = (DRAFT, CONFIRMED, DISCARDED)


class ExtractionStatus:
    PENDING = "pending"
    DONE = "done"
    FAILED = "failed"
    SKIPPED = "skipped"

    ALL = (PENDING, DONE, FAILED, SKIPPED)


class InventoryCapture(Base):
    __tablename__ = "inventory_captures"
    __table_args__ = (
        Index("ix_inventory_captures_captured_by_created", "captured_by_id", "created_at"),
    )

    id = Column(Integer, primary_key=True, index=True)

    # Assigned at capture and never reused. If a physical label is ever
    # printed, this is what it carries.
    code = Column(String(32), nullable=False, unique=True, index=True)

    facility_id = Column(Integer, ForeignKey("facilities.id", ondelete="SET NULL"), nullable=True, index=True)
    captured_by_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)

    status = Column(String(16), nullable=False, default=CaptureStatus.DRAFT, index=True)

    photo_path = Column(String(512), nullable=True)
    photo_mime = Column(String(64), nullable=True)

    # Whatever was typed at capture time, which is usually nothing.
    label = Column(String(255), nullable=True)
    notes = Column(Text, nullable=True)

    # What the label said. Suggestions rather than facts: nothing writes these
    # yet, and when something does, they still need confirming.
    barcode_raw = Column(Text, nullable=True)
    gtin = Column(String(32), nullable=True, index=True)
    lot = Column(String(64), nullable=True)
    expiry_date = Column(Date, nullable=True)
    serial_number = Column(String(128), nullable=True)
    ocr_text = Column(Text, nullable=True)
    extraction_status = Column(String(16), nullable=False, default=ExtractionStatus.PENDING)

    # Which kind of part this is. Nullable because a capture exists before
    # anyone has decided, which is the point of capturing first.
    definition_id = Column(
        Integer, ForeignKey("part_definitions.id", ondelete="SET NULL"),
        nullable=True, index=True,
    )

    # What it became, once someone confirmed it.
    part_id = Column(Integer, ForeignKey("inventory_parts.id", ondelete="SET NULL"), nullable=True)

    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    facility = relationship("Facility")
    captured_by = relationship("User")
    part = relationship("InventoryPart")
    definition = relationship("PartDefinition", back_populates="captures")
