from datetime import datetime
from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from app.api.v1.endpoints.inspections import (
    InspectionDetailsUpdate,
    InspectionReopen,
    _require_upcoming_inspection,
    _sync_batch_status,
)
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
