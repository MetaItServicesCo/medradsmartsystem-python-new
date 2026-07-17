"""Allow rental initial reading to store free text.

Revision ID: a9b1c2d3e4f5
Revises: f7a8b9c0d1e2
Create Date: 2026-07-17
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "a9b1c2d3e4f5"
down_revision: Union[str, Sequence[str], None] = "f7a8b9c0d1e2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.alter_column(
        "rentals",
        "initial_meter_reading",
        existing_type=sa.Integer(),
        type_=sa.Text(),
        existing_nullable=True,
        postgresql_using="initial_meter_reading::text",
    )


def downgrade() -> None:
    op.alter_column(
        "rentals",
        "initial_meter_reading",
        existing_type=sa.Text(),
        type_=sa.Integer(),
        existing_nullable=True,
        postgresql_using=(
            "CASE WHEN initial_meter_reading ~ '^\\d+$' "
            "THEN initial_meter_reading::integer ELSE NULL END"
        ),
    )
