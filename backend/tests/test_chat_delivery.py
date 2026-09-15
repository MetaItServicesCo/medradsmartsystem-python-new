"""Prove two people can chat, reliably, whichever way a message travels.

A message is checked the same way over REST and over the socket: a friend who
exists, words or an uploaded file, a known type. Sending over REST delivers it
to both people at once. History is the newest page, oldest first, and pages
back. Reading marks messages read and tells the sender. A bad socket frame is
answered with an error and never drops the connection, a rejected token closes
with 4001, and the Redis listener survives errors it did not expect.

    DATABASE_URL=sqlite:// python backend/tests/test_chat_delivery.py
"""
from __future__ import annotations

import asyncio
import json
import os
import pathlib
import sys

os.environ.setdefault("DATABASE_URL", "sqlite://")
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))

import anyio  # noqa: E402
import anyio.to_thread  # noqa: E402
from fastapi import HTTPException  # noqa: E402
from sqlalchemy import create_engine  # noqa: E402
from sqlalchemy.orm import sessionmaker  # noqa: E402
from sqlalchemy.pool import StaticPool  # noqa: E402

import app.models  # noqa: E402,F401
from app.api.v1.endpoints import chat as chat_api  # noqa: E402
from app.api.v1.endpoints import websocket as socket_api  # noqa: E402
from app.db.base import Base  # noqa: E402
from app.models.chat import (  # noqa: E402
    DirectMessage, FriendRequest, FriendRequestStatus, Workspace, WorkspaceMember, WorkspaceMessage,
)
from app.models.notification import Notification  # noqa: E402
from app.models.user import User, UserRole, UserType  # noqa: E402
from app.schemas.chat import DirectMessageCreate, FriendRequestCreate, WorkspaceMessageCreate  # noqa: E402
from app.services import chat_messages, realtime  # noqa: E402
from app.services.chat_messages import Attachment, ChatError  # noqa: E402

engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
Session = sessionmaker(bind=engine)
FILE = "/api/v1/chat/files/0f1e2d3c4b5a.pdf"


def build():
    Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)
    db = Session()

    def person(username, active=True):
        user = User(username=username, email=f"{username}@x.c", full_name=username.title(), hashed_password="x",
                    user_type=UserType.EMPLOYEE, role=UserRole.TECHNICIAN, is_active=active)
        db.add(user)
        db.flush()
        return user

    people = {name: person(name) for name in ("amna", "bilal", "chen")}
    people["gone"] = person("gone", active=False)
    db.add(FriendRequest(sender_id=people["amna"].id, receiver_id=people["bilal"].id, status=FriendRequestStatus.ACCEPTED))
    db.add(FriendRequest(sender_id=people["amna"].id, receiver_id=people["gone"].id, status=FriendRequestStatus.ACCEPTED))
    db.commit()
    return db, people


class Events:
    """Stands in for realtime delivery and records who was told what."""

    def __init__(self):
        self.sent = []
        self._original = realtime.notify_users

    def __enter__(self):
        realtime.notify_users = lambda ids, message: self.sent.append((sorted(set(ids)), message))
        return self

    def __exit__(self, *exc):
        realtime.notify_users = self._original

    def of_type(self, kind):
        return [(ids, message) for ids, message in self.sent if message.get("type") == kind]


def refused(call, status):
    try:
        call()
    except (HTTPException, ChatError) as exc:
        code = getattr(exc, "status_code", None) or exc.status
        assert code == status, f"expected {status}, got {code}: {exc.detail}"
        return exc.detail
    raise AssertionError(f"expected a {status} refusal")


