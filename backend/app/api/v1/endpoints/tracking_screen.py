"""Live screen view: the super admin watches a tracked person's screen.

The same protocol as Tracker, so its desktop agent only needs MedRad's address:

  * While the person is checked in, the agent keeps a WebSocket open here,
    signed in with its device token. It captures nothing.
  * When a super admin opens a view, the agent is told {"cmd":"start"} and sends
    JPEG frames a few times a second. When the last viewer leaves it is told
    {"cmd":"stop"} and captures nothing again.
  * Frames are relayed, never stored. Every view is written to the audit log.

MedRad runs several API workers and the agent and the viewer may land on
different ones, so presence, viewers and frames go through the tracking Redis.
Without it there is no live screen view; nothing else is affected.

Allowed only while the screen-view switch is on, the person has consented to
it, and they are checked in - checked again every half minute while streaming.
"""
from __future__ import annotations

import asyncio
import contextlib
import json
import logging
import time
import uuid
from typing import Optional

import redis.asyncio as async_redis
from fastapi import APIRouter, WebSocket
from redis.exceptions import RedisError
from starlette.concurrency import run_in_threadpool

from app.api.v1.endpoints.tracking import (
    _has_consented_to,
    _is_on_shift,
    _setting_for,
    device_from_authorization,
    device_is_valid,
)
from app.api.v1.endpoints.websocket import get_user_from_token
from app.core.config import settings
from app.db.base import SessionLocal
from app.models.tracking import TrackingDevice
from app.models.user import User, UserRole
from app.utils.facility_access import is_facility_scoped_user
from app.utils.logging import log_activity
from app.utils.tracking_live import SCREEN_AGENT_KEY, SCREEN_FRAMES_CHANNEL, SCREEN_VIEWERS_KEY

logger = logging.getLogger("medrad.tracking")
router = APIRouter()

CMD_START = '{"cmd":"start"}'
CMD_STOP = '{"cmd":"stop"}'

WS_UNAUTHORIZED = 4401
WS_FORBIDDEN = 4403
WS_NOT_LIVE = 4404  # the person's agent is not connected
WS_AGENT_GONE = 4410  # the agent went away mid-view
WS_UNAVAILABLE = 4503  # no tracking Redis configured or reachable

AGENT_TTL_SECONDS = 30
VIEWER_TTL_SECONDS = 15
TICK_SECONDS = 2.0
VIEWER_HEARTBEAT_SECONDS = 5.0
RECHECK_SECONDS = 30.0
MAX_FRAME_BYTES = 2 * 1024 * 1024
MIN_FRAME_GAP_SECONDS = 0.15  # at most ~6 frames a second, whatever the agent sends


def _redis() -> async_redis.Redis:
    return async_redis.Redis.from_url(
        settings.TRACKING_REDIS_URL, socket_connect_timeout=1, health_check_interval=20,
    )


async def _close(ws: WebSocket, code: int) -> None:
    with contextlib.suppress(Exception):
        await ws.close(code=code)


# ---------------------------------------------------------------- permission checks (sync, in a thread)


def _screen_allowed(db, user_id: int) -> bool:
    setting = _setting_for(db, user_id)
    return (
        setting is not None
        and bool(setting.screen_view)
        and _has_consented_to(setting, "screen_view")
        and _is_on_shift(db, user_id)
    )


def _authorize_agent(authorization: Optional[str]) -> tuple[Optional[int], Optional[int], int]:
    """(device id, user id, 0) for an agent allowed to stream, or (None, None, close code)."""
    db = SessionLocal()
    try:
        device = device_from_authorization(db, authorization)
        if device is None:
            return None, None, WS_UNAUTHORIZED
        if device.kind != "desktop" or not _screen_allowed(db, device.user_id):
            return None, None, WS_FORBIDDEN
        return device.id, device.user_id, 0
    finally:
        db.close()


def _agent_still_allowed(device_id: int) -> bool:
    db = SessionLocal()
    try:
        device = db.query(TrackingDevice).filter(TrackingDevice.id == device_id).first()
        if device is None:
            return False
        user = db.query(User).filter(User.id == device.user_id).first()
        return device_is_valid(device, user) and _screen_allowed(db, device.user_id)
    finally:
        db.close()


def _authorize_viewer(token: str, user_id: int) -> tuple[Optional[int], int]:
    """(viewer id, 0) for a super admin allowed to watch this person, or (None, close code)."""
    viewer_id = get_user_from_token(token)
    if viewer_id is None:
        return None, WS_UNAUTHORIZED
    db = SessionLocal()
    try:
        viewer = db.query(User).filter(User.id == viewer_id).first()
        if viewer is None or viewer.role != UserRole.SUPERADMIN:
            return None, WS_FORBIDDEN
        target = db.query(User).filter(User.id == user_id).first()
        if target is None or is_facility_scoped_user(target) or not _screen_allowed(db, user_id):
            return None, WS_FORBIDDEN
        return viewer_id, 0
    finally:
        db.close()


def _audit(viewer_id: int, user_id: int, action: str, changes: dict) -> None:
    db = SessionLocal()
    try:
        viewer = db.query(User).filter(User.id == viewer_id).first()
        log_activity(db, "users", user_id, action, viewer, changes)
        db.commit()
    except Exception:
        logger.exception("Could not write the screen view to the audit log")
        db.rollback()
    finally:
        db.close()


# ---------------------------------------------------------------- the agent


