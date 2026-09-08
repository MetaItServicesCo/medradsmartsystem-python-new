"""Record where a part's identity came from

A model number read off a barcode and a model number guessed from smudged
print are not the same claim, and on a medical part the difference matters. So
the definition remembers which reader produced its identity, and the screen can
say so instead of presenting every field as equally certain.

Additive: one nullable column on part_definitions, a table this feature owns.

Revision ID: m8d9e0f1a2b3
Revises: l7c8d9e0f1a2
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "m8d9e0f1a2b3"
down_revision: Union[str, Sequence[str], None] = "l7c8d9e0f1a2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 'udi'   -- decoded from a barcode and confirmed against the UDI database
    # 'label' -- read off the printed plate, worth checking
    # null    -- nobody has identified it; a person typed whatever is there
    op.add_column(
        "part_definitions",
        sa.Column("identified_from", sa.String(length=32), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("part_definitions", "identified_from")
