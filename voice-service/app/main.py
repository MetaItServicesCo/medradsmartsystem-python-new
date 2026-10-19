"""Real-time voice pipeline for the MedRad assistant.

The previous design was a chat agent with speech bolted to each end: record a
whole question, upload it, transcribe it, generate the whole answer, then
synthesise it a sentence at a time over HTTP. Every stage waited for the one
before it to finish, so the wait was the sum of all of them, and interruption
had to be hand-rolled on top.

This is a pipeline instead. Audio flows through it continuously: samples reach
the recogniser while the sentence is still being spoken, tokens reach the
synthesiser while the answer is still being written, and audio reaches the
speaker while the rest is still being generated. Interruption, turn taking and
conversation memory are the framework's, not mine -- the previous versions of
all three were the source of most of the bugs.

What stays ours is the part worth keeping: the LangGraph agent, its read-only
tools and its knowledge base, wrapped to look like a language model.
"""
from __future__ import annotations

import json
import secrets
import sys
from contextlib import asynccontextmanager
from typing import Any, Optional

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from loguru import logger

from pipecat.audio.vad.silero import SileroVADAnalyzer
from pipecat.audio.vad.vad_analyzer import VADParams
from pipecat.frames.frames import EndFrame
from pipecat.pipeline.pipeline import Pipeline
from pipecat.pipeline.runner import PipelineRunner
from pipecat.pipeline.worker import PipelineParams, PipelineWorker
from pipecat.processors.audio.vad_processor import VADProcessor
from pipecat.services.whisper.stt import WhisperSTTService
from pipecat.transports.websocket.fastapi import (
    FastAPIWebsocketParams,
    FastAPIWebsocketTransport,
)
from pipecat.turns.user_start.vad_user_turn_start_strategy import (
    VADUserTurnStartStrategy,
)
from pipecat.turns.user_stop.speech_timeout_user_turn_stop_strategy import (
    SpeechTimeoutUserTurnStopStrategy,
)
from pipecat.turns.user_turn_processor import UserTurnProcessor
from pipecat.turns.user_turn_strategies import UserTurnStrategies

from app.agent_llm import MedRadAgentLLM
from app.speech_tts import MedRadPiperTTS
from app.config import settings
from app.serializer import RawPcmSerializer


logger.remove()
logger.add(sys.stderr, level=settings.LOG_LEVEL)

# Loaded once and shared: both models are several hundred megabytes and take
# seconds to load, which is not a cost to pay on the first thing anyone says.
_models: dict[str, Any] = {}


def _build_stt():
    """The recogniser: hosted when a Groq key is set, on-box otherwise.

    Hosted is both faster and markedly more accurate here. base.en is the
    smallest English Whisper there is, and on a shared four-core host it
    produced the mishearings this agent was judged on. large-v3-turbo
    answers in about 200ms from this network.

    Falling back to the local model is deliberate rather than tidy: a
    technician on a bad connection in a plant room should still be able
    to talk to it.
    """
    if settings.stt_provider() == "groq" and settings.groq_key():
        from pipecat.services.groq.stt import GroqSTTService

        logger.info("Listening with Groq {}", settings.GROQ_STT_MODEL)
        return GroqSTTService(
            api_key=settings.groq_key(),
            base_url=settings.GROQ_BASE_URL,
            # Through Settings, like the local recogniser below: model= as an
            # argument is deprecated and goes away in pipecat 2.0. It warned
            # on every start until this matched.
            settings=GroqSTTService.Settings(model=settings.GROQ_STT_MODEL),
        )

    logger.info("Loading recogniser {}", settings.WHISPER_MODEL)
    return WhisperSTTService(
        # Through Settings rather than the model= argument, which is
        # deprecated and goes away in pipecat 2.0.
        settings=WhisperSTTService.Settings(model=settings.WHISPER_MODEL),
        device="cpu",
        compute_type=settings.WHISPER_COMPUTE,
    )


def _load_models() -> None:
    if "stt" in _models:
        return
    _models["stt"] = _build_stt()
    logger.info("Loading turn detector")
    _models["vad"] = SileroVADAnalyzer(
        sample_rate=settings.SAMPLE_RATE,
        params=VADParams(
            confidence=settings.VAD_CONFIDENCE,
            start_secs=settings.VAD_START_SECS,
            stop_secs=settings.VAD_STOP_SECS,
            min_volume=settings.VAD_MIN_VOLUME,
        ),
    )
    logger.info("Models ready")


