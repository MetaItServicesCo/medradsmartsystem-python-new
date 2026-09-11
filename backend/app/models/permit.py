"""Permits to work — the approvals that must exist before a tool comes out.

This is the part of hospital facilities work that has no equivalent in medical
equipment service, and the part most CMMS retrofits miss. You cannot open a
ceiling, isolate a panel, strike an arc or shut a valve in an occupied hospital
on a technician's judgement alone. Infection Prevention signs the ICRA, Safety
signs the interim life safety measures, and somebody who knows what is
downstream signs the shutdown.

The design point that makes this worth building rather than documenting: a
permit that does not actually stop work is a filing cabinet. `WorkPermit`
blocks the work order's transition into progress until every required approval
is recorded, so the control is in the software rather than in a poster on the
wall.

Approvals are rows rather than columns because who must sign varies by permit
type and by how bad the risk assessment came out — an ICRA Class I needs one
signature and a Class IV needs three, and that cannot be a fixed set of
`approved_by_x_id` columns.
"""
from sqlalchemy import (
    Boolean, Column, DateTime, ForeignKey, Index, Integer, JSON, String, Text,
    UniqueConstraint,
)
from sqlalchemy.orm import relationship
from datetime import datetime
import enum

from app.db.base import Base


class PermitType(str, enum.Enum):
    """Each of these exists because a specific thing has gone badly wrong in a
    hospital before, and the permit is the accumulated answer."""

    ICRA = "icra"                        # infection control risk assessment
    ILSM = "ilsm"                        # interim life safety measures
    HOT_WORK = "hot_work"                # welding, cutting, brazing
    LOTO = "loto"                        # lockout / tagout, energy isolation
    CONFINED_SPACE = "confined_space"
    UTILITY_SHUTDOWN = "utility_shutdown"
    PENETRATION = "penetration"          # breaching a fire or smoke barrier
    ELECTRICAL_ENERGIZED = "electrical_energized"   # work on live equipment


PERMIT_TYPES: tuple[str, ...] = tuple(p.value for p in PermitType)


class PermitStatus(str, enum.Enum):
    DRAFT = "draft"
    PENDING_APPROVAL = "pending_approval"
    APPROVED = "approved"
    ACTIVE = "active"            # work has started under it
    CLOSED = "closed"            # work finished, controls removed
    REJECTED = "rejected"
    EXPIRED = "expired"          # approved but the window passed unused
    CANCELLED = "cancelled"


# States in which a permit actually authorises work. Approved is not enough on
# its own to *have* started, but it is enough to be allowed to.
PERMITS_WORK: frozenset[str] = frozenset({
    PermitStatus.APPROVED.value, PermitStatus.ACTIVE.value,
})


class ApprovalRole(str, enum.Enum):
    """Who signs. Deliberately a role rather than a user: the person changes,
    the accountability does not, and an audit asks which function approved."""

    INFECTION_PREVENTION = "infection_prevention"
    SAFETY_OFFICER = "safety_officer"
    FACILITY_MANAGER = "facility_manager"
    NURSE_MANAGER = "nurse_manager"          # the unit losing the space
    CLINICAL_ENGINEERING = "clinical_engineering"
    ADMINISTRATOR = "administrator"


class ApprovalStatus(str, enum.Enum):
    PENDING = "pending"
    APPROVED = "approved"
    REJECTED = "rejected"
    WITHDRAWN = "withdrawn"


# ── ICRA ─────────────────────────────────────────────────────────────────────

class ConstructionActivityType(str, enum.Enum):
    """How much dust the work makes. Type A is looking at something; Type D is
    demolition."""

    TYPE_A = "type_a"    # inspection and non-invasive
    TYPE_B = "type_b"    # small scale, short duration, minimal dust
    TYPE_C = "type_c"    # moderate to high dust, demolition of a partition
    TYPE_D = "type_d"    # major demolition and construction


class PatientRiskGroup(str, enum.Enum):
    """How badly the people nearby would take an airborne infection."""

    GROUP_1 = "group_1"    # lowest — office, unoccupied
    GROUP_2 = "group_2"    # medium — outpatient, cardiology, physio
    GROUP_3 = "group_3"    # medium/high — ED, radiology, PACU, surgical units
    GROUP_4 = "group_4"    # highest — ICU, OR, transplant, oncology, isolation


class ICRAClass(str, enum.Enum):
    CLASS_I = "class_i"
    CLASS_II = "class_ii"
    CLASS_III = "class_iii"
    CLASS_IV = "class_iv"


