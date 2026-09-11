"""Permits, compliance schedules, PM generation and traced room areas.

The four things that turn the facilities module from a register into an
operating system, and the specific ways each fails quietly if it regresses:

  * the ICRA matrix — under-classifying is invisible until an infection cluster
  * the permit gate — a permit system that cannot refuse anything is a filing
    cabinet, and nothing else in the suite would notice it had stopped refusing
  * idempotent generation — duplicate compliance tasks and duplicate PMs both
    turn a worklist into noise within a fortnight
  * polygon area — a silently wrong area propagates into volume and then into
    an air-change calculation that reads as compliant

    DATABASE_URL=sqlite:// python backend/tests/test_permits_compliance_pm.py
"""
from __future__ import annotations

import os
import pathlib
import sys
from datetime import date, datetime, timedelta

os.environ.setdefault("DATABASE_URL", "sqlite://")
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))

from fastapi import HTTPException  # noqa: E402
from sqlalchemy import create_engine  # noqa: E402
from sqlalchemy.orm import sessionmaker  # noqa: E402

import app.models  # noqa: E402,F401
from app.db.base import Base  # noqa: E402
from app.models.compliance import (  # noqa: E402
    ComplianceFrequency, ComplianceProgram, ComplianceResult, ComplianceTask,
    ComplianceTaskStatus,
)
from app.models.equipment import Equipment  # noqa: E402
from app.models.facility import Facility  # noqa: E402
from app.models.location import Location, LocationType, SpaceUse  # noqa: E402
from app.models.maintenance_schedule import (  # noqa: E402
    MaintenanceSchedule, ScheduleBasis, ScheduleStatus,
)
from app.models.modality import Modality, ModalityCategory  # noqa: E402
from app.models.permit import (  # noqa: E402
    ApprovalRole, ApprovalStatus, ConstructionActivityType, ICRAClass, PatientRiskGroup,
    PermitStatus, PermitType, WorkPermit,
)
from app.models.reading import Reading, ReadingPoint  # noqa: E402
from app.models.service_request import Priority, ServiceRequest, WorkOrderType  # noqa: E402
from app.utils.clock import utc_today  # noqa: E402
from app.services import (  # noqa: E402
    compliance as compliance_service, geometry, location_tree, permit as permit_service,
    pm as pm_service,
)


def _session():
    engine = create_engine("sqlite://")
    Base.metadata.create_all(engine)
    return sessionmaker(bind=engine, autoflush=False)()


def _facility(db, name="General Hospital"):
    f = Facility(name=name, phone="1", email="a@b.c", address="1", city="Austin",
                 state="TX", zip_code="78701", country="United States")
    db.add(f)
    db.flush()
    return f


def _place(db, facility, kind, code, parent=None, use=None):
    row = Location(
        facility_id=facility.id, parent_id=parent.id if parent else None,
        location_type=kind, code=code, space_use=use,
        criticality=location_tree.default_criticality(use),
    )
    db.add(row)
    db.flush()
    location_tree.assign_path(db, row, parent)
    db.flush()
    return row


def _work_order(db, facility, **kwargs):
    wo = ServiceRequest(
        request_number=kwargs.pop("number", "SR-1"),
        facility_id=facility.id, requester_id=1,
        problem_description="work", priority=Priority.MEDIUM, **kwargs,
    )
    db.add(wo)
    db.flush()
    return wo


# ── ICRA ─────────────────────────────────────────────────────────────────────

def test_icra_matrix_matches_the_published_grid():
    A, B, C, D = (t.value for t in ConstructionActivityType)
    g1, g2, g3, g4 = (g.value for g in PatientRiskGroup)

    # Type A inspection work is Class I everywhere except the highest risk
    # group, where even opening a ceiling tile needs containment.
    assert permit_service.icra_class(A, g1) == ICRAClass.CLASS_I.value
    assert permit_service.icra_class(A, g4) == ICRAClass.CLASS_II.value

    # Demolition next to an ICU is the worst cell in the grid.
    assert permit_service.icra_class(D, g4) == ICRAClass.CLASS_IV.value
    assert permit_service.icra_class(D, g1) == ICRAClass.CLASS_III.value

    # Small-scale work in a Group 4 space jumps straight to Class IV — this is
    # the cell people get wrong by intuition.
    assert permit_service.icra_class(B, g4) == ICRAClass.CLASS_IV.value
    assert permit_service.icra_class(B, g2) == ICRAClass.CLASS_II.value

    assert permit_service.icra_class(C, g3) == ICRAClass.CLASS_IV.value
    print("ok  ICRA matrix matches the published grid")


