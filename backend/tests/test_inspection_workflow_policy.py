from datetime import datetime
from decimal import Decimal
from types import SimpleNamespace

import pytest
from fastapi import HTTPException
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker

import app.models  # noqa: F401 - register all SQLAlchemy mappings for the integration test
from app.api.v1.endpoints import inspections as inspections_endpoint
from app.api.v1.endpoints.inspections import (
    InspectionDetailsUpdate,
    InspectionReopen,
    _batch_invoice_line_items,
    _batch_invoice_notes,
    _create_inspection_batch_invoice,
    _require_batch_invoice_allows_asset_changes,
    _require_upcoming_inspection,
    _stored_batch_invoice_items,
    _sync_batch_status,
    inspection_summary,
    list_inspections,
    list_inspection_quotations,
)
from app.db.base import Base
from app.models.facility import Facility
from app.models.inspection import Inspection, InspectionBatch, InspectionResult
from app.models.inspection_form import InspectionForm
from app.models.invoice import Invoice, InvoiceTransaction, InvoiceType
from app.models.invoice import InvoiceStatus
from app.models.inspection import InspectionStatus
from app.models.user import User, UserRole, UserType


def _inspection(status: InspectionStatus):
    return SimpleNamespace(status=status)


def _batch(*statuses: InspectionStatus):
    return SimpleNamespace(
        inspections=[_inspection(status) for status in statuses],
        status=InspectionStatus.UPCOMING,
        started_at=None,
        completed_at=None,
        updated_at=None,
    )


def test_closed_is_a_distinct_non_completed_status():
    assert InspectionStatus.CLOSED.value == "closed"
    assert InspectionStatus.CLOSED != InspectionStatus.COMPLETED


def test_upcoming_inspection_can_be_edited():
    _require_upcoming_inspection(_inspection(InspectionStatus.UPCOMING), "edited")


def test_started_inspection_cannot_be_rescheduled():
    with pytest.raises(HTTPException) as error:
        _require_upcoming_inspection(_inspection(InspectionStatus.IN_PROGRESS), "rescheduled")

    assert error.value.status_code == 409


def test_backdated_schedule_is_valid_update_input():
    historical_date = datetime(2020, 1, 15, 9, 30)

    payload = InspectionDetailsUpdate(scheduled_date=historical_date)

    assert payload.scheduled_date == historical_date


def test_closed_inspection_can_be_reopened_with_a_backdated_schedule():
    historical_date = datetime(2019, 6, 10, 8, 0)

    payload = InspectionReopen(scheduled_date=historical_date)

    assert payload.scheduled_date == historical_date


def test_batch_is_completed_only_when_every_asset_is_completed():
    batch = _batch(InspectionStatus.COMPLETED, InspectionStatus.COMPLETED)

    _sync_batch_status(batch)

    assert batch.status == InspectionStatus.COMPLETED
    assert batch.completed_at is not None


def test_closed_asset_prevents_batch_from_becoming_completed_or_billable():
    batch = _batch(InspectionStatus.COMPLETED, InspectionStatus.CLOSED)

    _sync_batch_status(batch)

    assert batch.status == InspectionStatus.CLOSED
    assert batch.completed_at is None


def test_reopened_asset_returns_its_batch_to_upcoming():
    batch = _batch(InspectionStatus.COMPLETED, InspectionStatus.CLOSED)
    batch.inspections[1].status = InspectionStatus.UPCOMING

    _sync_batch_status(batch)

    assert batch.status == InspectionStatus.UPCOMING
    assert batch.completed_at is None


def test_approved_batch_invoice_blocks_asset_additions():
    invoice = SimpleNamespace(
        billing_approval_status="approved",
        amount_paid=Decimal("0"),
        status=InvoiceStatus.PENDING,
    )

    with pytest.raises(HTTPException) as error:
        _require_batch_invoice_allows_asset_changes(invoice)

    assert error.value.status_code == 409


