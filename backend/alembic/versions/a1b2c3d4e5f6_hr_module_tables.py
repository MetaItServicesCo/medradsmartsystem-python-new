"""HR module tables — leave, org, recruitment, lifecycle, payroll, meetings, documents

Revision ID: a1b2c3d4e5f6
Revises: f5c8d9e2a1b4
Create Date: 2026-06-25 00:00:00.000000
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "a1b2c3d4e5f6"
down_revision: Union[str, None] = "f5c8d9e2a1b4"
branch_labels = None
depends_on = None


def _table_exists(name: str) -> bool:
    from sqlalchemy import inspect
    return inspect(op.get_bind()).has_table(name)


def upgrade() -> None:
    # ── Leave Management ──────────────────────────────────────────────────────
    if not _table_exists("hr_leave_types"):
        op.create_table(
            "hr_leave_types",
            sa.Column("id", sa.Integer, primary_key=True, index=True),
            sa.Column("name", sa.String, nullable=False, unique=True),
            sa.Column("description", sa.Text, nullable=True),
            sa.Column("max_days_per_year", sa.Integer, nullable=False, server_default="0"),
            sa.Column("is_paid", sa.Boolean, nullable=False, server_default="true"),
            sa.Column("carry_forward_days", sa.Integer, nullable=False, server_default="0"),
            sa.Column("color", sa.String, nullable=False, server_default="#7C3AED"),
            sa.Column("is_active", sa.Boolean, nullable=False, server_default="true"),
            sa.Column("created_at", sa.DateTime, nullable=False, server_default=sa.func.now()),
            sa.Column("updated_at", sa.DateTime, nullable=False, server_default=sa.func.now()),
        )

    if not _table_exists("hr_leave_policies"):
        op.create_table(
            "hr_leave_policies",
            sa.Column("id", sa.Integer, primary_key=True, index=True),
            sa.Column("name", sa.String, nullable=False),
            sa.Column("description", sa.Text, nullable=True),
            sa.Column("leave_type_id", sa.Integer, sa.ForeignKey("hr_leave_types.id", ondelete="CASCADE"), nullable=False, index=True),
            sa.Column("days_allowed", sa.Integer, nullable=False, server_default="0"),
            sa.Column("applicable_roles", sa.JSON, nullable=True),
            sa.Column("is_active", sa.Boolean, nullable=False, server_default="true"),
            sa.Column("created_at", sa.DateTime, nullable=False, server_default=sa.func.now()),
            sa.Column("updated_at", sa.DateTime, nullable=False, server_default=sa.func.now()),
        )

    if not _table_exists("hr_leave_requests"):
        op.create_table(
            "hr_leave_requests",
            sa.Column("id", sa.Integer, primary_key=True, index=True),
            sa.Column("user_id", sa.Integer, sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True),
            sa.Column("leave_type_id", sa.Integer, sa.ForeignKey("hr_leave_types.id", ondelete="SET NULL"), nullable=True, index=True),
            sa.Column("start_date", sa.Date, nullable=False),
            sa.Column("end_date", sa.Date, nullable=False),
            sa.Column("total_days", sa.Float, nullable=False, server_default="0"),
            sa.Column("reason", sa.Text, nullable=True),
            sa.Column("status", sa.String, nullable=False, server_default="pending", index=True),
            sa.Column("approved_by_id", sa.Integer, sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
            sa.Column("approved_at", sa.DateTime, nullable=True),
            sa.Column("comments", sa.Text, nullable=True),
            sa.Column("created_at", sa.DateTime, nullable=False, server_default=sa.func.now()),
            sa.Column("updated_at", sa.DateTime, nullable=False, server_default=sa.func.now()),
        )

    # ── Attendance Policies ───────────────────────────────────────────────────
    if not _table_exists("hr_attendance_policies"):
        op.create_table(
            "hr_attendance_policies",
            sa.Column("id", sa.Integer, primary_key=True, index=True),
            sa.Column("name", sa.String, nullable=False),
            sa.Column("description", sa.Text, nullable=True),
            sa.Column("work_hours_per_day", sa.Float, nullable=False, server_default="8"),
            sa.Column("work_days_per_week", sa.Integer, nullable=False, server_default="5"),
            sa.Column("overtime_threshold", sa.Float, nullable=False, server_default="8"),
            sa.Column("grace_period_minutes", sa.Integer, nullable=False, server_default="15"),
            sa.Column("is_default", sa.Boolean, nullable=False, server_default="false"),
            sa.Column("applicable_roles", sa.JSON, nullable=True),
            sa.Column("created_at", sa.DateTime, nullable=False, server_default=sa.func.now()),
            sa.Column("updated_at", sa.DateTime, nullable=False, server_default=sa.func.now()),
        )

    # ── Organization ──────────────────────────────────────────────────────────
    if not _table_exists("hr_holidays"):
        op.create_table(
            "hr_holidays",
            sa.Column("id", sa.Integer, primary_key=True, index=True),
            sa.Column("name", sa.String, nullable=False),
            sa.Column("date", sa.Date, nullable=False, index=True),
            sa.Column("description", sa.Text, nullable=True),
            sa.Column("type", sa.String, nullable=False, server_default="public"),
            sa.Column("is_recurring", sa.Boolean, nullable=False, server_default="false"),
            sa.Column("created_by_id", sa.Integer, sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
            sa.Column("created_at", sa.DateTime, nullable=False, server_default=sa.func.now()),
            sa.Column("updated_at", sa.DateTime, nullable=False, server_default=sa.func.now()),
        )

    if not _table_exists("hr_announcements"):
        op.create_table(
            "hr_announcements",
            sa.Column("id", sa.Integer, primary_key=True, index=True),
            sa.Column("title", sa.String, nullable=False),
            sa.Column("content", sa.Text, nullable=False),
            sa.Column("priority", sa.String, nullable=False, server_default="normal"),
            sa.Column("author_id", sa.Integer, sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
            sa.Column("published_at", sa.DateTime, nullable=True),
            sa.Column("expires_at", sa.DateTime, nullable=True),
            sa.Column("is_pinned", sa.Boolean, nullable=False, server_default="false"),
            sa.Column("target_audience", sa.JSON, nullable=True),
            sa.Column("created_at", sa.DateTime, nullable=False, server_default=sa.func.now()),
            sa.Column("updated_at", sa.DateTime, nullable=False, server_default=sa.func.now()),
        )

    # ── Recruitment ───────────────────────────────────────────────────────────
    if not _table_exists("hr_job_openings"):
        op.create_table(
            "hr_job_openings",
            sa.Column("id", sa.Integer, primary_key=True, index=True),
            sa.Column("title", sa.String, nullable=False),
            sa.Column("department", sa.String, nullable=True),
            sa.Column("description", sa.Text, nullable=True),
            sa.Column("requirements", sa.Text, nullable=True),
            sa.Column("location", sa.String, nullable=True),
            sa.Column("employment_type", sa.String, nullable=True),
            sa.Column("salary_min", sa.Numeric(12, 2), nullable=True),
            sa.Column("salary_max", sa.Numeric(12, 2), nullable=True),
            sa.Column("status", sa.String, nullable=False, server_default="draft", index=True),
            sa.Column("created_by_id", sa.Integer, sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
            sa.Column("posted_at", sa.DateTime, nullable=True),
            sa.Column("closes_at", sa.Date, nullable=True),
            sa.Column("created_at", sa.DateTime, nullable=False, server_default=sa.func.now()),
            sa.Column("updated_at", sa.DateTime, nullable=False, server_default=sa.func.now()),
        )

    if not _table_exists("hr_candidates"):
        op.create_table(
            "hr_candidates",
            sa.Column("id", sa.Integer, primary_key=True, index=True),
            sa.Column("job_opening_id", sa.Integer, sa.ForeignKey("hr_job_openings.id", ondelete="CASCADE"), nullable=False, index=True),
            sa.Column("first_name", sa.String, nullable=False),
            sa.Column("last_name", sa.String, nullable=False),
            sa.Column("email", sa.String, nullable=False),
            sa.Column("phone", sa.String, nullable=True),
            sa.Column("resume_url", sa.String, nullable=True),
            sa.Column("status", sa.String, nullable=False, server_default="applied", index=True),
            sa.Column("applied_at", sa.DateTime, nullable=False, server_default=sa.func.now()),
            sa.Column("rating", sa.Integer, nullable=True),
            sa.Column("notes", sa.Text, nullable=True),
            sa.Column("created_at", sa.DateTime, nullable=False, server_default=sa.func.now()),
            sa.Column("updated_at", sa.DateTime, nullable=False, server_default=sa.func.now()),
        )

    if not _table_exists("hr_job_offers"):
        op.create_table(
            "hr_job_offers",
            sa.Column("id", sa.Integer, primary_key=True, index=True),
            sa.Column("candidate_id", sa.Integer, sa.ForeignKey("hr_candidates.id", ondelete="CASCADE"), nullable=False, index=True),
            sa.Column("job_opening_id", sa.Integer, sa.ForeignKey("hr_job_openings.id", ondelete="SET NULL"), nullable=True),
            sa.Column("salary", sa.Numeric(12, 2), nullable=True),
            sa.Column("start_date", sa.Date, nullable=True),
            sa.Column("expiry_date", sa.Date, nullable=True),
            sa.Column("status", sa.String, nullable=False, server_default="draft", index=True),
            sa.Column("notes", sa.Text, nullable=True),
            sa.Column("created_at", sa.DateTime, nullable=False, server_default=sa.func.now()),
            sa.Column("updated_at", sa.DateTime, nullable=False, server_default=sa.func.now()),
        )

    if not _table_exists("hr_onboarding_checklists"):
        op.create_table(
            "hr_onboarding_checklists",
            sa.Column("id", sa.Integer, primary_key=True, index=True),
            sa.Column("name", sa.String, nullable=False),
            sa.Column("description", sa.Text, nullable=True),
            sa.Column("is_active", sa.Boolean, nullable=False, server_default="true"),
            sa.Column("created_at", sa.DateTime, nullable=False, server_default=sa.func.now()),
            sa.Column("updated_at", sa.DateTime, nullable=False, server_default=sa.func.now()),
        )

    if not _table_exists("hr_onboarding_checklist_items"):
        op.create_table(
            "hr_onboarding_checklist_items",
            sa.Column("id", sa.Integer, primary_key=True, index=True),
            sa.Column("checklist_id", sa.Integer, sa.ForeignKey("hr_onboarding_checklists.id", ondelete="CASCADE"), nullable=False, index=True),
            sa.Column("title", sa.String, nullable=False),
            sa.Column("description", sa.Text, nullable=True),
            sa.Column("order_index", sa.Integer, nullable=False, server_default="0"),
            sa.Column("is_required", sa.Boolean, nullable=False, server_default="true"),
        )

    # ── Employee Lifecycle ────────────────────────────────────────────────────
    if not _table_exists("hr_employee_awards"):
        op.create_table(
            "hr_employee_awards",
            sa.Column("id", sa.Integer, primary_key=True, index=True),
            sa.Column("user_id", sa.Integer, sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True),
            sa.Column("title", sa.String, nullable=False),
            sa.Column("description", sa.Text, nullable=True),
            sa.Column("award_date", sa.Date, nullable=False),
            sa.Column("awarded_by_id", sa.Integer, sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
            sa.Column("category", sa.String, nullable=True),
            sa.Column("amount", sa.Numeric(12, 2), nullable=True),
            sa.Column("created_at", sa.DateTime, nullable=False, server_default=sa.func.now()),
            sa.Column("updated_at", sa.DateTime, nullable=False, server_default=sa.func.now()),
        )

    if not _table_exists("hr_employee_promotions"):
        op.create_table(
            "hr_employee_promotions",
            sa.Column("id", sa.Integer, primary_key=True, index=True),
            sa.Column("user_id", sa.Integer, sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True),
            sa.Column("previous_title", sa.String, nullable=True),
            sa.Column("new_title", sa.String, nullable=False),
            sa.Column("previous_salary", sa.Numeric(12, 2), nullable=True),
            sa.Column("new_salary", sa.Numeric(12, 2), nullable=True),
            sa.Column("effective_date", sa.Date, nullable=False),
            sa.Column("reason", sa.Text, nullable=True),
            sa.Column("approved_by_id", sa.Integer, sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
            sa.Column("notes", sa.Text, nullable=True),
            sa.Column("created_at", sa.DateTime, nullable=False, server_default=sa.func.now()),
            sa.Column("updated_at", sa.DateTime, nullable=False, server_default=sa.func.now()),
        )

    if not _table_exists("hr_employee_resignations"):
        op.create_table(
            "hr_employee_resignations",
            sa.Column("id", sa.Integer, primary_key=True, index=True),
            sa.Column("user_id", sa.Integer, sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True),
            sa.Column("submitted_at", sa.DateTime, nullable=False, server_default=sa.func.now()),
            sa.Column("last_working_day", sa.Date, nullable=True),
            sa.Column("reason", sa.Text, nullable=True),
            sa.Column("status", sa.String, nullable=False, server_default="submitted"),
            sa.Column("notes", sa.Text, nullable=True),
            sa.Column("processed_by_id", sa.Integer, sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
            sa.Column("created_at", sa.DateTime, nullable=False, server_default=sa.func.now()),
            sa.Column("updated_at", sa.DateTime, nullable=False, server_default=sa.func.now()),
        )

    if not _table_exists("hr_employee_terminations"):
        op.create_table(
            "hr_employee_terminations",
            sa.Column("id", sa.Integer, primary_key=True, index=True),
            sa.Column("user_id", sa.Integer, sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True),
            sa.Column("termination_date", sa.Date, nullable=False),
            sa.Column("reason", sa.Text, nullable=True),
            sa.Column("termination_type", sa.String, nullable=False, server_default="voluntary"),
            sa.Column("notes", sa.Text, nullable=True),
            sa.Column("processed_by_id", sa.Integer, sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
            sa.Column("created_at", sa.DateTime, nullable=False, server_default=sa.func.now()),
            sa.Column("updated_at", sa.DateTime, nullable=False, server_default=sa.func.now()),
        )

    # ── Payroll ───────────────────────────────────────────────────────────────
    if not _table_exists("hr_tax_brackets"):
        op.create_table(
            "hr_tax_brackets",
            sa.Column("id", sa.Integer, primary_key=True, index=True),
            sa.Column("name", sa.String, nullable=False),
            sa.Column("min_income", sa.Numeric(12, 2), nullable=False, server_default="0"),
            sa.Column("max_income", sa.Numeric(12, 2), nullable=True),
            sa.Column("rate", sa.Float, nullable=False),
            sa.Column("effective_from", sa.Date, nullable=False),
            sa.Column("effective_to", sa.Date, nullable=True),
            sa.Column("created_at", sa.DateTime, nullable=False, server_default=sa.func.now()),
            sa.Column("updated_at", sa.DateTime, nullable=False, server_default=sa.func.now()),
        )

    if not _table_exists("hr_payroll_configs"):
        op.create_table(
            "hr_payroll_configs",
            sa.Column("id", sa.Integer, primary_key=True, index=True),
            sa.Column("user_id", sa.Integer, sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True),
            sa.Column("base_salary", sa.Numeric(12, 2), nullable=False, server_default="0"),
            sa.Column("hourly_rate", sa.Numeric(10, 4), nullable=True),
            sa.Column("overtime_multiplier", sa.Float, nullable=False, server_default="1.5"),
            sa.Column("pay_frequency", sa.String, nullable=False, server_default="monthly"),
            sa.Column("effective_from", sa.Date, nullable=False),
            sa.Column("is_active", sa.Boolean, nullable=False, server_default="true"),
            sa.Column("created_at", sa.DateTime, nullable=False, server_default=sa.func.now()),
            sa.Column("updated_at", sa.DateTime, nullable=False, server_default=sa.func.now()),
        )

    if not _table_exists("hr_payroll_runs"):
        op.create_table(
            "hr_payroll_runs",
            sa.Column("id", sa.Integer, primary_key=True, index=True),
            sa.Column("period_start", sa.Date, nullable=False),
            sa.Column("period_end", sa.Date, nullable=False),
            sa.Column("status", sa.String, nullable=False, server_default="draft", index=True),
            sa.Column("total_gross", sa.Numeric(14, 2), nullable=False, server_default="0"),
            sa.Column("total_net", sa.Numeric(14, 2), nullable=False, server_default="0"),
            sa.Column("total_tax", sa.Numeric(14, 2), nullable=False, server_default="0"),
            sa.Column("run_date", sa.DateTime, nullable=True),
            sa.Column("processed_by_id", sa.Integer, sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
            sa.Column("notes", sa.Text, nullable=True),
            sa.Column("created_at", sa.DateTime, nullable=False, server_default=sa.func.now()),
            sa.Column("updated_at", sa.DateTime, nullable=False, server_default=sa.func.now()),
        )

    if not _table_exists("hr_payslips"):
        op.create_table(
            "hr_payslips",
            sa.Column("id", sa.Integer, primary_key=True, index=True),
            sa.Column("payroll_run_id", sa.Integer, sa.ForeignKey("hr_payroll_runs.id", ondelete="CASCADE"), nullable=False, index=True),
            sa.Column("user_id", sa.Integer, sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True),
            sa.Column("gross_pay", sa.Numeric(12, 2), nullable=False, server_default="0"),
            sa.Column("tax_amount", sa.Numeric(12, 2), nullable=False, server_default="0"),
            sa.Column("deductions", sa.Numeric(12, 2), nullable=False, server_default="0"),
            sa.Column("net_pay", sa.Numeric(12, 2), nullable=False, server_default="0"),
            sa.Column("work_hours", sa.Float, nullable=False, server_default="0"),
            sa.Column("overtime_hours", sa.Float, nullable=False, server_default="0"),
            sa.Column("notes", sa.Text, nullable=True),
            sa.Column("created_at", sa.DateTime, nullable=False, server_default=sa.func.now()),
            sa.Column("updated_at", sa.DateTime, nullable=False, server_default=sa.func.now()),
        )

    # ── Meetings ──────────────────────────────────────────────────────────────
    if not _table_exists("hr_meetings"):
        op.create_table(
            "hr_meetings",
            sa.Column("id", sa.Integer, primary_key=True, index=True),
            sa.Column("title", sa.String, nullable=False),
            sa.Column("description", sa.Text, nullable=True),
            sa.Column("scheduled_at", sa.DateTime, nullable=False),
            sa.Column("duration_minutes", sa.Integer, nullable=False, server_default="60"),
            sa.Column("location", sa.String, nullable=True),
            sa.Column("meeting_type", sa.String, nullable=True),
            sa.Column("organizer_id", sa.Integer, sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
            sa.Column("status", sa.String, nullable=False, server_default="scheduled", index=True),
            sa.Column("created_at", sa.DateTime, nullable=False, server_default=sa.func.now()),
            sa.Column("updated_at", sa.DateTime, nullable=False, server_default=sa.func.now()),
        )

    if not _table_exists("hr_meeting_attendees"):
        op.create_table(
            "hr_meeting_attendees",
            sa.Column("id", sa.Integer, primary_key=True, index=True),
            sa.Column("meeting_id", sa.Integer, sa.ForeignKey("hr_meetings.id", ondelete="CASCADE"), nullable=False, index=True),
            sa.Column("user_id", sa.Integer, sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True),
            sa.Column("rsvp_status", sa.String, nullable=False, server_default="pending"),
        )

    if not _table_exists("hr_meeting_minutes"):
        op.create_table(
            "hr_meeting_minutes",
            sa.Column("id", sa.Integer, primary_key=True, index=True),
            sa.Column("meeting_id", sa.Integer, sa.ForeignKey("hr_meetings.id", ondelete="CASCADE"), nullable=False, index=True, unique=True),
            sa.Column("content", sa.Text, nullable=False),
            sa.Column("action_items", sa.JSON, nullable=True),
            sa.Column("recorded_by_id", sa.Integer, sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
            sa.Column("recorded_at", sa.DateTime, nullable=False, server_default=sa.func.now()),
            sa.Column("updated_at", sa.DateTime, nullable=False, server_default=sa.func.now()),
        )

    # ── Documents ─────────────────────────────────────────────────────────────
    if not _table_exists("hr_document_categories"):
        op.create_table(
            "hr_document_categories",
            sa.Column("id", sa.Integer, primary_key=True, index=True),
            sa.Column("name", sa.String, nullable=False, unique=True),
            sa.Column("description", sa.Text, nullable=True),
            sa.Column("color", sa.String, nullable=False, server_default="#2563EB"),
            sa.Column("created_at", sa.DateTime, nullable=False, server_default=sa.func.now()),
        )

    if not _table_exists("hr_contract_types"):
        op.create_table(
            "hr_contract_types",
            sa.Column("id", sa.Integer, primary_key=True, index=True),
            sa.Column("name", sa.String, nullable=False, unique=True),
            sa.Column("description", sa.Text, nullable=True),
            sa.Column("created_at", sa.DateTime, nullable=False, server_default=sa.func.now()),
        )

    if not _table_exists("hr_document_templates"):
        op.create_table(
            "hr_document_templates",
            sa.Column("id", sa.Integer, primary_key=True, index=True),
            sa.Column("name", sa.String, nullable=False),
            sa.Column("description", sa.Text, nullable=True),
            sa.Column("category_id", sa.Integer, sa.ForeignKey("hr_document_categories.id", ondelete="SET NULL"), nullable=True, index=True),
            sa.Column("content", sa.Text, nullable=False),
            sa.Column("variables", sa.JSON, nullable=True),
            sa.Column("created_by_id", sa.Integer, sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
            sa.Column("created_at", sa.DateTime, nullable=False, server_default=sa.func.now()),
            sa.Column("updated_at", sa.DateTime, nullable=False, server_default=sa.func.now()),
        )

    if not _table_exists("hr_contract_templates"):
        op.create_table(
            "hr_contract_templates",
            sa.Column("id", sa.Integer, primary_key=True, index=True),
            sa.Column("name", sa.String, nullable=False),
            sa.Column("description", sa.Text, nullable=True),
            sa.Column("contract_type_id", sa.Integer, sa.ForeignKey("hr_contract_types.id", ondelete="SET NULL"), nullable=True, index=True),
            sa.Column("content", sa.Text, nullable=False),
            sa.Column("created_by_id", sa.Integer, sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
            sa.Column("created_at", sa.DateTime, nullable=False, server_default=sa.func.now()),
            sa.Column("updated_at", sa.DateTime, nullable=False, server_default=sa.func.now()),
        )

    if not _table_exists("hr_employee_documents"):
        op.create_table(
            "hr_employee_documents",
            sa.Column("id", sa.Integer, primary_key=True, index=True),
            sa.Column("user_id", sa.Integer, sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True),
            sa.Column("category_id", sa.Integer, sa.ForeignKey("hr_document_categories.id", ondelete="SET NULL"), nullable=True, index=True),
            sa.Column("title", sa.String, nullable=False),
            sa.Column("description", sa.Text, nullable=True),
            sa.Column("file_url", sa.String, nullable=True),
            sa.Column("document_date", sa.Date, nullable=True),
            sa.Column("is_confidential", sa.Boolean, nullable=False, server_default="false"),
            sa.Column("uploaded_by_id", sa.Integer, sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
            sa.Column("created_at", sa.DateTime, nullable=False, server_default=sa.func.now()),
            sa.Column("updated_at", sa.DateTime, nullable=False, server_default=sa.func.now()),
        )

    if not _table_exists("hr_employee_contracts"):
        op.create_table(
            "hr_employee_contracts",
            sa.Column("id", sa.Integer, primary_key=True, index=True),
            sa.Column("user_id", sa.Integer, sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True),
            sa.Column("contract_type_id", sa.Integer, sa.ForeignKey("hr_contract_types.id", ondelete="SET NULL"), nullable=True),
            sa.Column("title", sa.String, nullable=False),
            sa.Column("start_date", sa.Date, nullable=True),
            sa.Column("end_date", sa.Date, nullable=True),
            sa.Column("file_url", sa.String, nullable=True),
            sa.Column("status", sa.String, nullable=False, server_default="draft", index=True),
            sa.Column("notes", sa.Text, nullable=True),
            sa.Column("created_at", sa.DateTime, nullable=False, server_default=sa.func.now()),
            sa.Column("updated_at", sa.DateTime, nullable=False, server_default=sa.func.now()),
        )

    if not _table_exists("hr_employee_acknowledgments"):
        op.create_table(
            "hr_employee_acknowledgments",
            sa.Column("id", sa.Integer, primary_key=True, index=True),
            sa.Column("user_id", sa.Integer, sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True),
            sa.Column("document_id", sa.Integer, sa.ForeignKey("hr_employee_documents.id", ondelete="CASCADE"), nullable=False, index=True),
            sa.Column("acknowledged_at", sa.DateTime, nullable=False, server_default=sa.func.now()),
            sa.Column("notes", sa.Text, nullable=True),
        )


def downgrade() -> None:
    tables = [
        "hr_employee_acknowledgments", "hr_employee_contracts", "hr_employee_documents",
        "hr_contract_templates", "hr_document_templates", "hr_contract_types",
        "hr_document_categories", "hr_meeting_minutes", "hr_meeting_attendees",
        "hr_meetings", "hr_payslips", "hr_payroll_runs", "hr_payroll_configs",
        "hr_tax_brackets", "hr_employee_terminations", "hr_employee_resignations",
        "hr_employee_promotions", "hr_employee_awards", "hr_onboarding_checklist_items",
        "hr_onboarding_checklists", "hr_job_offers", "hr_candidates", "hr_job_openings",
        "hr_announcements", "hr_holidays", "hr_attendance_policies",
        "hr_leave_requests", "hr_leave_policies", "hr_leave_types",
    ]
    for t in tables:
        op.execute(f"DROP TABLE IF EXISTS {t} CASCADE")