def test_risk_group_is_inferred_from_the_space():
    db = _session()
    f = _facility(db)
    building = _place(db, f, LocationType.BUILDING.value, "MAIN")

    theatre = _place(db, f, LocationType.ROOM.value, "OR-3", building, SpaceUse.OPERATING_ROOM.value)
    office = _place(db, f, LocationType.ROOM.value, "A-1", building, SpaceUse.OFFICE.value)
    ed = _place(db, f, LocationType.ROOM.value, "ED-2", building, SpaceUse.EMERGENCY.value)

    assert permit_service.risk_group_for_location(theatre) == PatientRiskGroup.GROUP_4.value
    assert permit_service.risk_group_for_location(office) == PatientRiskGroup.GROUP_1.value
    assert permit_service.risk_group_for_location(ed) == PatientRiskGroup.GROUP_3.value

    # An unclassified space defaults to Group 2, not Group 1: an unknown room in
    # a hospital is more likely clinical than not, and under-classifying is the
    # failure that matters.
    blank = _place(db, f, LocationType.ROOM.value, "X-1", building)
    assert permit_service.risk_group_for_location(blank) == PatientRiskGroup.GROUP_2.value
    assert permit_service.risk_group_for_location(None) == PatientRiskGroup.GROUP_2.value
    print("ok  risk group is inferred from the space")


def test_class_iv_pulls_in_more_signatures_than_class_i():
    low = WorkPermit(permit_type=PermitType.ICRA.value, icra_class=ICRAClass.CLASS_I.value)
    high = WorkPermit(permit_type=PermitType.ICRA.value, icra_class=ICRAClass.CLASS_IV.value)

    low_roles = permit_service.required_approvals(low)
    high_roles = permit_service.required_approvals(high)

    # Class I is a courtesy notification; Class IV breaches containment and the
    # clinical side has to agree. Routing everything to everyone is how
    # approvals become rubber stamps.
    assert ApprovalRole.INFECTION_PREVENTION.value not in low_roles
    assert ApprovalRole.INFECTION_PREVENTION.value in high_roles
    assert ApprovalRole.NURSE_MANAGER.value in high_roles
    assert len(high_roles) > len(low_roles)
    print("ok  Class IV pulls in more signatures than Class I")


def test_life_safety_impairment_always_pulls_in_safety():
    # Whatever the permit is nominally for, impairing a sprinkler is an interim
    # life safety measures problem.
    permit = WorkPermit(permit_type=PermitType.LOTO.value, impairs_sprinkler=True)
    roles = permit_service.required_approvals(permit)
    assert ApprovalRole.SAFETY_OFFICER.value in roles

    measures = permit_service.ilsm_measures(permit)
    assert any("fire watch" in m.lower() for m in measures)
    assert any("hot work" in m.lower() for m in measures)
    print("ok  life safety impairment always pulls in Safety")


# ── The gate ─────────────────────────────────────────────────────────────────

