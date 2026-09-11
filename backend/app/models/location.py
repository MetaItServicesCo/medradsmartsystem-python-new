"""Where things are — the space register a hospital never had.

`Equipment.location` is a free-text string, which is enough for a portable
ultrasound that lives in a room and useless for facilities work. An air handler
*serves* floors three through five. A shutoff valve serves a wing. Elevator 4
is in bank B, shaft 2. None of that is expressible in a string, and all of it
is the daily currency of plant operations.

One self-referential table rather than a table per level, because hospitals are
irregular: tunnels between buildings, detached central energy plants, rooftop
penthouses, modular units parked in a car park for two years. A fixed
campus/building/floor/room schema breaks on the first of those. Legal
parent -> child pairings are enforced in `app.services.location_tree` instead,
which gives the flexibility without the free-for-all.

`Facility` stays the tenancy and billing boundary and is treated as the campus.
Nothing here sits above it: `facility_id` is the scoping key on every table in
this system and on the RBAC data scope, and inserting a campus above it would
mean re-plumbing all of that to buy nothing.
"""
from sqlalchemy import (
    Boolean, Column, DateTime, ForeignKey, Index, Integer, JSON, Numeric, String, Text,
)
from sqlalchemy.orm import relationship
from datetime import datetime
import enum

from app.db.base import Base


class LocationType(str, enum.Enum):
    """Kept as strings in the column, not a Postgres ENUM.

    Adding `pod` or `tunnel` for one customer should be a code change at worst,
    never an ALTER TYPE on a live database in the middle of a survey.
    """

    BUILDING = "building"
    FLOOR = "floor"
    WING = "wing"
    ROOM = "room"
    BED = "bed"
    SHAFT = "shaft"
    RISER = "riser"
    MECH_ROOM = "mech_room"
    PLENUM = "plenum"
    ROOF = "roof"
    EXTERIOR = "exterior"


LOCATION_TYPES: tuple[str, ...] = tuple(t.value for t in LocationType)


class SpaceUse(str, enum.Enum):
    """What clinically or operationally happens in the space.

    This is the tag that earns its keep: it drives the SLA clock, decides which
    compliance schedules attach, decides whether a permit is required before
    work, and constrains which status values are even legal for the space.
    """

    OPERATING_ROOM = "operating_room"
    PROCEDURE_ROOM = "procedure_room"
    ICU = "icu"
    NICU = "nicu"
    PATIENT_ROOM = "patient_room"
    AIIR = "aiir"                          # airborne infection isolation
    PROTECTIVE_ISOLATION = "protective_isolation"
    EMERGENCY = "emergency"
    IMAGING = "imaging"
    LABORATORY = "laboratory"
    PHARMACY = "pharmacy"
    STERILE_PROCESSING = "sterile_processing"
    DIALYSIS = "dialysis"
    MECHANICAL = "mechanical"
    ELECTRICAL = "electrical"
    DATA = "data"
    KITCHEN = "kitchen"
    OFFICE = "office"
    STORAGE = "storage"
    CORRIDOR = "corridor"
    PUBLIC = "public"
    OTHER = "other"


SPACE_USES: tuple[str, ...] = tuple(u.value for u in SpaceUse)

# Spaces where a facilities failure reaches a patient quickly. Used to seed
# criticality on create so nobody has to remember to set it by hand, and by the
# SLA calculator when a location carries no explicit criticality of its own.
HIGH_ACUITY_USES: frozenset[str] = frozenset({
    SpaceUse.OPERATING_ROOM.value,
    SpaceUse.PROCEDURE_ROOM.value,
    SpaceUse.ICU.value,
    SpaceUse.NICU.value,
    SpaceUse.AIIR.value,
    SpaceUse.PROTECTIVE_ISOLATION.value,
    SpaceUse.EMERGENCY.value,
    SpaceUse.DIALYSIS.value,
})

# Spaces whose own environmental state is a facilities responsibility that gates
# clinical use: an AIIR that loses negative pressure cannot hold the patient it
# was built for, and an OR outside its temperature and humidity band should not
# take a case.
ENVIRONMENTALLY_GATED_USES: frozenset[str] = frozenset({
    SpaceUse.OPERATING_ROOM.value,
    SpaceUse.PROCEDURE_ROOM.value,
    SpaceUse.AIIR.value,
    SpaceUse.PROTECTIVE_ISOLATION.value,
    SpaceUse.STERILE_PROCESSING.value,
})

