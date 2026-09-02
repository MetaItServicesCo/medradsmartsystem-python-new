"""Agent service configuration."""
from __future__ import annotations

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    SERVICE_NAME: str = "medrad-agent"
    # The assistant introduces itself by this name. "Rad" ties to MedRad and to
    # radiology, and is short enough to say. Changing it here changes it
    # everywhere the agent speaks; the widget header is set in the frontend.
    AGENT_NAME: str = "Rad"
    AGENT_TAGLINE: str = "your MedRad operations assistant"
    APP_ENV: str = "development"
    LOG_LEVEL: str = "INFO"

    # MedRad backend on the private Docker network. The agent holds no database
    # credentials; every fact it states comes from this API.
    MEDRAD_INTERNAL_URL: str = "http://backend:8000/internal/v1"
    MEDRAD_INTERNAL_KEY: str = ""
    MEDRAD_TIMEOUT_SECONDS: float = 20.0

    ANTHROPIC_API_KEY: str = ""
    # Haiku is fast and strong at tool selection, which is the model's real job
    # here; the tools do the arithmetic. Swap without code changes if evaluation
    # shows selection errors.
    AGENT_MODEL: str = "claude-haiku-4-5"
    AGENT_MAX_TOKENS: int = 1200
    AGENT_TIMEOUT_SECONDS: float = 45.0

    # A single question must never loop indefinitely through tools.
    MAX_TOOL_ITERATIONS: int = 5
    MAX_TOOL_CALLS: int = 8

    class Config:
        env_file = ".env"
        case_sensitive = True


settings = Settings()