def test_work_is_blocked_until_every_signature_is_in():
    db = _session()
    f = _facility(db)
    building = _place(db, f, LocationType.BUILDING.value, "MAIN")
    theatre = _place(db, f, LocationType.ROOM.value, "OR-3", building, SpaceUse.OPERATING_ROOM.value)
    wo = _work_order(db, f, location_id=theatre.id)

    permit = WorkPermit(
        permit_number="ICRA-00001", facility_id=f.id, work_order_id=wo.id,
        location_id=theatre.id, permit_type=PermitType.ICRA.value,
        title="Ceiling access above OR-3",
        construction_activity_type=ConstructionActivityType.TYPE_C.value,
    )
    permit_service.assess(db, permit, theatre)
    db.add(permit)
    db.flush()

    assert permit.icra_class == ICRAClass.CLASS_IV.value
    assert permit.required_precautions, "Class IV must carry precautions"

    # A draft permit blocks.
    try:
        permit_service.assert_work_permitted(db, wo)
    except HTTPException as exc:
        assert exc.status_code == 409
        assert "not been submitted" in str(exc.detail)
    else:
        raise AssertionError("a draft permit should block work")

    permit_service.submit(db, permit)
    db.flush()
    roles = [a.approver_role for a in permit.approvals]
    assert ApprovalRole.INFECTION_PREVENTION.value in roles

    # Pending blocks, and says who it is waiting on.
    try:
        permit_service.assert_work_permitted(db, wo)
    except HTTPException as exc:
        assert "awaiting" in str(exc.detail)
    else:
        raise AssertionError("a pending permit should block work")

    # Sign all but one — still blocked.
    for role in roles[:-1]:
        permit_service.record_decision(
            db, permit, role=role, approved=True, user_id=1, user_name="A",
        )
    db.flush()
    assert permit.status == PermitStatus.PENDING_APPROVAL.value
    try:
        permit_service.assert_work_permitted(db, wo)
    except HTTPException:
        pass
    else:
        raise AssertionError("a partly signed permit should still block work")

    permit_service.record_decision(
        db, permit, role=roles[-1], approved=True, user_id=1, user_name="A",
    )
    db.flush()
    assert permit.status == PermitStatus.APPROVED.value

    # Fully signed and inside its window — work may proceed.
    permit.valid_from = datetime.utcnow() - timedelta(hours=1)
    permit.valid_to = datetime.utcnow() + timedelta(hours=8)
    db.flush()
    permit_service.assert_work_permitted(db, wo)
    print("ok  work is blocked until every signature is in")


def test_an_approved_permit_outside_its_window_does_not_authorise():
    db = _session()
    f = _facility(db)
    wo = _work_order(db, f)

    permit = WorkPermit(
        permit_number="HW-00001", facility_id=f.id, work_order_id=wo.id,
        permit_type=PermitType.HOT_WORK.value, title="Weld a bracket",
        status=PermitStatus.APPROVED.value,
        valid_from=datetime.utcnow() - timedelta(days=3),
        valid_to=datetime.utcnow() - timedelta(days=2),
    )
    db.add(permit)
    db.flush()

    # An approval given for last Tuesday must not still authorise work today.
    assert permit.is_authorising is False
    try:
        permit_service.assert_work_permitted(db, wo)
    except HTTPException as exc:
        assert "not valid at this time" in str(exc.detail)
    else:
        raise AssertionError("an out-of-window permit should block work")

    expired = permit_service.expire_stale(db, facility_ids=[f.id])
    db.flush()
    assert expired == 1
    assert permit.status == PermitStatus.EXPIRED.value
    print("ok  an approved permit outside its window does not authorise")


def test_one_rejection_stops_the_permit():
    db = _session()
    f = _facility(db)
    wo = _work_order(db, f)
    permit = WorkPermit(
        permit_number="CS-00001", facility_id=f.id, work_order_id=wo.id,
        permit_type=PermitType.CONFINED_SPACE.value, title="Tank entry",
    )
    db.add(permit)
    db.flush()
    permit_service.submit(db, permit)
    db.flush()

    permit_service.record_decision(
        db, permit, role=ApprovalRole.SAFETY_OFFICER.value, approved=False,
        user_id=1, user_name="Safety", reason="Atmospheric testing not evidenced",
    )
    db.flush()

    # Collecting the remaining signatures after a rejection would be theatre.
    assert permit.status == PermitStatus.REJECTED.value
    try:
        permit_service.assert_work_permitted(db, wo)
    except HTTPException as exc:
        assert "rejected" in str(exc.detail)
    else:
        raise AssertionError("a rejected permit should block work")
    print("ok  one rejection stops the permit")


