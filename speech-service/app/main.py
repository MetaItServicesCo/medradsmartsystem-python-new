"""Speech service: natural voice out, transcription in.

Runs entirely on CPU and holds no application data. It receives text to speak
and audio to transcribe, and returns the result — it never touches the database
and has no knowledge of the business.

Both models are loaded lazily on first use rather than at import, so the
container starts fast and a deployment that never uses speech never pays the
memory for it.
"""
from __future__ import annotations

import io
import logging
import os
import secrets
import tempfile
import threading
import time
import wave
from typing import Any, Optional

from fastapi import FastAPI, File, Form, Header, HTTPException, UploadFile, status
from fastapi.responses import Response
from pydantic import BaseModel, Field


logging.basicConfig(level=os.environ.get("LOG_LEVEL", "INFO"))
logger = logging.getLogger("speech")

INTERNAL_KEY = os.environ.get("SPEECH_INTERNAL_KEY", "")
VOICE_NAME = os.environ.get("PIPER_VOICE", "en_US-ryan-medium")
VOICE_DIR = os.environ.get("PIPER_VOICE_DIR", "/voices")
WHISPER_MODEL = os.environ.get("WHISPER_MODEL", "base.en")
WHISPER_COMPUTE = os.environ.get("WHISPER_COMPUTE", "int8")
MAX_TTS_CHARS = int(os.environ.get("MAX_TTS_CHARS", "2000"))
MAX_AUDIO_BYTES = int(os.environ.get("MAX_AUDIO_BYTES", str(8 * 1024 * 1024)))

app = FastAPI(title="MedRad Speech", docs_url=None, redoc_url=None, openapi_url=None)

# Model handles plus the locks that guard first load. Two concurrent requests
# must not both start loading the same model.
_tts: dict[str, Any] = {"voice": None, "lock": threading.Lock(), "loaded_name": None}
_stt: dict[str, Any] = {"model": None, "lock": threading.Lock()}


def _require_internal(key: Optional[str]) -> None:
    if not INTERNAL_KEY or not key or not secrets.compare_digest(key, INTERNAL_KEY):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid internal credentials.",
        )


def _resolve_voice_path() -> Optional[str]:
    """Path to a usable voice, preferring the configured one.

    The configured name and the voice baked into the image can disagree — a
    changed build argument, an older compose default — and that mismatch used to
    disable speech entirely while a perfectly good voice sat unused on disk.
    Falling back to whatever is present keeps the assistant talking, loudly
    logged so the mismatch still gets fixed.
    """
    preferred = os.path.join(VOICE_DIR, "{}.onnx".format(VOICE_NAME))
    if os.path.exists(preferred):
        return preferred
    try:
        available = sorted(f for f in os.listdir(VOICE_DIR) if f.endswith(".onnx"))
    except OSError:
        available = []
    if not available:
        return None
    logger.warning(
        "Configured voice %s is not in the image; using %s instead. "
        "Set PIPER_VOICE to a baked voice, or rebuild with "
        "--build-arg PIPER_VOICE=%s",
        VOICE_NAME, available[0], VOICE_NAME,
    )
    return os.path.join(VOICE_DIR, available[0])


def _load_voice():
    if _tts["voice"] is not None:
        return _tts["voice"]
    with _tts["lock"]:
        if _tts["voice"] is None:
            from piper import PiperVoice

            model_path = _resolve_voice_path()
            if model_path is None:
                raise RuntimeError(
                    "No Piper voice found in {}. Rebuild the speech image.".format(VOICE_DIR)
                )
            started = time.perf_counter()
            _tts["voice"] = PiperVoice.load(model_path)
            _tts["loaded_name"] = os.path.basename(model_path)[:-len(".onnx")]
            logger.info(
                "Loaded voice %s in %dms",
                _tts["loaded_name"], int((time.perf_counter() - started) * 1000),
            )
    return _tts["voice"]


