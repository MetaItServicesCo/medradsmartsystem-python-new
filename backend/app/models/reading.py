"""Measured values, in US customary units, with the unit stored on every row.

Biomedical PM is largely pass/fail against a checklist, and the existing
`Inspection.form_data` JSON captures that well. Plant maintenance is not: it is
runtime hours, differential pressure across a filter, the temperature and
humidity band an operating room has to hold, the pressure relationship an
isolation room has to hold. Those are numbers, they trend, and going out of
band is itself an event.

A JSON blob cannot be queried across assets, cannot be trended, and cannot
raise an alarm. So readings get a table.

THE UNIT RULE
-------------
`unit` is stored on the reading, not only on the point definition, and it is
NOT NULL on both. It would be cheaper to name the column `pressure_in_wc` and
imply the unit — and eventually a vendor's report arrives in pascals, or a
technician's meter is set to metric, and a value that is wildly out of band is
silently recorded as comfortably inside it.

ASHRAE 170 asks an operating room to hold positive pressure of at least
0.01 inches of water column. In pascals that same requirement is about 2.5.
A "0.01" typed while a gauge was reading pascals is a quarter of a percent of
the required pressure, and stored without its unit it looks exactly like
compliance. One column prevents that, permanently.
"""
from sqlalchemy import (
    Boolean, Column, DateTime, ForeignKey, Index, Integer, Numeric, String, Text,
    UniqueConstraint,
)
from sqlalchemy.orm import relationship
from datetime import datetime
import enum

from app.db.base import Base


class UnitOfMeasure(str, enum.Enum):
    """US customary, because that is what the plant, the drawings, the
    nameplates and the codes all use. Metric members exist so that a foreign
    vendor's report can be recorded honestly in the unit it was taken in and
    converted on read, rather than being silently mis-entered."""

    # Pressure
    IN_WC = "in_wc"                # inches of water column — room pressurisation
    PSI = "psi"
    PSIG = "psig"
    IN_HG = "in_hg"                # vacuum
    PASCAL = "pa"                  # conversion source only

    # Airflow and water flow
    CFM = "cfm"                    # cubic feet per minute
    SCFM = "scfm"                  # standard cubic feet per minute — medical gas
    GPM = "gpm"                    # gallons per minute
    ACH = "ach"                    # air changes per hour, dimensionless

    # Thermal
    DEG_F = "deg_f"
    DEG_C = "deg_c"                # conversion source only
    PCT_RH = "pct_rh"
    BTU_HR = "btu_hr"
    MBH = "mbh"                    # thousand BTU per hour
    TONS = "tons"                  # tons of refrigeration

    # Electrical
    VOLT = "volt"
    AMP = "amp"
    KW = "kw"
    KVA = "kva"
    KWH = "kwh"
    HZ = "hz"
    OHM = "ohm"                    # ground impedance
    PCT = "pct"

    # Vertical transport
    FPM = "fpm"                    # feet per minute — car speed
    LBS = "lbs"                    # capacity, retention force

    # Runtime and counts
    HOURS = "hours"
    COUNT = "count"

    # Water quality
    PPM = "ppm"
    PH = "ph"
    NTU = "ntu"


UNITS: tuple[str, ...] = tuple(u.value for u in UnitOfMeasure)

# Display strings. Kept beside the enum so that the API can hand the frontend
# both without either side hardcoding a table that then drifts.
UNIT_LABELS: dict[str, str] = {
    "in_wc": 'in. w.c.', "psi": "psi", "psig": "psig", "in_hg": "in. Hg", "pa": "Pa",
    "cfm": "CFM", "scfm": "SCFM", "gpm": "GPM", "ach": "ACH",
    "deg_f": "°F", "deg_c": "°C", "pct_rh": "% RH",
    "btu_hr": "BTU/hr", "mbh": "MBH", "tons": "tons",
    "volt": "V", "amp": "A", "kw": "kW", "kva": "kVA", "kwh": "kWh",
    "hz": "Hz", "ohm": "Ω", "pct": "%",
    "fpm": "FPM", "lbs": "lbs",
    "hours": "hr", "count": "", "ppm": "ppm", "ph": "pH", "ntu": "NTU",
}

# Conversions into the US customary unit this system reports in. Only the pairs
# that actually turn up in the field; an unknown pair is refused rather than
# guessed at.
_TO_US: dict[tuple[str, str], float] = {
    ("pa", "in_wc"): 0.0040146307,
    ("deg_c", "deg_f"): 0.0,   # affine, handled explicitly below
}


def convert_to(value: float, from_unit: str, to_unit: str) -> float | None:
    """Convert where a conversion is defined, else None. Never a silent pass."""
    if from_unit == to_unit:
        return value
    if from_unit == "deg_c" and to_unit == "deg_f":
        return value * 9.0 / 5.0 + 32.0
    if from_unit == "deg_f" and to_unit == "deg_c":
        return (value - 32.0) * 5.0 / 9.0
    factor = _TO_US.get((from_unit, to_unit))
    if factor:
        return value * factor
    inverse = _TO_US.get((to_unit, from_unit))
    if inverse:
        return value / inverse
    return None


