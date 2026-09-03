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
    {"type":"transcript","text":...,"final":true}
    {"type":"assistant","text":...}       answer text, as it is spoken
    {"type":"interrupted"}       drop anything buffered and stop immediately
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
    """Raw PCM both ways, with JSON for the handful of control messages."""

    def __init__(self, *, sample_rate: int, num_channels: int = 1) -> None:
        super().__init__()
        self._sample_rate = sample_rate
        self._num_channels = num_channels

    async def setup(self, setup: FrameProcessorSetup) -> None:
        """Nothing to negotiate: the format is fixed on both sides."""

    async def serialize(self, frame: Frame) -> Optional[str | bytes]:
        # Audio first: it is almost every frame, and the check should be cheap.
        if isinstance(frame, (TTSAudioRawFrame, OutputAudioRawFrame)):
            return frame.audio

        if isinstance(frame, InterruptionFrame):
            # Sent so the client can drop what it has already buffered. Without
            # this the assistant keeps talking out of the buffer after it has
            # been interrupted, which is the single most jarring failure.
            return json.dumps({"type": "interrupted"})
        if isinstance(frame, UserStartedSpeakingFrame):
            return json.dumps({"type": "user_started"})
        if isinstance(frame, UserStoppedSpeakingFrame):
            return json.dumps({"type": "user_stopped"})
        if isinstance(frame, BotStoppedSpeakingFrame):
            return json.dumps({"type": "bot_stopped"})
        if isinstance(frame, TranscriptionFrame):
            return json.dumps({"type": "transcript", "text": frame.text, "final": True})
        if isinstance(frame, TTSTextFrame):
            # Deliberately the text the synthesiser is speaking, not the text
            # the model is writing.
            #
            # The model finishes writing long before the voice finishes saying
            # it, so sending the model's tokens put the whole answer on screen
            # while the assistant was still on its first sentence -- which read
            # as the voice lagging behind, and was the loudest complaint about
            # the old version. Taking it from this end makes the transcript a
            # by-product of the speech rather than a preview of it, so the words
            # appear as they are heard. It is the same relationship a
            # speech-to-speech model has between its audio and its transcript,
            # arrived at from the other direction.
            # The synthesiser sets this immediately before it speaks the
            # frame, so it marks precisely the moment the words become audible.
            # Text it decided to skip never reaches the screen either.
            if frame.will_be_spoken:
                return json.dumps({"type": "assistant", "text": frame.text})
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
