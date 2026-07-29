from __future__ import annotations

import base64
from decimal import Decimal, ROUND_HALF_UP
import hashlib
import hmac
from typing import Any

import httpx

from app.core.config import settings


class SquareConfigurationError(RuntimeError):
    pass


class SquareRequestError(RuntimeError):
    def __init__(self, message: str, *, status_code: int = 502, errors: list[dict[str, Any]] | None = None):
        super().__init__(message)
        self.status_code = status_code
        self.errors = errors or []


def square_is_configured() -> bool:
    return bool(
        settings.SQUARE_APPLICATION_ID.strip()
        and settings.SQUARE_ACCESS_TOKEN.strip()
        and settings.SQUARE_LOCATION_ID.strip()
    )


def square_public_config() -> dict[str, Any]:
    environment = (
        "production"
        if settings.SQUARE_ENVIRONMENT.strip().lower() == "production"
        else "sandbox"
    )
    return {
        "enabled": square_is_configured(),
        "environment": environment,
        "application_id": settings.SQUARE_APPLICATION_ID.strip() or None,
        "location_id": settings.SQUARE_LOCATION_ID.strip() or None,
        "currency": settings.SQUARE_CURRENCY.strip().upper() or "USD",
        "sdk_url": (
            "https://sandbox.web.squarecdn.com/v1/square.js"
            if environment == "sandbox"
            else "https://web.squarecdn.com/v1/square.js"
        ),
    }


def _square_base_url() -> str:
    if settings.SQUARE_ENVIRONMENT.strip().lower() == "production":
        return "https://connect.squareup.com/v2"
    return "https://connect.squareupsandbox.com/v2"


def _headers() -> dict[str, str]:
    if not square_is_configured():
        raise SquareConfigurationError("Square payment credentials are not configured")
    return {
        "Authorization": f"Bearer {settings.SQUARE_ACCESS_TOKEN.strip()}",
        "Square-Version": settings.SQUARE_API_VERSION.strip() or "2026-07-15",
        "Content-Type": "application/json",
    }


def amount_to_minor_units(amount: Any) -> int:
    money = Decimal(str(amount or 0)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    return int(money * 100)


def minor_units_to_amount(amount: Any) -> Decimal:
    return (Decimal(str(amount or 0)) / Decimal("100")).quantize(Decimal("0.01"))


def _error_message(payload: dict[str, Any], fallback: str) -> tuple[str, list[dict[str, Any]]]:
    errors = payload.get("errors") if isinstance(payload, dict) else None
    if not isinstance(errors, list):
        return fallback, []
    messages = [
        str(item.get("detail") or item.get("code") or "").strip()
        for item in errors
        if isinstance(item, dict)
    ]
    return "; ".join(message for message in messages if message) or fallback, errors


def create_square_payment(
    *,
    source_id: str,
    idempotency_key: str,
    amount: Any,
    invoice_number: str,
    customer_email: str | None = None,
) -> dict[str, Any]:
    body: dict[str, Any] = {
        "source_id": source_id,
        "idempotency_key": idempotency_key,
        "amount_money": {
            "amount": amount_to_minor_units(amount),
            "currency": settings.SQUARE_CURRENCY.strip().upper() or "USD",
        },
        "autocomplete": True,
        "location_id": settings.SQUARE_LOCATION_ID.strip(),
        "reference_id": invoice_number,
        "note": f"MedRad invoice {invoice_number}",
    }
    if customer_email:
        body["buyer_email_address"] = customer_email

    try:
        response = httpx.post(
            f"{_square_base_url()}/payments",
            headers=_headers(),
            json=body,
            timeout=25,
        )
    except httpx.RequestError as exc:
        raise SquareRequestError("Square could not be reached. Please try again.") from exc

    try:
        payload = response.json()
    except ValueError:
        payload = {}
    if response.status_code >= 400:
        message, errors = _error_message(payload, "Square rejected the payment")
        if response.status_code in {401, 403}:
            public_status = 503
            message = "Square payment credentials could not be authenticated"
        elif response.status_code == 429:
            public_status = 429
        elif 400 <= response.status_code < 500:
            public_status = 400
        else:
            public_status = 502
        raise SquareRequestError(message, status_code=public_status, errors=errors)
    payment = payload.get("payment")
    if not isinstance(payment, dict) or not payment.get("id"):
        raise SquareRequestError("Square returned an invalid payment response")
    return payment


def verify_square_webhook_signature(raw_body: bytes, signature: str | None) -> bool:
    key = settings.SQUARE_WEBHOOK_SIGNATURE_KEY.strip()
    notification_url = settings.SQUARE_WEBHOOK_NOTIFICATION_URL.strip()
    if not key or not notification_url or not signature:
        return False
    signed_payload = notification_url.encode("utf-8") + raw_body
    digest = hmac.new(key.encode("utf-8"), signed_payload, hashlib.sha256).digest()
    expected = base64.b64encode(digest).decode("ascii")
    return hmac.compare_digest(expected, signature)
