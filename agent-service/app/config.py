"""Agent service configuration.

Models are chosen per role rather than per service. Routing a question, picking
a tool and writing an answer are different jobs, and the cheapest model that
does each one well is rarely the same model. Each role also has a fallback on a
second provider, so a rate limit does not end a conversation.
"""
from __future__ import annotations

from pydantic_settings import BaseSettings

# Where each provider lives, and which environment variable carries its key.
# "openai" is the escape hatch: any OpenAI-compatible endpoint with AGENT_BASE_URL.
PROVIDER_ENDPOINTS: dict[str, str] = {
    "groq": "https://api.groq.com/openai/v1",
    "openrouter": "https://openrouter.ai/api/v1",
    "anthropic": "",
    "openai": "",
}

# Sensible starting points, overridable per role. Routing is a one-word
# decision and runs on the smallest model; tools and prose run on a capable one.
DEFAULT_MODELS: dict[str, dict[str, str]] = {
    "groq": {
        "router": "llama-3.1-8b-instant",
        "tools": "llama-3.3-70b-versatile",
        "synthesis": "llama-3.3-70b-versatile",
    },
    "openrouter": {
        "router": "meta-llama/llama-3.3-70b-instruct",
        "tools": "meta-llama/llama-3.3-70b-instruct",
        "synthesis": "meta-llama/llama-3.3-70b-instruct",
    },
    "anthropic": {
        "router": "claude-haiku-4-5",
        "tools": "claude-haiku-4-5",
        "synthesis": "claude-haiku-4-5",
    },
    "openai": {"router": "", "tools": "", "synthesis": ""},
}


class Settings(BaseSettings):
    SERVICE_NAME: str = "phealth-agent"
    # The assistant introduces itself by this name. Changing it here changes it
    # everywhere the agent speaks; the widget header is set in the frontend and
    # must be changed alongside.
    AGENT_NAME: str = "Phia"
    AGENT_TAGLINE: str = "your phealth facilities assistant"
    APP_ENV: str = "development"
    LOG_LEVEL: str = "INFO"

    # The phealth backend on the private Docker network. The agent holds no
    # database credentials; every fact it states comes from this API.
    MEDRAD_INTERNAL_URL: str = "http://backend:8000/internal/v1"
    MEDRAD_INTERNAL_KEY: str = ""
    MEDRAD_TIMEOUT_SECONDS: float = 20.0

    # ── Providers ───────────────────────────────────────────────────────────
    # groq | openrouter | anthropic | openai (any OpenAI-compatible endpoint).
    AGENT_PROVIDER: str = "groq"
    # Used when the primary refuses or fails. Empty disables fallback.
    AGENT_FALLBACK_PROVIDER: str = "openrouter"

    GROQ_API_KEY: str = ""
    OPENROUTER_API_KEY: str = ""
    ANTHROPIC_API_KEY: str = ""
    # For AGENT_PROVIDER=openai: a base URL, and a key if the endpoint wants one.
    AGENT_BASE_URL: str = ""
    AGENT_API_KEY: str = ""

    # ── Models per role ─────────────────────────────────────────────────────
    # Empty means "the default for that provider" (see DEFAULT_MODELS).
    AGENT_ROUTER_MODEL: str = ""
    AGENT_TOOLS_MODEL: str = ""
    AGENT_SYNTHESIS_MODEL: str = ""
    AGENT_FALLBACK_ROUTER_MODEL: str = ""
    AGENT_FALLBACK_TOOLS_MODEL: str = ""
    AGENT_FALLBACK_SYNTHESIS_MODEL: str = ""
    # One model for every role, when a deployment wants exactly one. Overrides
    # the per-role defaults but not an explicit per-role setting.
    AGENT_MODEL: str = ""

    AGENT_MAX_TOKENS: int = 1200
    # A spoken answer is two or three sentences, well under two hundred tokens.
    # Left at the written ceiling the model writes at length anyway, and every
    # one of those tokens is time somebody spends waiting to hear the first word.
    AGENT_VOICE_MAX_TOKENS: int = 200
    AGENT_TIMEOUT_SECONDS: float = 45.0

    # A single question must never loop indefinitely through tools.
    MAX_TOOL_ITERATIONS: int = 5
    MAX_TOOL_CALLS: int = 8

    # ── Helpers ─────────────────────────────────────────────────────────────
    def provider_credentials(self, provider: str) -> tuple[str, str]:
        """(api_key, base_url) for a provider name."""
        provider = (provider or "").strip().lower()
        base_url = PROVIDER_ENDPOINTS.get(provider, "")
        if provider == "groq":
            return self.GROQ_API_KEY.strip(), base_url
        if provider == "openrouter":
            return self.OPENROUTER_API_KEY.strip(), base_url
        if provider == "anthropic":
            return (self.ANTHROPIC_API_KEY or self.AGENT_API_KEY).strip(), ""
        return self.AGENT_API_KEY.strip(), self.AGENT_BASE_URL.strip()

    def model_for(self, role: str, fallback: bool = False) -> str:
        """The model a role runs on, primary or fallback."""
        provider = self.AGENT_FALLBACK_PROVIDER if fallback else self.AGENT_PROVIDER
        provider = (provider or "").strip().lower()
        explicit = {
            (False, "router"): self.AGENT_ROUTER_MODEL,
            (False, "tools"): self.AGENT_TOOLS_MODEL,
            (False, "synthesis"): self.AGENT_SYNTHESIS_MODEL,
            (True, "router"): self.AGENT_FALLBACK_ROUTER_MODEL,
            (True, "tools"): self.AGENT_FALLBACK_TOOLS_MODEL,
            (True, "synthesis"): self.AGENT_FALLBACK_SYNTHESIS_MODEL,
        }.get((fallback, role), "")
        if explicit.strip():
            return explicit.strip()
        if not fallback and self.AGENT_MODEL.strip():
            return self.AGENT_MODEL.strip()
        return DEFAULT_MODELS.get(provider, {}).get(role, "")

    def provider_ready(self, provider: str) -> bool:
        """Whether a provider can actually be called.

        Hosted providers need a key: their address is fixed, so an address alone
        says nothing. Only a self-hosted OpenAI-compatible endpoint may run
        without one, and it needs its address instead.
        """
        provider = (provider or "").strip().lower()
        api_key, base_url = self.provider_credentials(provider)
        if provider in ("groq", "openrouter", "anthropic"):
            return bool(api_key)
        return bool(base_url)

    def fallback_configured(self) -> bool:
        provider = (self.AGENT_FALLBACK_PROVIDER or "").strip().lower()
        if not provider or provider == (self.AGENT_PROVIDER or "").strip().lower():
            return False
        return self.provider_ready(provider) and bool(self.model_for("tools", fallback=True))

    class Config:
        env_file = ".env"
        case_sensitive = True


settings = Settings()
