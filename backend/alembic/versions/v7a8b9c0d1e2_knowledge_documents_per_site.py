"""Knowledge documents can belong to a site

Revision ID: v7a8b9c0d1e2
Revises: u6f7a8b9c0d1
Create Date: 2026-09-16

Uploaded hospital documents - policies, procedures, manuals - may apply to one
site or to all of them. The site is carried on both the document and its
chunks, so retrieval filters with one indexed condition and never joins.
Generated documents have no site: they describe the software, which is the
same everywhere.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "v7a8b9c0d1e2"
down_revision: Union[str, Sequence[str], None] = "u6f7a8b9c0d1"
branch_labels = None
depends_on = None


def upgrade() -> None:
    for table in ("kb_documents", "kb_chunks"):
        op.add_column(table, sa.Column(
            "facility_id", sa.Integer(),
            sa.ForeignKey("facilities.id", ondelete="CASCADE"), nullable=True,
        ))
        op.create_index("ix_{}_facility_id".format(table), table, ["facility_id"])


def downgrade() -> None:
    for table in ("kb_chunks", "kb_documents"):
        op.drop_index("ix_{}_facility_id".format(table), table_name=table)
        op.drop_column(table, "facility_id")