def test_a_permit_cannot_be_closed_with_controls_still_up():
    db = _session()
    f = _facility(db)
    permit = WorkPermit(
        permit_number="LOTO-00001", facility_id=f.id,
        permit_type=PermitType.LOTO.value, title="Isolate IPP-3",
        status=PermitStatus.ACTIVE.value,
    )
    db.add(permit)
    db.flush()

    try:
        permit_service.close(db, permit, user_id=1, controls_removed=False)
    except HTTPException as exc:
        assert exc.status_code == 400
        assert "locks" in str(exc.detail)
    else:
        raise AssertionError("closing with controls up should be refused")

    permit_service.close(db, permit, user_id=1, controls_removed=True, notes="Locks removed")
    assert permit.status == PermitStatus.CLOSED.value
    print("ok  a permit cannot be closed with controls still up")


def test_a_work_order_with_no_permits_is_not_blocked():
    db = _session()
    f = _facility(db)
    wo = _work_order(db, f)
    # The system enforces the permits somebody raised; it does not invent them.
    permit_service.assert_work_permitted(db, wo)
    print("ok  a work order with no permits is not blocked")


# ── Compliance ───────────────────────────────────────────────────────────────

def _seed(db, facility):
    from app.models.discipline import Discipline
    for code, name in (("electrical", "Electrical"), ("mechanical", "Mechanical"),
                       ("plumbing", "Plumbing"), ("fire_life_safety", "Fire"),
                       ("vertical_transport", "Lifts"), ("medical_gas", "Med Gas")):
        db.add(Discipline(code=code, name=name))
    db.flush()
    created, skipped = compliance_service.seed_programs(db, facility_id=facility.id)
    db.flush()
    return created, skipped


def test_seeding_programs_is_idempotent():
    db = _session()
    f = _facility(db)

    created, skipped = _seed(db, f)
    assert created == len(compliance_service.SEED_PROGRAMS)
    assert skipped == 0

    created_again, skipped_again = compliance_service.seed_programs(db, facility_id=f.id)
    db.flush()
    # Re-running must add nothing, so extending the list later back-fills
    # without disturbing anything already edited.
    assert created_again == 0
    assert skipped_again == len(compliance_service.SEED_PROGRAMS)
    print("ok  seeding programs is idempotent")


def test_program_scope_resolves_most_specific_first():
    db = _session()
    f = _facility(db)
    building = _place(db, f, LocationType.BUILDING.value, "MAIN")
    _place(db, f, LocationType.ROOM.value, "OR-1", building, SpaceUse.OPERATING_ROOM.value)
    _place(db, f, LocationType.ROOM.value, "OR-2", building, SpaceUse.OPERATING_ROOM.value)
    _place(db, f, LocationType.ROOM.value, "A-1", building, SpaceUse.OFFICE.value)

    by_use = ComplianceProgram(
        facility_id=f.id, code="OR_PRESS", name="OR pressure",
        authority="ashrae", frequency=ComplianceFrequency.MONTHLY.value,
        applies_to_space_uses=[SpaceUse.OPERATING_ROOM.value],
    )
    db.add(by_use)
    db.flush()

    subjects = compliance_service.subjects_for(db, by_use)
    assert len(subjects) == 2, subjects
    assert all(equipment_id is None for equipment_id, _ in subjects)

    # A program matching nothing produces no tasks rather than one unattached
    # task, because an obligation against nothing cannot be discharged.
    orphan = ComplianceProgram(
        facility_id=f.id, code="NOTHING", name="Applies to nothing",
        authority="internal", frequency=ComplianceFrequency.ANNUAL.value,
    )
    db.add(orphan)
    db.flush()
    assert compliance_service.subjects_for(db, orphan) == []
    print("ok  program scope resolves most specific first")


