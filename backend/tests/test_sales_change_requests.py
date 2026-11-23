"""A customer's "Request Changes" / "Decline" on a sales quotation reaches staff in their words.

    A. A request for changes must say what to change; a decline may be blank.
    B. The comments are kept in the quotation's history, and the staff
       notification carries the start of them.
    C. The customer sees their own request back (primary recipient only),
       until a quotation is sent to them again.
    D. Unchanged: the status becomes changes_requested / declined as before.

    cd backend && DATABASE_URL=sqlite:// python -m pytest -q tests/test_sales_change_requests.py
"""
from datetime import datetime, timedelta
from decimal import Decimal

import pytest
from fastapi import HTTPException
from pydantic import ValidationError
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.api.v1.endpoints.sales import _token_hash
from app.api.v1.endpoints.sales_portal import (
    PortalDecisionIn,
    _open_customer_response,
    _portal_response,
    decide_client_quotation,
    decide_public_quotation,
)
from app.db.base import Base
from app.models.notification import Notification
from app.models.sales import SalesQuotation, SalesQuotationLineItem, SalesQuotationRecipient
from app.models.user import User, UserRole, UserType


@pytest.fixture()
def db():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    session = sessionmaker(bind=engine)()
    try:
        yield session
    finally:
        session.close()


def _sent_quotation(db, number="SQ-CR-001", token="tok-primary"):
    admin = User(username=f"admin-{number}", email=f"admin-{number}@example.com", full_name="Sales Admin",
                 hashed_password="x", user_type=UserType.EMPLOYEE, role=UserRole.ADMIN)
    db.add(admin)
    db.flush()
    sent_at = datetime.utcnow()
    quotation = SalesQuotation(
        quotation_number=number, work_order=f"SO-{number}", created_by_id=admin.id,
        customer_name="Clinic Buyer", customer_email="buyer@example.com", quotation_type="standard",
        status="viewed", paid_status="unpaid", selection_status="pending",
        subtotal=Decimal("100"), total_amount=Decimal("100"), sent_at=sent_at,
        expires_at=sent_at + timedelta(days=30), revision=1,
        history=[{"action": "sent", "by": "Sales Admin", "user_id": admin.id, "at": sent_at.isoformat(), "details": {}}],
    )
    db.add(quotation)
    db.flush()
    db.add(SalesQuotationLineItem(quotation_id=quotation.id, item_kind="product", is_default=True, is_selected=True,
                                  description="Monitor", quantity=1, unit_price=Decimal("100"),
                                  shipping_fee=Decimal("0"), setup_fee=Decimal("0"), condition="new",
                                  total=Decimal("100")))
    primary = SalesQuotationRecipient(quotation_id=quotation.id, recipient_type="primary", name="Clinic Buyer",
                                      email="buyer@example.com", status="viewed",
                                      access_token_hash=_token_hash(token), token_expires_at=quotation.expires_at,
                                      sent_at=sent_at, viewed_at=sent_at)
    cc = SalesQuotationRecipient(quotation_id=quotation.id, recipient_type="cc", name="Clinic Accounts",
                                 email="accounts@example.com", status="viewed",
                                 access_token_hash=_token_hash(token + "-cc"), token_expires_at=quotation.expires_at,
                                 sent_at=sent_at)
    db.add_all([primary, cc])
    db.commit()
    return admin, quotation, primary, cc


def test_request_for_changes_needs_the_changes(db):
    _, quotation, _, _ = _sent_quotation(db)
    for blank in (None, "", "   \n "):
        with pytest.raises(HTTPException) as refused:
            decide_public_quotation("tok-primary", PortalDecisionIn(action="request_changes", comments=blank), db)
        assert refused.value.status_code == 422
        assert "describe the changes" in refused.value.detail
    db.rollback()
    db.refresh(quotation)
    assert quotation.status == "viewed"


