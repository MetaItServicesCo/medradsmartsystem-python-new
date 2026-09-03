"""Live audio streaming: server-side turn detection and transcription.

The batch endpoint waits for a recording to finish, encode and upload before it
can start work. In a conversation that is dead time on every turn, and it puts
the decision about when a turn ended in the browser, where the only signal
available is raw loudness.

Here the audio arrives while it is being spoken, Silero decides where speech
starts and stops, and transcription begins the instant a turn closes. The
browser is told about speech starting too, which is what lets the assistant be
interrupted without waiting to hear what the interruption said.

Wire protocol
-------------
Client -> server
    binary            16 kHz mono PCM, signed 16-bit little-endian
    {"type":"auth","key":...}       first message, before any audio
    {"type":"endpoint"}             close the current turn now
    {"type":"reset"}                discard the current turn unsent

Server -> client
    {"type":"ready"}
    {"type":"speech_start"}
    {"type":"speech_end"}
    {"type":"transcript","text":...,"avg_logprob":...,"no_speech_prob":...}
    {"type":"error","detail":...}
"""
from __future__ import annotations

import asyncio
import json
import logging
import os
import secrets
import time
from typing import Any, Callable, Optional

import numpy as np


logger = logging.getLogger("speech.stream")

SAMPLE_RATE = 16000

# Silero is run over a window rather than the whole turn, so cost per hop stays
# constant however long someone talks.
ANALYSIS_WINDOW_S = 1.0
ANALYSIS_HOP_S = 0.192

# Audio kept from before speech was detected. A detector that starts the
# recording when it hears something has by definition missed what it heard, and
# a clipped first syllable is what turns "hey, how are you" into nonsense.
PRE_ROLL_S = 0.6

# Silence that closes a turn.
#
# This was 0.5s, which was wrong once endpoint detection became precise. While
# the detector reported "speech somewhere in the last second" it was accidentally
# tolerant: a turn only ended about a second and a half after the speaker
# stopped. Making it exact removed that slack without replacing it, so a normal
# pause mid-sentence -- "how many... facilities are active" -- ended the turn and
# sent half a question to the recogniser. Short fragments transcribe badly, and
# a badly transcribed fragment is what the assistant then failed to understand.
#
# People pause while thinking. This has to outlast that, and only then is it
# dead air worth trimming.
SILENCE_S = float(os.environ.get("STREAM_SILENCE_SECONDS", "0.9"))

# A turn longer than this is closed regardless, so one stuck open cannot grow
# without bound.
MAX_TURN_S = 45.0

# Below this a "turn" is a door, a cough or a chair, not a question.
MIN_TURN_S = float(os.environ.get("STREAM_MIN_TURN_SECONDS", "0.4"))


class TurnDetector:
    """Decides where turns begin and end in a stream of samples.

    Kept free of sockets and of the recogniser so the decision that governs
    when the assistant may speak can be tested with an array of numbers.

    ``vad`` is given a window and returns how long ago, in seconds, speech
    started and stopped inside it -- or None if the window holds no speech.

    Both halves matter. Asking only whether the window contained speech would
    keep the answer True for a whole window after the speaker stopped, so every
    turn would end a window late; that lag is dead air on each turn and it
    dwarfed the silence threshold it hid behind. Knowing where speech began is
    what makes the length check measure speech rather than buffer, so a cough
    padded out with pre-roll is not mistaken for a sentence.
    """

    def __init__(
        self,
        vad: Callable[[np.ndarray], Optional[tuple[float, float]]],
        *,
        sample_rate: int = SAMPLE_RATE,
        pre_roll_s: float = PRE_ROLL_S,
        silence_s: float = SILENCE_S,
        max_turn_s: float = MAX_TURN_S,
        min_turn_s: float = MIN_TURN_S,
    ) -> None:
        self._vad = vad
        self.sample_rate = sample_rate
        self._pre_roll = int(pre_roll_s * sample_rate)
        self._window = int(ANALYSIS_WINDOW_S * sample_rate)
        self._hop = int(ANALYSIS_HOP_S * sample_rate)
        self._silence = silence_s
        self._max_turn = int(max_turn_s * sample_rate)
        self._min_turn = min_turn_s

        self._recent = np.zeros(0, dtype=np.float32)
        self._turn: Optional[np.ndarray] = None
        self._since_hop = 0
        self._elapsed = 0.0
        self._last_voice_at = 0.0
        self._first_voice_at = 0.0
        self.speaking = False

    def feed(self, samples: np.ndarray) -> list[tuple[str, Optional[np.ndarray]]]:
        """Add samples and return the events they caused.

        Events are ("speech_start", None), ("speech_end", audio) or
        ("speech_discarded", None) for a turn too short to be speech.
        """
        events: list[tuple[str, Optional[np.ndarray]]] = []
        if samples.size == 0:
            return events

        self._recent = np.concatenate((self._recent, samples))
        keep = self._window + self._pre_roll
        if self._recent.size > keep:
            self._recent = self._recent[-keep:]

        if self._turn is not None:
            self._turn = np.concatenate((self._turn, samples))

        self._elapsed += samples.size / self.sample_rate
        self._since_hop += samples.size
        if self._since_hop < self._hop:
            return events
        self._since_hop = 0

        window = self._recent[-self._window:]
        heard = self._vad(window) if window.size else None
        voiced = heard is not None
        if voiced:
            since_start, since_end = heard
            # Where speech actually ended, not merely that the window held some.
            self._last_voice_at = self._elapsed - since_end
            if not self.speaking:
                self._first_voice_at = self._elapsed - since_start

        if not self.speaking:
            if voiced:
                self.speaking = True
                # Seed with what was already heard, so the opening word is in
                # the turn rather than in the buffer that detected it. Only as
                # far back as detection can lag -- one hop plus Silero's
                # minimum speech duration, with the pre-roll as margin. Seeding
                # the whole analysis window instead prepended a second of
                # silence to every turn, and silence still costs the recogniser
                # time to read.
                self._turn = self._recent[-(self._hop + self._pre_roll):].copy()
                events.append(("speech_start", None))
            return events

        over_length = self._turn is not None and self._turn.size >= self._max_turn
        if over_length or (self._elapsed - self._last_voice_at) >= self._silence:
            events.append(self._close())
        return events

    def force_endpoint(self) -> Optional[tuple[str, Optional[np.ndarray]]]:
        """End the turn now, whatever the audio is doing."""
        if not self.speaking:
            return None
        return self._close()

    def reset(self) -> None:
        self.speaking = False
        self._turn = None
        self._recent = np.zeros(0, dtype=np.float32)

    def _close(self) -> tuple[str, Optional[np.ndarray]]:
        audio = self._turn
        # How long there was actually speech, not how much buffer was captured.
        # The captured turn is padded at the front with pre-roll, so measuring
        # it by size let a cough grow past the threshold and be transcribed.
        spoken = max(0.0, self._last_voice_at - self._first_voice_at)
        self.speaking = False
        self._turn = None
        # Everything still in the window has been folded into the turn just
        # closed. Leaving it would seed the next turn with words that have
        # already been transcribed, which reads as a stutter in the transcript
        # and matters most when a long monologue is split at the cap.
        self._recent = np.zeros(0, dtype=np.float32)
        if audio is None or spoken < self._min_turn:
            return ("speech_discarded", None)
        return ("speech_end", audio)


