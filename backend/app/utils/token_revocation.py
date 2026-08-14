from __future__ import annotations

from datetime import datetime, timezone
import logging

import redis

from app.utils.rate_limit import _redis_client


logger = logging.getLogger("medrad.security")


def _key(jti: str) -> str:
    return f"medrad:revoked-token:{jti}"


def revoke_access_token(payload: dict) -> None:
    jti = str(payload.get("jti") or "").strip()
    expires_at = payload.get("exp")
    if not jti or not isinstance(expires_at, (int, float)):
        return
    ttl = max(1, int(expires_at - datetime.now(timezone.utc).timestamp()))
    try:
        _redis_client().setex(_key(jti), ttl, "1")
    except redis.RedisError:
        # Logout still clears the browser immediately. The signed access token
        # has a short lifetime if Redis is temporarily unavailable.
        logger.warning("Could not persist token revocation jti=%s", jti[:8])


def access_token_is_revoked(payload: dict) -> bool:
    jti = str(payload.get("jti") or "").strip()
    if not jti:
        return True
    try:
        return bool(_redis_client().exists(_key(jti)))
    except redis.RedisError:
        logger.warning("Could not read token revocation state jti=%s", jti[:8])
        return False
