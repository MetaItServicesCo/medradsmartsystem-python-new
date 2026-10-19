"""Measure what this Groq account can actually do, and name the models to use.

Written after being wrong twice in one sitting. The first version grouped the
catalogue by looking for "tts" in the model id, which filed Orpheus -- a speech
family -- under chat, and then picked the alphabetically first "chat" model as
the default, landing on one that cannot call tools at all. It reported that
Groq could not do text-to-speech and that tool calling was broken. Both
conclusions were wrong, and both were produced confidently.

So this measures instead of classifying by name:

  * every chat model is asked to call a tool, and the ones that can are
    reported with how long they took -- choosing tools is the agent's whole
    job, and a model that converses beautifully and will not call a function
    is no use here
  * every speech model is actually invoked, so "needs terms accepted in the
    console" is reported as the one-click action it is rather than as an
    absence
  * latency is measured on this account from this machine, because speed is
    the entire reason for moving

    GROQ_API_KEY=... python agent-service/scripts/groq_doctor.py
"""
from __future__ import annotations

import io
import math
import os
import struct
import sys
import time
import wave

BASE = os.environ.get("AGENT_BASE_URL", "https://api.groq.com/openai/v1").rstrip("/")
KEY = (os.environ.get("GROQ_API_KEY") or os.environ.get("AGENT_API_KEY") or "").strip()

# Families that are not conversational models, however they are named. Keeping
# this as a list of substrings rather than a guess about the word "tts".
SPEECH_IN = ("whisper",)
SPEECH_OUT = ("tts", "orpheus", "playai")
NOT_CHAT = ("prompt-guard", "safeguard", "guard-")

PHRASE = "The infusion pump passed its electrical safety test."
TOOL = [{
    "type": "function",
    "function": {
        "name": "count_overdue_inspections",
        "description": "Count overdue inspections at a facility.",
        "parameters": {
            "type": "object",
            "properties": {"facility": {"type": "string"}},
            "required": ["facility"],
        },
    },
}]

notes: list[str] = []


def tone_wav(seconds: float = 1.0, rate: int = 16000) -> bytes:
    """A plain tone. Whisper finds no words in it, which is the point: this
    checks auth, the multipart upload and the response shape, not accuracy."""
    buffer = io.BytesIO()
    with wave.open(buffer, "wb") as handle:
        handle.setnchannels(1)
        handle.setsampwidth(2)
        handle.setframerate(rate)
        handle.writeframes(b"".join(
            struct.pack("<h", int(8000 * math.sin(i * 0.08)))
            for i in range(int(rate * seconds))
        ))
    return buffer.getvalue()


