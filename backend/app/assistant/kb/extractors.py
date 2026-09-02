"""Deterministic knowledge extraction from the MedRad codebase.

Everything here is mechanical: it reads SQLAlchemy metadata, enum definitions
and the FastAPI route table, and emits documents. Nothing is inferred or written
by a model, so a generated article cannot contradict the code it came from.
Regenerating on deploy is what keeps the knowledge base from going stale.
"""
from __future__ import annotations

import importlib
import re
import pkgutil
from typing import Any, Iterable

from app.assistant.kb.documents import KBDocument


# Business module each model file belongs to. The assistant reasons in these
# terms, not in table names, so this mapping is what lets a question about
# "billing" reach the invoice tables.
MODULE_BY_MODEL_FILE: dict[str, str] = {
    "facility": "facilities",
    "facility_document": "facilities",
    "facility_tier": "facilities",
    "equipment": "facilities",
    "equipment_facility": "facilities",
    "modality": "facilities",
    "tier": "facilities",
    "service_request": "service-requests",
    "inspection": "inspections",
    "inspection_form": "inspections",
    "test_equipment": "inspections",
    "invoice": "billing",
    "payment_operation": "billing",
    "rental": "rentals",
    "sales": "sales",
    "inventory": "inventory",
    "hr": "hr",
    "attendance": "hr",
    "user": "users",
    "user_facility": "users",
    "department": "users",
    "audit_log": "audit",
    "notification": "platform",
    "calendar": "platform",
}

# Chat and workspace messaging are deliberately out of scope: private direct
# messages must never be readable by the assistant.
EXCLUDED_MODEL_FILES: frozenset[str] = frozenset({"chat"})

# Columns the assistant must never read or describe as retrievable. Documenting
# them at all would invite the model to request them.
SENSITIVE_COLUMN_PATTERNS: tuple[str, ...] = (
    "password", "hashed_", "_hash", "token", "secret", "api_key",
    "encrypted", "encryption", "cvv", "card_number", "signature",
    "face_encoding", "embedding",
)


def is_sensitive_column(name: str) -> bool:
    lowered = name.lower()
    return any(pattern in lowered for pattern in SENSITIVE_COLUMN_PATTERNS)


def load_all_mappers() -> list[Any]:
    """Import every model module so the SQLAlchemy registry is fully populated."""
    import app.models as models_package
    from app.db.base import Base

    for _, name, _ in pkgutil.iter_modules(models_package.__path__):
        importlib.import_module("app.models." + name)
    return list(Base.registry.mappers)


def model_file(mapper: Any) -> str:
    return mapper.class_.__module__.rsplit(".", 1)[-1]


def module_for(mapper: Any) -> str:
    return MODULE_BY_MODEL_FILE.get(model_file(mapper), "platform")


def in_scope(mapper: Any) -> bool:
    return model_file(mapper) not in EXCLUDED_MODEL_FILES


def humanize(identifier: str) -> str:
    """Readable label. Splits CamelCase so "InvoiceStatus" indexes as two words."""
    spaced = re.sub(r"(?<=[a-z0-9])(?=[A-Z])", " ", identifier or "")
    return spaced.replace("_", " ").strip().title()


def _type_label(column: Any) -> str:
    """Readable column type, with enum values inlined where they exist."""
    enum_values = getattr(column.type, "enums", None)
    if enum_values:
        return "enum(" + ", ".join(enum_values) + ")"
    return type(column.type).__name__.lower()


def _default_label(column: Any) -> str:
    default = column.default
    if default is None:
        return ""
    arg = getattr(default, "arg", None)
    if arg is None:
        return ""
    if callable(arg):
        return "generated"
    return str(arg)