def pcm16_to_float32(raw: bytes) -> np.ndarray:
    """Browser PCM to the float range the models expect."""
    if len(raw) % 2:
        raw = raw[:-1]
    return np.frombuffer(raw, dtype="<i2").astype(np.float32) / 32768.0


class StreamSession:
    """One browser's live microphone, from connect to disconnect."""

    def __init__(
        self,
        *,
        internal_key: str,
        vad: Callable[[np.ndarray], bool],
        transcribe: Callable[[np.ndarray], dict[str, Any]],
        send: Callable[[dict[str, Any]], Any],
    ) -> None:
        self._internal_key = internal_key
        self._transcribe = transcribe
        self._send = send
        self._detector = TurnDetector(vad)
        self.authenticated = False

    async def on_text(self, message: str) -> bool:
        """Handle a control frame. Returns False to close the connection."""
        try:
            payload = json.loads(message)
        except ValueError:
            return True
        kind = payload.get("type")

        if kind == "auth":
            supplied = str(payload.get("key") or "")
            if not self._internal_key or not secrets.compare_digest(
                supplied, self._internal_key
            ):
                await self._send({"type": "error", "detail": "Invalid internal credentials."})
                return False
            self.authenticated = True
            await self._send({"type": "ready", "sample_rate": SAMPLE_RATE})
            return True

        if not self.authenticated:
            return False
        if kind == "endpoint":
            await self._emit(self._detector.force_endpoint())
        elif kind == "reset":
            self._detector.reset()
        return True

    async def on_audio(self, raw: bytes) -> None:
        if not self.authenticated:
            return
        for event in self._detector.feed(pcm16_to_float32(raw)):
            await self._emit(event)

    async def _emit(self, event: Optional[tuple[str, Optional[np.ndarray]]]) -> None:
        if event is None:
            return
        name, audio = event
        if name == "speech_start":
            # Sent before anything is transcribed: the browser uses it to stop
            # the assistant talking, which cannot wait for the words.
            await self._send({"type": "speech_start"})
            return
        if name == "speech_discarded":
            await self._send({"type": "speech_end", "discarded": True})
            return

        await self._send({"type": "speech_end"})
        if audio is None:
            return
        started = time.perf_counter()
        try:
            # The recogniser is synchronous and slow enough to stall the socket,
            # which would drop the audio arriving behind it.
            result = await asyncio.to_thread(self._transcribe, audio)
        except Exception:
            logger.exception("Streaming transcription failed")
            await self._send({"type": "error", "detail": "Could not transcribe that."})
            return
        elapsed_ms = int((time.perf_counter() - started) * 1000)
        logger.info(
            "stream turn secs=%.1f chars=%d ms=%d logprob=%.2f",
            audio.size / SAMPLE_RATE, len(result.get("text") or ""),
            elapsed_ms, result.get("avg_logprob", 0.0),
        )
        await self._send({"type": "transcript", "elapsed_ms": elapsed_ms, **result})
