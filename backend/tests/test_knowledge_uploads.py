"""Prove hospital documents are read into sections the assistant can cite.

Extraction only: storing and searching them needs PostgreSQL's full-text
search, and is checked against a real database separately.

    python backend/tests/test_knowledge_uploads.py
"""
from __future__ import annotations

import io
import os
import pathlib
import sys
import zipfile

os.environ.setdefault("DATABASE_URL", "sqlite://")
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))

from fastapi import HTTPException  # noqa: E402

from app.assistant.kb import uploads  # noqa: E402


def refused(call, fragment):
    try:
        call()
    except HTTPException as exc:
        assert fragment in exc.detail, (fragment, exc.detail)
        return
    raise AssertionError("expected a refusal mentioning " + fragment)


def test_a_pdf_is_read_page_by_page():
    import fitz

    document = fitz.open()
    for text in ("Code Red: close fire doors on the affected floor.",
                 "Move patients horizontally before vertically."):
        page = document.new_page()
        page.insert_text((72, 72), text)
    data = document.tobytes()
    sections = uploads.extract_sections("Fire Evacuation Plan.pdf", data)
    assert [h for h, _ in sections] == ["Page 1", "Page 2"], sections
    assert "close fire doors" in sections[0][1] and "horizontally" in sections[1][1]
    print("ok  a PDF becomes one citable section per page")


def test_a_word_document_is_split_at_its_headings():
    ns = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"

    def paragraph(text, style=None):
        props = f'<w:pPr><w:pStyle w:val="{style}"/></w:pPr>' if style else ""
        return f"<w:p>{props}<w:r><w:t>{text}</w:t></w:r></w:p>"

    body = "".join([
        paragraph("Generator testing"),
        paragraph("Monthly load test", "Heading1"),
        paragraph("Run for 30 minutes at 30 percent load."),
        paragraph("Annual test", "Heading1"),
        paragraph("Run for 4 hours."),
    ])
    xml = f'<?xml version="1.0"?><w:document xmlns:w="{ns}"><w:body>{body}</w:body></w:document>'
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w") as archive:
        archive.writestr("word/document.xml", xml)
    sections = uploads.extract_sections("NFPA 110 procedure.docx", buffer.getvalue())
    assert [h for h, _ in sections] == ["Introduction", "Monthly load test", "Annual test"], sections
    assert "30 minutes" in sections[1][1] and "4 hours" in sections[2][1]
    print("ok  a Word document is split at its headings")


def test_text_and_markdown_keep_their_headings():
    text = "Intro line\n# Hand hygiene\nWash for 20 seconds.\n## Gloves\nChange between patients.\n"
    sections = uploads.extract_sections("infection-control.md", text.encode("utf-8"))
    assert [h for h, _ in sections] == ["Document", "Hand hygiene", "Gloves"], sections
    latin = uploads.extract_sections("notes.txt", "Café maintenance".encode("latin-1"))
    assert "Caf" in latin[0][1]
    print("ok  text and markdown files keep their headings")


def test_what_cannot_be_read_is_refused_with_a_reason():
    import fitz

    refused(lambda: uploads.extract_sections("plan.xlsx", b"data"), "PDF, a Word document")
    refused(lambda: uploads.extract_sections("plan.pdf", b""), "empty")
    refused(lambda: uploads.extract_sections("plan.pdf", b"x" * (uploads.MAX_BYTES + 1)), "15 MB")
    refused(lambda: uploads.extract_sections("plan.pdf", b"not a pdf"), "could not be opened")
    blank = fitz.open()
    blank.new_page()
    refused(lambda: uploads.extract_sections("scan.pdf", blank.tobytes()), "scanned PDF")
    print("ok  unreadable, empty, oversized and scanned files are refused with a reason")


if __name__ == "__main__":
    tests = [v for k, v in sorted(globals().items()) if k.startswith("test_")]
    for t in tests:
        t()
    print(f"\n{len(tests)} checks passed")
