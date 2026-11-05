import logging
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from sqlalchemy import func
from sqlalchemy.orm import Session
from app.core.config import settings
from app.core.deps import get_current_user
from app.db.base import get_db
from app.core.security import (
    create_access_token, decode_token, get_password_hash, password_token_version, verify_password,
)
from app.models.user import User
from app.utils.logging import log_activity
from app.utils.notifications import create_notifications
from app.utils.rate_limit import check_rate_limit, clear_rate_limit, enforce_rate_limit, request_ip
from app.utils.token_revocation import revoke_access_token

logger = logging.getLogger("medrad.auth")

router = APIRouter()
# Checked against when the username does not exist, so an unknown name costs
# the same bcrypt work as a wrong password and cannot be told apart by timing.
_UNKNOWN_USER_HASH = get_password_hash("unknown-user-timing-equaliser")
logout_token_scheme = OAuth2PasswordBearer(tokenUrl=f"{settings.API_V1_STR}/auth/login")

def authenticate_credentials(request: Request, db: Session, username: str, password: str) -> User:
    """The password check every sign-in uses - the web login and a tracking
    device's - so both are throttled and refused identically. Returns the
    user once the password is right and the account may sign in."""
    normalized_username = username.strip().lower()
    client_identity = request_ip(request)
    limiter_args = {
        "window_seconds": settings.AUTH_LOGIN_WINDOW_SECONDS,
        "message": "Too many login attempts. Please wait before trying again.",
    }
    # Only the per-source limit runs before the password is checked. That
    # one is self-inflicted: the only thing you can throttle by hammering
    # it is whatever you are hammering it from.
    #
    # The per-account limit deliberately does NOT run here. It used to,
    # and that handed anybody who knew a username the ability to lock its
    # owner out for fifteen minutes from a phone: ten wrong guesses and
    # the real person was refused before their password was even looked
    # at. The limit still applies to every failure below, so guessing is
    # bounded exactly as it was. What changed is that a correct password
    # is now always accepted -- somebody who has guessed right has, by
    # definition, stopped guessing, and throttling them protects nothing.
    check_rate_limit(
        bucket="auth-login-ip",
        identity=client_identity,
        limit=settings.AUTH_LOGIN_IP_LIMIT,
        **limiter_args,
    )
    user = db.query(User).filter(func.lower(User.username) == normalized_username).first()
    
    password_ok = verify_password(password, user.hashed_password if user else _UNKNOWN_USER_HASH)
    if not user or not password_ok:
        if user:
            user.failed_login_attempts = int(user.failed_login_attempts or 0) + 1
            db.commit()
        enforce_rate_limit(
            bucket="auth-login-ip",
            identity=client_identity,
            limit=settings.AUTH_LOGIN_IP_LIMIT,
            **limiter_args,
        )
        try:
            enforce_rate_limit(
                bucket="auth-login-account",
                identity=normalized_username,
                limit=settings.AUTH_LOGIN_ACCOUNT_LIMIT,
                **limiter_args,
            )
        except HTTPException:
            # Sustained wrong guesses against one account. Worth seeing,
            # because it is now the only trace there is: the owner is no
            # longer locked out, so nobody will ring up to report it.
            logger.warning(
                "Login throttled for account %s from %s after repeated "
                "failures; the owner can still sign in with the correct "
                "password.", normalized_username, client_identity,
            )
            raise
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password"
        )
    
    if not user.is_active and user.last_login is None and not user.is_locked:
        # Only someone who knows the password learns this: a sign-up that has
        # not been approved yet.
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Your account is awaiting approval by an administrator"
        )
    if not user.is_active or user.is_locked:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User account is unavailable"
        )

    clear_rate_limit(
        bucket="auth-login-account",
        identity=normalized_username,
        window_seconds=settings.AUTH_LOGIN_WINDOW_SECONDS,
    )
    user.failed_login_attempts = 0
    return user