def _load_recognizer():
    if _stt["model"] is not None:
        return _stt["model"]
    with _stt["lock"]:
        if _stt["model"] is None:
            from faster_whisper import WhisperModel

            started = time.perf_counter()
            _stt["model"] = WhisperModel(
                WHISPER_MODEL, device="cpu", compute_type=WHISPER_COMPUTE
            )
            logger.info(
                "Loaded recogniser %s in %dms",
                WHISPER_MODEL, int((time.perf_counter() - started) * 1000),
            )
    return _stt["model"]


class SpeakRequest(BaseModel):
    text: str = Field(min_length=1, max_length=MAX_TTS_CHARS)


@app.get("/health")
def health() -> dict[str, Any]:
    resolved = _resolve_voice_path()
    try:
        baked = sorted(f[:-6] for f in os.listdir(VOICE_DIR) if f.endswith(".onnx"))
    except OSError:
        baked = []
    return {
        "status": "ok",
        "voice_configured": VOICE_NAME,
        "voice_in_image": baked,
        "voice_available": resolved is not None,
        "voice_loaded": _tts.get("loaded_name"),
        "recognizer": WHISPER_MODEL,
        "recognizer_loaded": _stt["model"] is not None,
    }


@app.post("/internal/v1/tts")
def synthesize(
    payload: SpeakRequest,
    x_internal_key: Optional[str] = Header(None, alias="X-Internal-Key"),
) -> Response:
    """Speak text, returning WAV audio."""
    _require_internal(x_internal_key)
    try:
        voice = _load_voice()
    except Exception as exc:
        logger.exception("Voice unavailable")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Voice model unavailable: {}".format(exc),
        )

    started = time.perf_counter()
    buffer = io.BytesIO()
    try:
        with wave.open(buffer, "wb") as wav_file:
            voice.synthesize(payload.text, wav_file)
    except Exception:
        logger.exception("Synthesis failed")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Could not synthesise speech.",
        )
    audio = buffer.getvalue()
    logger.info(
        "tts chars=%d bytes=%d ms=%d",
        len(payload.text), len(audio), int((time.perf_counter() - started) * 1000),
    )
    return Response(
        content=audio,
        media_type="audio/wav",
        headers={"Cache-Control": "no-store"},
    )


@app.post("/internal/v1/stt")
async def transcribe(
    audio: UploadFile = File(...),
    language: str = Form("en"),
    x_internal_key: Optional[str] = Header(None, alias="X-Internal-Key"),
) -> dict[str, Any]:
    """Transcribe uploaded audio to text."""
    _require_internal(x_internal_key)
    raw = await audio.read()
    if not raw:
        raise HTTPException(status_code=422, detail="Empty audio upload.")
    if len(raw) > MAX_AUDIO_BYTES:
        raise HTTPException(status_code=413, detail="Audio is too large.")

    try:
        model = _load_recognizer()
    except Exception as exc:
        logger.exception("Recogniser unavailable")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Speech recognition unavailable: {}".format(exc),
        )

    started = time.perf_counter()
    # faster-whisper reads from a path; the upload is short-lived and removed
    # immediately, so no recording is ever retained.
    suffix = os.path.splitext(audio.filename or "")[1] or ".webm"
    handle, path = tempfile.mkstemp(suffix=suffix)
    try:
        with os.fdopen(handle, "wb") as temp_file:
            temp_file.write(raw)
        segments, info = model.transcribe(
            path,
            language=language or None,
            beam_size=1,          # greedy: this is short dictation, not subtitling
            vad_filter=True,      # drop silence so trailing pauses cost nothing
        )
        text = " ".join(segment.text.strip() for segment in segments).strip()
    except Exception:
        logger.exception("Transcription failed")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Could not transcribe the audio.",
        )
    finally:
        try:
            os.remove(path)
        except OSError:
            pass

    elapsed_ms = int((time.perf_counter() - started) * 1000)
    logger.info("stt bytes=%d chars=%d ms=%d", len(raw), len(text), elapsed_ms)
    return {
        "text": text,
        "language": getattr(info, "language", language),
        "elapsed_ms": elapsed_ms,
    }
