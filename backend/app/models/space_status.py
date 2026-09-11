"""Is this space available, and if not, why — and what did that cost.

=============================================================================
PHI BOUNDARY. READ BEFORE ADDING A COLUMN.
=============================================================================
This table records the *state* of a space. It must never record the *identity*
of a person occupying it. No name, no medical record number, no date of birth,
no admission or discharge date, no diagnosis, no care team, no free text that
invites any of those.

This system holds no protected health information anywhere today, and that is
worth a great deal: it keeps the product outside HIPAA's covered-data scope and
keeps the audit, encryption and breach-notification burden proportionate to a
maintenance tool. `occupied` is an operational fact about a bed. `occupied by
Mr Patel since Tuesday` is protected health information, and adding it would
reclassify this entire application.

If real occupancy is ever needed, it arrives over HL7 v2 ADT (A01 admit / A02
transfer / A03 discharge) or FHIR Encounter + Location, status only, identity
discarded at the integration boundary — which is what `source` exists for.
The `notes` column is for facilities notes ("waiting on a part"), and reviewers
should treat any patient detail appearing there as a defect.
=============================================================================

The reason this table is worth building at all is the join it enables. Once
space state and work orders live in the same database, the system can answer a
question no standalone CMMS and no bed management system can:

    "We lost 34 bed-days and 11 OR-hours to facility failures this quarter,
     broken down by root cause."

A CMMS cannot answer it because it does not know what the space was for. A bed
management system cannot answer it because it does not know why the space went
down. `SpaceStatusHistory` is what makes that number computable, which is why
it is append-only and written on every transition rather than derived later —
downtime cannot be reconstructed after the fact.
"""
from sqlalchemy import (
    Boolean, Column, DateTime, ForeignKey, Index, Integer, Numeric, String, Text,
    UniqueConstraint,
)
from sqlalchemy.orm import relationship
from datetime import datetime
import enum

from app.db.base import Base
from app.models.location import PROCEDURE_USES


class Availability(str, enum.Enum):
    """One enum covering beds and procedure rooms, because the capacity report
    has to total them together and two enums would drift.

    Which values are legal for a given space is decided by `space_use` — see
    `legal_availabilities` below. A bed never enters `in_procedure`; an
    operating room never sits `vacant_dirty`, it sits in `turnover`.
    """

    # Common
    AVAILABLE = "available"
    OUT_OF_SERVICE = "out_of_service"
    BLOCKED = "blocked"
    RESERVED = "reserved"

    # Bed lifecycle
    OCCUPIED = "occupied"
    VACANT_DIRTY = "vacant_dirty"
    VACANT_CLEAN = "vacant_clean"

    # Procedure room lifecycle
    IN_PROCEDURE = "in_procedure"
    TURNOVER = "turnover"
    TERMINAL_CLEAN = "terminal_clean"


AVAILABILITIES: tuple[str, ...] = tuple(a.value for a in Availability)

_COMMON = {
    Availability.AVAILABLE.value,
    Availability.OUT_OF_SERVICE.value,
    Availability.BLOCKED.value,
    Availability.RESERVED.value,
}

_BED_STATES = _COMMON | {
    Availability.OCCUPIED.value,
    Availability.VACANT_DIRTY.value,
    Availability.VACANT_CLEAN.value,
}

_PROCEDURE_STATES = _COMMON | {
    Availability.IN_PROCEDURE.value,
    Availability.TURNOVER.value,
    Availability.TERMINAL_CLEAN.value,
}

# States that mean the space cannot be used for its purpose right now. The
# capacity report sums time spent in these, and only these.
UNAVAILABLE_STATES: frozenset[str] = frozenset({
    Availability.OUT_OF_SERVICE.value,
    Availability.BLOCKED.value,
})


def legal_availabilities(space_use: str | None, location_type: str) -> frozenset[str]:
    """Which status values make sense for this kind of space.

    Enforced at the API edge rather than by a check constraint, so that adding
    a space use does not need a migration and so that the 400 explains itself.
    """
    if space_use in PROCEDURE_USES:
        return frozenset(_PROCEDURE_STATES)
    if location_type == "bed" or space_use in {"patient_room", "icu", "nicu", "aiir", "protective_isolation"}:
        return frozenset(_BED_STATES)
    return frozenset(_COMMON)


class OutOfServiceReason(str, enum.Enum):
    """Why a space is down. `MAINTENANCE` and `EQUIPMENT_FAILURE` are the two
    that make it onto the facilities-attributable line of the capacity report;
    the rest are somebody else's cost and are tracked so that they are not
    wrongly charged to plant operations."""

    MAINTENANCE = "maintenance"                  # planned facilities work
    EQUIPMENT_FAILURE = "equipment_failure"      # unplanned facilities failure
    UTILITY_OUTAGE = "utility_outage"
    INFECTION_CONTROL = "infection_control"
    ENVIRONMENTAL_OUT_OF_SPEC = "environmental_out_of_spec"
    RENOVATION = "renovation"
    CONSTRUCTION = "construction"
    STAFFING = "staffing"
    OTHER = "other"


OOS_REASONS: tuple[str, ...] = tuple(r.value for r in OutOfServiceReason)

