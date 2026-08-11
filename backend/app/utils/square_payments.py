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
    def __init__(self, message: str, *, status_code: int = 502, errors: list[dict[str, Any]] | None = None, indeterminate: bool = False):
        super().__init__(message)
        self.status_code = status_code
        self.errors = errors or []
        # True means Square may have received the request even though this
        # process did not receive a response. The same idempotency key must be
        # retained and the operation reconciled, never blindly charged again.
        self.indeterminate = indeterminate


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
    customer_id: str | None = None,
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
    if customer_id:
        body["customer_id"] = customer_id

    try:
        response = httpx.post(
            f"{_square_base_url()}/payments",
            headers=_headers(),
            json=body,
            timeout=25,
        )
    except httpx.RequestError as exc:
        raise SquareRequestError(
            "Square payment confirmation is pending. Do not submit another payment while it is being verified.",
            indeterminate=True,
        ) from exc

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


def _square_post(path: str, body: dict[str, Any], fallback: str) -> dict[str, Any]:
    try:
        response = httpx.post(f"{_square_base_url()}{path}", headers=_headers(), json=body, timeout=25)
    except httpx.RequestError as exc:
        raise SquareRequestError("Square could not be reached. Please try again.") from exc
    try:
        payload = response.json()
    except ValueError:
        payload = {}
    if response.status_code >= 400:
        message, errors = _error_message(payload, fallback)
        public_status = 400 if 400 <= response.status_code < 500 else 502
        raise SquareRequestError(message, status_code=public_status, errors=errors)
    return payload


def create_square_card_on_file(
    *,
    source_id: str,
    idempotency_key: str,
    customer_name: str,
    customer_email: str | None = None,
) -> dict[str, Any]:
    """Store a card on file for recurring auto-charge: create (or reuse) a Square
    customer, then vault the card. Returns the customer id + card id + card summary."""
    customer_body: dict[str, Any] = {"given_name": customer_name or "Rental customer"}
    if customer_email:
        customer_body["email_address"] = customer_email
    customer = _square_post("/customers", customer_body, "Square could not create the customer").get("customer") or {}
    customer_id = customer.get("id")
    if not customer_id:
        raise SquareRequestError("Square returned an invalid customer response")

    card_body = {
        "idempotency_key": idempotency_key,
        "source_id": source_id,
        "card": {"customer_id": customer_id},
    }
    card = _square_post("/cards", card_body, "Square could not save the card").get("card") or {}
    if not card.get("id"):
        raise SquareRequestError("Square returned an invalid card response")
    return {
        "customer_id": customer_id,
        "card_id": card["id"],
        "card_brand": card.get("card_brand"),
        "last_4": card.get("last_4"),
        "exp_month": card.get("exp_month"),
        "exp_year": card.get("exp_year"),
    }


def create_square_refund(
    *,
    payment_id: str,
    idempotency_key: str,
    amount: Any,
    reason: str | None = None,
) -> dict[str, Any]:
    """Refund `amount` against a completed Square payment (partial refunds allowed)."""
    body: dict[str, Any] = {
        "idempotency_key": idempotency_key,
        "payment_id": payment_id,
        "amount_money": {
            "amount": amount_to_minor_units(amount),
            "currency": settings.SQUARE_CURRENCY.strip().upper() or "USD",
        },
    }
    if reason:
        body["reason"] = reason[:192]
    payload = _square_post("/refunds", body, "Square could not process the refund")
    refund = payload.get("refund")
    if not isinstance(refund, dict) or not refund.get("id"):
        raise SquareRequestError("Square returned an invalid refund response")
    return refund


def verify_square_webhook_signature(raw_body: bytes, signature: str | None) -> bool:
    key = settings.SQUARE_WEBHOOK_SIGNATURE_KEY.strip()
    notification_url = settings.SQUARE_WEBHOOK_NOTIFICATION_URL.strip()
    if not key or not notification_url or not signature:
        return False
    signed_payload = notification_url.encode("utf-8") + raw_body
    digest = hmac.new(key.encode("utf-8"), signed_payload, hashlib.sha256).digest()
    expected = base64.b64encode(digest).decode("ascii")
    return hmac.compare_digest(expected, signature)
