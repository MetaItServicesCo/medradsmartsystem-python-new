from typing import Optional
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.security import decode_token, password_token_version
from app.db.base import get_db
from app.models.user import User
from app.utils.token_revocation import access_token_is_revoked

oauth2_scheme = OAuth2PasswordBearer(tokenUrl=f"{settings.API_V1_STR}/auth/login")


def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
) -> User:
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = decode_token(token)
        username: Optional[str] = payload.get("sub")
        if (
            username is None
            or payload.get("token_type") != "access"
            or access_token_is_revoked(payload)
        ):
            raise credentials_exception
    except JWTError:
        raise credentials_exception

    user = db.query(User).filter(User.username == username).first()
    if user is None:
        raise credentials_exception
    if payload.get("ver") != password_token_version(user.hashed_password):
        raise credentials_exception
    if not user.is_active:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="User account is inactive")
    return user


def require_roles(*roles: str):
    """Dependency factory — raises 403 if user role not in allowed roles."""
    def role_checker(current_user: User = Depends(get_current_user)) -> User:
        if current_user.role.value not in roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Insufficient permissions. Required: {roles}",
            )
        return current_user
    return role_checker


# Convenience shortcuts
get_admin_user = require_roles("superadmin", "admin")
get_superadmin_user = require_roles("superadmin")
get_facility_admin_user = require_roles("superadmin", "admin", "facility_admin")
