from decimal import Decimal

import pytest
from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import sessionmaker

from app.db.base import Base
from app.models.payment_operation import PaymentOperation
from app.utils.payment_idempotency import (
    get_or_create_operation,
    mark_operation_succeeded,
    payment_fingerprint,
    replay_or_raise,
)


def _db():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    return sessionmaker(bind=engine)()


def test_fingerprint_is_canonical_and_money_safe() -> None:
    first = payment_fingerprint(
        "invoice_payment",
        invoice_id=12,
        amount="10",
        attributes={"method": "card", "actor": 7},
    )
    second = payment_fingerprint(
        "invoice_payment",
        invoice_id=12,
        amount=Decimal("10.00"),
        attributes={"actor": 7, "method": "card"},
    )
    assert first == second


def test_same_key_same_fingerprint_replays_single_operation() -> None:
    db = _db()
    fingerprint = payment_fingerprint("invoice_payment", amount="25.00")
    operation, replay = get_or_create_operation(
        db,
        idempotency_key="retry-key-123456",
        fingerprint=fingerprint,
        operation_type="invoice_payment",
        amount="25.00",
    )
    assert replay is False
    mark_operation_succeeded(operation, provider_reference="provider-payment-1", response_data={"ok": True})
    db.commit()

    repeated, replay = get_or_create_operation(
        db,
        idempotency_key="retry-key-123456",
        fingerprint=fingerprint,
        operation_type="invoice_payment",
        amount="25.00",
    )
    assert replay is True
    assert replay_or_raise(repeated) == {"ok": True}
    assert db.query(PaymentOperation).count() == 1


def test_same_key_with_changed_financial_intent_is_rejected() -> None:
    db = _db()
    operation, _ = get_or_create_operation(
        db,
        idempotency_key="immutable-key-123456",
        fingerprint=payment_fingerprint("invoice_payment", amount="25.00"),
        operation_type="invoice_payment",
        amount="25.00",
    )
    mark_operation_succeeded(operation)
    db.commit()

    with pytest.raises(HTTPException) as error:
        get_or_create_operation(
            db,
            idempotency_key="immutable-key-123456",
            fingerprint=payment_fingerprint("invoice_payment", amount="30.00"),
            operation_type="invoice_payment",
            amount="30.00",
        )
    assert error.value.status_code == 409


def test_provider_reference_has_database_uniqueness_barrier() -> None:
    db = _db()
    db.add_all([
        PaymentOperation(
            idempotency_key="provider-key-111111",
            request_fingerprint="a" * 64,
            operation_type="invoice_payment",
            status="succeeded",
            provider="square",
            provider_reference="square-payment-one",
            amount=10,
            currency="USD",
        ),
        PaymentOperation(
            idempotency_key="provider-key-222222",
            request_fingerprint="b" * 64,
            operation_type="invoice_payment",
            status="succeeded",
            provider="square",
            provider_reference="square-payment-one",
            amount=10,
            currency="USD",
        ),
    ])
    with pytest.raises(IntegrityError):
        db.commit()


def test_database_blocks_two_active_money_operations_for_one_invoice() -> None:
    db = _db()
    get_or_create_operation(
        db,
        idempotency_key="card-attempt-111111",
        fingerprint=payment_fingerprint("square_invoice_payment", invoice_id=99, amount="25.00"),
        operation_type="square_invoice_payment",
        invoice_id=99,
        amount="25.00",
    )

    with pytest.raises(HTTPException) as error:
        get_or_create_operation(
            db,
            idempotency_key="manual-attempt-222222",
            fingerprint=payment_fingerprint("manual_invoice_payment", invoice_id=99, amount="25.00"),
            operation_type="manual_invoice_payment",
            invoice_id=99,
            amount="25.00",
        )

    assert error.value.status_code == 409