def test_task_generation_is_idempotent():
    db = _session()
    f = _facility(db)
    building = _place(db, f, LocationType.BUILDING.value, "MAIN")
    _place(db, f, LocationType.ROOM.value, "OR-1", building, SpaceUse.OPERATING_ROOM.value)

    program = ComplianceProgram(
        facility_id=f.id, code="OR_PRESS", name="OR pressure",
        authority="ashrae", frequency=ComplianceFrequency.MONTHLY.value,
        applies_to_space_uses=[SpaceUse.OPERATING_ROOM.value],
    )
    db.add(program)
    db.flush()

    first = compliance_service.generate_tasks(db, facility_ids=[f.id])
    db.flush()
    assert first["created"] == 1

    second = compliance_service.generate_tasks(db, facility_ids=[f.id])
    db.flush()
    # The whole discipline: a second run while the first is still open must
    # create nothing, or the overdue list fills with fiction.
    assert second["created"] == 0
    assert second["skipped_existing"] == 1
    assert db.query(ComplianceTask).count() == 1
    print("ok  task generation is idempotent")


def test_a_certificate_program_cannot_be_ticked_off():
    db = _session()
    f = _facility(db)
    program = ComplianceProgram(
        facility_id=f.id, code="ELEV_STATE", name="Elevator state inspection",
        authority="state", frequency=ComplianceFrequency.ANNUAL.value,
        requires_certificate=True, requires_licensed_provider=True,
    )
    db.add(program)
    db.flush()
    task = ComplianceTask(
        facility_id=f.id, program_id=program.id, due_date=utc_today(),
    )
    db.add(task)
    db.flush()

    # "Pass" with no certificate is exactly the gap a surveyor finds.
    try:
        compliance_service.complete(db, task, result=ComplianceResult.PASS.value, user_id=1)
    except HTTPException as exc:
        assert "certificate number" in str(exc.detail)
    else:
        raise AssertionError("a certificate program should demand a certificate")

    # A certificate without the inspector's licence is refused too, because the
    # question asked is who signed and whether they were licensed that day.
    try:
        compliance_service.complete(
            db, task, result=ComplianceResult.PASS.value, user_id=1,
            certificate={"certificate_number": "TX-99"},
        )
    except HTTPException as exc:
        assert "licence" in str(exc.detail)
    else:
        raise AssertionError("a licensed-provider program should demand a licence")

    compliance_service.complete(
        db, task, result=ComplianceResult.PASS.value, user_id=1,
        certificate={
            "certificate_number": "TX-99",
            "inspector_license": "EL-4471",
            "certificate_expires_on": utc_today() + timedelta(days=365),
        },
    )
    db.flush()
    assert task.status == ComplianceTaskStatus.COMPLETED.value
    assert task.certificate_number == "TX-99"

    # A failure is allowed through without a certificate — a failed inspection
    # does not produce one, and demanding it would block recording the failure.
    task2 = ComplianceTask(facility_id=f.id, program_id=program.id, due_date=utc_today())
    db.add(task2)
    db.flush()
    compliance_service.complete(
        db, task2, result=ComplianceResult.FAIL.value, user_id=1, findings="Governor overdue",
    )
    assert task2.status == ComplianceTaskStatus.COMPLETED.value
    print("ok  a certificate program cannot be ticked off")


def test_grace_distinguishes_late_from_unrecoverable():
    db = _session()
    f = _facility(db)
    program = ComplianceProgram(
        facility_id=f.id, code="GEN_MONTHLY", name="Generator monthly",
        authority="nfpa", frequency=ComplianceFrequency.MONTHLY.value, grace_days=3,
    )
    db.add(program)
    db.flush()

    late = ComplianceTask(
        facility_id=f.id, program_id=program.id,
        due_date=utc_today() - timedelta(days=2), grace_days=3,
    )
    gone = ComplianceTask(
        facility_id=f.id, program_id=program.id,
        due_date=utc_today() - timedelta(days=10), grace_days=3,
    )
    db.add_all([late, gone])
    db.flush()

    # Both overdue; only one is a hole in the record that cannot be filled.
    assert late.is_overdue and gone.is_overdue
    assert late.is_past_grace is False
    assert gone.is_past_grace is True

    summary = compliance_service.summary(db, facility_ids=[f.id])
    assert summary["overdue"] == 2
    assert summary["past_grace"] == 1
    print("ok  grace distinguishes late from unrecoverable")