@router.websocket("/ws/tracking/agent")
async def agent_stream(ws: WebSocket) -> None:
    if not settings.TRACKING_REDIS_URL:
        await _close(ws, WS_UNAVAILABLE)
        return
    device_id, user_id, refusal = await run_in_threadpool(_authorize_agent, ws.headers.get("authorization"))
    if refusal:
        await _close(ws, refusal)
        return

    client = _redis()
    agent_key = SCREEN_AGENT_KEY.format(user_id=user_id)
    viewers_key = SCREEN_VIEWERS_KEY.format(user_id=user_id)
    channel = SCREEN_FRAMES_CHANNEL.format(user_id=user_id)
    marker = f"{device_id}:{uuid.uuid4().hex}"
    state = {"viewing": False, "last_frame": 0.0}
    try:
        await client.set(agent_key, marker, ex=AGENT_TTL_SECONDS)
    except RedisError:
        await client.aclose()
        await _close(ws, WS_UNAVAILABLE)
        return
    await ws.accept()

    async def receive() -> str:
        while True:
            message = await ws.receive()
            if message["type"] == "websocket.disconnect":
                return "disconnected"
            frame = message.get("bytes")
            if not frame or not state["viewing"] or len(frame) > MAX_FRAME_BYTES:
                continue
            now = time.monotonic()
            if now - state["last_frame"] < MIN_FRAME_GAP_SECONDS:
                continue
            state["last_frame"] = now
            with contextlib.suppress(RedisError):
                await client.publish(channel, frame)

    async def tick() -> str:
        last_check = time.monotonic()
        while True:
            # Stay present, and start or stop capture as viewers come and go.
            await client.set(agent_key, marker, ex=AGENT_TTL_SECONDS)
            watching = await client.zcount(viewers_key, time.time(), "+inf") > 0
            if watching != state["viewing"]:
                state["viewing"] = watching
                await ws.send_text(CMD_START if watching else CMD_STOP)
            if time.monotonic() - last_check >= RECHECK_SECONDS:
                last_check = time.monotonic()
                if not await run_in_threadpool(_agent_still_allowed, device_id):
                    return "forbidden"
            await asyncio.sleep(TICK_SECONDS)

    tasks = [asyncio.create_task(receive()), asyncio.create_task(tick())]
    outcome = "disconnected"
    try:
        done, pending = await asyncio.wait(tasks, return_when=asyncio.FIRST_COMPLETED)
        for task in pending:
            task.cancel()
        for task in done:
            outcome = task.result() if task.exception() is None else "error"
    finally:
        for task in tasks:
            task.cancel()
        with contextlib.suppress(RedisError):
            # Only clear presence if a newer connection has not replaced this one.
            if await client.get(agent_key) == marker.encode():
                await client.delete(agent_key)
        await client.aclose()
    if outcome == "forbidden":
        await _close(ws, WS_FORBIDDEN)
    elif outcome != "disconnected":
        await _close(ws, 1011)


# ---------------------------------------------------------------- the viewer


@router.websocket("/ws/tracking/view/{user_id}/{token}")
async def view_screen(ws: WebSocket, user_id: int, token: str) -> None:
    if not settings.TRACKING_REDIS_URL:
        await _close(ws, WS_UNAVAILABLE)
        return
    viewer_id, refusal = await run_in_threadpool(_authorize_viewer, token, user_id)
    if refusal:
        await _close(ws, refusal)
        return

    client = _redis()
    agent_key = SCREEN_AGENT_KEY.format(user_id=user_id)
    viewers_key = SCREEN_VIEWERS_KEY.format(user_id=user_id)
    channel = SCREEN_FRAMES_CHANNEL.format(user_id=user_id)
    member = f"{viewer_id}:{uuid.uuid4().hex}"
    try:
        live = await client.exists(agent_key)
    except RedisError:
        await client.aclose()
        await _close(ws, WS_UNAVAILABLE)
        return
    if not live:
        await client.aclose()
        await _close(ws, WS_NOT_LIVE)
        return

    pubsub = client.pubsub(ignore_subscribe_messages=True)
    await pubsub.subscribe(channel)
    await client.zadd(viewers_key, {member: time.time() + VIEWER_TTL_SECONDS})
    await ws.accept()
    started = time.monotonic()
    await run_in_threadpool(_audit, viewer_id, user_id, "TRACKING_SCREEN_VIEW_STARTED", {"user_id": user_id})
    await ws.send_text(json.dumps({"status": "viewing"}))

    async def forward() -> str:
        while True:
            message = await pubsub.get_message(timeout=1.0)
            if message and message.get("type") == "message":
                await ws.send_bytes(message["data"])

    async def heartbeat() -> str:
        while True:
            await asyncio.sleep(VIEWER_HEARTBEAT_SECONDS)
            now = time.time()
            await client.zadd(viewers_key, {member: now + VIEWER_TTL_SECONDS})
            await client.zremrangebyscore(viewers_key, "-inf", now)
            if not await client.exists(agent_key):
                return "agent_gone"

    async def receive() -> str:
        while True:
            message = await ws.receive()
            if message["type"] == "websocket.disconnect":
                return "disconnected"
            # The viewer only watches; anything it sends is ignored.

    tasks = [asyncio.create_task(forward()), asyncio.create_task(heartbeat()), asyncio.create_task(receive())]
    outcome = "disconnected"
    try:
        done, pending = await asyncio.wait(tasks, return_when=asyncio.FIRST_COMPLETED)
        for task in done:
            outcome = task.result() if task.exception() is None else "error"
    finally:
        for task in tasks:
            task.cancel()
        with contextlib.suppress(RedisError):
            await client.zrem(viewers_key, member)
            await pubsub.unsubscribe(channel)
            await pubsub.aclose()
        await client.aclose()
        await run_in_threadpool(
            _audit, viewer_id, user_id, "TRACKING_SCREEN_VIEW_ENDED",
            {"user_id": user_id, "seconds": round(time.monotonic() - started)},
        )
    if outcome == "agent_gone":
        await _close(ws, WS_AGENT_GONE)
    elif outcome != "disconnected":
        await _close(ws, 1011)
