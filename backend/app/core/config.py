from typing import List

from pydantic import model_validator
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    PROJECT_NAME: str = "Medrad Admin Panel"
    VERSION: str = "2.0.0"
    API_V1_STR: str = "/api/v1"
    APP_ENV: str = "development"
    ENABLE_API_DOCS: bool = True
    RUN_STARTUP_MIGRATIONS: bool = False
    
    # Database
    DATABASE_URL: str = "postgresql://medrad:medrad123@localhost:5432/medrad_db"
    DATABASE_POOL_SIZE: int = 10
    DATABASE_MAX_OVERFLOW: int = 20
    DATABASE_POOL_TIMEOUT_SECONDS: int = 30
    DATABASE_POOL_RECYCLE_SECONDS: int = 1800
    
    # Security
    SECRET_KEY: str = "your-secret-key-change-in-production"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7
    JWT_ISSUER: str = "medrad-api"
    JWT_AUDIENCE: str = "medrad-web"
    AUTH_LOGIN_IP_LIMIT: int = 30
    AUTH_LOGIN_ACCOUNT_LIMIT: int = 10
    AUTH_LOGIN_WINDOW_SECONDS: int = 900
    AUTH_REGISTER_IP_LIMIT: int = 5
    AUTH_REGISTER_WINDOW_SECONDS: int = 3600
    
    # CORS
    BACKEND_CORS_ORIGINS: List[str] = [
        "http://localhost:3000",
        "http://localhost:5173",
        "http://127.0.0.1:3000",
        "http://127.0.0.1:5173",
        "http://134.199.192.91:3000",
        "http://134.199.192.91",
    ]
    TRUSTED_HOSTS: List[str] = ["localhost", "127.0.0.1", "testserver"]

    # Cross-cutting API resource protection. Endpoint-specific payment limits
    # remain stricter than this general ceiling.
    API_RATE_LIMIT: int = 600
    API_RATE_LIMIT_WINDOW_SECONDS: int = 60
    MAX_REQUEST_BODY_SIZE: int = 16 * 1024 * 1024
    SLOW_REQUEST_THRESHOLD_MS: int = 1000
    REQUEST_LOG_SUCCESS_SAMPLE_RATE: float = 0.10
    
    # File Upload
    UPLOAD_DIR: str = "uploads"
    MAX_UPLOAD_SIZE: int = 10 * 1024 * 1024  # 10MB

    # Private non-card payment proofs. Local storage remains the development
    # default; production can use any S3-compatible private bucket (including
    # DigitalOcean Spaces) without changing the payment workflow.
    PAYMENT_PROOF_STORAGE_BACKEND: str = "local"
    PAYMENT_PROOF_S3_ENDPOINT_URL: str = ""
    PAYMENT_PROOF_S3_REGION: str = ""
    PAYMENT_PROOF_S3_BUCKET: str = ""
    PAYMENT_PROOF_S3_ACCESS_KEY_ID: str = ""
    PAYMENT_PROOF_S3_SECRET_ACCESS_KEY: str = ""
    PAYMENT_PROOF_S3_PREFIX: str = "payment-proofs"
    # Optional provider-side encryption header. Payment proofs are always
    # application-encrypted before upload. Leave blank for DigitalOcean Spaces;
    # AWS S3 deployments may explicitly set this to AES256.
    PAYMENT_PROOF_S3_SERVER_SIDE_ENCRYPTION: str = ""
    PAYMENT_PROOF_OCR_POLL_SECONDS: int = 2
    PAYMENT_PROOF_OCR_BATCH_SIZE: int = 4
    PAYMENT_PROOF_OCR_MAX_ATTEMPTS: int = 4
    PAYMENT_PROOF_OCR_LEASE_SECONDS: int = 900

    # AI-powered payment-proof extraction (Claude vision). When enabled, cheques
    # and bank slips are read by the vision model instead of on-box OCR, and the
    # amount is reconciled against the invoice. Falls back to OCR when disabled or
    # unconfigured. The model only reads the document; it never applies payment.
    AI_EXTRACTION_ENABLED: bool = False
    ANTHROPIC_API_KEY: str = ""
    AI_EXTRACTION_MODEL: str = "claude-sonnet-5"
    AI_EXTRACTION_TIMEOUT_SECONDS: int = 60

    # Dashboard AI narrative. Reuses ANTHROPIC_API_KEY and the AI_EXTRACTION_ENABLED
    # gate, but gets its own model and a tight timeout: a dashboard blurb must
    # degrade to the calculated fallback fast rather than hold a request worker.
    # Leave DASHBOARD_AI_MODEL blank to reuse AI_EXTRACTION_MODEL.
    DASHBOARD_AI_MODEL: str = ""
    DASHBOARD_AI_TIMEOUT_SECONDS: int = 15

    # Super Admin assistant. The agent runs as a separate service and reaches
    # the read-only tool API over the private Docker network; it never receives
    # database credentials. Requests must carry BOTH this shared key and the
    # end user's own bearer token, so every tool executes under that user's
    # permissions and facility scope.
    ASSISTANT_ENABLED: bool = False
    ASSISTANT_INTERNAL_KEY: str = ""
    ASSISTANT_SERVICE_URL: str = "http://agent:8100"
    ASSISTANT_TIMEOUT_SECONDS: float = 90.0
    # Hostname the agent uses to reach this backend on the container network.
    # TrustedHostMiddleware rejects any Host it does not know, so this value is
    # appended to TRUSTED_HOSTS automatically when the assistant is enabled.
    # Without it every internal call fails with "Invalid host header".
    ASSISTANT_INTERNAL_HOSTNAME: str = "backend"
    # The knowledge base describes the code, so it is regenerated on startup:
    # deployment is exactly when the code changes. Hash-gated, so a restart that
    # changed nothing writes nothing.
    ASSISTANT_KB_AUTO_REFRESH: bool = True
    ASSISTANT_KB_REFRESH_DELAY_SECONDS: int = 10
    # Speech service: natural voice out, transcription in. Shares the assistant
    # internal key; blank URL disables voice without affecting the typed path.
    SPEECH_SERVICE_URL: str = "http://speech:8200"
    # The real-time voice pipeline. Empty disables the conversational path and
    # leaves the older press-to-talk one working.
    VOICE_SERVICE_URL: str = "http://voice:8300"
    SPEECH_TIMEOUT_SECONDS: float = 60.0
    AI_EXTRACTION_EXTERNAL_PROCESSING_ACKNOWLEDGED: bool = False

    # Face Recognition
    FACE_RECOGNITION_TOLERANCE: float = 0.6
    FACE_RECOGNITION_MIN_CONFIDENCE: float = 0.85

    # SFace attendance recognition — cosine similarity of 128-d embeddings.
    # Tune on real staff without a redeploy (env vars + restart).
    FACE_MATCH_THRESHOLD: float = 0.38          # >= this -> VERIFIED
    FACE_REVIEW_THRESHOLD: float = 0.30         # >= this -> NEEDS_REVIEW, else REJECTED
    FACE_MIN_DETECTOR_SCORE: float = 0.80       # detection/enrollment quality gate
    FACE_MIN_FACE_PIXELS: int = 80              # smallest acceptable face-box side
    FACE_MIN_ENROLL_SHARPNESS: float = 40.0     # reject blurry enrollment samples
    FACE_LIVENESS_MODE: str = "advisory"        # off | advisory | enforce
    FACE_LIVENESS_MIN_SCORE: float = 0.25       # below this -> suspected screen/photo

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
    WEBSOCKET_CHANNEL_PREFIX: str = "medrad:realtime"
    WEBSOCKET_PRESENCE_TTL_SECONDS: int = 45
    READ_CACHE_ENABLED: bool = True
    READ_CACHE_PREFIX: str = "medrad:cache"
    READ_CACHE_DEFAULT_TTL_SECONDS: int = 30
    READ_CACHE_LOCK_SECONDS: int = 10
    READ_CACHE_LOCK_WAIT_MS: int = 150

    @property
    def is_production(self) -> bool:
        return self.APP_ENV.strip().lower() in {"production", "prod"}

    @model_validator(mode="after")
    def trust_internal_service_hostname(self):
        """Let the agent reach this backend by its container hostname.

        The agent calls http://<hostname>:8000/internal/v1/..., so that Host must
        be trusted or TrustedHostMiddleware rejects it with 400. Added only when
        the assistant is enabled, and it grants nothing on its own: the internal
        API still requires the shared key and a Super Admin bearer token.
        """
        hostname = self.ASSISTANT_INTERNAL_HOSTNAME.strip()
        if self.ASSISTANT_ENABLED and hostname and hostname not in self.TRUSTED_HOSTS:
            self.TRUSTED_HOSTS = [*self.TRUSTED_HOSTS, hostname]
        return self

    @model_validator(mode="after")
    def validate_production_security(self):
        if not self.is_production:
            return self

        if (
            not self.SECRET_KEY
            or self.SECRET_KEY == "your-secret-key-change-in-production"
            or len(self.SECRET_KEY) < 32
        ):
            raise ValueError("SECRET_KEY must be a unique value of at least 32 characters in production")
        if not self.PUBLIC_APP_URL.startswith("https://"):
            raise ValueError("PUBLIC_APP_URL must use HTTPS in production")
        if not self.TRUSTED_HOSTS or "*" in self.TRUSTED_HOSTS:
            raise ValueError("TRUSTED_HOSTS must contain explicit production hosts")
        if self.ENABLE_TEST_PAYMENTS:
            raise ValueError("ENABLE_TEST_PAYMENTS must be disabled in production")
        if self.SQUARE_ACCESS_TOKEN and not self.PAYMENT_DATA_ENCRYPTION_KEYS.strip():
            raise ValueError("PAYMENT_DATA_ENCRYPTION_KEYS is required when Square is configured")
        proof_storage = self.PAYMENT_PROOF_STORAGE_BACKEND.strip().lower()
        if proof_storage not in {"local", "s3"}:
            raise ValueError("PAYMENT_PROOF_STORAGE_BACKEND must be 'local' or 's3'")
        if proof_storage == "s3" and not self.PAYMENT_PROOF_S3_BUCKET.strip():
            raise ValueError("PAYMENT_PROOF_S3_BUCKET is required for S3 payment-proof storage")
        if self.AI_EXTRACTION_ENABLED and not self.ANTHROPIC_API_KEY.strip():
            raise ValueError("ANTHROPIC_API_KEY is required when AI_EXTRACTION_ENABLED is true")
        if self.ASSISTANT_ENABLED and len(self.ASSISTANT_INTERNAL_KEY.strip()) < 32:
            # This key is the only thing separating the internal tool API from
            # anything else that reaches the container network.
            raise ValueError(
                "ASSISTANT_INTERNAL_KEY must be at least 32 characters when the assistant is enabled"
            )
        if self.AI_EXTRACTION_ENABLED and not self.AI_EXTRACTION_EXTERNAL_PROCESSING_ACKNOWLEDGED:
            raise ValueError(
                "AI_EXTRACTION_EXTERNAL_PROCESSING_ACKNOWLEDGED must be true when AI extraction is enabled in production"
            )
        if not 0 <= self.REQUEST_LOG_SUCCESS_SAMPLE_RATE <= 1:
            raise ValueError("REQUEST_LOG_SUCCESS_SAMPLE_RATE must be between 0 and 1")
        if self.WEBSOCKET_PRESENCE_TTL_SECONDS < 15:
            raise ValueError("WEBSOCKET_PRESENCE_TTL_SECONDS must be at least 15")
        if self.READ_CACHE_DEFAULT_TTL_SECONDS < 1:
            raise ValueError("READ_CACHE_DEFAULT_TTL_SECONDS must be positive")
        if self.READ_CACHE_LOCK_SECONDS < 1:
            raise ValueError("READ_CACHE_LOCK_SECONDS must be positive")
        if self.READ_CACHE_LOCK_WAIT_MS < 0:
            raise ValueError("READ_CACHE_LOCK_WAIT_MS cannot be negative")
        insecure_origins = [
            origin for origin in self.BACKEND_CORS_ORIGINS
            if origin == "*" or origin.startswith("http://")
        ]
        if insecure_origins:
            raise ValueError("Production CORS origins must be explicit HTTPS origins")
        return self
    
    class Config:
        env_file = ".env"
        case_sensitive = True

settings = Settings()