def test_a_message_needs_words_or_a_file_and_a_friend_who_is_there():
    db, people = build()
    amna, bilal, chen, gone = people["amna"], people["bilal"], people["chen"], people["gone"]

    def send(to, **kwargs):
        kwargs.setdefault("content", "hello")
        return chat_messages.send_direct(db, amna, to.id, **kwargs)

    refused(lambda: send(amna), 400)
    refused(lambda: send(gone), 404)
    assert "friends" in refused(lambda: send(chen), 403)
    refused(lambda: send(bilal, content="   "), 422)
    refused(lambda: send(bilal, message_type="shout"), 422)
    refused(lambda: send(bilal, content="x" * 5001), 422)
    refused(lambda: send(bilal, message_type="file", attachment=Attachment("https://evil.example/x.exe", "x.exe")), 422)
    refused(lambda: send(bilal, attachment=Attachment(FILE, "plan.pdf")), 422)
    assert db.query(DirectMessage).count() == 0, "refusals save nothing"

    file_message = send(bilal, content="", message_type="file", attachment=Attachment(FILE, "plan.pdf", 2048, "application/pdf"))
    assert (file_message.content, file_message.file_url, file_message.file_size) == ("📎 plan.pdf", FILE, 2048)
    note = db.query(Notification).filter_by(user_id=bilal.id).one()
    assert note.link_url == f"/chat?user={amna.id}", "the notification opens the conversation"
    db.close()
    print("ok  a message needs a friend who is still there, and words or a file uploaded to chat")


def test_sending_over_rest_saves_it_and_delivers_it_to_both_people():
    db, people = build()
    amna, bilal = people["amna"], people["bilal"]
    with Events() as events:
        saved = chat_api.send_direct_message(bilal.id, DirectMessageCreate(
            content="Plan attached", message_type="file", file_url=FILE, file_name="plan.pdf",
            file_size=2048, file_type="application/pdf"), db=db, current_user=amna)
        assert saved.file_url == FILE and saved.file_name == "plan.pdf", "attachments are no longer dropped"
        [(ids, payload)] = events.of_type("chat_message")
        assert ids == sorted([amna.id, bilal.id]) and payload["id"] == saved.id
        assert (payload["sender_id"], payload["receiver_id"], payload["file_url"]) == (amna.id, bilal.id, FILE)

        detail = refused(lambda: chat_api.send_direct_message(people["chen"].id, DirectMessageCreate(content="hi"),
                                                              db=db, current_user=amna), 403)
        assert "friends" in detail and len(events.of_type("chat_message")) == 1
    db.close()
    print("ok  a REST send is saved with its attachment and delivered to both people at once")


def test_history_is_the_newest_page_oldest_first_and_pages_back():
    db, people = build()
    amna, bilal = people["amna"], people["bilal"]
    for i in range(130):
        sender, receiver = (amna, bilal) if i % 2 == 0 else (bilal, amna)
        db.add(DirectMessage(sender_id=sender.id, receiver_id=receiver.id, content=f"note {i}"))
    db.commit()

    with Events() as events:
        page = chat_api.get_direct_messages(amna.id, db=db, current_user=bilal, skip=0, limit=50, before_id=None)
        contents = [m.content for m in page["items"]]
        assert contents == [f"note {i}" for i in range(80, 130)], (contents[0], contents[-1])
        assert (page["total"], page["has_more"]) == (130, True)
        [(ids, receipt)] = events.of_type("read_receipt")
        assert ids == [amna.id] and receipt["reader_id"] == bilal.id and len(receipt["message_ids"]) == 65

        earlier = chat_api.get_direct_messages(amna.id, db=db, current_user=bilal, skip=0, limit=50,
                                               before_id=page["items"][0].id)
        assert [m.content for m in earlier["items"]] == [f"note {i}" for i in range(30, 80)] and earlier["has_more"]
        first = chat_api.get_direct_messages(amna.id, db=db, current_user=bilal, skip=0, limit=50,
                                             before_id=earlier["items"][0].id)
        assert [m.content for m in first["items"]] == [f"note {i}" for i in range(30)] and not first["has_more"]
        assert len(events.of_type("read_receipt")) == 1, "paging back does not mark or announce again"
    assert chat_api.get_unread_counts(db=db, current_user=bilal) == {}
    db.close()
    print("ok  a 130-message conversation opens on its newest 50 and pages back to the first")


