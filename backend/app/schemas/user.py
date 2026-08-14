
from typing import Optional, List, Dict
from datetime import datetime
from pydantic import BaseModel, EmailStr, field_validator


def _validate_password(value: Optional[str]) -> Optional[str]:
    if value is None:
        return value
    if len(value) < 12:
        raise ValueError("Password must contain at least 12 characters")
    if len(value.encode("utf-8")) > 72:
        raise ValueError("Password is too long")
    return value


class UserBase(BaseModel):
    username: str
    email: EmailStr
    full_name: str
    role: Optional[str] = "employee"


class UserCreate(UserBase):
    password: str
    phone: Optional[str] = None
    user_type: Optional[str] = "employee"
    facility_ids: Optional[List[int]] = None

    _password_policy = field_validator("password")(_validate_password)


class UserUpdate(BaseModel):
    username: Optional[str] = None
    email: Optional[EmailStr] = None
    full_name: Optional[str] = None
    password: Optional[str] = None
    phone: Optional[str] = None
    role: Optional[str] = None
    user_type: Optional[str] = None
    is_active: Optional[bool] = None
    facility_ids: Optional[List[int]] = None

    _password_policy = field_validator("password")(_validate_password)


class UserProfileUpdate(BaseModel):
    email: Optional[EmailStr] = None
    full_name: Optional[str] = None
    phone: Optional[str] = None
    password: Optional[str] = None

    _password_policy = field_validator("password")(_validate_password)


class UserRoleUpdate(BaseModel):
    role: str


class UserPermissionRule(BaseModel):
    index: bool = False
    view: bool = False
    add: bool = False
    edit: bool = False
    delete: bool = False
    scope: str = "own"


class UserPermissionsUpdate(BaseModel):
    permissions: Dict[str, UserPermissionRule]


class PermissionCatalogModule(BaseModel):
    key: str
    label: str


class PermissionCatalogResponse(BaseModel):
    modules: List[PermissionCatalogModule]
    actions: List[str]
    scopes: List[str]


class FacilityBrief(BaseModel):
    id: int
    name: str

    class Config:
        from_attributes = True


class UserResponse(BaseModel):
    id: int
    username: str
    email: str
    full_name: str
    phone: Optional[str] = None
    avatar_url: Optional[str] = None
    user_type: str
    role: str
    is_active: bool
    facility_id: Optional[int] = None
    permissions: Optional[Dict[str, UserPermissionRule]] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    facilities: Optional[List[FacilityBrief]] = None

    class Config:
        from_attributes = True


class UserListResponse(BaseModel):
    items: List[UserResponse]
    total: int


class UserSearchResponse(BaseModel):
    id: int
    username: str
    email: str
    full_name: str
    avatar_url: Optional[str] = None
    role: str
    is_active: bool

    class Config:
        from_attributes = True