def test_unapproved_batch_invoice_allows_asset_additions():
    invoice = SimpleNamespace(
        billing_approval_status="pending",
        amount_paid=Decimal("0"),
        status=InvoiceStatus.PENDING,
    )

    _require_batch_invoice_allows_asset_changes(invoice)


def test_batch_invoice_recalculation_preserves_the_same_invoice_record(monkeypatch):
    transactions = []
    facility = SimpleNamespace(
        name="Facility A",
        billing_name=None,
        email="billing@example.com",
        billing_email=None,
        phone=None,
        billing_street=None,
        billing_suite=None,
        billing_city=None,
        billing_state=None,
        billing_zip_code=None,
        address=None,
        suite=None,
        city=None,
        state=None,
        zip_code=None,
    )
    batch = SimpleNamespace(
        id=10,
        batch_number="INSP-BATCH-10",
        facility=facility,
        inspections=[
            SimpleNamespace(status=InspectionStatus.COMPLETED, form_data={"billing": {}}),
            SimpleNamespace(status=InspectionStatus.COMPLETED, form_data={"billing": {}}),
        ],
    )
    invoice = SimpleNamespace(
        id=77,
        invoice_number="INV-INSP-000077",
        billing_approval_status="pending",
        amount_paid=Decimal("0"),
        status=InvoiceStatus.PENDING,
        total_amount=Decimal("100"),
        notes="Inspection batch invoice for INSP-BATCH-10. Includes 1 completed asset inspection(s).",
        updated_at=None,
    )
    line_items = [
        {"subtotal": 100, "tax_amount": 0, "discount_amount": 0},
        {"subtotal": 50, "tax_amount": 0, "discount_amount": 0},
    ]
    monkeypatch.setattr(inspections_endpoint, "_lock_active_batch_invoice", lambda *_args: invoice)
    monkeypatch.setattr(inspections_endpoint, "_batch_invoice_line_items", lambda *_args: line_items)
    monkeypatch.setattr(
        inspections_endpoint,
        "add_invoice_transaction",
        lambda _db, _invoice, transaction_type, *_args, **_kwargs: transactions.append(transaction_type),
    )
    db = SimpleNamespace(flush=lambda: None)

    updated = _create_inspection_batch_invoice(
        db,
        batch,
        SimpleNamespace(id=1),
    )

    assert updated is invoice
    assert updated.id == 77
    assert updated.total_amount == Decimal("150")
    assert updated.balance_due == Decimal("150")
    assert transactions == ["invoice_recalculated"]


def test_batch_invoice_list_rows_skip_incomplete_reopened_assets(monkeypatch):
    completed = SimpleNamespace(
        id=1,
        inspection_number="INSP-001",
        status=InspectionStatus.COMPLETED,
        form_data={"billing": {}},
        inventory_part=None,
        equipment=None,
    )
    in_progress = SimpleNamespace(
        id=2,
        inspection_number="INSP-002",
        status=InspectionStatus.IN_PROGRESS,
        form_data=None,
        inventory_part=None,
        equipment=None,
    )
    batch = SimpleNamespace(inspections=[completed, in_progress])
    monkeypatch.setattr(inspections_endpoint, "_invoice_payload_from_completed_inspection", lambda *_args: object())
    monkeypatch.setattr(
        inspections_endpoint,
        "_inspection_invoice_amounts",
        lambda *_args: (
            Decimal("100"),
            Decimal("0"),
            Decimal("0"),
            Decimal("100"),
            "notes",
        ),
    )

    rows = _batch_invoice_line_items(batch, strict=False)

    assert len(rows) == 1
    assert rows[0]["inspection_number"] == "INSP-001"
    with pytest.raises(HTTPException):
        _batch_invoice_line_items(batch)


def test_batch_invoice_breakdown_is_persisted_in_invoice_metadata():
    line_items = [
        {
            "inspection_id": 1,
            "inspection_number": "INSP-001",
            "asset_name": "Asset A",
            "subtotal": 100,
            "tax_amount": 0,
            "discount_amount": 0,
            "total_amount": 100,
        }
    ]

    notes = _batch_invoice_notes(None, "Batch invoice", line_items)

    assert _stored_batch_invoice_items(notes) == line_items


