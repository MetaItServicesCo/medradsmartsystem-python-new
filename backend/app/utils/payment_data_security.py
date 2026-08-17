from __future__ import annotations

from functools import lru_cache
from typing import Optional

from cryptography.fernet import Fernet, InvalidToken, MultiFernet
from sqlalchemy.types import Text, TypeDecorator

from app.core.config import settings


ENCRYPTED_PREFIX = "enc:v1:"


class PaymentDataSecurityError(RuntimeError):
    """Raised when protected payment references cannot be encrypted safely."""


def _configured_keys() -> tuple[str, ...]:
    raw = getattr(settings, "PAYMENT_DATA_ENCRYPTION_KEYS", "") or ""
    return tuple(value.strip() for value in raw.split(",") if value.strip())


@lru_cache(maxsize=8)
def _cipher(keys: tuple[str, ...]) -> MultiFernet:
    if not keys:
        raise PaymentDataSecurityError(
            "PAYMENT_DATA_ENCRYPTION_KEYS is not configured; saved-card references cannot be stored"
        )
    try:
        return MultiFernet([Fernet(key.encode("ascii")) for key in keys])
    except (ValueError, TypeError, UnicodeError) as exc:
        raise PaymentDataSecurityError(
            "PAYMENT_DATA_ENCRYPTION_KEYS contains an invalid Fernet key"
        ) from exc


def payment_data_encryption_configured() -> bool:
    try:
        _cipher(_configured_keys())
        return True
    except PaymentDataSecurityError:
        return False


def encrypt_payment_reference(value: Optional[str]) -> Optional[str]:
    if value is None:
        return None
    normalized = str(value).strip()
    if not normalized:
        return None
    if normalized.startswith(ENCRYPTED_PREFIX):
        return normalized
    token = _cipher(_configured_keys()).encrypt(normalized.encode("utf-8")).decode("ascii")
    return f"{ENCRYPTED_PREFIX}{token}"


def decrypt_payment_reference(value: Optional[str]) -> Optional[str]:
    if value is None:
        return None
    normalized = str(value).strip()
    if not normalized:
        return None
    # Backward-compatible reads are intentional during rolling deployment. The
    # Alembic migration rewrites every existing value with the encrypted prefix.
    if not normalized.startswith(ENCRYPTED_PREFIX):
        return normalized
    token = normalized[len(ENCRYPTED_PREFIX):]
    try:
        return _cipher(_configured_keys()).decrypt(token.encode("ascii")).decode("utf-8")
    except (InvalidToken, UnicodeError) as exc:
        raise PaymentDataSecurityError(
            "A protected payment reference could not be decrypted with the configured key ring"
        ) from exc


def reencrypt_payment_reference(value: Optional[str]) -> Optional[str]:
    """Decrypt with any configured key and encrypt with the first key.

    This is deliberately separate from normal binding, where already-encrypted
    values must not be encrypted twice.
    """
    plaintext = decrypt_payment_reference(value)
    if plaintext is None:
        return None
    token = _cipher(_configured_keys()).encrypt(plaintext.encode("utf-8")).decode("ascii")
    return f"{ENCRYPTED_PREFIX}{token}"


def encrypt_payment_blob(value: bytes) -> bytes:
    """Encrypt a private payment document before writing it to disk."""
    if not value:
        raise PaymentDataSecurityError("An empty payment document cannot be encrypted")
    return _cipher(_configured_keys()).encrypt(value)


def decrypt_payment_blob(value: bytes) -> bytes:
    """Decrypt a private payment document for an authorized response."""
    try:
        return _cipher(_configured_keys()).decrypt(value)
    except InvalidToken as exc:
        raise PaymentDataSecurityError(
            "A protected payment document could not be decrypted with the configured key ring"
        ) from exc


class EncryptedPaymentReference(TypeDecorator):
    """Transparent application-level encryption for reusable provider IDs.

    Only non-sensitive masked display metadata is stored outside this type.
    The first configured key encrypts new values; remaining keys allow gradual
    key rotation without interrupting recurring billing.
    """

    impl = Text
    cache_ok = True

    def process_bind_param(self, value: Optional[str], dialect) -> Optional[str]:  # type: ignore[override]
        return encrypt_payment_reference(value)

    def process_result_value(self, value: Optional[str], dialect) -> Optional[str]:  # type: ignore[override]
        return decrypt_payment_reference(value)
