"""Hybrid knowledge retrieval.

Two independent legs are fused with Reciprocal Rank Fusion:

* lexical  - PostgreSQL full-text search over a GIN-indexed tsvector, which
             reliably finds exact tokens such as ``INV-SERVICE-004560``,
             ``billing_approval_status`` or a role name.
* semantic - optional pgvector cosine search, which catches paraphrases the
             lexical leg misses.

The semantic leg is skipped automatically when pgvector is not installed, so
retrieval degrades to lexical-only rather than failing. Both legs are single
indexed queries; neither embeds anything at request time.
"""
from __future__ import annotations

import logging
import re
from dataclasses import dataclass
from typing import Any, Optional, Sequence

from sqlalchemy import func, select, text
from sqlalchemy.orm import Session

from app.assistant.kb.store import KBChunkRow


logger = logging.getLogger("medrad.assistant.retrieval")

# Reciprocal Rank Fusion damping. 60 is the value from the original RRF paper
# and behaves well when one leg is much stronger than the other.
RRF_K = 60

# Retrieved text is authored elsewhere and must never be treated as
# instructions. Callers wrap it as data; this is the maximum any one chunk may
# contribute so a single document cannot dominate the context window.
MAX_CHUNK_CHARS = 2000


@dataclass
class RetrievedChunk:
    """One retrieval hit, carrying everything needed to cite it."""

    chunk_id: str
    doc_id: str
    title: str
    heading: str
    module: str
    kind: str
    text: str
    score: float
    legs: tuple[str, ...]

    def citation(self) -> str:
        if self.heading:
            return "{} - {}".format(self.title, self.heading)
        return self.title

    def as_evidence(self) -> dict[str, Any]:
        return {
            "citation": self.citation(),
            "doc_id": self.doc_id,
            "module": self.module,
            "kind": self.kind,
            "text": self.text[:MAX_CHUNK_CHARS],
        }


def _normalize_query(query: str) -> str:
    """Strip punctuation that breaks websearch_to_tsquery, keep identifiers."""
    cleaned = re.sub(r"[^\w\s\-_.]", " ", query or "")
    return re.sub(r"\s+", " ", cleaned).strip()


def pgvector_available(db: Session) -> bool:
    """True when the pgvector extension and the embedding column both exist."""
    try:
        has_extension = db.execute(
            text("SELECT 1 FROM pg_extension WHERE extname = 'vector'")
        ).first()
        if not has_extension:
            return False
        has_column = db.execute(text(
            "SELECT 1 FROM information_schema.columns "
            "WHERE table_name = 'kb_chunks' AND column_name = 'embedding'"
        )).first()
        return bool(has_column)
    except Exception:
        logger.debug("pgvector availability probe failed; using lexical retrieval only")
        return False


def _lexical_leg(
    db: Session,
    query: str,
    *,
    module: Optional[str],
    limit: int,
) -> list[tuple[KBChunkRow, float]]:
    normalized = _normalize_query(query)
    if not normalized:
        return []
    tsquery = func.websearch_to_tsquery("english", normalized)
    rank = func.ts_rank_cd(KBChunkRow.search_vector, tsquery)
    statement = (
        select(KBChunkRow, rank.label("rank"))
        .where(KBChunkRow.search_vector.op("@@")(tsquery))
        .order_by(rank.desc())
        .limit(limit)
    )
    if module:
        statement = statement.where(KBChunkRow.module == module)
    return [(row[0], float(row[1] or 0.0)) for row in db.execute(statement).all()]


def _semantic_leg(
    db: Session,
    embedding: Sequence[float],
    *,
    module: Optional[str],
    limit: int,
) -> list[tuple[KBChunkRow, float]]:
    """Cosine search over pgvector. Only called when the column exists."""
    vector_literal = "[" + ",".join(str(float(v)) for v in embedding) + "]"
    module_clause = "AND module = :module" if module else ""
    sql = text(
        "SELECT id, 1 - (embedding <=> CAST(:vec AS vector)) AS score "
        "FROM kb_chunks WHERE embedding IS NOT NULL {} "
        "ORDER BY embedding <=> CAST(:vec AS vector) LIMIT :limit".format(module_clause)
    )
    params: dict[str, Any] = {"vec": vector_literal, "limit": limit}
    if module:
        params["module"] = module
    rows = db.execute(sql, params).all()
    if not rows:
        return []
    by_id = {
        chunk.id: chunk
        for chunk in db.query(KBChunkRow).filter(KBChunkRow.id.in_([r[0] for r in rows])).all()
    }
    return [(by_id[r[0]], float(r[1])) for r in rows if r[0] in by_id]


def _fuse(
    legs: dict[str, list[tuple[KBChunkRow, float]]],
    limit: int,
) -> list[RetrievedChunk]:
    """Reciprocal Rank Fusion across legs, preserving which legs contributed."""
    scores: dict[str, float] = {}
    sources: dict[str, set[str]] = {}
    rows: dict[str, KBChunkRow] = {}

    for leg_name, results in legs.items():
        for rank, (chunk, _raw) in enumerate(results, start=1):
            key = chunk.chunk_id
            scores[key] = scores.get(key, 0.0) + 1.0 / (RRF_K + rank)
            sources.setdefault(key, set()).add(leg_name)
            rows[key] = chunk

    ordered = sorted(scores.items(), key=lambda item: item[1], reverse=True)[:limit]
    fused: list[RetrievedChunk] = []
    for key, score in ordered:
        chunk = rows[key]
        fused.append(RetrievedChunk(
            chunk_id=chunk.chunk_id,
            doc_id=chunk.doc_id,
            title=chunk.title,
            heading=chunk.heading or "",
            module=chunk.module,
            kind=chunk.kind,
            text=chunk.text,
            score=round(score, 6),
            legs=tuple(sorted(sources[key])),
        ))
    return fused


def search_knowledge(
    db: Session,
    query: str,
    *,
    module: Optional[str] = None,
    limit: int = 6,
    embedding: Optional[Sequence[float]] = None,
) -> list[RetrievedChunk]:
    """Retrieve supporting passages for a knowledge question.

    Returns an empty list when nothing matches. Callers must treat that as
    "no evidence" and say so, rather than answering from the model's own
    knowledge -- an invented policy is worse than an admission of ignorance.
    """
    # Over-fetch per leg so fusion has room to reorder, then trim to `limit`.
    per_leg = max(limit * 3, 12)
    legs: dict[str, list[tuple[KBChunkRow, float]]] = {
        "lexical": _lexical_leg(db, query, module=module, limit=per_leg),
    }

    if embedding is not None and pgvector_available(db):
        try:
            legs["semantic"] = _semantic_leg(db, embedding, module=module, limit=per_leg)
        except Exception:
            logger.exception("Semantic retrieval failed; continuing with lexical results")

    return _fuse(legs, limit)