def test_approved_batch_invoice_loads_through_the_billing_list_endpoint():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    db = sessionmaker(bind=engine)()
    try:
        facility = Facility(
            name="Facility A",
            phone="(214) 555-0100",
            email="billing@example.com",
            address="1 Main Street",
            city="Dallas",
            state="TX",
            zip_code="75001",
            country="United States",
        )
        approver = User(
            username="admin",
            email="admin@example.com",
            full_name="Admin User",
            hashed_password="test",
            user_type=UserType.EMPLOYEE,
            role=UserRole.SUPERADMIN,
        )
        form = InspectionForm(name="Test Form", schema={})
        db.add_all([facility, approver, form])
        db.flush()

        batch = InspectionBatch(
            batch_number="INSP-001",
            facility_id=facility.id,
            form_template_id=form.id,
            status=InspectionStatus.COMPLETED,
            scheduled_date=datetime.utcnow(),
            completed_at=datetime.utcnow(),
        )
        db.add(batch)
        db.flush()
        inspection = Inspection(
            inspection_number="INSP-001-001",
            batch_id=batch.id,
            facility_id=facility.id,
            form_template_id=form.id,
            status=InspectionStatus.COMPLETED,
            result=InspectionResult.PASS,
            scheduled_date=datetime.utcnow(),
            completed_at=datetime.utcnow(),
            form_data={"billing": {"inspection_charges": 100}},
        )
        db.add(inspection)
        db.flush()

        invoice = Invoice(
            invoice_number="INV-INSP-001",
            invoice_type=InvoiceType.INSPECTION,
            customer_name=facility.name,
            customer_email=facility.email,
            facility_id=facility.id,
            inspection_batch_id=batch.id,
            subtotal=Decimal("100"),
            tax_amount=Decimal("0"),
            discount_amount=Decimal("0"),
            total_amount=Decimal("100"),
            amount_paid=Decimal("0"),
            balance_due=Decimal("100"),
            status=InvoiceStatus.PENDING,
            issue_date=datetime.utcnow().date(),
            due_date=datetime.utcnow().date(),
            billing_approval_status="approved",
            approved_for_billing_by_id=approver.id,
            approved_for_billing_at=datetime.utcnow(),
            approved_total_amount=Decimal("100"),
        )
        db.add(invoice)
        db.flush()
        db.add(
            InvoiceTransaction(
                invoice_id=invoice.id,
                facility_id=facility.id,
                transaction_type="billing_approved",
                amount=Decimal("100"),
                created_by_id=approver.id,
            )
        )
        db.commit()

        response = list_inspection_quotations(
            db=db,
            invoice_id=None,
            search=None,
            status_filter="approved",
            balance_filter="outstanding",
            skip=0,
            limit=25,
            current_user=approver,
        )

        assert response["total"] == 1
        assert response["summary"] == {
            "outstanding": 100.0,
            "paid": 0.0,
            "total": 100.0,
            "count": 1,
        }
        assert response["items"][0]["billing_approval_status"] == "approved"
        assert response["items"][0]["approved_for_billing_by_name"] == "Admin User"
        assert response["items"][0]["transactions"][0]["transaction_type"] == "billing_approved"
        assert len(response["items"][0]["batch_items"]) == 1

        summary = inspection_summary(
            date_from=None,
            date_to=None,
            db=db,
            current_user=approver,
        )
        assert summary == {
            "upcoming": 0,
            "in_progress": 0,
            "completed": 1,
            "assets": 0,
            "quotations": 1,
        }
    finally:
        db.close()
        engine.dispose()


