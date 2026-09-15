"""Engineering disciplines — the taxonomy MEP work is filed under.

`Modality` already classifies biomedical equipment, but its category list is a
Postgres ENUM, so every new kind of asset costs a migration. Facilities work
does not fit that shape: a hospital adds "Vertical Transport" or splits
"Mechanical" into "HVAC" and "Steam" as its plant changes, and none of that
should require a deploy.

So disciplines are rows, not enum members. `Modality` keeps doing its job for
the biomedical side; `Discipline` sits alongside it and answers a different
question — which trade owns this, and who gets dispatched.
"""
from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import relationship
from datetime import datetime

from app.db.base import Base


# Seeded by the migration. Codes are stable identifiers that routing rules and
# imports refer to; names are display text an admin may freely rename.
SEED_DISCIPLINES: tuple[tuple[str, str, str, str], ...] = (
    ("mechanical",        "Mechanical",             "#0EA5E9", "Lifts, boilers, compressors, vacuum pumps, medical gas, fire pumps"),
    ("hvac",              "HVAC",                   "#14B8A6", "Chillers, air handling, fan coils, AC units, cooling towers, exhaust"),
    ("electrical",        "Electrical",             "#F59E0B", "Distribution, panels, generators, transfer switches, lighting"),
    ("plumbing",          "Plumbing",               "#3B82F6", "Domestic water, sanitary, storm, backflow, water heaters"),
    ("vertical_transport", "Vertical Transport",    "#8B5CF6", "Elevators, escalators, dumbwaiters, lifts"),
    ("fire_life_safety",  "Fire & Life Safety",     "#EF4444", "Alarm, sprinkler, standpipe, fire pump, suppression, dampers"),
    ("medical_gas",       "Medical Gas & Vacuum",   "#10B981", "Oxygen, medical air, nitrous, vacuum, manifolds, zone valves"),
    ("building_envelope", "Building & Envelope",    "#78716C", "Roofing, doors, hardware, glazing, finishes, casework"),
    ("it_low_voltage",    "IT & Low Voltage",       "#6366F1", "Structured cabling, nurse call, access control, CCTV"),
    ("biomedical",        "Biomedical",             "#EC4899", "Clinical equipment — bridges to the existing modality tree"),
)


class Discipline(Base):
    """A trade or engineering system. Work orders, assets and technicians all
    point at one, and dispatch is the join between them."""

    __tablename__ = "disciplines"
    __table_args__ = (
        UniqueConstraint("code", name="uq_disciplines_code"),
    )

    id = Column(Integer, primary_key=True, index=True)
    code = Column(String(64), nullable=False, index=True)
    name = Column(String(128), nullable=False)
    description = Column(Text, nullable=True)

    # Rendered by the frontend chips. Kept on the row so a newly added
    # discipline is not stuck with a default grey until someone ships CSS.
    color = Column(String(16), nullable=True)
    sort_order = Column(Integer, nullable=False, default=100)
    is_active = Column(Boolean, nullable=False, default=True, index=True)

    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    user_links = relationship("UserDiscipline", back_populates="discipline", cascade="all, delete-orphan")


class UserDiscipline(Base):
    """Which trades a technician actually holds.

    Without this, `UserRole.TECHNICIAN` is undifferentiated and an electrical
    work order routes to a biomed. The certification note is free text on
    purpose — the licences that matter vary by state and by trade, and pinning
    a schema to them now would be wrong within a year.
    """

    __tablename__ = "user_disciplines"
    __table_args__ = (
        UniqueConstraint("user_id", "discipline_id", name="uq_user_disciplines_user_discipline"),
    )

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    discipline_id = Column(Integer, ForeignKey("disciplines.id", ondelete="CASCADE"), nullable=False, index=True)

    is_primary = Column(Boolean, nullable=False, default=False)
    certification_note = Column(String(255), nullable=True)

    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    user = relationship("User")
    discipline = relationship("Discipline", back_populates="user_links")
