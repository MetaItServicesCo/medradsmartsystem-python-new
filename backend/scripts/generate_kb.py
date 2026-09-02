"""Generate the MedRad assistant knowledge base from the codebase.

Run at build/deploy time, never in a request path.

    python -m scripts.generate_kb --report              # coverage only, no DB
    python -m scripts.generate_kb --out docs/generated  # write markdown to disk
    python -m scripts.generate_kb --write               # ingest into Postgres
    python -m scripts.generate_kb --write --create-tables

``--create-tables`` is a convenience for local use; production should create
``kb_documents`` and ``kb_chunks`` through an Alembic migration.
"""
from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path

# Allow running as a plain script from the backend directory.
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))


def _openapi_spec():
    """Import the app lazily so --report works without app-wide settings."""
    from app.main import app

    return app.openapi()


def main() -> int:
    parser = argparse.ArgumentParser(description="Generate the assistant knowledge base")
    parser.add_argument("--report", action="store_true", help="print coverage and exit")
    parser.add_argument("--out", metavar="DIR", help="write generated markdown to DIR")
    parser.add_argument("--write", action="store_true", help="ingest into PostgreSQL")
    parser.add_argument("--create-tables", action="store_true", help="create KB tables first")
    parser.add_argument("--no-operations", action="store_true", help="skip OpenAPI extraction")
    arguments = parser.parse_args()

    from app.assistant.kb.generator import chunk_all, coverage_report, generate_all

    spec = None if arguments.no_operations else _openapi_spec()
    documents = generate_all(spec)
    chunks = chunk_all(documents)
    report = coverage_report(documents)

    print("Knowledge base generated")
    print("  tables covered   : {}/{}".format(
        report["tables_covered"], report["tables_expected"]
    ))
    if report["missing_tables"]:
        print("  MISSING TABLES   : {}".format(", ".join(report["missing_tables"])))
    print("  documents        : {}".format(report["total_documents"]))
    print("  by kind          : {}".format(json.dumps(report["documents_by_kind"], sort_keys=True)))
    print("  chunks           : {}".format(len(chunks)))

    if arguments.out:
        destination = Path(arguments.out)
        destination.mkdir(parents=True, exist_ok=True)
        for document in documents:
            path = destination / (document.doc_id + ".md")
            path.write_text(
                "# {}\n\n_Source: {} - generated, do not edit_\n\n{}\n".format(
                    document.title, document.source, document.body
                ),
                encoding="utf-8",
            )
        print("  written to       : {}".format(destination))

    if arguments.write:
        from app.db.base import SessionLocal, engine
        from app.assistant.kb.store import KBChunkRow, KBDocumentRow

        if arguments.create_tables:
            KBDocumentRow.__table__.create(bind=engine, checkfirst=True)
            KBChunkRow.__table__.create(bind=engine, checkfirst=True)
            print("  tables           : ensured")

        from app.assistant.kb.ingest import ingest_documents

        session = SessionLocal()
        try:
            summary = ingest_documents(session, documents)
            print("  ingested         : {}".format(json.dumps(summary, sort_keys=True)))
        finally:
            session.close()

    if report["missing_tables"]:
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
