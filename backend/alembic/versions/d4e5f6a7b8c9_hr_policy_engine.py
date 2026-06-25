"""Attendance policy engine: new fields, employee assignments, timesheet flags

Revision ID: d4e5f6a7b8c9
Revises: c3d4e5f6a7b8
Create Date: 2026-06-26
"""
from alembic import op
import sqlalchemy as sa

revision = "d4e5f6a7b8c9"
down_revision = "c3d4e5f6a7b8"
branch_labels = None
depends_on = None


def _table_exists(name: str) -> bool:
    from sqlalchemy import inspect
    return inspect(op.get_bind()).has_table(name)


def _col_exists(table: str, col: str) -> bool:
    from sqlalchemy import inspect
    cols = [c["name"] for c in inspect(op.get_bind()).get_columns(table)]
    return col in cols


def upgrade():
    # ── Expand hr_attendance_policies ─────────────────────────────────────────
    for col, typ, kw in [
        ("shift_start_time",              sa.String(5),      {"nullable": True}),
        ("shift_end_time",                sa.String(5),      {"nullable": True}),
        ("timezone",                      sa.String(50),     {"nullable": False, "server_default": "UTC"}),
        ("late_arrival_grace_minutes",    sa.Integer(),      {"nullable": False, "server_default": "15"}),
        ("early_departure_grace_minutes", sa.Integer(),      {"nullable": False, "server_default": "15"}),
        ("overtime_rate_per_hour",        sa.Numeric(10, 2), {"nullable": True}),
        ("consecutive_late_limit",        sa.Integer(),      {"nullable": False, "server_default": "3"}),
        ("late_strike_action",            sa.String(20),     {"nullable": False, "server_default": "full_day"}),
        ("is_active",                     sa.Boolean(),      {"nullable": False, "server_default": "true"}),
    ]:
        if not _col_exists("hr_attendance_policies", col):
            op.add_column("hr_attendance_policies", sa.Column(col, typ, **kw))

    # ── Create hr_employee_policy_assignments ─────────────────────────────────
    if not _table_exists("hr_employee_policy_assignments"):
        op.create_table(
            "hr_employee_policy_assignments",
            sa.Column("id",             sa.Integer(),  nullable=False),
            sa.Column("user_id",        sa.Integer(),  nullable=False),
            sa.Column("policy_id",      sa.Integer(),  nullable=True),
            sa.Column("effective_from", sa.Date(),     nullable=False),
            sa.Column("created_at",     sa.DateTime(), nullable=False),
            sa.ForeignKeyConstraint(["user_id"],   ["users.id"],                   ondelete="CASCADE"),
            sa.ForeignKeyConstraint(["policy_id"], ["hr_attendance_policies.id"],  ondelete="SET NULL"),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint("user_id"),
        )
        op.create_index("ix_hr_employee_policy_assignments_id",      "hr_employee_policy_assignments", ["id"])
        op.create_index("ix_hr_employee_policy_assignments_user_id", "hr_employee_policy_assignments", ["user_id"])

    # ── Expand hr_timesheets ──────────────────────────────────────────────────
    for col, typ, kw in [
        ("policy_id",               sa.Integer(),  {"nullable": True}),
        ("is_late",                 sa.Boolean(),  {"nullable": True}),
        ("late_minutes",            sa.Float(),    {"nullable": True}),
        ("is_early_departure",      sa.Boolean(),  {"nullable": True}),
        ("early_departure_minutes", sa.Float(),    {"nullable": True}),
        ("policy_deduction",        sa.Float(),    {"nullable": True, "server_default": "0"}),
        ("deduction_reason",        sa.Text(),     {"nullable": True}),
    ]:
        if not _col_exists("hr_timesheets", col):
            op.add_column("hr_timesheets", sa.Column(col, typ, **kw))

    # FK for policy_id → hr_attendance_policies (add only if not present)
    # (SQLite doesn't enforce FKs so this is mainly for Postgres)
    try:
        op.create_foreign_key(
            "fk_hr_timesheets_policy_id",
            "hr_timesheets", "hr_attendance_policies",
            ["policy_id"], ["id"],
            ondelete="SET NULL",
        )
    except Exception:
        pass


def downgrade():
    op.drop_column("hr_timesheets", "deduction_reason")
    op.drop_column("hr_timesheets", "policy_deduction")
    op.drop_column("hr_timesheets", "early_departure_minutes")
    op.drop_column("hr_timesheets", "is_early_departure")
    op.drop_column("hr_timesheets", "late_minutes")
    op.drop_column("hr_timesheets", "is_late")
    op.drop_column("hr_timesheets", "policy_id")
    if _table_exists("hr_employee_policy_assignments"):
        op.drop_table("hr_employee_policy_assignments")
    for col in ["is_active", "late_strike_action", "consecutive_late_limit",
                "overtime_rate_per_hour", "early_departure_grace_minutes",
                "late_arrival_grace_minutes", "timezone", "shift_end_time", "shift_start_time"]:
        op.drop_column("hr_attendance_policies", col)