@asynccontextmanager
async def lifespan(_: FastAPI):
    try:
        _load_models()
    except Exception:
        # Not fatal at boot: the failure is reported per connection, where it
        # can be told to the person trying to talk.
        logger.exception("Model loading failed at startup")

    if settings.tts_provider() == "groq":
        reason = await _verify_groq_voice()
        if reason is None:
            _models["tts_provider"] = "groq"
            _models.pop("tts_blocked", None)
            logger.info("Groq voice {} verified", settings.GROQ_TTS_MODEL)
        else:
            # Kept for /health as well as the log. A startup line scrolls away;
            # the reason the good voice is not in use should be answerable
            # without going to find it.
            _models["tts_blocked"] = reason
            # Orpheus needs its terms accepted once in the Groq console,
            # and until somebody does that it answers 400. Saying so is
            # the difference between a one-click fix and an afternoon.
            _models["tts_provider"] = "piper"
            logger.error(
                "Groq cannot synthesise ({}); speaking with Piper instead. "
                "If this mentions terms, accept them once at console.groq.com.",
                reason,
            )
    elif settings.tts_provider() == "elevenlabs":
        reason = await _verify_elevenlabs()
        if reason is None:
            _models["tts_provider"] = "elevenlabs"
            logger.info("ElevenLabs voice verified")
        else:
            # Loud, and then it carries on with a voice that works. Silence
            # would look like every other way this pipeline can fail.
            _models["tts_provider"] = "piper"
            logger.error(
                "ElevenLabs cannot synthesise ({}); speaking with Piper "
                "instead. Set VOICE_TTS_PROVIDER=piper to stop trying.",
                reason,
            )
    yield


app = FastAPI(
    title="MedRad Voice", docs_url=None, redoc_url=None, openapi_url=None,
    lifespan=lifespan,
)


@app.get("/health")
def health() -> dict[str, Any]:
    return {
        "status": "ok",
        "ready": "stt" in _models,
        "listening": settings.stt_provider(),
        "recognizer": (
            settings.GROQ_STT_MODEL if settings.stt_provider() == "groq"
            else settings.WHISPER_MODEL
        ),
        "voice": _models.get("tts_provider") or settings.tts_provider(),
        "voice_configured": settings.tts_provider(),
        # Present only when the configured voice refused at startup, so a
        # health check says why it is speaking with something else.
        **({"voice_unavailable": _models["tts_blocked"]} if _models.get("tts_blocked") else {}),
        "sample_rate": settings.SAMPLE_RATE,
        "user_speech_timeout": settings.USER_SPEECH_TIMEOUT,
    }


async def _verify_groq_voice() -> Optional[str]:
    """Speak one word at startup. None when it worked, else why not.

    Worth the round trip: the usual failure is not a bad key but a model
    whose terms nobody has accepted yet, and that is invisible until the
    first caller gets silence.
    """
    if not settings.groq_key():
        return "no GROQ_API_KEY is set"
    import httpx

    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            response = await client.post(
                settings.GROQ_BASE_URL.rstrip("/") + "/audio/speech",
                headers={"Authorization": "Bearer " + settings.groq_key()},
                json={
                    "model": settings.GROQ_TTS_MODEL,
                    "voice": settings.GROQ_TTS_VOICE,
                    "input": "Ready.",
                    "response_format": "wav",
                },
            )
    except Exception as exc:  # noqa: BLE001
        return "{}: {}".format(type(exc).__name__, exc)
    if response.status_code == 200:
        return None if response.content else "returned no audio"
    try:
        return str(response.json().get("error", {}).get("message"))[:200]
    except Exception:  # noqa: BLE001
        return "HTTP {}".format(response.status_code)


async def _verify_elevenlabs() -> Optional[str]:
    """Check the configured voice can actually speak, once, at startup.

    A key that authenticates but cannot synthesise -- the wrong scope, a
    free plan, a voice the account does not hold -- produces no audio and no
    error a caller can see. Every reply is simply silent, which is
    indistinguishable from the microphone not working, the agent not
    answering, or the browser not playing. That ambiguity cost days.

    Returns the reason it cannot be used, or None if it can.
    """
    import httpx

    url = "https://api.elevenlabs.io/v1/text-to-speech/{}".format(
        settings.ELEVENLABS_VOICE_ID
    )
    try:
        async with httpx.AsyncClient(timeout=20) as client:
            response = await client.post(
                url,
                headers={"xi-api-key": settings.ELEVENLABS_API_KEY},
                json={"text": "Ready.", "model_id": settings.ELEVENLABS_MODEL},
            )
    except Exception as exc:
        return "unreachable: {}".format(exc)
    if response.status_code == 200 and response.content:
        return None
    return "HTTP {}: {}".format(response.status_code, response.text[:160])