# ── PM generation ────────────────────────────────────────────────────────────

def _equipment(db, facility):
    modality = Modality(name="Gen", category=ModalityCategory.IMAGING)
    db.add(modality)
    db.flush()
    e = Equipment(asset_tag="GEN-1", make="A", model="B", serial_number="S1",
                  modality_id=modality.id, facility_id=facility.id)
    db.add(e)
    db.flush()
    return e


def test_pm_generation_is_idempotent():
    db = _session()
    f = _facility(db)
    equipment = _equipment(db, f)

    schedule = MaintenanceSchedule(
        facility_id=f.id, equipment_id=equipment.id, name="Monthly filter change",
        basis=ScheduleBasis.CALENDAR.value, interval_days=30, lead_time_days=7,
        next_due_date=utc_today(),
    )
    db.add(schedule)
    db.flush()

    first = pm_service.run(db, facility_ids=[f.id], requester_id=1)
    db.flush()
    assert first["generated"] == 1

    # A schedule with work already open generates nothing. Without this a
    # nightly sweep invents a PM backlog that is pure fiction.
    second = pm_service.run(db, facility_ids=[f.id], requester_id=1)
    db.flush()
    assert second["generated"] == 0
    assert db.query(ServiceRequest).count() == 1

    work_order = db.query(ServiceRequest).first()
    assert work_order.work_order_type == WorkOrderType.PREVENTIVE.value
    # Planned in-house work is not dragged through the quotation flow.
    assert work_order.is_billable is False
    print("ok  PM generation is idempotent")


def test_completing_a_pm_advances_its_schedule():
    db = _session()
    f = _facility(db)
    equipment = _equipment(db, f)
    schedule = MaintenanceSchedule(
        facility_id=f.id, equipment_id=equipment.id, name="Quarterly belt check",
        basis=ScheduleBasis.CALENDAR.value, interval_days=90, next_due_date=utc_today(),
    )
    db.add(schedule)
    db.flush()

    pm_service.run(db, facility_ids=[f.id], requester_id=1)
    db.flush()
    work_order = db.query(ServiceRequest).first()
    assert schedule.open_work_order_id == work_order.id

    work_order.completed_at = datetime.utcnow()
    advanced = pm_service.close_out_for_work_order(db, work_order)
    db.flush()

    assert advanced == 1
    assert schedule.open_work_order_id is None
    # Measured from completion, not from the previous due date: for plant, when
    # the belt was actually changed is the date that matches reality.
    assert schedule.next_due_date == utc_today() + timedelta(days=90)

    # And the next sweep can generate again.
    again = pm_service.run(db, facility_ids=[f.id], requester_id=1)
    db.flush()
    assert again["generated"] == 0, "not due for another 90 days"
    print("ok  completing a PM advances its schedule")


def test_runtime_based_schedule_fires_on_hours_not_dates():
    db = _session()
    f = _facility(db)
    equipment = _equipment(db, f)

    point = ReadingPoint(
        facility_id=f.id, equipment_id=equipment.id, code="GEN_HOURS",
        name="Generator runtime", unit="hours",
    )
    db.add(point)
    db.flush()

    schedule = MaintenanceSchedule(
        facility_id=f.id, equipment_id=equipment.id, name="200-hour service",
        basis=ScheduleBasis.RUNTIME_HOURS.value,
        interval_runtime_hours=200, runtime_point_id=point.id,
        runtime_at_last_service=0,
        # Deliberately far away: a generator that has run hard needs its service
        # early, and a calendar-only schedule gets that wrong.
        next_due_date=utc_today() + timedelta(days=900),
    )
    db.add(schedule)
    db.flush()

    db.add(Reading(point_id=point.id, facility_id=f.id, value=150, unit="hours",
                   in_spec=True, recorded_at=datetime.utcnow()))
    db.flush()
    assert pm_service.is_due(db, schedule) is False

    db.add(Reading(point_id=point.id, facility_id=f.id, value=205, unit="hours",
                   in_spec=True, recorded_at=datetime.utcnow() + timedelta(seconds=1)))
    db.flush()
    assert pm_service.is_due(db, schedule) is True

    generated = pm_service.run(db, facility_ids=[f.id], requester_id=1)
    db.flush()
    assert generated["generated"] == 1
    print("ok  runtime-based schedule fires on hours, not dates")


