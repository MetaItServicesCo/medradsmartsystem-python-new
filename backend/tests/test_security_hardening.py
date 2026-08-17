from __future__ import annotations

from datetime import timedelta
from types import SimpleNamespace
import time

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from jose import JWTError

from app.core.config import Settings
from app.core.security import create_access_token, decode_token, password_token_version
from app.api.v1.endpoints import auth as auth_endpoint
from app.api.v1.endpoints import users as users_endpoint
from app.models.user import UserRole
from app.middleware.security import ApiSecurityMiddleware, _safe_log_path
from app.schemas.user import UserCreate, UserUpdate
from app.utils.token_revocation import access_token_is_revoked, revoke_access_token
from app.utils.upload_security import PublicUploadsStaticFiles, protected_upload_path


def test_access_tokens_are_short_lived_scoped_and_signed(monkeypatch) -> None:
    monkeypatch.setattr("app.core.security.settings.SECRET_KEY", "test-secret-key-that-is-long-enough-123")
    monkeypatch.setattr("app.core.security.settings.JWT_ISSUER", "medrad-test")
    monkeypatch.setattr("app.core.security.settings.JWT_AUDIENCE", "medrad-browser")

    token = create_access_token(
        {"sub": "admin", "ver": "password-version"},
        expires_delta=timedelta(minutes=5),
    )
    payload = decode_token(token)

    assert payload["sub"] == "admin"
    assert payload["token_type"] == "access"
    assert payload["iss"] == "medrad-test"
    assert payload["aud"] == "medrad-browser"
    assert payload["jti"]

    monkeypatch.setattr("app.core.security.settings.JWT_AUDIENCE", "wrong-audience")
    with pytest.raises(JWTError):
        decode_token(token)


@pytest.mark.parametrize("password", ["short", "x" * 73])
def test_user_password_validation_rejects_unsafe_lengths(password: str) -> None:
    with pytest.raises(ValueError):
        UserCreate(
            username="new-user",
            email="new-user@example.com",
            full_name="New User",
            password=password,
        )

    with pytest.raises(ValueError):
        UserUpdate(password=password)


def test_production_settings_reject_insecure_origins() -> None:
    with pytest.raises(ValueError, match="CORS"):
        Settings(
            _env_file=None,
            APP_ENV="production",
            SECRET_KEY="a-unique-production-secret-that-is-long-enough",
            PUBLIC_APP_URL="https://medcodesolution.com",
            TRUSTED_HOSTS=["medcodesolution.com"],
            BACKEND_CORS_ORIGINS=["http://medcodesolution.com"],
        )


def test_portal_tokens_are_redacted_from_request_logs() -> None:
    token = "a-very-long-public-portal-token-123456"
    safe_path = _safe_log_path(f"/api/v1/public/quotations/{token}/accept")
    assert token not in safe_path
    assert "[redacted-token]" in safe_path
    assert _safe_log_path("/api/v1/facilities/123") == "/api/v1/facilities/123"


def test_security_middleware_adds_request_and_browser_headers(monkeypatch) -> None:
    monkeypatch.setattr("app.middleware.security.enforce_rate_limit", lambda **_: None)
    test_app = FastAPI()
    test_app.add_middleware(ApiSecurityMiddleware)

    @test_app.get("/api/v1/example")
    def example():
        return {"ok": True}

    response = TestClient(test_app).get("/api/v1/example")

    assert response.status_code == 200
    assert response.headers["x-request-id"]
    assert response.headers["x-content-type-options"] == "nosniff"
    assert response.headers["x-frame-options"] == "DENY"
    assert response.headers["cache-control"] == "no-store"


def test_security_middleware_rate_limits_api_requests(monkeypatch) -> None:
    counts: dict[str, int] = {}

    class PipelineStub:
        def __init__(self):
            self.key = ""

        def __enter__(self):
            return self

        def __exit__(self, *_args):
            return None

        def incr(self, key):
            self.key = key
            return self

        def expire(self, *_args):
            return self

        def execute(self):
            counts[self.key] = counts.get(self.key, 0) + 1
            return counts[self.key], True

    class RedisStub:
        def pipeline(self, transaction=True):
            assert transaction is True
            return PipelineStub()

    monkeypatch.setattr("app.utils.rate_limit._redis_client", lambda: RedisStub())
    monkeypatch.setattr("app.middleware.security.settings.API_RATE_LIMIT", 1)
    test_app = FastAPI()
    test_app.add_middleware(ApiSecurityMiddleware)

    @test_app.get("/api/v1/limited")
    def limited():
        return {"ok": True}

    client = TestClient(test_app)
    assert client.get("/api/v1/limited").status_code == 200
    response = client.get("/api/v1/limited")
    assert response.status_code == 429
    assert response.headers["retry-after"]
    assert response.json()["request_id"]


