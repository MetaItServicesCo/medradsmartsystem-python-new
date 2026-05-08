import os
import uuid
from typing import Any, Optional, List
from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File, status
from sqlalchemy.orm import Session
from sqlalchemy import or_, and_

from app.core.deps import get_current_user
from app.utils.logging import log_activity
from app.utils.notifications import create_notification, create_notifications
from app.db.base import get_db
from app.models.user import User
from app.models.chat import (
    FriendRequest, FriendRequestStatus,
    DirectMessage, MessageType,
    Workspace, WorkspaceMember, WorkspaceMemberRole,
    WorkspaceMessage,
)
from app.schemas.chat import (
    FriendRequestCreate, FriendRequestResponse, FriendRequestListResponse,
    DirectMessageCreate, DirectMessageResponse, DirectMessageListResponse,
    WorkspaceCreate, WorkspaceResponse, WorkspaceListResponse,
    WorkspaceMemberAdd, WorkspaceMemberResponse,
    WorkspaceMessageCreate, WorkspaceMessageResponse, WorkspaceMessageListResponse,
)

router = APIRouter()

CHAT_UPLOAD_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "..", "..", "uploads", "chat_files")

ALLOWED_FILE_TYPES = {
    "image/jpeg", "image/png", "image/gif", "image/webp", "image/svg+xml",
    "application/pdf",
    "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.ms-excel", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "text/plain", "text/csv",
    "application/zip", "application/x-rar-compressed", "application/x-7z-compressed",
}
MAX_FILE_SIZE = 10 * 1024 * 1024  # 10MB


# ─── Friend Requests ────────────────────────────────────────────────