def test_a_paused_schedule_generates_nothing():
    db = _session()
    f = _facility(db)
    equipment = _equipment(db, f)
    schedule = MaintenanceSchedule(
        facility_id=f.id, equipment_id=equipment.id, name="Paused",
        basis=ScheduleBasis.CALENDAR.value, interval_days=30,
        next_due_date=utc_today() - timedelta(days=60),
        status=ScheduleStatus.PAUSED.value,
    )
    db.add(schedule)
    db.flush()

    assert pm_service.is_due(db, schedule) is False
    assert pm_service.run(db, facility_ids=[f.id], requester_id=1)["generated"] == 0
    print("ok  a paused schedule generates nothing")


# ── Traced areas ─────────────────────────────────────────────────────────────

def test_polygon_area_is_computed_from_the_calibrated_scale():
    # A 200 x 100 px rectangle on a plan where one pixel is half a foot is
    # 100 ft x 50 ft = 5,000 sq ft.
    square = [{"x": 0.0, "y": 0.0}, {"x": 0.2, "y": 0.0},
              {"x": 0.2, "y": 0.1}, {"x": 0.0, "y": 0.1}]

    area = geometry.area_sqft(square, scale_ft_per_px=0.5, width_px=1000, height_px=1000)
    assert area == 5000.0, area

    perimeter = geometry.perimeter_ft(square, scale_ft_per_px=0.5, width_px=1000, height_px=1000)
    assert perimeter == 300.0, perimeter

    # Winding direction must not matter — one operator traces clockwise, another
    # anticlockwise, and they should get the same room.
    reversed_area = geometry.area_sqft(
        list(reversed(square)), scale_ft_per_px=0.5, width_px=1000, height_px=1000,
    )
    assert reversed_area == area
    print("ok  polygon area is computed from the calibrated scale")


def test_area_is_refused_rather_than_guessed_without_calibration():
    square = [{"x": 0.0, "y": 0.0}, {"x": 0.2, "y": 0.0},
              {"x": 0.2, "y": 0.1}, {"x": 0.0, "y": 0.1}]

    # A silently wrong area would propagate into volume and then into an
    # air-change calculation that reads as compliant.
    assert geometry.area_sqft(square, scale_ft_per_px=None, width_px=1000, height_px=1000) is None
    assert geometry.area_sqft(square, scale_ft_per_px=0.5, width_px=None, height_px=1000) is None

    # Fewer than three vertices is not a room.
    assert geometry.area_sqft(
        [{"x": 0, "y": 0}, {"x": 1, "y": 1}], scale_ft_per_px=0.5, width_px=100, height_px=100,
    ) is None
    print("ok  area is refused rather than guessed without calibration")


def test_centroid_is_area_weighted():
    square = [{"x": 0.0, "y": 0.0}, {"x": 0.4, "y": 0.0},
              {"x": 0.4, "y": 0.4}, {"x": 0.0, "y": 0.4}]
    cx, cy = geometry.centroid(square)
    assert abs(cx - 0.2) < 1e-9 and abs(cy - 0.2) < 1e-9

    # Extra vertices along one wall must not drag the marker towards it, which
    # is what a plain mean of the vertices would do.
    dense = [
        {"x": 0.0, "y": 0.0}, {"x": 0.1, "y": 0.0}, {"x": 0.2, "y": 0.0},
        {"x": 0.3, "y": 0.0}, {"x": 0.4, "y": 0.0},
        {"x": 0.4, "y": 0.4}, {"x": 0.0, "y": 0.4},
    ]
    dx, dy = geometry.centroid(dense)
    assert abs(dx - 0.2) < 1e-9, dx
    assert abs(dy - 0.2) < 1e-9, dy
    print("ok  centroid is area-weighted")


