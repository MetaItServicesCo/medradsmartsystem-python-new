import base64
from decimal import Decimal
import hashlib
import hmac
import json

from app.core.config import settings
from app.utils.square_payments import (
    amount_to_minor_units,
    create_square_payment,
    minor_units_to_amount,
    square_public_config,
    verify_square_webhook_signature,
)


def test_square_money_conversion_uses_currency_precision() -> None:
    assert amount_to_minor_units("12.345") == 1235
    assert amount_to_minor_units(Decimal("0.01")) == 1
    assert minor_units_to_amount(1235) == Decimal("12.35")


def test_square_public_config_never_exposes_access_token(monkeypatch) -> None:
    monkeypatch.setattr(settings, "SQUARE_ENVIRONMENT", "sandbox")
    monkeypatch.setattr(settings, "SQUARE_APPLICATION_ID", "sandbox-app")
    monkeypatch.setattr(settings, "SQUARE_ACCESS_TOKEN", "server-secret-token")
    monkeypatch.setattr(settings, "SQUARE_LOCATION_ID", "sandbox-location")

    public_config = square_public_config()

    assert public_config["enabled"] is True
    assert public_config["application_id"] == "sandbox-app"
    assert public_config["location_id"] == "sandbox-location"
    assert public_config["sdk_url"].startswith("https://sandbox.")
    assert "server-secret-token" not in json.dumps(public_config)


def test_square_create_payment_uses_server_token_and_exact_invoice_reference(monkeypatch) -> None:
    monkeypatch.setattr(settings, "SQUARE_ENVIRONMENT", "sandbox")
    monkeypatch.setattr(settings, "SQUARE_APPLICATION_ID", "sandbox-app")
    monkeypatch.setattr(settings, "SQUARE_ACCESS_TOKEN", "server-secret-token")
    monkeypatch.setattr(settings, "SQUARE_LOCATION_ID", "sandbox-location")
    monkeypatch.setattr(settings, "SQUARE_CURRENCY", "USD")
    captured = {}

    class Response:
        status_code = 200

        @staticmethod
        def json():
            return {
                "payment": {
                    "id": "square-payment-123",
                    "status": "COMPLETED",
                    "amount_money": {"amount": 7350, "currency": "USD"},
                }
            }

    def fake_post(url, *, headers, json, timeout):
        captured.update(url=url, headers=headers, json=json, timeout=timeout)
        return Response()

    monkeypatch.setattr("app.utils.square_payments.httpx.post", fake_post)

    payment = create_square_payment(
        source_id="cnon:sandbox-token",
        idempotency_key="6cfb1711-d7e8-48e7-a2b1-8dc56d83af76",
        amount="73.50",
        invoice_number="INV-SALES-000123",
        customer_email="client@example.com",
    )

    assert payment["id"] == "square-payment-123"
    assert captured["url"] == "https://connect.squareupsandbox.com/v2/payments"
    assert captured["headers"]["Authorization"] == "Bearer server-secret-token"
    assert captured["json"]["amount_money"] == {"amount": 7350, "currency": "USD"}
    assert captured["json"]["reference_id"] == "INV-SALES-000123"
    assert captured["json"]["buyer_email_address"] == "client@example.com"


def test_square_webhook_signature_uses_exact_notification_url_and_body(monkeypatch) -> None:
    signature_key = "sandbox-signature-key"
    notification_url = "https://medcodesolution.com/api/v1/webhooks/square"
    body = b'{"type":"payment.updated","event_id":"event-1"}'
    expected = base64.b64encode(
        hmac.new(
            signature_key.encode("utf-8"),
            notification_url.encode("utf-8") + body,
            hashlib.sha256,
        ).digest()
    ).decode("ascii")
    monkeypatch.setattr(settings, "SQUARE_WEBHOOK_SIGNATURE_KEY", signature_key)
    monkeypatch.setattr(settings, "SQUARE_WEBHOOK_NOTIFICATION_URL", notification_url)

    assert verify_square_webhook_signature(body, expected) is True
    assert verify_square_webhook_signature(body + b" ", expected) is False
    assert verify_square_webhook_signature(body, "wrong-signature") is False
