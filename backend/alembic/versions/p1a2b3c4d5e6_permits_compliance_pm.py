"""Permits, compliance programs, maintenance schedules, traced room outlines

Completes the facilities module with the four things the foundation migration
deliberately left out, each of which needed locations, disciplines and vendors
to exist first.

  * `work_permits` / `permit_approvals` — the approvals that must exist before
    a tool comes out. ICRA, interim life safety measures, hot work, lockout,
    confined space, utility shutdown. The gate lives in
    `app.services.permit.assert_work_permitted`, called from the work order's
    transition into progress: a permit system that cannot refuse anything is a
    filing cabinet.
  * `compliance_programs` / `compliance_tasks` — regulatory schedules and the
    certificates that prove they were met. Separate from work orders because an
    obligation exists whether or not anyone has been assigned, must be
    reportable across years, and carries evidence a work order cannot hold.
  * `maintenance_schedules` — recurring PM, calendar or runtime based, one
    asset able to carry several. The existing `Equipment.pm_scheduling` string
    and `next_generated_pm_date` are untouched and keep working.
  * `locations.plan_polygon` — a traced room outline. With a calibrated plan the
    area falls out of the trace, which is what avoids measuring several
    thousand rooms by hand to get the volume an air-change check needs.

Additive throughout. No existing column is altered and no existing row is
rewritten.

Revision ID: p1a2b3c4d5e6
Revises: o0f1a2b3c4d5
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "p1a2b3c4d5e6"
down_revision: Union[str, Sequence[str], None] = "o0f1a2b3c4d5"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ── Permits ─────────────────────────────────────────────────────────────
    op.create_table(
        "work_permits",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("permit_number", sa.String(length=32), nullable=False),
        sa.Column("facility_id", sa.Integer(), nullable=False),
        # Nullable: a contractor mobilising for a project needs a permit before
        # any work order exists.
        sa.Column("work_order_id", sa.Integer(), nullable=True),
        sa.Column("location_id", sa.Integer(), nullable=True),
        sa.Column("permit_type", sa.String(length=32), nullable=False),
        sa.Column("status", sa.String(length=24), nullable=False, server_default="draft"),
        sa.Column("title", sa.String(length=255), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("work_scope", sa.Text(), nullable=True),
        # The window the permit authorises. An approval given for Tuesday night
        # must not still be authorising work in March.
        sa.Column("valid_from", sa.DateTime(), nullable=True),
        sa.Column("valid_to", sa.DateTime(), nullable=True),
        # ICRA
        sa.Column("construction_activity_type", sa.String(length=16), nullable=True),
        sa.Column("patient_risk_group", sa.String(length=16), nullable=True),
        # Derived from the matrix, stored because the matrix may be revised and
        # last year's assessment must keep the answer it was given.
        sa.Column("icra_class", sa.String(length=16), nullable=True),
        sa.Column("required_precautions", sa.JSON(), nullable=True),
        # ILSM
        sa.Column("impairs_fire_alarm", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("impairs_sprinkler", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("impairs_egress", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("impairs_smoke_barrier", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("ilsm_measures", sa.JSON(), nullable=True),
        # Hot work
        sa.Column("fire_watch_required", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("fire_watch_minutes_after", sa.Integer(), nullable=True),
        sa.Column("fire_watch_by", sa.String(length=255), nullable=True),
        sa.Column("extinguisher_verified", sa.Boolean(), nullable=False, server_default=sa.false()),
        # Lockout / tagout
        sa.Column("isolation_points", sa.JSON(), nullable=True),
        sa.Column("energy_verified_zero", sa.Boolean(), nullable=False, server_default=sa.false()),
        # Utility shutdown
        sa.Column("service_type", sa.String(length=32), nullable=True),
        # Snapshotted from the dependency graph, so the notification list and
        # the approval concern the same set of spaces even if the graph is
        # re-wired the next day.
        sa.Column("affected_location_ids", sa.JSON(), nullable=True),
        sa.Column("affected_summary", sa.Text(), nullable=True),
        sa.Column("notification_sent_at", sa.DateTime(), nullable=True),
        # Lifecycle
        sa.Column("requested_by_id", sa.Integer(), nullable=True),
        sa.Column("requested_at", sa.DateTime(), nullable=True),
        sa.Column("activated_at", sa.DateTime(), nullable=True),
        sa.Column("closed_at", sa.DateTime(), nullable=True),
        sa.Column("closed_by_id", sa.Integer(), nullable=True),
        sa.Column("controls_removed", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("closeout_notes", sa.Text(), nullable=True),
        # The signed scan. A permit is a document people physically sign; the
        # database record is the index, not the evidence.
        sa.Column("document_filename", sa.String(length=255), nullable=True),
        sa.Column("document_path", sa.String(length=512), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.ForeignKeyConstraint(["facility_id"], ["facilities.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["work_order_id"], ["service_requests.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["location_id"], ["locations.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["requested_by_id"], ["users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["closed_by_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("permit_number", name="uq_work_permits_number"),
    )
    op.create_index("ix_work_permits_id", "work_permits", ["id"])
    op.create_index("ix_work_permits_permit_number", "work_permits", ["permit_number"])
    op.create_index("ix_work_permits_facility_id", "work_permits", ["facility_id"])
    op.create_index("ix_work_permits_work_order_id", "work_permits", ["work_order_id"])
    op.create_index("ix_work_permits_location_id", "work_permits", ["location_id"])
    op.create_index("ix_work_permits_permit_type", "work_permits", ["permit_type"])
    op.create_index("ix_work_permits_status", "work_permits", ["status"])
    op.create_index("ix_permits_facility_status", "work_permits", ["facility_id", "status"])
    op.create_index("ix_permits_work_order", "work_permits", ["work_order_id", "status"])
    op.create_index("ix_permits_type_status", "work_permits", ["permit_type", "status"])
    op.create_index("ix_permits_valid_to", "work_permits", ["valid_to"])

    op.create_table(
        "permit_approvals",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("permit_id", sa.Integer(), nullable=False),
        sa.Column("approver_role", sa.String(length=32), nullable=False),
        sa.Column("status", sa.String(length=16), nullable=False, server_default="pending"),
        sa.Column("approved_by_id", sa.Integer(), nullable=True),
        # Denormalised beside the id: an approval is evidence, and it must still
        # say who signed after that person has left and their account is gone.
        sa.Column("approved_by_name", sa.String(length=255), nullable=True),
        sa.Column("decided_at", sa.DateTime(), nullable=True),
        sa.Column("conditions", sa.Text(), nullable=True),
        sa.Column("rejection_reason", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.ForeignKeyConstraint(["permit_id"], ["work_permits.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["approved_by_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("permit_id", "approver_role", name="uq_permit_approval_role"),
    )
    op.create_index("ix_permit_approvals_id", "permit_approvals", ["id"])
    op.create_index("ix_permit_approvals_permit_id", "permit_approvals", ["permit_id"])
    op.create_index("ix_permit_approvals_status", "permit_approvals", ["status"])

    # ── Compliance ──────────────────────────────────────────────────────────
    op.create_table(
        "compliance_programs",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("facility_id", sa.Integer(), nullable=False),
        sa.Column("code", sa.String(length=64), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("authority", sa.String(length=32), nullable=False),
        # The clause somebody can be pointed at when they ask why this exists.
        sa.Column("citation", sa.String(length=255), nullable=True),
        sa.Column("frequency", sa.String(length=24), nullable=False),
        sa.Column("discipline_id", sa.Integer(), nullable=True),
        sa.Column("applies_to_space_uses", sa.JSON(), nullable=True),
        sa.Column("applies_to_equipment_ids", sa.JSON(), nullable=True),
        # How late still counts. NFPA generator testing has a real tolerance;
        # a state inspection date generally does not.
        sa.Column("grace_days", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("requires_certificate", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("certificate_must_be_posted", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("requires_licensed_provider", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("procedure", sa.Text(), nullable=True),
        sa.Column("reading_point_codes", sa.JSON(), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.ForeignKeyConstraint(["facility_id"], ["facilities.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["discipline_id"], ["disciplines.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("facility_id", "code", name="uq_compliance_program_code"),
    )
    op.create_index("ix_compliance_programs_id", "compliance_programs", ["id"])
    op.create_index("ix_compliance_programs_facility_id", "compliance_programs", ["facility_id"])
    op.create_index("ix_compliance_programs_code", "compliance_programs", ["code"])
    op.create_index("ix_compliance_programs_authority", "compliance_programs", ["authority"])
    op.create_index("ix_compliance_programs_discipline_id", "compliance_programs", ["discipline_id"])
    op.create_index("ix_compliance_programs_is_active", "compliance_programs", ["is_active"])
    op.create_index("ix_compliance_programs_facility_active", "compliance_programs", ["facility_id", "is_active"])

    op.create_table(
        "compliance_tasks",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("facility_id", sa.Integer(), nullable=False),
        sa.Column("program_id", sa.Integer(), nullable=False),
        sa.Column("equipment_id", sa.Integer(), nullable=True),
        sa.Column("location_id", sa.Integer(), nullable=True),
        sa.Column("status", sa.String(length=24), nullable=False, server_default="scheduled"),
        sa.Column("due_date", sa.Date(), nullable=False),
        # Snapshotted from the program: revising the tolerance later must not
        # change whether this occurrence was late.
        sa.Column("grace_days", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("completed_at", sa.DateTime(), nullable=True),
        sa.Column("completed_by_id", sa.Integer(), nullable=True),
        sa.Column("performed_by_vendor_id", sa.Integer(), nullable=True),
        sa.Column("result", sa.String(length=32), nullable=True),
        sa.Column("findings", sa.Text(), nullable=True),
        sa.Column("corrective_action", sa.Text(), nullable=True),
        sa.Column("work_order_id", sa.Integer(), nullable=True),
        sa.Column("certificate_number", sa.String(length=128), nullable=True),
        sa.Column("certificate_issued_by", sa.String(length=255), nullable=True),
        # A surveyor asks who signed and whether they were licensed on the day.
        sa.Column("inspector_license", sa.String(length=128), nullable=True),
        sa.Column("certificate_issued_on", sa.Date(), nullable=True),
        sa.Column("certificate_expires_on", sa.Date(), nullable=True),
        sa.Column("certificate_filename", sa.String(length=255), nullable=True),
        sa.Column("certificate_path", sa.String(length=512), nullable=True),
        sa.Column("measured_values", sa.JSON(), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.ForeignKeyConstraint(["facility_id"], ["facilities.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["program_id"], ["compliance_programs.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["equipment_id"], ["equipment.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["location_id"], ["locations.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["completed_by_id"], ["users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["performed_by_vendor_id"], ["vendors.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["work_order_id"], ["service_requests.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_compliance_tasks_id", "compliance_tasks", ["id"])
    op.create_index("ix_compliance_tasks_facility_id", "compliance_tasks", ["facility_id"])
    op.create_index("ix_compliance_tasks_program_id", "compliance_tasks", ["program_id"])
    op.create_index("ix_compliance_tasks_equipment_id", "compliance_tasks", ["equipment_id"])
    op.create_index("ix_compliance_tasks_location_id", "compliance_tasks", ["location_id"])
    op.create_index("ix_compliance_tasks_status", "compliance_tasks", ["status"])
    op.create_index("ix_compliance_tasks_due_date", "compliance_tasks", ["due_date"])
    op.create_index("ix_compliance_tasks_result", "compliance_tasks", ["result"])
    op.create_index("ix_compliance_tasks_facility_status_due", "compliance_tasks", ["facility_id", "status", "due_date"])
    op.create_index("ix_compliance_tasks_program_due", "compliance_tasks", ["program_id", "due_date"])
    op.create_index("ix_compliance_tasks_equipment", "compliance_tasks", ["equipment_id", "status"])
    op.create_index("ix_compliance_tasks_cert_expiry", "compliance_tasks", ["certificate_expires_on"])
    # Backs the open-task check that makes generation idempotent.
    op.create_index("ix_compliance_tasks_open", "compliance_tasks", ["program_id", "equipment_id", "location_id", "status"])

    # ── Maintenance schedules ───────────────────────────────────────────────
    op.create_table(
        "maintenance_schedules",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("facility_id", sa.Integer(), nullable=False),
        sa.Column("equipment_id", sa.Integer(), nullable=True),
        sa.Column("location_id", sa.Integer(), nullable=True),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("task_description", sa.Text(), nullable=True),
        sa.Column("discipline_id", sa.Integer(), nullable=True),
        sa.Column("basis", sa.String(length=24), nullable=False, server_default="calendar"),
        sa.Column("interval_days", sa.Integer(), nullable=True),
        sa.Column("interval_runtime_hours", sa.Numeric(10, 2), nullable=True),
        sa.Column("runtime_point_id", sa.Integer(), nullable=True),
        sa.Column("runtime_at_last_service", sa.Numeric(12, 2), nullable=True),
        sa.Column("estimated_hours", sa.Numeric(6, 2), nullable=True),
        sa.Column("priority", sa.String(length=16), nullable=False, server_default="medium"),
        # Raise the work before it falls due, so a planner has time to schedule
        # rather than receiving it already late.
        sa.Column("lead_time_days", sa.Integer(), nullable=False, server_default="7"),
        sa.Column("assigned_technician_id", sa.Integer(), nullable=True),
        sa.Column("assigned_vendor_id", sa.Integer(), nullable=True),
        sa.Column("takes_space_out_of_service", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("status", sa.String(length=16), nullable=False, server_default="active"),
        sa.Column("last_generated_at", sa.DateTime(), nullable=True),
        sa.Column("last_completed_at", sa.DateTime(), nullable=True),
        sa.Column("next_due_date", sa.Date(), nullable=True),
        # What makes generation idempotent: a schedule with work already open
        # generates nothing, so a nightly sweep cannot invent a PM backlog.
        sa.Column("open_work_order_id", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.ForeignKeyConstraint(["facility_id"], ["facilities.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["equipment_id"], ["equipment.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["location_id"], ["locations.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["discipline_id"], ["disciplines.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["runtime_point_id"], ["reading_points.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["assigned_technician_id"], ["users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["assigned_vendor_id"], ["vendors.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["open_work_order_id"], ["service_requests.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_maintenance_schedules_id", "maintenance_schedules", ["id"])
    op.create_index("ix_maintenance_schedules_facility_id", "maintenance_schedules", ["facility_id"])
    op.create_index("ix_maintenance_schedules_equipment_id", "maintenance_schedules", ["equipment_id"])
    op.create_index("ix_maintenance_schedules_location_id", "maintenance_schedules", ["location_id"])
    op.create_index("ix_maintenance_schedules_discipline_id", "maintenance_schedules", ["discipline_id"])
    op.create_index("ix_maintenance_schedules_status", "maintenance_schedules", ["status"])
    op.create_index("ix_maintenance_schedules_next_due_date", "maintenance_schedules", ["next_due_date"])
    op.create_index("ix_maint_sched_facility_status_due", "maintenance_schedules", ["facility_id", "status", "next_due_date"])
    op.create_index("ix_maint_sched_equipment", "maintenance_schedules", ["equipment_id", "status"])
    op.create_index("ix_maint_sched_location", "maintenance_schedules", ["location_id", "status"])

    # ── Traced room outlines ────────────────────────────────────────────────
    op.add_column("locations", sa.Column("plan_polygon", sa.JSON(), nullable=True))


def downgrade() -> None:
    op.drop_column("locations", "plan_polygon")
    op.drop_table("maintenance_schedules")
    op.drop_table("compliance_tasks")
    op.drop_table("compliance_programs")
    op.drop_table("permit_approvals")
    op.drop_table("work_permits")
