"""Configuration for the voice service."""
from __future__ import annotations

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Everything the voice pipeline needs, all overridable per deployment."""

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # The browser never reaches this service directly; the backend authenticates
    # the session and relays, presenting this key.
    VOICE_INTERNAL_KEY: str = ""

    ASSISTANT_SERVICE_URL: str = "http://agent:8100"
    ASSISTANT_INTERNAL_KEY: str = ""
    ASSISTANT_TIMEOUT_SECONDS: float = 90.0

    # Audio. 16 kHz mono is what the recogniser wants and what the browser
    # sends, so nothing resamples in the common path.
    SAMPLE_RATE: int = 16000

    WHISPER_MODEL: str = "base.en"
    WHISPER_COMPUTE: str = "int8"
    WHISPER_LANGUAGE: str = "en"

    # Text to speech is streamed from the speech service rather than run in
    # process, which keeps GPL-licensed piper-tts 1.3 out of this image.
    SPEECH_SERVICE_URL: str = "http://speech:8200"
    SPEECH_INTERNAL_KEY: str = ""
    SPEECH_TIMEOUT_SECONDS: float = 60.0

    # Which voice to speak with.
    #
    # "piper" keeps synthesis on this network, costs nothing, and sounds
    # like a good open model. "elevenlabs" sounds markedly better and
    # streams from a maintained client rather than the adapter written
    # here, but it is billed per character and the answers -- which carry
    # facility names, people and figures -- are sent to a third party.
    #
    # Left empty it picks itself: ElevenLabs when a key is configured,
    # Piper otherwise, so a missing key degrades instead of failing.
    VOICE_TTS_PROVIDER: str = ""
    ELEVENLABS_API_KEY: str = ""
    # Rachel, one of the stock voices. Any voice id from the account works.
    ELEVENLABS_VOICE_ID: str = "21m00Tcm4TlvDq8ikWAM"
    # Their low-latency model; the quality models are noticeably slower and
    # this is a conversation, not an audiobook.
    ELEVENLABS_MODEL: str = "eleven_flash_v2_5"

    def tts_provider(self) -> str:
        chosen = (self.VOICE_TTS_PROVIDER or "").strip().lower()
        if chosen:
            return chosen
        return "elevenlabs" if self.ELEVENLABS_API_KEY.strip() else "piper"

    # Turn taking. Silence that ends a turn has to outlast a natural pause
    # mid-sentence, or half a question reaches the recogniser; it is otherwise
    # dead air on every turn, so it is worth tuning per room.
    USER_SPEECH_TIMEOUT: float = 0.8
    VAD_CONFIDENCE: float = 0.6
    VAD_START_SECS: float = 0.2
    # Pipecat's own default, and its latency figures assume it. This was
    # 0.6, which stacked on top of USER_SPEECH_TIMEOUT: the detector waited
    # 0.6s to call the speech stopped and the turn strategy then waited 0.8s
    # more, so every turn ended about 1.4s after the speaker did.
    VAD_STOP_SECS: float = 0.2
    VAD_MIN_VOLUME: float = 0.55

    LOG_LEVEL: str = "INFO"


settings = Settings()
