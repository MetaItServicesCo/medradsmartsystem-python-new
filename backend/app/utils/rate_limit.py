from __future__ import annotations

from functools import lru_cache
import hashlib
from threading import Lock
import time

from fastapi import HTTPException, Request
import redis

from app.core.config import settings


_fallback_lock = Lock()
_fallback_counts: dict[str, tuple[int, int]] = {}


@lru_cache(maxsize=1)
def _redis_client():
    return redis.Redis.from_url(
        settings.REDIS_URL,
        decode_responses=True,
        socket_connect_timeout=0.25,
        socket_timeout=0.25,
    )


def request_ip(request: Request) -> str:
    forwarded = request.headers.get("x-forwarded-for", "").split(",")[0].strip()
    return forwarded or (request.client.host if request.client else "unknown")


def public_payment_identity(request: Request, token: str) -> str:
    token_hash = hashlib.sha256(token.encode("utf-8")).hexdigest()[:20]
    ip_hash = hashlib.sha256(request_ip(request).encode("utf-8")).hexdigest()[:20]
    return f"{token_hash}:{ip_hash}"


def enforce_rate_limit(*, bucket: str, identity: str, limit: int, window_seconds: int) -> None:
    """Redis-backed fixed-window limiter.

    A bounded in-process limiter remains active if Redis is unavailable. This
    preserves checkout availability without leaving card endpoints completely
    unprotected during a cache outage.
    """
    digest = hashlib.sha256(identity.encode("utf-8")).hexdigest()
    window = int(time.time()) // window_seconds
    key = f"medrad:rate:{bucket}:{digest}:{window}"
    try:
        client = _redis_client()
        with client.pipeline(transaction=True) as pipe:
            pipe.incr(key)
            pipe.expire(key, window_seconds + 5)
            count, _ = pipe.execute()
    except redis.RedisError:
        with _fallback_lock:
            previous_window, previous_count = _fallback_counts.get(key, (window, 0))
            count = previous_count + 1 if previous_window == window else 1
            _fallback_counts[key] = (window, count)
            # Keep the emergency limiter bounded for a long Redis outage.
            if len(_fallback_counts) > 10_000:
                for stale_key in list(_fallback_counts)[:2_000]:
                    _fallback_counts.pop(stale_key, None)
    if int(count) > limit:
        raise HTTPException(
            status_code=429,
            detail="Too many payment requests. Please wait before trying again.",
            headers={"Retry-After": str(window_seconds)},
        )
