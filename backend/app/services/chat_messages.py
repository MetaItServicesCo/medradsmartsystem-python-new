"""Sending and reading chat messages, in one place for every way in.

A message used to take two paths. The browser sent over the WebSocket, which
saved it without checking the two people were friends, dropped the connection
on any error, and could not be told apart from success when the socket was
down; the REST endpoint checked friendship but ignored attachments and told
nobody. Both now call this module, so a message is validated the same way,
saved the same way and described to the other side the same way.

History returns the newest messages. It used to return the oldest hundred, so
once a conversation passed a hundred messages everything new vanished on reload.
"""
from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import datetime
from typing import Optional

from sqlalchemy import and_, func, or_
from sqlalchemy.orm import Session

from app.models.chat import (
    DirectMessage, FriendRequest, FriendRequestStatus, MessageType, WorkspaceMember, WorkspaceMessage,
)
from app.models.user import User
from app.utils.notifications import create_notification, create_notifications

MAX_CONTENT_LENGTH = 5000
DEFAULT_PAGE = 50
MAX_PAGE = 200

# Attachments are uploaded through /chat/upload first; a message may only point
# at a file stored there, never at an arbitrary address.
_UPLOADED_FILE = re.compile(r"^/api/v1/chat/files/[A-Za-z0-9._-]+$")


class ChatError(Exception):
    """A message that cannot be sent, with the status and words to say why."""

    def __init__(self, status: int, detail: str):
        super().__init__(detail)
        self.status = status
        self.detail = detail


@dataclass
class Attachment:
    file_url: Optional[str] = None
    file_name: Optional[str] = None
    file_size: Optional[int] = None
    file_type: Optional[str] = None


def _iso(value: Optional[datetime]) -> Optional[str]:
    return value.isoformat() if value else None


def are_friends(db: Session, first_id: int, second_id: int) -> bool:
    return db.query(FriendRequest.id).filter(
        FriendRequest.status == FriendRequestStatus.ACCEPTED,
        or_(
            and_(FriendRequest.sender_id == first_id, FriendRequest.receiver_id == second_id),
            and_(FriendRequest.sender_id == second_id, FriendRequest.receiver_id == first_id),
        ),
    ).first() is not None


def _validated(content: Optional[str], message_type: Optional[str], attachment: Attachment) -> tuple[str, MessageType]:
    try:
        kind = MessageType(message_type or MessageType.TEXT.value)
    except ValueError:
        raise ChatError(422, "Unknown message type")
    text = (content or "").strip()
    if kind == MessageType.FILE:
        if not attachment.file_url or not _UPLOADED_FILE.match(attachment.file_url):
            raise ChatError(422, "Attach a file uploaded to chat")
        text = text or f"📎 {attachment.file_name or 'File'}"
    elif attachment.file_url:
        raise ChatError(422, "Only a file message can carry an attachment")
    if not text:
        raise ChatError(422, "Write a message first")
    if len(text) > MAX_CONTENT_LENGTH:
        raise ChatError(422, f"Messages can be up to {MAX_CONTENT_LENGTH} characters")
    return text, kind


def direct_payload(message: DirectMessage) -> dict:
    """The message as both the REST response and the realtime event describe it."""
    return {
        "type": "chat_message",
        "id": message.id,
        "sender_id": message.sender_id,
        "receiver_id": message.receiver_id,
        "content": message.content,
        "message_type": getattr(message.message_type, "value", message.message_type) or "text",
        "file_url": message.file_url,
        "file_name": message.file_name,
        "file_size": message.file_size,
        "file_type": message.file_type,
        "created_at": _iso(message.created_at),
        "read_at": _iso(message.read_at),
    }


def send_direct(db: Session, sender: User, receiver_id: int, *, content: Optional[str],
                message_type: Optional[str] = "text", attachment: Attachment | None = None) -> DirectMessage:
    """Save a direct message to a friend and notify them. Commits."""
    attachment = attachment or Attachment()
    if receiver_id == sender.id:
        raise ChatError(400, "You cannot message yourself")
    receiver = db.get(User, receiver_id)
    if receiver is None or not receiver.is_active:
        raise ChatError(404, "That person is no longer available")
    if not are_friends(db, sender.id, receiver_id):
        raise ChatError(403, "You must be friends to send messages")
    text, kind = _validated(content, message_type, attachment)

    message = DirectMessage(
        sender_id=sender.id, receiver_id=receiver_id, content=text, message_type=kind,
        file_url=attachment.file_url, file_name=attachment.file_name,
        file_size=attachment.file_size, file_type=attachment.file_type,
    )
    db.add(message)
    db.flush()
    create_notification(
        db, user_id=receiver_id, title="New direct message",
        message=f"{sender.full_name or sender.username} sent you a message.",
        notification_type="chat", link_url=f"/chat?user={sender.id}", actor_id=sender.id,
    )
    db.commit()
    db.refresh(message)
    return message


