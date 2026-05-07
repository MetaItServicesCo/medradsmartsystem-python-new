import json
import asyncio
from typing import Dict, Set
from datetime import datetime

from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Depends
from sqlalchemy.orm import Session
from jose import JWTError, jwt

from app.core.config import settings
from app.db.base import SessionLocal
from app.models.user import User
from app.models.chat import DirectMessage, WorkspaceMessage, MessageType, WorkspaceMember

router = APIRouter()


class ConnectionManager:
    """Manages active WebSocket connections, keyed by user_id."""

    def __init__(self):
        self.active_connections: Dict[int, WebSocket] = {}
        self.online_users: Set[int] = set()

    async def connect(self, user_id: int, websocket: WebSocket):
        await websocket.accept()
        self.active_connections[user_id] = websocket
        self.online_users.add(user_id)
        # Broadcast online status
        await self.broadcast_presence(user_id, True)

    async def disconnect(self, user_id: int):
        self.active_connections.pop(user_id, None)
        self.online_users.discard(user_id)
        await self.broadcast_presence(user_id, False)

    async def send_to_user(self, user_id: int, message: dict):
        ws = self.active_connections.get(user_id)
        if ws:
            try:
                await ws.send_json(message)
            except Exception:
                await self.disconnect(user_id)

    async def broadcast_to_workspace(self, workspace_id: int, message: dict, db: Session):
        members = db.query(WorkspaceMember).filter(
            WorkspaceMember.workspace_id == workspace_id
        ).all()
        for m in members:
            await self.send_to_user(m.user_id, message)

    async def broadcast_presence(self, user_id: int, is_online: bool):
        msg = {
            "type": "presence",
            "user_id": user_id,
            "is_online": is_online,
        }
        for uid, ws in list(self.active_connections.items()):
            if uid != user_id:
                try:
                    await ws.send_json(msg)
                except Exception:
                    pass

    def get_online_users(self) -> list:
        return list(self.online_users)


manager = ConnectionManager()


def get_user_from_token(token: str) -> int | None:
    """Extract user_id from JWT token."""
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        username = payload.get("sub")
        if not username:
            return None
        db = SessionLocal()
        try:
            user = db.query(User).filter(User.username == username).first()
            return user.id if user else None
        finally:
            db.close()
    except JWTError:
        return None


@router.websocket("/ws/{token}")
async def websocket_endpoint(websocket: WebSocket, token: str):
    """Main WebSocket endpoint for real-time communication."""
    user_id = get_user_from_token(token)
    if user_id is None:
        await websocket.close(code=4001, reason="Invalid token")
        return

    await manager.connect(user_id, websocket)

    try:
        # Send initial online users list
        await websocket.send_json({
            "type": "online_users",
            "users": manager.get_online_users(),
        })

        while True:
            data = await websocket.receive_json()
            await handle_message(user_id, data)
    except WebSocketDisconnect:
        await manager.disconnect(user_id)
    except Exception:
        await manager.disconnect(user_id)


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
    elif msg_type == "call_offer":
        await handle_call_signal(sender_id, data)
    elif msg_type == "call_answer":
        await handle_call_signal(sender_id, data)
    elif msg_type == "ice_candidate":
        await handle_call_signal(sender_id, data)
    elif msg_type == "call_end":
        await handle_call_signal(sender_id, data)
    elif msg_type == "call_reject":
        await handle_call_signal(sender_id, data)
    elif msg_type == "get_online_users":
        ws = manager.active_connections.get(sender_id)
        if ws:
            await ws.send_json({
                "type": "online_users",
                "users": manager.get_online_users(),
            })


