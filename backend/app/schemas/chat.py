from typing import Optional, List
from datetime import datetime
from pydantic import BaseModel


# ─── Friend Requests ────────────────────────────────────────────────

class FriendRequestCreate(BaseModel):
    receiver_id: int
    message: Optional[str] = None


class FriendRequestResponse(BaseModel):
    id: int
    sender_id: int
    receiver_id: int
    sender_name: str
    sender_username: str
    sender_avatar: Optional[str] = None
    receiver_name: str
    receiver_username: str
    receiver_avatar: Optional[str] = None
    status: str
    message: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True


class FriendRequestListResponse(BaseModel):
    items: List[FriendRequestResponse]
    total: int


# ─── Direct Messages ────────────────────────────────────────────────

class DirectMessageCreate(BaseModel):
    content: str
    message_type: Optional[str] = "text"
    file_url: Optional[str] = None
    file_name: Optional[str] = None
    file_size: Optional[int] = None
    file_type: Optional[str] = None


class DirectMessageResponse(BaseModel):
    id: int
    sender_id: int
    receiver_id: int
    content: str
    message_type: str
    file_url: Optional[str] = None
    file_name: Optional[str] = None
    file_size: Optional[int] = None
    file_type: Optional[str] = None
    created_at: datetime
    read_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class DirectMessageListResponse(BaseModel):
    items: List[DirectMessageResponse]
    total: int


# ─── Workspaces ──────────────────────────────────────────────────────

class WorkspaceCreate(BaseModel):
    name: str
    description: Optional[str] = None
    member_ids: Optional[List[int]] = None


class WorkspaceMemberResponse(BaseModel):
    id: int
    workspace_id: int
    user_id: int
    username: str
    full_name: str
    avatar_url: Optional[str] = None
    role: str
    joined_at: datetime

    class Config:
        from_attributes = True


class WorkspaceResponse(BaseModel):
    id: int
    name: str
    description: Optional[str] = None
    avatar_url: Optional[str] = None
    created_by: Optional[int] = None
    created_at: datetime
    updated_at: datetime
    members: List[WorkspaceMemberResponse] = []
    member_count: int = 0

    class Config:
        from_attributes = True


class WorkspaceListResponse(BaseModel):
    items: List[WorkspaceResponse]
    total: int


class WorkspaceMemberAdd(BaseModel):
    user_id: int


# ─── Workspace Messages ─────────────────────────────────────────────

class WorkspaceMessageCreate(BaseModel):
    content: str
    message_type: Optional[str] = "text"
    file_url: Optional[str] = None
    file_name: Optional[str] = None
    file_size: Optional[int] = None
    file_type: Optional[str] = None


class WorkspaceMessageResponse(BaseModel):
    id: int
    workspace_id: int
    sender_id: int
    sender_name: str
    sender_avatar: Optional[str] = None
    content: str
    message_type: str
    file_url: Optional[str] = None
    file_name: Optional[str] = None
    file_size: Optional[int] = None
    file_type: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True


class WorkspaceMessageListResponse(BaseModel):
    items: List[WorkspaceMessageResponse]
    total: int
