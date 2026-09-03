"""The MedRad agent, presented to Pipecat as a language model.

Pipecat expects an LLM in the middle of its pipeline. Ours is not a model but a
LangGraph service with read-only tools and a generated knowledge base, and that
is the part worth keeping: it is where the facts, the citations and the
guarantee that nothing can be written all live. So rather than pointing Pipecat
at a raw model and losing all of it, the agent is wrapped to look like one.

Tokens are pushed downstream as they arrive, which is what lets speech start
before the answer is finished.
"""
from __future__ import annotations

import json
from typing import Any, AsyncIterator, Optional

import httpx
from loguru import logger
from pipecat.frames.frames import (
    Frame,
    LLMFullResponseEndFrame,
    LLMFullResponseStartFrame,
    LLMTextFrame,
)
from pipecat.processors.frame_processor import FrameDirection
from pipecat.services.llm_service import LLMService

from app.config import settings


class MedRadAgentLLM(LLMService):
    """Streams answers from the assistant service into the voice pipeline."""

    def __init__(self, *, user_token: str, **kwargs: Any) -> None:
        super().__init__(**kwargs)
        self._user_token = user_token
        # Turns kept here rather than in Pipecat's context, because the agent
        # already knows how to use its own history for follow-ups and
        # elliptical questions ("and sales quotations?").
        self._history: list[dict[str, str]] = []

    async def _ask(self, question: str) -> AsyncIterator[str]:
        """Yield answer text as the agent produces it."""
        url = "{}/internal/v1/runs/stream".format(
            settings.ASSISTANT_SERVICE_URL.rstrip("/")
        )
        body = {
            "question": question,
            "user_token": self._user_token,
            "history": self._history[-8:],
            # Composed for the ear: short, spoken numbers, no field names.
            "voice": True,
        }
        headers = {"X-Internal-Key": settings.ASSISTANT_INTERNAL_KEY}

        answer_parts: list[str] = []
        async with httpx.AsyncClient(timeout=settings.ASSISTANT_TIMEOUT_SECONDS) as client:
            async with client.stream("POST", url, json=body, headers=headers) as response:
                if response.status_code != 200:
                    detail = (await response.aread()).decode("utf-8", "replace")[:200]
                    logger.error("Agent returned {}: {}", response.status_code, detail)
                    yield "Sorry, I could not reach the system just now."
                    return

                event = ""
                async for line in response.aiter_lines():
                    if line.startswith("event:"):
                        event = line[6:].strip()
                    elif line.startswith("data:"):
                        try:
                            payload = json.loads(line[5:].strip())
                        except ValueError:
                            continue
                        if event == "token":
                            text = payload.get("text") or ""
                            if text:
                                answer_parts.append(text)
                                yield text
                        elif event == "answer":
                            # Nodes that do not stream (a refusal, a clarifying
                            # question) deliver the whole answer at the end.
                            final = payload.get("answer") or ""
                            if final and not answer_parts:
                                answer_parts.append(final)
                                yield final
                        elif event == "error":
                            message = payload.get("error") or "Something went wrong."
                            yield message

        spoken = "".join(answer_parts).strip()
        if spoken:
            self._history.append({"role": "assistant", "text": spoken})

    async def process_frame(self, frame: Frame, direction: FrameDirection) -> None:
        await super().process_frame(frame, direction)

        question = _question_from(frame)
        if question is None:
            await self.push_frame(frame, direction)
            return

        self._history.append({"role": "user", "text": question})
        await self.push_frame(LLMFullResponseStartFrame(), FrameDirection.DOWNSTREAM)
        try:
            await self.start_ttfb_metrics()
            first = True
            async for text in self._ask(question):
                if first:
                    await self.stop_ttfb_metrics()
                    first = False
                await self.push_frame(LLMTextFrame(text), FrameDirection.DOWNSTREAM)
        except Exception:
            logger.exception("Agent request failed")
            await self.push_frame(
                LLMTextFrame("Sorry, something went wrong looking that up."),
                FrameDirection.DOWNSTREAM,
            )
        finally:
            await self.push_frame(LLMFullResponseEndFrame(), FrameDirection.DOWNSTREAM)


def _question_from(frame: Frame) -> Optional[str]:
    """The user's words, from whichever frame carries them in this version."""
    text = getattr(frame, "text", None)
    if isinstance(text, str) and text.strip() and type(frame).__name__ in (
        "TranscriptionFrame", "InterimTranscriptionFrame",
    ):
        # Only final transcriptions start a turn; interim ones would ask the
        # same question several times as it is being spoken.
        return text.strip() if type(frame).__name__ == "TranscriptionFrame" else None
    return None
