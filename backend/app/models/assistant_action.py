"""Every change the assistant makes, written down before it happens.

A read-only assistant is safe largely by accident: it cannot be wrong in a way
that lasts. Letting it write removes that safety net, so two properties have to
be built back deliberately.

**A person agrees to the change in the words the change will be made in.**  A
write tool called without a confirmation token does not write. It validates the
request, works out precisely what would change, records that here as a
``PROPOSED`` row, and hands back a token and a plain-English summary. The
assistant reads the summary out; the person says yes; the same tool is called
again with the token and only then does anything change. A misheard sentence
costs a question, not a record.

**Anyone looking later can see exactly what happened.**  The before and after
images are stored on the row, so a change can be read back -- and reversed by
hand -- without reconstructing it from audit logs that only say a tool ran.

Proposals expire. An unconfirmed one left open is a change somebody considered
and did not make, and it must not become applicable an hour later because a
token was still lying around in a transcript.
"""
from __future__ import annotations

import enum
from datetime import datetime

from sqlalchemy import (
    Column, DateTime, Enum as SQLEnum, ForeignKey, Index, Integer, JSON, String, Text,
)
from sqlalchemy.orm import relationship

from app.db.base import Base


class ActionStatus(str, enum.Enum):
    PROPOSED = "proposed"
    APPLIED = "applied"
    FAILED = "failed"
    EXPIRED = "expired"


class AssistantAction(Base):
    """One proposed or applied change, with its before and after images."""

    __tablename__ = "assistant_actions"

    id = Column(Integer, primary_key=True, index=True)
    # Opaque and unguessable: this is what authorises the apply, so it is the
    # one field a caller must not be able to construct.
    token = Column(String(64), unique=True, nullable=False, index=True)

    tool = Column(String(64), nullable=False, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    status = Column(SQLEnum(ActionStatus), nullable=False,
                    default=ActionStatus.PROPOSED, index=True)

    # What was touched. entity_id is null on a proposal that would create a row,
    # and filled in once the row exists.
    entity_type = Column(String(40), nullable=False)
    entity_id = Column(Integer, nullable=True, index=True)

    # The sentence shown to the person before they agree. Stored rather than
    # regenerated so the record says what they were actually asked.
    summary = Column(Text, nullable=False)

    before = Column(JSON, nullable=True)
    after = Column(JSON, nullable=True)
    error = Column(Text, nullable=True)

    created_at = Column(DateTime, default=datetime.utcnow, nullable=False, index=True)
    expires_at = Column(DateTime, nullable=False)
    applied_at = Column(DateTime, nullable=True)

    user = relationship("User", foreign_keys=[user_id])


Index("ix_assistant_actions_user_status", AssistantAction.user_id, AssistantAction.status)
