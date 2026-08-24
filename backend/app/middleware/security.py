from __future__ import annotations

import hashlib
import logging
import time
import uuid

from fastapi import HTTPException, Request
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import JSONResponse, Response

from app.core.config import settings
from app.utils.rate_limit import enforce_rate_limit, request_ip
from app.utils.read_cache import invalidate_read_cache, mutation_cache_namespaces


logger = logging.getLogger("medrad.request")

_RATE_LIMIT_EXEMPT_PATHS = {
    "/health",
    "/ready",
}

def _safe_log_path(path: str) -> str:
    """Redact unguessable portal tokens from operational request logs."""
    parts = path.split("/")
    contains_public_route = any(part.lower() in {"public", "portal"} for part in parts)
    if not contains_public_route:
        return path
    return "/".join(
        "[redacted-token]" if len(part) >= 16 else part
        for part in parts
    )


def _request_identity(request: Request) -> str:
    """Use a token-scoped identity for signed-in traffic and IP otherwise.

    Only a short SHA-256 digest is retained in Redis. Bearer tokens and other
    credentials are never written to rate-limit keys or logs.
    """
    authorization = request.headers.get("authorization", "")
    if authorization.lower().startswith("bearer "):
        digest = hashlib.sha256(authorization.encode("utf-8")).hexdigest()[:24]
        return f"token:{digest}"
    return f"ip:{request_ip(request)}"


def _request_id(request: Request) -> str:
    supplied = request.headers.get("x-request-id", "").strip()
    if supplied and len(supplied) <= 80 and all(ch.isalnum() or ch in "-_." for ch in supplied):
        return supplied
    return str(uuid.uuid4())


class ApiSecurityMiddleware(BaseHTTPMiddleware):
    """Apply API-wide safeguards without changing endpoint business logic."""

    async def dispatch(self, request: Request, call_next) -> Response:
        started = time.perf_counter()
        request_id = _request_id(request)
        request.state.request_id = request_id

        content_length = request.headers.get("content-length")
        if content_length:
            try:
                if int(content_length) > settings.MAX_REQUEST_BODY_SIZE:
                    return self._secure_response(
                        JSONResponse(
                            status_code=413,
                            content={"detail": "Request body is too large", "request_id": request_id},
                        ),
                        request_id,
                        request,
                    )
            except ValueError:
                return self._secure_response(
                    JSONResponse(
                        status_code=400,
                        content={"detail": "Invalid Content-Length header", "request_id": request_id},
                    ),
                    request_id,
                    request,
                )

        if (
            request.url.path.startswith(f"{settings.API_V1_STR}/")
            and request.url.path not in _RATE_LIMIT_EXEMPT_PATHS
            and "/ws/" not in request.url.path
            and request.method != "OPTIONS"
        ):
            try:
                enforce_rate_limit(
                    bucket="api",
                    identity=_request_identity(request),
                    limit=settings.API_RATE_LIMIT,
                    window_seconds=settings.API_RATE_LIMIT_WINDOW_SECONDS,
                    message="Too many API requests. Please wait before trying again.",
                )
            except HTTPException as exc:
                response = JSONResponse(
                    status_code=exc.status_code,
                    content={"detail": exc.detail, "request_id": request_id},
                    headers=exc.headers,
                )
                return self._secure_response(response, request_id, request)

        try:
            response = await call_next(request)
        except Exception:
            logger.exception(
                "Unhandled request failure request_id=%s method=%s path=%s",
                request_id,
                request.method,
                _safe_log_path(request.url.path),
            )
            response = JSONResponse(
                status_code=500,
                content={"detail": "An unexpected server error occurred", "request_id": request_id},
            )

        response = self._secure_response(response, request_id, request)
        if request.method in {"POST", "PUT", "PATCH", "DELETE"} and 200 <= response.status_code < 400:
            invalidate_read_cache(*mutation_cache_namespaces(request.url.path))
        duration_ms = round((time.perf_counter() - started) * 1000, 2)
        log_args = (
            request_id,
            request.method,
            _safe_log_path(request.url.path),
            response.status_code,
            duration_ms,
            request_ip(request),
        )
        if duration_ms >= settings.SLOW_REQUEST_THRESHOLD_MS:
            logger.warning(
                "slow_request request_id=%s method=%s path=%s status=%s duration_ms=%s ip=%s",
                *log_args,
            )
        elif response.status_code >= 500:
            logger.error(
                "request_failed request_id=%s method=%s path=%s status=%s duration_ms=%s ip=%s",
                *log_args,
            )
        elif response.status_code >= 400 or self._sample_success(request_id):
            logger.info(
                "request_id=%s method=%s path=%s status=%s duration_ms=%s ip=%s",
                *log_args,
            )
        return response

    @staticmethod
    def _sample_success(request_id: str) -> bool:
        """Deterministically sample routine successes without losing errors.

        Audit records remain complete; this only bounds high-volume operational
        request logging so log I/O does not become an API bottleneck.
        """
        rate = settings.REQUEST_LOG_SUCCESS_SAMPLE_RATE
        if rate >= 1:
            return True
        if rate <= 0:
            return False
        bucket = int(hashlib.sha256(request_id.encode("utf-8")).hexdigest()[:8], 16)
        return bucket / 0xFFFFFFFF < rate

    @staticmethod
    def _secure_response(response: Response, request_id: str, request: Request) -> Response:
        response.headers["X-Request-ID"] = request_id
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["X-XSS-Protection"] = "0"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        response.headers["Permissions-Policy"] = (
            "camera=(self), microphone=(self), geolocation=(), payment=(self)"
        )
        response.headers.setdefault("Cross-Origin-Resource-Policy", "same-site")
        if response.headers.get("content-type", "").startswith("application/json"):
            response.headers.setdefault("Cache-Control", "no-store")
        if request.url.path.startswith("/uploads/"):
            response.headers["Cache-Control"] = "private, no-store"
        return response