# Procedure spaces run a different state machine to a bed: a case, then
# turnover, then a terminal clean. Held here because both the status validator
# and the capacity report need to agree on which spaces those are.
PROCEDURE_USES: frozenset[str] = frozenset({
    SpaceUse.OPERATING_ROOM.value,
    SpaceUse.PROCEDURE_ROOM.value,
})


class Criticality(str, enum.Enum):
    """How fast a failure here has to be answered.

    Deliberately about consequence, not about the asset. The same dead
    receptacle is a Tuesday ticket in a supply closet and a cancelled case in
    an operating room, and the space is the thing that knows the difference.
    """

    CRITICAL = "critical"
    HIGH = "high"
    STANDARD = "standard"
    LOW = "low"


class ElectricalBranch(str, enum.Enum):
    """NFPA 99 / 110 essential electrical system branches.

    Separate from `Criticality` because they answer different questions: the
    branch says what happens on loss of normal power, criticality says how fast
    somebody has to come.
    """

    LIFE_SAFETY = "life_safety"
    CRITICAL = "critical"
    EQUIPMENT = "equipment"
    NORMAL = "normal"


class OccupancyStatus(str, enum.Enum):
    """Physical state of the space itself, never of who is inside it.

    `UNDER_CONSTRUCTION` is the one with teeth: it is what an interim life
    safety measures (ILSM) assessment keys off, and it changes what work in
    neighbouring spaces is allowed to look like.
    """

    IN_SERVICE = "in_service"
    UNDER_CONSTRUCTION = "under_construction"
    DECOMMISSIONED = "decommissioned"


class Location(Base):
    __tablename__ = "locations"
    __table_args__ = (
        # The workhorse. Subtree reads are `path LIKE '/3/41/%'`, and every list
        # view filters by facility first, so the two travel together.
        Index("ix_locations_facility_path", "facility_id", "path"),
        Index("ix_locations_facility_type_active", "facility_id", "location_type", "is_active"),
        Index("ix_locations_parent_code", "parent_id", "code"),
        # "Every OR in this hospital" — the query behind the space board.
        Index("ix_locations_facility_use", "facility_id", "space_use"),
    )

    id = Column(Integer, primary_key=True, index=True)
    facility_id = Column(Integer, ForeignKey("facilities.id", ondelete="CASCADE"), nullable=False, index=True)
    parent_id = Column(Integer, ForeignKey("locations.id", ondelete="CASCADE"), nullable=True, index=True)

    # Materialised path, '/3/41/612/', ids of every ancestor plus this row.
    # A recursive CTE would answer the same questions correctly and would run on
    # every dashboard, every picker and every subtree count. This is written
    # once per move and read constantly, which is the right way round.
    # Maintained exclusively by app.services.location_tree — never set by hand.
    path = Column(String(512), nullable=False, default="", index=True)
    depth = Column(Integer, nullable=False, default=0)

    location_type = Column(String(32), nullable=False, index=True)

    # What is painted on the door. This is the entire search query a nurse will
    # ever type, so it is indexed and it is what the pickers match on first.
    code = Column(String(64), nullable=False, index=True)
    name = Column(String(255), nullable=True)
    description = Column(Text, nullable=True)

    department_id = Column(Integer, ForeignKey("departments.id", ondelete="SET NULL"), nullable=True, index=True)

    space_use = Column(String(48), nullable=True, index=True)
    criticality = Column(String(16), nullable=True, index=True)
    electrical_branch = Column(String(16), nullable=True)

    # US customary throughout, and named so that no one has to guess.
    area_sqft = Column(Numeric(12, 2), nullable=True)
    ceiling_height_ft = Column(Numeric(6, 2), nullable=True)
    # Denormalised because air changes per hour is volume-dependent and gets
    # recomputed on every ventilation check. Derived from area x height when
    # both are known, but writable directly for spaces that are not boxes.
    volume_cuft = Column(Numeric(14, 2), nullable=True)

    occupancy_status = Column(
        String(32), nullable=False, default=OccupancyStatus.IN_SERVICE.value, index=True,
    )

    # Bed count is a property of the room; the individual beds are child rows of
    # type `bed`. Kept here too because "how many beds on 4 West" should not
    # require walking the subtree.
    bed_count = Column(Integer, nullable=False, default=0)

    # Placement on the floor plan. Nullable, and that is the important part: a
    # location may exist in the register with no pin, which is what lets the
    # spreadsheet importer and the plan editor write the same table without
    # either being subordinate to the other. Unplaced rows surface in the plan
    # editor's tray to be dragged on later.
    floor_plan_id = Column(Integer, ForeignKey("floor_plans.id", ondelete="SET NULL"), nullable=True, index=True)
    plan_x = Column(Numeric(10, 6), nullable=True)   # fraction of plan width, 0..1
    plan_y = Column(Numeric(10, 6), nullable=True)   # fraction of plan height, 0..1

    # Traced outline, [{"x": 0.31, "y": 0.42}, ...], in the same fractions as
    # the pin. A pin says where a room is; the polygon says how big it is, and
    # once the plan is calibrated the area falls out of the trace — which is
    # what saves somebody measuring four hundred rooms by hand to get the
    # volume an air-changes-per-hour check needs.
    plan_polygon = Column(JSON, nullable=True)

    # Created from the field by someone who could not find the room in the
    # picker. Real enough to hang a work order on, flagged for an admin to
    # reconcile. Without this, a survey that is 40% done is a dead end and
    # people stop using the system rather than wait for it to be finished.
    is_provisional = Column(Boolean, nullable=False, default=False, index=True)
    is_active = Column(Boolean, nullable=False, default=True, index=True)

    # IFC GUID or Revit element id. Nothing reads it yet. It costs one column
    # now and is the difference between a future BIM import being a feature and
    # being a re-survey.
    external_ref = Column(String(128), nullable=True, index=True)

    created_by_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    facility = relationship("Facility")
    department = relationship("Department")
    parent = relationship("Location", remote_side=[id], backref="children", foreign_keys=[parent_id])
    floor_plan = relationship("FloorPlan", foreign_keys=[floor_plan_id], back_populates="pinned_locations")
    plans = relationship(
        "FloorPlan",
        foreign_keys="FloorPlan.location_id",
        back_populates="location",
        cascade="all, delete-orphan",
    )
    status = relationship(
        "SpaceStatus", uselist=False, back_populates="location", cascade="all, delete-orphan",
    )

    @property
    def display_label(self) -> str:
        """'OR-3 - Operating Room 3', or just the code when there is no name."""
        return f"{self.code} - {self.name}" if self.name else self.code

    @property
    def ancestor_ids(self) -> list[int]:
        """Ids from the root down to and including this row."""
        return [int(part) for part in (self.path or "").split("/") if part]


