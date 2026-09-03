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
from typing import Any

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


def _load_models() -> None:
    if "stt" in _models:
        return
    logger.info("Loading recogniser {}", settings.WHISPER_MODEL)
    _models["stt"] = WhisperSTTService(
        model=settings.WHISPER_MODEL,
        device="cpu",
        compute_type=settings.WHISPER_COMPUTE,
    )
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
        "recognizer": settings.WHISPER_MODEL,
        "sample_rate": settings.SAMPLE_RATE,
        "user_speech_timeout": settings.USER_SPEECH_TIMEOUT,
    }


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
        # Built per conversation because it holds its own HTTP connection.
        MedRadPiperTTS(),
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
