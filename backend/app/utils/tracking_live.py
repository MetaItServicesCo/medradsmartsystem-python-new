"""Live tracking data: where each tracked person is right now.

Kept in a separate, memory-capped Redis (TRACKING_REDIS_URL), expiring on its
own, never in the main Redis that holds sessions and rate limits. Losing it
costs nothing: it is only ever the latest position, and the evidence HR keeps
is in Postgres. Without TRACKING_REDIS_URL, or with Redis down, live data is
simply not kept and nothing else is affected.
"""
from __future__ import annotations

import json
import logging
import time
from functools import lru_cache
from typing import Any, Iterable, Optional

import redis

from app.core.config import settings

logger = logging.getLogger("medrad.tracking")

_LOCATION_KEY = "medrad:tracking:location:{user_id}"
_PRUNE_LOCK_KEY = "medrad:tracking:pruned"

# Live screen view (see app.api.v1.endpoints.tracking_screen): a desktop agent
# that is connected and allowed to stream holds SCREEN_AGENT_KEY; viewers sit in
# SCREEN_VIEWERS_KEY (a sorted set scored by when each one expires); frames go
# out on SCREEN_FRAMES_CHANNEL and are never stored.
SCREEN_AGENT_KEY = "medrad:tracking:screen:agent:{user_id}"
SCREEN_VIEWERS_KEY = "medrad:tracking:screen:viewers:{user_id}"
SCREEN_FRAMES_CHANNEL = "medrad:tracking:screen:frames:{user_id}"


def screens_live(user_ids: Iterable[int]) -> set[int]:
    """Who has a desktop agent connected for live screen view right now."""
    client = _client()
    ids = list(user_ids)
    if client is None or not ids:
        return set()
    try:
        values = client.mget([SCREEN_AGENT_KEY.format(user_id=user_id) for user_id in ids])
    except redis.RedisError:
        return set()
    return {user_id for user_id, value in zip(ids, values) if value}


@lru_cache(maxsize=1)
def _client() -> Optional[redis.Redis]:
    if not settings.TRACKING_REDIS_URL:
        return None
    return redis.Redis.from_url(
        settings.TRACKING_REDIS_URL,
        decode_responses=True,
        socket_connect_timeout=0.25,
        socket_timeout=0.25,
    )


def set_live_location(user_id: int, location: dict[str, Any]) -> None:
    client = _client()
    if client is None:
        return
    try:
        client.setex(
            _LOCATION_KEY.format(user_id=user_id),
            settings.TRACKING_LIVE_LOCATION_TTL_SECONDS,
            json.dumps(location, default=str),
        )
    except redis.RedisError:
        logger.warning("Live location not stored for user %s: tracking Redis unavailable", user_id)


def live_locations(user_ids: Iterable[int]) -> dict[int, dict[str, Any]]:
    client = _client()
    ids = list(user_ids)
    if client is None or not ids:
        return {}
    try:
        values = client.mget([_LOCATION_KEY.format(user_id=user_id) for user_id in ids])
    except redis.RedisError:
        return {}
    return {user_id: json.loads(value) for user_id, value in zip(ids, values) if value}


def clear_live_location(user_id: int) -> None:
    client = _client()
    if client is None:
        return
    try:
        client.delete(_LOCATION_KEY.format(user_id=user_id))
    except redis.RedisError:
        pass


_last_local_prune = 0.0


def claim_daily_prune() -> bool:
    """True for the one caller per day that should prune old evidence.

    With the tracking Redis that is one caller across every process. Without
    it, one per process per day - pruning is idempotent, so a second process
    pruning the same day only costs a query.
    """
    global _last_local_prune
    client = _client()
    if client is None:
        now = time.monotonic()
        if _last_local_prune and now - _last_local_prune < 24 * 60 * 60:
            return False
        _last_local_prune = now
        return True
    try:
        return bool(client.set(_PRUNE_LOCK_KEY, "1", nx=True, ex=24 * 60 * 60))
    except redis.RedisError:
        return False
