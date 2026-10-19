"""The HR manager's half of the business.

Until the assistant was Super Admin only, nothing here needed tools: a Super
Admin asks about revenue, workload and facilities, and the existing tools
cover that well. An HR manager's day is leave, hours and payroll, and none of
it was reachable -- "how many leave requests are pending" had no tool at all,
so the honest answer was that the assistant could not say, about a module they
have full access to.

Three tools, matching the three questions people actually ask:

* who is off, and who is waiting to hear
* who worked what, and who was late
* what payroll came to

All three require the ``hr`` module, which in the permission matrix only
administrators and HR managers hold. Counts and sums are computed in
PostgreSQL and reported, never recomputed by the model.

A note on pay. These tools return salary figures, because an HR manager asking
what a payroll run came to is their job and refusing it would make the
assistant useless to them. Two consequences are worth being deliberate about:
the answer can be read aloud by the voice pipeline in a shared office, and it
is only ever as private as the account asking. Pay is reported in aggregate by
default -- a run total rather than a list of people -- and a named person's
payslip takes an explicit request for that person.
"""
from __future__ import annotations

from datetime import date
from typing import Any, Optional

from sqlalchemy import func

from app.assistant.tools.base import (
    ToolContext, ToolResult, clamp_limit, money, validate_date_range,
)
from app.models.hr import (
    LeaveRequest, LeaveRequestStatus, LeaveType,
    PayrollRun, PayrollRunStatus, Payslip, Timesheet, TimesheetStatus,
)
from app.models.user import User


LEAVE_STATUSES: tuple[str, ...] = tuple(m.value for m in LeaveRequestStatus)
TIMESHEET_STATUSES: tuple[str, ...] = tuple(m.value for m in TimesheetStatus)
PAYROLL_STATUSES: tuple[str, ...] = tuple(m.value for m in PayrollRunStatus)


def _person_filter(ctx: ToolContext, query, column, person: Optional[str]):
    """Narrow to one named person, or refuse to guess between several."""
    if not person:
        return query, None
    like = "%{}%".format(person.strip().lower())
    matches = (
        ctx.db.query(User.id, User.full_name, User.username)
        .filter(func.lower(User.full_name).like(like)
                | func.lower(User.username).like(like))
        .limit(6).all()
    )
    if not matches:
        # Not an error: an empty result with a note is more useful than a
        # refusal, because the name may simply be spelled differently.
        return query.filter(column == -1), "No employee matches '{}'.".format(person)
    if len(matches) > 1:
        names = ", ".join(m[1] or m[2] for m in matches)
        return query.filter(column == -1), (
            "More than one person matches '{}': {}. Ask which was meant."
            .format(person, names)
        )
    return query.filter(column == matches[0][0]), None


def _names(ctx: ToolContext, user_ids: set[int]) -> dict[int, str]:
    if not user_ids:
        return {}
    return {
        uid: (full or username)
        for uid, full, username in ctx.db.query(
            User.id, User.full_name, User.username
        ).filter(User.id.in_(user_ids)).all()
    }


def search_leave_requests(
    ctx: ToolContext,
    status: Optional[list[str]] = None,
    person: Optional[str] = None,
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    limit: Optional[int] = None,
) -> ToolResult:
    """Who is off, who has asked to be, and who is still waiting to hear."""
    ctx.require_module("hr", "view")
    ctx.apply_statement_timeout()
    validate_date_range(date_from, date_to)

    query = ctx.db.query(LeaveRequest)
    if status:
        query = query.filter(LeaveRequest.status.in_(
            [LeaveRequestStatus(s) for s in status]))
    # Overlap, not containment: a week off that starts before the window and
    # ends inside it is absence during the window and must be counted.
    if date_from:
        query = query.filter(LeaveRequest.end_date >= date_from)
    if date_to:
        query = query.filter(LeaveRequest.start_date <= date_to)
    query, note = _person_filter(ctx, query, LeaveRequest.user_id, person)

    total = query.count()
    by_status = dict(
        query.with_entities(LeaveRequest.status, func.count(LeaveRequest.id))
        .group_by(LeaveRequest.status).all()
    )
    total_days = query.with_entities(
        func.coalesce(func.sum(LeaveRequest.total_days), 0)).scalar() or 0

    rows = (
        query.order_by(LeaveRequest.start_date.desc())
        .limit(clamp_limit(limit)).all()
    )
    people = _names(ctx, {r.user_id for r in rows})
    kinds = dict(ctx.db.query(LeaveType.id, LeaveType.name).all())

    return ToolResult(
        tool="search_leave_requests",
        total_count=total,
        items=[{
            "id": r.id,
            "person": people.get(r.user_id, "user {}".format(r.user_id)),
            "leave_type": kinds.get(r.leave_type_id),
            "start_date": r.start_date.isoformat() if r.start_date else None,
            "end_date": r.end_date.isoformat() if r.end_date else None,
            "days": r.total_days,
            "status": r.status.value if r.status else None,
            "reason": (r.reason or "")[:160] or None,
        } for r in rows],
        aggregates={
            "total_days": round(float(total_days), 2),
            "by_status": {
                getattr(k, "value", str(k)): v for k, v in by_status.items()
            },
        },
        applied_filters={
            "status": status, "person": person,
            "date_from": date_from.isoformat() if date_from else None,
            "date_to": date_to.isoformat() if date_to else None,
        },
        notes=[note] if note else [],
    )


