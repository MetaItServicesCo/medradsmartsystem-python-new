"""Tell connected browsers about something that happened in a request handler.

Chat, friend requests and read receipts are written by ordinary synchronous
endpoints, which FastAPI runs in worker threads, while the socket manager lives
on the event loop. This hands an event over to the loop and waits for it to be
published, so it reaches people connected to any worker, through Redis when
there is more than one.

Delivery is best effort: the record is already saved, and a browser that was
not connected catches up by loading the conversation. A failure here is logged,
never raised, so it can never undo a message that was sent.
"""
from __future__ import annotations

import logging
from functools import partial
from typing import Iterable

import anyio.from_thread

logger = logging.getLogger("medrad.realtime")


def notify_users(user_ids: Iterable[int], message: dict) -> None:
    targets = sorted({int(user_id) for user_id in user_ids if user_id})
    if not targets:
        return
    from app.api.v1.endpoints.websocket import manager

    try:
        anyio.from_thread.run(partial(manager.send_to_users, targets, message))
    except RuntimeError:
        # Not running inside a request (a script or a test): nobody is connected
        # to this process, so there is nobody to tell.
        logger.debug("Realtime event %s not sent outside a request", message.get("type"))
    except Exception:
        logger.warning("Realtime event %s could not be delivered", message.get("type"), exc_info=True)
