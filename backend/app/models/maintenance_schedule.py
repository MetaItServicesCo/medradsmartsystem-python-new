"""Recurring maintenance, and the work orders it generates.

`Equipment.pm_scheduling` is a free-text string and `next_generated_pm_date` a
bare date, which between them can express "annually, roughly" for one asset.
Plant maintenance needs more: the same air handler has a monthly filter check,
a quarterly belt inspection and an annual coil clean, each a different trade
and a different duration, and a generator's service interval is measured in
runtime hours rather than in days.

So a schedule is a row, an asset may have several, and generation is explicit
and idempotent. Nothing here replaces the existing per-asset PM date — that
keeps working for the biomedical side exactly as it did.
"""
from sqlalchemy import (
    Boolean, Column, Date, DateTime, ForeignKey, Index, Integer, Numeric,
    String, Text,
)
from sqlalchemy.orm import relationship
from datetime import date, datetime
import enum

from app.db.base import Base
from app.utils.clock import utc_today


class ScheduleBasis(str, enum.Enum):
    """What makes the next occurrence fall due.

    Runtime matters for plant in a way it does not for clinical equipment: a
    standby generator that never runs does not need its 200-hour service, and
    one that ran all week through a storm needs it early.
    """

    CALENDAR = "calendar"
    RUNTIME_HOURS = "runtime_hours"
    # Both, whichever arrives first — the honest default for engines.
    CALENDAR_OR_RUNTIME = "calendar_or_runtime"


class ScheduleStatus(str, enum.Enum):
    ACTIVE = "active"
    PAUSED = "paused"
    RETIRED = "retired"


class MaintenanceSchedule(Base):
    __tablename__ = "maintenance_schedules"
    __table_args__ = (
        Index("ix_maint_sched_facility_status_due", "facility_id", "status", "next_due_date"),
        Index("ix_maint_sched_equipment", "equipment_id", "status"),
        Index("ix_maint_sched_location", "location_id", "status"),
    )

    id = Column(Integer, primary_key=True, index=True)
    facility_id = Column(Integer, ForeignKey("facilities.id", ondelete="CASCADE"), nullable=False, index=True)

    # One or the other. A filter change belongs to an air handler; a quarterly
    # eyewash flush belongs to the room the eyewash is in.
    equipment_id = Column(Integer, ForeignKey("equipment.id", ondelete="CASCADE"), nullable=True, index=True)
    location_id = Column(Integer, ForeignKey("locations.id", ondelete="CASCADE"), nullable=True, index=True)

    name = Column(String(255), nullable=False)
    task_description = Column(Text, nullable=True)
    discipline_id = Column(Integer, ForeignKey("disciplines.id", ondelete="SET NULL"), nullable=True, index=True)

    basis = Column(String(24), nullable=False, default=ScheduleBasis.CALENDAR.value)
    interval_days = Column(Integer, nullable=True)
    interval_runtime_hours = Column(Numeric(10, 2), nullable=True)
    # The point whose value counts the hours, for runtime-based schedules.
    runtime_point_id = Column(Integer, ForeignKey("reading_points.id", ondelete="SET NULL"), nullable=True)
    runtime_at_last_service = Column(Numeric(12, 2), nullable=True)

    estimated_hours = Column(Numeric(6, 2), nullable=True)
    priority = Column(String(16), nullable=False, default="medium")
    # Generate this many days before it falls due, so the work lands in a
    # planner's queue with time to schedule rather than already late.
    lead_time_days = Column(Integer, nullable=False, default=7)

    # Dispatch defaults, so a generated work order arrives routed.
    assigned_technician_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    assigned_vendor_id = Column(Integer, ForeignKey("vendors.id", ondelete="SET NULL"), nullable=True)

    # Whether performing it needs the space, so the generated work order carries
    # the flag that opens a downtime interval.
    takes_space_out_of_service = Column(Boolean, nullable=False, default=False)

    status = Column(String(16), nullable=False, default=ScheduleStatus.ACTIVE.value, index=True)
    last_generated_at = Column(DateTime, nullable=True)
    last_completed_at = Column(DateTime, nullable=True)
    next_due_date = Column(Date, nullable=True, index=True)

    # The work order currently open against this schedule. This is what makes
    # generation idempotent: a nightly sweep must not raise a second filter
    # change because the first has not been done yet.
    open_work_order_id = Column(Integer, ForeignKey("service_requests.id", ondelete="SET NULL"), nullable=True)

    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    facility = relationship("Facility")
    equipment = relationship("Equipment")
    location = relationship("Location")
    discipline = relationship("Discipline")
    assigned_technician = relationship("User", foreign_keys=[assigned_technician_id])
    assigned_vendor = relationship("Vendor")
    runtime_point = relationship("ReadingPoint")
    open_work_order = relationship("ServiceRequest", foreign_keys=[open_work_order_id])

    @property
    def is_due(self) -> bool:
        """Due, counting the lead time — the point at which work should be
        raised, not the point at which it becomes late."""
        if self.status != ScheduleStatus.ACTIVE.value or self.next_due_date is None:
            return False
        from datetime import timedelta
        return utc_today() >= (self.next_due_date - timedelta(days=self.lead_time_days or 0))

    @property
    def is_overdue(self) -> bool:
        if self.status != ScheduleStatus.ACTIVE.value or self.next_due_date is None:
            return False
        return utc_today() > self.next_due_date
