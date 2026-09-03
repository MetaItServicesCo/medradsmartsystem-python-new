"""Text to speech, streamed from the MedRad speech service.

Pipecat ships a Piper service that runs the voice in-process, which would be
one hop faster. It is not used here, deliberately: the ``pipecat-ai[piper]``
extra requires piper-tts 1.3, which is GPL-3.0-or-later, and linking that into
a commercial product raises the GPL's source-disclosure question for the whole
application. Pipecat's own documentation says as much and points at running
Piper behind HTTP instead.

The speech service already does exactly that, on piper-tts 1.2, which is MIT.
So Piper stays where it is, at a licence this product can ship, and this reads
its raw output over the internal network. The hop costs well under a
millisecond between containers, which is not the part of this that was ever
slow.
"""
from __future__ import annotations

from typing import AsyncGenerator, Optional

import httpx
from loguru import logger
from pipecat.frames.frames import (
    ErrorFrame,
    Frame,
    TTSAudioRawFrame,
    TTSStartedFrame,
    TTSStoppedFrame,
)
from pipecat.services.tts_service import TTSService

from app.config import settings


class MedRadPiperTTS(TTSService):
    """Streams PCM from the speech service as it is synthesised."""

    def __init__(self, **kwargs) -> None:
        super().__init__(**kwargs)
        self._client: Optional[httpx.AsyncClient] = None
        # Piper's rate is a property of the voice, so it is read from the first
        # response rather than assumed. Pipecat resamples to the transport's.
        self._voice_sample_rate = 22050

    def can_generate_metrics(self) -> bool:
        return True

    async def start(self, frame) -> None:
        await super().start(frame)
        if self._client is None:
            # One client for the life of the conversation: a new one per
            # sentence would pay a fresh connection on every sentence.
            self._client = httpx.AsyncClient(
                base_url=settings.SPEECH_SERVICE_URL.rstrip("/"),
                timeout=httpx.Timeout(settings.SPEECH_TIMEOUT_SECONDS, connect=5.0),
            )

    async def stop(self, frame) -> None:
        await super().stop(frame)
        if self._client is not None:
            await self._client.aclose()
            self._client = None

    async def run_tts(self, text: str, context_id: str) -> AsyncGenerator[Frame | None, None]:
        if not text.strip():
            return
        if self._client is None:
            yield ErrorFrame("Speech service client is not started.")
            return

        await self.start_ttfb_metrics()
        yield TTSStartedFrame()
        try:
            async with self._client.stream(
                "POST", "/internal/v1/tts/stream",
                json={"text": text},
                headers={"X-Internal-Key": settings.SPEECH_INTERNAL_KEY},
            ) as response:
                if response.status_code != 200:
                    detail = (await response.aread()).decode("utf-8", "replace")[:160]
                    logger.error("Speech service returned {}: {}", response.status_code, detail)
                    yield ErrorFrame("Could not synthesise speech.")
                    return

                rate = response.headers.get("X-Sample-Rate")
                if rate and rate.isdigit():
                    self._voice_sample_rate = int(rate)

                first = True
                # Samples are forwarded as they arrive rather than collected,
                # which is what lets the speaker start before the sentence has
                # finished being generated.
                async for chunk in response.aiter_bytes():
                    if not chunk:
                        continue
                    if first:
                        await self.stop_ttfb_metrics()
                        first = False
                    yield TTSAudioRawFrame(
                        audio=chunk,
                        sample_rate=self._voice_sample_rate,
                        num_channels=1,
                    )
        except Exception as exc:
            logger.exception("Streaming synthesis failed")
            yield ErrorFrame("Speech synthesis failed: {}".format(exc))
        finally:
            yield TTSStoppedFrame()
