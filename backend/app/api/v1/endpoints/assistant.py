"""Browser-facing assistant API.

This is the only assistant surface the frontend talks to. It authenticates the
user, confirms Super Admin, then proxies the question to the agent service over
the private Docker network and relays its Server-Sent Events back unchanged.

The user's own bearer token travels with the request so that every tool the
agent runs is scoped to that user by the internal tool API.
"""
from __future__ import annotations

import asyncio
import json
import logging
from typing import Any, AsyncIterator, Optional

import httpx
import websockets
from fastapi import (
    APIRouter, Depends, File, Header, HTTPException, Request, UploadFile,
    WebSocket, WebSocketDisconnect, status,
)
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import Response, StreamingResponse
from jose import JWTError
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.deps import get_current_user
from app.core.security import decode_token, password_token_version
from app.db.base import SessionLocal, get_db
from app.models.user import User, UserRole
from app.utils.token_revocation import access_token_is_revoked
from app.utils.logging import log_activity
from app.utils.rate_limit import _redis_client


logger = logging.getLogger("medrad.assistant")

router = APIRouter()

# The voice socket lives on its own router so it can be mounted at /ws/, which
# is the only prefix the production nginx upgrades to a WebSocket. Mounted
# under /assistant/ it would fall into the catch-all location, which sets
# Connection "" and turns the upgrade into a plain request that fails without
# saying why.
voice_router = APIRouter()

# A Super Admin asking questions is low-volume by nature. This ceiling exists to
# bound model spend if the UI misbehaves, not to police normal use.
ASK_LIMIT_PER_WINDOW = 40
ASK_WINDOW_SECONDS = 300


class ConversationTurn(BaseModel):
    role: str = Field(pattern="^(user|assistant)$")
    text: str = Field(max_length=4000)


class AskRequest(BaseModel):
    question: str = Field(min_length=2, max_length=2000)
    # Recent turns from this conversation, oldest first. Capped here so a
    # client cannot grow the model context without bound.
    history: list[ConversationTurn] = Field(default_factory=list, max_length=12)
    # The answer will be read aloud, so it is composed for the ear: short,
    # spoken numbers, no lists or field names.
    voice: bool = False


def require_superadmin(current_user: User = Depends(get_current_user)) -> User:
    if current_user.role != UserRole.SUPERADMIN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="The assistant is available to Super Admin accounts only.",
        )
    return current_user


def _enforce_rate_limit(user_id: int) -> None:
    """Fixed-window cap. A Redis outage must not disable the assistant."""
    try:
        client = _redis_client()
        key = "{}:assistant:{}".format(settings.READ_CACHE_PREFIX, user_id)
        count = client.incr(key)
        if count == 1:
            client.expire(key, ASK_WINDOW_SECONDS)
        if count > ASK_LIMIT_PER_WINDOW:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="Too many assistant questions. Try again shortly.",
            )
    except HTTPException:
        raise
    except Exception:
        logger.debug("Assistant rate limiting unavailable; allowing request")


@router.get("/status")
def assistant_status(current_user: User = Depends(get_current_user)) -> Any:
    """Whether the UI should offer the assistant to this user."""
    from app.assistant.kb.refresh import last_refresh

    payload = {
        "enabled": bool(settings.ASSISTANT_ENABLED and settings.ASSISTANT_INTERNAL_KEY.strip()),
        "available_to_user": current_user.role == UserRole.SUPERADMIN,
    }
    # Super Admins can confirm the knowledge base tracks the deployed code
    # without reading container logs.
    if current_user.role == UserRole.SUPERADMIN:
        payload["knowledge_base"] = last_refresh()
        payload["voice_enabled"] = bool((settings.SPEECH_SERVICE_URL or "").strip())
    return payload