class ReadingPointKind(str, enum.Enum):
    ENVIRONMENTAL = "environmental"   # room pressure, temp, humidity, ACH
    ELECTRICAL = "electrical"
    MECHANICAL = "mechanical"
    RUNTIME = "runtime"               # generator hours, pump starts
    WATER_QUALITY = "water_quality"
    SAFETY = "safety"                 # receptacle retention, ground impedance
    CONSUMPTION = "consumption"


class ReadingPoint(Base):
    """A named measurable, with the band it is supposed to stay inside.

    Attaches to an asset (generator runtime hours) or to a location (operating
    room pressure relationship) — one or the other, never neither.
    """

    __tablename__ = "reading_points"
    __table_args__ = (
        UniqueConstraint("facility_id", "code", name="uq_reading_points_facility_code"),
        Index("ix_reading_points_equipment", "equipment_id", "is_active"),
        Index("ix_reading_points_location", "location_id", "is_active"),
        Index("ix_reading_points_facility_kind", "facility_id", "kind"),
        # Which checks are overdue — the rounds worklist.
        Index("ix_reading_points_next_due", "facility_id", "next_due_at"),
    )

    id = Column(Integer, primary_key=True, index=True)
    facility_id = Column(Integer, ForeignKey("facilities.id", ondelete="CASCADE"), nullable=False, index=True)
    equipment_id = Column(Integer, ForeignKey("equipment.id", ondelete="CASCADE"), nullable=True, index=True)
    location_id = Column(Integer, ForeignKey("locations.id", ondelete="CASCADE"), nullable=True, index=True)

    code = Column(String(64), nullable=False, index=True)
    name = Column(String(255), nullable=False)
    kind = Column(String(32), nullable=False, default=ReadingPointKind.ENVIRONMENTAL.value, index=True)

    unit = Column(String(16), nullable=False)

    # The acceptable band. Either bound may be absent: an operating room has a
    # minimum positive pressure and no maximum that anyone cares about, while
    # relative humidity is bounded at both ends.
    min_spec = Column(Numeric(14, 4), nullable=True)
    max_spec = Column(Numeric(14, 4), nullable=True)
    target = Column(Numeric(14, 4), nullable=True)

    # Where the band comes from — 'ASHRAE 170 Table 7.1', 'NFPA 110 8.4.2'. When
    # a surveyor asks why the limit is what it is, the answer should be on the
    # record and not in somebody's memory.
    spec_reference = Column(String(255), nullable=True)

    frequency_days = Column(Integer, nullable=True)
    last_reading_at = Column(DateTime, nullable=True)
    next_due_at = Column(DateTime, nullable=True, index=True)

    # An out-of-band reading here takes the space out of service automatically.
    # True for isolation room pressure, false for a monthly energy meter.
    gates_space_availability = Column(Boolean, nullable=False, default=False)

    is_active = Column(Boolean, nullable=False, default=True, index=True)
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    facility = relationship("Facility")
    equipment = relationship("Equipment")
    location = relationship("Location")
    readings = relationship(
        "Reading", back_populates="point", cascade="all, delete-orphan",
        order_by="Reading.recorded_at.desc()",
    )

    def evaluate(self, value: float) -> bool:
        """Inside the band? A point with no band is always in spec."""
        if self.min_spec is not None and value < float(self.min_spec):
            return False
        if self.max_spec is not None and value > float(self.max_spec):
            return False
        return True


class Reading(Base):
    """One measurement. Immutable once written."""

    __tablename__ = "readings"
    __table_args__ = (
        # Trending one point over a window — the chart query.
        Index("ix_readings_point_recorded", "point_id", "recorded_at"),
        # Every out-of-spec reading in a facility this month — the exception report.
        Index("ix_readings_facility_inspec_recorded", "facility_id", "in_spec", "recorded_at"),
    )

    id = Column(Integer, primary_key=True, index=True)
    point_id = Column(Integer, ForeignKey("reading_points.id", ondelete="CASCADE"), nullable=False, index=True)
    facility_id = Column(Integer, ForeignKey("facilities.id", ondelete="CASCADE"), nullable=False, index=True)

    value = Column(Numeric(14, 4), nullable=False)
    # NOT NULL, and copied from the point rather than referenced through it: the
    # point's unit may be corrected next year, and that must not retroactively
    # reinterpret every number ever recorded under the old one.
    unit = Column(String(16), nullable=False)

    # Evaluated at write time against the band in force at that moment, for the
    # same reason. A limit tightened in March must not turn February's
    # compliant readings into violations.
    in_spec = Column(Boolean, nullable=False, default=True, index=True)

    recorded_at = Column(DateTime, nullable=False, default=datetime.utcnow, index=True)
    recorded_by_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)

    # What occasioned the reading, when it was not a standalone round.
    work_order_id = Column(Integer, ForeignKey("service_requests.id", ondelete="SET NULL"), nullable=True, index=True)
    inspection_id = Column(Integer, ForeignKey("inspections.id", ondelete="SET NULL"), nullable=True, index=True)

    source = Column(String(24), nullable=False, default="manual")   # manual | bas | meter
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    point = relationship("ReadingPoint", back_populates="readings")
    facility = relationship("Facility")
    recorded_by = relationship("User")