def test_messages_read_while_open_are_marked_and_the_sender_is_told():
    db, people = build()
    amna, bilal = people["amna"], people["bilal"]
    for words in ("one", "two"):
        chat_messages.send_direct(db, amna, bilal.id, content=words)
    assert chat_api.get_unread_counts(db=db, current_user=bilal) == {str(amna.id): 2}
    with Events() as events:
        assert chat_api.mark_conversation_read(amna.id, db=db, current_user=bilal) == {"marked": 2}
        assert chat_api.mark_conversation_read(amna.id, db=db, current_user=bilal) == {"marked": 0}
        [(ids, receipt)] = events.of_type("read_receipt")
        assert ids == [amna.id] and len(receipt["message_ids"]) == 2
    assert chat_api.get_unread_counts(db=db, current_user=bilal) == {}
    db.close()
    print("ok  reading clears the unread count once and tells the sender")


def test_workspace_messages_are_saved_and_delivered_to_every_member():
    db, people = build()
    amna, bilal, chen = people["amna"], people["bilal"], people["chen"]
    workspace = Workspace(name="Plant room", created_by=amna.id)
    db.add(workspace)
    db.flush()
    for member in (amna, bilal):
        db.add(WorkspaceMember(workspace_id=workspace.id, user_id=member.id))
    for i in range(60):
        db.add(WorkspaceMessage(workspace_id=workspace.id, sender_id=bilal.id, content=f"log {i}"))
    db.commit()

    with Events() as events:
        saved = chat_api.send_workspace_message(workspace.id, WorkspaceMessageCreate(
            content="", message_type="file", file_url=FILE, file_name="rota.pdf"), db=db, current_user=amna)
        assert saved.file_url == FILE and saved.content == "📎 rota.pdf"
        [(ids, payload)] = events.of_type("workspace_message")
        assert ids == sorted([amna.id, bilal.id]) and payload["workspace_id"] == workspace.id
        refused(lambda: chat_api.send_workspace_message(workspace.id, WorkspaceMessageCreate(content="hi"),
                                                        db=db, current_user=chen), 403)
    page = chat_api.get_workspace_messages(workspace.id, db=db, current_user=bilal, skip=0, limit=50, before_id=None)
    assert page["items"][-1].content == "📎 rota.pdf" and page["has_more"] and page["total"] == 61
    db.close()
    print("ok  a workspace message is saved with its file and delivered to every member")


def test_friend_requests_update_both_people_straight_away():
    db, people = build()
    bilal, chen = people["bilal"], people["chen"]
    with Events() as events:
        request = chat_api.send_friend_request(FriendRequestCreate(receiver_id=chen.id), db=db, current_user=bilal)
        chat_api.accept_friend_request(request.id, db=db, current_user=chen)
        changes = events.of_type("friends_changed")
        assert [ids for ids, _ in changes] == [sorted([bilal.id, chen.id])] * 2
    assert chat_messages.are_friends(db, bilal.id, chen.id)
    db.close()
    print("ok  sending and accepting a request refreshes both people's lists at once")


class FakeSocket:
    def __init__(self):
        self.sent = []

    async def send_json(self, message):
        self.sent.append(message)


def _quiet_manager():
    """A socket manager with no Redis, delivering in this process."""
    manager = socket_api.ConnectionManager()

    async def no_redis():
        return False

    manager.start = no_redis
    return manager


