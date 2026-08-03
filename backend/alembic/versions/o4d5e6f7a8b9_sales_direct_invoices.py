"""add direct sales invoice document kind

Revision ID: o4d5e6f7a8b9
Revises: n3c4d5e6f7a8
Create Date: 2026-08-04
"""

from alembic import op
import sqlalchemy as sa


revision = "o4d5e6f7a8b9"
down_revision = "n3c4d5e6f7a8"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "sales_quotations",
        sa.Column(
            "document_kind",
            sa.String(),
            nullable=False,
            server_default="quotation",
        ),
    )
    op.create_index(
        "ix_sales_quotations_document_kind",
        "sales_quotations",
        ["document_kind"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(
        "ix_sales_quotations_document_kind",
        table_name="sales_quotations",
    )
    op.drop_column("sales_quotations", "document_kind")
