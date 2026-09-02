import os
from fastapi import FastAPI, Request, Response, status
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import text
from starlette.middleware.trustedhost import TrustedHostMiddleware
from starlette.exceptions import HTTPException as StarletteHTTPException
from app.core.config import settings
from app.api.v1.api import api_router
from app.auto_migrate import run_migration
from app.db.base import engine
from app.middleware.activity_audit import ActivityAuditMiddleware
from app.middleware.security import ApiSecurityMiddleware
from app.utils.rate_limit import _redis_client
from app.utils.upload_security import PublicUploadsStaticFiles
from app.api.v1.endpoints.websocket import manager as websocket_manager

if settings.RUN_STARTUP_MIGRATIONS:
    run_migration()

api_docs_enabled = settings.ENABLE_API_DOCS and not settings.is_production

app = FastAPI(
    title=settings.PROJECT_NAME,
    version=settings.VERSION,
    debug=False,
    docs_url="/docs" if api_docs_enabled else None,
    redoc_url="/redoc" if api_docs_enabled else None,
    openapi_url=f"{settings.API_V1_STR}/openapi.json" if api_docs_enabled else None,
)

app.add_middleware(ActivityAuditMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.BACKEND_CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=[
        "Authorization",
        "Content-Type",
        "Idempotency-Key",
        "X-CSRF-Token",
        "X-Request-ID",
    ],
    expose_headers=["X-Request-ID", "Retry-After"],
)
app.add_middleware(TrustedHostMiddleware, allowed_hosts=settings.TRUSTED_HOSTS)
app.add_middleware(ApiSecurityMiddleware)


@app.exception_handler(StarletteHTTPException)
async def safe_http_exception_handler(request: Request, exc: StarletteHTTPException):
    request_id = getattr(request.state, "request_id", None)
    content = {"detail": exc.detail}
    if request_id:
        content["request_id"] = request_id
    return JSONResponse(status_code=exc.status_code, content=content, headers=exc.headers)


@app.exception_handler(RequestValidationError)
async def safe_validation_exception_handler(request: Request, exc: RequestValidationError):
    # Keep field-level feedback required by existing forms, but never echo the
    # submitted value or validator context back to the browser.
    errors = [
        {key: value for key, value in error.items() if key not in {"input", "ctx", "url"}}
        for error in exc.errors()
    ]
    content = {
        "detail": errors,
        "request_id": getattr(request.state, "request_id", None),
    }
    return JSONResponse(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, content=content)

# Include API router (REST + WebSocket)
app.include_router(api_router, prefix=settings.API_V1_STR)

# Read-only tool API for the assistant microservice. Deliberately mounted
# outside the public API prefix: it is reachable only from the private Docker
# network and requires the internal shared key in addition to a Super Admin
# bearer token. The edge proxy must not expose /internal.
from app.api.v1.endpoints import assistant_internal  # noqa: E402

app.include_router(
    assistant_internal.router, prefix="/internal/v1", tags=["assistant-internal"]
)

# Serve only explicitly classified public presentation media. Sensitive upload
# subtrees are deny-by-default and are delivered by authorization-aware APIs.
UPLOADS_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "uploads")
os.makedirs(UPLOADS_PATH, exist_ok=True)
app.mount("/uploads", PublicUploadsStaticFiles(directory=UPLOADS_PATH), name="uploads")


@app.on_event("startup")
async def start_realtime_backplane():
    await websocket_manager.start()


@app.on_event("shutdown")
async def stop_realtime_backplane():
    await websocket_manager.close()

@app.get("/")
async def root():
    return {"message": "Medrad Admin Panel API", "version": settings.VERSION}

@app.get("/health")
async def health_check():
    return {"status": "healthy"}


@app.get("/ready")
def readiness_check(response: Response):
    """Report whether required stateful dependencies can serve traffic."""
    try:
        with engine.connect() as connection:
            connection.execute(text("SELECT 1"))
        _redis_client().ping()
    except Exception:
        response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE
        return {"status": "not_ready"}
    return {"status": "ready"}
