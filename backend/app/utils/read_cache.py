"""Small, permission-scoped cache-aside layer for safe API reads.

This module deliberately does not cache payment, authorization, inventory
availability, or workflow-state endpoints. Redis is an acceleration layer: a
Redis outage always falls through to PostgreSQL and never breaks an API read.
"""

from __future__ import annotations

from collections import Counter
from functools import wraps
import hashlib
import inspect
import json
import logging
from threading import Lock
from typing import Any, Callable, Literal, TypeVar

from fastapi.encoders import jsonable_encoder
import redis

from app.core.config import settings
from app.utils.rate_limit import _redis_client


logger = logging.getLogger("medrad.read_cache")
T = TypeVar("T")
CacheScope = Literal["user", "shared"]

_metrics = Counter()
_metrics_lock = Lock()
_SKIP_ARGUMENTS = {"db", "current_user", "request"}


def _metric(name: str) -> None:
    with _metrics_lock:
        _metrics[name] += 1


def read_cache_metrics() -> dict[str, int]:
    """Return process-local observability counters without exposing cache data."""
    with _metrics_lock:
        return dict(_metrics)


def _scope_key(scope: CacheScope, current_user: Any) -> str | None:
    if scope == "shared":
        return "shared"
    if current_user is None or getattr(current_user, "id", None) is None:
        return None
    role = getattr(current_user, "role", "")
    role_value = getattr(role, "value", role)
    updated_at = getattr(current_user, "updated_at", None)
    # updated_at ensures permission or role changes naturally create a new
    # scope even before the old short-lived entry expires.
    return f"user:{current_user.id}:{role_value}:{updated_at or ''}"


def _canonical_parameters(bound_arguments: dict[str, Any]) -> str:
    safe = {
        key: jsonable_encoder(value)
        for key, value in bound_arguments.items()
        if key not in _SKIP_ARGUMENTS
    }
    return json.dumps(safe, sort_keys=True, separators=(",", ":"), default=str)


def _version(client: redis.Redis, namespace: str) -> str:
    return str(client.get(f"{settings.READ_CACHE_PREFIX}:version:{namespace}") or "0")


def _cache_key(client: redis.Redis, namespace: str, scope: str, parameters: str) -> str:
    digest = hashlib.sha256(f"{scope}|{parameters}".encode("utf-8")).hexdigest()
    return f"{settings.READ_CACHE_PREFIX}:data:{namespace}:v{_version(client, namespace)}:{digest}"


def _decode(raw: str | bytes | None) -> tuple[bool, Any]:
    if raw is None:
        return False, None
    try:
        payload = json.loads(raw)
        return True, payload["value"]
    except (TypeError, ValueError, KeyError):
        return False, None