class WorkPermit(Base):
    __tablename__ = "work_permits"
    __table_args__ = (
        UniqueConstraint("permit_number", name="uq_work_permits_number"),
        Index("ix_permits_facility_status", "facility_id", "status"),
        Index("ix_permits_work_order", "work_order_id", "status"),
        Index("ix_permits_type_status", "permit_type", "status"),
        Index("ix_permits_valid_to", "valid_to"),
    )

    id = Column(Integer, primary_key=True, index=True)
    permit_number = Column(String(32), nullable=False, index=True)
    facility_id = Column(Integer, ForeignKey("facilities.id", ondelete="CASCADE"), nullable=False, index=True)

    # A permit usually hangs off a work order, but not always: a contractor
    # mobilising for a project needs one before any work order exists.
    work_order_id = Column(Integer, ForeignKey("service_requests.id", ondelete="CASCADE"), nullable=True, index=True)
    location_id = Column(Integer, ForeignKey("locations.id", ondelete="SET NULL"), nullable=True, index=True)

    permit_type = Column(String(32), nullable=False, index=True)
    status = Column(String(24), nullable=False, default=PermitStatus.DRAFT.value, index=True)

    title = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    work_scope = Column(Text, nullable=True)

    # The window the permit authorises. A permit is not open-ended: an approval
    # given for Tuesday night must not still be authorising work in March.
    valid_from = Column(DateTime, nullable=True)
    valid_to = Column(DateTime, nullable=True, index=True)

    # ── ICRA ────────────────────────────────────────────────────────────────
    construction_activity_type = Column(String(16), nullable=True)
    patient_risk_group = Column(String(16), nullable=True)
    # Derived from the two above via the published matrix, stored because the
    # matrix may be revised and last year's assessment must keep its answer.
    icra_class = Column(String(16), nullable=True)
    # The precautions the class demands, snapshotted at assessment time.
    required_precautions = Column(JSON, nullable=True, default=list)

    # ── ILSM ────────────────────────────────────────────────────────────────
    # Which life-safety features the work impairs. Any one of these is what
    # triggers interim measures.
    impairs_fire_alarm = Column(Boolean, nullable=False, default=False)
    impairs_sprinkler = Column(Boolean, nullable=False, default=False)
    impairs_egress = Column(Boolean, nullable=False, default=False)
    impairs_smoke_barrier = Column(Boolean, nullable=False, default=False)
    ilsm_measures = Column(JSON, nullable=True, default=list)

    # ── Hot work ────────────────────────────────────────────────────────────
    fire_watch_required = Column(Boolean, nullable=False, default=False)
    # Minutes of watch after the work stops. Codes commonly require 30 to 60,
    # and an hour is the safer default when nobody has specified.
    fire_watch_minutes_after = Column(Integer, nullable=True)
    fire_watch_by = Column(String(255), nullable=True)
    extinguisher_verified = Column(Boolean, nullable=False, default=False)

    # ── Lockout / tagout ────────────────────────────────────────────────────
    # Each isolation point: what was locked, by whom, which lock number. A list
    # because a single job routinely isolates several energy sources.
    isolation_points = Column(JSON, nullable=True, default=list)
    energy_verified_zero = Column(Boolean, nullable=False, default=False)

    # ── Utility shutdown ────────────────────────────────────────────────────
    service_type = Column(String(32), nullable=True)
    # Snapshotted from the dependency graph when the permit is raised, so the
    # notification list and the approval are about the same set of spaces even
    # if somebody re-wires the graph the next day.
    affected_location_ids = Column(JSON, nullable=True, default=list)
    affected_summary = Column(Text, nullable=True)
    notification_sent_at = Column(DateTime, nullable=True)

    # ── Lifecycle ───────────────────────────────────────────────────────────
    requested_by_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    requested_at = Column(DateTime, nullable=True)
    activated_at = Column(DateTime, nullable=True)
    closed_at = Column(DateTime, nullable=True)
    closed_by_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    # Confirmed at close: barriers down, locks off, systems back in service.
    controls_removed = Column(Boolean, nullable=False, default=False)
    closeout_notes = Column(Text, nullable=True)

    # The signed scan. A permit is a document people physically sign and tape
    # to a barrier; the database record is the index, not the evidence.
    document_filename = Column(String(255), nullable=True)
    document_path = Column(String(512), nullable=True)

    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    facility = relationship("Facility")
    work_order = relationship("ServiceRequest", foreign_keys=[work_order_id])
    location = relationship("Location")
    requested_by = relationship("User", foreign_keys=[requested_by_id])
    closed_by = relationship("User", foreign_keys=[closed_by_id])
    approvals = relationship(
        "PermitApproval", back_populates="permit", cascade="all, delete-orphan",
    )

    @property
    def is_authorising(self) -> bool:
        """Whether this permit currently permits anything.

        Approved but outside its window is not authorising — that is the whole
        reason the window exists.
        """
        if self.status not in PERMITS_WORK:
            return False
        now = datetime.utcnow()
        if self.valid_from and now < self.valid_from:
            return False
        if self.valid_to and now > self.valid_to:
            return False
        return True

    @property
    def outstanding_approvals(self) -> list[str]:
        return [
            approval.approver_role
            for approval in self.approvals
            if approval.status == ApprovalStatus.PENDING.value
        ]


class PermitApproval(Base):
    """One required signature.

    Created unsigned when the permit is submitted, so the outstanding set is
    visible from the moment it is requested rather than being inferred.
    """

    __tablename__ = "permit_approvals"
    __table_args__ = (
        UniqueConstraint("permit_id", "approver_role", name="uq_permit_approval_role"),
    )

    id = Column(Integer, primary_key=True, index=True)
    permit_id = Column(Integer, ForeignKey("work_permits.id", ondelete="CASCADE"), nullable=False, index=True)

    approver_role = Column(String(32), nullable=False)
    status = Column(String(16), nullable=False, default=ApprovalStatus.PENDING.value, index=True)

    approved_by_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    # Kept alongside the id because an approval is evidence: the person may
    # leave and their user row may be deactivated, and the record must still
    # say who signed.
    approved_by_name = Column(String(255), nullable=True)
    decided_at = Column(DateTime, nullable=True)
    conditions = Column(Text, nullable=True)
    rejection_reason = Column(Text, nullable=True)

    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    permit = relationship("WorkPermit", back_populates="approvals")
    approved_by = relationship("User", foreign_keys=[approved_by_id])
