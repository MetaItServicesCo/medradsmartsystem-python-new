from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from app.api.v1.endpoints.service_requests import _authorize_service_request_update
from app.models.service_request import ServiceRequestStatus
from app.models.user import UserRole


def _user(role: UserRole, user_id: int = 10):
    return SimpleNamespace(role=role, id=user_id)


def _request(
    status: ServiceRequestStatus = ServiceRequestStatus.NEW,
    requester_id: int = 10,
):
    return SimpleNamespace(status=status, requester_id=requester_id)


def test_facility_requester_can_cancel_own_new_request():
    _authorize_service_request_update(
        _user(UserRole.FACILITY_ADMIN),
        _request(),
        {"status": ServiceRequestStatus.CANCELLED.value},
    )


def test_facility_requester_can_edit_submission_before_processing():
    _authorize_service_request_update(
        _user(UserRole.FACILITY_MANAGER),
        _request(),
        {"problem_description": "Updated equipment issue"},
    )


@pytest.mark.parametrize(
    "payload",
    [
        {"status": ServiceRequestStatus.IN_PROGRESS.value},
        {"assigned_technician_id": 22},
        {"time_spent_hours": 3},
        {"billing_status": "approved"},
    ],
)
def test_facility_users_cannot_change_operational_fields(payload):
    with pytest.raises(HTTPException) as error:
        _authorize_service_request_update(
            _user(UserRole.FACILITY_ADMIN),
            _request(),
            payload,
        )
    assert error.value.status_code == 403


def test_facility_user_cannot_change_another_requesters_submission():
    with pytest.raises(HTTPException) as error:
        _authorize_service_request_update(
            _user(UserRole.FACILITY_MANAGER),
            _request(requester_id=99),
            {"status": ServiceRequestStatus.CANCELLED.value},
        )
    assert error.value.status_code == 403


def test_facility_request_cannot_be_changed_after_processing_starts():
    with pytest.raises(HTTPException) as error:
        _authorize_service_request_update(
            _user(UserRole.FACILITY_ADMIN),
            _request(status=ServiceRequestStatus.ASSIGNED),
            {"priority": "high"},
        )
    assert error.value.status_code == 409


def test_technician_must_use_work_session_flow():
    with pytest.raises(HTTPException) as error:
        _authorize_service_request_update(
            _user(UserRole.TECHNICIAN),
            _request(status=ServiceRequestStatus.ASSIGNED),
            {"status": ServiceRequestStatus.IN_PROGRESS.value},
        )
    assert error.value.status_code == 403


def test_internal_admin_retains_operational_control():
    _authorize_service_request_update(
        _user(UserRole.ADMIN),
        _request(status=ServiceRequestStatus.IN_PROGRESS),
        {"assigned_technician_id": 22, "billing_status": "approved"},
    )
