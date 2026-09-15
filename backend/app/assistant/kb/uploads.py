"""Hospital documents in the assistant's knowledge base.

A policy, a procedure, an equipment manual: uploaded once, then quoted by the
assistant with the document and page it came from. Documents can belong to one
site - Lahore Office's fire evacuation plan - or to every site, and a question
asked inside a site only ever draws on that site's documents and the shared
ones.

Only the extracted text is kept. The chunks are what the assistant searches,
the page headings are what it cites, and a document is replaced by uploading it
again or removed outright.
"""
from __future__ import annotations

import io
import re
import uuid
import zipfile
from datetime import datetime
from typing import Any, Optional
from xml.etree import ElementTree

from fastapi import HTTPException, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.assistant.kb.documents import KBDocument
from app.assistant.kb.ingest import ingest_documents
from app.assistant.kb.store import KBChunkRow, KBDocumentRow
from app.models.facility import Facility
from app.models.user import User

UPLOAD_SOURCE = "upload"
UPLOAD_KIND = "hospital_document"
UPLOAD_MODULE = "documents"
MAX_BYTES = 15 * 1024 * 1024
MAX_CHARACTERS = 1_500_000

_WORD_NS = "{http://schemas.openxmlformats.org/wordprocessingml/2006/main}"


def _bad(message: str) -> HTTPException:
    return HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=message)


def _pdf_sections(data: bytes) -> list[tuple[str, str]]:
    import fitz  # PyMuPDF, already a backend dependency

    try:
        document = fitz.open(stream=data, filetype="pdf")
    except Exception:
        raise _bad("That PDF could not be opened.")
    with document:
        return [("Page {}".format(number), page.get_text("text"))
                for number, page in enumerate(document, start=1)]


def _docx_sections(data: bytes) -> list[tuple[str, str]]:
    """Paragraphs from a Word document, split at its headings."""
    try:
        with zipfile.ZipFile(io.BytesIO(data)) as archive:
            xml = archive.read("word/document.xml")
    except (zipfile.BadZipFile, KeyError):
        raise _bad("That Word document could not be opened.")
    root = ElementTree.fromstring(xml)
    sections: list[tuple[str, str]] = []
    heading, lines = "Introduction", []
    for paragraph in root.iter(_WORD_NS + "p"):
        text = "".join(node.text or "" for node in paragraph.iter(_WORD_NS + "t")).strip()
        if not text:
            continue
        style = paragraph.find("{0}pPr/{0}pStyle".format(_WORD_NS))
        style_name = (style.get(_WORD_NS + "val") if style is not None else "") or ""
        if style_name.lower().startswith(("heading", "title")):
            if lines:
                sections.append((heading, "\n".join(lines)))
            heading, lines = text[:120], []
        else:
            lines.append(text)
    if lines:
        sections.append((heading, "\n".join(lines)))
    return sections


def _text_sections(data: bytes) -> list[tuple[str, str]]:
    try:
        text = data.decode("utf-8")
    except UnicodeDecodeError:
        text = data.decode("latin-1")
    sections: list[tuple[str, str]] = []
    heading, lines = "Document", []
    for line in text.splitlines():
        match = re.match(r"^#{1,3}\s+(.*)", line)
        if match:
            if any(l.strip() for l in lines):
                sections.append((heading, "\n".join(lines)))
            heading, lines = match.group(1).strip()[:120], []
        else:
            lines.append(line)
    if any(l.strip() for l in lines):
        sections.append((heading, "\n".join(lines)))
    return sections


def extract_sections(filename: str, data: bytes) -> list[tuple[str, str]]:
    """(heading, text) pairs from an uploaded file, by page or by heading."""
    if not data:
        raise _bad("The file is empty.")
    if len(data) > MAX_BYTES:
        raise _bad("Documents can be up to 15 MB.")
    name = (filename or "").lower()
    if name.endswith(".pdf"):
        sections = _pdf_sections(data)
    elif name.endswith(".docx"):
        sections = _docx_sections(data)
    elif name.endswith((".txt", ".md", ".markdown")):
        sections = _text_sections(data)
    else:
        raise _bad("Upload a PDF, a Word document (.docx) or a text file.")
    cleaned = [(h, re.sub(r"[ \t]+", " ", t).strip()) for h, t in sections]
    cleaned = [(h, t) for h, t in cleaned if t]
    if not cleaned:
        raise _bad("No readable text was found. A scanned PDF needs text recognition before upload.")
    return cleaned


def ingest_upload(
    db: Session, user: User, *, filename: str, data: bytes, title: Optional[str],
    facility_id: Optional[int],
) -> KBDocumentRow:
    """Store a hospital document and make it searchable."""
    if facility_id is not None and db.get(Facility, facility_id) is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Site not found.")
    sections = extract_sections(filename, data)
    body = "\n\n".join("## {}\n{}".format(heading, text) for heading, text in sections)
    if len(body) > MAX_CHARACTERS:
        raise _bad("That document is too long to index. Split it into parts.")
    clean_title = (title or "").strip() or re.sub(r"\.[a-z]+$", "", filename or "Document", flags=re.I)
    document = KBDocument(
        doc_id="upload.{}".format(uuid.uuid4().hex),
        kind=UPLOAD_KIND,
        module=UPLOAD_MODULE,
        title=clean_title[:200],
        body=body,
        source=UPLOAD_SOURCE,
        metadata={
            "facility_id": facility_id,
            "filename": (filename or "")[:255],
            "sections": len(sections),
            "uploaded_by_id": user.id,
            "uploaded_by": user.full_name,
            "uploaded_at": datetime.utcnow().isoformat() + "Z",
        },
    )
    ingest_documents(db, [document], prune=False)
    return db.query(KBDocumentRow).filter(KBDocumentRow.doc_id == document.doc_id).one()


def describe(db: Session, row: KBDocumentRow) -> dict[str, Any]:
    meta = row.doc_metadata or {}
    facility = db.get(Facility, row.facility_id) if row.facility_id else None
    chunks = db.query(func.count(KBChunkRow.id)).filter(KBChunkRow.doc_id == row.doc_id).scalar() or 0
    return {
        "doc_id": row.doc_id,
        "title": row.title,
        "filename": meta.get("filename"),
        "facility_id": row.facility_id,
        "site": facility.name if facility else "All sites",
        "sections": meta.get("sections"),
        "passages": int(chunks),
        "uploaded_by": meta.get("uploaded_by"),
        "uploaded_at": meta.get("uploaded_at"),
    }


def list_uploads(db: Session, facility_id: Optional[int] = None) -> list[dict[str, Any]]:
    query = db.query(KBDocumentRow).filter(KBDocumentRow.source == UPLOAD_SOURCE)
    if facility_id is not None:
        query = query.filter((KBDocumentRow.facility_id == facility_id) | KBDocumentRow.facility_id.is_(None))
    return [describe(db, row) for row in query.order_by(KBDocumentRow.generated_at.desc()).all()]


def delete_upload(db: Session, doc_id: str) -> None:
    row = db.query(KBDocumentRow).filter(KBDocumentRow.doc_id == doc_id,
                                         KBDocumentRow.source == UPLOAD_SOURCE).first()
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No such document.")
    db.query(KBChunkRow).filter(KBChunkRow.doc_id == doc_id).delete(synchronize_session=False)
    db.delete(row)
    db.commit()
