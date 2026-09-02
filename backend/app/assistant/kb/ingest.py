"""Load generated documents into the knowledge-base tables.

Ingestion is idempotent and hash-gated: a document whose ``source_hash`` is
unchanged is skipped entirely, so a deploy that did not touch the schema or the
routes performs no writes and re-chunks nothing.
"""
from __future__ import annotations

import logging
from typing import Any, Iterable

from sqlalchemy.orm import Session

from app.assistant.kb.documents import KBDocument, chunk_document
from app.assistant.kb.store import KBChunkRow, KBDocumentRow, search_vector_expression


logger = logging.getLogger("medrad.assistant.ingest")


def ingest_documents(
    db: Session,
    documents: Iterable[KBDocument],
    *,
    prune: bool = True,
) -> dict[str, Any]:
    """Upsert documents and their chunks. Returns a summary of what changed."""
    documents = list(documents)
    existing = {row.doc_id: row for row in db.query(KBDocumentRow).all()}

    created = updated = unchanged = 0
    chunks_written = 0
    seen: set[str] = set()

    for document in documents:
        seen.add(document.doc_id)
        current = existing.get(document.doc_id)
        fingerprint = document.source_hash

        if current is not None and current.source_hash == fingerprint:
            unchanged += 1
            continue

        if current is None:
            current = KBDocumentRow(doc_id=document.doc_id)
            db.add(current)
            created += 1
        else:
            updated += 1

        current.kind = document.kind
        current.module = document.module
        current.title = document.title
        current.body = document.body
        current.source = document.source
        current.source_hash = fingerprint
        current.doc_metadata = document.metadata

        # Chunks are derived data: replace wholesale rather than diffing.
        db.query(KBChunkRow).filter(KBChunkRow.doc_id == document.doc_id).delete(
            synchronize_session=False
        )
        for chunk in chunk_document(document):
            db.add(KBChunkRow(
                chunk_id=chunk.chunk_id,
                doc_id=chunk.doc_id,
                kind=chunk.kind,
                module=chunk.module,
                title=chunk.title,
                heading=chunk.heading,
                text=chunk.text,
                ordinal=chunk.ordinal,
                search_vector=search_vector_expression(chunk.title, chunk.heading, chunk.text),
            ))
            chunks_written += 1

    removed = 0
    if prune:
        stale = [doc_id for doc_id in existing if doc_id not in seen]
        if stale:
            db.query(KBChunkRow).filter(KBChunkRow.doc_id.in_(stale)).delete(
                synchronize_session=False
            )
            db.query(KBDocumentRow).filter(KBDocumentRow.doc_id.in_(stale)).delete(
                synchronize_session=False
            )
            removed = len(stale)

    db.commit()
    summary = {
        "created": created,
        "updated": updated,
        "unchanged": unchanged,
        "removed": removed,
        "chunks_written": chunks_written,
        "total_documents": len(documents),
    }
    logger.info("knowledge base ingest %s", summary)
    return summary
