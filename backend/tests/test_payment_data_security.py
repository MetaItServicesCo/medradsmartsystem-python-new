from types import SimpleNamespace
from unittest.mock import Mock

import pytest
from fastapi import HTTPException
import redis

from app.core.config import settings
from app.utils.payment_data_security import (
    ENCRYPTED_PREFIX,
    PaymentDataSecurityError,
    decrypt_payment_reference,
    encrypt_payment_reference,
    payment_data_encryption_configured,
    reencrypt_payment_reference,
)
from app.utils.rental_card_security import (
    automatic_payment_consent,
    complete_provider_card_cleanup,
    vault_replacement_card,
)
from app.utils.rate_limit import enforce_rate_limit


OLD_KEY = "bEs7H7KAXW8HYbPlZ0s6B1mc0czpn32q9hguXNGjcXc="
NEW_KEY = "4YtlEFi20bcHSTjl7BZTkNI93_JIs_y7vBZROdBh8lk="


def test_payment_reference_is_encrypted_and_supports_key_rotation(monkeypatch) -> None:
    monkeypatch.setattr(settings, "PAYMENT_DATA_ENCRYPTION_KEYS", OLD_KEY)
    encrypted = encrypt_payment_reference("ccof:square-card-secret")

    assert encrypted.startswith(ENCRYPTED_PREFIX)
    assert "square-card-secret" not in encrypted
    assert decrypt_payment_reference(encrypted) == "ccof:square-card-secret"

    monkeypatch.setattr(settings, "PAYMENT_DATA_ENCRYPTION_KEYS", f"{NEW_KEY},{OLD_KEY}")
    assert decrypt_payment_reference(encrypted) == "ccof:square-card-secret"
    assert decrypt_payment_reference(encrypt_payment_reference("new-reference")) == "new-reference"
    rotated = reencrypt_payment_reference(encrypted)
    assert rotated != encrypted
    assert decrypt_payment_reference(rotated) == "ccof:square-card-secret"


def test_saved_card_storage_fails_closed_without_encryption_key(monkeypatch) -> None:
    monkeypatch.setattr(settings, "PAYMENT_DATA_ENCRYPTION_KEYS", "")

    assert payment_data_encryption_configured() is False
    with pytest.raises(PaymentDataSecurityError):
        encrypt_payment_reference("must-not-be-plaintext")


def test_customer_consent_is_bound_to_agreement_and_frequency() -> None:
    rental = SimpleNamespace(billing_frequency="monthly", rental_number="RNT-000123")

    consent = automatic_payment_consent(rental)

    assert "monthly" in consent
    assert "RNT-000123" in consent
    assert "revoke" in consent


def test_replacement_preserves_previous_provider_card_for_post_commit_cleanup(monkeypatch) -> None:
    rental = SimpleNamespace(
        square_card_id="old-card",
        square_customer_id="customer-1",
        customer_name="Customer",
        customer_email="customer@example.com",
    )
    monkeypatch.setattr(
        "app.utils.rental_card_security.payment_data_encryption_configured",
        lambda: True,
    )
    monkeypatch.setattr(
        "app.utils.rental_card_security.create_square_card_on_file",
        lambda **kwargs: {"card_id": "new-card", "customer_id": kwargs["customer_id"]},
    )
    result, replaced = vault_replacement_card(rental, source_id="temporary-token", idempotency_key="stable-key")

    assert replaced is True
    assert result["customer_id"] == "customer-1"


def test_provider_cleanup_clears_reference_only_after_square_disables_card(monkeypatch) -> None:
    db = Mock()
    evidence = SimpleNamespace(
        provider_cleanup_pending=True,
        provider_card_reference="provider-card-ref",
    )
    disabled: list[str] = []
    monkeypatch.setattr(
        "app.utils.rental_card_security.disable_square_card",
        lambda card_id: disabled.append(card_id),
    )

    assert complete_provider_card_cleanup(db, evidence) is True
    assert disabled == ["provider-card-ref"]
    assert evidence.provider_cleanup_pending is False
    assert evidence.provider_card_reference is None
    db.flush.assert_called_once()


def test_payment_rate_limit_remains_active_when_redis_is_unavailable(monkeypatch) -> None:
    monkeypatch.setattr(
        "app.utils.rate_limit._redis_client",
        lambda: (_ for _ in ()).throw(redis.ConnectionError("offline")),
    )
    monkeypatch.setattr("app.utils.rate_limit.time.time", lambda: 1_700_000_000)

    enforce_rate_limit(bucket="card-test", identity="customer", limit=2, window_seconds=60)
    enforce_rate_limit(bucket="card-test", identity="customer", limit=2, window_seconds=60)
    with pytest.raises(HTTPException) as error:
        enforce_rate_limit(bucket="card-test", identity="customer", limit=2, window_seconds=60)

    assert error.value.status_code == 429
