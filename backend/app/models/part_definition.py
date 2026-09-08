"""A kind of part, described once.

Ten identical pumps share one description and differ only in which physical
object they are. This holds the description; the units hold their own codes and
point here. Editing this reaches every unit at once, which is the behaviour
that makes capturing a batch worth doing.

It is also what recognition matches against. Comparing a new photograph to
every unit would mean comparing it to five hundred pictures of the same pump;
comparing it to definitions means one reference per kind.
"""
from __future__ import annotations

from datetime import datetime

from sqlalchemy import (
    Column,
    Date,
    DateTime,
    ForeignKey,
    Integer,
    JSON,
    Numeric,
    String,
    Text,
)
from sqlalchemy.orm import relationship

from app.db.base import Base


class PartDefinition(Base):
    __tablename__ = "part_definitions"

    id = Column(Integer, primary_key=True, index=True)

    # What someone calls it before the catalogue fields are filled in.
    name = Column(String(255), nullable=False, index=True)
    part_number = Column(String(255), nullable=True, index=True)
    part_type = Column(String(255), nullable=True)
    description = Column(Text, nullable=True)
    make = Column(String(255), nullable=True)
    model = Column(String(255), nullable=True)
    unit_price = Column(Numeric(10, 2), nullable=True)

    # The rest of what the Add Part form asks for, named and typed exactly
    # as inventory_parts names and types them. A definition and the part it
    # becomes describe the same object, so they describe it in the same
    # words -- confirming a capture is then a copy, never a translation.
    condition = Column(String, nullable=True)
    supplier_name = Column(String, nullable=True)
    supplier_contact = Column(String, nullable=True)
    supplier_email = Column(String, nullable=True)
    supplier_phone = Column(String, nullable=True)
    supplier_address = Column(Text, nullable=True)
    vendor_name = Column(String, nullable=True)
    purchase_location = Column(String, nullable=True)
    shipping_method = Column(String, nullable=True)
    acquisition_date = Column(Date, nullable=True)
    warehouse_arrival_date = Column(Date, nullable=True)
    default_picture_url = Column(Text, nullable=True)

    # What recognition compares against. The vector is written by nothing yet.
    reference_photo_path = Column(String(512), nullable=True)
    embedding = Column(JSON, nullable=True)
    embedding_model = Column(String(64), nullable=True)

    # An exact code beats any visual guess, so it is matched before the photo.
    gtin = Column(String(32), nullable=True, index=True)

    created_by_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    created_by = relationship("User")
    captures = relationship("InventoryCapture", back_populates="definition")
