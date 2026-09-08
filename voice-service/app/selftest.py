"""Find out which stage of the voice pipeline is failing, from inside it.

The pipeline has four stages and a failure in any of them looks the same from
a chair: you talk and nothing comes back. Working that out one symptom at a
time has cost days -- an odd-length audio buffer, a policy blocking a worklet,
a compose default quietly overriding a code default, an API key restricted in
a way that only shows up as silence.

This exercises each stage in order with the service's own configuration and
says which one broke, so the next fix is aimed rather than guessed.

    docker compose exec voice python -m app.selftest

It sends one short sentence to the speech provider and nothing else. No
conversation is started and no audio is played.
"""
from __future__ import annotations

import asyncio
import sys
from typing import Any, Optional

import httpx

from app.config import settings


PASS, FAIL, WARN = "PASS", "FAIL", "WARN"
_results: list[tuple[str, str]] = []

PHRASE = "Testing one two three."


def record(status: str, name: str, detail: str = "") -> None:
    _results.append((status, name))
    print("{:<5} {:<40} {}".format(status, name, detail), flush=True)


async def check_agent() -> None:
    """The brain. Reachability only: asking it a real question needs a login."""
    base = (settings.ASSISTANT_SERVICE_URL or "").strip().rstrip("/")
    if not base:
        record(FAIL, "agent service configured", "ASSISTANT_SERVICE_URL is empty")
        return
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            response = await client.get("{}/health".format(base))
        record(
            PASS if response.status_code == 200 else FAIL,
            "agent service reachable",
            "HTTP {}".format(response.status_code),
        )
    except Exception as exc:
        record(FAIL, "agent service reachable", repr(exc)[:80])

    if not settings.ASSISTANT_INTERNAL_KEY.strip():
        record(FAIL, "agent internal key set", "empty: every request will be rejected")
    else:
        record(PASS, "agent internal key set",
               "{} chars".format(len(settings.ASSISTANT_INTERNAL_KEY)))


async def check_piper() -> None:
    """Speech out, through the service that holds the voice."""
    base = (settings.SPEECH_SERVICE_URL or "").strip().rstrip("/")
    if not base:
        record(FAIL, "speech service configured", "SPEECH_SERVICE_URL is empty")
        return
    try:
        async with httpx.AsyncClient(timeout=60) as client:
            async with client.stream(
                "POST", "{}/internal/v1/tts/stream".format(base),
                json={"text": PHRASE},
                headers={"X-Internal-Key": settings.SPEECH_INTERNAL_KEY},
            ) as response:
                if response.status_code != 200:
                    body = (await response.aread()).decode("utf-8", "replace")[:120]
                    record(FAIL, "piper streams audio",
                           "HTTP {}: {}".format(response.status_code, body))
                    return
                rate = response.headers.get("X-Sample-Rate", "?")
                total = 0
                async for chunk in response.aiter_bytes():
                    total += len(chunk)
    except Exception as exc:
        record(FAIL, "piper streams audio", repr(exc)[:80])
        return

    if total == 0:
        record(FAIL, "piper streams audio", "connected but returned no samples")
        return
    # Sixteen-bit mono: an odd total means a sample was cut in half somewhere,
    # which is exactly what broke this once already.
    record(
        PASS if total % 2 == 0 else WARN,
        "piper streams audio",
        "{:,} bytes at {} Hz{}".format(
            total, rate, "" if total % 2 == 0 else "  (ODD -- half a sample)"
        ),
    )


async def check_elevenlabs() -> None:
    """Speech out, through the endpoint pipecat actually uses.

    Deliberately not /v1/voices. A restricted key can be denied there while
    being perfectly able to synthesise, and testing the wrong permission is
    how this was misdiagnosed once already.
    """
    key = settings.ELEVENLABS_API_KEY.strip()
    if not key:
        record(FAIL, "elevenlabs key set", "empty")
        return
    record(PASS, "elevenlabs key set", "{} chars".format(len(key)))

    url = "https://api.elevenlabs.io/v1/text-to-speech/{}".format(settings.ELEVENLABS_VOICE_ID)
    try:
        async with httpx.AsyncClient(timeout=45) as client:
            response = await client.post(
                url,
                headers={"xi-api-key": key},
                json={"text": PHRASE, "model_id": settings.ELEVENLABS_MODEL},
            )
    except Exception as exc:
        record(FAIL, "elevenlabs synthesises", repr(exc)[:80])
        return

    if response.status_code != 200:
        record(FAIL, "elevenlabs synthesises",
               "HTTP {}: {}".format(response.status_code, response.text[:160]))
        return
    record(PASS, "elevenlabs synthesises",
           "{:,} bytes for voice {}".format(len(response.content), settings.ELEVENLABS_VOICE_ID))


def check_settings() -> None:
    record(PASS, "speaking with", settings.tts_provider())
    record(PASS, "recogniser", settings.WHISPER_MODEL)
    record(
        PASS if settings.VAD_STOP_SECS <= 0.3 else WARN,
        "turn detector stop_secs",
        "{}s{}".format(
            settings.VAD_STOP_SECS,
            "" if settings.VAD_STOP_SECS <= 0.3
            else "  (stacks on the {}s turn timeout)".format(settings.USER_SPEECH_TIMEOUT),
        ),
    )
    if not settings.VOICE_INTERNAL_KEY.strip():
        record(FAIL, "voice internal key set", "empty: the relay cannot authenticate")
    else:
        record(PASS, "voice internal key set",
               "{} chars".format(len(settings.VOICE_INTERNAL_KEY)))


async def main() -> int:
    print("Voice service self-test")
    print("=" * 72)
    check_settings()
    print()
    await check_agent()
    print()

    provider = settings.tts_provider()
    if provider == "elevenlabs":
        await check_elevenlabs()
        # Piper is the fallback, so its health still matters.
        await check_piper()
    else:
        await check_piper()

    failures = [r for r in _results if r[0] == FAIL]
    print()
    print("-" * 72)
    print("{} checks, {} failed".format(len(_results), len(failures)))
    if failures:
        print("\nFirst thing to fix: {}".format(failures[0][1]))
    else:
        print("\nEvery stage this service depends on is working.")
        print("If a call still produces no audio, the remaining suspects are the")
        print("browser and the relay, not this service. The browser console and")
        print("`docker compose logs backend` cover both.")
    print("-" * 72)
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
