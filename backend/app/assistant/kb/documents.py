"""Knowledge-base document model.

Documents are generated from the codebase at build time, never at query time,
so retrieval latency is unaffected by generation cost. Each document carries a
``source_hash`` of the code it was derived from, which lets CI detect drift and
regenerate only what actually changed.
"""
from __future__ import annotations

import hashlib
import re
from dataclasses import dataclass, field
from typing import Any


# Chunk sizing is tuned for retrieval quality rather than model context: small
# enough that a hit is precise, large enough that a field table is not split
# across chunks and rendered meaningless.
CHUNK_TARGET_CHARS = 1400
CHUNK_OVERLAP_CHARS = 160

# Bump whenever chunking logic changes. It participates in ``source_hash`` so a
# chunker change re-chunks every document even though no document body moved.
CHUNKER_VERSION = "2"


@dataclass
class KBDocument:
    """One generated knowledge-base article."""

    doc_id: str
    kind: str          # entity | vocabulary | operation | permission | relationship | module | rule
    module: str
    title: str
    body: str
    source: str
    metadata: dict[str, Any] = field(default_factory=dict)

    @property
    def source_hash(self) -> str:
        """Content fingerprint used to detect drift between deploys.

        Includes the chunker version so a change to chunking invalidates stored
        chunks even when every document body is byte-identical.
        """
        payload = "{}|{}".format(CHUNKER_VERSION, self.body)
        return hashlib.sha256(payload.encode("utf-8")).hexdigest()[:16]

    def to_record(self) -> dict[str, Any]:
        return {
            "doc_id": self.doc_id,
            "kind": self.kind,
            "module": self.module,
            "title": self.title,
            "body": self.body,
            "source": self.source,
            "source_hash": self.source_hash,
            "metadata": self.metadata,
        }


@dataclass
class KBChunk:
    """A retrievable slice of a document, carrying enough context to cite."""

    chunk_id: str
    doc_id: str
    kind: str
    module: str
    title: str
    heading: str
    text: str
    ordinal: int

    def to_record(self) -> dict[str, Any]:
        return {
            "chunk_id": self.chunk_id,
            "doc_id": self.doc_id,
            "kind": self.kind,
            "module": self.module,
            "title": self.title,
            "heading": self.heading,
            "text": self.text,
            "ordinal": self.ordinal,
        }


def _split_sections(body: str) -> list[tuple[str, str]]:
    """Split markdown on '## ' headings, keeping each heading with its content."""
    lines = body.splitlines()
    sections: list[tuple[str, list[str]]] = []
    heading = ""
    buffer: list[str] = []
    for line in lines:
        if line.startswith("## "):
            if buffer:
                sections.append((heading, buffer))
            heading = line[3:].strip()
            buffer = []
        else:
            buffer.append(line)
    if buffer:
        sections.append((heading, buffer))
    return [(h, "\n".join(b).strip()) for h, b in sections if "\n".join(b).strip()]


def chunk_document(document: KBDocument) -> list[KBChunk]:
    """Chunk on section boundaries, packing small sections together.

    One chunk per heading produced many one-line chunks ("Relationships:
    invoices links to facilities"), which then dominated length-normalized
    ranking despite carrying almost no information. Packing adjacent sections up
    to the target size keeps every chunk a substantive unit.
    """
    sections = _split_sections(document.body)
    chunks: list[KBChunk] = []
    ordinal = 0

    pending_headings: list[str] = []
    pending_text: list[str] = []
    pending_length = 0

    def flush() -> None:
        nonlocal ordinal, pending_headings, pending_text, pending_length
        if not pending_text:
            return
        chunks.append(KBChunk(
            chunk_id=f"{document.doc_id}#{ordinal}",
            doc_id=document.doc_id,
            kind=document.kind,
            module=document.module,
            title=document.title,
            heading=" / ".join(pending_headings),
            text="\n\n".join(pending_text),
            ordinal=ordinal,
        ))
        ordinal += 1
        pending_headings = []
        pending_text = []
        pending_length = 0

    for heading, text in sections:
        pieces = _split_long_text(text)
        for index, piece in enumerate(pieces):
            # A section large enough to have been split stands on its own.
            if len(pieces) > 1:
                flush()
                chunks.append(KBChunk(
                    chunk_id=f"{document.doc_id}#{ordinal}",
                    doc_id=document.doc_id,
                    kind=document.kind,
                    module=document.module,
                    title=document.title,
                    heading=heading if index == 0 else f"{heading} (cont.)",
                    text=piece,
                    ordinal=ordinal,
                ))
                ordinal += 1
                continue

            if pending_length and pending_length + len(piece) > CHUNK_TARGET_CHARS:
                flush()
            body = f"{heading}\n{piece}" if heading else piece
            pending_headings.append(heading)
            pending_text.append(body)
            pending_length += len(body)

    flush()
    return chunks


def _split_long_text(text: str) -> list[str]:
    if len(text) <= CHUNK_TARGET_CHARS:
        return [text]
    # Prefer paragraph boundaries so table rows and list items stay together.
    paragraphs = re.split(r"\n\s*\n", text)
    pieces: list[str] = []
    current = ""
    for paragraph in paragraphs:
        candidate = f"{current}\n\n{paragraph}".strip() if current else paragraph
        if len(candidate) > CHUNK_TARGET_CHARS and current:
            pieces.append(current)
            tail = current[-CHUNK_OVERLAP_CHARS:] if len(current) > CHUNK_OVERLAP_CHARS else current
            current = f"{tail}\n\n{paragraph}".strip()
        else:
            current = candidate
    if current:
        pieces.append(current)
    return pieces