def test_public_registration_cannot_self_assign_privileged_role(monkeypatch) -> None:
    class QueryStub:
        def filter(self, *_args, **_kwargs):
            return self

        def first(self):
            return None

    class DatabaseStub:
        created = None

        def query(self, *_args, **_kwargs):
            return QueryStub()

        def add(self, obj):
            self.created = obj
            obj.id = 77

        def commit(self):
            return None

        def refresh(self, _obj):
            return None

    monkeypatch.setattr(auth_endpoint, "enforce_rate_limit", lambda **_: None)
    monkeypatch.setattr(auth_endpoint, "log_activity", lambda *_args, **_kwargs: None)
    db = DatabaseStub()

    result = auth_endpoint.register(
        request=SimpleNamespace(client=SimpleNamespace(host="127.0.0.1")),
        user_in=UserCreate(
            username="public-user",
            email="public-user@example.com",
            full_name="Public User",
            password="a-safe-password-123",
            role=UserRole.SUPERADMIN,
        ),
        db=db,
    )

    assert result["user_id"] == 77
    assert db.created.role == UserRole.EMPLOYEE


def test_logout_revocation_uses_the_token_jti_until_expiry(monkeypatch) -> None:
    stored = {}

    class RedisStub:
        def setex(self, key, ttl, value):
            stored[key] = (ttl, value)

        def exists(self, key):
            return int(key in stored)

    redis_stub = RedisStub()
    monkeypatch.setattr("app.utils.token_revocation._redis_client", lambda: redis_stub)
    payload = {
        "jti": "logout-test-token",
        "exp": time.time() + 300,
    }

    assert access_token_is_revoked(payload) is False
    revoke_access_token(payload)
    assert access_token_is_revoked(payload) is True
    assert stored["medrad:revoked-token:logout-test-token"][0] > 0


def test_superadmin_impersonation_keeps_password_bound_token_compatibility(monkeypatch) -> None:
    monkeypatch.setattr("app.core.security.settings.SECRET_KEY", "test-secret-key-that-is-long-enough-123")
    monkeypatch.setattr("app.core.security.settings.JWT_ISSUER", "medrad-test")
    monkeypatch.setattr("app.core.security.settings.JWT_AUDIENCE", "medrad-browser")
    target = SimpleNamespace(
        id=44,
        username="facility-user",
        role=UserRole.FACILITY_ADMIN,
        hashed_password="$2b$12$password-hash-placeholder",
        is_active=True,
    )
    monkeypatch.setattr(users_endpoint.crud_user, "get", lambda *_args, **_kwargs: target)
    monkeypatch.setattr(users_endpoint, "log_activity", lambda *_args, **_kwargs: None)
    monkeypatch.setattr(users_endpoint, "_build_user_response", lambda *_args, **_kwargs: {"id": 44})

    result = users_endpoint.impersonate_user(
        user_id=44,
        db=SimpleNamespace(),
        current_user=SimpleNamespace(id=1),
    )
    payload = decode_token(result["access_token"])

    assert result["user"] == {"id": 44}
    assert payload["ver"] == password_token_version(target.hashed_password)


def test_upload_static_mount_denies_sensitive_subtrees_by_default(tmp_path) -> None:
    for subtree in (
        "profile_pictures",
        "test_equipment",
        "hr_documents",
        "chat_files",
        "attendance_faces",
        "facility_documents",
        "service_request_images",
        "future_private_uploads",
    ):
        directory = tmp_path / subtree
        directory.mkdir()
        (directory / "sample.txt").write_text(subtree, encoding="utf-8")

    test_app = FastAPI()
    test_app.mount("/uploads", PublicUploadsStaticFiles(directory=str(tmp_path)))
    client = TestClient(test_app)

    assert client.get("/uploads/profile_pictures/sample.txt").status_code == 200
    assert client.get("/uploads/test_equipment/sample.txt").status_code == 200
    for subtree in (
        "hr_documents",
        "chat_files",
        "attendance_faces",
        "facility_documents",
        "service_request_images",
        "future_private_uploads",
    ):
        response = client.get(f"/uploads/{subtree}/sample.txt")
        assert response.status_code == 404
        assert response.headers["cache-control"] == "no-store"


def test_protected_upload_path_accepts_only_expected_legacy_url_or_filename(tmp_path) -> None:
    expected = tmp_path / "safe.pdf"
    assert protected_upload_path(
        str(tmp_path),
        "/uploads/hr_documents/safe.pdf",
        "hr_documents",
    ) == str(expected.resolve())
    assert protected_upload_path(str(tmp_path), "safe.pdf", "hr_documents") == str(expected.resolve())

    for unsafe in (
        "../safe.pdf",
        "/uploads/other/safe.pdf",
        "/etc/passwd",
        "nested/safe.pdf",
    ):
        with pytest.raises(ValueError):
            protected_upload_path(str(tmp_path), unsafe, "hr_documents")
