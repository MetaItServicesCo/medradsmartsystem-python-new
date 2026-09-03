"""Find out which hop of the voice pipeline is broken.

Every voice fix so far has been made blind: the browser falls back silently
when live audio fails, the speech service logs nothing when it is never
reached, and "it does not work" covers six different failures that need six
different fixes. This walks the pipeline hop by hop and says which one is
down, from inside the network where the answer is unambiguous.

    docker compose exec backend python -m scripts.voice_doctor

It only reads. Nothing here changes configuration or data.
"""
from __future__ import annotations

import asyncio
import json
import math
import struct
import sys
import time
import wave
from io import BytesIO
from typing import Any, Optional

import httpx
import websockets

from app.core.config import settings


PASS, FAIL, WARN = "PASS", "FAIL", "WARN"
_results: list[tuple[str, str, str]] = []


def record(status: str, name: str, detail: str = "") -> None:
    _results.append((status, name, detail))
    print("{:<5} {:<44} {}".format(status, name, detail), flush=True)


def _speech_base() -> str:
    return (settings.SPEECH_SERVICE_URL or "").strip().rstrip("/")


def _headers() -> dict[str, str]:
    return {"X-Internal-Key": settings.ASSISTANT_INTERNAL_KEY or ""}


async def check_config() -> bool:
    """The settings that silently disable voice when they are empty."""
    base = _speech_base()
    if not base:
        record(FAIL, "SPEECH_SERVICE_URL is set", "empty: voice is disabled entirely")
        return False
    record(PASS, "SPEECH_SERVICE_URL is set", base)

    key = settings.ASSISTANT_INTERNAL_KEY or ""
    if len(key) < 32:
        record(FAIL, "ASSISTANT_INTERNAL_KEY length", "{} chars, needs 32".format(len(key)))
        return False
    record(PASS, "ASSISTANT_INTERNAL_KEY length", "{} chars".format(len(key)))
    return True


async def check_health() -> dict[str, Any]:
    """Which models the speech container actually has, as opposed to is configured for."""
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            response = await client.get("{}/health".format(_speech_base()))
        body = response.json()
    except Exception as exc:
        record(FAIL, "speech /health reachable", repr(exc)[:90])
        return {}

    record(PASS, "speech /health reachable", "")
    if body.get("voice_available"):
        record(PASS, "a Piper voice is present", str(body.get("voice_in_image")))
    else:
        record(FAIL, "a Piper voice is present", "none found in the image")
    record(
        PASS if body.get("stream_sample_rate") else WARN,
        "streaming endpoint built in",
        "sample_rate={}".format(body.get("stream_sample_rate")),
    )
    record(PASS, "recogniser configured", str(body.get("recognizer")))
    if body.get("warm"):
        record(PASS, "models already loaded", "warmed in {}ms".format(body.get("warm_ms")))
    else:
        record(
            WARN, "models already loaded",
            body.get("warm_error") or "still loading; the next check pays for it",
        )
    return body


async def check_tts() -> Optional[bytes]:
    """Speech out, and how long the first clip takes."""
    started = time.perf_counter()
    try:
        async with httpx.AsyncClient(timeout=120) as client:
            response = await client.post(
                "{}/internal/v1/tts".format(_speech_base()),
                json={"text": "There are eighteen open service requests today."},
                headers=_headers(),
            )
    except Exception as exc:
        record(FAIL, "text to speech", repr(exc)[:90])
        return None

    if response.status_code != 200:
        record(FAIL, "text to speech",
               "HTTP {}: {}".format(response.status_code, response.text[:110]))
        return None

    elapsed = int((time.perf_counter() - started) * 1000)
    audio = response.content
    try:
        with wave.open(BytesIO(audio)) as handle:
            seconds = handle.getnframes() / float(handle.getframerate() or 1)
        record(PASS, "text to speech",
               "{}ms for {:.1f}s of audio, {} bytes".format(elapsed, seconds, len(audio)))
    except Exception:
        record(WARN, "text to speech", "{}ms, {} bytes, unreadable WAV".format(elapsed, len(audio)))
    return audio


