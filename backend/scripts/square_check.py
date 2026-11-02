"""Read-only check that the Square settings work, before taking real payments.

Asks Square, with the configured access token, for the configured location and
confirms everything a card payment needs: the token belongs to the selected
environment, the location is active and can take cards, and its currency
matches SQUARE_CURRENCY. Prints no secret and changes nothing::

    python -m scripts.square_check

Exits 1 if anything would stop card payments.
"""
from __future__ import annotations

import sys

import httpx

from app.core.config import settings
from app.utils.square_payments import _headers, _square_base_url, square_is_configured, square_public_config


def _mask(value: str) -> str:
    value = value.strip()
    return value[:12] + "…" if len(value) > 16 else ("set" if value else "NOT SET")


def main() -> int:
    problems: list[str] = []
    config = square_public_config()
    print("Square environment:      {}".format(config["environment"]))
    print("Application ID:          {}".format(_mask(settings.SQUARE_APPLICATION_ID)))
    print("Location ID:             {}".format(settings.SQUARE_LOCATION_ID.strip() or "NOT SET"))
    print("Access token:            {}".format("set" if settings.SQUARE_ACCESS_TOKEN.strip() else "NOT SET"))
    print("Currency:                {}".format(config["currency"]))
    print("Card form script:        {}".format(config["sdk_url"]))
    print("Webhook signature key:   {}".format("set" if settings.SQUARE_WEBHOOK_SIGNATURE_KEY.strip() else "NOT SET"))
    print("Webhook URL:             {}".format(settings.SQUARE_WEBHOOK_NOTIFICATION_URL.strip() or "NOT SET"))
    print("Card reference keys:     {}".format("set" if settings.PAYMENT_DATA_ENCRYPTION_KEYS.strip() else "NOT SET"))
    print("Test payments enabled:   {}".format(settings.ENABLE_TEST_PAYMENTS))

    if not square_is_configured():
        problems.append("the application ID, access token and location ID must all be set")
    if settings.ENABLE_TEST_PAYMENTS:
        problems.append("ENABLE_TEST_PAYMENTS must be false when real payments are taken")
    if not settings.SQUARE_WEBHOOK_SIGNATURE_KEY.strip():
        problems.append("SQUARE_WEBHOOK_SIGNATURE_KEY is not set: Square's payment notifications would be refused")

    if square_is_configured():
        location_id = settings.SQUARE_LOCATION_ID.strip()
        try:
            response = httpx.get(f"{_square_base_url()}/locations/{location_id}", headers=_headers(), timeout=20)
        except httpx.RequestError as exc:
            problems.append(f"could not reach Square: {exc.__class__.__name__}")
        else:
            if response.status_code == 401:
                problems.append("Square refused the access token: it is not a valid {} token".format(config["environment"]))
            elif response.status_code == 404:
                problems.append("Square has no location {} for this access token".format(location_id))
            elif response.status_code >= 400:
                problems.append(f"Square answered {response.status_code} when asked for the location")
            else:
                location = response.json().get("location") or {}
                capabilities = location.get("capabilities") or []
                print()
                print("Location name:           {}".format(location.get("name") or "—"))
                print("Location status:         {}".format(location.get("status") or "—"))
                print("Location currency:       {}".format(location.get("currency") or "—"))
                print("Location country:        {}".format(location.get("country") or "—"))
                print("Can process cards:       {}".format("CREDIT_CARD_PROCESSING" in capabilities))
                if location.get("status") != "ACTIVE":
                    problems.append("the Square location is not active")
                if "CREDIT_CARD_PROCESSING" not in capabilities:
                    problems.append("the Square location cannot process cards yet (finish account activation in Square)")
                if (location.get("currency") or "").upper() != config["currency"]:
                    problems.append("SQUARE_CURRENCY does not match the location's currency")

    print()
    if problems:
        print("NOT READY:")
        for problem in problems:
            print("  - " + problem)
        return 1
    print("READY: card payments will be taken through Square {}.".format(config["environment"]))
    return 0


if __name__ == "__main__":
    sys.exit(main())
