"""Speech service: natural voice out, transcription in.

Runs entirely on CPU and holds no application data. It receives text to speak
and audio to transcribe, and returns the result — it never touches the database
and has no knowledge of the business.

Both models are loaded lazily on first use rather than at import, so the
container starts fast and a deployment that never uses speech never pays the
memory for it.
"""
from __future__ import annotations

import asyncio
import io
import logging
import os
import secrets
import tempfile
import threading
import time
import wave
from contextlib import asynccontextmanager
from typing import Any, Optional

from fastapi import (
    FastAPI, File, Form, Header, HTTPException, UploadFile, WebSocket,
    WebSocketDisconnect, status,
)
from fastapi.responses import Response
from pydantic import BaseModel, Field

from app.streaming import SAMPLE_RATE, StreamSession


logging.basicConfig(level=os.environ.get("LOG_LEVEL", "INFO"))
logger = logging.getLogger("speech")

INTERNAL_KEY = os.environ.get("SPEECH_INTERNAL_KEY", "")
VOICE_NAME = os.environ.get("PIPER_VOICE", "en_US-ryan-medium")
VOICE_DIR = os.environ.get("PIPER_VOICE_DIR", "/voices")
WHISPER_MODEL = os.environ.get("WHISPER_MODEL", "base.en")
WHISPER_COMPUTE = os.environ.get("WHISPER_COMPUTE", "int8")
# Beam search. This was greedy for speed, which is the wrong trade on the short
# utterances a conversation is made of: "hey, how are you" is a second of audio
# with no context to recover from, and a greedy decode of it came back as
# "I know you". The library's own default is 5.
WHISPER_BEAM_SIZE = int(os.environ.get("WHISPER_BEAM_SIZE", "5"))
# Below this average token log-probability the transcript is a guess, not a
# hearing. Sending a guess on to the assistant produces a confident answer to a
# question nobody asked, which is worse than admitting it was not caught.
WHISPER_MIN_LOGPROB = float(os.environ.get("WHISPER_MIN_LOGPROB", "-1.0"))
WHISPER_MAX_NO_SPEECH = float(os.environ.get("WHISPER_MAX_NO_SPEECH", "0.7"))
# Whisper biases towards words in this prompt, which is how a recogniser is
# told what the conversation is likely to be about.
WHISPER_PROMPT = os.environ.get(
    "WHISPER_PROMPT",
    "MedRad operations. Facilities, equipment, service requests, "
    "inspections, rentals, sales quotations, invoices, technicians, "
    "engineers, revenue, Mr. Medrad.",
)
MAX_TTS_CHARS = int(os.environ.get("MAX_TTS_CHARS", "2000"))


def _optional_float(name: str, default: Optional[float]) -> Optional[float]:
    """Read a tuning value, where absent means 'use the voice's own default'."""
    raw = (os.environ.get(name) or "").strip()
    if not raw:
        return default
    try:
        return float(raw)
    except ValueError:
        logger.warning("Ignoring %s=%r: not a number", name, raw)
        return default


# Prosody. Piper's defaults are tuned for reading text out; a conversation
# wants a slightly slower, less metronomic delivery. length_scale stretches
# each phoneme, noise_w varies phoneme duration so the rhythm stops being
# perfectly even, and sentence_silence puts a breath between sentences.
# All are overridable per deployment, since the right values depend on the
# voice and on the room. Passing None keeps whatever the voice ships with.
# These are keyword arguments of PiperVoice.synthesize in piper-tts 1.2.0,
# which requirements.txt pins exactly.
LENGTH_SCALE = _optional_float("PIPER_LENGTH_SCALE", 1.06)
NOISE_SCALE = _optional_float("PIPER_NOISE_SCALE", None)
NOISE_W = _optional_float("PIPER_NOISE_W", 0.9)
SENTENCE_SILENCE = _optional_float("PIPER_SENTENCE_SILENCE", 0.15) or 0.0
MAX_AUDIO_BYTES = int(os.environ.get("MAX_AUDIO_BYTES", str(8 * 1024 * 1024)))

# How the background warm-up went, reported by /health so a slow first request
# can be told apart from a broken one.
_warm: dict[str, Any] = {"done": False, "ms": 0, "error": ""}