class FloorPlan(Base):
    """A drawing of one level, and the calibration that makes it measurable.

    The first customer has no room list, so this is not a second way to view
    data that already exists — it is the primary authoring surface. Pins dropped
    here create the register.
    """

    __tablename__ = "floor_plans"
    __table_args__ = (
        Index("ix_floor_plans_location_current", "location_id", "is_current"),
    )

    id = Column(Integer, primary_key=True, index=True)
    facility_id = Column(Integer, ForeignKey("facilities.id", ondelete="CASCADE"), nullable=False, index=True)
    # The floor (or building, or roof) this depicts.
    location_id = Column(Integer, ForeignKey("locations.id", ondelete="CASCADE"), nullable=False, index=True)

    name = Column(String(255), nullable=False)
    source_filename = Column(String(255), nullable=True)
    source_path = Column(String(512), nullable=True)
    source_mime = Column(String(64), nullable=True)
    # Life safety drawings arrive as one PDF with every floor in it. Store which
    # page this plan is, so re-rendering later does not need a human to remember.
    page_number = Column(Integer, nullable=True)

    # Rasterised page the canvas actually draws. Pins are stored as fractions of
    # these dimensions, so re-rendering at a different resolution moves nothing.
    image_path = Column(String(512), nullable=True)
    width_px = Column(Integer, nullable=True)
    height_px = Column(Integer, nullable=True)

    # Set by drawing one line over a known dimension — a three-foot door leaf,
    # or the drawing's own scale bar. Once known, a traced room yields area in
    # square feet, which yields volume, which is what an air-changes-per-hour
    # check needs. One number turns a picture into a measuring instrument.
    scale_ft_per_px = Column(Numeric(12, 6), nullable=True)
    rotation_deg = Column(Integer, nullable=False, default=0)

    # Hospitals renovate constantly. Old versions stay; pins live on Location,
    # not here, so replacing a drawing never destroys the survey behind it.
    version = Column(Integer, nullable=False, default=1)
    is_current = Column(Boolean, nullable=False, default=True, index=True)

    uploaded_by_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    facility = relationship("Facility")
    location = relationship("Location", foreign_keys=[location_id], back_populates="plans")
    pinned_locations = relationship(
        "Location", foreign_keys="Location.floor_plan_id", back_populates="floor_plan",
    )
    uploaded_by = relationship("User")