def search_timesheets(
    ctx: ToolContext,
    person: Optional[str] = None,
    status: Optional[list[str]] = None,
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    late_only: bool = False,
    limit: Optional[int] = None,
) -> ToolResult:
    """Hours worked, lateness and deductions over a period."""
    ctx.require_module("hr", "view")
    ctx.apply_statement_timeout()
    validate_date_range(date_from, date_to)

    query = ctx.db.query(Timesheet)
    if date_from:
        query = query.filter(Timesheet.work_date >= date_from)
    if date_to:
        query = query.filter(Timesheet.work_date <= date_to)
    if status:
        query = query.filter(Timesheet.status.in_(
            [TimesheetStatus(s) for s in status]))
    if late_only:
        query = query.filter(Timesheet.is_late.is_(True))
    query, note = _person_filter(ctx, query, Timesheet.user_id, person)

    total = query.count()
    sums = query.with_entities(
        func.coalesce(func.sum(Timesheet.hours), 0),
        func.coalesce(func.sum(Timesheet.policy_deduction), 0),
        func.count(Timesheet.id).filter(Timesheet.is_late.is_(True)),
    ).one()

    rows = (
        query.order_by(Timesheet.work_date.desc())
        .limit(clamp_limit(limit)).all()
    )
    people = _names(ctx, {r.user_id for r in rows})

    return ToolResult(
        tool="search_timesheets",
        total_count=total,
        items=[{
            "id": r.id,
            "person": people.get(r.user_id, "user {}".format(r.user_id)),
            "work_date": r.work_date.isoformat() if r.work_date else None,
            "hours": r.hours,
            "day_status": r.day_status.value if r.day_status else None,
            "status": r.status.value if r.status else None,
            "is_late": bool(r.is_late),
            "late_minutes": r.late_minutes,
            "project": r.project,
        } for r in rows],
        aggregates={
            "total_hours": round(float(sums[0] or 0), 2),
            "total_deductions": money(sums[1]),
            "late_days": int(sums[2] or 0),
        },
        applied_filters={
            "person": person, "status": status, "late_only": late_only,
            "date_from": date_from.isoformat() if date_from else None,
            "date_to": date_to.isoformat() if date_to else None,
        },
        notes=[note] if note else [],
    )


def search_payroll(
    ctx: ToolContext,
    status: Optional[list[str]] = None,
    person: Optional[str] = None,
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    limit: Optional[int] = None,
) -> ToolResult:
    """Payroll runs and what they came to.

    Without ``person`` this reports run totals -- gross, tax and net for the
    whole run -- which answers what payroll cost without naming anybody. With
    ``person`` it reports that individual's payslips, which is a deliberate
    and separate act rather than something that falls out of a broad question.
    """
    ctx.require_module("hr", "view")
    ctx.apply_statement_timeout()
    validate_date_range(date_from, date_to)

    if person:
        query = ctx.db.query(Payslip).join(
            PayrollRun, Payslip.payroll_run_id == PayrollRun.id)
        if date_from:
            query = query.filter(PayrollRun.period_end >= date_from)
        if date_to:
            query = query.filter(PayrollRun.period_start <= date_to)
        if status:
            query = query.filter(PayrollRun.status.in_(
                [PayrollRunStatus(s) for s in status]))
        query, note = _person_filter(ctx, query, Payslip.user_id, person)

        total = query.count()
        sums = query.with_entities(
            func.coalesce(func.sum(Payslip.gross_pay), 0),
            func.coalesce(func.sum(Payslip.tax_amount), 0),
            func.coalesce(func.sum(Payslip.net_pay), 0),
        ).one()
        rows = query.order_by(Payslip.id.desc()).limit(clamp_limit(limit)).all()
        people = _names(ctx, {r.user_id for r in rows})
        return ToolResult(
            tool="search_payroll",
            total_count=total,
            items=[{
                "payslip_id": r.id,
                "person": people.get(r.user_id, "user {}".format(r.user_id)),
                "gross_pay": money(r.gross_pay),
                "tax_amount": money(r.tax_amount),
                "deductions": money(r.deductions),
                "net_pay": money(r.net_pay),
                "work_hours": r.work_hours,
                "overtime_hours": r.overtime_hours,
            } for r in rows],
            aggregates={
                "total_gross": money(sums[0]),
                "total_tax": money(sums[1]),
                "total_net": money(sums[2]),
            },
            applied_filters={"person": person, "status": status},
            notes=[note] if note else [],
        )

    query = ctx.db.query(PayrollRun)
    if date_from:
        query = query.filter(PayrollRun.period_end >= date_from)
    if date_to:
        query = query.filter(PayrollRun.period_start <= date_to)
    if status:
        query = query.filter(PayrollRun.status.in_(
            [PayrollRunStatus(s) for s in status]))

    total = query.count()
    sums = query.with_entities(
        func.coalesce(func.sum(PayrollRun.total_gross), 0),
        func.coalesce(func.sum(PayrollRun.total_tax), 0),
        func.coalesce(func.sum(PayrollRun.total_net), 0),
    ).one()
    rows = query.order_by(PayrollRun.period_start.desc()).limit(
        clamp_limit(limit)).all()

    return ToolResult(
        tool="search_payroll",
        total_count=total,
        items=[{
            "id": r.id,
            "period_start": r.period_start.isoformat() if r.period_start else None,
            "period_end": r.period_end.isoformat() if r.period_end else None,
            "status": r.status.value if r.status else None,
            "total_gross": money(r.total_gross),
            "total_tax": money(r.total_tax),
            "total_net": money(r.total_net),
        } for r in rows],
        aggregates={
            "total_gross": money(sums[0]),
            "total_tax": money(sums[1]),
            "total_net": money(sums[2]),
        },
        applied_filters={
            "status": status,
            "date_from": date_from.isoformat() if date_from else None,
            "date_to": date_to.isoformat() if date_to else None,
        },
        notes=["Run totals. Ask about a named person for their payslips."],
    )
