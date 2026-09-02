"""Assemble the complete generated knowledge base.

Generation is a build-time step, never a request-time one. The assistant only
ever reads the indexed output, so nothing here contributes to query latency.
"""
from __future__ import annotations

from typing import Any

from app.assistant.kb.api_extractors import operation_documents, permission_documents
from app.assistant.kb.documents import KBChunk, KBDocument, chunk_document
from app.assistant.kb.extractors import (
    entity_documents,
    humanize,
    load_all_mappers,
    module_for,
    in_scope,
    relationship_document,
    vocabulary_documents,
)


def _module_overview_documents(mappers: list[Any], operations: list[KBDocument]) -> list[KBDocument]:
    """A short orienting article per module, tying its tables to its operations.

    Retrieval benefits from one broad document per module: a vague question
    ("how does billing work") lands here rather than on an arbitrary table.
    """
    tables_by_module: dict[str, list[str]] = {}
    for mapper in mappers:
        if not in_scope(mapper):
            continue
        tables_by_module.setdefault(module_for(mapper), []).append(mapper.class_.__table__.name)

    operations_by_module = {doc.module: doc.metadata.get("operation_count", 0) for doc in operations}

    documents: list[KBDocument] = []
    for module, tables in sorted(tables_by_module.items()):
        operation_count = operations_by_module.get(module, 0)
        body = (
            "## Overview\n"
            "The " + humanize(module) + " module is backed by "
            + str(len(tables)) + " tables and exposes "
            + str(operation_count) + " API operations.\n\n"
            "## Tables in this module\n"
            + "\n".join("- `" + name + "`" for name in sorted(tables))
            + "\n\n## Where to look\n"
            "Field-level detail lives in the entity document for each table. "
            "Valid status values live in the allowed-values documents. "
            "Available actions live in the operations document for this module."
        )
        documents.append(KBDocument(
            doc_id="module." + module,
            kind="module",
            module=module,
            title=humanize(module) + " module overview",
            body=body,
            source="generated from model registry and OpenAPI schema",
            metadata={"table_count": len(tables), "operation_count": operation_count},
        ))
    return documents


def generate_all(openapi_spec: dict[str, Any] | None = None) -> list[KBDocument]:
    """Produce every generated document, covering all in-scope tables."""
    mappers = load_all_mappers()

    documents: list[KBDocument] = []
    documents.extend(entity_documents(mappers))
    documents.extend(vocabulary_documents(mappers))
    documents.append(relationship_document(mappers))
    documents.extend(permission_documents())

    operations: list[KBDocument] = []
    if openapi_spec is not None:
        operations = operation_documents(openapi_spec)
        documents.extend(operations)

    documents.extend(_module_overview_documents(mappers, operations))
    return documents


def chunk_all(documents: list[KBDocument]) -> list[KBChunk]:
    chunks: list[KBChunk] = []
    for document in documents:
        chunks.extend(chunk_document(document))
    return chunks


def coverage_report(documents: list[KBDocument]) -> dict[str, Any]:
    """Verify every in-scope table produced an entity document."""
    mappers = load_all_mappers()
    expected = {m.class_.__table__.name for m in mappers if in_scope(m)}
    covered = {d.metadata["table"] for d in documents if d.kind == "entity"}
    by_kind: dict[str, int] = {}
    for document in documents:
        by_kind[document.kind] = by_kind.get(document.kind, 0) + 1
    return {
        "tables_expected": len(expected),
        "tables_covered": len(covered),
        "missing_tables": sorted(expected - covered),
        "documents_by_kind": by_kind,
        "total_documents": len(documents),
    }
