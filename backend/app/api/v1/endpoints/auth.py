from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from sqlalchemy import func
from sqlalchemy.orm import Session
from app.core.config import settings
from app.db.base import get_db
from app.core.security import create_access_token, decode_token, password_token_version, verify_password
from app.models.user import User
from app.utils.logging import log_activity
from app.utils.rate_limit import check_rate_limit, clear_rate_limit, enforce_rate_limit, request_ip
from app.utils.token_revocation import revoke_access_token

router = APIRouter()
logout_token_scheme = OAuth2PasswordBearer(tokenUrl=f"{settings.API_V1_STR}/auth/login")

@router.post("/login")
def login(
    request: Request,
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: Session = Depends(get_db)
):
    normalized_username = form_data.username.strip().lower()
    client_identity = request_ip(request)
    limiter_args = {
        "window_seconds": settings.AUTH_LOGIN_WINDOW_SECONDS,
        "message": "Too many login attempts. Please wait before trying again.",
    }
    check_rate_limit(
        bucket="auth-login-ip",
        identity=client_identity,
        limit=settings.AUTH_LOGIN_IP_LIMIT,
        **limiter_args,
    )
    check_rate_limit(
        bucket="auth-login-account",
        identity=normalized_username,
        limit=settings.AUTH_LOGIN_ACCOUNT_LIMIT,
        **limiter_args,
    )
    user = db.query(User).filter(func.lower(User.username) == normalized_username).first()
    
    if not user or not verify_password(form_data.password, user.hashed_password):
        if user:
            user.failed_login_attempts = int(user.failed_login_attempts or 0) + 1
            db.commit()
        enforce_rate_limit(
            bucket="auth-login-ip",
            identity=client_identity,
            limit=settings.AUTH_LOGIN_IP_LIMIT,
            **limiter_args,
        )
        enforce_rate_limit(
            bucket="auth-login-account",
            identity=normalized_username,
            limit=settings.AUTH_LOGIN_ACCOUNT_LIMIT,
            **limiter_args,
        )
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password"
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
        is_active=True
    )
    db.add(db_user)
    log_activity(db, "users", -1, "REGISTER", db_user) # -1 temporarily as ID not yet generated
    db.commit()
    db.refresh(db_user)
    
    return {"message": "User successfully registered", "user_id": db_user.id}