# The subset the plant is answerable for. Everything else is capacity lost for
# reasons outside facilities, and reporting must not conflate them.
FACILITIES_ATTRIBUTABLE_REASONS: frozenset[str] = frozenset({
    OutOfServiceReason.MAINTENANCE.value,
    OutOfServiceReason.EQUIPMENT_FAILURE.value,
    OutOfServiceReason.UTILITY_OUTAGE.value,
    OutOfServiceReason.ENVIRONMENTAL_OUT_OF_SPEC.value,
})


class StatusSource(str, enum.Enum):
    """Where the change came from. Exists from day one so that an ADT or FHIR
    feed can start writing occupancy later without a schema change, and so that
    a report can exclude machine-written rows if it needs to."""

    MANUAL = "manual"
    WORK_ORDER = "work_order"          # opened or closed a WO that took the space down
    ENVIRONMENTAL = "environmental"    # a reading went out of spec
    INTEGRATION = "integration"        # HL7 ADT / FHIR, status only
    SYSTEM = "system"


class SpaceStatus(Base):
    """Current state, one row per location. The hot table the board reads."""

    __tablename__ = "space_statuses"
    __table_args__ = (
        UniqueConstraint("location_id", name="uq_space_statuses_location"),
        Index("ix_space_statuses_facility_availability", "facility_id", "availability"),
        Index("ix_space_statuses_facility_since", "facility_id", "since"),
    )

    id = Column(Integer, primary_key=True, index=True)
    facility_id = Column(Integer, ForeignKey("facilities.id", ondelete="CASCADE"), nullable=False, index=True)
    location_id = Column(Integer, ForeignKey("locations.id", ondelete="CASCADE"), nullable=False, index=True)

    availability = Column(String(32), nullable=False, index=True)
    oos_reason = Column(String(48), nullable=True, index=True)

    # The link that turns a maintenance ticket into a capacity number. Set when
    # a work order is what took the space down.
    work_order_id = Column(Integer, ForeignKey("service_requests.id", ondelete="SET NULL"), nullable=True, index=True)

    # When the space entered this state. `since` is not `updated_at`: editing a
    # note must not restart the clock the downtime report is counting.
    since = Column(DateTime, nullable=False, default=datetime.utcnow, index=True)
    expected_return_at = Column(DateTime, nullable=True)

    source = Column(String(24), nullable=False, default=StatusSource.MANUAL.value)
    # Facilities notes only. See the PHI boundary at the top of this file.
    notes = Column(Text, nullable=True)

    changed_by_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    location = relationship("Location", back_populates="status")
    facility = relationship("Facility")
    work_order = relationship("ServiceRequest")
    changed_by = relationship("User")

    @property
    def is_unavailable(self) -> bool:
        return self.availability in UNAVAILABLE_STATES


class SpaceStatusHistory(Base):
    """Append-only. Every transition, with its duration closed out on exit.

    `duration_minutes` is written when the interval closes rather than computed
    at read time, because the capacity report aggregates across millions of
    rows and because a row whose duration is already settled cannot drift when
    somebody later corrects a timestamp upstream.
    """

    __tablename__ = "space_status_history"
    __table_args__ = (
        Index("ix_ssh_location_from", "location_id", "effective_from"),
        Index("ix_ssh_facility_from", "facility_id", "effective_from"),
        # The capacity report: unavailable intervals in a window, by reason.
        Index("ix_ssh_facility_reason_from", "facility_id", "oos_reason", "effective_from"),
        Index("ix_ssh_open_intervals", "location_id", "effective_to"),
    )

    id = Column(Integer, primary_key=True, index=True)
    facility_id = Column(Integer, ForeignKey("facilities.id", ondelete="CASCADE"), nullable=False, index=True)
    location_id = Column(Integer, ForeignKey("locations.id", ondelete="CASCADE"), nullable=False, index=True)

    availability = Column(String(32), nullable=False, index=True)
    oos_reason = Column(String(48), nullable=True, index=True)
    work_order_id = Column(Integer, ForeignKey("service_requests.id", ondelete="SET NULL"), nullable=True, index=True)

    effective_from = Column(DateTime, nullable=False, default=datetime.utcnow, index=True)
    # NULL means still in this state. The open interval.
    effective_to = Column(DateTime, nullable=True, index=True)
    duration_minutes = Column(Numeric(12, 2), nullable=True)

    # Denormalised off Location at write time. The report groups by these, and a
    # room reclassified from storage to ICU next year must not silently rewrite
    # what last quarter's downtime is attributed to.
    space_use = Column(String(48), nullable=True, index=True)
    criticality = Column(String(16), nullable=True)
    counts_as_bed = Column(Boolean, nullable=False, default=False)
    counts_as_procedure_room = Column(Boolean, nullable=False, default=False)

    source = Column(String(24), nullable=False, default=StatusSource.MANUAL.value)
    notes = Column(Text, nullable=True)

    changed_by_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    location = relationship("Location")
    facility = relationship("Facility")
    work_order = relationship("ServiceRequest")
    changed_by = relationship("User")

    @property
    def is_open(self) -> bool:
        return self.effective_to is None