@router.post("/login")
def login(
    request: Request,
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: Session = Depends(get_db)
):
    user = authenticate_credentials(request, db, form_data.username, form_data.password)
    user.last_login = func.now()
    
    log_activity(db, "users", user.id, "LOGIN", user)
    db.commit()
    
    access_token = create_access_token(data={
        "sub": user.username,
        "role": user.role.value if hasattr(user.role, "value") else str(user.role),
        "ver": password_token_version(user.hashed_password),
    })
    
    return {
        "access_token": access_token,
        "token_type": "bearer",
        "user": {
            "id": user.id,
            "username": user.username,
            "email": user.email,
            "full_name": user.full_name,
            "phone": user.phone,
            "avatar_url": user.avatar_url,
            "user_type": user.user_type.value if user.user_type else "employee",
            "role": user.role.value if hasattr(user.role, "value") else str(user.role),
            "is_active": user.is_active,
            "is_technician": bool(getattr(user, "is_technician", False)),
            "facility_id": user.facility_id,
            "permissions": user.permissions or {},
        }
    }


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(token: str = Depends(logout_token_scheme)):
    try:
        payload = decode_token(token)
    except Exception:
        # Logout is intentionally idempotent: an already expired or invalid
        # token is indistinguishable from a session that is already closed.
        return Response(status_code=status.HTTP_204_NO_CONTENT)
    revoke_access_token(payload)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/refresh")
def refresh_access_token(
    token: str = Depends(logout_token_scheme),
    current_user: User = Depends(get_current_user),
):
    """A fresh access token for someone still working.

    An access token has a fixed lifetime from sign-in, so without this a user
    in the middle of their work was signed out when it ran out. The app asks
    for a new one only while its user is active; an idle session still ends
    by the app's inactivity timeout. The token presented must pass every
    check a normal request does - not expired, not logged out, password
    unchanged, account active - so nothing that could not sign a request can
    extend a session. It stays valid until its own expiry, as requests already
    in flight may still carry it.

    A session is renewed for at most SESSION_MAX_HOURS from its sign-in, which
    every renewed token carries (auth_time; a token from sign-in has only its
    iat), so a token that leaked cannot be kept alive indefinitely.
    """
    payload = decode_token(token)  # get_current_user has already verified it
    signed_in_at = int(payload.get("auth_time") or payload["iat"])
    if datetime.now(timezone.utc).timestamp() - signed_in_at >= settings.SESSION_MAX_HOURS * 3600:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Your session has ended. Please sign in again.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return {
        "access_token": create_access_token(data={
            "sub": current_user.username,
            "role": current_user.role.value if hasattr(current_user.role, "value") else str(current_user.role),
            "ver": password_token_version(current_user.hashed_password),
            "auth_time": signed_in_at,
        }),
        "token_type": "bearer",
    }

from app.schemas.user import UserCreate

@router.post("/register", response_model=dict, status_code=status.HTTP_201_CREATED)
def register(
    request: Request,
    user_in: UserCreate,
    db: Session = Depends(get_db)
):
    from app.core.security import get_password_hash
    enforce_rate_limit(
        bucket="auth-register-ip",
        identity=request_ip(request),
        limit=settings.AUTH_REGISTER_IP_LIMIT,
        window_seconds=settings.AUTH_REGISTER_WINDOW_SECONDS,
        message="Too many registration attempts. Please wait before trying again.",
    )
    normalized_username = user_in.username.strip()
    normalized_email = str(user_in.email).strip().lower()
    # Check if username or email already exists
    existing = db.query(User).filter(
        (func.lower(User.username) == normalized_username.lower())
        | (func.lower(User.email) == normalized_email)
    ).first()
    if existing:
        raise HTTPException(
            status_code=400,
            detail="Username or email already registered"
        )
    
    from app.models.user import UserType, UserRole
    db_user = User(
        username=normalized_username,
        email=normalized_email,
        full_name=user_in.full_name,
        hashed_password=get_password_hash(user_in.password),
        user_type=UserType.EMPLOYEE,
        # Public callers can never self-select an elevated role. Privileged
        # roles are assigned only through the protected user-management API.
        role=UserRole.EMPLOYEE,
        # A stranger who signs up reaches nothing until a Super Admin or HR
        # Manager approves the account (Users > Activate) and sets its role.
        is_active=False,
    )
    db.add(db_user)
    log_activity(db, "users", -1, "REGISTER", db_user) # -1 temporarily as ID not yet generated
    db.flush()
    approvers = db.query(User.id).filter(
        User.is_active.is_(True), User.role.in_([UserRole.SUPERADMIN, UserRole.HR_MANAGER])
    ).all()
    create_notifications(
        db,
        user_ids=[approver.id for approver in approvers],
        title="New sign-up awaiting approval",
        message=f"{db_user.full_name or db_user.username} ({db_user.email}) signed up. Activate the account in Users to give access.",
        notification_type="user",
        link_url="/users",
    )
    db.commit()
    db.refresh(db_user)

    return {"message": "Account created. An administrator must approve it before you can sign in.",
            "user_id": db_user.id, "pending_approval": True}