@router.post("/friend-request", response_model=FriendRequestResponse, status_code=201)
def send_friend_request(
    req_in: FriendRequestCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Any:
    """Send a friend/chat request to another user."""
    if req_in.receiver_id == current_user.id:
        raise HTTPException(status_code=400, detail="Cannot send request to yourself")

    receiver = db.query(User).filter(User.id == req_in.receiver_id).first()
    if not receiver:
        raise HTTPException(status_code=404, detail="User not found")

    # Check for existing request in either direction
    existing = db.query(FriendRequest).filter(
        or_(
            and_(FriendRequest.sender_id == current_user.id, FriendRequest.receiver_id == req_in.receiver_id),
            and_(FriendRequest.sender_id == req_in.receiver_id, FriendRequest.receiver_id == current_user.id),
        ),
        FriendRequest.status != FriendRequestStatus.REJECTED,
    ).first()
    if existing:
        if existing.status == FriendRequestStatus.ACCEPTED:
            raise HTTPException(status_code=400, detail="Already friends")
        raise HTTPException(status_code=400, detail="Friend request already pending")

    fr = FriendRequest(
        sender_id=current_user.id,
        receiver_id=req_in.receiver_id,
        message=req_in.message
    )
    db.add(fr)
    db.flush() # Generate ID
    
    log_activity(db, "friend_requests", fr.id, "FRIEND_REQUEST_SENT", current_user, {"receiver_id": fr.receiver_id})
    create_notification(
        db,
        user_id=fr.receiver_id,
        title="New friend request",
        message=f"{current_user.full_name or current_user.username} sent you a friend request.",
        notification_type="chat",
        link_url="/chat",
        actor_id=current_user.id,
    )
    db.commit()
    db.refresh(fr)
    return _build_friend_request_response(fr, db)


@router.get("/friend-requests", response_model=FriendRequestListResponse)
def list_friend_requests(
    direction: str = Query("received", regex="^(received|sent|all)$"),
    status_filter: Optional[str] = Query(None, alias="status"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Any:
    """List friend requests (received, sent, or all)."""
    q = db.query(FriendRequest)
    if direction == "received":
        q = q.filter(FriendRequest.receiver_id == current_user.id)
    elif direction == "sent":
        q = q.filter(FriendRequest.sender_id == current_user.id)
    else:
        q = q.filter(
            or_(FriendRequest.sender_id == current_user.id, FriendRequest.receiver_id == current_user.id)
        )
    if status_filter:
        q = q.filter(FriendRequest.status == FriendRequestStatus(status_filter))

    items = q.order_by(FriendRequest.created_at.desc()).all()
    return {
        "items": [_build_friend_request_response(fr, db) for fr in items],
        "total": len(items),
    }


@router.put("/friend-request/{request_id}/accept", response_model=FriendRequestResponse)
def accept_friend_request(
    request_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Any:
    """Accept a friend request."""
    fr = db.query(FriendRequest).filter(FriendRequest.id == request_id).first()
    if not fr:
        raise HTTPException(status_code=404, detail="Friend request not found")
    if fr.receiver_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not your request to accept")
    if fr.status != FriendRequestStatus.PENDING:
        raise HTTPException(status_code=400, detail=f"Request already {fr.status.value}")

    fr.status = FriendRequestStatus.ACCEPTED
    
    # If there was an initial message, create a DirectMessage from it
    if fr.message:
        dm = DirectMessage(
            sender_id=fr.sender_id,
            receiver_id=fr.receiver_id,
            content=fr.message,
            message_type=MessageType.TEXT
        )
        db.add(dm)

    log_activity(db, "friend_requests", fr.id, "FRIEND_REQUEST_ACCEPTED", current_user, {"sender_id": fr.sender_id})
    create_notification(
        db,
        user_id=fr.sender_id,
        title="Friend request accepted",
        message=f"{current_user.full_name or current_user.username} accepted your friend request.",
        notification_type="chat",
        link_url="/chat",
        actor_id=current_user.id,
    )
    db.commit()
    db.refresh(fr)
    return _build_friend_request_response(fr, db)


@router.put("/friend-request/{request_id}/reject", response_model=FriendRequestResponse)
def reject_friend_request(
    request_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Any:
    """Reject a friend request."""
    fr = db.query(FriendRequest).filter(FriendRequest.id == request_id).first()
    if not fr:
        raise HTTPException(status_code=404, detail="Friend request not found")
    if fr.receiver_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not your request to reject")
    if fr.status != FriendRequestStatus.PENDING:
        raise HTTPException(status_code=400, detail=f"Request already {fr.status.value}")

    fr.status = FriendRequestStatus.REJECTED
    log_activity(db, "friend_requests", fr.id, "FRIEND_REQUEST_REJECTED", current_user, {"sender_id": fr.sender_id})
    create_notification(
        db,
        user_id=fr.sender_id,
        title="Friend request rejected",
        message=f"{current_user.full_name or current_user.username} rejected your friend request.",
        notification_type="chat",
        link_url="/chat",
        actor_id=current_user.id,
    )
    db.commit()
    db.refresh(fr)
    
    return _build_friend_request_response(fr, db)


@router.get("/friends", response_model=list)
def list_friends(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Any:
    """List all accepted friends of the current user."""
    accepted = db.query(FriendRequest).filter(
        FriendRequest.status == FriendRequestStatus.ACCEPTED,
        or_(
            FriendRequest.sender_id == current_user.id,
            FriendRequest.receiver_id == current_user.id,
        ),
    ).all()

    friend_ids = set()
    for fr in accepted:
        if fr.sender_id == current_user.id:
            friend_ids.add(fr.receiver_id)
        else:
            friend_ids.add(fr.sender_id)

    friends = db.query(User).filter(User.id.in_(friend_ids)).all()
    return [
        {
            "id": f.id,
            "username": f.username,
            "full_name": f.full_name,
            "email": f.email,
            "avatar_url": f.avatar_url,
            "role": f.role.value if f.role else "employee",
            "is_active": f.is_active,
        }
        for f in friends
    ]


# ─── Direct Messages ────────────────────────────────────────────────

@router.get("/messages/{user_id}", response_model=DirectMessageListResponse)
def get_direct_messages(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
) -> Any:
    """Get direct message history with a specific user."""
    # Verify they are friends
    _check_friendship(db, current_user.id, user_id)

    messages = (
        db.query(DirectMessage)
        .filter(
            or_(
                and_(DirectMessage.sender_id == current_user.id, DirectMessage.receiver_id == user_id),
                and_(DirectMessage.sender_id == user_id, DirectMessage.receiver_id == current_user.id),
            )
        )
        .order_by(DirectMessage.created_at.asc())
        .offset(skip)
        .limit(limit)
        .all()
    )

    # Mark unread messages as read
    unread = (
        db.query(DirectMessage)
        .filter(
            DirectMessage.sender_id == user_id,
            DirectMessage.receiver_id == current_user.id,
            DirectMessage.read_at.is_(None),
        )
        .all()
    )
    from datetime import datetime
    for msg in unread:
        msg.read_at = datetime.utcnow()
    if unread:
        db.commit()

    return {
        "items": [_build_dm_response(m) for m in messages],
        "total": len(messages),
    }


@router.post("/messages/{user_id}", response_model=DirectMessageResponse, status_code=201)
def send_direct_message(
    user_id: int,
    msg_in: DirectMessageCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Any:
    """Send a direct message to a friend."""
    _check_friendship(db, current_user.id, user_id)

    msg = DirectMessage(
        sender_id=current_user.id,
        receiver_id=user_id,
        content=msg_in.content,
        message_type=MessageType(msg_in.message_type) if msg_in.message_type else MessageType.TEXT,
    )
    db.add(msg)
    db.flush()
    
    log_activity(db, "direct_messages", msg.id, "DM_SENT", current_user, {"receiver_id": user_id})
    create_notification(
        db,
        user_id=user_id,
        title="New direct message",
        message=f"{current_user.full_name or current_user.username} sent you a message.",
        notification_type="chat",
        link_url="/chat",
        actor_id=current_user.id,
    )
    db.commit()
    db.refresh(msg)
    return _build_dm_response(msg)


@router.get("/unread-counts")
def get_unread_counts(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Any:
    """Get unread message counts grouped by sender."""
    from sqlalchemy import func
    counts = (
        db.query(DirectMessage.sender_id, func.count(DirectMessage.id))
        .filter(
            DirectMessage.receiver_id == current_user.id,
            DirectMessage.read_at.is_(None),
        )
        .group_by(DirectMessage.sender_id)
        .all()
    )
    return {str(sender_id): count for sender_id, count in counts}


# ─── Workspaces ──────────────────────────────────────────────────────

@router.post("/workspaces", response_model=WorkspaceResponse, status_code=201)
def create_workspace(
    ws_in: WorkspaceCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Any:
    """Create a new workspace."""
    ws = Workspace(
        name=ws_in.name,
        description=ws_in.description,
        created_by=current_user.id,
    )
    db.add(ws)
    db.commit()
    db.refresh(ws)

    # Add creator as admin member
    member = WorkspaceMember(
        workspace_id=ws.id,
        user_id=current_user.id,
        role=WorkspaceMemberRole.ADMIN,
    )
    db.add(member)

    # Add other members if provided
    valid_member_ids = []
    if ws_in.member_ids:
        for uid in ws_in.member_ids:
            if uid != current_user.id:
                user = db.query(User).filter(User.id == uid).first()
                if user:
                    valid_member_ids.append(uid)
                    m = WorkspaceMember(
                        workspace_id=ws.id,
                        user_id=uid,
                        role=WorkspaceMemberRole.MEMBER,
                    )
                    db.add(m)
    
    log_activity(db, "workspaces", ws.id, "WORKSPACE_CREATED", current_user, {"name": ws.name, "member_count": len(ws_in.member_ids or []) + 1})
    create_notifications(
        db,
        user_ids=valid_member_ids,
        title="Added to workspace",
        message=f"You were added to workspace {ws.name}.",
        notification_type="chat",
        link_url="/chat",
        actor_id=current_user.id,
    )
    db.commit()
    db.refresh(ws)
    return _build_workspace_response(ws, db)


@router.get("/workspaces", response_model=WorkspaceListResponse)
def list_workspaces(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Any:
    """List workspaces the current user belongs to."""
    ws_ids = (
        db.query(WorkspaceMember.workspace_id)
        .filter(WorkspaceMember.user_id == current_user.id)
        .subquery()
    )
    workspaces = db.query(Workspace).filter(Workspace.id.in_(ws_ids)).order_by(Workspace.updated_at.desc()).all()
    return {
        "items": [_build_workspace_response(ws, db) for ws in workspaces],
        "total": len(workspaces),
    }


@router.get("/workspaces/{workspace_id}", response_model=WorkspaceResponse)
def get_workspace(
    workspace_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Any:
    """Get workspace details."""
    ws = db.query(Workspace).filter(Workspace.id == workspace_id).first()
    if not ws:
        raise HTTPException(status_code=404, detail="Workspace not found")
    _check_workspace_member(db, workspace_id, current_user.id)
    return _build_workspace_response(ws, db)


@router.post("/workspaces/{workspace_id}/members", response_model=WorkspaceMemberResponse, status_code=201)
def add_workspace_member(
    workspace_id: int,
    member_in: WorkspaceMemberAdd,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Any:
    """Add a member to a workspace."""
    ws = db.query(Workspace).filter(Workspace.id == workspace_id).first()
    if not ws:
        raise HTTPException(status_code=404, detail="Workspace not found")
    _check_workspace_member(db, workspace_id, current_user.id)

    # Check if user already a member
    existing = db.query(WorkspaceMember).filter(
        WorkspaceMember.workspace_id == workspace_id,
        WorkspaceMember.user_id == member_in.user_id,
    ).first()
    if existing:
        raise HTTPException(status_code=400, detail="User already a member")

    user = db.query(User).filter(User.id == member_in.user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    m = WorkspaceMember(
        workspace_id=workspace_id,
        user_id=member_in.user_id,
        role=WorkspaceMemberRole.MEMBER,
    )
    db.add(m)
    db.commit()
    db.refresh(m)
    
    log_activity(db, "workspace_members", m.id, "WORKSPACE_MEMBER_ADDED", current_user, {"workspace_id": workspace_id, "user_id": member_in.user_id})
    create_notification(
        db,
        user_id=member_in.user_id,
        title="Added to workspace",
        message=f"You were added to workspace {ws.name}.",
        notification_type="chat",
        link_url="/chat",
        actor_id=current_user.id,
    )
    db.commit()
    
    return _build_workspace_member_response(m, db)


@router.delete("/workspaces/{workspace_id}/members/{user_id}")
def remove_workspace_member(
    workspace_id: int,
    user_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Any:
    """Remove a member from a workspace (admin or self-leave)."""
    ws = db.query(Workspace).filter(Workspace.id == workspace_id).first()
    if not ws:
        raise HTTPException(status_code=404, detail="Workspace not found")

    # Only workspace admin or the user themselves can remove
    if user_id != current_user.id:
        admin_check = db.query(WorkspaceMember).filter(
            WorkspaceMember.workspace_id == workspace_id,
            WorkspaceMember.user_id == current_user.id,
            WorkspaceMember.role == WorkspaceMemberRole.ADMIN,
        ).first()
        if not admin_check:
            raise HTTPException(status_code=403, detail="Only workspace admin can remove members")

    member = db.query(WorkspaceMember).filter(
        WorkspaceMember.workspace_id == workspace_id,
        WorkspaceMember.user_id == user_id,
    ).first()
    if not member:
        raise HTTPException(status_code=404, detail="Member not found")

    db.delete(member)
    db.commit()
    
    log_activity(db, "workspace_members", member.id, "WORKSPACE_MEMBER_REMOVED", current_user, {"workspace_id": workspace_id, "user_id": user_id})
    create_notification(
        db,
        user_id=user_id,
        title="Removed from workspace",
        message=f"You were removed from workspace {ws.name}.",
        notification_type="chat",
        link_url="/chat",
        actor_id=current_user.id,
    )
    db.commit()
    
    return {"message": "Member removed"}


# ─── Workspace Messages ─────────────────────────────────────────────

@router.get("/workspaces/{workspace_id}/messages", response_model=WorkspaceMessageListResponse)
def get_workspace_messages(
    workspace_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
) -> Any:
    """Get messages in a workspace."""
    _check_workspace_member(db, workspace_id, current_user.id)

    messages = (
        db.query(WorkspaceMessage)
        .filter(WorkspaceMessage.workspace_id == workspace_id)
        .order_by(WorkspaceMessage.created_at.asc())
        .offset(skip)
        .limit(limit)
        .all()
    )
    return {
        "items": [_build_ws_message_response(m, db) for m in messages],
        "total": len(messages),
    }


@router.post("/workspaces/{workspace_id}/messages", response_model=WorkspaceMessageResponse, status_code=201)
def send_workspace_message(
    workspace_id: int,
    msg_in: WorkspaceMessageCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Any:
    """Send a message to a workspace."""
    _check_workspace_member(db, workspace_id, current_user.id)

    msg = WorkspaceMessage(
        workspace_id=workspace_id,
        sender_id=current_user.id,
        content=msg_in.content,
        message_type=MessageType(msg_in.message_type) if msg_in.message_type else MessageType.TEXT,
    )
    db.add(msg)
    db.flush()
    
    log_activity(db, "workspace_messages", msg.id, "WORKSPACE_MESSAGE_SENT", current_user, {"workspace_id": workspace_id})
    member_ids = [
        m.user_id
        for m in db.query(WorkspaceMember).filter(WorkspaceMember.workspace_id == workspace_id).all()
        if m.user_id != current_user.id
    ]
    create_notifications(
        db,
        user_ids=member_ids,
        title="New workspace message",
        message=f"{current_user.full_name or current_user.username} posted in a workspace.",
        notification_type="chat",
        link_url="/chat",
        actor_id=current_user.id,
    )
    db.commit()
    db.refresh(msg)
    return _build_ws_message_response(msg, db)


# ─── File Upload ─────────────────────────────────────────────────────

@router.post("/upload")
async def upload_chat_file(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Any:
    """Upload a file for sharing in chat (DM or workspace). Available to all authenticated users."""
    if file.content_type and file.content_type not in ALLOWED_FILE_TYPES:
        raise HTTPException(status_code=400, detail=f"File type '{file.content_type}' is not allowed")

    content = await file.read()
    if len(content) > MAX_FILE_SIZE:
        raise HTTPException(status_code=400, detail="File too large. Maximum size is 10MB")

    os.makedirs(CHAT_UPLOAD_DIR, exist_ok=True)
    file_ext = os.path.splitext(file.filename or "file")[1]
    stored_name = f"{uuid.uuid4().hex}{file_ext}"
    file_path = os.path.join(CHAT_UPLOAD_DIR, stored_name)

    with open(file_path, "wb") as f:
        f.write(content)

    file_url = f"/uploads/chat_files/{stored_name}"

    log_activity(db, "chat_files", 0, "FILE_UPLOADED", current_user, {"file_name": file.filename, "file_size": len(content)})
    db.commit()

    return {
        "file_url": file_url,
        "file_name": file.filename or "file",
        "file_size": len(content),
        "file_type": file.content_type or "application/octet-stream",
    }


# ─── Helper Functions ────────────────────────────────────────────────

def _check_friendship(db: Session, user1_id: int, user2_id: int):
    """Verify two users are friends (accepted friend request)."""
    friendship = db.query(FriendRequest).filter(
        FriendRequest.status == FriendRequestStatus.ACCEPTED,
        or_(
            and_(FriendRequest.sender_id == user1_id, FriendRequest.receiver_id == user2_id),
            and_(FriendRequest.sender_id == user2_id, FriendRequest.receiver_id == user1_id),
        ),
    ).first()
    if not friendship:
        raise HTTPException(status_code=403, detail="You must be friends to send messages")


def _check_workspace_member(db: Session, workspace_id: int, user_id: int):
    """Verify user is a member of the workspace."""
    member = db.query(WorkspaceMember).filter(
        WorkspaceMember.workspace_id == workspace_id,
        WorkspaceMember.user_id == user_id,
    ).first()
    if not member:
        raise HTTPException(status_code=403, detail="Not a member of this workspace")


def _build_friend_request_response(fr: FriendRequest, db: Session) -> dict:
    sender = db.query(User).filter(User.id == fr.sender_id).first()
    receiver = db.query(User).filter(User.id == fr.receiver_id).first()
    return FriendRequestResponse(
        id=fr.id,
        sender_id=fr.sender_id,
        receiver_id=fr.receiver_id,
        sender_name=sender.full_name if sender else "",
        sender_username=sender.username if sender else "",
        sender_avatar=sender.avatar_url if sender else None,
        receiver_name=receiver.full_name if receiver else "",
        receiver_username=receiver.username if receiver else "",
        receiver_avatar=receiver.avatar_url if receiver else None,
        status=fr.status.value,
        message=fr.message,
        created_at=fr.created_at,
    )


def _build_dm_response(msg: DirectMessage) -> dict:
    return DirectMessageResponse(
        id=msg.id,
        sender_id=msg.sender_id,
        receiver_id=msg.receiver_id,
        content=msg.content,
        message_type=msg.message_type.value if msg.message_type else "text",
        file_url=msg.file_url,
        file_name=msg.file_name,
        file_size=msg.file_size,
        file_type=msg.file_type,
        created_at=msg.created_at,
        read_at=msg.read_at,
    )


def _build_workspace_response(ws: Workspace, db: Session) -> dict:
    members = db.query(WorkspaceMember).filter(WorkspaceMember.workspace_id == ws.id).all()
    member_list = []
    for m in members:
        user = db.query(User).filter(User.id == m.user_id).first()
        if user:
            member_list.append(WorkspaceMemberResponse(
                id=m.id,
                workspace_id=m.workspace_id,
                user_id=m.user_id,
                username=user.username,
                full_name=user.full_name,
                avatar_url=user.avatar_url,
                role=m.role.value if m.role else "member",
                joined_at=m.joined_at,
            ))
    return WorkspaceResponse(
        id=ws.id,
        name=ws.name,
        description=ws.description,
        avatar_url=ws.avatar_url,
        created_by=ws.created_by,
        created_at=ws.created_at,
        updated_at=ws.updated_at,
        members=member_list,
        member_count=len(member_list),
    )


def _build_workspace_member_response(m: WorkspaceMember, db: Session) -> dict:
    user = db.query(User).filter(User.id == m.user_id).first()
    return WorkspaceMemberResponse(
        id=m.id,
        workspace_id=m.workspace_id,
        user_id=m.user_id,
        username=user.username if user else "",
        full_name=user.full_name if user else "",
        avatar_url=user.avatar_url if user else None,
        role=m.role.value if m.role else "member",
        joined_at=m.joined_at,
    )


def _build_ws_message_response(msg: WorkspaceMessage, db: Session) -> dict:
    sender = db.query(User).filter(User.id == msg.sender_id).first()
    return WorkspaceMessageResponse(
        id=msg.id,
        workspace_id=msg.workspace_id,
        sender_id=msg.sender_id,
        sender_name=sender.full_name if sender else "",
        sender_avatar=sender.avatar_url if sender else None,
        content=msg.content,
        message_type=msg.message_type.value if msg.message_type else "text",
        file_url=msg.file_url,
        file_name=msg.file_name,
        file_size=msg.file_size,
        file_type=msg.file_type,
        created_at=msg.created_at,
    )
