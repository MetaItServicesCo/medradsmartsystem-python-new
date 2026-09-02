"""Knowledge-base storage.

Two tables: documents (the generated article) and chunks (the retrievable
units). Full-text search is served by a GIN index on a stored tsvector, so
retrieval is a single indexed query and adds no measurable latency.

Semantic search is an optional second leg. The ``embedding`` column is created
only by the pgvector migration; retrieval falls back to lexical search alone
when the extension is unavailable, which keeps the assistant working on the
stock ``postgres:15-alpine`` image.
"""
from __future__ import annotations

from datetime import datetime

from sqlalchemy import (
    Column,
    DateTime,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB, TSVECTOR

from app.db.base import Base


class KBDocumentRow(Base):
    """A generated knowledge-base article."""

    __tablename__ = "kb_documents"
    __table_args__ = (
        Index("ix_kb_documents_module_kind", "module", "kind"),
    )

    id = Column(Integer, primary_key=True, index=True)
    doc_id = Column(String, nullable=False, unique=True, index=True)
    kind = Column(String, nullable=False, index=True)
    module = Column(String, nullable=False, index=True)
    title = Column(String, nullable=False)
    body = Column(Text, nullable=False)
    source = Column(String, nullable=False)
    # Content fingerprint. Regeneration only rewrites documents whose hash
    # changed, so an unchanged deploy does no write work and invalidates nothing.
    source_hash = Column(String, nullable=False, index=True)
    doc_metadata = Column(JSONB, nullable=False, default=dict)
    generated_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at = Column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)


class KBChunkRow(Base):
    """A retrievable slice of a document."""

    __tablename__ = "kb_chunks"
    __table_args__ = (
        UniqueConstraint("chunk_id", name="uq_kb_chunks_chunk_id"),
        Index("ix_kb_chunks_module_kind", "module", "kind"),
        # GIN index over the stored tsvector is what makes lexical retrieval
        # constant-time regardless of corpus growth.
        Index("ix_kb_chunks_search", "search_vector", postgresql_using="gin"),
    )

    id = Column(Integer, primary_key=True, index=True)
    chunk_id = Column(String, nullable=False, index=True)
    doc_id = Column(String, nullable=False, index=True)
    kind = Column(String, nullable=False)
    module = Column(String, nullable=False)
    title = Column(String, nullable=False)
    heading = Column(String, nullable=False, default="")
    text = Column(Text, nullable=False)
    ordinal = Column(Integer, nullable=False, default=0)
    search_vector = Column(TSVECTOR, nullable=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)


def search_vector_expression(title: str, heading: str, text: str):
    """Weighted tsvector: title matches outrank heading, which outranks body."""
    return (
        func.setweight(func.to_tsvector("english", func.coalesce(title, "")), "A")
        .op("||")(func.setweight(func.to_tsvector("english", func.coalesce(heading, "")), "B"))
        .op("||")(func.setweight(func.to_tsvector("english", func.coalesce(text, "")), "C"))
    )