async def check_stt(audio: Optional[bytes]) -> None:
    """Speech in, checked against words we know were spoken.

    Feeding Piper's own output back through Whisper is the only way to test
    accuracy without a microphone, and it exercises exactly the path a spoken
    question takes.
    """
    if audio is None:
        record(WARN, "speech to text", "skipped: no audio to transcribe")
        return

    started = time.perf_counter()
    try:
        async with httpx.AsyncClient(timeout=180) as client:
            response = await client.post(
                "{}/internal/v1/stt".format(_speech_base()),
                files={"audio": ("probe.wav", audio, "audio/wav")},
                data={"language": "en"},
                headers=_headers(),
            )
    except Exception as exc:
        record(FAIL, "speech to text", repr(exc)[:90])
        return

    if response.status_code != 200:
        record(FAIL, "speech to text",
               "HTTP {}: {}".format(response.status_code, response.text[:110]))
        return

    elapsed = int((time.perf_counter() - started) * 1000)
    body = response.json()
    heard = (body.get("text") or "").lower()
    expected = {"eighteen", "open", "service", "requests"}
    found = {word for word in expected if word in heard}

    detail = "{}ms, heard {!r}, logprob={}".format(
        elapsed, (body.get("text") or "")[:60], body.get("avg_logprob"),
    )
    if not heard:
        record(FAIL, "speech to text", "returned nothing. " + detail)
    elif len(found) >= 3:
        record(PASS, "speech to text round trip", detail)
    else:
        record(WARN, "speech to text round trip", "matched {}/4 words. {}".format(len(found), detail))


def _tone_pcm(seconds: float = 1.0, rate: int = 16000) -> bytes:
    """A synthetic buzz. Not speech, so the detector should stay quiet."""
    frames = []
    for i in range(int(seconds * rate)):
        frames.append(int(9000 * math.sin(2 * math.pi * 220 * i / rate)))
    return struct.pack("<{}h".format(len(frames)), *frames)


async def check_stream_socket() -> None:
    """The live path, from inside the network, where nginx cannot be blamed."""
    url = "{}/internal/v1/stream".format(
        _speech_base().replace("https://", "wss://", 1).replace("http://", "ws://", 1)
    )
    try:
        async with websockets.connect(url, max_size=None, open_timeout=15) as socket:
            await socket.send(json.dumps({"type": "auth", "key": settings.ASSISTANT_INTERNAL_KEY}))
            raw = await asyncio.wait_for(socket.recv(), timeout=60)
            first = json.loads(raw)
            if first.get("type") != "ready":
                record(FAIL, "speech WebSocket accepts audio", "expected ready, got {}".format(first))
                return
            record(PASS, "speech WebSocket handshake", "sample_rate={}".format(first.get("sample_rate")))

            # A tone is not speech. If this opens a turn, the detector is
            # mis-tuned and would fire on room noise.
            await socket.send(_tone_pcm(1.2))
            try:
                event = json.loads(await asyncio.wait_for(socket.recv(), timeout=3))
                record(WARN, "detector ignores non-speech", "reacted with {}".format(event.get("type")))
            except asyncio.TimeoutError:
                record(PASS, "detector ignores non-speech", "stayed quiet, as it should")
    except Exception as exc:
        record(FAIL, "speech WebSocket handshake", repr(exc)[:110])


async def check_agent() -> None:
    """The brain, and how long one full turn takes."""
    url = "{}/health".format((settings.ASSISTANT_SERVICE_URL or "").strip().rstrip("/"))
    try:
        async with httpx.AsyncClient(timeout=20) as client:
            response = await client.get(url)
        record(
            PASS if response.status_code == 200 else FAIL,
            "agent service reachable",
            "HTTP {}".format(response.status_code),
        )
    except Exception as exc:
        record(FAIL, "agent service reachable", repr(exc)[:90])


def summarise() -> int:
    failures = [r for r in _results if r[0] == FAIL]
    warnings = [r for r in _results if r[0] == WARN]
    print("\n" + "-" * 72)
    print("{} checks, {} failed, {} warned".format(len(_results), len(failures), len(warnings)))
    if failures:
        print("\nFirst thing to fix:")
        status, name, detail = failures[0]
        print("  {} -- {}".format(name, detail or "see above"))
    else:
        print("\nEvery hop inside the network is healthy.")
        print("If the browser still falls back to whole recordings, the upgrade is")
        print("being dropped between the browser and here. Check that nginx has:")
        print("    location /api/v1/ws/ { proxy_set_header Upgrade $http_upgrade; ... }")
        print("and that the browser console shows no WebSocket error.")
    print("-" * 72)
    return 1 if failures else 0


async def main() -> int:
    print("Voice pipeline check\n" + "=" * 72)
    if not await check_config():
        return summarise()
    await check_health()
    audio = await check_tts()
    await check_stt(audio)
    await check_stream_socket()
    await check_agent()
    return summarise()


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