def test_a_bad_socket_frame_is_answered_and_never_drops_the_connection():
    db, people = build()
    amna, bilal, chen = people["amna"], people["bilal"], people["chen"]
    original_manager, original_session = socket_api.manager, socket_api.SessionLocal
    socket_api.manager, socket_api.SessionLocal = _quiet_manager(), Session
    try:
        amna_socket, bilal_socket = FakeSocket(), FakeSocket()
        socket_api.manager.active_connections = {amna.id: {"a": amna_socket}, bilal.id: {"b": bilal_socket}}

        async def frames():
            await socket_api._handle_frame(amna.id, amna_socket, "not json")
            await socket_api._handle_frame(amna.id, amna_socket, json.dumps({"type": "ping"}))
            await socket_api._handle_frame(amna.id, amna_socket, json.dumps(
                {"type": "chat_message", "receiver_id": chen.id, "content": "hi", "client_id": "c1"}))
            await socket_api._handle_frame(amna.id, amna_socket, json.dumps(
                {"type": "chat_message", "receiver_id": "nobody", "content": "hi"}))
            await socket_api._handle_frame(amna.id, amna_socket, json.dumps(
                {"type": "typing", "receiver_id": "12; drop"}))
            await socket_api._handle_frame(amna.id, amna_socket, json.dumps(
                {"type": "chat_message", "receiver_id": bilal.id, "content": "over the socket"}))

        asyncio.run(frames())
        kinds = [m["type"] for m in amna_socket.sent]
        assert kinds[:2] == ["error", "pong"], kinds
        assert amna_socket.sent[2] == {"type": "error", "detail": "You must be friends to send messages", "client_id": "c1"}
        assert amna_socket.sent[3]["type"] == "error"
        delivered = [m for m in bilal_socket.sent if m["type"] == "chat_message"]
        assert [m["content"] for m in delivered] == ["over the socket"]
        assert [m["content"] for m in amna_socket.sent if m["type"] == "chat_message"] == ["over the socket"]
        assert db.query(DirectMessage).count() == 1, "only the valid message was saved"
    finally:
        socket_api.manager, socket_api.SessionLocal = original_manager, original_session
        db.close()
    print("ok  bad frames get an error and a pong answers the heartbeat; the connection stays up")


def test_an_event_raised_in_a_request_thread_reaches_the_connected_browser():
    original = socket_api.manager
    socket_api.manager = _quiet_manager()
    try:
        browser = FakeSocket()
        socket_api.manager.active_connections = {7: {"x": browser}}

        async def request():
            # FastAPI runs synchronous endpoints in worker threads like this one.
            await anyio.to_thread.run_sync(realtime.notify_users, [7, 7, 0], {"type": "friends_changed"})

        anyio.run(request)
        assert browser.sent == [{"type": "friends_changed"}]
        realtime.notify_users([7], {"type": "outside a request"})  # must not raise
    finally:
        socket_api.manager = original
    print("ok  an event from a synchronous endpoint is delivered to the browser, and is harmless elsewhere")


def test_the_redis_listener_survives_errors_it_did_not_expect():
    manager = _quiet_manager()
    browser = FakeSocket()
    manager.active_connections = {5: {"x": browser}}
    envelope = json.dumps({"message": {"type": "chat_message", "id": 1}, "target_user_ids": [5]})

    class FlakyPubSub:
        def __init__(self):
            self.calls = 0

        async def get_message(self, timeout):
            self.calls += 1
            if self.calls == 1:
                raise RuntimeError("socket reset under the client")
            if self.calls == 2:
                return {"type": "message", "data": envelope}
            raise asyncio.CancelledError

    manager._pubsub = FlakyPubSub()
    original_sleep = asyncio.sleep

    async def no_wait(_seconds):
        await original_sleep(0)

    asyncio.sleep = no_wait
    try:
        asyncio.run(manager._listen())
    except asyncio.CancelledError:
        pass
    finally:
        asyncio.sleep = original_sleep
    assert browser.sent == [{"type": "chat_message", "id": 1}], "the message after the error is still delivered"
    print("ok  the cross-worker listener logs an unexpected error and keeps delivering")


def test_a_rejected_token_closes_with_4001_so_the_browser_stops_retrying():
    from fastapi.testclient import TestClient
    from starlette.websockets import WebSocketDisconnect

    from app.main import app

    client = TestClient(app)
    try:
        with client.websocket_connect("/api/v1/ws/not-a-token") as socket:
            socket.receive_json()
        raise AssertionError("an invalid token was accepted")
    except WebSocketDisconnect as exc:
        assert exc.code == 4001, exc.code
    print("ok  an invalid token is closed with 4001")


if __name__ == "__main__":
    tests = [v for k, v in globals().items() if k.startswith("test_")]
    for t in tests:
        t()
    print(f"\n{len(tests)} checks passed")