async def handle_chat_message(sender_id: int, data: dict):
    """Persist a direct message and relay to recipient."""
    receiver_id = data.get("receiver_id")
    content = data.get("content", "")
    message_type = data.get("message_type", "text")
    file_url = data.get("file_url")
    file_name = data.get("file_name")
    file_size = data.get("file_size")
    file_type = data.get("file_type")

    if not receiver_id or not content:
        return

    # Persist to DB
    db = SessionLocal()
    try:
        msg = DirectMessage(
            sender_id=sender_id,
            receiver_id=receiver_id,
            content=content,
            message_type=MessageType(message_type),
            file_url=file_url,
            file_name=file_name,
            file_size=file_size,
            file_type=file_type,
        )
        db.add(msg)
        db.commit()
        db.refresh(msg)
        msg_id = msg.id
        created_at = msg.created_at.isoformat() if msg.created_at else datetime.utcnow().isoformat()
    finally:
        db.close()

    # Send to receiver
    outgoing = {
        "type": "chat_message",
        "id": msg_id,
        "sender_id": sender_id,
        "receiver_id": receiver_id,
        "content": content,
        "message_type": message_type,
        "file_url": file_url,
        "file_name": file_name,
        "file_size": file_size,
        "file_type": file_type,
        "created_at": created_at,
    }
    await manager.send_to_user(receiver_id, outgoing)
    # Echo back to sender for confirmation
    await manager.send_to_user(sender_id, outgoing)


async def handle_workspace_message(sender_id: int, data: dict):
    """Persist a workspace message and broadcast to members."""
    workspace_id = data.get("workspace_id")
    content = data.get("content", "")
    message_type = data.get("message_type", "text")
    file_url = data.get("file_url")
    file_name = data.get("file_name")
    file_size = data.get("file_size")
    file_type = data.get("file_type")

    if not workspace_id or not content:
        return

    db = SessionLocal()
    try:
        msg = WorkspaceMessage(
            workspace_id=workspace_id,
            sender_id=sender_id,
            content=content,
            message_type=MessageType(message_type),
            file_url=file_url,
            file_name=file_name,
            file_size=file_size,
            file_type=file_type,
        )
        db.add(msg)
        db.commit()
        db.refresh(msg)

        sender = db.query(User).filter(User.id == sender_id).first()

        outgoing = {
            "type": "workspace_message",
            "id": msg.id,
            "workspace_id": workspace_id,
            "sender_id": sender_id,
            "sender_name": sender.full_name if sender else "",
            "sender_avatar": sender.avatar_url if sender else None,
            "content": content,
            "message_type": message_type,
            "file_url": file_url,
            "file_name": file_name,
            "file_size": file_size,
            "file_type": file_type,
            "created_at": msg.created_at.isoformat() if msg.created_at else datetime.utcnow().isoformat(),
        }
        await manager.broadcast_to_workspace(workspace_id, outgoing, db)
    finally:
        db.close()


async def handle_typing(sender_id: int, data: dict):
    """Relay typing indicator to the other user."""
    receiver_id = data.get("receiver_id")
    workspace_id = data.get("workspace_id")

    indicator = {
        "type": "typing",
        "sender_id": sender_id,
        "is_typing": data.get("is_typing", True),
    }

    if receiver_id:
        await manager.send_to_user(receiver_id, indicator)
    elif workspace_id:
        indicator["workspace_id"] = workspace_id
        db = SessionLocal()
        try:
            members = db.query(WorkspaceMember).filter(
                WorkspaceMember.workspace_id == workspace_id
            ).all()
            for m in members:
                if m.user_id != sender_id:
                    await manager.send_to_user(m.user_id, indicator)
        finally:
            db.close()


async def handle_read_receipt(sender_id: int, data: dict):
    """Mark messages as read and notify sender."""
    message_ids = data.get("message_ids", [])
    from_user_id = data.get("from_user_id")

    if not message_ids:
        return

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

    if from_user_id:
        await manager.send_to_user(from_user_id, {
            "type": "read_receipt",
            "reader_id": sender_id,
            "message_ids": message_ids,
        })


async def handle_call_signal(sender_id: int, data: dict):
    """Relay WebRTC signaling messages (offer, answer, ICE candidates, end)."""
    target_id = data.get("target_id")
    if not target_id:
        return

    data["sender_id"] = sender_id
    await manager.send_to_user(target_id, data)