async def _warm_models() -> None:
    """Load every model in the background as soon as the process starts.

    Loading on first use keeps the container starting fast, but it moves the
    cost onto whoever speaks first: after any deploy the first question waited
    tens of seconds for weights to load, which in a conversation is
    indistinguishable from the thing being broken. Starting now means the
    container is still up immediately and the models are ready long before
    anyone reaches for the microphone.
    """
    started = time.perf_counter()
    try:
        for load in (_load_voice, _load_recognizer, _load_vad):
            await asyncio.to_thread(load)
        _warm["ms"] = int((time.perf_counter() - started) * 1000)
        _warm["done"] = True
        logger.info("Models warm in %dms", _warm["ms"])
    except asyncio.CancelledError:
        raise
    except Exception as exc:
        # Not fatal: every endpoint still loads what it needs on demand. This
        # only means the first request pays for it, as it used to.
        _warm["error"] = str(exc)
        logger.exception("Warm-up failed; models will load on first use")


@asynccontextmanager
async def lifespan(_: "FastAPI"):
    task = asyncio.create_task(_warm_models())
    try:
        yield
    finally:
        task.cancel()


app = FastAPI(
    title="MedRad Speech", docs_url=None, redoc_url=None, openapi_url=None,
    lifespan=lifespan,
)

# Model handles plus the locks that guard first load. Two concurrent requests
# must not both start loading the same model.
_tts: dict[str, Any] = {"voice": None, "lock": threading.Lock(), "loaded_name": None}
_stt: dict[str, Any] = {"model": None, "lock": threading.Lock()}
_vad: dict[str, Any] = {"model": None, "lock": threading.Lock()}

# Turn detection is deliberately more eager than the trimming applied to a
# finished recording: a turn boundary missed is a turn the assistant never
# answers, while a little extra audio costs almost nothing. Passed as keyword
# arguments so this module never has to import faster_whisper at load time.
# speech_pad_ms is zero because these timestamps are read for timing, not used
# to cut audio: the default 400ms of padding would report speech ending nearly
# half a second after it did, and every turn would wait that out.
# All tunable without a rebuild, because the right values depend on the room.
_STREAM_VAD_KWARGS = {
    # Silero's own tuned default. Lowering it to 0.45 made the detector open a
    # turn on a pure tone, which means it would open one on a fan or a hum.
    "threshold": _optional_float("STREAM_VAD_THRESHOLD", 0.55) or 0.55,
    # 120ms is roughly one syllable, so a cough or a keystroke was enough to
    # open a turn. A quarter of a second is still well inside a first word.
    "min_speech_duration_ms": int(os.environ.get("STREAM_MIN_SPEECH_MS", "250")),
    "min_silence_duration_ms": 100,
    # Zero because these timestamps are read for timing, not used to cut audio:
    # the default 400ms of padding would report speech ending nearly half a
    # second after it did, and every turn would wait that out.
    "speech_pad_ms": 0,
}


