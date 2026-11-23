"""A customer's request for changes to a rental agreement they have not signed yet.

The customer asks from their agreement link (or their account) and says what
to change. The request is kept in the agreement's history as a
"changes_requested" entry with their comments. While it is open, the agreement
cannot be signed: staff edit the agreement and send the link again, and that
resend ("portal_link_sent") closes the request. A signature closes it too.
"""
from __future__ import annotations

from typing import Any, Optional

CHANGES_REQUESTED = "changes_requested"
# What answers a request: the link sent again, or the agreement signed.
_CLOSES_REQUEST = {"portal_link_sent", "customer_signed"}


def open_change_request(history: Any) -> Optional[dict[str, Any]]:
    """The customer's latest request for changes, while nothing has answered it."""
    entries = history if isinstance(history, list) else []
    for entry in reversed(entries):
        if not isinstance(entry, dict):
            continue
        action = entry.get("action")
        if action in _CLOSES_REQUEST:
            return None
        if action == CHANGES_REQUESTED:
            details = entry.get("details") or {}
            return {
                "by": entry.get("by") or "The customer",
                "at": entry.get("at"),
                "comments": str(details.get("comments") or "").strip(),
            }
    return None


def comment_excerpt(comments: Optional[str], length: int = 160) -> str:
    """The start of the comments on one line, for a notification."""
    flat = " ".join((comments or "").split())
    return flat if len(flat) <= length else flat[: length - 1].rstrip() + "…"
