"""Assistant knowledge base tables

Stores the knowledge base generated from the codebase, plus the retrievable
chunks. Chunks carry a weighted tsvector with a GIN index so lexical retrieval
is a single indexed query.

The optional pgvector column is deliberately NOT created here: it requires the
extension, which the stock postgres:15-alpine image does not ship. Retrieval
detects its absence and runs lexical-only, so the assistant works either way.

Revision ID: h3e4f5a6b7c8
Revises: g2d3e4f5a6b7
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = "h3e4f5a6b7c8"
down_revision: Union[str, Sequence[str], None] = "g2d3e4f5a6b7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
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
        sa.Column("search_vector", postgresql.TSVECTOR(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("chunk_id", name="uq_kb_chunks_chunk_id"),
    )
    op.create_index("ix_kb_chunks_id", "kb_chunks", ["id"])
    op.create_index("ix_kb_chunks_chunk_id", "kb_chunks", ["chunk_id"])
    op.create_index("ix_kb_chunks_doc_id", "kb_chunks", ["doc_id"])
    op.create_index("ix_kb_chunks_module_kind", "kb_chunks", ["module", "kind"])
    op.create_index(
        "ix_kb_chunks_search", "kb_chunks", ["search_vector"], postgresql_using="gin"
    )


def downgrade() -> None:
    op.drop_index("ix_kb_chunks_search", table_name="kb_chunks")
    op.drop_index("ix_kb_chunks_module_kind", table_name="kb_chunks")
    op.drop_index("ix_kb_chunks_doc_id", table_name="kb_chunks")
    op.drop_index("ix_kb_chunks_chunk_id", table_name="kb_chunks")
    op.drop_index("ix_kb_chunks_id", table_name="kb_chunks")
    op.drop_table("kb_chunks")

    op.drop_index("ix_kb_documents_module_kind", table_name="kb_documents")
    op.drop_index("ix_kb_documents_source_hash", table_name="kb_documents")
    op.drop_index("ix_kb_documents_module", table_name="kb_documents")
    op.drop_index("ix_kb_documents_kind", table_name="kb_documents")
    op.drop_index("ix_kb_documents_doc_id", table_name="kb_documents")
    op.drop_index("ix_kb_documents_id", table_name="kb_documents")
    op.drop_table("kb_documents")
