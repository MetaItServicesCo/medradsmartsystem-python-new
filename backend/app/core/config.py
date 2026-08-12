from typing import List
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    PROJECT_NAME: str = "Medrad Admin Panel"
    VERSION: str = "2.0.0"
    API_V1_STR: str = "/api/v1"
    
    # Database
    DATABASE_URL: str = "postgresql://medrad:medrad123@localhost:5432/medrad_db"
    
    # Security
    SECRET_KEY: str = "your-secret-key-change-in-production"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7
    
    # CORS
    BACKEND_CORS_ORIGINS: List[str] = [
        "http://localhost:3000",
        "http://localhost:5173",
        "http://127.0.0.1:3000",
        "http://127.0.0.1:5173",
        "http://134.199.192.91:3000",
        "http://134.199.192.91",
    ]
    
    # File Upload
    UPLOAD_DIR: str = "uploads"
    MAX_UPLOAD_SIZE: int = 10 * 1024 * 1024  # 10MB
    
    # Face Recognition
    FACE_RECOGNITION_TOLERANCE: float = 0.6
    FACE_RECOGNITION_MIN_CONFIDENCE: float = 0.85
    
    # Email
    SMTP_HOST: str = "smtp.gmail.com"
    SMTP_PORT: int = 587
    SMTP_USER: str = ""
    SMTP_PASSWORD: str = ""
    SMTP_FROM_EMAIL: str = ""
    PUBLIC_APP_URL: str = "http://localhost:3000"

    # Temporary QA-only payment simulation. This must be disabled when a real
    # payment processor is connected.
    ENABLE_TEST_PAYMENTS: bool = False

    # Square payments. The application ID and location ID are safe to expose
    # through the public payment configuration response. The access token and
    # webhook signature key must remain backend-only.
    SQUARE_ENVIRONMENT: str = "sandbox"
    SQUARE_APPLICATION_ID: str = ""
    SQUARE_ACCESS_TOKEN: str = ""
    SQUARE_LOCATION_ID: str = ""
    SQUARE_CURRENCY: str = "USD"
    SQUARE_API_VERSION: str = "2026-07-15"
    SQUARE_WEBHOOK_SIGNATURE_KEY: str = ""
    SQUARE_WEBHOOK_NOTIFICATION_URL: str = ""

    # Comma-separated Fernet keys. The first key encrypts new reusable payment
    # references; remaining keys decrypt older values during key rotation.
    # Generate with: python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
    PAYMENT_DATA_ENCRYPTION_KEYS: str = ""

    # Dedicated recurring-rental cron worker. The job itself is idempotent and
    # protected by a PostgreSQL advisory lock, so a short interval is safe and
    # also drains failed receipt deliveries promptly.
    RENTAL_BILLING_INTERVAL_SECONDS: int = 900
    
    # Redis
    REDIS_URL: str = "redis://localhost:6379/0"
    
    class Config:
        env_file = ".env"
        case_sensitive = True

settings = Settings()