def main() -> int:  # noqa: PLR0912, PLR0915 - a report reads better in one piece
    if not KEY:
        print("No key. Set GROQ_API_KEY (or AGENT_API_KEY) and run again.")
        return 2
    try:
        import httpx
    except ImportError:
        print("httpx is not installed in this interpreter.")
        return 2

    client = httpx.Client(
        base_url=BASE,
        headers={"Authorization": "Bearer {}".format(KEY)},
        timeout=90.0,
    )

    try:
        response = client.get("/models")
        response.raise_for_status()
        ids = sorted(m["id"] for m in response.json().get("data", []))
    except Exception as exc:  # noqa: BLE001
        print("Could not read the catalogue: {!r}".format(exc))
        return 1

    chat, stt, tts = [], [], []
    for model_id in ids:
        lowered = model_id.lower()
        if any(k in lowered for k in SPEECH_IN):
            stt.append(model_id)
        elif any(k in lowered for k in SPEECH_OUT):
            tts.append(model_id)
        elif any(k in lowered for k in NOT_CHAT):
            continue  # safety classifiers, not conversational
        else:
            chat.append(model_id)

    print("Groq account: {} models".format(len(ids)))
    print("=" * 72)

    # ── chat, and whether each one can drive the agent ──────────────────────
    print()
    print("Chat models -- can it call a tool?")
    print("-" * 72)
    usable: list[tuple[str, float]] = []
    for model_id in chat:
        try:
            started = time.time()
            response = client.post("/chat/completions", json={
                "model": model_id,
                "max_tokens": 256,
                "messages": [{"role": "user", "content": "How many inspections are overdue at Vtech?"}],
                "tools": TOOL,
                "tool_choice": "auto",
            })
            elapsed = (time.time() - started) * 1000
            if response.status_code != 200:
                reason = response.json().get("error", {}).get("message", response.text)
                print("  {:<34} no   {}".format(model_id, reason[:60]))
                continue
            calls = response.json()["choices"][0]["message"].get("tool_calls") or []
            if calls:
                print("  {:<34} YES  {:>6.0f} ms   {}".format(
                    model_id, elapsed, calls[0]["function"]["arguments"][:40]))
                usable.append((model_id, elapsed))
            else:
                print("  {:<34} no   answered without calling it".format(model_id))
        except Exception as exc:  # noqa: BLE001
            print("  {:<34} no   {}".format(model_id, repr(exc)[:60]))

    # ── speech in ───────────────────────────────────────────────────────────
    print()
    print("Speech to text")
    print("-" * 72)
    audio = tone_wav()
    working_stt: list[tuple[str, float]] = []
    for model_id in stt:
        try:
            started = time.time()
            response = client.post(
                "/audio/transcriptions",
                files={"file": ("tone.wav", audio, "audio/wav")},
                data={"model": model_id, "response_format": "json"},
            )
            elapsed = (time.time() - started) * 1000
            if response.status_code == 200:
                print("  {:<34} YES  {:>6.0f} ms   (plumbing only -- a tone has no words)".format(
                    model_id, elapsed))
                working_stt.append((model_id, elapsed))
            else:
                print("  {:<34} no   {}".format(model_id, response.text[:60]))
        except Exception as exc:  # noqa: BLE001
            print("  {:<34} no   {}".format(model_id, repr(exc)[:60]))
    if not stt:
        print("  (none offered)")

    # ── speech out ──────────────────────────────────────────────────────────
    print()
    print("Text to speech")
    print("-" * 72)
    working_tts: list[str] = []
    if not tts:
        print("  (none offered)")
    for model_id in tts:
        try:
            started = time.time()
            response = client.post("/audio/speech", json={
                "model": model_id,
                "voice": os.environ.get("GROQ_TTS_VOICE", "hannah"),
                "input": PHRASE,
                "response_format": "wav",
            })
            elapsed = (time.time() - started) * 1000
            if response.status_code == 200:
                print("  {:<34} YES  {:>6.0f} ms   {} bytes".format(
                    model_id, elapsed, len(response.content)))
                working_tts.append(model_id)
                continue
            message = response.json().get("error", {}).get("message", response.text)
            if "terms" in message.lower():
                # Not a missing capability: somebody has to click accept once.
                print("  {:<34} --   needs terms accepted in the Groq console".format(model_id))
                notes.append(
                    "{} is available but needs its terms accepted once at "
                    "console.groq.com -- that is the only thing between this "
                    "account and hosted speech output.".format(model_id))
            elif "decommission" in message.lower():
                print("  {:<34} no   decommissioned".format(model_id))
            else:
                print("  {:<34} no   {}".format(model_id, message[:60]))
        except Exception as exc:  # noqa: BLE001
            print("  {:<34} no   {}".format(model_id, repr(exc)[:60]))

    # ── what to actually set ────────────────────────────────────────────────
    print()
    print("Settings this account supports")
    print("=" * 72)
    if not usable:
        print("  No model here can call a tool. The assistant cannot run on this account.")
        return 1

    usable.sort(key=lambda pair: pair[1])
    fastest = usable[0][0]
    # The largest tool-capable model is the safer choice for the step that
    # decides what to do; the quickest is right for the one-word routing call.
    strongest = max(usable, key=lambda pair: len(pair[0]))[0]
    print("  AGENT_PROVIDER=groq")
    print("  GROQ_API_KEY=<your key>")
    print("  AGENT_ROUTER_MODEL={}        # fastest tool-capable, {:.0f} ms".format(
        fastest, usable[0][1]))
    print("  AGENT_TOOLS_MODEL={}".format(strongest))
    print("  AGENT_SYNTHESIS_MODEL={}".format(strongest))
    if working_stt:
        # Sorted, not first-seen: both Whisper sizes work and the turbo one is
        # consistently quicker, which is the whole point of the move.
        working_stt.sort(key=lambda pair: pair[1])
        print()
        print("  Speech in:  {} ({:.0f} ms)".format(working_stt[0][0], working_stt[0][1]))
    print("  Speech out: {}".format(
        working_tts[0] if working_tts else "not available yet -- see below"))

    if notes:
        print()
        for note in notes:
            print("  ! {}".format(note))
    return 0


if __name__ == "__main__":
    sys.exit(main())
