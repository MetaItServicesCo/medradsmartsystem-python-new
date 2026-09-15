import json
import asyncio
import contextlib
import logging
import time
import uuid
from typing import Dict
from datetime import datetime

from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Depends
import redis.asyncio as async_redis
from redis.exceptions import RedisError
from sqlalchemy.orm import Session
from jose import JWTError
from starlette.concurrency import run_in_threadpool

from app.core.config import settings
from app.core.security import decode_token, password_token_version
from app.db.base import SessionLocal
from app.models.user import User
from app.models.chat import DirectMessage, WorkspaceMember
from app.services import chat_messages
from app.services.chat_messages import Attachment, ChatError
from app.utils.token_revocation import access_token_is_revoked
from app.utils.notifications import create_notification

router = APIRouter()
logger = logging.getLogger("medrad.realtime")


class ConnectionManager:
    """Redis-backed WebSocket routing with process-local socket ownership.

    WebSocket objects never leave their worker. Redis carries small routing
    envelopes between workers and a TTL-backed sorted set provides presence.
    This makes multiple API workers safe while preserving the existing client
    message contract.
    """

    def __init__(self):
        self.active_connections: Dict[int, Dict[str, WebSocket]] = {}
        self._send_locks: Dict[str, asyncio.Lock] = {}
        self._instance_id = uuid.uuid4().hex
        self._redis = None
        self._pubsub = None
        self._listener_task: asyncio.Task | None = None
        self._heartbeat_task: asyncio.Task | None = None
        self._start_lock: asyncio.Lock | None = None
        self._channel = f"{settings.WEBSOCKET_CHANNEL_PREFIX}:events"
        self._presence_key = f"{settings.WEBSOCKET_CHANNEL_PREFIX}:presence"
        self._presence_ttl = settings.WEBSOCKET_PRESENCE_TTL_SECONDS

    async def start(self) -> bool:
        if self._redis is not None and self._listener_task and not self._listener_task.done():
            return True
        if self._start_lock is None:
            self._start_lock = asyncio.Lock()
        async with self._start_lock:
            if self._redis is not None and self._listener_task and not self._listener_task.done():
                return True
            try:
                client = async_redis.Redis.from_url(
                    settings.REDIS_URL,
                    decode_responses=True,
                    socket_connect_timeout=1,
                    health_check_interval=20,
                )
                await client.ping()
                pubsub = client.pubsub(ignore_subscribe_messages=True)
                await pubsub.subscribe(self._channel)
                self._redis = client
                self._pubsub = pubsub
                self._listener_task = asyncio.create_task(
                    self._listen(), name=f"realtime-listener-{self._instance_id[:8]}"
                )
                self._heartbeat_task = asyncio.create_task(
                    self._heartbeat(), name=f"realtime-heartbeat-{self._instance_id[:8]}"
                )
                return True
            except RedisError:
                logger.exception("Redis realtime backplane unavailable; using local delivery")
                await self._close_redis()
                return False

    async def close(self) -> None:
        tasks = [task for task in (self._listener_task, self._heartbeat_task) if task]
        for task in tasks:
            task.cancel()
        for task in tasks:
            with contextlib.suppress(asyncio.CancelledError):
                await task
        if self._redis is not None:
            members = [
                self._presence_member(user_id, connection_id)
                for user_id, connections in self.active_connections.items()
                for connection_id in connections
            ]
            if members:
                with contextlib.suppress(RedisError):
                    await self._redis.zrem(self._presence_key, *members)
        await self._close_redis()

    async def _close_redis(self) -> None:
        if self._pubsub is not None:
            with contextlib.suppress(Exception):
                await self._pubsub.aclose()
        if self._redis is not None:
            with contextlib.suppress(Exception):
                await self._redis.aclose()
        self._pubsub = None
        self._redis = None
        self._listener_task = None
        self._heartbeat_task = None

    def _presence_member(self, user_id: int, connection_id: str) -> str:
        return f"{user_id}:{self._instance_id}:{connection_id}"

    async def _touch_presence(self, user_id: int, connection_id: str) -> None:
        if self._redis is None:
            return
        await self._redis.zadd(
            self._presence_key,
            {self._presence_member(user_id, connection_id): time.time() + self._presence_ttl},
        )

    async def _heartbeat(self) -> None:
        interval = max(5, self._presence_ttl // 3)
        while True:
            await asyncio.sleep(interval)
            if self._redis is None:
                continue
            try:
                pipeline = self._redis.pipeline(transaction=False)
                expires_at = time.time() + self._presence_ttl
                for user_id, connections in list(self.active_connections.items()):
                    for connection_id in list(connections):
                        pipeline.zadd(
                            self._presence_key,
                            {self._presence_member(user_id, connection_id): expires_at},
                        )
                pipeline.zremrangebyscore(self._presence_key, "-inf", time.time())
                await pipeline.execute()
            except RedisError:
                logger.warning("Could not refresh realtime presence", exc_info=True)

    async def _listen(self) -> None:
        # This task is the only way messages published by another worker reach
        # people connected to this one. It used to stop on any error it did not
        # expect, after which this worker's users silently received nothing, so
        # it now logs, pauses and carries on until it is cancelled.
        while True:
            try:
                event = await self._pubsub.get_message(timeout=1.0)
                if event and event.get("type") == "message":
                    envelope = json.loads(event["data"])
                    await self._deliver_local(
                        envelope.get("message", {}),
                        target_user_ids=envelope.get("target_user_ids"),
                        exclude_user_id=envelope.get("exclude_user_id"),
                    )
            except asyncio.CancelledError:
                raise
            except (RedisError, json.JSONDecodeError, TypeError):
                logger.warning("Invalid or unavailable realtime event", exc_info=True)
                await asyncio.sleep(0.25)
            except Exception:
                logger.exception("Realtime listener error; continuing")
                await asyncio.sleep(1)

    async def _publish(
        self,
        message: dict,
        *,
        target_user_ids: list[int] | None = None,
        exclude_user_id: int | None = None,
    ) -> None:
        if await self.start() and self._redis is not None:
            try:
                await self._redis.publish(
                    self._channel,
                    json.dumps(
                        {
                            "origin": self._instance_id,
                            "message": message,
                            "target_user_ids": target_user_ids,
                            "exclude_user_id": exclude_user_id,
                        },
                        default=str,
                    ),
                )
                return
            except RedisError:
                logger.warning("Realtime publish failed; using local delivery", exc_info=True)
        await self._deliver_local(
            message,
            target_user_ids=target_user_ids,
            exclude_user_id=exclude_user_id,
        )

    async def _send_socket(self, connection_id: str, websocket: WebSocket, message: dict) -> bool:
        try:
            lock = self._send_locks.setdefault(connection_id, asyncio.Lock())
            async with lock:
                await websocket.send_json(message)
            return True
        except Exception:
            return False

    async def _deliver_local(
        self,
        message: dict,
        *,
        target_user_ids: list[int] | None = None,
        exclude_user_id: int | None = None,
    ) -> None:
        targets = set(target_user_ids) if target_user_ids is not None else None
        deliveries = []
        sockets = []
        for user_id, connections in list(self.active_connections.items()):
            if user_id == exclude_user_id or (targets is not None and user_id not in targets):
                continue
            for connection_id, websocket in list(connections.items()):
                sockets.append((user_id, connection_id, websocket))
                deliveries.append(self._send_socket(connection_id, websocket, message))
        if not deliveries:
            return
        results = await asyncio.gather(*deliveries)
        for (user_id, _, websocket), delivered in zip(sockets, results):
            if not delivered:
                await self.disconnect(user_id, websocket)

    async def connect(self, user_id: int, websocket: WebSocket):
        await self.start()
        was_online = await self.is_online(user_id)
        await websocket.accept()
        connection_id = uuid.uuid4().hex
        self.active_connections.setdefault(user_id, {})[connection_id] = websocket
        self._send_locks[connection_id] = asyncio.Lock()
        if self._redis is not None:
            try:
                await self._touch_presence(user_id, connection_id)
            except RedisError:
                logger.warning("Could not register realtime presence", exc_info=True)
        if not was_online:
            await self.broadcast_presence(user_id, True)

    async def disconnect(self, user_id: int, websocket: WebSocket | None = None):
        connections = self.active_connections.get(user_id, {})
        removed_ids = [
            connection_id
            for connection_id, candidate in list(connections.items())
            if websocket is None or candidate is websocket
        ]
        for connection_id in removed_ids:
            connections.pop(connection_id, None)
            self._send_locks.pop(connection_id, None)
            if self._redis is not None:
                with contextlib.suppress(RedisError):
                    await self._redis.zrem(
                        self._presence_key, self._presence_member(user_id, connection_id)
                    )
        if not connections:
            self.active_connections.pop(user_id, None)
        if removed_ids and not await self.is_online(user_id):
            await self.broadcast_presence(user_id, False)

    async def send_to_user(self, user_id: int, message: dict):
        await self._publish(message, target_user_ids=[user_id])

    async def send_to_users(self, user_ids: list[int], message: dict):
        await self._publish(message, target_user_ids=list(user_ids))

    async def broadcast_to_workspace(self, workspace_id: int, message: dict, db: Session):
        members = db.query(WorkspaceMember).filter(
            WorkspaceMember.workspace_id == workspace_id
        ).all()
        await self._publish(message, target_user_ids=list({m.user_id for m in members}))

    async def broadcast_presence(self, user_id: int, is_online: bool):
        msg = {
            "type": "presence",
            "user_id": user_id,
            "is_online": is_online,
        }
        await self._publish(msg, exclude_user_id=user_id)

    async def is_online(self, user_id: int) -> bool:
        if self.active_connections.get(user_id):
            return True
        if self._redis is None:
            return False
        try:
            await self._redis.zremrangebyscore(self._presence_key, "-inf", time.time())
            members = await self._redis.zrangebyscore(self._presence_key, time.time(), "+inf")
            prefix = f"{user_id}:"
            return any(member.startswith(prefix) for member in members)
        except RedisError:
            return False

    async def get_online_users(self) -> list[int]:
        users = {user_id for user_id, connections in self.active_connections.items() if connections}
        if self._redis is not None:
            try:
                await self._redis.zremrangebyscore(self._presence_key, "-inf", time.time())
                members = await self._redis.zrangebyscore(self._presence_key, time.time(), "+inf")
                users.update(int(member.split(":", 1)[0]) for member in members)
            except (RedisError, ValueError):
                logger.warning("Could not read shared realtime presence", exc_info=True)
        return sorted(users)


manager = ConnectionManager()


def get_user_from_token(token: str) -> int | None:
    """Extract user_id from JWT token."""
    try:
        payload = decode_token(token)
        if payload.get("token_type") != "access" or access_token_is_revoked(payload):
            return None
        username = payload.get("sub")
        if not username:
            return None
        db = SessionLocal()
        try:
            user = db.query(User).filter(User.username == username).first()
            if not user or not user.is_active:
                return None
            if payload.get("ver") != password_token_version(user.hashed_password):
                return None
            return user.id
        finally:
            db.close()
    except JWTError:
        return None


@router.websocket("/ws/{token}")
async def websocket_endpoint(websocket: WebSocket, token: str):
    """Main WebSocket endpoint for real-time communication."""
    user_id = await run_in_threadpool(get_user_from_token, token)
    if user_id is None:
        # Accept before closing: a socket closed during the handshake reaches the
        # browser as a generic failure, and it would retry the same dead token
        # forever. Code 4001 tells it to stop until the user signs in again.
        await websocket.accept()
        await websocket.close(code=4001, reason="Invalid token")
        return

    await manager.connect(user_id, websocket)

    try:
        await websocket.send_json({
            "type": "online_users",
            "users": await manager.get_online_users(),
        })

        while True:
            raw = await websocket.receive_text()
            await _handle_frame(user_id, websocket, raw)
    except WebSocketDisconnect:
        await manager.disconnect(user_id, websocket)
    except Exception:
        logger.warning("Realtime connection for user %s ended unexpectedly", user_id, exc_info=True)
        await manager.disconnect(user_id, websocket)


async def _handle_frame(user_id: int, websocket: WebSocket, raw: str) -> None:
    """One frame from the browser. A bad or failing frame is answered with an
    error on this socket; it no longer takes the whole connection down."""
    try:
        data = json.loads(raw)
        if not isinstance(data, dict):
            raise ValueError("expected an object")
    except ValueError:
        await websocket.send_json({"type": "error", "detail": "Unreadable message"})
        return
    if data.get("type") == "ping":
        # The heartbeat that keeps proxies and CDNs from closing an idle socket.
        await websocket.send_json({"type": "pong"})
        return
    try:
        await handle_message(user_id, data)
    except ChatError as exc:
        await websocket.send_json({"type": "error", "detail": exc.detail, "client_id": data.get("client_id")})
    except Exception:
        logger.exception("Realtime message of type %s from user %s failed", data.get("type"), user_id)
        await websocket.send_json({"type": "error", "detail": "That could not be delivered",
                                   "client_id": data.get("client_id")})


async def handle_message(sender_id: int, data: dict):
    """Route incoming WebSocket messages by type."""
    msg_type = data.get("type")

    if msg_type == "chat_message":
        await handle_chat_message(sender_id, data)
    elif msg_type == "workspace_message":
        await handle_workspace_message(sender_id, data)
    elif msg_type == "typing":
        await handle_typing(sender_id, data)
    elif msg_type == "read_receipt":
        await handle_read_receipt(sender_id, data)
    elif msg_type in ("call_offer", "call_answer", "ice_candidate", "call_end", "call_reject"):
        await handle_call_signal(sender_id, data)
    elif msg_type == "get_online_users":
        await manager.send_to_user(sender_id, {
            "type": "online_users",
            "users": await manager.get_online_users(),
        })


def _as_id(value) -> int | None:
    try:
        number = int(value)
    except (TypeError, ValueError):
        return None
    return number if number > 0 else None


async def handle_chat_message(sender_id: int, data: dict):
    """Save a direct message sent over the socket and deliver it to both people.

    The browser now sends through the REST endpoint, which reports success;
    this stays for pages still open from before, and applies the same checks.
    """
    receiver_id = _as_id(data.get("receiver_id"))
    if receiver_id is None:
        raise ChatError(422, "Choose who to send it to")
    outgoing = await run_in_threadpool(_persist_direct_message, sender_id, receiver_id, data)
    await manager.send_to_users([receiver_id, sender_id], outgoing)


def _persist_direct_message(sender_id: int, receiver_id: int, data: dict) -> dict:
    """Persist a direct message off the async WebSocket event loop."""
    db = SessionLocal()
    try:
        sender = db.get(User, sender_id)
        message = chat_messages.send_direct(
            db, sender, receiver_id, content=data.get("content"), message_type=data.get("message_type"),
            attachment=Attachment(data.get("file_url"), data.get("file_name"), data.get("file_size"),
                                  data.get("file_type")),
        )
        return chat_messages.direct_payload(message)
    finally:
        db.close()


async def handle_workspace_message(sender_id: int, data: dict):
    """Save a workspace message sent over the socket and deliver it to the members."""
    workspace_id = _as_id(data.get("workspace_id"))
    if workspace_id is None:
        raise ChatError(422, "Choose a workspace")
    outgoing, member_ids = await run_in_threadpool(_persist_workspace_message, sender_id, workspace_id, data)
    await manager.send_to_users(member_ids, outgoing)


def _persist_workspace_message(sender_id: int, workspace_id: int, data: dict) -> tuple[dict, list[int]]:
    """Persist a workspace message and resolve recipients off-loop."""
    db = SessionLocal()
    try:
        sender = db.get(User, sender_id)
        message = chat_messages.send_to_workspace(
            db, sender, workspace_id, content=data.get("content"), message_type=data.get("message_type"),
            attachment=Attachment(data.get("file_url"), data.get("file_name"), data.get("file_size"),
                                  data.get("file_type")),
        )
        return chat_messages.workspace_payload(message, sender), chat_messages.member_ids(db, workspace_id)
    finally:
        db.close()


def _workspace_member_ids(workspace_id: int, *, exclude_user_id: int | None = None) -> list[int]:
    db = SessionLocal()
    try:
        return list({
            member.user_id
            for member in db.query(WorkspaceMember).filter(
                WorkspaceMember.workspace_id == workspace_id
            ).all()
            if member.user_id != exclude_user_id
        })
    finally:
        db.close()


async def handle_typing(sender_id: int, data: dict):
    """Relay typing indicator to the other user."""
    receiver_id = _as_id(data.get("receiver_id"))
    workspace_id = _as_id(data.get("workspace_id"))

    indicator = {
        "type": "typing",
        "sender_id": sender_id,
        "is_typing": data.get("is_typing", True),
    }

    if receiver_id:
        await manager.send_to_user(receiver_id, indicator)
    elif workspace_id:
        indicator["workspace_id"] = workspace_id
        member_ids = await run_in_threadpool(
            _workspace_member_ids, workspace_id, exclude_user_id=sender_id
        )
        await manager._publish(indicator, target_user_ids=member_ids)


async def handle_read_receipt(sender_id: int, data: dict):
    """Mark messages as read and notify sender."""
    message_ids = [i for i in (_as_id(v) for v in data.get("message_ids") or []) if i]
    from_user_id = _as_id(data.get("from_user_id"))

    if not message_ids:
        return

    await run_in_threadpool(_mark_messages_read, sender_id, message_ids)

    if from_user_id:
        await manager.send_to_user(from_user_id, {
            "type": "read_receipt",
            "reader_id": sender_id,
            "message_ids": message_ids,
        })


def _mark_messages_read(sender_id: int, message_ids: list[int]) -> None:
    db = SessionLocal()
    try:
        now = datetime.utcnow()
        db.query(DirectMessage).filter(
            DirectMessage.id.in_(message_ids),
            DirectMessage.receiver_id == sender_id,
        ).update({"read_at": now}, synchronize_session=False)
        db.commit()
    finally:
        db.close()


async def handle_call_signal(sender_id: int, data: dict):
    """Relay WebRTC signaling messages (offer, answer, ICE candidates, end)."""
    target_id = _as_id(data.get("target_id"))
    if target_id is None:
        return

    data["sender_id"] = sender_id
    if data.get("type") == "call_offer":
        sender_name, sender_avatar = await run_in_threadpool(
            _record_incoming_call, sender_id, target_id, data.get("call_type", "voice")
        )
        data["sender_name"] = sender_name
        data["sender_avatar"] = sender_avatar
    await manager.send_to_user(target_id, data)


def _record_incoming_call(sender_id: int, target_id: int, call_type: str):
    db = SessionLocal()
    try:
        sender = db.query(User).filter(User.id == sender_id).first()
        sender_name = sender.full_name if sender else None
        sender_avatar = sender.avatar_url if sender else None
        create_notification(
            db,
            user_id=target_id,
            title="Incoming call",
            message=f"{sender_name or 'Someone'} started a {call_type} call.",
            notification_type="chat",
            link_url="/chat",
            actor_id=sender_id,
        )
        db.commit()
        return sender_name, sender_avatar
    finally:
        db.close()
