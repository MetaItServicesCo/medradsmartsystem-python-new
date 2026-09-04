"""Wire format between the browser and the voice pipeline.

Pipecat ships a protobuf serializer, which would mean a protobuf client in the
browser. The traffic here is almost entirely raw audio in both directions, so
the frame goes on the wire as its own bytes and everything else -- a few dozen
control messages per conversation -- goes as JSON. That keeps the browser side
small enough to read in one sitting.

Audio out is a continuous PCM stream rather than a file per sentence. That is
the whole point of the rewrite: the previous design synthesised a sentence,
waited for a complete WAV, then played it, so every sentence paid a round trip
and full synthesis before a single sample was heard, and there was a seam
between clips. Here samples reach the speaker while the rest of the sentence is
still being generated.

Client -> server
    binary                       16 kHz mono PCM, signed 16-bit little-endian
    {"type":"auth","key":...}    first message, before any audio

Server -> client
    binary                       PCM to play, same format
    {"type":"ready"}
    {"type":"user_started"}      speech detected; the client stops playback
    {"type":"user_stopped"}
    {"type":"transcript","text":...,"final":true}   what the user said
    {"type":"assistant","text":...}                 what was said, once said
    {"type":"interrupted","text":...}               stop now; text is the part
                                                    that was actually voiced
    {"type":"bot_stopped"}       the answer finished speaking
"""
from __future__ import annotations

import json
from typing import Optional

from loguru import logger
from pipecat.frames.frames import (
    BotStoppedSpeakingFrame,
    Frame,
    InputAudioRawFrame,
    InterruptionFrame,
    OutputAudioRawFrame,
    StartFrame,
    TranscriptionFrame,
    TTSAudioRawFrame,
    TTSTextFrame,
    UserStartedSpeakingFrame,
    UserStoppedSpeakingFrame,
)
from pipecat.processors.frame_processor import FrameProcessorSetup
from pipecat.serializers.base_serializer import FrameSerializer


class RawPcmSerializer(FrameSerializer):
    """Raw PCM both ways, with JSON for the handful of control messages.

    The assistant's words are sent once, after they have been spoken, rather
    than streamed to the screen as they are said. In a voice conversation the
    speech is the conversation; text arriving alongside it is something else to
    attend to, and text arriving ahead of it reads as the voice lagging. So the
    screen gets a record of the exchange rather than a competing live feed.

    The record is assembled from what the synthesiser actually spoke, which
    means an interrupted answer shows the part that was heard and not the part
    the model had already written.
    """

    def __init__(self, *, sample_rate: int, num_channels: int = 1) -> None:
        super().__init__()
        self._sample_rate = sample_rate
        self._num_channels = num_channels
        self._spoken: list[str] = []

    def _take_spoken(self) -> str:
        said = "".join(self._spoken).strip()
        self._spoken.clear()
        return said

    async def setup(self, setup: FrameProcessorSetup) -> None:
        """Nothing to negotiate: the format is fixed on both sides."""

    async def serialize(self, frame: Frame) -> Optional[str | bytes]:
        # Audio first: it is almost every frame, and the check should be cheap.
        if isinstance(frame, (TTSAudioRawFrame, OutputAudioRawFrame)):
            return frame.audio

        if isinstance(frame, InterruptionFrame):
            # Sent so the client can drop what it has already buffered. Without
            # this the assistant keeps talking out of the buffer after it has
            # been interrupted, which is the single most jarring failure. The
            # words that did get out are carried along, so the record shows what
            # was heard rather than what was planned.
            return json.dumps({"type": "interrupted", "text": self._take_spoken()})
        if isinstance(frame, UserStartedSpeakingFrame):
            return json.dumps({"type": "user_started"})
        if isinstance(frame, UserStoppedSpeakingFrame):
            return json.dumps({"type": "user_stopped"})
        if isinstance(frame, BotStoppedSpeakingFrame):
            said = self._take_spoken()
            if said:
                return json.dumps({"type": "assistant", "text": said})
            return json.dumps({"type": "bot_stopped"})
        if isinstance(frame, TranscriptionFrame):
            return json.dumps({"type": "transcript", "text": frame.text, "final": True})
        if isinstance(frame, TTSTextFrame):
            # Collected, not sent. The synthesiser marks a frame just before it
            # speaks it, so gathering them here builds the record out of what
            # was actually voiced -- which is why an interruption can report
            # honestly, and why text the synthesiser skipped never appears.
            if frame.will_be_spoken:
                self._spoken.append(frame.text)
            return None
        if isinstance(frame, StartFrame):
            return json.dumps({"type": "ready", "sample_rate": self._sample_rate})
        return None

    async def deserialize(self, data: str | bytes) -> Optional[Frame]:
        if isinstance(data, bytes):
            return InputAudioRawFrame(
                audio=data,
                sample_rate=self._sample_rate,
                num_channels=self._num_channels,
            )
        # Control messages are handled before the pipeline sees them, so
        # anything arriving here as text is noise rather than instruction.
        try:
            json.loads(data)
        except ValueError:
            logger.debug("Ignoring unparseable control frame")
        return None