# ── Self-intersecting outlines ───────────────────────────────────────────────

def test_a_crossed_outline_is_detected():
    square = [{"x": 0, "y": 0}, {"x": 1, "y": 0}, {"x": 1, "y": 1}, {"x": 0, "y": 1}]
    bowtie = [{"x": 0, "y": 0}, {"x": 1, "y": 1}, {"x": 1, "y": 0}, {"x": 0, "y": 1}]
    triangle = [{"x": 0, "y": 0}, {"x": 1, "y": 0}, {"x": 0.5, "y": 1}]
    l_shape = [
        {"x": 0, "y": 0}, {"x": 2, "y": 0}, {"x": 2, "y": 1},
        {"x": 1, "y": 1}, {"x": 1, "y": 2}, {"x": 0, "y": 2},
    ]

    assert geometry.is_self_intersecting(square) is False
    assert geometry.is_self_intersecting(triangle) is False
    # Concave is fine — plenty of real rooms are L-shaped.
    assert geometry.is_self_intersecting(l_shape) is False
    assert geometry.is_self_intersecting(bowtie) is True

    # The reason it matters: shoelace on a crossed outline returns the
    # difference of the two lobes, not their sum. A plausible number that is
    # simply wrong, which would propagate into volume and then into an
    # air-change calculation that reads as compliant.
    crossed_area = geometry.area_sqft(
        bowtie, scale_ft_per_px=1.0, width_px=100, height_px=100,
    )
    honest_area = geometry.area_sqft(
        square, scale_ft_per_px=1.0, width_px=100, height_px=100,
    )
    assert crossed_area is not None and honest_area is not None
    assert crossed_area < honest_area, (crossed_area, honest_area)
    print("ok  a crossed outline is detected")


# ── The scheduler ────────────────────────────────────────────────────────────

def test_scheduler_required_tables_cover_what_it_touches():
    """A worker started against an unmigrated database must fail loudly on the
    first cycle rather than log an exception every interval forever."""
    from app.jobs.facilities_scheduler import REQUIRED_TABLES

    assert {"compliance_programs", "compliance_tasks", "maintenance_schedules",
            "work_permits", "locations"} <= REQUIRED_TABLES

    # And every named table must actually exist in the models, or the guard
    # would reject a correctly-migrated database.
    for table in REQUIRED_TABLES:
        assert table in Base.metadata.tables, table
    print("ok  scheduler required tables cover what it touches")


def test_evidence_upload_rejects_the_wrong_kind_of_file():
    from app.utils.evidence_upload import ALLOWED_EVIDENCE_TYPES, MAX_EVIDENCE_BYTES

    # Scans and PDFs, which is what a certificate or a signed permit is.
    assert "application/pdf" in ALLOWED_EVIDENCE_TYPES
    assert "image/jpeg" in ALLOWED_EVIDENCE_TYPES
    # Not a video, and not an executable.
    assert "video/mp4" not in ALLOWED_EVIDENCE_TYPES
    assert "application/x-msdownload" not in ALLOWED_EVIDENCE_TYPES
    # Small enough that a mis-selected file is refused rather than quietly
    # filling the disk, generous enough for any real scan.
    assert MAX_EVIDENCE_BYTES == 10 * 1024 * 1024
    print("ok  evidence upload rejects the wrong kind of file")


def test_permit_carries_somewhere_to_put_the_signed_scan():
    """A permit is a document people physically sign. The record is the index;
    the scan is the evidence a surveyor asks to see."""
    columns = {c.name for c in Base.metadata.tables["work_permits"].columns}
    assert {"document_filename", "document_path"} <= columns

    certificate_columns = {c.name for c in Base.metadata.tables["compliance_tasks"].columns}
    assert {"certificate_filename", "certificate_path"} <= certificate_columns
    print("ok  permit carries somewhere to put the signed scan")


if __name__ == "__main__":
    tests = [v for k, v in sorted(globals().items()) if k.startswith("test_")]
    for test in tests:
        test()
    print(f"\n{len(tests)} checks passed")