def entity_documents(mappers: Iterable[Any]) -> list[KBDocument]:
    """One document per table: fields, types, keys, defaults and relationships."""
    documents: list[KBDocument] = []
    for mapper in mappers:
        if not in_scope(mapper):
            continue
        model = mapper.class_
        table = model.__table__
        module = module_for(mapper)

        field_rows: list[str] = []
        restricted: list[str] = []
        for column in table.columns:
            if is_sensitive_column(column.name):
                restricted.append(column.name)
                continue
            flags: list[str] = []
            if column.primary_key:
                flags.append("primary key")
            if column.foreign_keys:
                targets = ", ".join(sorted(fk.target_fullname for fk in column.foreign_keys))
                flags.append("references " + targets)
            if column.index:
                flags.append("indexed")
            if column.unique:
                flags.append("unique")
            default = _default_label(column)
            if default:
                flags.append("default " + default)
            requiredness = "optional" if column.nullable else "required"
            field_rows.append(
                "| {} | {} | {} | {} |".format(
                    column.name, _type_label(column), requiredness, "; ".join(flags)
                )
            )

        outgoing = sorted({
            fk.target_fullname.split(".")[0]
            for column in table.columns
            for fk in column.foreign_keys
        })

        body_lines = [
            "## Purpose",
            "`{}` stores {} records for the {} module. Model class `{}`.".format(
                table.name, humanize(table.name).lower(), module, model.__name__
            ),
            "",
            "## Fields",
            "| Field | Type | Required | Notes |",
            "| --- | --- | --- | --- |",
        ]
        body_lines.extend(field_rows)
        if outgoing:
            body_lines.extend([
                "",
                "## Relationships",
                "`{}` links to: {}.".format(
                    table.name, ", ".join("`" + t + "`" for t in outgoing)
                ),
            ])
        if restricted:
            body_lines.extend([
                "",
                "## Restricted fields",
                "These columns hold credentials or protected values and are never "
                "readable by the assistant: "
                + ", ".join("`" + c + "`" for c in sorted(restricted))
                + ".",
            ])

        documents.append(KBDocument(
            doc_id="entity." + table.name,
            kind="entity",
            module=module,
            title="{} ({})".format(humanize(table.name), table.name),
            body="\n".join(body_lines),
            source="app/models/{}.py::{}".format(model_file(mapper), model.__name__),
            metadata={
                "table": table.name,
                "model": model.__name__,
                "column_count": len(table.columns),
                "restricted_columns": sorted(restricted),
                "references": outgoing,
            },
        ))
    return documents


def vocabulary_documents(mappers: Iterable[Any]) -> list[KBDocument]:
    """Enum documents: the controlled vocabulary the assistant may filter on.

    Grounding the model in exact status values is what stops it inventing filter
    terms such as "pending_parts" that silently match nothing.
    """
    seen: dict[str, dict[str, Any]] = {}
    for mapper in mappers:
        if not in_scope(mapper):
            continue
        module = module_for(mapper)
        for column in mapper.class_.__table__.columns:
            enum_values = getattr(column.type, "enums", None)
            if not enum_values:
                continue
            # Prefer the Python enum class name: the PostgreSQL type name is
            # lower-cased and concatenated ("invoicestatus"), so the token
            # "invoice" never matches it in full-text search.
            enum_class = getattr(column.type, "enum_class", None)
            name = (
                getattr(enum_class, "__name__", None)
                or getattr(column.type, "name", None)
                or "{}_{}".format(column.table.name, column.name)
            )
            entry = seen.setdefault(
                name, {"values": list(enum_values), "module": module, "usages": []}
            )
            entry["usages"].append("`{}.{}`".format(column.table.name, column.name))

    documents: list[KBDocument] = []
    for name, entry in sorted(seen.items()):
        value_lines = "\n".join("- `" + value + "`" for value in entry["values"])
        usage_line = ", ".join(sorted(set(entry["usages"])))
        body = (
            "## Allowed values\n"
            "The only valid values for " + humanize(name).lower() + " are:\n\n"
            + value_lines
            + "\n\n## Used by\n"
            + usage_line
            + "\n\nAny other value is invalid and will match no records."
        )
        documents.append(KBDocument(
            doc_id="vocabulary." + name,
            kind="vocabulary",
            module=entry["module"],
            title="Allowed values: " + humanize(name),
            body=body,
            source="SQLAlchemy enum column definitions",
            metadata={"enum": name, "values": entry["values"]},
        ))
    return documents


def relationship_document(mappers: Iterable[Any]) -> KBDocument:
    """A single join map, so the assistant knows how entities connect."""
    edges: list[str] = []
    for mapper in mappers:
        if not in_scope(mapper):
            continue
        table = mapper.class_.__table__
        for column in table.columns:
            for fk in column.foreign_keys:
                edges.append(
                    "| `{}` | `{}` | `{}` |".format(
                        table.name, column.name, fk.target_fullname
                    )
                )
    body = (
        "## How entities connect\n"
        "Every foreign-key relationship in the system. Tools join these internally; "
        "the assistant never needs to resolve a key itself.\n\n"
        "| From table | Via column | To |\n| --- | --- | --- |\n"
        + "\n".join(sorted(edges))
    )
    return KBDocument(
        doc_id="relationship.graph",
        kind="relationship",
        module="platform",
        title="Entity relationship map",
        body=body,
        source="SQLAlchemy foreign-key metadata",
        metadata={"edge_count": len(edges)},
    )