def conversation(db: Session, user_id: int, other_id: int, *, limit: int = DEFAULT_PAGE,
                 before_id: Optional[int] = None) -> tuple[list[DirectMessage], bool, int]:
    """The newest messages between two people, oldest first, whether there are
    earlier ones, and how many there are in all."""
    limit = max(1, min(limit, MAX_PAGE))
    between = or_(
        and_(DirectMessage.sender_id == user_id, DirectMessage.receiver_id == other_id),
        and_(DirectMessage.sender_id == other_id, DirectMessage.receiver_id == user_id),
    )
    total = db.query(func.count(DirectMessage.id)).filter(between).scalar() or 0
    query = db.query(DirectMessage).filter(between)
    if before_id is not None:
        query = query.filter(DirectMessage.id < before_id)
    newest_first = query.order_by(DirectMessage.id.desc()).limit(limit + 1).all()
    has_more = len(newest_first) > limit
    return list(reversed(newest_first[:limit])), has_more, total


def mark_read(db: Session, reader_id: int, other_id: int) -> list[int]:
    """Mark everything the other person sent the reader as read. Commits; returns the ids."""
    unread = db.query(DirectMessage).filter(
        DirectMessage.sender_id == other_id, DirectMessage.receiver_id == reader_id,
        DirectMessage.read_at.is_(None),
    ).all()
    now = datetime.utcnow()
    for message in unread:
        message.read_at = now
    if unread:
        db.commit()
    return [message.id for message in unread]


# ── workspaces ───────────────────────────────────────────────────────────────

def is_member(db: Session, workspace_id: int, user_id: int) -> bool:
    return db.query(WorkspaceMember.id).filter(
        WorkspaceMember.workspace_id == workspace_id, WorkspaceMember.user_id == user_id,
    ).first() is not None


def member_ids(db: Session, workspace_id: int) -> list[int]:
    return sorted({user_id for (user_id,) in db.query(WorkspaceMember.user_id).filter(
        WorkspaceMember.workspace_id == workspace_id)})


def workspace_payload(message: WorkspaceMessage, sender: Optional[User]) -> dict:
    return {
        "type": "workspace_message",
        "id": message.id,
        "workspace_id": message.workspace_id,
        "sender_id": message.sender_id,
        "sender_name": sender.full_name if sender else "",
        "sender_avatar": sender.avatar_url if sender else None,
        "content": message.content,
        "message_type": getattr(message.message_type, "value", message.message_type) or "text",
        "file_url": message.file_url,
        "file_name": message.file_name,
        "file_size": message.file_size,
        "file_type": message.file_type,
        "created_at": _iso(message.created_at),
    }


def send_to_workspace(db: Session, sender: User, workspace_id: int, *, content: Optional[str],
                      message_type: Optional[str] = "text", attachment: Attachment | None = None) -> WorkspaceMessage:
    """Save a workspace message and notify the other members. Commits."""
    attachment = attachment or Attachment()
    if not is_member(db, workspace_id, sender.id):
        raise ChatError(403, "Not a member of this workspace")
    text, kind = _validated(content, message_type, attachment)
    message = WorkspaceMessage(
        workspace_id=workspace_id, sender_id=sender.id, content=text, message_type=kind,
        file_url=attachment.file_url, file_name=attachment.file_name,
        file_size=attachment.file_size, file_type=attachment.file_type,
    )
    db.add(message)
    db.flush()
    create_notifications(
        db, user_ids=[uid for uid in member_ids(db, workspace_id) if uid != sender.id],
        title="New workspace message", message=f"{sender.full_name or sender.username} posted in a workspace.",
        notification_type="chat", link_url=f"/chat?workspace={workspace_id}", actor_id=sender.id,
    )
    db.commit()
    db.refresh(message)
    return message


def workspace_history(db: Session, workspace_id: int, *, limit: int = DEFAULT_PAGE,
                      before_id: Optional[int] = None) -> tuple[list[WorkspaceMessage], bool, int]:
    limit = max(1, min(limit, MAX_PAGE))
    in_workspace = WorkspaceMessage.workspace_id == workspace_id
    total = db.query(func.count(WorkspaceMessage.id)).filter(in_workspace).scalar() or 0
    query = db.query(WorkspaceMessage).filter(in_workspace)
    if before_id is not None:
        query = query.filter(WorkspaceMessage.id < before_id)
    newest_first = query.order_by(WorkspaceMessage.id.desc()).limit(limit + 1).all()
    return list(reversed(newest_first[:limit])), len(newest_first) > limit, total