def _load_vad():
    """Warm Silero. get_speech_timestamps loads it on first use behind an
    lru_cache, so doing it here moves that cost out of the first spoken turn."""
    if _vad["model"] is None:
        with _vad["lock"]:
            if _vad["model"] is None:
                from faster_whisper.vad import get_vad_model

                started = time.perf_counter()
                _vad["model"] = get_vad_model()
                logger.info(
                    "Loaded turn detector in %dms",
                    int((time.perf_counter() - started) * 1000),
                )
    return _vad["model"]


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
        baked = sorted(f[: -len(".onnx")] for f in os.listdir(VOICE_DIR) if f.endswith(".onnx"))
    except OSError:
        baked = []
    return {
        "status": "ok",
        "voice_configured": VOICE_NAME,
        "voice_in_image": baked,
        "voice_available": resolved is not None,
        "voice_loaded": _tts.get("loaded_name"),
        "prosody": {
            "length_scale": LENGTH_SCALE,
            "noise_scale": NOISE_SCALE,
            "noise_w": NOISE_W,
            "sentence_silence": SENTENCE_SILENCE,
        },
        "recognizer": WHISPER_MODEL,
        "recognizer_beam_size": WHISPER_BEAM_SIZE,
        # Until this is true the first request pays for loading the weights,
        # which on a cold container is tens of seconds.
        "warm": _warm["done"],
        "warm_ms": _warm["ms"],
        "warm_error": _warm["error"],
        "stream_sample_rate": SAMPLE_RATE,
        "turn_detector_loaded": _vad["model"] is not None,
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
            voice.synthesize(
                payload.text,
                wav_file,
                length_scale=LENGTH_SCALE,
                noise_scale=NOISE_SCALE,
                noise_w=NOISE_W,
                sentence_silence=SENTENCE_SILENCE,
            )
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


def _run_recognizer(model: Any, source: Any, language: Optional[str]) -> dict[str, Any]:
    """Transcribe a file path or an audio array, and judge the result.

    Both entry points share this so a streamed turn and an uploaded recording
    are held to exactly the same standard; a confidence rule that applied to
    only one of them would be worse than none.
    """
    segments, info = model.transcribe(
        source,
        language=language or None,
        beam_size=WHISPER_BEAM_SIZE,
        initial_prompt=WHISPER_PROMPT,
        # Each turn is independent. Carrying context lets one bad transcript
        # seed the next, so a single mishearing becomes a run of them.
        condition_on_previous_text=False,
        vad_filter=True,      # drop silence so trailing pauses cost nothing
        # Silero trims to what it judges speech; without padding it shaves the
        # quiet edges of real words, which is exactly what a short greeting
        # cannot spare.
        vad_parameters={"speech_pad_ms": 400, "min_silence_duration_ms": 500},
    )

    # Materialise once: segments is a generator and confidence has to be read
    # from the same pass that produced the text.
    collected = list(segments)
    text = " ".join(segment.text.strip() for segment in collected).strip()

    # Confidence, weighted by how much audio each segment accounts for.
    spans = [(max(seg.end - seg.start, 0.01), seg) for seg in collected]
    total = sum(span for span, _ in spans) or 1.0
    avg_logprob = sum(seg.avg_logprob * span for span, seg in spans) / total
    no_speech = sum(seg.no_speech_prob * span for span, seg in spans) / total
    confident = (
        bool(collected)
        and avg_logprob >= WHISPER_MIN_LOGPROB
        and no_speech <= WHISPER_MAX_NO_SPEECH
    )
    if text and not confident:
        logger.info(
            "discarding low-confidence transcript %r (logprob=%.2f no_speech=%.2f)",
            text[:80], avg_logprob, no_speech,
        )
        text = ""

    return {
        "text": text,
        "language": getattr(info, "language", language),
        "avg_logprob": round(avg_logprob, 3),
        "no_speech_prob": round(no_speech, 3),
    }


@app.websocket("/internal/v1/stream")
async def stream(websocket: WebSocket) -> None:
    """Live microphone: turn detection and transcription as it is spoken."""
    await websocket.accept()

    # Loading on connect rather than on the first turn keeps the pause out of
    # the conversation, where it would be heard.
    try:
        from faster_whisper.vad import get_speech_timestamps

        model = await asyncio.to_thread(_load_recognizer)
        await asyncio.to_thread(_load_vad)
    except Exception as exc:
        logger.exception("Streaming unavailable")
        await websocket.send_json({"type": "error", "detail": str(exc)})
        await websocket.close()
        return

    def detect(window: Any) -> Optional[tuple[float, float]]:
        """How long ago speech started and ended here, or None if silent."""
        stamps = get_speech_timestamps(window, **_STREAM_VAD_KWARGS)
        if not stamps:
            return None
        size = len(window)
        return (
            max(0.0, (size - stamps[0]["start"]) / SAMPLE_RATE),
            max(0.0, (size - stamps[-1]["end"]) / SAMPLE_RATE),
        )

    def transcribe_turn(audio: Any) -> dict[str, Any]:
        return _run_recognizer(model, audio, "en")

    session = StreamSession(
        internal_key=INTERNAL_KEY,
        vad=detect,
        transcribe=transcribe_turn,
        send=websocket.send_json,
    )

    try:
        while True:
            message = await websocket.receive()
            if message.get("type") == "websocket.disconnect":
                break
            if (payload := message.get("bytes")) is not None:
                await session.on_audio(payload)
            elif (text := message.get("text")) is not None:
                if not await session.on_text(text):
                    break
    except WebSocketDisconnect:
        pass
    except Exception:
        logger.exception("Streaming session failed")
    finally:
        try:
            await websocket.close()
        except RuntimeError:
            pass


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
        result = await asyncio.to_thread(_run_recognizer, model, path, language)
        text = result["text"]
        avg_logprob = result["avg_logprob"]
        no_speech = result["no_speech_prob"]
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
    logger.info(
        "stt bytes=%d chars=%d ms=%d logprob=%.2f no_speech=%.2f",
        len(raw), len(text), elapsed_ms, avg_logprob, no_speech,
    )
    return {
        "text": text,
        "language": result["language"],
        "elapsed_ms": elapsed_ms,
        # Returned so the thresholds can be tuned from real traffic rather than
        # from guesses about what a bad transcript looks like.
        "avg_logprob": round(avg_logprob, 3),
        "no_speech_prob": round(no_speech, 3),
    }
