"""Knowledge documents can belong to a site

Revision ID: v7a8b9c0d1e2
Revises: u6f7a8b9c0d1
Create Date: 2026-09-16

Uploaded hospital documents - policies, procedures, manuals - may apply to one
site or to all of them. The site is carried on both the document and its
chunks, so retrieval filters with one indexed condition and never joins.
Generated documents have no site: they describe the software, which is the
same everywhere.

Databases built with create_all() and then stamped - how this deployment was
first set up - never got the knowledge-base tables at all: they are defined
outside app.models, which is all that step imported, and the migration that
creates them (h3e4f5a6b7c8) was stamped past rather than run. So this creates
them when they are missing, complete with the site column, and otherwise only
adds the column. Either way the end state is the same.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = "v7a8b9c0d1e2"
down_revision: Union[str, Sequence[str], None] = "u6f7a8b9c0d1"
branch_labels = None
depends_on = None


def _facility_column() -> sa.Column:
    return sa.Column("facility_id", sa.Integer(),
                     sa.ForeignKey("facilities.id", ondelete="CASCADE"), nullable=True)


def _create_documents() -> None:
    op.create_table(
        "kb_documents",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("doc_id", sa.String(), nullable=False),
        sa.Column("kind", sa.String(), nullable=False),
        sa.Column("module", sa.String(), nullable=False),
        sa.Column("title", sa.String(), nullable=False),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column("source", sa.String(), nullable=False),
        sa.Column("source_hash", sa.String(), nullable=False),
        sa.Column("doc_metadata", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        _facility_column(),
        sa.Column("generated_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("doc_id"),
    )
    op.create_index("ix_kb_documents_id", "kb_documents", ["id"])
    op.create_index("ix_kb_documents_doc_id", "kb_documents", ["doc_id"])
    op.create_index("ix_kb_documents_kind", "kb_documents", ["kind"])
    op.create_index("ix_kb_documents_module", "kb_documents", ["module"])
    op.create_index("ix_kb_documents_source_hash", "kb_documents", ["source_hash"])
    op.create_index("ix_kb_documents_module_kind", "kb_documents", ["module", "kind"])


def _create_chunks() -> None:
    op.create_table(
        "kb_chunks",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("chunk_id", sa.String(), nullable=False),
        sa.Column("doc_id", sa.String(), nullable=False),
        sa.Column("kind", sa.String(), nullable=False),
        sa.Column("module", sa.String(), nullable=False),
        sa.Column("title", sa.String(), nullable=False),
        sa.Column("heading", sa.String(), nullable=False),
        sa.Column("text", sa.Text(), nullable=False),
        sa.Column("ordinal", sa.Integer(), nullable=False),
        _facility_column(),
        sa.Column("search_vector", postgresql.TSVECTOR(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("chunk_id", name="uq_kb_chunks_chunk_id"),
    )
    op.create_index("ix_kb_chunks_id", "kb_chunks", ["id"])
    op.create_index("ix_kb_chunks_chunk_id", "kb_chunks", ["chunk_id"])
    op.create_index("ix_kb_chunks_doc_id", "kb_chunks", ["doc_id"])
    op.create_index("ix_kb_chunks_module_kind", "kb_chunks", ["module", "kind"])
    op.create_index("ix_kb_chunks_search", "kb_chunks", ["search_vector"], postgresql_using="gin")


def upgrade() -> None:
    inspector = sa.inspect(op.get_bind())
    tables = set(inspector.get_table_names())

    if "kb_documents" not in tables:
        _create_documents()
    elif "facility_id" not in {c["name"] for c in inspector.get_columns("kb_documents")}:
        op.add_column("kb_documents", _facility_column())
    if "kb_chunks" not in tables:
        _create_chunks()
    elif "facility_id" not in {c["name"] for c in inspector.get_columns("kb_chunks")}:
        op.add_column("kb_chunks", _facility_column())

    for table in ("kb_documents", "kb_chunks"):
        existing = {index["name"] for index in sa.inspect(op.get_bind()).get_indexes(table)}
        name = "ix_{}_facility_id".format(table)
        if name not in existing:
            op.create_index(name, table, ["facility_id"])


def downgrade() -> None:
    for table in ("kb_chunks", "kb_documents"):
        op.drop_index("ix_{}_facility_id".format(table), table_name=table)
        op.drop_column(table, "facility_id")
