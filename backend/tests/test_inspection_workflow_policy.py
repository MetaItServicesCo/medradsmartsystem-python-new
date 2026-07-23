from datetime import datetime
from decimal import Decimal
from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from app.api.v1.endpoints import inspections as inspections_endpoint
from app.api.v1.endpoints.inspections import (
    InspectionDetailsUpdate,
    InspectionReopen,
    _create_inspection_batch_invoice,
    _require_batch_invoice_allows_asset_changes,
    _require_upcoming_inspection,
    _sync_batch_status,
)
from app.models.invoice import InvoiceStatus
from app.models.inspection import InspectionStatus


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