def test_request_for_changes_keeps_the_words_and_tells_staff(db):
    admin, quotation, _, _ = _sent_quotation(db)
    words = "Please change the quantity to 3.\nAnd remove the delivery fee."
    response = decide_public_quotation("tok-primary", PortalDecisionIn(action="request_changes", comments=words), db)

    db.refresh(quotation)
    assert quotation.status == "changes_requested"
    entry = quotation.history[-1]
    assert entry["action"] == "changes_requested"
    assert entry["details"]["comments"] == words
    note = db.query(Notification).filter(Notification.user_id == admin.id).one()
    assert note.message.startswith("Clinic Buyer changes requested for SQ-CR-001.")
    assert '"Please change the quantity to 3. And remove the delivery fee."' in note.message

    # The customer sees their own request back.
    assert response["customer_response"]["action"] == "changes_requested"
    assert response["customer_response"]["comments"] == words
    assert response["can_accept"] is False


def test_long_comments_are_shortened_in_the_notification_only(db):
    admin, quotation, _, _ = _sent_quotation(db)
    words = "x" * 400
    decide_public_quotation("tok-primary", PortalDecisionIn(action="request_changes", comments=words), db)
    note = db.query(Notification).filter(Notification.user_id == admin.id).one()
    assert note.message.endswith("…\"") and len(note.message) < 260
    db.refresh(quotation)
    assert quotation.history[-1]["details"]["comments"] == words


def test_a_decline_may_be_blank_as_before(db):
    admin, quotation, _, _ = _sent_quotation(db)
    response = decide_public_quotation("tok-primary", PortalDecisionIn(action="decline", comments=None), db)
    db.refresh(quotation)
    assert quotation.status == "declined"
    assert quotation.history[-1]["details"]["comments"] == ""
    note = db.query(Notification).filter(Notification.user_id == admin.id).one()
    assert note.message == "Clinic Buyer declined for SQ-CR-001."
    assert response["customer_response"] == {"action": "declined", "at": quotation.history[-1]["at"], "comments": ""}


def test_only_the_primary_recipient_sees_the_request_back(db):
    _, quotation, primary, cc = _sent_quotation(db)
    decide_public_quotation("tok-primary", PortalDecisionIn(action="request_changes", comments="Lower the price"), db)
    db.refresh(primary)
    db.refresh(cc)
    assert _portal_response(primary)["customer_response"]["comments"] == "Lower the price"
    assert _portal_response(cc)["customer_response"] is None


def test_the_request_closes_once_a_quotation_is_sent_again(db):
    _, quotation, _, _ = _sent_quotation(db)
    decide_public_quotation("tok-primary", PortalDecisionIn(action="request_changes", comments="Lower the price"), db)
    db.refresh(quotation)
    assert _open_customer_response(quotation)["comments"] == "Lower the price"
    quotation.history = list(quotation.history) + [
        {"action": "revision_created", "by": "Sales Admin", "at": datetime.utcnow().isoformat(), "details": {}},
    ]
    assert _open_customer_response(quotation)["comments"] == "Lower the price"  # still open while revising
    quotation.history = list(quotation.history) + [
        {"action": "sent", "by": "Sales Admin", "at": datetime.utcnow().isoformat(), "details": {}},
    ]
    assert _open_customer_response(quotation) is None


def test_the_account_portal_follows_the_same_rule(db):
    _, quotation, primary, _ = _sent_quotation(db)
    customer = User(username="buyer", email="buyer-account@example.com", full_name="Clinic Buyer", hashed_password="x",
                    user_type=UserType.CLIENT, role=UserRole.CLIENT)
    db.add(customer)
    db.flush()
    primary.user_id = customer.id
    db.commit()
    with pytest.raises(HTTPException) as refused:
        decide_client_quotation(quotation.id, PortalDecisionIn(action="request_changes", comments=" "), db, customer)
    assert refused.value.status_code == 422
    db.rollback()
    response = decide_client_quotation(quotation.id, PortalDecisionIn(action="request_changes", comments="Add a second probe"), db, customer)
    assert response["customer_response"]["comments"] == "Add a second probe"


def test_comments_have_a_sensible_limit():
    PortalDecisionIn(action="request_changes", comments="x" * 5000)
    with pytest.raises(ValidationError):
        PortalDecisionIn(action="request_changes", comments="x" * 5001)
