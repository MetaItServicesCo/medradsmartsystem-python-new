from typing import Optional

from fastapi import Request
from jose import JWTError
from sqlalchemy.orm import Session
from starlette.middleware.base import BaseHTTPMiddleware

from app.core.config import settings
from app.core.security import decode_token
from app.db.base import SessionLocal
from app.models.user import User
from app.utils.logging import log_activity


SKIPPED_MODULES = {
    "auth",
    "audit-logs",
    "dashboard",
    "websocket",
}

SENSITIVE_QUERY_KEYS = {
    "token",
    "access_token",
    "refresh_token",
    "password",
}


def _get_bearer_token(request: Request) -> Optional[str]:
    auth_header = request.headers.get("authorization", "")
    scheme, _, token = auth_header.partition(" ")
    if scheme.lower() != "bearer" or not token:
        return None
    return token


def _get_user_from_request(db: Session, request: Request) -> Optional[User]:
    token = _get_bearer_token(request)
    if not token:
        return None

    try:
        payload = decode_token(token)
    except JWTError:
        return None

    username = payload.get("sub")
    if not username:
        return None

    return db.query(User).filter(User.username == username).first()


def _api_parts(path: str) -> list[str]:
    prefix = settings.API_V1_STR.rstrip("/")
    if not path.startswith(f"{prefix}/"):
        return []
    relative_path = path[len(prefix):].strip("/")
    return [part for part in relative_path.split("/") if part]


def _record_id(parts: list[str]) -> int:
    for part in parts[1:]:
        if part.isdigit():
            return int(part)
    return 0


def _action_for(method: str, record_id: int, status_code: int) -> str:
    if status_code >= 400:
        return "REQUEST_FAILED"
    if method == "GET":
        return "VIEW_DETAIL" if record_id else "VIEW_LIST"
    if method == "POST":
        return "API_CREATE"
    if method in {"PUT", "PATCH"}:
        return "API_UPDATE"
    if method == "DELETE":
        return "API_DELETE"
    return f"API_{method}"


def _safe_query_params(request: Request) -> dict:
    params = {}
    for key, value in request.query_params.multi_items():
        if key.lower() in SENSITIVE_QUERY_KEYS:
            params[key] = "[redacted]"
        else:
            params[key] = value[:250] if isinstance(value, str) else value
    return params


class ActivityAuditMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)

        if request.method == "OPTIONS":
            return response

        parts = _api_parts(request.url.path)
        if not parts or parts[0] in SKIPPED_MODULES:
            return response

        db = SessionLocal()
        try:
            user = _get_user_from_request(db, request)
            if not user:
                return response

            record_id = _record_id(parts)
            module = parts[0]
            action = _action_for(request.method, record_id, response.status_code)
            metadata = {
                "activity_type": "api_request",
                "module": module,
                "method": request.method,
                "path": request.url.path,
                "query": _safe_query_params(request),
                "status_code": response.status_code,
                "record_id": record_id or None,
                "user_id": user.id,
                "user_role": user.role.value if hasattr(user.role, "value") else str(user.role),
                "ip_address": request.client.host if request.client else None,
                "user_agent": request.headers.get("user-agent"),
            }
            log_activity(db, f"{module.replace('-', '_')}_activity", record_id, action, user, metadata)
            db.commit()
        except Exception:
            db.rollback()
        finally:
            db.close()

        return response
