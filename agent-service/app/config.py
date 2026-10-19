"""Agent service configuration."""
from __future__ import annotations

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    SERVICE_NAME: str = "medrad-agent"
    # The assistant introduces itself by this name. Changing it here changes it
    # everywhere the agent speaks; the widget header is set in the frontend and
    # must be changed alongside.
    AGENT_NAME: str = "Mr. Medrad"
    AGENT_TAGLINE: str = "your MedRad operations assistant"
    APP_ENV: str = "development"
    LOG_LEVEL: str = "INFO"

    # MedRad backend on the private Docker network. The agent holds no database
    # credentials; every fact it states comes from this API.
    MEDRAD_INTERNAL_URL: str = "http://backend:8000/internal/v1"
    MEDRAD_INTERNAL_KEY: str = ""
    MEDRAD_TIMEOUT_SECONDS: float = 20.0

    # Which backend drives the agent.
    #
    #   anthropic  - the Claude SDK.
    #   groq       - Groq, which knows its own base URL.
    #   openai     - any other OpenAI-compatible /chat/completions endpoint:
    #                OpenRouter, Together, vLLM, a local Ollama. Needs
    #                AGENT_BASE_URL set explicitly.
    #
    # Groq is named rather than folded into "openai" because the two are not
    # the same operational thing. A deployment reporting "openai" while
    # talking to Groq is a question every reader has to stop and answer.
    AGENT_PROVIDER: str = "anthropic"
    ANTHROPIC_API_KEY: str = ""
    # Used when AGENT_PROVIDER=openai. A local endpoint needs no key.
    AGENT_BASE_URL: str = ""
    AGENT_API_KEY: str = ""
    # Haiku is fast and strong at tool selection, which is the model's real job
    # here; the tools do the arithmetic. Swap without code changes if evaluation
    # shows selection errors.
    AGENT_MODEL: str = "claude-haiku-4-5"
    # Routing is a one-word structured decision, not reasoning, but it sits in
    # front of every question and costs a full round trip. Pointing it at a
    # smaller, faster model shortens every turn. Empty means use AGENT_MODEL.
    AGENT_CLASSIFIER_MODEL: str = ""
    AGENT_MAX_TOKENS: int = 1200
    # A spoken answer is two or three sentences, which is well under two
    # hundred tokens. Left at the written ceiling the model wrote at length
    # anyway and took twelve seconds over it, and every one of those tokens is
    # time the person spends waiting to hear the first word. A hard limit is
    # worth more here than an instruction the model is free to ignore.
    AGENT_VOICE_MAX_TOKENS: int = 200
    AGENT_TIMEOUT_SECONDS: float = 45.0

    # A single question must never loop indefinitely through tools.
    MAX_TOOL_ITERATIONS: int = 5
    MAX_TOOL_CALLS: int = 8

    def agent_classifier_model(self) -> str:
        return (self.AGENT_CLASSIFIER_MODEL or "").strip() or self.AGENT_MODEL

    def agent_api_key(self) -> str:
        """Key for the active provider, falling back to the Anthropic one."""
        return (self.AGENT_API_KEY or self.ANTHROPIC_API_KEY).strip()

    def agent_provider(self) -> str:
        return (self.AGENT_PROVIDER or "anthropic").strip().lower()

    def agent_base_url(self) -> str:
        """Where completions are sent. Groq supplies its own."""
        explicit = self.AGENT_BASE_URL.strip()
        if explicit:
            return explicit
        if self.agent_provider() == "groq":
            return "https://api.groq.com/openai/v1"
        return ""

    class Config:
        env_file = ".env"
        case_sensitive = True


settings = Settings()
