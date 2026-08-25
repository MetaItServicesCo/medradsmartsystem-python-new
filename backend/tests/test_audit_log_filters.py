from datetime import date, datetime

import pytest
from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.api.v1.endpoints.audit import read_audit_logs
from app.db.base import Base
from app.models.audit_log import AuditLog
from app.models.user import User, UserRole, UserType


def _read(db, user, **overrides):
    params = {
        "db": db,
        "current_user": user,
        "skip": 0,
        "limit": 10,
        "search": None,
        "action": None,
        "from_date": None,
        "to_date": None,
    }
    params.update(overrides)
    return read_audit_logs(**params)


def test_audit_log_filters_and_pagination_are_applied_server_side() -> None:
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    db = sessionmaker(bind=engine)()
    try:
        user = User(
            username="supervisor",
            email="supervisor@example.com",
            full_name="System Supervisor",
            hashed_password="test",
            user_type=UserType.EMPLOYEE,
            role=UserRole.SUPERADMIN,
        )
        db.add(user)
        db.flush()
        db.add_all(
            [
                AuditLog(
                    table_name="service_requests_activity",
                    record_id=45,
                    action="API_UPDATE",
                    changed_by_id=user.id,
                    changed_by_username="alice",
                    changes_json='{"facility":"North Clinic"}',
                    timestamp=datetime(2026, 8, 20, 9, 0),
                ),
                AuditLog(
                    table_name="facilities_activity",
                    record_id=12,
                    action="VIEW_DETAIL",
                    changed_by_id=user.id,
                    changed_by_username="bob",
                    changes_json='{"facility":"North Clinic"}',
                    timestamp=datetime(2026, 8, 21, 10, 0),
                ),
                AuditLog(
                    table_name="inventory_activity",
                    record_id=88,
                    action="REQUEST_FAILED",
                    changed_by_id=user.id,
                    changed_by_username="alice",
                    changes_json='{"query":"50%_off"}',
                    timestamp=datetime(2026, 8, 22, 11, 0),
                ),
            ]
        )
        db.commit()

        actor_result = _read(db, user, search="alice")
        assert actor_result["total"] == 2
        assert [item.action for item in actor_result["items"]] == ["REQUEST_FAILED", "API_UPDATE"]

        action_result = _read(db, user, action="VIEW")
        assert action_result["total"] == 1
        assert action_result["items"][0].changed_by_username == "bob"

        date_result = _read(db, user, from_date=date(2026, 8, 21), to_date=date(2026, 8, 21))
        assert date_result["total"] == 1
        assert date_result["items"][0].record_id == 12

        literal_wildcard_result = _read(db, user, search="50%_off")
        assert literal_wildcard_result["total"] == 1
        assert literal_wildcard_result["items"][0].record_id == 88

        page_result = _read(db, user, skip=1, limit=1)
        assert page_result["total"] == 3
        assert len(page_result["items"]) == 1
        assert page_result["items"][0].record_id == 12
    finally:
        db.close()
        engine.dispose()


def test_audit_log_rejects_inverted_date_range() -> None:
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    db = sessionmaker(bind=engine)()
    try:
        with pytest.raises(HTTPException) as exc_info:
            _read(
                db,
                None,
                from_date=date(2026, 8, 22),
                to_date=date(2026, 8, 21),
            )
        assert exc_info.value.status_code == 422
    finally:
        db.close()
        engine.dispose()