@router.post("/ask")
async def ask(
    payload: AskRequest,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_superadmin),
    authorization: Optional[str] = Header(None),
) -> StreamingResponse:
    """Ask the assistant a question; responses stream back as SSE."""
    if not (settings.ASSISTANT_ENABLED and settings.ASSISTANT_INTERNAL_KEY.strip()):
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="The assistant is not enabled on this deployment.",
        )
    _enforce_rate_limit(current_user.id)

    token = (authorization or "").partition(" ")[2].strip()
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing bearer token."
        )

    # The question itself is auditable; the answer is reconstructible from the
    # tool-call audit rows the agent generates.
    log_activity(
        db, "assistant_question", 0, "ASSISTANT_ASK", current_user,
        {"question": payload.question[:500]},
    )
    db.commit()

    async def relay() -> AsyncIterator[bytes]:
        url = "{}/internal/v1/runs/stream".format(settings.ASSISTANT_SERVICE_URL.rstrip("/"))
        headers = {"X-Internal-Key": settings.ASSISTANT_INTERNAL_KEY}
        body = {
            "question": payload.question,
            "user_token": token,
            "history": [turn.model_dump() for turn in payload.history],
            "voice": payload.voice,
        }
        try:
            async with httpx.AsyncClient(timeout=settings.ASSISTANT_TIMEOUT_SECONDS) as client:
                async with client.stream("POST", url, json=body, headers=headers) as response:
                    if response.status_code != 200:
                        detail = (await response.aread()).decode("utf-8", "replace")[:300]
                        yield _sse("error", {"error": "Assistant unavailable: {}".format(detail)})
                        return
                    async for line in response.aiter_lines():
                        if await request.is_disconnected():
                            return
                        # Relay the upstream SSE framing verbatim.
                        yield (line + "\n").encode("utf-8")
        except httpx.HTTPError as exc:
            logger.warning("Assistant relay failed: %s", exc)
            yield _sse("error", {"error": "The assistant service is unreachable."})

    return StreamingResponse(
        relay(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


class SpeakRequest(BaseModel):
    text: str = Field(min_length=1, max_length=2000)


def _speech_url(path: str) -> str:
    base = (settings.SPEECH_SERVICE_URL or "").strip().rstrip("/")
    if not base:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Voice is not enabled on this deployment.",
        )
    return "{}{}".format(base, path)


def _voice_stream_user(token: str) -> Optional[User]:
    """Resolve a Super Admin from a token handed over in the URL.

    A browser cannot set headers on a WebSocket, so the token travels in the
    path exactly as it already does for the chat socket. Everything the HTTP
    guard checks is checked here too -- token type, revocation, password
    version, active flag -- because a second door into the same data must not
    be an easier one.
    """
    try:
        payload = decode_token(token)
    except JWTError:
        return None
    if payload.get("token_type") != "access" or access_token_is_revoked(payload):
        return None
    username = payload.get("sub")
    if not username:
        return None
    db = SessionLocal()
    try:
        user = db.query(User).filter(User.username == username).first()
        if not user or not user.is_active:
            return None
        if payload.get("ver") != password_token_version(user.hashed_password):
            return None
        if user.role != UserRole.SUPERADMIN:
            return None
        # Detached from the session it was loaded in, so only the values read
        # here remain valid.
        db.expunge(user)
        return user
    finally:
        db.close()


@voice_router.websocket("/ws/assistant-voice/{token}")
async def speech_stream(websocket: WebSocket, token: str) -> None:
    """Relay a live microphone to the speech service and events back.

    The browser never reaches the speech service directly: it has no session,
    no role check and an internal key that must not leave the network. This
    terminates the authenticated socket and opens a second, internal one.
    """
    user = await run_in_threadpool(_voice_stream_user, token)
    if user is None:
        await websocket.close(code=4001, reason="Invalid token")
        return
    if not (settings.SPEECH_SERVICE_URL or "").strip():
        await websocket.close(code=4004, reason="Voice is not configured")
        return

    await websocket.accept()
    url = "{}/internal/v1/stream".format(
        settings.SPEECH_SERVICE_URL.rstrip("/").replace("http://", "ws://", 1)
                                   .replace("https://", "wss://", 1)
    )

    try:
        async with websockets.connect(url, max_size=None, ping_interval=20) as upstream:
            await upstream.send(json.dumps({
                "type": "auth", "key": settings.ASSISTANT_INTERNAL_KEY,
            }))

            async def to_upstream() -> None:
                while True:
                    message = await websocket.receive()
                    if message.get("type") == "websocket.disconnect":
                        return
                    if (audio := message.get("bytes")) is not None:
                        await upstream.send(audio)
                    elif (text := message.get("text")) is not None:
                        # Control frames only. The browser must never be able to
                        # re-authenticate the internal socket.
                        try:
                            kind = json.loads(text).get("type")
                        except ValueError:
                            continue
                        if kind in ("endpoint", "reset"):
                            await upstream.send(json.dumps({"type": kind}))

            async def to_client() -> None:
                async for event in upstream:
                    if isinstance(event, bytes):
                        continue
                    await websocket.send_text(event)

            pump = [asyncio.create_task(to_upstream()), asyncio.create_task(to_client())]
            done, pending = await asyncio.wait(pump, return_when=asyncio.FIRST_COMPLETED)
            for task in pending:
                task.cancel()
            for task in done:
                if (error := task.exception()) is not None:
                    raise error
    except WebSocketDisconnect:
        pass
    except Exception:
        logger.exception("Voice stream relay failed for user %s", user.id)
        try:
            await websocket.send_json({
                "type": "error", "detail": "The voice service is unreachable.",
            })
        except Exception:
            pass
    finally:
        try:
            await websocket.close()
        except RuntimeError:
            pass


@router.post("/speech/tts")
async def text_to_speech(
    payload: SpeakRequest,
    current_user: User = Depends(require_superadmin),
) -> Response:
    """Speak an answer. Returns WAV audio produced by the speech service."""
    _enforce_rate_limit(current_user.id)
    url = _speech_url("/internal/v1/tts")
    try:
        async with httpx.AsyncClient(timeout=settings.SPEECH_TIMEOUT_SECONDS) as client:
            upstream = await client.post(
                url,
                json={"text": payload.text},
                headers={"X-Internal-Key": settings.ASSISTANT_INTERNAL_KEY},
            )
    except httpx.HTTPError:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="The voice service is unreachable.",
        )
    if upstream.status_code != 200:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Voice synthesis failed.",
        )
    return Response(
        content=upstream.content,
        media_type="audio/wav",
        headers={"Cache-Control": "no-store"},
    )


@router.post("/speech/stt")
async def speech_to_text(
    audio: UploadFile = File(...),
    current_user: User = Depends(require_superadmin),
) -> Any:
    """Transcribe a spoken question. The recording is never stored."""
    _enforce_rate_limit(current_user.id)
    raw = await audio.read()
    if not raw:
        raise HTTPException(status_code=422, detail="Empty recording.")
    if len(raw) > 8 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="Recording is too long.")

    url = _speech_url("/internal/v1/stt")
    try:
        async with httpx.AsyncClient(timeout=settings.SPEECH_TIMEOUT_SECONDS) as client:
            upstream = await client.post(
                url,
                files={"audio": (audio.filename or "speech.webm", raw, audio.content_type or "audio/webm")},
                data={"language": "en"},
                headers={"X-Internal-Key": settings.ASSISTANT_INTERNAL_KEY},
            )
    except httpx.HTTPError:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="The transcription service is unreachable.",
        )
    if upstream.status_code != 200:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY, detail="Transcription failed."
        )
    return upstream.json()


def _sse(event: str, data: dict[str, Any]) -> bytes:
    return "event: {}\ndata: {}\n\n".format(event, json.dumps(data)).encode("utf-8")