def test_inspection_list_query_count_stays_bounded_as_rows_grow():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    db = sessionmaker(bind=engine)()
    try:
        facility = Facility(
            name="Performance Facility",
            phone="(214) 555-0101",
            email="performance@example.com",
            address="2 Main Street",
            city="Dallas",
            state="TX",
            zip_code="75001",
            country="United States",
        )
        user = User(
            username="performance-admin",
            email="performance-admin@example.com",
            full_name="Performance Admin",
            hashed_password="test",
            user_type=UserType.EMPLOYEE,
            role=UserRole.SUPERADMIN,
        )
        db.add_all([facility, user])
        db.flush()

        for index in range(20):
            form = InspectionForm(name=f"Performance Form {index}", schema={"index": index})
            db.add(form)
            db.flush()
            db.add(
                Inspection(
                    inspection_number=f"PERF-{index:03d}",
                    facility_id=facility.id,
                    form_template_id=form.id,
                    status=InspectionStatus.UPCOMING,
                    result=InspectionResult.PENDING,
                    scheduled_date=datetime.utcnow(),
                )
            )
        db.commit()
        user_id = user.id
        db.expunge_all()
        current_user = db.query(User).filter(User.id == user_id).one()

        query_count = 0

        def count_query(*_args):
            nonlocal query_count
            query_count += 1

        event.listen(engine, "before_cursor_execute", count_query)
        response = list_inspections(
            db=db,
            status_filter=InspectionStatus.UPCOMING,
            facility_id=None,
            unbatched_only=False,
            search=None,
            date_from=None,
            date_to=None,
            skip=0,
            limit=20,
            current_user=current_user,
        )
        event.remove(engine, "before_cursor_execute", count_query)

        assert response["total"] == 20
        assert len(response["items"]) == 20
        assert query_count <= 4
    finally:
        db.close()
        engine.dispose()


def test_inspection_billing_list_is_paginated_with_bounded_queries():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    db = sessionmaker(bind=engine)()
    try:
        facility = Facility(
            name="Billing Performance Facility",
            phone="(214) 555-0102",
            email="billing-performance@example.com",
            address="3 Main Street",
            city="Dallas",
            state="TX",
            zip_code="75001",
            country="United States",
        )
        user = User(
            username="billing-performance-admin",
            email="billing-performance-admin@example.com",
            full_name="Billing Performance Admin",
            hashed_password="test",
            user_type=UserType.EMPLOYEE,
            role=UserRole.SUPERADMIN,
        )
        db.add_all([facility, user])
        db.flush()

        today = datetime.utcnow().date()
        for index in range(60):
            db.add(
                Invoice(
                    invoice_number=f"INV-PERF-{index:03d}",
                    invoice_type=InvoiceType.INSPECTION,
                    customer_name=facility.name,
                    customer_email=facility.email,
                    facility_id=facility.id,
                    subtotal=Decimal("100"),
                    tax_amount=Decimal("0"),
                    discount_amount=Decimal("0"),
                    total_amount=Decimal("100"),
                    amount_paid=Decimal("0"),
                    balance_due=Decimal("100"),
                    status=InvoiceStatus.PENDING,
                    issue_date=today,
                    due_date=today,
                    billing_approval_status="approved",
                    approved_for_billing_by_id=user.id,
                    approved_for_billing_at=datetime.utcnow(),
                    approved_total_amount=Decimal("100"),
                )
            )
        db.commit()
        user_id = user.id
        db.expunge_all()
        current_user = db.query(User).filter(User.id == user_id).one()

        query_count = 0

        def count_query(*_args):
            nonlocal query_count
            query_count += 1

        event.listen(engine, "before_cursor_execute", count_query)
        response = list_inspection_quotations(
            db=db,
            invoice_id=None,
            search=None,
            status_filter="approved",
            balance_filter="outstanding",
            skip=0,
            limit=25,
            current_user=current_user,
        )
        event.remove(engine, "before_cursor_execute", count_query)

        assert response["total"] == 60
        assert len(response["items"]) == 25
        assert response["summary"]["count"] == 60
        assert query_count <= 7
    finally:
        db.close()
        engine.dispose()
