import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from app.core.config import settings
from app.api.v1.api import api_router
from app.auto_migrate import run_migration
from app.middleware.activity_audit import ActivityAuditMiddleware

run_migration()

app = FastAPI(
    title=settings.PROJECT_NAME,
    version=settings.VERSION,
    openapi_url=f"{settings.API_V1_STR}/openapi.json"
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.BACKEND_CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.add_middleware(ActivityAuditMiddleware)

# Include API router (REST + WebSocket)
app.include_router(api_router, prefix=settings.API_V1_STR)

# Serve uploaded files (chat files, documents, etc.)
UPLOADS_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "uploads")
os.makedirs(UPLOADS_PATH, exist_ok=True)
app.mount("/uploads", StaticFiles(directory=UPLOADS_PATH), name="uploads")

@app.get("/")
async def root():
    return {"message": "Medrad Admin Panel API", "version": settings.VERSION}

@app.get("/health")
async def health_check():
    return {"status": "healthy"}