def _build_tts() -> Any:
    """The voice, chosen by configuration.

    ElevenLabs streams over its own WebSocket from a client pipecat
    maintains, which is the real argument for it here: it replaces an
    adapter written for this project with one that is exercised by everyone
    who uses the framework. It also asks for the audio at the transport's
    own rate, so nothing resamples on the way out.

    Piper remains the default when no key is set. It keeps every answer on
    this network, which for a system holding medical operations data is a
    property worth having by default rather than by choice.
    """
    provider = _models.get("tts_provider") or settings.tts_provider()
    if provider == "groq":
        if not settings.groq_key():
            logger.warning("Groq voice selected but no key configured; using Piper")
        else:
            from pipecat.services.groq.tts import GroqTTSService

            logger.info("Speaking with Groq {} ({})",
                        settings.GROQ_TTS_MODEL, settings.GROQ_TTS_VOICE)
            return GroqTTSService(
                api_key=settings.groq_key(),
                model_name=settings.GROQ_TTS_MODEL,
                voice_id=settings.GROQ_TTS_VOICE,
                # Asked for at the transport's own rate, so nothing has to
                # resample on the way to the speaker.
                sample_rate=settings.SAMPLE_RATE,
            )
    if provider == "elevenlabs":
        if not settings.ELEVENLABS_API_KEY.strip():
            logger.warning("ElevenLabs selected but no key configured; using Piper")
        else:
            from pipecat.services.elevenlabs.tts import ElevenLabsTTSService

            logger.info("Speaking with ElevenLabs voice {}", settings.ELEVENLABS_VOICE_ID)
            return ElevenLabsTTSService(
                api_key=settings.ELEVENLABS_API_KEY,
                # Through Settings: voice_id and model as arguments are
                # both deprecated and go away in pipecat 2.0.
                settings=ElevenLabsTTSService.Settings(
                    voice=settings.ELEVENLABS_VOICE_ID,
                    model=settings.ELEVENLABS_MODEL,
                    language=None,
                ),
                # Asked for at the transport's own rate, so nothing has to
                # resample on the way to the speaker.
                sample_rate=settings.SAMPLE_RATE,
            )
    logger.info("Speaking with Piper, streamed from the speech service")
    return MedRadPiperTTS()


def _build_pipeline(websocket: WebSocket, user_token: str) -> tuple[Pipeline, Any]:
    """Assemble one conversation's pipeline.

    Audio in, audio out, and between them the recogniser, the agent and the
    voice. Each stage hands work to the next as it produces it rather than when
    it finishes, which is what makes the whole thing feel immediate.
    """
    transport = FastAPIWebsocketTransport(
        websocket=websocket,
        params=FastAPIWebsocketParams(
            audio_in_enabled=True,
            audio_out_enabled=True,
            audio_in_sample_rate=settings.SAMPLE_RATE,
            audio_out_sample_rate=settings.SAMPLE_RATE,
            add_wav_header=False,
            serializer=RawPcmSerializer(sample_rate=settings.SAMPLE_RATE),
        ),
    )

    turns = UserTurnProcessor(
        user_turn_strategies=UserTurnStrategies(
            start=[VADUserTurnStartStrategy()],
            # Explicit, because the default stop strategy is the local smart
            # turn analyser, which would pull torch into an image that has
            # deliberately stayed free of it.
            stop=[SpeechTimeoutUserTurnStopStrategy(
                user_speech_timeout=settings.USER_SPEECH_TIMEOUT,
            )],
        ),
    )

    pipeline = Pipeline([
        transport.input(),
        VADProcessor(vad_analyzer=_models["vad"]),
        turns,
        _models["stt"],
        MedRadAgentLLM(user_token=user_token),
        # Built per conversation because it holds its own connection.
        _build_tts(),
        transport.output(),
    ])
    return pipeline, transport


async def _authenticate(websocket: WebSocket) -> str | None:
    """First message must present the internal key and the user's token."""
    try:
        raw = await websocket.receive_text()
        payload = json.loads(raw)
    except Exception:
        return None
    if payload.get("type") != "auth":
        return None
    supplied = str(payload.get("key") or "")
    if not settings.VOICE_INTERNAL_KEY or not secrets.compare_digest(
        supplied, settings.VOICE_INTERNAL_KEY
    ):
        return None
    token = str(payload.get("user_token") or "")
    return token or None


@app.websocket("/internal/v1/converse")
async def converse(websocket: WebSocket) -> None:
    """One spoken conversation, for as long as the socket is open."""
    await websocket.accept()

    user_token = await _authenticate(websocket)
    if not user_token:
        await websocket.send_text(json.dumps({
            "type": "error", "detail": "Invalid internal credentials.",
        }))
        await websocket.close()
        return

    try:
        _load_models()
    except Exception as exc:
        logger.exception("Models unavailable")
        await websocket.send_text(json.dumps({"type": "error", "detail": str(exc)}))
        await websocket.close()
        return

    pipeline, _transport = _build_pipeline(websocket, user_token)
    worker = PipelineWorker(
        pipeline,
        params=PipelineParams(
            audio_in_sample_rate=settings.SAMPLE_RATE,
            audio_out_sample_rate=settings.SAMPLE_RATE,
            enable_metrics=True,
        ),
        # A voice conversation that has gone quiet for a while is over; without
        # this the socket and its models would be held indefinitely.
        idle_timeout_secs=300,
    )

    runner = PipelineRunner(handle_sigint=False)
    try:
        await runner.run(worker)
    except WebSocketDisconnect:
        logger.info("Caller hung up")
    except Exception:
        logger.exception("Conversation failed")
    finally:
        try:
            await worker.queue_frame(EndFrame())
        except Exception:
            pass
        try:
            await websocket.close()
        except RuntimeError:
            pass
