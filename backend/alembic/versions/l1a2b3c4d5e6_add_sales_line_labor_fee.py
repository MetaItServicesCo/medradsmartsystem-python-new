"""add sales quotation line labor fee

Revision ID: l1a2b3c4d5e6
Revises: k0f1a2b3c4d5
Create Date: 2026-07-31
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "l1a2b3c4d5e6"
down_revision: Union[str, Sequence[str], None] = "k0f1a2b3c4d5"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "sales_quotation_line_items",
        sa.Column(
            "labor_fee",
            sa.Numeric(10, 2),
            nullable=False,
            server_default="0",
        ),
    )


def downgrade() -> None:
    op.drop_column("sales_quotation_line_items", "labor_fee")