def _store(client: redis.Redis, key: str, value: Any, ttl_seconds: int) -> None:
    payload = json.dumps(
        {"value": jsonable_encoder(value)},
        separators=(",", ":"),
        default=str,
    )
    # Small deterministic positive jitter prevents a popular page's related
    # keys from all expiring in the same millisecond.
    jitter_window = max(1, ttl_seconds // 5)
    jitter = int(hashlib.sha256(key.encode("utf-8")).hexdigest()[:4], 16) % jitter_window
    client.setex(key, ttl_seconds + jitter, payload)


def _load_cached(
    *,
    namespace: str,
    scope: str,
    parameters: str,
    ttl_seconds: int,
    loader: Callable[[], T],
) -> T:
    try:
        client = _redis_client()
        key = _cache_key(client, namespace, scope, parameters)
        found, value = _decode(client.get(key))
        if found:
            _metric("hits")
            return value
        _metric("misses")
    except redis.RedisError:
        _metric("redis_errors")
        return loader()

    lock = client.lock(
        f"{key}:lock",
        timeout=settings.READ_CACHE_LOCK_SECONDS,
        blocking_timeout=settings.READ_CACHE_LOCK_WAIT_MS / 1000,
    )
    acquired = False
    value_after_wait: Any = None
    found_after_wait = False
    try:
        acquired = bool(lock.acquire())
        if acquired:
            found_after_wait, value_after_wait = _decode(client.get(key))
            if found_after_wait:
                _metric("lock_hits")
        else:
            # The lock holder may have populated the entry while this request
            # was waiting. Recheck once before falling through to PostgreSQL.
            found_after_wait, value_after_wait = _decode(client.get(key))
            if found_after_wait:
                _metric("wait_hits")
    except redis.RedisError:
        _metric("redis_errors")
        return loader()

    if found_after_wait:
        if acquired:
            try:
                lock.release()
            except (redis.RedisError, redis.exceptions.LockError):
                _metric("lock_release_errors")
        return value_after_wait

    try:
        # Failure to acquire quickly never blocks a user-facing request. The
        # database remains the source of truth and concurrent loads are safe.
        result = loader()
        _metric("loads")
        if acquired:
            try:
                _store(client, key, result, ttl_seconds)
            except (redis.RedisError, TypeError, ValueError):
                _metric("store_errors")
        return result
    finally:
        if acquired:
            try:
                lock.release()
            except (redis.RedisError, redis.exceptions.LockError):
                _metric("lock_release_errors")


def cached_read(
    namespace: str,
    *,
    ttl_seconds: int | None = None,
    scope: CacheScope = "user",
) -> Callable[[Callable[..., T]], Callable[..., T]]:
    """Cache a safe synchronous endpoint without changing its FastAPI signature."""

    def decorator(function: Callable[..., T]) -> Callable[..., T]:
        signature = inspect.signature(function)

        @wraps(function)
        def wrapper(*args: Any, **kwargs: Any) -> T:
            if not settings.READ_CACHE_ENABLED:
                _metric("disabled")
                return function(*args, **kwargs)
            bound = signature.bind_partial(*args, **kwargs)
            cache_scope = _scope_key(scope, bound.arguments.get("current_user"))
            if cache_scope is None:
                _metric("unscoped_bypass")
                return function(*args, **kwargs)
            return _load_cached(
                namespace=namespace,
                scope=cache_scope,
                parameters=_canonical_parameters(bound.arguments),
                ttl_seconds=ttl_seconds or settings.READ_CACHE_DEFAULT_TTL_SECONDS,
                loader=lambda: function(*args, **kwargs),
            )

        return wrapper

    return decorator


def invalidate_read_cache(*namespaces: str) -> None:
    """Atomically make all existing keys in a namespace unreachable."""
    if not settings.READ_CACHE_ENABLED or not namespaces:
        return
    try:
        client = _redis_client()
        with client.pipeline(transaction=True) as pipe:
            for namespace in set(namespaces):
                pipe.incr(f"{settings.READ_CACHE_PREFIX}:version:{namespace}")
            pipe.execute()
        _metric("invalidations")
    except redis.RedisError:
        # Entries have short TTLs and Redis is never authoritative. Mutations
        # must succeed even when the acceleration layer is unavailable.
        _metric("invalidation_errors")


def mutation_cache_namespaces(path: str) -> tuple[str, ...]:
    """Map successful API mutations to only the dependent read namespaces."""
    prefixes: tuple[tuple[str, tuple[str, ...]], ...] = (
        ("/facilities", ("facilities", "users", "equipment", "dashboard")),
        ("/facility-users", ("facilities", "users", "equipment", "dashboard")),
        ("/users", ("users", "facilities", "dashboard")),
        ("/modalities", ("modalities", "equipment")),
        ("/tiers", ("tiers", "facilities", "equipment")),
        ("/equipment", ("equipment", "facilities", "dashboard")),
        ("/inventory", ("dashboard",)),
        ("/service-requests", ("dashboard",)),
        ("/inspections", ("dashboard",)),
        ("/rentals", ("dashboard",)),
        ("/sales", ("dashboard",)),
        ("/billing", ("dashboard",)),
    )
    normalized = path
    api_prefix = settings.API_V1_STR.rstrip("/")
    if normalized.startswith(api_prefix):
        normalized = normalized[len(api_prefix):]
    for prefix, namespaces in prefixes:
        if normalized == prefix or normalized.startswith(f"{prefix}/"):
            # The narrative is cached separately from the deterministic
            # dashboard data to avoid cross-endpoint key collisions. Any
            # mutation that invalidates dashboard KPIs must invalidate the
            # corresponding AI explanation as well.
            if "dashboard" in namespaces:
                return (*namespaces, "dashboard-ai")
            return namespaces
    return ()
