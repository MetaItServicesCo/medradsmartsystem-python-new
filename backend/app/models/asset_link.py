"""What feeds what — the distribution graph.

Biomedical equipment is an inventory: a list of things, each in a room. Plant
equipment is a network. A chiller feeds air handlers, which feed VAV boxes,
which feed diffusers in named rooms. Switchgear feeds a panel, which feeds a
breaker, which feeds the receptacle behind the anaesthesia machine.

Two edges, because they answer two different questions:

  * `AssetServesAsset`   — upstream/downstream between plant assets, and,
                           critically, between a plant asset and a piece of
                           *medical* equipment. That last case is the entire
                           argument for keeping both domains in one database.
                           "If I open this breaker, which anaesthesia machines
                           go dark?" cannot be answered by a CMMS that does not
                           hold the clinical assets, nor by a biomedical system
                           that does not hold the panels.
  * `AssetServesLocation` — an air handler serves twenty-two rooms; a zone valve
                           serves a wing. Impact is territorial, not just
                           point-to-point, and rooms are not assets.

Both are plain edge tables with a `service_type`, so one asset can be
downstream of another for power and of a third for chilled water without the
two relationships being confused for each other.
"""
from sqlalchemy import (
    Boolean, Column, DateTime, ForeignKey, Index, Integer, String, Text,
    UniqueConstraint,
)
from sqlalchemy.orm import relationship
from datetime import datetime
import enum

from app.db.base import Base


class ServiceType(str, enum.Enum):
    """The medium flowing along the edge. Impact analysis is always run for one
    of these at a time — losing chilled water and losing normal power affect
    completely different sets of downstream things."""

    NORMAL_POWER = "normal_power"
    ESSENTIAL_POWER = "essential_power"
    CHILLED_WATER = "chilled_water"
    HEATING_HOT_WATER = "heating_hot_water"
    STEAM = "steam"
    SUPPLY_AIR = "supply_air"
    EXHAUST_AIR = "exhaust_air"
    DOMESTIC_COLD_WATER = "domestic_cold_water"
    DOMESTIC_HOT_WATER = "domestic_hot_water"
    SANITARY = "sanitary"
    MEDICAL_AIR = "medical_air"
    OXYGEN = "oxygen"
    NITROUS_OXIDE = "nitrous_oxide"
    MEDICAL_VACUUM = "medical_vacuum"
    FIRE_PROTECTION = "fire_protection"
    FIRE_ALARM = "fire_alarm"
    NURSE_CALL = "nurse_call"
    DATA = "data"
    CONTROLS = "controls"
    VERTICAL_TRANSPORT = "vertical_transport"


SERVICE_TYPES: tuple[str, ...] = tuple(s.value for s in ServiceType)


class AssetServesAsset(Base):
    """Directed edge: `upstream` supplies `downstream`."""

    __tablename__ = "asset_serves_asset"
    __table_args__ = (
        UniqueConstraint(
            "upstream_equipment_id", "downstream_equipment_id", "service_type",
            name="uq_asset_serves_asset",
        ),
        # Walking downstream from a failed asset — the impact query.
        Index("ix_asa_upstream_type", "upstream_equipment_id", "service_type"),
        # Walking upstream from a symptom — the diagnosis query. Both directions
        # are traversed constantly and neither is the rare one.
        Index("ix_asa_downstream_type", "downstream_equipment_id", "service_type"),
    )

    id = Column(Integer, primary_key=True, index=True)
    upstream_equipment_id = Column(Integer, ForeignKey("equipment.id", ondelete="CASCADE"), nullable=False, index=True)
    downstream_equipment_id = Column(Integer, ForeignKey("equipment.id", ondelete="CASCADE"), nullable=False, index=True)
    service_type = Column(String(32), nullable=False, index=True)

    # Where on the upstream asset this connection lands — 'Panel 3B, circuit
    # 14', 'zone valve ZV-2'. The single most useful sentence to a technician
    # holding a torch, and it lives nowhere else.
    connection_ref = Column(String(128), nullable=True)

    # Whether the downstream asset survives losing this feed. A dual-fed panel
    # is redundant; a single-fed one is not, and the impact report must not
    # report them the same way.
    is_redundant = Column(Boolean, nullable=False, default=False)

    notes = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    upstream = relationship("Equipment", foreign_keys=[upstream_equipment_id], back_populates="serves_assets")
    downstream = relationship("Equipment", foreign_keys=[downstream_equipment_id], back_populates="served_by_assets")


class AssetServesLocation(Base):
    """Directed edge: this asset serves this space.

    Attach at the highest location that is wholly served — an air handler
    feeding a whole floor gets one edge to the floor, not ninety to the rooms.
    Impact analysis expands through the materialised path from there, so a room
    added to that floor next year is covered without anybody remembering to
    wire it up.
    """

    __tablename__ = "asset_serves_location"
    __table_args__ = (
        UniqueConstraint(
            "equipment_id", "location_id", "service_type", name="uq_asset_serves_location",
        ),
        Index("ix_asl_equipment_type", "equipment_id", "service_type"),
        Index("ix_asl_location_type", "location_id", "service_type"),
    )

    id = Column(Integer, primary_key=True, index=True)
    equipment_id = Column(Integer, ForeignKey("equipment.id", ondelete="CASCADE"), nullable=False, index=True)
    location_id = Column(Integer, ForeignKey("locations.id", ondelete="CASCADE"), nullable=False, index=True)
    service_type = Column(String(32), nullable=False, index=True)

    # False when another asset also serves this space for the same medium, so
    # losing this one degrades rather than removes the service.
    is_sole_source = Column(Boolean, nullable=False, default=True)
    connection_ref = Column(String(128), nullable=True)

    notes = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    equipment = relationship("Equipment", back_populates="serves_locations")
    location = relationship("Location")
