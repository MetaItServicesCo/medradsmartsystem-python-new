"""The things inside a room that can stop working.

A socket at the head of a bed. A light over a scrub sink. An oxygen outlet in
bay three. These are what maintenance is actually about most days, and until
now the system had nowhere to put them: a room could hold `equipment`, but
creating one of those demands an asset tag, a make, a model, a serial number
and a *clinical modality*, which is not a sensible thing to ask of a duplex
receptacle. So the founding use case — a socket in an operating theatre stops
working, raise a ticket against it — could not be done.

A fixture is not a nameless tick-box. It carries a real specification, and the
specification is what makes the work order actionable: a technician dispatched
to "socket not working" needs to know it is a 20 A critical-branch receptacle
on panel EM-3 breaker 14 before deciding what to bring. Every quantity here is
US customary, because that is what the nameplate says and what the parts
catalogue is ordered in.

Discipline is the routing key. A receptacle is electrical, a diffuser is
mechanical, a scrub sink is plumbing — so a fault reported on a fixture reaches
the right trade without anybody choosing from a dropdown.

Why a separate table rather than relaxing `equipment`: a hospital has perhaps
two thousand pieces of plant and perhaps eighty thousand fixtures. Putting the
latter in the former makes every asset list, depreciation run and PM schedule
mostly sockets. Plant has warranty, book value and a maintenance programme.
A fixture has a location, a spec, and a state.
"""
from __future__ import annotations

import enum

from sqlalchemy import (
    JSON, Boolean, Column, Date, DateTime, ForeignKey, Index, Integer,
    String, Text, UniqueConstraint, func,
)
from sqlalchemy import true as sa_true

from app.db.base import Base


class FixtureStatus(str, enum.Enum):
    WORKING = "working"
    FAULTY = "faulty"
    # Deliberately distinct from faulty: isolated for work, not broken.
    ISOLATED = "isolated"
    REMOVED = "removed"


FIXTURE_STATUSES: tuple[str, ...] = tuple(s.value for s in FixtureStatus)


class Fixture(Base):
    """One serviceable item fixed within a space."""

    __tablename__ = "fixtures"
    __table_args__ = (
        # Codes are unique inside a room, not globally: every theatre has an
        # SKT-01, and qualifying by room is how anybody refers to them out loud.
        UniqueConstraint("location_id", "code", name="uq_fixtures_location_code"),
        Index("ix_fixtures_facility_type", "facility_id", "fixture_type"),
        Index("ix_fixtures_facility_status", "facility_id", "status"),
        Index("ix_fixtures_location_type", "location_id", "fixture_type"),
        Index("ix_fixtures_discipline_status", "discipline_id", "status"),
    )

    id = Column(Integer, primary_key=True, index=True)
    facility_id = Column(Integer, ForeignKey("facilities.id", ondelete="CASCADE"), nullable=False, index=True)
    location_id = Column(Integer, ForeignKey("locations.id", ondelete="CASCADE"), nullable=False, index=True)

    # The trade this routes to. Denormalised from the type catalogue at write
    # time so a site can re-route a type — some hospitals run medical gas under
    # plumbing — without the catalogue becoming site-specific.
    discipline_id = Column(Integer, ForeignKey("disciplines.id", ondelete="SET NULL"), nullable=True, index=True)

    fixture_type = Column(String(48), nullable=False, index=True)
    code = Column(String(64), nullable=False)
    # Where it is in the room, in the words somebody standing there would use:
    # "head of bed, anaesthesia side". This is what stops a technician hunting.
    label = Column(String(255), nullable=True)

    # ── Identity ────────────────────────────────────────────────────────────
    manufacturer = Column(String(128), nullable=True)
    model = Column(String(128), nullable=True)
    serial_number = Column(String(128), nullable=True, index=True)

    # ── Specification, in US customary units ────────────────────────────────
    # Typed per fixture type by the catalogue in app/services/fixture_catalog.py
    # rather than as columns, because a receptacle's voltage and amperage and a
    # diffuser's CFM have nothing in common and forty nullable columns would be
    # worse than one validated document.
    spec = Column(JSON, nullable=True)

    # ── What feeds it ───────────────────────────────────────────────────────
    # The panel, air handler or manifold upstream. Turns "this socket is dead"
    # into "this socket, its neighbour and four in the next room share breaker
    # 14", which is the difference between a callout and a diagnosis.
    served_by_equipment_id = Column(Integer, ForeignKey("equipment.id", ondelete="SET NULL"), nullable=True, index=True)
    # Panel and breaker, zone valve, duct run. Free text because the convention
    # is the site's, not ours.
    circuit_ref = Column(String(128), nullable=True)

    status = Column(String(16), nullable=False, default=FixtureStatus.WORKING.value,
                    server_default=FixtureStatus.WORKING.value, index=True)
    # The work order that took it out of service, so the board can say why.
    work_order_id = Column(Integer, ForeignKey("service_requests.id", ondelete="SET NULL"), nullable=True, index=True)

    quantity = Column(Integer, nullable=False, default=1, server_default="1")
    installed_on = Column(Date, nullable=True)
    warranty_expires_on = Column(Date, nullable=True)
    last_tested_on = Column(Date, nullable=True)

    # Position on the room's floor plan, normalised 0-1 like Location.plan_x/y.
    plan_x = Column(String(24), nullable=True)
    plan_y = Column(String(24), nullable=True)

    notes = Column(Text, nullable=True)
    # A Python-side default as well as the server one: `server_default="true"`
    # alone writes the literal string on SQLite, and `is_active.is_(True)`
    # then matches nothing while the attribute still reads True on the way
    # back out. Silent on Postgres, and silently wrong under test.
    is_active = Column(Boolean, nullable=False, default=True, server_default=sa_true())

    created_by_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(DateTime, nullable=False, server_default=func.now())
    updated_at = Column(DateTime, nullable=False, server_default=func.now(), onupdate=func.now())
